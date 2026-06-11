# 027 — Admin UI Enrichment & Redesign

> Status: implemented through Phase 4e; Phase 5 scoped surfaces started (dashboard stats, token decoder/introspection, application effective-access summary)
>
> Date: 2026-05-30
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — admin UI (`workers/ui`), shared components (`packages/ui`), and one new core plugin (`workers/core/src/auth/plugins/admin-activity-log`)
>
> Source docs:
>
> - `design.md` (owner field notes — the origin of this work)
> - [docs/022_admin-ui-system.md](022_admin-ui-system.md) — design system + token reference
> - [docs/023_admin-screen-story-strategy.md](023_admin-screen-story-strategy.md) — screen + story contract
> - [docs/025_admin-ui-swr-caching-strategy.md](025_admin-ui-swr-caching-strategy.md) — SWR strategy
> - [docs/026_admin-oauth-security-screens-and-api-contracts.md](026_admin-oauth-security-screens-and-api-contracts.md) — aggregate read endpoints (`admin-audit`)
>
> Related docs:
>
> - `.claude/skills/id-admin-ui` — component registry, token values, hard rules
> - React Aria Components + react-stately docs (verified for this doc): `TagGroup`, `Autocomplete`, `useFilter`, `useListData`, `useAsyncList`
> - [workers/ui/docs/screens/](../workers/ui/docs/screens/) — existing screen specs (to be superseded screen-by-screen)
>
> Assumptions:
>
> - The owner has confirmed four decisions (§4.4): JWKS emergency-rotate only; OAuth Applications detail-route + wizard; build the `admin-activity-log` audit backend; this doc is redesign-first, not ticket-first.
> - The snake_case OAuth2 client API boundary and the camelCase D1 storage shape are both unchanged by this work.
> - React Aria Components (`react-aria-components`) and the `react-aria`/`react-stately` hook packages are already dependencies of `packages/ui` (used today in `form.tsx`, `data-table.tsx`, `filter-dropdown.tsx`, etc.).

## Table Of Contents

- [1. Goal And Non-Goals](#1-goal-and-non-goals)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 OAuth Applications](#31-oauth-applications)
  - [3.2 JWKS](#32-jwks)
  - [3.3 Scope Catalog, M2M, Resource APIs](#33-scope-catalog-m2m-resource-apis)
  - [3.4 Identity: Users And Organizations](#34-identity-users-and-organizations)
  - [3.5 Grants Surfaces (Sessions / Tokens / Consents)](#35-grants-surfaces-sessions--tokens--consents)
  - [3.6 Cross-Cutting Gaps](#36-cross-cutting-gaps)
- [4. Design Principles And Standards Classification](#4-design-principles-and-standards-classification)
  - [4.5 React Aria And React Stately Adoption Posture](#45-react-aria-and-react-stately-adoption-posture)
- [5. Component Toolkit (Detailed)](#5-component-toolkit-detailed)
  - [5.1 StatGroup / Stat](#51-statgroup--stat)
  - [5.2 Switch](#52-switch)
  - [5.3 Disclosure / Accordion](#53-disclosure--accordion)
  - [5.4 DescriptionList](#54-descriptionlist)
  - [5.5 ScopeBuilder (Autocomplete + TagGroup)](#55-scopebuilder-autocomplete--taggroup)
  - [5.6 ResourceSelector (Autocomplete + ListBox/TagGroup + useAsyncList)](#56-resourceselector-autocomplete--listboxtaggroup--useasynclist)
  - [5.7 UrlListBuilder](#57-urllistbuilder)
  - [5.8 Stepper / Wizard](#58-stepper--wizard)
  - [5.9 Timeline](#59-timeline)
  - [5.10 JsonViewer And CodeEditor](#510-jsonviewer-and-codeeditor)
  - [5.11 FileDropzone](#511-filedropzone)
  - [5.12 Drawer (Optional)](#512-drawer-optional)
- [6. Information Architecture: The Grants Section](#6-information-architecture-the-grants-section)
- [7. Redesign: JWKS / Signing Keys](#7-redesign-jwks--signing-keys)
- [8. Redesign: OAuth Applications](#8-redesign-oauth-applications)
- [9. Redesign: Identity (Users And Organizations)](#9-redesign-identity-users-and-organizations)
  - [9.1 Users List](#91-users-list)
  - [9.2 User Detail](#92-user-detail)
  - [9.3 Organizations List And Detail](#93-organizations-list-and-detail)
  - [9.4 Members, Teams, Invitations (ResourceSelector)](#94-members-teams-invitations-resourceselector)
  - [9.5 Identity API Gaps](#95-identity-api-gaps)
- [10. Redesign: Scope Catalog](#10-redesign-scope-catalog)
- [11. Redesign: M2M Bindings And Resource APIs](#11-redesign-m2m-bindings-and-resource-apis)
- [12. Backend: admin-activity-log Plugin](#12-backend-admin-activity-log-plugin)
- [13. Net-New Surfaces](#13-net-new-surfaces)
- [14. Edge Cases And Failure Modes](#14-edge-cases-and-failure-modes)
- [15. Implementation Backlog (Phased)](#15-implementation-backlog-phased)
- [16. Definition Of Done](#16-definition-of-done)
- [17. Final Model](#17-final-model)

## 1. Goal And Non-Goals

**Goal.** Take the admin console from "functional list pages with inline modals" to a richer, detail-oriented identity admin surface comparable to Auth0/Okta, by (a) building a reusable component toolkit that fully embraces React Aria + react-stately, (b) unifying the grants information architecture, (c) redesigning the high-value screens (JWKS, OAuth Applications, **Identity users/orgs**, Scope Catalog) into detail-route experiences with catalog-aware inputs, and (d) adding an append-only activity log that powers an Audit tab on every entity.

This document is **redesign-first**: most of its length is in §5 (components) and §7–§11 (screen redesigns), with exact component trees, ASCII layouts, data shapes, states, and interaction behavior. The backlog (§15) is deliberately thin — it sequences the redesign, it does not replace it.

**Non-goals (first release).**

- No change to the OAuth2/OIDC protocol surface or token issuance. Redesigns re-present existing endpoints; the only new read endpoint is the activity log (plus optional identity helpers in §9.5).
- No per-`kid` cryptographic usage analytics (no data source exists; the JWKS Metrics tab ships as a visible stub).
- No server-side draft persistence for client registration (client-side `localStorage` only).
- No SET/SSF event surfaces (`/admin/events/*` stays deferred per [workers/ui/docs/screens/index.md](../workers/ui/docs/screens/index.md)).

## 2. System Summary

The admin UI is the `ui-id` worker. Every `/admin/*` route is a thin composition file that assembles `@idco/ui` primitives; data lives in content components that fetch through `useSWR` and injected `actions` (see [docs/023](023_admin-screen-story-strategy.md), [docs/025](025_admin-ui-swr-caching-strategy.md)). The chrome (`AppShell > Topbar + SidebarLayout(Sidebar + MainContent) + MobileDock`) is fixed; pages render inside `PageBody`. Cross-navigation caching is manual-revalidation SWR keyed on server params only.

Data flows from the `core-id` worker's Better Auth endpoints under `/api/auth/*`. Users come from the Better Auth **admin** plugin (`/api/auth/admin/*`, server-side search + pagination); organizations, teams, members, and invitations from the **organization** plugin (`/api/auth/organization/*`, list-and-filter). The OAuth2 client API is snake_case (RFC 7591); admin aggregate reads (sessions, tokens, consents, JWKS metadata) come from the `admin-audit` plugin ([docs/026](026_admin-oauth-security-screens-and-api-contracts.md)). Custom tables are Better Auth plugin schemas; `workers/core/src/db/schema.ts` stays empty.

## 3. Current-State Findings

### 3.1 OAuth Applications

- Files: [applications-content.tsx](../workers/ui/src/app/admin/_components/oauth/applications-content.tsx), route [oauth/applications/page.tsx](../workers/ui/src/app/admin/oauth/applications), actions `_actions/oauth.ts`, SWR key `oauthClientsKey()`.
- The page is **already more advanced than its spec**: a `DataTable<OAuthClient>` (Application / Type / Redirects / Scopes / Grants / Actions), a `SearchInput` over `client_name` + `client_id`, and a **tabbed `ConfirmDialog`** create flow (RadioGroup type → Name → auth method → `Tabs[Access, Metadata]`). `clientType()` derives M2M / Public / Confidential from `grant_types` + `token_endpoint_auth_method`.
- Mutations are pessimistic: `createClient`/`updateClient`/`rotateClientSecret`/`deleteClient`, each followed by `mutate()`. Secret reveal is a show-once `ConfirmDialog` + `CodeBlock`.
- `Textarea`, `PageIntro`, `DataTable`, `ConfirmDialog`, `Tabs`, `RadioGroup` all exist in `@idco/ui` (the skill registry omits `Textarea` — it is present and used here).

**Problems.** Everything is crammed into one route: no per-client detail surface, no connections/audit/quickstart home, free-text redirect URIs (no validation), space-delimited free-text scopes (no catalog autocomplete), and a tall branching create modal.

### 3.2 JWKS

- Files: [jwks-content.tsx](../workers/ui/src/app/admin/_components/security/jwks-content.tsx), actions `_actions/audit.ts` (`listAdminJwks` → `AdminJwk[]`), SWR key `adminJwksKey()`.
- Reads `GET /api/auth/admin/jwks` which already returns `{ id, alg, createdAt, expiresAt, status, publicJwk }` with `status ∈ {active, rotated, expired}` and **never** the private key. Renders a one-`Panel`-per-key **card stack** with a summary badge row, a three-column `Grid`, and a `CodeBlock` of the public JWK.

**Problems.** A card stack does not scale, buries the summary, has no detail surface, no public-JWK download, no operator action, and no audit context.

### 3.3 Scope Catalog, M2M, Resource APIs

- Files: `scope-catalog-content.tsx`, `m2m-bindings-content.tsx`, `resource-apis-content.tsx`. Endpoints exist (scopes `GET/POST/PATCH`; client-resource bindings `GET/POST/PATCH/DELETE`; resource servers `GET/POST/PATCH/DELETE + enable/disable`). Scope hard-delete is intentionally absent (disable is the permanent primitive). Schemas already carry `createdBy`/`updatedBy`/`createdAt`/`updatedAt`.

**Problems.** No summary stats; free-text scope entry/search; no bulk creation; existing audit fields unsurfaced.

### 3.4 Identity: Users And Organizations

- Files: users — [users-list-content.tsx](../workers/ui/src/app/admin/_components/identity/users-list-content.tsx), `user-detail-context.tsx`, `user-detail-header-content.tsx`, `user-detail-overview-content.tsx`, `user-sessions-content.tsx`; orgs — `organizations-list-content.tsx`, `org-detail-context.tsx`, `org-detail-header-content.tsx`, `org-detail-overview-content.tsx`, `organization-members-content.tsx`, `organization-teams-content.tsx`, `organization-invitations-content.tsx`. Actions: `_actions/users.ts`, `_actions/organizations.ts`.
- Observed API surface:
  - **Users** (`/admin/*`): `listUsers({ searchValue, searchField:"email"|"name", searchOperator, limit, offset, sortBy, sortDirection, filterField, filterValue, filterOperator })` → `{ users, total, … }` — **server-side search + pagination exist.** Plus `getUser`, `createUser`, `updateUser`, `setRole`, `setUserPassword`, `banUser`/`unbanUser`, `impersonateUser`/`stopImpersonating`, `removeUser`, `listUserSessions`, `revokeUserSession(s)`.
  - **Organizations** (`/organization/*`): `listOrganizations()` (no server search — client filter), `getFullOrganization`, `create/update/deleteOrganization`, `checkSlug`; members `listMembers(orgId)`, `updateMemberRole(memberId, role)`, `removeMember`, `inviteMember(orgId, email, role, resend?)`, `cancelInvitation`, `listInvitations`; teams `listTeams(orgId)`, `createTeam`, `updateTeam`, `removeTeam`, `listTeamMembers(teamId)`, **`addTeamMember(teamId, userId, orgId)`**, `removeTeamMember`.

**Problems.**

- **Visual.** The identity pages are the oldest surface and read as dense tables with little hierarchy — no `StatGroup` headers, no `Avatar` usage in lists, weak status/role affordances, and overview pages that are flat field dumps rather than scannable `DescriptionList` + action groupings. They look noticeably more primitive than the OAuth screens.
- **Resource selection is the core missing primitive.** `addTeamMember` takes a raw `userId` with **no picker** — an admin must already know the id. The same "pick a user / pick an org / pick a team / pick a member" need recurs across team membership, (future) ownership assignment, and impersonation search. There is no `ResourceSelector` component, so these flows are either id-paste or absent.
- **Member/invitation rows show ids, not people.** Members and team members carry only `userId`; the UI must enrich names via the existing `useUsersByIds` hook, which is inconsistently applied.

### 3.5 Grants Surfaces (Sessions / Tokens / Consents)

- Historical finding before this redesign: `oauth/sessions-tokens` (in-page tabs) lived under **`/admin/oauth`**, while `security/consents` and `security/jwks` lived under **`/admin/security`**. All read `admin-audit` aggregate endpoints.
- Current implementation: `/admin/oauth/sessions-tokens` permanently redirects to `/admin/security/sessions`; sessions, access tokens, refresh tokens, consents, signing keys, and token decoding live under URL-addressable `/admin/security/*` tabs.

**Resolved problem.** Sessions, tokens, and consents are facets of one concept (live grants); they are no longer split across OAuth and Security, and the old in-page tabs are now route tabs.

### 3.6 Cross-Cutting Gaps

- No reusable primitives for: summary stats, boolean toggle, expandable disclosure, key/value description list, **tag/scope entry**, **resource selection**, URL-list entry, multi-step wizard, timeline, editable JSON, file upload.
- No activity history anywhere. The similarly-named `admin-audit` plugin is a **read-only aggregator of live tables**, not an event log.

## 4. Design Principles And Standards Classification

### 4.1 Standards-first classification

Per `CLAUDE.md`, every mechanism is tagged before it is recommended:

- **[Protocol]** — defined by an OAuth2/OIDC/SCIM/JOSE RFC. Always preferred.
- **[Industry]** — established interoperability standard or near-universal pattern.
- **[BA]** — a Better Auth-supported capability.
- **[Repo]** — repository-specific extension; allowed only with a documented unmet requirement.
- **[UI]** — presentation-only; standards-neutral.

Any **[Repo]** item carries a one-line justification of why the relevant standard is insufficient.

### 4.2 UI invariants (inherited, non-negotiable)

- Route files compose `@idco/ui` only: no raw HTML tags, no DaisyUI classes, no Tailwind visual utilities, no `react-aria-components`/`lucide-react` imports, no `useSearchParams`/`useRouter` inside content components. New visual control is added as **typed props on a component**, never as `className`.
- New `@idco/ui` files live in the sibling idco repo: DaisyUI cite comment on line 1, side-effect-free at module scope (`sideEffects: false`), default size `md`, tests under `/home/quanghuy1242/pjs/idco/tests/ui/`, registry update after auth repins.
- New `/admin` routes are gated on a screen spec in `workers/ui/docs/screens/`.
- Content components own their data via `useSWR` with keys built from `_data/swr-keys.ts`; mutations are pessimistic with cross-surface invalidation by predicate.

### 4.3 Redesign principles

1. **Detail routes over tall modals** for any entity with more than ~6 fields or more than one concern.
2. **Catalog-aware inputs over free text.** Scopes pick from the live catalog (`ScopeBuilder`); users/orgs/teams pick from a searchable list (`ResourceSelector`); redirect URIs validate per OAuth rules; booleans use a `Switch`.
3. **Every entity gets an Audit tab** backed by `admin-activity-log`.
4. **Stats summarize, tables enumerate, detail pages explain.** Replace card/field dumps with `StatGroup + DataTable + detail route`.

### 4.4 Confirmed decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | JWKS **emergency-rotate only** | Keep BA automatic rotation; expose only a guarded compromise-response action through plugin keygen. No raw per-key disable. |
| 2 | OAuth Applications **detail route + wizard** | One route cannot hold settings + connections + audit + quickstart; M2M vs web-app branching is cleaner as a stepper. |
| 3 | **Build `admin-activity-log`** | Audit history is table stakes and unblocks every Audit tab. |
| 4 | **Redesign-first doc** | Detail belongs in component and screen specs, not tickets. |

### 4.5 React Aria And React Stately Adoption Posture

The first draft of this plan under-credited React Aria. Correction and posture:

- **React Aria Components ships the primitives we need as first-class components**, not just low-level hooks. Verified for this doc: **`TagGroup`/`TagList`/`Tag`** (focusable, removable chips with `onRemove`, `selectionMode`, keyboard nav) and **`Autocomplete`** (composes a `SearchField`/`TextField` with a `Menu`/`ListBox`/`TagGroup`/`GridList`/`Table`, with virtual focus so arrow keys work while the input is focused). The documented `Autocomplete + TagGroup` example **is** a tag builder; the `Autocomplete + ListBox` example **is** a searchable picker. We should compose these, not reinvent them.
- **react-stately state hooks are the data spine for these compositions.** `useFilter({ sensitivity })` gives locale-aware client filtering; **`useListData`** manages an in-memory selected/insert/remove list (ideal for `ScopeBuilder` chips); **`useAsyncList`** manages server-backed, debounced search with `filterText` + `signal` (ideal for `ResourceSelector` over `/admin/list-users`). Embrace these instead of hand-rolling `useState` list logic.
- **Where DaisyUI styling depends on native pseudo-classes** (`:checked`, `:is([type=radio])`), keep using the lower-level `react-aria` hooks with a native input (the existing `form.tsx` pattern). This is not a contradiction: use RAC components where they own their own DOM (TagGroup, Autocomplete, ListBox), and use react-aria hooks where DaisyUI must style a native input (Switch, Checkbox, RadioGroup).
- **Net effect on the toolkit:** `ScopeBuilder` and `ResourceSelector` are thin DaisyUI skins over `Autocomplete` + `TagGroup`/`ListBox` + `useListData`/`useAsyncList`/`useFilter`. They are smaller and more robust than a bespoke implementation, and they inherit React Aria's accessibility for free.

## 5. Component Toolkit (Detailed)

Each component below is specified to implementation grade: file path, DaisyUI cite, React Aria base, typed prop surface, internal class mapping, states, and an ASCII anatomy. These components now live in `/home/quanghuy1242/pjs/idco/packages/ui/src/`, export from idco's `packages/ui/src/index.ts`, register in the `id-admin-ui` skill registry after auth repins, and carry package tests under `/home/quanghuy1242/pjs/idco/tests/ui/`.

### 5.1 StatGroup / Stat

- File: `packages/ui/src/stat.tsx` · DaisyUI: `https://daisyui.com/components/stat/` · React Aria base: none (static); optional `Meter`/`ProgressBar` slot uses RA `Meter`.
- Purpose: the summary KPI row at the top of JWKS, Scopes, M2M, Users, Orgs, Dashboard.

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Total keys   │ Active       │ Rotated      │ Expired      │
│ 4            │ 1            │ 2            │ 1            │
│ all signing  │ signs new ▲  │ in grace ◷   │ audit only   │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

- Props: `StatGroup`: `children`, `columns?: "auto" | 2 | 3 | 4`, `layout?: "grid" | "inline"` for compact non-full-width summaries. `Stat`: `title`, `value: ReactNode`, `description?`, `tone?: "neutral" | "primary" | "success" | "warning" | "error" | "info"`, `iconName?: string` (NavIcon in `stat-figure`), `meter?: { value: number; max: number }`.
- States: numeric value; `value` may be a `Skeleton` while loading.
- Tests: title/value/description render; tone class on value; columns class; meter renders when passed.

### 5.2 Switch

- File: `packages/ui/src/switch.tsx` · DaisyUI: `https://daisyui.com/components/toggle/` · React Aria base: **`useSwitch` + `useToggleState` hooks** with a native `<input type="checkbox" role="switch" class="toggle">` (DaisyUI `toggle` depends on `:checked`; do not use the RAC `Switch` wrapper). Mirrors `Checkbox` in [form.tsx](../packages/ui/src/form.tsx).
- Purpose: enable/disable booleans (scope enabled, resource-server enabled, binding enabled, user ban).
- Props: `label`, `name?`, `selected?`, `defaultSelected?`, `onChange?: (v: boolean) => void`, `size?: "sm" | "md"`, `tone?: "primary" | "success"`, `disabled?`.
- States: on / off / disabled / focus-visible (native). Tests: toggles on click + space; `onChange` fires; size/tone classes; disabled blocks change.

### 5.3 Disclosure / Accordion

- File: `packages/ui/src/disclosure.tsx` · DaisyUI: `https://daisyui.com/components/collapse/` · React Aria base: `Disclosure` / `DisclosureGroup` (RAC).
- Props: `Disclosure`: `title: ReactNode`, `children`, `defaultExpanded?`, `expanded?`, `onExpandedChange?`, `icon?: "chevron" | "plus"`. `DisclosureGroup`: `children`, `allowsMultiple?`.
- States: collapsed / expanded; keyboard toggle. Tests: expand/collapse on click + Enter; controlled mode; single-vs-multiple group.

### 5.4 DescriptionList

- File: `packages/ui/src/description-list.tsx` · DaisyUI: `https://daisyui.com/components/list/` (sizing) · React Aria base: none. Replaces the `Grid(columns="two") > Text(caption)+Text(body)` block re-derived in JWKS, client overview, org overview, consent rows.
- Props: `items: { term: string; description: ReactNode; mono?: boolean }[]`, `columns?: 1 | 2 | 3`, `dense?: boolean`. Renders semantic `<dl>/<dt>/<dd>`.
- States: static; `description` may be `Badge`/copy `Button`/`Skeleton`. Tests: pairs render; `mono` applies font-mono; columns class.

### 5.5 ScopeBuilder (Autocomplete + TagGroup)

- File: `packages/ui/src/scope-builder.tsx` · DaisyUI: `https://daisyui.com/components/badge/` + `input` · React Aria base: **`Autocomplete` + `TagGroup` (both RAC) + `useFilter` + `useListData` (react-stately)**. This is the documented React Aria "Autocomplete + TagGroup" tag-builder pattern, skinned with DaisyUI — not a bespoke widget.
- Purpose: enter OAuth scopes by filtering the live catalog and selecting; display as removable badges. Reused for client scopes (§8), resource scopes, and M2M `allowedScopes`.

```
Scopes
┌───────────────────────────────────────────────┐
│ [openid ✕] [profile ✕] [content:read ✕]       │  ← TagGroup (useListData items, onRemove)
│ ┌───────────────────────────────────────────┐ │
│ │ content:│   ← SearchField (Autocomplete)   │ │
│ ├───────────────────────────────────────────┤ │
│ │ content:read     Content API               │ │  ← ListBox filtered via useFilter.contains
│ │ content:write    Content API               │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

- Props: `label`, `value: string[]`, `onChange: (next: string[]) => void`, `suggestions?: { value: string; description?: string; group?: string }[]` (catalog; grouped by resource server), `allowCustom?: boolean`, `validate?: (scope: string) => string | undefined` (default: the `^[a-z][a-z0-9:_-]*$` pattern from the scope schema), `name?: string` (hidden joined field), `size?`.
- Behavior: selecting a suggestion or pressing Enter adds a chip (`list.append`); ✕ or Backspace-on-empty removes (`list.remove`); duplicates ignored; invalid custom values rejected with inline `FieldError`. `useFilter({ sensitivity: "base" })` drives client filtering of `suggestions`.
- States: empty / populated / invalid-entry / no-suggestions. Tests: add via Enter and via selection; remove via ✕ and Backspace; dedupe; `validate` rejects bad scope; hidden field serialization; `onChange` payload.

### 5.6 ResourceSelector (Autocomplete + ListBox/TagGroup + useAsyncList)

- File: `packages/ui/src/resource-selector.tsx` · DaisyUI: `https://daisyui.com/components/dropdown/` + `input` + `badge` + `avatar` · React Aria base: **`Autocomplete` + `ListBox` (single) or `TagGroup` (multi) + `useAsyncList` (server search) or `useFilter` (client filter), all RAC/react-stately.** This is the documented "Autocomplete + ListBox with `useAsyncList` async loading" pattern.
- Purpose: the missing identity primitive — pick a user, org, team, or member from a searchable list, returning the **id** the API expects. Reused by team-add-member, impersonation search, ownership assignment, and any future "attach principal" flow.

```
Add team member
┌───────────────────────────────────────────────┐
│ 🔍 ali│                                         │  ← SearchField (Autocomplete inputValue→filterText)
├───────────────────────────────────────────────┤
│ (A) Alice Nguyen   alice@acme.com   member     │  ← ListBox items from useAsyncList.load({filterText})
│ (A) Alan Park      alan@acme.com    admin      │     each row: Avatar + name + email + role badge
│ (A) Alicia Gomez   alicia@beta.com  member     │
└───────────────────────────────────────────────┘
  selected → [ (A) Alice Nguyen ✕ ]   (multi: TagGroup of chosen principals)
```

- Props:
  - `kind: "user" | "organization" | "team" | "member"` — selects the default renderer (Avatar+name+email for users/members; name+slug for orgs; name for teams).
  - `selectionMode?: "single" | "multiple"` (default `single`).
  - `value: string | string[]`, `onChange: (next) => void` — ids.
  - `source: { mode: "async"; load: (q: string, signal: AbortSignal) => Promise<ResourceOption[]> } | { mode: "sync"; items: ResourceOption[] }` — `async` wires `useAsyncList` (server search, e.g. `listUsers({ searchValue })`); `sync` wires `useFilter` over a preloaded list (e.g. `listMembers(orgId)` enriched with names).
  - `placeholder?`, `name?` (hidden field of joined ids), `excludeIds?: string[]` (hide already-chosen), `renderOption?: (o: ResourceOption) => ReactNode`, `size?`.
  - `variant?: "inline" | "menu"` — inline renders a visible `SearchField + ListBox` for full-form selection; menu renders a compact React Aria `MenuTrigger + Popover + Autocomplete + Menu` picker for toolbar/header use such as adding a team member.
  - `ResourceOption = { id: string; label: string; sublabel?: string; image?: string | null; badge?: string }`.
- Behavior: typing updates `filterText` (async: debounced backend fetch with `AbortSignal`; sync: local filter). Selecting calls `onChange` with the id(s). Multi mode renders chosen items as a `TagGroup` above/below the field. `excludeIds` removes current members from an "add member" search.
- States: idle / typing / loading (async) / no-results / selected(single) / selected(multi). Tests: async load called with query + abort on rapid typing; sync filter; single vs multi selection payloads; `excludeIds` filtering; renders Avatar for `user`/`member` kinds; hidden field serialization.

### 5.7 UrlListBuilder

- File: `packages/ui/src/url-list-builder.tsx` · DaisyUI: `https://daisyui.com/components/input/` + `join` · React Aria base: repeated RAC `TextField` rows + `Button` (+ `useListData` for the rows).
- Purpose: redirect URIs, post-logout redirect URIs, contacts — one validated row per entry.

```
Redirect URIs
┌─────────────────────────────────────────────┬─────┐
│ https://app.example.com/callback            │  ✕  │
├─────────────────────────────────────────────┼─────┤
│ http://localhost:3000/callback              │  ✕  │
└─────────────────────────────────────────────┴─────┘
  [+ Add redirect URI]
  ⚠ Row 3: must be https or localhost and contain no fragment
```

- Props: `label`, `value: string[]`, `onChange`, `validate?` (default: absolute URL, `https` or `localhost`, no `#fragment`), `placeholder?`, `name?` (hidden newline-joined), `minRows?`, `addLabel?`, `size?: "sm" | "md"`.
- States: single empty row / multiple / per-row invalid / at `minRows`. Tests: add/remove; per-row validation; default validator accepts https + localhost, rejects fragment/non-absolute; serialization.

### 5.8 Stepper / Wizard

- File: `packages/ui/src/stepper.tsx` · DaisyUI: `https://daisyui.com/components/steps/` · React Aria base: controlled `Tabs` (RAC) for panel switching + internal step state.

```
①─────────②─────────③─────────④─────────⑤
Type      Auth      URIs      Scopes    Review
▲ done     ▲ done     ● active   ○         ○
```

- Props: `steps: { id; label; content: ReactNode; isValid?: boolean }[]`, `activeStep`, `onStepChange`, `onComplete: () => void | Promise<void>`, `completeLabel?`, `size?: "sm" | "md"`. Next disabled when active step `isValid === false`; completed-step indicator click jumps back; final step calls `onComplete`. Form field state is owned by the caller (controlled).
- States: first / middle / final / step-invalid / submitting. Tests: Next/Back; `isValid` gates forward; jump-back; `onComplete`; indicator classes.

### 5.9 Timeline

- File: `packages/ui/src/timeline.tsx` · DaisyUI: `https://daisyui.com/components/timeline/` · React Aria base: none (semantic `<ol>`). Renders `admin-activity-log` entries on every Audit tab.

```
◉ Secret rotated      by alice@acme.com · 2026-05-30 14:02
│   token_endpoint_auth_method unchanged
◉ Redirect URI added  by bob@acme.com   · 2026-05-29 09:11
│   + https://app.example.com/callback
○ Application created  by alice@acme.com · 2026-05-01 10:00
```

- Props: `items: { id; icon?; tone?: BadgeTone; title: ReactNode; meta?: string; detail?: ReactNode }[]`, `compact?: boolean`. States: populated / empty / loading. Tests: ordered items with icon/title/meta/detail; tone class; compact spacing.

### 5.10 JsonViewer And CodeEditor

- Files: `packages/ui/src/json-viewer.tsx`, `packages/ui/src/code-editor.tsx` · DaisyUI: `https://daisyui.com/components/mockup-code/`.
- **`JsonViewer` (read-only)** wraps a lightweight highlighter (Prism or Shiki — §14 open item). Props: `value: object | string`, `label?`, `maxHeight?: "sm" | "md" | "lg"`, `action?: ReactNode`. The `design.md` "Prism code editor" note maps here — Prism highlights, it does not edit.
- **`CodeEditor` (editable)** wraps **CodeMirror 6** (`@codemirror/state`, `@codemirror/view`, `@codemirror/lang-json`). Props: `value: string`, `onChange`, `language?: "json"`, `error?`, `label?`, `readOnly?`. Must be SSR-safe (lazy-mount in `useEffect`, `<pre>` fallback) and side-effect-free at module scope. Used for client `metadata` JSON and future CEL policy expressions.
- Tests: JsonViewer highlights + copies; CodeEditor emits `onChange`, surfaces `error`, respects `readOnly`, mounts without SSR crash.

### 5.11 FileDropzone

- File: `packages/ui/src/file-dropzone.tsx` · DaisyUI: `https://daisyui.com/components/file-input/` · React Aria base: **`DropZone` + `FileTrigger` (RAC)**. Props: `label`, `accept?: string[]`, `onFiles: (files: File[]) => void`, `multiple?`, `maxSizeBytes?`, `hint?`. States: idle / drag-over / file-selected / rejected. Tests: drop + click both call `onFiles`; `accept`/`maxSizeBytes` rejection; drag-over class.

### 5.12 Drawer (Optional)

- File: `packages/ui/src/drawer.tsx` · DaisyUI: `https://daisyui.com/components/drawer/` · React Aria base: `Modal`/`ModalOverlay` (RAC) with a side transform. For quick-peek detail where a route is overkill. Props mirror `ConfirmDialog` overlay semantics + `side?: "right" | "left"`, `width?: "sm" | "md" | "lg"`. Prefer a route for durable, deep-linkable detail.

## 6. Information Architecture: The Grants Section

**Target.** Treat sessions, access tokens, refresh tokens, and consents as one section with one route-tab bar; keep JWKS as a sibling. Classification: **[UI]** — navigation only; no API change; reuses `admin-audit` endpoints.

- Route tabs (URL-addressable, `Tabs` with `href` items) under `/admin/security`: `Sessions · Access Tokens · Refresh Tokens · Consents · Signing Keys · Token Decoder`. Promote the current in-page sessions/tokens tabs into these route tabs.
- New/renamed routes (each needs a `security.md` spec entry first): `/admin/security/sessions` (from `oauth/sessions-tokens`), `/admin/security/tokens` (`type=access|refresh` query), `/admin/security/consents`, `/admin/security/jwks`, `/admin/security/introspect`. Each gains a `StatGroup` header where the screen is tabular. Redirect old `/admin/oauth/sessions-tokens`.

## 7. Redesign: JWKS / Signing Keys

**Current problem.** Card stack (§3.2): no scale, no detail route, no operator action, no audit.

**Target behavior.** Stats header + compact table on the list, a dedicated detail route per key, and a single guarded emergency-rotate action. Read endpoint unchanged; one new mutation endpoint (§7.3).

### 7.1 List page — `/admin/security/jwks`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Signing Keys                                   [⟳ Emergency rotate]  │
├──────────────┬──────────────┬──────────────┬──────────────┐         │
│ Total: 4     │ Active: 1 ▲  │ Rotated: 2 ◷ │ Expired: 1   │         │
├──────────────┴──────────────┴──────────────┴──────────────┘         │
│ Key ID ↕           Alg     Status     Created ↕    Expires           │
│ abc123def456…      EdDSA   ● Active   2026-01-15   2027-01-15        │
│ xyz789ghi012…      EdDSA   ◷ Rotated  2025-12-01   2026-06-15        │
│ old123key456…      EdDSA   ○ Expired  2025-01-15   2026-01-15        │
└─────────────────────────────────────────────────────────────────────┘
```

```
PageBody > Suspense(fallback=<JwksContent loading/>) > JwksContent
  Stack(gap="md")
    PageIntro(title="Signing Keys", info=…, actions=Button(variant="secondary", iconName="RefreshCw",
              "Emergency rotate", onClick=openRotate))
    StatGroup(columns=4): Stat(Total) Stat(Active,success) Stat(Rotated,warning) Stat(Expired,neutral)
    Panel(padding="none")
      DataTable<AdminJwk>(columns=[keyId(mono,sortable), alg, status(Badge), created(sortable), expires],
        rows=ordered, getRowKey=k=>k.id, onRowClick=k=>onKeyClick(k.id), sortBy, sortDirection, onSort)
      loading→Skeleton(rows=5) · empty→EmptyState · error→ErrorAlert(onRetry=mutate)
  EmergencyRotateDialog (§7.3)
```

Reuse the existing `counts` reduce + `ordered` sort and status badge mapping. `onKeyClick` is wired in the route file to `router.push`.

### 7.2 Detail route — `/admin/security/jwks/[kid]`

Nested-detail-layout: `jwks-detail-context.tsx` (provider; `useSWR` on the list key, select by `kid` — no per-key GET exists), header content, child page per tab.

- **Overview**: `DescriptionList(columns=2, items=[Algorithm, Status, Created, Expires, Grace ends])` + `[Download public JWK]` (exports `key.publicJwk` as `<kid>.jwk.json`; **[Protocol]** RFC 7517 public-only).
- **Public JWK**: `JsonViewer(value=key.publicJwk, action=copy + download)`.
- **Metrics**: visible stub — `EmptyState("Per-key usage metrics are not yet collected")`. No fabricated numbers.
- **Audit**: `Timeline` of `admin-activity-log` (`targetType="jwks"`, `targetId=kid`).

### 7.3 Emergency rotate — guarded action

- Classification: **[Repo]**. Justification: Better Auth's `jwt` plugin rotates on an interval and exposes no operator-initiated rotate; emergency rotation on key compromise is a legitimate, industry-standard ops capability not covered by a protocol or BA primitive.
- New endpoint `POST /api/auth/admin/jwks/rotate` (extension of `admin-audit` or a `jwks-admin` plugin): generate a new signing key **through the JWT plugin's key-generation path** (never hand-craft keys); **promote, not replace** (the previously active key stays in its grace window so live tokens still verify); emit an `admin-activity-log` entry (`action="jwks.rotate"`, actor, reason).
- UI: `ConfirmDialog(variant="danger")` with compromise-context copy + required reason; on confirm `POST …/jwks/rotate`, then `mutate(adminJwksKey())`.
- **Excluded:** raw per-key disable (breaks verification of live tokens inside the grace window).

## 8. Redesign: OAuth Applications

**Current problem.** One route holds everything (§3.1); no detail surface, free-text URIs/scopes, tall create modal.

**Target behavior.** Keep the list as an index, add a per-client detail route with tabbed concerns, move creation to a dedicated stepper page. The OAuth2 client API is unchanged (snake_case; `type` stays a UI-only convenience translated via the existing `buildClientPayload`).

### 8.1 List page

Keep `DataTable<OAuthClient>` + `SearchInput` + `PageIntro`, plus: a `StatGroup` header (total / confidential / public / M2M via `clientType()`); row click navigates to the detail route; `[New App]` navigates to `/admin/oauth/applications/new`.

### 8.2 Detail route — `/admin/oauth/applications/[clientId]`

Nested-detail-layout: `application-detail-context.tsx` (`useSWR` on `oauthClientsKey()`, select by `client_id` — no per-client GET), header, child page per tab.

```
‹ OAuth Applications
Content API   [Confidential]  cli_contentapi_…   [⟳ secret][🗑]
┌ Overview ┬ Credentials ┬ URIs ┬ Scopes & Grants ┬ Connections ┬ Quickstart ┬ Audit ┐
```

- **Overview** — `DescriptionList`: name (inline edit), type badge, status (`Switch` if `disabled` supported), created/updated → `PATCH update-client`.
- **Credentials** — client_id + copy; secret state; `[Rotate secret]` (existing show-once flow). Public clients: "no secret (PKCE)".
- **URIs** — `UrlListBuilder` for `redirect_uris` / `post_logout_redirect_uris` (hidden for M2M). Save → `PATCH update-client` with the `update:` envelope.
- **Scopes & Grants** — `ScopeBuilder` autocompleting from `GET /admin/oauth-scopes`. Grants read-only `Badge`s.
- **Connections** — the client's `oauthClientResourceScope` bindings (read `GET /admin/oauth-client-resource-scopes` filtered by `clientId`); create/edit via existing M2M actions; per-client face of §11.
- **Quickstart** — **[UI]**, no backend. Copy-pasteable snippets templated from this `client_id` + issuer (authorize URL, token `curl`, discovery URL, M2M `client_credentials` `curl`). `CodeBlock` + copy.
- **Audit** — `Timeline` (`targetType="oauth_client"`, `targetId=client_id`).

### 8.3 Creation wizard — `/admin/oauth/applications/new`

`Stepper` page; form state owned by the page; reuse `buildClientPayload` at submit.

```
①Type ─ ②Auth & grants ─ ③URIs ─ ④Scopes ─ ⑤Review
① RadioGroup(type) with per-option flow description
② Web→auth method · SPA→PKCE (read-only) · M2M→client_credentials (read-only)
③ UrlListBuilder(redirect_uris ≥1) + UrlListBuilder(post_logout_redirect_uris)   (hidden for M2M)
④ ScopeBuilder(scope, suggestions=catalog) + metadata (UrlListBuilder for contacts)
⑤ DescriptionList summary → [Create application]
On complete: POST create-client → show-once secret reveal → router.push to /admin/oauth/applications/[client_id]
```

- Step validity gates Next; ③ requires ≥1 redirect URI unless M2M.
- **Drafts** — **[UI]**, `localStorage` (`id-admin:new-client-draft`); "Resume draft" on step ①; clear on success. Server-side drafts **rejected** (non-standard **[Repo]**, no unmet requirement).

## 9. Redesign: Identity (Users And Organizations)

**Current problem (§3.4).** The oldest, most primitive surface: dense tables, flat field dumps, ids instead of people, and — critically — no resource-selection primitive, so `addTeamMember` and similar flows require pasting a raw `userId`.

**Target behavior.** Bring identity up to the OAuth screens' bar (stats + tables + tabbed detail), render people with `Avatar` + name + email, and introduce `ResourceSelector` (§5.6) everywhere a principal is chosen. All on existing endpoints except the optional helpers in §9.5. Classification: **[UI]** for the redesign; selection is **[BA]** (uses existing admin/organization plugin endpoints).

### 9.1 Users List — `/admin/identity/users`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Users                                                  [+ New user]  │
├──────────────┬──────────────┬──────────────┬──────────────┐         │
│ Total: 1,204 │ Admins: 6    │ Banned: 3    │ Unverified:41│         │
├──────────────┴──────────────┴──────────────┴──────────────┘         │
│ [🔍 search name/email]   [Role ▾ All]   [Status ▾ All]              │
│ User ↕                         Role     Status      Created ↕        │
│ (A) Alice Nguyen alice@acme…   admin    ● active    2026-01-04       │
│ (B) Bob Tran     bob@beta…     user     ⛔ banned    2025-11-20       │
│ ‹ Prev   Page 2 of 49   Next ›                                       │
└─────────────────────────────────────────────────────────────────────┘
```

- `StatGroup`: total (`listUsers().total`) · admins · banned · unverified. Total is exact from the API; the breakdowns either come from cheap filtered counts (`filterField=role/banned`) or are labeled "in page" if a full count is too costly — do not fabricate.
- **Server-driven** search/sort/pagination (the API already supports it): the `useSWR` key carries the **debounced** `searchValue` + `searchField` + `sortBy`/`sortDirection` + `limit`/`offset`. Role/status filters map to `filterField`/`filterValue` (server) — so unlike the OAuth client list, these belong in the key.
- User cell: `Avatar(image=user.image, initials)` + name + email; `Badge` for role; status `Badge` (active / banned / unverified). Row click → user detail.

### 9.2 User Detail — `/admin/identity/users/[userId]`

Already a nested-detail-layout; redesign the content, not the pattern.

```
‹ Users
(A) Alice Nguyen   alice@acme.com   [admin]  ● active     [Impersonate ▾][⋯]
┌ Overview ┬ Sessions ┬ Organizations ┬ Audit ┐
 Overview:
   DescriptionList(columns=2): name · email(+verified badge) · role · created · updated · id(mono,copy)
   Panel "Account actions": Set role (RadioGroup of roles) · Reset password ·
     Ban/Unban (Switch + reason) · Delete user (danger ConfirmDialog)
 Sessions: existing user-sessions-content, restyled (DataTable + per-row revoke + revoke-all)
 Organizations: the orgs this user belongs to (member rows), each linking to the org detail
 Audit: Timeline (targetType="user", targetId=userId)
```

- Header actions reuse existing flows (`impersonateUser`, `banUser`/`unbanUser`, `setRole`, `setUserPassword`, `removeUser`). Ban becomes a `Switch` + reason field rather than a bare button.
- "Organizations" tab is new and **[UI]**: deriving it from `listMembers` across orgs is expensive; first release can show it only when reached from an org context, or defer behind §9.5.

### 9.3 Organizations List And Detail

- List `/admin/identity/organizations`: `StatGroup` (total orgs · total members · teams) + `DataTable` with `Avatar(image=org.logo, initials=org.name)` + name + slug + member count. `listOrganizations()` is client-filtered (no server search) → search/sort stay **out** of the SWR key (keyless list, per the key contract).
- Detail `/admin/identity/organizations/[orgId]` (existing nested layout): Overview (`DescriptionList`: name · slug · logo · metadata · created) + tabs `Members · Teams · Invitations · Audit`. Metadata edited via `CodeEditor` (JSON) where free-form.

### 9.4 Members, Teams, Invitations (ResourceSelector)

This is where `ResourceSelector` (§5.6) lands and the redesign's biggest functional gain appears.

- **Members tab.** `DataTable` of members enriched with names via `useUsersByIds` (Avatar + name + email + role `FilterDropdown`/`updateMemberRole` + remove). "Add member" opens `inviteMember` (email — the standard path for not-yet-users) **or**, for existing users, a `ResourceSelector(kind="user", source=async listUsers)` to add directly if a direct-add endpoint exists (else invite-by-email only; see §9.5).
- **Teams tab.** Create/rename/delete teams. **Add team member** uses `ResourceSelector(kind="member", selectionMode="single", source={ mode:"sync", items: members }, excludeIds=currentTeamMemberIds)` — sourced from `listMembers(orgId)` (team members must already be org members) enriched with names, returning `userId` for `addTeamMember(teamId, userId, orgId)`. **No raw id paste.** This directly fixes the §3.4 gap.
- **Invitations tab.** `DataTable` of pending invitations (email + role + status `Badge` + expires + resend/cancel). Create uses email + role `RadioGroup`; optional team via `ResourceSelector(kind="team", source=sync listTeams)`.

### 9.5 Identity API Gaps

Surfaced for explicit decision; none block the **[UI]** redesign, which works on existing endpoints.

| Gap | Need | Classification | Recommendation |
|---|---|---|---|
| Direct add existing user to org (non-invite) | `addTeamMember` needs an org member first; adding an *existing* user to an org may only be possible via invite today | **[BA]**/**[Repo]** | Verify whether the organization plugin exposes a direct `add-member`; if not, keep invite-by-email as the standard path and mark direct-add as deferred. |
| Org admin access to user search | `ResourceSelector(kind="user")` uses `/admin/list-users` (platform-admin). Org admins may lack access. | **[BA]** | For org-scoped pickers, source from `listMembers(orgId)` (scoped), not `/admin/list-users`. Reserve async user search for platform admins. |
| "Organizations for a user" | User-detail Organizations tab has no direct endpoint | **[Repo]** | Defer or add a scoped read; do not block first release. SCIM directory (docs/017) is the standards-aligned long-term source. |

## 10. Redesign: Scope Catalog

**Current problem.** Free-text scope entry/search, no stats, no bulk path, hidden audit fields (§3.3).

### 10.1 List page

```
Scope Catalog                              [Bulk import] [+ Scope]
Total: 37 · Disabled: 4 · Resources: 6 · Updated 7d: 5
[ScopeBuilder search: content:* ✕]   [Resource API ▾ All]
Scope ↕         Resource API ↕   Enabled  Updated ↕   By
content:read    Content API      ●on      05-28      alice
billing:read    Billing API      ○off     04-10      bob
```

- `StatGroup`: total · disabled · resource-server count · recently-updated (≤7d) — from the existing list.
- Search = `ScopeBuilder` as prefix/badge filter (`content:*`) + `FilterDropdown` by resource API (client-side over the loaded list → **not** in the SWR key).
- Surface existing `enabled` (as a `Switch` → `PATCH …/{id}`), `updatedAt`, `updatedBy`. Hard-delete stays disabled (disable is the permanent primitive).

### 10.2 Bulk import — CSV

- Classification: **[Repo]** convenience over standard `POST /admin/oauth-scopes`. Justification: no protocol covers bulk admin provisioning; the requirement is operator efficiency.
- `[Bulk import]` → `FileDropzone(accept=["text/csv"])` → parse `scope,resourceServer,description` → **dry-run preview** (valid / duplicate / invalid flagged) → `[Import N scopes]`.
- Options: (a) client-side loop of `POST` per valid row (no new endpoint; best-effort + per-row report), or (b) new `POST /admin/oauth-scopes/bulk` for atomicity (define all-or-nothing vs best-effort up front). Always preview before commit.

## 11. Redesign: M2M Bindings And Resource APIs

**[UI]**-only first pass: surface the existing `createdBy`/`updatedBy`/timestamps as an "Updated / By" column + detail `DescriptionList` on the M2M grid and resource-API list. Add an Audit tab (`Timeline`, `targetType ∈ {client_resource_scope, resource_server}`) once §12 lands. The per-client view of bindings also appears on the application Connections tab (§8.2). No schema change.

## 12. Backend: admin-activity-log Plugin

- Classification: **[Industry]** capability as a **[Repo]** Better Auth plugin. Justification: actor-attributed, before/after change history is a near-universal compliance requirement with no governing OAuth RFC and no Better Auth primitive.
- **Naming:** `admin-activity-log` — distinct from the read-only `admin-audit` aggregator ([workers/core/src/auth/plugins/admin-audit/](../workers/core/src/auth/plugins/admin-audit/)).
- Load `id-auth-plugin`; follow the resource-server/admin-audit plugin shape; run `pnpm db:generate` after the schema (never hand-write SQL — CLAUDE.md rule 4).

Schema (one BA-plugin-owned table; not in the empty `db/schema.ts`):

```
adminActivityLog {
  id, actorId, actorType("user"|"system"),
  action ("oauth_client.update" | "jwks.rotate" | "scope.disable" | "user.ban" | "team.add_member" | …),
  targetType ("oauth_client"|"jwks"|"oauth_scope"|"client_resource_scope"|"resource_server"|"user"|"organization"|"team"),
  targetId, summary(text|null), details(json|null),
  before(json|null), after(json|null), metadata(json|null /* ip, userAgent, requestId, reason? */),
  createdAt
}  // indexes: (targetType, targetId), (actorId), (createdAt)
```

Contract:

- **Write path:** mutation use cases append one row on create/update/delete/rotate/enable/disable/ban/add-member. Append-only; the UI never edits/deletes rows. New rows must include a semantic `summary` and structured `details` that answer what changed, who/what was affected, reason/duration/context when available, and the stable identifiers needed for follow-up. Secrets, private keys, and token bodies are **never** written — only identifiers and non-sensitive field diffs (presenter-stripped, asserted by tests, mirroring [admin-audit/schema.ts](../workers/core/src/auth/plugins/admin-audit/schema.ts)).
- **Read path:** `GET /api/auth/admin/activity-log?targetType=&targetId=&action=&actorId=&limit=&offset=` — adapter reads only, actor-scoped in the `where` clause, `count`-based pagination, batched `in` enrichment for actor email (docs/026 §4 approach).
- **Response:** `{ entries: PresentedActivity[], total, limit, offset }`.
- **UI consumption:** a shared `useActivityLog(targetType, targetId)` hook (in `_data/`) feeds every Audit tab's `ActivityLogContent`, which renders the semantic summary first and keeps `details`/`before`/`after`/`metadata` inspectable as JSON.

## 13. Net-New Surfaces

- **Token introspection / JWT decoder** — **[Protocol]** RFC 7662. `/admin/security/introspect`: paste a token → decoded header/claims (`JsonViewer`) + signing `kid` + audience match. Verify an introspection endpoint exists in [api-1.yaml](../api-1.yaml) first.
- **Effective-access view per client** — **[UI]**. Compose client `scope` × resource servers × M2M `allowedScopes` on the application Connections tab.
- **Dashboard** (`/admin`, implemented) — **[UI]**. `StatGroup` + quick links: users, active sessions, tokens by type, clients by type, consents, and JWKS status.
- **Client test/playground** — **[Protocol]**. Run a real `client_credentials` exchange from the admin.
- **Discovery / issuer-metadata** and **SCIM status** — **[Protocol]** (RFC 8414 / OIDC Discovery; SCIM v2). Already planned; pure reads.

## 14. Edge Cases And Failure Modes

- **JWKS rotate during automatic rotation window:** emergency rotate just promotes another new key; the grace window protects verification. Never delete the prior active key.
- **JWKS list endpoint returns all keys (no per-key GET):** detail provider selects by `kid` from the list cache; absent `kid` → `ErrorAlert("Key not found")` + back link, no crash.
- **ResourceSelector async race:** rapid typing must abort the in-flight request via `useAsyncList`'s `signal`; stale responses must not overwrite newer results.
- **ResourceSelector scoping:** org-scoped pickers must source from `listMembers(orgId)`, not the platform `/admin/list-users`, so org admins are not blocked and cannot enumerate all users (§9.5).
- **ScopeBuilder stale catalog:** a client scope no longer in the catalog renders as a chip flagged "not in catalog" rather than dropped.
- **UrlListBuilder vs API:** client validation is advisory; surface server validation errors onto the offending row when possible, else as a dialog alert.
- **CSV bulk partial failure:** dry-run preview classifies rows before import; best-effort import returns a per-row result and keeps the dialog open showing failures.
- **CodeEditor SSR:** CodeMirror lazy-mounts client-side; SSR falls back to `<pre>` to avoid hydration mismatch.
- **Activity-log secret leakage:** every new `action` passes through the secret-stripping presenter; a test asserts no `clientSecret`/`privateKey`/`token` key appears in `before`/`after`.
- **Grants route redirect:** old `/admin/oauth/sessions-tokens` links must redirect, not 404.
- **Users list key correctness:** server-side role/status filters belong in the SWR key; client-only view state must not. The debounced search value (not raw input) is the key.

## 15. Implementation Backlog (Phased)

Intentionally thin — detail lives in §5 and §7–§12. Each phase is independently reviewable and testable. Every new `packages/ui` component carries tests + registry update; every new `/admin` route carries a screen spec first.

- **Phase 1 — Toolkit (§5).** No-dep first (`StatGroup`, `Switch`, `Disclosure`, `DescriptionList`), then the React Aria compositions (`ScopeBuilder`, `ResourceSelector`, `UrlListBuilder`, `Stepper`, `Timeline`, `FileDropzone`), then `JsonViewer`/`CodeEditor`. Acceptance: all states render in Ladle (`pnpm dev:i`); `pnpm lint` + `pnpm test` green; registry updated.
- **Phase 2 — IA unify (§6).** Specs + grants route moves; redirect the old path.
- **Phase 3 — `admin-activity-log` (§12).** Schema + `pnpm db:generate`; read endpoint; write integration; `useActivityLog` hook; secret-stripping test.
- **Phase 4 — Screen redesigns.** Identity users/orgs + `ResourceSelector` (§9) → JWKS (§7) → Applications (§8) → Scope catalog (§10) → M2M/Resource audit (§11). Each: spec → mocks → actions → content component (`useSWR`) → story → Ladle verify → route file.
- **Phase 5 — Net-new (§13).**

Run `pnpm check` and `pnpm deploy:ui:dry-run` at each phase boundary.

## 16. Definition Of Done

- All §5 components exist in `@idco/ui`, exported, registered in the skill, with tests; `pnpm check` green. `ScopeBuilder` and `ResourceSelector` are built on `Autocomplete` + `TagGroup`/`ListBox` + `useListData`/`useAsyncList`/`useFilter` (not bespoke).
- Grants section (§6) unified under `/admin/security` with URL-addressable tabs; old path redirects; specs updated.
- `admin-activity-log` plugin exists with generated schema, read endpoint, and write integration on client/scope/JWKS/binding/user/team mutations; a test asserts no secret material is logged.
- JWKS, OAuth Applications, **Identity (users/orgs)**, and Scope Catalog match §7–§10: stats headers, detail routes, builder/selector inputs, emergency-rotate (JWKS), creation wizard (Applications), `ResourceSelector` for team membership (Identity), bulk import (Scopes). Every entity exposes an Audit tab fed by `admin-activity-log`.
- Each redesigned screen has a current screen spec, four Ladle states verified, and passes `pnpm deploy:ui:dry-run`.
- README contracts list references this doc; superseded screen specs updated, not left stale.

## 17. Final Model

The admin console becomes a detail-oriented identity surface where every list opens with a `StatGroup` and a `DataTable`, every entity (user, org, team, client, key, scope, binding, resource server) has a deep-linkable detail route with tabbed concerns and an Audit tab, and rich entry is React-Aria-native: `ScopeBuilder` (`Autocomplete + TagGroup`) for scopes, `ResourceSelector` (`Autocomplete + ListBox + useAsyncList`) for choosing users/orgs/teams/members — finally retiring raw-id entry on flows like team membership — and `UrlListBuilder` for validated URIs. Creation flows that branch use a `Stepper`; one-shot reveals and destructive confirms stay modal. The grants concept (sessions, tokens, consents) is one section with one tab bar. Underneath, a single append-only `admin-activity-log` plugin records who changed what, powering every Audit tab — kept strictly separate from the read-only `admin-audit` aggregator. No protocol surface changes: the only standards-sensitive additions (emergency JWKS rotate, bulk scope import, the activity log, any identity read helpers) are classified, justified, and constrained so the console gains operational power — and the identity screens reach parity with the OAuth ones — without ever leaving the standards path.
