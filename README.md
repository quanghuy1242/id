# id

Identity provider built on Cloudflare Workers, D1, and Better Auth. Provides OAuth2.1/OIDC authentication, multi-tenant organizations, JWT token issuance, and an admin API. Replaces `pjs/auther`.

This repo implements the first-batch documented scope:

- `core-id` Worker — email/password identity, sessions, organizations and teams, OAuth2.1/OIDC provider, DB-backed resource-server scopes, JWKS-verifiable JWT access tokens (`GET /api/auth/jwks`), console scope discovery (`GET /api/auth/admin/console-scopes`), read-only SCIM v2 directory (`/api/auth/scim/v2/…` — users, org users, teams/groups, virtual org-admins group per [docs/017](docs/017_scim-directory-and-m2m-principal-contract.md)), admin API, Better Auth OpenAPI reference (`GET /api/auth/open-api/generate-schema`, `GET /api/auth/reference`).
- `ui-id` Worker — scoped admin UI under `/admin/*` with canonical platform (`/admin/platform/**`) and organization (`/admin/orgs/:orgId/**`) lenses, a console scope selector, identity/application/access/security surfaces, live aggregate sessions/tokens/consents/JWKS backed by the `admin-audit` plugin per [docs/026](docs/026_admin-oauth-security-screens-and-api-contracts.md), entity Audit tabs backed by `admin-activity-log`, and a standards-based token decoder/introspection console; hosted login/consent pages, UI health at `/ui-health`, client-side assets under `/assets/*`, with a `/admin/api` placeholder for future UI-owned BFF endpoints

## Contracts

This implementation follows the planning and architecture documents:

- [docs/000_repo-architecture.md](docs/000_repo-architecture.md) — layer architecture, design patterns, enforcement rules, two-worker topology
- [docs/001_first-batch-plan.md](docs/001_first-batch-plan.md) — domain plan, OAuth flows, data model, deployment, definition of done
- [docs/002_implementation-sequence.md](docs/002_implementation-sequence.md) — merged phased execution order (spikes → enforcement → features)
- [docs/002_1_first-batch-gaps.md](docs/002_1_first-batch-gaps.md) — gap analysis: blockers, missing tests, integration readiness
- [docs/003_future-implementation.md](docs/003_future-implementation.md) — CEL policy engine, onboarding, analytics, pipeline hooks, plugin strategy
- [docs/004_admin-api-reference.md](docs/004_admin-api-reference.md) — admin API and Better Auth management endpoints
- [docs/005_oauth2-oidc-integration-guide.md](docs/005_oauth2-oidc-integration-guide.md) — app integration guide
- [docs/006_resource-server-jwt-guide.md](docs/006_resource-server-jwt-guide.md) — downstream JWT verification guide
- [docs/007_cloudflare-deployment-runbooks.md](docs/007_cloudflare-deployment-runbooks.md) — deploy, smoke, bootstrap, Sender email, API-only operation, incident runbooks
- [docs/008_legacy-auth-flow-analysis.md](docs/008_legacy-auth-flow-analysis.md) — analysis of auther/next-blog/payloadcms auth flows; correct OIDC RP-Initiated Logout
- [docs/009_plugin_first_auth_architecture.md](docs/009_plugin_first_auth_architecture.md) — first custom BA plugin architecture decisions and resource-server table design
- [docs/010_organization-teams-oauth-flow.md](docs/010_organization-teams-oauth-flow.md) — organization/teams OAuth authorization context selection flow
- [docs/011_oauth-postlogin-context-ui.md](docs/011_oauth-postlogin-context-ui.md) — OAuth post-login context-selection UI spec
- [docs/012_random_thoughts.md](docs/012_random_thoughts.md) — misc design notes and architecture intuitions
- [docs/013_identity-event-standards-and-decisions.md](docs/013_identity-event-standards-and-decisions.md) — standards landscape (SET/SSF/RISC/CAEP) and decision record for the identity event channel
- [docs/014_identity-event-producer-id.md](docs/014_identity-event-producer-id.md) — producer-side implementation plan (`idIdentityEvents` plugin, transactional outbox, SET delivery)
- [docs/015_identity-event-consumer-content-api-audit.md](docs/015_identity-event-consumer-content-api-audit.md) — consumer-side audit-mode plan for `content-api` (receipts, orphan-binding findings)
- [docs/016_identity-event-consumer-content-api-fence-enforcement.md](docs/016_identity-event-consumer-content-api-fence-enforcement.md) — consumer-side fence enforcement plan (conditional, Phase 3)
- [docs/017_scim-directory-and-m2m-principal-contract.md](docs/017_scim-directory-and-m2m-principal-contract.md) — proposal to replace custom user/team/admin principal-validation with read-only SCIM v2 and to resolve service-account/M2M binding semantics explicitly
- [docs/018_m2m-oauth-client-org-binding.md](docs/018_m2m-oauth-client-org-binding.md) — M2M OAuth client organization binding rules, identity mirror, and reference-id immutability
- [docs/019_content-api-gated-security-recommendations.md](docs/019_content-api-gated-security-recommendations.md) — content-api gated security recommendations
- [docs/020_A4-content-api-scim-migration.md](docs/020_A4-content-api-scim-migration.md) — content-api SCIM directory migration plan
- [docs/021_security-static-analysis-gate.md](docs/021_security-static-analysis-gate.md) — security static analysis gate design and integration
- [docs/022_admin-ui-system.md](docs/022_admin-ui-system.md) — admin UI design system architecture and token reference
- [docs/023_admin-screen-story-strategy.md](docs/023_admin-screen-story-strategy.md) — admin screen spec format and story-writing strategy
- [docs/024_admin-login-context-guard.md](docs/024_admin-login-context-guard.md) — admin login context guard (sign-in gate + admin MFA OTP)
- [docs/025_admin-ui-swr-caching-strategy.md](docs/025_admin-ui-swr-caching-strategy.md) — SWR-based client-side caching strategy for admin UI (dedup, cross-navigation cache, rate-limit-aware configuration)
- [docs/026_admin-oauth-security-screens-and-api-contracts.md](docs/026_admin-oauth-security-screens-and-api-contracts.md) — OAuth/security admin screens, verified API contracts, and the BA-plugin/adapter approach for the missing aggregate endpoints
- [docs/027_admin-ui-enrichment.md](docs/027_admin-ui-enrichment.md) — admin UI enrichment & redesign (redesign-first): detailed component toolkit, grants-section IA unification, the `admin-activity-log` audit plugin, and JWKS/Applications/Scope-catalog detail-route redesigns with ASCII layouts, component trees, and standards classification
- [docs/028_tenant-scoped-platform-experience.md](docs/028_tenant-scoped-platform-experience.md) — tenant-scoped console proposal: one Google-Cloud-style operator console with a scope selector and a single permission-gated nav rendered as platform/organization lenses, administration as roles-on-scope, step-up on sensitive scopes/actions, and the delegated-admin direction
- [docs/029_account-center-and-self-service-identity.md](docs/029_account-center-and-self-service-identity.md) — Account Center and self-service identity proposal: the `/account` self-service shell (the `myaccount` counterpart to the 028 console), password/reset/verification flows, safe current-user APIs, the shared login-context model, and standards boundaries for OIDC, OAuth, and SCIM
- [docs/030_client-initiated-registration-and-onboarding.md](docs/030_client-initiated-registration-and-onboarding.md) — client-initiated registration and onboarding proposal: OIDC `prompt=create`, guarded signup, registration policies, invite/domain/quota controls, and scope/permission boundaries
- [docs/031_platform-access-control.md](docs/031_platform-access-control.md) — platform access control model: the two-tier (system/platform vs organization) by two-principal-kind (human admin vs machine service account) matrix, infra service accounts as the confidential id↔client channel (SCIM/picker + RFC 7662 introspection), the scope catalog as Better Auth's runtime prefill and tier classifier, and the strict boundary with resource access control
- [docs/032_identity-program-build-backlog.md](docs/032_identity-program-build-backlog.md) — execution tracker for the 028–031 identity program: ordered, checkable tickets across console/access (028+031), account center (029), login/step-up, and registration (030), with dependencies, hard gates, and links back to each spec
- [docs/reference/content-api-architecture.md](docs/reference/content-api-architecture.md) — reference architecture from the production `content-api` codebase

## Future Implementation

Intentionally deferred to later batches:

- joined-field admin search (e.g. session/token/consent search by user email) — deferred from the `admin-audit` plugin per [docs/026](docs/026_admin-oauth-security-screens-and-api-contracts.md) §4.3 pending a documented read side or denormalization
- ReBAC (Zanzibar graph authorization)
- ABAC / Lua policy engine
- webhook delivery
- custom onboarding flows and registration contexts
- pipeline/hook scripting engine

## Security

Last security check date: **2026-05-27**. See [docs/security/](docs/security/) for the living findings register and audit snapshots.

## Stack

- `better-auth@1.6.11`
- `@better-auth/oauth-provider@1.6.11`
- `hono`
- `drizzle-orm`
- `wrangler`
- `vinext` (ui-id only)
- `react` / `react-dom` (ui-id only)
- `swr` (ui-id only — admin client-side data cache; see [docs/025](docs/025_admin-ui-swr-caching-strategy.md))
- `jose`
- `vitest`

Versions are pinned in `package.json`. Verified package metadata on May 19, 2026.

## Architecture Notes

- Hexagonal layers enforced by oxlint: `domain/`, `application/`, `http/`, `infrastructure/`, `composition/`, `shared/`, `auth/`.
- `src/auth/` is a Better Auth integration boundary — never imported by domain or application code.
- `src/composition/create-container.ts` is the only file that wires infrastructure implementations to application use cases.
- `src/infrastructure/persistence/crud-adapter.ts` owns shared CRUD row access and cursor pagination.
- `src/infrastructure/repositories/mappers/**` owns DB row ↔ domain entity conversion.
- Better Auth-owned tables are never defined in `workers/core/src/infrastructure/db/schema.ts` and never written directly outside BA APIs.
- Custom tables are defined through Better Auth plugin `schema` definitions and generated into the Drizzle/D1 migration path. Plugin-owned natural-key invariants are represented by supported unique fields in those schemas, so generated schema output is never post-processed.
- Raw D1 access is forbidden outside `workers/core/src/infrastructure/persistence/`. Even there, it is only allowed when the Better Auth adapter is genuinely unavailable. Canonical auth-boundary exceptions are plugin-owned runtime companions that preload audiences, OAuth scopes/grants, or token team facts before the Better Auth OAuth Provider can be constructed. Plugin CRUD still uses the Better Auth adapter.
- Custom Better Auth plugin conventions are documented in [.agents/skills/id-auth-plugin/SKILL.md](.agents/skills/id-auth-plugin/SKILL.md).
- Workers never cross-import. Shared code lives in `packages/lib` (framework-free) and `packages/ui` (Lumina components, ui-id only).

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create remote resources (one-time):

```bash
# D1 database
wrangler d1 create id
# → copy the returned UUID into workers/core/wrangler.jsonc database_id

# KV namespace for auth secondary storage and resource-server audience cache
wrangler kv:namespace create id-kv
# → copy the returned ID into workers/core/wrangler.jsonc kv_namespaces
```

3. Keep non-secret Worker vars in each worker's `wrangler.jsonc`. Secret bindings used by local `wrangler dev` belong in `.dev.vars` so they do not collide with CI-managed Cloudflare secrets:

```jsonc
{
  "vars": {
    "BETTER_AUTH_URL": "https://id.quanghuy.dev",
    "BETTER_AUTH_COOKIE_DOMAIN": ".quanghuy.dev",
    "EMAIL_FROM_NAME": "id"
  }
}
```

Create `.dev.vars` from the committed example:

```bash
cp .dev.vars.example .dev.vars
```

4. Generate schema and apply local migrations:

```bash
pnpm db:generate
pnpm db:migrate:local
```

5. Start local development:

```bash
pnpm dev:core                    # core-id Worker
pnpm dev:ui                      # ui-id Worker (Vinext dev)
pnpm dev:ladle                   # Ladle component workshop for @id/ui
```

In production, route specificity sends `/admin*`, `/login*`, `/consent*`, `/select-authorization-context*`, `/ui-health`, and `/assets/*` to `ui-id`; `/api/auth/*`, core `/health`, plus metadata routes stay on `core-id`. The wildcard suffix is required on browser page routes because Cloudflare Worker route matching includes query strings. Hosted UI auth pages call core endpoints directly with same-origin `/api/auth/*` requests.

## First Admin And API-Only Operation

Bootstrap a fresh D1 once with a long random Wrangler secret:

```bash
pnpm wrangler secret put ID_BOOTSTRAP_TOKEN --config workers/core/wrangler.jsonc
curl -X POST https://id.quanghuy.dev/api/bootstrap/admin \
  -H 'authorization: Bearer <ID_BOOTSTRAP_TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"long-random-password","name":"Root Admin","organization":{"name":"Default","slug":"default"}}'
pnpm wrangler secret delete ID_BOOTSTRAP_TOKEN --config workers/core/wrangler.jsonc
```

The bootstrap call also seeds the id-owned system resource server and default system scopes (`identity:directory:read`, `oauth:clients:read`) from auth config constants. It does not create infra service-account clients or client-scope bindings; those remain deployment-specific provisioning steps.

After bootstrap, use a Better Auth admin session through the Wrangler-gated generic helper. It refuses to send requests unless `pnpm wrangler whoami` succeeds and it stores only a local session cookie, not an admin API key:

```bash
pnpm auth:api:login https://id.quanghuy.dev admin@example.com
pnpm auth:api POST /api/auth/admin/create-user '{"email":"user@example.com","password":"long-random-password","name":"User"}'
pnpm auth:api POST /api/auth/admin/resource-servers '{"organizationId":"org_1","slug":"content-api","name":"Content API","audience":"https://content-api.example.com"}'
pnpm auth:api POST /api/auth/admin/oauth-scopes '{"resourceServerId":"rs_content","scope":"content:read"}'
pnpm auth:api POST /api/auth/oauth2/create-client '{"client_name":"content-api","redirect_uris":["https://content.quanghuy.dev/callback"],"token_endpoint_auth_method":"client_secret_post","grant_types":["client_credentials"],"response_types":["code"],"scope":"content:read"}'
pnpm auth:api:logout
```

Public `POST /api/auth/sign-up/email` is disabled. Admins create users through Better Auth Admin `createUser`, then send verification through `/api/auth/send-verification-email` when needed.

## Migrations

Better Auth schema is generated via CLI. Plugin-owned custom tables and their supported field-level indexes are included in the same migration generation step before Drizzle generates migration output; do not hand-edit generated schema, SQL, or snapshots. Generated SQL migrations live under `migrations/`, and `workers/core/wrangler.jsonc` points D1 at that directory with `migrations_dir`.

Generate BA schema (built-in + plugin tables) — this writes the Drizzle schema file:

```bash
pnpm db:generate
```

If the schema changed, generate a **named migration** for the changes:

```bash
pnpm db:migration:new <descriptive_name>
```

Example:

```bash
pnpm db:migration:new drop_platform_role
pnpm db:migration:new add_admin_plugin_role
```

Apply to local D1:

```bash
pnpm db:migrate:local
```

Apply to remote D1:

```bash
pnpm db:migrate:remote
```

## Quality Checks

```bash
pnpm lint
pnpm check:dup
pnpm typecheck
pnpm test
pnpm check
pnpm advise
pnpm smoke:remote
pnpm auth:api <METHOD> <PATH> [inline-json]
pnpm auth:api:login <origin> <email>
pnpm auth:api:logout
```

`pnpm check` is the hard gate: oxlint architecture rules (16 ported + 7 id-specific), Fallow mild duplicate threshold (<3%), UI composition rules, TypeScript strict, and Vitest. `pnpm advise` is non-blocking review input from Aislop plus semantic Fallow; run it after substantial code changes.
There is intentionally no separate `check:ui`; UI composition is enforced by `pnpm lint`, so it is already included in `pnpm check`.
Vitest runs through one barrel per project (`workers/core/tests/all.test.ts`, `workers/ui/tests/all.test.ts`) to avoid repeated environment/import setup. Add new test files to the matching barrel instead of widening the project `include` patterns.
`pnpm smoke:remote` requires `ID_CORE_URL` and `ID_UI_URL`. UI smoke checks use `/ui-health` for the public UI Worker liveness probe and `/admin/*` for admin page routing, because production only routes explicit UI paths to `ui-id`.
`pnpm deploy:ui:dry-run` mirrors the Cloudflare deploy path: it builds from `workers/ui`, lets Vinext/@cloudflare/vite-plugin generate `workers/ui/dist/server/wrangler.json`, then runs Wrangler deploy with `--dry-run`.
`pnpm dev:ladle` serves the shared `@id/ui` component stories from `.ladle/` and `stories/` without booting the full UI worker. `pnpm build:ladle` generates a static Ladle build under `.ladle/build`.

## Deployment

CI/CD is handled by `.github/workflows/ci.yml`. Push/PR runs `pnpm check` + dry-run deployments. Manual dispatch via **Actions → CI & Deploy → Run workflow** with `deploy=true` runs the full deploy pipeline:

1. `pnpm check` — lint, dup gate, typecheck, tests
2. Migration dry-run (local SQLite)
3. Core + UI dry-run deploys
4. Set secrets from GitHub → Cloudflare via `wrangler secret put`
5. `pnpm db:migrate:remote`
6. `pnpm deploy:core`
7. `pnpm deploy:ui`
8. `pnpm smoke:remote`

All secrets are read from GitHub Secrets at deploy time. No manual `wrangler secret put` needed.

**Required GitHub secrets** (set at repo → Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers and D1:Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `BETTER_AUTH_SECRET` — Better Auth signing and encryption secret (min 32 chars)
- `RESEND_API_KEY` — Resend transactional API key (`re_...`)

Non-secret vars committed in `workers/core/wrangler.jsonc`:

- `EMAIL_FROM` — verified Resend sender address (on a domain verified in Resend)
- `EMAIL_FROM_NAME` — sender display name
- `BETTER_AUTH_COOKIE_DOMAIN` — shared cookie domain (e.g. `.quanghuy.dev`)

One-time bootstrap (run manually once, then delete the secret):

- `ID_BOOTSTRAP_TOKEN` — temporary token for first admin creation

**Required GitHub variables** (repo → Settings → Secrets and variables → Actions → Variables):

- `ID_CORE_URL` — deployed core Worker base URL (e.g. `https://id.quanghuy.dev`)
- `ID_UI_URL` — deployed UI Worker base URL (e.g. `https://id.quanghuy.dev`)
