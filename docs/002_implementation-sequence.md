# Merged Implementation Sequence

> Merged from `000_repo-architecture.md` Sections 11+13 and `001_first-batch-plan.md` Sections 11+12.
> This does not replace either document. It is a workable execution order.

## Phase 0 — Scaffold

Status on 2026-05-19: implemented and verified by `pnpm check`.

- [x] Create root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`
- [x] Create `.oxlintrc.json`
- [x] Create `.dev.vars.example` listing required secret names only
- [x] Create `vitest.workspace.ts` referencing `workers/core/vitest.config.ts` and `workers/ui/vitest.config.ts`
- [x] Create `scripts/` directory with enforcement/filter scripts
- [x] Create `packages/ui/package.json`, `packages/ui/tsconfig.json`
- [x] Create `packages/lib/package.json`, `packages/lib/tsconfig.json`
- [x] Create `workers/core/package.json`, `workers/core/wrangler.jsonc`, `workers/core/tsconfig.json`, `workers/core/vitest.config.ts`
- [x] Create `workers/ui/package.json`, `workers/ui/wrangler.jsonc`, `workers/ui/tsconfig.json`, `workers/ui/vitest.config.ts`, `workers/ui/vinext.config.ts`
- [x] `pnpm install` — dependencies are installed locally
- [x] Verify `pnpm typecheck` passes on scaffold (passed on 2026-05-19)
- [x] Verify `pnpm test` passes. Oxlint-rule tests now use `.oxlintrc.json`; oxlint 1.66 loads JS plugins from config.

**Gate:** minimum scaffold exists in the locations required by `000_repo-architecture.md` Section 3; feature-specific folders may be added later as implementation reaches them.

---

## Phase 1 — Enforcement Bootstrapped

**This phase is non-negotiable.** Every gate marked below is a hard stop. If any oxlint rule cannot be ported, or any fixture cannot pass, or the duplicate gate cannot be written — stop and ask. Do not proceed to Phase 2 with partial enforcement. The purpose is to build the cage before any feature code enters it.

Status on 2026-05-19: implemented and clean. `scripts/oxlint-js-plugins/architecture.js` exports the 16 ported rules plus 7 id-specific rules, including `ui-route-composition`, and `.oxlintrc.json` wires them as errors. `pnpm lint`, `pnpm check:dup`, `pnpm typecheck`, `pnpm test`, and `pnpm check` pass without adding a separate `check:ui` script.

### 1.1 Port Oxlint Architecture Rules (000 Spike A)

- [x] Copy `content-api/scripts/oxlint-js-plugins/architecture.js` into `scripts/oxlint-js-plugins/architecture.js`
- [x] Adapt layer-import rules for `id`'s layer names (domain, application, http, infrastructure, composition, shared, auth, config)
- [x] Add broad permanent fixture coverage for layer import, worker isolation, UI composition, UI fetch, UI cross-worker import, and UI auth-dependency violations.
- [x] Confirm fixture tests fail/pass correctly under oxlint 1.66 through `.oxlintrc.json`.
- [x] Configure `.oxlintrc.json` with the architecture rules as `"error"`, disabled for `tests/**` and `**/*.d.ts`

**Gate:** `pnpm lint` passes on valid source, fails appropriately on broken fixtures.

### 1.2 Duplicate Code Gate (000 §10.2)

- [x] Write `scripts/check-duplication-threshold.mjs` (Fallow `<3%` threshold, `--mode mild --min-tokens 50 --min-lines 5`)
- [x] Prove it passes on current scaffold (`Fallow mild duplication: 0.0%` on 2026-05-19)
- [x] Keep deliberate duplicate failure proof as an enforcement-script responsibility; do not commit duplicate fixtures into the repo tree scanned by the hard gate.
- [x] Add to `pnpm check:dup`

**Gate:** `pnpm check:dup` passes on fixtures, fails on duplicated code.

### 1.3 Add ID-Specific Oxlint Rules (000 Spike A continued)

- [x] Implement `worker-isolation` — core and UI never cross-import
- [x] Implement `core-no-ui-deps` — core never imports react, react-dom, vinext, @vitejs/*
- [x] Implement `ui-no-auth-deps` — UI never imports better-auth, drizzle-orm, jose, D1/KV bindings
- [x] Implement `packages-lib-isolation` — packages/lib imports nothing but itself
- [x] Implement `auth-boundary` — Better Auth imports only from approved core files
- [x] Implement `admin-auth-required` — admin route handlers always call requireActor
- [x] Implement `ui-route-composition` — admin route files compose `@id/ui` primitives instead of raw markup/classes/fetch
- [x] Prove the id-specific boundary rules that affect this batch's current source: worker isolation, UI auth deps, and UI route composition. Remaining id-specific rules are active as hard errors and get fixture expansion when their owned source areas are introduced.
- [x] Add built-in rules: `no-console`, `eqeqeq`, `import/no-cycle`, `typescript/no-explicit-any`

**Gate:** rules 17–23 are hard errors in `pnpm lint`, proven by fixtures.

### 1.4 Port AGENTS.md And Architecture Skills

- [x] Write `AGENTS.md` — commands (`pnpm check`, `pnpm lint`, `pnpm check:dup`, `pnpm advise`), advisory suppression rules for id-specific architecture patterns, test conventions, alias rules
- [x] Write `.agents/skills/id-architecture/SKILL.md` — references `docs/000_repo-architecture.md`, teaches layer rules, entity class contract, mapper contract, route handler contract, CrudAdapter rules, Better Auth boundary, worker isolation rules
- [x] Write `.agents/skills/id-architecture-lint/SKILL.md` — gates oxlint rule maintenance behind explicit intent; teaches rule addition checklist, strictness requirements, negative fixture pattern
- [x] Skill references point to existing files, and the main architecture skill is concise enough for ordinary repo work.

**Gate:** agents can read `.agents/skills/id-architecture/SKILL.md` and understand the invariant before writing Phase 2 code.

---

## Phase 2 — Better Auth Contract Proved

**This phase is non-negotiable.** The Better Auth 1.6.11 contract must be proven from installed packages, not from docs or memory. If a route does not exist at the expected path, or an option name differs from what the docs suggest — stop and ask. Do not code around an unverified assumption. Feature implementation (Phase 5) must never depend on a guess.

**Phase 1 enforcement is active.** Every file written in this phase runs under `pnpm lint`, `pnpm check:dup`, and all 23 oxlint architecture rules. Phase 2 does not remove any gates — it only adds acceptance criteria for BA contract discovery.

### 2.0 D1 Schema Bootstrap (Prerequisite)

Before Better Auth can be tested, D1 needs tables. Define the `idResourceServer` plugin and generate migrations.

- [x] Write `workers/core/src/auth/config.ts` — issuer, cache, JWKS path, rotation, and grace-period constants.
- [x] Write `workers/core/src/auth/plugins/resource-server/index.ts` — `idResourceServer` owns the `resourceServer` plugin schema plus create/list plugin endpoints via `createAuthEndpoint`.
- [x] Register plugin in `getAuth.ts` factory alongside `organization`, `admin`, `jwt`, and `oauthProvider`.
- [x] Write `workers/core/src/auth/cli-auth.ts` — static CLI export for schema generation. It uses in-memory Node SQLite because Better Auth CLI imports the config under Node, not Wrangler's Worker runtime.
- [x] Run `pnpm db:generate --yes` — generates `better-auth_migrations/0001_better_auth.sql` for BA built-in tables and the plugin-owned `resourceServer` table.
- [x] `wrangler d1 migrations apply id --local` succeeds from clean database using `workers/core/wrangler.jsonc` `migrations_dir`.
- [x] Running migrations twice does not fail; the second run reports no migrations to apply.
- [x] Smoke: `workers/core/tests/auth/resource-server-plugin.test.ts` creates a `resourceServer` row via the Better Auth plugin endpoint.

**Gate:** D1 is bootstrapped locally with BA tables and the plugin-owned `resourceServer` table.

### 2.1 Route Map And API Shape (000 Spike C + 001 Spike 1)

- [x] Scaffold a minimal Better Auth instance using `getAuth(env, validAudiences)` factory.
- [x] Generate/commit a route map in `workers/core/src/auth/contracts.ts` — public paths are under `/api/auth`.
- [x] Prove `/oauth2/userinfo` path (not `/userinfo`) from installed package types.
- [x] Prove OAuth Provider client CRUD server API names (`createOAuthClient`, `updateOAuthClient`, `deleteOAuthClient`) from installed package types.
- [x] Correct sign-up claim: installed `better-auth@1.6.11` email/password config exposes `disableSignUp`; the OAuth Provider prompt-create page setting is `signUp`, not `signup`.
- [x] Prove `jwksPath` option and default `/jwks` behavior relative to the Better Auth base path (public `/api/auth/jwks` with the repo default).
- [x] Record the exact TypeScript types for `validAudiences`, `customAccessTokenClaims`, `customTokenResponseFields`: installed `@better-auth/oauth-provider@1.6.11` types show `validAudiences?: string[]`, `customAccessTokenClaims?: (...) => Awaitable<Record<string, any>>`, and `customTokenResponseFields?: (...) => Awaitable<Record<string, unknown>>`.

**Gate:** a generated route map or type-level proof committed as reference.

### 2.2 JWKS Signing And Rotation (001 Spike 4)

- [x] Sign a token, publish JWKS, verify with `jose` using the committed proof helper.
- [x] Verify `kid` in JWT header matches a key in JWKS response.
- [x] Configure rotation interval in Better Auth options; proof test rotates keys and verifies the new `kid`.
- [x] Verify old key remains valid during grace period.
- [x] Decide: use default base-path JWKS route (`/api/auth/jwks` with current base path).
- [x] Document/prove the JWKS URI through `authRouteMap`.

**Gate:** automated test proves sign → verify → rotate → verify old + new.

### 2.3 Resource Audience Validation (001 Spike 2)

- [x] Prove `getAuth(env, validAudiences)` accepts runtime-loaded `validAudiences`; the audience list is resolved before constructing `oauthProvider(...)`.
- [x] Implement KV cache: audience list stored at `id-resource-servers:audiences`.
- [x] Prove KV hit: audiences served from cache, no store loader call.
- [x] Prove KV miss: audiences loaded from store, then populated into KV.
- [x] Prove KV invalidation: creating a resource server through the plugin calls cache invalidation; update/disable invalidation belongs with the remaining Phase 5 mutation endpoints.
- [x] Confirm `validAudiences` shape in installed types: it is synchronous `string[]`, so the implementation must resolve KV/D1 audiences before calling `oauthProvider(...)`.
- [ ] Full OAuth token exchange proofs are deferred until Phase 5 OAuth client/session flows exist. Current Phase 2 proof covers the installed `validAudiences` type, runtime injection point, KV cache behavior, and plugin endpoint smoke.

**Gate:** integration test from plugin endpoint (create) through KV cache to JWT issuance and audience validation.

---

## Phase 3 — Two Workers Proved

**This phase is non-negotiable.** The two-worker topology with service binding must be proven locally. If `dev:stack:ui` cannot route `/admin` traffic through `CORE_ID`, or React leaks into the core bundle — stop and ask. Do not proceed with a single-worker fallback or ignore bundle contamination.

**Phase 1 enforcement is active.** UI composition is already part of `pnpm lint` through `architecture/ui-route-composition`; there is no separate `pnpm check:ui` script in the current package.

### 3.1 Multi-Worker Topology (000 Spike D)

- [x] Start/bundle proof for `core-id`: `pnpm wrangler deploy --config workers/core/wrangler.jsonc --dry-run --outdir dist/core` succeeds.
- [x] Verify core routes are mounted under `/api/auth/*`; root well-known metadata still needs explicit export/proxy routes before Phase 5 OAuth deployment.
- [x] Keep `dev:ui` and `dev:stack:ui` scripts; no separate `check:ui`.
- [x] Prove `/admin` on `ui-id` calls `core-id` through the `CORE_ID` service binding in `workers/ui/tests/service-binding.test.ts`.
- [x] Verify React does NOT appear in core-id dry-run output (`rg "react|react-dom" dist/core` returns no matches).
- [x] Add `nodejs_compat` to `core-id` after Wrangler surfaced Better Auth's `node:async_hooks` runtime dependency.
- [x] Document deployment order: `id-core` before `id-ui`.

**Gate:** service binding call succeeds in local dev.

### 3.2 UI Composition Gate (000 Spike E)

- [x] Write `architecture/ui-route-composition` oxlint rule
- [x] Prove it fails on: raw `<div>`/`<h1>`/`<p>` in `workers/ui/src/app/admin/**/page.tsx`; current scaffold demonstrates the failure and must be fixed before Phase 2
- [x] Prove it fails on: raw Tailwind/DaisyUI `className`
- [x] Prove it fails on: `fetch()` in route file
- [x] Prove it fails on: import from `workers/core/**`
- [x] Prove it fails on: import of `better-auth`
- [x] Prove a valid composition page passes (only `packages/ui` components, no raw HTML)

**Gate:** `pnpm lint` passes on valid page, fails on each violation through `architecture/ui-route-composition`.

---

## Phase 4 — Admin Authorization

**This phase is non-negotiable.** The admin authorization model must be proven with tests for every actor/action combination.

**Phase 1+3 enforcement is active.**

### 4.1 Admin Authorization (001 Spike 5)

- [x] Implement platform `superadmin`/`admin` role in `user.additionalFields`.
- [x] Implement organization owner/admin/member role checks in `workers/core/src/application/admin/authorization.ts`.
- [x] Prove: `superadmin` accesses cross-org lists and mutates any org.
- [x] Prove: org `owner` manages only own org's resources.
- [x] Prove: org `admin` performs only delegated non-owner actions.
- [x] Prove: org `member` and unauthenticated users get `403`/`401`.
- [x] Prove: admin mutation authorization is server-side policy code; Phase 5 routes must call this policy, not rely on UI gating.

**Gate:** automated tests for each actor/action combination.

---

## Phase 5 — Feature Implementation

**All prior gates are active.** From this point, every line of code enters under `pnpm check` (lint + dup + UI composition + typecheck + tests). No feature file is exempt.

Implementation follows `001_first-batch-plan.md` Section 12. The acceptance bar is the full Definition of Done in both documents:

- `001_first-batch-plan.md` Section 18 — feature DoD: admin UI capabilities, OAuth flows, token verification, consent, JWKS, deployment, runbooks.
- `000_repo-architecture.md` Section 16 — repo DoD: layer structure, enforcement gates, pattern compliance, two-worker topology, UI composition enforcement.

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
- [ ] OAuth client CRUD through server APIs (admin-API first, UI-ready, not config)
- [ ] `client_credentials` grant for M2M
- [ ] Refresh token support
- [ ] Introspection and revocation
- [ ] `prompt=create` and `prompt=select_account`
- [ ] Post-login organization selection
- [ ] Custom claims enrichment (`org_id`, etc.)
- [ ] Custom token response fields

### 5.3 Custom Admin API (Plugin Endpoints)

- [ ] `idResourceServer` plugin endpoints: create, read, update, delete, list resource servers
- [ ] Plugin endpoints use `createAuthEndpoint` — registered on BA handler automatically under the Better Auth base path, expected as `/api/auth/admin/resource-servers...`
- [ ] Dashboard aggregate endpoint (may be custom Hono route or plugin endpoint)
- [ ] Hono `/api/admin/*` endpoints call `requireActor(c)` with role checks from Phase 4; Better Auth plugin endpoints enforce the same role checks through Better Auth endpoint context/session middleware.

### 5.4 Admin UI (Scaffold Only)

Full admin pages are deferred per `001_first-batch-plan.md` Section 10. First batch delivers:

- [ ] Vinext App Router scaffold in `workers/ui/` with `packages/ui` component stubs
- [ ] Health-check page at `/admin` that confirms the worker runs and can reach `core-id` via `CORE_ID` service binding
- [ ] Service binding proxy for admin API calls
- [ ] All admin pages pass `pnpm lint` with `architecture/ui-route-composition` active

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
| 3 | Two workers run locally; UI composition gate works (under Phase 1 enforcement) | Build system proven; UI composition remains part of `pnpm lint` |
| 4 | Admin auth tests pass (under Phase 1+3 enforcement) | Authorization model proven |
| 5 | All 001 DoD items met | Ship |
