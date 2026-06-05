# id-admin-audit

> **Purpose**: Gives platform admins read-only, paginated visibility into
> Better-Auth-owned operational data that has no per-resource admin endpoint —
> every active browser session, every issued OAuth access/refresh token, every
> OAuth consent grant, and the signing-key (JWKS) metadata. The admin UI's
> Sessions & Tokens, Consents, and the dated/status JWKS views read from here;
> without it those screens can only show a "Coming Soon" placeholder. It also
> lets an admin revoke a single consent grant so a user is re-prompted on the
> next authorization request, revoke one browser session by id without exposing
> the session token to browser UI, and emergency-rotate JWKS through Better
> Auth's JWT key-generation path.

This plugin owns **no tables**. It reads tables owned by Better Auth core
(`session`), the OAuth provider (`oauthAccessToken`, `oauthRefreshToken`,
`oauthConsent`, `oauthClient`), and the JWT plugin (`jwks`), and enriches
display fields (`user`) — all exclusively through the Better Auth adapter, never
raw Drizzle and never a SQL join. See `docs/026` for the full rationale.

## Setup

No provisioning. Registered in `get-auth.ts` and available immediately after an authorized console session signs in. Sessions, token audit, JWKS reads, and JWKS rotation remain platform-admin only. Consent list/revoke also supports an organization lens: when `organizationId` is supplied, the auth worker authorizes the actor for that organization and bounds rows to OAuth clients whose `referenceId` equals that organization id.

## Usage

All paths are under the `/api/auth` base. Authenticate with a platform-admin
session cookie.

List sessions (paginated; optionally filter with `userId`; `userEmail` enriched
by batched lookup; session tokens are never returned):

```
GET /api/auth/admin/list-sessions?limit=25&offset=0&userId=user_1
→ { "sessions": [ { "id": "...", "userId": "user_1",
      "userEmail": "a@b.com", "ipAddress": "1.2.3.4", "userAgent": "...",
      "activeOrganizationId": "org_1", "activeTeamId": null,
      "impersonatedBy": null, "createdAt": 1736900000000,
      "expiresAt": 1736986400000 } ], "total": 47, "limit": 25, "offset": 0 }
```

Revoke one browser session:

```
POST /api/auth/admin/revoke-session
Content-Type: application/json
{ "sessionId": "sess_123" }
→ { "success": true }
```

Never route browser UI through Better Auth's `/admin/revoke-user-session` for
single-row revocation. That route accepts a live session token; this plugin
resolves the token inside the auth worker from the row id and then deletes it.

List tokens (token **values are never returned** — only an 8-char prefix):

```
GET /api/auth/admin/list-tokens?type=access&limit=25&offset=0
→ { "tokens": [ { "id": "...", "tokenPrefix": "a1b2c3d4…", "type": "access",
      "clientId": "cli_x", "clientName": "Content API", "userId": "user_1",
      "userEmail": "a@b.com", "scopes": ["content:read"],
      "expiresAt": 1736900900000, "createdAt": 1736900000000 } ],
    "total": 31, "limit": 25, "offset": 0 }
```

`type` accepts `access` (default) or `refresh`.

List consents (optionally filtered by client; platform-wide by default):

```
GET /api/auth/admin/list-consents?clientId=cli_x&limit=25&offset=0
→ { "consents": [ { "id": "...", "clientId": "cli_x", "clientName": "Content API",
      "userId": "user_1", "userEmail": "a@b.com", "scopes": ["openid","profile"],
      "createdAt": 1736900000000, "updatedAt": 1736900000000 } ],
    "total": 42, "limit": 25, "offset": 0 }
```

Organization-scoped consent reads add `organizationId`; the endpoint first finds clients where `oauthClient.referenceId == organizationId`, then reads only matching consent rows. An explicit cross-org `clientId` returns an empty page rather than leaking ownership.

```
GET /api/auth/admin/list-consents?organizationId=org_1&clientId=cli_x&limit=25&offset=0
```

Revoke a consent grant (forces re-consent on next authorization):

```
POST /api/auth/admin/revoke-consent
Content-Type: application/json
{ "clientId": "cli_x", "userId": "user_1" }
→ { "success": true }
```

Organization-scoped revoke includes `organizationId`. The plugin verifies the client belongs to that organization before deleting the grant and returns `404` for cross-org client ids.

```
POST /api/auth/admin/revoke-consent
Content-Type: application/json
{ "organizationId": "org_1", "clientId": "cli_x", "userId": "user_1" }
→ { "success": true }
```

JWKS key metadata (public material + timestamps + status; **private key never
returned**):

```
GET /api/auth/admin/jwks
→ { "keys": [ { "id": "abc123", "alg": "EdDSA", "createdAt": 1736900000000,
      "expiresAt": 1739492000000, "status": "active",
      "publicJwk": { "kty": "OKP", "crv": "Ed25519", "x": "…", "kid": "abc123" } } ] }
```

`status` is derived from `expiresAt` and the configured grace window:
`active` (not expired), `rotated` (expired but inside the grace window), or
`expired`.

Emergency rotate signing keys (reason is required; prior keys remain published
for the configured grace window and `admin-activity-log` records the operator
action):

```
POST /api/auth/admin/jwks/rotate
Content-Type: application/json
{ "reason": "compromise response drill" }
→ { "id": "newkid", "alg": "EdDSA", "createdAt": 1736900000000,
    "expiresAt": 1739492000000, "status": "active",
    "publicJwk": { "kty": "OKP", "crv": "Ed25519", "x": "…", "kid": "newkid" },
    "reason": "compromise response drill" }
```

## Routes

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/list-sessions` | Paginated; `limit` (≤100, default 25), `offset`, optional `userId`; strips session token |
| `POST` | `/admin/revoke-session` | Body `{ sessionId }`; resolves token server-side |
| `GET` | `/admin/list-tokens` | Paginated; `type=access\|refresh`; strips token value |
| `GET` | `/admin/list-consents` | Paginated; optional `clientId` and `organizationId` filters; org reads are bounded to org-owned clients |
| `POST` | `/admin/revoke-consent` | Body `{ clientId, userId, organizationId? }`; org revoke verifies client ownership |
| `GET` | `/admin/jwks` | Strips `privateKey`; derives status |
| `POST` | `/admin/jwks/rotate` | Emergency rotate via Better Auth JWT key generation; public material only |

All return `401` without a session and `403` when the actor lacks the requested platform or organization authority.

## Technical detail

- **File roles.** `index.ts` is the Better Auth contract surface (endpoint
  declarations + adapter reads + batched enrichment + guarded emergency rotate).
  `schema.ts` holds the raw row reads, the presented response shapes, the
  revoke-consent and rotate bodies, and precomputed OpenAPI fragments.
  `operations.ts` holds the pure, unit-testable
  transforms (timestamp normalization, page-param clamping, token-prefixing,
  JWK status derivation, secret-stripping presenters). `types.ts` holds the
  injected options and the minimal adapter surface.
- **Pagination correctness.** `total` comes from `adapter.count` over the same
  predicate as the page query, so totals stay correct. `list-users` (BA admin
  plugin) already exercises this `count`/`limit`/`offset` path against D1, so
  the capability is proven, not speculative.
- **No joins.** Display fields (`userEmail`, `clientName`) are enriched by one
  batched `findMany({ where:[{ field, operator:"in", value: ids }] })` per
  referenced model and zipped in memory. Joined-field *search* (e.g. by email)
  is intentionally deferred (`docs/026` §4.3).
- **Consent scoping.** Org consent reads never scan all users. They first resolve the bounded client set from `oauthClient.referenceId` and then query `oauthConsent` by `clientId in (...)`; revoke validates the client ownership tuple before deleting.
- **Present and strip.** `presentSession` returns the row id but never the
  Better Auth session token; `presentToken` returns only `tokenPrefix`, never the
  token; `presentJwk` never reads or returns `privateKey`. The revoke-session
  endpoint resolves the session token server-side at delete time. These
  constraints are asserted by tests.
- **Config.** Page sizes, the token-prefix length, and the JWKS grace window are
  named constants in `auth/config.ts`; the grace window is injected from
  `get-auth.ts` so key-status thresholds are never hard-coded in the plugin.
