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
| `GET` | `/admin/activity-log` | Platform-admin activity read with filters: `targetType`, `targetId`, `action`, `actorId`, `limit`, `offset` |

## Technical Detail

The plugin is append-only from the UI perspective: no update or delete endpoints exist. Mutation logging is attached as Better Auth `hooks.after` handlers for stock Better Auth admin/organization/OAuth endpoints and custom plugin endpoints. Payloads pass through `stripActivitySecrets` before persistence, removing OAuth client secrets, tokens, JWKS private keys, passwords, and verification values recursively.
