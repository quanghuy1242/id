# Tenant-Scoped Platform Experience And Delegated Administration

> Status: implementation-grade research and proposal
>
> Date: 2026-05-31
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — `core-id` authorization server and `ui-id` hosted console
> - `workers/ui/src/app/admin/**` — current management console
> - `workers/core/src/auth/**` — Better Auth, OAuth, SCIM, admin plugins, and authorization hooks
> - `packages/lib/src/auth-fetch.ts` — typed same-origin `/api/auth` client helpers
>
> Source docs:
>
> - [docs/000_repo-architecture.md](000_repo-architecture.md)
> - [docs/001_first-batch-plan.md](001_first-batch-plan.md)
> - [docs/010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md)
> - [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md)
> - [docs/018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md)
> - [docs/022_admin-ui-system.md](022_admin-ui-system.md)
> - [docs/024_admin-login-context-guard.md](024_admin-login-context-guard.md)
> - [docs/025_admin-ui-swr-caching-strategy.md](025_admin-ui-swr-caching-strategy.md)
> - [docs/026_admin-oauth-security-screens-and-api-contracts.md](026_admin-oauth-security-screens-and-api-contracts.md)
> - [docs/027_admin-ui-enrichment.md](027_admin-ui-enrichment.md)
> - [workers/ui/docs/screens/index.md](../workers/ui/docs/screens/index.md)
> - [README.md](../README.md)
>
> External references checked on 2026-05-31:
>
> - Okta Organizations concept: <https://developer.okta.com/docs/concepts/okta-organizations/>
> - Okta multi-tenancy concept: <https://developer.okta.com/docs/concepts/multi-tenancy/>
> - Okta role assignment concept: <https://developer.okta.com/docs/concepts/role-assignment/>
> - Okta resource sets for custom admin roles: <https://help.okta.com/oie/en-us/content/topics/security/custom-admin-role/work-with-resource-set.htm>
> - Auth0 Organizations overview: <https://auth0.com/docs/organizations>
> - Auth0 Organizations planning and roles: <https://auth0.com/docs/manage-users/organizations/organizations-overview>
> - Auth0 organization login flows: <https://dev.auth0.com/docs/manage-users/organizations/login-flows-for-organizations>
> - Auth0 tokens and organizations: <https://dev.auth0.com/docs/manage-users/organizations/using-tokens>
> - Auth0 M2M access for organizations: <https://auth0.com/docs/manage-users/organizations/organizations-for-m2m-applications>
> - Auth0 authorize M2M organization access: <https://auth0.com/docs/manage-users/organizations/organizations-for-m2m-applications/authorize-m2m-access>
> - RFC 8707, OAuth 2.0 Resource Indicators: <https://www.rfc-editor.org/rfc/rfc8707>
> - RFC 9068, JWT Profile for OAuth 2.0 Access Tokens: <https://www.rfc-editor.org/rfc/rfc9068>
> - RFC 8414, OAuth 2.0 Authorization Server Metadata: <https://www.rfc-editor.org/rfc/rfc8414>
> - RFC 7591, OAuth 2.0 Dynamic Client Registration: <https://www.rfc-editor.org/rfc/rfc7591>
> - RFC 7644, SCIM 2.0 Protocol: <https://www.rfc-editor.org/rfc/rfc7644>
> - RFC 7662, OAuth 2.0 Token Introspection: <https://www.rfc-editor.org/rfc/rfc7662>
> - RFC 7009, OAuth 2.0 Token Revocation: <https://www.rfc-editor.org/rfc/rfc7009>
> - RFC 8693, OAuth 2.0 Token Exchange: <https://www.rfc-editor.org/rfc/rfc8693>
>
> Assumptions:
>
> - `id` remains one authorization-server deployment with one issuer. Organizations are tenant/workspace boundaries inside the deployment; they are not separate issuers.
> - The existing Better Auth organization plugin remains the source of truth for organizations, memberships, teams, and the session `activeOrganizationId` bridge.
> - The current platform-admin role is `user.role === "admin"` through Better Auth's admin plugin. Organization administration is `member.role in ("owner", "admin")`.
> - The first implementation should not introduce a generic authorization engine, ReBAC, or CEL policy runtime. This document can describe the future shape, but first release should use the existing Better Auth roles and existing plugin-owned tables.
> - No public client id, client name, tenant allowlist, or tenant-specific behavior should be hard-coded. Client, resource-server, scope, and organization behavior must come from database-backed rows or Better Auth state.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Recommendation](#2-recommendation)
- [3. Vocabulary](#3-vocabulary)
- [4. Current-State Findings](#4-current-state-findings)
  - [4.1 Worker And UI Boundaries](#41-worker-and-ui-boundaries)
  - [4.2 Existing Organization And Token Context](#42-existing-organization-and-token-context)
  - [4.3 Existing Admin Console Shape](#43-existing-admin-console-shape)
  - [4.4 Existing Authorization Gap](#44-existing-authorization-gap)
  - [4.5 Existing Endpoint Scoping State](#45-existing-endpoint-scoping-state)
- [5. External Findings](#5-external-findings)
  - [5.1 Okta](#51-okta)
  - [5.2 Auth0](#52-auth0)
  - [5.3 Standards](#53-standards)
- [6. Standards And Capability Classification](#6-standards-and-capability-classification)
- [7. Target Product Model](#7-target-product-model)
  - [7.1 One Issuer, Many Organization Lenses](#71-one-issuer-many-organization-lenses)
  - [7.2 Persona And View Matrix](#72-persona-and-view-matrix)
  - [7.3 Console Information Architecture](#73-console-information-architecture)
  - [7.4 Context Switcher Behavior](#74-context-switcher-behavior)
  - [7.5 Tenant-Scoped Data Rules](#75-tenant-scoped-data-rules)
- [8. Technical Proposal](#8-technical-proposal)
  - [8.1 Management Context Contract](#81-management-context-contract)
  - [8.2 Context Discovery Endpoint](#82-context-discovery-endpoint)
  - [8.3 URL-Owned Context](#83-url-owned-context)
  - [8.4 Better Auth Active Organization Bridge](#84-better-auth-active-organization-bridge)
  - [8.5 Typed UI Action Changes](#85-typed-ui-action-changes)
  - [8.6 Server-Side Authorization And Scoping](#86-server-side-authorization-and-scoping)
  - [8.7 Audit Model](#87-audit-model)
  - [8.8 Optional Future Delegated Admin Model](#88-optional-future-delegated-admin-model)
- [9. Surface Proposals](#9-surface-proposals)
  - [9.1 Dashboard](#91-dashboard)
  - [9.2 Identity](#92-identity)
  - [9.3 OAuth Applications](#93-oauth-applications)
  - [9.4 Resource APIs, Scopes, And M2M Bindings](#94-resource-apis-scopes-and-m2m-bindings)
  - [9.5 Security, Sessions, Tokens, Consents, And JWKS](#95-security-sessions-tokens-consents-and-jwks)
  - [9.6 System](#96-system)
  - [9.7 Account And Member Self-Service](#97-account-and-member-self-service)
- [10. Architecture Decisions](#10-architecture-decisions)
- [11. Migration And Rollout](#11-migration-and-rollout)
- [12. Edge Cases And Failure Modes](#12-edge-cases-and-failure-modes)
- [13. Test And Verification Plan](#13-test-and-verification-plan)
- [14. Implementation Plan](#14-implementation-plan)
- [15. Minimal Backlog](#15-minimal-backlog)
- [16. Definition Of Done](#16-definition-of-done)
- [17. Final Model](#17-final-model)

## 1. Goal

Define how the hosted `ui-id` experience should work when the user is not a platform administrator, or when a platform administrator intentionally wants to operate through the lens of one organization. The question is broader than adding an organization dropdown: if a user has authority only over one organization, the console must present, fetch, mutate, audit, and cache everything through that organization context. If a user has authority over several organizations, the console must make the active organization explicit. If a user has platform authority, the console must distinguish global/platform work from tenant-scoped work.

The core recommendation is not to make `id` a physically single-tenant product. The repo should stay a single issuer and authorization server. The product experience should become tenant-scoped: one active management context is selected for every console route, and every endpoint enforces that context server-side.

Non-goals:

- Do not create one Cloudflare Worker, D1 database, issuer URL, JWKS set, or Better Auth instance per organization.
- Do not invent custom OAuth logout, token revocation, or token propagation mechanics.
- Do not move resource-API authorization decisions into `id`.
- Do not treat SCIM as the service-account model. SCIM remains Users/Groups directory read/query; OAuth clients remain OAuth clients.
- Do not implement broad custom delegated-admin tables until the product needs partial administration beyond platform admin and Better Auth organization owner/admin.

## 2. Recommendation

Build a tenant-scoped console model with three visible context types:

| Context | Who can enter | Meaning | First-release route examples |
|---|---|---|---|
| Platform | `user.role === "admin"` | Global authorization-server operation across all organizations and system-owned resources | `/admin/platform`, `/admin/platform/identity/users`, `/admin/platform/security/jwks` |
| Organization | platform admin, or org `owner`/`admin` member | Manage one organization and its owned identity/OAuth/resource-server state | `/admin/orgs/:orgId`, `/admin/orgs/:orgId/members`, `/admin/orgs/:orgId/oauth/applications` |
| Account | any signed-in user | Self-service identity, sessions, consents, organization memberships, and developer-facing app access if later approved | `/account`, `/account/sessions`, `/account/organizations` |

Keep the current `/admin` routes as compatibility redirects during migration. They should resolve to the best allowed explicit context:

- platform admin with no chosen context -> `/admin/platform`;
- org admin with one organization -> `/admin/orgs/:orgId`;
- org admin with multiple organizations -> `/admin/select-context`;
- ordinary member -> `/account`.

The route path, not mutable local storage, is the UI source of truth for active context. The server still verifies every request from the session and membership state. UI context is a navigation and cache identity, never a trust boundary.

## 3. Vocabulary

Tenant: a product boundary containing users, applications, policies, and data. In this repo there are two useful layers of tenancy.

Deployment tenant: the whole `id` deployment, issuer, D1 database, JWKS set, and admin control plane. This is closest to an Okta org or Auth0 tenant.

Organization tenant: a Better Auth organization inside the `id` deployment. This is closest to an Auth0 Organization or a B2B customer workspace. It is the right lens for customer self-administration.

Management context: the selected console lens. It is either `platform`, `organization:<orgId>`, or `account`. It controls UI navigation, data fetch params, SWR cache keys, mutation bodies, and audit context.

Platform admin: Better Auth admin role on `user.role`. Today this is the only user allowed past `workers/ui/src/proxy.ts` into `/admin`.

Organization admin: Better Auth organization membership role `owner` or `admin`. Today the core plugin authorization helpers already recognize this role for selected org-owned operations, but the hosted `/admin` proxy does not let these users enter the console.

Delegated admin: a future user, group, or OAuth client with a custom role over a constrained resource set. This is an Okta-like resource-set model and should be a later Better Auth plugin only if owner/admin is too coarse.

Single active organization lens: the preferred wording for this proposal. "Single tenant design" is misleading because the system remains multi-tenant at the deployment level. The desired product behavior is that a request, screen, and mutation are always evaluated inside exactly one active context.

## 4. Current-State Findings

### 4.1 Worker And UI Boundaries

The repo has the right topology for this change. `core-id` owns Better Auth, OAuth, D1/KV, JWKS, SCIM, admin APIs, and plugin schemas. `ui-id` owns hosted pages and admin presentation. Workers must not import each other; shared contracts must live in `packages/lib`.

The existing admin UI rules are strict and useful here:

- route files under `workers/ui/src/app/admin/**` are composition boundaries;
- route files use `@id/ui` primitives, not raw markup/classes;
- content components fetch via SWR, not `useEffect` + `useState`;
- API calls in admin/UI action files must go through `@id/lib` helpers such as `authApiGetOrThrow` and `authApiPostOrThrow`;
- a new `/admin` route needs a screen spec entry in `workers/ui/docs/screens/<section>.md` before implementation.

The tenant-scoped console should reuse those rules. This is an information-architecture and authorization change, not a reason to bypass the UI architecture.

### 4.2 Existing Organization And Token Context

The repo already has a strong organization runtime model:

- `organization({ teams: { enabled: true } })` is registered in `workers/core/src/auth/get-auth.ts`.
- OAuth PostLogin context selection exists at `/select-authorization-context` and writes `workspace:<orgId>` or `direct-share` to KV for the authorization flow.
- `workers/core/src/auth/oauth-provider.ts` emits `org_id` and `team_ids` in user access tokens when a workspace context is selected.
- M2M clients are owned by `oauthClient.referenceId` through Better Auth's `clientReference` seam, with the canonical contract documented in [docs/018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md).
- Read-only SCIM exists for Users and Groups, including tenant paths, per [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md).

That means the missing piece is not "how do tokens know an org?" The missing piece is "how does the hosted management console and every admin endpoint consistently operate through one selected organization when the actor is not global?"

### 4.3 Existing Admin Console Shape

The current `workers/ui/src/shared/constants.ts` admin navigation is platform-admin oriented:

- Dashboard
- Identity: Users, Organizations
- OAuth
- Grants & Keys
- System: Service Accounts, Issuer Metadata, SCIM Status, Health, Settings

`workers/ui/src/app/admin/_components/admin-nav.tsx` renders a static sidebar and a topbar with notifications, theme, and logout. It does not render an organization switcher, platform/org badge, or role-aware navigation. `workers/ui/src/app/admin/layout.tsx` mounts the shell without fetching a management context.

`workers/ui/src/proxy.ts` currently guards all `/admin` paths by calling `/api/auth/get-session` and requiring `session.user.role === "admin"`. That denies organization owners/admins who are not platform admins even though several core plugin authorization hooks would allow org-scoped operations if a valid org context existed.

### 4.4 Existing Authorization Gap

The core already has two levels of authorization:

- platform admin: `isPlatformAdmin(role)` returns true only for `role === "admin"`;
- organization access: `hasOrganizationAccess(adapter, userId, organizationId)` returns true for Better Auth membership roles `owner` or `admin`.

`workers/core/src/auth/get-auth.ts` uses this pattern for `idResourceServer` and `idOAuthScopeCatalog`, allowing platform admins globally and org owners/admins for org-owned rows. `idAdminAudit` and `idAdminActivityLog` are platform-admin-only today.

The UI entry gate does not match that core capability. It treats `/admin` as synonymous with platform-admin, so organization administrators cannot reach the flows they should eventually manage.

### 4.5 Existing Endpoint Scoping State

Current UI actions show a mix of global and org-specific contracts:

- `workers/ui/src/app/admin/_actions/organizations.ts` uses Better Auth organization endpoints and passes `organizationId` for detail/member/team/invitation operations.
- `workers/ui/src/app/admin/_actions/oauth.ts` lists OAuth clients through `/oauth2/get-clients` with no explicit organization parameter. The Better Auth OAuth provider uses session `activeOrganizationId` through `clientReference` for non-platform client ownership.
- `listResourceServers`, `listScopes`, and `listBindings` currently call plugin admin list endpoints without explicit context parameters.
- Security aggregate actions are platform-oriented and should remain platform-only until a scoped read model is designed.

The implementation implication is important: some admin endpoints can become org-scoped by adding explicit `organizationId` filtering, while OAuth client management has a Better Auth-specific active-organization bridge.

## 5. External Findings

### 5.1 Okta

Okta uses "organization" as a root tenant object: an Okta org contains users, groups, applications, policies, and configuration, and each org has its own URL. That maps more closely to this repo's whole `id` deployment than to an individual Better Auth organization row.

Okta's multi-tenancy guidance defines a tenant as an isolated unit of software and data with its own security policies, user registration settings, groups, roles, and application-access rules. It also discusses hub-and-spoke patterns where a shared hub provides directory, authentication, sign-in policy, and authorization services for tenant spokes. That matters here because `id` is closer to the hub: one issuer and one shared identity service can still present tenant-specific views.

Okta's admin-role model separates the role, principal, and resource set. Standard role assignment can optionally target resources, and custom role assignment binds a principal to a custom role over a resource set. Okta resource sets explicitly constrain what resources a role can operate on, and Okta recommends thinking resource-first when creating assignments. That is the right pattern if this repo later needs "manage only these apps" or "support users in these orgs" rather than simple platform admin or organization owner/admin.

Do not copy Okta's physical tenant model directly. Okta's org-per-tenant URL is a product/deployment model. This repo currently has one `BETTER_AUTH_URL`, one issuer path, one D1, and one JWKS. Copying Okta literally would mean per-org issuer separation, which would complicate OAuth client configuration, resource-server validation, SCIM, and deployment without a requirement.

### 5.2 Auth0

Auth0's Organizations feature is a closer product analogy for this repo's Better Auth organizations. Auth0 Organizations are for B2B use cases where business customers/partners have membership, potentially branded/federated login, member roles, and self-management through a custom dashboard. Auth0 explicitly calls out users who can be members of multiple organizations and applications that need an organization prompt or a known `organization` parameter.

Auth0's token behavior is also relevant. When an organization parameter is used, tokens include organization claims such as `org_id` and optionally `org_name`; Auth0 guidance says applications should validate organization claims and generally prefer organization IDs for validation. This repo already follows the important part of that pattern by emitting `org_id` in access tokens for workspace context and keeping org names out of authority.

Auth0's M2M organization access is a useful comparison for [docs/018](018_m2m-oauth-client-org-binding.md): client credentials can be associated with a specific organization for a specific API, and a client can request tokens in that organization context. This repo's `oauthClient.referenceId` plus `oauthClientResourceScope` is the repo-specific Better Auth-aligned equivalent.

Auth0 also separates Auth0 Dashboard tenant-member roles from application organization-member roles. That is a warning for this repo: "organization admin in the product" and "platform admin of the issuer" must not collapse into one UI route or one role flag.

### 5.3 Standards

OAuth and OIDC do not define an admin console tenant switcher. Tenant choice is product behavior. The standards boundary is token issuance, token verification, discovery, registration, revocation, introspection, and directory interoperability.

RFC 8707 Resource Indicators are directly relevant for API/resource-server audience selection. The `resource` parameter identifies where an access token will be used, and the RFC notes that multi-tenant resources may need tenant-identifying information in the resource URI to prevent cross-tenant misuse. This repo currently uses stable resource-server audience URIs plus `org_id` claims; if a downstream API later needs tenant-specific audience restriction, that should be studied under RFC 8707 rather than inventing a non-standard token endpoint parameter.

RFC 9068 JWT Profile for OAuth Access Tokens is relevant to the access-token shape. It requires common claims such as `iss`, `exp`, `aud`, and `sub`, and says the authorization server can determine additional claims from the client, scope, and resource parameters. The repo-specific `org_id`, `team_ids`, and `client_id` claims are acceptable extension claims only when resource servers have a documented contract for them. Clients must still treat access tokens as opaque.

RFC 8414 Authorization Server Metadata remains platform/issuer-level. An org switcher in the UI must not imply a different issuer unless the deployment truly changes issuer metadata and JWKS per organization.

RFC 7591 Dynamic Client Registration is relevant because OAuth client metadata has standardized fields (`client_name`, `redirect_uris`, `grant_types`, `scope`, `client_id`, `client_secret`, etc.). Organization ownership of a client is not a standard metadata field. Better Auth's `referenceId` is a library-supported ownership extension, not a general OAuth standard.

RFC 7644 SCIM supports Users and Groups, discovery endpoints, and multi-tenancy considerations. It is the right synchronous directory shape for users, organization users, teams/groups, and virtual org-admins groups. It is not the right core model for OAuth clients or service accounts.

RFC 7662 Introspection and RFC 7009 Revocation are the correct standards for token status and token revocation. Admin consent revocation or org-context switching are management actions, not replacements for token revocation.

RFC 8693 Token Exchange includes an `act` actor claim for delegated actor chains. This is relevant only if `id` later implements impersonation, support access, or explicit delegation flows. It should not be used just to model a normal organization switcher.

## 6. Standards And Capability Classification

| Mechanism | Classification | Use in this repo |
|---|---|---|
| OAuth authorization code + PKCE | Protocol standard | Keep for browser user authorization. |
| OAuth client credentials | Protocol standard | Keep for M2M and service-account runtime access. |
| OAuth `resource` parameter | Protocol standard, RFC 8707 | Keep for resource-server audience selection. Consider tenant-specific resource URI only if resource APIs require audience-level tenant separation. |
| JWT access-token `aud` and `scope` | Protocol/profile standard, RFC 9068 | Keep as resource and scope authority. |
| JWT `org_id` claim | Established industry pattern and repo-specific token contract | Keep for resource-server tenant context. Document and test; do not call it an OIDC standard claim. |
| JWT `team_ids` claim | Repo-specific token contract | Keep only because content-api and similar resource APIs need team facts for policy evaluation. Keep token-size limits. |
| Auth0 `organization` authorize/token parameter | Vendor pattern | Useful product analogy; do not copy wire parameter unless intentionally exposing Auth0-compatible behavior. |
| Better Auth `activeOrganizationId` and `clientReference` | Better Auth-supported capability | Use as bridge for OAuth client ownership. Do not patch Better Auth internals. |
| SCIM `/Users` and `/Groups` | Interoperability standard, RFC 7644/RFC 7643 | Keep for directory read/query. |
| SCIM for OAuth clients/service accounts | Inappropriate workaround without approved extension | Do not use as the core service-account model. |
| Okta custom roles + resource sets | Established industry pattern | Good future model for partial delegated admin. Implement only if owner/admin is too coarse. |
| Admin context switcher | Repository-specific product/UI behavior | Implement as URL-owned context plus server enforcement. |
| Per-org issuer/JWKS/D1 | Deployment architecture option | Reject for now; disproportionate and not required by current OAuth/resource model. |

## 7. Target Product Model

### 7.1 One Issuer, Many Organization Lenses

`id` should remain one authorization server:

```text
Issuer:       https://id.quanghuy.dev/api/auth
JWKS:         https://id.quanghuy.dev/api/auth/jwks
Metadata:     /.well-known/oauth-authorization-server and OIDC metadata at the issuer shape
D1/KV:        shared deployment stores
Organizations: Better Auth organization rows inside the issuer
```

The console should support multiple lenses over that one issuer:

```text
/admin/platform/...          global issuer operation
/admin/orgs/:orgId/...       one organization tenant
/account/...                 signed-in user's self-service identity
```

This preserves protocol stability. OAuth clients and resource servers do not need a new issuer per organization, resource APIs continue to validate the same issuer/JWKS, and SCIM remains one directory API with tenant paths for organization-specific resources.

### 7.2 Persona And View Matrix

| Persona | Authority source | Entry destination | Allowed views | Disallowed views |
|---|---|---|---|---|
| Platform admin | `user.role === "admin"` | `/admin/platform` by default | All platform views; may enter any org lens | None by role, but destructive actions still need normal confirmations and audit. |
| Organization owner/admin | `member.role in ("owner", "admin")` | `/admin/orgs/:orgId` or context picker | Org dashboard, org members/teams/invitations, org-owned apps, org-owned resource APIs/scopes/bindings, org audit | Global users list, global sessions/tokens, JWKS rotation, system settings, all-org aggregate dashboard. |
| Organization member | `member.role === "member"` | `/account` | Profile, own sessions, own consents, organization memberships; optionally developer apps only if product approves member-created clients later | Admin console by default. |
| No org user | signed-in user without memberships | `/account` | Profile, sessions, consent history | Admin and org views. |
| Resource API service client | OAuth client credentials | no browser console | SCIM/read APIs or picker APIs only through scoped M2M tokens | Browser admin UI. |

Platform admins should be able to enter an organization lens intentionally. That is useful for support and for validating what an org admin sees. The topbar must make this visible so global actions are not confused with tenant-scoped actions.

### 7.3 Console Information Architecture

Platform context:

```text
Platform
  Dashboard
  Identity
    Users
    Organizations
  OAuth
    Applications
    Resource APIs
    Scope Catalog
    M2M Bindings
  Grants & Keys
    Sessions
    Tokens
    Consents
    Introspection
    JWKS
  System
    Service Accounts
    Issuer Metadata
    SCIM Status
    Health
    Settings
```

Organization context:

```text
Organization: Acme Publishing
  Overview
  Members
  Teams
  Invitations
  Applications
  Resource APIs
  Scope Catalog
  M2M Bindings
  Consents
  Audit
```

Account context:

```text
Account
  Profile
  Security
    Sessions
    Password
    MFA status
  Consents
  Organizations
```

Do not force organization admins through platform sections with hidden columns. The org lens should feel like the whole console has narrowed around their organization. That matches the user's intuition: if someone can only manage one org, they should not see a global product with a pile of forbidden affordances.

### 7.4 Context Switcher Behavior

The topbar should show a context switcher, not just a user avatar:

```text
[id admin]  Platform / Acme Publishing ▼        [Notifications] [Avatar]
```

Switch options:

- Platform, only when `canEnterPlatform === true`;
- every organization where the actor is `owner` or `admin`;
- possibly read-only organization memberships in the Account area, but not as admin contexts.

Switching context should navigate, not silently mutate a global UI variable:

- from `/admin/platform/oauth/applications` to org `org_123` -> `/admin/orgs/org_123/oauth/applications`;
- from `/admin/orgs/org_123/members` to Platform -> `/admin/platform/identity/organizations/org_123/members` or `/admin/platform` if the current surface has no platform equivalent;
- from an org-only view to another org -> same relative route if the actor has access, otherwise org overview.

The context switcher should never show organizations where the actor is only an ordinary member as admin targets. Ordinary memberships belong under `/account/organizations`.

### 7.5 Tenant-Scoped Data Rules

Every list, detail, mutation, cache key, and audit event must include or derive a management context:

| Surface | Platform context | Organization context |
|---|---|---|
| Users | list all users, platform admin only | no global users list in v1; use members list for the selected org |
| Organizations | list all orgs, platform admin only | selected org detail only |
| Members/teams/invitations | any org by platform admin | selected org only |
| OAuth clients | all clients by platform admin | clients where `oauthClient.referenceId === orgId` |
| Resource APIs | all resource servers by platform admin | rows where `resourceServer.organizationId === orgId`; platform-owned system audiences are read-only or hidden unless explicitly needed |
| Scope catalog | all scopes by platform admin | scopes whose resource server belongs to the selected org |
| M2M bindings | all bindings by platform admin | bindings where client and resource server are in the selected org |
| Sessions/tokens | all rows by platform admin | defer or expose only after a bounded org-scoped read model exists |
| Consents | all rows by platform admin | consents involving selected org clients only, if endpoint can filter without unbounded user scans |
| JWKS | platform only | hidden; orgs do not own signing keys in this design |
| SCIM status | platform only in v1 | optional read-only tenant SCIM endpoint health later |
| System settings | platform only | hidden |

## 8. Technical Proposal

### 8.1 Management Context Contract

Add shared types in `packages/lib/src/admin-context.ts` and export them from `packages/lib/src/index.ts`:

```ts
export type ManagementContextKind = "platform" | "organization" | "account";

export type ManagementContext = {
  readonly kind: ManagementContextKind;
  readonly id: "platform" | "account" | `organization:${string}`;
  readonly organizationId?: string;
  readonly label: string;
  readonly role: "platform-admin" | "owner" | "admin" | "member" | "account";
  readonly permissions: readonly ManagementPermission[];
};

export type ManagementPermission =
  | "platform:read"
  | "platform:write"
  | "organizations:read"
  | "organizations:write"
  | "members:read"
  | "members:write"
  | "oauth-clients:read"
  | "oauth-clients:write"
  | "resource-servers:read"
  | "resource-servers:write"
  | "security-audit:read"
  | "jwks:read"
  | "jwks:rotate"
  | "system:read"
  | "system:write";

export type ManagementContextEnvelope = {
  readonly actor: {
    readonly userId: string;
    readonly email?: string;
    readonly role?: string | null;
    readonly canEnterPlatform: boolean;
  };
  readonly contexts: readonly ManagementContext[];
  readonly defaultContextId: ManagementContext["id"];
};
```

This contract is intentionally permission-oriented even if the first implementation derives permissions from only two role sources. It lets the UI render feature availability without hard-coding role names everywhere, and it leaves room for later delegated admin without changing route contracts.

### 8.2 Context Discovery Endpoint

Add a Better Auth plugin endpoint under `/api/auth/admin/management-contexts` rather than a Hono `/api/admin` route.

Reasoning:

- The endpoint reads auth-owned state: session, user role, organization memberships, and organization labels.
- It is not a cross-domain aggregate like the dashboard.
- It should use Better Auth's adapter/session context, consistent with existing plugin-owned admin endpoints.

Response example for a platform admin who also belongs to two organizations:

```json
{
  "actor": {
    "userId": "usr_123",
    "email": "admin@example.com",
    "role": "admin",
    "canEnterPlatform": true
  },
  "contexts": [
    {
      "kind": "platform",
      "id": "platform",
      "label": "Platform",
      "role": "platform-admin",
      "permissions": ["platform:read", "platform:write", "organizations:read", "organizations:write", "oauth-clients:read", "oauth-clients:write", "jwks:read", "jwks:rotate", "system:read", "system:write"]
    },
    {
      "kind": "organization",
      "id": "organization:org_acme",
      "organizationId": "org_acme",
      "label": "Acme Publishing",
      "role": "owner",
      "permissions": ["members:read", "members:write", "oauth-clients:read", "oauth-clients:write", "resource-servers:read", "resource-servers:write"]
    }
  ],
  "defaultContextId": "platform"
}
```

Response example for an org admin:

```json
{
  "actor": {
    "userId": "usr_456",
    "email": "owner@acme.example",
    "role": "user",
    "canEnterPlatform": false
  },
  "contexts": [
    {
      "kind": "organization",
      "id": "organization:org_acme",
      "organizationId": "org_acme",
      "label": "Acme Publishing",
      "role": "admin",
      "permissions": ["members:read", "members:write", "oauth-clients:read", "oauth-clients:write", "resource-servers:read", "resource-servers:write"]
    }
  ],
  "defaultContextId": "organization:org_acme"
}
```

An ordinary member receives only `account` plus read-only membership summaries, or the endpoint can return 403 for `/admin` and a separate `/api/auth/account/context` can serve `/account`. The simpler first release is to let the endpoint return `account` and let `/admin` redirect non-admin members to `/account`.

### 8.3 URL-Owned Context

Use explicit route prefixes:

```text
/admin/platform
/admin/platform/identity/users
/admin/platform/identity/organizations
/admin/platform/oauth/applications
/admin/orgs/:orgId
/admin/orgs/:orgId/members
/admin/orgs/:orgId/oauth/applications
```

The route path drives:

- active context label in the topbar;
- active nav items;
- SWR key builders;
- action parameters;
- redirect behavior after deletion or context loss.

Do not use `localStorage` as the authoritative context. Do not rely only on a session-level active org because two tabs can legitimately show different organizations. The session can still carry Better Auth's `activeOrganizationId` as a compatibility bridge for endpoints that require it, but the URL remains the console source of truth.

### 8.4 Better Auth Active Organization Bridge

Current OAuth client ownership depends on Better Auth OAuth Provider's `clientReference` callback:

```ts
clientReference: async ({ session }) =>
  typeof session?.activeOrganizationId === "string" ? session.activeOrganizationId : undefined
```

That means org-scoped OAuth client create/list/update/delete cannot be fully URL-owned today unless Better Auth exposes a way to pass an explicit reference id into those endpoint handlers. The first implementation should treat `activeOrganizationId` as a narrow bridge:

1. UI route path remains the desired context.
2. Before an org-scoped OAuth client action, the action wrapper calls Better Auth's set-active-organization endpoint for the route org, if the current session active org does not match.
3. The action then calls the existing OAuth client endpoint.
4. The server's `clientPrivileges` and Better Auth ownership checks still validate membership and `referenceId`.
5. SWR keys include the route org id, not the session active org.

This bridge must be documented in code comments at the action wrapper and tested with cross-tab-like sequencing: switching active org for one call must not let cached data from another org render under the wrong route. If Better Auth later supports explicit reference-id management endpoints, replace the bridge instead of patching Better Auth internals.

### 8.5 Typed UI Action Changes

Every admin action should accept a context object or explicit organization id:

```ts
type AdminActionContext =
  | { readonly kind: "platform" }
  | { readonly kind: "organization"; readonly organizationId: string };

export async function listResourceServers(context: AdminActionContext): Promise<ResourceServer[]> {
  const params = context.kind === "organization" ? { organizationId: context.organizationId } : undefined;
  const res = await authApiGetOrThrow<{ resourceServers: ResourceServer[] }>("/admin/resource-servers", params);
  return res.resourceServers ?? [];
}
```

SWR keys should include the context:

```ts
export const resourceServersKey = (context: AdminActionContext) =>
  [RESOURCE_SERVERS, context] as const;
```

Do not build stringly route parsing into actions. Route files read params, build a typed context, and pass it into content components as an override or provider value. Content components use that context to build SWR keys and call injected actions.

### 8.6 Server-Side Authorization And Scoping

The server must enforce context independently from the UI:

- Platform context requires `isPlatformAdmin(user.role)`.
- Organization context requires either platform admin or `hasOrganizationAccess(adapter, user.id, organizationId)`.
- For org-owned models, every list endpoint must apply the organization filter before pagination.
- Every detail/mutation endpoint must load the row, derive its owner organization, and compare it with the requested context.
- Platform-owned system rows where `organizationId === null` must be unavailable to organization contexts unless the endpoint explicitly documents a read-only exception.

Recommended endpoint placement:

| Endpoint class | Placement | Reason |
|---|---|---|
| context discovery | Better Auth plugin `/api/auth/admin/management-contexts` | Auth-owned session/membership facts. |
| organization/member/team/invitation CRUD | Existing Better Auth organization endpoints | Already auth-owned and org-keyed. |
| resource server CRUD | Existing `idResourceServer` plugin | Plugin owns table and authorization. Add context-aware list filters. |
| scope catalog CRUD | Existing `idOAuthScopeCatalog` plugin | Plugin owns table and needs resource-server owner joins/lookups. |
| OAuth client CRUD | Better Auth OAuth Provider endpoints with active-org bridge | BA owns OAuth client table and RFC-shaped endpoints. |
| session/token/consent aggregate reads | Existing `idAdminAudit` plugin | Keep platform-only until bounded org scoping exists. |
| dashboard aggregate | Hono `/api/admin/dashboard` if already allowlisted | Cross-domain aggregate exception. Add context-aware variants only if needed. |

Do not add standalone Drizzle tables for delegated admin. If future partial-admin state is needed, add a Better Auth plugin schema and run `pnpm db:generate`.

### 8.7 Audit Model

Every admin mutation audit event should include:

```ts
type AdminAuditContext = {
  readonly managementContext: "platform" | "organization";
  readonly organizationId?: string;
  readonly actorUserId: string;
  readonly actorPlatformRole?: string | null;
  readonly actorOrganizationRole?: "owner" | "admin" | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly action: string;
};
```

This matters for support and for org-admin trust. If a platform admin modifies an org while in the org lens, the audit row should still show both facts: the actor is platform admin, and the action was performed against `organization:org_acme`.

### 8.8 Optional Future Delegated Admin Model

If organization owner/admin is too coarse, implement an Okta-like delegated admin plugin rather than hard-coding partial roles into UI logic.

Plugin name: `idAdminDelegation`.

Schema sketch:

| Model | Key fields | Notes |
|---|---|---|
| `adminRole` | `id`, `label`, `description`, `permissions`, `system`, `createdAt`, `updatedAt` | Permission set. System roles can mirror platform-admin and org-admin but remain read-only. |
| `adminResourceSet` | `id`, `label`, `description`, `resources`, `createdAt`, `updatedAt` | Resource constraints. Resources use typed identifiers such as `organization:org_123`, `oauth-client:client_123`, `resource-server:rs_123`, `group:team_123`. |
| `adminRoleBinding` | `id`, `principalType`, `principalId`, `roleId`, `resourceSetId`, `expiresAt`, `createdBy`, `createdAt` | Principal can be user, group/team, or OAuth client if explicitly approved. |

This is a repository-specific extension inspired by Okta resource sets. It is not an OAuth or SCIM standard. It should not ship until a concrete partial-admin requirement exists, because every new permission dimension increases UI, test, and audit complexity.

## 9. Surface Proposals

### 9.1 Dashboard

Platform dashboard:

- global counts for users, organizations, clients, resource APIs, active sessions, active tokens, consent grants, JWKS keys;
- security widgets for issuer health and key rotation status;
- shortcuts to platform-only work.

Organization dashboard:

- selected org overview, member count, team count, pending invitations, org-owned applications, org-owned resource APIs, recent org audit;
- no global user/session/token counts;
- no JWKS status unless shown as read-only issuer metadata.

Implementation detail:

- Split dashboard actions into `getPlatformDashboard()` and `getOrganizationDashboard(organizationId)`.
- Keep the Hono dashboard route only if it remains the cross-domain aggregate. Add an explicit allowlist entry only if architecture lint requires it and the route is truly aggregate.

### 9.2 Identity

Platform context:

- Users list and user detail remain platform-only.
- Organizations list remains platform-only.
- Platform admin can navigate into any organization detail.

Organization context:

- No global Users list.
- The org "Members" page replaces Users for org admins.
- Teams and invitations remain org-scoped.
- Org overview allows update/delete only if the actor is owner/admin or platform admin; destructive org deletion should likely stay platform-only unless a product decision says owners can delete their org.

Reasoning:

- Better Auth users are issuer-level subjects, not tenant-owned rows.
- Organization membership is the tenant-owned view of people.
- Showing a global Users section to org admins invites data leakage and confusing "why can't I edit this user?" errors.

### 9.3 OAuth Applications

Platform context:

- List all clients.
- Show owner organization column from `reference_id`.
- Allow platform admins to create infrastructure clients and tenant clients only through explicit context choice. Avoid accidental tenant client creation with `referenceId === null`.

Organization context:

- List only clients with `reference_id === orgId`.
- Create clients through the Better Auth active-org bridge.
- Hide or disable grant types that are not allowed for tenant clients.
- Do not expose client secret after initial creation except through existing rotate/reveal patterns.

Important nuance:

- RFC 7591/7592 shapes client metadata. `reference_id`/organization ownership is Better Auth/repo-specific. The UI should label ownership plainly as "Organization" but not pretend it is part of OAuth client metadata.

### 9.4 Resource APIs, Scopes, And M2M Bindings

Platform context:

- Can manage all resource servers, including system-owned audiences where `organizationId === null`.
- Can inspect all scopes and all client-resource-scope bindings.

Organization context:

- Resource APIs list filters to `organizationId === orgId`.
- Scope catalog filters through the selected org's resource servers.
- M2M bindings show only bindings where the client and resource server belong to the selected org.
- Tenant clients must not bind to system resource servers, and infrastructure clients must not bind to tenant resource servers, matching [docs/018](018_m2m-oauth-client-org-binding.md).

Server checks:

- A request with `organizationId=org_acme` to update a resource server owned by `org_other` returns 404 or 403. Prefer 404 for ordinary org admins to avoid leaking cross-tenant IDs; platform admin can receive 403 only when the action itself is disallowed.
- Scope mutation must verify the parent resource server owner.
- Binding mutation must verify both client owner and resource server owner.

### 9.5 Security, Sessions, Tokens, Consents, And JWKS

Platform context:

- Existing sessions, tokens, consents, introspection, and JWKS views remain available.
- JWKS rotation and key metadata remain platform-only because keys belong to the issuer, not an organization.

Organization context:

- Consents can be shown if they can be filtered by org-owned clients without scanning all users.
- Sessions and token audit should stay hidden in v1 unless the endpoint can bound the candidate set. [docs/026](026_admin-oauth-security-screens-and-api-contracts.md) already notes org-admin session/token scoping can blow up if implemented with large `WHERE IN` candidate sets.
- Token introspection can be exposed as a developer support tool only if the endpoint response is sanitized and the UI makes clear that it is validating token status, not granting extra rights.

Standards boundary:

- Token revocation remains RFC 7009.
- Token introspection remains RFC 7662.
- Consent revocation is an admin management action, not token revocation.

### 9.6 System

Platform context only:

- Service Accounts for infrastructure clients.
- Issuer Metadata.
- SCIM Status.
- Health.
- Settings.

Organization context:

- Hide System by default.
- If an organization needs "SCIM status", add a read-only org page later that checks tenant `/scim/v2/tenants/:orgId/...` routes, not global system health.

Reasoning:

- System surfaces are issuer/deployment controls. Org admins should not see controls that imply they can affect signing keys, issuer metadata, deployment health, or platform settings.

### 9.7 Account And Member Self-Service

Add `/account` outside `/admin` for signed-in users who are not administrators:

- Profile.
- Password/security state.
- Own sessions.
- Own OAuth consents.
- Organization memberships.
- Direct links to admin org contexts for memberships where role is owner/admin.

This keeps `/admin` semantically privileged while still giving ordinary users a useful identity experience. It also reduces pressure to make `/admin` half-readable for everyone.

## 10. Architecture Decisions

### D1. Use "Tenant-Scoped Console", Not Per-Org Single-Tenant Deployment

Recommended: one issuer, one deployment, explicit platform/org/account console contexts.

Rejected: one Worker/D1/issuer/JWKS per org.

Reasoning: Per-org deployment is disproportionate for current requirements and would complicate OAuth client metadata, discovery, JWKS validation, SCIM, deployment, and resource-server integrations. Okta's org-per-tenant model is a useful analogy, but this repo's organization rows are closer to Auth0 Organizations.

### D2. URL Owns Console Context

Recommended: explicit route prefixes carry the active context.

Rejected: localStorage-only context or session-only active org.

Reasoning: URLs are shareable, testable, cache-safe, and work across reloads. Session-only active org causes cross-tab confusion. The session active org remains a Better Auth bridge only where the library requires it.

### D3. Server Enforces Every Context

Recommended: every endpoint verifies actor authority for the requested context and applies row filters server-side.

Rejected: hiding UI controls as the primary authorization mechanism.

Reasoning: UI affordance gating improves usability but is not a security boundary. Org admins must receive scoped data from the server, not global data filtered in React.

### D4. Keep First Release Role Model Small

Recommended: platform admin plus organization owner/admin for v1.

Rejected for v1: custom delegated admin/resource-set plugin.

Reasoning: Okta-like resource sets are the right future shape for partial administration, but they create a real authorization system. Ship them only when there is a specific role like "manage only application X" or "helpdesk for organization Y".

### D5. Keep Protocol Claims Standards-Aware

Recommended: keep using OAuth `resource`, JWT `aud`, `scope`, `sub`, `client_id`, and repo-documented extension claims such as `org_id`.

Rejected: presenting `org_id` as an OIDC standard claim or adding custom token endpoint parameters as substitutes for RFC 8707/9068 behavior.

Reasoning: Auth0's `org_id` is an established vendor pattern, not a base OIDC claim. The repo can use it as a documented resource-server contract.

### D6. Do Not Use SCIM For Service Accounts

Recommended: keep SCIM for Users and Groups, keep OAuth clients for service accounts.

Rejected: mirror OAuth clients as SCIM Users/Groups without an approved extension.

Reasoning: This aligns with [docs/017](017_scim-directory-and-m2m-principal-contract.md) and [docs/018](018_m2m-oauth-client-org-binding.md). Service-account runtime access is OAuth client credentials.

## 11. Migration And Rollout

Phase 1 should be additive and low-risk:

1. Add management-context shared types and endpoint.
2. Add UI context provider and topbar context switcher while keeping existing `/admin` routes.
3. Make `/admin` redirect to explicit context routes.
4. Add org-context routes for organization overview/members/teams/invitations.
5. Add context-aware action signatures and SWR keys for resource servers/scopes/bindings.
6. Add the OAuth client active-org bridge with tests.
7. Hide platform-only surfaces in org context.

Compatibility redirects:

| Current route | Platform redirect | Org redirect |
|---|---|---|
| `/admin` | `/admin/platform` | `/admin/orgs/:orgId` or `/admin/select-context` |
| `/admin/identity/users` | `/admin/platform/identity/users` | no org equivalent; redirect to `/admin/orgs/:orgId/members` |
| `/admin/identity/organizations` | `/admin/platform/identity/organizations` | `/admin/orgs/:orgId` |
| `/admin/oauth/applications` | `/admin/platform/oauth/applications` | `/admin/orgs/:orgId/oauth/applications` |
| `/admin/security/jwks` | `/admin/platform/security/jwks` | no org equivalent; return not found or redirect to org overview |

Rollback:

- Because the first phase is route and endpoint additive, rollback can disable redirects and context switcher while keeping existing platform `/admin` behavior.
- Do not run schema migrations unless the optional delegated-admin plugin is approved later.

## 12. Edge Cases And Failure Modes

- User loses org admin role while viewing `/admin/orgs/:orgId/...`: the next context endpoint or page action returns 403/404; UI redirects to `/account` or context picker.
- User has org admin in multiple orgs: `/admin` redirects to `/admin/select-context`; no default org is guessed unless the user has a recent context cookie and still has access.
- User is platform admin and org admin: default to platform, but allow explicit org lens. Audit must still record platform role.
- User has one ordinary membership and no admin rights: `/admin` redirects to `/account`; `/account/organizations` can show membership and no admin link.
- Better Auth active org differs from route org: org-scoped OAuth client actions call `ensureActiveOrganization(routeOrgId)` before BA OAuth endpoint calls. If it fails, the action aborts.
- Two tabs in different org contexts: SWR keys include route org id; action wrappers ensure active org immediately before OAuth client calls; stale data from tab A must not render under tab B.
- Org deleted while an admin has it open: detail endpoints return 404; UI navigates to platform organization list for platform admins or `/account` for org-only actors.
- Platform-owned resource server appears in org context: hidden by default; if needed as read-only reference, endpoint and UI label it "Platform-owned" and do not allow mutation.
- Large org token/session scoping: do not ship org token/session list until there is a bounded read model. Avoid unbounded user-id/client-id set expansion.
- Context route tampering: `/admin/orgs/org_other/...` must not reveal whether `org_other` exists to an unauthorized org admin. Prefer 404.
- OAuth token `org_id` missing for a product-scope workspace token: resource API rejects the token according to its verification contract; console context does not repair token claims.
- Hard-coded clients/settings: rejected. Context-specific behavior must come from organization, OAuth client, resource-server, or scope rows.

## 13. Test And Verification Plan

Docs-only verification for this proposal:

- Check README contract list includes this document.
- Search for stale "admin-only" wording when implementation begins.

Implementation verification:

- `workers/core/tests/auth/admin-management-contexts.test.ts`: platform admin sees platform plus org contexts; org admin sees only org contexts; ordinary member sees account/no admin context.
- `workers/ui/tests/admin/context-routing.test.tsx`: `/admin` redirect matrix for platform admin, one org admin, multiple org admin, ordinary member, no session.
- `workers/ui/tests/admin/admin-nav-context.test.tsx`: topbar context switcher renders allowed contexts and hides forbidden sections.
- `workers/ui/tests/admin/org-context-cache.test.tsx`: SWR keys differ by org and do not reuse rows across org routes.
- Resource-server plugin tests: list/detail/mutate filters by `organizationId`; org admin cannot access another org's row or platform-owned system row.
- Scope catalog tests: scope list/mutation derives owner from parent resource server.
- M2M binding tests: binding list/mutation requires client and resource server to belong to the same selected org.
- OAuth client bridge tests: org-scoped client create/list/update calls set-active-org and refuses mismatch; platform admin list remains global.
- Audit tests: mutation records management context and actor role facts.
- UI story coverage: each new content component has Populated, Empty, Loading, Error stories under the proper `AdminShell` and `PageBody` pattern.
- Commands for source implementation: `pnpm lint`, `pnpm test`, `pnpm check`, and `pnpm deploy:ui:dry-run` for non-trivial UI changes. Run `pnpm advise` after substantial source changes.

## 14. Implementation Plan

### 14.1 Context Foundation

Scope:

- `packages/lib/src/admin-context.ts`
- `packages/lib/src/index.ts`
- `workers/core/src/auth/plugins/admin-management-contexts/**`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/admin-management-contexts.test.ts`

Tasks:

- Add shared context types.
- Implement a Better Auth plugin endpoint that reads the current session, user role, memberships, and organization labels.
- Derive first-release permission arrays from platform role and owner/admin membership.
- Register the plugin in `get-auth.ts`.
- Add OpenAPI metadata fragments if the plugin exposes documented admin endpoints.

### 14.2 UI Shell And Routing

Scope:

- `workers/ui/src/app/admin/layout.tsx`
- `workers/ui/src/app/admin/_components/admin-nav.tsx`
- `workers/ui/src/app/admin/_components/admin-context-provider.tsx`
- `workers/ui/src/app/admin/select-context/page.tsx`
- `workers/ui/docs/screens/shell.md`
- `workers/ui/docs/screens/index.md`

Tasks:

- Add a context provider that fetches management contexts through `authApiGetOrThrow`.
- Add a topbar context switcher.
- Generate sidebar/mobile nav from active context instead of static global constants alone.
- Add `/admin/select-context`.
- Add compatibility redirects from legacy `/admin` routes to explicit context routes.
- Update screen specs before route files, following the admin UI hard gate.

### 14.3 Organization Console Surfaces

Scope:

- `workers/ui/src/app/admin/orgs/[orgId]/**`
- existing identity org content components under `workers/ui/src/app/admin/_components/identity/**`
- `workers/ui/src/app/admin/_actions/organizations.ts`

Tasks:

- Reuse existing organization detail, members, teams, and invitations content under explicit org context routes.
- Hide global organization list from org-only admins.
- Ensure every action receives the route org id.

### 14.4 OAuth And Resource Scoping

Scope:

- `workers/ui/src/app/admin/_actions/oauth.ts`
- `workers/ui/src/app/admin/_data/swr-keys.ts`
- `workers/core/src/auth/plugins/resource-server/**`
- `workers/core/src/auth/plugins/oauth-scope-catalog/**`
- `workers/core/src/auth/oauth-provider.ts`

Tasks:

- Add context parameters to resource server, scope, and binding actions.
- Add server filters and owner checks.
- Add OAuth client active-org bridge action.
- Keep platform/infrastructure client creation explicit.

### 14.5 Platform-Only Security And System Boundaries

Scope:

- `workers/ui/src/app/admin/security/**`
- `workers/ui/src/app/admin/system/**` when implemented
- `workers/core/src/auth/plugins/admin-audit/**`

Tasks:

- Gate platform-only sections in nav and route access.
- Keep JWKS and system settings platform-only.
- Defer org sessions/tokens unless a bounded read model is designed.

### 14.6 Account Area

Scope:

- `workers/ui/src/app/account/**`
- `workers/ui/src/proxy.ts`
- `workers/ui/docs/screens/auth-flow.md` or a new account screen spec file

Tasks:

- Add signed-in user self-service landing.
- Show own sessions, consents, and memberships using existing Better Auth endpoints where available.
- Route ordinary members away from `/admin` to `/account`.

## 15. Minimal Backlog

### TSP-1. Add Management Context Endpoint

Acceptance criteria:

- Platform admin receives platform context plus eligible org contexts.
- Org owner/admin receives only eligible org admin contexts.
- Ordinary member cannot enter `/admin` but can reach account context.

### TSP-2. Add Context-Aware Admin Shell

Acceptance criteria:

- Topbar shows active context.
- Sidebar differs between platform and organization contexts.
- Legacy `/admin` redirects to explicit context routes.

### TSP-3. Scope Org-Owned OAuth And Resource Surfaces

Acceptance criteria:

- Org admin sees only org-owned applications, resource APIs, scopes, and M2M bindings.
- Server rejects cross-org row IDs even when the UI sends them.
- SWR cache keys include context.

### TSP-4. Keep Platform Security/System Surfaces Platform-Only

Acceptance criteria:

- Org admins cannot route to global sessions/tokens/JWKS/system pages.
- Platform admins retain current functionality.

### TSP-5. Add Account Self-Service Redirect Target

Acceptance criteria:

- Non-admin signed-in users have a useful destination.
- `/admin` no longer looks like a broken product for ordinary members.

## 16. Definition Of Done

- The repo has an explicit, documented distinction between deployment tenant, organization tenant, management context, platform admin, organization admin, and ordinary member.
- `/admin` no longer assumes every authorized console user is a platform admin.
- The active management context is visible in the topbar and encoded in the route.
- Organization administrators can manage their own organization without seeing global users, global keys, global system settings, or cross-tenant data.
- Platform administrators can still operate globally and can intentionally enter one organization lens.
- All org-owned data fetches, mutations, SWR keys, and audit events carry context.
- Server-side checks enforce context and row ownership independently from UI gating.
- OAuth client management uses Better Auth-supported capabilities and a documented active-organization bridge, with no patching of Better Auth internals.
- SCIM remains the directory read/query contract and OAuth remains the service-account runtime contract.
- README and screen specs are updated with new routes before implementation.
- `pnpm lint`, `pnpm test`, `pnpm check`, and relevant UI dry-run checks pass after source implementation.

## 17. Final Model

The right product direction is a tenant-scoped console, not physical single-tenancy. `id` should continue to be one standards-based authorization server with one issuer, one JWKS set, and database-backed organizations. The hosted UI should make the active management context explicit and let each role see a coherent product: platform admins see the issuer/platform, organization admins see their organization, and ordinary users see account self-service. Okta's resource-set model is useful later for partial administration; Auth0 Organizations are the closer near-term pattern for B2B organization context. The standards line stays clear: OAuth and SCIM handle interoperable protocol surfaces, while the console context switcher is a repository-specific management UX enforced by server-side authorization.
