# Scalable Resource Pickers and Server-Side List Pagination

> Status: implemented locally in auth + idco link mode (2026-06-12); external release handoff remains for publishing idco and repinning the registry graph
>
> Date: 2026-06-12
>
> Hand-off: this document is self-contained and code-level. An implementing agent should execute Phases 1–3 from it without re-deriving the analysis. Load the `id-admin-ui` skill before any UI work and the `id-auth-plugin` + `id-architecture` skills before any `workers/core` work. Cross-repo release process for the idco package is in `~/pjs/idco/AGENTS.md` ("Cross-repo release").
>
> Scope (files this touches):
>
> - `~/pjs/idco/packages/ui/src/resource-selector.tsx` — the shared picker (async-mode hardening) + `tests/ui/resource-selector.test.tsx` + a story
> - `workers/ui/src/app/admin/_components/access/registration-policies-content.tsx` and `registration-policy-dialog.tsx` — first consumer
> - `workers/ui/src/app/admin/_actions/{oauth,organizations}.ts` — action query params + the new client-list action
> - `workers/ui/src/app/admin/_data/swr-keys.ts`, `workers/ui/src/shared/swr-endpoints.ts` — param-aware keys / endpoint constant
> - `workers/core/src/auth/plugins/resource-server/**` and `oauth-scope-catalog/**` — add `q`/`limit`/`offset`/`ids`
> - new endpoint for paginated OAuth client listing (placement decision in §7.1)
>
> Implementation notes (2026-06-12):
>
> - Phase 1 is implemented in `~/pjs/idco`: `ResourceSelector` now supports debounced async loading, `minQueryLength`, and `initialOptions` hydration, including placeholder-to-label replacement when edit-mode ids hydrate after mount.
> - Phase 2 is implemented in auth: the registration-policy dialog uses async picker loaders, bounded edit hydration, and no longer fetches the full OAuth client/resource-server/scope catalogs when opened. Organization/team search remains bounded client-filtered with a TODO because Better Auth does not expose paginated org/team search.
> - Phase 3 is implemented in auth: resource servers and OAuth scopes accept `q`/`limit`/`offset`/`ids`; `idOAuthClientAdmin` exposes session-authenticated `GET /admin/oauth-clients`; the existing M2M `oauth-client-picker` keeps its bearer-token contract while sharing client presentation/query helpers.
> - Verified locally in `pnpm dev:link` mode against the sibling idco checkout. Shipping still requires the documented cross-repo release: publish a new idco tag, then repin auth's committed registry dependency/lockfile.
>
> Local evidence (verified 2026-06-12):
>
> - `node_modules/@better-auth/oauth-provider/dist/index.mjs:1510` — `getClientsEndpoint` is `adapter.findMany({ where: [referenceId | userId] })` with **no limit/offset/search/count**. This is the concrete bottleneck.
> - `node_modules/better-auth/dist/plugins/admin/routes.mjs:240-318` — `listUsers`: search via `where.push({ field, operator: "contains"|"starts_with"|"ends_with", value })`, plus `limit`/`offset`/`sortBy`, `countTotalUsers(where)`, response `{ users, total, limit, offset }`. The adapter contract we build on.
> - `workers/core/src/auth/plugins/admin-activity-log/index.ts:1048-1075` — the canonical in-repo paginated read: endpoint-level `authorize` gate → org filter as a `where` clause → `adapter.count({ model, where })` for `total` → `adapter.findMany({ model, where, limit, offset, sortBy })`. **Copy this shape.**
> - `workers/core/src/auth/plugins/resource-server/index.ts:144-183` — `listResourceServers` is the anti-pattern: unbounded `findMany` over all rows → per-row `canAccessResourceServer` → in-memory org filter. Pagination cannot be bolted onto this as-is (see §6.1).
> - `workers/core/src/auth/plugins/oauth-client-picker/index.ts` — existing client read is **M2M bearer-token** (`verifyScopedBearerToken`, `oauth:clients:read`), not the admin UI. The admin list is a separate session-authed surface.
> - `workers/ui/src/app/admin/_actions/users.ts:18-91` — `ListUsersParams` / `ListUsersResponse`; the in-repo action shape to mirror.
> - `docs/028_tenant-scoped-platform-experience.md` §8.7 — "every list endpoint applies the organization filter **before** pagination"; platform-owned rows (`organizationId == null`) are unavailable to organization scopes; cross-scope access returns 404 for org admins.

---

## 1. Problem

The registration-policy create/edit dialog composes `ResourceSelector` for five resources (OAuth client, organization, resource server, allowed scopes, default teams). Today each is wired as `source={{ mode: "sync", items }}`, and `registration-policies-content.tsx:212-231` eagerly fetches the **entire catalog** for each when the dialog opens, then the picker filters in memory (`resource-selector.tsx:141-148`).

Two compounding problems:

1. **UI layer:** the whole catalog is transferred and rendered on every dialog open. At 1000 clients this is a multi-hundred-KB payload and a large `Autocomplete` list. `ResourceSelector` already has an `async` source mode (`resource-selector.tsx:44-52,123-131`) but it is unused here and has two correctness gaps that make it unfit for typeahead (no debounce; no preset-value hydration — §4.1).
2. **Data layer:** the endpoints behind those catalogs mostly have **no server-side query or pagination**, so even a perfect async picker would still pull every row. The worst case is OAuth clients: `get-clients` is an unconditional `findMany` (evidence above). Resource servers and scopes fetch all rows and filter in memory. Only **users** already do it right.

This is therefore a two-layer fix: the picker component (idco) and the data source (auth/core). The fix must respect the repo's identity boundary rules (§2), because one of the endpoints is genuinely new.

---

## 2. Standards classification (gates Phase 3 — do not skip)

| Resource | Path forward | Classification |
|---|---|---|
| Users / members | Better Auth admin `listUsers` (`searchValue`+`searchOperator`+`limit`+`offset`) | **Better Auth capability — already correct.** Consume it; build nothing. |
| Resource servers / OAuth scopes | Add `q`/`limit`/`offset`/`ids` to the **existing repo-owned** admin plugin endpoints | Repository-specific extension on already-repo-owned endpoints. Sanctioned by doc 028 §8.7 (pagination is part of the list contract). No new standards question. |
| OAuth clients | **New** session-authed paginated admin client-list endpoint | **Repository-specific AS-management read extension.** Permitted because OAuth defines no client *list/search* wire contract (RFC 7591/7592 DCR is per-client CRUD) and Better Auth's `get-clients` is an unpaginated `findMany`. Documented here as required by the M2M/service-account boundary rule. |
| Organizations | Keep client-filtered for this slice; flagged TODO | Better Auth `/organization/list` has no pagination; adding a repo org-list endpoint is out of scope here (§14, §15). |

**Hard boundary — SCIM is not the picker path.** The SCIM directory plugin (`scim-directory/README.md`) is exact-id M2M validation (`filter=id eq`, bearer token + `aud = id-system`, `scope = identity:directory:read`). It offers no contains-search and is not callable from a cookie/session admin UI. The admin typeahead path is the Better Auth admin/list endpoints. Routing the picker through SCIM would violate the SCIM-directory boundary rule and is forbidden.

---

## 3. Architecture overview

```
ResourceSelector (idco, Phase 1)
  source={{ mode:"async", load(query, signal) }}
        │  debounced typeahead, AbortSignal-cancelled
        ▼
_actions/*.ts (auth, Phase 2)            ── pure fetch wrappers, no React
  listClientsPage({ q, limit, offset })  ── search params only
        │
        ▼
workers/core BA plugin endpoints (Phase 3)
  GET /admin/oauth-clients?q&limit&offset&ids   (new, §7)
  GET /admin/resource-servers?q&limit&offset&ids (extended, §6)
  GET /admin/oauth-scopes?q&limit&offset&ids     (extended, §6)
        │  endpoint-level authorize gate → org where-clause
        ▼  adapter.count(where) → adapter.findMany(where, limit, offset, sortBy)
  { items, total, limit, offset }
```

Two response envelopes exist deliberately: list **screens** keep their existing payloads where they already work; **pickers** consume the paginated `{ items, total, limit, offset }` envelope. The picker never uses SWR for its options — `useAsyncList` owns that fetch lifecycle (§5.3).

---

## 4. Phase 1 — `ResourceSelector` async-mode hardening (idco repo)

### 4.1 Current state and the two gaps

Async mode already loads through `useAsyncList` (`resource-selector.tsx:123-131`) and AbortSignal is plumbed. Gaps:

1. **No debounce.** `useAsyncList` reloads on every `filterText` change, so each keystroke fires a server request.
2. **No preset-value hydration.** The selected label is resolved from `cache`, which is only populated from rows that have appeared in a loaded page (`resource-selector.tsx:151-164,188`). In async mode, an edit dialog with a preset `value` (e.g. an existing `clientId`) shows the raw id in the trigger/chip until that id happens to surface in a search result — which for an exact preset id it never will.

### 4.2 New prop API

Add to `ResourceSelectorProps` (additive, no breaking change to `sync` callers):

```ts
type ResourceSelectorProps = {
  // ...existing...
  /** Options to seed the id→label cache up front (selected/preset values in async mode). */
  readonly initialOptions?: ReadonlyArray<ResourceOption>;
  /** Minimum query length before async `load` fires. Default 0. */
  readonly minQueryLength?: number;
  /** Debounce (ms) applied to async search input. Default 250. Ignored in sync mode. */
  readonly searchDebounceMs?: number;
};
```

### 4.3 Debounce design

Keep the controlled input responsive while debouncing the *load trigger*. Hold raw input in local state; push to `list.setFilterText` (which drives `useAsyncList`) through a debounce:

```ts
const [rawQuery, setRawQuery] = useState("");
const debounced = useDebouncedCallback(            // small internal hook or existing util
  (q: string) => list.setFilterText(q),
  source.mode === "async" ? (searchDebounceMs ?? 250) : 0,
);
// Autocomplete inputValue={rawQuery}; onInputChange={(q) => { setRawQuery(q); debounced(q); }}
```

`useAsyncList` already aborts the previous request via the `signal` it passes to `load`, so the latest debounced query wins. Below `minQueryLength`, skip the load and render the empty state.

### 4.4 Preset-value hydration

Seed `cache` from `initialOptions` on mount and whenever it changes, without clobbering newer entries:

```ts
useEffect(() => {
  if (!initialOptions?.length) return;
  setCache((c) => {
    const next = { ...c };
    for (const o of initialOptions) if (!next[o.id]) next[o.id] = o;
    return next;
  });
}, [initialOptions]);
```

`labelFor(id)` (`resource-selector.tsx:188`) then resolves preset single-select and multi-select chips immediately. This covers both `selectionMode` values because chip labels already read from `cache`.

### 4.5 Abort / race / empty semantics

- Latest-query-wins is handled by `useAsyncList`'s `signal`; do not add a second abort layer.
- A `load` that throws should surface as the existing "No results" empty state (catch inside the consumer's `load`, or let `useAsyncList` mark `loadingState: "error"` and render empty). Keep the picker non-throwing.
- Empty query (`""`) in async mode: by default still calls `load("")` so the menu shows a first page; if `minQueryLength > 0`, render "Type to search" empty state instead.

### 4.6 Backward compatibility

`sync` mode is unchanged (`initialOptions`/`minQueryLength`/`searchDebounceMs` are no-ops). All existing sync consumers keep working. Build only on React Aria + DaisyUI (no hand-rolled widgets).

### 4.7 Tests (`tests/ui/resource-selector.test.tsx`)

- async `load` is debounced (multiple rapid `onInputChange` → one `load` after the window; use fake timers);
- preset single value renders its label from `initialOptions` (no `load` result needed);
- preset multi values render chips from `initialOptions`;
- `minQueryLength` suppresses `load` below threshold and shows the type-to-search state;
- a late-resolving stale `load` does not overwrite the newest results (assert the latest query's items render).

### 4.8 Release

Bump **all** idco `packages/*` to the new tag version → `pnpm check` under `dev:link` → `git tag vX.Y.Z && git push --tags` → repin auth via `pnpm dev:unlink`. Auth stays uncommitted per the project rule.

---

## 5. Phase 2 — Wire the registration dialog to lazy async (auth repo)

### 5.1 Per-picker `load`

Remove the five eager `useSWR` catalog fetches in `registration-policies-content.tsx:210-257`. For each picker, pass `source={{ mode: "async", load }}` where `load(query, signal)` calls the matching paginated action and maps rows to `ResourceOption`. Example (clients):

```ts
async function loadClients(query: string, signal: AbortSignal): Promise<ResourceOption[]> {
  const { items } = await actions.listClientsPage({ q: query, limit: 20, offset: 0, scope }, signal);
  return items.map((c) => ({
    id: c.client_id,
    label: c.client_name || c.client_id,
    sublabel: c.client_id,
    badge: c.type ?? (c.public ? "public" : undefined),
  }));
}
```

Resource servers and scopes use their extended endpoints (§6); teams and organizations keep their existing actions for now (small/Better-Auth-bound) but still run through async mode for consistent UX.

### 5.2 Edit-mode hydration

Policies persist ids only (`PolicyFormState`). On open of an **edit** dialog, resolve the preset ids to labels and pass them as `initialOptions` per picker. Use the **`ids` filter** added to the paginated endpoints (§6.2, §7.3) — one call per picker returning exactly the preset rows, bypassing pagination:

```ts
const presetClients = policy.clientId
  ? await actions.listClientsPage({ ids: [policy.clientId], scope })
  : { items: [] };
// → initialOptions={presetClients.items.map(toOption)}
```

For teams/organizations (existing full-list actions) hydration is free — the loaded list already contains the labels. Do the preset resolution once when the dialog opens (a small `useSWR` keyed on the policy id + dialog-open is acceptable here because it is bounded and id-keyed), not inside `load`.

### 5.3 SWR boundary note

The picker's option fetching leaves SWR entirely — `useAsyncList` owns it. Only the preset-hydration calls (bounded, id-keyed) and the main policy list/intents remain on SWR. Update the dialog props in `registration-policy-dialog.tsx` to accept `load*` callbacks and `initialOptions` per picker instead of the current `*Options: ResourceOption[]` arrays. Keep the teams picker gated on a selected `organizationId` (current behavior).

### 5.4 Tests (`workers/ui/tests/pages/registration-policies-content.test.tsx`)

- create flow: typing in the client picker calls `listClientsPage` with the typed `q` (mock returns a page); selecting sets the hidden field;
- edit flow: opening a policy with a preset `clientId` shows the client *label* (not the id) without any search — asserts `initialOptions` hydration via the `ids` call;
- the dialog no longer calls the full-catalog `listClients`/`listResourceServers`/`listScopes` on open (assert those mocks are not invoked).

---

## 6. Phase 3a — Server-side query on repo-owned endpoints (resource-servers, oauth-scopes)

### 6.1 The authorization-vs-pagination constraint (read before coding)

`listResourceServers` (`resource-server/index.ts:144-183`) cannot simply gain `limit`/`offset`, because it computes visibility **per row** after an unbounded fetch. Pushing `limit`/`offset` to the adapter before that filter would paginate the wrong set. Resolve it the way `admin-activity-log` does: make scope a **where-clause**, gated once at the endpoint:

- **Platform scope** (no `organizationId`): the endpoint-level platform-admin authorize gate already governs the whole read; no per-row filter needed.
- **Organization scope** (`organizationId` present): authorize the caller for that org once, then push `where: [{ field: "organizationId", value: organizationId }]`. This naturally excludes platform-owned rows (`organizationId == null`), matching doc 028 §8.7.

The existing per-row `canAccessResourceServer` loop is then redundant for the paginated path and is removed in favor of the single gate + where-clause. Confirm `assertResourceServerAccess`/`canAccessResourceServer` semantics reduce to "platform admin, or member of `organizationId`"; if any platform-owned read-exception exists it must be expressed as an explicit where-clause, not row iteration.

### 6.2 Endpoint changes (apply to both resource-servers and oauth-scopes list endpoints)

Add a query schema and paginate via the `admin-activity-log` shape (`index.ts:1056-1068`):

```ts
query: z.object({
  organizationId: z.string().optional(),
  q: z.string().optional(),                 // contains-search on name (+ slug/scope)
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  ids: z.string().optional(),               // comma-separated; hydration bypass (ignores q/limit/offset)
}),
```

Handler:

```ts
const where: Where[] = [];
if (organizationId) where.push({ field: "organizationId", value: organizationId });
if (ids) return ctx.json({                  // hydration path: exact rows, no pagination
  items: await adapter.findMany({ model, where: [...where, { field: "id", operator: "in", value: ids.split(",") }] }),
});
if (q) where.push({ field: "name", operator: "contains", value: q });   // scopes: field "scope"
const filters = where.length ? where : undefined;
const total = Number(await adapter.count({ model, where: filters }));
const items = await adapter.findMany({ model, where: filters, limit, offset, sortBy: { field: "createdAt", direction: "desc" } });
return ctx.json({ items, total, limit, offset });
```

Verify the adapter supports the `in` operator for the model in use; if not, fall back to `Promise.all(ids.map(id => findOne))` for the hydration path. Keep the existing non-paginated screen response only if a screen still depends on it; otherwise migrate the screen to the new envelope in the same change.

### 6.3 Action + key changes

- `_actions/oauth.ts`: add `listResourceServersPage(params)` and `listScopesPage(params)` returning `{ items, total, limit, offset }`, with a `params` type mirroring `ListUsersParams` (`{ q?, limit?, offset?, ids?, scope }`). Keep the existing `listResourceServers`/`listScopes` only if a screen still needs the full list.
- `swr-keys.ts`: these picker fetches do **not** go through SWR (§5.3), so no list key is needed for them. Only the bounded hydration calls (if you route them through SWR) get an id-keyed builder. Do **not** put `q` (raw input) in any SWR key.

### 6.4 Tests (`workers/core/tests/...`, added to the core barrel)

- org scope returns only that org's rows; platform-owned rows excluded;
- `q` does a contains match on name (scope) and is case-insensitive per the adapter;
- `limit`/`offset` paginate and `total` reflects the filtered (not page) count;
- `ids` returns exactly the requested rows ignoring `q`/pagination, still org-scoped (an id from another org returns nothing / 404-equivalent empty);
- a non-member org scope is rejected by the endpoint gate.

---

## 7. Phase 3b — New paginated OAuth client-list endpoint (repo-specific)

### 7.1 Placement decision

The existing `oauth-client-picker` plugin is **M2M bearer-token** only; mixing a session-authed endpoint into it muddies its identity. Chosen implementation: a new small plugin `idOAuthClientAdmin` (`workers/core/src/auth/plugins/oauth-client-admin/`) exposing a single session-authed read endpoint, wired in `get-auth.ts`. Better Auth imports stay under `workers/core/src/auth/**`; the endpoint reads the oauth-provider-owned `oauthClient` table via the adapter and **adds no new table** (no Drizzle schema change, no `db:generate`).

### 7.2 Route and query schema

```
GET /api/auth/admin/oauth-clients
```

```ts
query: z.object({
  organizationId: z.string().optional(),
  q: z.string().optional(),                 // contains-search on client name
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  ids: z.string().optional(),               // comma-separated client_ids; hydration bypass
}),
use: [sessionMiddleware],
```

### 7.3 Handler (mirror `admin-activity-log:1056-1068`)

```ts
const session = ctx.context.session;
if (!session) throw new APIError("UNAUTHORIZED");
const organizationId = requestedOrganizationId(ctx.query);
await assertClientListAccess(options.authorize, organizationId, session.user.id, session.user.role, adapter); // platform admin, or member of organizationId

const where: Where[] = [];
if (organizationId) where.push({ field: "referenceId", value: organizationId }); // org-owned clients
// platform scope: no referenceId filter; the platform-admin gate governs the read

if (ids) {
  const rows = await adapter.findMany<OAuthClientRow>({
    model: OAUTH_CLIENT_MODEL,
    where: [...where, { field: "clientId", operator: "in", value: ids.split(",") }],
  });
  return ctx.json({ items: rows.map(toPublicClient) }); // never include client_secret
}
if (q) where.push({ field: "name", operator: "contains", value: q }); // confirm stored name column
const filters = where.length ? where : undefined;
const total = Number(await adapter.count({ model: OAUTH_CLIENT_MODEL, where: filters }));
const rows = await adapter.findMany<OAuthClientRow>({
  model: OAUTH_CLIENT_MODEL, where: filters, limit, offset,
  sortBy: { field: "createdAt", direction: "desc" },
});
return ctx.json({ items: rows.map(toPublicClient), total, limit, offset });
```

`toPublicClient` reuses the oauth-provider's `schemaToOAuth`-style mapping and **must strip `client_secret`** (the M2M picker already does this at `oauth-client-picker` and `getClientsEndpoint:1525`). Confirm the stored display-name column name against the oauth-provider schema before using `field: "name"`.

### 7.4 Authorization, scoping, secret handling, cross-org behavior

- Endpoint-level gate: platform admin may read platform scope (all clients) and any org scope; an org admin may read only their `organizationId`.
- Org scope filters by `referenceId == organizationId`; platform-owned clients (`referenceId == null`) are excluded from org scope (doc 028 §8.7).
- `client_secret` is never returned.
- `ids` hydration returns only rows visible in the requested scope; an id outside scope is simply absent (do not leak existence — 404-equivalent emptiness, matching `oauth-client-picker` doc 018 §9).

### 7.5 Response envelope

`{ items: PublicOAuthClient[], total: number, limit?: number, offset?: number }` (hydration path omits `total`/`limit`/`offset`). `PublicOAuthClient` = the existing `OAuthClient` type minus `client_secret`.

### 7.6 Action + endpoint constant + dialog wiring

- `_actions/oauth.ts`: `listClientsPage({ q?, limit?, offset?, ids?, scope })` → calls the new route via `authApiGetOrThrow`, after `setActiveOrganizationForOAuth(scope)` (the org-active bridge that `listClients` already relies on, `oauth.ts:103-113`). Keep the existing `listClients` for the full-list screen unless that screen is migrated too (§14).
- `swr-endpoints.ts`: add an `ADMIN_OAUTH_CLIENTS` constant if any SWR-keyed (hydration) call needs it.
- Dialog: `loadClients` (§5.1) and preset hydration (§5.2) use this action.

### 7.7 Tests (`workers/core/tests/...` + barrel)

- platform admin: lists all clients, paginated, `total` correct, no `client_secret` in any item;
- org scope: only `referenceId == orgId` clients; platform-owned excluded;
- `q`: contains match on client name;
- `ids`: exact clients, scope-filtered, cross-org id absent;
- non-member org scope rejected by the gate;
- unauthenticated → 401.

---

### 7.8 Consolidation principle — one component, one query layer, two gated endpoints

All **admin-UI selectors** consolidate onto a single pattern: the idco `ResourceSelector` (async) over the `{ items, total, limit, offset }` envelope. This applies to OAuth clients, organizations, resource servers, teams, users, and members. `ScopeBuilder` and `TagInput` stay distinct — they are value *builders* (custom scope strings, free-text domains), not durable-principal pickers — though `ScopeBuilder` may draw suggestions from the same scope-catalog source. New admin selectors must not hand-roll a second list/search path.

**Do not delete `oauth-client-picker`.** Despite the name it is not a UI picker: it is the M2M write-time client-validation surface (bearer token, `aud = id-system`, `scope = oauth:clients:read`), consumed by `content-api`/resource servers per the doc 017/018 M2M principal contract, returning an exact-id lookup plus an optional `resource_access` advisory. The admin UI authenticates with a session cookie and has no such token; a content-api worker has no admin session. The two surfaces are standards-distinct (cross-service durable-write validation vs interactive admin typeahead) and cannot share an auth gate. OAuth clients are not SCIM principals, so SCIM cannot absorb this; introspection is a separate credential/flow. Removing it would break `content-api` with no standards-compliant replacement.

**What consolidates instead:** the *data/query layer*. Extract a shared `oauth-client-admin/operations.ts` (or a module both plugins import) that owns: scope→where-clause (`referenceId`), contains-search on the client name, `client_secret` stripping (`toPublicClient`), and `count`. Then keep **two thin endpoints** over it:

| Endpoint | Auth | Consumer | Shape |
|---|---|---|---|
| `GET /admin/oauth-clients` (new, §7.2) | `sessionMiddleware` (admin) | admin UI picker | paginated `{ items, total, limit, offset }` + `ids` hydration |
| `GET /admin/oauth-clients/lookup` (existing) | `verifyScopedBearerToken` (M2M) | content-api / resource servers | single-id lookup + `resource_access` |

This removes the duplicated read/query/secret-stripping logic (the real consolidation win) while preserving the auth boundary. Same principle bounds resource-servers/scopes: one operations layer, session-gated endpoints; no second bearer surface is introduced for them.

## 8. Authorization & scoping rules (consolidated)

1. Every paginated list endpoint authorizes the requested **scope once at the endpoint** (platform-admin, or member of `organizationId`) — never per row.
2. Scope is enforced as a `where` clause (`referenceId`/`organizationId == orgId`), so platform-owned rows are excluded from org scopes automatically (doc 028 §8.7).
3. Pagination/search are applied **after** the scope where-clause.
4. Cross-scope ids are absent, not errors (no existence leak).
5. Secrets (`client_secret`) are never serialized by any list/lookup path.

## 9. Cache identity / SWR key contract

- Picker option fetches use `useAsyncList`, **not** SWR — they have no SWR key. Raw search input must never become a cache key (it is not even routed through SWR).
- Only bounded, id-keyed hydration reads may use SWR; key them on the entity id (+ dialog-open), never on `q`.
- Existing list-screen keys (`oauthClientsKey`, `resourceServersKey`, `oauthScopesKey`) are unchanged unless those screens migrate to server pagination (§14).

## 10. Edge cases & race conditions

- **Debounce + abort ordering:** newest debounced query wins via `useAsyncList`'s `signal`; a stale in-flight `load` is aborted. Test asserts the latest items render (§4.7).
- **Preset id no longer exists** (client/team deleted after policy saved): hydration `ids` call returns fewer rows than requested; the picker shows the remaining selected id as a raw-id chip — acceptable; the editor can clear it.
- **Multi-select removal** in async mode: removal operates on `selectedIds`, independent of loaded pages — already correct.
- **Offset past `total`:** returns an empty page; picker shows "No results". Fine.
- **`in` operator unsupported by adapter:** fall back to per-id `findOne` for the hydration path (§6.2).
- **Org active bridge:** `listClientsPage` must call `setActiveOrganizationForOAuth(scope)` before the request, like `listClients` (`oauth.ts:103-113`), or org-scoped client reads resolve against the wrong active org.

## 11. Test plan (enumerated)

- **idco package** (`tests/ui/resource-selector.test.tsx`): §4.7 (5 cases).
- **auth core** (`workers/core/tests`, added to barrel): §6.4 (resource-servers + scopes) and §7.7 (clients).
- **auth UI** (`workers/ui/tests/pages/registration-policies-content.test.tsx`): §5.4 (3 cases). Use `renderWithSwr`. Mock the `_actions/` module; mock the paginated actions to return `{ items, total, limit, offset }`.
- Run `pnpm lint && pnpm test` in both repos; `pnpm deploy:ui:dry-run` in auth after the UI wiring.

## 12. Sequencing

1. **Phase 1** (idco) ships and is published/repinned first — Phase 2 depends on `initialOptions`/debounce props.
2. **Phase 3** (core endpoints) can land in parallel with Phase 1 (separate repo).
3. **Phase 2** (dialog wiring) requires Phase 1 published+repinned **and** Phase 3 endpoints live.

## 13. Definition of done

- `ResourceSelector` async mode debounces, hydrates preset values via `initialOptions`, honors `minQueryLength`, is covered by the §4.7 tests, and is published + repinned in auth.
- The registration dialog opens with **zero full-catalog fetches**; each picker searches server-side; edit mode shows labels (not ids) immediately.
- Resource-server and scope list endpoints accept `q`/`limit`/`offset`/`ids` with scope-as-where-clause and `total` from `adapter.count`, covered by core tests.
- The new paginated OAuth client-list endpoint exists, is session-authed, org-scoped, secret-free, returns `{ items, total, limit, offset }`, is covered by core tests, and is the dialog's client source.
- Organizations are explicitly left client-filtered with a TODO referencing §14 (not silently treated as paginated).
- This doc is listed in README Contracts (done with this change).

## 14. Open decisions

1. **Migrate the main OAuth clients list *screen* to server pagination** now, or only the picker? (This doc only requires the picker; the screen migration is a clean follow-up reusing the same endpoint.)
2. **Organizations pagination:** accept Better Auth's full `/organization/list` for the org picker, or add a repo org-list endpoint later. Deferred here.

## 15. Out of scope

Strict atomic registration quota, registration protocol growth (PAR/RAR), org-list pagination, the OAuth-clients-screen migration, and any SCIM write surface. See `docs/033_identity-deferred-roadmap.md`.
