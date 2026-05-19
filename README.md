# id

Identity provider built on Cloudflare Workers, D1, and Better Auth. Provides OAuth2.1/OIDC authentication, multi-tenant organizations, JWT token issuance, and an admin API. Replaces `pjs/auther`.

This repo implements the first-batch documented scope:

- `core-id` Worker — email/password identity, sessions, organizations, OAuth2.1/OIDC provider, JWKS-verifiable JWT access tokens, admin API
- `ui-id` Worker — admin UI scaffold with service binding to `core-id` (full admin pages deferred)

## Contracts

This implementation follows the planning and architecture documents:

- [docs/000_repo-architecture.md](docs/000_repo-architecture.md) — layer architecture, design patterns, enforcement rules, two-worker topology
- [docs/001_first-batch-plan.md](docs/001_first-batch-plan.md) — domain plan, OAuth flows, data model, deployment, definition of done
- [docs/002_implementation-sequence.md](docs/002_implementation-sequence.md) — merged phased execution order (spikes → enforcement → features)
- [docs/003_future-implementation.md](docs/003_future-implementation.md) — CEL policy engine, onboarding, analytics, pipeline hooks, plugin strategy
- [docs/reference/content-api-architecture.md](docs/reference/content-api-architecture.md) — reference architecture from the production `content-api` codebase

## Future Implementation

Intentionally deferred to later batches:

- full admin UI pages (scaffold only in first batch; admin operations are API-first)
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

Versions will be pinned at start of implementation. Verified package metadata on May 19, 2026.

## Architecture Notes

- Hexagonal layers enforced by oxlint: `domain/`, `application/`, `http/`, `infrastructure/`, `composition/`, `shared/`, `auth/`.
- `src/auth/` is a Better Auth integration boundary — never imported by domain or application code.
- `src/composition/create-container.ts` is the only file that wires infrastructure implementations to application use cases.
- `src/infrastructure/persistence/crud-adapter.ts` owns shared CRUD row access and cursor pagination.
- `src/infrastructure/repositories/mappers/**` owns DB row ↔ domain entity conversion.
- Better Auth-owned tables are never defined in `src/infrastructure/db/schema.ts` and never written directly outside BA APIs.
- Custom tables are gated by `.schema-whitelist.json`; unapproved tables fail CI.
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
    "BETTER_AUTH_URL": "https://id.quanghuy.dev"
  }
}
```

Create `.dev.vars` from the committed example:

```bash
cp .dev.vars.example .dev.vars
```

4. Apply local migrations:

```bash
pnpm db:migrate:local
```

5. Start local development:

```bash
pnpm dev:core                    # core-id Worker
pnpm dev:ui                      # ui-id Worker (Vinext dev)
pnpm dev:stack:ui                # both Workers with service binding (UI primary)
```

`dev:stack:ui` runs `core-id` and `ui-id` together locally with a service binding so `/admin` can call `core-id` through `CORE_ID`.

## Migrations

Better Auth schema is generated via CLI. Custom tables use Drizzle. Generated SQL migrations live under `drizzle/`.

Generate BA schema and Drizzle migrations:

```bash
pnpm db:generate
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
pnpm check:schema
pnpm check:ui
pnpm typecheck
pnpm test
pnpm check
pnpm advise
```

`pnpm check` is the hard gate: oxlint architecture rules (16 ported + 6 id-specific), Fallow mild duplicate threshold (<3%), schema whitelist, UI composition rules, TypeScript strict, and Vitest. `pnpm advise` is non-blocking review input from Aislop plus semantic Fallow; run it after substantial code changes.

## Deployment

CI/CD is handled by `.github/workflows/ci-deploy.yml`. On every push to `main`:

1. `pnpm check` — lint, dup gate, schema whitelist, UI composition, typecheck, tests
2. `wrangler d1 migrations apply id --remote`
3. `wrangler deploy --config workers/core/wrangler.jsonc`
4. `vinext deploy --cwd workers/ui`

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers and D1:Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `BETTER_AUTH_SECRET` — Better Auth signing and encryption secret
- Email provider secrets (verification and password reset)
