# `id-oauth-client-picker` plugin

> **Purpose**: Lets resource servers look up OAuth client metadata without a user
> session. `content-api` uses this to show which service accounts are available
> when an admin creates a policy binding — without the admin needing to hold any
> client secrets.

Read-only M2M wrapper around `oauthClient` rows and their id-owned OAuth
resource eligibility. Doc 018 §5.3 D3 keeps Better Auth's RFC 7592-shaped
`/oauth2/get-client` as the canonical client metadata shape; this plugin
exposes the same data over an M2M-token-authenticated path
(`GET /api/auth/admin/oauth-clients/lookup`) so `content-api` and other resource
servers can read a client by `client_id` without a user session.

## Caller contract

The caller must present a Bearer token that:

- is signed by `id`'s JWKS,
- carries `aud = systemResourceServerAudience(id-base-url)` (the id-system
  resource server with `organizationId IS NULL`),
- carries `scope` including `oauth:clients:read`
  (`authPluginConfig.systemOAuthClientPickerScope`).

The picker requires both `?client_id=...` and `?org_id=...`. It returns RFC
7591-shaped public fields only, and `client_secret` is never returned. A
`referenceId` mismatch, including an attempt to inspect a system-layer client,
returns `404` (doc 018 §9 cross-org leak prevention).

When `?resource=<audience>` is supplied, the response also returns advisory
`resource_access: { resource, status }`, where status is:

- `enabled` when this tenant client has an enabled `oauthClientResourceScope`
  row for an enabled resource server registered under `org_id`;
- `disabled` when that id-owned attachment or resource-server registration is
  disabled;
- `missing` when there is no eligible attachment, or when the resource is
  absent or outside the requested tenant layer.

This is a repository-specific operational read for picker display and
reconciliation. It reports only OAuth issuance eligibility owned by `id`; it
does not approve a Content IAM binding, role, denial, or resource policy.

## Usage

```http
GET /api/auth/admin/oauth-clients/lookup?client_id=c_abc123&org_id=org_content
Authorization: Bearer <system-M2M-token>
```

Response (200):

```json
{
  "client_id": "c_abc123",
  "client_name": "content-api writer",
  "grant_types": ["client_credentials"],
  "token_endpoint_auth_method": "client_secret_post",
  "reference_id": "org_content",
  "resource_access": { "resource": "https://api.example.test", "status": "enabled" }
}
```

Returns 404 when `client_id` does not exist, `referenceId` does not match
`org_id`, or the client has no eligible attachment.

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
