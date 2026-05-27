# Identity Event Channel — Standards Landscape And Decisions

> Status: implementation-grade research and decision record
>
> Date: 2026-05-25
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — `id` identity provider, OAuth authorization server, and event producer
> - `/home/quanghuy1242/pjs/content-api` — reference resource API and first event consumer
>
> Source docs:
>
> - `a.md` — research posture for IdP-owned principal lifecycle synchronization
> - `docs/003_future-implementation.md`
> - `docs/005_oauth2-oidc-integration-guide.md`
> - `docs/006_resource-server-jwt-guide.md`
> - `docs/010_organization-teams-oauth-flow.md`
> - `docs/012_random_thoughts.md` — earlier draft superseded by docs 013-017 (its custom event vocabulary is rejected; its staging and standards-boundary discipline are retained)
>
> Standards references:
>
> - RFC 7009 — OAuth 2.0 Token Revocation, <https://www.rfc-editor.org/rfc/rfc7009.html>
> - RFC 7662 — OAuth 2.0 Token Introspection, <https://www.rfc-editor.org/rfc/rfc7662.html>
> - RFC 7644 — System for Cross-domain Identity Management (SCIM 2.0) Protocol, <https://www.rfc-editor.org/rfc/rfc7644.html>
> - RFC 8417 — Security Event Token (SET), <https://www.rfc-editor.org/rfc/rfc8417.html>
> - OpenID Shared Signals Framework 1.0 Final (SSF), <https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html>
> - OpenID RISC Profile 1.0 Final, <https://openid.net/specs/openid-risc-1_0-final.html>
> - OpenID CAEP Specification 1.0 Final, <https://openid.net/specs/openid-caep-1_0-final.html>
> - OpenID Connect Back-Channel Logout 1.0, <https://openid.net/specs/openid-connect-backchannel-1_0.html>
>
> Related docs:
>
> - [014_identity-event-producer-id.md](014_identity-event-producer-id.md)
> - [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md)
> - [016_identity-event-consumer-content-api-fence-enforcement.md](016_identity-event-consumer-content-api-fence-enforcement.md)
> - [017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md) - proposal correcting the synchronous directory lookup contract and M2M binding options

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Token Lifetime Configuration](#31-token-lifetime-configuration)
  - [3.2 Existing Principal Validation Surface](#32-existing-principal-validation-surface)
  - [3.3 Existing OAuth Standards Surface](#33-existing-oauth-standards-surface)
  - [3.4 Consumer Side](#34-consumer-side)
- [4. Standards Landscape](#4-standards-landscape)
  - [4.1 The Four Identity-Event Specs Compose, Not Compete](#41-the-four-identity-event-specs-compose-not-compete)
  - [4.2 Adjacent Standards That Are Not Identity-Event Channels](#42-adjacent-standards-that-are-not-identity-event-channels)
  - [4.3 Classification Table Per a.md Taxonomy](#43-classification-table-per-amd-taxonomy)
  - [4.4 Terminology Note: SSF, Not "SSE"](#44-terminology-note-ssf-not-sse)
- [5. Decisions](#5-decisions)
  - [5.1 D1 — M2M Access-Token Lifetime](#51-d1--m2m-access-token-lifetime)
  - [5.2 D2 — User Access-Token Lifetime](#52-d2--user-access-token-lifetime)
  - [5.3 D3 — Adopt SET + SSF + RISC End-To-End](#53-d3--adopt-set--ssf--risc-end-to-end)
  - [5.4 D4 — CAEP Adoption Is Gated On The M2M Decision](#54-d4--caep-adoption-is-gated-on-the-m2m-decision)
  - [5.5 D5 — Fence Enforcement Is Gated On Audit Insufficiency](#55-d5--fence-enforcement-is-gated-on-audit-insufficiency)
  - [5.6 D6 — RFC 7662 Introspection Is Deferred](#56-d6--rfc-7662-introspection-is-deferred)
  - [5.7 D7 — OIDC Back-Channel Logout Is Out Of Scope](#57-d7--oidc-back-channel-logout-is-out-of-scope)
  - [5.8 D8 — SCIM Read/Query Is Separate From Full Provisioning](#58-d8--scim-readquery-is-separate-from-full-provisioning)
- [6. Phased Rollout And Conditions To Advance](#6-phased-rollout-and-conditions-to-advance)
- [7. Event Vocabulary Mapping](#7-event-vocabulary-mapping)
- [8. What This Document Does Not Cover](#8-what-this-document-does-not-cover)
- [9. Edge Cases And Failure Modes](#9-edge-cases-and-failure-modes)
- [10. Definition Of Done](#10-definition-of-done)
- [11. Final Model](#11-final-model)

## 1. Goal

Establish, in one place, the standards-aligned reasoning behind the identity event channel that `id` will publish and that `content-api` will consume. This document is the decision-record sibling of docs 014, 015, and 016. It does not contain implementation steps; the three implementation docs do.

Outcomes:

- A standards-classified answer to "how should IdP-owned principal lifecycle changes reach resource clients" per the taxonomy in `a.md`.
- A recorded decision on the M2M access-token lifetime (10,800s today) versus alternatives.
- A recorded decision on whether to adopt CAEP and consumer-side fences, and the conditions under which each is unlocked.
- An explicit mapping from `docs/012_random_thoughts.md`'s invented event names to RISC / CAEP equivalents where their semantics fit, with explicitly-classified repository extensions where they do not.
- An explicit, justified scope-out of RFC 7662 introspection (deferred) and OIDC Back-Channel Logout (different problem), plus a corrected distinction between SCIM read/query (the target synchronous directory contract) and full SCIM provisioning (not adopted for this event-channel phase).

This document is forever-relevant. Implementation docs 014-016 may evolve; the decisions in §5 should be referenced and amended in place when they change, not duplicated elsewhere.

## 2. System Summary

`id` issues short-lived JWT access tokens (user 900s, M2M 10,800s) carrying identity facts (`sub`, `org_id`, `team_ids`, `azp`, `client_id`, OAuth scopes). Resource APIs such as `content-api` verify those JWTs locally against the issuer's JWKS and own their product authorization. For durable references (policy bindings naming a `user_id`, `team_id`, or `service_account` principal), `content-api` currently calls back to `id` synchronously at write time via the `principal-validation` plugin endpoints. That plugin is a temporary compatibility surface; [017](017_scim-directory-and-m2m-principal-contract.md) records the proposal to replace user/team/admin lookup with read-only SCIM and to resolve service-account binding separately.

Two staleness windows exist:

```text
identity change           ──┬──→ new token reflects change
                            │
                            └──→ existing token does not, until expiry:
                                  user tokens:  ≤ 900s   (15 minutes)
                                  M2M tokens:   ≤ 10,800s (3 hours)
```

The question this document answers is: what should `id` publish (and what should `content-api` consume) so that staleness becomes either observable, recoverable, or sub-expiry-revocable — without reinventing OAuth, OIDC, SCIM, or a private security-event format.

## 3. Current-State Findings

### 3.1 Token Lifetime Configuration

[workers/core/src/auth/config.ts:25-29](workers/core/src/auth/config.ts#L25-L29):

```ts
export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: 900,
  m2mAccessTokenExpiresIn: 10_800,
  refreshTokenExpiresIn: 604_800,
} as const;
```

The 900s user-token window is the *maximum* time that a user JWT carries claims out of sync with `id`'s authoritative state (membership, team list, ban flag). The 10,800s M2M window is the corresponding ceiling for service-account tokens issued under `client_credentials`. These are the only windows that bound JWT-only consumer staleness today.

### 3.2 Existing Principal Validation Surface

The `idPrincipalValidation` plugin already provides exact, synchronous lookups for the identity facts a future event feed would mirror:

- `validateUser` rejects absent or banned users.
- `validateUserInOrganization` requires current membership.
- `validateTeamInOrganization` requires an org-scoped team.
- `validateServiceAccountForOrganization` requires an enabled OAuth client, enabled resource audience, and enabled client/org/resource grant.
- `validateOrganizationAdministrator` requires current Better Auth owner/admin role.

These are documented in [workers/core/src/auth/plugins/principal-validation/README.md](workers/core/src/auth/plugins/principal-validation/README.md). `content-api` calls them on durable IAM writes via [src/infrastructure/identity/id-content-principal-directory.ts](../../content-api/src/infrastructure/identity/id-content-principal-directory.ts). This is the current *pull-shaped* synchronous validation implementation. Events do not replace write-time lookup, but [017](017_scim-directory-and-m2m-principal-contract.md) corrects the target contract: user/team/admin lookup should move to read-only SCIM, while service-account binding semantics need a separate OAuth/M2M decision.

### 3.3 Existing OAuth Standards Surface

`id` ships RFC-conformant OAuth endpoints through `@better-auth/oauth-provider@1.6.11`:

- `/api/auth/oauth2/token`, `/api/auth/oauth2/authorize`, `/api/auth/oauth2/userinfo`.
- `/api/auth/oauth2/revoke` (RFC 7009 token revocation).
- `/api/auth/oauth2/introspect` (RFC 7662 token introspection).
- `/api/auth/jwks` (RFC 7517 JWKS).
- `/.well-known/openid-configuration` (OIDC Discovery 1.0).

Revocation and introspection both work today. The behavioral subtlety, documented in [workers/core/tests/auth/oauth-introspect-revoke.test.ts](workers/core/tests/auth/oauth-introspect-revoke.test.ts), is that **revocation is server-side state**: a JWT signed before revocation still verifies locally at any resource server that only checks signature and expiry. Standards permit this and call out the tradeoff in RFC 7009 §5 — short lifetimes bound the delay, and resource-server interaction or additional state is required for instant invalidation.

### 3.4 Consumer Side

`content-api` already maintains two identity channels and exactly two:

1. **Request JWT claims** — projected by [src/application/auth/authenticate-bearer-token.usecase.ts](../../content-api/src/application/auth/authenticate-bearer-token.usecase.ts) into an `Actor` carrying `sub`, `org_id`, `team_ids`, and OAuth scopes.
2. **Synchronous principal validation** — invoked by [src/infrastructure/identity/id-content-principal-directory.ts](../../content-api/src/infrastructure/identity/id-content-principal-directory.ts) only on durable IAM writes.

There is no push channel today. Policy bindings in [src/infrastructure/db/schema.ts](../../content-api/src/infrastructure/db/schema.ts) store principal IDs as opaque references, with no mirroring or invalidation table. The skill folder `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` documents the two-channel contract and explicitly states there is no webhook.

## 4. Standards Landscape

### 4.1 The Four Identity-Event Specs Compose, Not Compete

```text
SET  = envelope        (RFC 8417: one signed JWT; usually one event)
SSF  = transport       (OpenID Shared Signals Framework: subscription mgmt, push/poll delivery)
RISC = vocabulary      (account lifecycle event URIs)
CAEP = vocabulary      (session/access change event URIs)
```

A producer ships **SETs over SSF delivery carrying RISC, CAEP, or explicitly registered repository-extension event URIs in the `events` claim**. A consumer registers a stream via the SSF configuration endpoints, verifies SET signatures with the producer's JWKS, and acts on its accepted event types. None of these specs is interchangeable with another; they layer.

**SET (RFC 8417)**. A JWT carrying security-event information. Required claims include `iss`, `aud`, `iat`, `jti`, `events` (object keyed by event-type URI -> event payload). RFC 8417 permits multiple event-type URIs when they describe the same logical state transition, while this implementation emits one event type per SET as a local simplification. Signed with JWS; the spec recommends `alg: RS256` or `ES256`. Defines envelope only — neither transport nor vocabulary.

**SSF (OpenID Shared Signals Framework 1.0)**. Defines:

- Stream configuration endpoint (e.g. `/api/auth/ssf/streams`) — subscriber registers delivery URL, requested event types, signing-key reference.
- Two delivery modes: **PUSH** (transmitter POSTs SETs to receiver URL — a normal HTTPS request per event, *not* an HTML5 Server-Sent Events stream) and **POLL** (receiver pulls SETs from a queue endpoint). First-release implementations may pick one and document the other as later work.
- Stream verification — synthetic event the subscriber must echo back to prove decode capability.
- Stream control — enable/pause/disable/replace stream.
- SSF SET profile constraints — each SET has a top-level `sub_id` Subject Identifier, MUST NOT use top-level JWT `sub` or `exp`, and carries JOSE header `typ: "secevent+jwt"`.

**RISC (OpenID RISC Profile 1.0)**. Account-lifecycle vocabulary, event URIs under `https://schemas.openid.net/secevent/risc/event-type/`. Examples relevant here:

| Event URI | Use |
|---|---|
| `account-credential-change-required` | Password reset forced, MFA reset |
| `account-disabled` | User disabled (reason: `hijacking`, `bulk-account`, etc.) |
| `account-enabled` | Re-enable after disable |
| `account-purged` | User hard-deleted |
| `identifier-changed` | Email/username changed |
| `identifier-recycled` | Identifier reassigned to a different account |
| `recovery-activated` | Recovery flow started |
| `recovery-information-changed` | Recovery email/phone changed |
| `sessions-revoked` | Deprecated in the Final specification; new implementations use CAEP `session-revoked` |

Adoption: Google, Microsoft, Okta exchange RISC events as the cross-provider account-lifecycle protocol.

**CAEP (OpenID CAEP Specification 1.0)**. Session/access vocabulary, event URIs under `https://schemas.openid.net/secevent/caep/event-type/`. Examples relevant here:

| Event URI | Use |
|---|---|
| `session-revoked` | One or more sessions matching the Subject Identifier invalidated |
| `token-claims-change` | Claims in an identified token changed; the event `sub_id` identifies that token |
| `credential-change` | Credential created, revoked, updated, or deleted (`change_type` only permits `create`, `revoke`, `update`, or `delete`) |
| `assurance-level-change` | MFA assurance changed |
| `device-compliance-change` | Device posture changed |

CAEP is the standards answer to "I want to keep longer-lived tokens *and* be able to revoke faster than their expiry." Microsoft Entra and Cisco are the largest CAEP producers.

### 4.2 Adjacent Standards That Are Not Identity-Event Channels

| Spec | What it actually does | Why it does not replace SET/SSF/RISC/CAEP |
|---|---|---|
| **RFC 7009 — Token Revocation** | Lets a client revoke its own access/refresh token server-side. | Server-side state only. Self-contained JWTs still verify locally at resource servers until expiry. Not a downstream-API notification mechanism. |
| **RFC 7662 — Token Introspection** | Lets a resource server query the AS for "is this token active *right now*." | Per-request synchronous call. Used as a route-by-route opt-in for high-risk endpoints. Complementary to events; not push. |
| **OIDC Back-Channel Logout 1.0** | Tells a relying party that the OP session ended, so the RP can end its browser session. | Targets browser RPs and session cookies. Resource APIs do not maintain user sessions. Different problem. |
| **RFC 7644 — SCIM 2.0 Protocol** | Synchronous HTTP protocol for creating, modifying, retrieving, querying, and discovering identity resources such as Users and Groups. | Not an identity-event channel and does not replace SET/SSF/RISC/CAEP. Read-only SCIM is the standards-shaped replacement for custom user/team/admin lookup; full provisioning remains out of scope for this event-channel phase. See [017](017_scim-directory-and-m2m-principal-contract.md). |

These specs are referenced for two reasons: (a) so future engineers do not misread the event channel as their substitute, and (b) so the implementation docs can correctly say "for problem X, use this standard; not the event channel."

### 4.3 Classification Table Per a.md Taxonomy

`a.md` requires every candidate to be classified as: **protocol standard**, **established interoperability standard or industry pattern**, **Better Auth-supported capability**, **repository-specific extension**, or **inappropriate workaround**. The exhaustive list for this design space:

| Candidate | Classification | Verdict |
|---|---|---|
| RFC 7009 Token Revocation | Protocol standard | In use today. Keep. |
| RFC 7662 Token Introspection | Protocol standard | In use today. Available as per-route option for future high-risk endpoints (D6). |
| OIDC Back-Channel Logout | Protocol standard | Out of scope — different problem (D7). |
| RFC 8417 SET | Protocol standard | **Adopt** as event envelope. |
| OpenID SSF (Shared Signals Framework) | Established interoperability standard | **Adopt** as event transport. |
| OpenID RISC | Established interoperability standard | **Adopt** as account-lifecycle vocabulary. |
| OpenID CAEP | Established interoperability standard | **Conditional adopt** for sub-expiry revocation (D4). |
| RFC 7644 SCIM 2.0 | Established interoperability standard | Adopt as the target synchronous read/query directory contract for users, org users, teams/groups, and org-admin group lookup; do not adopt full provisioning in this event-channel phase (D8, doc 017). |
| Better Auth `organizationHooks` (member/team add/remove) | Better Auth-supported capability | Use as event capture point inside producer. |
| Better Auth user disable/delete hooks | Better Auth-supported capability | Use as event capture point inside producer. |
| Plugin endpoint append-events in `oauth-scope-catalog` / `resource-server` | Better Auth-supported capability + repository-specific extension | Use as event capture point for OAuth grant/client disable events. |
| Transactional outbox row in same DB transaction as identity mutation | Repository-specific extension | Use as the producer's atomicity mechanism. Standard industry pattern. |
| Custom relationship/client events (from `docs/012_random_thoughts.md`) | Mixed: user-disable overlaps RISC; membership change is not CAEP `token-claims-change` without an identified token; disabling an OAuth client is not CAEP `credential-change` unless a credential is actually revoked | **Reject** the user event in favor of RISC; define reviewed repo-specific URIs for member removal, client disable, team delete, and OAuth client-organization grant disable. |
| Scheduled pull reconciliation sweep from `content-api` to `id` | Repository-specific operational pattern using the chosen synchronous lookup contract | Acceptable as a redundant safety net when implemented against read-only SCIM for user/team/admin lookup. Do not add new `principal-validation` dependency. |
| `iat`-based denial fence on consumer | Repository-specific enforcement derived from accepted security events | Adopt only when audit is insufficient (D5). |
| Public user-managed webhook marketplace (the old `auther` model) | Repository-specific extension | **Reject** for first release. Operator-provisioned subscriptions only. |
| Per-request live validation on every API call from `content-api` to `id` | Inappropriate workaround | Reject — defeats self-contained JWTs. |
| Mirror table of all IdP state inside `content-api` | Inappropriate workaround | Reject — introduces the consistency problem the event channel is meant to avoid. |

### 4.4 Terminology Note: SSF, Not "SSE"

OpenID's Shared Signals Framework is referred to as **SSF** throughout docs 013-016. The final specifications were published on **August 29, 2025** and use the final URL path `openid-sharedsignals-framework-1_0-final.html`; do not cite the pre-final `openid-sse-framework-1_0.html` path. Nothing in this design uses HTML5 **Server-Sent Events** (`text/event-stream`, `EventSource`); SSF PUSH delivery is a plain HTTPS POST per SET.

URL paths in docs 014-015 follow this rename: `/api/auth/ssf/streams`, not `/api/auth/sse/streams`. Any future reference that says "SSE" without qualification should be treated as a doc bug.

## 5. Decisions

Each decision is recorded with a unique ID. Subsequent docs reference these IDs (`D3`, `D4`, etc.) rather than re-stating reasoning. When a decision changes, amend the entry in place and bump the `Date` line.

### 5.1 D1 — M2M Access-Token Lifetime

**Decision**: keep `m2mAccessTokenExpiresIn = 10_800` (3 hours) for first release. Revisit when D4 is triggered.

**Reasoning**: industry mode for M2M token lifetimes is 1 hour (Google Cloud, AWS STS, Azure AD, Okta, GitHub App installation). Auth0 ships 24h default. 3h is on the longer side but not an outlier. Shipping the value as-is is acceptable provided the consequence is explicit: after an admin disables an OAuth client, an issued M2M JWT may continue to be honored at JWT-only resource APIs for up to 10,800 seconds. This window is the longest stale-authority gap in the system.

**Operational requirement**: this fact must be reflected in [docs/006_resource-server-jwt-guide.md](docs/006_resource-server-jwt-guide.md) so resource-API authors do not assume immediate revocation.

**Conditions to change**:

- A compliance, legal, or product requirement names a sub-3-hour revocation SLA for M2M tokens. In that case advance to D4 (CAEP) or reduce the constant.
- If the constant is reduced (e.g. to 3600), document the operational tradeoff (more token-endpoint load on automation clients) in [docs/007_cloudflare-deployment-runbooks.md](docs/007_cloudflare-deployment-runbooks.md).

### 5.2 D2 — User Access-Token Lifetime

**Decision**: keep `accessTokenExpiresIn = 900` (15 minutes). No change planned.

**Reasoning**: 15 minutes is short enough that ordinary identity churn (team membership changes, org membership changes, profile updates) reaches a JWT-only consumer within the natural token refresh cycle. Sensitive authority paths (Content IAM mutation, ownership transfer, organization administration) are restricted to direct-user principals only in v1 per [docs/010_organization-teams-oauth-flow.md](docs/010_organization-teams-oauth-flow.md), so the window does not gate the highest-risk operations independently.

### 5.3 D3 — Adopt SET + SSF + RISC End-To-End

**Decision**: adopt RFC 8417 SET as the event envelope, OpenID SSF (Shared Signals Framework) as the subscription and delivery transport, and OpenID RISC vocabulary as the account-lifecycle event type set. This is Phase 1.

**Reasoning**:

- RISC URIs map directly onto Phase 1 account lifecycle events (`account-disabled`, `account-purged`, identifier changes). RISC Final deprecates `sessions-revoked`; session revocation is deferred to Phase 2 using CAEP `session-revoked`.
- SET is the only event envelope standardized at the IETF (RFC 8417) and is used by every existing RISC/CAEP producer. It is a JWT, so existing JWS verification code in `content-api` is reusable.
- SSF defines subscription provisioning and delivery semantics so producer/consumer wire format is determined by the spec, not by this repo. This is critical for the "future second consumer" case (other resource APIs, audit pipelines, SIEM).

**Rejected alternatives**:

- *Bespoke CloudEvents-shaped envelope*: not signed by default, no JWT semantics, requires re-inventing replay protection and key rotation.
- *Bare HTTP POST with HMAC headers* (the `auther` model): works but is repo-specific. Falls under classification "repository-specific extension that overlaps an established standard" — rejected when the standard is mature and small.
- *RISC alone without SSF*: RISC defines event URIs, not transport. Cannot be implemented without choosing a transport, and SSF is the canonical answer.

### 5.4 D4 — CAEP Adoption Is Gated On The M2M Decision

**Decision**: add CAEP event types (`session-revoked`, `credential-change` only for actual credential create/revoke/update/delete operations, and `token-claims-change` only if an affected token can be identified) only when there is a recorded requirement to invalidate already-issued tokens faster than D1's 10,800-second M2M expiry. Membership-removal and disabled-OAuth-client notifications are repository-specific events: the former targets an authorization relationship rather than one identified token, and the latter is not an allowed CAEP credential change type. Until that requirement is recorded, CAEP and these Phase 2 extensions are not published.

**Reasoning**:

- CAEP exists specifically to let producers keep longer-lived tokens while still revoking faster than expiry. Without that need, publishing CAEP events is infrastructure without an enforcement consumer — the data exists but no consumer acts on it.
- Adding CAEP later is purely additive: same SET envelope, same SSF stream, new event-type URIs. No producer architecture change is forced by deferring.
- Premature adoption risks publishing event types that no consumer has approved enforcement for. RISC events flag *what changed* and drive cleanup; CAEP events drive *denial of in-flight tokens* and require D5 to be useful.

**Conditions to advance**:

- D1 is changed to require sub-expiry revocation, **or**
- Operational evidence (incident review, compliance audit) names a specific scenario where Phase 1 RISC + audit is not sufficient.

### 5.5 D5 — Fence Enforcement Is Gated On Audit Insufficiency

**Decision**: the consumer-side fence table and denial logic (`iat`-based rejection of in-flight tokens) is built in Phase 3, only after Phase 1 audit (doc 015) has shipped and operational evidence shows audit alone does not meet a recorded requirement.

**Reasoning**:

- Audit-mode reconciliation in Phase 1 already solves the orphan-binding problem and gives operators visibility into stale references.
- Building the fence preemptively means deciding security-model behavior (which tokens to reject, what happens on event delivery outage, how SLA is documented) before evidence informs the decision.
- The fence is a meaningful change to `content-api`'s token-acceptance contract. It must require verified `iat` on all incoming tokens (currently optional in [src/application/auth/authenticate-bearer-token.usecase.ts](../../content-api/src/application/auth/authenticate-bearer-token.usecase.ts)) and document an explicit delivery-bound revocation SLA. Those changes need their own design review (doc 016).

**Conditions to advance**:

- Phase 1 audit has shipped and run for a documented period without other major issues.
- A specific operational requirement is recorded: "for X scenario, audit visibility is not enough; we must deny in-flight tokens."

### 5.6 D6 — RFC 7662 Introspection Is Deferred

**Decision**: RFC 7662 introspection is not adopted on any `content-api` route in first release. The `/api/auth/oauth2/introspect` endpoint exists and remains tested, available as a per-route opt-in when a specific endpoint requires synchronous current-status validation.

**Reasoning**:

- Introspection trades latency (an RPC to `id` per request on those routes) for freshness. The cost is per-request and per-route; the benefit is sub-15-minute user-token revocation.
- For first release, no `content-api` route is identified as needing sub-15-minute revocation that the 900-second user-token window does not already cover.
- Introspection and CAEP are complementary, not competing: introspection answers "is *this* token active now," CAEP answers "should the consumer locally know to deny tokens with these claims." A route may choose either.

**Conditions to advance**:

- A specific `content-api` route is identified as needing sub-token-expiry revocation, **and** that requirement is not met by D4 CAEP. Examples: account deletion endpoints, ownership-transfer endpoints, billing/financial mutation routes.
- In that case, opt that specific route into introspection. Do not adopt introspection globally.

**Chooser — D5 fence vs D6 introspection**. Both solve "this needs sub-expiry revocation"; pick by the question being answered:

| Question | Pick |
|---|---|
| "Is *this token* still active right now?" — needed for one or a few high-risk routes; per-request RTT to `id` is acceptable. | **D6 introspection**. Per-route opt-in. Adds latency per request on those routes only. Synchronous, no event channel required. |
| "Should the consumer locally know to deny tokens with these claims for *some principal*?" — broad, applies to all routes evaluating the affected principal; no per-request RTT acceptable. | **D5 event-driven fence**. Producer-driven push based on accepted standard or approved extension events. Zero per-request cost. Requires the event channel to be healthy; subject to delivery-bound SLA. |

Operationally: introspection is the right tool when one route needs the freshest possible answer and you can pay a round trip for it; the fence is the right tool when the *whole* consumer should react to an identity change. Do not adopt introspection globally as a substitute for the fence — the per-request cost becomes prohibitive at scale. Do not push a fence to solve a one-route freshness need — the operational footprint (event channel, producer, consumer fence table) is too large for a single hot path.

### 5.7 D7 — OIDC Back-Channel Logout Is Out Of Scope

**Decision**: OIDC Back-Channel Logout 1.0 is not implemented as part of the identity event channel. If browser RP logout propagation becomes a product requirement in the future, it is designed and built separately under the OIDC protocol path, not as an event-type extension.

**Reasoning**:

- Back-Channel Logout targets *browser relying parties* that hold OP session state. `content-api` is a JWT-verifying resource API, not a browser RP, and does not store OP session state.
- Conflating logout propagation with identity events would push `id` toward emitting `signout` events as if they were authorization events. They are not — they govern browser session cookies, not API authority.
- The applicable Better Auth and `next-blog` browser flows are documented in [docs/008_legacy-auth-flow-analysis.md](docs/008_legacy-auth-flow-analysis.md) and use RP-initiated logout, which is sufficient for the current product surface.

### 5.8 D8 — SCIM Read/Query Is Separate From Full Provisioning

**Decision**: SCIM 2.0 read/query is the standards-shaped synchronous directory contract for user, organization-user, team/group, and organization-admin lookup. Full SCIM provisioning is not implemented in `id` for this event-channel phase. The current `principal-validation` plugin remains a temporary compatibility surface until [017](017_scim-directory-and-m2m-principal-contract.md)'s read-only SCIM replacement and M2M binding decision are implemented.

**Reasoning**:

- SCIM is not only provisioning. RFC 7644 also covers retrieval, query, and discovery of Users and Groups. That is the correct standards category for synchronous principal directory lookup.
- SET/SSF/RISC/CAEP solves the asynchronous lifecycle/security-signal problem. It does not replace SCIM read/query, and SCIM does not replace the event channel.
- Full SCIM provisioning (`POST`, `PUT`, `PATCH`, `DELETE`, `/Bulk`, external create/update ownership) remains out of scope until a separate product requirement exists.
- OAuth service accounts and client/org/resource grants are not SCIM core Users or Groups. Their runtime path stays OAuth client credentials + resource indicators + JWT/JWKS or introspection; their bind/attach management semantics are evaluated in doc 017.

**Conditions to revisit**:

- Implement doc 017's read-only SCIM proposal when replacing custom user/team/admin write-time lookup.
- Add full SCIM provisioning only when an enterprise customer, compliance regime, or product requirement explicitly requires external user/group create/update/delete.

## 6. Phased Rollout And Conditions To Advance

```text
Track A - standards correction and contract cleanup (docs 017 + 018)
  A1. Correct the standards framing: SCIM read/query for directory facts;
      OAuth client model for M2M; event channel remains separate.
  A2. Implement doc 018's M2M correction in `id`.
  A3. Implement doc 017's read-only SCIM plugin in `id`.
  A4. Migrate `content-api` user/team/admin lookup to SCIM and its
      service-account binding path to doc 018's OAuth-client contract.
  A5. Deprecate and delete `principal-validation` only after both migrations
      are complete and the deprecation window has passed.

Track B - identity event channel (docs 014 + 015, optionally 016)
  B1. Phase 1 (D3): producer ships SSF + SET + RISC; consumer audits only.
  B2. Phase 2 (D4, conditional): producer additionally ships CAEP and the
      approved repository-specific extension events; consumer still audits.
  B3. Phase 3 (D5, conditional): consumer adds fence state and `iat`-based
      denial logic.
```

These tracks are related but not serialized:

- Track A corrects the synchronous directory and M2M contracts. It is driven by [017](017_scim-directory-and-m2m-principal-contract.md) and [018](018_m2m-oauth-client-org-binding.md).
- Track B builds the asynchronous event channel. It is driven by [014](014_identity-event-producer-id.md), [015](015_identity-event-consumer-content-api-audit.md), and only conditionally [016](016_identity-event-consumer-content-api-fence-enforcement.md).
- Track B Phase 3 is not the "next default phase" of the overall program. It starts only after Track B Phase 2 has shipped and D5's explicit operational requirement is recorded.
- Track A and Track B may be implemented in parallel, but their deploy sequences remain local to each track.

| Track / phase | Scope | Conditions to advance | Execution docs |
|---|---|---|---|
| A1 | Correct doc language: SCIM read/query is the target synchronous directory contract; OAuth client credentials remains the M2M runtime contract; custom `principal-validation` is temporary only | Recorded in docs; no code dependency | doc 017 |
| A2 | Adopt BA `referenceId`, `oauthClientResourceScope`, picker auth, and infra M2M clients | Must land before service-account principal-validation deletion and before `content-api` M2M adoption is complete | doc 018 |
| A3 ✓ | Add read-only SCIM routes in `id` for users, org users, groups, and virtual org-admin groups | **Implemented 2026-05-27** — `id-scim-directory` plugin shipped; `pnpm check` green; 396 tests pass. | doc 017 |
| A4 | Migrate `content-api` user/team/admin checks to SCIM and service-account attach flows to doc 018's OAuth-client contract | Requires A2 for the M2M side and A3 for the SCIM side | docs 017 + 018 |
| A5 | Deprecate, facade, then remove `principal-validation` | Only after A4 is complete and the deprecation window has elapsed | docs 017 + 018 |
| B1 | SSF stream-config endpoints; SET envelope; RISC event vocabulary; transactional outbox; HMAC + JWS signing; retry + DLQ; audit receiver, verification, idempotency, and findings | Default first release for the event channel | docs 014 + 015 |
| B2 | Add CAEP and approved repository-specific event types reusing the same outbox + delivery; consumer remains audit-only | Only when D4 conditions are met | doc 014 §8 + doc 015 §8 |
| B3 | Add `iat` requirement, fence table, and stale-token denial | Only when B2 is shipped and D5 conditions are met | doc 016 |

Track B Phase 1 intentionally does not signal session revocation or organization/team claim staleness: RISC Final deprecates `sessions-revoked`, and membership-removal extension events are reserved for Track B Phase 2.

## 7. Event Vocabulary Mapping

When implementation begins, every event published by `id` must resolve to either a RISC URI, a CAEP URI, or an explicitly-classified repository-specific URI. The mapping below replaces the invented vocabulary in `docs/012_random_thoughts.md` §7.1.

| Use case | Standard URI / repo URI | Phase |
|---|---|---|
| User disabled | `https://schemas.openid.net/secevent/risc/event-type/account-disabled` | 1 (RISC) |
| User deleted (hard) | `https://schemas.openid.net/secevent/risc/event-type/account-purged` | 1 (RISC) |
| User sessions revoked | `https://schemas.openid.net/secevent/caep/event-type/session-revoked` (RISC `sessions-revoked` is deprecated) | 2 (CAEP) |
| Identifier changed (email/username) | `https://schemas.openid.net/secevent/risc/event-type/identifier-changed` | 1 (RISC) |
| Credential change required (forced password reset, MFA reset) | `https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required` | 1 (RISC) |
| Organization member removed | `https://id.<host>/secevent/event-type/organization-member-removed` — repo-specific relationship event; a CAEP `token-claims-change` alternative would require one event per identified token | 2 (repo extension) |
| Team member removed | `https://id.<host>/secevent/event-type/team-member-removed` — repo-specific relationship event; if a future token-targeted CAEP mapping is added, `claims.team_ids` must carry the complete new claim state, not a delta | 2 (repo extension) |
| OAuth client secret revoked | `https://schemas.openid.net/secevent/caep/event-type/credential-change` with mutually-supported `credential_type: client_secret`, `change_type: revoke` | 2 (CAEP) |
| OAuth client disabled | `https://id.<host>/secevent/event-type/oauth-client-disabled` — repo-specific; disabling a client is not itself one of CAEP's credential change types | 2 (repo extension) |
| Team deleted | `https://id.<host>/secevent/event-type/team-deleted` — repo-specific, no RISC/CAEP equivalent | 2 (repo extension) |
| OAuth client resource-scope disabled | `https://id.<host>/secevent/event-type/oauth-client-resource-scope-disabled` — repo-specific, no RISC/CAEP equivalent. Keyed off `oauthClientResourceScope.enabled` per doc 018; the legacy `oauth-client-grant-disabled` URI is retired alongside `oauthClientOrganizationGrant`. | 2 (repo extension) |

The five repo-specific URIs are accepted under `a.md`'s rules because they describe `id`-specific authorization relationships or concepts (organization/team membership removal, disabled OAuth clients, deleted Better Auth teams, and per-(client, resource-server) scope subsets) that are not represented by a matching RISC/CAEP event. They are classified explicitly as repo extensions in doc 014.

Events explicitly **not** published in any phase: token issuance, sign-in success, sign-out, content binding/denial changes, resource reads, profile field updates (initially), OAuth scope catalog browse events. Rationale per category: token-issuance/sign-in/sign-out belong to metrics (Analytics Engine, per [docs/003_future-implementation.md](docs/003_future-implementation.md) §4) or OIDC RP session protocol (out of scope per D7); content binding/denial changes are product policy and would violate `a.md`'s "do not move product authorization into id" rule; profile updates can be added later when a consumer requirement exists.

## 8. What This Document Does Not Cover

- Wire format details for SET signing, JWKS rotation, replay window. See doc 014.
- Producer database schema, outbox worker design, delivery retry/DLQ. See doc 014.
- Consumer receiver endpoint, idempotency table, orphan-flagging logic. See doc 015.
- Consumer fence table, denial logic, `iat` contract changes. See doc 016.
- Migration of `docs/012_random_thoughts.md` content into the implementation docs. Doc 012 is retained as historical context only; new implementation work cites this doc (013) for decisions and 014/015/016 for execution.
- Public webhook marketplace, user-managed subscriptions, third-party integrations. Operator-provisioned only for first release per D3 reasoning.

## 9. Edge Cases And Failure Modes

This section enumerates only failure modes whose handling is a **decision** (and thus belongs in this doc). Implementation-level failure modes (delivery retry semantics, idempotency races, signing key rotation) live in docs 014-016.

| Scenario | Decision |
|---|---|
| `id`-side identity mutation succeeds but the event row never reaches the outbox | Falls back to D1's stale-authority window. No promise of sub-window enforcement. Producer must still alert (doc 014). |
| Consumer receives a CAEP event type before D5 enforcement is shipped | Phase 2 audit-only behavior: event is logged, no policy effect. This is the *intended* behavior, not a bug. |
| Consumer receives a RISC `account-purged` for a user with active direct-share bindings | Flagging only in Phase 1 (audit). In Phase 3 (D5 enforcement), denial is applied at token verification, but local product policy bindings are not silently deleted — operator workflow handles binding cleanup. |
| A token issued before a Phase 2 membership-removal extension event is presented after the event commits | In Phase 3 only: the consumer derives a local fence cutoff from SET `toe` and denies via `iat <= fence.tokens_issued_before`. `tokens_issued_before` is local enforcement state, not a CAEP-defined claim. In Phase 1-2: accepted, because no fence exists yet. |
| Producer wants to publish a non-RISC, non-CAEP event | Must be classified as repo extension per §4.3, must use the repo-namespaced URI scheme `https://id.<host>/secevent/event-type/<name>`, and must justify why no standard URI fits. Organization-member-removed, team-member-removed, client-disabled, team-deleted, and client-grant-disabled are the five cases approved in Phase 2. |
| Subscriber asks for an event type the producer does not emit (e.g. profile change) | SSF stream config rejects on registration. Adding the event type is a future decision recorded here. |
| Subscriber asks the producer for synchronous User/Group directory lookup | Read-only SCIM is the target contract per D8 and doc 017. Do not add new custom principal-validation endpoints. |
| Subscriber asks the producer for full SCIM provisioning | Reject until a separate product requirement exists. D8 only adopts read/query for the current replacement path. |
| A new resource API beyond `content-api` requests a subscription | Allowed under the operator-provisioned model. The producer is generic across subscribers; doc 015's consumer-specific behaviors do not apply to other subscribers. |

## 10. Definition Of Done

This doc is the decision record. It is "done" when:

- All eight decisions (D1-D8) are recorded with reasoning and explicit conditions for revision.
- The vocabulary mapping (§7) covers every event named in `docs/012_random_thoughts.md` §7.1, with each row resolved to a standard URI or a justified repo-specific URI.
- [README.md](../README.md) references docs 013-017 in its Contracts section.
- [docs/003_future-implementation.md](docs/003_future-implementation.md) references docs 013-017 with a one-paragraph reading-order summary and the diagrammed phase relationship.
- [docs/006_resource-server-jwt-guide.md](docs/006_resource-server-jwt-guide.md) records D1 (M2M 10,800s stale-authority window) explicitly so resource API authors do not assume immediate revocation. *(Out of scope for this doc; tracked here as a follow-up.)*

The first three are completed in the same change set as this doc. The last is a follow-up cross-doc update.

## 11. Final Model

```text
id (producer)                                            content-api (consumer)
─────────────                                            ───────────────────
Phase 0 (today)                                          Phase 0 (today)
  RFC 7009 revoke                                          JWT verify
  RFC 7662 introspect (unused on hot paths)                Temporary principal-validation on writes
  900s user tokens                                         Two-channel contract documented
  10,800s M2M tokens
  Temporary principal-validation
  Target: read-only SCIM per doc 017
  organizationHooks fire but emit nothing

Phase 1 (D3)                                             Phase 1 (D3)
  + Transactional outbox                                   + SET receiver endpoint
  + SET envelope (RFC 8417)                                + SSF stream registration in id
  + SSF stream config /ssf/streams (OpenID SSF)            + HMAC pre-check + JWS signature verification
  + RISC event types (account-disabled,                    + Idempotency on jti
    account-purged, identifier-changed)                     + Orphan-binding findings storage
                                                           + Operator-visible reconciliation
  + HMAC + JWS keys, replay window
  + Retry + DLQ
  + Operator-managed subscriptions

Phase 2 (D4, conditional)                                Phase 2 (D4, conditional)
  + CAEP event types                                       + Audit-only consumption of new event types
    (session-revoked; credential-change only               + No policy change
     for actual credential revocation)
  + Repo-specific event URIs for
    organization-member-removed, team-member-removed,
    oauth-client-disabled, team-deleted,
    oauth-client-grant-disabled

Phase 3 (D5, conditional)                                Phase 3 (D5, conditional)
  No producer change.                                      + Require verified iat on Actor
                                                           + Add fence table
                                                           + Deny tokens with iat <= fence.tokens_issued_before
                                                           + Document delivery-bound revocation SLA
```

The result is a layered design where each phase is shippable, audit-only behavior is the default, and enforcement is added deliberately under a recorded requirement. Each step is grounded in a published standard or in a classified repository-specific extension — not in an unexamined custom identity platform.
