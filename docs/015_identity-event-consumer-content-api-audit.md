# Identity Event Consumer In `content-api` — Audit Mode

> Status: implementation-grade plan
>
> Date: 2026-05-25
>
> Scope:
>
> - `/home/quanghuy1242/pjs/content-api` — consumer side, audit-only behavior (no authorization change)
>
> Source docs:
>
> - [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) — decisions D3 (adopt SSF+SET+RISC), D4 (CAEP gated), D5 (fence gated). "SSF" is the final Shared Signals Framework name; it is **not** HTML5 Server-Sent Events. See [013 §4.4](013_identity-event-standards-and-decisions.md#44-terminology-note-ssf-not-sse).
> - [014_identity-event-producer-id.md](014_identity-event-producer-id.md) — producer wire format and stream-config endpoints this consumer registers against
> - `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` — current two-channel contract (JWT + write-time principal-validation)
> - `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts`
> - `/home/quanghuy1242/pjs/content-api/src/domain/iam/content-policy.ts`
> - `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts`
> - `/home/quanghuy1242/pjs/content-api/src/infrastructure/db/schema.ts`
>
> Standards references:
>
> - RFC 8417 — Security Event Token (SET)
> - OpenID Shared Signals Framework 1.0 Final, <https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html>
> - OpenID RISC Profile 1.0 Final, <https://openid.net/specs/openid-risc-1_0-final.html>
> - OpenID CAEP Specification 1.0 Final — Phase 2 audit additions, <https://openid.net/specs/openid-caep-1_0-final.html>
>
> Related docs:
>
> - [016_identity-event-consumer-content-api-fence-enforcement.md](016_identity-event-consumer-content-api-fence-enforcement.md) — Phase 3 enforcement, conditional
> - [017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md) - synchronous SCIM directory and M2M principal contract proposal

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Existing Identity Channels](#31-existing-identity-channels)
  - [3.2 Existing Storage And Policy](#32-existing-storage-and-policy)
- [4. Target Model](#4-target-model)
  - [4.1 Third Identity Channel: Audit Subscriber](#41-third-identity-channel-audit-subscriber)
  - [4.2 What Audit Mode Does And Does Not Change](#42-what-audit-mode-does-and-does-not-change)
  - [4.3 New Storage](#43-new-storage)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Receiver Endpoint Path](#51-receiver-endpoint-path)
  - [5.2 Idempotency Key Is `jti`, Not Source-Mutation ID](#52-idempotency-key-is-jti-not-source-mutation-id)
  - [5.3 Direct-Share Bindings Survive Org Membership Removal](#53-direct-share-bindings-survive-org-membership-removal)
  - [5.4 Audit Mode Does Not Auto-Delete Bindings](#54-audit-mode-does-not-auto-delete-bindings)
  - [5.5 Stream Status Polling Is Operator-Triggered, Not Continuous](#55-stream-status-polling-is-operator-triggered-not-continuous)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
  - [7.1 Receiver Endpoint](#71-receiver-endpoint)
  - [7.2 SET Verification](#72-set-verification)
  - [7.3 Idempotency Store](#73-idempotency-store)
  - [7.4 Event Dispatcher](#74-event-dispatcher)
  - [7.5 RISC Event Handlers (Phase 1)](#75-risc-event-handlers-phase-1)
  - [7.6 Reconciliation Findings Storage](#76-reconciliation-findings-storage)
  - [7.7 Operator Read API](#77-operator-read-api)
  - [7.8 Skill Documentation Update](#78-skill-documentation-update)
- [8. Extending The Consumer With CAEP Audit (Phase 2)](#8-extending-the-consumer-with-caep-audit-phase-2)
- [9. Migration And Rollout](#9-migration-and-rollout)
- [10. Edge Cases And Failure Modes](#10-edge-cases-and-failure-modes)
- [11. Test And Verification Plan](#11-test-and-verification-plan)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 1. Goal

Add a third, audit-only identity channel to `content-api` so that lifecycle changes originating in `id` are observed, recorded, and surfaced to operators — without altering any token-acceptance or policy-evaluation behavior.

Outcomes for Phase 1:

- `content-api` exposes a SET receiver endpoint that verifies signatures using `id`'s JWKS, deduplicates by `jti`, and dispatches RISC events to handlers.
- Each Phase 1 RISC event produces a structured **reconciliation finding** (an audit record) without modifying any policy binding or denial row.
- Operators can list pending findings, mark them resolved, and see which bindings reference identity principals that `id` has reported disabled, purged, or otherwise changed.
- The existing two-channel contract (JWT claims + current write-time `principal-validation`) is preserved unchanged for this audit phase. This adds a third channel as additive audit, not as a substitute. [017](017_scim-directory-and-m2m-principal-contract.md) separately proposes replacing user/team/admin principal-validation with read-only SCIM.

Non-goals for this doc:

- Token denial logic, fence tables, or any change to `AuthenticateBearerTokenUseCase.Actor`. Those belong to doc 016.
- Auto-deletion of policy bindings in response to events.
- CAEP enforcement of any kind.

## 2. System Summary

```text
id (producer, doc 014)
   │
   ▼ POST /webhooks/id-events  (SET as application/secevent+jwt)
       headers include: id-event-id, id-event-signed-at, id-event-key-id,
                        id-event-hmac (= HMAC-SHA256(body, subscription.hmac_secret))
content-api receiver
   │   1. verify HMAC header against locally-stored subscription secret
   │        (cheap reject path; defends the expensive JWS verify from spoofed POSTs)
   │   2. parse JWS, verify signature against id SET-signing JWKS (separate from id's
   │        OAuth ID-token JWKS — see [014 §4.3](014_identity-event-producer-id.md#43-set-envelope-construction-and-signing-keyset))
   │   3. verify iss, aud, iat replay window, required sub_id and typ,
   │        absent top-level sub/exp, and producer single-event contract
   │   4. enforce idempotency on jti
   │   5. dispatch event to typed handler
   │   6. handler writes reconciliation finding(s)
   │   7. respond 2xx (durable processing committed)
   ▼
identityEventReceipts table       ← idempotency + audit trail
identityReferenceFindings table   ← orphan / disabled / changed-principal records
identityEventProducerSecrets table ← producer subscription identifier + HMAC secret(s)
                                     (managed by operator; supports overlap rotation)

operator view (read-only API)
   GET /admin/internal/id-events/findings?status=open
   POST /admin/internal/id-events/findings/:id/resolve  (operator workflow)
   POST /admin/internal/id-events/producer-secrets/rotate  (HMAC secret rotation)
```

The receiver is on the same Worker that already serves `content-api`'s public routes. Producer authentication is **two-layer**: (1) a shared-secret HMAC header verified *before* any expensive crypto, and (2) the JWS-signed SET envelope. The HMAC step is defense-in-depth against unauthenticated spam; it does not replace JWS as the integrity gate, but it makes the receiver cheap to defend.

## 3. Current-State Findings

### 3.1 Existing Identity Channels

The `content-iam-usage` skill at `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/` documents two channels and only two:

1. **Request JWT** — verified by [src/application/auth/authenticate-bearer-token.usecase.ts](../../content-api/src/application/auth/authenticate-bearer-token.usecase.ts). Issuer, audience, JWKS, scopes, projection of `sub`, `org_id`, `team_ids`, `azp`, `client_id` into `Actor`.
2. **Synchronous principal validation** — [src/infrastructure/identity/id-content-principal-directory.ts](../../content-api/src/infrastructure/identity/id-content-principal-directory.ts) currently calls `id`'s `/api/auth/principal-validation/**` endpoints during durable IAM writes. [017](017_scim-directory-and-m2m-principal-contract.md) proposes replacing the user/team/admin subset with read-only SCIM.

The skill explicitly states there is no webhook and that the 15-minute token lifetime is the acceptable staleness window. Phase 1 adds a third channel that does not alter either contract.

### 3.2 Existing Storage And Policy

[src/infrastructure/db/schema.ts](../../content-api/src/infrastructure/db/schema.ts) defines tables for users (mirror of `id.sub` only, sparse), content roles, policy bindings, policy denials, policy events, and IAM administration audit. There is no inbound identity-event or invalidation table.

[src/domain/iam/content-policy.ts](../../content-api/src/domain/iam/content-policy.ts) implements local `ContentPolicy.can()` evaluation. It does not consult any identity-event state today and must not in Phase 1.

[src/domain/iam/policy-binding.entity.ts](../../content-api/src/domain/iam/policy-binding.entity.ts) records bindings that carry `principalType` ∈ `{user, team, service-account}` and `principalId` referencing an `id`-owned value. These are the rows the Phase 1 finding storage references.

## 4. Target Model

### 4.1 Third Identity Channel: Audit Subscriber

Channel #3 is: **receive RISC events for accounts and identifiers referenced by local policy state, record them for operator visibility, take no automatic action.**

The receiver lives at `POST /webhooks/id-events`. It accepts SETs from one or more registered `id` subscriptions. Subject lookup uses the existing principal references in `policy-binding` and `policy-denial` rows; finding rows link `event_id → binding_id*` for operator workflows.

### 4.2 What Audit Mode Does And Does Not Change

| Behavior | Today | Phase 1 audit |
|---|---|---|
| JWT verification, claim projection | unchanged | unchanged |
| Write-time `principal-validation` calls on IAM writes | unchanged | unchanged in this audit phase; target replacement tracked in doc 017 |
| `ContentPolicy.can()` decision path | unchanged | unchanged |
| Policy binding creation / deletion | manual via IAM workflows | unchanged — no auto-modify |
| `Actor.iat` field | not present | not present (added in doc 016 only) |
| New: SET receiver endpoint | n/a | added |
| New: receipt/idempotency table | n/a | added |
| New: reconciliation findings table | n/a | added |
| New: operator read endpoints | n/a | added |
| Direct-share user binding survives org-member-removed event | n/a | yes — finding only flags the *workspace-derived* authority, not the direct-share binding |

### 4.3 New Storage

```ts
// src/infrastructure/db/schema.ts (new tables sketch — Drizzle style; the
// snippets below use BA-plugin-shape only to keep this doc consistent with
// docs 013-014. Translate field types when persisting to content-api's raw
// Drizzle layer: text() for string, integer({ mode: "timestamp_ms" }) for
// date, integer() for numeric epoch seconds.)

export const identityEventProducerSecrets = {
  // one row per producer subscription; supports overlap during rotation
  id: { type: "string", required: true, primaryKey: true },
  producerSubscriptionId: { type: "string", required: true }, // matches id's identityEventSubscription.id
  hmacSecretCurrent: { type: "string", required: true }, // base64-encoded secret bytes
  hmacSecretPrevious: { type: "string" }, // honored during rotation overlap window
  previousSecretExpiresAt: { type: "date" },
  rotatedAt: { type: "date", required: true },
  createdAt: { type: "date", required: true },
};

export const identityEventReceipts = {
  // primary key, equal to SET jti
  eventId: { type: "string", required: true, primaryKey: true },
  eventTypeUri: { type: "string", required: true },
  subjectIdentifierFormat: { type: "string", required: true },
  subjectIdentifierJson: { type: "string", required: true }, // SSF sub_id
  occurredAt: { type: "date", required: true },
  receivedAt: { type: "date", required: true },
  signedIat: { type: "date", required: true },
  signedKid: { type: "string", required: true },
  rawPayloadJson: { type: "string", required: true },
};

export const identityReferenceFindings = {
  id: { type: "string", required: true, primaryKey: true },
  eventId: { type: "string", required: true, references: "identityEventReceipts.eventId" },
  findingType: { type: "string", required: true },
  // findingType is one of:
  //   "user-disabled-with-bindings"
  //   "user-purged-with-bindings"
  //   "identifier-changed"
  //   "session-revoked" (informational only, Phase 2 CAEP)
  //   "team-deleted-with-bindings"  (Phase 2)
  //   "service-account-credential-revoked" (Phase 2 CAEP)
  //   "service-account-disabled" (Phase 2 repo extension)
  principalType: { type: "string", required: true }, // user | team | service-account
  principalId: { type: "string", required: true },
  organizationId: { type: "string" }, // nullable
  affectedBindingCount: { type: "number", required: true },
  status: { type: "string", required: true }, // open | resolved | ignored
  notes: { type: "string" },
  createdAt: { type: "date", required: true },
  resolvedAt: { type: "date" },
  resolvedBy: { type: "string" },
};
```

Findings are write-once-on-event; updates only flip `status` from `open` to `resolved` or `ignored` with operator attribution.

## 5. Architecture Decisions

### 5.1 Receiver Endpoint Path

**Recommended**: `POST /webhooks/id-events`.

**Rejected**: `POST /internal/id-events`. The endpoint is reachable from outside the Worker boundary (the producer calls it from `id`), so `/internal/*` is misleading. `/webhooks/*` is the accepted prefix for ingress webhook endpoints.

**Rejected**: putting it under `/api/v1/*`. The endpoint is not part of the product API contract; it's an infrastructural ingress for identity events. A dedicated `/webhooks/` prefix keeps it distinct from product surfaces and from the existing `/api/` namespace.

### 5.2 Idempotency Key Is `jti`, Not Source-Mutation ID

**Recommended**: dedupe on `SET.jti`, which equals the producer outbox row primary key.

**Rejected**: dedupe on `sub_id + event_type + iat`. This conflates separate events that happened to share a Subject Identifier and timestamp.

**Reasoning**: RFC 8417 mandates `jti` uniqueness, and the producer guarantees `jti = outbox.id` (doc 014 §4.3). Consumers should rely on the standard.

### 5.3 Direct-Share Bindings Survive Org Membership Removal

**Recommended**: when a Phase 2 repo-specific `organization-member-removed` or `team-member-removed` event removes a user's derived authority, the audit finding flags only the **workspace-derived** or team-derived authority for that user. Any `policy-binding` row that names the user as a direct-share principal remains valid and is not flagged.

**Reasoning**: per [docs/010_organization-teams-oauth-flow.md](../docs/010_organization-teams-oauth-flow.md) and the `content-iam-usage` skill, a direct-share binding is a separate, intentional grant by the resource owner. Removing the user from the organization does not revoke that grant. Conflating them would produce false-positive findings and risk operator-driven binding deletion that contradicts product intent.

**Phase 1 scope**: this rule is *not* exercised by Phase 1 handlers. RISC `account-disabled` / `account-purged` flag all bindings unconditionally because the *account itself* is the subject — there is no separate "workspace-derived vs. direct-share" question to ask when the user no longer exists. The rule is recorded here once so that the Phase 2 relationship-event handlers in §8 inherit it without duplicating the design discussion.

### 5.4 Audit Mode Does Not Auto-Delete Bindings

**Recommended**: events produce findings; findings are operator-actionable; no automated DELETE/UPDATE on `policy-binding` or `policy-denial` rows.

**Rejected**: auto-tombstoning bindings on `account-purged`. Even when an account is hard-deleted in `id`, the local product audit trail benefits from retaining historical bindings (who had access before). Auto-deletion also creates an ordering hazard if the producer delivers `account-purged` before a write that the resource still considers valid.

### 5.5 Stream Status Polling Is Operator-Triggered, Not Continuous

**Recommended**: Phase 1 has no continuous polling of `id`'s `/api/auth/ssf/streams/:id/status`. Operators query it on demand via runbook.

**Rejected**: scheduled polling that pulls delivery stats into a local dashboard. This duplicates state and adds infrastructure complexity. The producer already has the data; operators read it there when needed.

## 6. Implementation Strategy

1. **Schema + migration** — create the two tables.
2. **Receiver scaffolding** — minimal `POST /webhooks/id-events` route that returns 501 Not Implemented.
3. **SET verification** — JWS verify against `id` JWKS using `jose`.
4. **Idempotency store** — `INSERT … ON CONFLICT (eventId) DO NOTHING` semantics; if conflict, return 2xx (idempotent replay).
5. **Event dispatcher** — typed event-URI → handler map; unrecognized URIs return 2xx and log (allow forward compatibility with new producer events).
6. **RISC handlers** — one per Phase 1 event URI.
7. **Operator read endpoints** — list/resolve findings.
8. **Skill documentation update** — extend `content-iam-usage` to document Channel #3 and the new orphan-binding behavior.
9. **Wire up the producer subscription** — operator-side runbook step in `id`, creates the subscription pointing at `content-api`'s receiver URL.

Steps 1-8 are all in `content-api`. Step 9 happens in `id` operations and is documented in [014 §12](014_identity-event-producer-id.md#12-definition-of-done).

## 7. Detailed Implementation Plan

### 7.1 Receiver Endpoint

Current problem:

- No endpoint accepts SETs.

Target behavior:

- `POST /webhooks/id-events` accepts `Content-Type: application/secevent+jwt` (RFC 8417 §2.3) and returns:
  - `2xx` once the event is durably processed (receipt committed),
  - `2xx` immediately if `jti` is a known duplicate (idempotent replay),
  - `401` if the HMAC pre-check fails (missing/invalid `id-event-hmac` header, or unrecognized `id-event-subscription`). Producer does not retry on `401`.
  - `4xx` for signature or audience verification failure,
  - `4xx` for malformed body or unknown signing key,
  - `5xx` for transient internal errors (the producer will retry).
- HMAC pre-check happens **before** JWS parse so an unauthenticated POST cannot force JWKS fetches or signature math.

Implementation tasks:

- [ ] Add route in `src/http/routes/webhooks.routes.ts` (new file) registered in `src/composition/create-app.ts`.
- [ ] Body parser: read raw text, parse as JWS compact string.
- [ ] Wire the route through to an `IngestIdentityEventUseCase` in `src/application/identity/ingest-identity-event.usecase.ts`.

Tests:

- Integration test: valid SET → 2xx, receipt row exists.
- Integration test: duplicate `jti` → 2xx, no second row.
- Integration test: bad signature → 4xx.
- Integration test: wrong audience → 4xx.

### 7.2 SET Verification

Current problem:

- `content-api` has JWKS verification for OAuth bearer tokens but not for SETs. The two reuse the same `id` JWKS.

Target behavior:

- Resolve the SET-signing JWKS from `ID_SET_JWKS_URL` (separate keyset from `ID_JWKS_URL` per [014 §4.3](014_identity-event-producer-id.md#43-set-envelope-construction-and-signing-keyset) — OAuth ID-token verification continues to use `ID_JWKS_URL` unchanged).
- Verify with `jose.jwtVerify(token, setJwks, { issuer: ID_ISSUER, audience: CONTENT_API_AUDIENCE, typ: 'secevent+jwt' })`.
- Reject if `iat` is more than `replayWindowSeconds` (default 300) older than wall-clock or in the future beyond a 30-second skew tolerance.
- Reject if `sub_id` is absent or malformed; reject if top-level JWT `sub` or `exp` is present, as required by SSF Final.
- Reject if `events` is not a single-key object because doc 014 deliberately constrains this producer to one event type per SET; RFC 8417 itself permits related multi-event SETs.
- Reject if `kid` not present in the SET JWKS.

HMAC pre-check (runs before JWS parse):

- Read the body as raw bytes.
- Compute `HMAC-SHA256(body, subscription.hmacSecretCurrent)` and compare in constant time against the `id-event-hmac` header. On mismatch, attempt the same comparison against `subscription.hmacSecretPrevious` (if `previousSecretExpiresAt > now`); on second mismatch, return 401.
- The HMAC step intentionally does *not* parse the JWS. Its job is to reject spoofed POSTs at near-zero cost so the JWKS fetch and signature math only run for authenticated callers.

Implementation tasks:

- [ ] Add `src/application/identity/verify-set.ts` with a pure verifier.
- [ ] Add a *new* `createRemoteJWKSet` instance bound to `ID_SET_JWKS_URL`. Do **not** reuse the bearer-token JWKS — they are separate keysets (decision B; see [014 §4.3](014_identity-event-producer-id.md#43-set-envelope-construction-and-signing-keyset)). The existing fetcher pattern in `src/infrastructure/auth/jwks-client.ts` can be re-instantiated; do not share the cache.
- [ ] Add a `replayWindowSeconds` env var (default 300) read in `src/composition/env.ts`.
- [ ] Add `src/application/identity/verify-hmac.ts` with a pure constant-time HMAC verifier supporting overlap rotation (current + previous secret).
- [ ] Add `src/infrastructure/persistence/identity-event-producer-secrets.repository.ts` with `findBySubscriptionId(producerSubscriptionId): Promise<ProducerSecret | null>` and a rotation use case.

Tests:

- Unit test: SET signed by current JWKS verifies.
- Unit test: SET signed by retired-but-still-published key verifies (JWKS grace period).
- Unit test: SET signed by unknown key rejected.
- Unit test: `iat` outside replay window rejected.
- Unit test: SET missing `sub_id`, or carrying prohibited top-level `sub` / `exp`, rejected.
- Unit test: multi-event SET rejected.

### 7.3 Idempotency Store

Current problem:

- No table; no deduplication path.

Target behavior:

- `identityEventReceipts` table per §4.3.
- Insert with `ON CONFLICT (eventId) DO NOTHING`.
- If `INSERT` affected 0 rows, treat as duplicate — return 2xx without invoking handlers.

Implementation tasks:

- [ ] Add `identityEventReceipts` to `src/infrastructure/db/schema.ts`.
- [ ] Generate migration.
- [ ] Add `src/infrastructure/persistence/identity-event-receipts.repository.ts` with `insertIfAbsent(receipt): Promise<{ inserted: boolean }>`.

Tests:

- Integration test: same `jti` inserted twice — second returns `inserted: false`.
- Integration test: row carries `signedIat`, `signedKid`, `rawPayloadJson`.

### 7.4 Event Dispatcher

Current problem:

- No code path maps event-type URI → handler.

Target behavior:

- A `Record<string, EventHandler>` keyed by URI. `EventHandler` signature:

```ts
type EventHandler = (input: {
  eventId: string;
  subjectIdentifier: SsfSubjectIdentifier;
  payload: Record<string, unknown>;
  occurredAt: Date;
  receivedAt: Date;
}, ctx: { db: DbClient }) => Promise<void>;
```

- Unknown URIs are logged at `info` and return 2xx (forward compatibility — if `id` publishes a new event the consumer hasn't been taught about yet, it should not block delivery).
- Handler errors propagate to the use case, which returns 5xx for retry.

Implementation tasks:

- [ ] Add `src/application/identity/event-dispatcher.ts` with the registry.
- [ ] Register Phase 1 handlers (§7.5).

Tests:

- Unit test: unknown URI → 2xx, log entry, no handler invoked.
- Unit test: handler throw → use case throws → route returns 5xx.

### 7.5 RISC Event Handlers (Phase 1)

Handlers required for Phase 1:

| Event URI | Handler behavior |
|---|---|
| `https://schemas.openid.net/secevent/risc/event-type/account-disabled` | Look up bindings/denials with `principalType = 'user'` AND `principalId = sub_id.id`. Insert one `identityReferenceFindings` row with `findingType = 'user-disabled-with-bindings'`, `affectedBindingCount = N`. If `N = 0`, do not insert a finding (the event is informational and no local state references the user). |
| `https://schemas.openid.net/secevent/risc/event-type/account-enabled` | Look up `open` findings of type `user-disabled-with-bindings` for this user. Auto-resolve them with `status = 'resolved'`, `notes = 'auto-resolved by account-enabled event'`. |
| `https://schemas.openid.net/secevent/risc/event-type/account-purged` | Same lookup as `account-disabled` but `findingType = 'user-purged-with-bindings'`. Findings are permanent (no auto-resolve on a future re-create — that would require a separate event type). |
| `https://schemas.openid.net/secevent/risc/event-type/identifier-changed` | Insert `findingType = 'identifier-changed'` with the old/new identifiers in `notes`. `affectedBindingCount` reflects bindings using the user's ID (unchanged by identifier rename, but operator should be aware). |

Phase 1 intentionally has no session-revocation handler. RISC Final deprecates `sessions-revoked`; the CAEP `session-revoked` informational handler belongs to Phase 2.

Implementation tasks:

- [ ] Add `src/application/identity/handlers/account-disabled.handler.ts` and one file per event type.
- [ ] Each handler is unit-tested in isolation.
- [ ] Handlers must not write to `policy-binding`, `policy-denial`, or `policy-event` tables. (Enforce by code review; consider an oxlint rule.)

Tests:

- Unit test per handler asserting the correct finding type and row population.
- Integration test asserting `account-disabled` for a user with 0 bindings does **not** insert a finding.
- Integration test asserting direct-share + workspace bindings both flagged in `account-disabled` (the account is gone, so both forms of access are stale).

### 7.6 Reconciliation Findings Storage

Current problem:

- No table; no operator visibility.

Target behavior:

- `identityReferenceFindings` table per §4.3.
- Insert path lives in handlers. Update path lives in operator endpoints (§7.7).

Implementation tasks:

- [ ] Add `identityReferenceFindings` to `src/infrastructure/db/schema.ts`.
- [ ] Generate migration.
- [ ] Add `src/infrastructure/persistence/identity-reference-findings.repository.ts`.

Tests:

- Integration test: insert via handler → read via repository.
- Integration test: `status` transitions via operator endpoint reflect in subsequent reads.

### 7.7 Operator Read API

Current problem:

- No way to list findings or mark them resolved.

Target behavior:

- `GET /admin/internal/id-events/findings?status=open` — paginated list, default page 50.
- `GET /admin/internal/id-events/findings/:id` — single finding with full payload.
- `POST /admin/internal/id-events/findings/:id/resolve` — body `{ resolution: 'resolved' | 'ignored', notes?: string }`. Records `resolvedBy = actor.sub`, `resolvedAt = now`.
- `GET /admin/internal/id-events/receipts/:eventId` — diagnostic endpoint to look up the original event payload from a `jti`.

Authorization:

- Reuse `requireActor(c)` and the existing IAM administration check from [src/domain/iam/content-administration.policy.ts](../../content-api/src/domain/iam/content-administration.policy.ts). Findings are an admin surface, not a tenant surface.

Implementation tasks:

- [ ] Add `src/http/routes/admin/id-events.routes.ts`.
- [ ] Add `src/application/identity/list-findings.usecase.ts` and `resolve-finding.usecase.ts`.
- [ ] Wire through the request-scoped container.

Tests:

- Integration test: operator lists open findings → marks one resolved → next list excludes it.
- Integration test: non-admin actor → 403.

### 7.8 Skill Documentation Update

Current problem:

- The `content-iam-usage` skill states there are exactly two identity channels and no webhook. Phase 1 changes that to three (non-authoritative webhook added).

Target behavior:

- Update `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/SKILL.md` and the references it includes to document Channel #3 as "audit-only identity event channel" and to retain the no-policy-change rule.
- Cross-link this doc and doc 013.

Implementation tasks:

- [ ] Update the skill's SKILL.md to describe the three-channel model.
- [ ] Add a reference page documenting `findingType` values and operator workflow.
- [ ] Do not change any statement about `ContentPolicy.can()` behavior.

Tests:

- Manual review of the skill content for accuracy.

## 8. Extending The Consumer With CAEP Audit (Phase 2)

This section is **not** first-release work. CAEP audit additions are scoped here so the eventual change is small.

Conditions to start: same as doc 014 §8 — gated on [013 D4](013_identity-event-standards-and-decisions.md#54-d4--caep-adoption-is-gated-on-the-m2m-decision).

Scope:

1. **Add handlers** for the Phase 2 event URIs to `event-dispatcher.ts`:
   - Repo-specific `organization-member-removed` / `team-member-removed` -> membership-removal findings. Flag only derived authority for the affected user and respect the direct-share-survives rule (§5.3). These are extensions because CAEP `token-claims-change` requires an identified affected token.
   - `credential-change` -> `findingType = 'service-account-credential-revoked'` only for an actual client-secret revocation (`change_type: revoke`). Flag bindings with `principalType = 'service-account'` AND `principalId = client_id`.
   - Repo-specific `oauth-client-disabled` -> `findingType = 'service-account-disabled'`. Flag bindings with `principalType = 'service-account'` AND `principalId = client_id`.
   - `session-revoked` → `findingType = 'session-revoked'`, informational only.
   - Repo-specific `team-deleted` → `findingType = 'team-deleted-with-bindings'`. Flag bindings with `principalType = 'team'` AND `principalId = team_id`.
   - Repo-specific `oauth-client-grant-disabled` → `findingType = 'oauth-grant-disabled'`. Flag bindings whose `client_id` + `organization_id` match the disabled grant.

2. **No new tables**. The existing `identityReferenceFindings` table accepts the new `findingType` values.

3. **No change** to `ContentPolicy.can()` — Phase 2 is still audit-only.

4. **Operator endpoint** updates to list the new finding types in `?findingType=...` filter.

Estimated work: ~1-2 days after the Phase 1 audit infrastructure is shipped.

## 9. Migration And Rollout

- The three new tables (`identityEventProducerSecrets`, `identityEventReceipts`, `identityReferenceFindings`) ship in a single Drizzle migration. content-api uses raw Drizzle in [src/infrastructure/db/schema.ts](../../content-api/src/infrastructure/db/schema.ts) — there is no `pnpm db:generate` step like the `id` repo has. Add the tables to the schema file and produce the migration via content-api's existing Drizzle migration workflow.
- New receiver route is purely additive; existing routes unchanged.
- New env vars in `content-api`:
  - `ID_ISSUER` — already present.
  - `ID_JWKS_URL` — already present (continues to verify OAuth bearer tokens).
  - `ID_SET_JWKS_URL` — new. Points at `id`'s SET-signing keyset, distinct from `ID_JWKS_URL` (decision B; [014 §4.3](014_identity-event-producer-id.md#43-set-envelope-construction-and-signing-keyset)).
  - `IDENTITY_EVENTS_REPLAY_WINDOW_SECONDS` — new, default 300.
  - `IDENTITY_EVENTS_ENABLED` — new, gates the receiver (rollback path).
- HMAC subscription secrets live in `identityEventProducerSecrets`, not env vars. Initial secret is provisioned via the operator rotation endpoint at deployment time, mirrored to `id`'s subscription record (doc 014).
- Deploy order:
  1. Deploy `content-api` with new schema migration and receiver disabled by env var.
  2. Operator in `id` creates the subscription pointing at the new `content-api` receiver URL.
  3. Operator triggers a verification event from `id`; subscriber returns 2xx.
  4. Operator flips `IDENTITY_EVENTS_ENABLED=true` and waits for the first real event.
- Rollback: set `IDENTITY_EVENTS_ENABLED=false`. The receiver returns 503; `id` queues events for retry until either the flag flips back or the operator disables the subscription on `id`'s side.

## 10. Edge Cases And Failure Modes

| Scenario | Expected handling |
|---|---|
| POST arrives without an `id-event-hmac` header, or HMAC mismatch | 401 before any JWS work. Producer does not retry on 401; operator alert. Cheap reject path — defense against unauthenticated spam. |
| HMAC matches `hmacSecretPrevious` but not `hmacSecretCurrent` | 2xx if otherwise valid (within rotation overlap window). Past `previousSecretExpiresAt`, only the current secret is honored. |
| SET arrives but `jti` is already in `identityEventReceipts` | 2xx, no handler runs, no new finding row. |
| SET signature invalid (wrong key, tampered payload) | 4xx, no receipt row. Producer does not retry on 4xx. |
| SET `iat` outside replay window | 4xx, no receipt row. Indicates clock skew or replay attempt; operator investigation. |
| SET `aud` is not `content-api`'s audience | 4xx. Misrouted by producer; alert. |
| Unknown event-type URI | 2xx, receipt row written, no finding row, info log. Forward-compatible. |
| Multi-event SET (more than one URI in `events`) | 4xx under the doc 014 producer contract. RFC 8417 permits related multi-event SETs, but this deployment intentionally emits and accepts one event type per SET. |
| Handler throws (e.g. DB connection lost mid-find-bindings) | 5xx, no receipt row committed, producer retries. |
| `account-disabled` event for a user with no local bindings or denials | 2xx, receipt row written, no finding row. The user existed in `id` but was never referenced locally. |
| `account-enabled` event arrives before `account-disabled` (out of order) | 2xx, receipt written, no `account-disabled` finding to auto-resolve. Acceptable — informational only. |
| `account-purged` arrives before bindings were created (very rare) | 2xx, receipt written, finding row with `affectedBindingCount = 0`. Operator sees the trail in case future investigation references the purged user ID. |
| Direct-share binding exists when `organization-member-removed` arrives (Phase 2) | Finding flags only workspace-derived authority (§5.3). Direct-share binding is not flagged. |
| Receiver is up, but the operator hasn't yet created the subscription in `id` | No events arrive. Local state has no inbound effect. Behavior is identical to today. |
| Receiver is down (e.g. deployment in progress) | Producer Queue retries with backoff (doc 014 §4.5). On the next successful POST, all queued events arrive in order (per-jti idempotency handles any double-send). |
| Producer publishes the same event to two subscriptions and `content-api` is one of them | `content-api` receives one SET with one `aud` value. The deduplication is by `jti`, which is the same across deliveries to different subscribers (one outbox row → many deliveries, each delivery is its own POST). |
| JWKS rotation invalidates the verifier cache mid-request | The verifier refreshes JWKS on `kid` miss. Retry succeeds with the next JWKS fetch. |
| Operator deletes a finding directly via DB | Allowed for cleanup; not exposed via API. Receipt row remains as audit trail. |

## 11. Test And Verification Plan

Required automated checks in `content-api`'s test suite:

- `src/application/identity/__tests__/verify-set.test.ts`
- `src/application/identity/__tests__/ingest-identity-event.usecase.test.ts`
- `src/application/identity/__tests__/event-dispatcher.test.ts`
- One handler test per Phase 1 event URI under `src/application/identity/handlers/__tests__/`.
- `src/http/routes/__tests__/webhooks-id-events.test.ts` — integration test through the route.
- `src/http/routes/admin/__tests__/id-events.routes.test.ts` — operator API.
- A test asserting the receiver does not modify `policy-binding`, `policy-denial`, or `policy-event` for any Phase 1 event. (Property-style: take a DB snapshot, run all Phase 1 events, assert those tables are byte-identical.)

Commands:

- `pnpm check` in `/home/quanghuy1242/pjs/content-api`.
- `pnpm advise` after substantial changes.

Manual verification:

- Local dual-stack: run `id` and `content-api` locally, register a localhost subscription via `id`'s admin API, disable a test user in `id`, observe a finding row in `content-api`.
- After remote deployment: operator runs the producer's verify event and inspects `GET /admin/internal/id-events/findings`.

## 12. Definition Of Done

Phase 1 audit consumer is done when:

- All §7.1-7.8 tasks complete and tested.
- `pnpm check` is green.
- A real production subscription has been provisioned in `id` and at least one verification event and one real lifecycle event have been observed end-to-end.
- Operator can list and resolve findings.
- The `content-iam-usage` skill is updated to document Channel #3 and the orphan-binding workflow.

Phase 2 audit consumer is done when:

- §8 handlers shipped behind feature flag `IDENTITY_EVENTS_CAEP_ENABLED`.
- Handler tests cover each new event URI.
- The direct-share-survives rule (§5.3) is exercised by tests for repo-specific organization/team membership-removal events.
- No change to `ContentPolicy.can()` — verified by the property-style test in §11.

## 13. Final Model

```text
content-api consumer (Phase 1 audit)
────────────────────────────────────
POST /webhooks/id-events
  ├── HMAC pre-check on id-event-hmac header (current + previous secret)  ← decision D
  ├── verify JWS against id SET JWKS (separate keyset from OAuth JWKS)    ← decision B
  ├── dedupe on jti
  ├── dispatch event-type-URI → handler
  │     ├── account-disabled    → flag bindings for user
  │     ├── account-enabled     → auto-resolve disabled findings
  │     ├── account-purged      → flag bindings for user (permanent)
  │     └── identifier-changed  → flag with old/new identifier
  ├── persist receipt
  └── return 2xx

src/infrastructure/db/schema.ts
  + identityEventProducerSecrets
  + identityEventReceipts
  + identityReferenceFindings

src/application/identity/
  ingest-identity-event.usecase.ts
  verify-set.ts
  event-dispatcher.ts
  handlers/
    account-disabled.handler.ts
    account-enabled.handler.ts
    account-purged.handler.ts
    identifier-changed.handler.ts
  list-findings.usecase.ts
  resolve-finding.usecase.ts

src/http/routes/
  webhooks.routes.ts                  ← POST /webhooks/id-events
  admin/id-events.routes.ts           ← operator read/resolve API

unchanged:
  authenticate-bearer-token.usecase.ts
  id-content-principal-directory.ts
  content-policy.ts
  policy-binding.entity.ts
  policy-denial.entity.ts
```

Channel #3 is added as additive audit. The existing two-channel contract is preserved. No token is denied; no binding is auto-modified. Operators get visibility, the system gains an audit trail, and the foundation for Phase 3 enforcement (doc 016) is in place without committing to it.
