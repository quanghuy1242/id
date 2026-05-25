# Identity Event Producer In `id`

> Status: implementation-grade plan
>
> Date: 2026-05-25
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — producer side only (consumer-side scope lives in docs 015 and 016)
>
> Source docs:
>
> - [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) — decisions D1-D8 are referenced by ID throughout this doc
> - [000_repo-architecture.md](000_repo-architecture.md) — layer architecture and plugin conventions
> - [001_first-batch-plan.md](001_first-batch-plan.md) — first-batch boundaries (this doc is post-first-batch work)
> - [003_future-implementation.md](003_future-implementation.md) — future plugin registry; this is `idIdentityEvents`
>
> Standards references:
>
> - RFC 8417 — Security Event Token (SET)
> - OpenID Shared Signals Framework 1.0 Final — stream configuration and delivery semantics, <https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html>
> - OpenID RISC Profile 1.0 Final — Phase 1 event vocabulary, <https://openid.net/specs/openid-risc-1_0-final.html>
> - OpenID CAEP Specification 1.0 Final — Phase 2 event vocabulary, <https://openid.net/specs/openid-caep-1_0-final.html>
>
> Related docs:
>
> - [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md)
> - [016_identity-event-consumer-content-api-fence-enforcement.md](016_identity-event-consumer-content-api-fence-enforcement.md)

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Existing Plugin Boundaries](#31-existing-plugin-boundaries)
  - [3.2 Existing Hook Surfaces](#32-existing-hook-surfaces)
  - [3.3 Existing OAuth Endpoints](#33-existing-oauth-endpoints)
  - [3.4 Existing Migration And DB Conventions](#34-existing-migration-and-db-conventions)
- [4. Target Model](#4-target-model)
  - [4.1 The `idIdentityEvents` Plugin](#41-the-ididentityevents-plugin)
  - [4.2 Outbox Pattern For Atomic Event Emission](#42-outbox-pattern-for-atomic-event-emission)
  - [4.3 SET Envelope Construction And Signing Keyset](#43-set-envelope-construction-and-signing-keyset)
  - [4.4 SSF Stream-Config Endpoints](#44-ssf-stream-config-endpoints)
  - [4.5 Delivery, Retry, And Dead-Letter](#45-delivery-retry-and-dead-letter)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Own-The-Mutation + D1 Batch Outbox Over Best-Effort Hooks](#51-own-the-mutation-d1-batch-over-best-effort-hooks)
  - [5.2 SET Over CloudEvents Or Raw JSON](#52-set-over-cloudevents-or-raw-json)
  - [5.3 PUSH Delivery Over POLL For First Release](#53-push-delivery-over-poll-for-first-release)
  - [5.4 Cloudflare Queues As Delivery Transport](#54-cloudflare-queues-as-delivery-transport)
  - [5.5 Plugin Boundary Over Inline Auth Code](#55-plugin-boundary-over-inline-auth-code)
  - [5.6 Separate SET-Signing Keyset From OAuth ID-Token JWKS](#56-separate-set-signing-keyset-from-oauth-id-token-jwks)
  - [5.7 Immediate Queue Dispatch From Outbox Writer, Cron As Sweeper Only](#57-immediate-queue-dispatch-from-outbox-writer-cron-as-sweeper-only)
  - [5.8 HMAC Pre-Check Required At Subscriber](#58-hmac-pre-check-required-at-subscriber)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
  - [7.1 Plugin Skeleton And Schema](#71-plugin-skeleton-and-schema)
  - [7.2 Outbox Writer Wiring](#72-outbox-writer-wiring)
  - [7.3 Own-The-Mutation Plugin Endpoints (Fence-Eligible Events)](#73-own-the-mutation-plugin-endpoints-fence-eligible-events)
  - [7.3a Best-Effort `databaseHooks` Capture (Audit-Only Events)](#73a-best-effort-databasehooks-capture-audit-only-events)
  - [7.4 Plugin Endpoint Capture Points (OAuth Scope Catalog And Resource Server)](#74-plugin-endpoint-capture-points-oauth-scope-catalog-and-resource-server)
  - [7.5 SET Envelope Builder](#75-set-envelope-builder)
  - [7.6 SSF Stream Configuration Endpoints](#76-ssf-stream-configuration-endpoints)
  - [7.7 Outbox Sweeper (Low-Frequency Safety Net)](#77-outbox-sweeper-low-frequency-safety-net)
  - [7.8 Delivery, Retry, Dead-Letter Routing](#78-delivery-retry-dead-letter-routing)
  - [7.9 Stream Verification Event](#79-stream-verification-event)
- [8. Extending The Producer With CAEP (Phase 2)](#8-extending-the-producer-with-caep-phase-2)
- [9. Migration And Rollout](#9-migration-and-rollout)
  - [9.1 Outbox Archival (Follow-Up)](#91-outbox-archival-follow-up)
- [10. Edge Cases And Failure Modes](#10-edge-cases-and-failure-modes)
- [11. Test And Verification Plan](#11-test-and-verification-plan)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 1. Goal

Implement the producer side of the identity event channel in `id` so that successful identity-state mutations are reliably and atomically captured, packaged into RFC 8417 SETs, and delivered to operator-provisioned subscribers over the OpenID Shared Signals Framework transport.

Outcomes for Phase 1:

- New `idIdentityEvents` Better Auth plugin owns Phase 1 fence-eligible source mutations (user disable and user delete) via *own-the-mutation* plugin endpoints. Each composes the source-table mutation and the outbox insert into a single `env.DB.batch([...])` for atomic capture (decision §5.1).
- For BA-internal mutations the plugin does not own (identifier changes), `databaseHooks` best-effort capture supplies audit-only events.
- Immediate `QUEUE.send` from the outbox writer (decision §5.7) drives the fast delivery path. A low-frequency cron sweeper recovers the rare orphans where queue-send failed post-commit.
- A separate SET-signing keystore (decision §5.6), distinct from the OAuth ID-token JWKS, signs SETs. Published at `/api/auth/ssf/jwks`.
- Delivery POSTs carry both a per-subscription HMAC header (decision §5.8) and the JWS-signed SET, giving subscribers a cheap pre-check before the expensive signature math.
- A plugin-owned admin surface under `/api/auth/ssf/streams` lets operators register subscriptions per resource server, rotate HMAC secrets with an overlap window, and inspect delivery status.

Non-goals for this doc:

- Consumer behavior. Doc 015 covers the audit consumer in `content-api`. Doc 016 covers fence enforcement.
- CAEP event vocabulary as a first-release item. §8 documents the additive Phase 2 extension only — code work is gated on D4 in doc 013.
- Public user-managed subscription marketplace. Operator-provisioned only, per [013 §5.3](013_identity-event-standards-and-decisions.md#53-d3--adopt-set--ssf--risc-end-to-end) reasoning.

## 2. System Summary

```text
identity mutation
   │
   ▼
Better Auth hook  ─┐
   or             │   (same DB transaction)
plugin endpoint   │
callback         ─┴───→ outbox row written
                          │
                          ▼
                     drainer worker (Cloudflare Queue consumer)
                          │
                          ▼
                     build SET (RFC 8417 JWS)
                          │
                          ▼
                     POST to each matching subscriber URL
                          │
                          ├── 2xx → mark delivered
                          ├── retryable failure → re-queue with backoff
                          └── permanent failure → dead-letter
```

The producer is intentionally generic: it does not know that `content-api` is the first subscriber, and the same delivery path serves any future resource API. The plugin owns a small SQLite table per concept (subscriptions, outbox, deliveries) and exposes admin endpoints for operator-level subscription management.

## 3. Current-State Findings

### 3.1 Existing Plugin Boundaries

Better Auth plugins in this repo follow the convention documented in [workers/core/src/auth/plugins/README.md](workers/core/src/auth/plugins/README.md). Three plugins already exist:

- `idResourceServer` ([workers/core/src/auth/plugins/resource-server/](workers/core/src/auth/plugins/resource-server/)) — `resourceServer` table, audience cache, admin endpoints.
- `idOAuthScopeCatalog` ([workers/core/src/auth/plugins/oauth-scope-catalog/](workers/core/src/auth/plugins/oauth-scope-catalog/)) — `oauthResourceScope` and `oauthClientOrganizationGrant` tables.
- `idPrincipalValidation` ([workers/core/src/auth/plugins/principal-validation/](workers/core/src/auth/plugins/principal-validation/)) — read-only validation endpoints.

Each plugin owns: `schema.ts`, `types.ts`, `index.ts` (Better Auth plugin export with `createAuthEndpoint` admin routes), `operations.ts` (CRUD via the Better Auth adapter), and may have a runtime companion (e.g. `audiences.ts`, `scopes.ts`) that preloads data before BA construction. The new plugin follows this layout.

### 3.2 Existing Hook Surfaces

Better Auth 1.6.11 exposes the following hook surfaces relevant to event capture:

| Hook surface | Captures | Availability today |
|---|---|---|
| `organizationHooks` (passed *into* `organization({ hooks: ... })` in [workers/core/src/auth/get-auth.ts](workers/core/src/auth/get-auth.ts)) | member add/remove/update, team create/delete, team-member add/remove | **Not yet wired**. Current code passes `organization({ teams: { enabled: true } })` with no hooks; this plugin introduces the wiring. |
| Admin user hooks (`admin({})`) | user disable/enable when admin endpoint is used | Plugin present; hooks not used. |
| User account hooks (via `databaseHooks.user`) | user create/update/delete at the database adapter level | Not configured. |
| Plugin endpoint callbacks (`createAuthEndpoint`) | custom plugin mutations such as resource-server disable, OAuth scope disable, grant disable — the plugin owns the callback | In use by `idResourceServer`, `idOAuthScopeCatalog`. |

All BA hooks listed above are *after-fact*: they fire after Better Auth has committed the source mutation. Capturing an event from inside the hook callback does **not** share a transaction with the source mutation — D1 has no nested transactions, and BA's `before` hooks do not expose the in-flight adapter transaction handle in a way the plugin can write to. This is the atomicity problem §4.2 and §5.1 solve by *owning the source mutation* for fence-eligible events instead of hooking BA's.

### 3.3 Existing OAuth Endpoints

[workers/core/src/auth/oauth-provider.ts](workers/core/src/auth/oauth-provider.ts) configures `@better-auth/oauth-provider` with the endpoints documented in [013 §3.3](013_identity-event-standards-and-decisions.md#33-existing-oauth-standards-surface). The relevant endpoints for capturing OAuth-client lifecycle changes are exposed by the OAuth Provider plugin and supplemented by `idOAuthScopeCatalog` admin endpoints under `/api/auth/admin/oauth-scopes` and `/api/auth/admin/oauth-grants`. These are the capture points for the repo-specific client-disabled / client-grant-disabled events, or CAEP `credential-change` only when an actual credential is revoked.

### 3.4 Existing Migration And DB Conventions

[README.md](../README.md) §Migrations records the constraint: plugin-owned tables are generated through `pnpm db:generate`. SQL migrations are produced through `pnpm db:migration:new <name>`. Manual SQL editing is forbidden. The `architecture/no-direct-db-access` lint rule permits raw D1 only in plugin-owned preload companions listed explicitly in the rule allowlist; CRUD must use the Better Auth adapter.

This constrains the outbox implementation: the outbox table is plugin-owned and generated via BA's schema definition; the outbox drainer worker reads via the BA adapter on the hot read path, and may be added to the allowlist only if benchmarking shows the adapter is the bottleneck.

## 4. Target Model

### 4.1 The `idIdentityEvents` Plugin

```text
workers/core/src/auth/plugins/identity-events/
  README.md
  schema.ts             plugin-owned: subscriptions, outbox, deliveries, set-signing keys
  types.ts              event-type URIs, envelope types, subscription config types
  operations.ts         BA-adapter CRUD for subscriptions and deliveries
  index.ts              BA plugin export, admin endpoints, hook wiring
  outbox.ts             outbox row writer + D1 batch composition for owned mutations
  set-envelope.ts       SET JWS construction (uses set-signing keystore)
  set-jwks.ts           plugin-owned SET-signing keystore + /api/auth/ssf/jwks handler
  hmac.ts               per-subscription HMAC secret generation and rotation helpers
  delivery.ts           HTTP POST delivery with HMAC header + retry semantics
  sweeper.ts            low-frequency cron handler for orphaned pending outbox rows
  publisher.ts          composed publisher facade for callers
```

The plugin exports:

- A Better Auth plugin instance registered in [workers/core/src/auth/get-auth.ts](workers/core/src/auth/get-auth.ts) alongside the existing three plugins.
- A typed `IdentityEventPublisher` value injected into `organizationHooks` and into the `idOAuthScopeCatalog` / `idResourceServer` admin endpoints so they can append events after successful mutations.

The plugin does **not**:

- Own user, org, team, or OAuth client state — those remain in BA-built-in and existing plugin tables.
- Decide product authorization — events are pure identity facts.
- Define UI — admin subscription registration is API-first per the conventions in [003 §9](003_future-implementation.md#9-api-first-scope-catalog-token-claims-and-tooling).

### 4.2 Outbox Pattern For Atomic Event Emission

The atomicity gap is: a Better Auth `after*` hook callback runs *after* the source mutation commits. If the event row is written from inside that callback, the source mutation can commit while the event write fails, leaving the identity change unobserved. Worse: D1 has no nested transactions, and BA's `before` hooks do not expose the in-flight adapter transaction handle to plugin code in a way that would let us share it.

The fix this design adopts is **"own the source mutation" + D1 batch atomicity**: for Phase 1 fence-eligible mutations (user disable and user delete), `idIdentityEvents` exposes its own plugin endpoints that:

1. Authorize the operator (same checks BA would have applied).
2. Compose **both** the source-table mutation and the outbox insert into a single `env.DB.batch([...])` call. D1 batch executes its statements atomically — either all rows commit or none do.
3. After the batch resolves, fire `env.QUEUE.send({ outboxId })` in the same request handler for low-latency dispatch.
4. Run side effects (cache invalidation, etc.) after both have succeeded.

```text
env.DB.batch([
  // source mutation
  prepare("UPDATE user SET banned = 1, ban_reason = ?, ban_expires = ? WHERE id = ?"),
  // outbox insert — committed atomically with the source mutation
  prepare(`INSERT INTO identityEventOutbox
           (id, event_type_uri, subject_identifier, occurred_at, payload, status)
           VALUES (?, 'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
                   ?, ?, ?, 'pending')`),
])
// then, best-effort, in the same handler:
await env.QUEUE.send({ outboxId });
```

For Better-Auth-internal mutations the plugin does *not* own (e.g., identifier change inside BA's `updateUser`), we fall back to a `databaseHooks.user.update.before` callback that writes the outbox row in a separate D1 transaction after the BA mutation commits. This is best-effort capture; the periodic sweep job (§4.5) is the recovery path for any missed writes. Events from this fallback are classified as audit-only and are not eligible to drive Phase 3 fence enforcement.

A separate Queue **consumer** worker reads the dispatch messages, builds the SET (§4.3), POSTs it to each matching subscriber URL with HMAC + JWS, and updates the `identityEventDelivery` table with the outcome (§4.5).

The **sweeper** (a low-frequency cron, e.g. every 10 minutes) does *not* drive the fast path. Its only job is to pick up rare `pending` outbox rows whose `QUEUE.send` failed or whose Worker isolate died between the batch commit and the queue send. It re-enqueues them.

### 4.3 SET Envelope Construction And Signing Keyset

Per RFC 8417 and the SSF Final profile, every emitted event is a JWS-signed JWT with this minimum claim set:

```json
{
  "iss": "https://id.<host>/api/auth",
  "aud": ["<subscriber-resource-audience>"],
  "iat": 1779697800,
  "jti": "evt_01HXYZ...",
  "toe": 1779697799,
  "sub_id": {
    "format": "opaque",
    "id": "user_alice"
  },
  "events": {
    "https://schemas.openid.net/secevent/risc/event-type/account-disabled": {
      "reason": "admin_disabled"
    }
  }
}
```

Rules:

- `iss` is the canonical issuer URL — same value as the OAuth ID Token issuer (`https://id.<host>/api/auth`).
- `aud` is the subscriber's `resource` audience (the value `content-api` already verifies as `aud` on its bearer tokens). One SET targets one subscriber audience.
- `iat` is the moment the SET is signed, not the moment of the identity mutation. The optional RFC 8417 `toe` claim carries the time of the state change; for CAEP events the required event payload `event_timestamp` represents the same effective event time.
- `jti` is the stable, primary-keyed `outbox.id`, used by the consumer for idempotency.
- `sub_id` is mandatory for SSF SETs and identifies the subject in a top-level Subject Identifier. The top-level JWT `sub` and `exp` claims MUST NOT be present.
- `events` is a single-key object as this producer's implementation policy. RFC 8417 itself permits multiple event-type URIs for aspects of one logical state transition.
- Signing: `RS256` using a **separate SET-signing keyset**, distinct from the OAuth ID-token JWKS at `/api/auth/jwks` (decision §5.6). Published at `/api/auth/ssf/jwks`. The JOSE header includes `typ: "secevent+jwt"` and `kid` references the current SET-signing key; rotation and grace policies mirror the OAuth keyset but the key material does not overlap.

**Keyset separation rationale** (B): RFC 8725 §3.5 and RFC 8417 §6.2 recommend separating signing-key purposes. Mixing SET signing with OAuth ID-token signing means a compromise in one path invalidates both. Better Auth's `jwt` plugin owns the OAuth JWKS only; SET signing requires a dedicated key store and a dedicated JWKS endpoint. Implementation cost is one additional rotating-key store and one extra route; consumer cost is one extra JWKS URL env var. See §5.6 for the decision record.

Subject formats:

| Event scope | `sub_id.format` | Subject Identifier contents |
|---|---|---|
| Account-scoped (user) | `opaque` | `user_id` |
| Tenant-scoped (org-member) | `complex` | component identifiers for `org_id` and `user_id` |
| Team-scoped (team-member) | `complex` | component identifiers for `org_id`, `team_id`, and `user_id` |
| Client-scoped | `opaque` | `client_id` |

Repo-specific event payloads (organization-member-removed, team-member-removed, client-disabled, team-deleted, client-grant-disabled) follow the same `sub_id` conventions but use the namespaced URI from [013 §7](013_identity-event-standards-and-decisions.md#7-event-vocabulary-mapping).

### 4.4 SSF Stream-Config Endpoints

The OpenID Shared Signals Framework defines stream-config endpoints. The producer ships these under `/api/auth/ssf/` (path renamed from earlier "sse" — see [013 §4.4](013_identity-event-standards-and-decisions.md#44-terminology-note-ssf-not-sse)):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/ssf/streams` | `POST` | Create a stream (operator-only). Response includes the initial HMAC secret (returned exactly once). |
| `/api/auth/ssf/streams/:id` | `GET`, `PATCH`, `DELETE` | Read, update (paused/enabled, eventTypes), or delete a stream. |
| `/api/auth/ssf/streams/:id/verify` | `POST` | Send a synthetic verification event the subscriber must echo back. |
| `/api/auth/ssf/streams/:id/status` | `GET` | Report the operator-visible stream status (`enabled` / `paused` / `disabled`) and recent delivery metrics. |
| `/api/auth/ssf/streams/:id/rotate-hmac` | `POST` | Generate a new HMAC secret. The previous secret remains valid for an overlap window (default 1 hour) so subscribers can update their stored secret without dropping events. |
| `/api/auth/ssf/jwks` | `GET` | The **SET-signing** JWKS, distinct from the OAuth ID-token JWKS at `/api/auth/jwks` (decision §5.6). |

The shape of stream-config requests follows the SSF spec where applicable. Repo-specific fields (subscription belongs-to-resource-server, operator-only ACL, HMAC secret material) are declared as extensions.

Multiple subscriptions per resource server are explicitly allowed — there is no unique constraint on `resourceServerId` in `identityEventSubscription`. A consumer may register one subscription for audit and another for fence enforcement with different event-type allowlists.

### 4.5 Delivery, Retry, And Dead-Letter

Delivery transport: Cloudflare Queues with bound dead-letter queue, per [Queues configuration docs](https://developers.cloudflare.com/queues/configuration/batching-retries/). The outbox writer enqueues directly in the same request (decision §5.7); a dedicated consumer worker delivers. A low-frequency sweeper cron picks up orphaned `pending` rows on the rare path where `QUEUE.send` fails after a successful D1 batch commit.

Retry policy:

- Initial attempt within seconds of outbox commit (immediate dispatch).
- Exponential backoff (1s, 5s, 30s, 5m, 30m, 6h) up to a configured maximum.
- After max retries, route to DLQ. DLQ entries surface in the operator delivery view (`GET /api/auth/ssf/streams/:id/deliveries?status=failed`).

Replay protection and subscriber authentication (two layers):

1. **HMAC header (required)** — every POST carries `id-event-hmac: HMAC-SHA256(body, subscription.hmac_secret)` plus a subscription identifier header. Subscribers verify this *before* parsing the JWS so unauthenticated POSTs cost near zero to reject. See §5.8 for the decision record.
2. **JWS envelope (RFC 8417)** — the SET body is signed with the SET-signing keyset (§4.3). Subscribers verify against `/api/auth/ssf/jwks`.

Headers sent with every delivery:

- `id-event-id` (= `jti`)
- `id-event-signed-at` (= `iat`)
- `id-event-key-id` (= JWS `kid`)
- `id-event-subscription` (subscription identifier)
- `id-event-hmac` (HMAC-SHA256 of the raw body, base64-encoded)
- `Content-Type: application/secevent+jwt`

Subscribers reject timestamps outside a configurable replay window (default 5 minutes) and treat duplicate `jti` as already-processed. This matches RFC 8417 §2.3 and SSF guidance.

Security:

- HTTPS only outside local dev (loopback subscriber URLs allowed under `NODE_ENV=development`).
- Subscriber URL stored once at registration; rotation requires `PATCH`.
- The HMAC secret is stored on `identityEventSubscription` (current + previous columns for rotation overlap). Rotation via `/api/auth/ssf/streams/:id/rotate-hmac` returns the new secret exactly once and starts a configurable overlap window during which both secrets are accepted.
- SET integrity is the JWS-signed envelope; the HMAC is **defense-in-depth**, not a substitute for envelope verification.

## 5. Architecture Decisions

### 5.1 Own-The-Mutation + D1 Batch Outbox Over Best-Effort Hooks

**Recommended (A.1)**: for Phase 1 fence-eligible source mutations (user disable and user delete), `idIdentityEvents` plugin endpoints own the mutation and use `env.DB.batch([mutationSql, outboxInsertSql])` to commit source row + outbox row atomically. Phase 2 applies the same pattern to approved CAEP or repository-specific enforcement events. Immediately afterward, the same request handler invokes `env.QUEUE.send({ outboxId })` for low-latency dispatch. A low-frequency sweeper cron picks up the rare orphan where the batch committed but the queue send failed.

**Rejected — fire-and-forget inside BA hook**. The BA `after*` hook fires after commit, so there is no atomic relationship between the source mutation and the dispatch. A worker restart or hook exception loses events.

**Rejected — `databaseHooks.after` writes outbox row in a fresh transaction**. Better than fire-and-forget but still subject to the post-commit failure mode: source mutation commits, outbox insert fails, event is silently lost. The reconciliation sweep would be the only recovery and is not free to implement.

**Rejected — Durable Object as outbox**. The D1-commit → DO-RPC gap is the same as the D1-commit → queue-send gap in the rejected option above. Durable Objects do not solve the capture-side atomicity problem. (They may serve as the *delivery* worker in a later phase; that is orthogonal.)

**Rejected — purely reconciliation-based emission (no outbox, diff BA state periodically)**. Effectively builds half a SCIM pull pipeline. Consumer can no longer trust event ordering across diffs. Disproportionate complexity for a need the D1 batch already meets cleanly.

**Reasoning**: D1's `batch` is a single SQLite transaction (BEGIN/COMMIT bracketing all statements). Wrapping the source mutation and the outbox insert in one batch is the canonical *transactional outbox* pattern adapted to this runtime. The cost of owning ~5 mutation endpoints is bounded; the correctness guarantee is real. For mutations BA owns that we choose not to take over (e.g. identifier change inside `updateUser`), best-effort `databaseHooks` + reconciliation findings is acceptable because those events are audit-only (not fence-eligible) — Phase 3 fence enforcement reads only from atomically-captured events.

### 5.2 SET Over CloudEvents Or Raw JSON

**Recommended**: RFC 8417 SET (JWS-wrapped JWT).

**Rejected — CloudEvents 1.0**: not signed by default. Requires layering another JWS scheme or HMAC scheme on top, duplicating SET's design.

**Rejected — Bare JSON with HMAC header** (the legacy `auther` shape): repo-specific, no replay primitives, requires per-subscription secret rotation. Already classified as a repo-specific extension that overlaps an established standard, rejected per [013 §4.3](013_identity-event-standards-and-decisions.md#43-classification-table-per-amd-taxonomy).

**Reasoning**: SET is purpose-built for security event delivery. Existing JWKS infrastructure in `id` is reused with zero new key management.

### 5.3 PUSH Delivery Over POLL For First Release

**Recommended**: PUSH (transmitter POSTs SETs to subscriber URL).

**Deferred**: POLL (subscriber pulls SETs from a producer-side queue endpoint). Useful for subscribers behind NAT or that prefer pull semantics. Document as a future option; do not implement in first release.

**Reasoning**: `content-api` runs on Cloudflare Workers and has a public ingress endpoint already. PUSH is simpler and fits the architecture.

### 5.4 Cloudflare Queues As Delivery Transport

**Recommended**: Cloudflare Queues for outbox-to-delivery and for retry queueing.

**Rejected — QStash**: introduces a third-party infrastructure dependency. The legacy `auther` repo used QStash; that decision belongs to that codebase, not this one.

**Rejected — In-process delivery from the outbox drainer**: a long-running Worker invocation per delivery defeats the Workers execution model. Queues are the native primitive.

**Reasoning**: Queues are Cloudflare-native, support retries, batching, and DLQ out of the box, and match the existing infrastructure footprint declared in [workers/core/wrangler.jsonc](workers/core/wrangler.jsonc).

### 5.5 Plugin Boundary Over Inline Auth Code

**Recommended**: a dedicated `idIdentityEvents` Better Auth plugin (see §4.1).

**Rejected**: inline event code in [workers/core/src/auth/get-auth.ts](workers/core/src/auth/get-auth.ts). Violates the plugin-first convention documented in [003 §1](003_future-implementation.md#1-plugin-architecture-strategy) and the lint rules in [packages/lint-rules/](packages/lint-rules/).

**Reasoning**: the plugin model already governs the other three custom plugins and gives the event system its own migration path, admin endpoints, and test surface.

### 5.6 Separate SET-Signing Keyset From OAuth ID-Token JWKS

**Recommended (B)**: provision a dedicated SET-signing keyset for `idIdentityEvents`. Publish at `/api/auth/ssf/jwks`. Do not reuse the Better Auth `jwt` plugin keyset at `/api/auth/jwks`.

**Rejected — reuse OAuth JWKS**: simpler to ship but goes against RFC 8725 §3.5 ("Use Different Keys for Different Kinds of JWTs") and RFC 8417 §6.2 (the SET spec's own key-management guidance). A compromise of the OAuth signer would automatically be a compromise of the SET signer and vice versa. Audience separation at consumers mitigates blast radius but does not address signing-side compromise.

**Reasoning**: the operational cost of a second rotating keyset is small (one additional key store, one additional JWKS route, one more env var at the consumer). The risk reduction from key-use separation is substantial. Rotation and grace policies mirror the OAuth keyset (`jwksRotationIntervalSeconds`, `jwksGracePeriodSeconds`) so retired keys remain in the JWKS for in-flight SETs. Implementation: add a `setSigningKeystore` schema to `idIdentityEvents`, expose `/api/auth/ssf/jwks` from the plugin, sign SETs from this keystore only.

### 5.7 Immediate Queue Dispatch From Outbox Writer, Cron As Sweeper Only

**Recommended (C)**: invoke `env.QUEUE.send({ outboxId })` from the same request handler that commits the D1 batch (§5.1). The cron trigger exists only as a low-frequency sweeper for outbox rows whose `QUEUE.send` failed after a successful batch commit.

**Rejected — cron-driven primary drain at 1-minute granularity**. Cloudflare Cron Triggers have a 1-minute floor. A primary drainer keyed on cron therefore floors event-to-queue latency at ~60s, which is incompatible with the Phase 3 fence-application SLA targeted in [016 §8.7](016_identity-event-consumer-content-api-fence-enforcement.md#87-sla-documentation-updates). For audit-only consumers the latency would be tolerable, but the architectural choice locks in a SLA boundary at the producer that the consumer cannot escape.

**Rejected — pure fire-and-forget queue send with no sweeper**. Loses the small but real category of "batch committed, queue send failed" events. The recovery cost is one sweeper cron at ~10-minute granularity.

**Reasoning**: D1 batch commits in the request, then `QUEUE.send` is a single Cloudflare-internal RPC measured in single-digit milliseconds. The combined critical path remains short and well within Worker CPU budgets. The sweeper covers the residual race; sweeper cadence is not the fast path. This decision presupposes §5.1: without the D1 batch guaranteeing the outbox row is durable, the immediate dispatch optimization has nothing to dispatch from.

### 5.8 HMAC Pre-Check Required At Subscriber

**Recommended (D)**: every delivery POST carries an `id-event-hmac` header computed as HMAC-SHA256 over the raw body using a per-subscription shared secret. Subscribers verify this header *before* parsing the JWS. The HMAC step is **required**, not optional.

**Rejected — JWS-only authentication**: relies on the receiver doing a full JWS verify (parse JWT, fetch JWKS by `kid`, run RSA verify) on every POST, including unauthenticated traffic. The receiver endpoint at `content-api` is publicly reachable; without a cheap pre-check, an attacker can force JWKS fetches and signature math at low cost to themselves. The endpoint becomes a DoS amplifier.

**Rejected — mTLS**: would solve the same problem with stronger guarantees but adds operational weight (cert issuance, rotation, Cloudflare Worker mTLS configuration) that is disproportionate to the threat model. HMAC + JWS gives equivalent integrity for this protocol.

**Reasoning**: HMAC verification is constant-time, branch-light, and orders of magnitude cheaper than JWS. It does not replace JWS as the integrity gate — it is an inexpensive bouncer in front of the expensive bouncer. Rotation is supported via the `rotate-hmac` endpoint (§4.4) with an overlap window so subscribers can update their stored secret without dropping events. Production deployments of SSF in industry routinely include a transport-level shared-secret check for exactly this reason.

## 6. Implementation Strategy

Sequence work so each step is reviewable in isolation:

1. **Plugin skeleton + schema generation** — empty plugin, four tables (`identityEventSubscription` with HMAC columns, `identityEventOutbox`, `identityEventDelivery`, `setSigningKey`), generate migration. No behavior yet.
2. **SET-signing keyset + `/api/auth/ssf/jwks`** — bootstrap the separate keystore (§5.6), expose the JWKS endpoint, add a key-rotation cron mirroring the OAuth keyset's lazy rotation pattern.
3. **Own-the-mutation plugin endpoints + D1 batch** — for Phase 1 `banUser` and `deleteUser`: implement endpoints that authorize the operator, build the D1 batch (source mutation + outbox insert), and invoke `QUEUE.send` after commit. Phase 2 adds atomic capture for session revocation and approved client/grant extensions. These replace the corresponding BA admin paths only when their event phase is enabled.
4. **`databaseHooks` best-effort fallback** — for BA-owned mutations we do not take over (identifier changes via `updateUser`), wire `databaseHooks.user.update.before` to write a best-effort outbox row in a separate D1 transaction. Document these as audit-only (not fence-eligible).
5. **SET envelope builder** — pure function that converts an outbox row to a JWS-signed SET using the SET-signing keystore. Header includes `typ: secevent+jwt`.
6. **SSF stream-config endpoints** — admin-only CRUD over `identityEventSubscription` under `/api/auth/ssf/streams`, plus the HMAC rotation endpoint.
7. **Outbox sweeper (low-frequency cron)** — sweeps `pending` outbox rows older than N seconds and re-enqueues them. Not the fast path; runs every ~10 minutes.
8. **Delivery consumer** — Queue consumer that POSTs the SET to the subscriber URL with the HMAC header + signed envelope, handles retries, marks delivery rows.
9. **Stream verification event** — synthetic event with type URI `https://schemas.openid.net/secevent/ssf/event-type/verification` emitted on `/streams/:id/verify`, used to confirm subscriber decode capability.

Each step ends at a `pnpm check` green state. Steps 1-6 and 8 are required for Phase 1 first release; steps 7 and 9 are required before declaring Phase 1 done.

## 7. Detailed Implementation Plan

### 7.1 Plugin Skeleton And Schema

Current problem:

- No `idIdentityEvents` plugin exists. The pattern is established by [workers/core/src/auth/plugins/principal-validation/](workers/core/src/auth/plugins/principal-validation/) and [workers/core/src/auth/plugins/oauth-scope-catalog/](workers/core/src/auth/plugins/oauth-scope-catalog/).

Target behavior:

- New plugin directory at `workers/core/src/auth/plugins/identity-events/`.
- Three plugin-owned tables defined in `schema.ts`:

```ts
// workers/core/src/auth/plugins/identity-events/schema.ts (sketch)
export const identityEventSubscription = {
  id: { type: "string", required: true, primaryKey: true },
  resourceServerId: { type: "string", required: true, references: "resourceServer.id" }, // not unique — N subscriptions per resource server allowed
  destinationUrl: { type: "string", required: true },
  enabled: { type: "boolean", required: true, default: true },
  eventTypes: { type: "string", required: true }, // JSON-encoded array of URIs
  replayWindowSeconds: { type: "number", required: true, default: 300 },
  // HMAC subscriber-auth secret(s) — decision §5.8
  hmacSecretCurrent: { type: "string", required: true }, // base64-encoded random bytes
  hmacSecretPrevious: { type: "string" }, // honored during rotation overlap
  hmacPreviousExpiresAt: { type: "date" },
  hmacRotatedAt: { type: "date", required: true },
  createdBy: { type: "string", required: true },
  updatedBy: { type: "string", required: true },
  createdAt: { type: "date", required: true },
  updatedAt: { type: "date", required: true },
};

// SET-signing keystore — decision §5.6. Distinct from the BA `jwt` plugin's
// OAuth ID-token keys. Published at /api/auth/ssf/jwks.
export const setSigningKey = {
  id: { type: "string", required: true, primaryKey: true }, // = kid
  privateKeyPem: { type: "string", required: true }, // encrypted at rest via Workers binding
  publicKeyJwk: { type: "string", required: true }, // JWKS-shaped JSON
  algorithm: { type: "string", required: true, default: "RS256" },
  status: { type: "string", required: true }, // active | retired
  createdAt: { type: "date", required: true },
  retiredAt: { type: "date" },
  // retired keys remain published in JWKS until retiredAt + gracePeriod
};

export const identityEventOutbox = {
  id: { type: "string", required: true, primaryKey: true }, // jti
  eventTypeUri: { type: "string", required: true },
  subjectIdentifierFormat: { type: "string", required: true },
  subjectIdentifierJson: { type: "string", required: true }, // serialized SSF sub_id object
  payloadJson: { type: "string", required: true }, // serialized event payload
  occurredAt: { type: "date", required: true },
  sourceMutation: { type: "string", required: true }, // free-form audit label
  status: { type: "string", required: true }, // pending | queued | delivered | failed
  createdAt: { type: "date", required: true },
};

export const identityEventDelivery = {
  id: { type: "string", required: true, primaryKey: true },
  outboxId: { type: "string", required: true, references: "identityEventOutbox.id" },
  subscriptionId: { type: "string", required: true, references: "identityEventSubscription.id" },
  attemptNumber: { type: "number", required: true },
  status: { type: "string", required: true }, // success | retry | dead-letter
  httpStatus: { type: "number" },
  errorMessage: { type: "string" },
  attemptedAt: { type: "date", required: true },
};
```

Implementation tasks:

- [ ] Create `workers/core/src/auth/plugins/identity-events/` directory.
- [ ] Add `schema.ts` with the three tables above.
- [ ] Add `index.ts` exporting an empty plugin (`createAuthEndpoint` registrations come later).
- [ ] Register the plugin in [workers/core/src/auth/get-auth.ts](workers/core/src/auth/get-auth.ts) alongside the existing plugins.
- [ ] Run `pnpm db:generate` and `pnpm db:migration:new add_identity_events_plugin_tables`.
- [ ] Apply locally with `pnpm db:migrate:local` and verify the tables exist in local D1.

Tests:

- `pnpm check` passes with the empty plugin registered.
- Migration applies cleanly to a fresh local D1.

### 7.2 Outbox Writer Wiring

Current problem:

- No path exists to write outbox rows in the same transaction as a Better Auth mutation.

Target behavior:

- An `IdentityEventPublisher` value with signature:

```ts
type IdentityEventPublisher = {
  appendEvent(input: {
    eventTypeUri: string;
    subjectIdentifier: SsfSubjectIdentifier;
    payload: Record<string, unknown>;
    occurredAt: Date;
    sourceMutation: string;
  }, ctx: { db: BetterAuthAdapterTransaction }): Promise<void>;
};
```

- Inside `appendEvent`, write an `identityEventOutbox` row through `ctx.db` so it commits in the source mutation's transaction.

Implementation tasks:

- [ ] Add `outbox.ts` with the `IdentityEventPublisher` factory.
- [ ] Add `publisher.ts` that composes the publisher and any future filters.
- [ ] Add `types.ts` with `SsfSubjectIdentifier` and event-type-URI constants.
- [ ] Export `createIdentityEventPublisher(authContext)` from the plugin.

Tests:

- Unit test asserting `appendEvent` writes a row with the expected fields.
- Integration test asserting that a failing source mutation (forced rollback) leaves no outbox row.

### 7.3 Own-The-Mutation Plugin Endpoints (Fence-Eligible Events)

Current problem:

- Better Auth's `admin` plugin currently owns `banUser`, `unbanUser`, `removeUser`, `revokeUserSessions`. Capturing an event from a BA after-hook is post-commit; capturing from a before-hook does not give us the in-flight D1 transaction handle. Atomic capture requires owning the source mutation.

Target behavior — Phase 1 fence-eligible events, captured atomically via D1 batch (§5.1):

| Source mutation | Owning endpoint (new) | Emitted event URI |
|---|---|---|
| Admin user disable | `POST /api/auth/identity-events/admin/users/:id/disable` | `https://schemas.openid.net/secevent/risc/event-type/account-disabled` |
| Admin user enable | `POST /api/auth/identity-events/admin/users/:id/enable` | `https://schemas.openid.net/secevent/risc/event-type/account-enabled` |
| User hard delete | `POST /api/auth/identity-events/admin/users/:id/delete` | `https://schemas.openid.net/secevent/risc/event-type/account-purged` |

Bulk session revocation is not part of Phase 1: RISC Final deprecates `sessions-revoked`, and the standards-compliant CAEP `session-revoked` event is introduced in Phase 2 (§8).

Each endpoint:

1. Authorizes the operator (same checks BA would apply for the equivalent endpoint).
2. Composes the source-table SQL and the outbox-row SQL as a `env.DB.batch([...])` call.
3. On success, invokes `env.QUEUE.send({ outboxId })`.
4. Triggers any required cache invalidations (e.g., session secondary-storage).
5. Returns the same response shape as the BA endpoint it supplants, so admin UI clients are unaffected.

Implementation tasks:

- [ ] In `outbox.ts`, expose `buildOutboxInsertStatement(env, eventInput): D1PreparedStatement`.
- [ ] In `index.ts`, register the three `createAuthEndpoint` handlers above, each calling `env.DB.batch([<sourceMutation>, buildOutboxInsertStatement(...)])` and then `env.QUEUE.send({ outboxId })`.
- [ ] Verify behavioral parity with BA's equivalent endpoints (identical authorization, identical response, identical cache invalidation). Cover with integration tests against a fresh local D1.
- [ ] Document the supplanted BA endpoints in the plugin README so future maintainers do not accidentally re-enable them.

Tests:

- Integration test: own-the-mutation disable -> exactly one outbox row with URI `account-disabled` and `sub_id.id = user_id`, source row updated, queue message produced.
- Integration test: own-the-mutation delete → outbox row with `account-purged`, source row deleted, atomicity verified (force a SQL error on the second statement; assert neither commits).
- Integration test: queue send failure after batch commit → outbox row remains `pending`; sweeper picks it up on next run.

### 7.3a Best-Effort `databaseHooks` Capture (Audit-Only Events)

For BA-internal mutations that this plugin does **not** take over — primarily identifier (email/username) changes performed via BA's `updateUser` — capture is best-effort via `databaseHooks`:

| Source mutation | Captured by | Emitted event URI | Classification |
|---|---|---|---|
| Email or username changed | `databaseHooks.user.update.after` when the relevant field differs | `https://schemas.openid.net/secevent/risc/event-type/identifier-changed` | Audit-only |
| Forced password reset / MFA reset (when surfaced through BA) | corresponding admin/`databaseHooks` callback | `https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required` | Audit-only |

Atomicity: the after-hook fires *after* the BA mutation commits. The outbox insert runs in a fresh D1 transaction. In the rare case that the second insert fails, the event is lost. Phase 3 fence enforcement does **not** read from these events — they drive audit findings only.

Recovery: a periodic reconciliation use case in `content-api` (out of scope for this doc; tracked under [015 §7.6](015_identity-event-consumer-content-api-audit.md#76-reconciliation-findings-storage)) can detect drift on its own.

Implementation tasks:

- [ ] Wire `databaseHooks.user.update.after` in [workers/core/src/auth/get-auth.ts](workers/core/src/auth/get-auth.ts) to call the plugin's best-effort `appendOutboxBestEffort(...)` helper when `email` or `username` changes.
- [ ] Mark each emitted event in `identityEventOutbox.source_mutation` with the prefix `best-effort:` so audit consumers can distinguish atomic vs. best-effort capture.

Tests:

- Integration test: BA `updateUser` changing email → outbox row appears with `identifier-changed`. Verifies the wire-up.
- Integration test: forced failure of outbox insert after BA commit → BA mutation still observed, outbox row absent. Test documents the audit-only classification.

### 7.4 Plugin Endpoint Capture Points (OAuth Scope Catalog And Resource Server)

Current problem:

- `idOAuthScopeCatalog` admin endpoints currently disable a resource scope or grant without emitting events. The capture point is needed primarily for Phase 2 (repo-specific `oauth-client-disabled` and `oauth-client-grant-disabled`; CAEP `credential-change` applies only if an actual client credential is revoked).

Target behavior:

- In Phase 1: prepare the integration point. No Phase 2 events are emitted yet (D4 gated), but the wiring is added so Phase 2 is an event-URI addition rather than a new code path.
- In `idOAuthScopeCatalog` and `idResourceServer` admin endpoints that perform "disable" mutations, accept an injected `IdentityEventPublisher` and call `appendEvent` from inside the BA-adapter transaction.

Implementation tasks:

- [ ] Add `IdentityEventPublisher` to the runtime context passed to `oauthScopeCatalog` and `resourceServer` admin endpoint factories.
- [ ] In `disableOAuthClient`, `disableOAuthGrant`, `disableResourceServer` endpoint callbacks, add a placeholder `appendEvent` call wrapped in a feature flag (e.g. `if (env.IDENTITY_EVENTS_CAEP_ENABLED)`). The flag stays off in Phase 1.

Tests:

- Lint passes with the wiring in place.
- Unit test asserting that with the flag off, no event is emitted; with the flag on, the expected event URI is recorded.

### 7.5 SET Envelope Builder

Current problem:

- No SET builder exists.

Target behavior:

- A pure function `buildSet(outboxRow, subscription, signingKey)` that returns a JWS-signed string per RFC 8417.

Implementation tasks:

- [ ] Add `set-envelope.ts` with `buildSet` using the existing JWT signing helper from `@better-auth/jwt` or `jose`.
- [ ] Header: `alg: RS256`, `kid: <current JWKS kid>`, `typ: secevent+jwt`.
- [ ] Claims as specified in §4.3, including mandatory `sub_id`; prohibit top-level `sub` and `exp`.
- [ ] Unit-test against a known-good example signed payload, verified with `jose.jwtVerify` against the local JWKS endpoint.

Tests:

- Unit test verifying a built SET decodes to expected `iss`, `aud`, `jti`, `sub_id`, single-key `events` object, and `typ: secevent+jwt`, without `sub` or `exp`.
- Unit test verifying the SET signature validates against `/api/auth/jwks`.

### 7.6 SSF Stream Configuration Endpoints

Current problem:

- No subscription admin surface.

Target behavior:

- Operator-only endpoints under `/api/auth/ssf/streams` as specified in §4.4.
- Authorization: existing `requireActor(c)` + an admin-action check. For Phase 1, gate on `actor.platformRole === "admin"` until a fuller `authorizeAdminAction("manageIdentityEventStreams")` is added (the model in [003 §8](003_future-implementation.md#8-deferred-admin-authorization-model) is deferred; gate on platform-admin for now and document the upgrade path).
- HMAC secret material: `POST /ssf/streams` generates the initial secret and returns it in the response **exactly once**. `POST /ssf/streams/:id/rotate-hmac` generates a new secret, returns it once, and keeps the prior secret valid for an overlap window (default 1 hour, configurable via the rotation request body).

Implementation tasks:

- [ ] Add `index.ts` `createAuthEndpoint` entries for `POST /ssf/streams`, `GET /ssf/streams/:id`, `PATCH /ssf/streams/:id`, `DELETE /ssf/streams/:id`, `POST /ssf/streams/:id/verify`, `GET /ssf/streams/:id/status`, `POST /ssf/streams/:id/rotate-hmac`.
- [ ] Validation: `destinationUrl` must be HTTPS in non-dev; `resourceServerId` must reference an enabled resource server (need not be unique — multiple subscriptions per resource server allowed, see §4.4); `eventTypes` must be a subset of the Phase 1 allowlist.
- [ ] HMAC helpers in `hmac.ts`: 32-byte CSPRNG, base64 encoding, constant-time compare for the verification path (used by tests).
- [ ] Persist via the BA adapter through `operations.ts`.

Tests:

- Integration test: operator creates → reads → patches → deletes a subscription. Initial response carries `hmac_secret`; subsequent reads do not return the secret.
- Integration test: rotate-hmac returns a new secret; both old and new secrets are honored during the overlap window; after expiry, only the new secret is honored.
- Integration test: non-operator rejected.
- Integration test: `destinationUrl` with `http://` rejected in production env, accepted in `NODE_ENV=development`.

### 7.7 Outbox Sweeper (Low-Frequency Safety Net)

Current problem:

- The fast path (§5.7) dispatches `QUEUE.send` immediately from the same request that commits the D1 batch. In the rare path where the queue send fails after the batch committed (network blip, queue throttled, Worker died between commit and send), the outbox row is stuck at `status = 'pending'` and no consumer ever sees it.

Target behavior:

- A low-frequency cron sweeper picks up `pending` rows older than a configurable threshold and re-runs the dispatch step. **This is not the primary drainer**; under healthy operation the sweeper finds nothing.

Implementation tasks:

- [ ] Add cron trigger to [workers/core/wrangler.jsonc](workers/core/wrangler.jsonc): `"crons": ["*/10 * * * *"]` (every 10 minutes is sufficient; the fast path covers the common case).
- [ ] Add a scheduled handler in [workers/core/src/index.ts](workers/core/src/index.ts) (or equivalent worker entry) that calls the sweeper.
- [ ] Sweeper: SELECT `outbox` WHERE `status = 'pending'` AND `createdAt < now - 60s` ORDER BY `createdAt` LIMIT 100. For each row, fan out to matching subscriptions (`resourceServerId` ∩ `eventTypes`) and `QUEUE.send` per match. Mark outbox row `status = 'queued'`. The 60-second floor avoids racing the fast path's still-in-flight retries.
- [ ] Add a metric (counts of rows swept per run) — alarms if this is consistently nonzero, that signals a deeper fast-path bug.

Tests:

- Integration test: manually mark an outbox row `pending` older than 60s; run sweeper; observe Queue message produced and row marked `queued`.
- Integration test: pending outbox row + no matching subscription → row marked `queued` with zero deliveries scheduled (treat zero matches as a successful no-op; the row is not orphan-retried).
- Integration test: fast path succeeds normally → sweeper finds zero rows on next run.

### 7.8 Delivery, Retry, Dead-Letter Routing

Current problem:

- No consumer for the delivery queue.

Target behavior:

- Cloudflare Queue consumer reads delivery messages, loads the corresponding outbox row, builds the SET via §7.5, POSTs to the subscriber URL, handles result, and writes an `identityEventDelivery` row.
- Retry policy as specified in §4.5.

Implementation tasks:

- [ ] Add Queue binding in [workers/core/wrangler.jsonc](workers/core/wrangler.jsonc): a primary queue and a DLQ.
- [ ] Add a Queue consumer handler in the same worker (or a separate worker if the size warrants).
- [ ] On 2xx: insert `identityEventDelivery` with `status: 'success'`, mark outbox `delivered`.
- [ ] On 5xx or network error: insert with `status: 'retry'`, re-queue with backoff via Queue retry semantics; on max retries → DLQ.
- [ ] On 4xx (specifically 410 Gone): treat as permanent and DLQ immediately.
- [ ] On 401: retry once after immediate HMAC-rotation poll (subscriber may be mid-rotation); if the second 401 fails, DLQ. Operator alert.
- [ ] Add headers: `id-event-id` (jti), `id-event-signed-at` (iat), `id-event-key-id` (JWS kid), `id-event-subscription` (subscription id), `id-event-hmac` (base64-encoded HMAC-SHA256 of raw body using `subscription.hmacSecretCurrent`). Set body content-type to `application/secevent+jwt` per RFC 8417 §2.3.
- [ ] Compute HMAC over the *exact body bytes* sent on the wire — no normalization, no re-serialization. The subscriber recomputes over the bytes it receives.

Tests:

- Integration test using a fixture subscriber URL: 2xx → delivered.
- Integration test: subscriber returns 503 → retry → eventually delivered.
- Integration test: subscriber returns 410 → DLQ immediately.
- Integration test: timestamp outside replay window — `not` enforced by the producer (the consumer enforces); producer only sets `iat = now`.

### 7.9 Stream Verification Event

Current problem:

- Operators cannot verify a new subscription decodes SETs correctly.

Target behavior:

- `POST /api/auth/ssf/streams/:id/verify` enqueues a synthetic event with type URI `https://schemas.openid.net/secevent/ssf/event-type/verification` (the SSF verification event URI), `state` set to a random nonce, and waits for the subscriber to acknowledge via 2xx within the standard delivery flow.

The verification event URI is the canonical SSF identifier; do not substitute any SCIM `urn:ietf:params:SCIM:event:*` URI here — those belong to RFC 7644 / SCIM Events and are out of scope per [013 D8](013_identity-event-standards-and-decisions.md#58-d8--scim-is-not-adopted).

Implementation tasks:

- [ ] Add the verification event type to the Phase 1 allowlist for emission.
- [ ] Implement `POST /ssf/streams/:id/verify` that records a verification token and emits an outbox row with the verification event URI; subscriber acknowledgement is implicit in 2xx response.
- [ ] Operator can read the most recent verification result via `GET /ssf/streams/:id/status`.

Tests:

- Integration test: verify → consumer 2xx → status reports `last_verified_at` populated.

## 8. Extending The Producer With CAEP (Phase 2)

This section is **not** first-release work. It is documented here so the eventual addition is a small, well-scoped change rather than a new design.

Conditions to start (per [013 D4](013_identity-event-standards-and-decisions.md#54-d4--caep-adoption-is-gated-on-the-m2m-decision)):

- A recorded requirement names sub-expiry revocation for some category of tokens, **or**
- Operational evidence after Phase 1 ships shows audit-only is insufficient.

Scope of the Phase 2 extension:

1. **New event-type URIs in the allowlist**:
   - `https://schemas.openid.net/secevent/caep/event-type/session-revoked`
   - `https://schemas.openid.net/secevent/caep/event-type/credential-change` only for an actual client-secret revocation
   - Repo-specific: `https://id.<host>/secevent/event-type/organization-member-removed`
   - Repo-specific: `https://id.<host>/secevent/event-type/team-member-removed`
   - Repo-specific: `https://id.<host>/secevent/event-type/oauth-client-disabled`
   - Repo-specific: `https://id.<host>/secevent/event-type/team-deleted`
   - Repo-specific: `https://id.<host>/secevent/event-type/oauth-client-grant-disabled`

2. **Additional capture points**:
   - `organizationHooks.member.beforeRemove` -> repo-specific `organization-member-removed`, because the mutation identifies a membership relationship rather than one already-issued token.
   - `organizationHooks.teamMember.beforeRemove` -> repo-specific `team-member-removed`, for the same reason.
   - own-the-mutation user-session revoke endpoint -> CAEP `session-revoked`; do not emit deprecated RISC `sessions-revoked`.
   - `organizationHooks.team.beforeDelete` → repo-specific `team-deleted`.
   - `idOAuthScopeCatalog` disable-client -> repo-specific `oauth-client-disabled`; if a separate operation revokes a secret, it may emit CAEP `credential-change` with mutually-supported `credential_type: client_secret`, `change_type: revoke`.
   - `idOAuthScopeCatalog` disable-grant -> repo-specific `oauth-client-grant-disabled` with `sub_id` carrying `client_id` + `organization_id` + `resource`.

3. **CAEP event timing**:
   - `event_timestamp` is required in each CAEP event payload and is derived from the state-change time recorded in the outbox.
   - The producer does not emit a CAEP `tokens_issued_before` claim; CAEP Final defines no such claim. When Phase 3 enforcement is enabled, the consumer derives its local `tokens_issued_before` fence value from `event_timestamp` (doc 016).
   - Approved repository-specific events carry the source state-change time through SET `toe`; Phase 3 derives its local fence cutoff from `toe` for those events.
   - `token-claims-change` is not emitted for relationship changes in this plan: CAEP requires its Subject Identifier to identify the affected token, and `id` does not maintain an affected-issued-token inventory. If such tracking is added later, each token-targeted event must carry complete new claim state rather than a delta.

4. **No changes** to SET envelope, transport, retry, DLQ, or stream-config endpoints. The infrastructure built in §7.1 through §7.9 is reused.

Estimated work: ~1-3 days once Phase 1 has shipped and stabilized.

## 9. Migration And Rollout

- Plugin tables ship in a single migration generated by `pnpm db:migration:new add_identity_events_plugin_tables`. The migration is additive — no existing table is altered. New tables: `identityEventSubscription` (with HMAC columns), `identityEventOutbox`, `identityEventDelivery`, `setSigningKey`.
- Cloudflare Queues, Queue bindings, and the DLQ are added to [workers/core/wrangler.jsonc](workers/core/wrangler.jsonc) and provisioned via `wrangler queues create id-identity-events` and `wrangler queues create id-identity-events-dlq`. Provisioning runbook entries are added to [docs/007_cloudflare-deployment-runbooks.md](docs/007_cloudflare-deployment-runbooks.md).
- Cron trigger added to wrangler config: `"crons": ["*/10 * * * *"]` — sweeper only, every 10 minutes (decision §5.7). The fast path is the immediate `QUEUE.send` from the own-the-mutation endpoints.
- The Phase 1 own-the-mutation endpoints in §7.3 supplant the equivalent BA admin endpoints (`banUser`, `removeUser`, `unbanUser`). The `revokeUserSessions` replacement is introduced only with the Phase 2 CAEP `session-revoked` event. Document each supplant when its phase ships and update internal tooling that calls that BA endpoint directly.
- Bootstrap the SET-signing keystore on first boot: generate an initial RS256 keypair, insert as `status = 'active'`, expose at `/api/auth/ssf/jwks`. Rotation policy mirrors the OAuth JWKS (configurable per [workers/core/src/auth/config.ts](workers/core/src/auth/config.ts)).
- Deployment order: D1 migration → wrangler deploy core (with queues + new env vars) → bootstrap SET-signing key → operator creates first subscription via `POST /api/auth/ssf/streams` and records the returned HMAC secret in the subscriber configuration.
- Rollback: feature flag `IDENTITY_EVENTS_ENABLED` (env var) gates the outbox writer **and** the own-the-mutation endpoints' dispatch step. With the flag off:
  - The own-the-mutation endpoints still execute the source mutation (so admin UI continues to work) but skip the outbox insert and queue send.
  - This degrades to "no events emitted." It does **not** revert to BA's original admin endpoints (those are supplanted).
  - Setting the flag back on resumes emission from the next mutation forward; past mutations during the off period are not retroactively emitted.
- A new resource API subscriber needs (a) a `resourceServer` row already, (b) one `identityEventSubscription` row created by an operator (which returns the HMAC secret exactly once), (c) the HMAC secret persisted in the subscriber's configuration, and (d) the subscriber's receiver endpoint live before the verification event fires.

### 9.1 Outbox Archival (Follow-Up)

The `identityEventOutbox` and `identityEventDelivery` tables grow monotonically without intervention. Plan an archival policy before the table reaches D1 row-count limits:

- Move outbox rows with `status = 'delivered'` (or `failed` after operator review) older than N days (default 90) to `identityEventOutboxArchive`.
- Keep deliveries linked to archived outbox rows for the same retention window.
- Document the cutover in the runbook. This is not Phase 1 blocking; track as a follow-up task once production traffic is observed.

## 10. Edge Cases And Failure Modes

| Scenario | Expected handling |
|---|---|
| Own-the-mutation D1 batch fails on either statement | Both statements roll back atomically (D1 batch semantics). Operator sees a normal mutation failure; no event is published. Acceptable. |
| D1 batch commits but `QUEUE.send` fails or the Worker dies between commit and send | Outbox row remains `pending`. The §7.7 sweeper picks it up on its next run (worst case ~10 min) and re-enqueues. No event loss; latency bounded by sweeper cadence for this rare path. |
| Best-effort `databaseHooks` capture (§7.3a) for identifier change loses the outbox write | Source mutation still commits in BA. Event is missing. Acceptable for audit-only events; Phase 3 fence enforcement does not depend on these. Reconciliation in `content-api` is the recovery surface. |
| Outbox row commits but the delivery consumer is down | Row marked `queued`; Queue retains the dispatch message per CF Queues retention. When the consumer restarts, the message is delivered. No event loss. |
| Subscriber URL returns 5xx for a long outage | Queue retries with backoff. After max retries (default 6 attempts over ~6 hours), routed to DLQ. Operator visible via `/streams/:id/deliveries?status=failed`. |
| Subscriber URL returns 401 with HMAC mismatch | Producer retries once after re-reading the current HMAC secret (covers mid-rotation race). On second 401, DLQ. Operator alert. |
| Subscriber URL returns 403 (subscriber actively rejecting authenticated POST) | Treated as permanent. DLQ immediately. Operator alert. |
| Subscriber URL returns 410 Gone | Permanent failure. Skip retries, DLQ immediately. Subscription remains enabled until an operator disables it. |
| Operator rotates HMAC secret while delivery is in flight | Producer always uses `subscription.hmacSecretCurrent`. Subscriber accepts current OR previous (within overlap window). No event loss provided overlap window > queue retry window. Default 1 hour overlap is well above the default 6-hour retry ceiling? — operationally, the longer overlap (e.g., 12 hours) is recommended for environments with slow subscribers. Configurable in the rotation request body. |
| SET-signing key rotates while a SET is in the Queue | The SET was built with the old `kid`. Subscriber JWKS lookup against `/api/auth/ssf/jwks` must still resolve that `kid`, which it does because the SET-signing keystore mirrors the OAuth JWKS grace policy (retired keys remain published for `jwksGracePeriodSeconds`). Note: subscribers must point `ID_SET_JWKS_URL` at `/api/auth/ssf/jwks`, **not** `/api/auth/jwks` — those are now separate keysets (§5.6). |
| Subscription disabled mid-delivery | Currently in-flight Queue messages still attempt delivery. If subscriber accepts, the delivery is logged. If subscriber rejects (or has been torn down), DLQ. Operator visibility prevails. |
| Operator deletes a subscription while outbox has pending rows for it | Pending rows for that subscription are silently dropped at drainer time (subscription lookup returns no matches). Outbox row marked `queued` with no deliveries scheduled. Acceptable; alternative would be a synthetic 'subscription deleted' delivery row, which is reporting noise. |
| Two events for the same logical change emitted twice | Outbox primary key is `id` (=`jti`); subscriber idempotency on `jti` deduplicates. Document the contract: subscribers MUST treat `jti` as the dedup key. |
| Event ordering across resource subjects | Best-effort by `occurredAt`. Subscribers MUST tolerate out-of-order delivery (doc 015 §10). Cross-subject ordering is not guaranteed. |
| Repo-specific URI used for an event that has a RISC/CAEP equivalent | Lint/code-review rule. The `eventTypes` allowlist in `types.ts` lists every approved URI; any new addition requires updating [013 §7](013_identity-event-standards-and-decisions.md#7-event-vocabulary-mapping) and this doc together. |
| Subscriber sends back its own webhook to `id` (loop) | Producer does not consume external events. The producer is push-only on the egress side; ingress is admin-only stream config. |

## 11. Test And Verification Plan

Required automated checks in [workers/core/tests/auth/](workers/core/tests/auth/):

- `identity-events/plugin-schema.test.ts` — schema generation produces expected tables; migration applies cleanly.
- `identity-events/d1-batch-atomicity.test.ts` — own-the-mutation endpoint: force SQL error on outbox insert; assert source row unchanged.
- `identity-events/user-disable-emits-account-disabled.test.ts` — own-the-mutation disable emits RISC `account-disabled` atomically with the user-table update.
- `identity-events/user-delete-emits-account-purged.test.ts`.
- `identity-events/identifier-change-best-effort.test.ts` — `databaseHooks.user.update.after` emits `identifier-changed` with `source_mutation` prefix `best-effort:`.
- `identity-events/set-envelope-jws.test.ts` — built SET verifies against `/api/auth/ssf/jwks` (separate keyset).
- `identity-events/set-jwks-separate-from-oauth.test.ts` — `/api/auth/jwks` and `/api/auth/ssf/jwks` have disjoint `kid` sets.
- `identity-events/stream-admin-rbac.test.ts` — operator vs non-operator.
- `identity-events/hmac-rotation.test.ts` — rotate generates new secret, overlap window honors both, post-expiry rejects previous.
- `identity-events/dispatch-fanout-once-per-match.test.ts` — one outbox row × N subscriptions → N queue messages.
- `identity-events/sweeper-picks-up-orphan.test.ts` — mark a row pending older than threshold; sweeper re-enqueues.
- `identity-events/delivery-hmac-header-set.test.ts` — delivery POST includes `id-event-hmac` computed correctly.
- `identity-events/delivery-retry.test.ts` — 5xx → retry → success.
- `identity-events/delivery-dlq.test.ts` — repeated 5xx → DLQ.
- `identity-events/verify-event.test.ts`.

Commands:

- `pnpm lint`
- `pnpm check:dup`
- `pnpm typecheck`
- `pnpm test`
- `pnpm check`
- `pnpm advise` (post-substantial-change)

Manual verification:

- Local: register a `localhost` subscriber, disable a test user, observe the SET delivered with correct envelope and signature.
- Remote (after deploy): operator runs `pnpm auth:api POST /api/auth/ssf/streams` with a real subscriber URL, triggers a test verify event, inspects status endpoint.

## 12. Definition Of Done

Phase 1 producer is done when:

- All implementation tasks in §7.1-7.9 (including §7.3a) are complete and tested.
- `pnpm check` is green with the plugin enabled.
- The plugin appears in [docs/003_future-implementation.md §1](003_future-implementation.md#1-plugin-architecture-strategy) plugin registry under `idIdentityEvents`.
- [README.md](../README.md) mentions the producer in the Contracts section.
- [docs/007_cloudflare-deployment-runbooks.md](docs/007_cloudflare-deployment-runbooks.md) records: Queue + DLQ provisioning, SET-signing keystore bootstrap, HMAC rotation workflow, sweeper alarm thresholds.
- The SET-signing keyset is published at `/api/auth/ssf/jwks` and is disjoint from `/api/auth/jwks` (verified by automated test).
- A real remote subscription has been provisioned end-to-end (HMAC secret recorded by the subscriber), a verification event has been observed delivered, and one negative-identity event (a synthetic test user disable through the own-the-mutation endpoint) has been observed delivered.
- HMAC rotation has been exercised once in staging with the overlap window honoring both secrets.
- Operator can answer "what was delivered, what failed, what's stuck" by querying the SSF stream status endpoints.

Phase 2 (CAEP extension) is done when:

- The §8 event-type URIs are emitted from the listed capture points behind feature flag `IDENTITY_EVENTS_CAEP_ENABLED`.
- Tests cover each new event URI.
- [013 §7](013_identity-event-standards-and-decisions.md#7-event-vocabulary-mapping) and this doc are amended together if any new URI is added.

## 13. Final Model

```text
id producer (Phase 1)
────────────────────
workers/core/src/auth/plugins/identity-events/
  schema.ts            → identityEventSubscription (w/ HMAC cols), identityEventOutbox,
                         identityEventDelivery, setSigningKey
  types.ts             → event-type URI allowlist (RISC for Phase 1)
  outbox.ts            → buildOutboxInsertStatement(...) for D1 batch composition
  set-jwks.ts          → SET-signing keystore + /api/auth/ssf/jwks handler  (decision §5.6)
  set-envelope.ts      → JWS SET builder (RFC 8417, RS256, signed via setSigningKey)
  hmac.ts              → HMAC secret gen + rotation helpers                  (decision §5.8)
  index.ts             → BA plugin export
                         + /api/auth/ssf/streams (+ rotate-hmac) endpoints
                         + own-the-mutation endpoints (banUser/delete/etc)   (decision §5.1)
  operations.ts        → BA adapter CRUD for subscriptions and deliveries
  publisher.ts         → composed facade
  delivery.ts          → Queue producer, HTTP delivery consumer (HMAC + JWS), retry/DLQ
  sweeper.ts           → low-frequency cron handler for orphan pending rows  (decision §5.7)

workers/core/src/auth/get-auth.ts
  → registers idIdentityEvents alongside existing plugins
  → wires databaseHooks.user.update.after for best-effort identifier-change capture
  → no longer the source of fence-eligible events (those flow through own-the-mutation endpoints)

workers/core/wrangler.jsonc
  → adds queue + DLQ bindings
  → adds 10-minute cron (sweeper only — not the primary drain)
  → adds IDENTITY_EVENTS_ENABLED env var

fast path (decision §5.1 + §5.7):
  own-the-mutation endpoint
    → env.DB.batch([sourceMutation, outboxInsert])   ← atomic
    → env.QUEUE.send({ outboxId })                   ← immediate dispatch
    → cache invalidation + response

queue consumer (delivery):
  for each (outboxId, subscriptionId):
    build SET via set-envelope.ts (signed by set-jwks keystore)
    POST to subscription.destinationUrl
      headers: id-event-id, id-event-signed-at, id-event-key-id,
               id-event-subscription, id-event-hmac
      body:    JWS-signed SET (application/secevent+jwt)
    on 2xx → identityEventDelivery success row
    on 5xx → retry with backoff
    on permanent failure (410/403 or exhausted) → DLQ

slow path (rare; recovery only):
  sweeper cron (every 10 min)
    → SELECT pending rows older than 60s
    → re-fan out to matching subscriptions, re-queue
```

The producer is generic, plugin-owned, and standards-aligned (SET + SSF + RISC). It does not know about `content-api`-specific logic. Phase 2 is purely additive: more event URIs, no architectural change. Phase 3 changes nothing in the producer.
