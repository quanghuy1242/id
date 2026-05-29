# `id-resource-server` Plugin

> **Purpose**: Lets admins register downstream APIs as OAuth resource servers.
> Without a resource server, an API's audience is not recognized by the token
> endpoint and no M2M client can obtain a token for it.

Better Auth plugin for admin-managed OAuth resource-server audiences.

## Setup

The plugin is registered in `get-auth.ts`. No separate provisioning is required;
a bootstrap organization admin creates resource servers through the admin API.

## Usage

All endpoints require an authenticated admin session cookie or
`Authorization: Bearer` with platform-admin scope.

```
POST   /api/auth/admin/resource-servers          — create a resource server
GET    /api/auth/admin/resource-servers          — list resource servers (by org)
GET    /api/auth/admin/resource-servers/:id      — get a single resource server
PATCH  /api/auth/admin/resource-servers/:id      — update name, slug, audience, or description
POST   /api/auth/admin/resource-servers/:id/disable — disable (revokes associated tokens)
POST   /api/auth/admin/resource-servers/:id/enable  — re-enable
```

Create body:

```json
{
  "organizationId": "org_123",
  "slug": "my-api",
  "name": "My API",
  "audience": "https://api.example.test"
}
```

Setting `organizationId: null` creates a system resource server (platform-admin only, D7).
Audience changes are rejected if the new audience would collide with an existing one.
Disabling a resource server invalidates the runtime audience cache; tokens issued against
that audience during the stale-authority window still verify locally (see doc 013 D1).

## Internal architecture

This plugin owns the `resourceServer` Better Auth model. It is intentionally kept
inside the `auth/` boundary because the table is a Better Auth plugin schema, not
a standalone Drizzle/domain entity.

### File responsibilities

- `schema.ts` — canonical Zod row schema, request bodies, BA field map, OpenAPI fragments.
- `index.ts` — plugin schema registration and explicit CRUD/status endpoints.
- `audiences.ts` — pre-auth OAuth audience runtime: per-isolate memory cache, KV cache, D1 fallback, invalidation.
- `operations.ts` — authorization wrappers, uniqueness checks, payload builders.
- `types.ts` — plugin options and runtime hooks injected from `get-auth.ts`.
