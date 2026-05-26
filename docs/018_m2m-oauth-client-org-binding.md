# M2M Identity Correction: Adopt Better Auth's First-Class OAuth Client Model

> Status: canonical decision record and implementation plan
>
> Date: 2026-05-26
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` - `id` identity provider, OAuth authorization server, Better Auth plugins
> - `/home/quanghuy1242/pjs/content-api` - first consumer of service-account principal references
>
> Source docs:
>
> - [000_repo-architecture.md](000_repo-architecture.md)
> - [005_oauth2-oidc-integration-guide.md](005_oauth2-oidc-integration-guide.md)
> - [006_resource-server-jwt-guide.md](006_resource-server-jwt-guide.md)
> - [010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md)
> - [013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md)
> - [017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md)
>
> Standards and library references:
>
> - RFC 6749 - OAuth 2.0 Authorization Framework, <https://www.rfc-editor.org/rfc/rfc6749.html>
> - RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol, <https://www.rfc-editor.org/rfc/rfc7591.html>
> - RFC 7592 - OAuth 2.0 Dynamic Client Registration Management Protocol, <https://www.rfc-editor.org/rfc/rfc7592.html>
> - RFC 8707 - OAuth 2.0 Resource Indicators, <https://www.rfc-editor.org/rfc/rfc8707.html>
> - RFC 7662 - OAuth 2.0 Token Introspection, <https://www.rfc-editor.org/rfc/rfc7662.html>
> - `@better-auth/oauth-provider` 1.6.11 - OAuth provider plugin, including `clientReference`, `clientPrivileges`, RFC 7591/7592-shaped endpoints, and native `client_credentials` grant handling
> - `better-auth/plugins/organization` 1.6.11 - organization plugin (users-only membership)
>
> Related docs:
>
> - [017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md) - SCIM directory replacement for user/team/admin lookup. Doc 017 defers all service-account binding semantics to this document.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Better Auth Capability Inventory](#31-better-auth-capability-inventory)
  - [3.2 Better Auth Organization Plugin Gap](#32-better-auth-organization-plugin-gap)
  - [3.3 Current Repo Wire-Up](#33-current-repo-wire-up)
  - [3.4 Current Repo Custom Surface](#34-current-repo-custom-surface)
  - [3.5 Concrete Misalignment](#35-concrete-misalignment)
- [4. Target Model](#4-target-model)
  - [4.1 BA-Aligned OAuth Client Ownership](#41-ba-aligned-oauth-client-ownership)
  - [4.2 The Single Irreducible Repo Extension](#42-the-single-irreducible-repo-extension)
  - [4.3 Resource Server Identity Of A Service Account](#43-resource-server-identity-of-a-service-account)
  - [4.4 End-To-End M2M Flows](#44-end-to-end-m2m-flows)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 D1 - Adopt BA `referenceId` For Client-To-Org Ownership](#51-d1---adopt-ba-referenceid-for-client-to-org-ownership)
  - [5.2 D2 - Replace Many-To-Many Grant Table With Per-(Client, Resource) Scope Subsets](#52-d2---replace-many-to-many-grant-table-with-per-client-resource-scope-subsets)
  - [5.3 D3 - Reuse BA `/oauth2/get-client` As The Picker Endpoint](#53-d3---reuse-ba-oauth2get-client-as-the-picker-endpoint)
  - [5.4 D4 - Resource API Owns The Binding/Attach Authority](#54-d4---resource-api-owns-the-bindingattach-authority)
  - [5.5 D5 - Stop Storing `metadata.id_client_id` / `metadata.organization_id`](#55-d5---stop-storing-metadataid_client_id--metadataorganization_id)
  - [5.6 D6 - No SCIM Service-Account Resource Type](#56-d6---no-scim-service-account-resource-type)
  - [5.7 Rejected Or Deferred Options](#57-rejected-or-deferred-options)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
  - [7.1 Wire Up `clientReference` In `oauth-provider.ts`](#71-wire-up-clientreference-in-oauth-providerts)
  - [7.2 Replace The Grant Table With `oauthClientResourceScope`](#72-replace-the-grant-table-with-oauthclientresourcescope)
  - [7.3 Migrate Token-Issuance Enforcement](#73-migrate-token-issuance-enforcement)
  - [7.4 Expose BA Client Read For Picker UX](#74-expose-ba-client-read-for-picker-ux)
  - [7.5 Apply `clientPrivileges` And RBAC](#75-apply-clientprivileges-and-rbac)
  - [7.6 `content-api` Binding Side](#76-content-api-binding-side)
  - [7.7 Cross-Doc Updates](#77-cross-doc-updates)
- [8. Migration And Rollout](#8-migration-and-rollout)
- [9. Edge Cases And Failure Modes](#9-edge-cases-and-failure-modes)
- [10. Implementation Backlog](#10-implementation-backlog)
- [11. Future Backlog](#11-future-backlog)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 1. Goal

Settle the M2M / service-account contract for this repository by adopting the first-class OAuth client primitives that `@better-auth/oauth-provider` 1.6.11 already provides, and reducing the repo's custom identity surface to the precise extension that BA does not cover.

This document is **canonical**. It is the source of truth for:

- how an OAuth client is owned by an organization in `id`;
- how `client_credentials` tokens are issued and constrained;
- how `content-api` (and any future resource API) binds, displays, and validates service-account principals;
- which OAuth client management endpoints exist, which are standards-shaped, and which are repository-specific.

Doc [017](017_scim-directory-and-m2m-principal-contract.md) handles synchronous directory lookup for users, organization users, teams, and organization administrators. It defers every service-account decision to this document.

Non-goals:

- Cross-organization OAuth clients. The current product requirement is one client owned by one organization. A future cross-org requirement is recorded in §11.
- Mirroring service accounts into SCIM core resources. SCIM models users and groups; OAuth clients are governed by RFC 7591/7592.
- Replacing OAuth client-credentials with any non-OAuth mechanism for runtime access.
- Changing the M2M token lifetime decided in [013 D1](013_identity-event-standards-and-decisions.md#51-d1--m2m-token-lifetime-stays-10800s).

## 2. System Summary

```text
id (this repo)
  Better Auth OAuth provider:
    - oauthClient table, RFC 7591 register, RFC 7592 get/update/delete
    - client_credentials grant handler
    - clientReference option binds an OAuth client to an organization 1:1
    - clientPrivileges hook authorizes admin actions on client rows

  id-specific extension:
    - per-(client, resource) scope subset table
    - that table is the only durable identity object id owns beyond BA

content-api (resource API)
  OAuth resource server:
    - JWKS verify, optional RFC 7662 introspection on high-risk routes
    - projects azp/client_id and org_id into Actor

  Content IAM:
    - bindings stored with principal = { type: "service_account", id: <client_id> }
    - local attach authority (no synchronous call to id at bind time)
    - picker UX calls id /api/auth/oauth2/get-client through a scoped M2M caller token

Runtime:
  service account -> id /api/auth/oauth2/token (client_credentials, resource)
  service account -> content-api (Bearer JWT)
```

## 3. Current-State Findings

### 3.1 Better Auth Capability Inventory

Inspected against `@better-auth/oauth-provider@1.6.11` source in `node_modules/.pnpm/@better-auth+oauth-provider@1.6.11_*`.

OAuth-client management endpoints already mounted by virtue of including the plugin:

| Path | Method | Purpose |
|---|---|---|
| `/api/auth/oauth2/register` | POST | RFC 7591 dynamic registration |
| `/api/auth/oauth2/create-client` | POST | Authenticated client creation |
| `/api/auth/admin/oauth2/create-client` | POST | Admin client creation |
| `/api/auth/oauth2/get-client?client_id=...` | GET | RFC 7592-shaped read |
| `/api/auth/oauth2/get-clients` | GET | List clients scoped by `referenceId` or by `userId` |
| `/api/auth/oauth2/update-client` | PATCH | Authenticated client update |
| `/api/auth/admin/oauth2/update-client` | PATCH | Admin client update |
| `/api/auth/oauth2/delete-client` | DELETE | Authenticated client delete |
| `/api/auth/oauth2/public-client` | GET | Public-field client read for login UX |
| `/api/auth/oauth2/token` (with `grant_type=client_credentials`) | POST | M2M token issuance |

OAuth-client scoping primitives:

- `oauthClient.referenceId` column already exists in `workers/core/src/db/auth-schema.ts:199`.
- BA exposes a `clientReference` option in `oauthProvider({...})`. Its docstring (`node_modules/.pnpm/@better-auth+oauth-provider@1.6.11_*/oauth-BqWgUea8.d.mts` around line 475) reads:

  ```ts
  clientReference?: (context: {
    user?: User & Record<string, unknown>;
    session?: Session & Record<string, unknown>;
  }) => Awaitable<string | undefined>;
  // "When provided, user_id of the client will be undefined and the owner
  //  is defined under the field `reference_id`.
  //  With the organization plugin: ({ session }) => session?.activeOrganizationId"
  ```

  BA's own example for this option is the organization-plugin integration.
- BA enforces `referenceId` ownership inside `get-client`, `get-clients`, `update-client`, and `delete-client`. The session's `clientReference(session)` must match `client.referenceId` to authorize the action.

OAuth-client RBAC primitives:

- `clientPrivileges({ headers, action, user, session })` returns a boolean per action. Actions: `create | read | update | delete | list | rotate`.
- Already wired in `workers/core/src/auth/oauth-provider.ts:100-104`, but only for the platform-admin role at the moment.

`client_credentials` native handling:

- `handleClientCredentialsGrant` in BA's `oauth-provider` index, dispatched from the `/oauth2/token` endpoint when the grant type is `client_credentials`.
- `customAccessTokenClaims` is the hook the repo uses today (`workers/core/src/auth/oauth-provider.ts:105-142`) to project token claims for both user and M2M flows.

### 3.2 Better Auth Organization Plugin Gap

Inspected `better-auth@1.6.11/dist/plugins/organization/schema.mjs`.

`member` schema:

```ts
{ id, organizationId, userId, role, createdAt }
```

`teamMember` schema:

```ts
{ id, teamId, userId, createdAt }
```

Both reference `userId`. Neither supports an OAuth client, machine principal, or generic actor. This is the structural reason an OAuth client cannot be a `member` of an organization in BA's sense, and is the entire reason the repo invented `oauthClientOrganizationGrant`.

### 3.3 Current Repo Wire-Up

In [workers/core/src/auth/get-auth.ts](../workers/core/src/auth/get-auth.ts):

- `organization({ teams: { enabled: true } })` is mounted (users + teams).
- `createOAuthProviderPlugin(...)` returns BA's oauth-provider with three notable choices:
  - **`clientReference` is not set.** BA's built-in mechanism to bind a client to an organization is unused.
  - `customAccessTokenClaims` reads `metadata.id_client_id` and `metadata.organization_id` from the client row to determine the M2M client and org ([oauth-provider.ts:127-138](../workers/core/src/auth/oauth-provider.ts#L127-L138)).
  - `clientPrivileges` accepts only the platform-admin role.
- `idOAuthScopeCatalog` plugin is mounted, exposing CRUD endpoints for `oauthResourceScope` and `oauthClientOrganizationGrant` rows.

`metadata.id_client_id` and `metadata.organization_id` are read at token-issuance time but there is no plugin-level code that writes them. The only place they are populated is a raw SQL update inside a test ([workers/core/tests/auth/principal-validation.test.ts:310-313](../workers/core/tests/auth/principal-validation.test.ts#L310-L313)). In production this would require manual SQL or some out-of-band tooling. This is an unstable contract.

### 3.4 Current Repo Custom Surface

| Object | Purpose | Standards alignment | Status |
|---|---|---|---|
| `oauthClient.metadata.id_client_id` | Duplicates `clientId` from the client row, used in `customAccessTokenClaims` | None; redundant convention | To remove (D5). |
| `oauthClient.metadata.organization_id` | Records which org a client serves | Reinventing `referenceId` | To remove (D5). |
| `oauthClientOrganizationGrant` | `(client, org, resource_server)` triples with `allowedScopes`, `enabled` | Repo extension; not in BA, not in OAuth standards | To replace (D2). |
| `idPrincipalValidation` plugin | Boolean validation API for users, teams, admins, and service accounts | Repo-specific synchronous lookup; non-standard | To remove. User/team/admin path moves to SCIM ([doc 017](017_scim-directory-and-m2m-principal-contract.md)). Service-account path moves to this document. |

### 3.5 Concrete Misalignment

1. **BA's `clientReference` is exactly the mechanism for "this OAuth client belongs to organization X."** The repo did not wire it up and built `oauthClientOrganizationGrant.organizationId` to express the same fact in a different table.
2. **The grant table is many-to-many (one client × N orgs × N resource servers).** BA's `referenceId` is 1:1. With no product requirement for cross-org clients, the extra dimension is accidental complexity, not an unmet need.
3. **`metadata.id_client_id` / `metadata.organization_id` are an undocumented convention** that token issuance depends on but the codebase never writes outside of tests. This produces brittle setup and an invisible contract.
4. **`principal-validation` synthesizes a "service_account" principal kind that does not exist anywhere else in `id`.** The kind lives in `content-api`'s domain. `id` exposes only OAuth clients and grants.

## 4. Target Model

### 4.1 BA-Aligned OAuth Client Ownership

Every OAuth client in `id` is owned by exactly one organization, expressed through BA's native `referenceId`:

```text
oauthClient
  id
  clientId
  clientSecret
  ...
  referenceId  <-- equals organization.id; BA enforces ownership on
                   get-client, get-clients, update-client, delete-client
  grantTypes   <-- includes "client_credentials" for service accounts;
                   absence of "authorization_code" identifies M2M-only
  metadata     <-- free for product-defined non-authoritative fields only;
                   no longer carries id_client_id or organization_id
```

`oauth-provider.ts` passes:

```ts
clientReference: ({ session }) => session?.activeOrganizationId
```

This makes BA enforce: only members of the owning organization may read, update, delete, or rotate the OAuth client.

### 4.2 The Single Irreducible Repo Extension

`oauthClientResourceScope` table (replaces `oauthClientOrganizationGrant`):

```text
oauthClientResourceScope
  id                primary key
  clientId          references oauthClient.clientId
  resourceServerId  references resourceServer.id
  allowedScopes     JSON array of scope strings
  enabled           boolean
  createdBy, updatedBy, createdAt, updatedAt
  unique(clientId, resourceServerId)
```

Why this is the irreducible piece:

- BA's `referenceId` handles ownership (client × org).
- BA's `oauthClient.scopes` records the full scope set the client may ever request.
- Neither BA nor RFC 7591/7592 models "for resource server R, this client may request the subset of scopes S." That subset is what `content-api` and future resource servers need to enforce **at token-issuance time**, and it is the only durable identity object `id` adds beyond BA.

What is **not** in this table:

- No `organizationId` column. Org ownership comes from `oauthClient.referenceId`.
- No "service account" flag. Whether a client is M2M is determined by `oauthClient.grantTypes` already (`client_credentials` present).
- No `clientName` mirror. Names live on `oauthClient.name`.

### 4.3 Resource Server Identity Of A Service Account

`content-api` and any future resource API see only:

- the access token claims projected from `oauthClient` + `oauthClientResourceScope` + token-issuance hooks:

  ```text
  aud         = resource indicator
  azp / client_id = oauthClient.clientId
  org_id      = oauthClient.referenceId
  scope       = subset of oauthClient.scopes ∩ oauthClientResourceScope.allowedScopes
  iss, exp, iat
  ```

- the picker / display call against `id`'s BA-stock `/oauth2/get-client?client_id=...` for non-secret metadata when an admin attaches the principal to a binding.

No new resource-server-facing endpoint is added. The contract `content-api` consumes is RFC 7591/7592 (already implemented by BA) plus the token JWT.

### 4.4 End-To-End M2M Flows

#### Flow A - Create A Service Account For An Organization

```text
admin (member of org_1) --(content-ui or id-admin-ui)--> id
  POST /api/auth/oauth2/create-client
    body: { client_name: "Editorial Automation",
            grant_types: ["client_credentials"],
            token_endpoint_auth_method: "client_secret_basic",
            redirect_uris: [] }
    session has activeOrganizationId = org_1

BA:
  - clientPrivileges allows action="create" for org member
    (after RBAC is broadened from platform-admin-only to org-member-can-create)
  - clientReference returns "org_1"
  - row written:
      oauthClient { clientId, clientSecret, referenceId="org_1",
                    grantTypes=["client_credentials"], scopes=null|chosen, ... }
  - response includes client_secret exactly once
```

The admin then attaches resource-scope subsets:

```text
admin --(id-admin-ui or content-api admin)--> id
  POST /api/auth/oauth-client-resource-scope
    body: { client_id, resource_server_id, allowed_scopes: ["books:read", "books:write"] }

id:
  - assertCallerOwnsClient: client.referenceId must match caller's activeOrganizationId
    (or caller is platform admin)
  - asserts allowed_scopes ⊆ oauthResourceScope rows for resource_server_id
  - upserts oauthClientResourceScope row
```

#### Flow B - Service Account Obtains And Uses A Token

```text
service-account holder --> id  POST /api/auth/oauth2/token
  grant_type=client_credentials
  client_id=client_xyz
  client_secret=...
  resource=https://content-api.example
  scope=books:read books:write

id (in customAccessTokenClaims when user is undefined):
  - resolve client by client_id
  - org_id = client.referenceId  (no metadata lookup)
  - resource_server = resolve by aud
  - assert oauthClientResourceScope(client_xyz, resource_server) exists and is enabled
  - assert requested scope ⊆ oauthClientResourceScope.allowed_scopes
  - mint JWT { iss, aud=resource, azp=client_xyz, org_id, scope, exp, iat }

service-account holder --> content-api  any route
  Authorization: Bearer <JWT>

content-api:
  - JWKS verify
  - project Actor { type: service_account, client_id, org_id }
  - ContentPolicy lookup matches binding(principal.id == client_id,
                                          org_id == binding.org_id)
  - allow
```

#### Flow C - Admin Attaches Service Account To A Content-IAM Binding

```text
admin --(content-ui)--> content-api  POST /policy-bindings
  body: { principal: { type: "service_account", id: "client_xyz" },
          org_id: "org_1", resource: "https://content-api.example", role: ... }

content-api:
  1. ServiceAccountAttachmentPolicy.assertCanAttach(actor, ...)
       local-only check: admin has org.manage_bindings or service_account.attach for org_1
  2. Picker UX (optional, not correctness-critical):
       content-api -> id  GET /api/auth/oauth2/get-client?client_id=client_xyz
       authorize with id M2M caller scope oauth:clients:read
       returns RFC 7592-shaped fields; never secrets
       reject save if client.referenceId !== org_1
  3. Persist binding row with principal_id = client_xyz (opaque)

No call to id at bind time other than the picker. Token-issuance is the only place id enforces (client, org, resource) eligibility.
```

#### Flow D - Grant Disabled, Re-Enabled, Or Client Reassigned

```text
operator at id:
  disable oauthClientResourceScope(client_xyz, content-api)

Immediate:
  /token requests fail; existing JWTs valid until exp (doc 013 D1)

Long-term (content-api):
  reconciliation sweep:
    GET id /api/auth/oauth2/get-client?client_id=client_xyz -> ok|404|disabled
    cross-check client.referenceId against binding.org_id
    surface mismatches/disabled bindings to operators; do not auto-delete

Re-enable later:
  binding becomes live again on next successful token use.
  Intentional under attach/use semantics (017 §6.7).
  Cross-org reassignment is impossible: client.referenceId is immutable once set
  (D5 enforcement; see §5.5).
```

## 5. Architecture Decisions

### 5.1 D1 - Adopt BA `referenceId` For Client-To-Org Ownership

**Decision**: Wire `clientReference: ({ session }) => session?.activeOrganizationId` in `createOAuthProviderPlugin`. Every OAuth client created from a session in an organization is owned by that organization. Platform-admin creation paths require an explicit `referenceId` to be set on the row.

**Classification**: Better Auth-supported capability.

**Reasoning**:

- BA's `referenceId` is the documented mechanism for OAuth-client ownership. The docstring example is the organization-plugin case.
- It immediately gives correct authorization on `get-client`, `get-clients`, `update-client`, `delete-client` without writing one line of authorization code in this repo.
- It removes the need for `metadata.organization_id` to record ownership separately.

### 5.2 D2 - Replace Many-To-Many Grant Table With Per-(Client, Resource) Scope Subsets

**Decision**: Introduce `oauthClientResourceScope { id, clientId, resourceServerId, allowedScopes, enabled, audit cols }` with a unique constraint on `(clientId, resourceServerId)`. Migrate every existing `oauthClientOrganizationGrant` row by projecting `(clientId, resourceServerId, allowedScopes, enabled)` and dropping `organizationId`. Reject the migration if any client has grants for more than one `organizationId` (escalate to §11 future backlog before proceeding).

**Classification**: Repository-specific extension. BA does not model per-resource scope subsets; OAuth standards do not either.

**Reasoning**:

- Org ownership moves to `oauthClient.referenceId` (D1). Keeping `organizationId` on the grant row would be duplicate, not necessary.
- The remaining dimension - per-(client, resource) scope subsets - is the only piece of repo-owned identity state that BA does not provide.
- A unique constraint on `(clientId, resourceServerId)` makes the table behave as a simple projection rather than a many-to-many relation.

### 5.3 D3 - Reuse BA `/oauth2/get-client` As The Picker Endpoint

**Decision**: For picker UX, admin tooling, and bind-time existence display, `content-api` calls `GET /api/auth/oauth2/get-client?client_id=...` through an `id` M2M caller token. No new client read endpoint is added in `id`.

**Classification**: Protocol standard (RFC 7592-shaped, already implemented by BA).

**Reasoning**:

- The endpoint exists, returns the RFC 7591 client metadata fields, and never returns client secrets.
- BA enforces `referenceId` ownership at this endpoint, so a content-api admin calling on behalf of `org_1` will fail to read a client owned by `org_2` - which is exactly the access boundary we want for the picker.
- Adding a parallel `id`-owned client read endpoint would duplicate BA's surface and fall into the "custom identity API" pattern rejected by `AGENTS.md`.

The only `id` work required is to authorize this endpoint for M2M callers under a dedicated scope (e.g. `oauth:clients:read`) in addition to its existing session-based auth.

### 5.4 D4 - Resource API Owns The Binding/Attach Authority

**Decision**: Whether a `content-api` admin is allowed to attach a service-account principal to a Content IAM binding is a local `content-api` decision (`ServiceAccountAttachmentPolicy.assertCanAttach`). `id` does not validate the attach act.

**Classification**: Local authorization concern. No standards involvement.

**Reasoning**:

- The attach decision is "may this admin use this OAuth client in this content-api policy binding." That is a content-api permission, not an `id` permission.
- `id` already controls *whether the client can obtain a token* through `oauthClientResourceScope` + `client_credentials` issuance. The attach act does not need a second `id`-side check.
- This matches the GCP attach/use split discussed in doc 017 §6.5.

### 5.5 D5 - Stop Storing `metadata.id_client_id` / `metadata.organization_id`

**Decision**: Remove all reads of `metadata.id_client_id` and `metadata.organization_id`. Token-issuance derives `client_id` from the resolved `oauthClient` row and `org_id` from `oauthClient.referenceId`. `oauthClient.metadata` is reserved for product-defined non-authoritative fields only.

`oauthClient.referenceId` becomes effectively immutable for service-account clients once set. Update endpoints reject changes to `referenceId` on clients whose `grantTypes` includes `client_credentials`.

**Classification**: Cleanup of an undocumented convention.

**Reasoning**:

- The current metadata fields are read at token issuance but never written by plugin code. They produce a brittle out-of-band setup requirement.
- Once D1 lands, `referenceId` is the authoritative ownership field. Duplicating it in metadata creates a drift surface.
- Reassigning a service-account client to a different org is structurally a different operation (create new client, deprecate old). Allowing in-place `referenceId` change would silently relocate authority on issued tokens.

### 5.6 D6 - No SCIM Service-Account Resource Type

**Decision**: Service accounts are not exposed as a SCIM ResourceType, neither as SCIM core `User`/`Group` nor as a custom SCIM extension. They are managed entirely through RFC 7591/7592 (BA's stock OAuth client endpoints) and the repo's `oauthClientResourceScope`.

**Classification**: Standards-fit boundary.

**Reasoning**:

- SCIM models human users and groups. OAuth clients are governed by RFC 7591/7592.
- A SCIM service-account extension exists in some IdPs (Okta `Application` resources, etc.) but is not mainstream and would add a parallel admin surface to the BA stock endpoints.
- Doc 017's SCIM directory is for User/Group lookup only and explicitly excludes OAuth clients.

### 5.7 Rejected Or Deferred Options

**Rejected: keep `oauthClientOrganizationGrant` as-is and classify it.**

A "Posture A: Repository Continuity" approach would document the existing many-to-many table as a deliberate extension and stop there. Rejected because:

- There is no current product requirement that justifies many-to-many (see §1 non-goals and the answer recorded by the user when this document was authored).
- The duplication between `oauthClient.referenceId` and `oauthClientOrganizationGrant.organizationId` is exactly the "custom API on top of a standard mechanism" pattern that `AGENTS.md`'s standards-first rules call out.
- Keeping it would block future SCIM and event-channel work from referencing a clean ownership model.

If a cross-org product requirement appears, it is recorded in §11 and would re-open this decision in a future doc rather than amending this one in place.

**Deferred: SCIM service-account extension.**

Recorded in §11. Only re-opens if an external interoperability requirement appears.

**Deferred: OAuth client lifecycle events on the SET/SSF channel.**

Doc 013 §7 already maps OAuth client disable to a repository-specific URI. After this doc lands, the producer in doc 014 should emit events keyed off `oauthClient.referenceId` and `oauthClientResourceScope.enabled`, but the event-channel implementation is owned by docs 014-016. Recorded here for cross-reference, not as new scope.

## 6. Implementation Strategy

Phase order:

```text
Phase 0 - decision review
  this doc accepted as canonical
  doc 017 trimmed to reference 018 for all M2M concerns

Phase 1 - id schema and wiring
  add oauthClientResourceScope table
  wire clientReference in oauth-provider.ts
  remove metadata.id_client_id / metadata.organization_id reads
  add /api/auth/oauth-client-resource-scope endpoints (CRUD scoped by org)
  add oauth:clients:read M2M caller scope and audience for /oauth2/get-client

Phase 2 - id data migration
  backfill oauthClient.referenceId from oauthClientOrganizationGrant.organizationId
    abort migration if any client has grants for >1 organizationId
  project oauthClientOrganizationGrant rows into oauthClientResourceScope
  drop oauthClientOrganizationGrant table after content-api is on the new contract

Phase 3 - content-api adoption
  add ServiceAccountAttachmentPolicy
  add OAuthClientDirectory adapter calling /oauth2/get-client
  remove validateServiceAccountForOrganization call sites
  add scheduled inert-binding reconciliation

Phase 4 - cleanup
  delete idPrincipalValidation service-account endpoint
  delete oauthClientOrganizationGrant table, grants.ts, and tests
  delete metadata.id_client_id / metadata.organization_id from any test fixtures
```

Rollback constraints:

- Phase 1 is additive. The new table and endpoints can be unmounted by removing the plugin registration.
- Phase 2 is destructive. Take a D1 snapshot of `oauthClientOrganizationGrant` before the projection runs. Rollback restores the table and reverts code to the pre-Phase-1 commit.
- Phase 3 is additive on the content-api side. Rollback by routing bindings back through the principal-validation adapter.
- Phase 4 is purely deletion. Run after a deprecation window on the principal-validation endpoint (doc 017 §10 already records 30/60/90).

## 7. Detailed Implementation Plan

### 7.1 Wire Up `clientReference` In `oauth-provider.ts`

Current problem:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts) passes no `clientReference`. BA falls back to `userId` ownership, which is wrong for org-owned service accounts.

Target behavior:

- `clientReference` returns the session's active organization id when one is present, otherwise undefined.

Implementation tasks:

- [ ] Add `clientReference: async ({ session }) => session?.activeOrganizationId` to the `oauthProvider({...})` options in [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts).
- [ ] Update `clientPrivileges` so org members may create/read/list/update clients owned by their org; only platform admins may delete or rotate when policy requires it. Confirm the exact set of allowed actions in code review against BA's privilege model.
- [ ] Ensure `/api/auth/admin/oauth2/create-client` paths still work for platform admins; admins must supply an explicit `referenceId` (BA accepts this when present in metadata or via admin path).

Tests:

- `workers/core/tests/auth/oauth-client-ownership.test.ts` (new): an org member can create, read, update, and list only clients of their own org; cannot see another org's clients.
- `pnpm lint` and `pnpm test`.

### 7.2 Replace The Grant Table With `oauthClientResourceScope`

Current problem:

- `oauthClientOrganizationGrant` carries `organizationId` (duplicating `referenceId`) and is many-to-many.

Target behavior:

- A single `oauthClientResourceScope` table records `(clientId, resourceServerId, allowedScopes, enabled)` with a unique constraint on `(clientId, resourceServerId)`.

Implementation tasks:

- [ ] Define `oauthClientResourceScopeSchema` as a Better Auth plugin schema in a new file under `workers/core/src/auth/plugins/oauth-scope-catalog/` (rename plugin file or split into a new plugin per repo lint rules; pick whichever the architecture lint allows without loosening rules).
- [ ] Add the corresponding Better Auth schema fields and run `pnpm db:generate`. Never write the SQL or snapshot by hand (CLAUDE.md rule 4).
- [ ] Add CRUD endpoints `/api/auth/oauth-client-resource-scope/{list,create,update,delete}` under the same plugin. Authorize each endpoint by asserting `oauthClient.referenceId` of the target client matches the caller's `activeOrganizationId` (or caller is platform admin).
- [ ] Mirror the `assertGrantScopesExist` check against `oauthResourceScope` rows so `allowedScopes ⊆ resource server's declared scopes`.

Tests:

- `workers/core/tests/auth/oauth-client-resource-scope.test.ts` (new): create/update/delete, scope-subset enforcement, cross-org write rejection, unique constraint enforcement on `(clientId, resourceServerId)`.

### 7.3 Migrate Token-Issuance Enforcement

Current problem:

- [workers/core/src/auth/oauth-provider.ts:127-138](../workers/core/src/auth/oauth-provider.ts#L127-L138) reads `metadata.id_client_id` and `metadata.organization_id` and calls `assertClientOrganizationGrant`. Both are wrong under the target model.

Target behavior:

- `customAccessTokenClaims` for the M2M branch resolves `client_id` from the resolved client row and `org_id` from `oauthClient.referenceId`, then enforces `oauthClientResourceScope` for the requested `aud` and scope set.

Implementation tasks:

- [ ] Replace the `metadata.id_client_id`/`metadata.organization_id` reads with `client.clientId` and `client.referenceId` lookups (the resolved row is available via the BA hook context; if not, look it up by `client_id`).
- [ ] Replace `assertClientOrganizationGrant` with `assertClientResourceScope`. New function reads `oauthClientResourceScope` by `(clientId, resourceServerId)`, asserts `enabled`, asserts requested scope ⊆ `allowedScopes`.
- [ ] If `referenceId` is missing on the resolved client (legacy data not yet migrated), throw `FORBIDDEN` rather than minting a token without `org_id`.
- [ ] Delete `workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts` after Phase 4. During Phases 1-3 it may coexist with the new code for parity tests.

Tests:

- `workers/core/tests/auth/m2m-token-issuance.test.ts` (new or extend existing): tokens minted carry `org_id = client.referenceId`; scope subset enforced; disabled resource-scope row rejects issuance.

### 7.4 Expose BA Client Read For Picker UX

Current problem:

- `content-api` has no clean way to read non-secret client metadata from `id`. The `principal-validation` service-account endpoint conflates existence, eligibility, and ownership in a non-standard shape.

Target behavior:

- `content-api` calls `GET /api/auth/oauth2/get-client?client_id=...` with an `id` M2M token whose audience is `id` and whose scope is `oauth:clients:read`. BA enforces ownership by `referenceId`.

Implementation tasks:

- [ ] Define an `id`-side resource server entry for the M2M caller token used by `content-api` (the existing M2M caller infrastructure used by `principal-validation` can be reused, retargeted at `/oauth2/get-client` and a different audience+scope).
- [ ] Add an opt-in path that allows the M2M caller scope `oauth:clients:read` to bypass session-based ownership when calling `/oauth2/get-client` **and** the call still scopes by the caller's intended `referenceId` (passed in headers or derived from a separate `org_id` query param). Confirm BA exposes a hook that supports this without patching plugin internals; if not, build a thin wrapper endpoint that delegates to the BA endpoint and applies the org-membership check using `content-api`'s declared org context.
- [ ] Document the scope, audience, and intended caller in the plugin README under `workers/core/src/auth/plugins/oauth-scope-catalog/`.

Tests:

- `workers/core/tests/auth/m2m-client-picker.test.ts` (new): an M2M caller with `oauth:clients:read` can read non-secret client metadata; never receives `client_secret`; cannot read clients owned by a different org context.

### 7.5 Apply `clientPrivileges` And RBAC

Current problem:

- `clientPrivileges` currently only allows the platform-admin role for all actions ([workers/core/src/auth/oauth-provider.ts:100-104](../workers/core/src/auth/oauth-provider.ts#L100-L104)). Org admins cannot create service accounts for their own org.

Target behavior:

- `clientPrivileges` permits:
  - `create`, `read`, `list`, `update`: org member with `org.manage_oauth_clients` (or whatever local authority is appropriate per the BA org plugin's role model).
  - `rotate`: org admin only.
  - `delete`: org admin only.
  - Platform admin: all actions.

Implementation tasks:

- [ ] Re-implement `clientPrivileges` to look up the session's `activeOrganizationId` and member role, then dispatch on `action`. Keep the platform-admin shortcut.
- [ ] Decide whether to model the new authority as a BA org-plugin role or as a permission set; record the choice in the plugin README.
- [ ] Confirm BA's `referenceId` ownership check still runs after `clientPrivileges` returns true; both must permit the action.

Tests:

- Extend `workers/core/tests/auth/oauth-client-ownership.test.ts` with role-based action coverage.

### 7.6 `content-api` Binding Side

Current problem:

- `content-api`'s service-account binding writes call `validateServiceAccountForOrganization` synchronously.

Target behavior:

- Local `ServiceAccountAttachmentPolicy` enforces attach authority; `OAuthClientDirectory` calls `id`'s `/oauth2/get-client` for picker UX; binding writes do not call `id` synchronously.

Implementation tasks:

- [ ] Add `src/domain/iam/service-account-attachment-policy.ts` in `content-api` with `assertCanAttach({ actor, clientId, orgId, resource })` checking local authority.
- [ ] Add `src/infrastructure/identity/oauth-client-directory.ts` calling `GET /api/auth/oauth2/get-client?client_id=...` with the SCIM/M2M caller token.
- [ ] Remove `validateServiceAccountForOrganization` calls from `CreatePolicyBindingUseCase`, `CreatePolicyDenialUseCase`, and any other use case currently using it.
- [ ] Add reconciliation in `content-api`: a scheduled job iterating service-account bindings, calling `/oauth2/get-client`, recording mismatches (deleted, disabled, or different `referenceId` than the binding's `org_id`).

Tests:

- `content-api` use-case tests updated to mock `OAuthClientDirectory` instead of `ContentPrincipalDirectory.validateServiceAccount...`.
- Cross-repo smoke as in doc 017 §12 plus a `referenceId`-mismatch case.

### 7.7 Cross-Doc Updates

Implementation tasks:

- [ ] Update [docs/010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md) M2M sections to reflect `referenceId` ownership, `oauthClientResourceScope`, and `/oauth2/get-client`.
- [ ] Update [docs/013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) §7 (event vocabulary) where it references OAuth client / grant rows so emitted events key off `referenceId` and `oauthClientResourceScope.enabled` rather than the dropped `organizationId` column.
- [ ] Update [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md) §4.3, §5.4, §5.5, §6, §7.3, §9.3, §11, §13, §16 so they reference this document as canonical for M2M and remove the now-orphaned M2M decision text.
- [ ] Update `/home/quanghuy1242/pjs/content-api/docs/007_content-iam-policy-binding-model.md` §7.8 once `content-api` is on the new contract.
- [ ] Update `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` only after implementation lands, so the skill reflects shipped code.

## 8. Migration And Rollout

Rollout sequence:

1. **Phase 1 deploy** of `id` with `clientReference` wired, `oauthClientResourceScope` table created, and new CRUD endpoints mounted. The old `oauthClientOrganizationGrant` table and `assertClientOrganizationGrant` remain functional. Token issuance reads from whichever table is populated; new clients use `referenceId`, legacy clients still rely on `metadata.organization_id` until migrated.

2. **Backfill `referenceId`**:

   ```sql
   -- Run after Phase 1 deploy.
   -- Abort if any client has grants spanning multiple organizations.
   SELECT clientId, COUNT(DISTINCT organizationId) AS orgs
   FROM oauthClientOrganizationGrant
   GROUP BY clientId
   HAVING orgs > 1;
   -- If above returns any row, stop and escalate (see §11).
   ```

   Then:

   ```sql
   UPDATE oauthClient
   SET referenceId = (
     SELECT MIN(organizationId)
     FROM oauthClientOrganizationGrant g
     WHERE g.clientId = oauthClient.clientId
   )
   WHERE referenceId IS NULL
     AND clientId IN (SELECT DISTINCT clientId FROM oauthClientOrganizationGrant);
   ```

   This SQL is illustrative; the actual migration is generated by `pnpm db:generate` after schema changes (CLAUDE.md rule 4 forbids hand-written migration SQL).

3. **Project grant rows into `oauthClientResourceScope`** during the same data migration step. Verify row counts match modulo the dropped `organizationId` dimension.

4. **Phase 2 deploy** of `id` switching `customAccessTokenClaims` to read from `referenceId` + `oauthClientResourceScope` and stopping `metadata.organization_id` / `metadata.id_client_id` reads. Old table still present but unused.

5. **Phase 3 deploy** of `content-api` switching binding writes to the new ports and removing principal-validation service-account calls.

6. **Phase 4** drops `oauthClientOrganizationGrant`, `grants.ts`, the principal-validation service-account endpoint, and all `metadata.id_client_id` / `metadata.organization_id` references. Schedule under the 30/60/90 deprecation window already defined in doc 017 §10.

Env and config changes:

- New env var on `content-api` for the `oauth:clients:read` scope and audience used by `OAuthClientDirectory`.
- Remove env vars tied to `principal-validation` once Phase 4 lands.

## 9. Edge Cases And Failure Modes

| Scenario | Expected handling |
|---|---|
| Migration finds a client with grants for >1 organization | Abort. Recorded in §11 as the cross-org future-requirement trigger. Do not silently pick one org. |
| Migration finds a client with no grants and no `referenceId` | Leave `referenceId` null. Token issuance for that client will fail with `FORBIDDEN`; this is correct behavior and matches today's "no grant" outcome. |
| Admin tries to change `referenceId` on a client with `client_credentials` in `grantTypes` | Reject with `409`. Reassigning a service-account client to a different org is structurally a different operation (D5). |
| Admin creates an OAuth client outside of an organization context | Allowed only via the platform-admin path; row stores `referenceId` only when explicitly provided. Without `referenceId`, the client cannot mint M2M tokens with `org_id`. |
| `/oauth2/get-client` called by M2M caller for a client owned by a different org | Return `404` rather than leak the existence of the client; record an audit log entry. |
| `content-api` reconciliation sees client deleted at `id` | Mark binding inert; surface to operator; do not auto-delete. Matches doc 017 §11 inert-binding policy. |
| `oauthClient.referenceId` becomes orphaned because the organization is deleted | Cascade per BA's existing org-plugin cascade for `member`/`team`; this doc does not modify cascade behavior. Existing tokens valid until exp; reconciliation flags affected bindings. |
| `oauthClientResourceScope` row for a deleted resource server | Detected at token issuance (resource server resolution fails first). Periodic cleanup deletes orphaned rows. |
| Token requested for an audience the client has no scope row for | `FORBIDDEN` with `OAuth client has no resource-scope grant`. Identical effect to today's missing-grant case. |
| Legacy production data with `metadata.organization_id` set but no `referenceId` after migration | Migration must populate `referenceId` first; if Phase 2 deploys with any such drift, `customAccessTokenClaims` rejects token issuance, which surfaces the drift safely. |
| BA's `clientReference` hook returns `undefined` when session has no `activeOrganizationId` | `get-client` and friends fall back to `userId` ownership for that call. Platform admins are unaffected. Org admins must have an active org context selected for client management. |
| Picker call from `content-api` lacks `oauth:clients:read` scope | `403`. Caller integration must request the scope at token time. |

## 10. Implementation Backlog

### R18-A. Wire Up BA `clientReference` In `id`

Scope:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
- `workers/core/tests/auth/oauth-client-ownership.test.ts`

Tasks:

- [ ] Pass `clientReference` to `oauthProvider({...})`.
- [ ] Re-implement `clientPrivileges` to honor org-member roles in addition to platform admin.

Acceptance criteria:

- Newly created OAuth clients have `referenceId = activeOrganizationId`.
- `get-client`, `get-clients`, `update-client`, and `delete-client` enforce org ownership.

Tests:

- `pnpm test -- --run workers/core/tests/auth/oauth-client-ownership.test.ts`
- `pnpm lint`

### R18-B. Add `oauthClientResourceScope` Plugin Schema And Endpoints

Scope:

- `workers/core/src/auth/plugins/oauth-scope-catalog/**` (new schema/types/operations or split into a sibling plugin if architecture lint requires it)
- `workers/core/src/db/auth-schema.ts` (regenerated)
- `workers/core/tests/auth/oauth-client-resource-scope.test.ts`

Tasks:

- [ ] Add schema, types, mappers, CRUD endpoints.
- [ ] Run `pnpm db:generate` to produce the migration; do not hand-edit (CLAUDE.md rule 4).
- [ ] Authorize endpoints by matching `oauthClient.referenceId` to caller org.

Acceptance criteria:

- Unique constraint on `(clientId, resourceServerId)` enforced.
- Endpoints reject scope subsets that exceed `oauthResourceScope` declared scopes.
- Endpoints reject cross-org writes.

Tests:

- `pnpm test -- --run workers/core/tests/auth/oauth-client-resource-scope.test.ts`
- `pnpm lint`

### R18-C. Switch Token Issuance To `referenceId` + `oauthClientResourceScope`

Scope:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
- [workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts](../workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts) (to be deleted after migration)
- `workers/core/tests/auth/m2m-token-issuance.test.ts`

Tasks:

- [ ] Replace `metadata.id_client_id` / `metadata.organization_id` reads with `client.clientId` and `client.referenceId`.
- [ ] Replace `assertClientOrganizationGrant` with `assertClientResourceScope`.
- [ ] Reject token issuance if `referenceId` is missing or `oauthClientResourceScope.enabled` is false.

Acceptance criteria:

- Tokens minted by the M2M branch carry `org_id` derived from `referenceId`.
- Scope subset is enforced at token issuance.
- Legacy `metadata.id_client_id` reads are gone.

Tests:

- `pnpm test -- --run workers/core/tests/auth/m2m-token-issuance.test.ts`
- `pnpm lint`

### R18-D. Data Migration

Scope:

- New migration generated by `pnpm db:generate`
- A one-off script in `scripts/` for the data backfill (`oauthClient.referenceId` from `oauthClientOrganizationGrant.organizationId`, plus `oauthClientResourceScope` projection)

Tasks:

- [ ] Generate schema migration.
- [ ] Write the data-backfill script with the abort guard on multi-org clients (§8 step 2).
- [ ] Snapshot `oauthClientOrganizationGrant` to a backup table or D1 export before deletion.
- [ ] Drop `oauthClientOrganizationGrant` only after Phase 3 is shipped and a deprecation window passes.

Acceptance criteria:

- Migration completes without orphan rows.
- Abort guard fires correctly on a synthetic multi-org test fixture.

Tests:

- `workers/core/tests/migrations/oauth-client-resource-scope-backfill.test.ts` (new).
- Manual run against a local D1 with seeded data.

### R18-E. M2M Picker Endpoint Authorization

Scope:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
- `workers/core/src/auth/plugins/oauth-scope-catalog/README.md` (or new plugin README)
- `workers/core/tests/auth/m2m-client-picker.test.ts`

Tasks:

- [ ] Define audience and scope for the new M2M caller path against `/oauth2/get-client`.
- [ ] Implement the bridge that lets a caller with `oauth:clients:read` read by `client_id` while still enforcing the caller's intended org context (either via BA hook if available, or a thin wrapper endpoint - record the chosen approach in the plugin README).
- [ ] Document the contract for consumer integrations.

Acceptance criteria:

- Caller with the right scope reads non-secret client metadata.
- Caller never receives `client_secret`.
- Cross-org reads return `404`.

Tests:

- `pnpm test -- --run workers/core/tests/auth/m2m-client-picker.test.ts`
- `pnpm lint`

### R18-F. `content-api` Adoption

Scope:

- `/home/quanghuy1242/pjs/content-api/src/domain/iam/service-account-attachment-policy.ts`
- `/home/quanghuy1242/pjs/content-api/src/infrastructure/identity/oauth-client-directory.ts`
- `/home/quanghuy1242/pjs/content-api/src/application/content-iam/**`
- `/home/quanghuy1242/pjs/content-api/src/application/books/create-book.usecase.ts`

Tasks:

- [ ] Add `ServiceAccountAttachmentPolicy`.
- [ ] Add `OAuthClientDirectory` calling `id`'s `/oauth2/get-client`.
- [ ] Remove `validateServiceAccountForOrganization` calls from use cases.
- [ ] Add scheduled reconciliation surfacing inert / `referenceId`-mismatched bindings.

Acceptance criteria:

- No use case calls `principal-validation` service-account endpoint.
- Reconciliation report visible to operators.

Tests:

- Updated use-case tests in `content-api`.
- Adapter test that asserts `client_secret` is never read.

### R18-G. Delete Custom Plugin And Dead Conventions

Scope:

- [workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts](../workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts)
- [workers/core/src/auth/plugins/principal-validation/**](../workers/core/src/auth/plugins/principal-validation/)
- [workers/core/tests/auth/principal-validation.test.ts](../workers/core/tests/auth/principal-validation.test.ts)
- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts) (drop `principalValidationAudience` plumbing)
- [workers/core/src/auth/config.ts](../workers/core/src/auth/config.ts) (drop `principalValidationAudience` / `principalValidationScope`)

Tasks:

- [ ] Delete `grants.ts` and references.
- [ ] Delete service-account principal-validation endpoint, body schema, and tests.
- [ ] Remove `principal-validation`-related config and env vars.
- [ ] Verify `pnpm check` is clean.

Acceptance criteria:

- No source file references `oauthClientOrganizationGrant`, `principalValidation`, or `metadata.id_client_id`/`metadata.organization_id`.
- All references to "service-account principal validation" are gone from prose and code.

Tests:

- `pnpm check`
- `rg "principal-validation|oauthClientOrganizationGrant|id_client_id|metadata\\.organization_id"` returns nothing in source.

## 11. Future Backlog

- Cross-organization OAuth clients. Re-open D1 only if a concrete product requirement appears (e.g. partner integration that legitimately serves multiple customer orgs from one client identity). Likely shape: keep `referenceId` for primary ownership and re-introduce a small `(clientId, organizationId)` membership table - but do not anticipate it in this release.
- SCIM service-account ResourceType for external interoperability. Only if an external IdP integration requires it.
- OAuth Dynamic Client Registration (RFC 7591) self-service flows for workload self-registration (corresponds to doc 017 Option A territory). Today registration is admin-driven.
- RFC 7662 introspection opt-in for `content-api` high-risk routes (already tracked in doc 013 D6).
- CAEP/fence enforcement for already-issued M2M tokens (already tracked in docs 013 D5 and 016).

## 12. Definition Of Done

This document is complete when:

- All seven decisions (D1-D6 plus §5.7 rejection) are accepted and reflected in code.
- `oauthClient.referenceId` is the authoritative org-ownership field; `clientReference` is wired.
- `oauthClientResourceScope` exists with unique `(clientId, resourceServerId)` and replaces `oauthClientOrganizationGrant`.
- `customAccessTokenClaims` reads no `metadata.id_client_id` or `metadata.organization_id`.
- `content-api` binding paths call no `id` synchronous validation endpoint for service accounts.
- Picker UX uses BA's `/oauth2/get-client` via a scoped M2M caller.
- `oauthClientOrganizationGrant` table, `grants.ts`, and the service-account branch of `principal-validation` are deleted.
- Docs 010, 013, 017, and content-api 007 reference this document for all M2M decisions.

## 13. Final Model

```text
id
  Better Auth OAuth provider:
    - oauthClient (referenceId = organization.id)
    - /oauth2/register, /oauth2/create-client, /oauth2/get-client, ...
    - /oauth2/token with client_credentials grant
    - clientReference + clientPrivileges enforce org ownership and admin RBAC

  id-specific extension (the only one):
    - oauthClientResourceScope (clientId, resourceServerId, allowedScopes, enabled)
    - CRUD endpoints scoped by oauthClient.referenceId

  Identity events:
    SET + SSF + RISC/CAEP per docs 013-016, keyed off referenceId and
    oauthClientResourceScope state changes

content-api
  Local:
    - ServiceAccountAttachmentPolicy (admin authority to attach)
    - bindings store opaque principal_id = client_id
    - scheduled reconciliation surfaces inert / mismatched bindings

  Calls to id:
    - GET /oauth2/get-client for picker (scope oauth:clients:read)
    - POST /oauth2/token at runtime (standard OAuth)

Service account
  is just an OAuth client with grant_types including client_credentials,
  owned by exactly one organization via referenceId,
  and constrained by oauthClientResourceScope per resource server.
```

The custom M2M plugin disappears. What remains is one small projection table (`oauthClientResourceScope`) that BA does not natively model, plus BA's stock OAuth client surface used as designed.
