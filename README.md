# id

Identity provider built on Cloudflare Workers, D1, and Better Auth. Provides OAuth2.1/OIDC authentication, multi-tenant organizations, JWT token issuance, and an admin API. Replaces `pjs/auther`.

This repo implements the first-batch documented scope:

- `core-id` Worker — email/password identity, sessions, organizations, OAuth2.1/OIDC provider, JWKS-verifiable JWT access tokens, admin API
- `ui-id` Worker — admin UI scaffold under `/admin/*` with a `/admin/api` placeholder for future UI-owned BFF endpoints (full admin pages deferred)

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
- [docs/reference/content-api-architecture.md](docs/reference/content-api-architecture.md) — reference architecture from the production `content-api` codebase

## Future Implementation

Intentionally deferred to later batches:

- full admin UI pages (first batch has only minimal hosted login/consent pages; admin operations are API-first)
- ReBAC (Zanzibar graph authorization)
- ABAC / Lua policy engine
- webhook delivery
- custom onboarding flows and registration contexts
- pipeline/hook scripting engine

## Stack

- `better-auth@1.6.11`
- `@better-auth/oauth-provider@1.6.11`
- `hono`
- `drizzle-orm`
- `wrangler`
- `vinext` (ui-id only)
- `react` / `react-dom` (ui-id only)
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
- Custom tables are defined through Better Auth plugin `schema` definitions and generated into the Drizzle/D1 migration path.
- Raw D1 access is forbidden outside `workers/core/src/infrastructure/persistence/`. Even there, it is only allowed when the Better Auth adapter is genuinely unavailable. The canonical case is audience loading before the Better Auth OAuth Provider can be constructed. New raw-D1 infrastructure files need JSDoc explaining the chicken-and-egg reason.
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

# KV namespace for secondary storage (rate limiting, session cache)
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
```

In production, route specificity sends `/admin/*` to `ui-id` and `/api/auth/*` plus metadata routes to `core-id`. Hosted UI auth pages call core endpoints directly with same-origin `/api/auth/*` requests.

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

After bootstrap, use a Better Auth admin session through the Wrangler-gated generic helper. It refuses to send requests unless `pnpm wrangler whoami` succeeds and it stores only a local session cookie, not an admin API key:

```bash
pnpm auth:api:login https://id.quanghuy.dev admin@example.com
pnpm auth:api POST /api/auth/admin/create-user '{"email":"user@example.com","password":"long-random-password","name":"User"}'
pnpm auth:api POST /api/auth/oauth2/create-client '{"client_name":"content-api","redirect_uris":["https://content.quanghuy.dev/callback"],"token_endpoint_auth_method":"client_secret_post","grant_types":["client_credentials"],"response_types":["code"],"scope":"api:read"}'
pnpm auth:api:logout
```

Public `POST /api/auth/sign-up/email` is disabled. Admins create users through Better Auth Admin `createUser`, then send verification through `/api/auth/send-verification-email` when needed.

## Migrations

Better Auth schema is generated via CLI. Plugin-owned custom tables are included in the same migration generation step. Generated SQL migrations live under `migrations/`, and `workers/core/wrangler.jsonc` points D1 at that directory with `migrations_dir`.

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
`pnpm smoke:remote` requires `ID_CORE_URL` and `ID_UI_URL`. UI smoke checks stay under `/admin/*`, including `/admin/health`, because production only routes `/admin/*` to `ui-id`.
`pnpm deploy:ui:dry-run` mirrors the Cloudflare deploy path: it builds from `workers/ui`, lets Vinext/@cloudflare/vite-plugin generate `workers/ui/dist/server/wrangler.json`, then runs Wrangler deploy with `--dry-run`.

## Deployment

CI/CD is handled by `.github/workflows/ci.yml`. Push/PR runs `pnpm check`; manual dispatch with `deploy=true` runs:

1. `pnpm check` — lint, dup gate, UI composition, typecheck, tests
2. `pnpm db:migrate:remote`
3. `pnpm deploy:core`
4. `pnpm deploy:ui`
5. `pnpm smoke:remote`

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers and D1:Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `BETTER_AUTH_SECRET` — Better Auth signing and encryption secret
- `SENDER_API_TOKEN` — Sender transactional API token
- `EMAIL_FROM` — verified Sender `from.email`
- `ID_BOOTSTRAP_TOKEN` — temporary one-time bootstrap token; remove or rotate after first admin creation

Required GitHub variables:

- `ID_CORE_URL` — deployed core Worker base URL
- `ID_UI_URL` — deployed UI Worker base URL
