# Cloudflare Deployment And Runbooks

## Deploy

Prerequisites:

- Cloudflare account and Worker/D1/KV resources exist.
- `BETTER_AUTH_SECRET`, `SENDER_API_TOKEN`, `EMAIL_FROM`, and any temporary bootstrap secrets are set as Cloudflare secrets.
- `ID_CORE_URL` and `ID_UI_URL` repository variables point at the deployed Workers.

Pipeline order:

1. `pnpm check`
2. `pnpm db:migrate:remote`
3. `pnpm deploy:core`
4. `pnpm deploy:ui`
5. `pnpm smoke:remote`

The GitHub Actions workflow in `.github/workflows/ci.yml` runs `pnpm check` on push/PR and deploy dry-runs. UI dry-run builds inside `workers/ui`, uses Vinext's generated `dist/server/wrangler.json`, then calls Wrangler deploy with `--dry-run`, matching the real `pnpm deploy:ui` path.

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

## Sender Transactional Email

1. Create a Sender account on the Free plan.
2. Add the sending domain and complete SPF, DKIM, and DMARC verification.
3. Create a transactional API token.
4. Store secrets:

```sh
pnpm wrangler secret put SENDER_API_TOKEN --config workers/core/wrangler.jsonc
pnpm wrangler secret put EMAIL_FROM --config workers/core/wrangler.jsonc
```

`EMAIL_FROM_NAME` is a non-secret Worker var. The Worker sends verification and password-reset emails through `POST https://api.sender.net/v2/message/send`. Sender failures are surfaced as operational errors with rate-limit metadata; raw auth URLs, tokens, and authorization headers are not logged by the adapter.

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
4. Deploy `core-id`.
5. Ask resource servers to refresh JWKS cache.
6. Run a sign/verify smoke with `/api/auth/jwks`.

## D1 Migration Failure

1. Stop deployment before `deploy:core`.
2. Capture the Wrangler migration output.
3. Inspect `migrations/meta/_journal.json` and the failing SQL file.
4. Do not edit an already-applied remote migration in place.
5. Add a forward-only corrective migration.
6. Re-run `pnpm db:migrate:remote`, then deploy.
