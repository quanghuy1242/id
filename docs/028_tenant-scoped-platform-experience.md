# Tenant-Scoped Platform Experience And Delegated Administration

> Status: implementation-grade research and proposal
>
> Date: 2026-05-31
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — `core-id` authorization server and `ui-id` hosted console
> - `workers/ui/src/app/admin/**` — current management console
> - `workers/ui/src/proxy.ts` — console entry gate
> - `workers/ui/src/shared/constants.ts` — static admin navigation
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
> - Google Cloud resource hierarchy: <https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy>
> - Google Cloud IAM overview: <https://cloud.google.com/iam/docs/overview>
> - Google Cloud console resource/project selector: <https://cloud.google.com/resource-manager/docs/creating-managing-projects>
> - Google Account vs Cloud Console split (myaccount): <https://support.google.com/accounts/answer/3024190>
> - Okta resource sets for custom admin roles: <https://help.okta.com/oie/en-us/content/topics/security/custom-admin-role/work-with-resource-set.htm>
> - Auth0 Organizations overview: <https://auth0.com/docs/organizations>
> - RFC 8707, OAuth 2.0 Resource Indicators: <https://www.rfc-editor.org/rfc/rfc8707>
> - RFC 9068, JWT Profile for OAuth 2.0 Access Tokens: <https://www.rfc-editor.org/rfc/rfc9068>
> - RFC 8414, OAuth 2.0 Authorization Server Metadata: <https://www.rfc-editor.org/rfc/rfc8414>
> - RFC 7591, OAuth 2.0 Dynamic Client Registration: <https://www.rfc-editor.org/rfc/rfc7591>
> - RFC 7644, SCIM 2.0 Protocol: <https://www.rfc-editor.org/rfc/rfc7644>
> - RFC 7662, OAuth 2.0 Token Introspection: <https://www.rfc-editor.org/rfc/rfc7662>
> - RFC 7009, OAuth 2.0 Token Revocation: <https://www.rfc-editor.org/rfc/rfc7009>
>
> Assumptions:
>
> - `id` remains one authorization-server deployment with one issuer. Organizations are tenant/workspace boundaries inside the deployment; they are not separate issuers.
> - The existing Better Auth organization plugin remains the source of truth for organizations, memberships, teams, and the session `activeOrganizationId` bridge.
> - The platform-admin role is `user.role === "admin"` through Better Auth's admin plugin. Organization administration is `member.role in ("owner", "admin")`.
> - The first implementation should not introduce a generic authorization engine, ReBAC, or CEL policy runtime. This document can describe the future shape, but first release uses the existing Better Auth roles and existing plugin-owned tables.
> - No public client id, client name, tenant allowlist, or tenant-specific behavior is hard-coded. Client, resource-server, scope, and organization behavior comes from database-backed rows or Better Auth state.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Recommendation](#2-recommendation)
- [3. Vocabulary](#3-vocabulary)
- [4. Current-State Findings](#4-current-state-findings)
  - [4.1 Worker And UI Boundaries](#41-worker-and-ui-boundaries)
  - [4.2 Existing Organization And Token Context](#42-existing-organization-and-token-context)
  - [4.3 Existing Console Shape And Entry Gate](#43-existing-console-shape-and-entry-gate)
  - [4.4 Existing Authorization Capability](#44-existing-authorization-capability)
  - [4.5 Existing Endpoint Scoping State](#45-existing-endpoint-scoping-state)
- [5. External Findings](#5-external-findings)
- [6. Standards And Capability Classification](#6-standards-and-capability-classification)
- [7. Target Product Model](#7-target-product-model)
  - [7.1 Two Shells, One Nav Definition](#71-two-shells-one-nav-definition)
  - [7.2 The Scope Selector](#72-the-scope-selector)
  - [7.3 The Unified Navigation Definition](#73-the-unified-navigation-definition)
  - [7.4 Rendered Lenses](#74-rendered-lenses)
  - [7.5 Persona To Surface Mapping](#75-persona-to-surface-mapping)
  - [7.6 Tenant-Scoped Data Rules](#76-tenant-scoped-data-rules)
- [8. API And Technical Design](#8-api-and-technical-design)
  - [8.1 Console Scope Contract](#81-console-scope-contract)
  - [8.2 Scope Discovery Endpoint](#82-scope-discovery-endpoint)
  - [8.3 URL-Owned Scope](#83-url-owned-scope)
  - [8.4 Navigation Rendering Contract](#84-navigation-rendering-contract)
  - [8.5 Better Auth Active Organization Bridge](#85-better-auth-active-organization-bridge)
  - [8.6 Typed UI Action Contracts](#86-typed-ui-action-contracts)
  - [8.7 Server-Side Authorization And Scoping](#87-server-side-authorization-and-scoping)
  - [8.8 Step-Up On Sensitive Scopes And Actions](#88-step-up-on-sensitive-scopes-and-actions)
  - [8.9 Audit Model](#89-audit-model)
  - [8.10 Future Delegated Administration](#810-future-delegated-administration)
- [9. Surface And UI Proposals](#9-surface-and-ui-proposals)
  - [9.1 Shell And Topbar](#91-shell-and-topbar)
  - [9.2 Dashboard](#92-dashboard)
  - [9.3 Identity](#93-identity)
  - [9.4 OAuth Applications](#94-oauth-applications)
  - [9.5 Resource APIs, Scopes, And M2M Bindings](#95-resource-apis-scopes-and-m2m-bindings)
  - [9.6 Security, Sessions, Tokens, Consents, And JWKS](#96-security-sessions-tokens-consents-and-jwks)
  - [9.7 System](#97-system)
- [10. Architecture Decisions](#10-architecture-decisions)
- [11. Migration And Rollout](#11-migration-and-rollout)
- [12. Edge Cases And Failure Modes](#12-edge-cases-and-failure-modes)
- [13. Test And Verification Plan](#13-test-and-verification-plan)
- [14. Implementation Phases](#14-implementation-phases)
- [15. Definition Of Done](#15-definition-of-done)
- [16. Final Model](#16-final-model)

## 1. Goal

Define how the hosted `ui-id` console should work when the signed-in user is not a platform administrator, or when a platform administrator wants to operate inside one organization. The naive answer — add an organization dropdown to a platform-only console — produces three divergent navigation trees (platform admin, organization admin, ordinary member), roughly triples UI surface area, and gives two different experiences for the same task (a platform admin picks an org from a global list and drills in, while an org admin of several orgs uses a separate context picker).

This document adopts the Google Cloud console model instead. There is one operator console with one navigation definition. A scope selector at the top chooses what that navigation operates on, and the actor's role on the selected scope decides what is visible. Administration is not a separate identity or a separate application; it is a set of roles on a selected scope. Self-service identity ("manage my own account") is a separate surface, exactly as Google separates the Cloud console from the Google Account page. That self-service surface is specified in [docs/029](029_account-center-and-self-service-identity.md); this document is canonical for the console model and the scope/permission contract that 029 and [docs/030](030_client-initiated-registration-and-onboarding.md) consume.

Non-goals:

- Do not create one Cloudflare Worker, D1 database, issuer URL, JWKS set, or Better Auth instance per organization.
- Do not maintain separate hand-authored navigation trees per persona.
- Do not invent custom OAuth logout, token revocation, or token propagation mechanics.
- Do not move resource-API authorization decisions into `id`.
- Do not treat SCIM as the service-account model. SCIM remains Users/Groups directory read/query; OAuth clients remain OAuth clients.
- Do not implement broad custom delegated-admin tables until the product needs partial administration beyond platform admin and Better Auth organization owner/admin.

## 2. Recommendation

Build one operator console with a Google-Cloud-style scope selector, plus a separate self-service account surface.

There are two shells:

| Shell | Route family | Audience | Entry rule |
|---|---|---|---|
| Console | `/admin/platform/**`, `/admin/orgs/:orgId/**` | Anyone holding at least one operable scope | Has `≥1` operable scope (platform role or org owner/admin on any org) |
| Account | `/account/**` | Every signed-in user | Always (specified in [docs/029](029_account-center-and-self-service-identity.md)) |

The Console renders one navigation definition through two lenses:

- Platform lens, selected scope = `platform`, available only to platform admins, shows issuer-wide surfaces.
- Organization lens, selected scope = `organization:<orgId>`, available to platform admins and to org owners/admins, shows that organization's surfaces only.

The scope selector at the top of the console is the primary navigation affordance. It lists every operable scope uniformly at any scale: "Platform / All organizations" (only when the actor holds the platform role) and each organization where the actor is owner/admin. Selecting a scope navigates; it does not mutate hidden global state. Switching from 1 org to 50 orgs is the same control with more entries. There is no separate "select context" page and no platform-only "global list then drill" flow.

The route path owns the active scope. The server verifies the actor's authority for the requested scope on every request and filters every row server-side. UI scope is navigation and cache identity, never a trust boundary.

Administration is roles-on-scope, not a separate login. The console entry gate changes from "is this user a platform admin" to "does this user hold any operable scope." A user with no operable scope is sent to the Account shell, never to a half-empty console. Step-up authentication (the admin OTP from [docs/024](024_admin-login-context-guard.md)) is reframed to attach to sensitive scopes and actions rather than to an admin persona (see [8.8](#88-step-up-on-sensitive-scopes-and-actions)).

## 3. Vocabulary

Deployment tenant: the whole `id` deployment, issuer, D1 database, JWKS set, and admin control plane. Closest to a Google Cloud Organization root or an Okta org.

Organization tenant: a Better Auth organization inside the `id` deployment. Closest to an Auth0 Organization, a Google Cloud project, or a B2B customer workspace. It is the unit a non-platform admin operates.

Console: the single operator surface under `/admin/**`. One navigation definition, scope-selected, permission-gated. Analogous to the Google Cloud console.

Account: the separate self-service surface under `/account/**`. Analogous to the Google Account page. Specified in [docs/029](029_account-center-and-self-service-identity.md).

Scope: the resource the console currently operates on. Either `platform` (the issuer/deployment) or `organization:<orgId>` (one tenant). Equivalent to the Google Cloud "current project/organization" selection.

Operable scope: a scope on which the actor holds a management role. Platform admins have the platform scope plus every organization scope. Org owners/admins have only the scopes for their organizations.

Lens: a rendering of the single navigation definition filtered to one scope and the actor's permissions on it. The platform lens and organization lens are two outputs of the same definition, not two definitions.

Scope selector: the topbar control that lists operable scopes and switches the console between them.

Platform admin: Better Auth admin role on `user.role` (`user.role === "admin"`).

Organization admin: Better Auth organization membership role `owner` or `admin`.

Step-up: re-authentication or OTP required for sensitive scopes/actions, not for a persona. Replaces "admins always OTP."

Delegated admin: a future user, group, or OAuth client with a custom role over a constrained resource set. A Google-Cloud-IAM-style or Okta-resource-set-style model, deferred until owner/admin is too coarse.

## 4. Current-State Findings

### 4.1 Worker And UI Boundaries

The repo topology already fits this change. `core-id` owns Better Auth, OAuth, D1/KV, JWKS, SCIM, admin APIs, and plugin schemas. `ui-id` owns hosted pages and admin presentation. Workers must not import each other; shared contracts live in `packages/lib`.

The existing admin UI rules carry over unchanged: route files under `workers/ui/src/app/admin/**` are composition boundaries, they use `@idco/ui` primitives rather than raw markup, content components fetch via SWR, `/api/auth` calls go through `@idco/lib` helpers (`authApiGetOrThrow`, `authApiPostOrThrow`), and a new `/admin` route needs a screen spec entry in `workers/ui/docs/screens/<section>.md` before implementation. The one-console model reuses all of these; it changes information architecture and authorization, not the UI architecture.

### 4.2 Existing Organization And Token Context

The organization runtime model is already strong:

- `organization({ teams: { enabled: true } })` is registered in `workers/core/src/auth/get-auth.ts`.
- OAuth PostLogin context selection exists at `/select-authorization-context` and writes `workspace:<orgId>` or `direct-share` to KV for the authorization flow (`workers/core/src/auth/oauth-provider.ts`).
- `oauth-provider.ts` emits `org_id` and `team_ids` in user access tokens when a workspace context is selected.
- M2M clients are owned through `oauthClient.referenceId` via Better Auth's `clientReference` seam, documented in [docs/018](018_m2m-oauth-client-org-binding.md).
- Read-only SCIM exists for Users and Groups, including tenant paths, per [docs/017](017_scim-directory-and-m2m-principal-contract.md).

The missing piece is not "how do tokens know an org." It is "how does the console and every admin endpoint consistently operate through one selected scope when the actor is not global."

### 4.3 Existing Console Shape And Entry Gate

`workers/ui/src/shared/constants.ts` defines a single static, platform-oriented navigation: Dashboard; Identity (Users, Organizations); OAuth; Grants & Keys; System (Service Accounts, Issuer Metadata, SCIM Status, Health, Settings). `workers/ui/src/app/admin/_components/admin-nav.tsx` renders a static sidebar and a topbar with notifications, theme, and logout, with no scope selector or scope badge. `workers/ui/src/app/admin/layout.tsx` mounts the shell without fetching any scope context.

`workers/ui/src/proxy.ts` guards every `/admin` path by calling `/api/auth/get-session` and requiring `session.user.role === "admin"`. Organization owners/admins who are not platform admins are denied entry even though several core authorization hooks already permit org-scoped operations for them.

### 4.4 Existing Authorization Capability

The core already has the two role levels this model needs, in `workers/core/src/auth/policies/access.ts`:

- `isPlatformAdmin(role)` returns true only for `role === "admin"`.
- `hasOrganizationAccess(adapter, userId, organizationId)` returns true for membership roles `owner` or `admin`.

`get-auth.ts` already wires this dual check into `idResourceServer` and `idOAuthScopeCatalog` (`organizationId == null ? isPlatformAdmin(role) : isPlatformAdmin(role) || hasOrganizationAccess(...)`). `idAdminAudit` and `idAdminActivityLog` are platform-admin-only. So the server can already authorize a scope; the gap is purely that the console entry gate and navigation assume platform admin.

### 4.5 Existing Endpoint Scoping State

Current UI actions mix global and org-specific contracts:

- `workers/ui/src/app/admin/_actions/organizations.ts` already passes `organizationId` to Better Auth organization endpoints for detail/member/team/invitation operations.
- `workers/ui/src/app/admin/_actions/oauth.ts` lists clients via `/oauth2/get-clients` with no explicit organization parameter; ownership is resolved through session `activeOrganizationId` via `clientReference`.
- `listResourceServers`, `listScopes`, and `listBindings` call plugin admin list endpoints with no explicit scope parameter.
- Security aggregate actions are platform-oriented.

Implication: most plugin-owned endpoints become organization-scoped by adding an explicit `organizationId` filter, while OAuth client management depends on the Better Auth active-organization bridge ([8.5](#85-better-auth-active-organization-bridge)).

## 5. External Findings

Google Cloud is the primary model for this document. One console at `console.cloud.google.com` serves every user; the navigation menu is essentially constant. A resource selector (Organization → Folder → Project) chooses the current scope, and IAM roles on that scope decide what is visible and permitted. Administration is not a separate product or identity — any Google account can hold IAM roles. Whether a user manages one project or hundreds, the selector and navigation are identical; the experience scales uniformly. Sensitive operations trigger reauthentication/2-step verification, attached to the operation, not to an "admin account." Critically, Google keeps a *separate* surface for managing one's own identity (`myaccount.google.com`): profile, security, sessions, connected apps. That separation is the model for the `id` Account shell, and it is why collapsing administration into one console does not mean collapsing self-service into it too.

Okta and Auth0 remain useful secondary references. Okta's custom-role + resource-set model is a good future shape for partial delegated administration ([8.10](#810-future-delegated-administration)) and maps cleanly onto a Google-IAM-style roles-on-scope design. Auth0 Organizations are the closest near-term analogy to Better Auth organizations: B2B workspaces with membership and roles, where the Auth0 tenant remains the single issuer/control plane. Auth0 also warns against collapsing "tenant-member roles" and "organization-member roles" into one flag — the same warning applies here to platform admin versus organization admin.

Standards do not define an admin console or a scope selector; tenant choice is product behavior. The standards line stays on token issuance and verification: RFC 8707 resource indicators for audience selection (consider a tenant-specific resource URI only if a downstream API needs audience-level tenant separation), RFC 9068 for access-token claim shape (`org_id`/`team_ids` are documented extension claims, not OIDC standard claims), RFC 8414 issuer metadata (a scope selector must not imply a different issuer), RFC 7591 client metadata (organization ownership via `referenceId` is a Better Auth extension, not standard client metadata), RFC 7644 SCIM for directory read/query, and RFC 7662/7009 for introspection and revocation (a scope switch or consent revoke is not token revocation).

## 6. Standards And Capability Classification

| Mechanism | Classification | Use in this repo |
|---|---|---|
| OAuth authorization code + PKCE | Protocol standard | Keep for browser user authorization. |
| OAuth client credentials | Protocol standard | Keep for M2M and service-account runtime access. |
| OAuth `resource` parameter | Protocol standard, RFC 8707 | Keep for resource-server audience selection. |
| JWT `aud`/`scope`/`sub` | Protocol/profile standard, RFC 9068 | Keep as resource and scope authority. |
| JWT `org_id`/`team_ids` claims | Established industry pattern + repo-specific token contract | Keep as documented resource-server contract; not OIDC standard claims. |
| Better Auth `activeOrganizationId` + `clientReference` | Better Auth-supported capability | Use as the bridge for OAuth client ownership. Do not patch internals. |
| SCIM `/Users` and `/Groups` | Interoperability standard, RFC 7644/7643 | Keep for directory read/query. |
| Google Cloud console + scope selector | Established industry product pattern | The model for this document: one console, scope-gated. Repo-specific UI behavior, server-enforced. |
| Google Cloud IAM roles-on-resource | Established industry pattern | Future shape for delegated admin; implement only if owner/admin is too coarse. |
| Per-org issuer/JWKS/D1 | Deployment architecture option | Reject for now; disproportionate and not required by the current OAuth/resource model. |

## 7. Target Product Model

### 7.1 Two Shells, One Nav Definition

```text
┌─────────────────────────────────────┐    ┌────────────────────────────┐
│ CONSOLE  /admin/**                   │    │ ACCOUNT  /account/**        │
│ one navigation definition            │    │ separate shell (docs/029)   │
│                                      │    │ profile / security /        │
│   selected scope ──► lens            │    │ sessions / consents /       │
│   ┌──────────────┬──────────────┐    │    │ organizations               │
│   │ platform lens│ org lens      │   │    │                             │
│   └──────────────┴──────────────┘    │    │ entered by ANY signed-in    │
│                                      │    │ user                        │
│ entered only if ≥1 operable scope    │    │                             │
└─────────────────────────────────────┘    └────────────────────────────┘
```

The console is one app. The same navigation definition is rendered through whichever lens the selected scope produces. Platform-only items only appear at platform scope; organization-only items only appear at organization scope; shared items appear in both and are filtered server-side. Items the actor lacks permission for do not render at all — no greyed-out forbidden affordances.

### 7.2 The Scope Selector

The topbar leads with a scope selector, not a static product title:

```text
┌────────────────────────────────────────────────────────────────────┐
│ id   [ Acme Publishing ▾ ]                          [ ◐ ]   [ 𝗔 ▾ ] │
└────────────────────────────────────────────────────────────────────┘
           │                                                    │
           ▼                                                    ▼
  ┌──────────────────────────┐                 ┌──────────────────────────┐
  │ ⌂ Platform               │ ← only if        │ person@example.com        │
  │   All organizations      │   platform role  │ ─────────────────────────│
  │ ──────────────────────── │                  │ Account settings      →   │ → Account shell
  │ ORGANIZATIONS            │                  │ Sign out                  │
  │ • Acme Publishing  Owner │                  └──────────────────────────┘
  │ • Globex           Admin │
  │ ── memberships ───────── │ ← member-only orgs: link into Account,
  │   Initech (Member)       │   never an operable console scope
  └──────────────────────────┘
```

Behavior:

- Lists operable scopes uniformly. The platform entry appears only when the actor holds the platform role. Each organization where the actor is owner/admin appears with its role.
- Selecting a scope navigates to the equivalent route under that scope, preserving the section when an equivalent exists (see [8.3](#83-url-owned-scope)).
- Member-only organizations are shown as a hint that links into the Account shell's organizations page; they are never selectable console scopes.
- At exactly one operable scope, the selector still renders (showing that one scope) but no picker step is forced — the user lands directly in that scope's lens.
- The avatar menu is the bridge to the Account shell.

### 7.3 The Unified Navigation Definition

One definition, declared once. Each item carries the scope(s) it applies to, the permission it requires, and an `href` builder that is scope-relative. The renderer filters by `(selected scope, actor permissions)`. The **Access** section groups the platform-access surfaces (admins/roles, service accounts, resource APIs, scope catalog, M2M bindings) for both human and machine actors; it is specified in [docs/031 §4.8](031_platform-access-control.md), which is canonical for that model. Client-facing **Applications** (OAuth apps users authorize) stay their own section.

| Section | Item | Applies to | Required permission | Notes |
|---|---|---|---|---|
| Overview | Dashboard | platform + org | `platform:read` / org membership | Platform metrics at platform scope; org overview at org scope. One node, two data sources. |
| Identity | Users | platform | `platform:read` | Issuer-level subjects. No org equivalent. |
| Identity | Organizations | platform | `organizations:read` | Global org list. |
| Identity | Members | org | `members:read` | The org's people. A different resource than Users. |
| Identity | Teams | org | `members:read` | |
| Identity | Invitations | org | `members:write` | |
| Applications | Applications | platform + org | `oauth-clients:read` | Client-facing OAuth apps (authorization-code). Org scope filters to `reference_id == orgId`. |
| Access | Admins & Roles | platform + org | `platform:read` / `members:read` | Human principals holding admin authority; delegated role/binding state is visible through the plugin-owned base, while permission projection remains the activation follow-up ([8.10](#810-future-delegated-administration), [docs/031 §4.8](031_platform-access-control.md)). |
| Access | Service Accounts | platform + org | `oauth-clients:read` | Machine principals (`client_credentials`): system/infra tier at platform scope, tenant tier at org scope ([docs/031](031_platform-access-control.md)). |
| Access | Resource APIs | platform + org | `resource-servers:read` | Org scope filters to `organizationId == orgId`. |
| Access | Scope Catalog | platform + org | `resource-servers:read` | Org scope derives from org-owned resource servers; tier-aware ([docs/031 §4.8](031_platform-access-control.md)). |
| Access | M2M Bindings | platform + org | `resource-servers:read` | Org scope requires client and resource server both in org. |
| Security | Sessions | platform | `security-audit:read` | Org-scoped deferred until a bounded read model exists ([9.6](#96-security-sessions-tokens-consents-and-jwks)). |
| Security | Tokens | platform | `security-audit:read` | Same deferral. |
| Security | Consents | platform + org | `security-audit:read` | Org scope only if filterable by org-owned clients without user scans. |
| Security | Introspection | platform | `security-audit:read` | |
| Security | JWKS | platform | `jwks:read` | Keys belong to the issuer; never an org concept. |
| System | Issuer Metadata | platform | `system:read` | (Service Accounts moved to the Access section, [docs/031 §4.8](031_platform-access-control.md).) |
| System | SCIM Status | platform | `system:read` | |
| System | Health | platform | `system:read` | |
| System | Settings | platform | `system:write` | |
| Audit | Audit | platform + org | `security-audit:read` | Platform = all; org = org events. |

### 7.4 Rendered Lenses

Platform lens (selected scope = `platform`):

```text
OVERVIEW      Dashboard
IDENTITY      Users · Organizations
APPLICATIONS  OAuth apps
ACCESS        Admins & Roles · Service Accounts · Resource APIs · Scope Catalog · M2M Bindings
SECURITY      Sessions · Tokens · Consents · Introspection · JWKS
SYSTEM        Issuer Metadata · SCIM Status · Health · Settings
AUDIT         Audit
```

Organization lens (selected scope = `organization:org_acme`). Platform-only items simply do not render:

```text
OVERVIEW      Dashboard (org overview)
IDENTITY      Members · Teams · Invitations
APPLICATIONS  OAuth apps (reference_id == org)
ACCESS        Service Accounts · Resource APIs · Scope Catalog · M2M Bindings
SECURITY      Consents
AUDIT         Audit
```

A platform admin who selects an organization from the scope selector sees exactly the organization lens, so "support / see what an org admin sees" requires no extra code. An org owner/admin who never had platform access only ever sees this lens.

### 7.5 Persona To Surface Mapping

| Persona | Authority source | Operable scopes | Default surface | Console lenses available |
|---|---|---|---|---|
| Platform admin | `user.role === "admin"` | platform + every org | Console @ platform | platform lens; any org lens |
| Organization owner/admin | `member.role in ("owner","admin")` | those orgs | Console @ that org (direct if one, selector if several) | org lens(es) only |
| Organization member | `member.role === "member"` | none | Account shell | none |
| No-org signed-in user | session only | none | Account shell | none |
| Resource API service client | OAuth client credentials | none (no browser) | n/a | none |

The entry gate is "has `≥1` operable scope," computed by the scope discovery endpoint ([8.2](#82-scope-discovery-endpoint)). A user with zero operable scopes is redirected to `/account`, never to an empty console.

### 7.6 Tenant-Scoped Data Rules

Every list, detail, mutation, cache key, and audit event carries the active scope:

| Surface | Platform scope | Organization scope |
|---|---|---|
| Users | all users | not shown; use Members |
| Organizations | all orgs | the selected org overview only |
| Members/teams/invitations | any org | selected org only |
| OAuth clients | all clients | `reference_id == orgId` |
| Resource APIs | all resource servers | `organizationId == orgId`; system audiences (`organizationId == null`) hidden unless explicitly read-only |
| Scope catalog | all scopes | scopes whose resource server belongs to the org |
| M2M bindings | all bindings | bindings where client and resource server are in the org |
| Sessions/tokens | all rows | deferred until a bounded org-scoped read model exists |
| Consents | all rows | org-client consents only, if filterable without user scans |
| JWKS | platform only | hidden |
| SCIM status / system settings | platform only | hidden |

## 8. API And Technical Design

### 8.1 Console Scope Contract

Add shared types in `packages/lib/src/console-scope.ts`, exported from `packages/lib/src/index.ts`. These types are consumed by 029 (account organization links) and 030 (registration-policy scoping).

```ts
export type ConsoleScopeKind = "platform" | "organization";

export type ConsolePermission =
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

// A scope the actor can operate. Drives the scope selector and nav lens.
export type ConsoleScope = {
  readonly kind: ConsoleScopeKind;
  readonly id: "platform" | `organization:${string}`;
  readonly organizationId?: string;
  readonly label: string;                       // "Platform" or organization name
  readonly role: "platform-admin" | "owner" | "admin";
  readonly permissions: readonly ConsolePermission[];
  readonly requiresStepUp: boolean;             // entering this scope needs step-up (see 8.8)
};

// A membership the actor holds but cannot operate. Shown in the selector as a
// link into the Account shell, never as a selectable console scope.
export type ConsoleMembershipHint = {
  readonly organizationId: string;
  readonly label: string;
  readonly role: "member";
};

// The active scope resolved from the URL. Passed into actions and SWR keys.
export type ActiveScope =
  | { readonly kind: "platform" }
  | { readonly kind: "organization"; readonly organizationId: string };

export type ConsoleScopeEnvelope = {
  readonly actor: {
    readonly userId: string;
    readonly email?: string;
    readonly canEnterConsole: boolean;          // scopes.length > 0
  };
  readonly scopes: readonly ConsoleScope[];
  readonly memberships: readonly ConsoleMembershipHint[];
  readonly defaultScopeId: ConsoleScope["id"] | null; // null => send to /account
};
```

The contract is permission-oriented even though the first implementation derives permissions from only two role sources. This lets the navigation renderer decide visibility without hard-coding role names, and leaves room for delegated admin ([8.10](#810-future-delegated-administration)) without changing route or nav contracts.

### 8.2 Scope Discovery Endpoint

Add a Better Auth plugin endpoint `GET /api/auth/admin/console-scopes` (plugin directory `workers/core/src/auth/plugins/console-scopes/**`), not a Hono `/api/admin` route, because it reads auth-owned state (session, user role, organization memberships and labels) and should use Better Auth's adapter/session context like other plugin-owned admin endpoints.

It returns the envelope from [8.1](#81-console-scope-contract): operable scopes (platform if `isPlatformAdmin`, plus every org where `hasOrganizationAccess`), member-only memberships as hints, and a default scope (`platform` for platform admins; the single org for single-org admins; `null` for users with no operable scope).

Platform admin who also owns two orgs:

```json
{
  "actor": { "userId": "usr_123", "email": "admin@example.com", "canEnterConsole": true },
  "scopes": [
    { "kind": "platform", "id": "platform", "label": "Platform", "role": "platform-admin",
      "permissions": ["platform:read","platform:write","organizations:read","organizations:write","oauth-clients:read","oauth-clients:write","resource-servers:read","resource-servers:write","security-audit:read","jwks:read","jwks:rotate","system:read","system:write"],
      "requiresStepUp": true },
    { "kind": "organization", "id": "organization:org_acme", "organizationId": "org_acme", "label": "Acme Publishing", "role": "owner",
      "permissions": ["members:read","members:write","oauth-clients:read","oauth-clients:write","resource-servers:read","resource-servers:write","security-audit:read"],
      "requiresStepUp": false }
  ],
  "memberships": [],
  "defaultScopeId": "platform"
}
```

Org admin with one organization and one member-only org:

```json
{
  "actor": { "userId": "usr_456", "email": "owner@acme.example", "canEnterConsole": true },
  "scopes": [
    { "kind": "organization", "id": "organization:org_acme", "organizationId": "org_acme", "label": "Acme Publishing", "role": "admin",
      "permissions": ["members:read","members:write","oauth-clients:read","oauth-clients:write","resource-servers:read","resource-servers:write","security-audit:read"],
      "requiresStepUp": false }
  ],
  "memberships": [{ "organizationId": "org_initech", "label": "Initech", "role": "member" }],
  "defaultScopeId": "organization:org_acme"
}
```

Ordinary member with no operable scope:

```json
{
  "actor": { "userId": "usr_789", "email": "member@acme.example", "canEnterConsole": false },
  "scopes": [],
  "memberships": [{ "organizationId": "org_acme", "label": "Acme Publishing", "role": "member" }],
  "defaultScopeId": null
}
```

The proxy uses `canEnterConsole`: false sends `/admin*` to `/account`. The selector renders `scopes`; the Account shell's organizations page ([docs/029](029_account-center-and-self-service-identity.md) §8.3) renders the union of `scopes` and `memberships`.

### 8.3 URL-Owned Scope

The route path is the single source of truth for the active scope:

```text
/admin/platform                              platform dashboard
/admin/platform/identity/users
/admin/platform/oauth/applications
/admin/platform/security/jwks
/admin/orgs/:orgId                           org overview
/admin/orgs/:orgId/identity/members
/admin/orgs/:orgId/oauth/applications
```

The path drives the scope label in the selector, the active nav items, SWR key builders, action parameters, and redirect-after-loss behavior. Do not use `localStorage` or a session-only active org as the authoritative scope — two tabs can legitimately show different organizations. The session may still carry Better Auth's `activeOrganizationId` as a bridge where the library requires it ([8.5](#85-better-auth-active-organization-bridge)), but the URL remains the console source of truth.

Scope switching maps the current section to the target scope when an equivalent exists; otherwise it falls back to the target scope's overview:

- `/admin/platform/oauth/applications` → org `org_123` → `/admin/orgs/org_123/oauth/applications`.
- `/admin/orgs/org_123/identity/members` → Platform → `/admin/platform/identity/organizations/org_123` (closest platform equivalent) or `/admin/platform`.
- `/admin/platform/security/jwks` → org `org_123` → `/admin/orgs/org_123` (no org equivalent for JWKS).

### 8.4 Navigation Rendering Contract

The navigation is one declarative definition. Both lenses render from it; there is no per-persona nav file.

```ts
export type NavApplicability = "platform" | "organization" | "both";

export type ConsoleNavItem = {
  readonly id: string;
  // A constant label, or scope-specific labels where the resource differs.
  readonly label: string | { readonly platform: string; readonly organization: string };
  readonly section: string;
  readonly appliesTo: NavApplicability;
  readonly requiredPermission: ConsolePermission;
  readonly href: (scope: ActiveScope) => string;
  readonly icon: string;
};

export function visibleNavItems(
  items: readonly ConsoleNavItem[],
  scope: ConsoleScope,
): readonly ConsoleNavItem[] {
  const active: ActiveScope = scope.kind === "platform"
    ? { kind: "platform" }
    : { kind: "organization", organizationId: scope.organizationId! };
  return items.filter(
    (i) =>
      (i.appliesTo === "both" || i.appliesTo === scope.kind) &&
      scope.permissions.includes(i.requiredPermission),
  );
}
```

Rules:

- Section headers render only when they contain at least one visible item. No empty headers, no disabled rows.
- `Users` vs `Members` is one item with scope-specific labels and a scope-specific `href`, not two definitions.
- The renderer is pure: given the active `ConsoleScope` and the definition, the visible set is deterministic and unit-testable. This single filter is the highest-value test target in the model ([13](#13-test-and-verification-plan)).
- `requiredPermission` gates visibility only. The server independently enforces every request ([8.7](#87-server-side-authorization-and-scoping)); the nav is never the authorization boundary.

This definition replaces the static arrays in `workers/ui/src/shared/constants.ts`. It lives in UI-owned constants (it is presentation), but its `ConsolePermission` and `ActiveScope` types come from `@idco/lib` so the server and UI share one permission vocabulary.

### 8.5 Better Auth Active Organization Bridge

OAuth client ownership depends on the OAuth Provider `clientReference` callback, confirmed in `workers/core/src/auth/oauth-provider.ts`:

```ts
clientReference: async ({ session }) =>
  typeof session?.activeOrganizationId === "string" ? session.activeOrganizationId : undefined
```

So org-scoped OAuth client create/list/update/delete cannot be fully URL-owned until Better Auth accepts an explicit reference id in those handlers. The first implementation treats `activeOrganizationId` as a narrow bridge confined to OAuth client actions:

1. The URL scope remains the desired context.
2. Before an org-scoped OAuth client action, the action wrapper calls Better Auth's set-active-organization endpoint for the route org. Before a platform-scoped OAuth client action, it clears the active organization with `{ organizationId: null }` so a stale tenant session cannot attach a platform client to an organization.
3. The action then calls the existing OAuth client endpoint.
4. The server's `clientPrivileges` and Better Auth ownership checks still validate membership and `referenceId`.
5. SWR keys include the route org id, never the session active org.

> Hard gate (review note 2026-05-31): this bridge mutates server session state as a per-action side effect and is the architectural soft spot of the model. Two constraints make it acceptable rather than a future foot-gun. First, confine the active-org mutation strictly to OAuth-client actions — resource-server, scope-catalog, and M2M-binding CRUD must take an explicit `organizationId` parameter ([8.6](#86-typed-ui-action-contracts)) and must never depend on session active org. Second, treat the cross-tab isolation test (active org switched for one call must not surface another org's cached rows under the wrong route) as a hard merge gate. If either constraint cannot hold, keep org-scoped OAuth client management out of this phase and leave it platform-only. Re-verify the `clientReference` shape on every Better Auth upgrade; this bridge breaks silently if the session field is renamed. If Better Auth later supports an explicit reference-id argument, replace the bridge rather than patching internals.

### 8.6 Typed UI Action Contracts

Every admin action accepts the active scope, derived from the route, never parsed from a string inside the action:

```ts
import { authApiGetOrThrow, type ActiveScope } from "@idco/lib";

function orgParams(scope: ActiveScope) {
  return scope.kind === "organization" ? { organizationId: scope.organizationId } : undefined;
}

export async function listResourceServers(scope: ActiveScope): Promise<ResourceServer[]> {
  const res = await authApiGetOrThrow<{ resourceServers: ResourceServer[] }>(
    "/admin/resource-servers",
    orgParams(scope),
  );
  return res.resourceServers ?? [];
}

export async function listScopes(scope: ActiveScope): Promise<OAuthResourceScope[]> {
  const res = await authApiGetOrThrow<{ scopes: OAuthResourceScope[] }>(
    "/admin/oauth-scopes",
    orgParams(scope),
  );
  return res.scopes ?? [];
}
```

SWR keys include the scope so two tabs in different organizations never share cache:

```ts
export const resourceServersKey = (scope: ActiveScope) => [RESOURCE_SERVERS, scope] as const;
```

Route files read params, build the typed `ActiveScope`, and pass it into content components (as a provider value or prop). Content components build SWR keys and call injected actions with that scope. No stringly route parsing inside actions.

### 8.7 Server-Side Authorization And Scoping

The server enforces scope independently of the UI:

- Platform scope requires `isPlatformAdmin(user.role)`.
- Organization scope requires `isPlatformAdmin(user.role)` or `hasOrganizationAccess(adapter, user.id, organizationId)`.
- Every list endpoint applies the organization filter before pagination.
- Every detail/mutation endpoint loads the row, derives its owner organization, and compares it to the requested scope.
- Platform-owned rows (`organizationId == null`) are unavailable to organization scopes unless the endpoint documents a read-only exception.
- Cross-scope row access returns 404 for ordinary org admins (do not leak whether another org's id exists); platform admins may receive 403 only when the action itself is disallowed.

Endpoint placement:

| Endpoint class | Placement | Reason |
|---|---|---|
| scope discovery | Better Auth plugin `/api/auth/admin/console-scopes` | Auth-owned session/membership facts. |
| organization/member/team/invitation CRUD | Existing Better Auth organization endpoints | Already auth-owned and org-keyed. |
| resource server CRUD | Existing `idResourceServer` plugin | Owns table and authorization; add scope-aware list filters. |
| scope catalog CRUD | Existing `idOAuthScopeCatalog` plugin | Owns table; needs resource-server owner joins. |
| OAuth client CRUD | Better Auth OAuth Provider endpoints + active-org bridge | BA owns the table and RFC-shaped endpoints. |
| session/token/consent aggregate reads | Existing `idAdminAudit` plugin | Keep platform-only until bounded org scoping exists. |
| dashboard aggregate | Hono `/api/admin/dashboard` only if already allowlisted | Cross-domain aggregate exception. Confirm the route and its architecture-lint allowlist entry exist before relying on them; if not, adding it is itself a gated change. |

Do not add standalone Drizzle tables for delegated admin. Partial-admin state uses the Better Auth `idAdminDelegation` plugin schema and generated migration/schema artifacts from `pnpm db:generate`.

### 8.8 Step-Up On Sensitive Scopes And Actions

Under the one-console model, administration is not a separate identity, so the admin OTP from [docs/024](024_admin-login-context-guard.md) is reframed from "admins always OTP at login" to "step-up is required for sensitive scopes and actions," matching how Google Cloud forces reauthentication for sensitive operations regardless of account type.

First-release policy:

- Entering the platform scope requires step-up (`ConsoleScope.requiresStepUp === true` for the platform scope), remembered for the current Better Auth session.
- High-impact platform actions — JWKS rotation, system settings writes, deleting an organization — require step-up at the action even within an already-stepped-up session, subject to a freshness window.
- Organization-scope entry does not require step-up in v1 (`requiresStepUp === false`); org owners/admins sign in normally. A later policy may require step-up for org-destructive actions.
- Plain account sign-in (Account shell) never requires step-up.

This preserves the docs/024 security property — sensitive issuer operations demand a second factor — while removing the "admin is a different kind of login" assumption. The existing admin-OTP guard plugin remains the mechanism; its trigger moves from persona to scope/action. The existing admin-OTP test suite is the regression gate for this change and must stay green ([13](#13-test-and-verification-plan)).

### 8.9 Audit Model

Every admin mutation audit event records both the scope and the actor's authority:

```ts
type AdminAuditContext = {
  readonly scope: "platform" | "organization";
  readonly organizationId?: string;
  readonly actorUserId: string;
  readonly actorPlatformRole?: string | null;      // "admin" when acting as platform admin
  readonly actorOrganizationRole?: "owner" | "admin" | null;
  readonly steppedUp: boolean;                      // was step-up satisfied for this action
  readonly targetType: string;
  readonly targetId: string;
  readonly action: string;
};
```

When a platform admin operates inside an organization lens, the audit row still shows both facts: the actor is platform admin, and the action targeted `organization:org_acme`. `steppedUp` records whether the sensitive-action gate from [8.8](#88-step-up-on-sensitive-scopes-and-actions) was satisfied.

### 8.10 Future Delegated Administration

If organization owner/admin is too coarse, implement a roles-on-scope delegation plugin rather than hard-coding partial roles into UI logic. The natural shape under this model is Google-Cloud-IAM-style (role bound to a principal on a resource scope), which also subsumes Okta's resource-set idea.

Plugin name: `idAdminDelegation`. Schema sketch:

| Model | Key fields | Notes |
|---|---|---|
| `adminRole` | `id`, `label`, `description`, `permissions`, `system`, timestamps | Permission set drawn from `ConsolePermission`. System roles can mirror platform-admin/org-admin but stay read-only. |
| `adminRoleBinding` | `id`, `principalType`, `principalId`, `roleId`, `scope`, `expiresAt`, `createdBy`, `createdAt` | `scope` is a typed resource id such as `platform`, `organization:org_123`, or a finer `oauth-client:client_123`. Principal can be user, group/team, or OAuth client if explicitly approved. |

This is a repository-specific extension. It ships only when a concrete partial-admin requirement exists (for example "helpdesk for organization Y" or "manage only application X"), because every new permission dimension multiplies nav, test, and audit complexity. When it ships, it feeds the same `ConsoleScope.permissions` array, so the console and nav renderer need no structural change — only richer permission sets and possibly finer scope ids.

## 9. Surface And UI Proposals

### 9.1 Shell And Topbar

`workers/ui/src/app/admin/layout.tsx` fetches `GET /api/auth/admin/console-scopes` once, provides the envelope through an `AdminScopeProvider`, and resolves the active scope from the route. `workers/ui/src/app/admin/_components/admin-nav.tsx` renders:

- the topbar scope selector ([7.2](#72-the-scope-selector)) bound to `scopes` + `memberships`;
- a scope badge ("Platform" or org name) so global and tenant actions are never confused;
- the sidebar from `visibleNavItems(navDefinition, activeScope)` ([8.4](#84-navigation-rendering-contract));
- the existing notifications/theme/avatar controls, with the avatar menu linking to `/account`.

Screen spec work precedes route files per the admin UI hard gate: update `workers/ui/docs/screens/shell.md` (scope selector, badge, lens rendering) and `workers/ui/docs/screens/index.md` before implementation.

### 9.2 Dashboard

The `Dashboard` nav item is one node with two data sources:

- Platform scope: `getPlatformDashboard()` — global counts (users, organizations, clients, resource APIs, active sessions, active tokens, consent grants, JWKS keys), issuer health, key-rotation status, platform shortcuts.
- Organization scope: `getOrganizationDashboard(organizationId)` — org overview, member/team counts, pending invitations, org-owned applications and resource APIs, recent org audit; no global counts; no JWKS.

Keep the Hono dashboard route only if it remains the cross-domain aggregate and is already allowlisted ([8.7](#87-server-side-authorization-and-scoping)).

### 9.3 Identity

Platform lens: `Users` (issuer-level subjects) and `Organizations` (global list); a platform admin can open any organization detail, which navigates into that org's lens.

Organization lens: no `Users`; `Members` is the org's view of people, plus `Teams` and `Invitations`. The org overview allows update/delete only for owner/admin or platform admin; destructive org deletion stays platform-only unless a product decision says owners may delete their org.

Rationale: Better Auth users are issuer-level subjects, not tenant-owned rows; organization membership is the tenant-owned view of people. Showing a global Users list inside an org lens invites data leakage and "why can't I edit this user" confusion.

### 9.4 OAuth Applications

Platform lens: list all clients with an owner-organization column from `reference_id`; allow infrastructure-client creation and tenant-client creation only through explicit scope choice, avoiding accidental `reference_id == null` tenant clients.

Organization lens: list only clients with `reference_id == orgId`; create via the active-org bridge ([8.5](#85-better-auth-active-organization-bridge)); hide grant types not allowed for tenant clients; never expose client secret after creation except through the existing rotate/reveal pattern.

RFC 7591/7592 shape client metadata; `reference_id`/organization ownership is a Better Auth/repo extension. Label ownership plainly as "Organization" without implying it is standard OAuth client metadata.

### 9.5 Resource APIs, Scopes, And M2M Bindings

Platform lens: manage all resource servers including system-owned audiences (`organizationId == null`); inspect all scopes and all client-resource-scope bindings.

Organization lens: resource APIs filtered to `organizationId == orgId`; scope catalog derived from the org's resource servers; M2M bindings only where client and resource server both belong to the org. Tenant clients must not bind to system resource servers and infrastructure clients must not bind to tenant resource servers, per [docs/018](018_m2m-oauth-client-org-binding.md).

Server checks: a request scoped to `org_acme` updating a row owned by `org_other` returns 404 for ordinary org admins; scope mutation verifies the parent resource server owner; binding mutation verifies both the client owner and the resource server owner.

These actions take an explicit `organizationId` parameter ([8.6](#86-typed-ui-action-contracts)) and must not use the active-org bridge.

### 9.6 Security, Sessions, Tokens, Consents, And JWKS

Platform lens: existing sessions, tokens, consents, introspection, and JWKS views remain; JWKS rotation and key metadata are platform-only because keys belong to the issuer.

Organization lens: consents shown only if filterable by org-owned clients without scanning all users; sessions and token audit deferred until the endpoint can bound the candidate set ([docs/026](026_admin-oauth-security-screens-and-api-contracts.md) notes that org-admin session/token scoping blows up with large `WHERE IN` candidate sets); token introspection exposed only as a sanitized support tool that clearly validates token status rather than granting rights.

Standards boundary: token revocation stays RFC 7009, introspection stays RFC 7662, and consent revocation is a management action, not token revocation.

### 9.7 System

Platform lens only: Issuer Metadata, SCIM Status, Health, Settings. (Service Accounts moved to the Access section, [docs/031 §4.8](031_platform-access-control.md).) These are issuer/deployment controls; the organization lens hides the System section entirely (the section header does not render because it has no visible items at org scope). A future read-only org "SCIM status" page would check tenant `/scim/v2/tenants/:orgId/...` routes, not global system health.

## 10. Architecture Decisions

### D0. One Console With A Scope Selector; Administration Is Roles-On-Scope

Recommended: a single console rendering one navigation definition through scope-selected lenses, entered by anyone with an operable scope, with a Google-Cloud-style scope selector as the primary navigation.

Rejected: separate per-persona consoles or separate hand-authored navigation trees for platform admin and organization admin.

Reasoning: forked navigation triples UI surface and produces two different experiences for the same task (global-list-then-drill versus context picker). One scope-gated console scales uniformly from one to many organizations, matches a model users already know, and consumes the existing `isPlatformAdmin`/`hasOrganizationAccess` authority checks directly.

### D1. Tenant-Scoped Console, Not Per-Org Single-Tenant Deployment

Recommended: one issuer, one deployment, scope-selected console contexts. Rejected: one Worker/D1/issuer/JWKS per org. Reasoning: per-org deployment is disproportionate and would complicate client metadata, discovery, JWKS validation, SCIM, and resource-server integration. Better Auth organizations are closer to Auth0 Organizations / Google Cloud projects than to Okta org-per-tenant URLs.

### D2. URL Owns Console Scope

Recommended: explicit route prefixes carry the active scope. Rejected: localStorage-only or session-only active org. Reasoning: URLs are shareable, testable, cache-safe, and correct across tabs and reloads. The session active org remains a Better Auth bridge only where the library requires it.

### D3. Server Enforces Every Scope

Recommended: every endpoint verifies actor authority for the requested scope and filters rows server-side. Rejected: hiding UI controls as the authorization mechanism. Reasoning: nav visibility is usability, not security. Org admins must receive scoped data from the server, not global data filtered in React.

### D4. Account Is A Separate Shell

Recommended: self-service identity lives at `/account/**` in its own shell, as in [docs/029](029_account-center-and-self-service-identity.md), mirroring the Google Account / Cloud console split. Rejected: a "member lens" inside the console. Reasoning: a non-admin staring at an operator console with everything hidden is a broken product; the account shell is the right home for self-service, and the console is entered only with an operable scope.

### D5. Step-Up Attaches To Sensitive Scopes And Actions

Recommended: require step-up for the platform scope and high-impact actions, not for an "admin persona" ([8.8](#88-step-up-on-sensitive-scopes-and-actions)). Rejected: "all admins OTP at login." Reasoning: administration is no longer a separate identity, so the second factor must attach to risk (entering platform, rotating keys) rather than to a role flag, while preserving the docs/024 security property.

### D6. Keep First-Release Role Model Small

Recommended: platform admin plus organization owner/admin for the initial active authorization model. Rejected for v1 activation: granting console route authority from delegated roles before a concrete partial-admin product role and projection semantics exist. Reasoning: roles-on-scope is the right shape ([8.10](#810-future-delegated-administration)) and now has plugin-owned base state, but it becomes an authorization system only when `ConsoleScope.permissions` projection is deliberately enabled.

### D7. Keep Protocol Claims Standards-Aware

Recommended: keep OAuth `resource`, JWT `aud`/`scope`/`sub`/`client_id`, and documented extension claims such as `org_id`. Rejected: presenting `org_id` as an OIDC standard claim or adding custom token-endpoint parameters as substitutes for RFC 8707/9068 behavior.

### D8. Do Not Use SCIM For Service Accounts

Recommended: SCIM for Users/Groups, OAuth clients for service accounts. Rejected: mirroring OAuth clients as SCIM resources without an approved extension. Reasoning: aligns with [docs/017](017_scim-directory-and-m2m-principal-contract.md) and [docs/018](018_m2m-oauth-client-org-binding.md).

## 11. Migration And Rollout

The first phase is additive and low-risk:

1. Add `packages/lib` scope/permission types and the `console-scopes` endpoint.
2. Add the `AdminScopeProvider`, scope selector, and the single navigation definition; render the platform lens from it (behavior-preserving for existing platform admins).
3. Change the proxy gate from `role === "admin"` to `canEnterConsole`; redirect users with no operable scope to `/account`.
4. Add the `/admin/platform/**` route prefix and redirect legacy `/admin/**` routes to it.
5. Add `/admin/orgs/:orgId/**` routes for the organization lens (overview, members, teams, invitations first).
6. Add scope-aware action signatures and SWR keys for resource servers, scopes, and bindings; add the OAuth client active-org bridge with the cross-tab test.
7. Move admin OTP from login-persona to scope/action step-up ([8.8](#88-step-up-on-sensitive-scopes-and-actions)).

Legacy redirect map:

| Current route | Redirect |
|---|---|
| `/admin` | `/admin/platform` (platform admin), `/admin/orgs/:orgId` (single-org admin), scope selector at `/admin/platform` for multi-org, `/account` (no operable scope) |
| `/admin/identity/users` | `/admin/platform/identity/users` |
| `/admin/identity/organizations` | `/admin/platform/identity/organizations` |
| `/admin/oauth/applications` | `/admin/platform/oauth/applications` |
| `/admin/security/jwks` | `/admin/platform/security/jwks` |

Rollback: the first phase is route- and endpoint-additive, so rollback disables the org lens and reverts the proxy gate and OTP trigger to platform-admin-only while keeping platform `/admin` behavior. Keep the admin-OTP test suite as the rollback safety check. Do not run schema migrations unless the optional delegated-admin plugin is approved later.

## 12. Edge Cases And Failure Modes

- Actor loses org admin role while viewing `/admin/orgs/:orgId/...`: the next `console-scopes` fetch or page action returns 403/404; UI redirects to the scope selector or `/account`.
- Multi-org admin with no platform role: `/admin` resolves to the scope selector at the first operable scope; no default org is guessed beyond the discovery endpoint's `defaultScopeId`.
- Platform admin and org admin: default to platform; org lens is entered explicitly; audit records the platform role ([8.9](#89-audit-model)).
- No operable scope: `/admin*` redirects to `/account`; the console never renders empty.
- Better Auth active org differs from route org: org-scoped OAuth client actions call the bridge ([8.5](#85-better-auth-active-organization-bridge)) immediately before the BA call and abort on failure.
- Two tabs in different org scopes: SWR keys include the route org id; stale data from tab A must not render under tab B (hard test).
- Org deleted while open: detail endpoints return 404; UI navigates to the platform org list (platform admin) or `/account` (org-only actor).
- Platform-owned resource server in an org lens: hidden by default; if shown as read-only reference, the endpoint and UI label it "Platform-owned" and disallow mutation.
- Large org token/session scoping: do not ship org token/session lists until a bounded read model exists.
- Scope route tampering: `/admin/orgs/org_other/...` must not reveal whether `org_other` exists to an unauthorized actor. Prefer 404.
- Step-up bypass attempt: entering platform scope or invoking a sensitive action without a fresh step-up returns a step-up challenge, not the data ([8.8](#88-step-up-on-sensitive-scopes-and-actions)).
- Hard-coded clients/settings: rejected. Scope-specific behavior comes from organization, OAuth client, resource-server, or scope rows.

## 13. Test And Verification Plan

Docs-only verification for this proposal: confirm the README Contracts list includes this document and search for stale "admin-only" wording when implementation begins.

Implementation verification (highest-value first):

- `visibleNavItems` unit tests: platform lens shows platform+shared items, org lens shows org+shared items, forbidden items never render, empty section headers never render. This pure filter is the single most important test in the model.
- `workers/core/tests/auth/console-scopes.test.ts`: platform admin gets platform plus org scopes; org admin gets only org scopes; member gets no operable scope and `canEnterConsole === false`; `defaultScopeId` is correct in each case.
- `workers/ui/tests/admin/scope-routing.test.tsx`: `/admin` redirect matrix for platform admin, single-org admin, multi-org admin, member, and no session; proxy sends no-operable-scope users to `/account`.
- `workers/ui/tests/admin/scope-cache.test.tsx`: SWR keys differ by scope; org rows never reused across org routes; cross-tab isolation for the active-org bridge.
- Resource-server/scope/binding plugin tests: list/detail/mutate filter by `organizationId`; org admin cannot reach another org's row or a platform-owned system row (404).
- OAuth client bridge tests: org-scoped create/list/update sets active org and refuses mismatch; platform admin list stays global.
- Step-up tests: entering platform scope and invoking JWKS rotation require step-up; org-scope entry does not in v1; the existing admin-OTP suite remains green.
- Audit tests: mutations record scope, actor role, and `steppedUp`.
- UI story coverage: each new content component has Populated, Empty, Loading, Error stories under the proper `AdminShell`/`PageBody` pattern.
- Commands: `pnpm lint`, `pnpm test`, `pnpm check`, `pnpm deploy:ui:dry-run` for non-trivial UI changes, and `pnpm advise` after substantial source changes.

## 14. Implementation Phases

The work is sequenced; each phase is independently shippable and testable. Phases 1–3 are the core; 4–6 add the organization lens and scoping.

1. Scope contract + discovery: `packages/lib/src/console-scope.ts`, exports in `index.ts`, plugin `workers/core/src/auth/plugins/console-scopes/**`, registration in `get-auth.ts`, endpoint tests. Acceptance: the endpoint returns correct operable scopes and `defaultScopeId` for platform admin, single-org admin, multi-org admin, and member.
2. Console shell + nav definition: `AdminScopeProvider`, scope selector, single nav definition, `visibleNavItems`, platform lens rendering, screen-spec updates. Acceptance: platform admins keep current functionality; the nav renders from the definition; `visibleNavItems` tests pass.
3. Entry gate + routing: proxy uses `canEnterConsole`, `/admin/platform/**` prefix, legacy redirects, `/account` fallback. Acceptance: the redirect matrix tests pass; no-operable-scope users land in `/account`.
4. Organization lens surfaces: `/admin/orgs/:orgId/**` overview, members, teams, invitations reusing existing org content components with the route org id. Acceptance: org admins manage their org without seeing platform surfaces.
5. OAuth + resource scoping: scope-aware actions and SWR keys; server filters and owner checks for resource servers/scopes/bindings; OAuth client active-org bridge with cross-tab test. Acceptance: org admins see only org-owned rows; the server rejects cross-org ids; cache keys include scope.
6. Step-up reframe: move admin OTP from login-persona to platform-scope entry and sensitive actions; keep the admin-OTP suite green. Acceptance: platform entry and JWKS rotation require step-up; account sign-in does not.

## 15. Definition Of Done

- The repo has one operator console with one navigation definition rendered through platform and organization lenses, plus a separate account shell.
- A Google-Cloud-style scope selector is the primary console navigation; there is no separate select-context page and no per-persona navigation tree.
- The console entry gate is "has an operable scope," and users with none are sent to `/account`.
- The active scope is encoded in the route and visible in the topbar.
- Organization administrators manage their own organization without seeing global users, global keys, global system settings, or cross-tenant data; platform administrators operate globally and can enter any organization lens.
- Every org-owned fetch, mutation, SWR key, and audit event carries the scope; server-side checks enforce scope and row ownership independently of UI gating.
- OAuth client management uses Better Auth-supported capabilities with the documented, OAuth-client-only active-org bridge and a passing cross-tab test; no Better Auth internals are patched.
- Step-up attaches to the platform scope and sensitive actions; the docs/024 security property holds and the admin-OTP suite stays green.
- SCIM remains the directory contract and OAuth remains the service-account contract.
- README and screen specs are updated before implementation; `pnpm lint`, `pnpm test`, `pnpm check`, and relevant UI dry-run checks pass.

## 16. Final Model

`id` stays one standards-based authorization server with one issuer, one JWKS set, and database-backed organizations. The hosted console becomes a single Google-Cloud-style operator surface: one navigation definition, a scope selector that lists every operable scope uniformly, and lenses that render the same definition filtered to the selected scope and the actor's permissions. Administration is roles-on-scope, not a separate identity, so the console is entered by anyone with an operable scope and step-up attaches to sensitive scopes and actions. Self-service identity lives in a separate account shell, exactly as Google separates the Account page from the Cloud console. The standards line stays clear: OAuth and SCIM own the interoperable protocol surfaces, and the scope-gated console is repository-specific management UX enforced server-side. Okta resource sets and Google-Cloud-IAM roles-on-scope are the documented future path for partial delegated administration when owner/admin becomes too coarse.
