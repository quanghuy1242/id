# Admin UI — Client-Side Data Fetching With SWR

> Status: **implemented** (identity section). Foundation + all identity list/detail/enriched pages converted; `pnpm check` and `pnpm deploy:ui:dry-run` green. OAuth/security pages adopt the pattern as they are built (§7.6).
>
> Date: 2026-05-29
>
> Scope:
>
> - `workers/ui/src/app/admin/**` — all existing and upcoming admin pages and detail providers
> - `workers/ui/src/app/admin/_actions/*.ts` — action layer wrapping `/api/auth/*` calls
> - `workers/ui/src/shared/**` — site-wide SWR configuration (new)
>
> Source docs:
>
> - `workers/ui/docs/screens/identity.md` — existing user/org screen specs
> - `workers/ui/docs/screens/oauth.md` — upcoming OAuth screen specs
> - `workers/ui/docs/screens/security.md` — upcoming security screen specs
> - `packages/lib/src/auth-fetch.ts` — shared `authApiGetOrThrow` / `authApiPostOrThrow` helpers
> - `workers/ui/src/app/admin/_actions/users.ts` — current user action layer
> - `workers/ui/src/app/admin/_actions/organizations.ts` — current org action layer
> - `workers/ui/src/app/admin/_components/identity/*` — current content components and detail-context providers
>
> Related docs:
>
> - `docs/022_admin-ui-system.md` — admin UI design system
> - `docs/023_admin-screen-story-strategy.md` — screen + story implementation contract
> - `.claude/skills/id-admin-ui` — admin UI component registry, hard rules, and the Nested Detail Layout Pattern
>
> External references (verified 2026-05-29):
>
> - SWR API options — https://swr.vercel.app/docs/api
> - SWR automatic revalidation — https://swr.vercel.app/docs/revalidation
> - `revalidateOnMount` vs `revalidateIfStale` precedence — https://github.com/vercel/swr/discussions/1400
>
> Assumptions:
>
> - Core-id rate limit is approximately **10 requests per 10 seconds per IP**. Treated as a hard ceiling to design under, not a measured guarantee.
> - Admin UI is client-component-only; there is no server-side rendering or worker-side data fetching for admin data pages.
> - All API calls go through `authApiGetOrThrow` / `authApiPostOrThrow` / `authApiGet` / `authApiPost` from `@idco/lib`.
> - One admin principal is active per browser context (cookie-scoped session). This is an explicit deployment assumption, not a runtime guarantee — see §9.6.
> - SWR (`swr@2.x`) is the chosen library. Alternatives evaluated in §5.

## Table Of Contents

- [0. Implementation Status And Deviations](#0-implementation-status-and-deviations)
- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Relevant Files](#31-relevant-files)
  - [3.2 How Fetching Works Today](#32-how-fetching-works-today)
  - [3.3 Current Problems](#33-current-problems)
- [4. Caching Philosophy](#4-caching-philosophy)
  - [4.1 SWR As An Explicit-Revalidation Cache](#41-swr-as-an-explicit-revalidation-cache)
  - [4.2 The Key Is A Contract, Not A Convenience](#42-the-key-is-a-contract-not-a-convenience)
  - [4.3 Server State Versus View State](#43-server-state-versus-view-state)
  - [4.4 Pessimistic By Default, Local-Patch Where The Code Already Earns It](#44-pessimistic-by-default-local-patch-where-the-code-already-earns-it)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Recommended Approach: SWR With A Manual-Revalidation Config](#51-recommended-approach-swr-with-a-manual-revalidation-config)
  - [5.2 The Site-Wide Config, And Why Each Flag Is Set The Way It Is](#52-the-site-wide-config-and-why-each-flag-is-set-the-way-it-is)
  - [5.3 Rejected And Deferred Options](#53-rejected-and-deferred-options)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
  - [7.1 Foundation](#71-foundation)
  - [7.2 List Pages](#72-list-pages)
  - [7.3 Detail Pages: Migrate The Provider, Not The Content](#73-detail-pages-migrate-the-provider-not-the-content)
  - [7.4 Enriched / N+1 Pages](#74-enriched-n1-pages)
  - [7.5 Mutations And Invalidation](#75-mutations-and-invalidation)
  - [7.6 Upcoming OAuth / Security Pages](#76-upcoming-oauth--security-pages)
- [8. Compatibility, Stories, And Tests](#8-compatibility-stories-and-tests)
- [9. Edge Cases And Failure Modes](#9-edge-cases-and-failure-modes)
- [10. Implementation Backlog](#10-implementation-backlog)
- [11. Future Backlog](#11-future-backlog)
- [12. Definition Of Done](#12-definition-of-done)
- [13. Final Model](#13-final-model)

## 0. Implementation Status And Deviations

The plan was implemented with the following concrete file layout and adjustments. Where the implementation diverges from earlier prose, the implementation is authoritative.

**Files added:**

- `workers/ui/src/shared/swr-config.ts` — `ADMIN_SWR_CONFIG` (framework-free; no admin imports).
- `workers/ui/src/shared/swr-endpoints.ts` — `UPPER_CASE` Better Auth endpoint-path constants. They live in `shared/` to satisfy the `architecture(constants-placement)` lint gate, which requires module-level screaming constants to live in `src/shared/` (etc.).
- `workers/ui/src/app/admin/_data/swr-keys.ts` — typed key builders (`usersListKey`, `userDetailKey`, …) and invalidation predicates (`isUsersListKey`, `isOrgsListKey`). These live under `app/admin/` because they import admin action **types** (`ListUsersParams`), and the `architecture(layer-imports)` gate forbids `src/shared/**` from importing the `_actions` layer.
- `workers/ui/src/app/admin/_data/use-users-by-ids.ts` — shared enrichment hook (§7.4); back-populates each `userDetailKey` slot so member/inviter lookups dedup with the user-detail page.
- `workers/ui/src/app/admin/_components/admin-swr-provider.tsx` — `"use client"` wrapper that mounts `<SWRConfig>`. Needed because `app/admin/layout.tsx` is a server component.
- `workers/ui/tests/_utils/swr-render.tsx` — `renderWithSwr` test helper wrapping each render in a fresh `provider: () => new Map()` cache for per-test isolation.

**Adjustments to the plan:**

- **Config** carries `errorRetryCount: 2` plus a 429-aware `onErrorRetry` (§5.2, §9.1) and `dedupingInterval: 5_000`. `revalidateOnMount` is intentionally absent.
- **Current-session key** is `["/get-session"]` (the real `getCurrentSession` endpoint), not the placeholder used in earlier drafts.
- **`user-sessions-content.tsx`** was also converted (not in the original 7): `useSWR` for the list, optimistic `mutate(updater, { revalidate: false })` on single-revoke, `mutate([], …)` on revoke-all.
- **Cross-surface invalidation is centralized**: the detail providers' `setUser`/`setOrg` perform the local cache patch *and* invalidate the matching list cache via `useSWRConfig().mutate(predicate, undefined, { revalidate: false })`. The two delete flows that do not call a setter — user delete (`user-detail-overview-content.tsx`) and org delete (`org-detail-header-content.tsx`) — invalidate the list the same way before navigating. Invalidation clears the slot (no eager refetch); the list refetches on next mount, which respects the rate budget.
- **Teams** were converted on a derived model: one `useSWR` bundle (`teams` + `orgMembers` + per-team `memberCounts`), all names via `useUsersByIds`, and the lazy team-member expansion kept interactive. The previous bespoke `userCache`/`memberCounts` local state was removed.
- **Story/test isolation**: the `AdminShell` story decorator wraps children in a fresh-cache `<SWRConfig>` so one story never serves another's cached data; tests use `renderWithSwr`.

## 1. Goal

Replace the ad-hoc `useEffect` + `useState` fetch pattern in admin content components and detail providers with one consistent SWR-based data layer. The layer must:

1. **Serve cache across navigation.** Navigating away from a page and back renders from cache with no loading skeleton and no network call, until something explicitly invalidates that cache.
2. **Deduplicate concurrent fetches.** Two components mounting with the same key share one in-flight request.
3. **Respect the rate limit by default.** No invisible background refetches. The only automatic fetch is the first one for a key that has no cached data. Everything else is triggered by an explicit user action or a mutation.
4. **Preserve the existing seams.** No changes to `packages/lib`, no changes to action function signatures, and no breaking of the `actions`-injection prop that content components already use for stories and tests.
5. **Generalize.** One mental model that fits list pages, detail providers, enriched (N+1) pages, and the upcoming OAuth/security pages.

Non-goals: SSR/hydration, cross-user cache isolation beyond the single-session assumption, service-worker caching, and optimistic UI for complex multi-field edits.

This is primarily a **philosophy and decisions** document. Code snippets are illustrative fragments, not full component listings — the conversion is mechanical once the model and the per-component key contract are agreed.

## 2. System Summary

```
Browser tab (admin session)
  │
  ├─ SWR cache (in-memory, module-level singleton, keyed by [endpoint, serverParams])
  │   ├─ written on fetch success
  │   ├─ read on mount; with our config, NO refetch when data exists
  │   ├─ invalidated on mutation success (explicit mutate)
  │   └─ patched locally where the server response is already in hand
  │
  ├─ useSWR(key, fetcher, config?)        — list pages and detail providers
  │     └─ fetcher calls actions.listXxx(serverParams)
  │           └─ authApiGetOrThrow<T>(path, params)
  │
  └─ mutation handler
        └─ actions.createXxx(body) → authApiPostOrThrow<T>(path, body)
              └─ then: mutate(affectedKey) or mutate(key, nextData, { revalidate: false })
```

Data flows browser-only. Every admin page is a client component that reads from SWR and writes through `_actions/`. The action layer and `@idco/lib` are unchanged: SWR sits *between* the component and the action, not inside the action.

## 3. Current-State Findings

### 3.1 Relevant Files

List and toolbar pages (own their fetch directly):

```
workers/ui/src/app/admin/_components/identity/
  users-list-content.tsx              — server fetch + debounced search + CLIENT-side status filter
  organizations-list-content.tsx      — single server fetch + CLIENT-side search and sort
```

Detail areas (fetch is owned by a context provider, shared by header + child routes):

```
workers/ui/src/app/admin/_components/identity/
  user-detail-context.tsx             — fetches getUser AND getCurrentSession in parallel; exposes setUser, setCurrentSession, refetch
  user-detail-header-content.tsx      — reads context only
  user-detail-overview-content.tsx    — reads context only; mutates via setUser
  user-sessions-content.tsx           — child route content
  org-detail-context.tsx              — org equivalent of the user provider
  org-detail-header-content.tsx       — reads context only
  org-detail-overview-content.tsx     — reads context only
```

Enriched / N+1 pages:

```
workers/ui/src/app/admin/_components/identity/
  organization-members-content.tsx    — listMembers(orgId) THEN getUser() per unique member
  organization-teams-content.tsx
  organization-invitations-content.tsx
```

Detail route layouts (own URL logic, wrap the provider):

```
workers/ui/src/app/admin/identity/users/[userId]/layout.tsx
workers/ui/src/app/admin/identity/organizations/[orgId]/layout.tsx
```

Shared:

```
packages/lib/src/auth-fetch.ts                    — authApiGetOrThrow / authApiPostOrThrow (unchanged)
workers/ui/src/app/admin/_actions/users.ts        — typed action functions
workers/ui/src/app/admin/_actions/organizations.ts
```

### 3.2 How Fetching Works Today

Three distinct shapes exist — the previous version of this document modeled only the first and got the other two wrong, so they are spelled out here.

**(a) List/toolbar pages** own their data with `useState` + `useEffect` and a manual `fetchKey` counter used as a refetch trigger. `users-list-content.tsx` debounces search by 300 ms and only refetches on the *debounced* value; role is sent as a server filter param; **status is filtered client-side** over the already-fetched page (`displayedUsers` partitions by `banned`). `organizations-list-content.tsx` fetches the full list once and does **search and sort entirely client-side**.

**(b) Detail areas** do not fetch in the content components. The fetch lives in a provider — `user-detail-context.tsx` runs `getUser(userId)` and `getCurrentSession()` together via `Promise.all`, exposes `user`, `currentSession`, `setUser`, `setCurrentSession`, `isLoading`, `error`, and `refetch`, and is mounted by the `[userId]/layout.tsx` route. Overview/header/sessions children call `useUserDetail()` and render from context. Overview mutations call `setUser(...)` to update the in-memory copy without a refetch.

**(c) Enriched pages** fan out: `organization-members-content.tsx` calls `listMembers(orgId)`, dedupes member user IDs, then calls `getUser(id)` for each one and joins the results.

All three inject their action functions through an `actions = defaultActions` prop. Stories and tests override behavior by passing a fake `actions` object — this is the established testability seam, and SWR must not break it.

### 3.3 Current Problems

| Problem | Root cause | Impact |
|---|---|---|
| Refetch on every navigation | Component/provider remounts and `useEffect` fires | Wasted calls, skeleton flash on every back-navigation |
| Duplicate fetches on concurrent mount | Each component owns its own fetch | Identical simultaneous requests |
| No cross-page sharing | State lives in `useState`, dies on unmount | Members page re-fetches a user that the user-detail page already loaded |
| Rate-limit risk on fan-out | The members N+1 issues `1 + N` calls in a single page load | An 8-member org spends ~9 of the 10/10s budget at once |
| Hand-rolled refetch plumbing | `fetchKey` counter + `cancelled` flag repeated in every component/provider | Boilerplate, easy to get the cancellation wrong |
| Mutation not linked to list cache | A create on one surface is invisible on another until manual navigation | Stale lists after writes |

## 4. Caching Philosophy

The configuration matters less than the model behind it. Four principles drive every later decision.

### 4.1 SWR As An Explicit-Revalidation Cache

SWR's name is "stale-while-revalidate," but that default behavior — serve stale, refetch silently in the background — is the opposite of what a rate-limited admin needs. We deliberately run SWR in a **manual-revalidation** mode: it is a deduplicating, cross-navigation, in-memory cache whose only *automatic* network call is the first fetch for an uncached key. Every other fetch is something a human or a mutation asked for.

This reframes SWR from "a background sync engine" to "a smart `Map` with request deduplication and React lifecycle integration." That framing is what justifies disabling most of its automatic machinery in §5.2.

### 4.2 The Key Is A Contract, Not A Convenience

Each `useSWR` key is `[endpointPath, serverParams]`. The key defines cache identity, so it must contain **exactly** the inputs that change the server response — no more, no less. Two failure modes follow directly:

- Putting view-only state in the key fragments the cache and forces fetches that produce identical data (see §4.3).
- Leaving a real server input out of the key serves the wrong cached response for a different query.

Keys are built inside the content component or provider, never in the action layer. Actions stay pure fetch wrappers.

### 4.3 Server State Versus View State

This is the single most important rule for this codebase, because several components are hybrids.

- `users-list-content`: `limit`, `offset`, `sortBy`, `sortDirection`, the *debounced* search value, and the role filter are **server params** → they belong in the key. The status filter is applied **client-side** → it must **not** be in the key. Search must be keyed on the **debounced** value, never the raw input, or every keystroke mints a new key and fires a fetch.
- `organizations-list`: only the single list endpoint is a server call; search and sort are client-side → the key is the bare endpoint with no params, and typing/sorting triggers zero fetches.

Rule of thumb: **if changing a control today does not cause `actions.listX` to be called with different arguments, that control must not appear in the SWR key.** Each component's conversion starts by auditing which of its controls are server-driven.

### 4.4 Pessimistic By Default, Local-Patch Where The Code Already Earns It

Default mutation flow is pessimistic: `await action()`, then `await mutate(key)` to revalidate. The server is the source of truth for generated fields (`id`, `createdAt`, `emailVerified`), and one extra deterministic call per mutation is affordable.

The exception is the detail providers, which already hold the full server response and call `setUser(updatedUser)` to update locally without a refetch. SWR expresses exactly this with `mutate(key, nextData, { revalidate: false })`. Replacing those local patches with blind refetches would *add* network calls and regress current behavior. Preserve the local-patch path where the mutation response already contains the updated entity; fall back to revalidation only where it does not.

## 5. Architecture Decisions

### 5.1 Recommended Approach: SWR With A Manual-Revalidation Config

Use `swr@2.x` with a single site-wide `<SWRConfig>` mounted in the admin layout, plus per-call overrides where a page needs them. SWR fits because:

- It is ~4.4 KB and the cache is a module-level singleton — no provider is required for correctness; we add one only to distribute defaults.
- It deduplicates concurrent requests and integrates with the React lifecycle, which a hand-rolled `Map` cache does not.
- It adds at most one hook (`useSWR`) to the architecture for reads; mutation invalidation uses the imperative `mutate`. `useSWRMutation` is deferred (§11).
- The `_actions/*.ts` layer and `@idco/lib` stay untouched.

### 5.2 The Site-Wide Config, And Why Each Flag Is Set The Way It Is

This is the most consequential part of the document. The previous draft's config contained a flag (`revalidateOnMount: true`) that silently defeated Goal #1 and Goal #3. The corrected config:

```ts
// workers/ui/src/shared/swr-config.ts
export const ADMIN_SWR_CONFIG: SWRConfiguration = {
  revalidateIfStale: false,      // do NOT refetch on mount when cache exists
  revalidateOnFocus: false,      // no refetch on tab focus
  revalidateOnReconnect: false,  // no refetch on network restore
  keepPreviousData: true,        // hold prior data across key changes within one mounted hook
  dedupingInterval: 5_000,       // collapse duplicate concurrent requests
  // revalidateOnMount: INTENTIONALLY UNSET — see below
  // errorRetryCount handled via onErrorRetry, see §9.1
};
```

Per-flag rationale:

- **`revalidateOnMount` must stay unset.** Per SWR's documented precedence (verified against the API docs and discussion #1400), an explicit `revalidateOnMount: true` *always* fetches on mount, even when cached data exists — `revalidateIfStale: false` does not override it. That combination would refetch on every back-navigation, which is exactly what Goal #1 forbids. Left unset, SWR's rule is: fetch on mount only when there is no cached data **or** `revalidateIfStale` is true. With `revalidateIfStale: false`, that yields precisely the desired behavior — first mount fetches, remount with cache does not. **Do not add `revalidateOnMount: true`.**
- **`revalidateIfStale: false`** is the flag that actually delivers "serve cache on navigation." It is the load-bearing setting.
- **`revalidateOnFocus` / `revalidateOnReconnect: false`** remove the two biggest silent budget-burners. With three pages cached, alt-tabbing back from another app would otherwise fire three refetches for an invisible operation.
- **`keepPreviousData: true`** smooths *in-place* key changes (pagination, filter changes) within a single mounted hook so the table does not flash a skeleton. Important nuance to record so no one re-introduces the earlier mistake: `keepPreviousData` does **nothing** across unmount/remount. Instant back-navigation comes from the persistent cache + `revalidateIfStale: false`, not from `keepPreviousData`.
- **`dedupingInterval: 5_000`** is enough to collapse concurrent mounts and double-renders. The earlier draft's 60 s value risked masking a legitimately re-requested key for a full minute; with revalidation already manual, a long dedup window buys little and can hide intended refetches.

### 5.3 Rejected And Deferred Options

| Option | Disposition | Reason |
|---|---|---|
| TanStack Query | Rejected | ~12–13 KB gzip, mandatory `QueryClientProvider`, query-key/`queryFn` ceremony. We need none of its differentiators (infinite queries, devtools, persistence). SWR's smaller surface covers the use case. |
| Hand-rolled `Map` cache in the action layer | Rejected | Solves cross-navigation caching but not concurrent-mount dedup or React lifecycle integration. Would re-implement a worse SWR. |
| App Router fetch cache / Server Components | Rejected | Admin UI runs on Vinext (Vite); there is no server runtime for these pages. |
| Keep the current model | Rejected | The members N+1 alone risks 429s, and every navigation shows a skeleton. |
| `useSWRMutation` for mutations | Deferred (§11) | Nice `isMutating` ergonomics, but adds a hook per component; manual `isSubmitting` works for now. |
| Background polling / SSE invalidation for multi-admin freshness | Deferred (§11) | Out of scope under the single-session assumption (§9.6). |

## 6. Implementation Strategy

Sequence so each phase is independently reviewable and testable, and so the highest-risk conversion (detail providers) is not bundled with the trivial ones.

```
Phase 1 — Foundation
  Install swr, add ADMIN_SWR_CONFIG, wrap admin layout in <SWRConfig>.

Phase 2 — List pages
  Convert users-list and organizations-list. Establish the key-audit discipline (§4.3) here first.

Phase 3 — Detail providers
  Convert user-detail-context and org-detail-context to useSWR INSIDE the provider.
  Preserve getCurrentSession, setUser/setCurrentSession (as local mutate), and refetch (as bound mutate).

Phase 4 — Enriched pages
  Convert members/teams/invitations. Route per-member getUser through SWR with the SAME keys the
  detail page uses, so they dedup and cache across pages.

Phase 5 — Mutations and cross-surface invalidation
  Wire mutate() invalidation; keep local-patch where the response already carries the entity.

Phase 6 — Upcoming OAuth/security pages
  New content components and providers start on SWR from first implementation.
```

Each phase ends with `pnpm check` and Ladle verification of the four story states for every touched surface. Phases 2–4 are independent and could be parallelized across sessions; Phase 5 depends on 2–4.

## 7. Detailed Implementation Plan

### 7.1 Foundation

Current problem: there is no shared fetch policy; each component invents its own.

Target behavior: one config object, one provider, applied site-wide and overridable per call.

Tasks:

- [ ] Add `swr@^2` to `workers/ui/package.json`; `pnpm install`.
- [ ] Create `workers/ui/src/shared/swr-config.ts` exporting `ADMIN_SWR_CONFIG` (the §5.2 object). Keep it side-effect-free at module level.
- [ ] Wrap the admin layout body in `<SWRConfig value={ADMIN_SWR_CONFIG}>` in `workers/ui/src/app/admin/layout.tsx`.

Illustrative fragment:

```tsx
<SWRConfig value={ADMIN_SWR_CONFIG}>{children}</SWRConfig>
```

Tests: `pnpm typecheck`; admin layout renders.

### 7.2 List Pages

Current problem: manual `useState`/`useEffect`/`fetchKey` plumbing; status (users) and search+sort (orgs) are client-side but easy to mis-key.

Target behavior: server params drive the key; client-side controls stay out of the key (§4.3); the fetcher calls the **injected** `actions`, not the bare import.

Illustrative fragment (users list — note: no `status`, debounced search only):

```tsx
const key = ["/admin/list-users", {
  limit, offset, sortBy, sortDirection,
  ...(debouncedSearch ? { searchValue: debouncedSearch, searchField: "email", searchOperator: "contains" } : {}),
  ...(role !== "all" ? { filterField: "role", filterValue: role, filterOperator: "eq" } : {}),
}];

const { data, isLoading, error, mutate } = useSWR(
  loadingOverride || errorOverride ? null : key,
  () => actions.listUsers(keyParams),       // injected actions, preserves the DI seam
);
```

Implementation tasks:

- [ ] `users-list-content.tsx`: build the key from server params only; key search on `debouncedSearch`; keep status filtering client-side over `data.users`; wire the error retry to `mutate()`; pass `null` as the key when `loadingOverride || errorOverride` so stories bypass the fetch.
- [ ] `organizations-list-content.tsx`: key is `["/organization/list"]` with no params; keep search and sort client-side; same override/retry wiring.

Tests: `pnpm test` + Ladle four states. Manual: change status filter → no network call; type in search → one call after debounce; navigate away and back → no skeleton, no call.

### 7.3 Detail Pages: Migrate The Provider, Not The Content

Current problem: the previous plan tried to convert `*-detail-overview-content.tsx`, which do not fetch. The fetch and the two-call `Promise.all` live in the providers.

Target behavior: `useSWR` moves *into* `user-detail-context.tsx` / `org-detail-context.tsx`. The provider's public shape (`user`, `currentSession`, `isLoading`, `error`, `setUser`, `setCurrentSession`, `refetch`) is preserved so no child component changes.

Mapping the existing provider API onto SWR:

- The combined fetch becomes one `useSWR` with a tuple fetcher, or two keyed `useSWR` calls (`["/admin/get-user", { id }]` and `["/get-session"]`). Two keys is preferable: it lets the per-user key dedup with the users list and the members page (§7.4), and lets the session key be shared app-wide.
- `isLoading` / `error` come from SWR; the manual `fetchKey` counter and `cancelled` flag are deleted.
- `refetch()` becomes the SWR `mutate` bound to the provider's key.
- `setUser(u)` / `setCurrentSession(s)` become `mutate(key, u, { revalidate: false })` — the local-patch path from §4.4, preserved exactly.

Illustrative fragment:

```tsx
const userKey = userId ? ["/admin/get-user", { id: userId }] : null;
const { data: userRes, isLoading, error, mutate: mutateUser } =
  useSWR(loadingOverride || errorOverride ? null : userKey, () => actions.getUser(userId));

// context value
const setUser = (u: User) => void mutateUser({ user: u }, { revalidate: false });
const refetch = () => void mutateUser();
```

Implementation tasks:

- [ ] Convert both detail providers; preserve the exposed context type verbatim.
- [ ] Keep `getCurrentSession` as its own keyed read.
- [ ] Delete `fetchKey` / `cancelled` boilerplate.

Tests: `pnpm test` + Ladle for header/overview/sessions stories (they mount the provider). Manual: edit a field → no extra GET (local patch); `refetch` triggers exactly one GET.

### 7.4 Enriched / N+1 Pages

Current problem: `organization-members-content.tsx` fans out `1 + N` uncached calls per load; nothing is shared with other pages.

Target behavior: keep the list fetch keyed as `["/organization/list-members", { organizationId }]`, but route each per-member `getUser(id)` through SWR using the **same** `["/admin/get-user", { id }]` key the detail provider uses. Result: members already viewed elsewhere are cache hits, the fan-out dedups within the page, and the rate-limit exposure drops sharply.

Implementation note: do the enrichment with a small keyed-fetch-per-id approach (e.g. a child row component that calls `useSWR(["/admin/get-user", { id }], ...)`, or a coordinated multi-key read), rather than a single `Promise.all` inside one fetcher — the latter hides the individual users from the shared cache and defeats the dedup.

Tasks:

- [ ] Members/teams/invitations: list fetch via `useSWR`; per-member user reads via the shared user key.
- [ ] Verify a member previously opened on the user-detail page renders without a network call.

Tests: `pnpm test` + manual rate-limit check (open an 8-member org; count network calls; confirm second visit is near-zero).

### 7.5 Mutations And Invalidation

Target behavior: pessimistic by default; local-patch where the response carries the entity (§4.4); predicate-based invalidation for cross-surface lists.

Illustrative fragments:

```tsx
// create on a list page → revalidate this list key
await actions.createUser(body);
await mutate();

// ban on the detail provider → local patch, no refetch
const updated = await actions.banUser(userId);
setUser(updated.user);

// cross-surface: a detail mutation must refresh any list page
import { mutate as globalMutate } from "swr";
await globalMutate((k) => Array.isArray(k) && k[0] === "/admin/list-users");
```

Tasks:

- [ ] Wire create/update/delete on list pages to `mutate()` the list key.
- [ ] Keep detail mutations on the local-patch path; add a predicate `globalMutate` for the list key so the list reflects the change on next visit.
- [ ] On delete from a detail page, invalidate the list key then navigate away.

Tests: `pnpm test` + manual: create shows in list; rename on detail reflects in list on return; delete removes from list.

### 7.6 Upcoming OAuth / Security Pages

Every new content component or provider starts on SWR. New `_actions/<domain>.ts` files remain pure fetch wrappers over `authApiGetOrThrow` / `authApiPostOrThrow` with typed returns and no SWR imports. Apply §4.3 (key audit) and §4.4 (mutation policy) from the first implementation. Endpoints currently blocked on API gaps (sessions/tokens list, consents list) are deferred until those endpoints exist.

## 8. Compatibility, Stories, And Tests

- **DI seam preserved.** Fetchers call `actions.listX(...)`, not the bare import. Stories and tests keep overriding behavior by passing a fake `actions` prop. Where a story already uses `vi.mock`, that continues to work; the `actions` prop remains the primary seam.
- **Story overrides bypass SWR.** When `loading` or `error` override props are set, pass `null` as the key so SWR never fetches and the component renders the forced state. No story file changes required for the four standard states.
- **No new global hooks in tests.** SWR's module cache is shared across tests in a worker project. Where a test asserts a specific cache outcome, clear the cache in a scoped `beforeEach` (e.g. via a fresh `SWRConfig` provider with a per-test cache `provider: () => new Map()`), inside the relevant `describe`, not globally — consistent with the barrel-file hook rules in `CLAUDE.md`.

## 9. Edge Cases And Failure Modes

### 9.1 Rate-limit / 429 handling

Default `errorRetryCount` retries on every error, including 429 — which spends more of the budget you are protecting. Provide an `onErrorRetry` that does **not** retry on 429 (and caps other retries at ~2 with backoff). With `keepPreviousData`, the user keeps seeing the last good data behind an error banner rather than a blank page.

### 9.2 First-mount failure, then no retry

With `revalidateIfStale: false`, a key whose first fetch failed (no cached data) will not auto-refetch on later mounts. This is intentional — no hammering a failing API. Recovery is explicit: the `ErrorAlert` retry calls `mutate()`, or a key change re-triggers.

### 9.3 Stale cache after another admin writes

Two sessions share one database; admin A's write is invisible to admin B's cache until B acts. Acceptable under the single-session assumption (§9.6). Background polling / SSE is future backlog.

### 9.4 Duplicate mutation submission

Double-clicking a confirm button can fire two writes. Track `isSubmitting` locally and pass `confirmDisabled` to `ConfirmDialog` (current pattern). `useSWRMutation`'s `isMutating` would do this natively — deferred.

### 9.5 Large list responses

Lists are already paginated (`limit: 25`); with `keepPreviousData` at most the current and previous page coexist. No special handling.

### 9.6 Module-singleton cache and multi-session in one browser

The cache key is URL + server params; it is **session-agnostic**, while responses are session-scoped via cookie. If two different admin principals share one browser context, the second could read cache populated by the first. This is **not** merely theoretical — it is a real consequence of a shared singleton. It is accepted because the deployment assumption is one admin principal per browser context. If that assumption ever breaks, the mitigation is a `provider`-scoped cache keyed by session identity (future backlog), not a code change to individual pages.

## 10. Implementation Backlog

### R1-A. Foundation: install and configure SWR

Scope:

- `workers/ui/package.json`
- `workers/ui/src/shared/swr-config.ts`
- `workers/ui/src/app/admin/layout.tsx`

Tasks:

- [ ] Add `swr@^2`; `pnpm install`.
- [ ] Create `ADMIN_SWR_CONFIG` exactly as §5.2 (no `revalidateOnMount`).
- [ ] Wrap admin layout in `<SWRConfig>`.

Acceptance criteria:

- `pnpm typecheck` passes; layout renders; config has no `revalidateOnMount` key.

Tests: `pnpm typecheck`.

### R1-B. Convert list pages

Scope:

- `workers/ui/src/app/admin/_components/identity/users-list-content.tsx`
- `workers/ui/src/app/admin/_components/identity/organizations-list-content.tsx`

Tasks:

- [ ] Key from server params only; users search keyed on debounced value; status stays client-side; orgs key has no params.
- [ ] Fetcher calls injected `actions`.
- [ ] `null` key on `loading`/`error` overrides; retry wired to `mutate()`.

Acceptance criteria:

- Status filter change → 0 calls. Debounced search → 1 call. Back-navigation → no skeleton, 0 calls.

Tests: `pnpm test` + Ladle four states.

### R1-C. Convert detail providers

Scope:

- `workers/ui/src/app/admin/_components/identity/user-detail-context.tsx`
- `workers/ui/src/app/admin/_components/identity/org-detail-context.tsx`

Tasks:

- [ ] Move fetch into the provider via `useSWR`; keep `getCurrentSession` as its own key.
- [ ] Preserve the context type; map `setUser`/`setCurrentSession` to `mutate(key, data, { revalidate: false })`, `refetch` to bound `mutate`.
- [ ] Delete `fetchKey`/`cancelled`.

Acceptance criteria:

- Header/overview/sessions children unchanged and rendering. Edit → no extra GET. `refetch` → exactly one GET.

Tests: `pnpm test` + Ladle.

### R1-D. Convert enriched pages with shared user keys

Scope:

- `workers/ui/src/app/admin/_components/identity/organization-members-content.tsx`
- `organization-teams-content.tsx`, `organization-invitations-content.tsx`

Tasks:

- [ ] List fetch via `useSWR`; per-member user reads keyed `["/admin/get-user", { id }]` (shared with detail provider).
- [ ] Confirm cross-page dedup.

Acceptance criteria:

- Second visit to an org's members is near-zero calls; previously-viewed members are cache hits.

Tests: `pnpm test` + manual network count.

### R1-E. Mutations and cross-surface invalidation

Scope:

- list and detail content components touched in R1-B/R1-C

Tasks:

- [ ] List mutations → `mutate()` list key.
- [ ] Detail mutations → local patch + predicate `globalMutate` for the list key.
- [ ] Delete-from-detail → invalidate then navigate.

Acceptance criteria:

- Create/update/delete reflect on the affected surfaces without manual refresh.

Tests: `pnpm test` + manual smoke.

### R1-F. OAuth/security action files and components (per screen)

Scope:

- new `workers/ui/src/app/admin/_actions/*.ts` and content components per screen spec

Tasks:

- [ ] Action files: pure fetch wrappers, typed, no SWR imports.
- [ ] Content/providers start on SWR with a §4.3 key audit.

Acceptance criteria: per-screen, mirrors R1-B/R1-C.

Tests: Ladle four states per screen.

## 11. Future Backlog

- **`useSWRMutation`** for native `isMutating` and mutation dedup. Deferred to avoid a hook-per-component cost now.
- **Multi-admin freshness** via `refreshInterval` polling or SSE-driven invalidation. Only if multi-session admin usage is confirmed.
- **Session-scoped cache provider** (`provider` keyed by session id) if the one-principal-per-browser assumption (§9.6) is dropped.
- **`useSWRInfinite`** if any list UX moves from numbered pages to "load more."
- **`fallbackData` from SSR** if Vinext ever gains a server runtime for admin data.

## 12. Definition Of Done

- [x] `ADMIN_SWR_CONFIG` matches §5.2 and contains **no** `revalidateOnMount` key.
- [x] `<SWRConfig>` wraps the admin layout (via the `AdminSwrProvider` client wrapper).
- [x] List pages keyed by server params only; users search keyed on debounced value; status/org-search/org-sort remain client-side.
- [x] Detail providers fetch via SWR with the context type preserved; `setUser`/`setCurrentSession`/`setOrg` are local patches; `getCurrentSession` is its own key.
- [x] Enriched pages route per-member/inviter user reads through the shared `userDetailKey` via `useUsersByIds`, which back-populates the per-user cache for cross-page dedup.
- [x] Mutations follow §4.4; cross-surface lists invalidate via predicate `mutate` (in providers' setters and in the two delete flows).
- [x] `onErrorRetry` does not retry on 429.
- [x] `actions`-injection seam intact; overrides pass a `null` key to bypass SWR; all 546 tests pass.
- [x] `pnpm check` and `pnpm deploy:ui:dry-run` pass.
- [ ] Back-navigation renders from cache with no skeleton/network call — guaranteed by config (`revalidateIfStale: false`, no `revalidateOnMount`) and unit-tested; live click-through not run in this pass.

## 13. Final Model

```
Admin layout
  └─ <SWRConfig value={ADMIN_SWR_CONFIG}>   // manual-revalidation cache (no revalidateOnMount)
       ├─ List page
       │    └─ useSWR([endpoint, SERVER params only], () => actions.listX(params))
       │         client-side view state (status, org search/sort) never enters the key
       ├─ Detail route layout
       │    └─ Detail provider
       │         ├─ useSWR(["/admin/get-user", {id}], ...)   // shared with members page
       │         ├─ useSWR(["/get-session"], ...)
       │         ├─ setUser  = mutate(key, data, { revalidate: false })   // local patch
       │         └─ refetch  = mutate(key)
       └─ Enriched page
            ├─ useSWR(["/organization/list-members", {orgId}], ...)
            └─ per-member useSWR(["/admin/get-user", {id}], ...)  // dedups & caches across pages

Behavior:
  first mount, no cache   → fetch
  remount with cache      → serve cache, NO fetch       (revalidateIfStale: false; revalidateOnMount unset)
  tab focus / reconnect   → no fetch
  user action / mutation  → explicit fetch or local patch
  429                     → no retry; last good data stays behind an error banner
```

The action layer (`_actions/*.ts`) and the `@idco/lib` auth-fetch helpers are unchanged. SWR is a component- and provider-level cache that sits between rendering and the action functions: it deduplicates requests, serves cache across navigation, and revalidates only when explicitly told to.
</content>
</invoke>
