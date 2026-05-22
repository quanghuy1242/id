# API-Managed, UI-Ready Authorization Policy, Teams, And OAuth Token Flow

> Status: implementation-grade proposal
>
> Date: 2026-05-22
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth`
> - `workers/core/src/auth/get-auth.ts`
> - `workers/core/src/auth/config.ts`
> - `workers/core/src/auth/policies/access.ts`
> - `workers/core/src/auth/plugins/resource-server/**`
> - future `workers/core/src/auth/plugins/authorization-policy/**`
> - `workers/core/src/http/routes/auth-mount.ts`
> - `workers/core/src/db/auth-schema.ts`
> - admin UI pages under `workers/ui/src/app/admin/**` — deferred until the API is implemented
>
> Source docs:
>
> - Better Auth Organization plugin docs: <https://better-auth.com/docs/plugins/organization>
> - Better Auth OAuth 2.1 Provider plugin docs: <https://better-auth.com/docs/plugins/oauth-provider>
> - Better Auth issue #4493, native team role assignment: <https://github.com/better-auth/better-auth/issues/4493>
> - RFC 9068, JWT profile for OAuth 2.0 access tokens: <https://www.rfc-editor.org/rfc/rfc9068.html>
>
> Related docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/005_oauth2-oidc-integration-guide.md`
> - `docs/006_resource-server-jwt-guide.md`
> - `docs/009_plugin_first_auth_architecture.md`
> - `workers/core/src/auth/plugins/README.md`
> - `workers/core/src/auth/plugins/resource-server/README.md`
>
> Source code reviewed:
>
> - `workers/core/src/auth/get-auth.ts`
> - `workers/core/src/auth/config.ts`
> - `workers/core/src/auth/policies/access.ts`
> - `workers/core/src/auth/plugins/resource-server/index.ts`
> - `workers/core/src/auth/plugins/resource-server/schema.ts`
> - `workers/core/src/auth/plugins/resource-server/audiences.ts`
> - `workers/core/src/http/routes/auth-mount.ts`
> - `workers/core/src/db/auth-schema.ts`
> - `node_modules/better-auth/dist/plugins/access/**`
> - `node_modules/better-auth/dist/plugins/organization/**`
> - `node_modules/@better-auth/oauth-provider/dist/**`
>
> Assumptions:
>
> - Product authorization policy must be manageable through API-backed database state first, then through UI. Product resources, actions, roles, role permissions, scope mappings, and team role assignments must not be hardcoded as product policy config.
> - Better Auth remains the source of truth for identity, sessions, organizations, members, teams, OAuth clients, OAuth Provider, JWT signing, and JWKS.
> - The repo may add Better Auth plugins for application-specific policy data, the same way `idResourceServer` adds resource-server audience management.
> - "Custom" means two different things in this document: patching or bypassing Better Auth internals is forbidden; plugin-owned schema plus preload/glue through public Better Auth extension points is allowed and preferred.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Vocabulary](#2-vocabulary)
  - [2.1 Safe Glue Versus Unsafe Overrides](#21-safe-glue-versus-unsafe-overrides)
  - [2.2 Scope, Permission, Role, And Assignment](#22-scope-permission-role-and-assignment)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Current Better Auth Composition](#31-current-better-auth-composition)
  - [3.2 Resource-Server Audience Preload Pattern](#32-resource-server-audience-preload-pattern)
  - [3.3 Better Auth Organization Access Control](#33-better-auth-organization-access-control)
  - [3.4 Better Auth Teams](#34-better-auth-teams)
  - [3.5 OAuth Provider Scope And Token Hooks](#35-oauth-provider-scope-and-token-hooks)
- [4. Target Model](#4-target-model)
  - [4.1 Ownership Boundaries](#41-ownership-boundaries)
  - [4.2 API-First Policy Plugin](#42-api-first-policy-plugin)
  - [4.3 OAuth Scope Catalog Preload](#43-oauth-scope-catalog-preload)
  - [4.4 Token Issuance Authorization Gate](#44-token-issuance-authorization-gate)
  - [4.5 Resource API Verification Model](#45-resource-api-verification-model)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Use A Better Auth Plugin, Not Standalone Drizzle](#51-use-a-better-auth-plugin-not-standalone-drizzle)
  - [5.2 Do Not Use Hardcoded Product `createAccessControl` As The Main Policy Store](#52-do-not-use-hardcoded-product-createaccesscontrol-as-the-main-policy-store)
  - [5.3 Keep OAuth Scopes DB-Backed And Preloaded](#53-keep-oauth-scopes-db-backed-and-preloaded)
  - [5.4 Keep Role-To-Permission Decisions In Core Token Issuance](#54-keep-role-to-permission-decisions-in-core-token-issuance)
  - [5.5 Treat Team Role Assignment As A Temporary Bridge](#55-treat-team-role-assignment-as-a-temporary-bridge)
  - [5.6 Avoid Role Claims Unless A Resource API Explicitly Needs Them](#56-avoid-role-claims-unless-a-resource-api-explicitly-needs-them)
- [6. Proposed Data Model](#6-proposed-data-model)
  - [6.1 `policyResource`](#61-policyresource)
  - [6.2 `policyAction`](#62-policyaction)
  - [6.3 `policyRole`](#63-policyrole)
  - [6.4 `policyRolePermission`](#64-policyrolepermission)
  - [6.5 `policyMemberRoleAssignment`](#65-policymemberroleassignment)
  - [6.6 `policyTeamRoleAssignment`](#66-policyteamroleassignment)
  - [6.7 `policyOAuthScope`](#67-policyoauthscope)
- [7. Runtime Flows](#7-runtime-flows)
  - [7.1 Admin Policy API Management Flow](#71-admin-policy-api-management-flow)
  - [7.2 OAuth Authorization Code With PKCE](#72-oauth-authorization-code-with-pkce)
  - [7.3 Refresh Token Flow](#73-refresh-token-flow)
  - [7.4 Resource API Request Flow](#74-resource-api-request-flow)
- [8. Implementation Strategy](#8-implementation-strategy)
  - [8.1 Plugin Layout](#81-plugin-layout)
  - [8.2 Auth Composition Changes](#82-auth-composition-changes)
  - [8.3 Deferred Admin UI Surfaces](#83-deferred-admin-ui-surfaces)
  - [8.4 Cache And Invalidation](#84-cache-and-invalidation)
- [9. Migration And Rollout](#9-migration-and-rollout)
- [10. Edge Cases And Failure Modes](#10-edge-cases-and-failure-modes)
- [11. Implementation Backlog](#11-implementation-backlog)
  - [P1-A. Create Authorization Policy Plugin Skeleton](#p1-a-create-authorization-policy-plugin-skeleton)
  - [P1-B. Add Scope Catalog Preload Runtime](#p1-b-add-scope-catalog-preload-runtime)
  - [P1-C. Add Token Issuance Policy Check](#p1-c-add-token-issuance-policy-check)
  - [P1-D. Enable Better Auth Teams](#p1-d-enable-better-auth-teams)
  - [P1-E. Update Architecture Scripts And Developer Tooling](#p1-e-update-architecture-scripts-and-developer-tooling)
  - [P1-F. Add Resource API Verification Guidance](#p1-f-add-resource-api-verification-guidance)
- [12. Future Backlog](#12-future-backlog)
- [13. Test And Verification Plan](#13-test-and-verification-plan)
- [14. Definition Of Done](#14-definition-of-done)
- [15. Final Model](#15-final-model)

## 1. Goal

Build an API-first, UI-ready authorization policy system that stays aligned with Better Auth and OAuth.

The desired product behavior is:

- Admin/API callers can create product permissions such as `book.read`, `book.update`, `chapter.read`, and `chapter.publish` through database-backed policy endpoints.
- Admin/API callers can create roles such as `writer`, `reviewer`, or `publisher` through database-backed policy endpoints.
- Admin users can bind permissions to roles, assign roles to organization members, and assign roles to teams.
- OAuth clients request scopes such as `book:read` or `chapter:publish`.
- `core-id` only issues scopes that the OAuth client is allowed to request and the user is allowed to receive for the selected organization.
- Resource APIs verify JWTs locally and check audience, organization, and scopes. They do not reimplement role-to-permission logic.

Non-goals:

- Do not patch Better Auth internals.
- Do not manually sign access tokens outside `@better-auth/oauth-provider`.
- Do not replace Better Auth users, sessions, organizations, members, teams, OAuth clients, JWT signing, or JWKS.
- Do not rely on hardcoded product permission config as the long-term policy store.
- Do not use `packages/lib/src/resource-token-verifier.ts` as the conceptual design center. Resource API verification is described generically in this document.
- Do not implement the full admin UI in the API-first phase. UI is a later consumer of the same policy endpoints.

Short version:

Use Better Auth for auth and OAuth. Add an `idAuthorizationPolicy` Better Auth plugin for API-managed product authorization policy that is ready for a future admin UI. Load OAuth scopes from its plugin-owned tables the same way `idResourceServer` loads resource audiences. Use `customAccessTokenClaims` as the token issuance authorization gate.

## 2. Vocabulary

### 2.1 Safe Glue Versus Unsafe Overrides

This repo should distinguish two categories that are often both called "custom".

Safe glue/preload integration:

- Better Auth plugin schema.
- `createAuthEndpoint` endpoints.
- Better Auth adapter CRUD inside plugin endpoints.
- Plugin-owned runtime companions for data needed before Better Auth is constructed.
- Memory/KV/D1 preload path like `resource-server/audiences.ts`.
- Cache invalidation after plugin-owned mutations.
- `oauthProvider` public options such as `scopes` and `validAudiences`.
- `oauthProvider.customAccessTokenClaims`.

Unsafe overrides:

- Editing Better Auth package internals.
- Monkey-patching OAuth Provider runtime behavior.
- Creating auth tokens outside OAuth Provider.
- Replacing Better Auth organization, member, team, session, or OAuth client tables.
- Depending on private package files at runtime.
- Letting resource APIs decide what product roles mean independently from `core-id`.

The target design in this document is safe glue/preload integration. It is the same architectural category as `idResourceServer`.

### 2.2 Scope, Permission, Role, And Assignment

Use these meanings consistently:

| Concept | Example | Owner | Purpose |
|---|---|---|---|
| OAuth scope | `book:read` | `idAuthorizationPolicy` scope catalog plus OAuth Provider | What a client asks to receive in a token |
| Permission | `book.read` | `idAuthorizationPolicy` | What product action is allowed |
| Role | `writer` | `idAuthorizationPolicy` | Named bundle of permissions |
| Member role assignment | user `u_1` has `writer` in org `org_1` | `idAuthorizationPolicy` | Direct product role assignment |
| Team role assignment | team `team_1` has `writer` in org `org_1` | `idAuthorizationPolicy` bridge until BA native support | Inherited role assignment through BA team membership |
| Platform role | `user.role = "admin"` | Better Auth `admin` plugin | Global platform administration |
| BA organization role | `member.role = "owner"` | Better Auth `organization` plugin | Organization administration of BA-owned org resources |

The target model does not require `book` or `chapter` to appear in source code. Those resources can be rows created through policy APIs first and future admin UI later.

## 3. Current-State Findings

### 3.1 Current Better Auth Composition

`workers/core/src/auth/get-auth.ts` currently registers:

```ts
plugins: [
  organization(),
  admin({ adminRoles: ["admin"], defaultRole: "user" }),
  jwt({ jwks: { jwksPath: "/jwks", ... } }),
  oauthProvider({
    scopes: [...authPluginConfig.oauthScopes],
    grantTypes: [...authPluginConfig.oauthGrantTypes],
    validAudiences: [...validAudiences],
    clientReference: ({ session }) => session?.activeOrganizationId,
    customAccessTokenClaims: ({ resource, referenceId, scopes, user }) => ({
      aud: resource,
      org_id: referenceId,
      scope: scopes.join(" "),
      sub: user?.id,
    }),
  }),
  idResourceServer(...),
  openAPI(),
]
```

Current facts:

- Teams are not enabled because `organization()` has no `teams` option.
- OAuth scope strings are currently hardcoded in `authPluginConfig.oauthScopes`.
- Resource audiences are dynamic and loaded before auth construction.
- Access tokens include `org_id`, `aud`, `scope`, and `sub`.
- There is no user-permission check that maps requested OAuth scopes to product permissions.

### 3.2 Resource-Server Audience Preload Pattern

`workers/core/src/auth/plugins/resource-server/audiences.ts` is the existing model for safe preload glue.

Flow:

```text
resourceServer table
  -> plugin endpoints mutate rows
  -> mutations call invalidateResourceServerAudiences(env)
  -> /oauth2/authorize and /oauth2/token call loadResourceServerAudiences(...)
  -> load path checks memory cache, then KV, then D1
  -> getAuth(env, validAudiences) passes audiences to oauthProvider({ validAudiences })
```

Important files:

- `workers/core/src/auth/plugins/resource-server/index.ts`
- `workers/core/src/auth/plugins/resource-server/audiences.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/http/routes/auth-mount.ts`

This pattern is approved because `@better-auth/oauth-provider` needs `validAudiences` when the plugin is constructed. It does not patch Better Auth internals.

### 3.3 Better Auth Organization Access Control

Better Auth Organization supports code-defined access control:

```ts
import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  project: ["create", "share", "update", "delete"],
} as const;

const ac = createAccessControl(statement);
const admin = ac.newRole({ project: ["create", "update"] });

organization({ ac, roles: { admin } });
```

Better Auth also supports dynamic access control. The docs state that dynamic access control stores created roles and permissions in a database table, but it still requires a pre-defined `ac` instance on the server so available permissions can be inferred.

Conclusion for this repo:

- Better Auth dynamic access control is useful for apps that accept a code-defined permission vocabulary.
- This repo has a hard requirement that product permissions must be API/UI-managed and database-backed, not hardcoded product config.
- Therefore product authorization policy should be owned by an `idAuthorizationPolicy` plugin, not by hardcoded `createAccessControl` statements.
- Better Auth organization roles remain useful for controlling organization administration and membership management.

### 3.4 Better Auth Teams

Better Auth teams are a native part of the Organization plugin. Current docs and installed package behavior show:

- Teams can be enabled with `organization({ teams: { enabled: true } })`.
- Team endpoints include create, list, update, remove, set active team, list user teams, list team members, add member, and remove member.
- `teamMember` links teams to `userId`, not `memberId`, in the installed Better Auth schema.
- Better Auth currently does not provide native team role assignment or team role inheritance.
- Issue #4493 tracks support for assigning roles to teams under the Better Auth `2.0.0` milestone.

Conclusion:

- Enable Better Auth teams when the product needs team membership.
- Do not create separate team/member tables.
- Add `policyTeamRoleAssignment` as a temporary bridge for team role inheritance until Better Auth ships native team roles.

### 3.5 OAuth Provider Scope And Token Hooks

Observed OAuth Provider behavior:

- `scopes` is an option passed to `oauthProvider(...)`.
- `validAudiences` is an option passed to `oauthProvider(...)`.
- The provider validates requested scopes against configured provider scopes and client scopes.
- The provider validates `resource` against `validAudiences`.
- `customAccessTokenClaims` receives `{ user, referenceId, scopes, resource, metadata }`.
- `customAccessTokenClaims` does not receive the Better Auth session.
- The final JWT access token contains provider-controlled claims such as `scope`, `aud`, `azp`, `iss`, `iat`, and `exp`.

Implications:

- DB-backed OAuth scopes should be preloaded before constructing `oauthProvider`, just like resource audiences.
- User permission checks can run inside `customAccessTokenClaims`.
- `customAccessTokenClaims` should throw when requested scopes exceed the user's effective permissions.
- Resource APIs should not depend on role claims if scopes already carry the allowed authorization surface.

## 4. Target Model

### 4.1 Ownership Boundaries

Better Auth owns:

- users;
- sessions;
- organizations;
- members;
- invitations;
- teams;
- OAuth clients;
- OAuth Provider endpoints;
- authorization code, PKCE, refresh token, introspection, revocation;
- JWT signing and JWKS.

`idResourceServer` owns:

- resource-server audience registration;
- enabled audience preload for `oauthProvider({ validAudiences })`.

New `idAuthorizationPolicy` owns:

- API/UI-managed product permission resources;
- API/UI-managed product permission actions;
- API/UI-managed product roles;
- role-permission bindings;
- member product role assignments;
- team product role assignments;
- OAuth scope catalog;
- scope-to-permission mappings;
- cache invalidation for policy and scope mutations.

Resource APIs own:

- local JWT verification using issuer metadata and JWKS;
- route-level checks for `aud`, `org_id`, and required OAuth scope.

### 4.2 API-First Policy Plugin

Add a Better Auth plugin under:

```text
workers/core/src/auth/plugins/authorization-policy/
├── index.ts
├── schema.ts
├── operations.ts
├── scopes.ts
├── policy.ts
├── types.ts
└── README.md
```

Responsibilities:

- Register Better Auth plugin schema for policy tables.
- Expose admin endpoints under `/api/auth/admin/policy/...`.
- Validate all request bodies with Zod.
- Authorize mutations using injected callbacks from `get-auth.ts`.
- Invalidate scope and policy caches after mutations.
- Provide runtime companions for preloading OAuth scopes and reading policy mappings.

This mirrors `workers/core/src/auth/plugins/resource-server/**`.

The first implementation should stop at API and tests. The admin UI will call the same endpoints in a later phase.

### 4.3 OAuth Scope Catalog Preload

Move OAuth scope strings out of `authPluginConfig.oauthScopes`.

New flow:

```text
policyOAuthScope table
  -> enabled scopes loaded by authorization-policy/scopes.ts
  -> memory cache, then KV, then D1 fallback
  -> /oauth2/authorize and /oauth2/token preload scopes
  -> getAuth(env, runtimeCatalog)
  -> oauthProvider({ scopes: runtimeCatalog.scopes, validAudiences: runtimeCatalog.validAudiences })
```

Static built-in OIDC scopes still remain in code because they are protocol-level, not product policy:

```text
openid
profile
email
offline_access
```

Product API scopes are DB-backed:

```text
book:read
book:update
chapter:read
chapter:publish
```

### 4.4 Token Issuance Authorization Gate

Token issuance must reject scopes that the user cannot receive.

Flow:

```text
customAccessTokenClaims({ user, referenceId, scopes, resource })
  -> if no user, handle M2M rules separately
  -> if user and organization-scoped scope, require referenceId
  -> load scope-to-permission mapping for requested scopes
  -> resolve effective role IDs/names:
       direct member policy role assignments
       + roles inherited through Better Auth team membership
  -> check effective roles grant every required permission
  -> throw on denied scope
  -> return org_id/aud/sub custom claims
```

The resource API will later check the `scope` claim. It should not need to understand which role granted that scope.

### 4.5 Resource API Verification Model

Resource APIs should perform local OAuth resource-server checks:

```text
1. Extract Bearer token.
2. Verify JWT signature with issuer JWKS.
3. Verify issuer.
4. Verify audience equals this API's registered resource audience.
5. Verify expiration.
6. Verify org_id matches the route/resource organization.
7. Verify required OAuth scope is present.
```

Example logic:

```ts
const payload = await jwtVerify(token, jwks, {
  issuer: "https://id.example.com/api/auth",
  audience: "https://books-api.example.com",
});

if (payload.org_id !== book.organizationId) {
  throw new Response("Forbidden", { status: 403 });
}

const scopes = String(payload.scope ?? "").split(" ").filter(Boolean);
if (!scopes.includes("book:update")) {
  throw new Response("Forbidden", { status: 403 });
}
```

The resource API does not check `writer`, `publisher`, or team membership. `core-id` already converted roles and permissions into OAuth scopes during token issuance.

## 5. Architecture Decisions

### 5.1 Use A Better Auth Plugin, Not Standalone Drizzle

Decision:

- Implement `idAuthorizationPolicy` as a Better Auth plugin under `workers/core/src/auth/plugins/authorization-policy/**`.

Rationale:

- Policy tables are auth-owned data.
- The repo architecture requires custom auth tables to be Better Auth plugin schemas, not standalone Drizzle/domain/application stacks.
- The plugin can expose admin endpoints with `createAuthEndpoint`.
- The plugin can provide runtime companions for preload and cache invalidation, matching `idResourceServer`.

Rejected:

- Standalone Drizzle tables in `workers/core/src/infrastructure/db/schema.ts`.
- Hono `/api/admin/*` CRUD routes for this policy data.

### 5.2 Do Not Use Hardcoded Product `createAccessControl` As The Main Policy Store

Decision:

- Do not use a hardcoded `createAccessControl({ book: ["read"] })` statement as the main product policy source.
- Keep product resources/actions in DB and UI.

Rationale:

- The product requirement is API/UI-managed policy.
- Better Auth dynamic access control still requires an `ac` instance that declares the permission vocabulary in source code.
- That makes it a poor fit for product permissions that must be fully UI-managed.

Allowed:

- Continue using Better Auth organization/admin roles for auth-system administration.
- Revisit Better Auth dynamic access control for specific admin-only controls if the permission vocabulary is intentionally code-owned.

### 5.3 Keep OAuth Scopes DB-Backed And Preloaded

Decision:

- Store product OAuth scopes in `policyOAuthScope`.
- Preload enabled scopes before constructing Better Auth for `/oauth2/authorize` and `/oauth2/token`.

Rationale:

- OAuth Provider validates requested scopes against the provider's configured `scopes`.
- This is the same lifecycle problem as `validAudiences`.
- `resource-server/audiences.ts` already proves the acceptable memory/KV/D1 preload pattern.

### 5.4 Keep Role-To-Permission Decisions In Core Token Issuance

Decision:

- `core-id` decides whether a user may receive requested scopes.
- Resource APIs only verify token integrity and route-level `aud`/`org_id`/`scope`.

Rationale:

- Role semantics must be centralized.
- Resource APIs should not duplicate product policy logic.
- OAuth scopes are the portable authorization result resource APIs understand.

### 5.5 Treat Team Role Assignment As A Temporary Bridge

Decision:

- Store team role assignment in `policyTeamRoleAssignment` until Better Auth ships native team role assignment.
- Keep Better Auth teams as the source of truth for team identity and membership.

Rationale:

- Better Auth teams exist now, but native team role inheritance does not.
- A plugin-owned bridge can be migrated to Better Auth native team role storage later.
- This avoids modifying Better Auth team tables or replacing them.

### 5.6 Avoid Role Claims Unless A Resource API Explicitly Needs Them

Decision:

- Do not emit `team_roles` by default.
- Prefer issuing authorized OAuth scopes.
- If roles or permissions must be emitted for a known API, use array claims and document them as private claims.

Rationale:

- OAuth scopes are already the resource-server authorization surface.
- Role claims increase token size and couple APIs to policy internals.
- RFC 9068 discusses `roles`, `groups`, and `entitlements`, but this repo does not need them for the first implementation if scopes are enforced at issuance.

## 6. Proposed Data Model

The exact model names should live in `workers/core/src/shared/constants.ts` with JSDoc, following the resource-server plugin pattern.

### 6.1 `policyResource`

Represents an API/UI-managed product resource.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `key` | string | Stable key, for example `book` |
| `name` | string | Display name |
| `description` | string? | Optional admin-facing description |
| `enabled` | boolean | Disabled resources cannot be assigned to new scopes/permissions |
| `createdAt` | number | Timestamp ms |
| `updatedAt` | number | Timestamp ms |
| `createdBy` | string? | Actor user ID |
| `updatedBy` | string? | Actor user ID |

Constraints:

- `key` unique.
- `key` should be lowercase kebab or snake compatible. Example pattern: `^[a-z][a-z0-9_-]*$`.

### 6.2 `policyAction`

Represents an API/UI-managed action under a product resource.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `resourceId` | string | References `policyResource.id` |
| `key` | string | Stable key, for example `read`, `update`, `publish` |
| `name` | string | Display name |
| `description` | string? | Optional description |
| `enabled` | boolean | Disabled actions cannot be newly assigned |
| `createdAt` | number | Timestamp ms |
| `updatedAt` | number | Timestamp ms |

Constraints:

- Unique `(resourceId, key)`.
- `key` should use the same naming rule as resources.

### 6.3 `policyRole`

Represents an API/UI-managed product role.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `organizationId` | string? | Null for global templates, set for org-specific roles |
| `key` | string | Stable key, for example `writer` |
| `name` | string | Display name |
| `description` | string? | Optional description |
| `enabled` | boolean | Disabled roles stop new assignments |
| `createdAt` | number | Timestamp ms |
| `updatedAt` | number | Timestamp ms |

Constraints:

- Unique `(organizationId, key)` with a clear convention for global roles.
- Deleting roles with assignments should be blocked or soft-disabled.

### 6.4 `policyRolePermission`

Binds a role to a permission.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `roleId` | string | References `policyRole.id` |
| `resourceId` | string | References `policyResource.id` |
| `actionId` | string | References `policyAction.id` |
| `createdAt` | number | Timestamp ms |
| `createdBy` | string? | Actor user ID |

Constraints:

- Unique `(roleId, resourceId, actionId)`.
- `actionId` must belong to `resourceId`.

### 6.5 `policyMemberRoleAssignment`

Assigns a product role directly to an organization member.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `organizationId` | string | References BA `organization.id` |
| `userId` | string | References BA `user.id` |
| `roleId` | string | References `policyRole.id` |
| `createdAt` | number | Timestamp ms |
| `createdBy` | string? | Actor user ID |

Constraints:

- Unique `(organizationId, userId, roleId)`.
- The user must be a Better Auth member of the organization.

### 6.6 `policyTeamRoleAssignment`

Assigns a product role to a Better Auth team.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `organizationId` | string | References BA `organization.id` |
| `teamId` | string | References BA `team.id` |
| `roleId` | string | References `policyRole.id` |
| `createdAt` | number | Timestamp ms |
| `createdBy` | string? | Actor user ID |

Constraints:

- Unique `(organizationId, teamId, roleId)`.
- The team must belong to the organization.
- Effective role resolution uses BA `teamMember.userId`.

### 6.7 `policyOAuthScope`

Defines an API/UI-managed OAuth scope and maps it to a required product permission.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `scope` | string | OAuth scope string, for example `book:update` |
| `resourceId` | string | References `policyResource.id` |
| `actionId` | string | References `policyAction.id` |
| `resourceServerId` | string? | Optional reference to `resourceServer.id` for audience-specific scopes |
| `enabled` | boolean | Only enabled scopes are advertised and accepted |
| `createdAt` | number | Timestamp ms |
| `updatedAt` | number | Timestamp ms |

Constraints:

- Unique `scope`.
- `actionId` must belong to `resourceId`.
- Protocol scopes `openid`, `profile`, `email`, and `offline_access` remain built-ins and should not be rows in this table unless a future migration intentionally models them.

## 7. Runtime Flows

### 7.1 Admin Policy API Management Flow

The API-first release exposes Better Auth plugin endpoints. Initial consumers are tests, scripts, and direct API callers. Admin UI is deferred and will call the same endpoints later.

```text
POST   /api/auth/admin/policy/resources
GET    /api/auth/admin/policy/resources
PATCH  /api/auth/admin/policy/resources/:id

POST   /api/auth/admin/policy/actions
GET    /api/auth/admin/policy/actions
PATCH  /api/auth/admin/policy/actions/:id

POST   /api/auth/admin/policy/roles
GET    /api/auth/admin/policy/roles
PATCH  /api/auth/admin/policy/roles/:id

POST   /api/auth/admin/policy/role-permissions
DELETE /api/auth/admin/policy/role-permissions/:id

POST   /api/auth/admin/policy/member-role-assignments
DELETE /api/auth/admin/policy/member-role-assignments/:id

POST   /api/auth/admin/policy/team-role-assignments
DELETE /api/auth/admin/policy/team-role-assignments/:id

POST   /api/auth/admin/policy/oauth-scopes
GET    /api/auth/admin/policy/oauth-scopes
PATCH  /api/auth/admin/policy/oauth-scopes/:id
```

Authorization:

- Platform admins may manage all policy.
- Organization owners/admins may manage policy for their organization if product requirements allow tenant-managed policy.
- Endpoint authorization is injected from `get-auth.ts`; plugin files do not import `auth/policies/access.ts` directly.

### 7.2 OAuth Authorization Code With PKCE

Flow:

```text
1. Client sends /api/auth/oauth2/authorize with scope and resource.
2. auth-mount detects OAuth route.
3. createAuthForRequest preloads:
   - valid resource audiences from idResourceServer
   - enabled product scopes from idAuthorizationPolicy
4. oauthProvider validates requested scopes against:
   - built-in protocol scopes
   - loaded product scopes
   - client's registered allowed scopes
5. User completes login and consent.
6. Client exchanges code at /api/auth/oauth2/token.
7. createAuthForRequest preloads the same runtime catalog.
8. customAccessTokenClaims checks user effective permissions for requested scopes.
9. If allowed, OAuth Provider signs the JWT access token.
10. If denied, token issuance fails.
```

Important:

- Better Auth enforces S256 PKCE in the installed OAuth Provider.
- The policy check is additional authorization, not a replacement for PKCE, client authentication, scope validation, or resource validation.

### 7.3 Refresh Token Flow

Refresh tokens reuse the original authorized scope set or a requested subset.

Flow:

```text
1. Client sends /api/auth/oauth2/token with grant_type=refresh_token.
2. createAuthForRequest preloads enabled scopes and valid audiences.
3. OAuth Provider validates refresh token and requested scopes.
4. customAccessTokenClaims runs again.
5. Policy is re-evaluated against current member/team assignments.
6. If membership or role access was removed, refreshed access token issuance fails.
```

This is required so product policy changes do not wait for refresh token expiration.

Operational policy:

- High-risk removal, such as removing a user from an organization, should also revoke affected refresh tokens through OAuth revocation or an admin incident workflow.
- Access tokens already issued remain valid until expiry unless resource APIs use introspection or token revocation checks. The current access token TTL is 3 hours.

### 7.4 Resource API Request Flow

Resource API checks:

```text
1. Verify signature via JWKS.
2. Verify issuer.
3. Verify audience.
4. Verify expiration.
5. Verify org_id.
6. Verify required scope.
```

Example:

```text
PATCH /books/:id
  -> load book organization ID
  -> require audience https://books-api.example.com
  -> require org_id == book.organizationId
  -> require scope book:update
```

The resource API should not query team membership or policy role tables for normal requests. Those decisions happened at token issuance.

## 8. Implementation Strategy

### 8.1 Plugin Layout

Create:

```text
workers/core/src/auth/plugins/authorization-policy/
├── README.md
├── index.ts
├── schema.ts
├── operations.ts
├── scopes.ts
├── policy.ts
└── types.ts
```

File responsibilities:

- `schema.ts`: canonical Zod row schemas, request schemas, Better Auth field maps, OpenAPI fragments.
- `index.ts`: plugin factory, schema registration, explicit endpoint definitions.
- `operations.ts`: payload builders, uniqueness checks, role assignment validation, authorization wrappers.
- `scopes.ts`: preload enabled OAuth scopes with memory/KV/D1 fallback; expose invalidation.
- `policy.ts`: resolve effective roles, load scope-permission mappings, check requested scopes.
- `types.ts`: plugin options and injected callbacks.
- `README.md`: plugin ownership and runtime notes.

### 8.2 Auth Composition Changes

Change `get-auth.ts` from:

```ts
getAuth(env, validAudiences, runtime)
```

to a runtime catalog shape:

```ts
type OAuthRuntimeCatalog = {
  readonly validAudiences: readonly string[];
  readonly scopes: readonly string[];
};
```

Then:

```ts
oauthProvider({
  scopes: [...builtInProtocolScopes, ...catalog.scopes],
  validAudiences: [...catalog.validAudiences],
  customAccessTokenClaims: async ({ resource, referenceId, scopes, user }) => {
    if (user) {
      await assertRequestedScopesAllowed({
        env,
        userId: user.id,
        organizationId: referenceId,
        scopes,
        resource,
      });
    }

    return {
      aud: resource,
      org_id: referenceId,
      sub: user?.id,
    };
  },
})
```

Do not return `scope` from `customAccessTokenClaims`; OAuth Provider owns the final `scope` claim.

Update route preload selection:

```ts
authPathNeedsOAuthRuntimeCatalog(pathname)
```

This should return `true` for:

```text
/oauth2/authorize
/oauth2/token
```

It can replace or wrap `authPathNeedsResourceAudiences`.

### 8.3 Deferred Admin UI Surfaces

Admin UI is not part of the first implementation phase for this plan. It should be built after the plugin APIs, cache invalidation, token issuance checks, and resource API guidance are in place.

The later admin UI should expose the following workflows under `/admin/*`:

- Permission resources and actions.
- Roles.
- Role permission editor.
- Member role assignments.
- Team role assignments.
- OAuth scope catalog and scope-permission mapping.

UI code rules:

- UI worker must not import Better Auth, core source, Drizzle, D1/KV, or Jose.
- UI pages call same-origin `/api/auth/admin/policy/...` endpoints.
- Shared UI primitives come from `packages/ui`.
- Route files should compose components rather than embedding raw UI logic.

### 8.4 Cache And Invalidation

Use the same cache tiers as resource-server audiences:

```text
per-isolate memory cache
  -> KV cache
  -> D1 fallback
```

Suggested cache keys:

```text
id-policy:oauth-scopes
id-policy:scope-permissions
id-policy:effective-roles:<organizationId>:<userId>
```

Invalidation:

- Scope mutations invalidate `id-policy:oauth-scopes` and `id-policy:scope-permissions`.
- Role-permission mutations invalidate `id-policy:scope-permissions` and effective-role/permission caches.
- Member role assignment mutations invalidate that user/org effective cache.
- Team role assignment mutations invalidate affected team members' effective cache. If enumerating team members is expensive, delete an org-level version key instead.
- Team membership changes should invalidate affected user/org effective cache. This may require wrapping team management through policy-aware endpoints or adding hooks around BA team endpoints where available.

## 9. Migration And Rollout

Phase 1:

- Add `idAuthorizationPolicy` plugin schema and endpoints.
- Keep existing static `authPluginConfig.oauthScopes` as fallback.
- Add tests for schema maps and endpoint authorization.
- Update architecture scripts so the new plugin-owned preload companion is allowed to perform its approved raw D1 fallback.

Phase 2:

- Add scope preload runtime.
- Seed DB scopes equivalent to current static API scopes.
- Change OAuth Provider to use built-in protocol scopes plus loaded DB scopes.
- Keep a temporary fallback to static scopes for local bootstrap only if tests require it.

Phase 3:

- Add policy checks in token issuance.
- Start with audit-only logging in development tests if needed.
- Switch to hard deny once policy seed data exists.

Phase 4:

- Enable Better Auth teams.
- Add team role assignment endpoints and effective role resolution.
- API-first deliverable is team role assignment endpoints and tests. Full UI can remain deferred.

Phase 5:

- Remove static product scopes from `authPluginConfig`.
- Update docs and README if public commands or setup changed.
- Build admin UI pages after the API has stabilized.

Rollback:

- Keep migrations additive until rollout is complete.
- If scope preload fails in production, fail closed for token issuance rather than accepting unknown scopes.
- Revert OAuth Provider to static product scopes only as an emergency rollback and document any issued-token policy gap.

## 10. Edge Cases And Failure Modes

| Scenario | Expected behavior |
|---|---|
| Scope row disabled after client received refresh token | Next refresh re-runs policy and fails if scope is no longer enabled or allowed |
| Role removed from user | Existing access token remains valid until expiry; refresh fails if requested scopes are no longer permitted |
| User removed from organization | Refresh must fail; operator should revoke related refresh tokens for immediate cleanup |
| Team role removed | Refresh fails for scopes that depended on the team role |
| Team membership removed | Effective role cache must be invalidated; refresh fails for lost team permissions |
| Scope maps to missing resource/action | Treat as invalid policy config; deny issuance and surface admin error |
| Duplicate scope string | Endpoint rejects with `BAD_REQUEST` |
| Product scope has no permission mapping | Deny user-token issuance; M2M behavior must be explicitly configured |
| M2M client requests product scope | Use client-level allowed scopes only, or add explicit M2M policy rows; do not apply user/team policy |
| OAuth route cache miss | Load from D1 and refill KV |
| KV outage | Fall back to D1; if D1 also fails, deny OAuth route with server error |
| Resource API receives token without `org_id` for org route | Return `403` |
| Resource API receives valid token missing route scope | Return `403` |

## 11. Implementation Backlog

### P1-A. Create Authorization Policy Plugin Skeleton

Scope:

- `workers/core/src/auth/plugins/authorization-policy/index.ts`
- `workers/core/src/auth/plugins/authorization-policy/schema.ts`
- `workers/core/src/auth/plugins/authorization-policy/operations.ts`
- `workers/core/src/auth/plugins/authorization-policy/types.ts`
- `workers/core/src/shared/constants.ts`

Tasks:

- [ ] Add plugin directory following `workers/core/src/auth/plugins/README.md`.
- [ ] Define canonical Zod schemas for all policy rows.
- [ ] Derive Better Auth field maps from Zod schemas.
- [ ] Register plugin schema in `index.ts`.
- [ ] Add minimal list/create/update endpoints for resources, actions, roles, role permissions, assignments, and scopes.
- [ ] Inject authorization callbacks from `get-auth.ts`.

Acceptance criteria:

- Policy models are Better Auth plugin schema models.
- No standalone Drizzle schema is added.
- Endpoint request bodies are Zod-validated.
- Plugin endpoint handlers use Better Auth adapter CRUD.

Tests:

- Schema field map unit tests.
- Operation helper unit tests.
- Endpoint integration tests through `auth.handler()`.

### P1-B. Add Scope Catalog Preload Runtime

Scope:

- `workers/core/src/auth/plugins/authorization-policy/scopes.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/http/routes/auth-mount.ts`
- `workers/core/src/auth/config.ts`

Tasks:

- [ ] Implement memory/KV/D1 loader for enabled product scopes.
- [ ] Add cache invalidation for scope mutations.
- [ ] Introduce `OAuthRuntimeCatalog`.
- [ ] Load resource audiences and product scopes for `/oauth2/authorize` and `/oauth2/token`.
- [ ] Pass loaded scopes to `oauthProvider({ scopes })`.

Acceptance criteria:

- OAuth Provider accepts DB-backed product scopes.
- Disabled scopes are rejected.
- Well-known and JWKS routes do not pay the policy preload cost.

Tests:

- Cache hit/miss/invalidation tests.
- OAuth authorize test for DB-backed scope.
- OAuth authorize test for disabled/unknown scope.

### P1-C. Add Token Issuance Policy Check

Scope:

- `workers/core/src/auth/plugins/authorization-policy/policy.ts`
- `workers/core/src/auth/get-auth.ts`

Tasks:

- [ ] Implement scope-to-permission lookup.
- [ ] Implement direct member role resolution.
- [ ] Implement team-inherited role resolution using BA `teamMember.userId`.
- [ ] Implement `assertRequestedScopesAllowed`.
- [ ] Call assertion from `customAccessTokenClaims`.
- [ ] Define M2M behavior explicitly.

Acceptance criteria:

- User tokens only include scopes currently permitted by direct or team-inherited roles.
- Refresh token flow rechecks current policy.
- Resource APIs do not need to understand roles.

Tests:

- Token issuance allowed for direct member role.
- Token issuance allowed for inherited team role.
- Token issuance denied after role removal.
- Refresh denied after permission removal.
- M2M behavior covered.

### P1-D. Enable Better Auth Teams

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/db/auth-schema.ts`
- migration files generated by Better Auth tooling

Tasks:

- [ ] Enable `organization({ teams: { enabled: true } })`.
- [ ] Generate/apply Better Auth schema changes for `team`, `teamMember`, `session.activeTeamId`, and `invitation.teamId`.
- [ ] Add route contract tests for team endpoints that matter to policy APIs.
- [ ] Verify installed schema uses `teamMember.userId`.

Acceptance criteria:

- Better Auth team endpoints are available under `/api/auth/organization/*`.
- Team membership is managed by Better Auth, not custom tables.
- Policy team role assignments reference BA team IDs.

Tests:

- Team create/list/add-member/remove-member integration tests.
- Effective role resolution test through team membership.

### P1-E. Update Architecture Scripts And Developer Tooling

Scope:

- `scripts/oxlint-js-plugins/architecture.js`
- `scripts/auth-api.mjs`
- `scripts/auth-api-shared.mjs`
- `scripts/remote-smoke.mjs`
- `docs/003_future-implementation.md`

Tasks:

- [ ] Update `architecture/no-direct-db-access` so approved plugin-owned preload companions are allowed, not only `resource-server/audiences.ts`.
- [ ] Keep raw D1 fallback limited to runtime companions such as `authorization-policy/scopes.ts`; plugin CRUD must still use the Better Auth adapter.
- [ ] Update lint error text so it names approved plugin-owned preload companions, not only the resource-server audience companion.
- [ ] Extend API helper scripts only if policy endpoint smoke workflows are needed before admin UI exists.
- [ ] Extend remote smoke coverage to prove DB-backed OAuth scopes can be loaded and used in token issuance.
- [ ] Keep `docs/003_future-implementation.md` synchronized with the deferred admin UI and scripts/tooling reminders.

Acceptance criteria:

- Architecture lint still blocks raw D1 access everywhere except approved persistence and plugin-owned preload companions.
- The new authorization policy preload file does not require architecture-rule weakening.
- API smoke tooling can exercise the policy endpoints without waiting for admin UI.

Tests:

- `pnpm lint`
- focused architecture lint fixture/update if fixtures exist
- remote smoke script after policy endpoints exist

### P1-F. Add Resource API Verification Guidance

Scope:

- `docs/006_resource-server-jwt-guide.md`
- example resource API docs or package comments if needed

Tasks:

- [ ] Update guide to explain that resource APIs check `aud`, `org_id`, and scopes.
- [ ] Avoid centering the design on `packages/lib/src/resource-token-verifier.ts`.
- [ ] Add examples for `book:read` and `book:update`.

Acceptance criteria:

- A resource API implementer can verify tokens without learning policy internals.
- Guide clearly says role-to-permission decisions happen in `core-id` token issuance.

Tests:

- Documentation review.

## 12. Future Backlog

- Build the full admin UI for policy management after the API-first implementation stabilizes.
- Migrate `policyTeamRoleAssignment` to Better Auth native team role assignment if issue #4493 lands with an acceptable API.
- Add policy export/import for environment promotion.
- Add policy audit log with before/after diffs.
- Add optimistic concurrency/versioning for role editors.
- Add optional token introspection enforcement for high-risk APIs that need immediate revocation semantics.
- Add policy simulation UI: select user, organization, resource, action, and show why access is allowed or denied.
- Add scope templates per resource server.

## 13. Test And Verification Plan

Required local checks after implementation:

```text
pnpm lint
pnpm check:dup
pnpm typecheck
pnpm test
pnpm advise
```

Focused test groups:

- Plugin schema derivation tests.
- Policy operation helper tests.
- Scope preload cache tests.
- OAuth route tests for loaded scopes.
- Token issuance tests for allowed and denied scopes.
- Refresh flow tests after policy change.
- Team effective-role tests.
- Admin endpoint authorization tests.
- API smoke tests for policy management endpoints.

Contract tests should prove:

- Unknown scopes are rejected before token issuance.
- Known but unauthorized scopes are rejected during token issuance.
- Disabled scope rows are not accepted.
- Direct member role permissions allow scope issuance.
- Team role assignments allow scope issuance.
- Removing team membership removes inherited permissions on refresh.
- Resource APIs only need scope/org/audience checks.

## 14. Definition Of Done

- `idAuthorizationPolicy` plugin exists under `workers/core/src/auth/plugins/authorization-policy/**`.
- Product permission resources/actions are API/UI-managed DB rows.
- Product roles and role-permission bindings are API/UI-managed DB rows.
- Member and team product role assignments are API/UI-managed DB rows.
- Product OAuth scopes are DB-backed and preloaded for OAuth routes.
- `oauthProvider({ scopes })` receives built-in protocol scopes plus DB-loaded product scopes.
- Token issuance rejects requested scopes that current user policy does not permit.
- Refresh flow rechecks current policy.
- Better Auth teams are enabled when team role assignment is implemented.
- Resource APIs can enforce authorization with JWT signature, issuer, audience, org, and scope checks.
- No Better Auth internals are patched or monkey-patched.
- No product permission vocabulary remains hardcoded as the long-term policy source.
- README is updated if public commands, setup, or topology change.
- Architecture scripts allow the new plugin-owned preload companion without weakening plugin CRUD boundaries.
- `pnpm check` passes.
- `pnpm advise` is clean or has justified suppressions according to `AGENTS.md`.

## 15. Final Model

The final model is not a hardcoded Better Auth access-control config and not an unsafe custom authorization fork.

It is:

```text
Better Auth
  owns identity, sessions, organizations, members, teams, OAuth, JWT, JWKS

idResourceServer plugin
  owns resource audiences and preloads validAudiences

idAuthorizationPolicy plugin
  owns API/UI-managed product permissions, roles, assignments, and OAuth scopes
  preloads scopes like resource-server preloads audiences
  checks requested scopes during token issuance

Resource APIs
  verify JWTs and enforce aud + org_id + scope
```

This satisfies the hard requirement that product policy is managed through API/UI and database state, while keeping all integration points inside Better Auth's public plugin and OAuth extension model. The first implementation should focus on plugin APIs, preload, token issuance checks, scripts/tooling, and tests; the admin UI is a deferred consumer of those APIs.
