# Admin OAuth & Security Screens — API Contracts and Backend Approach

> **Implementation status (done):** Phases 1–3 of §9 are implemented. All four
> backend-ready OAuth screens and the JWKS view shipped, and the **`admin-audit`
> Better Auth plugin** (`workers/core/src/auth/plugins/admin-audit/`) now serves
> gaps 1–4 and 7 — `GET /api/auth/admin/{list-sessions,list-tokens,list-consents,jwks}`
> and `POST /api/auth/admin/revoke-consent` — as adapter-only reads under
> `/api/auth/admin/*` (no new Hono routes, no Rule 27 carve-out). Actor scoping is
> in the query (platform-admin only for v1), pagination totals come from
> `adapter.count`, display fields are enriched by batched `in` lookups, and the
> presenters strip token values and the JWKS `privateKey` (asserted by tests).
> The adapter-capability spike (§8) was validated by the plugin's integration
> tests against the in-memory D1 adapter rather than left as a risk. The
> `sessions-tokens`, `consents`, and enriched `jwks` screens are live; joined-field
> (email) search remains deferred (§4.3). Gap 5 stays won't-build; gap 6 unbuilt.
>
> Status: implementation-grade research and proposal (pre-implementation; next step after the identity admin UI)
>
> Date: 2026-05-29
>
> Scope:
>
> - The upcoming admin surfaces under `/admin/oauth/*` and `/admin/security/*` (screen specs live in `workers/ui/docs/screens/oauth.md` and `workers/ui/docs/screens/security.md`).
> - The core-worker API contracts those screens depend on, and the endpoints that do not exist yet.
> - The backend approach for the missing endpoints: where they mount, how they read data, and how they stay inside the architecture.
>
> Source docs:
>
> - `workers/ui/docs/screens/oauth.md` — OAuth screen specs (applications, resource APIs, scope catalog, M2M bindings, sessions & tokens)
> - `workers/ui/docs/screens/security.md` — Security screen specs (JWKS, consents)
> - `workers/ui/docs/screens/api-gaps.md` — the per-screen gap list this document supersedes for approach/philosophy
> - `workers/ui/docs/screens/index.md` — admin screen registry
> - `api-1.yaml` — generated OpenAPI for the core worker (contract source of truth)
> - `workers/core/src/db/auth-schema.ts` — D1 table definitions (storage shape)
> - `workers/core/src/auth/plugins/{resource-server,oauth-scope-catalog,oauth-client-picker}/**` — the established BA-plugin pattern
> - `scripts/oxlint-js-plugins/architecture.js` — Rule 27 (`hono-admin-route-allowlist`) governs admin route placement
>
> Related docs:
>
> - `docs/000_repo-architecture.md` — architecture constitution
> - `docs/022_admin-ui-system.md` — admin UI design system
> - `docs/025_admin-ui-swr-caching-strategy.md` — admin UI data-fetching/caching model these screens also follow
>
> Assumptions:
>
> - Platform-admin-only for OAuth/security screens; org-admin scoping where a surface is org-owned (resource APIs, clients). Actor scoping is a contract requirement, not an afterthought (§4.4).
> - Better Auth owns the schema and migrations for every table these screens read (`session`, `oauthClient`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`, `oauthConsent`, `jwks`, plus the plugin tables). The repo never writes its own Drizzle schema for these (`schema.ts` stays empty).
> - The admin UI reaches the core worker only through the typed helpers in `packages/lib/src/auth-fetch.ts`, which target the `/api/auth` prefix.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 What Already Exists](#31-what-already-exists)
  - [3.2 What Is Missing](#32-what-is-missing)
  - [3.3 Contract Corrections Found During Review](#33-contract-corrections-found-during-review)
- [4. Philosophy](#4-philosophy)
  - [4.1 Reach Better-Auth-Owned Data Only Through The Adapter](#41-reach-better-auth-owned-data-only-through-the-adapter)
  - [4.2 BA Plugin Endpoint vs Hono /api/admin — Let Rule 27 Decide](#42-ba-plugin-endpoint-vs-hono-apiadmin--let-rule-27-decide)
  - [4.3 No Joins: Enrich By Batched Lookup, Defer Joined-Field Search](#43-no-joins-enrich-by-batched-lookup-defer-joined-field-search)
  - [4.4 Actor Scoping Belongs In The Query, Not A Post-Filter](#44-actor-scoping-belongs-in-the-query-not-a-post-filter)
  - [4.5 Present And Strip — Never Leak Secrets](#45-present-and-strip--never-leak-secrets)
  - [4.6 Contract Fidelity: Match The Boundary, Not The Storage](#46-contract-fidelity-match-the-boundary-not-the-storage)
- [5. Verified API Contracts](#5-verified-api-contracts)
- [6. The Gaps And Where They Live](#6-the-gaps-and-where-they-live)
- [7. Screen-By-Screen](#7-screen-by-screen)
- [8. Edge Cases And Failure Modes](#8-edge-cases-and-failure-modes)
- [9. Sequencing](#9-sequencing)
- [10. Definition Of Done](#10-definition-of-done)
- [11. Final Model](#11-final-model)

## 1. Goal

Bring the OAuth and Security admin sections to the same standard the identity section already reached: every screen reads and writes through a known, verified contract; nothing depends on a guessed endpoint shape; and the new backend endpoints are placed where the architecture already wants them instead of where they are momentarily convenient.

This document is deliberately weighted toward **decisions and philosophy**, not tickets. The screen specs (`oauth.md`, `security.md`) carry the pixel-level layout; this document carries the *why* behind the data layer and the contract, so a different engineer can implement the backend without re-deriving the boundary rules.

Non-goals: the SET/SSF event surfaces (`/admin/events/*`, deferred until Track B), CEL policy screens, and the system section. Those are out of scope until their plugins exist.

## 2. System Summary

```
Admin UI (workers/ui, client components, SWR per docs/025)
  │  authApiGetOrThrow / authApiPostOrThrow  →  /api/auth/*
  ▼
Core worker (workers/core)
  ├─ Better Auth handler  (/api/auth/*  — catch-all in http/routes/auth-mount.ts)
  │    ├─ oauth-provider plugin     → clients, tokens, consent (OAuth2-formatted)
  │    ├─ resource-server plugin    → /api/auth/admin/resource-servers
  │    ├─ oauth-scope-catalog plugin→ /api/auth/admin/oauth-scopes, /oauth-client-resource-scopes
  │    ├─ jwt plugin                → /api/auth/jwks (public set)
  │    └─ (proposed) admin-audit plugin → aggregate session/token/consent reads, consent revoke, jwks metadata
  └─ Hono routes (/api/admin/* allowlisted; /health; /api/bootstrap/*)
       └─ /api/admin/dashboard (cross-domain aggregate — the lone allowlisted case)
  ▼
D1 (Better-Auth-owned tables) — reached ONLY via the BA adapter, never raw Drizzle
```

Every OAuth/security screen is a read or a small mutation over Better-Auth-owned data. That single fact drives the whole approach: the natural home for the missing endpoints is *inside Better Auth*, where the adapter is already in hand.

## 3. Current-State Findings

### 3.1 What Already Exists

Verified against `api-1.yaml` and the plugin sources. These back the four OAuth screens that can ship today:

- **Clients** — `oauth-provider` plugin: `GET /oauth2/get-clients`, `POST /oauth2/create-client`, `POST /oauth2/update-client`, `POST /oauth2/client/rotate-secret`, `POST /oauth2/delete-client`.
- **Resource servers** — `resource-server` plugin: `GET|POST /admin/resource-servers`, `GET|PATCH|DELETE /admin/resource-servers/{id}`, `POST /admin/resource-servers/{id}/{disable,enable}`.
- **Scopes & M2M bindings** — `oauth-scope-catalog` plugin: `GET|POST /admin/oauth-scopes`, `PATCH /admin/oauth-scopes/{id}`; `GET|POST /admin/oauth-client-resource-scopes`, `PATCH|DELETE /admin/oauth-client-resource-scopes/{id}`.
- **JWKS (public)** — `jwt` plugin: `GET /jwks` (RFC 7517 public set).
- **Per-user sessions** — admin plugin: `POST /admin/list-user-sessions`, `POST /admin/revoke-user-session`.

The decisive structural fact: there are **no custom `/api/admin/*` Hono routes** today (only `/health` and `/api/bootstrap/admin`). All admin functionality is Better Auth plugin endpoints under `/api/auth/admin/*`, and they read D1 exclusively through `ctx.context.adapter` — no plugin touches Drizzle directly.

### 3.2 What Is Missing

Three screens cannot be fully built yet, and one ships in a reduced form:

- **`/admin/oauth/sessions-tokens`** — no aggregate "all sessions" or "all tokens" listing exists (only per-user).
- **`/admin/security/consents`** — no aggregate consent listing, and no single-consent revoke.
- **`/admin/security/jwks`** — the public `/jwks` endpoint has key *material* only; it carries no `createdAt`/`expiresAt`/status, so the dated/grouped view needs a metadata endpoint.

Hard scope deletion and single-scope GET are also absent, but neither blocks a screen (§6).

### 3.3 Contract Corrections Found During Review

The screen specs initially carried several shapes copied from the identity (Better Auth admin/organization) convention that do **not** hold for these plugins. Corrected in `oauth.md`/`security.md`, and stated here so the backend and UI agree:

- **PATCH bodies are flat**, not `{ data: {...} }`. The resource-server and scope-catalog plugins use strict flat schemas. (The identity `data:` wrapping is specific to BA admin/org endpoints.)
- **`update-client` nests mutable fields under `update:`**, not `data:`.
- **OAuth clients are snake_case at the boundary** (`client_id`, `client_name`, `redirect_uris`, `grant_types`, and `scope` as a *space-delimited string*). The camelCase `oauthClient` table is storage, not the API response.
- **There is no client `type` enum**; confidential/public/M2M is derived from `grant_types` + `token_endpoint_auth_method`.
- **Scope create is strict** — `enabled` is not accepted on create (defaults to true).
- **Plugin-entity timestamps are epoch-ms numbers**, unlike identity's ISO strings.

## 4. Philosophy

### 4.1 Reach Better-Auth-Owned Data Only Through The Adapter

If Better Auth owns a table's schema and migrations, the repo reads it through the BA adapter (`ctx.context.adapter` — `findMany`/`findOne`/`count`/`create`/`update`/`delete`), never through raw Drizzle or hand-written SQL. This is already the universal pattern in the existing plugins, and it is the rule we hold to here.

The reason is coupling. Raw SQL against `oauthAccessToken`/`session`/`oauthConsent` would bind admin reporting to Better Auth's *physical* column names — exactly the thing BA can change on a minor upgrade. The adapter is the contract; the columns are not. This costs us joins (§4.3), and we accept that cost rather than re-introduce schema coupling for a reporting convenience.

### 4.2 BA Plugin Endpoint vs Hono /api/admin — Let Rule 27 Decide

The architecture lint already encodes the placement rule we would otherwise argue about. `scripts/oxlint-js-plugins/architecture.js` Rule 27 (`hono-admin-route-allowlist`) reserves Hono `/api/admin/*` for an allowlist of **aggregate workflows** (today: `/api/admin/dashboard`) and says, verbatim, to *"put auth-owned CRUD under a Better Auth plugin endpoint mounted at `/api/auth/admin/*`."*

Read literally, that sorts our work cleanly:

- **Reads and mutations over a single auth-owned model** (sessions list, tokens list, consents list, consent revoke, JWKS metadata, scope delete/get) → **Better Auth plugin endpoints** under `/api/auth/admin/*`. They get the adapter for free, are reachable by the existing `authApiGetOrThrow` with no new helper, and need no lint change.
- **Genuinely cross-domain aggregation** (the dashboard: token volume + active sessions + client/org counts, possibly mixing non-auth data) → an **allowlisted Hono `/api/admin/*`** route. Adding to the allowlist is the rule's designed extension point, not a "carve-out."

This is why the earlier api-gaps plan — mount custom Hono routes under `/api/auth/admin/*` plus a lint exception — was the wrong shape: it fought the `/api/auth/*` catch-all, blurred Better Auth's namespace, and loosened a rule that already prescribed the answer. We do not loosen the rule; we follow it.

### 4.3 No Joins: Enrich By Batched Lookup, Defer Joined-Field Search

The adapter is per-model: no SQL joins. This sounds worse than it is, once two cases are separated:

- **Display enrichment** (show `userEmail`, `clientName` beside each row) is cheap: page the primary model (e.g. 25 sessions), collect the ≤25 referenced ids, issue one `findMany({ where:[{ field:"id", operator:"in", value: ids }] })` per referenced model, and zip in memory. Two or three bounded queries per page — no N+1, no scan. This covers the common need.
- **Filter / sort / count by a joined field** (e.g. *search sessions by user email*) is the part the adapter genuinely cannot do well, because it can neither `WHERE user.email LIKE` nor `ORDER BY` a foreign column without breaking pagination.

For these screens, every required filter except email search is same-table (IP, type, client, status, dates, `createdAt`). So we **ship batched display enrichment, and scope joined-field search (email search) out of v1** with a documented note rather than paying for it speculatively.

If joined-field search later becomes a real requirement, the sanctioned path is a **documented read-only query service (a CQRS read side)** blessed in `docs/000` with a narrow, explicit allowance — the same deliberate mechanism Rule 27 uses for the dashboard — or **denormalizing** the display field onto the read row so the join disappears. What we do *not* do is sprinkle ad-hoc Drizzle into an endpoint to dodge the rule.

### 4.4 Actor Scoping Belongs In The Query, Not A Post-Filter

The existing plugins fetch all rows and filter for visibility in memory. That is fine when an endpoint returns everything, but it **breaks the moment we paginate**: `limit`/`offset` followed by an in-memory visibility filter yields wrong page sizes and wrong totals. So every aggregate endpoint must express actor scoping inside the `where` clause and derive `count` from the same predicate.

- Platform admin → no scoping predicate (sees all).
- Org admin → scope by the org's owned set. For org-owned models (clients, resource servers) this is a direct `where`. For sessions/tokens, where the link to an org is indirect, resolve the candidate `userId`/`clientId` set first, then `where userId in […]`. If that set is unbounded for a large org, that is itself a signal the surface should stay platform-admin-only for v1.

### 4.5 Present And Strip — Never Leak Secrets

The adapter returns full rows. Every aggregate presenter must drop secret material before responding, mirroring the existing `present*` helpers that strip internal uniqueness keys:

- Token lists: return id/prefix and metadata only — never the `token`/refresh value.
- JWKS metadata: return public JWK + timestamps only — never `privateKey`.
- Client lists already come pre-shaped by the OAuth provider; do not re-expose `client_secret` outside the create/rotate response.

### 4.6 Contract Fidelity: Match The Boundary, Not The Storage

The boundary shape and the storage shape differ, and the UI must bind to the boundary (§3.3). Two recurring traps:

- **Case.** OAuth2 endpoints speak snake_case (`client_id`, `redirect_uris`, `scope` string); the D1 row is camelCase. Bind the UI to snake_case for clients.
- **Wrappers.** Identity update endpoints wrap in `data:`; these plugins use flat bodies, and `update-client` uses `update:`. Copying the identity convention silently sends the wrong shape.

The rule of thumb: verify each endpoint's body and response against `api-1.yaml` (or the plugin's Zod schema) before writing the action — do not generalize from a sibling screen.

## 5. Verified API Contracts

The corrected, implementation-ready contracts for the surfaces that exist today. Bodies are exact; `(flat)` means top-level, not wrapped.

| Operation | Endpoint | Request | Response |
|---|---|---|---|
| List clients | `GET /oauth2/get-clients` | — | `OAuthClient[]` (snake_case; `scope` is a space-delimited string) |
| Create client | `POST /oauth2/create-client` | flat snake_case; `redirect_uris` required; no `type` (set `grant_types`) | `{ client_id, client_secret, … }` |
| Update client | `POST /oauth2/update-client` | `{ client_id, update: { … } }` | `OAuthClient` |
| Rotate secret | `POST /oauth2/client/rotate-secret` | `{ client_id }` | `{ client_secret }` |
| Delete client | `POST /oauth2/delete-client` | `{ client_id }` | `{}` |
| List resource servers | `GET /admin/resource-servers` | — | `{ resourceServers: ResourceServer[] }` |
| Create resource server | `POST /admin/resource-servers` | `{ name, slug, audience, description?, organizationId? }` | `ResourceServer` |
| Update resource server | `PATCH /admin/resource-servers/{id}` | `{ slug?, name?, audience?, description? }` (flat) | `ResourceServer` |
| Disable resource server | `POST /admin/resource-servers/{id}/disable` | — | `ResourceServer` |
| Enable resource server | `POST /admin/resource-servers/{id}/enable` | — | `ResourceServer` |
| Delete resource server | `DELETE /admin/resource-servers/{id}` | — | `{ deleted: true }` |
| List scopes | `GET /admin/oauth-scopes` | — | `{ oauthScopes: OAuthResourceScope[] }` |
| Create scope | `POST /admin/oauth-scopes` | `{ resourceServerId, scope, description? }` (strict; no `enabled`) | `OAuthResourceScope` |
| Update scope | `PATCH /admin/oauth-scopes/{id}` | `{ scope?, description?, enabled? }` (flat) | `OAuthResourceScope` |
| List bindings | `GET /admin/oauth-client-resource-scopes` | — | `{ oauthClientResourceScopes: ClientResourceScope[] }` |
| Create binding | `POST /admin/oauth-client-resource-scopes` | `{ clientId, resourceServerId, allowedScopes }` | `ClientResourceScope` |
| Update binding | `PATCH /admin/oauth-client-resource-scopes/{id}` | `{ allowedScopes?, enabled? }` (flat) | `ClientResourceScope` |
| Delete binding | `DELETE /admin/oauth-client-resource-scopes/{id}` | — | `{ deleted: true }` |
| JWKS (public) | `GET /jwks` | — | `{ keys: [{ kid, kty, crv, x, use, alg }] }` (no timestamps) |

All `/admin/*` and `/oauth2/*` paths are relative to the `/api/auth` prefix. Plugin-entity timestamps are epoch-ms numbers.

## 6. The Gaps And Where They Live

Each gap is classified (standard vs repository-specific) and placed per §4.1–4.2. None is a Hono `/api/auth/admin` route; none reads D1 directly.

| # | Need | Classification | Home | Notes |
|---|---|---|---|---|
| 1 | Aggregate session list | Repo-specific admin read | **`admin-audit` BA plugin** → `GET /api/auth/admin/list-sessions` | Adapter `findMany(session)` + batched user enrichment; actor-scoped; paginated via `where`+`count`. |
| 2 | Aggregate token list | Repo-specific admin read | **`admin-audit` BA plugin** → `GET /api/auth/admin/list-tokens` | Reads `oauthAccessToken`/`oauthRefreshToken`; strip token values; enrich client/user by batched lookup. |
| 3 | Aggregate consent list | Repo-specific admin read | **`admin-audit` BA plugin** → `GET /api/auth/admin/list-consents` | Reads `oauthConsent`; enrich client/user by batched lookup. |
| 4 | Consent revocation | Repo-specific admin action (NOT RFC 7009; that is token revocation) | **BA plugin** → `POST /api/auth/admin/revoke-consent` | `adapter.delete(oauthConsent, { clientId, userId })`; forces re-consent. `/admin/` path, not `/oauth2/`, since it is not a protocol endpoint. |
| 5 | Scope hard-delete | Repo-specific | **Reconsider — likely do not build** | Deleting a scope referenced by live bindings/tokens is dangerous. `enabled:false` (already supported) is the correct permanent primitive, not a temporary workaround. If built, must refuse when referenced. |
| 6 | Single-scope GET | Repo-specific | Low priority | The list endpoint already returns full scope data; only add if a deep-link detail view is introduced. |
| 7 | JWKS key metadata | Repo-specific admin read | **`admin-audit` BA plugin** → `GET /api/auth/admin/jwks` | `adapter.findMany(jwks)`; return `{ id, alg, createdAt, expiresAt, publicJwk }`; **never** `privateKey`. Status (active/rotated/expired) derived client-side from `expiresAt` + grace window. |

The dashboard (`/admin/dashboard`, separate from these gaps) remains the one legitimately cross-domain aggregate and stays a Hono `/api/admin/dashboard` route on the Rule 27 allowlist — and even it pulls auth counts through the adapter.

## 7. Screen-By-Screen

How each screen lands given the above. "Ships now" means every contract it needs exists today.

- **`/admin/oauth/applications`** — Ships now. Client-side search over the full client list. The only subtlety is the snake_case boundary and derived `clientType` (§3.3); get those right and the screen is straightforward.
- **`/admin/oauth/resource-apis`** — Ships now with reversible status actions through explicit disable/enable endpoints.
- **`/admin/oauth/scope-catalog`** — Ships now. Delete renders disabled (gap 5); disable-via-PATCH is the supported action and the recommended permanent model.
- **`/admin/oauth/m2m-bindings`** — Ships now. Four parallel reads (bindings, clients, resource servers, scopes), joined client-side for labels and scope checkboxes.
- **`/admin/oauth/sessions-tokens`** — Needs gaps 1–2. Ships as a "Coming Soon" placeholder until the `admin-audit` plugin lands; then a paginated, same-table-filtered view with batched email/client enrichment. Email *search* deferred (§4.3). Revoke uses the existing `/admin/revoke-user-session`.
- **`/admin/security/jwks`** — Ships now as an **MVP** from `GET /jwks` (kid, alg, public JWK, copy; flat list, no dates/status). The dated/grouped **enriched** view waits on gap 7.
- **`/admin/security/consents`** — Needs gaps 3–4. "Coming Soon" placeholder until the plugin lands; then a paginated list filtered by client (same-table), email search deferred, revoke via gap 4.

## 8. Edge Cases And Failure Modes

- **Pagination correctness under scoping.** If actor scoping is applied after `findMany` instead of in `where`, page sizes and `count` drift. Treat scoping + pagination as one query concern (§4.4).
- **Token value exposure.** A token list that forgets to strip `token` leaks bearer credentials. The presenter, not the caller, is responsible (§4.5); cover it with a test asserting the field is absent.
- **JWKS private key exposure.** Gap 7 reads the table that also holds `privateKey`. The presenter must omit it; a test must assert it.
- **Scope deletion dangling references.** If gap 5 is ever built, deleting a scope referenced by an `oauthClientResourceScope` row or a live token orphans grants. Prefer disable; if delete exists, refuse on reference.
- **Adapter capability assumptions.** `count`, `limit`/`offset`, and the `in`/`gt` operators are part of Better Auth's adapter API but are **unused in this repo so far**. Validate them against the D1 adapter with a short spike before committing the aggregate contracts — this is the one place the plan rests on an unexercised capability.
- **Org-admin session/token scoping blow-up.** If an org's candidate user/client id set is huge, the `where … in […]` approach degrades. For v1, keep sessions/tokens platform-admin-only and revisit org scoping when there is a concrete need.
- **Rate limit.** These screens follow `docs/025`: SWR with manual revalidation, no background refetch. Aggregate endpoints are read-once-per-navigation, so they sit comfortably under the limit.

## 9. Sequencing

Light on purpose — phases, not tickets.

1. **Ship the four OAuth screens that need no backend** (applications, resource-apis, scope-catalog, m2m-bindings), plus the **JWKS MVP**. These exercise the corrected contracts and the SWR data layer end-to-end.
2. **Spike the adapter** for `count` / `limit` / `offset` / `in` against D1 (§8). Small, but it de-risks everything aggregate.
3. **Build the `admin-audit` BA plugin** for gaps 1–3 and 7 (aggregate reads + JWKS metadata) and gap 4 (consent revoke), with in-`where` scoping and stripping presenters. Flip `sessions-tokens`, `consents`, and the enriched JWKS view from placeholder to live.
4. **Revisit joined-field search** only if a real requirement appears — via a documented read side or denormalization (§4.3). Do not pre-build it.

Gaps 5 (scope delete) and 6 (single-scope GET) stay deferred; 5 is more likely "won't build."

## 10. Definition Of Done

- Every OAuth/security action calls a contract verified against `api-1.yaml` or a plugin Zod schema (no shapes generalized from sibling screens).
- New aggregate/metadata endpoints live in a Better Auth plugin under `/api/auth/admin/*`, reachable by the existing `authApiGetOrThrow` — no new Hono `/api/auth` routes, no Rule 27 carve-out.
- No endpoint reads D1 directly; all data access is through `ctx.context.adapter`.
- Actor scoping is expressed in the query; pagination totals are correct under scoping.
- Token lists never return token values; JWKS metadata never returns `privateKey` — each asserted by a test.
- Deferred surfaces (`sessions-tokens`, `consents`, enriched JWKS) render an honest placeholder until their plugin lands, and the joined-field-search limitation is documented where it bites.
- `docs/000` records any read-side/denormalization decision before such code is written.

## 11. Final Model

```
Boundary (what the UI binds to)
  OAuth clients          → snake_case, scope is a string, type is derived
  resource servers/scopes→ flat PATCH bodies, ms timestamps
  aggregates (new)       → /api/auth/admin/{list-sessions,list-tokens,list-consents,jwks}, revoke-consent
                           reachable by authApiGetOrThrow; secrets stripped

Backend (how it is served)
  BA plugin endpoints  ──ctx.context.adapter──▶  D1 (BA-owned)
     • per-model reads; enrich by batched `where id in […]`, never a join
     • actor scoping inside `where`; count from the same predicate
     • present-and-strip before responding
  Hono /api/admin/dashboard (allowlisted)  → the only cross-domain aggregate

Rules honored
  • Better-Auth-owned data → adapter only (no raw Drizzle)
  • Rule 27 placement → auth-owned reads/CRUD in BA plugins; aggregates on the allowlist
  • no rule loosened; no schema coupling; no leaked secrets
```

The shape to remember: these screens are reads over Better-Auth-owned data, so the endpoints live inside Better Auth and speak through the adapter. We trade SQL joins for that decoupling and pay the trade with cheap batched enrichment — deferring only true joined-field search until a real need justifies a deliberate, documented read side.
</content>
