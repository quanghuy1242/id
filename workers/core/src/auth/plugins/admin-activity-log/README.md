> **Purpose**: Records who changed admin-managed identity, OAuth, resource-server, scope, and organization/team resources so the admin UI can show an Audit tab on each entity without exposing secrets or token bodies.

## Setup

The plugin is registered by `get-auth.ts` and owns the `adminActivityLog` Better Auth model. After schema changes, run `pnpm db:generate`; do not hand-write activity-log migrations.

## Usage

List activity for one target:

```http
GET /api/auth/admin/activity-log?targetType=oauth_client&targetId=cli_content&limit=25&offset=0
Accept: application/json
Cookie: id-auth.session_token=...
```

Response:

```json
{
  "entries": [
    {
      "id": "log_123",
      "actorId": "user_123",
      "actorType": "user",
      "actorEmail": "admin@example.test",
      "action": "oauth_client.update",
      "targetType": "oauth_client",
      "targetId": "cli_content",
      "scope": "organization",
      "organizationId": "org_1",
      "actorPlatformRole": null,
      "actorOrganizationRole": "owner",
      "steppedUp": false,
      "summary": "Updated OAuth client cli_content: scope",
      "details": {
        "path": "/oauth2/update-client",
        "clientId": "cli_content",
        "changedFields": ["scope"]
      },
      "before": null,
      "after": { "scope": "openid profile" },
      "metadata": { "path": "/oauth2/update-client" },
      "createdAt": 1800000000000
    }
  ],
  "total": 1,
  "limit": 25,
  "offset": 0
}
```

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/activity-log` | Platform or org activity read with filters: `organizationId`, `targetType`, `targetId`, `action`, `actorId`, `limit`, `offset` |

## Technical Detail

The plugin is append-only from the UI perspective: no update or delete endpoints exist. Mutation logging is attached as Better Auth `hooks.after` handlers for stock Better Auth admin/organization/OAuth endpoints and custom plugin endpoints. Payloads pass through `stripActivitySecrets` before persistence, removing OAuth client secrets, tokens, JWKS private keys, passwords, and verification values recursively. New activity rows carry a semantic `summary` plus structured `details` so the UI can answer what happened without reducing the event to an endpoint path; old rows may have `null` for those columns and still expose `before`, `after`, and `metadata`. Activity rows also carry the 028 audit context fields: platform vs organization scope, `organizationId`, actor platform role, actor organization role, and whether the actor had fresh platform step-up at write time. Platform admins can read all rows; org owners/admins can read only rows for their organization.
