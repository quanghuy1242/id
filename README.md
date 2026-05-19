# id

Identity provider built on Cloudflare Workers, D1, and Better Auth. Provides OAuth2.1/OIDC authentication, multi-tenant organizations, JWT token issuance, and an admin UI. Replaces `pjs/auther`.

This repo implements the first-batch documented scope:

- email/password sign-up, sign-in, session management
- multi-tenant organizations (members, roles, invitations, teams)
- OAuth2.1 / OIDC authorization server (authorization_code with PKCE S256, client_credentials, refresh_token)
- JWKS-signed JWT access tokens with audience binding
- token introspection (RFC 7662) and revocation (RFC 7009)
- pairwise subject identifiers
- admin UI for organizations, OAuth2 clients, resource servers, users, and consents

## Contracts

Architecture and implementation follow:

- [docs/000_repo-architecture.md](docs/000_repo-architecture.md) — layer architecture, design patterns, enforcement rules, two-worker topology
- [docs/001_first-batch-plan.md](docs/001_first-batch-plan.md) — domain plan, OAuth flows, data model, deployment, definition of done
- [docs/reference/content-api-architecture.md](docs/reference/content-api-architecture.md) — reference architecture from the production `content-api` codebase

Two Cloudflare Workers:

- `core-id` — auth, OAuth2.1/OIDC, JWKS, D1-backed (Better Auth)
- `ui-id` — admin dashboard, Vinext/React, communicates with `core-id` via service binding

Designed to replace the legacy `~/pjs/auther` IdP. Downstream resource servers (e.g., `content-api`) validate JWTs against this service's JWKS endpoint.

## Stack

- `better-auth` (latest stable)
- `@better-auth/oauth-provider`
- `hono`
- `wrangler`

Versions to be pinned at start of implementation.

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create remote resources (one-time):

```bash
# D1 database
wrangler d1 create id
# → copy the returned UUID into wrangler.jsonc database_id

# KV namespace for secondary storage (rate limiting, session cache)
wrangler kv:namespace create id-kv
# → copy the returned ID into wrangler.jsonc kv_namespaces
```

3. Keep non-secret Worker vars in `wrangler.jsonc`. Secret bindings used by local `wrangler dev` belong in `.dev.vars`:

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
pnpm dev
```

## Migrations

Better Auth schema is generated via CLI. Custom tables use Drizzle. Generated SQL migrations live under `drizzle/`.

Generate BA schema and Drizzle migrations:

```bash
pnpm db:generate
```

Apply to remote D1:

```bash
pnpm db:migrate:remote
```

## Deployment

CI/CD is handled by `.github/workflows/ci-deploy.yml`. On every push to `main`:

1. `pnpm check` — lint, dup gate, schema whitelist, typecheck, tests
2. `wrangler d1 migrations apply id --remote`
3. `wrangler deploy --config workers/core/wrangler.jsonc`
4. `vinext deploy --cwd workers/ui`

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers and D1:Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `BETTER_AUTH_SECRET` — Better Auth signing and encryption secret

## Not Implemented

Intentionally excluded from the first batch:

- ReBAC (Zanzibar graph authorization)
- ABAC / Lua policy engine
- webhook delivery
- custom onboarding flows and registration contexts
- pipeline/hook scripting engine
