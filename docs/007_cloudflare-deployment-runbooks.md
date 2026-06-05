# Cloudflare Deployment And Runbooks

## Deploy

Prerequisites:

- Cloudflare account and Worker/D1/KV resources exist.
- `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and any temporary bootstrap secrets are set as Cloudflare secrets.
- `ID_CORE_URL` and `ID_UI_URL` repository variables point at the deployed Workers.

Pipeline order:

1. `pnpm check`
2. `pnpm db:migrate:remote`
3. `pnpm deploy:core`
4. `pnpm deploy:ui`
5. `pnpm smoke:remote`

The GitHub Actions workflow in `.github/workflows/ci.yml` runs `pnpm check` on push/PR. Push deploys and manual deploy runs apply remote D1 migrations, build core-id with Vite, deploy core-id from the generated prebuilt config, then deploy ui-id.

Local dry-run verification mirrors the deploy paths. `pnpm deploy:core:dry-run` builds core-id through Vite, then calls Wrangler against `dist/id_core/wrangler.json` with `--dry-run`. `pnpm deploy:ui:dry-run` builds inside `workers/ui`, uses Vinext's generated `dist/server/wrangler.json`, then calls Wrangler deploy with `--dry-run`, matching the real `pnpm deploy:ui` path.

Core deploys now use the Cloudflare Vite plugin prebuilt path. `pnpm build` reads `workers/core/wrangler.jsonc` through the root `vite.config.ts` and emits `dist/id_core/wrangler.json` with `no_bundle: true`; `pnpm deploy:core` deploys that generated config via `pnpm deploy:prebuilt:core`. CI builds core-id before the Wrangler Action, then runs the action from `dist/id_core` so both secret upload and deploy resolve the generated `wrangler.json`.

Production browser OAuth is supported on the `*.quanghuy.dev` deployment only. Preview `*.workers.dev` URLs are API-only because browsers cannot share Better Auth cookies on the `workers.dev` public suffix.

## Remote Smoke

Run:

```sh
ID_CORE_URL=https://<core-host> ID_UI_URL=https://<ui-host> pnpm smoke:remote
```

The smoke checks verify:

- core health endpoint;
- JWKS endpoint;
- OAuth authorization-server metadata alias;
- UI `/admin` health scaffold.

## Resend Transactional Email

1. Create a Resend account.
2. Add the sending domain and complete SPF, DKIM, and DMARC verification.
3. Create an API key (`re_...`).
4. Store secrets:

```sh
pnpm wrangler secret put RESEND_API_KEY --config workers/core/wrangler.jsonc
pnpm wrangler secret put EMAIL_FROM --config workers/core/wrangler.jsonc
```

`EMAIL_FROM` must be an address on a domain verified in Resend, and `EMAIL_FROM_NAME` is a non-secret Worker var. The Worker sends verification, password-reset, and admin-OTP emails through `POST https://api.resend.com/emails`. Resend failures are surfaced as operational errors with rate-limit metadata; raw auth URLs, tokens, codes, and authorization headers are not logged by the adapter.

## First Admin Bootstrap

Use this once for a fresh production D1:

```sh
pnpm wrangler secret put ID_BOOTSTRAP_TOKEN --config workers/core/wrangler.jsonc
curl -X POST "$ID_CORE_URL/api/bootstrap/admin" \
  -H "authorization: Bearer $ID_BOOTSTRAP_TOKEN" \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"long-random-password","name":"Root Admin","organization":{"name":"Default","slug":"default"}}'
pnpm wrangler secret delete ID_BOOTSTRAP_TOKEN --config workers/core/wrangler.jsonc
```

The route refuses to run once any native Better Auth `user.role = "admin"` exists. Do not use `BETTER_AUTH_SECRET` as an operator credential and do not bootstrap with manual SQL.

The bootstrap call also runs the idempotent system access seed. It ensures the id-owned `/system` resource server and the `identity:directory:read` / `oauth:clients:read` system scopes exist. It does not create infra service-account clients, client secrets, or `oauthClientResourceScope` bindings; those are deployment-specific credentials and must be provisioned explicitly.

## Infra Service Accounts For Id-Owned Channels

Use this after first-admin bootstrap when a resource server such as `content-api` needs the confidential `id` channels from [docs/031](031_platform-access-control.md): directory validation over SCIM/client-picker on `/system`, and token-active assertion through RFC 7662 introspection. Do not hard-code client ids, client names, or secrets in source; create them per deployment and store returned secrets only in the consuming service's secret store.

1. Authenticate as a platform admin with `pnpm auth:api:login "$ID_CORE_URL" admin@example.com`.
2. Confirm the seeded system catalog exists: `pnpm auth:api GET /api/auth/admin/resource-servers` and find the row whose `organizationId` is `null`, `slug` is `id-system`, and `audience` is `$ID_CORE_URL/system`; confirm `GET /api/auth/admin/oauth-scopes` includes `identity:directory:read` and `oauth:clients:read` for that resource server.
3. Create a directory-channel infra client with `grant_types = ["client_credentials"]`, no active organization / `referenceId = null`, and `scope = "identity:directory:read oauth:clients:read"`. This client obtains bearer tokens for SCIM and the OAuth client-picker. Store the returned client id and secret as the consumer's directory-channel secrets, for example `ID_SCIM_CLIENT_ID` and `ID_SCIM_CLIENT_SECRET`.
4. Bind that directory client to the seeded `/system` resource server with `POST /api/auth/admin/oauth-client-resource-scopes`, `clientId = <directory client id>`, `resourceServerId = <seeded system resource-server id>`, and `allowedScopes = ["identity:directory:read", "oauth:clients:read"]`.
5. Configure the consumer to request `POST /api/auth/oauth2/token` with `grant_type=client_credentials`, `resource=$ID_CORE_URL/system`, and `scope="identity:directory:read oauth:clients:read"` before calling `/api/auth/scim/v2/*` or `/api/auth/admin/oauth-clients/lookup`.
6. Create a separate introspection-channel OAuth client for RFC 7662 token-active checks. Store its id/secret separately, for example `ID_INTROSPECTION_CLIENT_ID` and `ID_INTROSPECTION_CLIENT_SECRET`. This channel authenticates directly to `POST /api/auth/oauth2/introspect`; it does not use a `/system` bearer token and does not need an `oauthClientResourceScope` binding unless it also calls a bearer-protected system endpoint.
7. Rotate the directory-channel and introspection-channel secrets independently. Directory credential compromise exposes principal/client metadata reads; introspection credential compromise exposes token-status lookups. Treat those blast radii and rotation windows separately.
8. Sign out with `pnpm auth:api:logout`.

## API-Only Admin Operation

After bootstrap:

```sh
pnpm auth:api:login "$ID_CORE_URL" admin@example.com
pnpm auth:api GET /api/auth/get-session
pnpm auth:api POST /api/auth/admin/create-user '{"email":"user@example.com","password":"long-random-password","name":"User"}'
pnpm auth:api:logout
```

The helper is intentionally curl-like. It accepts method, path, and optional inline JSON only. It first runs `pnpm wrangler whoami`, uses a cached Better Auth session cookie, and does not accept raw admin API keys through env vars or CLI arguments.

## Rotate Better Auth Secret

1. Schedule a maintenance window because active sessions and encrypted auth state can be invalidated.
2. Set a new Cloudflare secret for `BETTER_AUTH_SECRET`.
3. Deploy `core-id`.
4. Run remote smoke checks.
5. Notify admins that existing sessions may need sign-in.

## Rotate OAuth Client Secret

1. Authenticate as a platform admin or org owner/admin.
2. Call `POST /api/auth/oauth2/client/rotate-secret` with the client id.
3. Deliver the new secret through the operator-approved secret channel.
4. Update the downstream app.
5. Revoke the old client if compromise is suspected.

## Disable OAuth Client

1. Authenticate as an authorized admin.
2. Call `POST /api/auth/oauth2/update-client` with `{ "disabled": true }` in the update object.
3. New authorization and token requests fail.
4. Existing JWT access tokens remain valid until expiry; shorten TTL in a future incident policy if immediate cut-off is required.

## Disable Resource Server

1. Authenticate as a platform admin or org owner/admin.
2. Call `POST /api/auth/admin/resource-servers/:id/disable`.
3. The plugin writes `disabledAt` and `disabledBy`.
4. The KV audience cache is invalidated, so new token requests for that audience fail after the next provider construction.

## JWKS Incident

1. Stop new deployments.
2. Rotate `BETTER_AUTH_SECRET` only if auth state is also compromised.
3. Reduce JWKS grace period in config only with an explicit incident patch.
4. Do not cache JWKS in the core Worker; Better Auth rotates signing keys lazily when a token is signed after the rotation interval, so the JWKS route must be able to publish the new `kid` immediately.
5. Deploy `core-id`.
6. Ask resource servers to refresh JWKS cache.
7. Run a sign/verify smoke with `/api/auth/jwks`.

## D1 Migration Failure

1. Stop deployment before `deploy:core`.
2. Capture the Wrangler migration output.
3. Inspect `migrations/meta/_journal.json` and the failing SQL file.
4. Do not edit an already-applied remote migration in place.
5. Add a forward-only corrective migration.
6. Re-run `pnpm db:migrate:remote`, then deploy.
