# Plugin-First Auth Architecture Refactor Plan

> Status: implementation-grade architecture and refactor plan
>
> Date: 2026-05-21
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth`
> - `workers/core/src/auth/**`
> - `workers/core/src/http/routes/auth-mount.ts`
> - `workers/core/src/infrastructure/persistence/resource-server-store.ts`
> - `scripts/oxlint-js-plugins/architecture.js`
>
> Source docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/001_first-batch-plan.md`
> - `workers/core/src/auth/plugins/README.md`
> - `workers/core/src/auth/plugins/resource-server/README.md`
> - `.agents/skills/id-auth-plugin/SKILL.md`
>
> Source code reviewed:
>
> - `workers/core/src/auth/get-auth.ts`
> - `workers/core/src/auth/adapters/audiences.ts`
> - `workers/core/src/auth/admin/access.ts`
> - `workers/core/src/auth/admin/actor.ts`
> - `workers/core/src/auth/contracts.ts`
> - `workers/core/src/auth/plugins/resource-server/index.ts`
> - `workers/core/src/auth/plugins/resource-server/schema.ts`
> - `workers/core/src/auth/plugins/resource-server/operations.ts`
> - `workers/core/src/auth/plugins/resource-server/types.ts`
> - `workers/core/src/http/routes/auth-mount.ts`
> - `workers/core/src/infrastructure/persistence/resource-server-store.ts`
> - `workers/core/tests/auth/audiences.test.ts`
> - `workers/core/tests/auth/contracts.test.ts`
>
> Installed package evidence:
>
> - `better-auth@1.6.11`
> - `@better-auth/oauth-provider@1.6.11`
> - `node_modules/@better-auth/oauth-provider/dist/oauth-BqWgUea8.d.mts`
> - `node_modules/@better-auth/oauth-provider/dist/index.mjs`
> - `node_modules/@better-auth/core/dist/types/plugin.d.mts`
>
> Assumptions:
>
> - The project should maximize Better Auth adoption and avoid rebuilding a parallel auth framework.
> - Custom auth-owned tables should be Better Auth plugin schemas, not standalone Drizzle/domain/application stacks.
> - Hono remains the Worker router and mount shell, but auth-domain behavior should move under `workers/core/src/auth/**`.
> - The resource-server audience KV cache is required behavior and must be preserved.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Better Auth Lifecycle And Audience Timing](#31-better-auth-lifecycle-and-audience-timing)
  - [3.2 Current Resource-Server Audience Flow](#32-current-resource-server-audience-flow)
  - [3.3 Resource-Server Plugin Shape](#33-resource-server-plugin-shape)
  - [3.4 Admin Access And Actor Code](#34-admin-access-and-actor-code)
  - [3.5 Route Contracts In Production Source](#35-route-contracts-in-production-source)
  - [3.6 Zod Schema Direction](#36-zod-schema-direction)
  - [3.7 Enforcement Gaps](#37-enforcement-gaps)
- [4. Target Model](#4-target-model)
  - [4.1 Ownership Model](#41-ownership-model)
  - [4.2 Resource-Server Audience Runtime Companion](#42-resource-server-audience-runtime-companion)
  - [4.3 KV Cache Model](#43-kv-cache-model)
  - [4.4 Hono Mount Model](#44-hono-mount-model)
  - [4.5 Policy And Admin Model](#45-policy-and-admin-model)
  - [4.6 Schema And Type Model](#46-schema-and-type-model)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Use Pre-Auth Composition For OAuth Audiences](#51-use-pre-auth-composition-for-oauth-audiences)
  - [5.2 Keep KV Cache As The Normal Read Path](#52-keep-kv-cache-as-the-normal-read-path)
  - [5.3 Move Raw Resource-Server Audience Query Under The Plugin Boundary](#53-move-raw-resource-server-audience-query-under-the-plugin-boundary)
  - [5.4 Keep Explicit Better Auth Endpoints](#54-keep-explicit-better-auth-endpoints)
  - [5.5 Move Test-Only Route Contracts Out Of Production Source](#55-move-test-only-route-contracts-out-of-production-source)
  - [5.6 Enforce After The Refactor Shape Exists](#56-enforce-after-the-refactor-shape-exists)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
  - [7.1 Resource-Server Audience Companion](#71-resource-server-audience-companion)
  - [7.2 Auth Mount Simplification](#72-auth-mount-simplification)
  - [7.3 Access Policy Cleanup](#73-access-policy-cleanup)
  - [7.4 Route Contract Relocation](#74-route-contract-relocation)
  - [7.5 Zod-First Boundary Rules](#75-zod-first-boundary-rules)
  - [7.6 Oxlint Enforcement](#76-oxlint-enforcement)
  - [7.7 Documentation Updates](#77-documentation-updates)
- [8. Migration And Rollout](#8-migration-and-rollout)
- [9. Edge Cases And Failure Modes](#9-edge-cases-and-failure-modes)
- [10. Implementation Backlog](#10-implementation-backlog)
  - [R1-A. Move Resource-Server Audience Runtime Under Plugin](#r1-a-move-resource-server-audience-runtime-under-plugin)
  - [R1-B. Simplify Auth Mounting](#r1-b-simplify-auth-mounting)
  - [R1-C. Clean Admin Policy Boundary](#r1-c-clean-admin-policy-boundary)
  - [R1-D. Move Route Contracts Out Of Production Source](#r1-d-move-route-contracts-out-of-production-source)
  - [R1-E. Update Plugin Guidelines](#r1-e-update-plugin-guidelines)
  - [R1-F. Add Architecture Lint Rules](#r1-f-add-architecture-lint-rules)
- [11. Future Backlog](#11-future-backlog)
- [12. Test And Verification Plan](#12-test-and-verification-plan)
- [13. Definition Of Done](#13-definition-of-done)
- [14. Final Model](#14-final-model)

## 1. Goal

Refactor the auth worker toward a plugin-first model that treats Better Auth as the primary auth framework instead of routing custom auth behavior through Hono, standalone infrastructure modules, or domain/application layers.

The first required outcome is to move resource-server audience ownership closer to `id-resource-server`, including the pre-Better-Auth audience load, the D1 fallback query, the KV cache read path, and cache invalidation after resource-server mutations.

Non-goals for this plan:

- Do not remove Better Auth's `admin`, `organization`, `jwt`, `oauthProvider`, or `openAPI` plugins.
- Do not replace Better Auth endpoint declarations with generic Hono CRUD routes.
- Do not remove the KV audience cache.
- Do not introduce standalone Drizzle schema, repository, entity, or use-case layers for the `resourceServer` table.
- Do not use Better Auth hooks to mutate another plugin's already-created options.

## 2. System Summary

The core worker mounts Better Auth under `/api/auth/*` through `workers/core/src/http/routes/auth-mount.ts`. `getAuth()` in `workers/core/src/auth/get-auth.ts` constructs Better Auth with native plugins and the custom `idResourceServer` plugin.

OAuth Provider needs a list of valid resource audiences when its plugin is constructed:

```ts
oauthProvider({
  validAudiences: [...validAudiences],
})
```

Those audiences are stored in the Better Auth plugin-owned `resourceServer` table. That creates a legitimate bootstrapping problem:

1. The OAuth Provider plugin needs `validAudiences` before Better Auth is initialized.
2. The normal Better Auth adapter context exists only after Better Auth is initialized.
3. Therefore the enabled audience list must be loaded before `betterAuth(getAuthOptions(...))`.
4. The read path must still be owned by the auth/plugin boundary and must keep the KV cache to avoid querying D1 on every auth request.

This is not a reason to put resource-server logic in Hono. It is a reason to create a plugin-owned pre-auth runtime companion that the Hono mount calls.

## 3. Current-State Findings

### 3.1 Better Auth Lifecycle And Audience Timing

Observed package behavior in `@better-auth/oauth-provider@1.6.11`:

- `OAuthProviderOptions.validAudiences` is typed as `validAudiences?: string[]` in `node_modules/@better-auth/oauth-provider/dist/oauth-BqWgUea8.d.mts`.
- `node_modules/@better-auth/oauth-provider/dist/index.mjs` builds a `Set` from `opts.validAudiences` inside `checkResource(...)`.
- The installed type does not accept `() => Promise<string[]>` or a request-time audience provider.

Observed Better Auth plugin lifecycle in `@better-auth/core@1.6.11`:

- `BetterAuthPlugin` supports `init`, `endpoints`, `middlewares`, `onRequest`, `onResponse`, `hooks.before`, and `hooks.after`.
- `plugin.init(ctx)` runs during Better Auth context initialization.
- `hooks.before`, `hooks.after`, `onRequest`, endpoint middleware, and endpoint handlers run after Better Auth has already been constructed.

Conclusion:

- Better Auth hooks are not the right mechanism for loading `oauthProvider.validAudiences`.
- A plugin `init` hook is also not a clean mechanism here because it would require cross-plugin mutation of the OAuth Provider options after `oauthProvider({...})` has already been created.
- The clean approach is a pre-auth composition step that loads audiences before `getAuth(...)`, while keeping the loader owned by the resource-server plugin boundary.

### 3.2 Current Resource-Server Audience Flow

Current files:

- `workers/core/src/http/routes/auth-mount.ts`
- `workers/core/src/auth/adapters/audiences.ts`
- `workers/core/src/infrastructure/persistence/resource-server-store.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/auth/plugins/resource-server/index.ts`

Current flow:

1. `auth-mount.ts` handles `/api/auth/*` and well-known aliases.
2. Each handler calls `loadResourceAudiences(c.env.KV, () => loadEnabledResourceAudienceRows(c.env.DB))`.
3. `loadResourceAudiences(...)` reads the KV cache key from `authPluginConfig.resourceAudienceCacheKey`.
4. On cache hit, it returns `{ audiences, source: "cache" }`.
5. On cache miss or invalid cached JSON shape, it calls the supplied row loader, normalizes enabled audiences, writes JSON back to KV with `authPluginConfig.resourceAudienceCacheTtlSeconds`, and returns `{ audiences, source: "store" }`.
6. `loadEnabledResourceAudienceRows(...)` runs raw D1 SQL against the `resourceServer` model.
7. `getAuth(env, loaded.audiences, ...)` passes the audiences into `oauthProvider({ validAudiences })`.
8. Resource-server mutation endpoints call `invalidateResourceAudiences(env.KV)` through the `idResourceServer` plugin option.

This behavior is functionally reasonable. The problem is ownership:

- `auth-mount.ts` knows resource-server audience loading details.
- `infrastructure/persistence/resource-server-store.ts` owns a query for a Better Auth plugin table.
- The pre-auth exception is documented locally, but the exception lives outside the plugin boundary it serves.

### 3.3 Resource-Server Plugin Shape

Current plugin files:

- `workers/core/src/auth/plugins/resource-server/index.ts`
- `workers/core/src/auth/plugins/resource-server/schema.ts`
- `workers/core/src/auth/plugins/resource-server/operations.ts`
- `workers/core/src/auth/plugins/resource-server/types.ts`
- `workers/core/src/auth/plugins/resource-server/README.md`

The plugin already has the right internal direction:

- `schema.ts` owns the canonical Zod row schema, request schemas, Better Auth field derivation, and OpenAPI fragments.
- `index.ts` owns the Better Auth schema block and explicit `createAuthEndpoint` endpoint declarations.
- `operations.ts` owns framework-light helpers for authorization wrappers, uniqueness checks, and mutation payloads.
- `types.ts` owns runtime plugin options.

The missing piece is a plugin-owned runtime companion for behavior that must happen before Better Auth exists.

### 3.4 Admin Access And Actor Code

Current files:

- `workers/core/src/auth/admin/access.ts`
- `workers/core/src/auth/admin/actor.ts`
- `workers/core/src/auth/get-auth.ts`

Observed usage:

- `get-auth.ts` imports `isPlatformAdmin`, `hasOrganizationAccess`, and `AdminDbAdapter` from `auth/admin/access.ts`.
- `idResourceServer(...)` receives an `authorize` callback that uses those helpers.
- `oauthProvider.clientPrivileges` also uses `isPlatformAdmin(...)`.
- `auth/admin/actor.ts` is not used by production source after prior Hono admin routes were removed.

Conclusion:

- `auth/admin/actor.ts` appears removable once tests confirm no callers.
- `auth/admin/access.ts` should not be blindly deleted because the policy concepts remain in use.
- The better direction is to move policy helpers to a name that is not coupled to the old Hono admin actor model, such as `workers/core/src/auth/policies/access.ts`, or split resource-server-specific checks into `workers/core/src/auth/plugins/resource-server/access.ts`.

### 3.5 Route Contracts In Production Source

Current file:

- `workers/core/src/auth/contracts.ts`

Observed usage:

- `workers/core/tests/auth/contracts.test.ts` imports `authRouteMap`.
- No production source currently needs `authRouteMap`.

Conclusion:

- A manually maintained route map used only by tests should not live in production `src`.
- The route contract can move to test fixtures, docs snapshots, or a generated assertion path.
- Keeping it in `src` implies it is part of the runtime auth API, which is misleading.

### 3.6 Zod Schema Direction

Current file:

- `workers/core/src/auth/plugins/resource-server/schema.ts`

Observed behavior:

- The canonical row schema is Zod.
- Request body schemas reuse fields from the row schema.
- Types are inferred with `z.infer`.
- Better Auth field definitions and OpenAPI schemas are derived once at module scope.

Conclusion:

- This is the right pattern for runtime boundaries: tables, request bodies, response bodies, OpenAPI fragments, env/config, and future shared client contracts.
- TypeScript-only interfaces are still appropriate for callback options and internal adapter surfaces that do not cross a runtime trust boundary.

### 3.7 Enforcement Gaps

Current architecture lint already enforces many clean-architecture rules, but it does not yet fully encode the plugin-first auth direction.

Gaps to close after the refactor:

- New auth-owned plugin tables should not get raw persistence modules outside `workers/core/src/auth/plugins/**`.
- Hono route files should not grow new `/api/admin/*` auth-domain CRUD APIs when a Better Auth plugin endpoint is the correct home.
- Test-only route contract files should not live in production `workers/core/src/auth/**`.
- Custom Better Auth plugins should follow the documented folder shape.
- Better Auth imports should remain restricted to `workers/core/src/auth/**`, approved mounts, scripts, and tests.

## 4. Target Model

### 4.1 Ownership Model

Auth-owned behavior lives in `workers/core/src/auth/**`.

Better Auth plugin-owned tables live under:

```text
workers/core/src/auth/plugins/<plugin>/
├── index.ts
├── schema.ts
├── operations.ts
├── types.ts
├── README.md
└── <runtime-companion>.ts
```

The resource-server plugin owns:

- the `resourceServer` Better Auth model;
- `/api/auth/admin/resource-servers...` endpoints;
- Zod row/request/response schemas;
- Better Auth field derivation;
- OpenAPI fragments;
- resource audience cache loading;
- resource audience cache invalidation;
- the pre-auth raw D1 read needed to build OAuth Provider options.

Hono owns:

- mounting `/api/auth/*`;
- mounting well-known aliases;
- passing Worker bindings and `waitUntil` into auth composition;
- health/bootstrap exceptional routes.

### 4.2 Resource-Server Audience Runtime Companion

Add a plugin-owned module such as:

```text
workers/core/src/auth/plugins/resource-server/audiences.ts
```

This module should own the current behavior from both:

- `workers/core/src/auth/adapters/audiences.ts`
- `workers/core/src/infrastructure/persistence/resource-server-store.ts`

Suggested exports:

```ts
export type ResourceAudienceRow = {
  readonly audience: string;
  readonly enabled: boolean;
};

export type AudienceLoadResult = {
  readonly audiences: readonly string[];
  readonly source: "cache" | "store";
};

export async function loadResourceServerAudiences(
  env: Pick<CoreEnv, "DB" | "KV">,
): Promise<AudienceLoadResult>;

export async function invalidateResourceServerAudiences(
  env: Pick<CoreEnv, "KV">,
): Promise<void>;
```

`loadResourceServerAudiences(...)` should:

1. read the audience JSON from KV;
2. validate that it is an array of strings;
3. return cache results when valid;
4. query D1 only on cache miss or invalid cache shape;
5. dedupe, filter enabled audiences, and sort the result;
6. write the result to KV with `authPluginConfig.resourceAudienceCacheTtlSeconds`;
7. return the source as `"cache"` or `"store"` for test observability.

The raw D1 query remains an approved exception because it must run before Better Auth exists. The exception should be local to the plugin that owns the table.

### 4.3 KV Cache Model

The KV cache is required and should stay in the first-release model.

The cache exists because `/api/auth/*`, token routes, and discovery routes can be frequent. Loading enabled audiences from D1 before constructing Better Auth on every request would make auth startup more expensive and increase D1 pressure.

Cache behavior:

- Key: `authPluginConfig.resourceAudienceCacheKey`
- Value: JSON array of enabled audience strings
- TTL: `authPluginConfig.resourceAudienceCacheTtlSeconds`
- Hit path: no D1 read
- Miss path: D1 query, normalize, write KV
- Invalid shape path: ignore cached value, query D1, rewrite KV
- Mutation path: plugin endpoint calls invalidation after create, update, delete, and disable

The cache is not a correctness boundary. It is a performance boundary with bounded staleness. Correctness comes from invalidating it after resource-server mutations and from TTL recovery when invalidation fails.

### 4.4 Hono Mount Model

`workers/core/src/http/routes/auth-mount.ts` should not import resource-server store or low-level audience cache helpers.

Target shape:

```ts
app.all("/api/auth/*", async (c) => {
  const auth = await createAuthForRequest(c.env, {
    waitUntil: (task) => c.executionCtx.waitUntil(task),
  });
  return auth.handler(c.req.raw);
});
```

The exact helper name can vary, but the mount should read like auth composition, not resource-server orchestration.

Well-known alias handlers can use the same helper and then rewrite the request path.

### 4.5 Policy And Admin Model

The codebase should keep Better Auth's `admin()` plugin enabled.

For custom plugin endpoints:

- Use Better Auth `sessionMiddleware`.
- Use explicit policy helpers for platform-admin and organization-membership decisions.
- Do not reintroduce Hono `requireActor(c)` for plugin-owned tables.
- Do not rely on Better Auth's `admin()` plugin to authorize custom plugin table access automatically.

Recommended policy placement:

```text
workers/core/src/auth/policies/access.ts
```

This file can own generic auth policy helpers:

- `isPlatformAdmin(role)`
- `hasOrganizationAccess(adapter, userId, organizationId)`

If the policy becomes resource-server-specific, move narrower wrappers into:

```text
workers/core/src/auth/plugins/resource-server/access.ts
```

`auth/admin/actor.ts` should be removed if still unused after the refactor.

### 4.6 Schema And Type Model

Use Zod for runtime boundaries:

- Better Auth plugin rows;
- request bodies;
- response bodies;
- OpenAPI schema fragments;
- env/config values;
- future shared API contract packages.

Use TypeScript-only types for:

- plugin callback options;
- adapter capability surfaces;
- internal composition options;
- values that are never parsed from an untrusted runtime boundary.

This keeps runtime contracts consistent without forcing Zod into places where it adds no runtime value.

## 5. Architecture Decisions

### 5.1 Use Pre-Auth Composition For OAuth Audiences

Decision:

- Load resource-server audiences before constructing Better Auth.
- Keep the loader owned by the resource-server plugin area.

Reasoning:

- `@better-auth/oauth-provider@1.6.11` expects `validAudiences?: string[]`.
- Better Auth request hooks run too late for configuring `oauthProvider`.
- `plugin.init` is not appropriate because it would require cross-plugin mutation of another plugin's already-created options.
- A pre-auth composition step is explicit, testable, and matches the installed library contract.

Rejected option:

- Use Better Auth `hooks.before` or `onRequest` to load audiences. This is too late because the OAuth Provider plugin has already been constructed.

Rejected option:

- Mutate OAuth Provider options from `idResourceServer.init(...)`. This couples two plugins through implementation details and would be fragile across Better Auth upgrades.

### 5.2 Keep KV Cache As The Normal Read Path

Decision:

- Preserve the KV cache and make it part of the resource-server plugin runtime contract.

Reasoning:

- Audience loading happens before Better Auth construction for auth requests.
- Without the cache, every auth request would pay a D1 query before routing into Better Auth.
- Cache invalidation after plugin mutations already exists and should stay.
- TTL recovery protects against missed invalidation.

Rejected option:

- Remove KV and query D1 every time. This is simpler code but wrong for the expected auth traffic shape.

### 5.3 Move Raw Resource-Server Audience Query Under The Plugin Boundary

Decision:

- Move `loadEnabledResourceAudienceRows(...)` out of `workers/core/src/infrastructure/persistence/resource-server-store.ts`.
- Keep the raw D1 query in a resource-server plugin runtime module.

Reasoning:

- The `resourceServer` table is a Better Auth plugin-owned table.
- The query is only needed because the plugin table feeds another Better Auth plugin at auth construction time.
- Keeping the exception near the plugin prevents a pattern where plugin-owned tables spread into generic infrastructure persistence.

Rejected option:

- Keep the query in `infrastructure/persistence`. This preserves existing behavior but weakens the plugin-first boundary.

### 5.4 Keep Explicit Better Auth Endpoints

Decision:

- Keep the six resource-server endpoint declarations visible in `index.ts`.

Reasoning:

- They are actual Better Auth contract declarations.
- Each route has distinct validation, authorization, cache invalidation, and response behavior.
- A generic CRUD builder would hide behavior before there is enough duplication pressure.

Rejected option:

- Extract a generic CRUD endpoint builder now. This is premature and would make future plugin differences harder to see.

### 5.5 Move Test-Only Route Contracts Out Of Production Source

Decision:

- Move `authRouteMap` out of `workers/core/src/auth/contracts.ts` unless a runtime caller appears.

Reasoning:

- The file is currently used by tests only.
- Production `src` should not expose manually maintained test fixtures as runtime API.
- Route-map tests can import from `workers/core/tests/auth/fixtures/route-contracts.ts` or assert against generated OpenAPI output.

### 5.6 Enforce After The Refactor Shape Exists

Decision:

- Update oxlint after the file ownership is corrected.

Reasoning:

- Lint should encode desired architecture, not block the intermediate cleanup in confusing ways.
- The first rules should protect high-risk regressions: new Hono auth-domain routes, plugin table persistence outside auth plugins, and test-only contracts in production source.

## 6. Implementation Strategy

Implement this in small phases so each phase can pass `pnpm check`.

Phase 1: Move resource-server audience runtime ownership.

- Add `workers/core/src/auth/plugins/resource-server/audiences.ts`.
- Move KV cache parse/load/invalidate behavior into it.
- Move the raw D1 enabled-audience query into it.
- Update `idResourceServer` invalidation option to call the new helper.
- Update tests currently covering `auth/adapters/audiences.ts`.

Phase 2: Simplify auth mounting.

- Add an auth composition helper if useful, such as `createAuthForRequest(...)`.
- Remove direct imports of audience adapters and resource-server store from `auth-mount.ts`.
- Deduplicate repeated well-known route setup if it remains clear.

Phase 3: Clean admin policy naming.

- Remove unused `auth/admin/actor.ts`.
- Move active policy helpers from `auth/admin/access.ts` to `auth/policies/access.ts` or plugin-local access helpers.
- Update imports in `get-auth.ts`.

Phase 4: Move test-only route contracts.

- Move `authRouteMap` to a test fixture or docs contract file.
- Update `contracts.test.ts`.
- Delete production `auth/contracts.ts` if no source imports remain.

Phase 5: Enforce.

- Add oxlint architecture rules for the new boundaries.
- Update `workers/core/src/auth/plugins/README.md`.
- Update `docs/000_repo-architecture.md` or implementation-sequence notes only where they still describe the old Hono admin actor model as current behavior.

## 7. Detailed Implementation Plan

### 7.1 Resource-Server Audience Companion

Current problem:

- KV cache loading lives in `workers/core/src/auth/adapters/audiences.ts`.
- Raw D1 loading lives in `workers/core/src/infrastructure/persistence/resource-server-store.ts`.
- Hono mount wires the resource-server implementation details directly.

Target behavior:

- `workers/core/src/auth/plugins/resource-server/audiences.ts` owns the full pre-auth audience read path.
- It preserves cache hit, cache miss, invalid cache, D1 fallback, normalization, TTL write, and invalidation behavior.
- It documents that this is the single approved pre-Better-Auth raw D1 read for the plugin-owned table.

Implementation tasks:

- [ ] Add `workers/core/src/auth/plugins/resource-server/audiences.ts`.
- [ ] Move `ResourceAudienceRow`, `AudienceLoadResult`, cache parsing, normalization, `loadResourceAudiences`, and `invalidateResourceAudiences` into the new module under resource-server naming.
- [ ] Move the SQL query from `resource-server-store.ts` into the new module.
- [ ] Delete `workers/core/src/auth/adapters/audiences.ts` if no callers remain.
- [ ] Delete `workers/core/src/infrastructure/persistence/resource-server-store.ts` if no callers remain.
- [ ] Update `workers/core/src/auth/plugins/resource-server/index.ts` or `get-auth.ts` to call `invalidateResourceServerAudiences(...)`.
- [ ] Update tests to import from the new module.

Tests:

- `workers/core/tests/auth/audiences.test.ts`
- `pnpm test -- workers/core/tests/auth/audiences.test.ts`
- `pnpm check`

### 7.2 Auth Mount Simplification

Current problem:

- `auth-mount.ts` imports resource-server audience loading and raw persistence.
- Well-known alias handlers repeat the same load and `getAuth(...)` logic four times.

Target behavior:

- `auth-mount.ts` is a thin mount shell.
- It calls one auth composition function that hides audience loading.
- It still passes `waitUntil` for background email tasks where applicable.

Implementation tasks:

- [ ] Add a helper such as `createAuthForRequest(env, runtime)` in `workers/core/src/auth/get-auth.ts` or `workers/core/src/auth/create-auth-for-request.ts`.
- [ ] Inside the helper, call `loadResourceServerAudiences(env)` before `getAuth(...)`.
- [ ] Keep `getAuthOptions(...)` testable for static option assertions.
- [ ] Update `registerAuthRoutes(...)` to call the helper.
- [ ] Update `registerWellKnownRoutes(...)` to call the helper and rewrite request paths.
- [ ] Consider a local helper for well-known aliases to reduce repeated path rewrite code without hiding route ownership.

Tests:

- Existing auth mount tests if present.
- Add or update tests that prove audience loading is called before `getAuth(...)` for `/api/auth/*` and well-known aliases.
- `pnpm check`

### 7.3 Access Policy Cleanup

Current problem:

- `auth/admin/access.ts` contains active helpers, but the `admin` directory name suggests the old Hono actor model.
- `auth/admin/actor.ts` appears unused.

Target behavior:

- Generic policy helpers live under `workers/core/src/auth/policies/access.ts`, or resource-server-specific policy wrappers live under the plugin.
- Dead actor-loading code is removed.
- `get-auth.ts` keeps composing plugin callbacks, but does not import old actor code.

Implementation tasks:

- [ ] Confirm `auth/admin/actor.ts` has no production or test callers.
- [ ] Delete `auth/admin/actor.ts` if unused.
- [ ] Move `isPlatformAdmin`, `hasOrganizationAccess`, and `AdminDbAdapter` to `auth/policies/access.ts`.
- [ ] Update imports in `get-auth.ts`.
- [ ] Update docs that describe `requireActor(c)` as current behavior for Hono admin routes.

Tests:

- `pnpm typecheck`
- `pnpm test`
- `pnpm check`

### 7.4 Route Contract Relocation

Current problem:

- `workers/core/src/auth/contracts.ts` is used by tests only.

Target behavior:

- Route contract data lives in tests or docs, not production `src`.
- Production auth code has no manual route registry unless runtime code needs it.

Implementation tasks:

- [ ] Move `authRouteMap` to `workers/core/tests/auth/fixtures/route-contracts.ts` or equivalent.
- [ ] Update `workers/core/tests/auth/contracts.test.ts`.
- [ ] Delete `workers/core/src/auth/contracts.ts` when no source imports remain.
- [ ] Consider a future generated route/openapi assertion to replace manual entries.

Tests:

- `workers/core/tests/auth/contracts.test.ts`
- `pnpm test -- workers/core/tests/auth/contracts.test.ts`
- `pnpm check`

### 7.5 Zod-First Boundary Rules

Current problem:

- Resource-server schemas are Zod-first, but the rule is not broadly documented as a repo direction.

Target behavior:

- Runtime input/output/data boundaries use central Zod schemas.
- Internal callback and composition surfaces remain TypeScript-only when they are not runtime data.

Implementation tasks:

- [ ] Update `workers/core/src/auth/plugins/README.md` with a "Zod boundary rule" section.
- [ ] Keep `types.ts` TS-only for plugin options and callback types.
- [ ] For future plugin rows, require a canonical `<plugin>Schema` in `schema.ts`.
- [ ] Add tests for derived Better Auth fields and OpenAPI metadata where a plugin owns a schema.

Tests:

- Existing resource-server validation tests.
- Future plugin schema tests under `workers/core/tests/auth/<plugin>-validation.test.ts`.

### 7.6 Oxlint Enforcement

Current problem:

- The architecture plugin does not yet encode the plugin-first auth boundary strongly enough.

Target behavior:

- Mechanical lint prevents new code from drifting back toward Hono-first or infrastructure-first auth ownership.

Implementation tasks:

- [ ] Add a rule that forbids new Hono `/api/admin/*` auth-domain CRUD routes unless the file is explicitly allowlisted.
- [ ] Add a rule that forbids importing plugin-owned model constants into `workers/core/src/infrastructure/persistence/**`, except approved migration/bootstrap cases.
- [ ] Add a rule that forbids `workers/core/src/auth/contracts.ts` or flags production test fixtures under `src`.
- [ ] Add a rule or advisory check that custom auth plugin folders contain `index.ts`, `schema.ts`, `operations.ts`, `types.ts`, and `README.md`.
- [ ] Keep Better Auth import restrictions intact.
- [ ] Add architecture lint fixture tests if the local lint plugin supports them.

Tests:

- `pnpm lint`
- `pnpm check`
- `pnpm advise`

### 7.7 Documentation Updates

Current problem:

- The docs still include older clean-architecture Hono admin route language that is correct for non-BA workflows but not the desired default for auth-owned plugin tables.

Target behavior:

- Docs distinguish plugin-owned auth behavior from exceptional Hono admin aggregate behavior.
- Resource-server docs explain the pre-auth audience companion and KV cache.

Implementation tasks:

- [ ] Update `workers/core/src/auth/plugins/README.md`.
- [ ] Update `workers/core/src/auth/plugins/resource-server/README.md`.
- [ ] Update `docs/000_repo-architecture.md` sections that imply resource-server CRUD should be Hono/domain/application based.
- [ ] Update `docs/001_first-batch-plan.md` only where current implementation notes conflict with plugin-first ownership.
- [ ] Keep this `009_...` document as the implementation plan until completed.

Tests:

- Documentation review.
- `pnpm advise` after substantial doc/comment changes.

## 8. Migration And Rollout

This is a code ownership migration, not a data migration.

Data:

- No D1 schema change is required.
- No KV key change is required unless the implementation intentionally renames the cache key.
- Existing resource-server rows remain valid.

Runtime rollout:

1. Move audience loading under the plugin while keeping the same cache key and TTL.
2. Keep invalidation after create, update, delete, and disable.
3. Deploy with current cache entries still valid.
4. Confirm OAuth token requests still accept enabled audiences and reject disabled/missing audiences after cache invalidation or TTL expiry.

Rollback:

- If the new companion fails, revert the code movement while keeping the same DB table and KV key.
- Since no data format changes are required, rollback is code-only.

Cleanup:

- Delete obsolete audience adapter and resource-server store files only after all imports are moved.
- Delete old admin actor files only after `rg` confirms no callers.
- Move route contracts only after tests are updated.

## 9. Edge Cases And Failure Modes

- KV contains invalid JSON: ignore it, query D1, rewrite KV with a valid JSON array.
- KV contains a valid JSON value that is not `string[]`: ignore it, query D1, rewrite KV.
- KV read fails: the loader should fail closed or fallback based on Cloudflare KV error behavior chosen during implementation. Recommended first behavior is fail the auth request rather than silently accepting no audiences.
- KV write fails after D1 read: return D1 result for the current request and surface/log the cache write failure if existing logging conventions support it.
- D1 read fails on cache miss: fail the auth request because the valid audience set cannot be proven.
- Cache invalidation fails after mutation: mutation success with failed invalidation can create stale audience behavior until TTL expiry. Recommended first behavior is to await invalidation and fail the mutation if invalidation fails, preserving the current strong coupling.
- Concurrent mutations: each mutation invalidates the same KV key. The next auth request rebuilds from D1.
- Audience disabled while old cache exists: the mutation endpoint must invalidate KV before the disabled state can reliably affect token issuance.
- Audience created while old cache exists: the mutation endpoint must invalidate KV before the new audience can be used.
- Better Auth package upgrades: recheck `validAudiences` type. If it becomes a function or async provider in a future release, this plan can be simplified, but the plugin-owned cache module should still own the behavior.
- Well-known discovery routes: they must use the same audience load path as `/api/auth/*` so OAuth metadata remains generated from the same auth configuration.

## 10. Implementation Backlog

### R1-A. Move Resource-Server Audience Runtime Under Plugin

Scope:

- `workers/core/src/auth/plugins/resource-server/audiences.ts`
- `workers/core/src/auth/adapters/audiences.ts`
- `workers/core/src/infrastructure/persistence/resource-server-store.ts`
- `workers/core/tests/auth/audiences.test.ts`

Tasks:

- [ ] Create the plugin-owned audience module.
- [ ] Move KV cache read/write/invalidation into the module.
- [ ] Move the pre-auth D1 enabled-audience query into the module.
- [ ] Preserve cache key, TTL, dedupe, filtering, sorting, and result source behavior.
- [ ] Remove obsolete files after imports are moved.

Acceptance criteria:

- Resource-server audience loading is owned under `auth/plugins/resource-server`.
- KV cache behavior remains unchanged.
- No generic infrastructure persistence module owns the `resourceServer` pre-auth query.

Tests:

- `pnpm test -- workers/core/tests/auth/audiences.test.ts`
- `pnpm check`

### R1-B. Simplify Auth Mounting

Scope:

- `workers/core/src/http/routes/auth-mount.ts`
- `workers/core/src/auth/get-auth.ts`
- optional `workers/core/src/auth/create-auth-for-request.ts`

Tasks:

- [ ] Add an auth composition helper that loads resource audiences and constructs Better Auth.
- [ ] Replace direct audience/store imports in `auth-mount.ts`.
- [ ] Keep `waitUntil` support for background tasks.
- [ ] Keep well-known alias behavior.

Acceptance criteria:

- `auth-mount.ts` no longer imports resource-server persistence or cache internals.
- All auth route construction uses the same pre-auth audience load path.

Tests:

- `pnpm typecheck`
- `pnpm test`
- `pnpm check`

### R1-C. Clean Admin Policy Boundary

Scope:

- `workers/core/src/auth/admin/access.ts`
- `workers/core/src/auth/admin/actor.ts`
- `workers/core/src/auth/policies/access.ts`
- `workers/core/src/auth/get-auth.ts`

Tasks:

- [ ] Confirm `auth/admin/actor.ts` is unused.
- [ ] Delete unused actor code.
- [ ] Move active policy helpers to `auth/policies/access.ts` or plugin-local policy module.
- [ ] Update `get-auth.ts` imports.

Acceptance criteria:

- No unused Hono admin actor model remains.
- Active policy helpers have names that match the plugin-first Better Auth model.

Tests:

- `pnpm typecheck`
- `pnpm check`

### R1-D. Move Route Contracts Out Of Production Source

Scope:

- `workers/core/src/auth/contracts.ts`
- `workers/core/tests/auth/contracts.test.ts`
- optional `workers/core/tests/auth/fixtures/route-contracts.ts`

Tasks:

- [ ] Move `authRouteMap` to a test fixture.
- [ ] Update tests.
- [ ] Delete production `contracts.ts` if no runtime imports remain.

Acceptance criteria:

- Test-only route contract data is not in production `src`.
- Contract tests still prove Better Auth, OAuth Provider, JWT, OpenAPI, and resource-server public paths.

Tests:

- `pnpm test -- workers/core/tests/auth/contracts.test.ts`
- `pnpm check`

### R1-E. Update Plugin Guidelines

Scope:

- `workers/core/src/auth/plugins/README.md`
- `workers/core/src/auth/plugins/resource-server/README.md`
- `.agents/skills/id-auth-plugin/SKILL.md`
- `docs/000_repo-architecture.md`
- `docs/001_first-batch-plan.md`

Tasks:

- [ ] Document plugin-owned pre-auth runtime companions.
- [ ] Document the resource-server audience KV cache.
- [ ] Document when raw pre-auth D1 reads are allowed.
- [ ] Document Zod runtime boundary rules.
- [ ] Remove or qualify stale Hono admin actor language where it conflicts with plugin-owned auth behavior.

Acceptance criteria:

- A future custom plugin author can tell when to use Better Auth plugin endpoints, plugin runtime companions, Hono routes, Zod schemas, and TS-only types.

Tests:

- Documentation review.
- `pnpm advise`

### R1-F. Add Architecture Lint Rules

Scope:

- `scripts/oxlint-js-plugins/architecture.js`
- `.oxlintrc.json`
- lint tests or fixtures if present

Tasks:

- [ ] Add rule coverage for plugin-owned table persistence outside auth plugins.
- [ ] Add rule coverage for new Hono auth-domain CRUD routes.
- [ ] Add rule coverage for test fixtures under production `src`.
- [ ] Add rule coverage for custom plugin folder shape where practical.
- [ ] Keep suppressions focused and documented.

Acceptance criteria:

- New code cannot casually reintroduce Hono-first auth-domain CRUD or infrastructure-owned plugin table access.

Tests:

- `pnpm lint`
- `pnpm check`
- `pnpm advise`

## 11. Future Backlog

- Investigate whether future Better Auth versions support async `validAudiences` providers. If they do, reassess the pre-auth composition requirement while preserving plugin ownership and KV caching.
- Generate route contract assertions from Better Auth OpenAPI output instead of maintaining a manual test fixture.
- Promote stable schema utilities, such as Zod-to-Better-Auth field mapping and OpenAPI cleanup, after a second custom plugin proves shared needs.
- Add a plugin scaffold generator only after the resource-server pattern has survived at least one additional plugin.
- Add observability counters for audience cache source, invalidation failures, and D1 fallback frequency if production debugging needs it.

## 12. Test And Verification Plan

Required automated checks:

- `pnpm test -- workers/core/tests/auth/audiences.test.ts`
- `pnpm test -- workers/core/tests/auth/contracts.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check`
- `pnpm advise` after substantial refactor or documentation changes

Required behavior tests:

- Cache hit returns audiences without calling D1 loader.
- Cache miss calls D1 loader, dedupes/sorts enabled audiences, writes KV with TTL, and returns `"store"`.
- Invalid cache shape falls back to D1 and rewrites KV.
- Invalidation deletes the same KV key used by loading.
- Resource-server create/update/delete/disable invalidates audience cache.
- `/api/auth/*` uses the same pre-auth audience load as well-known aliases.
- OAuth Provider receives enabled audiences before `betterAuth(...)` construction.
- Disabled or missing audience is rejected by OAuth token flow after cache invalidation or TTL recovery.

Required static checks:

- No production imports from deleted `auth/adapters/audiences.ts`.
- No production imports from deleted `infrastructure/persistence/resource-server-store.ts`.
- No production imports from deleted `auth/admin/actor.ts`.
- No production import of test-only route contracts.

## 13. Definition Of Done

- Resource-server audience cache loading, D1 fallback, normalization, and invalidation live under `workers/core/src/auth/plugins/resource-server/**`.
- The KV audience cache remains enabled with the existing key and TTL semantics.
- Hono auth mount code no longer owns resource-server audience implementation details.
- Better Auth OAuth Provider still receives `validAudiences` before auth initialization.
- Active authorization helpers are named and placed according to the Better Auth plugin model, not the removed Hono admin actor model.
- Test-only route contracts no longer live in production `workers/core/src/auth/**`.
- Plugin docs explain pre-auth runtime companions and the KV audience cache.
- Oxlint prevents the main regressions once the new shape lands.
- `pnpm check` passes.
- `pnpm advise` has no new unsuppressed findings or has documented architecture-mandated suppressions.

## 14. Final Model

The final architecture keeps Better Auth as the auth framework and Hono as the Worker mount shell.

`id-resource-server` owns the `resourceServer` table, its Better Auth endpoints, its Zod contracts, and its OAuth audience lifecycle. Because OAuth Provider requires `validAudiences` before Better Auth exists, the resource-server plugin area also owns a small pre-auth runtime companion. That companion keeps the KV cache, performs the approved raw D1 fallback read only on cache miss, and exposes invalidation for plugin mutations.

This preserves Better Auth's model instead of rebuilding auth around Hono routes, while still handling the real initialization constraint imposed by OAuth Provider's current `validAudiences?: string[]` API.
