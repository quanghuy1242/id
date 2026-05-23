# Resource-Server Scopes, Teams, And Token Contract

> Status: P1-A through P1-G implemented in `id` on 2026-05-23
>
> Date: 2026-05-23
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
> - RFC 7662, OAuth 2.0 token introspection: <https://www.rfc-editor.org/rfc/rfc7662.html>
> - RFC 9068, JWT profile for OAuth 2.0 access tokens: <https://www.rfc-editor.org/rfc/rfc9068.html>
>
> Related docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/003_future-implementation.md`
> - `docs/005_oauth2-oidc-integration-guide.md`
> - `docs/006_resource-server-jwt-guide.md`
> - `docs/009_plugin_first_auth_architecture.md`
> - `id.md`, staged contract exchange with `content-api`
> - `/home/quanghuy1242/pjs/content-api/content-api.md`, staged contract confirmation
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
> - `id` owns authenticated write-time validation of identity principals referenced by downstream policy writes; it does not decide downstream product policy.
> - Resource APIs own product roles, product permissions, role-permission mappings, principal-role bindings, resource hierarchy/inheritance, final authorization decisions, and product policy audit events.
> - Better Auth remains the source of truth for identity, sessions, organizations, members, teams, OAuth clients, OAuth Provider, JWT signing, and JWKS.
> - "Custom" means two different things in this document: patching or bypassing Better Auth internals is forbidden; plugin-owned schema plus preload/glue through public Better Auth extension points is allowed and preferred.
> - The implemented user access-token lifetime is 15 minutes for every user token, regardless of team membership. M2M access tokens remain on the separate 3-hour service-account lifetime.

Implementation note, 2026-05-23:

- P1-A through P1-G have been implemented in `id`.
- Better Auth teams are enabled, `idOAuthScopeCatalog` owns `oauthResourceScope` and `oauthClientOrganizationGrant`, OAuth runtime preload loads audiences plus scopes, user access tokens use a uniform 900-second lifetime, direct-share uses the reserved internal reference marker, workspace tokens emit `org_id` and `team_ids`, M2M tokens expose `azp` and optionally `client_id`/`org_id`, and `idPrincipalValidation` exposes `/api/auth/principal-validation/**`.
- Org-scoped M2M grant validation uses OAuth client metadata fields `id_client_id` and `organization_id` because the installed OAuth Provider hook intentionally passes client metadata to `customAccessTokenClaims`. The provider still emits stable `azp`; the metadata fields are the configured integration data that lets `id` validate the org grant before signing and optionally emit custom `client_id`/`org_id` claims.
- Product IAM remains outside `id`; resource APIs still own roles, permissions, concrete grants, hierarchy, final policy decisions, and audit.

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
  - [4.4 OAuth Authorization Context And Token Issuance Gate](#44-oauth-authorization-context-and-token-issuance-gate)
  - [4.5 Downstream Token Contract](#45-downstream-token-contract)
  - [4.6 User Token Lifetime And Revocation SLA](#46-user-token-lifetime-and-revocation-sla)
  - [4.7 Resource API Verification Model](#47-resource-api-verification-model)
  - [4.8 Authenticated Principal Validation For Policy Writes](#48-authenticated-principal-validation-for-policy-writes)
- [5. Data Model](#5-data-model)
  - [5.1 `oauthResourceScope`](#51-oauthresourcescope)
  - [5.2 `oauthClientOrganizationGrant`](#52-oauthclientorganizationgrant)
  - [5.3 Resource-Owned Content IAM Tables](#53-resource-owned-content-iam-tables)
- [6. Runtime Examples](#6-runtime-examples)
  - [6.1 Workspace PKCE Example](#61-workspace-pkce-example)
  - [6.2 Direct-Share PKCE Example](#62-direct-share-pkce-example)
  - [6.3 Complex M2M Example](#63-complex-m2m-example)
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
  - [P1-G. Add Authenticated Principal Validation API](#p1-g-add-authenticated-principal-validation-api)
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
- explicit workspace and direct-share user authorization contexts;
- short-lived user access tokens with an explicit revocation SLA;
- authenticated identity-principal validation for downstream durable policy writes;
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
  who, selected org context or direct-share context, teams, client, audience, scopes

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
- authenticated exact-ID identity validation for durable resource-API policy references.

`id` does not own product role meaning. It may store a coarse scope string like `content:write`, but it does not define `book.update`, `chapter.publish`, `book.editor`, `writer`, `reviewer`, or what permissions those roles contain.

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
   scope=openid profile email content:read
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
   scope=content:write
   resource=https://content-api.example.com
2. id validates OAuth client, redirect URI, PKCE, resource audience, resource-server-bound scope, and client scope allowance.
3. User logs in and explicitly selects either a workspace organization context or direct-share context before consent.
4. Client exchanges code.
5. For workspace context, id issues an access token with:
   sub=user_alice
   org_id=org_1
   aud=https://content-api.example.com
   scope=content:write
   team_ids=[team_editorial]
6. content-api verifies the token and runs:
   ContentPolicy.can(actor, "book.update", book_100)
```

For direct-share context, `id` issues `sub`, `aud`, permitted coarse scope, and `team_ids=[]` with no `org_id`; `content-api` can then evaluate only existing direct ordinary user bindings on loaded resources. `id` still does not know whether the user was invited to a particular book.

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
- Current access-token claims assume the session's `activeOrganizationId`; there is no implemented explicit direct-share issuance context yet.
- `workers/core/src/auth/config.ts` previously set `accessTokenExpiresIn: 10_800`; P1 implementation changed user access tokens to `900` seconds while retaining `m2mAccessTokenExpiresIn: 10_800`.
- M2M tokens need a stable `azp` or `client_id` contract and org-scoped eligibility checks.

Decision precedence:

- The 15-minute user access-token implementation supersedes the older 3-hour user-token target recorded in `docs/002_1_first-batch-gaps.md`.
- `docs/005_oauth2-oidc-integration-guide.md` and OAuth tests were updated with the same implementation change as `workers/core/src/auth/config.ts`.

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
- The public `postLogin.shouldRedirect` and `postLogin.consentReferenceId` hooks support an additional account/organization choice before consent, and the resulting consent `referenceId` is available at token issuance.
- In the installed OAuth Provider implementation, an undefined/falsy consent `referenceId` is looked up without a `referenceId` filter. A selected product direct-share context must therefore use a reserved internal reference marker rather than sharing the unscoped-consent representation.
- The final JWT access token contains provider-controlled claims such as `scope`, `aud`, `azp`, `iss`, `iat`, and `exp`.

Implications:

- DB-backed OAuth scopes should be preloaded before constructing `oauthProvider`, just like resource audiences.
- Product/API scope validation must be audience-aware through `resourceServerId`.
- Workspace versus direct-share selection should use the public post-login/consent-reference extension point: a selected organization produces an organization `referenceId`, while direct-share produces a reserved internal context marker that is translated into no emitted `org_id`.
- Generic token issuance checks can run inside `customAccessTokenClaims`.
- `customAccessTokenClaims` should throw when requested scopes are disabled, unknown, not allowed for the client, not bound to the requested audience, or invalid for the selected workspace/direct-share context.
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
resource_server_id=rs_content, scope=content:read
resource_server_id=rs_content, scope=content:write
resource_server_id=rs_content, scope=content:share
```

A product scope row must reference the `resourceServer.id` for the API audience that owns that scope. This prevents generic-looking scope strings such as `api:read` from becoming global cross-resource collisions.

These scopes are API capability gates, not the content permission vocabulary. For example, a `content:write` token may attempt a book update route; `content-api` still decides whether the actor has its local `book.update` permission on that concrete book.

`resourceServer.organizationId` means administrative ownership of the OAuth audience and its scope catalog inside `id`. It does not mean every content resource reached through that audience belongs to that organization. In particular:

```text
token aud/resource:
  identifies Content API

token org_id when present:
  identifies selected workspace authority context

loaded content row org_id:
  identifies the content resource tenant boundary
```

An org-less direct-share user token can therefore operate on ordinary directly bound resources in different organizations, subject to each local content binding.

### 4.4 OAuth Authorization Context And Token Issuance Gate

User access-token issuance has two deliberate authorization contexts. A missing `org_id` is not an error fallback and must not result from a mismatched workspace.

```text
workspace context:
  selected organization = org_1
  user claims = sub, org_id=org_1, team_ids for org_1, scope

direct_share context:
  selected organization = none
  stored internal consent reference = urn:id:oauth-context:direct-share
  user claims = sub, no org_id, team_ids=[], scope
```

The intended Better Auth integration is the public OAuth Provider post-login flow:

```text
/oauth2/authorize
  -> postLogin.shouldRedirect prompts for workspace or direct-share context
  -> postLogin.consentReferenceId returns org_1 for workspace
     or urn:id:oauth-context:direct-share for direct_share
  -> consent/referenceId is propagated through token and refresh issuance
```

Token issuance gate:

```text
customAccessTokenClaims({ user, referenceId, scopes, resource, metadata })
  -> verify requested scopes exist, are enabled, and are bound to the requested resource audience
  -> verify OAuth client is allowed to request the scopes
  -> if user token and referenceId is the reserved direct-share marker:
       emit no org_id and emit team_ids=[]
       reject content:share and any scope configured as workspace-only
  -> if user token and referenceId is a verified organization ID:
       treat referenceId as selected workspace org_id
       verify user belongs to org_id
       load team_ids for the user inside org_id
       fail token issuance if team_ids would exceed the configured token claim limit
  -> if resource-scoped user token has neither recognized reference:
       reject issuance; context was not deliberately selected
  -> if M2M token:
       resolve stable client_id from azp/metadata
       if org-scoped, verify client eligibility for org_id, requested resource audience, and scopes
  -> return custom identity claims
```

`id` does not look up content bindings when it issues a direct-share token. A token only lets the actor attempt an API operation; `content-api` decides whether an existing direct ordinary user binding grants access to a loaded book or descendant.

### 4.5 Downstream Token Contract

Resource APIs need stable identity facts from `id`.

Team contract:

- Better Auth `team.id` is the stable team principal ID that downstream services may store.
- Better Auth `team.organizationId` is the organization boundary for a team.
- A team belongs to exactly one organization.
- Cross-organization team membership is not supported unless explicitly designed later.
- Better Auth `teamMember` links `teamId` to `userId`; it does not use `memberId` in the installed schema.
- `id` uses the word `team`. Resource APIs should map Better Auth teams to `principal_type = "team"` instead of inventing mixed `group`/`team` naming.

Workspace user token claim contract:

```text
sub
org_id
scope
team_ids
```

Direct-share user token claim contract:

```text
sub
scope
team_ids = []
no org_id
```

Rules:

- `team_ids` in a workspace token contains only Better Auth team IDs for `sub` inside `org_id`.
- If the workspace user has no teams in the selected organization, `team_ids` is `[]`.
- `team_ids=[]` does not by itself identify direct-share context; a workspace token can also have no teams. The absence of `org_id` identifies direct-share context.
- Teams from other organizations must not appear in any workspace token.
- If `team_ids` would exceed the configured token claim size/count limit, token issuance must fail closed. Do not silently truncate team IDs and do not silently fall back to partial authorization.
- Direct-share tokens may carry resource-server-bound `content:read` and `content:write`; they must not carry `content:share`.
- A direct-share token can support ordinary read/write operations, including descendant creation inside an already directly shared content subtree, when `content-api` permits it through a direct `user:sub` binding.
- A direct-share token cannot establish a new organization-root book, use organization/team authority, or call Content IAM mutation routes.
- The reserved direct-share consent/reference marker is internal to `id` and is never emitted as `org_id`.
- A token carrying a non-empty `org_id` that does not match the loaded resource is rejected by the resource API; it is never downgraded to direct-share access.
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

- A self-contained workspace user access token may continue to assert its issued `org_id`, `scope`, and `team_ids` until that token expires.
- When a user is removed from a team, already-issued workspace tokens may still contain the old team ID until expiration.
- Refresh and new workspace token issuance must reload organization membership, team membership, and applicable scope eligibility, then omit removed teams or reject invalid organization/scope issuance.
- Refresh and new direct-share token issuance must preserve the reserved internal direct-share marker, continue to omit `org_id`, and reject workspace-only scopes.
- Refresh-token expiry does not determine the stale-claim window: a refreshed token has current claims, while an older user access token remains usable only until its own expiry.

### 4.6 User Token Lifetime And Revocation SLA

Current implementation state:

```ts
export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: 10_800,
  m2mAccessTokenExpiresIn: 10_800,
  refreshTokenExpiresIn: 604_800,
} as const;
```

Target first-release user-token decision:

```ts
export const oauthTokenLifetimeConfig = {
  accessTokenExpiresIn: 900,       // every user access token: 15 minutes
  m2mAccessTokenExpiresIn: 10_800, // separate service-account SLA decision
  refreshTokenExpiresIn: 604_800,
} as const;
```

Rules:

- `accessTokenExpiresIn: 900` applies to every user access token, whether workspace or direct-share and whether `team_ids` is empty or non-empty.
- The accepted first-release stale-identity window for JWT-only user access is at most 15 minutes. Organization removal, team removal, or removal of an issued user scope is reflected on refresh/new issuance, but may not affect an already-issued user access token before its expiry.
- A 7-day refresh token does not extend stale `team_ids`. Every refresh must rerun applicable issuance checks and emit current context claims.
- M2M tokens do not carry `team_ids`. Their currently configured 3-hour lifetime is not changed by the user-team revocation decision; revocation of client/org eligibility needs a separate SLA decision before sensitive M2M operations are exposed.
- Removal of a resource-owned concrete binding is not delayed by token expiry when the resource API evaluates its local binding state per request.

High-risk routes:

- `id` provides the 15-minute JWT-only user revocation SLA; it does not decide product authorization.
- `content-api` v1 prohibits team-derived and service-account-derived security-state mutation authority, so stale `team_ids` cannot be used to create bindings, transfer ownership, or administer Content IAM in that model.
- If a future resource API permits team-derived security-state mutation, it must accept the stale-team window or require an explicitly designed current identity-status/membership check for that operation.
- Do not assume that calling an OAuth introspection endpoint automatically reloads current `team_ids`. If immediate revocation is required, the resource API and `id` must first define the authoritative live-check or token-inactivation contract.
- Normal resource requests continue to use local JWT verification plus resource-owned policy state.

### 4.7 Resource API Verification Model

Resource APIs should perform local OAuth resource-server checks:

```text
1. Verify signature via JWKS.
2. Verify issuer.
3. Verify audience.
4. Verify expiration.
5. Classify user context:
     org_id present -> workspace token; require it to match org-scoped loaded resources
     org_id absent -> direct-share token; accept only direct ordinary user evaluation
6. Verify required OAuth scope.
7. Build actor from sub/client_id plus team_ids where permitted.
8. Run the resource API policy check for the concrete object.
```

Resource APIs define and enforce their own product roles. OAuth scopes only gate whether the token may attempt that API operation.

### 4.8 Authenticated Principal Validation For Policy Writes

Content IAM policy writes create durable references to `id` principals. `id` must therefore offer authenticated exact-ID validation for these low-volume writes, without becoming a policy-decision service.

Semantic contract:

```ts
validateUser(userId)
validateUserInOrganization(userId, orgId)
validateTeamInOrganization(teamId, orgId)
validateServiceAccountForOrganization(clientId, orgId, resource)
validateOrganizationAdministrator(userId, orgId)
```

Validation matrix:

| Content IAM write | `id` fact required |
|---|---|
| Ordinary external direct-user binding | User exists; organization membership is not required |
| `book.owner`, `book.sharing_manager`, or local `org.content_admin` user target | User exists and is a current member of the resource organization |
| Ordinary team binding | Team exists and `team.organizationId` equals the resource organization |
| Ordinary service-account binding | Client is enabled and eligible for the organization and public OAuth content `resource` audience |
| Bootstrap/recovery request for first local `org.content_admin` | Requester is a current Better Auth organization owner/admin |

API authentication contract:

```text
caller authorization:
  content-api uses a dedicated M2M integration token
  aud/resource = id principal-validation API
  scope = identity:principals:validate

target service-account validation payload:
  resource = public OAuth content API audience
  id resolves that audience to internal resourceServer.id
  id checks oauthClientOrganizationGrant for the resolved internal row
```

Rules:

- Exact-ID validation is sufficient in v1; this API must not accidentally become an end-user directory/search API.
- The principal-validation API is used only during durable policy writes, not during ordinary `ContentPolicy.can(...)` checks.
- `validateOrganizationAdministrator` returns a generic Better Auth organization fact. `content-api` owns whether its workflow may bootstrap or recover `org.content_admin`.
- An external ordinary binding may store `principal_id = id.sub` before the user has a local `content-api` user/profile row.

## 5. Data Model

Custom auth tables must be Better Auth plugin schemas, not standalone Drizzle tables.

### 5.1 `oauthResourceScope`

Defines an API-managed OAuth scope for one resource server.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `resourceServerId` | string | Required reference to `resourceServer.id` for the API audience that owns this scope |
| `scope` | string | Coarse OAuth scope string, for example `content:read`, `content:write`, or `content:share` |
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
- `resourceServerId` remains an internal persistence reference. Downstream principal-validation calls identify the target API using its public OAuth `resource`/audience; `id` resolves that audience to this internal row.

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

### 6.1 Workspace PKCE Example

`id` data:

```text
resourceServer
  id = rs_content
  audience = https://content-api.example.com
  name = Content API
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = content:read
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = content:write
  enabled = true

oauthResourceScope
  resourceServerId = rs_content
  scope = content:share
  enabled = true
```

OAuth client in `id`:

```text
client = web_editor_app
allowed resource = rs_content
allowed scopes =
  content:read
  content:write
  content:share
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
scope=content:read content:write content:share
```

`id` checks:

```text
resource exists
all requested scopes exist for rs_content
web_editor_app may request those scopes
user explicitly selects workspace context org_1 before consent
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
  "scope": "content:read content:write content:share",
  "team_ids": ["team_editorial"]
}
```

This user access token expires after 900 seconds. The 15-minute lifetime applies whether `team_ids` is empty or contains teams.

`content-api` owns route scope requirements:

```text
GET    /books/:bookId                       requires content:read
POST   /books                               requires content:write
PATCH  /books/:bookId                       requires content:write
PATCH  /chapters/:chapterId                 requires content:write
POST   /chapters/:chapterId/publish         requires content:write
POST   /media                               requires content:write
POST   /books/:bookId/policy-bindings       requires content:share
DELETE /books/:bookId/policy-bindings/:id   requires content:share
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
4. Verify scope includes content:write.
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
scope includes content:write
actor has no grant on book_999
deny
```

The token scope means the actor may attempt content write routes. It does not mean the actor has `book.update`, `chapter.update`, or any other product permission on a concrete object.

Security-state mutation implication:

```text
POST /books/book_100/policy-bindings
scope requirement: content:share
requested mutation: grant book.editor to team_reviewers on book_100
```

`id` only issues and validates the coarse `content:share` capability. `content-api` must authorize the binding mutation from policy state that already exists before the request; the proposed new binding cannot supply the permission used to create itself.

In the settled `content-api` v1 model, team and service-account roles are ordinary-only: a removed team member holding an older token may continue ordinary team-derived content work for up to the 15-minute user-token lifetime, but cannot use that stale team assertion to mutate Content IAM security state.

### 6.2 Direct-Share PKCE Example

Scenario:

```text
book_500 belongs to org_publisher
user_external belongs to a separate workspace, org_external
content-api has an ordinary direct binding:
  principal_type = user
  principal_id = user_external
  role = book.author
  resource_type = book
  resource_id = book_500
```

The external writer intentionally requests direct-share context:

```text
client_id=web_editor_app
resource=https://content-api.example.com
scope=content:read content:write
authorization context=direct_share
```

`id` checks and issues:

```text
resource and requested scopes are enabled for rs_content
web_editor_app may request content:read content:write
the selected context is explicitly direct_share
consent reference is stored internally as urn:id:oauth-context:direct-share
content:share is not requested
id does not query content-api for book_500 or its binding
```

```json
{
  "iss": "https://id.example.com/api/auth",
  "aud": "https://content-api.example.com",
  "azp": "web_editor_app",
  "sub": "user_external",
  "scope": "content:read content:write",
  "team_ids": []
}
```

The direct-share user token has no `org_id` and expires after 900 seconds. `content-api` can allow ordinary operations according to the direct binding:

```text
GET   /books/book_500                         allow if book.author includes book.read
POST  /books/book_500/chapters                allow if book.author includes chapter.create
PATCH /chapters/chapter_in_book_500           allow if book.author includes chapter.update
POST  /books/book_500/policy-bindings         deny: no org_id and no content:share
POST  /organizations/org_publisher/books      deny: no workspace context / org.create_book
```

Wrong-context example:

```text
token carries org_id=org_external
requested resource is book_500 with org_id=org_publisher
result: reject; do not retry as direct-share access
```

### 6.3 Complex M2M Example

`id` data:

```text
client = import_bot_client
allowed resource = rs_content
allowed scopes =
  content:write

oauthClientOrganizationGrant
  clientId = import_bot_client
  organizationId = org_1
  resourceServerId = rs_content
  allowedScopes = content:write
  enabled = true
```

M2M request:

```text
grant_type=client_credentials
resource=https://content-api.example.com
scope=content:write
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
  "scope": "content:write"
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
scope includes content:write
service_account import_bot_client has media.manager on org_1
media.manager includes media.upload
allow
```

When a user authorized by `content-api` creates that ordinary service-account binding, `content-api` uses its dedicated validation integration token to ask `id`:

```ts
validateServiceAccountForOrganization(
  "import_bot_client",
  "org_1",
  "https://content-api.example.com",
)
```

`id` resolves the public Content API audience to internal `rs_content` and verifies the enabled `oauthClientOrganizationGrant`. The M2M principal itself cannot create this binding or receive owner/policy-administration authority in v1.

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

Add an authenticated principal-validation endpoint family inside the `workers/core/src/auth/**` boundary. It may be a small endpoint-only Better Auth plugin or be composed beside the scope-catalog plugin, but it must reuse Better Auth identity/member/team facts and the M2M grant loader rather than creating policy tables. Its externally visible service-account input is the public OAuth `resource` audience, not internal `resourceServerId`.

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
const DIRECT_SHARE_REFERENCE_ID = "urn:id:oauth-context:direct-share";

oauthProvider({
  accessTokenExpiresIn: 900,
  m2mAccessTokenExpiresIn: 10_800,
  refreshTokenExpiresIn: 604_800,
  scopes: [...builtInProtocolScopes, ...catalog.scopes],
  validAudiences: [...catalog.validAudiences],
  postLogin: {
    page: "/select-authorization-context",
    shouldRedirect: async (context) => authorizationContextIsNotSelected(context),
    consentReferenceId: async (context) => {
      const selection = await requireAuthorizationContextSelection(context);
      return selection.kind === "workspace" ? selection.organizationId : DIRECT_SHARE_REFERENCE_ID;
    },
  },
  customAccessTokenClaims: async ({ resource, referenceId, scopes, user, metadata }) => {
    if (user) {
      await assertRequestedResourceScopesAllowed({
        env,
        scopes,
        resource,
      });

      if (referenceId === DIRECT_SHARE_REFERENCE_ID) {
        assertDirectShareScopes(scopes); // Reject content:share and workspace-only scopes.
        return { aud: resource, sub: user.id, team_ids: [] };
      }

      if (!referenceId) {
        assertNoResourceApiScopes(scopes);
        return { aud: resource, sub: user.id };
      }

      assertOrganizationReferenceId(referenceId);
      await assertUserBelongsToOrganization(env, user.id, referenceId);
      await assertRequestedWorkspaceScopesAllowed({
        env,
        userId: user.id,
        organizationId: referenceId,
        scopes,
        resource,
      });
      const teamIds = await loadUserTeamIdsForOrganization(env, user.id, referenceId);
      assertTeamIdsWithinTokenLimit(teamIds);
      return { aud: resource, org_id: referenceId, sub: user.id, team_ids: teamIds };
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

`accessTokenExpiresIn: 900` applies uniformly to OAuth user access tokens; it is not conditional on `team_ids`. `m2mAccessTokenExpiresIn` remains an explicit, separate service-account policy decision.

Do not return `scope` from `customAccessTokenClaims`; OAuth Provider owns the final `scope` claim.

Do not use the current `clientReference: ({ session }) => session?.activeOrganizationId` behavior as the direct-share/workspace selector. Direct sharing needs an explicit authorization-context choice even when the logged-in user already has an active organization in another workspace.

Do not model product direct-share selection as `referenceId = undefined`. In the installed provider, falsy consent references are matched without a reference predicate, so a reserved marker is required to keep direct-share and workspace consents distinct while still omitting `org_id` from the resulting direct-share token.

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
- Seed coarse resource-server-bound Content API scopes: `content:read`, `content:write`, and `content:share`.
- Change OAuth Provider to use built-in protocol scopes plus loaded DB scopes.
- Keep a temporary fallback to static scopes for local bootstrap only if tests require it.

Phase 4:

- Add generic token issuance checks.
- Add explicit workspace versus direct-share selection through OAuth Provider public post-login/consent-reference hooks.
- Add `team_ids` token claim resolution and overflow checks.
- Restrict direct-share issuance to ordinary coarse scopes such as `content:read` and `content:write`; reject `content:share`.
- Change `accessTokenExpiresIn` from `10_800` to `900` for every user access token and update expiry assertions.
- Add M2M org-scoped eligibility checks if org-scoped M2M tokens are supported.
- Switch to hard deny once scope and generic token eligibility seed data exists.

Phase 5:

- Add authenticated exact-ID principal-validation API for durable downstream policy writes, protected by a dedicated M2M audience and scope.
- Remove static product/API scopes from `authPluginConfig`.
- Synchronize OAuth/token documentation that still describes the pre-change 3-hour user-token policy.
- Update docs and README if public commands or setup changed.
- Build admin UI pages after the API has stabilized.

Rollback:

- Keep migrations additive until rollout is complete.
- If scope preload fails in production, fail closed for token issuance rather than accepting unknown scopes.
- Revert OAuth Provider to static product scopes only as an emergency rollback and document any issued-token policy gap.

## 9. Edge Cases And Failure Modes

| Scenario | Expected behavior |
|---|---|
| Scope row disabled after a user access token is issued | Existing user token can carry the scope for at most its 15-minute lifetime; next refresh/new issuance re-runs scope checks and fails if scope is no longer enabled or allowed |
| Same scope string on different resource servers | Allowed only when each row has a different `resourceServerId`; token checks bind scope evaluation to `aud` |
| Client requests scope for wrong resource audience | Deny token issuance |
| User removed from organization | Existing user token can remain usable for at most its 15-minute lifetime under JWT-only enforcement; refresh/new issuance must fail for that org |
| Team membership removed | Existing user token may contain the old `team_ids` for at most its 15-minute lifetime; refresh/new token omits the team |
| `team_ids` exceeds configured token claim limit | Deny token issuance; do not truncate |
| User deliberately selects direct-share context | Issue no `org_id`, emit `team_ids=[]`, and allow only scopes configured for direct-share context |
| Direct-share authorization requests `content:share` | Deny issuance; policy mutation requires workspace context |
| Direct-share actor has direct ordinary permission to add a chapter inside a shared book | Resource API may allow with `content:write`; `id` does not determine that permission |
| Direct-share actor attempts new top-level book creation or policy mutation | Resource API rejects; workspace organization context is required |
| Workspace token carries the wrong `org_id` for loaded content | Reject; do not downgrade to direct-share mode |
| M2M client requests org-scoped token without org eligibility | Deny token issuance |
| Resource API receives token without `org_id` for an organization-authority route | Return `403`; ordinary direct-share object operations are a separate allowed mode |
| Resource API receives valid token missing route scope | Return `403` |
| Resource API receives valid token and scope but no object grant | Return `403` from the resource API policy layer |
| Content role changed in content-api | Content-api owns invalidation/audit; `id` token contract is unchanged |
| `content-api` v1 binding write targets an external user/team/service account | Content-api calls authenticated exact-ID principal validation before persisting the durable reference |
| Future resource API allows team-derived security-state mutation | Resource API must accept the 15-minute stale-team SLA or invoke an explicitly designed current identity-status/membership contract with `id` |
| Resource API calls introspection expecting fresh `team_ids` without a defined contract | Unsupported assumption; do not treat token introspection alone as current membership validation |

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
- `workers/core/src/auth/config.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/oauth-auth-code.test.ts`
- `workers/core/tests/auth/oauth-flows.test.ts`

Tasks:

- [ ] Implement generic user-token scope checks.
- [ ] Add explicit authorization-context selection through OAuth Provider `postLogin.shouldRedirect` and `postLogin.consentReferenceId`.
- [ ] Store direct-share product consent under a reserved internal reference marker; do not use an undefined consent reference for a context that must remain distinct from workspace consent.
- [ ] Implement organization membership checks for organization-scoped user tokens.
- [ ] Implement `team_ids` lookup using BA `teamMember.userId`.
- [ ] Fail closed when `team_ids` exceeds the configured token claim limit.
- [ ] Issue direct-share user tokens with no `org_id` and `team_ids=[]`; reject `content:share` or any configured workspace-only scope in that context.
- [ ] Set `accessTokenExpiresIn: 900` for every user access token; do not apply different user TTLs based on team membership.
- [ ] Retain or change `m2mAccessTokenExpiresIn` only through a separately documented M2M revocation-SLA decision.
- [ ] Implement generic resource-audience scope validation plus context-specific direct-share/workspace scope checks.
- [ ] Call assertion from `customAccessTokenClaims`.

Acceptance criteria:

- User tokens only include scopes that exist, are enabled, are resource-audience-valid, and are allowed for the OAuth client and organization context.
- Workspace and direct-share user contexts are explicitly selected; a missing or mismatched organization is never silently reclassified.
- Direct-share and workspace consent/refresh contexts remain distinct internally even though direct-share tokens emit no `org_id`.
- Direct-share user tokens carry no organization/team authority and cannot be issued `content:share`.
- Every user access token expires after 900 seconds, regardless of whether its `team_ids` claim is empty.
- Refresh token flow rechecks current scope catalog, organization membership, and team membership.
- JWT-only resource APIs have a documented maximum 15-minute stale-identity window for already-issued user access tokens.
- Resource APIs can build user/team principals from token claims.

Tests:

- Token issuance allowed for valid organization member and enabled scope.
- Direct-share token issuance includes `team_ids=[]`, omits `org_id`, and permits `content:read`/`content:write`.
- Direct-share token issuance rejects `content:share`.
- Direct-share and workspace consents for the same user/client do not overwrite or reuse the wrong authorization context.
- Refresh from a direct-share token retains direct-share claims and does not become a workspace token.
- Workspace token with wrong organization is rejected rather than treated as direct-share.
- User authorization-code token `expires_in` is `900` for a user with no teams.
- User authorization-code token `expires_in` is `900` for a user with one or more `team_ids`.
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
- [ ] Document that downstream validation refers to the target API by public OAuth `resource`/audience and `id` resolves that to internal `resourceServerId`.

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
- [ ] Add examples for coarse resource-server-bound scopes such as `content:read`, `content:write`, and `content:share`.
- [ ] Add examples for building an actor from `sub`, `client_id`/`azp`, and `team_ids`.
- [ ] Explain that product roles, permissions, grants, inheritance, and `ContentPolicy.can(...)` live in the resource API.
- [ ] Explain the 15-minute user-token revocation SLA and that immediate high-risk revocation needs an explicitly designed live identity-status/membership contract.
- [ ] Explain workspace versus direct-share actor evaluation, including ordinary descendant creation within an existing direct share and rejection of policy mutation/top-level organization creation without workspace context.
- [ ] Explain that durable principal targets are validated against `id` only during policy writes through an authenticated M2M integration.

Acceptance criteria:

- A resource API implementer can verify tokens without learning `id` internals.
- Guide clearly says `id` owns OAuth scope and token contracts, while concrete IAM decisions happen in the resource API.
- Guide does not imply that standard token introspection automatically provides current `team_ids`.

Tests:

- Documentation review.

### P1-G. Add Authenticated Principal Validation API

Scope:

- new authenticated endpoint surface under `workers/core/src/auth/**`
- `workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts`
- principal-validation endpoint tests and OAuth integration tests

Tasks:

- [ ] Add exact-ID validation operations for users, organization members, teams, eligible service accounts, and generic organization administrators.
- [ ] Protect the API with a dedicated M2M OAuth audience/resource and `identity:principals:validate` scope for approved integrations such as `content-api`.
- [ ] Accept public OAuth `resource` audience when validating a service-account target; resolve it internally to `resourceServer.id` before checking `oauthClientOrganizationGrant`.
- [ ] Do not add product-role, content-binding, inheritance, or policy-decision behavior.
- [ ] Do not expose list/search enumeration unless a later separately authorized administration use case requires it.

Acceptance criteria:

- `content-api` can validate durable user/team/service-account binding targets without depending on `id` during ordinary authorization evaluation.
- A user token or unauthenticated service-binding request cannot call principal validation.
- Organization-administrator validation proves only current Better Auth owner/admin status, leaving local `org.content_admin` workflow decisions to `content-api`.

Tests:

- Authorized integration M2M token validates known target identities.
- Missing/wrong audience or `identity:principals:validate` scope is rejected.
- External ordinary user existence validation does not require organization membership.
- Sensitive direct-user target validation fails without membership in the resource organization.
- Team validation rejects a team from another organization.
- Service-account validation resolves public audience and rejects missing/disabled client organization grant.

## 11. Future Backlog

- Build generic `id` admin UI for audiences, resource-server-bound scopes, teams, and M2M org grants after the API-first implementation stabilizes.
- Add a current identity-status/membership endpoint, event projection, or token-inactivation/introspection contract only if a future resource API permits team-derived security-state mutation or otherwise requires revocation faster than the accepted 15-minute user-token SLA. The write-time principal-validation API is not that hot-path/live-revocation contract.
- Decide the M2M client/org eligibility revocation SLA separately before exposing high-risk M2M operations.
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
- OAuth post-login context selection tests for workspace and direct-share paths.
- OAuth consent/refresh context isolation tests for the reserved direct-share reference marker.
- User access-token lifetime tests proving `expires_in = 900` with and without team membership.
- Refresh flow tests after org membership, team membership, or scope changes.
- M2M client organization grant tests.
- Authenticated principal-validation integration tests.
- API smoke tests for generic scope/team contracts.

Contract tests should prove:

- Team IDs are stable and org-scoped.
- Workspace `team_ids` contains only teams for token `org_id`; direct-share `team_ids` is empty.
- Workspace user tokens include `sub`, `org_id`, `scope`, and active-org `team_ids`.
- Direct-share user tokens include `sub`, permitted coarse scope, and `team_ids=[]`, omit `org_id`, and reject `content:share`.
- Direct-share consent is persisted with an internal reserved marker so it remains distinct from workspace consent while never exposing that marker as `org_id`.
- A user with an unrelated active organization can explicitly receive direct-share context; wrong `org_id` is not downgraded by resource APIs.
- Every user access token expires after 900 seconds regardless of team membership.
- Refresh after team removal omits the removed team; expiration of the refresh token is not the stale-membership boundary.
- Token issuance fails when `team_ids` exceeds the configured claim limit.
- M2M tokens identify the client principal through `azp` or documented `client_id`.
- M2M org-scoped tokens include `org_id`.
- M2M tokens do not include `team_ids`.
- Principal-validation calls require dedicated integration M2M audience/scope and use public target `resource` audience for service-account eligibility.
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
- User access tokens have a uniform `900`-second lifetime, creating an explicit maximum 15-minute JWT-only stale-identity window.
- Workspace user access tokens include `sub`, `org_id`, `scope`, and `team_ids` for org-scoped resource access.
- Direct-share user access tokens are explicitly issued with `sub`, permitted coarse scope, `team_ids=[]`, and no `org_id`; they cannot receive `content:share`.
- Direct-share consent/refresh state uses a reserved internal marker rather than an undefined reference that could collide with unscoped consent matching.
- Token issuance fails closed if `team_ids` exceeds the configured claim limit.
- M2M access tokens expose stable `azp` or documented `client_id`.
- Org-scoped M2M tokens include `org_id` and require explicit org/client eligibility if that flow is supported.
- An authenticated principal-validation API exists for durable downstream policy writes, accepts public OAuth target resource audiences, and is not called for ordinary content authorization.
- Product roles, product permissions, role-permission mappings, concrete principal grants, resource hierarchy/inheritance, final `ContentPolicy.can(...)`, and content policy audit events are not modeled in `id`.
- Resource APIs can enforce authorization with JWT signature, issuer, audience, selected workspace/direct-share context rules, scope, and their own object-policy checks.
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
  explicitly selects workspace or direct_share user context through public OAuth extension hooks
  persists direct_share selection using a reserved internal reference marker
  adds org_id + sub + team_ids for workspace user tokens
  adds sub + empty team_ids with no org_id for direct-share user tokens
  rejects content:share for direct-share context
  uses a uniform 15-minute lifetime for all user access tokens
  identifies M2M clients through azp/client_id
  enforces generic org membership, audience, scope, and client eligibility

id principal validation
  exposes authenticated exact-ID validation for durable downstream policy writes
  accepts public resource audience when checking service-account target eligibility
  does not evaluate content policy

Resource APIs
  verify JWTs and enforce aud + selected-context rules + scope
  own product roles, permissions, grants, hierarchy/inheritance, final object policy, and product policy audit
  may permit ordinary descendant work through direct user bindings
  keep team/service-account security-state mutation authority out of v1
```

This keeps `id` generic and Better Auth-aligned while still giving resource APIs a strong OAuth contract. `id` owns the resource-server scope catalog and token facts; `content-api` owns Content IAM.
