# Admin UI — API Gaps

> Endpoints the admin UI specs require but don't exist yet in the core worker.
> Each gap blocks full implementation of the corresponding screen.
> Ordered by priority: screens that can ship a partial implementation first go lower.

> **Status (resolved):** Gaps 1–4 and 7 are now **implemented** in the
> `admin-audit` Better Auth plugin (`workers/core/src/auth/plugins/admin-audit/`),
> mounted under `/api/auth/admin/*` exactly as docs/026 prescribes — adapter-only
> reads, in-`where` actor scoping (platform-admin v1), `count`-based pagination,
> batched `in` enrichment, and secret-stripping presenters (token values and the
> JWKS `privateKey` are never returned, asserted by tests). The adapter
> capability "spike" (docs/026 §8) was validated empirically by the plugin's
> integration tests against the in-memory D1 adapter. The `/admin/security/sessions`,
> `/admin/security/tokens`, `consents`, and enriched `jwks` screens are now live. Gap 5 (scope hard-delete)
> remains **won't-build** (disable is the correct primitive); gap 6 (single-scope
> GET) stays low-priority/unbuilt.

---

## Blocking — screen cannot ship at all

### 1. `GET /api/auth/admin/list-sessions` — aggregate session listing

**Needed for:** `/admin/security/sessions` (moved from legacy `/admin/oauth/sessions-tokens`)

**What exists:** `POST /api/auth/admin/list-user-sessions` (per-user, takes `userId` in body).

**What's missing:** A global admin endpoint that lists all active browser sessions across all users, with optional filters (email, IP, status) and pagination.

**Request:** `GET /api/auth/admin/list-sessions?limit=25&offset=0`
**Response:** `{ sessions: Array<{ id, userId, userEmail, ipAddress, userAgent, activeOrganizationId, activeTeamId, createdAt, expiresAt, impersonatedBy }>, total: number, limit: number, offset: number }`. Session tokens are not returned; single-session revoke uses `/admin/revoke-session` with `{ sessionId }`.

**Fallback:** Show a "Coming Soon" placeholder page until implemented.

---

### 2. `GET /api/auth/admin/list-tokens` — aggregate OAuth token listing

**Needed for:** `/admin/security/tokens?type=access|refresh` (moved from legacy `/admin/oauth/sessions-tokens`)

**What exists:** Nothing. `oauthAccessToken` and `oauthRefreshToken` tables exist but have no admin listing endpoint.

**What's missing:** Global admin endpoint listing active access tokens and refresh tokens across all clients/users, with optional filters (type, client, user) and pagination.

**Request:** `GET /api/auth/admin/list-tokens?limit=25&offset=0&type=access|refresh`
**Response:** `{ tokens: Array<{ id, tokenPrefix, type: "access"|"refresh", clientId, clientName, userId, userEmail, scopes, expiresAt, createdAt }>, total, limit, offset }`

**Fallback:** Show a "Coming Soon" placeholder page until implemented.

---

### 3. `GET /api/auth/admin/list-consents` — aggregate consent listing

**Needed for:** `/admin/security/consents`

**What exists:** `oauthConsent` table exists in D1 schema but has no admin listing endpoint.

**What's missing:** Global admin endpoint listing all consent records with optional filters (client, user) and pagination. User email requires a join or separate lookup.

**Request:** `GET /api/auth/admin/list-consents?limit=25&offset=0&clientId=optional`
**Response:** `{ consents: Array<{ id, clientId, clientName, userId, userEmail, scopes: string[], createdAt, updatedAt }>, total, limit, offset }`

**Fallback:** Show a "Coming Soon" placeholder page until implemented.

---

### 4. `POST /api/auth/oauth2/revoke-consent` — consent revocation

**Needed for:** `/admin/security/consents` (revoke action)

**What exists:** Nothing. No endpoint to revoke a single consent record.

**What's missing:** Admin endpoint to delete a consent record, forcing the user to re-consent on next authorization request.

**Request:** `POST /api/auth/oauth2/revoke-consent`
**Body:** `{ clientId: string, userId: string }`
**Response:** `{ success: boolean }`

**Fallback:** Revoke button hidden until endpoint exists.

---

## Partial — screen can ship with limitation

### 5. `DELETE /api/auth/admin/oauth-scopes/:id` — scope deletion

**Needed for:** `/admin/oauth/scope-catalog` (delete action)

**What exists:** `PATCH /api/auth/admin/oauth-scopes/:id` (update description/enabled). No DELETE.

**What's missing:** Endpoint to delete a single OAuth scope row. Current workaround: disable via PATCH with `{ enabled: false }`.

**Request:** `DELETE /api/auth/admin/oauth-scopes/:id`
**Response:** `{ deleted: true }`

**Workaround:** Render Delete button as disabled with tooltip "Scope deletion via API pending; use disable instead." Disable button works today via PATCH.

---

### 6. `GET /api/auth/admin/oauth-scopes/:id` — single scope fetch

**Needed for:** Scope detail view (optional — list page covers core use case)

**What exists:** `GET /api/auth/admin/oauth-scopes` (list all). No single-scope GET.

**What's missing:** Single resource fetch for scope detail. Low priority — list page already has all fields.

**Request:** `GET /api/auth/admin/oauth-scopes/:id`
**Response:** OAuthResourceScope

**Workaround:** Not needed for MVP. List endpoint already returns all scopes with full data.

---

### 7. `GET /api/auth/admin/jwks` — JWKS key metadata (createdAt / expiresAt / status)

**Needed for:** `/admin/security/jwks` (createdAt/expiresAt columns and Active/Rotated/Expired badges)

**What exists:** `GET /api/auth/jwks` — the public RFC 7517 set. It returns public JWK material only
(`kid, kty, crv, x, use, alg`); it has no timestamps or status.

**What's missing:** An admin endpoint that reads the private `jwks` D1 table
(`{ id, publicKey, privateKey, createdAt, expiresAt }`) and returns per-key metadata **without** the
private key: `{ keys: Array<{ id, alg, createdAt, expiresAt, publicJwk }> }`. Status (active/rotated/expired)
is derived client-side from `expiresAt` + the configured grace window.

**Request:** `GET /api/auth/admin/jwks`
**Response:** `{ keys: Array<{ id: string, alg: string, createdAt: number, expiresAt: number | null, publicJwk: object }> }`

**Workaround:** The JWKS screen ships an MVP from the public `/api/auth/jwks` (kid, alg, public JWK, copy)
with no dates or status badges. Add those once this endpoint exists. **Never expose `privateKey`.**

---

## Not blocking — already exists

These endpoints referenced in the specs already exist:

| Endpoint | Verified |
|---|---|
| `POST /api/auth/oauth2/create-client` | ✅ api-1.yaml:9647 |
| `GET /api/auth/oauth2/get-clients` | ✅ api-1.yaml:10133 |
| `POST /api/auth/oauth2/update-client` | ✅ api-1.yaml:10203 |
| `POST /api/auth/oauth2/delete-client` | ✅ api-1.yaml:10429 |
| `POST /api/auth/oauth2/client/rotate-secret` | ✅ api-1.yaml:10348 |
| `GET /api/auth/admin/resource-servers` | ✅ api-1.yaml:11137 |
| `POST /api/auth/admin/resource-servers` | ✅ api-1.yaml:10824 |
| `PATCH /api/auth/admin/resource-servers/{id}` | ✅ api-1.yaml:11278 |
| `DELETE /api/auth/admin/resource-servers/{id}` | ✅ api-1.yaml:11444 |
| `POST /api/auth/admin/resource-servers/{id}/disable` | ✅ api-1.yaml:11531 |
| `POST /api/auth/admin/resource-servers/{id}/enable` | ✅ resource-server plugin |
| `GET /api/auth/admin/oauth-scopes` | ✅ api-1.yaml:11753 (implied by plugin) |
| `POST /api/auth/admin/oauth-scopes` | ✅ api-1.yaml:11672 |
| `PATCH /api/auth/admin/oauth-scopes/{id}` | ✅ api-1.yaml:11926 |
| `GET /api/auth/admin/oauth-client-resource-scopes` | ✅ plugin provides |
| `POST /api/auth/admin/oauth-client-resource-scopes` | ✅ plugin provides |
| `PATCH /api/auth/admin/oauth-client-resource-scopes/{id}` | ✅ plugin provides |
| `DELETE /api/auth/admin/oauth-client-resource-scopes/{id}` | ✅ plugin provides |
| `GET /api/auth/jwks` | ✅ public endpoint |

---

## Implementation design

> The approach, placement, and philosophy for these gaps now live in
> **[docs/026_admin-oauth-security-screens-and-api-contracts.md](../../../../docs/026_admin-oauth-security-screens-and-api-contracts.md)** — it is the authoritative plan and supersedes the earlier
> "mount under `/api/auth/admin` Hono + lint carve-out" idea, which was wrong. This section is kept as a
> short pointer so the gap list and the plan stay in sync.

Summary of the decided approach (see docs/026 §4 and §6 for the reasoning):

- **No new Hono routes under `/api/auth/*`, and no Rule 27 carve-out.** Architecture Rule 27
  (`hono-admin-route-allowlist`) already prescribes the split: auth-owned reads/CRUD belong in **Better Auth
  plugin endpoints** at `/api/auth/admin/*`; only genuinely cross-domain aggregates (the dashboard) use an
  allowlisted Hono `/api/admin/*` route.
- **No direct D1.** Every aggregate endpoint reads Better-Auth-owned tables through the adapter
  (`ctx.context.adapter`), never raw Drizzle. This means no SQL joins — enrich display fields by a batched
  `findMany({ where:[{ field:"id", operator:"in", value: ids }] })`, and **defer joined-field search**
  (notably email search) out of v1.
- **Actor scoping in the `where` clause** (not a post-filter), so pagination totals stay correct; **strip
  secrets** in the presenter (no token values, no `privateKey`).

| Gap | Home (per docs/026) |
|---|---|
| 1 — aggregate session list | `admin-audit` BA plugin → `GET /api/auth/admin/list-sessions` (adapter read) |
| 2 — aggregate token list | `admin-audit` BA plugin → `GET /api/auth/admin/list-tokens` (strip token values) |
| 3 — aggregate consent list | `admin-audit` BA plugin → `GET /api/auth/admin/list-consents` |
| 4 — consent revocation | BA plugin → `POST /api/auth/admin/revoke-consent` (repo-specific admin action, not RFC 7009; `/admin/` not `/oauth2/`) |
| 5 — scope deletion | Reconsider / likely won't build — `enabled:false` is the correct permanent primitive |
| 6 — single scope GET | Low priority; list endpoint already returns full data |
| 7 — JWKS key metadata | `admin-audit` BA plugin → `GET /api/auth/admin/jwks` (returns publicJwk + timestamps; never `privateKey`) |

Sequencing and the adapter-capability spike (`count`/`limit`/`offset`/`in`) are covered in docs/026 §8–§9.
