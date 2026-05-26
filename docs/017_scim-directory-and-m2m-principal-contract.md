# SCIM Directory And M2M Principal Contract Proposal

> Status: proposal and brainstorming decision record
>
> Date: 2026-05-26
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` - `id` identity provider, OAuth authorization server, Better Auth plugins
> - `/home/quanghuy1242/pjs/content-api` - reference resource API and first consumer of the principal contract
>
> Source docs:
>
> - [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md)
> - [014_identity-event-producer-id.md](014_identity-event-producer-id.md)
> - [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md)
> - [016_identity-event-consumer-content-api-fence-enforcement.md](016_identity-event-consumer-content-api-fence-enforcement.md)
> - [000_repo-architecture.md](000_repo-architecture.md)
> - [005_oauth2-oidc-integration-guide.md](005_oauth2-oidc-integration-guide.md)
> - [006_resource-server-jwt-guide.md](006_resource-server-jwt-guide.md)
> - [010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md)
> - `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**`
> - `/home/quanghuy1242/pjs/content-api/docs/007_content-iam-policy-binding-model.md`
>
> Standards and industry references:
>
> - RFC 7644 - SCIM 2.0 Protocol, <https://www.rfc-editor.org/rfc/rfc7644.html>
> - RFC 7643 - SCIM 2.0 Core Schema, <https://www.rfc-editor.org/rfc/rfc7643.html>
> - RFC 6749 - OAuth 2.0 Authorization Framework, <https://www.rfc-editor.org/rfc/rfc6749.html>
> - RFC 8707 - OAuth 2.0 Resource Indicators, <https://www.rfc-editor.org/rfc/rfc8707.html>
> - RFC 7662 - OAuth 2.0 Token Introspection, <https://www.rfc-editor.org/rfc/rfc7662.html>
> - RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol, <https://www.rfc-editor.org/rfc/rfc7591.html>
> - RFC 7592 - OAuth 2.0 Dynamic Client Registration Management Protocol, <https://www.rfc-editor.org/rfc/rfc7592.html>
> - Google Cloud IAM service-account attach model, <https://docs.cloud.google.com/iam/docs/attach-service-accounts>
>
> Related docs:
>
> - [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) - event-channel decisions that this document corrects around SCIM wording
> - [014_identity-event-producer-id.md](014_identity-event-producer-id.md) - async SET/SSF/RISC producer plan
> - [015_identity-event-consumer-content-api-audit.md](015_identity-event-consumer-content-api-audit.md) - async audit consumer plan
> - [016_identity-event-consumer-content-api-fence-enforcement.md](016_identity-event-consumer-content-api-fence-enforcement.md) - conditional enforcement plan
> - [018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md) - **canonical** M2M / service-account contract; this document defers every service-account decision to 018

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 The Incorrect Framing In Doc 013](#31-the-incorrect-framing-in-doc-013)
  - [3.2 Current `id` Principal Validation Plugin](#32-current-id-principal-validation-plugin)
  - [3.3 Current `content-api` Usage](#33-current-content-api-usage)
  - [3.4 Standards Fit](#34-standards-fit)
- [4. Target Model](#4-target-model)
  - [4.1 Three Identity Channels, Not One Blended Contract](#41-three-identity-channels-not-one-blended-contract)
  - [4.2 Read-Only SCIM Directory Contract](#42-read-only-scim-directory-contract)
  - [4.3 M2M Runtime Contract](#43-m2m-runtime-contract)
- [5. Proposal Decisions](#5-proposal-decisions)
  - [5.1 P17-D1 - Correct Doc 013's SCIM Decision](#51-p17-d1---correct-doc-013s-scim-decision)
  - [5.2 P17-D2 - Replace User/Team/Admin Validation With Read-Only SCIM](#52-p17-d2---replace-userteamadmin-validation-with-read-only-scim)
  - [5.3 P17-D3 - Keep Full SCIM Provisioning Out Of Scope](#53-p17-d3---keep-full-scim-provisioning-out-of-scope)
  - [5.4 P17-D4 - OAuth Clients Are Not SCIM Core Resources](#54-p17-d4---oauth-clients-are-not-scim-core-resources)
  - [5.5 P17-D5 - M2M Binding Semantics Live In Doc 018](#55-p17-d5---m2m-binding-semantics-live-in-doc-018)
  - [5.6 P17-D6 - `id-principal-validation` Becomes A Migration Shim Only](#56-p17-d6---id-principal-validation-becomes-a-migration-shim-only)
- [6. M2M / Service-Account Contract (Canonical: Doc 018)](#6-m2m--service-account-contract-canonical-doc-018)
- [7. Proposed API Shapes](#7-proposed-api-shapes)
  - [7.1 SCIM Routes](#71-scim-routes)
  - [7.2 SCIM Resource Mapping](#72-scim-resource-mapping)
  - [7.3 `content-api` Port Split](#73-content-api-port-split)
  - [7.4 Compatibility Facade](#74-compatibility-facade)
- [8. Implementation Strategy](#8-implementation-strategy)
- [9. Detailed Implementation Plan](#9-detailed-implementation-plan)
  - [9.1 `id` Read-Only SCIM Plugin](#91-id-read-only-scim-plugin)
  - [9.2 `content-api` SCIM Directory Adapter](#92-content-api-scim-directory-adapter)
  - [9.3 M2M Decision Spike](#93-m2m-decision-spike)
  - [9.4 Documentation Corrections](#94-documentation-corrections)
- [10. Migration And Rollout](#10-migration-and-rollout)
- [11. Edge Cases And Failure Modes](#11-edge-cases-and-failure-modes)
- [12. Test And Verification Plan](#12-test-and-verification-plan)
- [13. Implementation Backlog](#13-implementation-backlog)
- [14. Future Backlog](#14-future-backlog)
- [15. Definition Of Done](#15-definition-of-done)
- [16. Final Model](#16-final-model)

## 1. Goal

Define the standards-first replacement path for the current custom `/api/auth/principal-validation/**` surface.

This document is a proposal and brainstorming record. It is intentionally a sibling to docs 013-016 because it corrects the synchronous lookup side of the principal contract while docs 013-016 handle asynchronous event delivery and optional enforcement.

The short version:

- Use SCIM v2 read/query as the synchronous directory contract for users, organization users, teams/groups, and organization administrator membership.
- Keep SET + SSF + RISC/CAEP as the asynchronous identity-event contract from docs 013-016.
- Defer every service-account / M2M decision to [018](018_m2m-oauth-client-org-binding.md), which is canonical. That document adopts Better Auth's first-class OAuth-client model (`referenceId` ownership, RFC 7591/7592-shaped endpoints, `clientPrivileges` RBAC) and replaces the repo-specific `oauthClientOrganizationGrant` table with a narrower per-(client, resource) scope projection.
- This document's remaining M2M sections describe service-account *consumer* expectations in `content-api` for cross-reference; the *producer* side and the source of truth for OAuth-client identity live in 018.

Non-goals:

- Implement full SCIM provisioning (`POST`, `PUT`, `PATCH`, `DELETE`, `/Bulk`) in the first replacement.
- Move Content IAM role evaluation into `id`.
- Treat SCIM as a substitute for SET/SSF/RISC/CAEP events.
- Treat OAuth service accounts as SCIM core Users or Groups without a separate approved extension.

## 2. System Summary

Current:

```text
content-api durable IAM write
  -> custom POST /api/auth/principal-validation/users/validate
  -> custom POST /api/auth/principal-validation/users/validate-organization-member
  -> custom POST /api/auth/principal-validation/teams/validate-organization-team
  -> custom POST /api/auth/principal-validation/service-accounts/validate-organization-grant
  -> custom POST /api/auth/principal-validation/organization-administrators/validate
```

Target:

```text
User/team/admin directory lookup:
  content-api -> id read-only SCIM v2

Service-account runtime access:
  service account holder -> id OAuth token endpoint
  service account holder -> content-api with OAuth access token

Service-account bind/attach workflow:
  unresolved proposal space:
    A. proof token at binding time
    B. GCP-style attach/use split
    C. OAuth AS management extension

Identity lifecycle notification:
  id -> content-api SET over SSF with RISC/CAEP vocabulary
```

The key correction is that SCIM and RISC do not replace each other. SCIM is the synchronous directory read/query protocol. SET/SSF/RISC/CAEP is the asynchronous event and security signal channel.

## 3. Current-State Findings

### 3.1 The Incorrect Framing In Doc 013

[013 §5.8](013_identity-event-standards-and-decisions.md#58-d8--scim-readquery-is-separate-from-full-provisioning) previously said:

```text
The combination of write-time principal-validation (synchronous) + Phase 1 RISC notification (asynchronous) covers the principal-lifecycle synchronization need without the cost of a full SCIM server.
```

The problem is not the rollout caution. The problem is the category mix:

- `principal-validation` is a repository-specific synchronous API.
- RISC is an asynchronous account-lifecycle vocabulary.
- SCIM is the standardized synchronous read/query protocol for Users and Groups.

Saying "custom synchronous validation + standard asynchronous events covers the need" can be read as "a custom API is an acceptable substitute for the standard directory protocol." That is not consistent with `a.md` or `AGENTS.md`'s standards-first posture.

Corrected framing:

```text
SCIM read/query is the applicable standard for synchronous User/Group directory lookup.

SET + SSF + RISC/CAEP is the applicable standard stack for asynchronous lifecycle/security notification.

The current principal-validation API is a temporary compatibility surface, not the target contract.
```

### 3.2 Current `id` Principal Validation Plugin

Current files:

- [workers/core/src/auth/plugins/principal-validation/index.ts](../workers/core/src/auth/plugins/principal-validation/index.ts)
- [workers/core/src/auth/plugins/principal-validation/operations.ts](../workers/core/src/auth/plugins/principal-validation/operations.ts)
- [workers/core/src/auth/plugins/principal-validation/schema.ts](../workers/core/src/auth/plugins/principal-validation/schema.ts)
- [workers/core/src/auth/plugins/principal-validation/types.ts](../workers/core/src/auth/plugins/principal-validation/types.ts)
- [workers/core/src/auth/plugins/principal-validation/README.md](../workers/core/src/auth/plugins/principal-validation/README.md)
- [workers/core/tests/auth/principal-validation.test.ts](../workers/core/tests/auth/principal-validation.test.ts)

The plugin currently exposes boolean-style POST endpoints:

| Endpoint | Current meaning | Standards replacement candidate |
|---|---|---|
| `POST /api/auth/principal-validation/users/validate` | User exists and is not banned | `GET /scim/v2/Users/{userId}` with `active != false` |
| `POST /api/auth/principal-validation/users/validate-organization-member` | User exists and belongs to org | `GET /scim/v2/tenants/{orgId}/Users/{userId}` |
| `POST /api/auth/principal-validation/teams/validate-organization-team` | Team exists inside org | `GET /scim/v2/tenants/{orgId}/Groups/{teamId}` |
| `POST /api/auth/principal-validation/organization-administrators/validate` | User has Better Auth `owner` or `admin` role | virtual SCIM Group, e.g. `GET /scim/v2/tenants/{orgId}/Groups/org-admins` |
| ~~`POST /api/auth/principal-validation/service-accounts/validate-organization-grant`~~ (deleted by doc 018) | OAuth client, resource server, and client/org/resource grant are enabled | replaced by token-issuance enforcement at `/api/auth/oauth2/token` via `oauthClientResourceScope` (doc 018 §4.4); see §6 |

The caller authentication shape is good: `assertPrincipalValidationCaller` verifies a bearer token against the issuer, audience, and required scope. The replacement SCIM endpoints should preserve that model with a dedicated SCIM audience and scope.

### 3.3 Current `content-api` Usage

Current files:

- `/home/quanghuy1242/pjs/content-api/src/domain/iam/content-principal-directory.ts`
- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts`
- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/client-credentials-token-provider.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/create-policy-binding.usecase.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/create-policy-denial.usecase.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/bootstrap-organization-content-admin.usecase.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/delegate-organization-content-admin.usecase.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/transfer-book-ownership.usecase.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/books/create-book.usecase.ts`

Observed usage:

- User and team validation happens only during durable IAM writes or ownership/admin workflows.
- Service-account validation happens only when creating a binding or denial targeting a `service_account` principal.
- Runtime service-account access already uses the OAuth token contract. `AuthenticateBearerTokenUseCase` projects `azp`/`client_id` and `org_id` into a `service_account` actor. `ContentPolicy.principalsForActor` contributes the service-account principal only when token `org_id` matches the resource org.
- `content-api` obtains its own M2M token for calling `id`. That caller token is separate from the service account being bound.

This means SCIM replacement can be low volume and synchronous. It is not a per-request hot path.

### 3.4 Standards Fit

SCIM fit:

- RFC 7644 defines SCIM as an HTTP protocol that supports creation, modification, retrieval, and discovery of Users and Groups.
- RFC 7644 also describes retrieving known resources and querying resource endpoints. A read-only profile can expose `GET` and query behavior while advertising unsupported mutability.
- RFC 7643 defines core User and Group schemas. Users have `active`; Groups have `displayName` and `members`.
- RFC 7644 does not define a SCIM-specific authentication scheme. OAuth bearer tokens over TLS are an accepted pattern.
- RFC 7644 does not define multi-tenancy. Tenant scoping in the URL path (`/scim/v2/tenants/{orgId}/...`) is an established interoperability pattern across SCIM implementations, not a SCIM-native construct. The choice in this proposal is classified as a repository-specific URL convention layered on top of the standard resource model.

Standards fit for OAuth client / service-account read shape:

- RFC 7591 (Dynamic Client Registration Protocol) defines `POST /register` for creating OAuth clients.
- RFC 7592 (Dynamic Client Registration Management Protocol) defines `GET /register/{client_id}`, `PUT /register/{client_id}`, and `DELETE /register/{client_id}` for reading and managing an already-registered OAuth client. That is the standards-shaped surface for "read OAuth client metadata," not SCIM core.
- Neither RFC 7591 nor RFC 7592 defines the `(client_id, organization_id, resource)` grant triple used by `oauthClientOrganizationGrant`. That object remains a repository-specific extension regardless of which read surface fronts it.

OAuth fit for M2M runtime:

- OAuth client credentials is the standard flow for a client acting on its own behalf.
- RFC 8707 `resource` is the standard request parameter for the target resource server/audience.
- RFC 7662 introspection is the standard live check for a presented token's active state and metadata when local JWT verification is insufficient.

GCP service-account analogy:

- Google Cloud separates "use service account credentials at runtime" from "attach a service account to a resource."
- Attaching a service account requires an attach/act-as permission such as Service Account User / `iam.serviceAccounts.actAs`.
- That model suggests the human admin who binds or attaches a service account does not necessarily hold the service account secret.

Apparent conflict with `b.md` §4 ("On-Demand Validation with Async Catch-Up is highly preferred over SCIM"):

- `b.md` was rejecting SCIM-as-a-mirrored-provisioning-target where `content-api` would store a local copy of the user directory and process push provisioning.
- This proposal adopts SCIM-as-an-on-demand-read-protocol. `content-api` does not mirror users or groups; it calls SCIM `GET` exactly at the same moments it currently calls `principal-validation`, with the same on-demand cardinality and the same async-catch-up posture from docs 013-016.
- Both positions are consistent: full SCIM provisioning is still rejected (see §5.3); only the synchronous read/query subset is adopted.

## 4. Target Model

### 4.1 Three Identity Channels, Not One Blended Contract

The target has three separate channels:

| Channel | Standard | Direction | Purpose |
|---|---|---|---|
| Synchronous directory lookup | SCIM v2 read/query | `content-api` -> `id` | Validate durable references to users, org users, groups/teams, org admin groups |
| Runtime token authentication | OAuth 2.x / OIDC-adjacent JWT, RFC 8707, optional RFC 7662 | client -> `id` -> `content-api` | Let a user or service account obtain and present a token for `content-api` |
| Async lifecycle/security events | SET + SSF + RISC/CAEP | `id` -> `content-api` | Notify/audit/enforce state changes after tokens or bindings already exist |

Rules:

- Do not claim one channel replaces another.
- Do not use asynchronous RISC as an argument against synchronous SCIM read/query.
- Do not use custom write-time validation as a permanent substitute for SCIM directory lookup.
- Do not move Content IAM role decisions into `id`.

### 4.2 Read-Only SCIM Directory Contract

First SCIM release is a read-only directory profile.

Routes:

```text
GET /scim/v2/ServiceProviderConfig
GET /scim/v2/Schemas
GET /scim/v2/ResourceTypes
GET /scim/v2/Users/{userId}
GET /scim/v2/Users?filter=...
GET /scim/v2/tenants/{orgId}/Users/{userId}
GET /scim/v2/tenants/{orgId}/Groups/{groupId}
GET /scim/v2/tenants/{orgId}/Groups?filter=...
```

Unsupported methods return `405 Method Not Allowed` or are advertised as unsupported through `ServiceProviderConfig`.

Authentication:

```text
Authorization: Bearer <M2M token>
aud = https://id.example/scim
scope = identity:directory:read
Accept: application/scim+json
```

Tenant path profile:

```text
/scim/v2/tenants/{orgId}/Users/{userId}
  means "this user exists, is active, and is a current member of orgId."

/scim/v2/tenants/{orgId}/Groups/{teamId}
  means "this team/group exists inside orgId."

/scim/v2/tenants/{orgId}/Groups/org-admins
  means "virtual group of Better Auth owner/admin members for orgId."
```

### 4.3 M2M Runtime Contract

Runtime service-account access stays OAuth-native. The full producer-side specification (`oauthClient.referenceId` ownership, `oauthClientResourceScope` scope-subset enforcement, `customAccessTokenClaims` projection) lives in [018 §4.3-§4.4 and §7.3](018_m2m-oauth-client-org-binding.md). What `content-api` sees at runtime is the resulting JWT:

```text
access token claims:
  aud = <content-api audience>
  azp/client_id = <service account client id>
  org_id = <organization id, sourced from oauthClient.referenceId per 018 D1>
  scope = <granted scopes, intersected with oauthClientResourceScope.allowed_scopes per 018 D2>
  exp = <expiry>
  iat = <issued at>
```

`content-api` verifies the token locally through JWKS or calls RFC 7662 introspection for routes that need live status. The token-issuance grant check that today's `validateServiceAccountForOrganization` performs at write time is enforced at `/api/auth/oauth2/token` by `id` (see [018 §4.4 Flow B](018_m2m-oauth-client-org-binding.md#44-end-to-end-m2m-flows)).

## 5. Proposal Decisions

These are proposal decisions, not implementation-completed decisions. They should become final only after review and after doc 013 is amended.

### 5.1 P17-D1 - Correct Doc 013's SCIM Decision

**Proposal**: Amend doc 013 D8. Replace "SCIM is not adopted" with a narrower decision:

```text
SCIM read/query is the target synchronous directory contract for User and Group lookup.
Full SCIM provisioning is not adopted for first release.
```

**Reasoning**: SCIM is not only push provisioning. It is also the standard HTTP protocol for retrieving and querying Users and Groups. The old D8 wording conflates "not building full provisioning" with "not adopting SCIM as the directory lookup contract."

### 5.2 P17-D2 - Replace User/Team/Admin Validation With Read-Only SCIM

**Proposal**: Build an `idScimDirectory` read-only plugin in `id` and migrate `content-api` user/team/admin write-time checks to it.

**Applies to**:

- users;
- org-scoped users;
- teams as SCIM Groups;
- organization administrators as a virtual SCIM Group.

**Does not apply to**:

- OAuth service-account org/resource grants;
- content roles, bindings, denials, or permissions.

### 5.3 P17-D3 - Keep Full SCIM Provisioning Out Of Scope

**Proposal**: The first SCIM release supports read/query only. It does not allow external systems to create, update, patch, delete, or bulk-load `id` users/teams.

**Reasoning**: The immediate correction is replacing a custom synchronous lookup surface. Provisioning is a separate product capability with larger lifecycle, conflict, privacy, and audit consequences.

### 5.4 P17-D4 - OAuth Clients Are Not SCIM Core Resources

**Proposal**: Do not map OAuth clients/service accounts into SCIM core `User` or `Group` resources. OAuth-client identity is governed by Better Auth's first-class OAuth-provider primitives plus the repo's `oauthClientResourceScope` projection, as defined in [018](018_m2m-oauth-client-org-binding.md).

**Reasoning**:

- SCIM core Users and Groups do not model OAuth client credentials, resource indicators, token issuance, client metadata, or org/resource grants.
- BA's `@better-auth/oauth-provider` already implements RFC 7591/7592-shaped endpoints (`/oauth2/register`, `/oauth2/get-client`, etc.) and `client_credentials` natively. SCIM is unnecessary for the OAuth-client read shape.
- A SCIM service-account ResourceType is recorded as future backlog in [018 §11](018_m2m-oauth-client-org-binding.md#11-future-backlog); using SCIM core for OAuth clients today would hide an OAuth authorization-server concept under the wrong standard.

### 5.5 P17-D5 - M2M Binding Semantics Live In Doc 018

**Proposal**: All decisions about how a service-account principal is created, owned, attached, validated, and used live in [018](018_m2m-oauth-client-org-binding.md). This document does not duplicate or override those decisions; it only references them for cross-doc readability.

**Reasoning**:

- The investigation that produced this doc surfaced that BA's `oauth-provider` already provides first-class M2M support (native `client_credentials` grant, `clientReference` for org ownership, RFC 7591/7592-shaped endpoints, `clientPrivileges` RBAC) and that the repo had not wired these primitives up.
- Doc 018 is the canonical correction. It records that the irreducible repo-specific extension is the per-(client, resource) scope projection (`oauthClientResourceScope`), removes duplicate fields like `metadata.id_client_id`/`metadata.organization_id`, drops the many-to-many `oauthClientOrganizationGrant` table, and aligns binding flow on standards.
- Keeping multiple sources of truth for M2M decisions is the same mistake the original `principal-validation` plugin made.

### 5.6 P17-D6 - `id-principal-validation` Becomes A Migration Shim Only

**Proposal**: Freeze the current custom plugin as a compatibility shim. Do not add new principal types or expand consumer dependence on it. Once SCIM and the selected M2M approach ship, remove the plugin and tests.

**Reasoning**: The plugin was useful as a temporary exact-ID bridge. Keeping it as the long-term contract would normalize a custom identity API where standards apply.

## 6. M2M / Service-Account Contract (Canonical: Doc 018)

All service-account decisions in this repository live in [018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md). The corrected investigation found that Better Auth already provides first-class OAuth-client primitives (native `client_credentials`, RFC 7591/7592-shaped endpoints, `clientReference` for org ownership, `clientPrivileges` for RBAC), and that the only irreducible repo extension is the per-(client, resource) scope projection (`oauthClientResourceScope`).

Read 018 for:

- the M2M wire-level flows (create, token issuance, attach, reconciliation, revoke);
- the `oauthClient.referenceId`-based ownership decision (018 D1);
- the replacement of `oauthClientOrganizationGrant` with `oauthClientResourceScope` (018 D2);
- the picker endpoint based on BA's `/api/auth/oauth2/get-client` (018 D3);
- the binding/attach authority that lives in `content-api`, not `id` (018 D4);
- the removal of `metadata.id_client_id` / `metadata.organization_id` (018 D5);
- the migration plan and implementation backlog.

This document does not duplicate those decisions. Earlier drafts of §6 in 017 evaluated three M2M options (proof token, attach/use split, AS management extension) and proposed an RFC 7592 read profile - that material is superseded by 018's standards-aligned recommendation and is not retained here.

What stays in 017 for M2M:

- §4.3 records the runtime token claims that `content-api` consumes as a JWT.
- §7.3 records the `content-api` port for consuming the OAuth-client picker.
- §9 and §13 reference 018 for the producer-side implementation work.
- The remaining sections of 017 are entirely about synchronous user/team/admin SCIM directory lookup.

## 7. Proposed API Shapes

### 7.1 SCIM Routes

Read-only SCIM plugin location:

```text
workers/core/src/auth/plugins/scim-directory/
  README.md
  index.ts
  operations.ts
  schema.ts
  types.ts
  resources.ts
  filters.ts
```

Routes under the Better Auth/core worker:

```text
GET /scim/v2/ServiceProviderConfig
GET /scim/v2/Schemas
GET /scim/v2/ResourceTypes
GET /scim/v2/Users/{userId}
GET /scim/v2/Users?filter=id eq "user_..."
GET /scim/v2/tenants/{orgId}/Users/{userId}
GET /scim/v2/tenants/{orgId}/Groups/{groupId}
GET /scim/v2/tenants/{orgId}/Groups?filter=id eq "team_..."
GET /scim/v2/tenants/{orgId}/Groups?filter=id eq "org-admins" and members.value eq "user_..."
```

Tenant-path classification:

- RFC 7644 does not define multi-tenancy. The `/scim/v2/tenants/{orgId}/...` shape is a repository-specific URL convention layered on top of SCIM core, classified as an established interoperability pattern rather than a SCIM-native feature.
- Alternative tenant shapes (subdomain per tenant; tenant ID in a request header) are also acceptable interop choices. Path-prefix is selected here because it mirrors the existing principal-validation org-scoped routes and gives org membership a clear, self-describing URL identity for logs and audit.
- This choice should be advertised in `ServiceProviderConfig` documentation so external SCIM clients understand that the tenant prefix is not standard SCIM addressing.

Content type:

```text
application/scim+json
```

Unsupported methods:

```text
POST /scim/v2/Users -> 405
PUT /scim/v2/Users/{id} -> 405
PATCH /scim/v2/Users/{id} -> 405
DELETE /scim/v2/Users/{id} -> 405
```

### 7.2 SCIM Resource Mapping

User:

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "user_123",
  "userName": "user_123",
  "active": true,
  "meta": {
    "resourceType": "User",
    "location": "https://id.example/scim/v2/Users/user_123"
  }
}
```

Banned/disabled user policy:

- Return the SCIM User with `active: false` rather than `404`. This is the SCIM-standard shape and lets consumers distinguish "principal does not exist" from "principal exists but is disabled at the IdP."
- `content-api` durable IAM writes should treat `active: false` as a validation failure today, identical in effect to `404`, so behavior parity with `principal-validation` is preserved.
- Returning the resource also lets future event-channel consumers (docs 015/016) reconcile audit findings against a confirmed-disabled state without a second lookup.
- A `404`-on-disabled posture is rejected because it forecloses this distinction and forces the caller to infer state from absence.

Privacy rule: do not expose email, name, or avatar by default. Add attributes only when a consumer requirement and authorization rule exist.

Org-scoped User:

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "https://id.example/scim/schemas/tenant-membership"
  ],
  "id": "user_123",
  "userName": "user_123",
  "active": true,
  "https://id.example/scim/schemas/tenant-membership": {
    "tenantId": "org_1",
    "role": "admin"
  },
  "meta": {
    "resourceType": "User",
    "location": "https://id.example/scim/v2/tenants/org_1/Users/user_123"
  }
}
```

Team as Group:

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
  "id": "team_editorial",
  "displayName": "Editorial",
  "members": [],
  "meta": {
    "resourceType": "Group",
    "location": "https://id.example/scim/v2/tenants/org_1/Groups/team_editorial"
  }
}
```

Virtual org-admin Group:

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
  "id": "org-admins",
  "displayName": "Organization Administrators",
  "members": [
    {
      "value": "user_admin",
      "$ref": "https://id.example/scim/v2/tenants/org_1/Users/user_admin",
      "display": "user_admin"
    }
  ],
  "meta": {
    "resourceType": "Group",
    "location": "https://id.example/scim/v2/tenants/org_1/Groups/org-admins"
  }
}
```

Large-group rule: `content-api` should prefer a filtered query for membership checks instead of retrieving an unbounded `members` array.

### 7.3 `content-api` Port Split

Current:

```ts
export interface ContentPrincipalDirectory {
  validateUser(params: { userId: string }): Promise<void>;
  validateUserInOrganization(params: { userId: string; orgId: string }): Promise<void>;
  validateTeamInOrganization(params: { teamId: string; orgId: string }): Promise<void>;
  validateServiceAccountForOrganization(params: { clientId: string; orgId: string; resource: string }): Promise<void>;
  validateOrganizationAdministrator(params: { userId: string; orgId: string }): Promise<void>;
}
```

Proposed:

```ts
export interface IdentityDirectory {
  getUser(params: { userId: string }): Promise<ScimUser | null>;
  getOrgUser(params: { userId: string; orgId: string }): Promise<ScimUser | null>;
  getOrgGroup(params: { groupId: string; orgId: string }): Promise<ScimGroup | null>;
  isOrgGroupMember(params: { groupId: string; userId: string; orgId: string }): Promise<boolean>;
}
```

M2M should not stay in this interface. Under [018 §7.6](018_m2m-oauth-client-org-binding.md#76-content-api-binding-side), the `content-api` side has two M2M-shaped ports:

```ts
export interface ServiceAccountAttachmentPolicy {
  assertCanAttach(params: {
    actor: Actor;
    clientId: string;
    orgId: string;
    resource: string;
  }): Promise<void>;
}

export interface OAuthClientDirectory {
  // Calls id's GET /api/auth/oauth2/get-client (BA stock RFC 7592-shaped endpoint).
  // Returns non-secret client metadata. Never returns client_secret.
  getClient(params: { clientId: string }): Promise<OAuthClientMetadata | null>;
}
```

`ServiceAccountAttachmentPolicy` is local to `content-api` and enforces local authority (e.g. `service_account.attach` or `org.manage_bindings`). `OAuthClientDirectory` is the cross-repo port; under 018 it calls Better Auth's stock `/oauth2/get-client` endpoint authorized with the `oauth:clients:read` M2M scope. No new `id`-side endpoint is added beyond authorizing that scope on the existing BA route.

### 7.4 Compatibility Facade

During migration, `id-principal-validation` may remain mounted but should be implemented as a facade:

```text
validateUser
  -> SCIM getUser

validateUserInOrganization
  -> SCIM getOrgUser

validateTeamInOrganization
  -> SCIM getOrgGroup

validateOrganizationAdministrator
  -> SCIM isOrgGroupMember(org-admins)

validateServiceAccountForOrganization
  -> selected M2M option
```

Facade rules:

- No new consumer should be added.
- No new endpoint should be added.
- README labels it deprecated.
- Route contract tests assert compatibility until `content-api` is migrated.

## 8. Implementation Strategy

Phase order:

```text
Phase 0 - proposal review
  agree on SCIM read-only target
  choose M2M option B or C for human admin binding

Phase 1 - id read-only SCIM
  build plugin, routes, schemas, auth, tests
  keep principal-validation untouched

Phase 2 - content-api SCIM adapter
  introduce IdentityDirectory
  migrate user/team/admin validation call sites
  retain M2M behavior behind old path until option is selected

Phase 3 - M2M decision implementation
  implement selected option
  update service-account binding/denial workflows

Phase 4 - compatibility and deletion
  make principal-validation facade
  remove content-api calls
  delete plugin after no consumers remain
```

Rollback:

- Phase 1 is additive; rollback by unmounting SCIM routes.
- Phase 2 keeps old adapter available; rollback by switching binding to old `ContentPrincipalDirectory`.
- Phase 3 depends on selected M2M design; rollback plan must be written when the option is chosen.

## 9. Detailed Implementation Plan

### 9.1 `id` Read-Only SCIM Plugin

Current problem:

- `id` exposes custom exact-ID validation endpoints for directory facts that SCIM already models.

Target behavior:

- `id` exposes a read-only SCIM v2 profile for User and Group lookup.

Better Auth gap and classification:

- Better Auth does not ship a SCIM server. This plugin is the implementation of the SCIM wire contract on top of Better Auth's `user`, `member`, and `team` tables, not a wrapper around an existing BA capability.
- The plugin is therefore classified as: standards-shaped HTTP contract (RFC 7644 read/query) implemented as a repository-specific Better Auth plugin. The wire contract is standard; the implementation strategy is repository-specific.
- This classification matters for the architecture lint and review path: new SCIM-shaped routes belong inside this plugin's directory, not as ad-hoc additions to `get-auth.ts` mounting code.

Implementation tasks:

- [ ] Add `workers/core/src/auth/plugins/scim-directory/README.md` describing the read-only SCIM profile and unsupported provisioning.
- [ ] Add `schema.ts` for SCIM response Zod schemas or typed builders. No custom DB table is required for read-only projection.
- [ ] Add `types.ts` for SCIM User, Group, ListResponse, Error, ServiceProviderConfig, Schema, and ResourceType types.
- [ ] Add `operations.ts` with Better Auth adapter reads from `user`, `member`, and `team`.
- [ ] Add `filters.ts` with a deliberately small parser for approved filters only: `id eq`, `userName eq`, and `members.value eq` where required.
- [ ] Add `resources.ts` mappers from Better Auth rows to SCIM resource JSON.
- [ ] Add `index.ts` with read-only endpoints and auth checks.
- [ ] Register the plugin or route mount in `workers/core/src/auth/get-auth.ts` or approved core auth mounting file.
- [ ] Add route contract tests under `workers/core/tests/auth/scim-directory.test.ts`.
- [ ] Add tests for banned users returning not found or inactive according to the final privacy decision.
- [ ] Add tests for cross-org team lookup returning `404`.
- [ ] Add tests for unsupported mutation methods returning `405`.

Tests:

- `pnpm test -- --run workers/core/tests/auth/scim-directory.test.ts`
- `pnpm lint`

### 9.2 `content-api` SCIM Directory Adapter

Current problem:

- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts` calls custom POST validation endpoints.

Target behavior:

- `content-api` uses SCIM GET/query for user/team/admin checks.

Implementation tasks:

- [ ] Add `src/domain/iam/identity-directory.ts` with the `IdentityDirectory` interface.
- [ ] Add `src/infrastructure/identity/id-scim-identity-directory.ts`.
- [ ] Reuse `ClientCredentialsTokenProvider`, but rename environment variables away from principal-validation when migration completes.
- [ ] Update `CreatePolicyBindingUseCase`, `CreatePolicyDenialUseCase`, `DelegateOrganizationContentAdminUseCase`, `BootstrapOrganizationContentAdminUseCase`, `TransferBookOwnershipUseCase`, and `CreateBookUseCase` to depend on `IdentityDirectory` for user/team/admin facts.
- [ ] Keep service-account handling behind a separate temporary port until §9.3 is resolved.
- [ ] Update `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` after implementation.

Tests:

- Existing Content IAM use-case tests should pass with the SCIM adapter mocked.
- Add adapter tests for status mapping: `200` -> success, `404` -> validation failure, `401` -> unauthorized integration, malformed SCIM -> validation failure.

### 9.3 M2M Implementation (Owned By Doc 018)

The M2M / service-account implementation is owned in full by [018 §6-§7](018_m2m-oauth-client-org-binding.md#6-implementation-strategy). This subsection exists only to record the cross-doc dependency for readers of 017.

Implementation work owned by 018 (not duplicated here):

- Wire `clientReference` in `workers/core/src/auth/oauth-provider.ts` (018 §7.1).
- Replace `oauthClientOrganizationGrant` with `oauthClientResourceScope` (018 §7.2).
- Migrate token issuance to read from `referenceId` + `oauthClientResourceScope` (018 §7.3).
- Authorize BA's `/api/auth/oauth2/get-client` for M2M caller via `oauth:clients:read` (018 §7.4).
- Broaden `clientPrivileges` for org-member RBAC (018 §7.5).
- Add `ServiceAccountAttachmentPolicy` and `OAuthClientDirectory` in `content-api` (018 §7.6).
- Run the data migration backfilling `referenceId` (018 §7.2, §8).

What 017's R17-* work must coordinate with 018:

- The principal-validation deletion in R17-E only proceeds after 018's R18-G has removed `oauthClientOrganizationGrant`, `grants.ts`, and all `metadata.id_client_id`/`metadata.organization_id` references. R17-E and R18-G should land in the same release window to keep the deprecation log clean.

### 9.4 Documentation Corrections

Current problem:

- Docs 013 and content-api skills still frame custom validation as the v1 contract.

Target behavior:

- Docs distinguish SCIM directory lookup, OAuth runtime tokens, and event delivery.

Implementation tasks:

- [x] Amend [013 §5.8](013_identity-event-standards-and-decisions.md#58-d8--scim-readquery-is-separate-from-full-provisioning) so the event-channel decision no longer rejects SCIM read/query.
- [x] Update [014](014_identity-event-producer-id.md), [015](015_identity-event-consumer-content-api-audit.md), and [016](016_identity-event-consumer-content-api-fence-enforcement.md) where they mention the temporary principal-validation contract.
- [ ] Update `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` after implementation, not before, so the skill reflects current code.
- [ ] Update README only if public routes, setup, or commands change.

## 10. Migration And Rollout

Suggested rollout:

1. Add read-only SCIM in `id` with no consumer changes.
2. Provision a dedicated SCIM M2M audience and scope:

   ```text
   audience = https://id.example/scim
   scope = identity:directory:read
   ```

3. Update `content-api` configuration to include SCIM token settings while keeping existing principal-validation settings.
4. Migrate user/team/admin call sites to SCIM.
5. Run both adapters in tests until behavior parity is proven.
6. Implement M2M recommended path (§6.5): switch service-account binding to Option B and add the RFC 7592-shaped client read endpoint in `id` for picker UX.
7. Mark `id-principal-validation` deprecated in the plugin README and emit a structured deprecation log on every call.
8. Remove the compatibility plugin per the deprecation window below.

Deprecation window for `principal-validation`:

| Milestone | Trigger | Duration |
|---|---|---|
| T0 - Deprecated | All `content-api` user/team/admin call sites migrated to SCIM and recommended M2M path is shipped | Day 0 |
| T0 + 30 days | Deprecation log monitored. Any call from a non-test caller blocks removal and is treated as a missed migration. | 30 days |
| T0 + 60 days | If no calls for 30 consecutive days, plugin routes return `410 Gone` with a migration pointer. | 30 days |
| T0 + 90 days | Plugin source, tests, env vars, and content-api token cache keys deleted from both repos. | Hard removal |

Operational notes:

- SCIM endpoints should be rate limited like other machine-to-machine admin/data endpoints.
- SCIM response bodies should avoid PII by default.
- Logs should record route, caller client id, status, and resource type, not bearer tokens or full response payloads.
- The deprecation log line for `principal-validation` must be machine-parseable so the 30/60/90 monitoring is automatable, not eyeballed.

## 11. Edge Cases And Failure Modes

| Scenario | Expected handling |
|---|---|
SCIM directory edge cases (this doc):

| Scenario | Expected handling |
|---|---|
| User exists but is banned/disabled | Return SCIM User with `active: false`. `content-api` treats `active: false` as a validation failure equivalent to `404`. `404`-on-disabled is rejected (see §7.2). |
| User exists globally but not in org | `GET /scim/v2/tenants/{orgId}/Users/{userId}` returns `404`. |
| Team exists in another org | Tenant-scoped Group lookup returns `404`. |
| `org-admins` virtual group has many members | Use filtered query for membership checks; do not require fetching full `members` by default. |
| SCIM caller token has wrong audience | `401`. |
| SCIM caller token lacks `identity:directory:read` | `403`. |
| Unsupported SCIM filter | `400` SCIM error with `scimType` describing invalid filter. |
| Unsupported provisioning method | `405`. |
| SCIM outage during IAM write | IAM write fails closed for user/team/admin durable references. |
| `id` and `content-api` deploy out of order | Keep compatibility facade until both deployments are complete. |
| `principal-validation` call observed during deprecation window | Treated as a missed migration: blocks T0 + 60 day transition to `410 Gone`. Investigate caller, complete migration, restart the 30-day clean window. |

Service-account / M2M edge cases live in [018 §9](018_m2m-oauth-client-org-binding.md#9-edge-cases-and-failure-modes). That set covers picker mishandling, inert bindings, `referenceId` mismatches, attempted cross-org reassignment, migration data drift, and disabled-resource-scope rejection.

## 12. Test And Verification Plan

`id` tests:

- `workers/core/tests/auth/scim-directory.test.ts`
  - SCIM ServiceProviderConfig advertises read-only support.
  - User lookup returns SCIM User for active user.
  - Missing user returns SCIM error status.
  - Banned user follows selected privacy policy.
  - Tenant user lookup requires membership.
  - Team lookup requires matching org.
  - `org-admins` membership query matches Better Auth `owner`/`admin`.
  - Caller token audience/scope are enforced.
  - Unsupported mutation methods return `405`.

`content-api` tests:

- Identity directory adapter maps SCIM `404` to validation failure.
- Binding creation for ordinary direct user uses global User lookup.
- Sensitive user binding uses tenant User lookup.
- Team binding uses tenant Group lookup.
- Bootstrap org content admin uses `org-admins` membership.
- Service-account tests are updated according to the selected §6 option.

Cross-repo smoke:

- Create user/team/org admin in `id`.
- Issue SCIM caller M2M token.
- Call SCIM routes manually.
- Run a `content-api` binding creation using the SCIM adapter.
- Issue a service-account `client_credentials` token and verify runtime access still uses OAuth.

Commands:

```sh
pnpm lint
pnpm test
pnpm typecheck
```

Run `pnpm check` before merging implementation changes.

## 13. Implementation Backlog

### R17-A. Correct Standards Framing

Scope:

- `docs/013_identity-event-standards-and-decisions.md`
- `docs/017_scim-directory-and-m2m-principal-contract.md`

Tasks:

- [x] Amend doc 013 D8 so it separates read-only SCIM lookup from full provisioning.
- [x] Link doc 017 from the related docs section in docs 014-016.
- [x] Ensure docs never describe custom principal-validation plus RISC as a replacement for SCIM read/query, outside quoted historical examples being corrected in this doc.

Acceptance criteria:

- SCIM is classified as the synchronous directory standard.
- Full provisioning remains explicitly out of scope.
- Custom validation is described as a temporary compatibility surface.

Tests:

- Documentation review and `rg -n "SCIM|principal-validation|covered" docs`.

### R17-B. Build `idScimDirectory`

Scope:

- `workers/core/src/auth/plugins/scim-directory/**`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/scim-directory.test.ts`

Tasks:

- [ ] Implement read-only SCIM routes.
- [ ] Enforce SCIM caller M2M audience and scope.
- [ ] Map Better Auth User, Member, and Team rows to SCIM resources.
- [ ] Implement approved filter subset.
- [ ] Test route contracts and errors.

Acceptance criteria:

- User/team/admin facts exposed by principal-validation have SCIM equivalents.
- Unsupported provisioning is rejected clearly.

Tests:

- `pnpm test -- --run workers/core/tests/auth/scim-directory.test.ts`
- `pnpm lint`

### R17-C. Migrate `content-api` User/Team/Admin Lookup

Scope:

- `/home/quanghuy1242/pjs/content-api/src/domain/iam/**`
- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/**`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/**`
- `/home/quanghuy1242/pjs/content-api/src/application/books/create-book.usecase.ts`

Tasks:

- [ ] Add `IdentityDirectory`.
- [ ] Add SCIM adapter.
- [ ] Update use cases.
- [ ] Keep service-account behavior isolated behind a separate port.

Acceptance criteria:

- No user/team/admin call site depends on `/api/auth/principal-validation/**`.
- Service-account handling is not hidden in the directory interface.

Tests:

- Existing Content IAM tests plus SCIM adapter tests.

### R17-D. M2M Work (See Doc 018)

M2M / service-account backlog is owned by [018](018_m2m-oauth-client-org-binding.md). Track R18-A through R18-G there. Do not duplicate tasks under R17-D.

This entry exists only so that R17-E (principal-validation deletion) has an explicit producer-side dependency: R17-E does not proceed until 018's R18-G ships, because R18-G is what removes the OAuth-client / grant code that R17-E's tests assume is already gone.

### R17-E. Deprecate And Remove Principal Validation

Scope:

- `workers/core/src/auth/plugins/principal-validation/**`
- `workers/core/tests/auth/principal-validation.test.ts`
- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/id-content-principal-directory.ts`

Tasks:

- [ ] Mark plugin deprecated.
- [ ] Convert to facade if needed during migration.
- [ ] Remove after `content-api` no longer calls it.
- [ ] Remove env vars and content-api token cache keys related to principal-validation.

Acceptance criteria:

- No runtime consumer calls `/api/auth/principal-validation/**`.
- Route contract tests no longer require the custom endpoints.

Tests:

- `pnpm check` in `id`.
- `pnpm check` in `content-api`.

## 14. Future Backlog

- Full SCIM provisioning for enterprise customers.
- SCIM PATCH support for groups if `id` becomes a provisioning target.
- SCIM service-account extension if a strong interoperability requirement appears (also tracked in 018 §11).
- RFC 7662 introspection opt-in for high-risk `content-api` routes (doc 013 D6).
- CAEP/fence enforcement for already-issued tokens if D4/D5 in doc 013 are triggered.

## 15. Definition Of Done

This proposal is complete when:

- `AGENTS.md` records the standards-first rules that prevent future custom identity APIs from being accepted without classification.
- This doc records the corrected SCIM framing for users, organization users, teams/groups, and organization administrators.
- Doc 013 is amended so it no longer says custom synchronous validation plus RISC covers the SCIM directory problem.
- All service-account / M2M decisions are owned by [018](018_m2m-oauth-client-org-binding.md) and referenced from here only.
- Implementation work, when started, builds read-only SCIM before deleting the user/team/admin branches of `principal-validation`, and lands the service-account branch removal in lockstep with 018 R18-G.

## 16. Final Model

```text
id
  SCIM read-only directory (this doc):
    Users
    tenant Users
    tenant Groups/teams
    virtual org-admins Group

  OAuth authorization server (doc 018):
    Better Auth oauth-provider as designed:
      RFC 7591 register, RFC 7592 get-client/get-clients/update/delete
      client_credentials grant
      clientReference => oauthClient.referenceId = organization.id
      clientPrivileges => org-member and platform-admin RBAC
    repo-specific projection:
      oauthClientResourceScope (clientId, resourceServerId, allowedScopes, enabled)

  Identity events:
    SET + SSF + RISC/CAEP per docs 013-016

content-api
  SCIM client:
    write-time user/team/admin durable-reference lookup (this doc)

  OAuth resource server:
    runtime user/service-account token verification

  Content IAM:
    local roles, permissions, bindings, denials, ownership, and final policy decisions

  Service-account binding (doc 018):
    local ServiceAccountAttachmentPolicy
    OAuthClientDirectory calls id's stock /api/auth/oauth2/get-client
    scheduled reconciliation surfaces inert / referenceId-mismatched bindings
```

The standard path is:

- SCIM for synchronous user/group directory lookup (this doc);
- OAuth via Better Auth's first-class oauth-provider primitives (doc 018) for M2M;
- SET/SSF/RISC/CAEP for asynchronous lifecycle/security events (docs 013-016).

Every remaining repo-specific identity object is named, bounded, and classified: SCIM tenant URL prefix (this doc); `oauthClientResourceScope` (doc 018).
