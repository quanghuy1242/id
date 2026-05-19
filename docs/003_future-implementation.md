# id — Future Implementation

> Status: planning notes — revisit when first batch ships
>
> Date: 2026-05-19
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — the `id` identity provider monorepo
>
> Source docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/001_first-batch-plan.md`
> - CEL specification — `https://github.com/google/cel-spec`
> - Cloudflare Workers Analytics Engine — `https://developers.cloudflare.com/analytics/analytics-engine/`
> - Cloudflare Dynamic Workers — `https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/`
> - Better Auth plugin API — `https://better-auth.com/docs/concepts/plugins`

## Table Of Contents

- [1. Plugin Architecture Strategy](#1-plugin-architecture-strategy)
- [2. CEL Policy Engine (Replaces ABAC/Lua)](#2-cel-policy-engine-replaces-abaclua)
- [3. Onboarding Flows](#3-onboarding-flows)
- [4. Analytics And Metrics](#4-analytics-and-metrics)
- [5. Pipeline Hook System](#5-pipeline-hook-system)
- [6. Full Admin UI](#6-full-admin-ui)

## 1. Plugin Architecture Strategy

All future features are Better Auth plugins, not standalone custom code. The first batch's `idResourceServer` plugin proves this pattern: a plugin owns its table definition via BA's `schema` system, its API endpoints via `createAuthEndpoint`, and its runtime behavior via BA hooks.

**Why plugins over custom code:**

- BA's CLI generates migrations for plugin schemas — no separate migration tooling.
- BA's adapter handles CRUD — no custom Drizzle queries.
- Plugin endpoints register automatically on the BA handler — no manual Hono route registration.
- BA version upgrades cover plugin schemas — no schema drift.

**Future plugin registry:**

| Plugin | Table | Purpose |
|---|---|---|
| `idResourceServer` | `resourceServer` | First batch — resource server management |
| `idCelPolicy` | `celPolicy` | CEL-based ABAC policy evaluation |
| `idOnboarding` | (extends org plugin) | Registration contexts, invite tokens |
| `idMetrics` | (no table) | Analytics Engine writes via BA hooks |
| `idPipeline` | `pipelineScript` | Dynamic Worker dispatch on auth events |

**Plugin registration pattern:**

```ts
plugins: [
  organization(config.organization),
  jwt(config.jwt),
  oauthProvider({ ... }),
  idResourceServer(),
  idCelPolicy(config.cel),        // Future
  idOnboarding(config.onboarding), // Future
  idPipeline(config.pipeline),     // Future
]
```

## 2. CEL Policy Engine (Replaces ABAC/Lua)

### 2.1 Why CEL

The ABAC/Lua engine in `auther` used Wasmoon with a 20-engine pool, sandboxed Lua scripts, and OpenTelemetry tracing. This is incompatible with the id architecture:

- Workers have 128MB memory — a Wasmoon pool alone would consume 100MB baseline.
- Lua requires sandboxing which adds latency, complexity, and security surface.
- Auth0's authorization model stops at RBAC + scopes — none of the IdP competitors provide embedded Lua scripting.

CEL (Common Expression Language) is the industry standard for lightweight policy evaluation:
- **Non-Turing complete** — no sandboxing needed. Evaluates in O(n) time.
- **Nanosecond/microsecond latency** — measured, not estimated.
- **Used by Google IAM, Kubernetes Admission Policy, Envoy, Agentgateway** — not experimental.
- **C-like syntax** — familiar to every developer. No Lua learning curve.
- **`cel-go` has a YAML Policy format** — structured rules with match/output/condition semantics.

### 2.2 Plugin Design

The `idCelPolicy` plugin provides:
- A `celPolicy` table — stores named policies with CEL expressions, per-organization.
- A CEL evaluator — compiles expressions at policy creation time, evaluates at token issuance time against JWT claims + request context.
- A `cel` function — callable from `customAccessTokenClaims` to inject policy evaluation results into tokens.

**Example policy (admin dashboard):**

```yaml
name: billing-access
description: Allow billing operations for org owners on pro plan
rule:
  match:
    - condition: context.user.org_role == "owner" && context.user.plan == "pro"
      output: "true"
    - output: "false"
```

**Runtime flow:**

```
Token issuance → idCelPolicy.evaluate(claims, context)
  → compile & cache CEL expression
  → evaluate against input
  → return result (boolean, or enrich claims)
```

**CEL advantages over auther's Lua:**
- No sandbox — CEL is safe by construction.
- No memory pool — stateless evaluation.
- No Worker memory limit concern.
- Parse-once, evaluate-many with compiled AST caching.
- Type-checked at parse time, not at runtime.

### 2.3 Ecosystem Fit

CEL complements the first-batch RBAC model:
- RBAC handles coarse-grained access (owner/admin/member → resource:action).
- CEL handles fine-grained conditions (can refund only if amount < $1000, can access only during business hours, can manage only own-team resources).
- Both are evaluated at token issuance time — no runtime callbacks to the IdP for every API request.

## 3. Onboarding Flows

### 3.1 Alignment With Better Auth

The `organization` plugin already handles invitations (`inviteMember`, `acceptInvitation`, `rejectInvitation`). The gap is custom registration flows:

| Feature | Better Auth support | Custom work needed |
|---|---|---|
| Email/password sign-up | Built-in | None |
| Organization invitations | Built-in | None |
| `prompt=create` during OAuth | Built-in | Sign-up page |
| Domain-restricted sign-up | None — build via hooks | `beforeEmailSignUp` hook checks domain |
| Invite-only sign-up | None — build via hooks | Custom invite token validation |
| Automatic permission grants on join | None — build via hooks | `afterCreateMember` hook applies grants |

### 3.2 Plugin Design

The `idOnboarding` plugin extends the organization plugin via hooks:
- Validates invite tokens on `beforeEmailSignUp`.
- Applies automatic permission grants on `afterCreateMember`.
- Generates HMAC-signed invite tokens with configurable expiry.

**Why a plugin, not custom code:**
- Hooks are the standard BA extension mechanism.
- Invite token generation can reuse BA's crypto helpers.
- No custom tables needed — invite state lives in the org plugin's `invitation` table with additional metadata.

## 4. Analytics And Metrics

### 4.1 Cloudflare Workers Analytics Engine

Workers Analytics Engine is purpose-built for this use case:
- **Non-blocking writes:** `writeDataPoint()` returns immediately, no latency impact on auth flows.
- **High-cardinality:** blobs support customer IDs, org IDs, client IDs as dimensions.
- **SQL API + Grafana:** query for dashboards, export to external tools.
- **Use cases from docs:** custom business metrics, per-customer analytics, usage-based billing, performance tracking.

### 4.2 Plugin Design

The `idMetrics` plugin writes data points via BA hooks. No custom tables — data lives in Analytics Engine datasets.

**Ops dataset (`id-ops`):**

| Blob (dimension) | Double (measure) | Event |
|---|---|---|
| `grant_type` | count | Token issuance |
| `grant_type`, `client_id` | count, latency_ms | Token issuance per client |
| `scope` | count | Scope usage |
| `reason` | count | Auth failure |
| `kid` | count | JWKS hit |

**User-facing dataset (`id-usage`):**

| Blob (dimension) | Double (measure) | Event |
|---|---|---|
| `org_id`, `client_id` | count | Per-org per-client token volume |
| `org_id`, `user_id` | count | Per-org per-user login activity |
| `org_id`, `resource` | count | Per-org per-resource API usage |

**Why Analytics Engine, not D1:**
- Zero latency impact — non-blocking writes.
- No custom table to maintain and migrate.
- Designed for high-cardinality time-series data.
- SQL API + Grafana for both ops and user-facing dashboards.
- Cost scales with data volume, not query count.

## 5. Pipeline Hook System

### 5.1 Cloudflare Dynamic Workers

Dynamic Workers spin up Workers at runtime to execute arbitrary JS code in a sandboxed environment:
- Configure bindings, network access, limits per execution.
- No cold start — Workers runtime, not containers.
- Attach Tail Workers for observability.
- Combined with RPC service bindings for typed communication with `core-id`.

**Why Dynamic Workers, not containers (Sandbox SDK):**
- Dynamic Workers are lighter — JS runtime, not Ubuntu Linux.
- No container lifecycle management — instant spin-up/teardown.
- Same security isolation as any Cloudflare Worker.
- Hook code runs in a familiar environment (JS, not Lua).

### 5.2 Plugin Design

The `idPipeline` plugin dispatches hook scripts as Dynamic Workers:
- A `pipelineScript` table stores JS hook code (per organization, per event type).
- On auth event (signup, signin, signout, token issuance, API key operations, OAuth client operations), the plugin spins up a Dynamic Worker with the hook code and event context.
- The Dynamic Worker evaluates the hook and returns a result: `{ allowed: true/false }` (block), `{ data: {...} }` (enrich), or `undefined` (async — fire and forget).

**Event types (reduced from auther's 16):**

| Group | Events |
|---|---|
| Authentication | `beforeSignup`, `afterSignup`, `beforeSignin`, `afterSignin`, `beforeSignout` |
| Token | `beforeTokenIssue` |
| OAuth Client | `beforeClientRegister`, `afterClientRegister`, `beforeAuthorize` |
| API Key | `beforeApiKeyCreate`, `afterApiKeyCreate` |

**Why Dynamic Workers, not Lua Wasmoon:**
- JS is the Workers-native language — no wasm compilation overhead.
- No memory pool management — Workers runtime handles isolation.
- No 128MB limitation for the host Worker — Dynamic Workers run in their own isolate.
- Code is just JS — LSP, linting, testing all work without special tooling.

## 6. Full Admin UI

### 6.1 Deferred From First Batch

The first batch scaffolds `ui-id` with a health-check page and service binding to `core-id`. Full admin pages and the admin dashboard are deferred.

**Architecture note (2026-05-20):** The inline `GET /api/admin/dashboard` endpoint was removed during the Phase 5.7 architecture cleanup (see `002_implementation-sequence.md`). When the dashboard is reimplemented, it must follow the clean-architecture pattern: domain entity/interface, application use case, infrastructure repository (via BA adapter), http route handler with `requireActor(c)`. `app.ts` no longer exists; route registration goes through `composition/create-app.ts` and `http/routes/*.routes.ts`.

**Other deferred architecture layers:**
- `domain/` — Hono-owned entities and repository interfaces (currently only `domain/admin/` exists and is empty)
- `application/` — use-case classes (currently only `application/admin/authorization.ts` with pure function)
- `infrastructure/` — currently only `persistence/resource-server-store.ts`; needs repositories/mappers for any future Hono-owned resources
- `composition/` — request-scoped DI container (currently only `create-app.ts` with Hono wiring)
- `auth/admin/actor.ts` — `loadAdminActor` is implemented but unused; will be called by future admin routes

**Pages to build:**

| Page | Route | Capabilities |
|---|---|---|
| Dashboard | `/admin` | User/org/client/resource counts, token issuance metrics (from Analytics Engine) |
| Organizations | `/admin/organizations` | List, create, update, delete |
| Organization detail | `/admin/organizations/:id` | Members, invitations, roles, settings |
| OAuth clients | `/admin/clients` | List, create, update, disable |
| OAuth client detail | `/admin/clients/:id` | Redirect URIs, scopes, grants, secret rotation, consent settings |
| Resource servers | `/admin/resource-servers` | List, create, update, disable audiences |
| CEL policies | `/admin/policies` | List, create, update, test CEL policies |
| Users | `/admin/users` | List, view sessions, ban/unban |
| User detail | `/admin/users/:id` | Profile, sessions, org memberships, linked accounts |
| Consents | `/admin/consents` | List, revoke per-user client authorizations |
| Settings | `/admin/settings` | Issuer URL, metadata health, JWKS status, runtime versions |

### 6.2 Lumina UI Contract

All admin pages follow the Lumina UI system from `/home/quanghuy1242/pjs/books/docs/001_lumina_ui_system_daisyui_tailwind.md`:
- Token props, not raw `className`.
- Composition-only route files — no raw HTML, Tailwind, or DaisyUI classes.
- `packages/ui/` components for all visual primitives.
- Compact density, two themes, React Aria at leaf components.

### 6.3 Data Flow

The admin UI calls `core-id`'s admin API through the `CORE_ID` service binding. No D1 access. No Better Auth instance. Pure presentation.
