# Account Center Plugin

> **Purpose**: Provides safe current-user account projections for the hosted `/account` UI. Browser users can review their own sessions, connected applications, and organizations without receiving bearer session tokens, OAuth token values, client secrets, or cross-user data.

## Setup

No separate setup is required. The plugin is registered by `get-auth.ts` and owns no tables or migrations. It reads Better Auth-owned rows through the adapter and exposes only session-required current-user endpoints.

## Usage

```http
GET /api/auth/account/summary
Cookie: id-auth.session_token=...
Accept: application/json
```

```json
{
  "user": { "id": "usr_123", "email": "person@example.test", "emailVerified": true, "name": "Person Example", "image": null },
  "security": { "passwordEnabled": true, "mfaEnabled": false, "emailVerificationRequired": true },
  "counts": { "organizations": 2, "activeSessions": 3, "connectedApplications": 4 }
}
```

```http
GET /api/auth/account/sessions
Cookie: id-auth.session_token=...
Accept: application/json
```

Session responses include ids and display metadata only. The session token is intentionally never serialized.

```http
POST /api/auth/account/sessions/revoke
Cookie: id-auth.session_token=...
Content-Type: application/json
Accept: application/json

{ "sessionId": "sess_123" }
```

```http
GET /api/auth/account/consents
Cookie: id-auth.session_token=...
Accept: application/json
```

Consent revocation is current-user and client-scoped:

```http
POST /api/auth/account/consents/revoke
Cookie: id-auth.session_token=...
Content-Type: application/json
Accept: application/json

{ "clientId": "client_content" }
```

```http
GET /api/auth/account/organizations
Cookie: id-auth.session_token=...
Accept: application/json
```

Organization rows include membership role, teams, and authorization-backed Console links when the user can operate that organization.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/account/summary` | Account overview projection |
| `GET` | `/account/sessions` | Safe current-user session list |
| `POST` | `/account/sessions/revoke` | Revoke one current-user session by id |
| `POST` | `/account/sessions/revoke-others` | Revoke other current-user sessions |
| `POST` | `/account/sessions/revoke-all` | Revoke all current-user sessions |
| `GET` | `/account/consents` | Current-user OAuth consent list |
| `POST` | `/account/consents/revoke` | Revoke current-user consent for one client |
| `GET` | `/account/organizations` | Current-user organization and Console-link list |

## Technical Detail

This is a behavior/projection plugin with no schema. `schema.ts` owns response and request shapes plus OpenAPI metadata. `operations.ts` owns timestamp normalization, token-stripping presenters, membership/team aggregation, and current-user organization projection. `index.ts` keeps endpoint handlers thin: require session, call helper reads, and return JSON.

Session revocation accepts a session id from the browser, resolves the stored session token inside the auth worker, then deletes it through Better Auth's internal session adapter. Consent revocation deletes rows by `{ clientId, userId: currentUserId }`, so a user cannot revoke another user's grant even if they know a client id.

