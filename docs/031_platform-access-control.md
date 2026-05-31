# Platform Access Control — Principals, Tiers, And The Machine Plane

> Status: implementation-grade model and consolidation proposal
>
> Date: 2026-05-31
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — `core-id` authorization server: who may operate `id`'s own control plane and id-owned confidential machine APIs, and how that authority is expressed for both human and machine principals
> - `workers/core/src/auth/policies/access.ts` — the `isPlatformAdmin` / `hasOrganizationAccess` authority primitives
> - `workers/core/src/auth/get-auth.ts` — per-plugin `authorize()` wiring
> - `workers/core/src/auth/oauth-provider.ts` — M2M token issuance, the infra-vs-tenant gate, scope/audience validation
> - `workers/core/src/auth/plugins/{resource-server,oauth-scope-catalog,oauth-m2m-bridge,oauth-client-picker,scim-directory}/**`
> - `workers/core/src/auth/config.ts` — protocol/bootstrap/system scopes and the system audience
>
> Source docs and local evidence:
>
> - [docs/000_repo-architecture.md](000_repo-architecture.md)
> - [docs/010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md)
> - [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md)
> - [docs/018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md)
> - [docs/028_tenant-scoped-platform-experience.md](028_tenant-scoped-platform-experience.md)
> - [docs/029_account-center-and-self-service-identity.md](029_account-center-and-self-service-identity.md)
> - [docs/030_client-initiated-registration-and-onboarding.md](030_client-initiated-registration-and-onboarding.md)
> - [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
> - [workers/core/src/auth/policies/access.ts](../workers/core/src/auth/policies/access.ts)
> - [workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts](../workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts)
> - [workers/core/src/auth/plugins/oauth-client-picker/README.md](../workers/core/src/auth/plugins/oauth-client-picker/README.md)
> - [workers/core/src/auth/plugins/scim-directory/index.ts](../workers/core/src/auth/plugins/scim-directory/index.ts)
> - External evidence (consumer): `~/pjs/content-api` — `src/infrastructure/identity/id-introspection-adapter.ts`, `src/infrastructure/identity/scim-content-principal-directory.ts`, `src/config/env.ts`, `wrangler.jsonc`
> - Anti-pattern evidence: `~/pjs/auther` (legacy) — `src/lib/services/registration-context-service.ts`, `src/app/api/auth/signup-intents/route.ts`
>
> External references checked on 2026-05-31:
>
> - RFC 6749, OAuth 2.0 Authorization Framework: <https://www.rfc-editor.org/rfc/rfc6749>
> - RFC 7662, OAuth 2.0 Token Introspection: <https://www.rfc-editor.org/rfc/rfc7662>
> - RFC 7591, OAuth 2.0 Dynamic Client Registration (client metadata): <https://www.rfc-editor.org/rfc/rfc7591>
> - RFC 7644, SCIM 2.0 Protocol: <https://www.rfc-editor.org/rfc/rfc7644>
> - RFC 8707, OAuth 2.0 Resource Indicators: <https://www.rfc-editor.org/rfc/rfc8707>
> - RFC 9068, JWT Profile for OAuth 2.0 Access Tokens: <https://www.rfc-editor.org/rfc/rfc9068>
> - Google Cloud IAM overview: <https://cloud.google.com/iam/docs/overview>
> - Google Cloud service accounts: <https://cloud.google.com/iam/docs/service-account-overview>
> - AWS IAM roles and STS: <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html>
>
> Assumptions:
>
> - `id` remains one authorization-server deployment with one issuer, one JWKS set, and database-backed organizations.
> - `id` is the identity, credential-issuance, and self-administration plane. It is not a resource policy-decision point. Resource servers (for example `content-api` Content IAM) own object-level authorization and never delegate it to `id`.
> - The existing authority primitives `isPlatformAdmin` (`user.role === "admin"`) and `hasOrganizationAccess` (membership `owner`/`admin`) remain the first-release authority sources. This document centralizes the model; it does not introduce a policy engine, ReBAC, or CEL.
> - Machine principals are OAuth clients (`grant_types` including `client_credentials`) owned by `oauthClient.referenceId`. There is no separate service-account table; "service account" is a role this document names, not a new entity.
> - No client id, client name, scope name, organization id, or audience is hard-coded in source. The scope catalog and resource-server rows are the runtime source of truth.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Vocabulary](#2-vocabulary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Authority Primitives Are Scattered Across `authorize()` Callbacks](#31-authority-primitives-are-scattered-across-authorize-callbacks)
  - [3.2 The Machine Principal Model Is Split Across Five Sites](#32-the-machine-principal-model-is-split-across-five-sites)
  - [3.3 The Scope Catalog Is Better Auth's Runtime Prefill](#33-the-scope-catalog-is-better-auths-runtime-prefill)
  - [3.4 Two Confidential id-To-Client Channels Already Exist](#34-two-confidential-id-to-client-channels-already-exist)
- [4. Target Model](#4-target-model)
  - [4.1 The Two-Tier, Two-Principal-Kind Matrix](#41-the-two-tier-two-principal-kind-matrix)
  - [4.2 Machine Principals: Service Accounts As OAuth Clients](#42-machine-principals-service-accounts-as-oauth-clients)
  - [4.3 The Scope Catalog: Three Roles On The Platform Plane](#43-the-scope-catalog-three-roles-on-the-platform-plane)
  - [4.4 The System Tier Is The Confidential id-To-Client Machine Plane](#44-the-system-tier-is-the-confidential-id-to-client-machine-plane)
  - [4.5 Two Confidential Channels, Two Infra Service Accounts](#45-two-confidential-channels-two-infra-service-accounts)
  - [4.6 Cross-Tier Enforcement And Principal Integrity](#46-cross-tier-enforcement-and-principal-integrity)
  - [4.7 Default System Scope Catalog And Seed](#47-default-system-scope-catalog-and-seed)
  - [4.8 The Console Access Section](#48-the-console-access-section)
  - [4.9 Access API Surface](#49-access-api-surface)
- [5. Standards And Capability Classification](#5-standards-and-capability-classification)
- [6. Architecture Decisions](#6-architecture-decisions)
- [7. The Boundary With Resource Access Control](#7-the-boundary-with-resource-access-control)
- [8. GCP And AWS IAM Mapping](#8-gcp-and-aws-iam-mapping)
- [9. How 028, 029, And 030 Attach To This Model](#9-how-028-029-and-030-attach-to-this-model)
- [10. Edge Cases And Failure Modes](#10-edge-cases-and-failure-modes)
- [11. Consolidation Touchpoints](#11-consolidation-touchpoints)
- [12. Test And Verification Plan](#12-test-and-verification-plan)
- [13. Definition Of Done](#13-definition-of-done)
- [14. Final Model](#14-final-model)

## 1. Goal

Give `id` one coherent model for **platform access control**: who may operate `id`'s own control plane (admin APIs, scope catalog, resource-server registration, M2M bindings, user/client management, JWKS) and who may call `id`-owned confidential machine APIs (SCIM directory, OAuth client-picker, token introspection). This authority exists today but is scattered across six code sites with no single statement of the model, so each new feature re-derives "who is allowed here" in its own vocabulary.

The primary driver is **machine-to-machine access at the infrastructure level**. The most load-bearing and least-documented part of `id`'s access surface is the id-owned **system service account**: a confidential machine identity that binds `id` to a resource server for `id`-owned operations such as directory validation and token introspection. Human administration (platform admin, organization admin) is the same model from the other side; this document treats human and machine as parallel principal kinds at the same tiers rather than as separate concerns.

This is a model and consolidation document. It names what exists, fixes the vocabulary, draws the boundary, and shows how [docs/028](028_tenant-scoped-platform-experience.md), [docs/029](029_account-center-and-self-service-identity.md), and [docs/030](030_client-initiated-registration-and-onboarding.md) attach to one model. It proposes no new tables and no policy engine.

Non-goals:

- Do not build a policy-decision engine, ReBAC, or CEL in `id`. Authority stays as explicit role checks.
- Do not move any resource-level authorization into `id`. Resource servers own object decisions (see [7](#7-the-boundary-with-resource-access-control)).
- Do not add a separate service-account table. Service accounts are OAuth clients.
- Do not let `id` scopes name resource objects or mirror a resource server's fine-grained permissions.

## 2. Vocabulary

Platform access control: authority over `id`'s own control plane and `id`-owned confidential machine APIs. The subject of this document.

Resource access control: authority over a resource server's own objects (for example `content-api`'s Content IAM deciding `book.update` on `book_y`). Owned by the resource server, never by `id`.

Principal: an authenticated actor. Two kinds: human (Better Auth user with a role and memberships) and machine (an OAuth client used with `client_credentials`).

Tier: the scope of authority. Two tiers: system/platform (the whole issuer/deployment, `organizationId IS NULL`) and organization (one Better Auth organization).

Service account: a machine principal — an OAuth client whose `grant_types` include `client_credentials`, owned by `oauthClient.referenceId`. Not a separate entity.

Infra (system) service account: a service account at the system tier (`referenceId === null`), able to obtain only `id`-owned system-audience scopes. The confidential machine identity that binds `id` to a resource server.

Tenant service account: a service account at the organization tier (`referenceId === orgId`), able to obtain only that organization's tenant-audience scopes; its tokens carry `org_id`.

Scope catalog: the plugin-owned rows (`oauthResourceScope`, `oauthClientResourceScope`) that define which scopes exist per resource server, the system/tenant classification of each, and which clients may request them. Also the runtime prefill for Better Auth's OAuth provider.

System audience: the `id`-owned resource-server audience `{BETTER_AUTH_URL}/system` used by confidential `id`-to-client APIs (SCIM directory, client-picker).

Confidential id-to-client channel: an `id`-owned machine API that a resource server calls with an infra service account to perform an `id`-owned operation (directory validation, token-active assertion).

## 3. Current-State Findings

### 3.1 Authority Primitives Are Scattered Across `authorize()` Callbacks

`workers/core/src/auth/policies/access.ts` defines the two authority primitives: `isPlatformAdmin(role)` (true only for `role === "admin"`) and `hasOrganizationAccess(adapter, userId, organizationId)` (true for membership `owner`/`admin`). These are correct and small.

The problem is that `workers/core/src/auth/get-auth.ts` re-expresses the same tiered rule inline for each plugin. `idResourceServer` and `idOAuthScopeCatalog` both pass an `authorize` callback shaped `organizationId == null ? isPlatformAdmin(role) : isPlatformAdmin(role) || hasOrganizationAccess(...)`. `idAdminAudit` and `idAdminActivityLog` pass `(role) => isPlatformAdmin(role)`. The OAuth provider receives `isPlatformAdmin` as `canManageOAuthClients`. The "system tier = platform admin; org tier = platform admin or org admin" rule is therefore duplicated five times with no shared name.

### 3.2 The Machine Principal Model Is Split Across Five Sites

The concept "a machine principal at the system or organization tier, and what it may obtain" is encoded in five places:

- `oauthClient.referenceId` (Better Auth OAuth provider) — ownership: `null` = infra, `orgId` = tenant.
- `oauth-m2m-bridge` — a behavior-only plugin enforcing that `referenceId` is immutable for `client_credentials` clients (doc 018 §5.5 D5), so a client cannot migrate tiers.
- `oauth-provider.ts` `customAccessTokenClaims` — the issuance-time gate: infra clients (`clientReferenceId === null`) may obtain only system audiences and get no `org_id`; tenant clients may obtain only tenant audiences and get `org_id`; cross-tier is rejected with `invalid_scope`.
- `oauth-scope-catalog` `oauthClientResourceScope` rows — which client may request which scopes on which resource (the M2M binding).
- `config.ts` — the system scope and audience constants.

Each is individually documented (doc 018 is strong), but there is no single statement that these five are one model.

### 3.3 The Scope Catalog Is Better Auth's Runtime Prefill

The scope catalog is not an admin display table. In `oauth-provider.ts`, `createOAuthProviderPlugin` injects it directly into Better Auth:

```ts
oauthProvider({
  scopes: [...authPluginConfig.oauthProtocolScopes, ...authPluginConfig.bootstrapOAuthScopes, ...catalog.scopes],
  validAudiences: [...catalog.validAudiences],
  ...
})
```

`loadOAuthResourceScopes` (`oauth-scope-catalog/scopes.ts`) reads the rows and builds `catalog.scopes`, `catalog.validAudiences`, and `catalog.scopeRows`. Each runtime row carries `{ resourceServerId, audience, scope, system }`, where `system` is true when the owning resource server has `organizationId IS NULL`. `audienceIsSystem()` uses that flag to enforce the infra-vs-tenant rule at issuance. The catalog is paid only for routes that need it (`authPathNeedsOAuthRuntimeCatalog`: authorize, token, create-client, update-client). So the scope catalog is the **runtime-authoritative definition of what `id` will mint, for which audience, and at which tier**.

`config.ts` holds the fixed scope vocabulary the catalog extends: `oauthProtocolScopes = ["openid","profile","email","offline_access"]`, `bootstrapOAuthScopes = ["org:read","org:write"]`, `systemOAuthClientPickerScope = "oauth:clients:read"`, `scimDirectoryScope = "identity:directory:read"`, and `systemResourceServerAudience(baseUrl) = {baseUrl}/system`.

### 3.4 Two Confidential id-To-Client Channels Already Exist

`content-api` is the canonical consumer and already uses two distinct confidential channels into `id`, each with its own infra service-account credential pair (confirmed in `content-api` `src/config/env.ts` and `wrangler.jsonc`):

- **Directory validation channel.** Credentials `ID_SCIM_CLIENT_ID`/`ID_SCIM_CLIENT_SECRET` obtain a `client_credentials` token with `aud = {id}/system` and `scope = "identity:directory:read oauth:clients:read"`, then call the SCIM directory and the OAuth client-picker with that Bearer token to validate exact principal IDs at write time. Both endpoints share the `/system` audience (doc 020).
- **Token-active assertion channel.** Credentials `ID_INTROSPECTION_CLIENT_ID`/`ID_INTROSPECTION_CLIENT_SECRET` authenticate with HTTP Basic directly to Better Auth's native RFC 7662 endpoint `POST /api/auth/oauth2/introspect`. `content-api` calls this via `assertTokenActive` before sensitive Content IAM mutations (create/revoke policy binding, denial, role) to confirm the presented user token has not been revoked, beyond local JWT signature verification.

Introspection is Better Auth-native: the OAuth provider package exposes `/oauth2/introspect` and applies token-and-introspect claims. `id` does not configure a dedicated introspection scope today; the introspection caller authenticates as a client (RFC 7662 client authentication), which is why the introspection credential pair is separate from the directory pair and needs no system-audience token.

## 4. Target Model

### 4.1 The Two-Tier, Two-Principal-Kind Matrix

Platform access control is one model: two tiers, and at each tier a human and a machine principal in parallel.

| Tier | Human principal | Machine principal | Operates on | Permission/authority source |
|---|---|---|---|---|
| **System / platform** | platform admin (`user.role === "admin"`, `isPlatformAdmin`) | **infra service account** (`oauthClient.referenceId === null`, `/system` audience) | `id`'s control plane + `id`-owned confidential APIs (SCIM directory, client-picker, introspection) | platform-admin role; **system** scope-catalog rows (`identity:directory:read`, `oauth:clients:read`) |
| **Organization** | org owner/admin (`hasOrganizationAccess`) | **tenant service account** (`referenceId === orgId`, tenant audience, `org_id` claim) | one organization's resources inside `id`; tenant runtime tokens | org owner/admin role; **tenant** scope-catalog rows (per resource server) |

The single rule that the scattered `authorize()` callbacks all express is: **system-tier authority requires the platform-admin role (human) or an infra service account (machine); organization-tier authority requires platform admin or the org's owner/admin (human) or a tenant service account bound to that org (machine).** Naming this once is the centralization.

### 4.2 Machine Principals: Service Accounts As OAuth Clients

A service account is an `oauthClient` with `client_credentials` in `grant_types`, owned by `referenceId`. There is no separate table and there should not be one — this keeps runtime access on the standard OAuth client-credentials path (RFC 6749 §4.4) and client metadata on the RFC 7591-shaped client record. "Service account" is the product name for that principal; `id` admin UI may present these clients under a "Service Accounts" label (the system tier) and under an organization's applications (the tenant tier), but both are the same `oauthClient` entity differentiated by `referenceId`.

The tier is fixed at creation and immutable: `oauth-m2m-bridge` rejects any `update-client` that changes `referenceId` for a `client_credentials` client. A service account never migrates between system and organization tiers; relocation means creating a new client and migrating its bindings (doc 018 §5.5 D5).

### 4.3 The Scope Catalog: Three Roles On The Platform Plane

The scope catalog is a first-class component of platform access control, not a display surface. It has three roles:

1. **Permission catalog.** `oauthResourceScope` rows define which scopes exist per resource server — the vocabulary of what a token may carry. `oauthClientResourceScope` rows (the M2M binding) define which service account may request which of those scopes on which resource.
2. **Better Auth runtime prefill.** The catalog is injected into `oauthProvider({ scopes, validAudiences })` at construction. A scope or audience that is not in the catalog does not exist at runtime; the catalog, not source code, decides what `id` will issue.
3. **Tier classifier.** Each row's `system` flag (derived from the resource server's `organizationId IS NULL`) is the authority that drives the infra-vs-tenant issuance gate.

Because the catalog is the issuance authority, scopes must remain **coarse, audience-level capabilities** (for example `content:read`, `content:write`, `content:share`). The moment a scope names a resource object or mirrors a resource server's fine-grained permission, the catalog has crossed into resource access control (see [7](#7-the-boundary-with-resource-access-control)).

### 4.4 The System Tier Is The Confidential id-To-Client Machine Plane

The system tier is where `id` exposes its own operations to resource servers as confidential machine APIs. An infra service account is the credential a resource server holds to call them. The current system-tier surfaces are:

- **SCIM directory** (`/scim/v2/*`, RFC 7644 read/query) — exact-ID principal validation, `aud = {id}/system`, `scope = identity:directory:read`.
- **OAuth client-picker** (`/api/auth/admin/oauth-clients/lookup`) — read client metadata + issuance eligibility, `aud = {id}/system`, `scope = oauth:clients:read`.
- **Token introspection** (`/oauth2/introspect`, RFC 7662, Better Auth-native) — token-active assertion; client-authenticated.

These are `id`-owned operations: "does this principal exist," "what is this client's metadata," "is this token still active." They are not resource decisions. A resource server uses them to make its own authorization durable and correct, then decides object access itself.

### 4.5 Two Confidential Channels, Two Infra Service Accounts

The directory channel and the introspection channel are deliberately separate credential pairs, and `031` keeps them so:

| Channel | Purpose | Auth to `id` | Audience / scope | Used by `content-api` for |
|---|---|---|---|---|
| Directory validation | Confirm exact principal/client IDs at write time | `client_credentials` token, then Bearer | `aud = {id}/system`, `scope = identity:directory:read oauth:clients:read` | durable IAM references (SCIM + picker) |
| Token-active assertion | Confirm a presented user token is not revoked | RFC 7662 client authentication (HTTP Basic) | introspection endpoint; client-authenticated | sensitive Content IAM mutations |

Keeping two credential pairs is least-privilege separation, not redundancy: the directory credential carries directory-read authority on the system audience and would, if leaked, expose principal enumeration; the introspection credential only authenticates a client to the introspection endpoint and exposes only token-status lookups. Different purposes, different blast radius, different rotation cadence. New confidential channels should follow the same rule: one infra service account per purpose, scoped to that purpose.

### 4.6 Cross-Tier Enforcement And Principal Integrity

Two invariants keep the tiers from leaking, both already implemented and retained:

- **Issuance gate** (`oauth-provider.ts`): an infra client (`referenceId === null`) requesting a tenant audience, or a tenant client requesting a system audience, is rejected with `invalid_scope` at the token endpoint. The check is re-evaluated at issuance even if persisted data bypassed a structural write guard (doc 018 §5.5 D7).
- **Tier immutability** (`oauth-m2m-bridge`): `referenceId` cannot change on a `client_credentials` client, so a principal cannot be quietly moved between tiers after bindings exist.

### 4.7 Default System Scope Catalog And Seed

`validAudiences` and `scopes` are built only from enabled DB rows: `loadResourceServerAudiences` runs `select "audience" from resourceServer where enabled` and `loadOAuthResourceScopes` reads the scope rows. Nothing injects the system tier implicitly — the `/system` audience is a config constant used by SCIM/picker for token *verification*, not for *issuance*. Consequence: on a fresh database `id` cannot issue any system-tier token, so the confidential id-to-client channels are dead until someone manually creates the system resource server and system scopes. That manual prefill is the gap this section closes.

`id` ships an idempotent **system access seed** that runs at bootstrap (alongside first-admin bootstrap) and ensures the system-tier catalog exists, derived entirely from existing config constants — no new hard-coded values, no hand-written SQL, no migration. It uses the resource-server and scope-catalog plugin operations and is safe to re-run:

```text
ensureSystemAccessCatalog():
  resourceServer  { audience: systemResourceServerAudience(BETTER_AUTH_URL),   // {base}/system
                    organizationId: null, slug: "system", name: "id system", enabled: true }
  oauthResourceScope { resourceServerId: <system>, scope: scimDirectoryScope }           // identity:directory:read
  oauthResourceScope { resourceServerId: <system>, scope: systemOAuthClientPickerScope }  // oauth:clients:read
  -> then invalidate the audience cache and scope cache
```

The seed is idempotent on the existing uniqueness keys (`audience` unique on `resourceServer`; `(resourceServerId, scope)` unique on `oauthResourceScope`), so re-running it is a no-op once the rows exist. Tables still come from plugin schema and `pnpm db:generate`; the seed only inserts rows through plugin operations.

What the seed does **not** create, by decision:

- **Infra service-account clients** (the SCIM/directory and introspection credentials a resource server like `content-api` holds). Their `client_id`/`client_secret` are per-deployment and generated at provisioning, then distributed to the consumer (`content-api`'s `ID_SCIM_CLIENT_*` and `ID_INTROSPECTION_CLIENT_*`). Hard-coding client ids/secrets is forbidden (repo rule 5), so these are created as an explicit provisioning step, not seeded.
- **M2M bindings** (`oauthClientResourceScope`) for those clients. They are created when the infra client is provisioned, binding it to the seeded system scopes.

Result: a fresh database is *issuable* the moment an infra service account is provisioned and bound — the catalog half is already there from the seed, and no operator has to hand-build the system resource server or system scopes.

### 4.8 The Console Access Section

The platform-access surfaces are consolidated into one console **Access** section under the [docs/028](028_tenant-scoped-platform-experience.md) shell, for both human and machine actors. This refines 028 §7.3/§7.4, which scattered them across **System** (Service Accounts) and **OAuth** (Resource APIs, Scope Catalog, M2M Bindings). Client-facing **Applications** (the OAuth apps users authorize through the authorization-code flow) stay their own section; **Access** owns the IAM model — the principals, the catalog, and the bindings.

Platform lens — Access section items (`/admin/platform/access/*`):

```text
Access
  Admins & Roles      human principals holding platform/org admin authority;
                      today a derived view of role=admin + org owner/admin;
                      future home for delegated roles (028 §8.10)
  Service Accounts    machine principals (oauthClient w/ client_credentials),
                      grouped by tier (system/infra vs org/tenant); shows tier,
                      bindings, and which confidential channels each one serves
  Resource APIs       resource-server registrations (audiences)
  Scope Catalog       scopes per resource server, each with a System/Tenant tier badge
  M2M Bindings        oauthClientResourceScope: which service account may request
                      which scopes on which resource
```

Organization lens — Access section items (`/admin/orgs/:orgId/access/*`): Service Accounts (tenant), Resource APIs, Scope Catalog, and M2M Bindings, all org-filtered. Human org-admin management stays under Identity → Members (it is membership, not a separate Access screen).

Screen sketches:

```text
Access overview (platform)
+------------------------------------------------------------------+
| Access                                                           |
| Admins & Roles    3 platform admins                  Manage      |
| Service Accounts  2 system · 5 tenant                Manage      |
| Resource APIs     4 (1 system, 3 tenant)             Manage      |
| Scope Catalog     11 scopes                           Manage      |
| M2M Bindings      9 bindings                          Manage      |
+------------------------------------------------------------------+

Service account detail
+------------------------------------------------------------------+
| id system directory          [System]  cli_dir_a1b2…             |
| grant_types: client_credentials                                  |
| Tier: System (referenceId = null)                                |
| Confidential channel: SCIM directory + client-picker (/system)   |
| Bindings                                                         |
|   /system   identity:directory:read  oauth:clients:read          |
+------------------------------------------------------------------+

Scope catalog (tier-aware)
+------------------------------------------------------------------+
| Scope Catalog                                                    |
| identity:directory:read   id system           [System]          |
| oauth:clients:read        id system           [System]          |
| content:read              Content API         [Tenant]          |
| content:write             Content API         [Tenant]          |
+------------------------------------------------------------------+
```

Routing follows the 028 URL scheme; the existing `/admin/oauth/{scope-catalog,resource-apis,m2m-bindings}` and System → Service Accounts screens migrate (with redirects) under `/admin/platform/access/*` and `/admin/orgs/:orgId/access/*`. Per the admin UI hard gate, screen-spec entries in `workers/ui/docs/screens/` precede any new route file; this section is the proposal those specs draw from.

> Deferred (intentional): the **Admins & Roles** screen is the only Access item not fully specified here. Its v1 is a read-only derived view — list the principals holding platform authority (`user.role === "admin"`) and, per org, the owner/admin members (`hasOrganizationAccess`) — with no role-management UI. Full role/delegation management (creating roles, binding principals to resource scopes) is the delegated-admin model in [8.10] / [docs/028 §8.10](028_tenant-scoped-platform-experience.md), and ships only when a concrete partial-admin requirement exists. Spec the concrete screen (derived-view v1 + the delegated-roles growth path) as its own follow-up before implementing this nav item; do not invent a management UI ahead of the delegated-admin decision.

### 4.9 Access API Surface

The Access section composes existing plugin endpoints — this model proposes no new admin endpoints. Every endpoint below is gated by platform access control ([4.1](#41-the-two-tier-two-principal-kind-matrix)): system-tier rows require platform admin; org-tier rows require platform admin or the org's owner/admin (or, for issuance, the bound service account).

| Access concept | Endpoints | Owner |
|---|---|---|
| Operable tiers (the actor's scopes) | `GET /api/auth/admin/console-scopes` | console-scopes plugin (028 §8.2) |
| Resource APIs | `POST/GET /api/auth/admin/resource-servers`, `GET/PATCH /…/:id`, `POST /…/:id/{disable,enable}` | resource-server plugin |
| Scope catalog (permissions) | `POST/GET /api/auth/admin/oauth-scopes`, `PUT/DELETE /…/:id` | scope-catalog plugin |
| M2M bindings (grants) | `POST/GET /api/auth/admin/oauth-client-resource-scopes`, `PUT/DELETE /…/:id` | scope-catalog plugin |
| Service accounts (machine principals) | Better Auth OAuth Provider client endpoints (create/get/update/delete/rotate-secret), filtered to `client_credentials`; org tier via the active-org bridge (028 §8.5) | OAuth Provider + `oauth-m2m-bridge` |
| Admins & Roles (human principals) | Better Auth admin role + organization membership endpoints; delegated roles deferred to 028 §8.10 | admin plugin / organization plugin |

The **confidential id-to-client channels** are consumed by resource servers, not by the Access UI, and are listed here only for completeness: SCIM `/scim/v2/*` and client-picker `GET /api/auth/admin/oauth-clients/lookup` (both `aud = {base}/system`), and introspection `POST /oauth2/introspect` (RFC 7662, client-authenticated). The system access seed ([4.7](#47-default-system-scope-catalog-and-seed)) is an internal bootstrap routine, not a public endpoint.

## 5. Standards And Capability Classification

| Mechanism | Classification | Role in platform access control |
|---|---|---|
| OAuth `client_credentials` (RFC 6749 §4.4) | Protocol standard | The runtime credential for every machine principal (service account). |
| OAuth client metadata (RFC 7591) | Protocol standard | The service-account record shape. `referenceId` (tier ownership) is a Better Auth extension, not standard metadata. |
| OAuth token introspection (RFC 7662) | Protocol standard | The token-active assertion channel; client-authenticated. Better Auth-native. |
| OAuth resource indicator / `aud` (RFC 8707 / RFC 9068) | Protocol standard | The system vs tenant audience that pins a token to `id`'s own APIs or to a tenant resource. |
| SCIM Users/Groups (RFC 7644) | Interoperability standard | The directory validation channel (system tier, read/query). |
| `oauthClient.referenceId` tier ownership | Better Auth-supported capability | The system/tenant tier marker for machine principals. |
| Scope catalog (`oauthResourceScope`, `oauthClientResourceScope`) | Repository-specific extension | The permission catalog, BA prefill, and tier classifier for the platform plane. |
| `isPlatformAdmin` / `hasOrganizationAccess` | Repository-specific authority primitives | The human authority sources for the two tiers. |
| Infra service account as confidential id-to-client identity | Established industry pattern (service account / service role) | The machine identity binding `id` to a resource server for `id`-owned operations. |
| A central policy engine / ReBAC inside `id` | Inappropriate workaround | Rejected. Resource policy belongs to resource servers; see legacy `auther` anti-pattern in [docs/030 §4.5](030_client-initiated-registration-and-onboarding.md). |

## 6. Architecture Decisions

### D1. Platform Access Control Is The IdP's Concern; Resource Access Control Is Not

Recommended: `id` owns authority over its own control plane and its own confidential machine APIs; resource servers own object-level authorization. Rejected: pulling resource decisions into `id`. Reasoning: `id` is the credential-issuance and self-administration plane, not a policy-decision point. The boundary is the load-bearing invariant of the whole system ([7](#7-the-boundary-with-resource-access-control)).

### D2. Two Tiers, Parallel For Human And Machine

Recommended: model one matrix of {system, organization} × {human, machine}. Rejected: separate models for admins, M2M, and console. Reasoning: the same tiered authority rule already underlies every `authorize()` callback and the M2M issuance gate; naming it once removes duplication and gives 028/029/030 a shared contract.

### D3. Service Accounts Are OAuth Clients, Not A New Table

Recommended: a service account is an `oauthClient` with `client_credentials`, owned by `referenceId`; "service account" is a presentation name. Rejected: a dedicated service-account entity, or modeling service accounts as SCIM resources. Reasoning: keeps runtime access on the standard client-credentials path and metadata on the RFC 7591 record, consistent with docs 017/018; SCIM stays a directory read/query contract, not a service-account store.

### D4. The Scope Catalog Is Runtime-Authoritative, Not A Display Table

Recommended: treat the scope catalog as the source that prefills Better Auth (`scopes`, `validAudiences`) and classifies tier (`system` flag). Rejected: hard-coding scopes/audiences in source, or treating the catalog as admin-only UI state. Reasoning: the code already injects it into the provider; documenting this prevents future hard-coding and keeps the no-hard-config rule intact.

### D5. One Infra Service Account Per Confidential Channel

Recommended: distinct credential pairs per purpose (directory validation vs token introspection), each least-privilege. Rejected: a single all-powerful infra credential. Reasoning: separation limits blast radius and rotation coupling; `content-api` already runs this way with `ID_SCIM_*` and `ID_INTROSPECTION_*`.

### D6. Introspection Is Better Auth-Native RFC 7662, Client-Authenticated

Recommended: use the native `/oauth2/introspect` endpoint; the caller authenticates as a client; resource servers use it for token-active assertion on sensitive writes. Rejected: a custom token-status API, or exposing session/token internals. Reasoning: RFC 7662 is the standard; Better Auth implements it; `content-api` already depends on it for revocation-aware sensitive mutations.

### D7. Coarse-Scope Bright Line

Recommended: `id` scopes are coarse, audience-level capabilities. Rejected: object-level or resource-permission-mirroring scopes (for example `content:book:update` or anything naming an object id). Reasoning: fine-grained object scopes would encode a resource server's model in `id` and break D1. The scope catalog is the place this line is most likely to erode, so it is stated as a hard rule.

### D8. Keep Authority As Functions; Do Not Build A Policy Engine

Recommended: authority stays as explicit checks (`isPlatformAdmin`, `hasOrganizationAccess`, the issuance gate), optionally consolidated into one module with shared names. Rejected: a CEL/ReBAC policy runtime in `id`. Reasoning: the legacy `auther` service built exactly this (client-asserted tuples, an in-IdP policy engine) and it is the documented anti-pattern. Centralizing the model is naming and consolidation, not a new engine.

## 7. The Boundary With Resource Access Control

`id` and a resource server cross only through tokens (read-only claims), the confidential id-to-client channels (directory validation, token-active assertion), and the scope contract. They never share a database, a policy store, or a decision.

`content-api`'s Content IAM is the canonical resource-access-control plane and already encodes this: it owns content permissions, roles, policy bindings, policy denials, resource hierarchy, and the final `ContentPolicy.can(...)` decision; it stores bindings locally, not in `id` (its Decision 5.3); and it states the line directly — *"`id` never decides whether `user_x` may update `book_y`; `content-api` never decides whether `user_x` is in `org_y`."*

The seam is healthy and must stay coarse:

- `id` issues `content:write` (a capability the token may carry, per the scope catalog) and answers "does this principal exist / is this token active." That is platform access control.
- `content-api` decides `book.update` on `book_y` using its own roles and bindings. That is resource access control.

The boundary leaks only if `id` scopes start naming objects (forbidden by D7) or if a resource decision is pushed into `id` (forbidden by D1). The legacy `auther` service violated both — it let clients assert authorization tuples at signup and ran a policy engine inside the IdP — and is recorded as the anti-pattern in [docs/030 §4.5](030_client-initiated-registration-and-onboarding.md).

## 8. GCP And AWS IAM Mapping

The IAM analogy is a naming and mental-model anchor for the platform plane, not a mandate to build an IAM engine in `id`.

| `id` concept | GCP analog | AWS analog |
|---|---|---|
| Infra service account (system tier) | Service account a service uses to call Google APIs | Service role / service-linked role |
| Tenant service account (org tier) | Project-scoped service account | IAM role scoped to a resource/account |
| System tier vs organization tier | Organization/folder vs project | Account-level vs resource-scoped roles |
| Scope catalog (coarse capabilities) | OAuth API scopes a service exposes | Coarse service action classes |
| `/system` audience + confidential channels | Calling Google's own admin/directory APIs | Calling an AWS service's control APIs |
| Token introspection (token-active) | Token/credential validity check | STS/credential validity check |
| Resource access control (out of scope) | A service's own resource IAM policy | A service's resource-level policy |

The precise fit: `id` is the AWS **IAM-principals + STS credential-issuance** layer plus the GCP **service-account + "may this principal call this API"** binding. The resource-level policy layer — what GCP/AWS centralize per resource — is, in this architecture, the resource server's own concern (Content IAM). `id` deliberately stops at "who you are, what your token may carry, is it active, does the principal exist."

## 9. How 028, 029, And 030 Attach To This Model

This model is canonical for the access concern; the other proposals express their authority in its terms:

- **[docs/028](028_tenant-scoped-platform-experience.md)** — the console's `ConsoleScope`/`ConsolePermission` model is the human-facing projection of the two tiers. "Operable scope" = a tier on which the actor holds authority; platform scope = system tier; org scope = organization tier. The unified **Access section** ([4.8](#48-the-console-access-section)) is this model's console home; it refines 028 §7.3/§7.4 by grouping the access surfaces (admins/roles, service accounts, resource APIs, scope catalog, M2M bindings) in one place instead of scattering them under System and OAuth. The future delegated-admin plugin (028 §8.10) adds finer human authority within the same matrix. Step-up (028 §8.8) attaches to entering the system tier and to sensitive system-tier actions.
- **[docs/029](029_account-center-and-self-service-identity.md)** — the account organizations endpoint reports which organization tiers a human can operate (`canOpenConsole`), computed from the same `hasOrganizationAccess` authority. Account self-service never grants platform-tier authority.
- **[docs/030](030_client-initiated-registration-and-onboarding.md)** — registration policy administration is a system/organization-tier admin action; `defaultRole`/`defaultTeamIds` are server policy (organization-tier grants), never client-asserted. The coarse-scope bright line (D7) is the same rule that keeps registration scope narrowing standard.

A consistent consequence: machine principals are first-class here. A future admin surface for service accounts, and any new confidential id-to-client channel, slot into the system or organization tier of this matrix rather than inventing a new model.

## 10. Edge Cases And Failure Modes

- Infra service account requests a tenant audience (or vice versa): rejected at the token endpoint with `invalid_scope` ([4.6](#46-cross-tier-enforcement-and-principal-integrity)).
- Attempt to relocate a service account by changing `referenceId`: rejected by `oauth-m2m-bridge` with `409`.
- A scope is defined in the catalog but its resource server is disabled: the runtime catalog excludes it, so `id` will not mint it even if a client is still bound.
- A scope-catalog row names an object or fine-grained resource permission: a D7 violation; reject in review and (where feasible) validate scope strings remain coarse capability classes.
- Leaked directory credential vs leaked introspection credential: blast radius differs by design ([4.5](#45-two-confidential-channels-two-infra-service-accounts)); rotate independently.
- Introspection used as a profile/directory lookup: wrong channel; introspection returns token-active status only (RFC 7662), directory facts come from SCIM.
- A resource server tries to ask `id` for an object decision: not a supported channel; `id` exposes principal existence, client metadata, and token status only (D1).
- Human platform admin acting through an organization tier: authority is platform-admin (system tier) even while operating an org lens; audit records both facts (028 §8.9).
- Hard-coded scope/audience/client appears in source: rejected; the scope catalog and resource-server rows are the runtime source of truth (D4).

## 11. Consolidation Touchpoints

This document mostly names existing behavior. The optional consolidation, kept deliberately small, is to give the scattered authority one shared expression:

- Introduce a single named authority helper (for example `resolvePlatformAuthority(role, { organizationId, adapter, userId })`) in `workers/core/src/auth/policies/access.ts` that returns the tier authority, and have the plugin `authorize()` callbacks in `get-auth.ts` call it instead of re-inlining the `organizationId == null ? ...` shape.
- Keep `isPlatformAdmin` / `hasOrganizationAccess` as the primitives the helper composes; do not change their behavior.
- Document the scope catalog's runtime-prefill and tier-classifier roles in `oauth-scope-catalog/README.md`, and the coarse-scope bright line (D7) where scope rows are created.
- Document the two-channel infra-service-account model and the per-channel credential rule (D5) in `oauth-client-picker/README.md` and the SCIM/introspection-facing docs so consumers provision separate credentials by default.

No schema changes, no new tables, no `pnpm db:generate`. If a future delegated-admin model (028 §8.10) lands, it composes through the same helper and tier matrix.

## 12. Test And Verification Plan

Existing enforcement that this model relies on (must stay green): the infra-vs-tenant issuance gate tests, `referenceId` immutability (`oauth-m2m-bridge`) tests, scope-catalog runtime-prefill and client-resource-scope tests, SCIM/client-picker system-audience and `404` cross-org-leak tests, and the M2M token-issuance claim tests (`org_id` present only for tenant clients, `client_id` mirror present for machine tokens).

If the consolidation in [11](#11-consolidation-touchpoints) is implemented:

- Unit-test `resolvePlatformAuthority` for the four matrix cells (system/org × human/machine) plus the deny cases, and assert each migrated plugin `authorize()` delegates to it.
- Assert no behavior change against the existing plugin authorization tests (the helper must be a pure refactor of the duplicated checks).

Docs-only verification for this document: README Contracts list includes it; no unresolved placeholders; no manual prose hard-wrap; cross-references to 018/028/029/030 resolve.

## 13. Definition Of Done

- `id` has one documented platform access-control model: two tiers (system/platform, organization) and two principal kinds (human, machine) in a single matrix.
- "Service account" is defined once as an `oauthClient` with `client_credentials` owned by `referenceId`, with the system/tenant tier fixed and immutable.
- The scope catalog is documented as the runtime-authoritative permission catalog, Better Auth prefill, and tier classifier, with the coarse-scope bright line stated where scopes are created.
- The system tier is documented as the confidential id-to-client machine plane, with the two-channel model (directory validation via SCIM/picker on `/system`; token-active assertion via RFC 7662 introspection) and the per-channel infra-service-account credential rule.
- A fresh database is issuable without manual prefill: the idempotent system access seed ensures the `/system` resource server and the system scopes from config constants, and infra service-account clients are provisioned (not seeded) per deployment.
- The platform-access surfaces are presented as one console Access section (admins/roles, service accounts, resource APIs, scope catalog, M2M bindings) for human and machine actors, refining the 028 nav, with the Access API surface mapped to existing plugin endpoints (no new admin endpoints).
- The boundary with resource access control is stated and matches `content-api` Content IAM; the legacy `auther` design is referenced as the anti-pattern.
- 028, 029, and 030 are shown to express their authority in this model's terms.
- If consolidation lands, the duplicated `authorize()` checks call one shared authority helper with no behavior change, and all existing enforcement tests stay green.
- README Contracts is updated; no schema migration is introduced by this document.

## 14. Final Model

`id`'s access surface is one model with two tiers and two principal kinds. The system/platform tier is operated by platform admins (human) and infra service accounts (machine); the organization tier by org owners/admins (human) and tenant service accounts (machine). The genuinely load-bearing, previously-undocumented part is the machine column: an infra service account is the confidential identity that binds `id` to a resource server for `id`-owned operations, and `content-api` already runs two such channels — directory validation over SCIM/client-picker on the `/system` audience, and token-active assertion over Better Auth's native RFC 7662 introspection — with a separate least-privilege credential pair for each. The scope catalog is the runtime-authoritative permission catalog and the tier classifier that prefills Better Auth, and it must stay coarse. None of this is resource authorization: `id` issues identity, credentials, and coarse capabilities and answers existence/metadata/token-status; the resource server (Content IAM) decides what a token-holder may do to an object. That boundary, and the rejection of an in-IdP policy engine, is what keeps `id` a standards-based authorization server rather than the scattered, custom thing the legacy `auther` service became.
