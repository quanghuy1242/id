# id — First Batch Architecture And Planning

> Status: implementation-grade research and proposal, rewritten after source review
>
> Date: 2026-05-19
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — new IdP repo, package name and public product name still expected to be `id`
> - `/home/quanghuy1242/pjs/auther` — prior IdP used only as local evidence and design context; `id` does not need to be compatible with it
>
> Source docs and verification inputs:
>
> - Better Auth docs — `https://better-auth.com/docs`
> - Better Auth OAuth Provider plugin — `https://better-auth.com/docs/plugins/oauth-provider`
> - Better Auth Organization plugin — `https://better-auth.com/docs/plugins/organization`
> - Better Auth JWT plugin — `https://better-auth.com/docs/plugins/jwt`
> - Better Auth npm package metadata checked on 2026-05-19: `better-auth@1.6.11`, `@better-auth/oauth-provider@1.6.11`
> - Cloudflare D1 Worker API docs — `https://developers.cloudflare.com/d1/worker-api/d1-database/`
> - Cloudflare Workers limits — `https://developers.cloudflare.com/workers/platform/limits/`
> - Cloudflare KV API docs — `https://developers.cloudflare.com/kv/api/read-key-value-pairs/`
> - Cloudflare KV write limits — `https://developers.cloudflare.com/kv/platform/limits/`
> - OAuth 2.0 Resource Indicators, RFC 8707 — `https://www.rfc-editor.org/rfc/rfc8707`
>
> Related local files:
>
> - `/home/quanghuy1242/pjs/auth/README.md`
> - `/home/quanghuy1242/pjs/auther/package.json`
> - `/home/quanghuy1242/pjs/auther/src/lib/auth.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/app-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/rebac-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/pipeline-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/abac-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/platform-access-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/lib/auth/permission-service.ts`
> - `/home/quanghuy1242/pjs/auther/src/lib/auth/lua-engine-pool.ts`
> - `/home/quanghuy1242/pjs/auther/src/lib/webhooks/delivery-service.ts`
> - `/home/quanghuy1242/pjs/auther/src/lib/constants.ts`
>
> Assumptions:
>
> - Cloudflare Workers is the deployment target, not Vercel.
> - D1 is the primary database and must be treated as SQLite-compatible but not equivalent to a long-lived Node database connection.
> - Better Auth remains the auth foundation for the first batch.
> - The first batch excludes ReBAC, ABAC/Lua, custom pipeline scripting, webhooks, and custom onboarding flows. Those exclusions are deliberate architecture decisions in Section 5 and should not be re-opened in this batch.
> - The first batch should be UI-first for runtime management, with code/config reserved for bootstrapping and platform-level invariants.
> - Work-item tracking sections are intentionally omitted from this document.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Review Verdict](#2-review-verdict)
  - [2.1 What Was Correct](#21-what-was-correct)
  - [2.2 What Needed Correction](#22-what-needed-correction)
  - [2.3 Remaining Confidence Level](#23-remaining-confidence-level)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 New `auth` Repo State](#31-new-auth-repo-state)
  - [3.2 Prior `auther` State](#32-prior-auther-state)
  - [3.3 Better Auth 1.6.11 Capability Boundary](#33-better-auth-1611-capability-boundary)
  - [3.4 Cloudflare Workers, D1, And KV Constraints](#34-cloudflare-workers-d1-and-kv-constraints)
- [4. Target Model](#4-target-model)
  - [4.1 Runtime Shape](#41-runtime-shape)
  - [4.2 Tenant Model](#42-tenant-model)
  - [4.3 OAuth Client Model](#43-oauth-client-model)
  - [4.4 Resource Server Model](#44-resource-server-model)
  - [4.5 Token Model](#45-token-model)
  - [4.6 Authorization Model](#46-authorization-model)
  - [4.7 User And Admin Model](#47-user-and-admin-model)
  - [4.8 Non-Negotiable Invariants](#48-non-negotiable-invariants)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Decision: Build On Better Auth, Not From Scratch](#51-decision-build-on-better-auth-not-from-scratch)
  - [5.2 Decision: Use `oauthProvider`, Not `oidcProvider`](#52-decision-use-oauthprovider-not-oidcprovider)
  - [5.3 Decision: Use `organization` Plugin For Tenants](#53-decision-use-organization-plugin-for-tenants)
  - [5.4 Decision: JWT Access Tokens Via `resource` Parameter](#54-decision-jwt-access-tokens-via-resource-parameter)
  - [5.5 Decision: M2M Via `client_credentials`, Not `apiKey`](#55-decision-m2m-via-client_credentials-not-apikey)
  - [5.6 Decision: UI-First Management, Not Config-First](#56-decision-ui-first-management-not-config-first)
  - [5.7 Decision: Defer ReBAC And ABAC](#57-decision-defer-rebac-and-abac)
  - [5.8 Decision: Defer Custom Pipeline/Lua Engine](#58-decision-defer-custom-pipelinelua-engine)
  - [5.9 Decision: Defer Webhooks To Later Batch](#59-decision-defer-webhooks-to-later-batch)
  - [5.10 Decision: Defer Custom Onboarding Flows](#510-decision-defer-custom-onboarding-flows)
- [6. Data Model](#6-data-model)
  - [6.1 Better-Auth-Owned Tables](#61-better-auth-owned-tables)
  - [6.2 Custom First-Batch Tables](#62-custom-first-batch-tables)
  - [6.3 Schema Extension Rules](#63-schema-extension-rules)
- [7. API Surface](#7-api-surface)
  - [7.1 Better Auth Routes](#71-better-auth-routes)
  - [7.2 Well-Known Metadata Routes](#72-well-known-metadata-routes)
  - [7.3 Custom Admin Routes](#73-custom-admin-routes)
- [8. Deployment Architecture](#8-deployment-architecture)
  - [8.1 Worker Topology](#81-worker-topology)
  - [8.2 Better Auth Factory Pattern](#82-better-auth-factory-pattern)
  - [8.3 Migration Workflow](#83-migration-workflow)
  - [8.4 JWKS Rotation](#84-jwks-rotation)
- [9. Auth Flow Walkthroughs](#9-auth-flow-walkthroughs)
  - [9.1 Authorization Code + PKCE](#91-authorization-code--pkce)
  - [9.2 Client Credentials](#92-client-credentials)
  - [9.3 Post-Login Organization Selection](#93-post-login-organization-selection)
  - [9.4 `prompt=select_account`](#94-promptselect_account)
  - [9.5 `prompt=create`](#95-promptcreate)
  - [9.6 Resource Server Verification](#96-resource-server-verification)
- [10. Admin UI Requirements](#10-admin-ui-requirements)
- [11. Pre-Implementation Spikes And Quality Gates](#11-pre-implementation-spikes-and-quality-gates)
  - [11.1 OAuth Provider Contract Spike](#111-oauth-provider-contract-spike)
  - [11.2 Resource Audience Strategy Spike](#112-resource-audience-strategy-spike)
  - [11.3 D1 Schema And Migration Spike](#113-d1-schema-and-migration-spike)
  - [11.4 JWKS And Secret Rotation Spike](#114-jwks-and-secret-rotation-spike)
  - [11.5 Admin Authorization Spike](#115-admin-authorization-spike)
- [12. Implementation Plan](#12-implementation-plan)
  - [12.1 Foundation](#121-foundation)
  - [12.2 Auth Core](#122-auth-core)
  - [12.3 OAuth Provider](#123-oauth-provider)
  - [12.4 Admin UI](#124-admin-ui)
  - [12.5 Resource Server Integration](#125-resource-server-integration)
  - [12.6 Deployment Hardening](#126-deployment-hardening)
- [13. Security And Privacy Model](#13-security-and-privacy-model)
  - [13.1 Secret Handling](#131-secret-handling)
  - [13.2 Token Security](#132-token-security)
  - [13.3 Admin Security](#133-admin-security)
  - [13.4 Data Privacy](#134-data-privacy)
- [14. Operational Model](#14-operational-model)
  - [14.1 Observability](#141-observability)
  - [14.2 Runbooks](#142-runbooks)
  - [14.3 Capacity And Performance Targets](#143-capacity-and-performance-targets)
- [15. Independent Rollout](#15-independent-rollout)
  - [15.1 Relationship To `auther`](#151-relationship-to-auther)
  - [15.2 Rollout Sequence](#152-rollout-sequence)
  - [15.3 Rollback Strategy](#153-rollback-strategy)
- [16. Risks, Edge Cases, And Failure Modes](#16-risks-edge-cases-and-failure-modes)
- [17. Test And Verification Plan](#17-test-and-verification-plan)
- [18. Definition Of Done](#18-definition-of-done)
- [19. Final Model](#19-final-model)

## 1. Goal

Build a new centralized Identity Provider. It uses lessons from `/home/quanghuy1242/pjs/auther`, but it is a separate service with its own data model, clients, issuer, and operational lifecycle.

The new service should run on Cloudflare Workers with D1, use Better Auth as the auth foundation, and provide Auth0-like management flows for:

- email/password identity and sessions;
- organizations as tenant boundaries;
- OAuth 2.x/OIDC authorization flows for apps;
- JWKS-verifiable JWT access tokens for API/resource-server access;
- machine-to-machine authentication through `client_credentials`;
- admin UI management of users, organizations, OAuth clients, resource servers, and consents.

This document is the first-batch architecture plan. It intentionally does not plan ReBAC, ABAC/Lua, webhooks, pipeline scripting, or custom onboarding flows beyond the integration points needed to avoid blocking later batches.

First-batch success means a new downstream app can perform an OAuth authorization-code flow, receive a resource-bound access token, verify that token locally through JWKS, and enforce tenant access using `aud`, `scope`, and `org_id` without depending on `auther`.

## 2. Review Verdict

The original document was directionally right and its Section 5 decisions are sound. The main problem was not strategy; it was certainty. Some claims mixed verified Better Auth 1.6 behavior, local `auther` behavior, old Better Auth 1.3 behavior, and inferred future behavior without separating them.

This rewrite keeps the Section 5 decisions and tightens the implementation contract around facts that were verified on 2026-05-19.

### 2.1 What Was Correct

- `auther` is built on `better-auth@^1.3.32`, `oidcProvider`, `jwt`, and `apiKey`, confirmed in `/home/quanghuy1242/pjs/auther/package.json` and `/home/quanghuy1242/pjs/auther/src/lib/auth.ts`.
- `auther` has custom authorization-space, resource-server, OAuth-client metadata, webhook, registration-context, ReBAC, ABAC, and pipeline persistence, confirmed in local schema files.
- Better Auth's newer OAuth Provider package is the right foundation for the first batch because it covers core authorization server work that `auther` had to assemble through `oidcProvider` plus custom logic.
- Using organizations as the tenant boundary is a better fit than carrying forward `authorization_spaces` as the core first-batch tenant model.
- Deferring ReBAC, ABAC/Lua, pipeline scripting, webhooks, and custom onboarding flows is the correct first-batch scope control.

### 2.2 What Needed Correction

- The latest stable npm version on 2026-05-19 is `better-auth@1.6.11` and `@better-auth/oauth-provider@1.6.11`. That part was correct, but feature claims should be tied to docs or package metadata rather than stars, contributor counts, or unreleased roadmap items.
- Better Auth OAuth Provider docs use `signUp`, not `signup`, for the `prompt=create` continuation page configuration.
- UserInfo is documented under `/oauth2/userinfo`, not plain `/userinfo`.
- The public-client endpoint is documented as `/oauth2/public-client`, while server API naming can expose it as `getOAuthClientPublic`.
- RFC 8707 resource indicator support is real in the docs, but the previous doc over-specified implementation details such as PR numbers and exact error names where primary docs are a better source.
- Cloudflare KV read `cacheTtl` has a 30 second minimum as of 2026-01-30. KV key expiration TTL is still 60 seconds. The previous statement "minimum KV TTL is 60s" was too broad.
- D1 `batch()` is documented as transactional: if one statement fails, the whole sequence aborts or rolls back. The remaining risk is multi-step application flows that span multiple separate database operations, not a single `batch()`.
- JWKS path and rotation configuration should be verified against the installed Better Auth version during implementation. The plan should require standard discovery behavior and explicit tests rather than assuming every option name from memory.

### 2.3 Remaining Confidence Level

This plan is implementation-ready after the Section 11 spikes are completed. Until then, the only material uncertainty is the exact Better Auth 1.6.11 API shape for four integration seams:

| Seam | Why it matters | Required proof |
|---|---|---|
| OAuth Provider route map and server API names | Prevents building UI and tests against stale endpoint names | Generated route map or type-level proof from installed packages |
| Runtime resource audience validation | Determines whether UI-managed resource servers can feed Better Auth `validAudiences` without deploy-time config | Minimal Worker proof that `getAuth(env, request)` can derive `validAudiences` from enabled D1 rows |
| JWKS rotation option names and behavior | Prevents broken token verification and key churn | Test that signs, verifies, rotates, and verifies old/new `kid` values |
| D1 migration path for Better Auth schema | Prevents schema drift between CLI, local D1, and remote D1 | Local D1 migration generated from pinned config and applied cleanly under Wrangler |

These are not scope questions. They are integration proofs that must happen before broad feature implementation.

## 3. Current-State Findings

### 3.1 New `auth` Repo State

`/home/quanghuy1242/pjs/auth` currently contains:

- `README.md`
- `docs/001-auth-service-first-batch.md`
- git metadata

There is not yet an application skeleton, package manifest, Worker config, source tree, migrations, or tests. The README already declares the intended stack:

- Better Auth latest stable;
- `@better-auth/oauth-provider`;
- Hono;
- Wrangler;
- Cloudflare Workers, D1, and KV;
- first-batch exclusions for ReBAC, ABAC/Lua, webhooks, custom onboarding, and pipeline scripting.

This means the plan can choose the clean target shape without fighting existing implementation drift in the new repo.

### 3.2 Prior `auther` State

`/home/quanghuy1242/pjs/auther` is a Next.js application with SQLite/Drizzle persistence and Better Auth 1.3.x:

```json
{
  "better-auth": "^1.3.32",
  "next": "16.0.7",
  "drizzle-orm": "^0.44.7",
  "@upstash/qstash": "^2.8.4",
  "wasmoon": "^1.16.0"
}
```

Key local evidence:

- `/home/quanghuy1242/pjs/auther/src/lib/auth.ts` uses `oidcProvider`, `jwt`, `apiKey`, `admin`, `username`, `oAuthProxy`, `nextCookies`, Drizzle adapter, and custom hooks.
- `/home/quanghuy1242/pjs/auther/src/lib/auth.ts` injects permissions into JWT/session callbacks by calling `PermissionService.resolveAllPermissionsWithABACInfo`.
- `/home/quanghuy1242/pjs/auther/src/db/app-schema.ts` defines `resource_servers`, `authorization_spaces`, `oauth_client_metadata`, OAuth client to authorization-space links, and webhook tables.
- `/home/quanghuy1242/pjs/auther/src/db/rebac-schema.ts` defines `access_tuples`, `authorization_models`, and authorization-model aliases.
- `/home/quanghuy1242/pjs/auther/src/lib/auth/permission-service.ts` implements tuple checks, wildcard checks, relation implication, group expansion, hierarchy traversal, and ABAC-aware permission resolution.
- `/home/quanghuy1242/pjs/auther/src/lib/auth/lua-engine-pool.ts` uses Wasmoon with a max pool size and max concurrency of 20 engines.
- `/home/quanghuy1242/pjs/auther/src/db/pipeline-schema.ts` stores Lua scripts, encrypted script secrets, DAG execution plans, graph layout, pipeline traces, and pipeline spans.
- `/home/quanghuy1242/pjs/auther/src/lib/webhooks/delivery-service.ts` uses Upstash QStash for asynchronous webhook delivery and records events/deliveries in local tables.
- `/home/quanghuy1242/pjs/auther/src/db/platform-access-schema.ts` defines signup policy, registration contexts, platform invites, signup-intent nonces, pending registration applications, and permission request state.

The new service should not port this architecture wholesale. It should preserve the product lessons and avoid copying mechanisms that Better Auth 1.6 now covers or that are intentionally out of first-batch scope.

### 3.3 Better Auth 1.6.11 Capability Boundary

Verified stable packages on 2026-05-19:

- `better-auth@1.6.11`
- `@better-auth/oauth-provider@1.6.11`

First-batch capabilities to rely on:

| Area | Better Auth capability | First-batch use |
|---|---|---|
| Core auth | Email/password, sessions, verification/reset flows | User identity and admin login |
| Organizations | Organization, member, invitation, team, active organization, role/permission APIs | Tenant model |
| OAuth Provider | Authorization endpoint, token endpoint, client CRUD, consent flow, introspection, revocation, userinfo, dynamic registration controls | OAuth/OIDC server |
| Resource indicators | `resource` parameter and `validAudiences` in OAuth Provider docs | API audience binding and JWT access tokens |
| M2M | `client_credentials` grant in OAuth Provider docs | Backend-to-backend authentication |
| JWT/JWKS | JWT plugin and JWKS endpoint | ID token signing and API token verification |
| Access control | `createAccessControl` and organization permissions | Flat RBAC |
| Hooks/callbacks | Auth hooks, plugin hooks, OAuth Provider callbacks | Claim enrichment and guardrails |

Capabilities not present as first-class Better Auth primitives:

- Zanzibar/ReBAC graph authorization;
- ABAC policy evaluation;
- embedded Lua or other user-authored policy scripts;
- visual pipeline/DAG runtime;
- durable webhook delivery system;
- custom registration contexts with automatic grant application.

Those gaps match the deferred features in Section 5.

### 3.4 Cloudflare Workers, D1, And KV Constraints

Cloudflare-specific constraints that shape the design:

| Constraint | Verified behavior | Design implication |
|---|---|---|
| D1 binding lifecycle | Workers receive D1 via `env` bindings | Build `getAuth(env, request)` or equivalent; do not depend on a static module-scope database object for runtime |
| D1 batch behavior | D1 `batch()` executes statements sequentially and rolls back/aborts the sequence on failure | Use `batch()` for custom multi-write operations that can fit in one batch; still design idempotency for flows spanning multiple Better Auth calls |
| Interactive transactions | D1 does not expose the same long-lived interactive transaction model as a traditional server database connection | Avoid implementation designs that require a transaction handle across arbitrary async application code |
| Worker memory | Worker memory limit is 128 MB | Do not port Wasmoon pool or large in-memory authorization graph caches in first batch |
| KV read cache TTL | `cacheTtl` minimum is 30 seconds | Rate limit/session cache behavior should tolerate short stale reads |
| KV key expiration TTL | `expirationTtl` minimum is 60 seconds | Do not configure secondary storage items that require expiration below 60 seconds |

The first batch can run on Workers/D1/KV, but implementation should keep database writes simple, favor short-lived request-scoped objects, and test D1 behavior under the actual Wrangler runtime.

## 4. Target Model

### 4.1 Runtime Shape

The target service is one Cloudflare Worker that serves auth APIs, OAuth/OIDC endpoints, metadata routes, custom admin APIs, and admin UI assets/pages.

Primary libraries:

- `better-auth`
- `@better-auth/oauth-provider`
- Hono for Worker routing and binding access
- Drizzle or Kysely only where useful for custom tables
- Wrangler for D1/KV migrations and deployment

Bindings:

| Binding | Purpose |
|---|---|
| `DB` | D1 database for Better Auth and custom tables |
| `KV` | Secondary storage for rate limiting/session cache where Better Auth integration supports it |
| `BETTER_AUTH_SECRET` | Better Auth secret, rotated non-destructively when supported |
| `BETTER_AUTH_URL` | Public issuer/base URL |
| Email provider secrets | Verification and password-reset delivery |
| Social provider secrets | Optional Google/GitHub login later |

### 4.2 Tenant Model

Organizations are the tenant boundary.

Conceptual contrast with `auther`:

| Prior `auther` concept | New first-batch concept |
|---|---|
| `authorization_spaces` | Better Auth organization |
| Space membership / `full_access` | Organization membership and owner/admin role |
| Client-space links | OAuth client `referenceId` or custom metadata tied to organization |
| Space-scoped ReBAC models | Deferred; not represented in first-batch runtime authorization |

First-batch tenant invariants:

- Every OAuth client belongs to exactly one organization.
- Every resource server definition belongs to exactly one organization.
- Admin pages and custom admin APIs enforce organization membership/role checks.
- A user may belong to multiple organizations.
- OAuth flows that require organization context must resolve one organization before issuing an organization-scoped token.

### 4.3 OAuth Client Model

OAuth clients are Better Auth OAuth Provider clients.

Client types:

| Client type | Token endpoint auth method | Examples |
|---|---|---|
| Confidential | `client_secret_basic` or `client_secret_post` | server-rendered web app, backend service |
| Public | `none` plus PKCE | SPA, mobile, CLI |

Expected client fields:

- client ID;
- client secret where applicable;
- redirect URIs;
- allowed scopes;
- allowed grant types;
- organization reference;
- consent behavior;
- disabled/deleted status;
- optional pairwise subject behavior if supported by current Better Auth APIs.

Clients are created through the admin UI and Better Auth server APIs. Dynamic registration remains disabled for first batch unless explicitly turned on for a trusted internal use case.

### 4.4 Resource Server Model

Better Auth OAuth Provider models resource servers as valid audiences, not as a full management entity.

The first batch adds a custom `resource_servers` table so the admin UI can manage API audiences:

- `id`
- `organization_id`
- `slug`
- `name`
- `audience`
- `description`
- `enabled`
- `created_at`
- `updated_at`

Runtime invariant:

- A token request may only receive a JWT for a `resource` value that exists in `resource_servers` and is currently enabled.

Implementation decision:

- Better Auth OAuth Provider 1.6.11 exposes `validAudiences?: string[]` as a plugin configuration option. It does not expose a documented runtime audience-validation callback.
- To keep resource servers UI-managed and avoid deploy-time audience config, `getAuth(env, request)` must derive `validAudiences` from enabled rows in D1.
- A short in-isolate cache is acceptable for latency, but the cache window becomes the maximum delay before a disabled resource server stops receiving new tokens.
- Do not keep API audiences in `wrangler.jsonc`, `.dev.vars`, source constants, or deployment-specific config except for local bootstrap/test fixtures.

### 4.5 Token Model

Token behavior:

| Flow | `resource` present? | Expected access token | Verification |
|---|---|---|---|
| Web app session/sign-in | No | Opaque or session cookie, depending on flow | Better Auth/session validation |
| Authorization code for API | Yes | JWT access token with `aud` bound to resource | Local JWKS verification by resource server |
| Client credentials for API | Yes | JWT access token with client identity | Local JWKS verification by resource server |
| Refresh token exchange | Depends on original authorized resources and request | New access token with same or narrowed audience | Same as issued token type |

JWT access token claims should be minimal and stable:

```json
{
  "iss": "https://id.quanghuy.dev",
  "aud": "https://api.example.com",
  "sub": "user_or_client_subject",
  "iat": 1779160000,
  "exp": 1779163600,
  "nbf": 1779160000,
  "client_id": "oauth_client_id",
  "scope": "openid profile read:posts",
  "org_id": "org_id_when_applicable",
  "role": "owner"
}
```

Custom claims are allowed only when they are stable and useful to downstream APIs:

- `org_id` for tenant authorization;
- `role` only if downstream APIs can tolerate role staleness until token expiry;
- `plan` only if plan-based authorization is coarse and low-risk;
- do not embed large permission maps in first batch.

### 4.6 Authorization Model

First batch authorization is flat:

- OAuth scopes express API capability.
- Organization membership/role expresses tenant authority.
- Resource servers verify `iss`, `aud`, `exp`, signature, and required scope.
- Resource servers enforce that `org_id` matches the target resource's tenant.

No first-batch runtime should require:

- graph traversal;
- tuple expansion;
- group hierarchy resolution;
- Lua policy evaluation;
- inline calls back to the IdP for every resource authorization decision.

This is a deliberate reduction from `auther`. It favors reliable OAuth infrastructure over feature breadth.

### 4.7 User And Admin Model

Users are Better Auth users.

Add only minimal platform metadata:

```ts
betterAuth({
  user: {
    additionalFields: {
      platformRole: {
        type: ["superadmin", "admin"],
        required: false,
        defaultValue: "admin",
        input: false,
      },
    },
  },
});
```

Admin authority:

| Actor | Authority |
|---|---|
| `superadmin` | Cross-organization platform administration |
| `admin` | Platform UI access constrained by membership/organization rules |
| Organization `owner` | Manage own organization, members, clients, and resource servers |
| Organization `admin` | Manage delegated organization resources except destructive owner-only actions |
| Organization `member` | No admin access by default |

### 4.8 Non-Negotiable Invariants

These invariants are stronger than implementation preferences. If a library constraint makes one difficult, stop and redesign before continuing.

| Invariant | Why |
|---|---|
| OAuth redirect URIs are exact-match validated except for explicitly coded development exceptions | Prevents authorization-code exfiltration |
| Public clients never authenticate with a client secret and never use `client_credentials` | Prevents treating browser/mobile apps as confidential |
| `client_credentials` tokens never include end-user identity claims | Prevents M2M tokens from being confused with delegated user tokens |
| JWT access tokens are only accepted by resource servers after `iss`, `aud`, `exp`, `nbf`, signature, and required scopes are checked | Prevents bearer-token replay across APIs |
| Organization-scoped tokens include exactly one resolved `org_id` | Prevents ambiguous tenant authorization |
| Admin UI authorization is rechecked server-side on every mutation | Prevents UI-only access control |
| Better Auth-owned tables are written through Better Auth APIs only | Prevents schema drift and upgrade breakage |
| Disabled clients and disabled resource servers cannot receive new tokens | Makes admin kill switches meaningful |
| Token lifetimes are short enough that org/client/resource revocation latency is acceptable without a first-batch token denylist | Keeps first-batch revocation model honest |
| User-authored scripts, ReBAC graph traversal, and webhook delivery are not introduced through side channels | Preserves the first-batch scope decision |

## 5. Architecture Decisions

This section preserves the prior decisions. Supporting rationale has been tightened to match verified sources and local evidence.

### 5.1 Decision: Build On Better Auth, Not From Scratch

Recommended: use Better Auth 1.6.x as the auth foundation.

Rationale:

- The first-batch requirement is an OAuth/OIDC identity service, not a novel auth protocol implementation.
- Better Auth already provides core identity, sessions, organization management, OAuth Provider, consent, token, and plugin primitives.
- `auther` shows the cost of building too much adjacent infrastructure around older Better Auth internals.
- Security-sensitive OAuth behavior should come from a maintained library wherever practical.

Rejected alternative: build a custom OAuth server.

Reason rejected: the scope includes PKCE, redirect URI validation, consent, refresh tokens, revocation, introspection, client authentication, discovery metadata, and JWKS. A custom implementation would be slower and riskier than integrating the maintained provider.

Rejected alternative: fork Better Auth.

Reason rejected: a fork recreates the upgrade problem that this rewrite is trying to escape.

### 5.2 Decision: Use `oauthProvider`, Not `oidcProvider`

Recommended: use `@better-auth/oauth-provider`, not the prior `oidcProvider` path used by `auther`.

Rationale:

- The prior app is explicitly on `oidcProvider` in `/home/quanghuy1242/pjs/auther/src/lib/auth.ts`.
- The newer OAuth Provider docs cover authorization, token, client credentials, resource indicators, client management, consent, introspection, revocation, and userinfo in one provider model.
- `resource`-bound API tokens are central to the new architecture.
- `client_credentials` removes the need for a custom API-key-to-JWT exchange path.

Compatibility implication:

- Do not migrate `oauthApplication` rows from `auther` in the first batch. `id` owns its OAuth clients independently. If a future operator wants equivalent clients, recreate them through the `id` admin UI or an explicit import tool designed later.

### 5.3 Decision: Use `organization` Plugin For Tenants

Recommended: use the Better Auth organization plugin for tenant scoping.

Rationale:

- The plugin provides organization CRUD, memberships, invitations, active organization behavior, and role/permission APIs.
- The first batch needs organization-level tenancy, not entity-level graph authorization.
- Mapping `authorization_spaces` to organizations makes the model understandable to admins and downstream apps.
- Keeping tenant logic inside Better Auth's plugin model reduces custom auth surface area.

What is not preserved in first batch:

- custom `full_access` tuple bypass;
- per-entity authorization models;
- custom registration-context grant application;
- group hierarchy traversal.

### 5.4 Decision: JWT Access Tokens Via `resource` Parameter

Recommended: API-facing access tokens require the OAuth `resource` parameter and are JWTs with an `aud` claim bound to the requested resource.

Rationale:

- Resource servers can verify JWTs locally using JWKS and avoid a database or introspection call on every request.
- OAuth Resource Indicators are the right protocol shape for selecting an API audience.
- Keeping JWT issuance tied to `resource` avoids turning every access token into a bearer JWT by default.
- Opaque tokens remain useful for flows where revocability and server-side validation are more important than local verification.

Implementation requirement:

- The authorization request must record or validate the allowed resource set.
- The token request must not widen the resource set beyond what was authorized.
- Resource server definitions in the admin UI must feed the actual OAuth Provider audience validation path.

### 5.5 Decision: M2M Via `client_credentials`, Not `apiKey`

Recommended: machine-to-machine authentication uses OAuth `client_credentials`.

Rationale:

- `client_credentials` is a standard OAuth grant for application identity.
- It reuses OAuth clients, scopes, token lifetimes, revocation, and JWKS verification.
- The `apiKey` plugin path in `auther` created a second credential model and extra permission resolution surface.
- First-batch M2M should issue short-lived API tokens, not long-lived API keys that require a custom exchange service.

Implementation requirement:

- M2M clients must be confidential.
- OIDC user scopes such as `openid`, `profile`, `email`, and `offline_access` must be rejected for `client_credentials`.
- M2M tokens must not contain user context.

### 5.6 Decision: UI-First Management, Not Config-First

Recommended: organizations, clients, users, resource servers, and consents are managed through the admin UI.

Rationale:

- The product target is Auth0-like operational management.
- Better Auth exposes server-side APIs for OAuth client operations.
- The prior admin UI already proves the need for a visual management surface.
- Runtime entities should not require deploys for ordinary changes.

What remains in config:

- plugin initialization;
- base URL and issuer;
- secret bindings;
- first-party trusted client bootstrap entries, if needed;
- Worker/D1/KV bindings;
- email/social provider secrets.

Important implementation note:

- Better Auth OAuth Provider 1.6.11 accepts `validAudiences` as plugin config. To keep resource servers UI-first, construct the Better Auth instance per request or per short cache window with `validAudiences` loaded from enabled `resource_servers` rows in D1. Do not hard-code resource audiences in deploy config.

### 5.7 Decision: Defer ReBAC And ABAC

Recommended: do not build ReBAC or ABAC in the first batch.

Rationale:

- Local `auther` ReBAC/ABAC is substantial: tuple schema, model schema, permission service, hierarchy traversal, wildcard handling, Lua policy evaluation, ABAC audit logs, and JWT/session permission injection.
- Better Auth organization access control is flat RBAC, not Zanzibar-style graph authorization.
- Porting the prior permission service would dominate the first batch and reintroduce the same complexity the rewrite is supposed to reduce.
- Worker memory limits make a Wasmoon/Lua pool a poor first-batch fit.

First-batch substitute:

- organization roles;
- OAuth scopes;
- small JWT claims (`org_id`, maybe `role`);
- downstream resource checks.

Re-evaluation trigger:

- A real downstream app needs different permissions on separate entities inside the same organization and cannot express that with scopes plus org role.

### 5.8 Decision: Defer Custom Pipeline/Lua Engine

Recommended: do not build the DAG pipeline system or Lua scripting runtime in the first batch.

Rationale:

- Local `auther` pipeline storage includes scripts, secrets, execution plans, graph state, traces, and spans.
- The Wasmoon pool is configured for up to 20 active engines, which is incompatible with the simplicity and memory posture expected from a first-batch Worker.
- Better Auth hooks and OAuth Provider callbacks cover the necessary first-batch extension points: claim enrichment, client-operation authorization, organization hooks, and inline validation.
- Visual scripting is a developer-experience feature, not a blocker for a correct IdP foundation.

First-batch substitute:

- typed code callbacks;
- explicit custom admin APIs;
- test-covered claim enrichment;
- no user-authored runtime scripts.

### 5.9 Decision: Defer Webhooks To Later Batch

Recommended: do not build webhook delivery in the first batch.

Rationale:

- Local `auther` has durable webhook endpoints, subscriptions, events, deliveries, QStash publishing, signing, retry accounting, and metrics.
- Better Auth does not provide the same durable webhook system as a first-class primitive.
- Webhook delivery introduces queue credentials, retry semantics, idempotency windows, signature verification contracts, and operator UI.
- No first-batch core auth flow should depend on webhooks.

First-batch substitute:

- direct API integration where required;
- Better Auth hooks for inline side effects only when they are low-risk and bounded;
- document future event names but do not implement delivery.

### 5.10 Decision: Defer Custom Onboarding Flows

Recommended: do not build registration contexts, signed invite token flows, or automatic permission grant application in first batch.

Rationale:

- Local `platform-access-schema.ts` shows onboarding is a full subsystem, not a small add-on.
- Better Auth organization invitations cover the basic "invite user to org" requirement.
- OAuth `prompt=create` covers sign-up-during-authorization.
- Automatic grant application depends on the deferred ReBAC/ABAC model.

First-batch substitute:

- standard email/password sign-up;
- organization invitations;
- `prompt=create` sign-up page;
- manual admin assignment of organization roles.

## 6. Data Model

### 6.1 Better-Auth-Owned Tables

Treat Better Auth-owned tables as implementation-owned by Better Auth. Generate them from the selected version and do not hand-edit them except through documented `additionalFields`.

Expected table groups:

| Group | Tables |
|---|---|
| Core auth | user, session, account, verification |
| Organization | organization, member, invitation, team/team member if enabled, dynamic role tables if enabled |
| OAuth Provider | OAuth clients, access tokens, refresh tokens, consents, authorization/request state as generated |
| JWT/JWKS | signing key storage used by the JWT plugin |
| Rate limiting | Better Auth rate-limit storage if database-backed |

Implementation rule:

- Generate the schema from the exact package versions pinned in `package.json`, commit generated migrations, and inspect the SQL before applying it to D1.

### 6.2 Custom First-Batch Tables

Custom tables should be minimal.

#### `resource_servers`

| Column | Type | Notes |
|---|---|---|
| `id` | text primary key | UUID or Better Auth-compatible generated ID |
| `organization_id` | text not null | References `organization.id` |
| `slug` | text not null | Unique per organization |
| `name` | text not null | Display name |
| `audience` | text not null | URI/string used as JWT `aud`; globally unique unless a later design supports per-org duplicate audiences |
| `description` | text nullable | UI text |
| `enabled` | integer boolean | Disabled resource servers cannot receive new tokens |
| `created_by` | text nullable | Admin user who created the row |
| `updated_by` | text nullable | Last admin user who changed the row |
| `disabled_at` | integer nullable | Unix timestamp for disable action |
| `disabled_by` | text nullable | Admin user who disabled the row |
| `created_at` | integer | Unix timestamp |
| `updated_at` | integer | Unix timestamp |

Recommended indexes:

- unique `audience`;
- unique `(organization_id, slug)`;
- index `organization_id`;
- index `enabled`.
- index `(organization_id, enabled)`.

### 6.3 Schema Extension Rules

Allowed:

- Better Auth `additionalFields` for `user` and organization metadata when supported.
- Separate custom tables referencing Better Auth IDs.
- Custom migrations for custom tables.

Avoid:

- raw SQL changes to Better Auth-owned OAuth/JWKS/token tables;
- direct writes to Better Auth tables from admin routes;
- large JSON permission blobs embedded into users/sessions by default;
- copying prior `auther` ReBAC/pipeline/webhook tables into first batch.

## 7. API Surface

### 7.1 Better Auth Routes

Exact paths must be generated or verified against Better Auth 1.6.11 during implementation. The expected first-batch route groups are:

| Group | Routes |
|---|---|
| Core auth | email sign-up/sign-in, sign-out, session read, password reset, email verification |
| Organization | create/update/delete/list orgs, active org, invitations, members, roles/permissions |
| OAuth Provider | `/oauth2/authorize`, `/oauth2/token`, `/oauth2/introspect`, `/oauth2/revoke`, `/oauth2/userinfo`, client CRUD routes, consent routes, continue route |
| Dynamic registration | `/oauth2/register`, disabled for first batch unless explicitly enabled |
| JWKS | Better Auth JWT plugin route, exposed through standard metadata/discovery |

Implementation should add a route smoke test that starts the Worker locally and asserts these routes exist or intentionally return the expected auth error.

### 7.2 Well-Known Metadata Routes

Serve standards-friendly metadata:

| Route | Purpose |
|---|---|
| `/.well-known/oauth-authorization-server` | OAuth authorization server metadata |
| `/.well-known/openid-configuration` | OIDC discovery where OIDC is used |
| `/.well-known/jwks.json` | JWKS if supported/configured directly |
| `/.well-known/oauth-protected-resource` | Protected resource metadata on resource servers, not necessarily on the IdP |

Implementation requirement:

- Discovery metadata must advertise the actual issuer, authorization endpoint, token endpoint, JWKS URI, supported grants, supported response types, supported auth methods, supported scopes, and resource-indicator behavior.
- If Better Auth serves JWKS under `/api/auth/jwks`, metadata must point there or the Worker must provide a compatible alias at `/.well-known/jwks.json`.

### 7.3 Custom Admin Routes

Custom admin APIs exist only for entities Better Auth does not own or for aggregate dashboard reads.

Expected custom routes:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/admin/resource-servers` | List resource servers visible to current admin |
| `POST` | `/api/admin/resource-servers` | Create resource server |
| `GET` | `/api/admin/resource-servers/:id` | Read resource server |
| `PATCH` | `/api/admin/resource-servers/:id` | Update metadata or enabled state |
| `DELETE` | `/api/admin/resource-servers/:id` | Soft-delete or disable |
| `GET` | `/api/admin/dashboard` | Aggregate user, organization, client, and resource-server counts |

Authorization:

- Every custom admin route must validate a Better Auth session.
- Cross-org access requires `platformRole=superadmin`.
- Org-scoped access requires membership and appropriate role.

## 8. Deployment Architecture

### 8.1 Worker Topology

One Worker is sufficient for first batch:

```text
id-worker
├── /api/auth/*                         Better Auth handler
├── /oauth2/* or /api/auth/oauth2/*     OAuth Provider routes, depending on Better Auth base path
├── /.well-known/*                      metadata aliases/helpers
├── /api/admin/*                        custom admin API
├── /admin/*                            admin UI
├── /sign-in                            sign-in page
├── /sign-up                            sign-up page
├── /consent                            consent page
├── /select-account                     account picker page
├── /select-organization                org picker page
└── /reset-password                     reset page
```

Use Hono to route requests and pass Cloudflare bindings into the Better Auth factory.

### 8.2 Better Auth Factory Pattern

Runtime auth construction should be request/binding aware:

```ts
import { betterAuth } from "better-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";

export function getAuth(env: Env, request: Request) {
  const origin = env.BETTER_AUTH_URL ?? new URL(request.url).origin;

  return betterAuth({
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    plugins: [
      organization({
        // roles/access control configured here
      }),
      jwt({
        // verified option names to be filled from Better Auth 1.6.11 docs/types
      }),
      oauthProvider({
        // valid audiences and OAuth pages configured here
      }),
    ],
  });
}
```

Implementation requirement:

- Factor shared config into a pure helper so runtime config and CLI/schema config cannot drift.
- Do not import local `.env` in Worker runtime code.
- Use Wrangler bindings for runtime and a local compatibility path only for schema generation/tests.

### 8.3 Migration Workflow

Recommended workflow:

1. Pin package versions in `package.json`.
2. Generate Better Auth schema/migrations from the pinned config.
3. Add the custom migration for `resource_servers`.
4. Apply migrations to local D1 with Wrangler.
5. Run route smoke tests against `wrangler dev`.
6. Apply remote migrations through CI/CD before deploying the Worker.

Commands should be finalized during implementation, but expected scripts are:

```bash
pnpm db:generate
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm dev
pnpm test
pnpm lint
```

### 8.4 JWKS Rotation

Target behavior:

- JWKS signing keys are stored in D1 through Better Auth's JWT plugin.
- New tokens include `kid`.
- JWKS endpoint returns public keys required to verify active tokens.
- Rotation is configured explicitly if the plugin supports interval/grace settings in 1.6.11.
- Old keys remain available for at least the maximum access token lifetime plus clock skew.

Implementation requirement:

- Add automated tests for key creation, token signing, JWKS fetch, verification by `kid`, and old-key verification during grace.
- Do not rely on a separate cron rotation service unless Better Auth 1.6.11 requires one.

## 9. Auth Flow Walkthroughs

### 9.1 Authorization Code + PKCE

```text
Client
  GET /oauth2/authorize
    response_type=code
    client_id=...
    redirect_uri=...
    scope=openid profile read:posts
    code_challenge=...
    code_challenge_method=S256
    resource=https://api.example.com
    state=...

Auth Worker
  validate client, redirect URI, PKCE, scopes, resource
  redirect to sign-in if needed
  redirect to organization selection if org context is required
  show consent for non-trusted clients
  redirect back with code and state

Client
  POST /oauth2/token
    grant_type=authorization_code
    code=...
    code_verifier=...
    resource=https://api.example.com

Auth Worker
  validate code and resource narrowing
  return JWT access token for resource, ID token where applicable, refresh token if allowed
```

### 9.2 Client Credentials

```text
Backend service
  POST /oauth2/token
    grant_type=client_credentials
    scope=read:posts write:posts
    resource=https://api.example.com
    Authorization: Basic base64(client_id:client_secret)

Auth Worker
  validate confidential client
  reject user/OIDC scopes
  issue short-lived JWT access token

Resource server
  verify JWT locally using JWKS
  authorize using aud + scope + client_id
```

Expected M2M token properties:

- no end-user `sub`;
- no `id_token`;
- no `openid`, `profile`, `email`, or `offline_access`;
- short lifetime;
- audience bound to requested resource.

### 9.3 Post-Login Organization Selection

Org selection is required when a user token will carry organization context and the session does not already have the correct active organization.

Target behavior:

1. User starts OAuth authorization.
2. User signs in.
3. OAuth Provider callback determines whether selected scopes/resources require org context.
4. If needed, redirect to `/select-organization`.
5. User selects an organization.
6. Server validates membership.
7. Flow resumes through Better Auth's continue route.
8. Token claims include `org_id`.

Implementation note:

- The original doc used `authClient.setActive` and `oauth2Continue` as the client-side shape. Verify exact client API names from Better Auth 1.6.11 types when implementing.

### 9.4 `prompt=select_account`

When a client sends `prompt=select_account`, the service should force account selection if multiple device sessions are available.

Target behavior:

- Redirect to `/select-account` when appropriate.
- Show available sessions/accounts.
- User selects one.
- OAuth flow resumes.
- If only one session exists, skip the page unless Better Auth requires explicit confirmation.

Requirement:

- Include Better Auth's multi-session/client support only if required by the current OAuth Provider API for this flow.

### 9.5 `prompt=create`

When a client sends `prompt=create`, the service should redirect to sign-up instead of sign-in.

Configuration should use the Better Auth OAuth Provider spelling verified in docs:

```ts
oauthProvider({
  signUp: {
    page: "/sign-up",
  },
});
```

After sign-up:

- verify email if required;
- create session;
- resume OAuth flow through the provider continue route;
- continue to consent or callback.

### 9.6 Resource Server Verification

Resource servers verify JWT access tokens locally:

1. Read `Authorization: Bearer <token>`.
2. Decode JWT header.
3. Fetch or use cached JWKS from issuer metadata.
4. Verify signature and `kid`.
5. Validate `iss`.
6. Validate `aud` equals the API's configured audience.
7. Validate `exp`, `nbf`, and acceptable clock skew.
8. Validate required scope.
9. Validate `org_id` against the target resource tenant when applicable.

Recommended Node/Worker verification libraries:

- `jose` with `createRemoteJWKSet`;
- Better Auth OAuth helper if exposed and compatible with Worker runtime.

Failure behavior:

- Invalid/missing token: `401` with `WWW-Authenticate: Bearer`.
- Valid token, insufficient scope/org: `403`.
- JWKS unavailable and no cached key: `503` or fail closed with clear logging.

## 10. Admin UI Requirements

The admin UI is an authenticated operational app. It should be dense, reliable, and task-focused.

First-batch pages:

| Page | Route | Capabilities |
|---|---|---|
| Dashboard | `/admin` | user/org/client/resource counts and metadata/JWKS health |
| Organizations | `/admin/organizations` | list/create/update/delete where authorized |
| Organization detail | `/admin/organizations/:id` | members, invitations, roles, settings |
| OAuth clients | `/admin/clients` | list/create/update/disable |
| OAuth client detail | `/admin/clients/:id` | redirect URIs, scopes, grants, secret rotation, consent settings |
| Resource servers | `/admin/resource-servers` | list/create/update/disable audiences |
| Users | `/admin/users` | list users, view sessions, ban/unban if enabled |
| User detail | `/admin/users/:id` | profile, sessions, org memberships, linked accounts |
| Consents | `/admin/consents` | list/revoke user-client consents |
| Settings | `/admin/settings` | issuer URL, metadata health, JWKS status, package/runtime versions |

Admin UI implementation requirements:

- All mutations call server actions/routes that re-check authorization.
- Secret values are shown once at creation/rotation and never persisted in plaintext in UI state.
- Deleting an organization/resource/client should be disable-first unless a hard delete is explicitly safe.
- Lists must be paginated from the start.
- The UI should expose IDs and audience strings in copyable fields for integration work.

## 11. Pre-Implementation Spikes And Quality Gates

These spikes are mandatory because they remove integration uncertainty. They should be completed before the main implementation starts. Each spike produces a small code proof, a note in this document or a companion implementation note, and a failing/passing test where practical.

### 11.1 OAuth Provider Contract Spike

Purpose:

- Verify exact route paths, option names, server API names, and client API names from the installed `better-auth@1.6.11` and `@better-auth/oauth-provider@1.6.11` packages.

Scope:

- `package.json`
- `src/auth/get-auth.ts`
- `test/oauth-provider-contract.test.ts`
- generated Better Auth type output or route map

Questions to prove:

- Whether OAuth Provider routes are served under `/api/auth/oauth2/*`, `/oauth2/*`, or another path based on `basePath`.
- Exact names for client CRUD server APIs.
- Exact config names for `signUp`, `selectAccount`, `postLogin`, `validAudiences`, trusted clients, and consent pages.
- Exact userinfo path.
- Whether `client_credentials` returns a JWT access token when `resource` is present.

Acceptance criteria:

- A local test starts the Worker and asserts the metadata route advertises the same authorization/token/userinfo/JWKS routes the implementation expects.
- TypeScript compilation proves all chosen option names exist.
- The document's route table is updated if the spike finds path differences.

### 11.2 Resource Audience Strategy Spike

Purpose:

- Prove the final implementation for UI-managed resource servers feeding OAuth Provider audience validation.

Scope:

- `src/db/resource-servers.ts`
- `src/auth/resource-audiences.ts`
- `src/auth/get-auth.ts`
- `test/resource-audience.test.ts`

Chosen design:

- `getAuth(env, request)` loads enabled `resource_servers.audience` values from D1 and passes them to `oauthProvider({ validAudiences })`.
- A small per-isolate cache may be used, but it must have a documented maximum TTL.
- Static `validAudiences` in source or deployment config is rejected because resource servers must be managed through the UI.

Acceptance criteria:

- Creating a resource server through D1 can make a subsequent token request for its `audience` succeed without manually editing source code.
- Disabling the resource server makes new token requests fail within the chosen cache window.
- Existing JWTs remain valid until expiry and this behavior is documented in the UI.
- No API audience is required in `wrangler.jsonc`, `.dev.vars`, or source constants for production operation.

### 11.3 D1 Schema And Migration Spike

Purpose:

- Prove Better Auth schema generation and custom migrations work against local D1 under Wrangler.

Scope:

- `src/auth/get-auth.ts`
- `src/auth/cli-auth.ts` or equivalent CLI-only auth export
- `src/db/schema.ts`
- `migrations/*`
- `wrangler.jsonc`

Acceptance criteria:

- Better Auth-generated schema is committed as migration SQL or a reproducible generated artifact.
- Custom `resource_servers` migration applies after Better Auth tables.
- `wrangler d1 migrations apply <db> --local` succeeds from a clean local database.
- Running migrations twice does not fail.
- A smoke script can create a user, organization, OAuth client, and resource server in local D1.

### 11.4 JWKS And Secret Rotation Spike

Purpose:

- Prove token signing, JWKS publishing, key selection by `kid`, and old-key verification behavior.

Scope:

- `src/auth/get-auth.ts`
- `src/auth/jwks.ts`
- `test/jwks-rotation.test.ts`
- `test/fixtures/verify-access-token.ts`

Acceptance criteria:

- First signed token creates or uses a JWKS key.
- JWKS endpoint returns the public key for the token's `kid`.
- `jose` can verify the token using the advertised JWKS URI.
- Rotation creates a new signing key without immediately invalidating a token signed by the previous key.
- Metadata advertises the actual JWKS URI used by resource servers.

### 11.5 Admin Authorization Spike

Purpose:

- Prove the platform role plus organization role model is sufficient for first-batch admin UI and custom API authorization.

Scope:

- `src/admin/guards.ts`
- `src/routes/admin/resource-servers.ts`
- `test/admin-authorization.test.ts`

Acceptance criteria:

- `superadmin` can access cross-org lists and mutate any organization resource.
- Organization `owner` can manage only that organization's clients/resource servers/members.
- Organization `admin` can perform only delegated non-owner actions.
- Organization `member` and unauthenticated users receive `403`/`401`.
- Every admin mutation has a server-side authorization test.

## 12. Implementation Plan

This is a sequenced implementation plan, not a work-item tracking list.

### 12.1 Foundation

Create the Worker project structure:

- `package.json`
- `pnpm-lock.yaml`
- `wrangler.jsonc`
- `.dev.vars.example`
- `src/index.ts`
- `src/auth/config.ts`
- `src/auth/get-auth.ts`
- `src/db/schema.ts`
- `src/db/migrations/*`
- `src/routes/*`
- `src/admin/*` or chosen UI app structure
- `test/*`

Recommended source ownership:

| Path | Responsibility |
|---|---|
| `src/index.ts` | Hono app, route registration, request ID middleware, top-level error handling |
| `src/auth/get-auth.ts` | Runtime Better Auth factory using Worker bindings |
| `src/auth/config.ts` | Shared pure config helpers for plugins, scopes, and pages |
| `src/auth/cli-auth.ts` | CLI/schema-generation auth export, if Better Auth tooling requires a static export |
| `src/auth/resource-audiences.ts` | Resource-server audience loading/cache strategy |
| `src/auth/claims.ts` | Custom access-token/ID-token/userinfo claim helpers |
| `src/db/schema.ts` | Custom table schema only; Better Auth generated schema remains separate if tooling produces it |
| `src/db/migrations/*` | D1 migrations |
| `src/routes/admin/*` | Custom admin APIs for resource servers/dashboard |
| `src/admin/*` | Admin UI routes/components if UI is bundled into the Worker project |
| `src/resource-server/verify.ts` | Downstream JWT verification helper |
| `test/*` | Worker, OAuth, admin authorization, D1, and JWKS tests |

Pin versions:

- `better-auth@1.6.11`
- `@better-auth/oauth-provider@1.6.11`
- Hono and Wrangler versions pinned during implementation after checking npm metadata.

### 12.2 Auth Core

Implement:

- Better Auth core with D1 binding.
- email/password sign-up and sign-in.
- email verification and password reset using selected email provider.
- admin plugin only if it is needed for user management.
- organization plugin with owner/admin/member roles.
- platform role `additionalFields` on users.

Acceptance criteria:

- User can sign up, verify email, sign in, sign out, and read session.
- User can create an organization and becomes owner.
- Owner can invite a user and invited user can accept.

### 12.3 OAuth Provider

Implement:

- `oauthProvider` plugin.
- authorization code with PKCE.
- consent page.
- client CRUD through Better Auth server APIs.
- `client_credentials`.
- refresh token support where appropriate.
- introspection and revocation.
- resource indicators and valid audience checks.
- JWT/JWKS integration.
- `prompt=create` and `prompt=select_account`.
- post-login org selection.

Acceptance criteria:

- Public SPA client completes PKCE.
- Confidential client completes server-side authorization code exchange.
- M2M client receives a JWT access token for a resource.
- Tokens without `resource` behave as opaque/server-validated tokens.
- Resource-widening at token exchange is rejected.

### 12.4 Admin UI

Implement UI pages in the order required by dependent flows:

1. sign-in/sign-up/reset/verification pages;
2. admin shell and route protection;
3. organizations and members;
4. OAuth clients;
5. resource servers;
6. users and sessions;
7. consents;
8. dashboard/settings.

Acceptance criteria:

- A platform admin can bootstrap and operate the service without editing config for normal org/client/resource changes.
- Organization owners can manage only their own organization resources.
- Members cannot access admin pages unless explicitly authorized.

### 12.5 Resource Server Integration

Implement and document a small verification helper for downstream APIs:

- issuer URL;
- JWKS URL;
- expected audience;
- required scopes;
- org check helper;
- failure response helper.

Add at least one test resource server or fixture route that verifies a real token from the local Worker.

### 12.6 Deployment Hardening

Implement:

- local D1 migrations;
- remote D1 migration command;
- CI checks;
- Worker deploy command;
- smoke test against local Wrangler;
- metadata route verification;
- health endpoint;
- basic structured logging.

## 13. Security And Privacy Model

### 13.1 Secret Handling

Required rules:

- `BETTER_AUTH_SECRET`, email provider keys, social provider secrets, and OAuth client secrets are stored as Cloudflare secrets or equivalent secure bindings, not in `wrangler.jsonc`.
- `.dev.vars.example` documents required secret names but contains no real secret values.
- OAuth client secrets are displayed only on creation or rotation.
- Secret rotation is non-destructive where Better Auth supports previous-secret arrays or equivalent fallback.
- Logs never include access tokens, refresh tokens, authorization codes, client secrets, password reset tokens, email verification tokens, or full webhook-style payloads if later introduced.

Implementation checks:

- Add a log redaction utility before adding structured request logging.
- Add tests for secret rotation behavior where Better Auth exposes it.
- Add a manual deployment checklist item that confirms Cloudflare secret bindings exist before remote deploy.

### 13.2 Token Security

Access token policy:

| Token | First-batch policy |
|---|---|
| Authorization code | Short-lived, one-time use, bound to PKCE verifier for public clients |
| Access token | Short-lived; JWT only when `resource` is requested and accepted |
| Refresh token | Issued only where needed; replay behavior tested and documented |
| ID token | For client identity/login only; not accepted as API bearer token |
| M2M access token | Short-lived, client identity only, no user claims |

JWT verification requirements for resource servers:

- Reject missing `kid`.
- Reject unsupported algorithms.
- Reject wrong issuer.
- Reject wrong audience.
- Reject expired or not-yet-valid tokens.
- Reject missing required scope.
- Treat `org_id` as required for organization-owned API resources.

### 13.3 Admin Security

Admin routes and UI must fail closed.

Required controls:

- `GET` pages and data loaders check session and role.
- Mutations re-check authorization server-side.
- Destructive actions require explicit confirmation in UI and are disable-first where possible.
- Client secret rotation invalidates the old secret immediately unless Better Auth documents a grace behavior.
- Admin audit fields are stored for custom tables: `created_by`, `updated_by`, and optionally `disabled_by`/`disabled_at` if the first migration can include them.

Recommended custom table additions:

| Table | Columns |
|---|---|
| `resource_servers` | `created_by`, `updated_by`, `disabled_at`, `disabled_by` |

### 13.4 Data Privacy

First-batch data minimization:

- Store only the user profile fields Better Auth requires plus `platformRole`.
- Do not add custom token telemetry tables in the first batch.
- Do not copy prior `auther` permission graphs into `id`.
- Do not expose cross-org user membership data to organization admins unless required for their organization.

PII-bearing surfaces:

- users;
- sessions;
- accounts/linked providers;
- invitations;
- email verification/password reset flows;
- admin audit metadata.

Operational requirement:

- Add a future-compatible deletion path: deleting or disabling a user must revoke sessions and prevent new token issuance. Full data erasure can be a later privacy workflow, but first batch must avoid creating unnecessary custom PII copies.

## 14. Operational Model

### 14.1 Observability

Use structured logs and lightweight metrics from Worker logs or the deployment platform. Do not add a custom token metrics table in the first batch.

Required events:

| Event | Fields |
|---|---|
| `auth.sign_in.success` | `user_id`, `method`, `request_id` |
| `auth.sign_in.failure` | `reason`, `method`, `request_id` |
| `oauth.authorize.failure` | `client_id`, `reason`, `request_id` |
| `oauth.token.issued` | `client_id`, `grant_type`, `token_type`, `resource`, `organization_id`, `request_id` |
| `oauth.token.failure` | `client_id`, `grant_type`, `reason`, `request_id` |
| `admin.mutation` | `actor_user_id`, `organization_id`, `entity_type`, `entity_id`, `action`, `request_id` |
| `jwks.rotation` | `kid`, `result`, `request_id` |

Do not log:

- token values;
- client secrets;
- authorization codes;
- password reset or verification URLs;
- raw request bodies for auth endpoints.

### 14.2 Runbooks

Create operator runbooks before first production launch:

| Runbook | Required content |
|---|---|
| Deploy | migrations, Worker deploy, metadata smoke tests, rollback command |
| Rotate Better Auth secret | add new secret, keep previous secret, deploy, observe, remove old secret after window |
| Rotate OAuth client secret | admin UI flow, client coordination, failure symptoms |
| JWKS incident | inspect JWKS endpoint, verify `kid`, cache purge guidance for resource servers |
| Disable compromised client | disable client, revoke tokens where supported, communicate JWT expiry window |
| Disable resource server | disable audience, explain existing JWT expiry behavior |
| D1 migration failure | stop deploy, inspect local/remote migration state, restore from backup if needed |

### 14.3 Capacity And Performance Targets

Initial targets:

| Operation | Target |
|---|---|
| Metadata/JWKS route | P95 under 100 ms from warm Worker, excluding network variance |
| Session read | P95 under 250 ms with D1 |
| Authorization redirect decision | P95 under 500 ms excluding user interaction |
| Token endpoint | P95 under 500 ms for normal D1 latency |
| Admin list pages | Server response under 700 ms for first 100 rows |

Implementation rules:

- Do not introduce large in-memory caches.
- Cache JWKS in resource servers, not in the auth service only.
- Paginate admin lists from day one.
- Keep access-token custom claims small.

## 15. Independent Rollout

### 15.1 Relationship To `auther`

`id` is not built on top of `auther`, does not share `auther` tables, does not need compatibility with `auther` clients or tokens, and does not require existing `auther` consumers to move.

`auther` remains useful only as prior-art evidence:

| `auther` area | How this plan uses it |
|---|---|
| Better Auth 1.3 + `oidcProvider` setup | Evidence for why `id` should use the newer OAuth Provider path |
| Authorization spaces | Prior concept compared against organizations, not data to import |
| Resource servers | Prior UI/product concept, not a table to copy |
| API keys | Prior complexity avoided by `client_credentials` |
| ReBAC/ABAC/pipeline/webhooks/onboarding | Evidence for explicit first-batch exclusions |

First-batch non-goals:

- No `auther` database import.
- No `auther` token compatibility.
- No `auther` OAuth client compatibility.
- No `auther` session compatibility.
- No requirement that apps currently using `auther` move to `id`.
- No rollback path from `id` to `auther`.

### 15.2 Rollout Sequence

Recommended sequence:

1. Build and test `id` locally against D1.
2. Deploy `id` to staging Worker and staging D1.
3. Create a test organization, OAuth client, and resource server.
4. Integrate one new or explicitly selected downstream app with staging.
5. Run authorization code, refresh, revocation, and client credentials smoke tests.
6. Deploy production Worker and D1 with no downstream traffic.
7. Create production admin account and first organization.
8. Register first production resource server and OAuth client.
9. Configure the selected downstream app to use `id` as a new issuer.
10. Observe logs and OAuth smoke-test results.
11. Add additional new downstream apps only after the first one is stable.

### 15.3 Rollback Strategy

Rollback means disabling or reverting the new `id` integration. It does not mean falling back to `auther`.

Rules:

- If `id` token issuance fails, stop onboarding new apps and disable affected `id` clients/resource servers.
- If a new downstream app cannot use `id` safely, disable that app's `id` integration and return it to its pre-integration state.
- If D1 migration fails before deploy, do not deploy the Worker.
- If Worker deploy succeeds but smoke tests fail, roll back Worker version and leave database as-is unless the migration itself is proven harmful.

## 16. Risks, Edge Cases, And Failure Modes

| Risk/failure mode | Expected behavior |
|---|---|
| D1 unavailable | Auth and admin requests fail closed with clear `5xx` logs; no fallback to accepting tokens except already issued JWTs verified by resource servers |
| D1 write partially completes across multiple app-level operations | Design each mutation to be idempotent where possible; use D1 `batch()` for custom multi-write operations |
| KV stale reads | Rate limits/session caches tolerate short inconsistency; security-critical authorization does not depend solely on KV |
| Resource server deleted while tokens are active | New tokens are rejected; existing JWTs remain valid until expiry unless resource server uses introspection or denylist |
| OAuth client disabled while tokens are active | New authorization/token requests fail; existing JWTs remain valid until expiry |
| Organization deleted while session has active org | Next session/admin check clears active org or requires reselection |
| User removed from org while JWT is active | Existing JWT can remain valid until expiry; keep access token lifetime short |
| JWKS rotates during requests | Old key remains available through grace period; resource servers cache by `kid` and refetch on unknown `kid` |
| JWKS endpoint unreachable | Resource server uses cached keys; if no matching key is cached, fail closed |
| Public client tries client credentials | Reject |
| M2M requests OIDC user scopes | Reject |
| Token request widens resource set | Reject |
| Redirect URI mismatch | Reject and do not redirect to untrusted URI |
| Consent declined | Return OAuth error to client with state preserved |
| Admin attempts cross-org mutation | Reject with `403` and audit log where available |
| Secret rotation mistake | Support previous secret during transition; document rollback and removal window |

## 17. Test And Verification Plan

Automated tests:

- core sign-up/sign-in/session/sign-out;
- email verification and password reset token behavior with provider mocked;
- organization create/invite/accept/member role checks;
- admin route protection by `platformRole` and org role;
- OAuth authorization code with PKCE;
- authorization code with invalid PKCE verifier;
- redirect URI mismatch;
- consent required and consent skipped for trusted client;
- `prompt=create`;
- `prompt=select_account`;
- post-login organization selection;
- client credentials success;
- client credentials with public client rejected;
- client credentials with OIDC scopes rejected;
- `resource` JWT issued for valid resource;
- invalid resource rejected;
- resource narrowing allowed and widening rejected;
- JWKS verification of issued token;
- JWKS rotation/grace behavior;
- introspection active/inactive behavior;
- revocation behavior;
- refresh token exchange and replay prevention if Better Auth supports single-use refresh tokens in the selected config;
- resource server helper returns `401`, `403`, or success correctly.

Manual smoke tests:

- `wrangler dev` starts cleanly.
- `/.well-known/oauth-authorization-server` returns current local issuer metadata.
- `/.well-known/openid-configuration` returns current local issuer metadata when enabled.
- JWKS endpoint returns at least one public key after first signing operation.
- Admin UI can create org, create client, create resource server, run OAuth flow, and call test API.
- Remote deployment can run migrations and complete the same smoke flow.

Static checks:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- migration dry run or local D1 apply

## 18. Definition Of Done

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
- [ ] SPA receives opaque access token or server-validated token when `resource` param is not provided
- [ ] Resource server can verify JWT locally using JWKS endpoint
- [ ] Backend service can authenticate via client_credentials grant (M2M)
- [ ] M2M token does not contain user context or OIDC scopes
- [ ] JWKS key rotation behavior is configured and tested
- [ ] Old JWKS keys remain valid during the configured grace period
- [ ] Consent screen is shown for non-trusted clients
- [ ] Trusted clients skip consent where configured
- [ ] `prompt=select_account` works with multiple device sessions
- [ ] `prompt=create` redirects to sign-up page and resumes flow
- [ ] Post-login org selection flow works for org-scoped scopes
- [ ] `org_id` is injected into JWT claims for org-scoped tokens
- [ ] Admin UI is protected by platform role (`superadmin`/`admin`) and org role checks
- [ ] Admin UI shows dashboard with user/org/client/resource counts
- [ ] Admin UI allows CRUD of organizations, OAuth clients, and resource servers
- [ ] Admin UI allows viewing and revoking consents
- [ ] UserInfo endpoint returns correct user data with `openid` scope
- [ ] Token introspection returns valid/invalid for supported token types
- [ ] Token revocation invalidates supported token types immediately
- [ ] Refresh token can be exchanged for a new access token where enabled
- [ ] Refresh token replay behavior is tested and documented
- [ ] `/.well-known/oauth-authorization-server` returns correct metadata
- [ ] `/.well-known/openid-configuration` returns correct metadata where OIDC is enabled
- [ ] JWKS URI advertised by metadata returns signing keys
- [ ] Section 11 spikes are complete and their outcomes are reflected in implementation docs or tests
- [ ] Runtime resource server audience strategy is proven and documented
- [ ] Admin mutation audit fields are written for custom tables
- [ ] Secrets are configured through Cloudflare secret bindings, not committed config
- [ ] Runbooks exist for deploy, secret rotation, OAuth client disable, resource server disable, JWKS incident, and D1 migration failure
- [ ] First downstream app integration can be disabled or reverted without involving `auther`

### Required automated verification:

- [ ] OAuth2 authorization_code flow end-to-end test (PKCE S256, token exchange, API call)
- [ ] OAuth2 client_credentials flow end-to-end test
- [ ] OAuth2 refresh_token flow end-to-end test where refresh tokens are enabled
- [ ] Token revocation test
- [ ] Admin UI access control tests (superadmin, admin, org owner, member)
- [ ] JWKS rotation test (old key valid during grace period, new key used for new tokens)
- [ ] Organization isolation test (user in org A cannot access org B's clients/resources)
- [ ] Rate limit test for repeated auth attempts
- [ ] Metadata route tests
- [ ] Resource server JWT verification helper tests
- [ ] Admin custom route audit-field tests
- [ ] Log redaction tests for token/secret-bearing fields
- [ ] Resource audience cache invalidation or expiry test
- [ ] Local D1 clean migration and repeat migration test

### Required documentation:

- [ ] API reference for custom admin endpoints
- [ ] OAuth2/OIDC integration guide for apps
- [ ] Resource server JWT verification guide
- [ ] Admin UI operator guide
- [ ] Cloudflare Workers/D1/KV deployment guide
- [ ] Design-context notes explaining which `auther` ideas were intentionally not carried forward
- [ ] Operational runbooks from Section 14.2
- [ ] Security notes covering token policy, secret handling, and JWT verification requirements

## 19. Final Model

The new `id` service is a Cloudflare Worker backed by D1 and Better Auth 1.6.x. It uses:

- Better Auth core for users and sessions;
- organization plugin for tenants;
- OAuth Provider for authorization code, client credentials, refresh, consent, revocation, introspection, and userinfo;
- JWT/JWKS support for locally verifiable API access tokens;
- one small custom table for resource server metadata;
- an admin UI as the primary management surface.

What it deliberately does differently from `auther`:

- custom authorization spaces become organizations;
- `oidcProvider` becomes `oauthProvider`;
- API-key exchange becomes `client_credentials`;
- custom resource server metadata is reduced to a first-batch audience table;
- custom JWKS/token bridging is replaced by Better Auth JWT/JWKS behavior;
- custom admin surfaces are rebuilt against Better Auth server APIs.

What it intentionally does not include in first batch:

- ReBAC tuple graph authorization;
- ABAC/Lua policy evaluation;
- pipeline scripting/DAG editor/tracing;
- webhook delivery;
- registration contexts and automatic grant workflows.

The first batch succeeds when downstream apps can use `id` as a reliable OAuth/OIDC issuer, admins can manage tenants/clients/resources through UI, and resource servers can verify API tokens locally through JWKS without depending on `auther`.
