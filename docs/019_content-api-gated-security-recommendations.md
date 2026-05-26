# Content API Gated Security Recommendations

> Status: implementation-grade recommendation document
>
> Date: 2026-05-26
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` - `id` authorization server, resource-server catalog, OAuth/JWKS/introspection/SCIM/event producer responsibilities
> - `/home/quanghuy1242/pjs/content-api` - protected resource API, Content IAM, policy-write validation, identity-event consumer responsibilities
>
> Source docs:
>
> - `b.md` section 7, "Gated Security Architecture for content-api"
> - `/home/quanghuy1242/pjs/content-api/docs/006_migrate-auther-to-id.md`
> - `/home/quanghuy1242/pjs/content-api/docs/007_content-iam-policy-binding-model.md`
> - `docs/006_resource-server-jwt-guide.md`
> - `docs/013_identity-event-standards-and-decisions.md`
> - `docs/015_identity-event-consumer-content-api-audit.md`
> - `docs/016_identity-event-consumer-content-api-fence-enforcement.md`
> - `docs/017_scim-directory-and-m2m-principal-contract.md`
> - `docs/018_m2m-oauth-client-org-binding.md`
>
> Standards references:
>
> - OpenID Connect Core 1.0, <https://openid.net/specs/openid-connect-core-1_0-18.html>
> - OpenID Connect Discovery 1.0, <https://openid.net/specs/openid-connect-discovery-1_0.html>
> - RFC 8414 - OAuth 2.0 Authorization Server Metadata, <https://www.rfc-editor.org/rfc/rfc8414>
> - RFC 8707 - OAuth 2.0 Resource Indicators, <https://www.rfc-editor.org/rfc/rfc8707>
> - RFC 9068 - JWT Profile for OAuth 2.0 Access Tokens, <https://www.rfc-editor.org/rfc/rfc9068>
> - RFC 7662 - OAuth 2.0 Token Introspection, <https://www.rfc-editor.org/rfc/rfc7662>
> - RFC 7009 - OAuth 2.0 Token Revocation, <https://www.rfc-editor.org/rfc/rfc7009>
> - RFC 7643 / RFC 7644 - SCIM 2.0 Core Schema and Protocol, <https://www.rfc-editor.org/rfc/rfc7643>, <https://www.rfc-editor.org/rfc/rfc7644>
> - RFC 8417 - Security Event Token (SET), <https://www.rfc-editor.org/rfc/rfc8417>
> - OpenID Shared Signals Framework 1.0 Final, <https://openid.net/specs/openid-sharedsignals-framework-1_0-final.html>
> - OpenID RISC Profile 1.0 Final, <https://openid.net/specs/openid-risc-1_0-final.html>
> - OpenID CAEP Specification 1.0 Final, <https://openid.net/specs/openid-caep-1_0-final.html>
> - RFC 9728 - OAuth 2.0 Protected Resource Metadata, <https://www.rfc-editor.org/rfc/rfc9728>

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 `content-api` Already Implements Gates A And C Partially](#31-content-api-already-implements-gates-a-and-c-partially)
  - [3.2 Gate B Exists In `id` But Is Not Used By `content-api`](#32-gate-b-exists-in-id-but-is-not-used-by-content-api)
  - [3.3 Gate D Is Planned, Not Implemented](#33-gate-d-is-planned-not-implemented)
  - [3.4 M2M Resource-Server Ownership Is Being Corrected](#34-m2m-resource-server-ownership-is-being-corrected)
- [4. Standards Classification](#4-standards-classification)
- [5. Recommended Gate Model](#5-recommended-gate-model)
  - [5.1 Gate A - Local JWT Verification On Every Protected Request](#51-gate-a---local-jwt-verification-on-every-protected-request)
  - [5.2 Gate B - RFC 7662 Introspection Only For Authority-Changing Routes](#52-gate-b---rfc-7662-introspection-only-for-authority-changing-routes)
  - [5.3 Gate C - Standards-Shaped Write-Time Principal Validation](#53-gate-c---standards-shaped-write-time-principal-validation)
  - [5.4 Gate D - SET/SSF/RISC Audit First, CAEP/Fences Only When Required](#54-gate-d---setssfrisc-audit-first-caepfences-only-when-required)
- [6. Route-Level Recommendations](#6-route-level-recommendations)
- [7. `id` Resource-Server Recommendations](#7-id-resource-server-recommendations)
- [8. `content-api` Implementation Recommendations](#8-content-api-implementation-recommendations)
- [9. Migration And Rollout](#9-migration-and-rollout)
- [10. Edge Cases And Failure Modes](#10-edge-cases-and-failure-modes)
- [11. Test And Verification Plan](#11-test-and-verification-plan)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 1. Goal

Turn the four-gate security model from `b.md` section 7 into a standards-aligned recommendation for `content-api` and the `id` resource-server/OAuth surface.

The short version:

- Keep ordinary resource requests fast: local JWT verification, local Content IAM, no synchronous calls to `id`.
- Add synchronous token introspection only to high-risk, authority-changing routes where current token activity matters more than latency.
- Replace custom user/team/admin principal validation with read-only SCIM. Treat current `/api/auth/principal-validation/**` as a migration shim, not the durable contract.
- Add identity-event audit with SET over OpenID SSF and RISC first. Add CAEP-driven local fences only when a named operational SLA requires sub-expiry revocation.
- Keep OAuth/OIDC/resource-server responsibilities in `id`; keep product roles, content permissions, concrete bindings, denials, and final object decisions in `content-api`.

Non-goals:

- Do not move Content IAM role evaluation into `id`.
- Do not call `id` on every ordinary `content-api` request.
- Do not invent custom logout, token revocation, principal lookup, or event protocols when an OAuth, OpenID, SCIM, SET, SSF, RISC, or CAEP standard fits.

## 2. System Summary

Target request flow:

```text
client
  -> obtains id access token with:
       resource = https://content-api.quanghuy.dev
       aud      = https://content-api.quanghuy.dev
       scope    = content:read | content:write | content:share
       context  = workspace org_id/team_ids OR direct-share user-only

content-api ordinary route
  -> Gate A: verify JWT locally against id JWKS, issuer, audience, expiry, scope
  -> local Content IAM:
       principal expansion from sub/org_id/team_ids/client_id
       content_policy_denials first
       content_policy_bindings next
  -> no network call to id

content-api Content IAM mutation route
  -> Gate A: local JWT verification
  -> Gate B: introspect the exact token with id
  -> Gate C: validate durable principal references through SCIM or the temporary shim
  -> local mutation authorization and D1 transaction

content-api identity event receiver
  -> Gate D audit: accept verified SETs over OpenID SSF, write findings
  -> optional Gate D enforcement: apply iat-based local fences only after a documented SLA
```

The model keeps `id` as the authorization server and identity authority. It keeps `content-api` as the protected resource and product authorization authority.

## 3. Current-State Findings

### 3.1 `content-api` Already Implements Gates A And C Partially

Gate A exists in `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts`:

- extracts `Bearer <token>`;
- verifies with `jose.jwtVerify(...)`, configured issuer, audience, and JWKS URL;
- checks the configured coarse scope through `AUTH_REQUIRED_SCOPE`;
- projects user tokens from `sub`, optional `org_id`, and `team_ids`;
- projects service-account tokens from `azp` or `client_id` plus required `org_id`;
- rejects direct-share user tokens that carry `team_ids` or `content:share`.

This is the right hot-path shape. It matches `docs/006_resource-server-jwt-guide.md`: JWT verification gates API access, then `content-api` evaluates concrete product policy locally.

Gate C exists but uses the temporary custom surface. `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts` calls:

- `POST /api/auth/principal-validation/users/validate`;
- `POST /api/auth/principal-validation/users/validate-organization-member`;
- `POST /api/auth/principal-validation/teams/validate-organization-team`;
- `POST /api/auth/principal-validation/service-accounts/validate-organization-grant`;
- `POST /api/auth/principal-validation/organization-administrators/validate`.

That adapter is used only by durable Content IAM writes and book ownership/admin workflows. It is not on the ordinary request hot path, which is correct. The problem is standards shape: doc 017 now classifies the user/team/admin subset as a migration shim that should move to read-only SCIM.

### 3.2 Gate B Exists In `id` But Is Not Used By `content-api`

`docs/013_identity-event-standards-and-decisions.md` records that `id` exposes `/api/auth/oauth2/introspect` through the Better Auth OAuth provider and that tests cover introspection/revocation behavior.

`content-api` currently does not call introspection. That is acceptable for ordinary reads and writes to content resources because self-contained JWTs plus short lifetime keep the hot path fast. It is insufficient for authority-changing routes where a token revoked moments ago should not be able to create, delegate, revoke, or transfer policy authority.

The recommendation is not "introspect everything." It is "use RFC 7662 on the narrow class of routes where the extra network hop is justified."

### 3.3 Gate D Is Planned, Not Implemented

Docs 013-016 define the event path:

- `id` produces standards-shaped security events: SET envelope, OpenID SSF transport, RISC/CAEP vocabulary.
- `content-api` first consumes events in audit mode: verified receiver, receipts, findings, no authorization behavior change.
- local fence enforcement is conditional: add it only after audit mode ships and an operational requirement names a concrete sub-expiry revocation SLA.

The current `content-api` source still has no `identityEventReceipts`, `identityReferenceFindings`, or `identityInvalidationFences` tables. `Actor` also has no verified `iat` field. That means Gate D is a design path, not a deployed runtime control.

### 3.4 M2M Resource-Server Ownership Is Being Corrected

Doc 018 is the canonical M2M/service-account correction. It identifies a current `id` misalignment: `workers/core/src/auth/oauth-provider.ts` still derives M2M `client_id` and `org_id` from `oauthClient.metadata.id_client_id` and `metadata.organization_id`, while Better Auth already has first-class OAuth client ownership through `oauthClient.referenceId` / `clientReference`.

For gated security, this matters because service-account tokens are long-lived relative to user tokens. Before service accounts can perform sensitive IAM mutations in `content-api`, the token issuance path should be moved to the doc 018 model:

- organization ownership through Better Auth `referenceId`;
- per-client/per-resource scope subsets through the `id` extension;
- no synthetic service-account membership in SCIM core;
- resource APIs bind service-account principals locally as `client_id`.

## 4. Standards Classification

| Mechanism | Classification | Recommendation |
|---|---|---|
| Local JWT verification with issuer, audience, expiry, signature, and scope | OAuth/OIDC resource-server pattern; RFC 9068-compatible JWT access-token profile when token shape is standardized | Required on every protected `content-api` route. |
| OAuth `resource` parameter / audience-bound tokens | RFC 8707 protocol standard | Required for Content API access tokens. |
| OpenID Connect Discovery / OAuth Authorization Server Metadata | OpenID/OAuth standards | `content-api` should discover or verify configured issuer metadata during deployment/smoke checks; runtime can use pinned env values. |
| OAuth Protected Resource Metadata | RFC 9728 protocol standard | Recommended for `content-api` to advertise its resource identifier and authorization server. |
| Token introspection | RFC 7662 protocol standard | Use only for sensitive authority-changing routes. |
| Token revocation | RFC 7009 protocol standard | Keep in `id`; do not assume local JWT resource servers observe revocation without introspection or event fences. |
| SCIM read/query for Users and Groups | RFC 7643/RFC 7644 interoperability standard | Replace custom user/team/admin principal-validation calls. |
| OAuth client metadata and management | RFC 7591/RFC 7592-shaped plus Better Auth support | Use for service-account/client reads instead of SCIM core. |
| SET envelope | RFC 8417 protocol standard | Use for security-event payloads. |
| OpenID Shared Signals Framework | OpenID final specification | Use for event stream registration and delivery. |
| OpenID RISC | OpenID final specification | Use for account lifecycle events. |
| OpenID CAEP | OpenID final specification | Use only when session/token/credential/access-change events are needed for audit or fences. |
| Local D1 event fence keyed by token `iat` | Repository-specific enforcement derived from accepted standard events | Conditional; not a standard by itself, but acceptable as local resource-server policy after audit mode and a named SLA. |
| Custom per-request validation from `content-api` to `id` on ordinary routes | Inappropriate workaround | Reject. |
| Custom logout propagation for APIs | Inappropriate workaround | Reject; APIs do not own browser OP sessions. |

## 5. Recommended Gate Model

### 5.1 Gate A - Local JWT Verification On Every Protected Request

Gate A is mandatory and already mostly in place.

Required behavior in `content-api`:

- Verify issuer against `AUTH_ISSUER`.
- Verify `aud` against `AUTH_AUDIENCE`, which should equal the registered Content API resource-server audience.
- Verify signature and expiry through `AUTH_JWKS_URL`.
- Require the route's coarse scope:
  - read routes: `content:read`;
  - content mutations: `content:write`;
  - Content IAM policy mutations: `content:share`.
- Preserve the direct-share rule:
  - no `org_id`;
  - `team_ids = []`;
  - no `content:share`;
  - direct user bindings only after the resource is loaded.
- Preserve workspace context:
  - `org_id` must match the loaded resource organization before team-derived or org-derived authority is used.
- Build service-account actors only from `azp` or `client_id` plus `org_id`.

Recommended refinement:

- Add verified `iat` to `Actor` when Gate D fence work begins. Do not require it before fence enforcement unless tests prove every issued token already has it and no client compatibility risk exists.
- Add an unauthenticated `/.well-known/oauth-protected-resource` response in `content-api` per RFC 9728, advertising:
  - `resource: https://content-api.quanghuy.dev`;
  - `authorization_servers: ["https://id.quanghuy.dev/api/auth"]`;
  - supported scopes or documentation link if the final metadata field set is chosen by the implementation.

Rejected:

- Do not reintroduce Auther-specific `token_use`.
- Do not derive product admin rights from JWT role claims.
- Do not query `id` during ordinary object authorization.

### 5.2 Gate B - RFC 7662 Introspection Only For Authority-Changing Routes

Gate B should be added only to routes that mutate authorization state or trust durable identity references. This is the right latency/security tradeoff.

Recommended `content-api` Gate B candidates:

- `POST /organizations/{orgId}/policy-bindings`
- `DELETE /organizations/{orgId}/policy-bindings/{bindingId}`
- `POST /organizations/{orgId}/policy-denials`
- `DELETE /organizations/{orgId}/policy-denials/{denialId}`
- `POST /organizations/{orgId}/content-iam/bootstrap`
- `POST /organizations/{orgId}/content-admins`
- `DELETE /organizations/{orgId}/content-admins/{bindingId}`
- `POST /organizations/{orgId}/content-roles`
- `PUT /organizations/{orgId}/content-roles/{roleId}/permissions`
- `DELETE /organizations/{orgId}/content-roles/{roleId}`
- `POST /books/{bookId}/policy-bindings`
- `DELETE /books/{bookId}/policy-bindings/{bindingId}`
- `POST /books/{bookId}/policy-denials`
- `DELETE /books/{bookId}/policy-denials/{denialId}`
- `POST /books/{bookId}/ownership-transfer`

Gate B should not be required for ordinary content routes:

- `GET /books`, `GET /books/{id}`;
- `PATCH /books/{id}`;
- publish/schedule/archive when they mutate product state but not authorization state;
- categories, posts, media, reads, and ordinary content mutations.

If a future route is both product mutation and high-risk security mutation, classify it by the authority it changes. Authorization-state changes get Gate B.

Implementation shape:

- Add an `IntrospectPresentedToken` port in `content-api` application or domain boundary.
- Add an infrastructure adapter that calls `id`'s `/api/auth/oauth2/introspect`.
- Authenticate the resource-server caller with a dedicated infrastructure M2M client, not the end user's bearer token.
- Run local JWT verification first. Introspection is a second gate for a syntactically and cryptographically valid token.
- Require `active: true`.
- Compare introspection metadata to the locally verified JWT where fields are available:
  - issuer;
  - audience or resource;
  - subject or client id;
  - scope;
  - expiration.
- Treat introspection transport failure as deny-by-default on Gate B routes.
- Do not cache positive introspection responses for authority-changing routes. The point of Gate B is live status.

### 5.3 Gate C - Standards-Shaped Write-Time Principal Validation

Gate C is for durable policy writes that store a principal reference. It should remain write-time only.

Recommended target:

- User exists / active: `GET /scim/v2/Users/{userId}` or tenant-scoped equivalent.
- User is organization member: tenant-scoped SCIM Users read/query under `/scim/v2/tenants/{orgId}/Users/{userId}`.
- Team exists in organization: tenant-scoped SCIM Group read under `/scim/v2/tenants/{orgId}/Groups/{teamId}`.
- Organization administrator: virtual SCIM Group membership for the organization-admin group, or a documented SCIM extension group exposed by `id`.
- Service-account/client display and binding picker: OAuth client read surface from doc 018, not SCIM core.
- Service-account runtime access: OAuth client credentials with `resource`, local JWT verification, and local Content IAM binding.

Migration recommendation:

- Keep `IdContentPrincipalDirectory` as the compatibility adapter until the SCIM plugin exists.
- Split the port before replacing the adapter:
  - `ContentUserDirectory` for user/org-user/group/admin checks;
  - `OAuthClientDirectory` or `ServiceAccountClientDirectory` for client display/binding checks.
- Once SCIM exists, move user/team/admin calls to the SCIM adapter and delete those principal-validation endpoints.
- Once doc 018 lands, remove `validateServiceAccountForOrganization` from the custom plugin instead of recreating it under a different name.

Rejected:

- Do not present custom exact-ID validation as the durable standard.
- Do not model OAuth clients as SCIM Users or Groups.
- Do not validate target principals on every ordinary request.

### 5.4 Gate D - SET/SSF/RISC Audit First, CAEP/Fences Only When Required

Gate D should follow docs 013-016:

1. Implement audit-only SET receiver in `content-api`.
2. Accept RISC account lifecycle events first.
3. Store receipts and findings.
4. Give operators a way to resolve or ignore findings.
5. Add CAEP audit only when session/token/credential/access-change events are actually emitted by `id`.
6. Add local `iat` fences only after an explicit operational requirement names a sub-expiry revocation SLA.

Recommended event mapping:

- RISC `account-disabled`: finding for direct user bindings and workspace-derived authorities.
- RISC `account-purged`: finding for all local references to the user.
- RISC `identifier-changed` / `identifier-recycled`: finding only; `content-api` keys by `sub`, not email.
- CAEP `session-revoked`: audit-only for APIs unless tied to a concrete token/session subject that `content-api` can enforce.
- CAEP `token-claims-change`: useful only when the Subject Identifier identifies the affected token or principal precisely enough for a resource-server action.
- CAEP `credential-change` with `change_type: revoke`: candidate for service-account credential revocation audit/fence.
- Repository-specific membership/client/scope events: allowed only after they are explicitly classified and documented because no RISC/CAEP event has equivalent semantics.

Fence recommendation:

- Enforce fences in token principal expansion, not inside the core `ContentPolicy.can()` query body.
- Require verified `iat` once fences are enabled.
- Drop only the affected principal from the authorization projection where possible. Example: org membership removal should remove workspace/team authority, not a separate direct-share user binding.
- Keep `ContentPolicy` product semantics independent from event transport details.

## 6. Route-Level Recommendations

| Route class | Examples | Gates | Reason |
|---|---|---|---|
| Public reads | published public book/category/media reads | none or optional Gate A when caller token is present | Public content should not need identity. Optional actor can enrich private visibility. |
| Private/ordinary resource reads | `GET /books/{id}`, `GET /media/{id}` | Gate A + local Content IAM | Fast hot path; no live identity call. |
| Ordinary content writes | `PATCH /books/{id}`, publish/schedule/archive, media updates | Gate A + local Content IAM | Product state mutation, not policy authority mutation. |
| Organization Content IAM writes | `/organizations/{orgId}/policy-*`, `/content-admins`, `/content-roles` | Gate A + Gate B + Gate C where a principal is stored | Mutates authorization state. |
| Book Content IAM writes | `/books/{bookId}/policy-*`, `/ownership-transfer` | Gate A + Gate B + Gate C where a principal is stored | Mutates authorization state or ownership. |
| Service-account binding | binding principal `{ type: "service_account", id: client_id }` | Gate A + Gate B + OAuth client read/attach model from doc 018 | OAuth clients are not SCIM core resources. |
| Identity event receiver | `POST /webhooks/id-events` | HMAC precheck + SET verification + SSF stream contract | Not a bearer-token resource route. |
| Operator event findings | future internal admin endpoints | Gate A + local admin policy; optional Gate B if they mutate security state | Operator can resolve security findings. |

## 7. `id` Resource-Server Recommendations

1. Keep resource-server registration in `workers/core/src/auth/plugins/resource-server/**`.

   The plugin-owned model is correct for Better Auth. Do not move resource-server rows into standalone Drizzle domain tables.

2. Complete the doc 018 M2M correction before enabling service accounts for sensitive `content-api` IAM writes.

   `workers/core/src/auth/oauth-provider.ts` should stop depending on `metadata.id_client_id` and `metadata.organization_id`. The recommended identity source is Better Auth OAuth client ownership through `clientReference` / `oauthClient.referenceId`, plus the per-client/per-resource scope subset extension.

3. Keep `/api/auth/oauth2/introspect` and `/api/auth/oauth2/revoke` documented as standards endpoints with clear resource-server semantics.

   Revocation affects authorization-server state. A resource server that only verifies JWTs locally will not observe revocation until token expiry unless it introspects or applies event-derived local fences.

4. Publish stable issuer and discovery metadata.

   `content-api` runtime can keep pinned env values for speed and failure isolation, but deployment smoke checks should verify `.well-known/openid-configuration` and OAuth metadata agree with `AUTH_ISSUER`, `AUTH_JWKS_URL`, and the token endpoint.

5. Add read-only SCIM for user/team/admin directory lookup as proposed in doc 017.

   Scope it to low-volume, authenticated resource-server callers. Full provisioning stays out of scope.

6. Keep OpenID SSF/SET/RISC/CAEP producer work separate from token issuance.

   Events notify consumers and optionally power local enforcement. They do not replace OAuth token checks, SCIM reads, or local Content IAM.

## 8. `content-api` Implementation Recommendations

Recommended files and changes:

- `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts`
  - keep as Gate A boundary;
  - add `iat` only when Gate D enforcement begins;
  - keep direct-share and service-account validation in token projection.

- `/home/quanghuy1242/pjs/content-api/src/domain/auth/actor.ts`
  - add `iat` only for fence enforcement;
  - avoid adding SCIM or introspection details to the actor type.

- `/home/quanghuy1242/pjs/content-api/src/domain/iam/content-policy.ts`
  - keep local policy evaluation local;
  - do not inject an `id` client;
  - when fences exist, consume an authorization-principal projection rather than querying event tables inside every policy method.

- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts`
  - keep as migration shim;
  - replace with SCIM adapter for user/team/admin;
  - split service-account handling into the doc 018 OAuth-client model.

- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/*.usecase.ts`
  - add a Gate B dependency to use cases that change policy authority;
  - call introspection before principal validation and before committing the IAM mutation.

- `/home/quanghuy1242/pjs/content-api/src/http/routes/content-iam.routes.ts`
  - no major route shape change required;
  - keep org-scoped IAM under `/organizations/{orgId}/...`;
  - ensure every route that changes authority goes through the Gate B-enabled use case.

- `/home/quanghuy1242/pjs/content-api/src/http/routes/books.routes.ts`
  - keep book-scoped IAM under `/books/{bookId}/...`;
  - apply Gate B to policy binding/denial and ownership-transfer routes only, not ordinary book publish/update routes.

- `/home/quanghuy1242/pjs/content-api/src/infrastructure/db/schema.ts`
  - add identity-event audit tables for Gate D audit mode;
  - add fence tables only when the conditional doc 016 trigger is met.

- `/home/quanghuy1242/pjs/content-api/src/http/routes/index.ts` or a dedicated well-known route file
  - add RFC 9728 protected resource metadata for `content-api`.

Configuration recommendations:

- Keep `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL`, and `AUTH_REQUIRED_SCOPE`.
- Add introspection-specific configuration:
  - `ID_INTROSPECTION_URL`;
  - `ID_INTROSPECTION_CLIENT_ID`;
  - `ID_INTROSPECTION_CLIENT_SECRET`;
  - `ID_INTROSPECTION_AUDIENCE` or token endpoint resource if the caller token is resource-bound.
- Keep principal-directory/SCIM caller configuration separate from introspection caller configuration. They are different capabilities.
- Add event-consumer configuration only when Gate D audit work starts:
  - SET issuer;
  - SET JWKS URL;
  - SSF stream id/subscription id;
  - HMAC secret binding or secret storage.

## 9. Migration And Rollout

Recommended sequence:

1. Document and test the current Gate A behavior.

   Add or keep tests for workspace user tokens, direct-share user tokens, M2M tokens, invalid audience, missing scope, direct-share `content:share`, and mismatched org behavior.

2. Add Gate B to Content IAM mutation use cases.

   Start with `content-api` authority-changing routes only. Keep ordinary content routes untouched so latency remains bounded.

3. Ship doc 018's M2M correction in `id`.

   Service-account-sensitive IAM writes should not rely on `metadata.id_client_id` / `metadata.organization_id`.

4. Add read-only SCIM in `id`.

   Keep `principal-validation` in place until `content-api` has a SCIM adapter and tests prove equivalent user/team/admin behavior.

5. Replace `content-api` user/team/admin principal validation with SCIM.

   Preserve the same call sites and low-volume write-time behavior.

6. Remove the obsolete `principal-validation` endpoints after all consumers move.

   If another resource API is added before deletion, require it to use SCIM from the start.

7. Implement Gate D audit mode.

   Ship SET receiver, receipts, findings, and operator resolution without changing authorization decisions.

8. Implement Gate D fences only if the trigger conditions from doc 016 are met.

   Amend doc 013 with the concrete SLA first; then add `iat` and fence enforcement.

## 10. Edge Cases And Failure Modes

- JWKS fetch failure on Gate A: reject protected requests once cache cannot verify the token. Do not fall back to accepting unverifiable tokens.
- JWKS rotation: keep current `id` grace-period behavior and resource-server verifier cache behavior aligned. Test old and new `kid` overlap.
- Introspection timeout on Gate B: deny the authority-changing operation. The route can return a retryable `503` if implementation distinguishes transport failure from inactive token.
- Introspection says inactive after local JWT passed: deny as `401` or `403` consistently with the route's current auth error mapping; do not continue to Gate C.
- Introspection metadata mismatch: deny and log a redacted security event with request id, not the token.
- SCIM user not found or inactive: reject the durable policy write.
- SCIM group/team not found in org: reject the durable policy write.
- Service-account client not readable under doc 018 ownership rules: reject binding or picker display; do not infer validity from a string-shaped `client_id`.
- `id` unavailable during Gate C: reject durable policy writes; ordinary content reads/writes remain available because they do not call `id`.
- Direct-share token presented to Content IAM mutation route: reject before policy mutation because it lacks workspace context and `content:share`.
- Organization member removed after token issuance: ordinary local JWT access remains valid until expiry unless Gate D fences are enabled; audit mode records findings only.
- User disabled: Gate D audit flags references; Gate D fence may later deny pre-event tokens if the operational SLA requires it.
- Service-account disabled with a 10,800-second token lifetime: if no Gate B or fence applies, the stale-token window is up to token expiry. Sensitive IAM routes should use Gate B to avoid this window.
- Event replay: SET `jti` idempotency must make duplicate delivery harmless.
- Event delivery delay: audit/fence SLA must include delivery delay, not claim impossible instant revocation.

## 11. Test And Verification Plan

`content-api` Gate A tests:

- valid workspace user token can read/write only when local Content IAM allows it;
- valid direct-share token can use direct user bindings but cannot mutate Content IAM;
- valid M2M token becomes a service-account actor only when `org_id` is present;
- missing scope, wrong audience, wrong issuer, expired token, and invalid signature fail;
- direct-share token with `team_ids` or `content:share` fails.

`content-api` Gate B tests:

- each Content IAM mutation route calls the introspection port exactly once after local JWT verification;
- inactive introspection response denies the mutation;
- introspection transport failure denies the mutation;
- ordinary book/category/post/media routes do not call introspection;
- policy mutation latency tests can mock introspection so normal test runtime does not regress.

Gate C tests:

- user/team/admin validation uses SCIM adapter once migrated;
- service-account binding uses the doc 018 OAuth-client read/ownership path, not SCIM core;
- `id` outage blocks policy writes but not ordinary resource reads;
- compatibility tests prove principal-validation shim and SCIM adapter return the same decisions before shim deletion.

Gate D audit tests:

- SET signature, issuer, audience, `typ`, `jti`, and `sub_id` are verified;
- duplicate `jti` is idempotent;
- RISC account-disabled/purged events create findings without deleting bindings;
- direct-share findings remain distinct from workspace-derived findings when membership events are introduced.

Gate D fence tests, only when implemented:

- tokens missing `iat` fail;
- token issued before a user-disabled fence loses that user principal;
- token issued after the fence is accepted;
- org membership fence removes workspace/team authority without removing direct-share authority;
- service-account fence blocks disabled client authority on sensitive operations.

`id` tests:

- resource-server catalog updates invalidate audience cache;
- OAuth token issuance enforces resource audience and per-client/per-resource scope subsets;
- introspection and revocation behavior are covered for user and M2M tokens;
- SCIM read-only endpoints require the dedicated caller scope and return stable User/Group shapes;
- SSF/SET producer emits standards-shaped RISC/CAEP events and rejects unregistered consumers.

Required commands after implementation changes:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

For docs-only changes in this repo, run `pnpm lint` and `pnpm test` per `AGENTS.md` unless the change is explicitly exempted by the user.

## 12. Definition Of Done

- `content-api` ordinary protected routes use Gate A and local Content IAM only.
- `content-api` authority-changing IAM routes use Gate A plus Gate B.
- Durable user/team/admin principal references use SCIM read/query as the target contract, with custom principal-validation removed or documented as still temporary until removal.
- Service-account binding follows doc 018's OAuth-client model and does not treat OAuth clients as SCIM core resources.
- `content-api` publishes protected resource metadata or has an explicit documented reason for deferring RFC 9728.
- Gate D audit mode uses SET, OpenID SSF, and RISC before any fence enforcement is added.
- CAEP/fence enforcement is added only after a named operational SLA is recorded in doc 013.
- No recommendation requires per-request calls to `id` on ordinary content routes.
- No recommendation depends on custom logout propagation, custom token revocation semantics, or custom identity protocols where an OpenID/OAuth/SCIM standard fits.

## 13. Final Model

The recommended architecture is a layered resource-server model:

```text
Gate A: local JWT verification
  - all protected routes
  - fast, cacheable, no id network call

Gate B: token introspection
  - Content IAM and ownership/security mutations only
  - live token activity check

Gate C: write-time principal validation
  - SCIM read/query for users, org users, teams, org admin groups
  - OAuth client model for service accounts

Gate D: local event audit/fence
  - SET over OpenID SSF, RISC/CAEP vocabulary
  - audit first
  - fences only for documented sub-expiry revocation requirements
```

This keeps the latency profile from `b.md`: ordinary resource requests stay local, while security-state mutations pay the network cost for stronger guarantees. It also keeps the standards boundary strict: OAuth/OIDC governs tokens and resource-server access, SCIM governs synchronous user/group directory reads, SET/SSF/RISC/CAEP governs asynchronous lifecycle/security signals, and `content-api` remains the sole owner of content-specific IAM decisions.
