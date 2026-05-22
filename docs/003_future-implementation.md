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
> - `docs/010_organization-teams-oauth-flow.md`
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
- [7. Deferred OAuth Browser Pages](#7-deferred-oauth-browser-pages)
- [8. Deferred Admin Authorization Model](#8-deferred-admin-authorization-model)
- [9. API-First Scope Catalog, Token Claims, And Tooling](#9-api-first-scope-catalog-token-claims-and-tooling)

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
| `idOAuthScopeCatalog` | `oauthResourceScope`, `oauthClientOrganizationGrant` | API-first, UI-ready resource-server-bound OAuth scope catalog and optional M2M organization grants |
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
  idOAuthScopeCatalog(config.oauthScopes), // Future API-first scope catalog plugin
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
- Can be combined with explicit Worker bindings later if a future plugin needs private typed runtime communication with `core-id`.

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

The first batch scaffolds `ui-id` under `/admin/*` with hosted login/consent pages, `/admin/health`, and a `/admin/api` placeholder. Full admin pages and the admin dashboard are deferred.

**Temporary OAuth page scaffold:** `workers/ui/src/main.ts` currently serves raw HTML/CSS/JavaScript for `/login` and `/consent`. This is a first-release browser OAuth testing scaffold only. Phase 7 must replace these routes with proper Vinext App Router pages using `@id/ui` primitives such as `Page`, `Stack`, `Panel`, and `Button`. The replacement pages must live under `workers/ui/src/app/login/` and `workers/ui/src/app/consent/` so the `ui-route-composition` lint rule covers them.

**Architecture note (2026-05-20):** The inline `GET /api/admin/dashboard` endpoint was removed during the Phase 5.7 architecture cleanup (see `002_implementation-sequence.md`). When the dashboard is reimplemented, it must follow the clean-architecture pattern: domain entity/interface, application use case, infrastructure repository (via BA adapter), http route handler with `requireActor(c)`. `app.ts` no longer exists; route registration goes through `composition/create-app.ts` and `http/routes/*.routes.ts`.

**Other deferred architecture layers:**
- `domain/admin/` — empty directory for future Hono-owned domain entities and repository interfaces.
- `application/admin/authorization.ts` — `authorizeAdminAction(actor, action, orgId?)` is implemented and tested but has zero production callers after the dashboard was removed. The four `AdminAction` values (`listAnyOrganization`, `mutateAnyOrganization`, `manageOwnOrganization`, `delegateOwnOrganization`) map to the authorization model from Phase 4 and will be wired in Phase 7 when Hono admin routes call `requireActor(c)` → `authorizeAdminAction(actor, action, orgId)` before use cases.
- `auth/admin/actor.ts` — removed during the plugin-first auth cleanup because it had no production caller. Future Hono-owned admin routes should add actor loading with the request-scoped container work instead of reviving stale code.
- `infrastructure/` — currently no resource-server persistence module. The resource-server audience loader moved to `auth/plugins/resource-server/audiences.ts` because the table is plugin-owned. Future Hono-owned resources will need repositories/mappers under `infrastructure/repositories/`.
- `composition/` — currently only `create-app.ts` with Hono wiring. Phase 7 will add a request-scoped DI container (`create-request-container.ts`) that wires repositories into use cases and sets `c.set('container', container)` via Hono middleware.

### Deferred Admin Code Catalog (Phase 7)

These files exist and are tested but have no production callers. They are preserved as ready-made infrastructure for Phase 7 admin routes.

| File | Export | Purpose | Status |
|---|---|---|---|
| `application/admin/authorization.ts` | `authorizeAdminAction`, `AdminActor`, `AdminAction`, `PlatformRole`, `OrganizationRole` | Server-side authorization decisions per actor+action+org | Tested |
| `auth/admin/actor.ts` | Removed | Future actor loading should be rebuilt with the Phase 7 request-scoped container | Removed |
| `shared/http-status.ts` | `HTTP_UNAUTHORIZED` (401), `HTTP_FORBIDDEN` (403), `HTTP_OK` (200) | Named HTTP status constants | In use by health route |
| `domain/admin/` | (empty) | Future domain entities and repository interfaces | Scaffold only |

**Phase 7 wiring target:**

```ts
// http/routes/admin/dashboard.routes.ts (future)
export function registerAdminRoutes(app: Hono<{ Bindings: CoreEnv; Variables: { container: AppContainer } }>) {
  app.get("/api/admin/dashboard", async (c) => {
    const actor = requireActor(c);            // calls loadAdminActor
    const decision = authorizeAdminAction(actor, "listAnyOrganization");  // checks platform role
    if (!decision.allowed) return c.json({ error: decision.reason }, decision.status);
    const result = await c.var.container.dashboard.summarize.execute();
    return c.json(result, 200);
  });
}
```

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

The admin UI calls same-origin `core-id` public API routes directly from browser pages unless a future UI-owned `/admin/api` BFF endpoint needs server-side shaping. No D1 access. No Better Auth instance. Pure presentation.

## 7. Deferred OAuth Browser Pages

The first release should configure only the OAuth pages it actually builds: login and consent. Other Better Auth OAuth Provider browser surfaces are deferred because configured-but-missing pages create dead redirects in production.

Deferred pages and flows:

| Flow | Better Auth option | Future page | Notes |
|---|---|---|---|
| Public sign-up / `prompt=create` | `signup.page` | `/admin/sign-up` or `/sign-up` | Revisit when public or invite-aware self-service registration is intentionally opened. First release disables `emailAndPassword.disableSignUp`. |
| Account selection | `selectAccount.page` | `/admin/select-account` or `/select-account` | Useful only after multi-session/account switching is part of the product. |
| Post-login organization selection | `postLogin.page` | `/admin/select-organization` or `/select-organization` | Revisit when browser clients request org-scoped scopes before an active organization is selected. |
| Password recovery UX | Better Auth password reset callbacks/pages | `/forgot-password`, `/reset-password` | Email delivery is P0, but a polished hosted reset UX can follow if first release handles reset through API/direct links. |

Re-enable each option only in the same change that adds the page and tests the redirect-resume behavior. The tests should prove the page preserves Better Auth's signed OAuth query or continuation parameters and calls the expected Better Auth endpoint before resuming authorization.

## 8. Deferred Admin Authorization Model

A preliminary `AdminActor` / `authorizeAdminAction` RBAC model lived in `workers/core/src/application/admin/authorization.ts` with tests at `workers/core/tests/application/admin-authorization.test.ts`. Both files were removed on 2026-05-21 because the first batch ships with inline `isPlatformAdmin` / `hasOrganizationAccess` checks in Better Auth plugin callbacks.

**What was removed:**

```ts
type PlatformRole = "admin" | "user";
type OrganizationRole = "admin" | "member" | "owner";

type AdminActor = {
  readonly userId: string;
  readonly platformRole: PlatformRole;
  readonly organizations: readonly {
    readonly organizationId: string;
    readonly role: OrganizationRole;
  }[];
};

type AdminAction =
  | "listAnyOrganization"
  | "mutateAnyOrganization"
  | "manageOwnOrganization"
  | "delegateOwnOrganization";

function authorizeAdminAction(
  actor: AdminActor | null,
  action: AdminAction,
  organizationId?: string,
): AuthorizationDecision;
```

**When to reintroduce:**

- When admin endpoints grow beyond CRUD on a single `resourceServer` table and nested authorization patterns (organization-scoped actions with role delegation) need a centralized decision point.
- When the CEL policy engine (Section 2) is ready to replace the imperative `authorizeAdminAction` function.
- When `requireActor(c)` in [admin routes](/workers/core/src/http/routes/admin/) needs more granular action names than "platform admin vs not."

**How to restore:**

1. Copy the types and function from the [git history](https://github.com/) (commit prior to 2026-05-21 deletion).
2. Copy the test suite from the same history.
3. Wire `authorizeAdminAction` into `requireActor` or the use-case layer.
4. Add a snapshot test proving the allowed/denied decision table matches the current release's access rules.

Do not reintroduce the file without also updating `docs/000_repo-architecture.md` if the file placement or layer boundaries change.

## 9. API-First Scope Catalog, Token Claims, And Tooling

`docs/010_organization-teams-oauth-flow.md` defines the target shape for generic `id` capabilities that resource APIs need. The implementation should be API-first: enable Better Auth teams, build the resource-server-bound OAuth scope catalog plugin, publish token claim contracts, add token issuance checks, update scripts/tooling, and test those contracts before building admin UI pages.

### 9.1 Required API-First Work

The future `idOAuthScopeCatalog` plugin should own:

- `oauthResourceScope` rows: OAuth scopes bound to a specific `resourceServer.id`;
- `oauthClientOrganizationGrant` rows if org-scoped M2M tokens are supported;
- scope preload and invalidation for `/oauth2/authorize` and `/oauth2/token`;
- generic token issuance checks for audience, scope, organization, team claims, and client eligibility.

The first implementation should expose API/plugin contracts and integration tests. Admin UI pages under `/admin/*` are a later consumer of these endpoints, not a prerequisite for the API/plugin work.

This future work must not add Content IAM to `id`. Product roles, product permissions, role-permission mappings, concrete grants, resource hierarchy/inheritance, final `ContentPolicy.can(...)`, and product policy audit events belong in the resource API.

### 9.2 Scripts And Tooling Reminders

The existing architecture lint rule `architecture/no-direct-db-access` currently allowlists raw D1 fallback only for:

```text
workers/core/src/auth/plugins/resource-server/audiences.ts
```

The OAuth scope catalog needs the same kind of plugin-owned preload companion because `oauthProvider({ scopes })` requires enabled scopes before Better Auth is constructed. When adding `workers/core/src/auth/plugins/oauth-scope-catalog/scopes.ts`, update:

- `scripts/oxlint-js-plugins/architecture.js` — allow approved plugin-owned preload companions, not only the resource-server audience companion.
- The lint error text in the same rule — make it mention approved plugin-owned preload companions.
- Any architecture lint fixtures or tests if the repo adds them before this work lands.
- `scripts/auth-api.mjs` and `scripts/auth-api-shared.mjs` only if API smoke helpers are needed before admin UI exists.
- `scripts/remote-smoke.mjs` after scope/team/token endpoints exist, so remote smoke can prove DB-backed scopes participate in OAuth token issuance.

Keep the boundary strict:

- Plugin CRUD must use the Better Auth adapter.
- Raw D1 fallback is allowed only in preload companions that must run before Better Auth exists.
- Do not weaken the rule globally to make policy work pass lint.

### 9.3 Deferred Admin UI

Full admin UI remains part of Section 6. It should not block:

- Better Auth team enablement;
- token claim contracts;
- plugin schemas for resource-server-bound OAuth scopes or M2M org grants;
- DB-backed OAuth scope preload;
- token issuance checks;
- resource API verification guidance;
- architecture script updates.

When the UI work starts, it should call `id` API endpoints for generic teams, OAuth clients, audiences, scopes, and M2M grants. It must not introduce UI-owned D1 access or product policy state inside `id`.
