# `id-oauth-client-picker` plugin

Read-only M2M wrapper around `oauthClient` rows. Doc 018 §5.3 D3 keeps Better
Auth's RFC 7592-shaped `/oauth2/get-client` as the canonical client metadata
shape; this plugin exposes the same data over an M2M-token-authenticated path
(`GET /api/auth/admin/oauth-clients/lookup`) so `content-api` and other resource
servers can read a client by `client_id` without a user session.

## Caller contract

The caller must present a Bearer token that:

- is signed by `id`'s JWKS,
- carries `aud = systemResourceServerAudience(id-base-url)` (the id-system
  resource server with `organizationId IS NULL`),
- carries `scope` including `oauth:clients:read`
  (`authPluginConfig.systemOAuthClientPickerScope`).

The picker returns RFC 7591-shaped public fields only. `client_secret` is never
returned. When the caller passes `?org_id=...`, a `referenceId` mismatch returns
`404` (doc 018 §9 cross-org leak prevention).

## Deployment

Provisioning the system audience and the infrastructure M2M client that consumes
this endpoint is a platform-admin task:

1. Create a resource server with `organizationId = NULL`, `slug = "id-system"`,
   `audience = systemResourceServerAudience(BETTER_AUTH_URL)`.
2. Declare `oauth:clients:read` (and any other system scopes, e.g. `scim:read`)
   on it via `POST /api/auth/admin/oauth-scopes`.
3. Create the infrastructure M2M client (`referenceId = NULL`,
   `grant_types = ["client_credentials"]`).
4. Attach a `oauthClientResourceScope` row for the infra client → system
   resource server. (D7 invariants block any tenant client from attaching here.)
5. Store the infra client's `client_secret` in the consumer's secret bindings.
