# OAuth2/OIDC Integration Guide

`id` is served by `core-id`. With the current Better Auth base path, the issuer used in JWTs is:

```text
https://<core-host>/api/auth
```

## Metadata

Use the well-known metadata routes before configuring an app:

- `GET /.well-known/oauth-authorization-server/api/auth`
- `GET /.well-known/openid-configuration/api/auth`
- `GET /api/auth/jwks`

The root well-known OAuth metadata route is an alias to Better Auth's base-path metadata route so OAuth clients can discover the issuer correctly. Discovery metadata advertises `/api/auth/jwks` as `jwks_uri`; clients should follow metadata instead of assuming a well-known JWKS filename.

## Authorization Code With PKCE

1. Create a public or confidential client through `/api/auth/oauth2/create-client`. For trusted first-party browser clients, set `skip_consent: true` through the Better Auth server/admin OAuth client creation path; do not hard-code trusted clients in source.
2. Generate a PKCE verifier and S256 challenge.
3. Redirect the user to `/api/auth/oauth2/authorize` with:

```text
response_type=code
client_id=<client-id>
redirect_uri=<registered-redirect-uri>
scope=openid profile email offline_access content:read
code_challenge=<s256-challenge>
code_challenge_method=S256
resource=https://api.example.com
state=<csrf-state>
```

4. The user is redirected to `/login`, signs in, selects workspace or direct-share authorization context through the OAuth post-login flow, completes `/consent` unless the client is trusted, and returns to the redirect URI with `code` and `state`.
5. Exchange the code at `/api/auth/oauth2/token` using `grant_type=authorization_code`, the `code_verifier`, the same `redirect_uri`, the requested `resource`, and confidential-client credentials when applicable.

When `resource` is present and matches an enabled resource server audience, the access token is JWKS-verifiable. Without `resource`, callers must treat the token as opaque and validate through the authorization server.

Production browser OAuth uses `id.quanghuy.dev` and `content.quanghuy.dev` with Better Auth cookies scoped to `.quanghuy.dev` and prefixed with `id-auth`. Preview `*.workers.dev` deployments are API-only; do not register preview callback URLs for browser clients.

## Client Credentials

Machine-to-machine clients use:

```text
POST /api/auth/oauth2/token
content-type: application/x-www-form-urlencoded

grant_type=client_credentials
client_id=<client-id>
client_secret=<client-secret>
scope=content:read
resource=https://api.example.com
```

M2M tokens do not contain user context. Tests assert that the M2M JWT has an audience, scope, and stable client `azp`, but no user `sub`. Org-scoped M2M tokens additionally require an `oauthClientOrganizationGrant`. M2M clients that need org-scoped tokens must set `metadata.id_client_id` to their OAuth client ID and `metadata.organization_id` to the target organization; Better Auth passes OAuth client metadata into `customAccessTokenClaims`, which lets `id` validate the grant before token signing and emit `client_id` plus `org_id`.

## Refresh, Introspection, And Revocation

Refresh tokens are enabled through the OAuth Provider `refresh_token` grant. Use:

- `POST /api/auth/oauth2/token` with `grant_type=refresh_token`
- `POST /api/auth/oauth2/introspect`
- `POST /api/auth/oauth2/revoke`

Revocation and introspection are provided by Better Auth OAuth Provider and covered by the route contract tests. Replay behavior and incident handling are documented in the runbook.

Configured lifetimes:

- user authorization-code access tokens: 15 minutes (`expires_in = 900`);
- M2M access tokens: 3 hours;
- refresh tokens: 7 days.

Request `offline_access` when a browser client needs a refresh token. Better Auth 1.6.11 rotates refresh tokens on refresh; tests assert that replaying the old refresh token is rejected.

## Prompt Handling

The installed OAuth Provider supports:

- `signup.page` for `prompt=create`
- `selectAccount.page` for `prompt=select_account`
- `postLogin.page` for organization selection before consent

The first-batch configuration enables `loginPage`, `consentPage`, and the post-login authorization-context hook. Full hosted browser pages for context selection can be expanded later; the API/token contract already distinguishes workspace from direct-share context.
