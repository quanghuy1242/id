# Admin API Reference

The first batch exposes management operations through `core-id`. Full admin CRUD pages remain deferred; these endpoints are the UI-ready API surface.

## Auth

Admin callers authenticate with Better Auth session cookies. Core admin routes call `requireActor(c)` and apply the Phase 4 policy. Better Auth plugin endpoints use `sessionMiddleware` and the same platform/org role checks.

Platform `superadmin` and `admin` can manage cross-org resources. Organization `owner` and `admin` can manage resources scoped to their organization. Members and unauthenticated requests receive `403` or `401`.

## Dashboard

`GET /api/admin/dashboard`

Returns aggregate counts:

```json
{
  "users": 1,
  "organizations": 1,
  "oauthClients": 1,
  "resourceServers": 1
}
```

## Resource Servers

Resource-server management is implemented as a Better Auth plugin schema and endpoint set. Public paths are mounted under `/api/auth`.

- `POST /api/auth/admin/resource-servers`
- `GET /api/auth/admin/resource-servers`
- `GET /api/auth/admin/resource-servers/:id`
- `PATCH /api/auth/admin/resource-servers/:id`
- `DELETE /api/auth/admin/resource-servers/:id`
- `POST /api/auth/admin/resource-servers/:id/disable`

Create body:

```json
{
  "organizationId": "org_1",
  "slug": "api",
  "name": "Public API",
  "audience": "https://api.example.com",
  "description": "Primary API"
}
```

Create/update/disable mutations write audit fields (`createdBy`, `updatedBy`, `disabledBy`, `disabledAt`) and invalidate the KV audience cache.

## OAuth Clients

OAuth clients are Better Auth OAuth Provider clients. The installed `@better-auth/oauth-provider@1.6.11` exposes session-backed client management endpoints:

- `POST /api/auth/oauth2/create-client`
- `GET /api/auth/oauth2/get-client?client_id=...`
- `GET /api/auth/oauth2/get-clients`
- `POST /api/auth/oauth2/update-client`
- `POST /api/auth/oauth2/delete-client`
- `POST /api/auth/oauth2/client/rotate-secret`

Confidential client create body:

```json
{
  "client_name": "Server app",
  "redirect_uris": ["https://app.example.com/callback"],
  "token_endpoint_auth_method": "client_secret_post",
  "grant_types": ["authorization_code", "refresh_token", "client_credentials"],
  "response_types": ["code"],
  "scope": "openid profile email offline_access api:read"
}
```

Public client create body:

```json
{
  "client_name": "SPA",
  "redirect_uris": ["https://spa.example.com/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "type": "user-agent-based",
  "scope": "openid profile email offline_access api:read"
}
```

## Organizations And Users

Organizations and user management are provided by Better Auth plugins:

- `POST /api/auth/organization/create`
- `POST /api/auth/organization/invite-member`
- `POST /api/auth/organization/accept-invitation`
- Better Auth admin plugin user-management endpoints under `/api/auth/admin/*`

The first batch tests sign-up, verification-link storage, sign-in, sign-out, session read, organization creation, admin authorization, and OAuth/resource-server management.

## Consents

Consent operations are Better Auth OAuth Provider endpoints:

- `GET /api/auth/oauth2/get-consent?id=...`
- `GET /api/auth/oauth2/get-consents`
- `POST /api/auth/oauth2/update-consent`
- `POST /api/auth/oauth2/delete-consent`

