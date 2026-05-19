# id — First Batch Architecture And Planning

> Status: implementation-grade research and proposal
>
> Date: 2026-05-19
>
> Scope:
>
> - `pjs/id` (new repo — replacing `pjs/auther`)
>
> Source docs:
>
> - Better Auth v1.6.x — `https://better-auth.com/docs`
> - Better Auth OAuth 2.1 Provider — `https://better-auth.com/docs/plugins/oauth-provider`
> - Better Auth Organization Plugin — `https://better-auth.com/docs/plugins/organization`
> - Better Auth JWT Plugin — `https://better-auth.com/docs/plugins/jwt`
> - Cloudflare Workers + D1 — `https://developers.cloudflare.com/workers/`
>
> Related docs:
>
> - Auther (legacy) at `~/pjs/auther` — previous IdP built on Better Auth 1.3 + `oidcProvider`
>
> Assumptions:
>
> - Cloudflare Workers is the deployment target (not Vercel).
> - D1 is the primary database (SQLite-compatible, no interactive transactions).
> - Better Auth will be the auth foundation (not a custom-built OAuth2 server).
> - The first batch excludes webhooks, pipeline scripting, Lua ABAC, and full ReBAC/Zanzibar. These are planned for later batches and are noted explicitly throughout.
> - This document is for review and discussion; backlog IDs and ticket granularity are deferred.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 What Better Auth 1.6 Provides](#31-what-better-auth-16-provides)
  - [3.2 What Auther Had That Better Auth Now Covers Natively](#32-what-auther-had-that-better-auth-now-covers-natively)
  - [3.3 What Auther Had That Better Auth Still Does Not Cover](#33-what-auther-had-that-better-auth-still-does-not-cover)
  - [3.4 Cloudflare Workers Feasibility](#34-cloudflare-workers-feasibility)
- [4. Target Model](#4-target-model)
  - [4.1 Tenant Model (Organizations)](#41-tenant-model-organizations)
  - [4.2 OAuth2 Client Model](#42-oauth2-client-model)
  - [4.3 Resource Server Model (API Audiences)](#43-resource-server-model-api-audiences)
  - [4.4 Token Flow Model](#44-token-flow-model)
  - [4.5 Authorization Model (RBAC)](#45-authorization-model-rbac)
  - [4.6 User Model](#46-user-model)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Decision: Build On Better Auth, Not From Scratch](#51-decision-build-on-better-auth-not-from-scratch)
  - [5.2 Decision: Use `oauthProvider`, Not `oidcProvider`](#52-decision-use-oauthprovider-not-oidcprovider)
  - [5.3 Decision: Use `organization` Plugin For Tenants](#53-decision-use-organization-plugin-for-tenants)
  - [5.4 Decision: JWT Access Tokens Via `resource` Parameter](#54-decision-jwt-access-tokens-via-resource-parameter)
  - [5.5 Decision: M2M Via `client_credentials`, Not `apiKey`](#55-decision-m2m-via-client_credentials-not-apikey)
  - [5.6 Decision: UI-First Management (Not Config-First)](#56-decision-ui-first-management-not-config-first)
  - [5.7 Decision: Defer ReBAC And ABAC](#57-decision-defer-rebac-and-abac)
  - [5.8 Decision: Defer Custom Pipeline/Lua Engine](#58-decision-defer-custom-pipelinelua-engine)
  - [5.9 Decision: Defer Webhooks To Later Batch](#59-decision-defer-webhooks-to-later-batch)
  - [5.10 Decision: Defer Custom Onboarding Flows](#510-decision-defer-custom-onboarding-flows)
- [6. Data Model](#6-data-model)
  - [6.1 Tables Owned By Better Auth](#61-tables-owned-by-better-auth)
  - [6.2 Custom Tables (For Extension Hooks And Future ReBAC)](#62-custom-tables-for-extension-hooks-and-future-rebac)
  - [6.3 Schema Extension Safety](#63-schema-extension-safety)
- [7. API Surface](#7-api-surface)
  - [7.1 Better-Auth-Provided Endpoints](#71-better-auth-provided-endpoints)
  - [7.2 Well-Known Metadata Endpoints](#72-well-known-metadata-endpoints)
  - [7.3 Custom Admin API](#73-custom-admin-api)
- [8. Deployment Architecture](#8-deployment-architecture)
  - [8.1 Worker Topology](#81-worker-topology)
  - [8.2 D1 Constraints And Mitigations](#82-d1-constraints-and-mitigations)
  - [8.3 CLI And Migration Workflow](#83-cli-and-migration-workflow)
  - [8.4 JWKS Key Rotation](#84-jwks-key-rotation)
- [9. Auth Flow Walkthroughs](#9-auth-flow-walkthroughs)
  - [9.1 User Authorization Code Flow (SPA/Mobile)](#91-user-authorization-code-flow-spamobile)
  - [9.2 M2M Client Credentials Flow](#92-m2m-client-credentials-flow)
  - [9.3 Post-Login Organization Selection Flow](#93-post-login-organization-selection-flow)
  - [9.4 Account Selection Flow (prompt=select_account)](#94-account-selection-flow-promptselectaccount)
  - [9.5 Sign-Up Flow (prompt=create)](#95-sign-up-flow-promptcreate)
  - [9.6 Resource Server Token Verification Flow](#96-resource-server-token-verification-flow)
- [10. Admin UI Requirements](#10-admin-ui-requirements)
- [11. Edge Cases And Failure Modes](#11-edge-cases-and-failure-modes)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 1. Goal

Build a new auth service — deployed on Cloudflare Workers with D1 — that serves as a centralized Identity Provider (IdP) comparable to Auth0. It must provide multi-tenant organizations, full OAuth2.1/OIDC flows, JWT-signed access tokens verifiable at JWKS endpoints, machine-to-machine authentication, and an administration UI for managing tenants, OAuth2 clients, users, and resource servers.

This is the **first batch** — core identity and authorization infrastructure. Advanced features (ReBAC graph authorization, ABAC/Lua policy engine, pipelines, webhooks) are explicitly deferred.

The output is an implementation-grade planning document that can be reviewed by another engineer and then broken into concrete tickets.

## 2. System Summary

The auth service provides the authentication and authorization backbone for a personal ecosystem of applications: a PayloadCMS instance, a Next.js blog, and future apps.

**Core responsibilities:**

- User sign-up, sign-in, session management
- Multi-tenant scoping via organizations (each org is an isolated auth space)
- OAuth2.1 / OIDC authorization server (authorization_code with PKCE S256, client_credentials, refresh_token)
- JWT-signed access tokens with audience binding for resource servers
- JWKS public key discovery for downstream API verification
- Machine-to-machine authentication via client_credentials grant
- Admin UI for managing all entities (not config-file-driven)

**High-level flow:**

```
User/Client App
    │
    ├─ 1. Sign-in / Sign-up (email/password + optional social providers)
    │
    ├─ 2. OAuth2 authorize (/oauth2/authorize)
    │      └─ PKCE S256, consent, prompt=select_account, prompt=create
    │
    ├─ 3. Token exchange (/oauth2/token)
    │      └─ Returns JWT with aud=resource_server_url when `resource` param present
    │      └─ Returns opaque token when `resource` not requested
    │
    ▼
Resource Server (your API)
    │
    ├─ 4. Validate JWT locally via JWKS endpoint
    │      └─ Check iss, aud, exp, nbf, signature
    │
    ├─ 5. Enforce RBAC scopes (e.g., read:posts, write:admin)
    │
    ▼
Data layer (scoped by organization)
```

## 3. Current-State Findings

### 3.1 What Better Auth 1.6 Provides

Better Auth is at v1.6.11 (as of the research date) with 480+ contributors and 28K+ GitHub stars. It provides:

| Area | Built-in Support |
|---|---|
| Core auth | email/password, social providers (Google, GitHub, etc.), session management |
| Multi-tenant | `organization` plugin — orgs, members, roles (owner/admin/member), invitations, teams |
| OAuth2.1 / OIDC | `oauthProvider` plugin — authorization_code (PKCE S256 by default), client_credentials, refresh_token |
| JWT signing | `jwt` plugin — JWKS endpoint, asymmetric signing, key rotation |
| API tokens | `apiKey` plugin (maintainer recommends client_credentials instead for M2M) |
| Consent | Built-in consent screen flow with per-client skip_consent option |
| Account selection | `prompt=select_account` via multi-session plugin |
| Sign-up prompt | `prompt=create` with configurable sign-up page |
| Token introspection | RFC 7662 `/oauth2/introspect` |
| Token revocation | RFC 7009 `/oauth2/revoke` |
| UserInfo | `/userinfo` endpoint with `openid` scope |
| RP-initiated logout | Supported for trusted clients |
| Dynamic client registration | RFC 7591 compliant, configurable |
| RBAC | `organization` plugin `createAccessControl` — declarative role→permission mapping |
| Dynamic access control | Stored roles/permissions per-org at database level |
| Rate limiting | Built-in per-endpoint rate limiting |
| Cloudflare D1 | Native support via Kysely D1 dialect (since v1.5) |
| JWKS rotation | Built-in with grace period (since v1.5, PR #6147) |
| Secret rotation | Non-destructive `BETTER_AUTH_SECRET` rotation (v1.5) |
| Pairwise subjects | HMAC-SHA256 per-client `sub` values (landed Mar 2026) |

Better Auth's plugin system allows:
- Defining custom database schemas within plugins
- Extending core tables (`user`, `session`) with `additionalFields`
- Registering custom endpoints via `createAuthEndpoint`
- Hooks for lifecycle events (`before`/`after` middleware)
- Custom `onRequest`/`onResponse` interceptors

### 3.2 What Auther Had That Better Auth Now Covers Natively

The legacy `auther` project was built on Better Auth 1.3 + `oidcProvider`. Several custom-built features in auther are now native to Better Auth 1.6:

| Auther Custom Implementation | Better Auth 1.6 Equivalent |
|---|---|
| OAuth2 token bridge — intercept opaque token, swap for JWKS-signed JWT | `oauthProvider` issues JWT natively when client passes `resource` param |
| Custom JWKS endpoint + manual key generation | `jwt` plugin built-in JWKS with rotation |
| OAuth consent page | `consentPage` + consent CRUD endpoints |
| API key exchange for JWT | `client_credentials` grant (recommended by maintainers) |
| Non-destructive secret rotation | Built-in `secret: ["new", "old"]` |
| Resource server audience binding | `validAudiences` + `resource` param + RFC 8707 resource indicators |
| Custom registration flow | `prompt=create` + `signup.page` |
| Multi-session account picker | `prompt=select_account` + `selectAccount.page` |
| Post-login org selection | `postLogin` configuration |

### 3.3 What Auther Had That Better Auth Still Does Not Cover

These features existed in auther and have no Better Auth equivalent. They are explicitly deferred:

| Feature | Auther Implementation | Why Deferred |
|---|---|---|
| ReBAC (Zanzibar-style graph) | Permission service with BFS subject expansion, tuple matching, wildcard support, `owner→editor→viewer` transitivity | Better Auth has flat RBAC only. No graph traversal. Community wants it (issue #2167). No roadmap item. |
| ABAC / Lua policy engine | Wasmoon Lua engine pool (20 engines), 1s timeout, 10KB limit, sandboxed environment | Complex on Workers (128MB memory limit). Better Auth has no built-in ABAC. Enterprise IAM proposal (#9190) exists but no implementation. |
| Pipeline/hook scripting | DAG-based Lua scripts at 16 lifecycle hooks, blocking/async/enrichment types, OpenTelemetry tracing, CodeMirror visual editor | Better Auth has hook callbacks but no DAG engine or scripting runtime. |
| Webhook delivery | QStash-queued delivery, 20 event types, HMAC-SHA256 signing, multi-endpoint subscriptions | No built-in webhook system in Better Auth. Would need custom implementation. |
| Custom onboarding flows | Registration contexts, HMAC-signed invite tokens, automatic permission grants on sign-up, 7-day invite expiry | App-level concern. Better Auth has basic invitations in the org plugin. |

### 3.4 Cloudflare Workers Feasibility

**Native D1 support exists** (PR #7519, v1.5+). The Kysely adapter auto-detects D1 and uses a native dialect. You can pass `env.DB` directly.

**Known Cloudflare Workers constraints:**

- **D1 lacks interactive transactions.** `BEGIN`/`COMMIT`/`ROLLBACK` are unsupported. Better Auth's adapter throws a descriptive error for this. Mitigation: use D1's `batch()` API for sequential writes. Token issuance does multiple writes — if one fails mid-flow, partial state is possible. Mitigated by idempotent-ish operations in Better Auth's token endpoints.
- **D1 binding is per-request only.** You cannot create a static `auth` instance at module scope. Use the `getAuth(c)` pattern — export a function that receives the request context and D1 binding.
- **CLI tooling limitation.** `npx @better-auth/cli generate` cannot query remote D1 directly. Workaround: use `getPlatformProxy()` for local dev, or programmatic migrations via `getMigrations()` + `runMigrations()`.
- **`_cf_METADATA` table** is D1-internal and access-prohibited. Kysely's introspection trips over it. Community has workarounds.
- **KV for secondary storage.** BA's rate limiting and session caching use `secondaryStorage`. On Workers this is KV. Minimum KV TTL is 60s, so rate limit windows must be >= 60s.

Existing community examples are working: Hono + D1, React Router + D1, Next.js + Cloudflare Pages.

## 4. Target Model

### 4.1 Tenant Model (Organizations)

Each organization is an isolated tenant. Users belong to organizations as members with roles.

**Entity mapping (auther → new service):**

| Auther Concept | New Service Concept |
|---|---|
| Authorization Space | Organization (via `organization` plugin) |
| Space ownership (user belongs to space) | Organization membership |
| `full_access` on space | Organization owner/admin role |

**Key behaviors:**

- An organization is created by a user who automatically becomes the `owner`.
- Users can belong to multiple organizations. One is "active" on the session.
- The `referenceId` (organization ID) on an OAuth client is immutable after creation — a client belongs to exactly one organization.
- Organization-scoped scopes trigger the post-login org selection flow during OAuth authorization.

**What the `organization` plugin provides:**
- Org CRUD (`createOrganization`, `updateOrganization`, `deleteOrganization`)
- Member management (`listMembers`, `removeMember`, `updateMemberRole`)
- Invitation workflow (`inviteMember`, `acceptInvitation`, `rejectInvitation`, `cancelInvitation`)
- Active organization on session (`setActive`)
- Teams (optional sub-division within orgs)
- Dynamic access control (roles stored per-org in DB)
- Lifecycle hooks (`organizationHooks`)

**What we add on top:**
- Custom admin UI pages for org management
- `additionalFields` on the `organization` table for metadata (plan, quota, branding, etc.)
- Eventually: a `resource_servers` custom table referencing `organization.id` for per-org API definitions

### 4.2 OAuth2 Client Model

OAuth2 clients are applications that request authorization against our IdP. They map to the `oauthClient` table managed by the `oauthProvider` plugin.

**Client types:**

| Type | `token_endpoint_auth_method` | Use Case |
|---|---|---|
| Confidential | `client_secret_basic` or `client_secret_post` | Web apps with server-side backend |
| Public | `none` (PKCE only) | SPA, mobile apps, CLI tools |

**Client properties:**

- `redirect_uris`: Array of valid callback URLs
- `scopes`: Allowed scopes for this client
- `grant_types`: Supported grants (`authorization_code`, `client_credentials`, `refresh_token`)
- `referenceId`: The organization ID this client belongs to (immutable)
- `skip_consent`: Bypass consent screen (for trusted first-party apps)
- `require_pkce`: Default true per OAuth 2.1, can be set to false for legacy clients (admin-created only)
- `subject_type`: `"public"` (shared user ID) or `"pairwise"` (per-client unique user ID)
- `disabled`: Soft-delete flag
- `enable_end_session`: Allow RP-initiated logout

**Trusted clients:** Configured in-code via `trustedClients` array. These bypass DB lookups and can skip consent. Used for first-party apps.

**UI-first operations (all via server API, not config):**

| Action | Server API Call |
|---|---|
| Create client | `auth.api.createOAuthClient(...)` |
| Create with privileged fields | `auth.api.adminCreateOAuthClient(...)` |
| Update client | `auth.api.updateOAuthClient(...)` |
| Get one client | `auth.api.getOAuthClient(...)` |
| List all clients | `auth.api.getOAuthClients(...)` |
| Rotate secret | `auth.api.rotateClientSecret(...)` |
| Delete client | `auth.api.deleteOAuthClient(...)` |
| Get public info (for login pages) | `auth.api.getOAuthClientPublic(...)` |

**Access control for client operations:** The `clientPrivileges` callback gates who can create/update/delete/list/rotate clients. Example: grant client CRUD only to organization owners:

```ts
oauthProvider({
  clientPrivileges: async ({ headers, action, session }) => {
    if (!session.activeOrganizationId) return false;
    const member = await auth.api.getActiveMember({ headers });
    return member?.role === "owner";
  },
})
```

**Dynamic registration:** Configurable via `allowDynamicClientRegistration: true` (authenticated) and `allowUnauthenticatedClientRegistration: true` (anonymous). For the first batch, we keep dynamic registration off — clients are created only through the admin UI.

### 4.3 Resource Server Model (API Audiences)

Better Auth does NOT have a first-class "resource server" database entity. Instead, resource servers are defined as **audiences** (URL strings) in the `oauthProvider` configuration.

**Configuration:**

```ts
oauthProvider({
  validAudiences: [
    "https://api.example.com",
    "https://admin.example.com",
    "https://cms.example.com",
  ]
})
```

**How it works:**

1. A client requests a token with `resource=https://api.example.com` (RFC 8707 parameter)
2. The auth server validates the resource against `validAudiences`
3. The access token is issued as a JWKS-signed JWT with `aud=https://api.example.com`
4. The downstream API verifies the JWT locally using the JWKS endpoint — no introspection call needed
5. Without a `resource` parameter, the access token is opaque (hashed, stored in DB)

**RFC 8707 resource indicators** are fully supported (PR #7855, Feb 2026):
- Multiple resources can be requested
- The token request resource set must be a subset of the authorization request resource set (narrowing allowed, widening rejected)
- Consent re-prompts when new resources are requested
- Opaque tokens also expose `aud` via `/oauth2/introspect`

**Protected resource metadata (RFC 9470):**

Each resource server serves discovery metadata at `/.well-known/oauth-protected-resource/{resource-path}`. This allows MCP clients and other automated tooling to discover the auth server:

```ts
// /.well-known/oauth-protected-resource/api/route.ts on your API worker
const metadata = await serverClient.getProtectedResourceMetadata({
  resource: "https://api.example.com",
  authorization_servers: ["https://id.quanghuy.dev"],
});
```

**What we add on top (custom):**

A lightweight `resource_servers` table for the admin UI — just metadata (name, description, audience URL) referencing an organization. This is a management convenience, not part of the auth runtime. The actual enforcement is through `validAudiences`.

### 4.4 Token Flow Model

**Three grant types supported:**

| Grant | Use Case | User Present? | Token Type |
|---|---|---|---|
| `authorization_code` + PKCE S256 | User delegates access to an app | Yes | JWT (with `resource`) or opaque |
| `client_credentials` | M2M, backend-to-backend | No | JWT (with `resource`) or opaque |
| `refresh_token` | Renew expired access token | No (uses offline token) | JWT (with `resource`) or opaque |

**Token lifetimes (defaults, configurable):**

| Token | Default | Config Key |
|---|---|---|
| Access token (user) | 1 hour | `accessTokenExpiresIn` |
| Access token (M2M) | 1 hour | `m2mAccessTokenExpiresIn` |
| ID token | 10 hours | `idTokenExpiresIn` |
| Refresh token | 30 days | `refreshTokenExpiresIn` |
| Authorization code | 10 minutes | `codeExpiresIn` |

**JWT access token structure (when `resource` param is used):**

```json
{
  "iss": "https://id.quanghuy.dev",
  "aud": "https://api.example.com",
  "sub": "user_abc123",
  "iat": 1680000000,
  "exp": 1680003600,
  "nbf": 1680000000,
  "client_id": "app_xyz789",
  "scope": "openid profile read:posts",
  "token_use": "access"
}
```

**Enrichment points (injecting custom claims):**

- `customAccessTokenClaims({ referenceId, scopes })` — adds claims inside the JWT payload. Use for org context, permissions, plan info.
- `customIdTokenClaims(...)` — adds claims inside the ID token.
- `customTokenResponseFields({ grantType, user, scopes, metadata, verificationValue })` — adds fields to the token JSON response envelope alongside `access_token`, `token_type`, etc. Standard OAuth fields cannot be overridden.
- `customUserInfoClaims(...)` — adds claims to the `/userinfo` endpoint response.

**Example enrichment for org context:**

```ts
oauthProvider({
  customAccessTokenClaims({ referenceId, scopes }) {
    if (referenceId) {
      return {
        org_id: referenceId,
      };
    }
    return {};
  },
  customTokenResponseFields({ grantType, verificationValue }) {
    if (grantType === "authorization_code" && verificationValue?.referenceId) {
      return { org_id: verificationValue.referenceId };
    }
    return {};
  },
})
```

### 4.5 Authorization Model (RBAC)

First batch uses flat RBAC via the organization plugin's access control system.

**Built-in roles:**

| Role | Organization | Members | Invitations |
|---|---|---|---|
| `owner` | update, delete | create, update, delete | create, cancel |
| `admin` | update | create, update, delete | create, cancel |
| `member` | — | — | — |

**API-level authorization:** Scopes on the OAuth token. The downstream API enforces: "does this token have scope `read:posts`?" combined with "does its `org_id` claim match the requested resource's org?"

**Custom permissions (extensible):** Use `createAccessControl` to define custom resources and actions:

```ts
import { createAccessControl } from "better-auth/plugins/access";

const ac = createAccessControl({
  project: ["create", "read", "update", "delete"],
  billing: ["read", "manage"],
});

const roles = {
  owner: { ...ac.newRole(), project: ["create", "read", "update", "delete"], billing: ["read", "manage"] },
  admin: { ...ac.newRole(), project: ["create", "read", "update"], billing: ["read"] },
  member: { ...ac.newRole(), project: ["read"] },
};

// Pass to organization plugin
organization({ ac, roles: { owner, admin, member } })
```

**Dynamic access control:** Roles and permissions can be created at runtime per organization, stored in the `organizationRole` database table. Enable with `dynamicAccessControl: { enabled: true }`.

**What's NOT in the first batch:**

- No ReBAC graph (no BFS subject expansion, no tuple matching, no group hierarchy traversal)
- No ABAC (no attribute-based policy evaluation, no Lua scripts)
- No fine-grained permission tuples at the entity level

These gaps are filled by the simple strategy: **embed `org_id` and `role` in the JWT, let each API enforce its own authorization with those claims.** This matches Auth0's model.

### 4.6 User Model

Standard Better Auth user model with `additionalFields` for the admin UI role:

```ts
betterAuth({
  user: {
    additionalFields: {
      platformRole: {
        type: ["superadmin", "admin"],
        required: false,
        defaultValue: "admin",
        input: false, // not settable by user during signup
      },
    },
  },
})
```

Users authenticate via email/password. Social providers (Google, GitHub) can be added via `socialProviders` configuration. Multi-session support via the `multiSession` plugin (needed for `prompt=select_account`).

## 5. Architecture Decisions

### 5.1 Decision: Build On Better Auth, Not From Scratch

**Recommended:** Use Better Auth 1.6 as the auth foundation.

**Rationale:**
- Better Auth 1.6 with `oauthProvider` covers 80%+ of what auther did, natively
- The auther codebase became incompatible with Better Auth upstream due to building on the deprecated `oidcProvider` plugin and monkey-patching internal behavior
- Building from scratch would be significantly more work and would diverge from a maintained, community-vetted OAuth2 implementation
- Better Auth has 28K+ stars, 480+ contributors, active maintenance, and a growing plugin ecosystem
- Security patches and protocol compliance updates come from the community, not from us

**Rejected alternative: fork Better Auth.** This would create the same divergence problem auther had. We keep a thin adapter layer and contribute upstream when possible.

**Rejected alternative: build OAuth2 server from scratch.** OAuth2 has many edge cases (PKCE, CSRF state validation, redirect URI matching, refresh token replay prevention, consent flows, prompt handling, scope narrowing). Better Auth has already solved these.

### 5.2 Decision: Use `oauthProvider`, Not `oidcProvider`

**Recommended:** Use `@better-auth/oauth-provider` (OAuth 2.1), not `better-auth/plugins` `oidcProvider`.

**Rationale:**
- `oidcProvider` is deprecated. The maintainer plans to remove it.
- `oidcProvider` only produces opaque access tokens — requiring a DB lookup on every API call. `oauthProvider` produces JWKS-signed JWT access tokens when the `resource` param is provided.
- `oidcProvider` lacks `client_credentials` grant (M2M). `oauthProvider` has it built-in.
- `oidcProvider` lacks RFC 8707 resource indicators, RFC 9470 protected resource metadata, pairwise subjects, `prompt=create`, `prompt=select_account`, and RP-initiated logout.
- The auther project was stuck on `oidcProvider` — this is exactly the divergence we are avoiding.

**Tradeoff:** `oauthProvider` requires the `jwt` plugin to be enabled by default (for JWKS-signed `id_tokens`). This is acceptable — we want JWKS signing anyway.

### 5.3 Decision: Use `organization` Plugin For Tenants

**Recommended:** Use Better Auth's built-in `organization` plugin for tenant scoping.

**Rationale:**
- Provides org CRUD, member management, invitations, team hierarchies, RBAC roles, and active organization on session — all out of the box
- Integrates with `oauthProvider` via `clientReference` — OAuth clients are scoped to an organization immutably
- Integrates with `oauthProvider` via `postLogin` — org-scoped scopes trigger org selection flow during OAuth authorization
- Maintained upstream — bug fixes and improvements come from the community

**What we lose vs auther's custom auth spaces:**
- No custom `full_access` bypass logic — the `owner`/`admin` roles serve the same purpose
- No entity type models per space (that was part of ReBAC which is deferred)
- No custom permission checks at the space level (the organization's RBAC handles this)

**Rejected alternative: build custom tenant system.** This was auther's approach. It gave fine control but caused incompatibility with upstream Better Auth changes. Using the built-in plugin keeps us on the upgrade path.

### 5.4 Decision: JWT Access Tokens Via `resource` Parameter

**Recommended:** API-facing tokens use the `resource` parameter to get JWKS-signed JWTs. Web-app-facing tokens use opaque (default).

**Rationale:**
- JWT tokens allow local verification on resource servers — no introspection call, no DB lookup. This is critical for latency and availability.
- Opaque tokens are instantly revocable — better for user-facing sessions where you want kill-switch capability.
- The `resource` parameter cleanly separates these: APIs always request their audience, web apps don't.
- This matches Auth0's recommended pattern.
- Better Auth's RFC 8707 support means multiple audiences can be requested and narrowed at token exchange time.

**Token format per use case:**

| Use Case | `resource` param? | Token format | Verification |
|---|---|---|---|
| User logging into a web app | No | Opaque | No verification needed (session cookie) |
| API called by SPA (with token) | Yes — `resource=https://api.example.com` | JWT | Local JWKS verification |
| Backend calling another backend (M2M) | Yes — `resource=https://internal.example.com` | JWT | Local JWKS verification |

**Important: opaque is still the default.** JWT is only issued when the client explicitly passes `resource`. This is a deliberate security design by Better Auth. The maintainer stated: *"A JWT access token is actually not the default. The default is still an opaque token. A JWT-formatted token is only provided when the `resource` parameter is set."*

### 5.5 Decision: M2M Via `client_credentials`, Not `apiKey`

**Recommended:** Use the `oauthProvider`'s `client_credentials` grant for machine-to-machine authentication.

**Rationale:**
- `client_credentials` provides short-lived JWKS-verifiable JWT access tokens. `apiKey` provides long-lived opaque keys that require a separate exchange endpoint.
- `client_credentials` benefits from signing key rotation, centralized revocation (`/oauth2/revoke`), and scope-based access control.
- The Better Auth maintainer explicitly recommends this: *"I do recommend to utilize the client_credentials grant (ie M2M tokens) through this plugin instead [of the apiKey plugin]. It provides similar functionality except it benefits with short-lived access tokens in JWKS-verifiable JWT format, signing key rotation, centralized revocation, etc."*
- OIDC scopes (`openid`, `profile`, `email`, `offline_access`) are forbidden for `client_credentials` — the grant is explicitly designed for M2M, not user auth.
- The client for `client_credentials` is an OAuth2 client — meaning it's managed through the same UI and access control as user-facing clients.

**Rejected alternative: `apiKey` plugin.** It would require a separate management UI, separate exchange logic, and doesn't benefit from the OAuth2 revocation and rotation infrastructure.

### 5.6 Decision: UI-First Management (Not Config-First)

**Recommended:** All entity management — organizations, OAuth2 clients, resource servers — happens through an admin UI backed by Better Auth server APIs. Not through config files or environment variables.

**Rationale:**
- This matches Auth0's UX: login to dashboard, create clients, manage tenants visually.
- Better Auth exposes full CRUD APIs for all entities. The config file (`betterAuth({...})`) is for initialization only — runtime entities are managed via API calls.
- The `clientPrivileges` callback gates admin operations by role.
- This is the explicit requirement: *"UI first, not config first — support all types of OAuth2 client creation on UI... like auth0."*

**What stays in config:**
- Plugin initialization (`organization()`, `oauthProvider({...})`, `jwt()`)
- `validAudiences` (though these could be migrated to a DB-sourced approach later)
- `trustedClients` (first-party apps with skip_consent)
- Environment variables (secrets, URLs)

**What lives in the UI:**
- Organization CRUD
- OAuth2 client CRUD (create, update, rotate secret, delete, disable)
- Resource server definitions (custom table — see 6.2)
- User management
- Consent management (view/revoke per-user client authorizations)

### 5.7 Decision: Defer ReBAC And ABAC

**Recommended:** Do NOT build ReBAC (Zanzibar graph) or ABAC (Lua policy engine) in the first batch.

**Context from research:**

- Better Auth has no ReBAC or ABAC support. Community has been asking (issue #2167, opened Apr 2025) but no roadmap commitment.
- An Enterprise IAM proposal (issue #9190, opened Apr 2026) proposes AWS IAM-style policies with Allow/Deny, condition operators, STS, federation, and audit. This is labeled `enhancement` but has zero implementation.
- The organization plugin rewrite (PR #7251) is modularizing access control but remains RBAC-only. The author confirmed ReBAC is "a possibility after this PR" — not a commitment and not imminent.
- Running a Lua engine (Wasmoon) on Cloudflare Workers is impractical: 128MB memory limit, 20 engines × 5MB each = 100MB baseline, before any business logic.
- Auth0's own authorization model stops at RBAC + scopes + custom claims. They do NOT provide Zanzibar or embedded Lua scripting.

**What we do instead (first batch):**

- Flat RBAC via the organization plugin's `createAccessControl` + role assertions
- Scope-based API access control
- `org_id` + `role` + `plan` claims embedded in JWT — each API does its own authorization check

**Re-evaluation triggers (later batch):**

- Concrete use case where a user needs different permissions on different entities within the same org
- Customer demand for group-based nested permissions beyond org→team hierarchy
- Performance data showing the flat RBAC model is insufficient

**If we must add it later:** Build as a standalone service or custom Better Auth plugin. The `organization` plugin's hook system (`organizationHooks`) gives enough interception points to layer ReBAC on top without modifying BA internals.

### 5.8 Decision: Defer Custom Pipeline/Lua Engine

**Recommended:** Do NOT build the DAG pipeline system or Lua scripting engine in the first batch.

**Context:**

- The auther pipeline had 16 hooks across 3 groups (authentication, API key, OAuth client) with DAG-based parallel execution and a visual editor.
- Better Auth provides callback-based injection points (`customAccessTokenClaims`, `customTokenResponseFields`, `customIdTokenClaims`, `customUserInfoClaims`, `clientPrivileges`, `organizationHooks`, plugin hooks) that cover the *enrichment* use case.
- The *blocking* use case (abort auth flow based on custom logic) is covered by throwing errors in the appropriate callback.
- Lua engine viability on Workers is questionable (128MB memory, Wasmoon pool overhead).

**What the callbacks cover vs the old pipeline:**

| Old Pipeline Hook | Better Auth Equivalent |
|---|---|
| `before_signup`, `after_signup` | `organizationHooks` + core hooks |
| `before_signin`, `after_signin` | Hooks on sign-in endpoints |
| `token_build` (enrich JWT) | `customAccessTokenClaims` + `customIdTokenClaims` + `customTokenResponseFields` |
| `client_before_register` | `clientPrivileges` callback |
| `client_before_authorize` | Custom logic in `shouldRedirect` callbacks |
| Pipeline enrichment → response | `customTokenResponseFields` |
| Pipeline blocking → abort | Throw error in any callback |

**What's lost:** The visual DAG editor, the CodeMirror scripting interface, the OpenTelemetry tracing for pipeline steps. These are developer experience features, not runtime requirements.

### 5.9 Decision: Defer Webhooks To Later Batch

**Recommended:** Do NOT build the webhook system in the first batch.

**Context:**

- Auther had 20 event types, QStash-queued delivery, HMAC-SHA256 signing, multi-endpoint subscriptions.
- Better Auth has no built-in webhook system.
- On Cloudflare Workers, QStash is still available but has a different integration pattern.
- No downstream services currently depend on auth webhooks (PayloadCMS inbound webhook integration can be handled via a separate mechanism).

**What we do instead (first batch):**
- Rely on direct API calls for any integration needs
- Use Better Auth hooks if inline actions are needed on auth events

### 5.10 Decision: Defer Custom Onboarding Flows

**Recommended:** Do NOT build custom registration contexts, invite token systems, or automatic permission grant flows in the first batch.

**Context:**

- Auther had platform contexts (origin-restricted or invite-only signup), client contexts (permission grants on first OAuth authorization), HMAC-signed invite tokens with 7-day expiry.
- Better Auth's `organization` plugin has a basic invitation system (`inviteMember`, `acceptInvitation`, `rejectInvitation`) with configurable expiry.
- The `prompt=create` flow covers the sign-up-during-OAuth use case.

**What we use (first batch):**
- Standard sign-up via email/password
- Org invitations via the built-in `organization` plugin
- `prompt=create` for sign-up-during-authorization

## 6. Data Model

### 6.1 Tables Owned By Better Auth

These tables are created and managed by Better Auth core and plugins. We do not modify their structure beyond `additionalFields`. Migration is handled by BA's CLI or programmatic migration.

**Core tables:**
- `user` — user accounts (email, name, emailVerified, etc.)
- `session` — active sessions with token, expiry, IP, user agent
- `account` — linked OAuth accounts (Google, GitHub, etc.)
- `verification` — email verification tokens

**Organization plugin tables:**
- `organization` — org name, slug, metadata
- `member` — user→org membership with role
- `invitation` — pending email invitations with expiry
- `team`, `teamMember` (optional — if teams enabled)
- `organizationRole` (optional — if dynamic access control enabled)

**OAuth provider plugin tables:**
- `oauthClient` — OAuth2 clients with client_secret, redirect_uris, scopes, grant_types, referenceId, etc.
- `oauthAccessToken` — hashed access tokens
- `oauthRefreshToken` — hashed refresh tokens
- `oauthConsent` — recorded user consents per client+scope

**JWT plugin tables:**
- `jwks` — signing key pairs with `expiresAt` for rotation

**Session extensions (added by plugins):**
- `session.activeOrganizationId` — active organization
- `session.activeTeamId` — active team (if teams enabled)

### 6.2 Custom Tables (For Extension Hooks And Future ReBAC)

These tables are separate from Better Auth's schema. They use foreign key references to BA's tables and are managed by our own migration process. Better Auth does not touch them.

**First batch tables:**

#### `resource_servers`
| Column | Type | Description |
|---|---|---|
| `id` | text (PK) | UUID |
| `organization_id` | text (FK → organization.id) | Owning org |
| `name` | text | Display name |
| `description` | text | Human-readable description |
| `audience` | text | The `aud` value for JWT tokens (e.g., `https://api.example.com`) |
| `created_at` | integer | Unix timestamp |
| `updated_at` | integer | Unix timestamp |

This table is **management convenience only** — it feeds the admin UI and provides metadata. The actual audience enforcement happens through `validAudiences` in the `oauthProvider` config. Initially, `validAudiences` is populated from this table at startup. A future enhancement could make it dynamic.

**Deferred tables (for ReBAC — later batch):**

#### `groups`
| Column | Type | Description |
|---|---|---|
| `id` | text (PK) | UUID |
| `organization_id` | text (FK → organization.id) | Owning org |
| `name` | text | Group name |
| `parent_group_id` | text (FK → groups.id, nullable) | Parent for hierarchy |
| `created_at` | integer | Unix timestamp |

#### `group_memberships`
| Column | Type | Description |
|---|---|---|
| `id` | text (PK) | UUID |
| `group_id` | text (FK → groups.id) | Group |
| `user_id` | text (FK → user.id) | User |

#### `access_tuples`
| Column | Type | Description |
|---|---|---|
| `id` | text (PK) | UUID |
| `organization_id` | text (FK → organization.id) | Owning org |
| `subject_type` | text | `"user"` or `"group"` |
| `subject_id` | text | ID of user or group |
| `relation` | text | e.g., `"owner"`, `"editor"`, `"viewer"` |
| `entity_type` | text | e.g., `"project"`, `"post"` |
| `entity_id` | text | ID of the entity, or `"*"` for wildcard |
| `created_at` | integer | Unix timestamp |

#### `authorization_models`
| Column | Type | Description |
|---|---|---|
| `id` | text (PK) | UUID |
| `organization_id` | text (FK → organization.id) | Owning org |
| `entity_type` | text | Entity type name |
| `relations` | text (JSON) | Relation definitions with union chains |
| `created_at` | integer | Unix timestamp |

**ABAC tables (even further future):**
- `abac_policies` — Lua/JS policy scripts per org
- `abac_audit_logs` — evaluation audit trail

### 6.3 Schema Extension Safety

**Pattern: Never modify BA tables. Extend via `additionalFields` only for metadata.**

```ts
// Safe — BA expects this
betterAuth({
  user: {
    additionalFields: {
      platformRole: { type: ["superadmin", "admin"], required: false, defaultValue: "admin", input: false },
    },
  },
})

// Safe — organization plugin supports additionalFields natively
organization({
  schema: {
    organization: {
      additionalFields: {
        plan: { type: "string", required: false, input: true },
        logoUrl: { type: "string", required: false, input: true },
      },
    },
  },
})
```

**What to avoid:**

- Adding columns to `oauthClient`, `oauthAccessToken`, or `jwks` via raw SQL — these tables may change schema between BA versions
- Renaming BA-managed columns — type inference in BA uses original names
- Direct writes to BA tables — always use BA's API calls

**If we need data BA doesn't store:** Create a separate custom table with a FK reference to the BA table's ID column. The `id` column format is very unlikely to change.

## 7. API Surface

### 7.1 Better-Auth-Provided Endpoints

All paths are under the configured `basePath` (default `/api/auth`).

**Core auth:**
- `POST /sign-up/email`
- `POST /sign-in/email`
- `POST /sign-out`
- `GET /get-session`
- `POST /forget-password`
- `POST /reset-password`
- `POST /change-email`
- `POST /change-password`
- `GET /list-sessions`
- `POST /revoke-session`

**OAuth2/OIDC (oauthProvider):**
- `GET /oauth2/authorize` — authorization endpoint
- `POST /oauth2/token` — token endpoint (authorization_code, client_credentials, refresh_token)
- `POST /oauth2/register` — dynamic client registration (RFC 7591)
- `POST /oauth2/introspect` — token introspection (RFC 7662)
- `POST /oauth2/revoke` — token revocation (RFC 7009)
- `GET /userinfo` — user info endpoint
- `GET /oauth2/consent` — consent page data
- `POST /oauth2/consent` — submit consent
- `POST /oauth2/continue` — continue after account selection / signup / post-login
- `GET /jwks` — JSON Web Key Set (at configured `jwksPath`, set to `/.well-known/jwks.json` for OIDC compliance)
- `GET /oauth2/get-client` — get one OAuth client
- `GET /oauth2/get-client-public` — get public client info for login pages
- `GET /oauth2/get-clients` — list OAuth clients
- `POST /oauth2/create-client` — create OAuth client
- `POST /oauth2/update-client` — update OAuth client
- `POST /oauth2/client/rotate-secret` — rotate client secret
- `POST /oauth2/delete-client` — delete OAuth client
- `POST /admin/oauth2/create-client` — admin create with privileged fields

**Organization:**
- `POST /organization/create`
- `POST /organization/update`
- `POST /organization/delete`
- `GET /organization/list`
- `GET /organization/get-full-organization`
- `POST /organization/check-slug`
- `POST /organization/set-active`
- `POST /organization/leave`
- `GET /organization/get-active-member`
- `GET /organization/list-members`
- `POST /organization/remove-member`
- `POST /organization/update-member-role`
- `POST /organization/invite-member`
- `GET /organization/get-invitation`
- `GET /organization/list-invitations`
- `GET /organization/list-user-invitations`
- `POST /organization/accept-invitation`
- `POST /organization/reject-invitation`
- `POST /organization/cancel-invitation`
- `POST /organization/has-permission`

**Admin:**
- `POST /admin/ban-user`
- `POST /admin/unban-user`
- `POST /admin/impersonate-user`
- `POST /admin/stop-impersonating`
- `GET /admin/list-users`

### 7.2 Well-Known Metadata Endpoints

These are implemented as static routes on the auth Worker:

- `/.well-known/oauth-authorization-server` — RFC 8414 metadata
- `/.well-known/openid-configuration` — OIDC discovery (when `openid` scope is used)
- `/.well-known/jwks.json` — JWKS endpoint (requires configuring `jwksPath` on the `jwt` plugin; otherwise JWKS lives at the default `/api/auth/jwks`)

Implemented using BA helpers:

```ts
// /.well-known/oauth-authorization-server/route.ts
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";
export const GET = oauthProviderAuthServerMetadata(auth);

// /.well-known/openid-configuration/route.ts
import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";
export const GET = oauthProviderOpenIdConfigMetadata(auth);
```

And the `jwt` plugin must be configured to serve JWKS at the standard location:

```ts
jwt({
  jwks: {
    jwksPath: "/.well-known/jwks.json", // default is /jwks relative to basePath
  }
})
```

### 7.3 Custom Admin API

Custom endpoints for managing entities not covered by Better Auth's built-in API:

- `GET /api/admin/resource-servers` — list resource servers
- `POST /api/admin/resource-servers` — create resource server
- `PUT /api/admin/resource-servers/:id` — update resource server
- `DELETE /api/admin/resource-servers/:id` — delete resource server
- `GET /api/admin/dashboard` — aggregated metrics (user count, org count, client count, token volume)
- `GET /api/admin/metrics/token-usage` — time-series token issuance data

These are implemented as custom Better Auth plugins (using `createAuthEndpoint`) or as separate Worker routes that query D1 directly (using the `getAuth(c)` pattern for session validation).

## 8. Deployment Architecture

### 8.1 Worker Topology

**Single Worker approach (first batch):** One Cloudflare Worker serves both the auth API and the admin UI. This is the simplest deployment model.

```
Cloudflare Worker (id-worker)
├── /api/auth/*           → Better Auth handler (all auth, OAuth, org endpoints)
├── /.well-known/*        → OAuth metadata endpoints
├── /api/admin/*          → Custom admin API
├── /admin/*              → Admin UI (React SPA or Next.js static export)
├── /sign-in              → Sign-in page
├── /sign-up              → Sign-up page
├── /consent              → OAuth consent page
├── /select-account        → Account selection page
├── /select-organization   → Post-login org selection page
├── /reset-password        → Password reset page
└── /oauth-consent         → OAuth consent page (alias)
```

**Bindings:**
- `DB` — D1Database
- `KV` — Workers KV (for secondary storage: rate limiting, session cache)
- `BETTER_AUTH_SECRET` — secret (rotatable)
- `BETTER_AUTH_URL` — the Worker's public URL
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — social providers (optional)

**Framework choice:** Hono is the recommended framework for Cloudflare Workers + Better Auth. It provides native `c.env` binding access, middleware patterns, and route grouping. Alternative: bare `workers-types` with Better Auth handlers.

### 8.2 D1 Constraints And Mitigations

| Constraint | Impact | Mitigation |
|---|---|---|
| No interactive transactions | Token issuance does multiple DB writes. If one fails, partial state is possible. | D1's `batch()` for sequential writes. Better Auth's token operations are designed to be idempotent-ish. |
| Per-request binding access | Cannot create static `auth` instance at module scope | Use `getAuth(c)` or `auth.with(env)` pattern — export a function, not an instance |
| CLI cannot access remote D1 | `npx @better-auth/cli generate` can't introspect remote DB | Use `getPlatformProxy()` for local schema generation, then deploy migrations |
| `_cf_METADATA` table access denied | Kysely introspection tries to read it | Community workarounds exist; the D1 dialect handles this |
| 128MB Worker memory | Constraint for any in-memory cache or heavy computation | Keep LRU caches small (< 10MB). This is a significant constraint if we later add Wasmoon/Lua. |

### 8.3 CLI And Migration Workflow

Better Auth's CLI expects a static `auth` export. Since D1 bindings are per-request, we need a dual-config approach:

**For local development and schema generation:**

```ts
// lib/auth-static.ts (used by CLI only)
import { getPlatformProxy } from "wrangler";
const { env } = await getPlatformProxy();
export const auth = betterAuth({
  database: env.DB,
  // ... rest of config
});
```

**For runtime (Cloudflare Workers):**

```ts
// lib/auth.ts
export const getAuth = (c: Context) => betterAuth({
  database: c.env.DB,
  baseURL: new URL(c.req.url).origin,
  // ... rest of config (same as static)
});
```

**Migration commands:**
1. `npx @better-auth/cli generate --config lib/auth-static.ts` — generate schema
2. `wrangler d1 migrations apply` — apply to local/remote D1
3. Programmatic migrations endpoint as fallback

### 8.4 JWKS Key Rotation

JWKS rotation is **built into the `jwt` plugin** (since PR #6147, v1.5). No cron job, no external process needed.

```ts
jwt({
  jwks: {
    jwksPath: "/.well-known/jwks.json",  // expose at OIDC-standard location
    rotationInterval: 60 * 60 * 24 * 30, // rotate every 30 days
    gracePeriod: 60 * 60 * 24 * 7,       // old key valid 7 more days
  }
})
```

**How it works:**
- Keys are stored in the `jwks` D1 table with an `expiresAt` timestamp
- When `rotationInterval` elapses since the last key was created, a new key pair is generated lazily on the next signing request
- Old keys remain valid for `gracePeriod` seconds — existing tokens signed with the old key continue to verify
- The `/jwks` endpoint (or configured `jwksPath`) returns only non-expired keys (within their grace period)
- Each JWT header includes a `kid` (key ID), so verifiers can match the signing key

**Important:** You MUST set `rotationInterval`. Without it, Better Auth may create a new key on every request (this was a known bug in 1.3.x, fixed in 1.4.1, but the behavior is still undefined without explicit configuration).

**Non-destructive secret rotation** is also built-in (v1.5):

```ts
betterAuth({
  secret: ["current-secret", "previous-secret", "even-older-secret"]
})
```

Old secrets stay available for decryption during transition. Rotate by prepending a new secret and removing the oldest after the grace period.

**Known issue:** JWKS keys are queried from the database on every session read — there is no caching (issue #3954). Mitigated by the fact that signing keys change very infrequently (30-day rotation). On Workers, the small overhead of a D1 read per session is acceptable at typical scale.

## 9. Auth Flow Walkthroughs

### 9.1 User Authorization Code Flow (SPA/Mobile)

```
SPA/Mobile App                        Auth Server                         Resource Server
     │                                     │                                     │
     │  1. GET /oauth2/authorize           │                                     │
     │     ?response_type=code             │                                     │
     │     &client_id=app_123              │                                     │
     │     &redirect_uri=https://app/cb    │                                     │
     │     &scope=openid+profile+read:posts│                                     │
     │     &code_challenge=<S256>          │                                     │
     │     &code_challenge_method=S256     │                                     │
     │     &resource=https://api.example.c │                                     │
     │     &state=<random>                 │                                     │
     │ ──────────────────────────────────> │                                     │
     │                                     │  Validate client, redirect_uri,     │
     │                                     │  scopes, PKCE, resource             │
     │                                     │                                     │
     │  302 → /sign-in?<params>            │                                     │
     │ <────────────────────────────────── │                                     │
     │                                     │                                     │
     │  User signs in                      │                                     │
     │                                     │                                     │
     │                                     │  (if org-scoped scopes:             │
     │                                     │   postLogin redirect → org select)  │
     │                                     │                                     │
     │  302 → /consent?<params>            │                                     │
     │ <────────────────────────────────── │                                     │
     │                                     │                                     │
     │  User consents to scopes            │                                     │
     │                                     │                                     │
     │  302 → https://app/cb?code=<code>   │                                     │
     │     &state=<random>                 │                                     │
     │ <────────────────────────────────── │                                     │
     │                                     │                                     │
     │  2. POST /oauth2/token              │                                     │
     │     grant_type=authorization_code   │                                     │
     │     &code=<code>                    │                                     │
     │     &code_verifier=<verifier>       │                                     │
     │     &resource=https://api.example.c │                                     │
     │ ──────────────────────────────────> │                                     │
     │                                     │  Validate code, PKCE verifier,      │
     │                                     │  resource (subset of authorized).   │
     │                                     │  Issue JWKS-signed JWT access token │
     │                                     │  with aud=https://api.example.com   │
     │                                     │                                     │
     │  { access_token: <JWT>,             │                                     │
     │    token_type: "Bearer",            │                                     │
     │    expires_in: 3600,                │                                     │
     │    id_token: <JWT>,                 │                                     │
     │    refresh_token: <opaque>,         │                                     │
     │    scope: "openid profile ...",     │                                     │
     │    org_id: "org_xyz" }              │                                     │
     │ <────────────────────────────────── │                                     │
     │                                     │                                     │
     │  3. GET /api/posts                  │                                     │
     │     Authorization: Bearer <JWT>     │                                     │
     │ ────────────────────────────────────────────────────────────────────────> │
     │                                     │    Fetch JWKS from auth server       │
     │                                     │    Verify JWT signature, iss, aud,   │
     │                                     │    exp. Check scope=read:posts.      │
     │                                     │    Check org_id matches resource.    │
     │                                     │                                     │
     │  { posts: [...] }                   │                                     │
     │ <──────────────────────────────────────────────────────────────────────── │
```

### 9.2 M2M Client Credentials Flow

```
Backend Service                       Auth Server                         Resource Server
     │                                     │                                     │
     │  POST /oauth2/token                 │                                     │
     │  Authorization: Basic base64(cid:sec)│                                    │
     │  Content-Type: x-www-form-urlencoded│                                     │
     │  grant_type=client_credentials      │                                     │
     │  &scope=read:posts+write:posts      │                                     │
     │  &resource=https://api.example.com  │                                     │
     │ ──────────────────────────────────> │                                     │
     │                                     │  Validate client_id, client_secret. │
     │                                     │  Reject OIDC scopes (openid, etc.). │
     │                                     │  Issue JWKS-signed JWT access token │
     │                                     │  with aud=https://api.example.com   │
     │                                     │  No user context. No id_token.      │
     │                                     │                                     │
     │  { access_token: <JWT>,             │                                     │
     │    token_type: "Bearer",            │                                     │
     │    expires_in: 3600,                │                                     │
     │    scope: "read:posts write:posts"} │                                     │
     │ <────────────────────────────────── │                                     │
     │                                     │                                     │
     │  GET /api/posts                     │                                     │
     │  Authorization: Bearer <JWT>        │                                     │
     │ ────────────────────────────────────────────────────────────────────────> │
     │                                     │    Verify JWT locally via JWKS.     │
     │                                     │    sub = client_id (not a user).    │
     │  { posts: [...] }                   │                                     │
     │ <──────────────────────────────────────────────────────────────────────── │
```

**Key difference from user flow:** No `sub` claim mapping to a user. No `id_token`. No `openid`/`profile`/`email`/`offline_access` scopes allowed. The `sub` is the client ID itself. The token represents the application, not a user.

### 9.3 Post-Login Organization Selection Flow

This flow fires when OAuth scopes include org-scoped permissions (e.g., `read:organization`).

```
User's Browser                        Auth Server
     │                                     │
     │  GET /oauth2/authorize?...          │
     │  &scope=...read:organization        │
     │ ──────────────────────────────────> │
     │                                     │  User signs in
     │                                     │
     │                                     │  shouldRedirect() fires:
     │                                     │  "Does user have orgs?
     │                                     │   Is active org set?
     │                                     │   Multiple orgs?"
     │                                     │  → YES, need selection
     │                                     │
     │  302 → /select-organization?<params>│
     │ <────────────────────────────────── │
     │                                     │
     │  User selects "Acme Inc"            │
     │  Browser: authClient.setActive({    │
     │    organizationId: "org_acme"       │
     │  })                                 │
     │  Then: oauth2Continue({             │
     │    postLogin: true                  │
     │  })                                 │
     │ ──────────────────────────────────> │
     │                                     │  consentReferenceId() fires:
     │                                     │  returns session.activeOrganizationId
     │                                     │  → "org_acme" stored as referenceId
     │                                     │  on authorization code
     │                                     │
     │  302 → /consent?<params>            │
     │ <────────────────────────────────── │
     │                                     │
     │  User consents                      │
     │                                     │
     │  302 → app/cb?code=<code>           │
     │ <────────────────────────────────── │
     │                                     │
     │  (Later) POST /oauth2/token         │
     │ ──────────────────────────────────> │
     │                                     │  customAccessTokenClaims:
     │                                     │  { org_id: "org_acme" }
     │                                     │  → injected into JWT
     │  { access_token: <JWT with          │
     │    org_id=org_acme>, ... }          │
     │ <────────────────────────────────── │
```

**Configuration:**

```ts
oauthProvider({
  postLogin: {
    page: "/select-organization",
    shouldRedirect: async ({ session, scopes, headers }) => {
      const userOnlyScopes = ["openid", "profile", "email", "offline_access"];
      if (scopes.every(s => userOnlyScopes.includes(s))) return false;
      const organizations = await auth.api.listOrganizations({ headers });
      return organizations.length > 1 ||
        !(organizations.length === 1 &&
          organizations.at(0)?.id === session.activeOrganizationId);
    },
    consentReferenceId: ({ session, scopes }) => {
      if (scopes.includes("read:organization")) {
        return session.activeOrganizationId as string;
      }
      return undefined;
    },
  },
})
```

### 9.4 Account Selection Flow (prompt=select_account)

The client sends `prompt=select_account` to force an account picker screen, even if the user is already logged in. This is the equivalent of Auth0's "Account Chooser" or Google's multi-account picker.

```
Client sends:
GET /oauth2/authorize?prompt=select_account&...

Auth server:
  1. shouldRedirect() fires:
     "How many sessions on this device?"
     → Uses multiSession plugin to count device sessions
     → If > 1: redirect to /select-account page

Browser lands on /select-account:
  - Shows list of logged-in accounts on this device
  - User picks one
  - Browser calls: authClient.oauth2.oauth2Continue({ selected: true })
  - Auth server switches to that session
  - Flow resumes → consent → code → app callback
```

**Configuration:**

```ts
oauthProvider({
  selectAccount: {
    page: "/select-account",
    shouldRedirect: async ({ headers }) => {
      const allSessions = await auth.api.listDeviceSessions({ headers });
      return allSessions?.length > 1;
    },
  },
})
```

### 9.5 Sign-Up Flow (prompt=create)

The client sends `prompt=create` to redirect to a sign-up page instead of sign-in. After registration, the flow resumes.

```
Client sends:
GET /oauth2/authorize?prompt=create&...

Auth server:
  → Redirects to configured signup page
  → User completes registration
  → Browser calls: authClient.oauth2.oauth2Continue({ created: true })
  → Flow resumes with the new session → consent → code → app callback
```

**Configuration:**

```ts
oauthProvider({
  signup: {
    page: "/sign-up",
  },
})
```

### 9.6 Resource Server Token Verification Flow

The downstream API verifies JWT access tokens locally — no introspection call to the auth server needed.

```
Resource Server receives request:
  Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6ImtleV8xMjMifQ...

Verification steps:
  1. Decode JWT header. Get `kid` (key ID) and `alg` (algorithm).
  2. Check if public key for this `kid` is cached locally.
     - If yes → use cached key
     - If no → fetch GET /.well-known/jwks.json from auth server
              → cache the response (TTL: 1 hour recommended)
              → find key matching `kid`
  3. Verify JWT signature using the public key.
  4. Verify claims:
     - `iss` matches auth server URL (https://id.quanghuy.dev)
     - `aud` matches this API's audience (https://api.example.com)
     - `exp` is in the future
     - `nbf` is in the past (if present)
     - `iat` is not too far in the past (optional clock skew check)
  5. Extract `sub`, `org_id`, `client_id`, `scope`, `role` from JWT payload.
  6. Authorize: does the scope include the required permission?
     Does the org_id match the requested resource's owner?

If any check fails → 401 Unauthorized with WWW-Authenticate header
```

**Helper for verification (using Better Auth's built-in):**

```ts
import { verifyAccessToken } from "better-auth/oauth2";

const payload = await verifyAccessToken(accessToken, {
  verifyOptions: {
    issuer: "https://id.quanghuy.dev",
    audience: "https://api.example.com",
  },
  scopes: ["read:posts"], // optional — verify scope
});
```

**Without Better Auth (using any JWT library + JWKS fetch):**

1. Fetch `GET https://id.quanghuy.dev/.well-known/jwks.json`
2. Use `jose.createRemoteJWKSet(new URL('...'))` or manual JWKS parsing
3. Verify JWT with `jose.jwtVerify(token, JWKS)`
4. Assert claims manually (`payload.aud === 'https://api.example.com'`)

The JWKS response can be cached aggressively — signing keys rotate every 30 days.

## 10. Admin UI Requirements

The admin UI is a protected web application (served from the same Worker or a separate static site) that provides management surfaces for all entities.

**Pages (first batch):**

| Page | Route | Description |
|---|---|---|
| Dashboard | `/admin` | Metrics overview: user count, org count, active sessions, token issuance |
| Organizations | `/admin/organizations` | List, create, edit, delete organizations |
| Organization Detail | `/admin/organizations/:id` | Members, invitations, teams, settings |
| OAuth Clients | `/admin/clients` | List all clients, create new, view details |
| Client Detail | `/admin/clients/:id` | Client settings, rotate secret, disable, view redirect URIs |
| Resource Servers | `/admin/resource-servers` | List, create, edit, delete resource server definitions |
| Users | `/admin/users` | List users, view details, ban/unban, impersonate |
| User Detail | `/admin/users/:id` | User sessions, organization memberships, linked accounts |
| Consents | `/admin/consents` | View and revoke per-user client authorizations |
| Settings | `/admin/settings` | Application configuration (JWKS rotation status, secret rotation, etc.) |

**Access control for admin pages:**

- `superadmin` platform role → full access to all admin pages and cross-org operations
- `admin` platform role → access to admin pages within their own organization scope
- Organization `owner` → can manage that organization's clients, members, and settings

**Technology options for admin UI:**
- Next.js static export deployed alongside the Worker (on Cloudflare Pages or same Worker via Workers Sites)
- React SPA embedded in the Worker
- Hono JSX (lightweight, no framework overhead)

## 11. Edge Cases And Failure Modes

| Failure mode | Expected handling |
|---|---|
| D1 write fails mid-token-issuance | Token endpoint returns 500. Client retries. Partial state (access token created but refresh token not) is mitigated by idempotent-ish operations — the authorization code is consumed atomically. |
| JWKS endpoint unreachable | Resource server uses cached JWKS. If cache is cold (first request or key rotated during outage), return 503 with Retry-After header. Fallback to introspection endpoint if configured. |
| Signing key rotation happens while tokens are in flight | Grace period keeps old key valid for 7 days. Any token signed within the last rotation cycle is still verifiable. |
| User's active organization is deleted | Session's `activeOrganizationId` becomes a dangling reference. On next session read, clear the field or prompt user to select another org. |
| OAuth client's `referenceId` (org) is deleted | The client becomes orphaned — still exists but not scoped to any org. Admin UI should surface orphaned clients. Token issuance still works (the client exists), but `org_id` claims may be stale. |
| Same user authorizes the same client twice (re-consent) | New consent record. New authorization code. Previous tokens remain valid until expiry or revocation. |
| Refresh token replay | Better Auth implements refresh token replay prevention — each refresh_token is single-use. A replayed refresh token returns an error. |
| Client requests wider resource set at token endpoint than authorization | RFC 8707 narrowing rule: resource at `/token` must be subset of resource at `/authorize`. Wider set → `invalid_target` error. |
| Public client (no secret) + `disableJWTPlugin: true` | Public clients cannot receive `id_token` directly when JWT plugin is disabled. They must use `/userinfo` instead. This is enforced by the `oauthProvider`. |
| D1 `batch()` partially fails | D1 `batch()` is atomic — all statements succeed or none do. However, if multiple `batch()` calls are needed for a multi-step operation, the intermediate state may be lost. Structure operations to use single `batch()` calls where possible. |
| KV rate limit storage lag | KV is eventually consistent. Rate limit counters may be slightly inaccurate during high concurrency. Acceptable for auth rate limiting. |
| Worker cold start | D1 connection establishment on cold start. Better Auth's D1 dialect handles this. First request may be slightly slower (100-300ms). |

## 12. Definition Of Done

### Required implementation outcomes:

- [ ] Auth Worker deployed on Cloudflare Workers with D1 database
- [ ] User can sign up with email/password and verify email
- [ ] User can sign in and receive a session
- [ ] User can create an organization and becomes its owner
- [ ] Organization members can be invited and accept invitations
- [ ] Admin can create an OAuth2 confidential client via admin UI
- [ ] Admin can create an OAuth2 public client (SPA/mobile) via admin UI
- [ ] Admin can rotate an OAuth client's secret via admin UI
- [ ] Third-party SPA can complete authorization_code flow with PKCE S256
- [ ] SPA receives JWKS-signed JWT access token when `resource` param is provided
- [ ] SPA receives opaque access token when `resource` param is NOT provided
- [ ] Resource server (downstream API) can verify JWT locally using JWKS endpoint
- [ ] Backend service can authenticate via client_credentials grant (M2M)
- [ ] M2M token does not contain user context or OIDC scopes
- [ ] JWKS key rotation happens automatically on the configured interval
- [ ] Old JWKS keys remain valid during the grace period
- [ ] Consent screen is shown for non-trusted clients
- [ ] Trusted clients skip consent
- [ ] `prompt=select_account` works with multiple device sessions
- [ ] `prompt=create` redirects to sign-up page and resumes flow
- [ ] Post-login org selection flow works for org-scoped scopes
- [ ] `org_id` is injected into JWT claims via `customAccessTokenClaims`
- [ ] `org_id` is returned in token response envelope via `customTokenResponseFields`
- [ ] Admin UI is protected by platform role (`superadmin`/`admin`)
- [ ] Admin UI shows dashboard with user/org/client counts
- [ ] Admin UI allows CRUD of organizations, OAuth clients, resource servers
- [ ] Admin UI allows viewing and revoking consents
- [ ] UserInfo endpoint returns correct user data with `openid` scope
- [ ] Token introspection (`/oauth2/introspect`) returns valid/invalid for any token
- [ ] Token revocation (`/oauth2/revoke`) invalidates the token immediately
- [ ] Refresh token can be exchanged for a new access token
- [ ] Refresh token replay is prevented (single-use)
- [ ] `/.well-known/oauth-authorization-server` returns correct metadata
- [ ] `/.well-known/openid-configuration` returns correct metadata
- [ ] `/.well-known/jwks.json` returns signing keys

### Required automated verification:

- [ ] OAuth2 authorization_code flow end-to-end test (PKCE S256, token exchange, API call)
- [ ] OAuth2 client_credentials flow end-to-end test
- [ ] OAuth2 refresh_token flow end-to-end test
- [ ] Token revocation test (revoked token rejected by API)
- [ ] Admin UI access control tests (superadmin, admin, org owner, member)
- [ ] JWKS rotation test (old key valid during grace period, new key used for new tokens)
- [ ] Organization isolation test (user in org A cannot access org B's clients)
- [ ] Rate limit test (repeated auth attempts are throttled)

### Required documentation:

- [ ] API reference (all custom endpoints)
- [ ] OAuth2 integration guide for downstream APIs
- [ ] Admin UI user guide
- [ ] Deployment guide (Cloudflare Workers setup)
- [ ] Migration guide (from auther to new service)

## 13. Final Model

The new auth service is a Cloudflare Worker running Better Auth 1.6 with three primary plugins: `organization` (tenant scoping), `oauthProvider` (OAuth2.1/OIDC provider), and `jwt` (JWKS signing with rotation). It uses D1 for persistence and KV for rate limiting.

**Core data boundaries:**
- Organizations are the tenant boundary — OAuth clients, resource servers, and users are all scoped to an organization
- OAuth clients are managed via the admin UI backed by Better Auth's server API (not config files)
- Resource servers are defined as audiences (`validAudiences`) with a thin custom table for metadata
- JWT access tokens are issued with audience binding when the `resource` parameter is provided; opaque tokens otherwise
- Authorization is flat RBAC (organization roles + OAuth scopes) — no ReBAC or ABAC in the first batch

**What this replaces from auther:**
- Custom auth space system → Better Auth `organization` plugin
- Custom OIDC provider + token bridge → Better Auth `oauthProvider` with native JWT
- Custom JWKS rotation cron → Built-in `jwt` plugin rotation
- Custom consent flow → Built-in consent with per-client skip_consent
- Custom account picker → `prompt=select_account` with multi-session
- Custom API key exchange → `client_credentials` grant
- Custom pipeline system → Callback-based injection (`customAccessTokenClaims`, `customTokenResponseFields`, hooks)

**What is deferred to later batches:**
- ReBAC (Zanzibar graph authorization with BFS subject expansion)
- ABAC (attribute-based policy engine, Lua or JS)
- Pipeline/hook scripting engine (DAG editor, OpenTelemetry tracing)
- Webhook delivery system
- Custom onboarding flows (registration contexts, invite tokens)

**Deployment footprint:** One Cloudflare Worker + one D1 database + one KV namespace. No external services required for core auth. Email sending (for verification and password reset) will need an external provider (Resend or similar).
