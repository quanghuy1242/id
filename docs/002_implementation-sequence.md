# Merged Implementation Sequence

> Merged from `000_repo-architecture.md` Sections 11+13 and `001_first-batch-plan.md` Sections 11+12.
> This does not replace either document. It is a workable execution order.

## Phase 0 — Scaffold

Before enforcement, before Better Auth, just structure.

- [ ] Create root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`
- [ ] Create `.oxlintrc.json` stub (placeholder, rules arrive in Phase 1)
- [ ] Create `.dev.vars.example` listing required secret names only
- [ ] Create `vitest.workspace.ts` referencing `workers/core/vitest.config.ts` and `workers/ui/vitest.config.ts`
- [ ] Create `scripts/` directory with placeholder scripts
- [ ] Create `packages/ui/package.json`, `packages/ui/tsconfig.json`
- [ ] Create `packages/lib/package.json`, `packages/lib/tsconfig.json`
- [ ] Create `workers/core/package.json`, `workers/core/wrangler.jsonc`, `workers/core/tsconfig.json`, `workers/core/vitest.config.ts`
- [ ] Create `workers/ui/package.json`, `workers/ui/wrangler.jsonc`, `workers/ui/tsconfig.json`, `workers/ui/vitest.config.ts`, `workers/ui/vinext.config.ts`
- [ ] `pnpm install` — verify clean install
- [ ] Verify `pnpm typecheck` passes on scaffold (configs extend root, paths correct)
- [ ] Verify `pnpm test` passes (no tests yet, but vitest resolves worker configs)

**Gate:** directory tree matches `000_repo-architecture.md` Section 3.

---

## Phase 1 — Enforcement Bootstrapped

**This phase is non-negotiable.** Every gate marked below is a hard stop. If any oxlint rule cannot be ported, or any fixture cannot pass, or the duplicate gate cannot be written — stop and ask. Do not proceed to Phase 2 with partial enforcement. The purpose is to build the cage before any feature code enters it.

### 1.1 Port Oxlint Architecture Rules (000 Spike A)

- [ ] Copy `content-api/scripts/oxlint-js-plugins/architecture.js` into `scripts/oxlint-js-plugins/architecture.js`
- [ ] Adapt layer-import rules for `id`'s layer names (domain, application, http, infrastructure, composition, shared, auth, config)
- [ ] Write a valid fixture: one entity + mapper + repository + use case + route handler in `workers/core/src/`
- [ ] Write deliberately broken fixtures — each must trigger exactly one error:
  - drizzle in domain
  - raw `c.req.json()` in handler
  - plain type entity (no private constructor)
  - entity spread without `.toSnapshot()`
  - mapper without `.reconstitute()`
  - repository importing a policy
  - custom error outside `shared/`
  - magic number in application
  - constant outside allowed locations
- [ ] Confirm all fixtures fail/pass correctly
- [ ] Configure `.oxlintrc.json` with all 16 rules as `"error"`, disabled for `tests/**` and `**/*.d.ts`

**Gate:** `pnpm lint` passes on valid fixture, fails appropriately on each broken fixture.

### 1.2 Duplicate Code Gate (000 §10.2)

- [ ] Write `scripts/check-duplication-threshold.mjs` (Fallow `<3%` threshold, `--mode mild --min-tokens 50 --min-lines 5`)
- [ ] Prove it passes on fixture code (small, non-duplicated codebase)
- [ ] Prove it fails on deliberately duplicated fixture files (two nearly identical use cases)
- [ ] Add to `pnpm check:dup`

**Gate:** `pnpm check:dup` passes on fixtures, fails on duplicated code.

### 1.3 Add ID-Specific Oxlint Rules (000 Spike A continued)

- [ ] Implement `worker-isolation` — core and UI never cross-import
- [ ] Implement `core-no-ui-deps` — core never imports react, react-dom, vinext, @vitejs/*
- [ ] Implement `ui-no-auth-deps` — UI never imports better-auth, drizzle-orm, jose, D1/KV bindings
- [ ] Implement `packages-lib-isolation` — packages/lib imports nothing but itself
- [ ] Implement `auth-boundary` — Better Auth imports only from approved core files
- [ ] Implement `admin-auth-required` — admin route handlers always call requireActor
- [ ] Prove each rule with passing and failing fixture files
- [ ] Add built-in rules: `no-console`, `eqeqeq`, `import/no-cycle`, `typescript/no-explicit-any`

**Gate:** rules 17–22 are hard errors in `pnpm lint`, proven by fixtures.

### 1.4 Port AGENTS.md And Architecture Skills

- [ ] Write `AGENTS.md` — adapted from content-api: commands (`pnpm check`, `pnpm lint`, `pnpm check:dup`, `pnpm check:ui`, `pnpm advise`), advisory suppression rules for id-specific architecture patterns (entity getter symmetry, mapper field mapping, create use case pattern, route handler pattern), test conventions, alias rules
- [ ] Write `.agents/skills/id-architecture/SKILL.md` — references `docs/000_repo-architecture.md`, teaches layer rules, entity class contract, mapper contract, route handler contract, CrudAdapter rules, Better Auth boundary, worker isolation rules
- [ ] Write `.agents/skills/id-architecture-lint/SKILL.md` — gates oxlint rule maintenance behind explicit intent; teaches rule addition checklist, strictness requirements, negative fixture pattern
- [ ] If the architecture skill references detailed per-rule documentation, add `references/architecture-rules.md` and `references/rule-contract.md` under the skill directory

**Gate:** agents can read `.agents/skills/id-architecture/SKILL.md` and understand the invariant before writing Phase 2 code.

---

## Phase 2 — Better Auth Contract Proved

**This phase is non-negotiable.** The Better Auth 1.6.11 contract must be proven from installed packages, not from docs or memory. If a route does not exist at the expected path, or an option name differs from what the docs suggest, or `validAudiences` cannot accept async values — stop and ask. Do not code around an unverified assumption. Feature implementation (Phase 5) must never depend on a guess.

**Phase 1 enforcement is active.** Every file written in this phase runs under `pnpm lint`, `pnpm check:dup`, and all 22 oxlint rules. Phase 2 does not remove any gates — it only adds acceptance criteria for BA contract discovery.

### 2.0 D1 Schema Bootstrap (Prerequisite)

Before Better Auth can be tested, D1 needs tables. Define the `idResourceServer` plugin and generate migrations.

- [ ] Write `workers/core/src/auth/config.ts` — pure shared Better Auth plugin config (scopes, pages, plugin options). No runtime bindings. Factored so both `cli-auth.ts` and `get-auth.ts` consume it.
- [ ] Write `workers/core/src/auth/plugins/resource-server/index.ts` — `idResourceServer` plugin with `schema` (resourceServer table definition) and `endpoints` (CRUD via `createAuthEndpoint`).
- [ ] Register plugin in `getAuth.ts` factory alongside built-in plugins.
- [ ] Write `workers/core/src/auth/cli-auth.ts` — static export for CLI/schema generation using `getPlatformProxy()`.
- [ ] Run `npx @better-auth/cli generate` — generates migrations for both BA built-in tables and `idResourceServer` plugin table.
- [ ] `wrangler d1 migrations apply id --local` succeeds from clean database.
- [ ] Running migrations twice does not fail.
- [ ] Smoke: create a `resource_servers` row via the plugin endpoint for later audience tests.

**Gate:** D1 is bootstrapped locally with BA tables and the plugin-owned `resourceServer` table.

### 2.1 Route Map And API Shape (000 Spike C + 001 Spike 1)

- [ ] Scaffold a minimal Better Auth instance using `getAuth(env, request)` factory against the bootstrapped local D1
- [ ] Generate a route map — document every path under what basePath
- [ ] Prove `/oauth2/userinfo` path (not `/userinfo`)
- [ ] Prove OAuth Provider client CRUD server API names (`createOAuthClient`, `updateOAuthClient`, etc.)
- [ ] Prove `signUp` option name (not `signup`)
- [ ] Prove `jwksPath` option and default `/api/auth/jwks` behavior
- [ ] Record the exact TypeScript types for `validAudiences`, `customAccessTokenClaims`, `customTokenResponseFields`

**Gate:** a generated route map or type-level proof committed as reference.

### 2.2 JWKS Signing And Rotation (001 Spike 4)

- [ ] Sign a token, publish JWKS, verify with `jose` using advertised JWKS URI
- [ ] Verify `kid` in JWT header matches a key in JWKS response
- [ ] Configure rotation interval, trigger rotation, verify new `kid`
- [ ] Verify old key remains valid during grace period
- [ ] Decide: default `/api/auth/jwks` or custom `/.well-known/jwks.json`
- [ ] Document the JWKS URI in metadata routes

**Gate:** automated test proves sign → verify → rotate → verify old + new.

### 2.3 Resource Audience Validation (001 Spike 2)

- [ ] Prove `getAuth(env, request)` can load `validAudiences` from the `idResourceServer` plugin's data
- [ ] Implement KV cache: audience list stored at `id-resource-servers:audiences` key, loaded on cold start
- [ ] Prove KV hit: audiences served from cache (<1ms), no D1 query
- [ ] Prove KV miss: audiences loaded from D1 (50-500ms), then populated into KV
- [ ] Prove KV invalidation: creating/updating/disabling a resource server deletes the KV key; next token issuance repopulates
- [ ] If `validAudiences` must be synchronous (not async) in the installed BA version:
  - [ ] Option A: static bootstrap config (defeats UI-first goal)
  - [ ] Option B: request-local audience cache with tiny TTL
  - [ ] Choose and document the path
- [ ] Prove token request with a valid `resource` returns JWT with correct `aud`
- [ ] Prove token request with invalid `resource` is rejected
- [ ] Prove resource widening at token exchange is rejected
- [ ] Prove disabling a resource server blocks new token issuance (within KV cacheTtl window of ≤60s)

**Gate:** integration test from plugin endpoint (create) through KV cache to JWT issuance and audience validation.

---

## Phase 3 — Two Workers Proved

**This phase is non-negotiable.** The two-worker topology with service binding must be proven locally. If `dev:stack:ui` cannot route `/admin` traffic through `CORE_ID`, or React leaks into the core bundle — stop and ask. Do not proceed with a single-worker fallback or ignore bundle contamination.

**Phase 1 enforcement is active.** `pnpm check:ui` is added to the gate in this phase.

### 3.1 Multi-Worker Topology (000 Spike D)

- [ ] Start `core-id` with `wrangler dev --config workers/core/wrangler.jsonc`
- [ ] Verify core routes respond: `/api/auth/*`, `/oauth2/*`, `/.well-known/*`
- [ ] Start `ui-id` with `vinext dev --cwd workers/ui`
- [ ] Run `dev:stack:ui` (UI primary, core secondary via service binding)
- [ ] Prove `/admin` renders and calls `core-id` through `CORE_ID` service binding
- [ ] Verify React does NOT appear in core-id's esbuild bundle: check `wrangler deploy --dry-run --outdir dist/core` output — no `react` or `react-dom` chunks in the bundle directory
- [ ] Run `dev:stack:core` (core primary, UI secondary)
- [ ] Document deployment order: `id-core` before `id-ui`

**Gate:** service binding call succeeds in local dev.

### 3.2 UI Composition Gate (000 Spike E)

- [ ] Write `scripts/check-ui-route-composition.mjs` (AST-based) or `architecture/ui-route-composition` oxlint rule
- [ ] Prove it fails on: raw `<div>`/`<h1>`/`<p>` in `workers/ui/src/app/admin/**/page.tsx`
- [ ] Prove it fails on: raw Tailwind/DaisyUI `className`
- [ ] Prove it fails on: `fetch()` in route file
- [ ] Prove it fails on: import from `workers/core/**`
- [ ] Prove it fails on: import of `better-auth`, `drizzle-orm`
- [ ] Prove a valid composition page passes (only `packages/ui` components, no raw HTML)

**Gate:** `pnpm check:ui` passes on valid page, fails on each violation.

---

## Phase 4 — Admin Authorization

**This phase is non-negotiable.** The admin authorization model must be proven with tests for every actor/action combination.

**Phase 1+3 enforcement is active.**

### 4.1 Admin Authorization (001 Spike 5)

- [ ] Implement platform `superadmin`/`admin` role in `user.additionalFields`
- [ ] Implement organization owner/admin/member role checks
- [ ] Prove: `superadmin` accesses cross-org lists and mutates any org
- [ ] Prove: org `owner` manages only own org's resources
- [ ] Prove: org `admin` performs only delegated non-owner actions
- [ ] Prove: org `member` and unauthenticated users get `403`/`401`
- [ ] Prove: every admin mutation has server-side authorization, not just UI gating

**Gate:** automated tests for each actor/action combination.

---

## Phase 5 — Feature Implementation

**All prior gates are active.** From this point, every line of code enters under `pnpm check` (lint + dup + UI composition + typecheck + tests). No feature file is exempt.

Implementation follows `001_first-batch-plan.md` Section 12. The acceptance bar is the full Definition of Done in both documents:

- `001_first-batch-plan.md` Section 18 — feature DoD: admin UI capabilities, OAuth flows, token verification, consent, JWKS, deployment, runbooks.
- `000_repo-architecture.md` Section 16 — repo DoD: layer structure, enforcement gates, pattern compliance, two-worker topology, VI composition enforcement.

All must be satisfied before Phase 5 is complete.

### 5.1 Core Auth

- [ ] Better Auth core with D1 binding (factory from Phase 2.1)
- [ ] Email/password sign-up, email verification, sign-in, sign-out, session
- [ ] Password reset flow
- [ ] Admin plugin for user management
- [ ] Organization plugin with owner/admin/member roles
- [ ] Platform role on `user.additionalFields`

### 5.2 OAuth Provider

- [ ] `oauthProvider` plugin with config from Phase 2
- [ ] Authorization code + PKCE S256
- [ ] Consent page
- [ ] OAuth client CRUD through server APIs (UI-first, not config)
- [ ] `client_credentials` grant for M2M
- [ ] Refresh token support
- [ ] Introspection and revocation
- [ ] `prompt=create` and `prompt=select_account`
- [ ] Post-login organization selection
- [ ] Custom claims enrichment (`org_id`, etc.)
- [ ] Custom token response fields

### 5.3 Custom Admin API (Plugin Endpoints)

- [ ] `idResourceServer` plugin endpoints: create, read, update, delete, list resource servers
- [ ] Plugin endpoints use `createAuthEndpoint` — registered on BA handler automatically
- [ ] Dashboard aggregate endpoint (may be custom Hono route or plugin endpoint)
- [ ] All endpoints behind `requireActor(c)` with role checks from Phase 4

### 5.4 Admin UI (Scaffold Only)

Full admin pages are deferred per `001_first-batch-plan.md` Section 10. First batch delivers:

- [ ] Vinext App Router scaffold in `workers/ui/` with `packages/ui` component stubs
- [ ] Health-check page at `/admin` that confirms the worker runs and can reach `core-id` via `CORE_ID` service binding
- [ ] Service binding proxy for admin API calls
- [ ] All admin pages pass `pnpm check:ui` (composition rules active even on scaffold)

Admin CRUD operations on `core-id` are tested via integration tests and documented for API-level operation until the full UI is built.

### 5.5 Resource Server Integration

- [ ] JWT verification helper for downstream APIs
- [ ] At least one test resource server fixture
- [ ] Integration guide document

### 5.6 Deployment Hardening

- [ ] CI pipeline: `pnpm check` → migrations → deploy core → deploy UI
- [ ] Health endpoint
- [ ] Structured logging
- [ ] Log redaction (no tokens, secrets, auth codes in logs)
- [ ] Runbooks: deploy, rotate secret, disable client, JWKS incident, D1 migration failure
- [ ] Remote smoke tests after deploy

---

## Quality Gate Per Phase

| Phase | Gate | At end of phase |
|---|---|---|
| 0 | Directory tree matches 000 Section 3 | — |
| 1 | `pnpm lint` catches violations; `pnpm check:dup` catches copy-paste | Enforcement bootstrapped. All subsequent phases inherit these gates. |
| 2 | BA route map + JWKS + audience + KV cache tests pass (under Phase 1 enforcement); D1 bootstrapped locally | BA contract known, D1 ready, KV cache proven |
| 3 | Two workers run locally; UI composition gate works (under Phase 1 enforcement) | Build system proven; `pnpm check:ui` added to gate |
| 4 | Admin auth tests pass (under Phase 1+3 enforcement) | Authorization model proven |
| 5 | All 001 DoD items met | Ship |
