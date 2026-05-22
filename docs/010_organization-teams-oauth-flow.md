# Resource-Server Scopes, Teams, And Token Contract

> Status: implementation-grade proposal
>
> Date: 2026-05-22
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth`
> - `workers/core/src/auth/get-auth.ts`
> - `workers/core/src/auth/config.ts`
> - `workers/core/src/auth/plugins/resource-server/**`
> - future `workers/core/src/auth/plugins/oauth-scope-catalog/**`
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
> - `docs/003_future-implementation.md`
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
> - `workers/core/src/auth/plugins/resource-server/index.ts`
> - `workers/core/src/auth/plugins/resource-server/schema.ts`
> - `workers/core/src/auth/plugins/resource-server/audiences.ts`
> - `workers/core/src/http/routes/auth-mount.ts`
> - `workers/core/src/db/auth-schema.ts`
> - `node_modules/better-auth/dist/plugins/organization/**`
> - `node_modules/@better-auth/oauth-provider/dist/**`
>
> Assumptions:
>
> - `id` stays a generic identity provider and OAuth authorization server. It must not become Content IAM.
> - `id` owns OAuth clients, resource-server audiences, resource-server-bound OAuth scopes, JWT/JWKS, organization/team/client identity facts, and token issuance.
> - Resource APIs own product roles, product permissions, role-permission mappings, principal-role bindings, resource hierarchy/inheritance, final authorization decisions, and product policy audit events.
> - Better Auth remains the source of truth for identity, sessions, organizations, members, teams, OAuth clients, OAuth Provider, JWT signing, and JWKS.
> - "Custom" means two different things in this document: patching or bypassing Better Auth internals is forbidden; plugin-owned schema plus preload/glue through public Better Auth extension points is allowed and preferred.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Boundary](#2-boundary)
  - [2.1 `id` Owns](#21-id-owns)
  - [2.2 Resource APIs Own](#22-resource-apis-own)
  - [2.3 Native Better Auth Comparison](#23-native-better-auth-comparison)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Current Better Auth Composition](#31-current-better-auth-composition)
  - [3.2 Resource-Server Audience Preload Pattern](#32-resource-server-audience-preload-pattern)
  - [3.3 Better Auth Organization Access Control](#33-better-auth-organization-access-control)
  - [3.4 Better Auth Teams](#34-better-auth-teams)
  - [3.5 OAuth Provider Scope And Token Hooks](#35-oauth-provider-scope-and-token-hooks)
- [4. Target Model](#4-target-model)
  - [4.1 Ownership Boundaries](#41-ownership-boundaries)
  - [4.2 OAuth Scope Catalog Plugin](#42-oauth-scope-catalog-plugin)
  - [4.3 Resource-Server-Bound Scope Preload](#43-resource-server-bound-scope-preload)
  - [4.4 Token Issuance Gate](#44-token-issuance-gate)
  - [4.5 Downstream Token Contract](#45-downstream-token-contract)
  - [4.6 Resource API Verification Model](#46-resource-api-verification-model)
- [5. Data Model](#5-data-model)
  - [5.1 `oauthResourceScope`](#51-oauthresourcescope)
  - [5.2 `oauthClientOrganizationGrant`](#52-oauthclientorganizationgrant)
  - [5.3 Resource-Owned Content IAM Tables](#53-resource-owned-content-iam-tables)
- [6. Runtime Examples](#6-runtime-examples)
  - [6.1 Complex PKCE Example](#61-complex-pkce-example)
  - [6.2 Complex M2M Example](#62-complex-m2m-example)
- [7. Implementation Strategy](#7-implementation-strategy)
  - [7.1 Plugin Layout](#71-plugin-layout)
  - [7.2 Auth Composition Changes](#72-auth-composition-changes)
  - [7.3 Deferred Admin UI Surfaces](#73-deferred-admin-ui-surfaces)
  - [7.4 Cache And Invalidation](#74-cache-and-invalidation)
- [8. Migration And Rollout](#8-migration-and-rollout)
- [9. Edge Cases And Failure Modes](#9-edge-cases-and-failure-modes)
- [10. Implementation Backlog](#10-implementation-backlog)
  - [P1-A. Enable Better Auth Teams](#p1-a-enable-better-auth-teams)
  - [P1-B. Add OAuth Scope Catalog Plugin](#p1-b-add-oauth-scope-catalog-plugin)
  - [P1-C. Add Token Issuance Checks](#p1-c-add-token-issuance-checks)
  - [P1-D. Add M2M Organization Grant Support](#p1-d-add-m2m-organization-grant-support)
  - [P1-E. Update Architecture Scripts And Developer Tooling](#p1-e-update-architecture-scripts-and-developer-tooling)
  - [P1-F. Add Resource API Verification Guidance](#p1-f-add-resource-api-verification-guidance)
- [11. Future Backlog](#11-future-backlog)
- [12. Test And Verification Plan](#12-test-and-verification-plan)
- [13. Definition Of Done](#13-definition-of-done)
- [14. Final Model](#14-final-model)

## 1. Goal

Build an API-first, UI-ready scope and token contract system that stays aligned with Better Auth and OAuth.

`id` should provide:

- stable users;
- stable organizations;
- stable organization membership;
- stable teams inside one organization;
- stable team membership facts;
- stable OAuth client and service-account principal IDs;
- resource-server audience registration;
- resource-server-bound OAuth scope catalog;
- JWT signing and JWKS;
- token issuance for PKCE, refresh, and M2M flows.

Resource APIs should provide their own IAM. For `content-api`, that means:

- content roles such as `book.editor`, `chapter.writer`, `publisher`, and `media.manager`;
- content permissions such as `book.update`, `chapter.publish`, and `media.upload`;
- role-permission mappings;
- principal-role bindings for users, teams, and service accounts;
- resource hierarchy and inheritance;
- `ContentPolicy.can(...)` and `ContentPolicy.canMany(...)`;
- content policy audit events.

Short version:

```text
id gives OAuth and identity facts:
  who, org, teams, client, audience, scopes

content-api gives content decisions:
  can this principal do this action on this content object?
```

## 2. Boundary

### 2.1 `id` Owns

`id` owns generic identity, organization, OAuth, and token state:

- users;
- sessions;
- organizations;
- organization membership;
- teams;
- team membership;
- OAuth clients;
- service-account/client principal identity;
- resource-server audiences;
- resource-server-bound OAuth scopes;
- JWT signing and JWKS;
- token issuance;
- generic org-scoped M2M eligibility.

`id` does not own product role meaning. It may store a scope string like `book:update`, but it does not define `book.update`, `book.editor`, `writer`, `reviewer`, or what permissions those roles contain.

### 2.2 Resource APIs Own

Each resource API owns its product IAM semantics.

For `content-api`, this includes:

- books, chapters, sections, blocks, comments, media, bookmarks, progress, and recommendations;
- route-to-scope requirements;
- content roles;
- content permissions;
- role-permission mappings;
- content policy bindings;
- content resource hierarchy and inheritance;
- object-level authorization checks;
- content policy audit events.

Resource APIs define and enforce their own product roles. OAuth scopes only gate whether a token may attempt that API operation.

### 2.3 Native Better Auth Comparison

Native Better Auth Organization plus OAuth Provider does not require a separate principal assignment table for ordinary PKCE token issuance.

Native-style PKCE flow without teams:

```text
1. Client requests authorization code with:
   scope=openid profile email api:read
   resource=https://content-api.example.com
2. Better Auth validates OAuth client, redirect URI, PKCE, configured scopes, client scopes, and resource audience.
3. User logs in and consents.
4. Client exchanges code.
5. Better Auth issues an access token with user identity, audience, and scope.
```

There is no table like:

```text
policyMemberRoleAssignment
policyTeamRoleAssignment
```

Those assignment tables were a custom proposal to make `id` resolve `principal -> role -> permission -> scope` during token issuance. That drifts too far from Better Auth's intended organization model and fails to represent concrete content grants such as `team_editorial has book.editor on book_100`.

Corrected `id` flow:

```text
1. Client requests authorization code with:
   scope=book:update
   resource=https://content-api.example.com
2. id validates OAuth client, redirect URI, PKCE, resource audience, resource-server-bound scope, client scope allowance, and organization context.
3. User logs in and consents.
4. Client exchanges code.
5. id issues an access token with:
   sub=user_alice
   org_id=org_1
   aud=https://content-api.example.com
   scope=book:update
   team_ids=[team_editorial]
6. content-api verifies the token and runs:
   ContentPolicy.can(actor, "book.update", book_100)
```

This keeps `id` on par with Better Auth's design: identity, organizations, teams, OAuth clients, scopes, JWTs, and public extension glue. It does not add a parallel product IAM engine inside `id`.

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
- Existing static scopes are global strings, not resource-server-bound DB rows.
- Resource audiences are dynamic and loaded before auth construction.
- Access tokens include `org_id`, `aud`, `scope`, and `sub`.
- Access tokens do not include `team_ids`.
- M2M tokens need a stable `azp` or `client_id` contract and org-scoped eligibility checks.

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

This pattern is approved because `@better-auth/oauth-provider` needs `validAudiences` when the plugin is constructed. It does not patch Better Auth internals.

### 3.3 Better Auth Organization Access Control

Better Auth Organization supports code-defined and dynamic access control through `createAccessControl`.

Conclusion for this repo:

- Better Auth organization access control remains useful for administering Better Auth-owned organization resources.
- It should not be used as the Content IAM store.
- Resource APIs should not infer product rights from Better Auth organization roles. They should use their own policy stores.

### 3.4 Better Auth Teams

Better Auth teams are a native part of the Organization plugin. Current docs and installed package behavior show:

- Teams can be enabled with `organization({ teams: { enabled: true } })`.
- Team endpoints include create, list, update, remove, set active team, list user teams, list team members, add member, and remove member.
- `team.id` is a stable team principal ID.
- `team.organizationId` binds a team to one organization.
- `teamMember` links teams to `userId`, not `memberId`, in the installed Better Auth schema.
- Better Auth currently does not provide native team role assignment or team role inheritance.
- Issue #4493 tracks support for assigning roles to teams under the Better Auth `2.0.0` milestone.

Conclusion:

- Enable Better Auth teams when downstream services need team principals.
- Do not create separate team/member tables.
- Use Better Auth team IDs as stable downstream principal IDs.
- Do not store product team grants in `id`; resource APIs bind roles to `principal_type = "team"` when they own the concrete object.

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
- Product/API scope validation must be audience-aware through `resourceServerId`.
- Generic token issuance checks can run inside `customAccessTokenClaims`.
- `customAccessTokenClaims` should throw when requested scopes are disabled, unknown, not allowed for the client, not bound to the requested audience, or invalid for the active organization context.
- Resource APIs should build principals from `sub`, `client_id`/`azp`, and `team_ids`, then check their own concrete grants.

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

New `idOAuthScopeCatalog` owns:

- resource-server-bound OAuth scope rows;
- optional org-scoped M2M client grants;
- cache invalidation for scope and grant mutations.

Resource APIs own:

- route-to-scope requirements;
- product role definitions;
- product permission definitions;
- role-permission mappings;
- principal-to-role grants on concrete resource objects;
- resource hierarchy and inheritance;
- final `ContentPolicy.can(...)` or equivalent authorization decisions;
- product policy audit events.

### 4.2 OAuth Scope Catalog Plugin

Add a Better Auth plugin under:

```text
workers/core/src/auth/plugins/oauth-scope-catalog/
├── index.ts
├── schema.ts
├── operations.ts
├── scopes.ts
├── grants.ts
├── types.ts
└── README.md
```

Responsibilities:

- Register Better Auth plugin schema for scope and M2M org grant tables.
- Expose admin endpoints under `/api/auth/admin/oauth-scopes/...` or another explicitly scoped `/api/auth/admin/...` path.
- Validate all request bodies with Zod.
- Authorize mutations using injected callbacks from `get-auth.ts`.
- Invalidate scope and grant caches after mutations.
- Provide runtime companions for preloading OAuth scopes and reading M2M org grants.

This mirrors `workers/core/src/auth/plugins/resource-server/**`.

The first implementation should stop at API and tests. The admin UI will call the same endpoints in a later phase.

### 4.3 Resource-Server-Bound Scope Preload

Move product/API OAuth scope strings out of `authPluginConfig.oauthScopes`.

New flow:

```text
oauthResourceScope table
  -> enabled scopes loaded by oauth-scope-catalog/scopes.ts
  -> memory cache, then KV, then D1 fallback
  -> /oauth2/authorize and /oauth2/token preload scopes
  -> getAuth(env, runtimeCatalog)
  -> oauthProvider({ scopes: runtimeCatalog.scopes, validAudiences: runtimeCatalog.validAudiences })
  -> token issuance validates requested scopes against the requested resource audience
```

Protocol scopes remain code-owned:

```text
openid
profile
email
offline_access
```

Product/API scopes are DB-backed and resource-server-bound:

```text
resource_server_id=rs_content, scope=book:read
resource_server_id=rs_content, scope=book:create
resource_server_id=rs_content, scope=book:update
resource_server_id=rs_content, scope=chapter:update
resource_server_id=rs_content, scope=chapter:publish
resource_server_id=rs_content, scope=media:upload
```

A product scope row must reference the `resourceServer.id` for the API audience that owns that scope. This prevents generic-looking scope strings such as `api:read` from becoming global cross-resource collisions.

### 4.4 Token Issuance Gate

Token issuance must reject scopes that are not generically issuable for the client, organization, user, or service account.

Flow:

```text
customAccessTokenClaims({ user, referenceId, scopes, resource, metadata })
  -> verify requested scopes exist, are enabled, and are bound to the requested resource audience
  -> verify OAuth client is allowed to request the scopes
  -> if user token:
       require org_id for org-scoped resource routes
       verify user belongs to org_id
       load team_ids for the user inside org_id
       fail token issuance if team_ids would exceed the configured token claim limit
  -> if M2M token:
       resolve stable client_id from azp/metadata
       if org-scoped, verify client is eligible to receive org_id for the requested audience and scopes
  -> return custom identity claims
```

The resource API later checks the `scope` claim and then evaluates its own concrete grants. `core-id` validates the OAuth contract; it does not decide whether a principal can update a specific book, chapter, section, block, media item, or comment.

### 4.5 Downstream Token Contract

Resource APIs need stable identity facts from `id`.

Team contract:

- Better Auth `team.id` is the stable team principal ID that downstream services may store.
- Better Auth `team.organizationId` is the organization boundary for a team.
- A team belongs to exactly one organization.
- Cross-organization team membership is not supported unless explicitly designed later.
- Better Auth `teamMember` links `teamId` to `userId`; it does not use `memberId` in the installed schema.
- `id` uses the word `team`. Resource APIs should map Better Auth teams to `principal_type = "team"` instead of inventing mixed `group`/`team` naming.

User token claim contract:

```text
sub
org_id
scope
team_ids
```

Rules:

- `team_ids` contains only Better Auth team IDs for `sub` inside `org_id`.
- If the user has no teams in the active organization, `team_ids` should be `[]`.
- Teams from other organizations must not appear in the token.
- If `team_ids` would exceed the configured token claim size/count limit, token issuance must fail closed. Do not silently truncate team IDs and do not silently fall back to partial authorization. If this becomes painful, design an explicit membership projection or sync model.
- If token size or third-party interoperability becomes a concern, revisit RFC 9068-style `groups` or a collision-resistant private claim name. First-party resource APIs should use `team_ids` for clarity.

M2M token claim contract:

```text
azp or client_id
org_id when org-scoped
scope
```

Rules:

- The stable service-account principal ID is the OAuth client ID exposed through `azp` or a documented `client_id` custom claim.
- Org-scoped M2M tokens must include `org_id`.
- Org-scoped M2M token issuance must verify that the OAuth client is eligible to receive that `org_id` for the requested resource audience and scopes.
- Resource APIs may bind `principal_type = "service_account"` and `principal_id = <OAuth client ID>` to concrete product resources.
- M2M tokens do not carry `team_ids`.

Membership change behavior:

- Self-contained access tokens remain valid until expiry unless a resource API uses introspection, revocation, or its own synchronization/deny-list strategy.
- When a user is removed from a team, already-issued access tokens may still contain the old team ID until expiration.
- Refresh and new access-token issuance must reload team membership and omit removed teams.
- Current access token lifetime is `10_800` seconds, or 3 hours.

### 4.6 Resource API Verification Model

Resource APIs should perform local OAuth resource-server checks:

```text
1. Verify signature via JWKS.
2. Verify issuer.
3. Verify audience.
4. Verify expiration.
5. Verify org_id for organization-scoped routes.
6. Verify required OAuth scope.
7. Build actor from sub/client_id plus team_ids.
8. Run the resource API policy check for the concrete object.
```

Resource APIs define and enforce their own product roles. OAuth scopes only gate whether the token may attempt that API operation.

## 5. Data Model

Custom auth tables must be Better Auth plugin schemas, not standalone Drizzle tables.

### 5.1 `oauthResourceScope`

Defines an API-managed OAuth scope for one resource server.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `resourceServerId` | string | Required reference to `resourceServer.id` for the API audience that owns this scope |
| `scope` | string | OAuth scope string, for example `book:update` or `content:write` |
| `description` | string? | Admin-facing description |
| `enabled` | boolean | Disabled scopes are not advertised or accepted |
| `createdAt` | number | Timestamp ms |
| `updatedAt` | number | Timestamp ms |
| `createdBy` | string? | Actor user ID |
| `updatedBy` | string? | Actor user ID |

Constraints:

- Unique `(resourceServerId, scope)`.
- Product/API scopes must have `resourceServerId`.
- Protocol scopes `openid`, `profile`, `email`, and `offline_access` remain built-ins and should not be rows in this table unless a future migration intentionally models them.
- The same scope string can exist for different resource servers only as separate rows with different `resourceServerId` values.

### 5.2 `oauthClientOrganizationGrant`

Allows an OAuth client/service account to receive org-scoped M2M tokens.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `clientId` | string | OAuth client ID / service-account principal ID |
| `organizationId` | string | Better Auth organization ID |
| `resourceServerId` | string | Resource server for which the org-scoped token is allowed |
| `allowedScopes` | string[] | Resource-server-bound scopes allowed for this client in this org |
| `enabled` | boolean | Disabled grants cannot issue org-scoped M2M tokens |
| `createdAt` | number | Timestamp ms |
| `updatedAt` | number | Timestamp ms |
| `createdBy` | string? | Actor user ID |
| `updatedBy` | string? | Actor user ID |

Constraints:

- Unique `(clientId, organizationId, resourceServerId)`.
- Every `allowedScopes` entry must exist in `oauthResourceScope` for `resourceServerId`.
- This is generic OAuth client/org eligibility, not product object authorization.

### 5.3 Resource-Owned Content IAM Tables

`content-api` owns its IAM schema. Example shape:

```text
content_roles
  id
  key
  name

content_permissions
  key

content_role_permissions
  role_id
  permission_key

content_policy_bindings
  org_id
  principal_type: user | team | service_account
  principal_id
  role_id or role_key
  resource_type: org | book | chapter | section | block | media | comment
  resource_id
  expires_at
  created_by
  created_at

content_policy_events
  org_id
  actor
  event_type
  target
  before
  after
  created_at
```

Those tables are examples for `content-api`, not implementation work in `id`.

## 6. Runtime Examples

### 6.1 Complex PKCE Example

`id` data:

```text
resourceServer
  id = rs_content
  audience = https://content-api.example.com
  name = Content API
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = book:read
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = book:create
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = book:update
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = chapter:update
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = chapter:publish
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = media:upload
  enabled = true
```

OAuth client in `id`:

```text
client = web_editor_app
allowed resource = rs_content
allowed scopes =
  book:read
  book:create
  book:update
  chapter:update
  chapter:publish
  media:upload
```

Better Auth teams in `id`:

```text
team
  id = team_editorial
  organizationId = org_1

teamMember
  teamId = team_editorial
  userId = user_alice
```

PKCE request:

```text
client_id=web_editor_app
resource=https://content-api.example.com
scope=book:read book:update chapter:update chapter:publish media:upload
```

`id` checks:

```text
resource exists
all requested scopes exist for rs_content
web_editor_app may request those scopes
user_alice is in org_1
team_ids for user_alice in org_1 = [team_editorial]
team_ids fits within token claim limits
```

`id` issues:

```json
{
  "iss": "https://id.example.com/api/auth",
  "aud": "https://content-api.example.com",
  "azp": "web_editor_app",
  "sub": "user_alice",
  "org_id": "org_1",
  "scope": "book:read book:update chapter:update chapter:publish media:upload",
  "team_ids": ["team_editorial"]
}
```

`content-api` owns route scope requirements:

```text
GET    /books/:bookId               requires book:read
POST   /books                       requires book:create
PATCH  /books/:bookId               requires book:update
PATCH  /chapters/:chapterId         requires chapter:update
POST   /chapters/:chapterId/publish requires chapter:publish
POST   /media                       requires media:upload
```

`content-api` owns role and permission catalogs:

```text
content_roles
  book.editor
  chapter.writer
  publisher
  media.manager

content_permissions
  book.read
  book.update
  chapter.read
  chapter.update
  chapter.publish
  media.upload

content_role_permissions
  book.editor -> book.read
  book.editor -> book.update
  book.editor -> chapter.read
  book.editor -> chapter.update
  chapter.writer -> chapter.read
  chapter.writer -> chapter.update
  publisher -> book.read
  publisher -> chapter.read
  publisher -> chapter.publish
  media.manager -> media.upload
```

`content-api` owns hierarchy and concrete bindings:

```text
book_100
  org_id = org_1

chapter_200
  book_id = book_100
  org_id = org_1

section_300
  chapter_id = chapter_200
  org_id = org_1

content_policy_bindings
  principal_type = team
  principal_id = team_editorial
  role = book.editor
  resource_type = book
  resource_id = book_100

content_policy_bindings
  principal_type = user
  principal_id = user_alice
  role = publisher
  resource_type = chapter
  resource_id = chapter_200
```

Request:

```text
PATCH /chapters/chapter_200
Authorization: Bearer <token from id>
```

`content-api` checks:

```text
1. Verify JWT signature/JWKS.
2. Verify aud == https://content-api.example.com.
3. Verify org_id == chapter_200.org_id.
4. Verify scope includes chapter:update.
5. Build actor:
   user = user_alice
   teams = [team_editorial]
6. Resolve hierarchy:
   chapter_200 -> book_100 -> org_1
7. Load bindings for:
   user_alice
   team_editorial
   on chapter_200, book_100, org_1
8. Effective roles:
   team_editorial has book.editor on book_100
   inherited to chapter_200
9. book.editor includes chapter.update.
10. Allow.
```

Another request:

```text
PATCH /books/book_999
```

`content-api` checks:

```text
scope includes book:update
actor has no grant on book_999
deny
```

The token scope means the actor may attempt `book:update` routes. It does not mean the actor can update every book.

### 6.2 Complex M2M Example

`id` data:

```text
client = import_bot_client
allowed resource = rs_content
allowed scopes =
  media:upload
  book:create

oauthClientOrganizationGrant
  clientId = import_bot_client
  organizationId = org_1
  resourceServerId = rs_content
  allowedScopes = media:upload book:create
  enabled = true
```

M2M request:

```text
grant_type=client_credentials
resource=https://content-api.example.com
scope=media:upload book:create
org_id=org_1
```

`id` checks:

```text
client is authenticated
resource exists
all requested scopes exist for rs_content
client may request those scopes
client has enabled org grant for org_1 and rs_content
```

`id` issues:

```json
{
  "iss": "https://id.example.com/api/auth",
  "aud": "https://content-api.example.com",
  "azp": "import_bot_client",
  "client_id": "import_bot_client",
  "org_id": "org_1",
  "scope": "media:upload book:create"
}
```

`content-api` owns service-account IAM:

```text
content_policy_bindings
  principal_type = service_account
  principal_id = import_bot_client
  role = media.manager
  resource_type = org
  resource_id = org_1

content_role_permissions
  media.manager -> media.upload
```

Request:

```text
POST /media
Authorization: Bearer <M2M token from id>
```

`content-api` checks:

```text
scope includes media:upload
service_account import_bot_client has media.manager on org_1
media.manager includes media.upload
allow
```

## 7. Implementation Strategy

### 7.1 Plugin Layout

Create:

```text
workers/core/src/auth/plugins/oauth-scope-catalog/
├── README.md
├── index.ts
├── schema.ts
├── operations.ts
├── scopes.ts
├── grants.ts
└── types.ts
```

File responsibilities:

- `schema.ts`: canonical Zod row schemas, request schemas, Better Auth field maps, OpenAPI fragments.
- `index.ts`: plugin factory, schema registration, explicit endpoint definitions.
- `operations.ts`: payload builders, uniqueness checks, scope validation, grant validation, authorization wrappers.
- `scopes.ts`: preload enabled OAuth scopes with memory/KV/D1 fallback; expose invalidation.
- `grants.ts`: resolve M2M client organization grants.
- `types.ts`: plugin options and injected callbacks.
- `README.md`: plugin ownership and runtime notes.

### 7.2 Auth Composition Changes

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
  customAccessTokenClaims: async ({ resource, referenceId, scopes, user, metadata }) => {
    if (user) {
      const teamIds = referenceId
        ? await loadUserTeamIdsForOrganization(env, user.id, referenceId)
        : [];

      await assertRequestedScopesAllowed({
        env,
        userId: user.id,
        organizationId: referenceId,
        scopes,
        resource,
      });

      assertTeamIdsWithinTokenLimit(teamIds);

      return {
        aud: resource,
        org_id: referenceId,
        sub: user.id,
        team_ids: teamIds,
      };
    }

    const clientId = extractClientIdFromMetadata(metadata);

    await assertRequestedScopesAllowedForClient({
      env,
      clientId,
      organizationId: referenceId,
      scopes,
      resource,
    });

    return {
      aud: resource,
      org_id: referenceId,
      client_id: clientId,
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

### 7.3 Deferred Admin UI Surfaces

Admin UI is not part of the first implementation phase for this plan. It should be built after plugin APIs, cache invalidation, token issuance checks, and resource API guidance are in place.

The later `id` admin UI may expose:

- resource-server audiences;
- resource-server-bound OAuth scope catalog;
- M2M client organization grants;
- team membership visibility for downstream principal IDs.

The `id` admin UI must not expose content roles, content permissions, content bindings, content inheritance, or content policy audit.

### 7.4 Cache And Invalidation

Use the same cache tiers as resource-server audiences:

```text
per-isolate memory cache
  -> KV cache
  -> D1 fallback
```

Suggested cache keys:

```text
id-oauth-scopes:resource:<resourceServerId>
id-oauth-scopes:client-org-grants:<clientId>
id-teams:user:<organizationId>:<userId>
```

Invalidation:

- Scope mutations invalidate `id-oauth-scopes:resource:<resourceServerId>`.
- M2M org grant mutations invalidate `id-oauth-scopes:client-org-grants:<clientId>`.
- Team membership changes should invalidate `id-teams:user:<organizationId>:<userId>` if team ID lookup is cached.
- Resource-owned content IAM mutations are invalidated inside the resource API, not inside `id`.

## 8. Migration And Rollout

Phase 1:

- Enable Better Auth teams.
- Generate/apply Better Auth schema changes for `team`, `teamMember`, `session.activeTeamId`, and `invitation.teamId`.
- Add tests proving team IDs are stable, team membership uses `userId`, and team IDs stay inside one org.

Phase 2:

- Add `idOAuthScopeCatalog` plugin schema and endpoints.
- Keep existing static `authPluginConfig.oauthScopes` as fallback.
- Add tests for schema maps and endpoint authorization.
- Update architecture scripts so the new plugin-owned preload companion is allowed to perform its approved raw D1 fallback.

Phase 3:

- Add scope preload runtime.
- Seed DB scopes equivalent to current static API scopes.
- Change OAuth Provider to use built-in protocol scopes plus loaded DB scopes.
- Keep a temporary fallback to static scopes for local bootstrap only if tests require it.

Phase 4:

- Add generic token issuance checks.
- Add `team_ids` token claim resolution and overflow checks.
- Add M2M org-scoped eligibility checks if org-scoped M2M tokens are supported.
- Switch to hard deny once scope and generic token eligibility seed data exists.

Phase 5:

- Remove static product/API scopes from `authPluginConfig`.
- Update docs and README if public commands or setup changed.
- Build admin UI pages after the API has stabilized.

Rollback:

- Keep migrations additive until rollout is complete.
- If scope preload fails in production, fail closed for token issuance rather than accepting unknown scopes.
- Revert OAuth Provider to static product scopes only as an emergency rollback and document any issued-token policy gap.

## 9. Edge Cases And Failure Modes

| Scenario | Expected behavior |
|---|---|
| Scope row disabled after client received refresh token | Next refresh re-runs scope checks and fails if scope is no longer enabled or allowed |
| Same scope string on different resource servers | Allowed only when each row has a different `resourceServerId`; token checks bind scope evaluation to `aud` |
| Client requests scope for wrong resource audience | Deny token issuance |
| User removed from organization | Refresh/new token must fail for that org |
| Team membership removed | Existing access token may contain the old `team_ids` until expiry; refresh/new token omits the team |
| `team_ids` exceeds configured token claim limit | Deny token issuance; do not truncate |
| M2M client requests org-scoped token without org eligibility | Deny token issuance |
| Resource API receives token without `org_id` for org route | Return `403` |
| Resource API receives valid token missing route scope | Return `403` |
| Resource API receives valid token and scope but no object grant | Return `403` from the resource API policy layer |
| Content role changed in content-api | Content-api owns invalidation/audit; `id` token contract is unchanged |

## 10. Implementation Backlog

### P1-A. Enable Better Auth Teams

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/db/auth-schema.ts`
- migration files generated by Better Auth tooling

Tasks:

- [ ] Enable `organization({ teams: { enabled: true } })`.
- [ ] Generate/apply Better Auth schema changes for `team`, `teamMember`, `session.activeTeamId`, and `invitation.teamId`.
- [ ] Add route contract tests for team endpoints that matter to downstream token contracts.
- [ ] Verify installed schema uses `teamMember.userId`.
- [ ] Verify `team.organizationId` is available and enforced.

Acceptance criteria:

- Better Auth team endpoints are available under `/api/auth/organization/*`.
- Team membership is managed by Better Auth, not custom tables.
- Resource APIs can store BA team IDs as `principal_type = "team"` grants.

Tests:

- Team create/list/add-member/remove-member integration tests.
- Cross-org team exclusion tests.
- Token `team_ids` resolution test through team membership.

### P1-B. Add OAuth Scope Catalog Plugin

Scope:

- `workers/core/src/auth/plugins/oauth-scope-catalog/index.ts`
- `workers/core/src/auth/plugins/oauth-scope-catalog/schema.ts`
- `workers/core/src/auth/plugins/oauth-scope-catalog/operations.ts`
- `workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts`
- `workers/core/src/shared/constants.ts`

Tasks:

- [ ] Add plugin directory following `workers/core/src/auth/plugins/README.md`.
- [ ] Define canonical Zod schemas for `oauthResourceScope`.
- [ ] Derive Better Auth field maps from Zod schemas.
- [ ] Register plugin schema in `index.ts`.
- [ ] Add minimal list/create/update endpoints for resource-server-bound scopes.
- [ ] Implement memory/KV/D1 loader for enabled scopes.
- [ ] Introduce `OAuthRuntimeCatalog`.
- [ ] Load resource audiences and scopes for `/oauth2/authorize` and `/oauth2/token`.
- [ ] Pass loaded scopes to `oauthProvider({ scopes })`.
- [ ] Validate requested scopes against `resourceServerId` so scopes are accepted only for their owning audience.

Acceptance criteria:

- OAuth Provider accepts DB-backed resource-server-bound scopes.
- Disabled scopes are rejected.
- Same scope string can exist for different resource servers without global collision.
- Wrong-audience scope requests are rejected.
- Well-known and JWKS routes do not pay the scope preload cost.

Tests:

- Schema field map unit tests.
- Endpoint authorization tests.
- Cache hit/miss/invalidation tests.
- OAuth authorize/token test for DB-backed scope.
- OAuth authorize/token test for disabled/unknown scope.
- OAuth authorize/token test for same scope string on two different resource servers.
- OAuth authorize/token test rejecting a scope for the wrong resource audience.

### P1-C. Add Token Issuance Checks

Scope:

- `workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts`
- `workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts`
- `workers/core/src/auth/get-auth.ts`

Tasks:

- [ ] Implement generic user-token scope checks.
- [ ] Implement organization membership checks for organization-scoped user tokens.
- [ ] Implement `team_ids` lookup using BA `teamMember.userId`.
- [ ] Fail closed when `team_ids` exceeds the configured token claim limit.
- [ ] Implement `assertRequestedScopesAllowed`.
- [ ] Call assertion from `customAccessTokenClaims`.

Acceptance criteria:

- User tokens only include scopes that exist, are enabled, are resource-audience-valid, and are allowed for the OAuth client and organization context.
- Refresh token flow rechecks current scope catalog, organization membership, and team membership.
- Resource APIs can build user/team principals from token claims.

Tests:

- Token issuance allowed for valid organization member and enabled scope.
- Token issuance denied after organization membership removal.
- Refresh updates `team_ids` after team membership removal.
- Token issuance denied when `team_ids` would overflow the configured claim limit.
- Refresh denied after scope removal.

### P1-D. Add M2M Organization Grant Support

Scope:

- `workers/core/src/auth/plugins/oauth-scope-catalog/schema.ts`
- `workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts`
- `workers/core/src/auth/get-auth.ts`

Tasks:

- [ ] Define `oauthClientOrganizationGrant` plugin schema if org-scoped M2M tokens are required.
- [ ] Add minimal grant create/list/update endpoints.
- [ ] Resolve stable service principal from `azp` or `client_id`.
- [ ] Require grant before issuing `org_id` on M2M tokens.
- [ ] Validate requested M2M scopes against the grant's `resourceServerId` and `allowedScopes`.
- [ ] Document `principal_type = "service_account"` and `principal_id = <client ID>` for resource APIs.

Acceptance criteria:

- M2M clients have a stable principal ID.
- Org-scoped M2M tokens include `org_id`.
- Org-scoped M2M tokens cannot be issued without a generic org/client grant.
- Resource APIs can bind service accounts to product resources using the client principal ID.

Tests:

- M2M token includes stable `azp` or `client_id`.
- Org-scoped M2M token includes `org_id`.
- Org-scoped M2M token denied without grant.
- Org-scoped M2M token allowed with grant and allowed scopes.

### P1-E. Update Architecture Scripts And Developer Tooling

Scope:

- `scripts/oxlint-js-plugins/architecture.js`
- `scripts/auth-api.mjs`
- `scripts/auth-api-shared.mjs`
- `scripts/remote-smoke.mjs`
- `docs/003_future-implementation.md`

Tasks:

- [ ] Update `architecture/no-direct-db-access` so approved plugin-owned preload companions are allowed, not only `resource-server/audiences.ts`.
- [ ] Keep raw D1 fallback limited to runtime companions such as `oauth-scope-catalog/scopes.ts`; plugin CRUD must still use the Better Auth adapter.
- [ ] Update lint error text so it names approved plugin-owned preload companions, not only the resource-server audience companion.
- [ ] Extend API helper scripts only if scope/team smoke workflows are needed before admin UI exists.
- [ ] Extend remote smoke coverage to prove DB-backed OAuth scopes can be loaded and used in token issuance.
- [ ] Keep `docs/003_future-implementation.md` synchronized with the deferred admin UI and scripts/tooling reminders.

Acceptance criteria:

- Architecture lint still blocks raw D1 access everywhere except approved persistence and plugin-owned preload companions.
- The new scope preload file does not require architecture-rule weakening.
- API smoke tooling can exercise generic token/scope/team contracts without waiting for admin UI.

Tests:

- `pnpm lint`
- focused architecture lint fixture/update if fixtures exist
- remote smoke script after scope endpoints exist

### P1-F. Add Resource API Verification Guidance

Scope:

- `docs/006_resource-server-jwt-guide.md`
- example resource API docs or package comments if needed

Tasks:

- [ ] Update guide to explain that resource APIs check `aud`, `org_id`, scopes, and then their own object policy.
- [ ] Avoid centering the design on `packages/lib/src/resource-token-verifier.ts`.
- [ ] Add examples for resource-server-bound scopes such as `book:read`, `book:update`, and `media:upload`.
- [ ] Add examples for building an actor from `sub`, `client_id`/`azp`, and `team_ids`.
- [ ] Explain that product roles, permissions, grants, inheritance, and `ContentPolicy.can(...)` live in the resource API.

Acceptance criteria:

- A resource API implementer can verify tokens without learning `id` internals.
- Guide clearly says `id` owns OAuth scope and token contracts, while concrete IAM decisions happen in the resource API.

Tests:

- Documentation review.

## 11. Future Backlog

- Build generic `id` admin UI for audiences, resource-server-bound scopes, teams, and M2M org grants after the API-first implementation stabilizes.
- Add internal team membership sync endpoint or event stream if resource APIs need faster team updates than access-token expiry.
- Add optional token introspection enforcement for high-risk APIs that need immediate revocation semantics.
- Revisit `groups` or collision-resistant claim names if tokens become broad third-party access tokens instead of first-party resource API tokens.
- Revisit Better Auth native team role assignment if issue #4493 lands with an acceptable API, but keep product roles in resource APIs.

## 12. Test And Verification Plan

Required local checks after implementation:

```text
pnpm lint
pnpm check:dup
pnpm typecheck
pnpm test
pnpm advise
```

Focused test groups:

- Better Auth teams schema and endpoint tests.
- Team claim resolution tests.
- OAuth scope catalog schema tests.
- Scope preload cache tests.
- OAuth route tests for loaded scopes.
- Token issuance tests for allowed and denied scopes.
- Refresh flow tests after org membership, team membership, or scope changes.
- M2M client organization grant tests.
- API smoke tests for generic scope/team contracts.

Contract tests should prove:

- Team IDs are stable and org-scoped.
- `team_ids` contains only teams for token `org_id`.
- User tokens include `sub`, `org_id`, `scope`, and `team_ids`.
- Token issuance fails when `team_ids` exceeds the configured claim limit.
- M2M tokens identify the client principal through `azp` or documented `client_id`.
- M2M org-scoped tokens include `org_id`.
- M2M tokens do not include `team_ids`.
- Unknown scopes are rejected before token issuance.
- Disabled scope rows are not accepted.
- Scopes bound to another resource server are rejected for the requested audience.
- Resource APIs still perform product IAM checks after token checks.

## 13. Definition Of Done

- Better Auth teams are enabled when team/group identity is needed.
- `team.id` is documented as the stable team principal ID.
- Team IDs are always scoped to exactly one organization.
- `idOAuthScopeCatalog` plugin exists under `workers/core/src/auth/plugins/oauth-scope-catalog/**`.
- Product/API OAuth scopes are DB-backed and preloaded for OAuth routes.
- Product/API OAuth scopes are bound to `resourceServerId`; scope validation is audience-aware.
- `oauthProvider({ scopes })` receives built-in protocol scopes plus DB-loaded product/API scopes.
- User access tokens include `sub`, `org_id`, `scope`, and `team_ids` for org-scoped resource access.
- Token issuance fails closed if `team_ids` exceeds the configured claim limit.
- M2M access tokens expose stable `azp` or documented `client_id`.
- Org-scoped M2M tokens include `org_id` and require explicit org/client eligibility if that flow is supported.
- Product roles, product permissions, role-permission mappings, concrete principal grants, resource hierarchy/inheritance, final `ContentPolicy.can(...)`, and content policy audit events are not modeled in `id`.
- Resource APIs can enforce authorization with JWT signature, issuer, audience, org, scope, and their own object-policy checks.
- No Better Auth internals are patched or monkey-patched.
- README is updated if public commands, setup, or topology change.
- Architecture scripts allow any new plugin-owned preload companion without weakening plugin CRUD boundaries.
- `pnpm check` passes after implementation.
- `pnpm advise` is clean or has justified suppressions according to `AGENTS.md`.

## 14. Final Model

The final model is not Content IAM inside `id`, and not an unsafe Better Auth fork.

It is:

```text
Better Auth
  owns identity, sessions, organizations, members, teams, OAuth, JWT, JWKS

idResourceServer plugin
  owns resource audiences and preloads validAudiences

idOAuthScopeCatalog plugin
  owns resource-server-bound OAuth scopes and optional M2M org grants
  preloads scopes like resource-server preloads audiences

id token issuance
  adds org_id, sub, team_ids for user tokens
  identifies M2M clients through azp/client_id
  enforces generic org membership, audience, scope, and client eligibility

Resource APIs
  verify JWTs and enforce aud + org_id + scope
  own product roles, permissions, grants, hierarchy/inheritance, final object policy, and product policy audit
```

This keeps `id` generic and Better Auth-aligned while still giving resource APIs a strong OAuth contract. `id` owns the resource-server scope catalog and token facts; `content-api` owns Content IAM.
