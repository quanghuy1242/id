# OAuth Client Admin Plugin

> **Purpose**: Lets the admin UI search OAuth clients with pagination for picker/typeahead flows. Registration policy dialogs use this to resolve and select clients without fetching the full OAuth client catalog or exposing client secrets.

## Setup

The plugin is registered in `get-auth.ts`. It owns no database table and reads the Better Auth OAuth Provider `oauthClient` model through the Better Auth adapter.

## Usage

All calls require an authenticated admin session.

```http
GET /api/auth/admin/oauth-clients?q=content&limit=20&offset=0
GET /api/auth/admin/oauth-clients?organizationId=org_content&q=web&limit=20
GET /api/auth/admin/oauth-clients?organizationId=org_content&ids=cli_web,cli_docs
```

Response:

```json
{
  "items": [
    {
      "client_id": "cli_web",
      "client_name": "Content Web",
      "type": "web",
      "grant_types": ["authorization_code"],
      "response_types": ["code"],
      "redirect_uris": ["https://content.example.test/callback"],
      "scope": "openid profile email",
      "token_endpoint_auth_method": "client_secret_basic",
      "reference_id": "org_content",
      "disabled": false,
      "created_at": 1700000000000
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

`client_secret` is never returned. The `ids` hydration path omits pagination metadata and returns only rows visible in the requested scope.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/admin/oauth-clients` | Session-authenticated paginated OAuth client list/search |

## Technical Detail

The endpoint authorizes the requested scope once, then applies scope as a query filter: organization requests add `referenceId == organizationId`; platform requests have no `referenceId` filter and are platform-admin gated. Query and secret stripping are shared through `oauth-client-common.ts` with the M2M `oauth-client-picker` lookup, while the two endpoints keep separate auth gates.
