# `id-scim-directory` Plugin

> **Purpose**: Lets resource servers validate user, team, and admin references
> at write time using a standards-based protocol. `content-api` calls this when
> creating a policy binding or bootstrapping an org admin — instead of relying
> on short-lived JWT claims which may be stale by the time a durable write
> commits.

Read-only SCIM v2 directory plugin for Better Auth.
Exposes user, org-scoped user, tenant team, and virtual org-admin Group facts
as specified by [doc 017](../../../../../docs/017_scim-directory-and-m2m-principal-contract.md).

## Setup

The plugin is registered in `get-auth.ts`. A SCIM M2M client must be provisioned
before resource servers can call the endpoints:

1. Complete first-admin bootstrap. The system access seed creates the shared `/system` resource server (`audience = systemResourceServerAudience(BETTER_AUTH_URL)`, e.g. `https://id.example/system`) and declares `identity:directory:read` plus `oauth:clients:read`.
2. Create an infrastructure M2M client (`referenceId IS NULL`, `grant_types = ["client_credentials"]`) for the directory channel. This client is per deployment and its id/secret must not be hard-coded.
3. Attach an `oauthClientResourceScope` row linking the infra client to the seeded `/system` resource server, with `allowedScopes = ["identity:directory:read"]` or `["identity:directory:read", "oauth:clients:read"]` when the same directory bearer token also calls the OAuth client-picker.
4. Store the infra client's `client_secret` in consumer secret bindings and issue tokens with `aud = systemResourceServerAudience(...)` + `scope = identity:directory:read` before SCIM calls.
5. Keep this directory-channel credential separate from RFC 7662 introspection credentials. Introspection uses client authentication against `/api/auth/oauth2/introspect`; it is not authorized by a SCIM bearer token.

## Usage

### Obtain a SCIM token

```http
POST /api/auth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=<infra-client-id>
&client_secret=<infra-client-secret>
&resource=https://id.example/system
&scope=identity:directory:read
```

### Look up a user by ID

```http
GET /api/auth/scim/v2/Users/user_123
Authorization: Bearer <scim-token>
Accept: application/scim+json
```

Response (200):

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "user_123",
  "userName": "user_123",
  "active": true,
  "meta": { "resourceType": "User", "location": "https://id.example/api/auth/scim/v2/Users/user_123" }
}
```

### Check org membership

```http
GET /api/auth/scim/v2/tenants/org_content/Users/user_123
Authorization: Bearer <scim-token>
```

Returns 200 with tenant-membership extension when the user is an active member.
Returns 404 when the user is absent, not in the org, or banned.

### Check org administrator membership

```http
GET /api/auth/scim/v2/tenants/org_content/Groups/org-admins
Authorization: Bearer <scim-token>
```

Returns the virtual org-admins group with all owner/admin members.

Membership-only check (one user):

```http
GET /api/auth/scim/v2/tenants/org_content/Groups?filter=id eq "org-admins" and members.value eq "user_123"
Authorization: Bearer <scim-token>
```

Returns single-item ListResponse if the user is an admin, empty list otherwise.

### Look up a team/group

```http
GET /api/auth/scim/v2/tenants/org_content/Groups/team_editorial
Authorization: Bearer <scim-token>
```

Returns 404 when the team belongs to a different org or does not exist.

### Filter users

```http
GET /api/auth/scim/v2/Users?filter=id eq "user_123"
Authorization: Bearer <scim-token>
```

Also accepts `userName eq` (currently equivalent to `id eq`; both map to the user `id` column per the privacy rule in `resources.ts`).

## Standards classification

| Layer | Classification |
|---|---|
| Wire protocol | RFC 7644 (SCIM v2 read/query subset) |
| Core schema | RFC 7643 (User, Group) |
| Tenant path `/tenants/{orgId}/...` | Repository-specific URL convention layered on SCIM core (not SCIM-native) |
| Authentication | OAuth 2.0 Bearer Token (accepted SCIM pattern; RFC 7644 §2) |
| `TenantMembership` extension | Repository-specific schema extension |

## All routes

```
GET  /api/auth/scim/v2/ServiceProviderConfig        — discovery, no auth
GET  /api/auth/scim/v2/Schemas                      — discovery, no auth
GET  /api/auth/scim/v2/ResourceTypes                — discovery, no auth
GET  /api/auth/scim/v2/Users/:userId                — global user lookup
GET  /api/auth/scim/v2/Users?filter=id eq "..."     — filtered user query
GET  /api/auth/scim/v2/Users?filter=userName eq "..." — filtered user query
GET  /api/auth/scim/v2/tenants/:orgId/Users/:userId — org-scoped user (404 if not a member)
GET  /api/auth/scim/v2/tenants/:orgId/Groups/:gid   — team or virtual org-admins group
GET  /api/auth/scim/v2/tenants/:orgId/Groups?filter=... — filtered group query
POST /api/auth/scim/v2/Bulk                         — 405 (bulk not supported)
*    /api/auth/scim/v2/Users                        — POST/PUT/PATCH/DELETE → 405
*    /api/auth/scim/v2/tenants/:orgId/Users         — POST/PUT/PATCH/DELETE → 405
*    /api/auth/scim/v2/tenants/:orgId/Groups/:gid   — POST/PUT/PATCH/DELETE → 405
```

All resource endpoints (non-discovery) require a M2M bearer token with
`aud = systemResourceServerAudience(baseUrl)` and `scope = identity:directory:read`.

## Banned users

Banned users return `active: false` (200), not 404. Consumers must treat
`active: false` as a validation failure equivalent to "not found".
