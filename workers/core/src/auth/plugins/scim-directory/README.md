# `id-scim-directory` Plugin

Read-only SCIM v2 directory plugin for Better Auth.

Exposes user, org-scoped user, tenant team, and virtual org-admin Group facts
as specified by [doc 017](../../../../../docs/017_scim-directory-and-m2m-principal-contract.md).

## Standards classification

| Layer | Classification |
|---|---|
| Wire protocol | RFC 7644 (SCIM v2 read/query subset) |
| Core schema | RFC 7643 (User, Group) |
| Tenant path `/tenants/{orgId}/...` | Repository-specific URL convention layered on SCIM core (not SCIM-native) |
| Authentication | OAuth 2.0 Bearer Token (accepted SCIM pattern; RFC 7644 §2) |
| `TenantMembership` extension | Repository-specific schema extension |

## Routes

```
GET /api/auth/scim/v2/ServiceProviderConfig     — no auth required
GET /api/auth/scim/v2/Schemas                   — no auth required
GET /api/auth/scim/v2/ResourceTypes             — no auth required

GET /api/auth/scim/v2/Users/:userId             — auth required
GET /api/auth/scim/v2/Users?filter=...          — auth required

GET /api/auth/scim/v2/tenants/:orgId/Users/:userId             — auth required
GET /api/auth/scim/v2/tenants/:orgId/Groups/:groupId           — auth required
GET /api/auth/scim/v2/tenants/:orgId/Groups?filter=...         — auth required

POST/PUT/PATCH/DELETE on any resource endpoint  — 405 Method Not Allowed
```

## Authentication

Callers must present an `id`-issued M2M bearer token:

```
Authorization: Bearer <token>
aud = <scimDirectoryAudience(baseUrl)>   (e.g. https://id.example/scim)
scope = identity:directory:read
```

## Special endpoints

### `GET /tenants/:orgId/Groups/org-admins`

Returns a virtual SCIM Group representing all Better Auth `owner` and `admin` members
of the organization. This group has no corresponding database row.

### `GET /tenants/:orgId/Groups?filter=id eq "org-admins" and members.value eq "userId"`

Efficient membership check. Returns the org-admins group (as a single-item ListResponse)
only if the referenced user is a current owner or admin. Returns an empty list otherwise.

## Banned users

Banned users are returned with `active: false` rather than `404`. This follows the SCIM spec
and lets consumers distinguish "principal does not exist" from "principal exists but is disabled."
`content-api` must treat `active: false` as a validation failure equivalent to `404`.

## Unsupported

Full SCIM provisioning (`POST`, `PUT`, `PATCH`, `DELETE`, `/Bulk`) is explicitly not supported
and returns `405 Method Not Allowed` per [doc 017 §5.3](../../../../../docs/017_scim-directory-and-m2m-principal-contract.md#53-p17-d3---keep-full-scim-provisioning-out-of-scope).

## Migration relationship

This plugin is the standards-based replacement for the user/team/admin branches of
`id-principal-validation`. That plugin is a temporary compatibility surface; its
service-account endpoint was removed in doc 018. See doc 017 §5.6 and §13 for the
deprecation and deletion schedule.
