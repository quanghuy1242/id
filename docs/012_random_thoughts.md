# Identity Event Notifications And Resource API Revocation Boundaries

> Status: research and recommendation - no implementation approved - don't treat this seriously
>
> Date: 2026-05-25
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` - identity provider and OAuth authorization server
> - `/home/quanghuy1242/pjs/content-api` - representative downstream resource API and Content IAM consumer
>
> Source docs and code:
>
> - `docs/003_future-implementation.md`
> - `docs/006_resource-server-jwt-guide.md`
> - `docs/010_organization-teams-oauth-flow.md`
> - `workers/core/src/auth/get-auth.ts`
> - `workers/core/src/auth/oauth-provider.ts`
> - `workers/core/src/auth/plugins/principal-validation/**`
> - `workers/core/src/auth/plugins/oauth-scope-catalog/**`
> - `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` (all four files inspected)
> - `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts`
> - `/home/quanghuy1242/pjs/content-api/src/domain/iam/content-policy.ts`
> - `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts`
>
> Standards and external implementation references:
>
> - OAuth 2.0 Token Revocation, RFC 7009: <https://www.rfc-editor.org/rfc/rfc7009.html>
> - OAuth 2.0 Token Introspection, RFC 7662: <https://www.rfc-editor.org/rfc/rfc7662.html>
> - OpenID Connect Back-Channel Logout 1.0: <https://openid.net/specs/openid-connect-backchannel-1_0.html>
> - Better Auth Organization hooks: <https://better-auth.com/docs/plugins/organization>
> - Cloudflare Queues retry behavior: <https://developers.cloudflare.com/queues/configuration/batching-retries/>

## Table Of Contents

- [1. Recommendation](#1-recommendation)
- [2. Goal And Non-Goals](#2-goal-and-non-goals)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Implemented `id` Contract](#31-implemented-id-contract)
  - [3.2 Implemented `content-api` Contract](#32-implemented-content-api-contract)
  - [3.3 Existing Webhook Precedent And Extension Points](#33-existing-webhook-precedent-and-extension-points)
- [4. What A Webhook Can And Cannot Do](#4-what-a-webhook-can-and-cannot-do)
- [5. Use-Case Analysis](#5-use-case-analysis)
- [6. Proposed Target Model](#6-proposed-target-model)
  - [6.1 Stage 0: Keep The Current Contract](#61-stage-0-keep-the-current-contract)
  - [6.2 Stage 1: Generic Identity Event Notifications](#62-stage-1-generic-identity-event-notifications)
  - [6.3 Stage 2: Optional Revocation Fences](#63-stage-2-optional-revocation-fences)
- [7. Event Contract](#7-event-contract)
  - [7.1 Event Catalog](#71-event-catalog)
  - [7.2 Envelope And Delivery Security](#72-envelope-and-delivery-security)
  - [7.3 Subscription And Data-Minimization Rules](#73-subscription-and-data-minimization-rules)
- [8. Content API Consumption Model](#8-content-api-consumption-model)
- [9. Standards Boundary](#9-standards-boundary)
- [10. Implementation Strategy](#10-implementation-strategy)
- [11. Edge Cases And Failure Modes](#11-edge-cases-and-failure-modes)
- [12. Implementation Backlog](#12-implementation-backlog)
- [13. Test And Verification Plan](#13-test-and-verification-plan)
- [14. Definition Of Done](#14-definition-of-done)
- [15. Final Model](#15-final-model)

## 1. Recommendation

Do not add webhooks as a prerequisite for the current Content IAM design. The shipped
contract is coherent without them:

- `id` issues short-lived user JWTs with identity facts and OAuth scopes.
- Resource APIs verify those JWTs locally and own object authorization.
- Content IAM validates principal references synchronously only when persisting durable
  bindings or denials.
- Existing user identity or team claims can be stale for at most the documented
  900-second access-token lifetime.

If a second-stage identity event capability is desired, implement a narrow, generic
resource-API notification contract rather than restoring the broad `auther` webhook
platform. Its first useful purpose is consumer reconciliation and audit visibility for
identity facts that resource APIs reference. It must not decide product permissions or
be described as immediate access-token revocation.

Do not begin delivery implementation until one security policy decision is made:
whether the current 10,800-second M2M access-token window is acceptable after an OAuth
client or client-organization grant is disabled. This is the longest current stale
authority window and is a more concrete risk than ordinary team membership changes,
which are already constrained to 900 seconds and cannot administer Content IAM in v1.

If a downstream API later requires access to stop sooner than access-token expiry:

1. Prefer a synchronous current-status check for explicitly high-risk operations, or a
   standards-based introspection design whose semantics are tested and documented.
2. Alternatively add an opt-in consumer-side revocation-fence projection driven by
   events, with an explicit delivery-latency SLA and recovery path.
3. Never claim that receiving a webhook revokes a self-contained JWT by itself.

## 2. Goal And Non-Goals

This document answers:

- whether `id` should expose webhooks to resource APIs such as `content-api`;
- which identity changes are useful to notify downstream systems about;
- how such notifications interact with JWT claims, principal validation, OAuth
  revocation, introspection, and OIDC logout;
- what `content-api` could do with notifications without moving Content IAM into `id`;
- what should be built first if a notification capability is approved.

Non-goals:

- moving content permissions, roles, bindings, denials, or policy events into `id`;
- implementing webhook code, migrations, UI, or Cloudflare bindings in this document;
- using notifications as a custom replacement for OAuth token revocation or OIDC
  logout protocols;
- recreating `auther`'s user-configurable webhook product before a resource API has an
  approved, measurable consumer requirement.

## 3. Current-State Findings

### 3.1 Implemented `id` Contract

The API-first work contemplated in `docs/010_organization-teams-oauth-flow.md` is
already present in code:

| Capability | Evidence | Consequence |
|---|---|---|
| Better Auth organization teams | `workers/core/src/auth/get-auth.ts` registers `organization({ teams: { enabled: true } })` | `id` owns stable team and membership facts. |
| Short-lived user access tokens | `workers/core/src/auth/config.ts` sets `accessTokenExpiresIn: 900` | JWT-only stale user/team facts have a 15-minute ceiling. |
| Longer-lived M2M tokens | `workers/core/src/auth/config.ts` sets `m2mAccessTokenExpiresIn: 10_800` | Disabled service-account eligibility can remain represented by an already issued JWT for three hours at a JWT-only consumer. |
| Workspace and direct-share claims | `workers/core/src/auth/oauth-provider.ts` emits `org_id` and `team_ids` for workspace, while direct share emits empty `team_ids` without `org_id` | Resource APIs can distinguish workspace authority from direct ordinary sharing. |
| DB-backed scopes and M2M grants | `workers/core/src/auth/plugins/oauth-scope-catalog/**` | `id` owns generic audience/scope/client/org eligibility, not product authorization. |
| Durable-reference validation | `workers/core/src/auth/plugins/principal-validation/**` | Resource APIs can validate user/team/service-account targets during policy writes. |

The principal-validation operations already check the identity facts most relevant to a
future notification feed:

- `validateUser` rejects absent or banned users.
- `validateUserInOrganization` requires current membership.
- `validateTeamInOrganization` requires an org-scoped team.
- `validateServiceAccountForOrganization` requires an enabled OAuth client, enabled
  resource audience, and enabled client/org/resource grant.
- `validateOrganizationAdministrator` requires current Better Auth owner/admin role.

`workers/core/tests/auth/oauth-introspect-revoke.test.ts` also proves an important
boundary: after the OAuth revocation endpoint is used, a resource JWT still passes
local signature verification. Revocation state is server-side; a JWT-only resource API
does not see it unless it consults additional state.

### 3.2 Implemented `content-api` Contract

The complete `content-iam-usage` skill folder currently establishes exactly two
identity channels:

1. request JWT claims for ordinary resource authorization;
2. authenticated `/api/auth/principal-validation/**` calls during durable Content IAM
   writes.

It deliberately states that there is no webhook and that the resource API accepts the
15-minute user-token identity staleness window. This remains correct today.

The code matches that contract:

| Area | Evidence | Webhook implication |
|---|---|---|
| Token parsing | `src/application/auth/authenticate-bearer-token.usecase.ts` verifies issuer/audience/JWKS/scopes and projects `sub`, `org_id`, `team_ids`, `azp`/`client_id` | There is no event-derived current-status check. |
| Product policy | `src/domain/iam/content-policy.ts` expands token principals and evaluates local bindings/denials | `id` must not send product permission decisions. |
| Write-time validation | `src/infrastructure/identity/id-content-principal-directory.ts` calls `id` only for low-volume IAM writes | A notification feed cannot replace exact validation on a new write. |
| Storage | `src/infrastructure/db/schema.ts` has users and Content IAM tables, but no inbound identity event/invalidation table | Content cannot enforce an incoming event until a new local projection exists. |

An important implementation detail is that `AuthenticateBearerTokenUseCase` currently
does not require or place JWT `iat` on `Actor`. The OAuth Provider issues JWTs with an
issued-at timestamp, but a consumer-side rule such as "deny tokens issued before a
membership removal event" would require a new verified claim contract and code path in
`content-api`.

Content IAM also deliberately restricts sensitive authority:

- direct-share tokens cannot carry `content:share`;
- team and service-account principals cannot receive v1 policy-management,
  ownership-transfer, or organization-admin authority;
- removed team membership therefore affects ordinary content work, not the ability to
  rewrite IAM security state.

### 3.3 Existing Webhook Precedent And Extension Points

The former `/home/quanghuy1242/pjs/auther` repository contains a broad webhook
implementation:

- tables for endpoints, subscriptions, events, and deliveries;
- encrypted endpoint secrets and timestamp-bound HMAC signatures;
- QStash dispatch, retries, delivery result storage, and metrics;
- endpoint filtering and administrative UI concerns.

The deferral in `docs/001_first-batch-plan.md` was justified: porting that system would
bring delivery infrastructure and operational complexity into the first authentication
runtime without being needed for OAuth correctness.

There are implementable event capture points if a later capability is approved:

- Better Auth 1.6.11 organization hooks include member add/remove/role updates, team
  create/delete, and team-member add/remove hooks.
- Better Auth database/user deletion hooks can capture user lifecycle changes when
  those operations are configured and exposed.
- `id` owns its custom resource-server and OAuth-scope/grant endpoints, so successful
  disable/update operations can explicitly append events in those endpoint paths.

This proves feasibility, not reliable security delivery. A Better Auth `after*` hook
and a separate event write do not automatically form one atomic transaction. An event
system used for security enforcement needs a durable outbox/reconciliation story or
must remain an optimization over the documented token-expiry baseline.

## 4. What A Webhook Can And Cannot Do

| Question | Result |
|---|---|
| Can a webhook tell `content-api` that a user, membership, team, or client grant changed? | Yes, after an event model, delivery transport, authentication, idempotency, and consumer endpoint are built. |
| Can it let a client clean up stale team bindings or flag local user projections? | Yes, as eventual reconciliation. |
| Can it change a Content IAM permission decision by declaring a product role? | No. Product policy remains owned by `content-api`. |
| Can it replace principal validation when creating a new binding? | No. A new write must validate current exact identity facts synchronously. |
| Does a webhook invalidate a previously issued signed JWT? | No. Local signature and expiry verification remains successful unless the consumer consults additional invalidation state. |
| Can it reduce stale access if the consumer stores invalidation fences and checks `iat`? | Yes after delivery, with delivery lag and outage behavior included in the SLA. |
| Is a webhook the correct OIDC logout mechanism for relying-party browser sessions? | No. OIDC Back-Channel Logout is the applicable protocol when OP-to-RP session logout is required. |

The central design distinction is:

```text
identity notification
  tells a downstream API that an id-owned fact changed

authorization enforcement
  requires that downstream API to apply a defined local rule or consult live state
```

Without the second line, notifications improve observability but not access revocation.

## 5. Use-Case Analysis

| Identity event candidate | Current exposure without events | Useful downstream action | Priority |
|---|---|---|---|
| User banned or deleted | Existing user JWT usable until its 900-second expiry; new validation fails | Tombstone a local projection; optionally fence old user JWTs | Medium, once user-disable workflow is productized |
| Organization member removed | Existing workspace user JWT may carry `org_id` for 900 seconds | Optionally fence old workspace authority for that org | Medium; v1 sensitive IAM is already direct-user guarded |
| Team member removed | Existing user JWT may carry that `team_id` for 900 seconds | Optionally fence the removed team principal only | Low/medium for ordinary collaboration |
| Team deleted | Existing tokens may contain the team ID for 900 seconds; local bindings may remain | Mark referenced team bindings orphaned or ignore them through a fence | Medium for hygiene, low for v1 escalation risk |
| OAuth client disabled | An issued M2M JWT may remain accepted up to 10,800 seconds | Fence client tokens or invoke live status for selected operations | High decision priority because the window is longest |
| OAuth client organization grant disabled | Same three-hour M2M window for org/resource eligibility | Fence `(client, org, resource)` tokens | High decision priority |
| Resource server or OAuth scope disabled | Already issued JWT remains locally verifiable until expiry | Resource API may deny previously issued tokens if a strict incident policy exists | Operational incident use only |
| Membership/team created | Reflected on new token issuance | Usually no consumer action; a binding still requires local policy write | Do not send initially |
| Token issued, sign-in, sign-out | Does not change object-policy state at a JWT-verifying API | Metrics or RP session protocol, not content policy | Do not put in resource-event v1 |
| Content binding/denial changed | Already local to content | None in `id` | Forbidden direction |

The first concrete question is therefore not "build webhook delivery?" but:

```text
May an import or automation client continue ordinary content writes for up to
three hours after its id OAuth client/grant is disabled?
```

If the answer is no, reducing M2M lifetime may be simpler and more reliable than a new
event platform. If only a small set of high-risk actions needs fresher state, use a
synchronous current-eligibility check on those actions. An event fence becomes useful
only when many hot-path operations need a lower latency without per-request calls to
`id`.

## 6. Proposed Target Model

### 6.1 Stage 0: Keep The Current Contract

Recommended now:

- Keep the `content-iam-usage` skill statement that there is no webhook.
- Keep ordinary Content IAM checks JWT-local and continue write-time principal
  validation.
- Record the M2M revocation SLA decision explicitly before expanding M2M powers.
- Do not add event tables or event receivers merely because hooks exist.

This stage has no runtime work. It preserves the currently documented security model
instead of introducing a partially enforced channel.

### 6.2 Stage 1: Generic Identity Event Notifications

Build this stage only once an approved downstream consumer needs lifecycle
reconciliation, security reporting, or a prerequisite feed for later fences.

Recommended capability:

```text
id identity-event publisher
  owns event type definitions and delivery records
  captures successful id-owned negative lifecycle changes
  delivers minimal signed events to explicitly registered resource API subscribers

resource API subscriber
  authenticates delivery, deduplicates event_id, records processing state
  chooses its own product-neutral reconciliation behavior
```

The service is generic across resource APIs. `content-api` is one subscriber; its
content roles and resources do not appear in the `id` event schema.

Limit initial publication to authority-reducing or identity-invalidating facts:

- user disabled/deleted;
- organization member removed;
- team member removed;
- team deleted;
- OAuth client disabled;
- OAuth client organization grant disabled.

Do not publish sign-in, sign-out, token issuance, resource reads, or content policy
events as part of this channel. Those either belong to metrics/audit or cross the
product-policy ownership boundary.

Stage 1 consumer behavior for `content-api` should be non-authoritative unless Stage 2
is explicitly enabled. It may:

- store processed event IDs and delivery outcomes;
- flag local user/team/service-account references for operator review;
- report local policy bindings referencing a deleted team or disabled service account;
- retain an audit trail of identity-side changes relevant to local principals.

It should not silently delete a direct user binding when organization membership is
removed: that same user may legitimately retain direct-share access through a local
ordinary binding.

### 6.3 Stage 2: Optional Revocation Fences

Stage 2 is a separate security feature, not an automatic result of Stage 1.

For a subscriber that accepts event-delivery latency as its invalidation SLA, maintain
local invalidation fences such as:

```text
principal kind       fence key
-------------------  --------------------------------------------
disabled user        user:<user_id>
removed org member   workspace:<org_id>:<user_id>
removed team member  team:<org_id>:<team_id>:<user_id>
deleted team         team:<org_id>:<team_id>
disabled client      service_account:<client_id>
disabled M2M grant   service_account:<resource>:<org_id>:<client_id>
```

Each authority-reducing event carries an IdP-generated `tokens_issued_before` epoch
second. The resource API must require verified JWT `iat` and deny an affected
principal assertion when:

```text
token.iat <= applicable_fence.tokens_issued_before
```

New tokens minted after the identity change are evaluated from their current claims;
for example, a new user token will omit a removed team ID. Denying same-second
post-change tokens is an acceptable fail-safe boundary unless the issuer defines a
more precise monotonically ordered claim.

Content-specific effects remain local:

- a removed team membership fence excludes only the stale team-derived principal; it
  must not remove an independent direct user binding;
- a removed org membership fence denies workspace authority for that org but must not
  convert the token to direct-share mode;
- a disabled service-account grant fence denies that service account for the affected
  public API audience and org;
- content bindings and denials are still edited only by Content IAM workflows.

Stage 2 is not "immediate revocation." Until the subscriber receives and commits the
event, it behaves according to its previous local state. A strict operation that cannot
accept that delay must perform a live current-status decision instead.

## 7. Event Contract

### 7.1 Event Catalog

Recommended initial versioned names:

| Event type | Required data | Intended meaning |
|---|---|---|
| `identity.user.disabled.v1` | `user_id`, `tokens_issued_before` | User must not obtain new identity authority; existing-token handling is subscriber policy. |
| `identity.user.deleted.v1` | `user_id`, `tokens_issued_before` | User principal no longer exists in `id`. |
| `identity.organization.member.removed.v1` | `organization_id`, `user_id`, `tokens_issued_before` | User is no longer a workspace member for this org. |
| `identity.team.member.removed.v1` | `organization_id`, `team_id`, `user_id`, `tokens_issued_before` | User no longer contributes this team principal. |
| `identity.team.deleted.v1` | `organization_id`, `team_id`, `tokens_issued_before` | Team principal no longer exists. |
| `oauth.client.disabled.v1` | `client_id`, `tokens_issued_before` | Client cannot obtain new usable OAuth authority. |
| `oauth.client_organization_grant.disabled.v1` | `client_id`, `organization_id`, `resource`, `tokens_issued_before` | Client cannot receive new org-scoped tokens for this public API audience. |

Potential later event types, only when a consumer need exists:

- user profile updates, if a resource API chooses to project IdP-owned display fields;
- organization deletion, after deletion/cascade semantics are defined;
- resource-server/scope disabling incident events;
- explicit re-enable events for persistent blocklist consumers rather than
  issue-time-fence consumers.

Do not include email address, user profile, OAuth secrets, access tokens, refresh
tokens, content binding identifiers, or content permissions in initial security event
payloads.

### 7.2 Envelope And Delivery Security

Suggested HTTP delivery envelope:

```json
{
  "specversion": "1.0",
  "id": "evt_01...",
  "source": "https://id.example.com/api/auth",
  "type": "identity.team.member.removed.v1",
  "time": "2026-05-25T08:30:00.000Z",
  "subject": "team/team_editorial/member/user_alice",
  "resource": "https://content-api.example.com",
  "data": {
    "organization_id": "org_1",
    "team_id": "team_editorial",
    "user_id": "user_alice",
    "tokens_issued_before": 1779697800
  }
}
```

The shape deliberately resembles CloudEvents while remaining an `id`-owned versioned
contract. Adopting full CloudEvents conformance is optional and should be an explicit
later decision, not an accidental claim.

Delivery requirements:

- HTTPS destination only outside local development.
- Each subscription has a rotation-capable secret.
- Send headers including event ID, delivery timestamp, key identifier, and an HMAC
  SHA-256 signature over `<timestamp>.<raw-body>`.
- Subscriber rejects a signature with an unknown key, rejects timestamps outside a
  small replay window, and idempotently ignores a previously processed event ID.
- Do not log full payloads or signature secrets.
- Retry transient failures; move permanently failing deliveries to operator-visible
  dead-letter handling rather than dropping silently.

The historical `auther` signature and delivery code is useful reference material for
these mechanics, but it is not code to copy into `id`: it is coupled to Next.js,
QStash, its own repositories, and broad user-managed subscriptions.

For a Cloudflare-native implementation, evaluate a Queue consumer and dead-letter
queue rather than introducing QStash as a new infrastructure dependency. Cloudflare
Queues supports retries and DLQs, but selection must be proven against deployment and
multi-subscriber routing requirements before implementation.

### 7.3 Subscription And Data-Minimization Rules

Avoid a public arbitrary webhook marketplace in the first event release. Provision
subscriptions as operational resource-server integrations:

```text
identityEventSubscription
  id
  resourceServerId
  destinationUrl
  enabled
  eventTypes[]
  secretCiphertext / signing key reference
  createdBy / updatedBy
  createdAt / updatedAt
```

Rules:

- A subscription belongs to an enabled registered resource server.
- Payload `resource` is the public audience, never an internal `resourceServerId`.
- For a resource-bound M2M grant event, route only to the resource server affected by
  the grant.
- For user/team/org events, a subscriber receives only events it was explicitly
  configured to process; it may hold local references for those generic IDs.
- Subscriber registration requires the same organization/platform administration
  policy already used for resource-server configuration.
- An event payload carries stable IDs and revocation timing only, not PII.

If durable endpoint/subscription/event/delivery tables are added in `id`, they must be
owned by an approved Better Auth plugin under `workers/core/src/auth/plugins/**`, with
migrations generated through `pnpm db:generate`. Do not hand-write migration SQL.

## 8. Content API Consumption Model

`content-api` is a useful proof consumer because it already stores `id` principal IDs
in local policy bindings, but its integration must preserve the current ownership
boundary.

Stage 1 receiver concept:

```text
POST /internal/id-events
  authenticate signature
  validate event version and public target resource
  enforce idempotency on event.id
  store processing receipt / reconciliation finding
  return 2xx only once durable processing succeeds
```

Possible Stage 1 local records:

```text
id_identity_event_receipts
  event_id primary key
  event_type
  occurred_at
  received_at
  status

id_identity_reference_findings
  event_id
  principal_type
  principal_id
  org_id
  affected_binding_count
  resolution_status
```

Stage 1 does not enter `LocalContentPolicy.can()` and does not affect an end-user
request. It establishes reliable authenticated ingestion and operator visibility
without silently altering authorization.

Stage 2 additions, only if approved:

```text
id_identity_invalidation_fences
  fence_kind
  organization_id nullable
  team_id nullable
  principal_id
  resource_audience nullable
  tokens_issued_before
  source_event_id unique
  created_at
```

Required `content-api` code changes for Stage 2 would include:

- require numeric `iat` in `AuthenticateBearerTokenUseCase`;
- carry verified token issuance time in `Actor` or a separate verified-auth context;
- add an application/domain interface for identity fences;
- consult applicable fences before token principals are admitted to local Content IAM
  evaluation;
- keep `IdContentPrincipalDirectory` calls on durable writes, because event state may
  lag and does not prove a target currently exists;
- add tests that a direct user binding survives organization/team removal while stale
  workspace/team authority is removed.

Do not automatically revoke Content IAM rows in response to member removal:

- a user removed from an organization may still hold a legitimate direct-share
  ordinary binding;
- local product administrators may need historical bindings/events for audit;
- a local disable/revoke action is a Content IAM decision and must create the
  corresponding local policy event.

## 9. Standards Boundary

The event design must not be presented as a substitute for standard protocol
operations:

| Requirement | Correct mechanism | Event relationship |
|---|---|---|
| OAuth client revokes a refresh/access token it no longer needs | RFC 7009 revocation through `/api/auth/oauth2/revoke` | Optional event/fence may help a JWT-verifying API observe a local invalidation policy; it does not replace revocation. |
| Resource server needs authorization server token active state at request time | RFC 7662 introspection through `/api/auth/oauth2/introspect`, if chosen for that route/class of tokens | Event projection is an asynchronous alternative with a different SLA, not introspection. |
| Relying-party browser session must end when the user logs out at the OP | OIDC Back-Channel Logout using registered `backchannel_logout_uri` and Logout Tokens when supported and implemented | Generic identity webhook must not be called "logout propagation." |
| Object permission changes | Resource API local policy workflow | Never sent from `id` as authority. |

RFC 7009 specifically notes the design tradeoff for self-contained access tokens:
short lifetimes bound revocation delay; immediate access-token invalidation requires
resource-server interaction or additional state. The current 900-second user token
model is already one valid implementation of that tradeoff.

The installed OAuth Provider exposes revocation and introspection endpoints and the
current tests exercise them. The current resource API still validates JWTs locally,
so a standards-based high-risk route design must explicitly choose to invoke
introspection and test the expected `active` semantics. In particular, existing
documentation correctly warns not to assume introspection recomputes current
`team_ids` unless that contract is added and proven.

## 10. Implementation Strategy

Do not implement all stages as one feature. Use the following decision sequence:

1. **Approve or reject an additional SLA.**
   State whether any current resource API requires identity changes to affect access
   sooner than 900 seconds for users or 10,800 seconds for M2M tokens.
2. **Address M2M lifetime first.**
   If three hours is unacceptable for ordinary automation writes, evaluate a shorter
   M2M access-token lifetime before accepting event-delivery complexity.
3. **Select one consumer purpose.**
   Approve either reconciliation/audit notification (Stage 1) or a stated
   event-delivery invalidation SLA (Stage 2). Do not build an event framework without
   a receiver behavior.
4. **Prove event capture.**
   Spike Better Auth organization hooks and custom plugin endpoint callbacks, including
   what happens when the event/outbox write fails after an identity mutation.
5. **Define transport and recovery.**
   Select Cloudflare Queue/service delivery or HTTP delivery with a durable outbox,
   retries, DLQ, HMAC verification, secret rotation, and replay protection.
6. **Implement producer and one consumer only.**
   Use `content-api` as the first consumer only for the approved use case; keep the
   producer contract generic for later resource APIs.
7. **Update contracts after implementation.**
   Only when delivery and consumer behavior are tested should
   `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` change
   from its present two-channel/no-webhook statement.

Producer ownership target if implementation proceeds:

```text
workers/core/src/auth/plugins/identity-events/
  schema.ts              plugin-owned subscription/event/delivery records
  index.ts               administrative endpoints, if subscriptions are persisted
  publisher.ts           event creation and delivery scheduling policy
  types.ts               event names and options

workers/core/src/auth/get-auth.ts
  compose Better Auth organization hooks into an injected event publisher

workers/core/src/auth/plugins/oauth-scope-catalog/index.ts
workers/core/src/auth/plugins/resource-server/index.ts
  append events after relevant successful negative admin mutations
```

This location keeps identity facts and Better Auth extension behavior inside the
existing auth boundary. No product-specific event handler belongs in `id`.

## 11. Edge Cases And Failure Modes

| Scenario | Required handling |
|---|---|
| Hook fires after identity change but event persistence fails | Current token-expiry baseline remains the only promised enforcement; alert and reconcile. Do not promise Stage 2 until the gap is addressed. |
| Event is delivered twice | Subscriber deduplicates by event ID and returns success for a committed prior receipt. |
| Events arrive out of order | Subscriber keeps the maximum `tokens_issued_before` for each fence key. |
| Subscriber is down | Retry and DLQ; until committed, any Stage 2 reduction is unavailable, so its SLA must include this failure mode. |
| Secret rotates while messages are queued | Include signing key ID and retain previous verification key through the retry/replay window. |
| Member removed but user has direct-share binding | Exclude stale workspace/team authority only; retain direct-user ordinary policy evaluation. |
| Team deleted but bindings remain | Mark as orphaned or fence team principal; do not allow it through token principal expansion. |
| OAuth client grant disabled for one API | Fence only `(client, org, resource audience)`, not unrelated API grants. |
| Webhook payload leaks profile or tokens | Violation: initial events carry stable IDs and timing only; logs redact bodies/signatures. |
| Resource API treats event as a product permission update | Architecture violation: reject this integration in review. |
| Logout requirement is raised | Design OIDC RP logout separately; do not add a `signout` webhook and call it protocol logout. |

## 12. Implementation Backlog

### EVT-0. Make The Revocation SLA Decision

Scope:

- `docs/012_identity-event-webhook-resource-api-contract.md`
- `docs/006_resource-server-jwt-guide.md`
- `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/references/token-contract.md`

Tasks:

- [ ] Decide whether user JWT-only access ending within 900 seconds is acceptable for
  all currently permitted content actions.
- [ ] Decide whether M2M JWT-only access ending within 10,800 seconds is acceptable for
  all currently permitted automation actions.
- [ ] If M2M is too long, decide between shorter tokens, selected live checks, or
  event-driven fences before event implementation begins.

Acceptance criteria:

- A concrete user and M2M revocation SLA is documented without implying that JWT
  signature verification sees provider-side revocation.

Tests:

- Documentation review against `workers/core/src/auth/config.ts` and
  `workers/core/tests/auth/oauth-introspect-revoke.test.ts`.

### EVT-1. Spike Event Capture And Atomicity

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/auth/plugins/oauth-scope-catalog/index.ts`
- `workers/core/src/auth/plugins/resource-server/index.ts`
- installed Better Auth organization-hook types and runtime

Tasks:

- [ ] Prove organization/member/team negative changes can emit typed events through
  supported `organizationHooks`.
- [ ] Prove where user disable/delete events can be captured for the enabled admin/user
  operations.
- [ ] Prove OAuth client disable capture through the installed provider contract,
      and custom OAuth grant/resource disable event capture paths.
- [ ] Establish whether producer event storage can be atomic with source mutation; if
  not, define reconciliation and do not advertise immediate enforcement.

Acceptance criteria:

- The event source for every proposed v1 event is demonstrated in a focused test or
  removed from the initial catalog.

Tests:

- New focused tests under `workers/core/tests/auth/`.

### EVT-2. Implement Generic Delivery Only If Stage 1 Is Approved

Scope:

- `workers/core/src/auth/plugins/identity-events/**` (new)
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/config/env.ts`
- `workers/core/wrangler.jsonc`

Tasks:

- [ ] Add plugin-owned event subscription/event/delivery schema definitions and run
  `pnpm db:generate`; do not craft SQL manually.
- [ ] Implement minimal negative identity event catalog and data minimization.
- [ ] Implement authenticated delivery, timestamp replay protection contract, retries,
  dead-letter recovery, and secret rotation.
- [ ] Add resource-server-scoped administration for subscriptions without exposing
  Content IAM state.

Acceptance criteria:

- A registered resource API can securely consume only configured generic identity
  events, with operator-visible failed delivery behavior.
- Ordinary OAuth/token issuance remains functional if the notification consumer is
  unavailable unless a separately documented fail-closed mode is approved.

Tests:

- `pnpm lint`
- `pnpm check:dup`
- `pnpm typecheck`
- `pnpm test`
- `pnpm advise`

### EVT-3. Add A `content-api` Reconciliation Consumer

Scope:

- `/home/quanghuy1242/pjs/content-api/src/domain/`
- `/home/quanghuy1242/pjs/content-api/src/application/`
- `/home/quanghuy1242/pjs/content-api/src/infrastructure/`
- `/home/quanghuy1242/pjs/content-api/src/http/`
- `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**`

Tasks:

- [ ] Add an internal authenticated receiver, event receipt idempotency, and
  reconciliation finding storage.
- [ ] Report bindings referencing invalid/deleted identity principals without
  auto-deleting valid direct-share policy.
- [ ] Update the content IAM skill only after implemented code establishes the new
  third channel and its non-authoritative Stage 1 behavior.

Acceptance criteria:

- Identity events are securely received and auditable, while ordinary `ContentPolicy`
  authorization remains unchanged.

Tests:

- `pnpm check` in `/home/quanghuy1242/pjs/content-api`.
- Duplicate/replay, bad signature, deleted team, removed membership with retained
  direct-share binding, and delivery retry tests.

### EVT-4. Add Revocation Fences Only If Stage 2 Is Approved

Scope:

- `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts`
- `/home/quanghuy1242/pjs/content-api/src/domain/auth/actor.ts`
- `/home/quanghuy1242/pjs/content-api/src/domain/iam/content-policy.ts`
- consumer fence persistence and receiver use cases

Tasks:

- [ ] Require and validate JWT `iat` for tokens participating in the fence contract.
- [ ] Persist maximum fence timestamp by generic identity key.
- [ ] Exclude stale workspace, team, user-disabled, or service-account authority as
  defined by received events.
- [ ] Define behavior during delivery outage, DLQ backlog, and replay.

Acceptance criteria:

- Tests demonstrate exactly which previously accepted JWTs are denied after a committed
  event and which independent direct-share/local permissions remain valid.
- Documentation states the delivery-based SLA rather than claiming immediate
  revocation.

Tests:

- `pnpm check` in both repositories.
- Event-before-token, token-before-event, out-of-order event, duplicate event,
  consumer outage, and M2M resource-specific fence tests.

## 13. Test And Verification Plan

For research approval:

- Review the documented baseline against `docs/010_organization-teams-oauth-flow.md`,
  the `content-iam-usage` skill, and existing tests.
- Review standards wording against RFC 7009, RFC 7662, and OIDC Back-Channel Logout.

For any producer implementation:

- Verify every emitted event follows a successful source change.
- Verify no payload contains token, secret, password, profile, or product-policy data.
- Verify delivery signatures, key rotation, replay rejection, duplicate delivery,
  retry, DLQ, disabled subscription, and cross-resource audience isolation.
- Run `pnpm check` and `pnpm advise` in `auth`.

For any `content-api` receiver implementation:

- Verify incorrect signatures and wrong target audience are rejected.
- Verify receipt persistence is idempotent.
- Verify a Stage 1 consumer does not alter authorization.
- For Stage 2, verify JWTs issued before committed fences are denied and tokens/claims
  not affected by the fence remain evaluated by local policy.
- Verify removal from an organization does not delete or silently deny a separately
  permitted direct-share binding unless a user-disable fence applies.
- Run `pnpm check` and `pnpm advise` in `content-api`.

## 14. Definition Of Done

For this research document:

- The existing JWT/principal-validation contract is mapped from both codebases.
- Webhook purpose is separated from OAuth revocation, introspection, and OIDC logout.
- A concrete first consumer and a staged implementation boundary are defined.
- The M2M three-hour stale-authority decision is surfaced before delivery work.

For an eventual Stage 1 implementation:

- Event catalog, subscription boundary, signing/replay contract, retry/DLQ behavior,
  and data-minimization rules are implemented and tested.
- `content-api` receives generic events without treating them as Content IAM
  permission decisions.
- The content IAM skill is updated to document the implemented notification channel.

For an eventual Stage 2 implementation:

- Consumers require verified `iat`, maintain generic invalidation fences, document
  their delivery-latency SLA, and retain standards-based protocol behavior.
- Neither repository claims that an asynchronous event instantly revokes a
  self-contained JWT.

## 15. Final Model

The present design should remain:

```text
id
  issues OAuth JWT identity/scope facts
  owns users, organizations, teams, OAuth clients, scopes, M2M org grants
  validates durable downstream principal references on demand

resource APIs such as content-api
  verify JWTs locally
  own product roles, bindings, denials, hierarchy, and final permission decisions
  accept documented token-lifetime staleness
```

The optional future addition is:

```text
id identity-event notifications
  publish minimal generic identity/client authority reductions
  provide authenticated, retryable, auditable eventual delivery

resource API consumers
  first use events for reconciliation/audit
  optionally, after separate approval, use iat-based fences for a stated
  delivery-bound revocation SLA
```

This is the useful webhook boundary. It lets multiple resource APIs react to
identity-side lifecycle changes without moving their policy engines into `id`, and
without replacing OAuth/OIDC standards with an informal logout or token-revocation
mechanism.
