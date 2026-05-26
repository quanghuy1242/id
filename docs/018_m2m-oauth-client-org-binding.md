# M2M Identity Correction: Adopt Better Auth's First-Class OAuth Client Model

> Status: A2 `id`-side M2M correction code is implemented for a clean-slate rollout; infrastructure credential provisioning remains a deployment task.
> A4 still requires A3 plus `content-api` adoption, and A5 remains gated on A4
> completion and its deprecation window per [doc 013 §6](013_identity-event-standards-and-decisions.md#6-phased-rollout-and-conditions-to-advance).
>
> Date: 2026-05-26
>
> Implementation summary (id repo):
>
> - `oauthClientOrganizationGrant` table, schema, plugin endpoints, runtime helper, and cache have all been removed.
> - This removal is a pre-deployment clean-slate cutover: no durable legacy grant or OAuth scope-catalog rows exist to migrate. If any environment acquires such data before rollout, deployment must stop and a data-bearing migration/backfill must be designed before applying the removal or the internal natural-key fields.
> - `principal-validation` service-account endpoint and its body schema have been removed; the four user/team/admin/user-in-org endpoints remain pending SCIM migration per [doc 017](017_scim-directory-and-m2m-principal-contract.md).
> - `oauthClient.referenceId` is wired via BA `clientReference` and is enforced as immutable for `client_credentials` clients by a `hooks.before` guard on every BA `update-client` path.
> - `oauthClientResourceScope` and `oauthResourceScope` enforce their logical unique pairs through plugin-owned internal natural-key fields declared with Better Auth-supported field uniqueness; API responses omit those storage keys. These are the repo-specific OAuth catalog objects.
> - `customAccessTokenClaims` derives `org_id` from a DB lookup of `oauthClient.referenceId`; legacy `metadata.organization_id` is stripped during bridge writes and is never token authority. `metadata.id_client_id` remains as a single one-field mirror because Better Auth 1.6.11 does not pass the resolved oauth client (or `client_id`) to the hook for `client_credentials`; this is the only BA-limitation workaround that survives doc 018 D5 and is documented at the read/write site.
> - The system scope catalog (`oauth:clients:read`) and id-audienced system resource server are first-class: `systemResourceServerAudience()` and `systemOAuthClientPickerScope` are exposed from `auth/config.ts`. The picker endpoint `GET /api/auth/admin/oauth-clients/lookup?client_id=...&org_id=...` is implemented as a read-only M2M wrapper and never returns `client_secret`.
> - D7 cross-layer invariants are enforced structurally and at token issuance: an infrastructure client (`referenceId IS NULL`) binds only to a system resource server, and a tenant client binds only to one in its organization. Runtime checks reject corrupted cross-layer rows as defense in depth.
> - New tests: `oauth-client-ownership.test.ts`, `oauth-client-resource-scope.test.ts`, `m2m-token-issuance.test.ts`, `m2m-client-picker.test.ts`, `infra-m2m-client.test.ts`. Existing tests refactored against the new contract; SA-endpoint test now asserts the path is deleted (404).
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
- [3. Baseline Findings Before Correction](#3-baseline-findings-before-correction)
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
  - [4.5 Two Layers Of M2M Clients (Tenant vs Infrastructure)](#45-two-layers-of-m2m-clients-tenant-vs-infrastructure)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 D1 - Adopt BA `referenceId` For Client-To-Org Ownership](#51-d1---adopt-ba-referenceid-for-client-to-org-ownership)
  - [5.2 D2 - Replace Many-To-Many Grant Table With Per-(Client, Resource) Scope Subsets](#52-d2---replace-many-to-many-grant-table-with-per-client-resource-scope-subsets)
  - [5.3 D3 - Expose RFC-7592-Shaped Client Metadata For Picker Use](#53-d3---expose-rfc-7592-shaped-client-metadata-for-picker-use)
  - [5.4 D4 - Resource API Owns The Binding/Attach Authority](#54-d4---resource-api-owns-the-bindingattach-authority)
  - [5.5 D5 - Remove Organization Metadata Authority And Document The Identity Bridge](#55-d5---remove-organization-metadata-authority-and-document-the-identity-bridge)
  - [5.6 D6 - No SCIM Service-Account Resource Type](#56-d6---no-scim-service-account-resource-type)
  - [5.7 D7 - Infrastructure (RS↔AS) M2M Clients Are First-Class And Distinct From Tenant M2M](#57-d7---infrastructure-rsas-m2m-clients-are-first-class-and-distinct-from-tenant-m2m)
  - [5.8 Rejected Or Deferred Options](#58-rejected-or-deferred-options)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
  - [7.1 Wire Up `clientReference` In `oauth-provider.ts`](#71-wire-up-clientreference-in-oauth-providerts)
  - [7.2 Replace The Grant Table With `oauthClientResourceScope`](#72-replace-the-grant-table-with-oauthclientresourcescope)
  - [7.3 Migrate Token-Issuance Enforcement](#73-migrate-token-issuance-enforcement)
  - [7.4 Expose BA Client Read For Picker UX](#74-expose-ba-client-read-for-picker-ux)
  - [7.5 Apply `clientPrivileges` And RBAC](#75-apply-clientprivileges-and-rbac)
  - [7.6 `content-api` Binding Side](#76-content-api-binding-side)
  - [7.7 Provision Infrastructure M2M Clients](#77-provision-infrastructure-m2m-clients)
  - [7.8 Cross-Doc Updates](#78-cross-doc-updates)
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
    - picker UX calls id /api/auth/admin/oauth-clients/lookup?client_id=...&org_id=... through a scoped M2M caller token

Runtime:
  service account -> id /api/auth/oauth2/token (client_credentials, resource)
  service account -> content-api (Bearer JWT)
```

## 3. Baseline Findings Before Correction

This section records the pre-A2 implementation that prompted the decision. The implementation summary at the top of this document and the checked backlog items describe the current `id` state.

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

- the picker / display call against `id`'s RFC-7592-shaped M2M wrapper `/admin/oauth-clients/lookup?client_id=...&org_id=...` for non-secret metadata when an admin attaches the principal to a binding.

The wrapper is a repository-specific authenticated projection required because the stock BA management endpoint is session-oriented. It preserves the RFC 7591 public-field shape and tenant isolation; the runtime access token path remains standard OAuth.

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
       content-api -> id  GET /api/auth/admin/oauth-clients/lookup?client_id=client_xyz&org_id=org_1
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
    GET id /api/auth/admin/oauth-clients/lookup?client_id=client_xyz&org_id=org_1 -> ok|404|disabled
    cross-check client.referenceId against binding.org_id
    surface mismatches/disabled bindings to operators; do not auto-delete

Re-enable later:
  binding becomes live again on next successful token use.
  Intentional under attach/use semantics (017 §6.7).
  Cross-org reassignment is impossible: client.referenceId is immutable once set
  (D5 enforcement; see §5.5).
```

### 4.5 Two Layers Of M2M Clients (Tenant vs Infrastructure)

OAuth `client` is a role in the standard, not a class of entity. The same `oauthClient` table BA maintains serves two distinct roles in this system, and both must be modeled explicitly so operators do not invent a parallel mechanism for either.

**Layer 1 - Tenant M2M client (the customer's service account).** Everything from §4.1 through §4.4 describes this layer. A tenant client is owned by an organization, calls **downstream resource servers** (e.g. `content-api`) at runtime, and is constrained by `oauthClientResourceScope`.

**Layer 2 - Infrastructure M2M client (RS↔AS plumbing).** A resource server (or any other internal system) authenticating *as itself* to `id`. Used for:

- `content-api` calling `id` SCIM endpoints (per doc 017) to resolve users, teams, and admins.
- `content-api` calling `id`'s `/admin/oauth-clients/lookup` wrapper for picker UX (per §5.3 / §7.4).
- A future identity event consumer admin surface, RFC 7662 introspection callbacks, or any other RS-initiated call to `id`.

Both layers use the same OAuth `client_credentials` grant, the same `oauthClient` row shape, and the same BA token endpoint. They differ only in metadata, ownership, and authorization rules:

| Trait | Tenant M2M | Infrastructure M2M |
|---|---|---|
| `oauthClient.referenceId` | `<organizationId>` | `null` (no tenant owner) |
| Created by | Org admin via session-scoped admin flow | Platform operator only (seeded at deploy, or via admin endpoint) |
| Allowed scopes | Tenant-resource scopes (e.g. `content:read`) gated by `oauthClientResourceScope` | System scopes only (e.g. `scim:read`, `oauth:clients:read`, `events:produce`) |
| Token audience | A downstream resource server (e.g. `content-api`) | `id` itself, or another internal system the client is permitted to call |
| Authn method | `client_secret_basic` or `client_secret_post` | Prefer `private_key_jwt` or rotated `client_secret_basic`; secret material lives in Wrangler secret bindings |
| `clientPrivileges` rule | Acts only on rows where `referenceId = caller.activeOrganizationId` | Created and managed by platform admins; org admins cannot read or list these clients |
| Lifecycle event | `oauthClient.disabled` is a tenant-visible event (per doc 013) | Treated as an operational alert, not a tenant-facing identity event |

Why one table is correct:

- OAuth 2.1 and RFC 7591/7592 model "client" as a role; there is no separate registry for "system clients" in the standard.
- BA's `referenceId` already gives us the wedge: `IS NULL` means the client is not owned by any tenant, which is exactly the infra case.
- Splitting the table would force a parallel implementation of RFC 7591 metadata, JWKS, secret rotation, and `clientPrivileges` for the infra side. That is the "custom identity API on top of a standard mechanism" anti-pattern called out by `AGENTS.md`.

Invariants that must hold across both layers (enforced by `clientPrivileges` + token-issuance hooks):

1. A client with `referenceId IS NULL` cannot obtain any tenant-resource scope. If `aud` resolves to a downstream resource server with a tenant scope set, issuance returns `invalid_scope`.
2. A client with `referenceId IS NOT NULL` cannot obtain any system scope (`scim:read`, `oauth:clients:read`, etc.). System scopes are not declarable in `oauthClientResourceScope`.
3. Infra clients are not surfaced in the org admin's "service accounts" listing. The listing filter is `referenceId = activeOrganizationId`.
4. SCIM (doc 017) does not list infra clients. Doc 017's `Users` and `Groups` resources only model human principals and teams.

Important note on when an infra client is *not* needed:

- For local JWT verification (RFC 9068-style, JWKS-based signature check, audience and issuer validation), `content-api` does **not** call `id` at runtime and therefore does **not** need an infra client. JWKS is public.
- For signed identity events (docs 013-016), `content-api` validates the SET signature with `id`'s JWKS - again no infra client needed.
- The infra client is required only when `content-api` (or another RS) makes an authenticated outbound call to `id`: `/admin/oauth-clients/lookup` now, SCIM reads after A3, or future introspection. The A2 infra-client scope is `oauth:clients:read`; A3 adds `scim:read`.

System scope catalog (current release):

```text
oauth:clients:read     -- A2 / §5.3 / §7.4: read non-secret client metadata for picker
scim:read              -- A3 planned: SCIM Users/Groups read & filter
```

`oauth:clients:read` is declared as an `oauthResourceScope` row owned by `id` itself (audience = `id`); `scim:read` follows when A3 lands. System scopes are not valid on tenant resource servers, and layer-matching resource-scope creation plus token-time enforcement rejects cross-layer use.

## 5. Architecture Decisions

### 5.1 D1 - Adopt BA `referenceId` For Client-To-Org Ownership

**Decision**: Wire `clientReference: ({ session }) => session?.activeOrganizationId` in `createOAuthProviderPlugin`. Every OAuth client created from a session in an organization is owned by that organization. Platform-admin creation paths require an explicit `referenceId` to be set on the row.

**Classification**: Better Auth-supported capability.

**Reasoning**:

- BA's `referenceId` is the documented mechanism for OAuth-client ownership. The docstring example is the organization-plugin case.
- It immediately gives correct authorization on `get-client`, `get-clients`, `update-client`, `delete-client` without writing one line of authorization code in this repo.
- It removes the need for `metadata.organization_id` to record ownership separately.

### 5.2 D2 - Replace Many-To-Many Grant Table With Per-(Client, Resource) Scope Subsets

**Decision**: Introduce `oauthClientResourceScope { id, clientId, resourceServerId, allowedScopes, enabled, audit cols }` with a unique constraint on `(clientId, resourceServerId)`. The current rollout is a clean-slate replacement: `oauthClientOrganizationGrant` was removed before any durable rows existed, so no legacy projection is necessary. A future environment containing legacy rows must stop before this migration and use a separately reviewed data-bearing transition.

**Classification**: Repository-specific extension. BA does not model per-resource scope subsets; OAuth standards do not either.

**Reasoning**:

- Org ownership moves to `oauthClient.referenceId` (D1). Keeping `organizationId` on the grant row would be duplicate, not necessary.
- The remaining dimension - per-(client, resource) scope subsets - is the only piece of repo-owned identity state that BA does not provide.
- A unique constraint on `(clientId, resourceServerId)` makes the table behave as a simple projection rather than a many-to-many relation.

### 5.3 D3 - Expose RFC-7592-Shaped Client Metadata For Picker Use

**Decision**: For picker UX and bind-time existence display, `content-api` calls `GET /api/auth/admin/oauth-clients/lookup?client_id=...&org_id=...` through an `id` M2M caller token. This thin repository-specific wrapper returns only the stock public client metadata shape because Better Auth's stock management read is session-authenticated rather than system-M2M-authenticated.

**Classification**: Repository-specific authentication bridge returning an RFC 7592-shaped public projection. Runtime service-account access continues to use standard OAuth `client_credentials`.

**Reasoning**:

- The wrapper returns RFC 7591 public client metadata fields and never returns client secrets.
- It requires an explicit `org_id` and compares it with `oauthClient.referenceId`; mismatches return `404`, including attempts to read infrastructure clients.
- The bridge exists only for system-M2M authentication of picker metadata, not as a replacement client-management API.

The caller is authorized under dedicated system audience and scope `oauth:clients:read`.

### 5.4 D4 - Resource API Owns The Binding/Attach Authority

**Decision**: Whether a `content-api` admin is allowed to attach a service-account principal to a Content IAM binding is a local `content-api` decision (`ServiceAccountAttachmentPolicy.assertCanAttach`). `id` does not validate the attach act.

**Classification**: Local authorization concern. No standards involvement.

**Reasoning**:

- The attach decision is "may this admin use this OAuth client in this content-api policy binding." That is a content-api permission, not an `id` permission.
- `id` already controls *whether the client can obtain a token* through `oauthClientResourceScope` + `client_credentials` issuance. The attach act does not need a second `id`-side check.
- This matches the GCP attach/use split discussed in doc 017 §6.5.

### 5.5 D5 - Remove Organization Metadata Authority And Document The Identity Bridge

**Decision**: Remove `metadata.organization_id` as persisted authority; a bridge write removes any legacy value it encounters. Token issuance derives `org_id` from `oauthClient.referenceId`. Better Auth 1.6.11 does not expose the resolved OAuth client or `client_id` to `customAccessTokenClaims` for `client_credentials`, so the attach path writes one documented identity bridge, `metadata.id_client_id`, solely to load the authoritative client row. It does not carry organization authority.

`oauthClient.referenceId` becomes effectively immutable for service-account clients once set. Update endpoints reject changes to `referenceId` on clients whose `grantTypes` includes `client_credentials`.

**Classification**: Cleanup of an undocumented convention.

**Reasoning**:

- The former organization mirror produced a drift surface; the remaining identity bridge is written by plugin code and is required only by the Better Auth hook boundary.
- Once D1 lands, `referenceId` is the authoritative ownership field. Duplicating it in metadata creates a drift surface.
- Reassigning a service-account client to a different org is structurally a different operation (create new client, deprecate old). Allowing in-place `referenceId` change would silently relocate authority on issued tokens.

### 5.6 D6 - No SCIM Service-Account Resource Type

**Decision**: Service accounts are not exposed as a SCIM ResourceType, neither as SCIM core `User`/`Group` nor as a custom SCIM extension. They are managed entirely through RFC 7591/7592 (BA's stock OAuth client endpoints) and the repo's `oauthClientResourceScope`.

**Classification**: Standards-fit boundary.

**Reasoning**:

- SCIM models human users and groups. OAuth clients are governed by RFC 7591/7592.
- A SCIM service-account extension exists in some IdPs (Okta `Application` resources, etc.) but is not mainstream and would add a parallel admin surface to the BA stock endpoints.
- Doc 017's SCIM directory is for User/Group lookup only and explicitly excludes OAuth clients.

### 5.7 D7 - Infrastructure (RS↔AS) M2M Clients Are First-Class And Distinct From Tenant M2M

**Decision**: Model RS-to-AS calls (e.g. `content-api` calling `id`'s SCIM and `/admin/oauth-clients/lookup`) as OAuth `client_credentials` clients with `oauthClient.referenceId = NULL`. Declare a small **system scope catalog** (`scim:read`, `oauth:clients:read`) as `oauthResourceScope` rows owned by `id` itself. Enforce layer matching at `oauthClientResourceScope` creation and repeat it at token issuance: a client with `referenceId IS NULL` cannot obtain a tenant-resource scope, and a client with `referenceId IS NOT NULL` cannot obtain a system scope.

**Classification**: Standards-aligned use of OAuth roles plus a small repository-specific extension (the system scope catalog and the two invariants). The mechanism itself - `client_credentials` for inter-service auth - is RFC 6749 §4.4. The role distinction is RFC 6749 §1.1 ("the same party may act in multiple roles").

**Reasoning**:

- `content-api` already needs to call `id` for SCIM (doc 017) and the picker endpoint (§5.3). Without this decision, an operator would have to either reuse a tenant client (which would leak tenant authority into system calls) or invent a non-OAuth shared secret. Both are inappropriate workarounds under `AGENTS.md`.
- BA's `oauthClient` already supports `referenceId = NULL`; nothing about its table needs to change.
- The two invariants are the minimal extension needed to prevent confusion between the layers. They are documented here and implemented in `clientPrivileges` + the M2M branch of `customAccessTokenClaims`.
- Local JWT verification via JWKS does **not** need an infra client. The infra client is required only for outbound authenticated calls from a resource server to `id`. Keeping that distinction explicit prevents over-provisioning.

Non-decisions (intentionally left open):

- Whether `content-api`'s infra credentials use `private_key_jwt` or `client_secret_basic` is an operational choice resolved during §7.7 implementation, not a doc 018 decision. Either is standards-conformant.
- Whether the system scope catalog grows beyond `scim:read` and `oauth:clients:read` (e.g. to add `introspect`) depends on whether RFC 7662 introspection is adopted in a future release (already tracked under doc 013 D6 and §11 of this doc).

### 5.8 Rejected Or Deferred Options

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
  remove metadata.organization_id authority; retain documented metadata.id_client_id BA hook bridge
  add /api/auth/oauth-client-resource-scope endpoints (CRUD scoped by org)
  declare oauth:clients:read as an oauthResourceScope row for id; A3 later adds scim:read
  enforce D7 invariants on resource-scope writes + customAccessTokenClaims M2M branch
  seed the content-api infrastructure M2M client (referenceId = null)

Phase 2 - id clean-slate cutover
  confirm no deployed oauthClientOrganizationGrant rows exist
  remove oauthClientOrganizationGrant without a data projection
  stop and design a data-bearing migration if that precondition changes

Phase 3 - content-api adoption
  add ServiceAccountAttachmentPolicy
  add OAuthClientDirectory adapter calling /admin/oauth-clients/lookup with org_id
  remove validateServiceAccountForOrganization call sites
  add scheduled inert-binding reconciliation

Phase 4 - cleanup
  delete idPrincipalValidation service-account endpoint
  complete consumer migration and deprecation window for remaining principal-validation routes
  keep metadata.id_client_id only as the documented BA hook bridge
```

Rollback constraints:

- Phase 1 and Phase 2 are deployed only to clean-slate databases with no legacy grant rows. A database containing legacy rows is outside this rollout and must not apply the destructive migration until a separate migration is approved.
- Phase 3 is additive on the content-api side. Rollback by routing bindings back through the principal-validation adapter.
- Phase 4 consumer cleanup runs after a deprecation window on the remaining principal-validation surface (doc 017 §10 records 30/60/90).

## 7. Detailed Implementation Plan

### 7.1 Wire Up `clientReference` In `oauth-provider.ts`

Current problem:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts) passes no `clientReference`. BA falls back to `userId` ownership, which is wrong for org-owned service accounts.

Target behavior:

- `clientReference` returns the session's active organization id when one is present, otherwise undefined.

Implementation tasks:

- [x] Add `clientReference: async ({ session }) => session?.activeOrganizationId` to the `oauthProvider({...})` options in [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts).
- [x] Update `clientPrivileges` so organization owners/admins may create/read/list/update clients in their active organization; platform admins retain all actions.
- [x] Ensure `/api/auth/admin/oauth2/create-client` paths still work for platform admins; admins must supply an explicit `referenceId` (BA accepts this when present in metadata or via admin path).

Tests:

- `workers/core/tests/auth/oauth-client-ownership.test.ts` (new): an org member can create, read, update, and list only clients of their own org; cannot see another org's clients.
- `pnpm lint` and `pnpm test`.

### 7.2 Replace The Grant Table With `oauthClientResourceScope`

Current problem:

- `oauthClientOrganizationGrant` carries `organizationId` (duplicating `referenceId`) and is many-to-many.

Target behavior:

- A single `oauthClientResourceScope` table records `(clientId, resourceServerId, allowedScopes, enabled)` with a unique constraint on `(clientId, resourceServerId)`.

Implementation tasks:

- [x] Define `oauthClientResourceScopeSchema` as a Better Auth plugin schema in a new file under `workers/core/src/auth/plugins/oauth-scope-catalog/` (rename plugin file or split into a new plugin per repo lint rules; pick whichever the architecture lint allows without loosening rules).
- [x] Add the corresponding Better Auth schema fields and run `pnpm db:generate`. Never write the SQL or snapshot by hand (CLAUDE.md rule 4).
- [x] Add CRUD endpoints `/api/auth/admin/oauth-client-resource-scopes` under the same plugin. Authorize each endpoint by the target client's layer: organization-owned clients require caller organization access; `referenceId IS NULL` infrastructure clients require platform-admin access. Creation requires the resource server to be in the same layer.
- [x] Mirror the `assertGrantScopesExist` check against `oauthResourceScope` rows so `allowedScopes ⊆ resource server's declared scopes`.

Tests:

- `workers/core/tests/auth/oauth-client-resource-scope.test.ts` (new): create/update/delete, scope-subset enforcement, cross-org write rejection, unique constraint enforcement on `(clientId, resourceServerId)`.

### 7.3 Migrate Token-Issuance Enforcement

Current problem:

- The baseline implementation read `metadata.organization_id` and called `assertClientOrganizationGrant`; organization authority must instead come from `oauthClient.referenceId` and `oauthClientResourceScope`.

Target behavior:

- `customAccessTokenClaims` for the M2M branch uses the documented `metadata.id_client_id` Better Auth bridge to load the resolved client row, derives `org_id` only from `oauthClient.referenceId`, then enforces `oauthClientResourceScope` for the requested `aud` and scope set.

Implementation tasks:

- [x] Remove `metadata.organization_id` and write/read only `metadata.id_client_id` as the documented Better Auth hook bridge used to load `client.referenceId`.
- [x] Replace `assertClientOrganizationGrant` with `assertClientResourceScope`. New function reads `oauthClientResourceScope` by `(clientId, resourceServerId)`, asserts `enabled`, asserts requested scope ⊆ `allowedScopes`.
- [x] Treat `referenceId IS NULL` as the intentional infrastructure-client layer and omit `org_id` only for a token bound to an approved system resource scope.
- [x] Keep `workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts` as the runtime `oauthClientResourceScope` reader and cache implementation; it no longer reads the removed organization-grant model.

Tests:

- `workers/core/tests/auth/m2m-token-issuance.test.ts` (new or extend existing): tokens minted carry `org_id = client.referenceId`; scope subset enforced; disabled resource-scope row rejects issuance.

### 7.4 Expose BA Client Read For Picker UX

Current problem:

- `content-api` has no clean way to read non-secret client metadata from `id`. The `principal-validation` service-account endpoint conflates existence, eligibility, and ownership in a non-standard shape.

Target behavior:

- `content-api` calls `GET /api/auth/admin/oauth-clients/lookup?client_id=...&org_id=...` with an `id` M2M token whose audience is the id-system resource server and whose scope is `oauth:clients:read`. The wrapper enforces tenant isolation by `referenceId`.

Implementation tasks:

- [x] Define an `id`-side resource server entry for the M2M caller token used by `content-api`.
- [x] Implement a thin wrapper endpoint requiring `org_id`, returning public metadata only, and returning `404` when `oauthClient.referenceId` does not match.
- [x] Document the scope, audience, and intended caller in `workers/core/src/auth/plugins/oauth-client-picker/README.md`.

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

- [x] Re-implement `clientPrivileges` to look up the session's `activeOrganizationId` and member role, then dispatch on `action`. Keep the platform-admin shortcut.
- [x] Decide whether to model the new authority as a BA org-plugin role or as a permission set; record the choice in the plugin README.
- [x] Confirm BA's `referenceId` ownership check still runs after `clientPrivileges` returns true; both must permit the action.

Tests:

- Extend `workers/core/tests/auth/oauth-client-ownership.test.ts` with role-based action coverage.

### 7.6 `content-api` Binding Side

Current problem:

- `content-api`'s service-account binding writes call `validateServiceAccountForOrganization` synchronously.

Target behavior:

- Local `ServiceAccountAttachmentPolicy` enforces attach authority; `OAuthClientDirectory` calls `id`'s `/admin/oauth-clients/lookup` wrapper for picker UX; binding writes do not call `id` synchronously.

Implementation tasks:

- [ ] Add `src/domain/iam/service-account-attachment-policy.ts` in `content-api` with `assertCanAttach({ actor, clientId, orgId, resource })` checking local authority.
- [ ] Add `src/infrastructure/identity/oauth-client-directory.ts` calling `GET /api/auth/admin/oauth-clients/lookup?client_id=...&org_id=...` with the SCIM/M2M caller token.
- [ ] Remove `validateServiceAccountForOrganization` calls from `CreatePolicyBindingUseCase`, `CreatePolicyDenialUseCase`, and any other use case currently using it.
- [ ] Add reconciliation in `content-api`: a scheduled job iterating service-account bindings, calling `/admin/oauth-clients/lookup`, recording missing/disabled/mismatched client findings.

Tests:

- `content-api` use-case tests updated to mock `OAuthClientDirectory` instead of `ContentPrincipalDirectory.validateServiceAccount...`.
- Cross-repo smoke as in doc 017 §12 plus a `referenceId`-mismatch case.

### 7.7 Provision Infrastructure M2M Clients

Current problem:

- `content-api` has no registered OAuth client identity in `id`. Outbound calls from `content-api` to `id` (SCIM per doc 017, picker per §7.4) require an authenticated `client_credentials` token, but there is no clean place today to declare the client, its scopes, or its secret material.
- The existing `principal-validation` M2M caller token has been used as an ad-hoc system credential. It must be retired or repurposed as the `content-api` infra client (see also R18-G).

Target behavior:

- One `oauthClient` row per RS that needs to call `id`. For the current release that is exactly one: `content-api`.
- The row has `referenceId = NULL`, `grant_types = ["client_credentials"]`, and is permitted (via `clientPrivileges`) to obtain only system scopes.
- A system scope catalog declares each scope as an `oauthResourceScope` owned by `id`. A2 uses `oauth:clients:read`; `scim:read` is added when A3's SCIM surface is implemented.
- `clientPrivileges` and `customAccessTokenClaims` enforce D7's two structural invariants.

Implementation tasks:

- [ ] Declare a deployment-time seed (in `workers/core/src/auth/seed/*` or equivalent) that creates the `content-api` infra client if absent. The seed uses BA's stock `createOAuthClient` with `referenceId = null` and `grantTypes = ["client_credentials"]`.
- [ ] Store `content-api`'s client secret (or `private_key_jwt` key material) in Wrangler secret bindings. Never commit secrets. Document the binding names in the relevant plugin README.
- [x] Add `oauth:clients:read` as an `oauthResourceScope` row whose audience is `id` itself, not a downstream RS.
- [ ] Add `scim:read` when the A3 SCIM endpoint is implemented.
- [x] Extend `clientPrivileges` so:
  - org admins cannot list, read, update, or delete clients with `referenceId IS NULL`;
  - platform admins manage infra clients exclusively;
  - tenant clients (`referenceId IS NOT NULL`) cannot resolve any system scope at token issuance.
- [x] Extend `customAccessTokenClaims`' M2M branch so a token request from a `referenceId IS NULL` client targeting a downstream RS audience fails with `invalid_scope`; conversely, a tenant client requesting a system scope fails the same way.
- [ ] Provide an operator runbook entry (in the plugin README) covering: rotation, revocation, and adding a new RS as an infra client when a future RS appears.

Tests:

- `workers/core/tests/auth/infra-m2m-client.test.ts` (new):
  - infra client (`referenceId = null`) successfully obtains an `oauth:clients:read` token audienced at `id`;
  - infra client requesting a `content:read` scope at `aud = content-api` is rejected with `invalid_scope`;
  - tenant client requesting the implemented system scope is rejected with `invalid_scope`;
  - org admin's listing of OAuth clients does not include `referenceId IS NULL` rows.
- `pnpm lint` and `pnpm test`.

### 7.8 Cross-Doc Updates

Implementation tasks:

- [ ] Update [docs/010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md) M2M sections to reflect `referenceId` ownership, `oauthClientResourceScope`, and `/admin/oauth-clients/lookup`.
- [x] Update [docs/013_identity-event-standards-and-decisions.md](013_identity-event-standards-and-decisions.md) §7 (event vocabulary) where it references OAuth client / grant rows so emitted events key off `referenceId` and `oauthClientResourceScope.enabled` rather than the dropped `organizationId` column.
- [x] Update [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md) §4.3, §5.4, §5.5, §6, §7.3, §9.3, §11, §13, §16 so they reference this document as canonical for M2M and remove the now-orphaned M2M decision text.
- [ ] Update `/home/quanghuy1242/pjs/content-api/docs/007_content-iam-policy-binding-model.md` §7.8 once `content-api` is on the new contract.
- [ ] Update `/home/quanghuy1242/pjs/content-api/.agents/skills/content-iam-usage/**` only after implementation lands, so the skill reflects shipped code.

## 8. Migration And Rollout

Rollout sequence:

1. **Precondition**: this A2 replacement is deployed only while there are no durable `oauthClientOrganizationGrant`, `oauthResourceScope`, or `oauthClientResourceScope` rows and no consumer depends on the service-account validation route. The supported internal natural-key columns are non-null and intentionally have no speculative data backfill. This is the state recorded for the current heavy-coding environment.

2. **Generate and apply the `id` migrations** with `pnpm db:generate`. The generated history creates `oauthClientResourceScope`, removes the unused legacy table, and preserves the catalog's logical pair uniqueness through plugin-owned natural-key fields. No handwritten SQL or snapshot edits are permitted.

3. **Deploy `id` A2** with `clientReference`, layer-matched resource-scope writes, `oauth:clients:read`, the system-M2M picker wrapper, and token issuance based on `referenceId` plus the documented `metadata.id_client_id` Better Auth bridge.

4. **Deploy A3/A4 consumers together with their required system scopes and credentials**. `content-api` must use `/admin/oauth-clients/lookup?client_id=...&org_id=...` and no longer call the removed service-account branch.

5. **A5 remains later work**: remove the remaining user/team/admin principal-validation surface only after A4 is complete and the deprecation window in doc 017 §10 has elapsed.

If step 1 becomes false before deployment, do not run this clean-slate rollout. Write a separate data-bearing migration with backup, projection, and validation requirements before dropping any durable table.

Env and config changes:

- New env var on `content-api` for the `oauth:clients:read` scope and audience used by `OAuthClientDirectory`.
- Remove env vars tied to `principal-validation` once Phase 4 lands.

## 9. Edge Cases And Failure Modes

| Scenario | Expected handling |
|---|---|
| A deployment target contains any durable legacy grant rows | Stop the clean-slate rollout and design a reviewed data-bearing migration; do not silently discard or project state. |
| Infrastructure client has `referenceId IS NULL` | Permit only system-layer `oauthClientResourceScope` rows and system-scoped tokens; no `org_id` claim is emitted. |
| Admin tries to change `referenceId` on a client with `client_credentials` in `grantTypes` | Reject with `409`. Reassigning a service-account client to a different org is structurally a different operation (D5). |
| Admin creates an OAuth client outside of an organization context | Allowed only via the platform-admin path; row stores `referenceId` only when explicitly provided. Without `referenceId`, the client cannot mint M2M tokens with `org_id`. |
| `/admin/oauth-clients/lookup` called without `org_id` | Return `400`; the M2M caller must always state the tenant lookup context. |
| `/admin/oauth-clients/lookup` called for a client outside `org_id` | Return `404` rather than leak the existence of the client. |
| `content-api` reconciliation sees client deleted at `id` | Mark binding inert; surface to operator; do not auto-delete. Matches doc 017 §11 inert-binding policy. |
| `oauthClient.referenceId` becomes orphaned because the organization is deleted | Cascade per BA's existing org-plugin cascade for `member`/`team`; this doc does not modify cascade behavior. Existing tokens valid until exp; reconciliation flags affected bindings. |
| `oauthClientResourceScope` row for a deleted resource server | Detected at token issuance (resource server resolution fails first). Periodic cleanup deletes orphaned rows. |
| Token requested for an audience the client has no scope row for | `FORBIDDEN` with `OAuth client has no resource-scope grant`. Identical effect to today's missing-grant case. |
| A row contains legacy `metadata.organization_id` | It is ignored and stripped when a resource-scope attachment writes the documented `metadata.id_client_id` bridge; `referenceId` is the only organization authority. |
| BA's `clientReference` hook returns `undefined` when session has no `activeOrganizationId` | `get-client` and friends fall back to `userId` ownership for that call. Platform admins are unaffected. Org admins must have an active org context selected for client management. |
| Picker call from `content-api` lacks `oauth:clients:read` scope | `403`. Caller integration must request the scope at token time. |

## 10. Implementation Backlog

### R18-A. Wire Up BA `clientReference` In `id`

Scope:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
- `workers/core/tests/auth/oauth-client-ownership.test.ts`

Tasks:

- [x] Pass `clientReference` to `oauthProvider({...})`.
- [x] Re-implement `clientPrivileges` to honor org-member roles in addition to platform admin.

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

- [x] Add schema, types, mappers, CRUD endpoints.
- [x] Run `pnpm db:generate` to produce the migration; do not hand-edit (CLAUDE.md rule 4).
- [x] Authorize endpoints by matching `oauthClient.referenceId` to caller org.

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
- [workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts](../workers/core/src/auth/plugins/oauth-scope-catalog/grants.ts) (runtime reader/cache for the new resource-scope table)
- `workers/core/tests/auth/m2m-token-issuance.test.ts`

Tasks:

- [x] Remove the `metadata.organization_id` authority mirror; retain `metadata.id_client_id` only as the documented BA hook bridge used to load `client.referenceId`.
- [x] Replace `assertClientOrganizationGrant` with `assertClientResourceScope`.
- [x] Reject tenant token issuance without an allowed resource-scope row; permit `referenceId IS NULL` only for infrastructure clients with system-layer scope rows.

Acceptance criteria:

- Tokens minted by the M2M branch carry `org_id` derived from `referenceId`.
- Scope subset is enforced at token issuance.
- No token authority is derived from `metadata.organization_id`; the single `metadata.id_client_id` bridge is documented and covered.

Tests:

- `pnpm test -- --run workers/core/tests/auth/m2m-token-issuance.test.ts`
- `pnpm lint`

### R18-D. Clean-Slate Schema Cutover

Scope:

- New migration generated by `pnpm db:generate`
- `workers/core/src/auth/plugins/oauth-scope-catalog/{schema,operations}.ts` for supported plugin-owned natural-key fields

Tasks:

- [x] Record the clean-slate precondition: no durable legacy grant or OAuth scope-catalog data exists in the deployment target.
- [x] Generate the schema migration that removes the unused legacy table and creates the replacement.
- [x] Preserve logical unique `(resourceServerId, scope)` and `(clientId, resourceServerId)` invariants through supported unique plugin fields, without post-processing generated schema.
- [x] Remove `oauthClientOrganizationGrant` without restoring it.

Acceptance criteria:

- Fresh migration application succeeds and contains no legacy data dependency.
- Database constraints reject duplicate catalog scope/resource-scope natural keys emitted by the owning plugin endpoints.
- Any later discovery of legacy or scope-catalog durable rows invalidates this clean-slate path and requires a separate reviewed migration/backfill.

Tests:

- `workers/core/tests/auth/oauth-client-resource-scope.test.ts`.
- `pnpm db:generate` and `pnpm check`.

### R18-E. M2M Picker Endpoint Authorization

Scope:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
- `workers/core/src/auth/plugins/oauth-scope-catalog/README.md` (or new plugin README)
- `workers/core/tests/auth/m2m-client-picker.test.ts`

Tasks:

- [x] Define audience and scope for the new M2M caller path against `/admin/oauth-clients/lookup`.
- [x] Implement the bridge that lets a caller with `oauth:clients:read` read by `client_id` while still enforcing the caller's intended org context (either via BA hook if available, or a thin wrapper endpoint - record the chosen approach in the plugin README).
- [x] Document the contract for consumer integrations.

Acceptance criteria:

- Caller with the right scope reads non-secret client metadata.
- Caller never receives `client_secret`.
- Calls missing the required `org_id` context return `400`.
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
- [ ] Add `OAuthClientDirectory` calling `id`'s `/admin/oauth-clients/lookup?client_id=...&org_id=...`.
- [ ] Remove `validateServiceAccountForOrganization` calls from use cases.
- [ ] Add scheduled reconciliation surfacing inert / `referenceId`-mismatched bindings.

Acceptance criteria:

- No use case calls `principal-validation` service-account endpoint.
- Reconciliation report visible to operators.

Tests:

- Updated use-case tests in `content-api`.
- Adapter test that asserts `client_secret` is never read.

### R18-H. Provision The `content-api` Infrastructure M2M Client

Scope:

- [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts) (extend `clientPrivileges`, extend `customAccessTokenClaims` M2M branch)
- New: a deployment-time seed under `workers/core/src/auth/seed/` (or equivalent) creating the infra client if absent
- New: system scope catalog (`oauth:clients:read` in A2; `scim:read` with A3) as `oauthResourceScope` rows owned by `id`
- New plugin README section documenting infra-client lifecycle, secret bindings, rotation

Tasks:

- [ ] Define and seed the `content-api` infra client (`referenceId = null`, `grant_types = ["client_credentials"]`).
- [x] Declare `oauth:clients:read` as an `oauthResourceScope` row audienced at `id`.
- [ ] Declare `scim:read` with A3's SCIM implementation.
- [x] Extend `clientPrivileges` so org admins cannot see `referenceId IS NULL` clients and platform admins exclusively manage them.
- [x] Extend the M2M branch of `customAccessTokenClaims` to enforce: infra clients cannot request tenant-resource scopes; tenant clients cannot request system scopes.
- [ ] Store `content-api`'s client credentials in Wrangler secret bindings; document binding names in the plugin README.

Acceptance criteria:

- `content-api` calls `id`'s `/admin/oauth-clients/lookup` (§7.4), and later A3 SCIM endpoints, using a token minted from the infra client.
- D7 invariants verified by unit tests (see §7.7).
- Org admin UI listings exclude `referenceId IS NULL` rows.

Tests:

- `workers/core/tests/auth/infra-m2m-client.test.ts` as described in §7.7.
- Integration: `content-api` SCIM adapter test (doc 017 §12) succeeds against the seeded infra client.

### R18-G. Delete Legacy Grant Model And Service-Account Validation Branch

Scope:

- `oauthClientOrganizationGrant` schema/endpoints and obsolete runtime references
- [workers/core/src/auth/plugins/principal-validation/**](../workers/core/src/auth/plugins/principal-validation/)
- [workers/core/tests/auth/principal-validation.test.ts](../workers/core/tests/auth/principal-validation.test.ts)

Tasks:

- [x] Delete the `oauthClientOrganizationGrant` schema/endpoints/runtime usage; keep `grants.ts` as the replacement table's token-time reader/cache.
- [x] Delete only the service-account principal-validation endpoint and its body schema/tests; user/team/admin validation remains until A5.
- [x] Remove the `metadata.organization_id` convention while retaining documented `metadata.id_client_id` for the Better Auth hook boundary.
- [x] Verify `pnpm check` is clean.

Acceptance criteria:

- No source file references `oauthClientOrganizationGrant`; `metadata.organization_id` occurs only in deletion/documentation and is never read as authority.
- No active service-account branch remains in `principal-validation`; other principal types remain pending A5.

Tests:

- `pnpm check`
- `rg "oauthClientOrganizationGrant" workers/core/src` returns nothing; review of `metadata.organization_id` occurrences shows only stripping/documentation.

## 11. Future Backlog

- Cross-organization OAuth clients. Re-open D1 only if a concrete product requirement appears (e.g. partner integration that legitimately serves multiple customer orgs from one client identity). Likely shape: keep `referenceId` for primary ownership and re-introduce a small `(clientId, organizationId)` membership table - but do not anticipate it in this release.
- SCIM service-account ResourceType for external interoperability. Only if an external IdP integration requires it.
- OAuth Dynamic Client Registration (RFC 7591) self-service flows for workload self-registration (corresponds to doc 017 Option A territory). Today registration is admin-driven.
- RFC 7662 introspection opt-in for `content-api` high-risk routes (already tracked in doc 013 D6).
- CAEP/fence enforcement for already-issued M2M tokens (already tracked in docs 013 D5 and 016).

## 12. Definition Of Done

This document is complete when:

- All eight decisions (D1-D7 plus §5.8 rejection) are accepted and reflected in code.
- `oauthClient.referenceId` is the authoritative org-ownership field; `clientReference` is wired.
- `oauthClientResourceScope` exists with unique `(clientId, resourceServerId)` and replaces `oauthClientOrganizationGrant`.
- `customAccessTokenClaims` derives organization authority only from `referenceId`; its documented `metadata.id_client_id` bridge exists only because the Better Auth 1.6.11 hook does not expose `client_id`.
- `content-api` binding paths call no `id` synchronous validation endpoint for service accounts.
- Picker UX uses `/admin/oauth-clients/lookup?client_id=...&org_id=...` via a scoped system-M2M caller.
- A `content-api` infrastructure M2M client (`referenceId IS NULL`) is provisioned, and the system scope catalog is declared as `oauthResourceScope` rows owned by `id` as its consuming APIs land (`oauth:clients:read` in A2 and `scim:read` in A3).
- D7 invariants are enforced: infra clients cannot obtain tenant-resource scopes; tenant clients cannot obtain system scopes.
- `oauthClientOrganizationGrant` and the service-account branch of `principal-validation` are deleted; `grants.ts` implements only `oauthClientResourceScope`.
- Docs 010, 013, 017, and content-api 007 reference this document for all M2M decisions.

## 13. Final Model

```text
id
  Better Auth OAuth provider:
    - oauthClient
        Tenant M2M:        referenceId = organization.id
        Infrastructure:    referenceId = NULL
    - /oauth2/register, /oauth2/create-client, /oauth2/get-client, ...
    - /oauth2/token with client_credentials grant
    - clientReference + clientPrivileges enforce:
        - tenant-client ownership by referenceId,
        - infra-client management by platform admin only

  id-specific durable catalog extensions:
    - oauthClientResourceScope (clientId, resourceServerId, allowedScopes, enabled)
        CRUD endpoints enforce tenant/system layer matching
        token issuance repeats D7 checks against corrupted rows
    - System scope catalog as oauthResourceScope rows audienced at id:
        oauth:clients:read (A2)
        scim:read (A3)

  Identity events:
    SET + SSF + RISC/CAEP per docs 013-016, keyed off referenceId and
    oauthClientResourceScope state changes (tenant clients only)

content-api
  Local:
    - ServiceAccountAttachmentPolicy (admin authority to attach)
    - bindings store opaque principal_id = client_id
    - scheduled reconciliation surfaces inert / mismatched bindings

  Acts as RS for tenant tokens:
    - validates JWTs locally via id's JWKS (no infra-client call needed)

  Acts as OAuth client when calling id:
    - infrastructure M2M client (referenceId = NULL) in id
    - GET /admin/oauth-clients/lookup?client_id=...&org_id=... for picker (scope oauth:clients:read)
    - SCIM Users/Groups reads (scope scim:read, per doc 017)
    - POST /oauth2/token at runtime to mint the above caller tokens

Tenant service account
  is just an OAuth client with grant_types including client_credentials,
  owned by exactly one organization via referenceId,
  and constrained by oauthClientResourceScope per downstream resource server.

Infrastructure M2M client
  is the same kind of OAuth client with referenceId = NULL,
  permitted only to obtain system scopes audienced at id,
  used for RS↔AS plumbing (SCIM reads, picker, future introspection).
```

The legacy organization-grant and service-account-validation surfaces disappear. What remains is one small projection table (`oauthClientResourceScope`) that BA does not natively model, the system scope catalog of `oauthResourceScope` rows for `id`-audienced calls, BA's stock OAuth client surface, and the narrowly documented `metadata.id_client_id` bridge required at Better Auth 1.6.11 token-hook time.
