# `id-oauth-scope-catalog` Plugin

> **Purpose**: Lets admins define which OAuth scopes exist and which M2M clients
> are allowed to request them. Without a scope catalog, token issuance cannot
> validate that a client is authorized for the product scopes it asks for.

OAuth scope catalog plugin for Better Auth. Owns resource-server-bound OAuth scope rows,
layer-matched M2M client resource-scope rows (`oauthClientResourceScope`), and runtime
scope/grant preload helpers.

## Setup

Registered in `get-auth.ts`. The runtime OAuth Provider preloads enabled `oauthResourceScope` rows into Better Auth's supported scope vocabulary and reads `oauthClientResourceScope` rows at token issuance to decide which service account may request which scopes for a resource audience. This plugin is therefore both the permission catalog and the tier classifier: resource servers with `organizationId = null` are system-tier resources, and organization-owned resource servers are tenant-tier resources.

Fresh deployments do not manually prefill the system catalog. First-admin bootstrap runs the system access seed and ensures the `/system` resource server plus `identity:directory:read` and `oauth:clients:read` scope rows from `authPluginConfig`. Operators still provision per-deployment infra service-account clients and bindings after bootstrap; those client ids and secrets are never seeded or hard-coded.

## Usage

All endpoints require an authenticated admin session (cookie).

### Scopes

```
POST   /api/auth/admin/oauth-scopes          — create a scope on a resource server
GET    /api/auth/admin/oauth-scopes          — list scopes
PUT    /api/auth/admin/oauth-scopes/:id      — update a scope
DELETE /api/auth/admin/oauth-scopes/:id      — delete a scope
```

Create body:

```json
{ "resourceServerId": "rs_123", "scope": "content:write" }
```

The `(resourceServerId, scope)` pair is unique. Scope changes invalidate the runtime
scope cache.

### Client resource scopes (doc 018 D2)

```
POST   /api/auth/admin/oauth-client-resource-scopes          — attach client to resource
GET    /api/auth/admin/oauth-client-resource-scopes           — list client-scope rows
PUT    /api/auth/admin/oauth-client-resource-scopes/:id      — update allowed scopes
DELETE /api/auth/admin/oauth-client-resource-scopes/:id      — disconnect client from resource
```

Create body:

```json
{
  "clientId": "client_456",
  "resourceServerId": "rs_123",
  "allowedScopes": ["content:write", "content:read"]
}
```

The `(clientId, resourceServerId)` pair is unique. A client with no enabled
`oauthClientResourceScope` row cannot obtain tokens with product scopes
(D2 token-issuance enforcement).

## Rules

Tenant clients (`referenceId IS NOT NULL`) may only bind to resource servers in their
`referenceId` organization. Infrastructure clients (`referenceId IS NULL`) may only bind
to system resource servers (`organizationId IS NULL`) — doc 018 D7.

Scopes stay coarse. A scope row describes an audience-level capability such as `content:read`, `identity:directory:read`, or `oauth:clients:read`; it must not encode object ids, tenant data, or resource-server policy decisions. Resource servers decide object-level authorization after token verification.
