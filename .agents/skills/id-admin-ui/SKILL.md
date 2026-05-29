---
name: id-admin-ui
description: Maintain UI consistency for the `/home/quanghuy1242/pjs/auth` admin UI. Use when creating, modifying, or reviewing any file under `workers/ui/src/app/admin/**`, adding or changing components in `packages/ui/src/**`, writing or updating screen specs in `workers/ui/docs/screens/`, or when any session needs to know what components exist, what the token values are, or what format the screen spec must follow.
---

# id Admin UI

## Purpose

Every agent session working on admin UI must load this skill. It contains the component registry, token values, screen spec format, and hard rules that keep multiple sessions from producing divergent output.

Before implementing a page, read the screen spec at `workers/ui/docs/screens/`. Before adding a component, check the registry below.

Full architecture rationale lives in `docs/022_admin-ui-system.md`.

## Workflow

1. Confirm you are working in `/home/quanghuy1242/pjs/auth`.
2. **Always load this skill before any admin-UI task.** Do not skip this.
3. For a **new page**: read the screen spec in `workers/ui/docs/screens/<section>.md` before writing any code. If no spec exists, draft one and get approval before implementing.
4. For a **new component**: add it to `packages/ui/src/`, add the DaisyUI 5 link comment (see below), export from `packages/ui/src/index.ts`, then use it. **Update this registry immediately** after the component is added.
   **DaisyUI 5 link comment format:** Every file in `packages/ui/src/` must start with a comment citing the relevant DaisyUI component page. Even if the file uses only Tailwind utilities or third-party libraries, cite the DaisyUI component that the sizing/styling conventions come from.
   ```ts
   // DaisyUI 5: https://daisyui.com/components/menu/
   ```
   **Tree-shaking constraint:** `packages/ui/package.json` declares `"sideEffects": false`. Every component file must be side-effect-free at module level — no `import "./styles.css"`, no global registry calls, no top-level mutations. If a file must have a side effect, add it to the `sideEffects` array in package.json explicitly (e.g. `"sideEffects": ["./src/that-file.tsx"]`) rather than changing `false` to `true`.
5. For a **spec draft**: use the exact format in the Screen Spec Format section below.
6. Keep route files under `workers/ui/src/app/admin/**` as composition boundaries — assemble `@id/ui` primitives, pass data, no raw markup.
7. Run `pnpm lint` and `pnpm check` after any change to `packages/ui` or `workers/ui`.
8. Run `pnpm deploy:ui:dry-run` after any non-trivial change to `packages/ui` or `workers/ui`. This does a full Cloudflare Worker build and verifies the bundle assembles correctly without deploying. Fix any build errors before completing.
9. **Every `packages/ui` component change or addition must include tests.** Add tests to `workers/ui/tests/packages-ui/<component>.test.tsx` and register the file in `workers/ui/tests/all.test.ts`. Test at minimum: rendering, interaction callbacks (`onChange`, `onClick`, `onSort`), state variants (selected, disabled, error, empty), sizing props, and DaisyUI class presence. Do not submit component code without corresponding tests.

## Screen Implementation Workflow

Every new admin screen follows this order. Do not skip or reorder steps. Full rationale and code examples live in `docs/023_admin-screen-story-strategy.md`.

1. **Spec** — confirm `workers/ui/docs/screens/<section>.md` has a complete entry (ASCII sketch + Components block + Data block). Draft it if missing; get approval before continuing.
2. **Mocks** — create `workers/ui/src/app/admin/_mocks/<domain>.ts` with realistic data covering all badge/status combinations.
3. **Actions** — create `workers/ui/src/app/admin/_actions/<domain>.ts` with one typed async function per API endpoint. Plain functions, no React.
4. **Shell decorator** — create `stories/_decorators/shell.tsx` if it does not exist yet (once, shared by all stories).
5. **Content component** — create `workers/ui/src/app/admin/_components/<section>/<name>-content.tsx`. It must:
   - Own its data lifecycle with **`useSWR`**, not `useEffect`+`useState`. See the "Data Fetching With SWR" section below — this is mandatory for every new content component. Build the key with a builder from `_data/swr-keys.ts`, fetch through the injected `actions`, and wire `mutate` to retry/mutation flows.
   - Accept `loading?: boolean` and `error?: string` override props that skip the fetch and force the skeleton/error display (pass `null` as the `useSWR` key when an override is set).
   - Accept optional state-override props for search, filter, sort, page (route file passes these from `useSearchParams`).
   - Manage internal `useState` for all UI state when overrides are not provided.
   - Fire navigation callbacks (`onRowClick`, `onBackClick`) — never call `router.push()` directly.
   - Own zero URL logic — no `useSearchParams`, no `usePathname`, no `useRouter`.
   - Render only `@id/ui` components.
6. **Story** — create `stories/<section>/<name>.stories.tsx`. Minimum exports: `Populated`, `Empty`, `Loading`, `Error`. Pass a fake `actions` object (the injection seam) or `vi.mock` the `_actions/` module. Wrap every story in `<AdminShell activePath="...">` — the decorator already provides a fresh per-story SWR cache, so one story never serves another's cached data. **Always wrap the content component in `<PageBody>` inside `AdminShell`** — `AdminShell` puts children directly in `<MainContent>` with no padding; without `PageBody` the story has no content padding and looks different from the real app.
7. **Ladle verify** — run `pnpm dev:i` and confirm all four states render correctly. This gate must pass before the route file is created.
8. **Route file** — create `workers/ui/src/app/admin/<path>/page.tsx` (≤ 40 lines). Read URL params via `useSearchParams`, pass as override props to the content component, pass navigation callbacks wired to `router.push()`. **Split the page into two components**: the outer component owns the `<Suspense fallback={<Content loading />}>` boundary; an inner component (`PageContent`) calls `useSearchParams()`. Never call `useSearchParams()` in the same component that owns the Suspense boundary — Next.js App Router de-opts the entire route to dynamic rendering and causes hydration flicker.

### Nested Detail Layout Pattern

Use this pattern for admin detail areas where multiple child routes share the same fetched entity, header, tabs, and destructive header action.

- Create `_components/<section>/<entity>-detail-context.tsx` with a provider that owns the entity fetch **via `useSWR`** (one keyed call per resource; a second `useSWR` for any side data like `getCurrentSession`), exposes `loading`/`error` story overrides, and maps `set<Entity>` to a local cache patch (`mutate(key, next, { revalidate: false })`) and `refetch` to the bound `mutate`. `set<Entity>` should also invalidate the matching list cache (see SWR section). Reference: `user-detail-context.tsx`, `org-detail-context.tsx`.
- Create `<entity>-detail-header-content.tsx` for back link, title/badges, shared actions, and route tabs. It reads the provider and receives `activeTab` from the layout.
- Create `<entity>-detail-overview-content.tsx` for overview-only fields and overview-only mutation dialogs.
- Create `app/admin/<section>/<entityPlural>/[id]/layout.tsx` to render `PageBody > Provider > Stack(gap="md") > Header + children`. The layout may use `useParams`, `usePathname`, and `useRouter` because URL logic belongs at the route boundary.
- Child `page.tsx` files under the detail route render only their own content component. They may read the provider hook for `id` and display names, but they must not repeat the shared header, tabs, or entity fetch.
- Ladle stories for child routes must mirror the layout: `AdminShell > PageBody > Provider > Stack > Header + child content`.
- Keep list/search routes on the normal Suspense + `useSearchParams` split pattern above. The nested layout pattern is for shared detail route state, not list query-state pages.

### Story state conventions

| Story export | How to implement |
|---|---|
| `Populated` | `vi.mock` the actions module; set `mockListX.mockResolvedValue({ items: mockData, total: ... })` |
| `Empty` | Same mock, return `{ items: [], total: 0 }` |
| `Loading` | Pass `loading` prop — component skips fetch, shows `Skeleton` immediately |
| `Error` | Pass `error="..."` prop — component skips fetch, shows `ErrorAlert` immediately |

### AdminShell decorator

`stories/_decorators/shell.tsx` mirrors `workers/ui/src/app/admin/layout.tsx` and uses the real nav components:

```tsx
import { SWRConfig } from "swr";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock } from "@id/ui";
import { AdminTopbar, AdminSidebarNav, AdminMobileNav, AdminMobileRouteTabs } from "../../workers/ui/src/app/admin/_components/admin-nav";
import { ADMIN_SWR_CONFIG } from "../../workers/ui/src/shared/swr-config";
import { setMockPathname } from "../../.ladle/mocks/next-navigation";

export function AdminShell({ activePath, children }: { activePath: string; children: ReactNode }) {
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);
  // Fresh SWR cache per story so mocked actions re-fetch and stories don't bleed.
  return (
    <SWRConfig value={{ ...ADMIN_SWR_CONFIG, provider: () => new Map() }}>
      <AppShell>
        <Topbar><AdminTopbar /></Topbar>
        <AdminMobileRouteTabs />
        <SidebarLayout>
          <Sidebar><AdminSidebarNav /></Sidebar>
          <MainContent>{children}</MainContent>
        </SidebarLayout>
        <MobileDock><AdminMobileNav /></MobileDock>
      </AppShell>
    </SWRConfig>
  );
}
```

**`AdminShell` has no `PageBody` inside it** — `MainContent` renders children with no padding. Every story must wrap the content component in `<PageBody>` explicitly:

```tsx
// CORRECT — matches route file structure
export const Populated: Story = () => (
  <AdminShell activePath="/admin/identity/users">
    <PageBody>
      <UsersListContent />
    </PageBody>
  </AdminShell>
);

// WRONG — content flush against edges, no padding, looks different from real app
export const Populated: Story = () => (
  <AdminShell activePath="/admin/identity/users">
    <UsersListContent />
  </AdminShell>
);
```

## Data Fetching With SWR

All admin content components and detail providers fetch through **SWR** (`swr@2.x`). Full rationale and the philosophy behind every config flag live in `docs/025_admin-ui-swr-caching-strategy.md` — read it before changing the foundation. The day-to-day rules:

### Foundation files (do not re-invent)

| File | What it is |
|---|---|
| `workers/ui/src/shared/swr-config.ts` | `ADMIN_SWR_CONFIG` — the site-wide manual-revalidation policy. **Never add `revalidateOnMount: true`** (it defeats cross-navigation caching). |
| `workers/ui/src/shared/swr-endpoints.ts` | `UPPER_CASE` endpoint-path constants. New endpoints go here (screaming constants must live in `src/shared/` per the lint gate). |
| `workers/ui/src/app/admin/_data/swr-keys.ts` | Typed key builders (`usersListKey`, `userDetailKey`, …) and invalidation predicates (`isUsersListKey`, …). Add a builder here for every new endpoint; never inline raw key tuples in components. |
| `workers/ui/src/app/admin/_data/use-users-by-ids.ts` | `useUsersByIds(ids, getUser)` — shared user-enrichment hook. Use it for any "look up user names by id" need (members, invitations, teams). |
| `workers/ui/src/app/admin/_components/admin-swr-provider.tsx` | `<SWRConfig>` client wrapper mounted in the admin layout. Already wired — do not add another provider. |
| `workers/ui/tests/_utils/swr-render.tsx` | `renderWithSwr` — test render with an isolated cache. |

### The key contract (most important rule)

A `useSWR` key is `[endpointPath, serverParams]` and defines cache identity. It must contain **exactly** the params that change the server response — **never client-side view state**. If changing a control does not call the action with different arguments, it does not belong in the key:

- Debounced search → key on the **debounced** value, never the raw input.
- A filter applied client-side over already-fetched rows (e.g. users `status`) → **not** in the key.
- A list whose search/sort is client-side (e.g. organizations) → keyless (`orgsListKey()`).

Build the key inside the component/provider; keep `_actions/*.ts` as pure fetch wrappers.

### Reading data

```tsx
const params = useMemo(() => ({ /* server params only */ }), [/* server deps */]);
const { data, isLoading, error, mutate } = useSWR(
  loadingOverride || errorOverride ? null : usersListKey(params), // null key = bypass for stories
  () => actions.listUsers(params),                                 // fetch through INJECTED actions
);
const showLoading = loadingOverride ?? isLoading;
const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
// retry: onRetry={() => void mutate()}
```

### Mutating data

- **Pessimistic default:** `await actions.create/update/delete(...)` then `await mutate()` to revalidate the current key.
- **Local patch (detail providers):** when the mutation response already carries the updated entity, patch the cache instead of refetching: `mutate(key, next, { revalidate: false })`. This is what `set<Entity>` does.
- **Cross-surface invalidation:** when a detail mutation changes a list shown elsewhere, invalidate by predicate with the active-cache mutate: `const { mutate: globalMutate } = useSWRConfig(); globalMutate(isUsersListKey, undefined, { revalidate: false });`. Clearing (no eager refetch) is preferred — the list refetches on its next mount, respecting the rate budget. Provider setters already do this; delete flows must do it explicitly before navigating.

### Stories and tests

- Stories: wrap in `<AdminShell>` (provides a fresh per-story cache) and inject a fake `actions` prop. `Loading`/`Error` stories pass the override props, which set the key to `null`.
- Tests: import `renderWithSwr as render` from `tests/_utils/swr-render` instead of `@testing-library/react`'s `render`, so each test gets an isolated cache and first-mount fetches fire against the test's mocks.

## Hard Rules

- Do not put raw `div`, `main`, `section`, `header`, `nav`, `aside`, `footer` in route files.
- Do not put raw typography tags (`h1`–`h3`, `p`, `span`) in route files. Use `Text` or `Heading`.
- Do not put DaisyUI classes (`btn`, `card`, `menu`, `navbar`, `input`, `badge`, `alert`, `table`, etc.) in route files.
- Do not put Tailwind visual utilities (`flex`, `grid`, `gap-*`, `p-*`, `m-*`, `text-*`, `bg-*`, `border-*`, `rounded-*`, `size-*`, `shrink-*`, etc.) in route files — not even as className overrides on `@id/ui` components. If a component needs size or style control, add a typed prop to the component.
- Do not expose raw `className` as the primary styling API on new `packages/ui` components. Use typed props (variant, size, tone) that map to DaisyUI classes internally.
- Do not import `react-aria-components` directly in route files. Use `@id/ui` wrappers only.
- Do not import `lucide-react` directly in route files. Use `NavIcon` from `@id/ui` via `iconName` string props on navigational components.
- Do not create a new `/admin` route without a spec entry in `workers/ui/docs/screens/`.
- Do not invent new component names — use exact exports from `@id/ui` listed in the registry below.
- Do not construct ReactNode icons (JSX `<SomeIcon/>`) in route files. Pass icon names as strings via `iconName` props.
- **Do not call `fetch()` directly inside content components or route files.** All API calls go through `_actions/<domain>.ts` functions.
- **Do not use `useSearchParams`, `usePathname`, or `useRouter` inside content components.** URL logic belongs exclusively in the route file.
- **Do not pass fetched data (`users`, `total`, `items`, etc.) as required props to content components.** Content components own their data lifecycle and populate data internally via action calls.
- **Do not fetch with `useEffect` + `useState` in new content components or providers.** Use `useSWR` per the "Data Fetching With SWR" section. The old `fetchKey`/`cancelled` pattern is removed — do not reintroduce it.
- **Do not put client-side view state (status filters, client-side search/sort) in a `useSWR` key.** The key carries server params only. Search keys use the debounced value.
- **Do not inline raw key tuples in components.** Use a builder from `_data/swr-keys.ts`; add one there for new endpoints. Endpoint path strings live in `shared/swr-endpoints.ts`.
- **Do not use `render` from `@testing-library/react` for content-component tests.** Use `renderWithSwr` from `tests/_utils/swr-render.tsx` so each test has an isolated SWR cache.
- **Every new admin route must have a corresponding Ladle story.** The story (with all four states verified in Ladle) is a hard prerequisite for creating the route file.
- **Do not mock `window.fetch` in stories.** Mock the `_actions/` module with `vi.mock` instead.
- **Do not hardcode `sm` as a default size in any `packages/ui` component.** Default is always `md`. Expose size as a typed `"sm" | "md"` prop. Hardcoded `sm` on controls like `FilterDropdown`, `SearchInput`, or `DataTable` causes height mismatches with `Button` (which defaults to `md`) in the same toolbar row.
- **Do not use `btn-neutral` for any button variant.** The `secondary` variant maps to `btn-outline`. `btn-neutral` uses DaisyUI's default dark/near-black neutral (undefined in the custom theme) and looks wrong in the light theme.
- **Do not call `useSearchParams()` in the same component that owns the Suspense boundary.** See route file rule above.
- **When DaisyUI classes depend on native element selectors (`:checked`, `:is([type="radio"])`, etc.), prefer `react-aria` hooks over `react-aria-components` wrappers.** RAC wraps the native input in `HiddenInput` (clipped to 1px) and renders custom indicator elements — DaisyUI classes applied to those indicators cannot produce `:checked` styles, size variants, or animations. Instead, use the corresponding hook from `react-aria` (`useRadioGroup`/`useRadio` for radio groups, `useCheckbox`/`useToggleState` for checkboxes) paired with a native `<input>` element. The hook provides `inputProps` (containing `type`, `checked`, `onChange`, keyboard handlers, and ARIA attributes) to spread onto the native input. This gives full React Aria keyboard navigation + ARIA while the native input carries DaisyUI classes directly. Dependencies: `react-aria` and `react-stately` are declared in `packages/ui/package.json`. See `packages/ui/src/form.tsx` for the reference implementation.
- **Do not create a fake indicator (`<span>`/`<div>` with DaisyUI classes) as a workaround for RAC's hidden input.** This loses native pseudo-class behavior (`:checked`, `:focus-visible`) and DaisyUI animations. Use hooks + native inputs instead.

## DaisyUI Convention Rules

These rules prevent re-learning the same mistakes:

1. **DaisyUI collapsible menu:** Use `<details open>` with bare `<summary>` — no extra classes on `<summary>`. The parent `menu` class handles all styling. Do NOT use `menu-title` on `<summary>`; `menu-title` is for static non-collapsible section headers only.
   ```html
   <li>
     <details open>
       <summary>Parent</summary>
       <ul><li><a>Item</a></li></ul>
     </details>
   </li>
   ```
2. **DaisyUI dock icon sizing:** The icon class `size-[1.2em]` IS the DaisyUI-native pattern — it appears in every dock example (xs through xl). It is em-relative and scales with the dock's font size automatically. Do not second-guess this; map it inside `packages/ui` components as a variant token.
3. **Dock size default:** `dock-md` is the DaisyUI default (no modifier class needed). `dock-sm`, `dock-xs`, `dock-lg`, `dock-xl` add the respective class.
4. **Menu active item:** Use DaisyUI's `menu-active` class on the `<a>` element. Do not use custom font/text classes for active state.
5. **When the DaisyUI docs show a class on elements inside a component (e.g., `size-[1.2em]` on SVG inside dock), that class IS the DaisyUI-native approach.** Map it to a typed prop inside `packages/ui`; never pass it as a raw string from a route file.
6. **FilterDropdown trigger class:** Use `select select-bordered` (not `btn btn-neutral`). Add `bg-none` to the trigger to suppress DaisyUI's built-in CSS background-image arrow — without it, two arrows appear: one from the `select` class and one from the custom `<ChevronDown>` icon.
7. **FilterDropdown popover width:** React Aria's `Popover` sets `--trigger-width` as a CSS custom property. Use `w-(--trigger-width)` on `Popover` and `w-full` on `ListBox` to match the trigger width. Do NOT read `ref.current?.offsetWidth` inline during render — refs are not reactive and the value is stale on first open.
8. **FilterDropdown popover animation:** React Aria sets `data-entering` and `data-exiting` on `Popover`. Apply `data-[entering]:animate-popover-in data-[exiting]:animate-popover-out` so Select popovers keep the native expand/collapse feel.
9. **ConfirmDialog DaisyUI classes:** Use `modal modal-open bg-black/40` on `ModalOverlay`, `modal-box` on `Modal`, `modal-action` on the button row. Always keep `bg-black/40` — `div.modal` has no backdrop color (`dialog::backdrop` is a pseudo-element only available on native `<dialog>` elements, not React Aria's div-based overlay). `modal-open` is required on div-based modals because DaisyUI hides `div.modal` by default. Do not put `data-theme` on the overlay itself; the global `[data-theme]` background rule can override the dimmed backdrop. Put the theme attribute on the `modal-box` panel instead.
10. **Modal enter/exit animations:** React Aria sets `data-entering` and `data-exiting` on `ModalOverlay` and `Modal` during transitions, and holds elements in the DOM until the exit animation completes. Define `@keyframes` and `@theme` animation variables in `globals.css`. Apply as `data-[entering]:animate-modal-overlay-in data-[exiting]:animate-modal-overlay-out` etc. No plugin needed — this is native Tailwind v4 + React Aria.
11. **Ladle portal theme scope:** React Aria portals (`ConfirmDialog`, `FilterDropdown` popover) render on `<body>`, which is outside the Ladle Provider's `<div data-theme="...">` wrapper. The `useEffect` in `.ladle/components.tsx` that stamps `data-theme` onto both `document.documentElement` and `document.body` is **essential** — without it, portals in stories get no theme tokens and show wrong colors. Do not remove or simplify this effect.
12. **Icon registration before use:** Before using any `iconName` string in `Button`, `NavLink`, or `DockLink`, verify the icon is registered in `packages/ui/src/nav-icons.tsx`'s `iconMap`. Add the named lucide-react export to both the import list and the `iconMap` object. Icon names are PascalCase (`"Plus"`, `"Users"`, `"KeyRound"`, etc.).

## Token Reference

Source of truth: `workers/ui/src/app/globals.css`

Two themes: `lumina-light` (default) and `lumina-dark` (prefers-dark).

| DaisyUI token | Light value | Dark value | Usage |
|---|---|---|---|
| `base-100` | `#ffffff` | `#121316` | Surface, card, input background |
| `base-200` | `#f7f8fb` | `#181a1f` | Page background |
| `base-300` | `#e6e8eb` | `#2d3139` | Borders, dividers |
| `base-content` | `#1f2328` | `#f3f4f6` | Primary text |
| `primary` | `#155eef` | `#155eef` | Actions, links, focus ring |
| `primary-content` | `#ffffff` | `#ffffff` | Text on primary |
| `secondary` | `#475467` | `#94a3b8` | Secondary semantic tone |
| `secondary-content` | `#ffffff` | `#0f172a` | Text on secondary |
| `accent` | `#0f766e` | `#2dd4bf` | Accent semantic tone |
| `accent-content` | `#ffffff` | `#052f2b` | Text on accent |
| `neutral` | `#1f2328` | `#f3f4f6` | Neutral badges/avatars |
| `neutral-content` | `#ffffff` | `#121316` | Text on neutral |
| `info` | `#2563eb` | `#60a5fa` | Informational feedback |
| `info-content` | `#ffffff` | `#071a3d` | Text on info |
| `success` | `#00c896` | `#00e0a4` | Success/active state |
| `success-content` | `#042f2e` | `#03231c` | Text on success |
| `warning` | `#f59e0b` | `#fbbf24` | Warning/unverified state |
| `warning-content` | `#2f1b00` | `#2f1b00` | Text on warning |
| `error` | `#ff4d6d` | `#fb7185` | Error/banned/destructive state |
| `error-content` | `#3f0713` | `#3f0713` | Text on error |
| `radius-field` | `0.375rem` | same | Input, button corner radius |
| `radius-box` | `0.5rem` | same | Card, panel corner radius |

Use DaisyUI semantic classes (`bg-base-100`, `text-primary`, `border-base-300`) inside `packages/ui` components. Never hardcode hex values.

## Component Registry

> **When adding, removing, or changing a component in `packages/ui/src/`, update this registry immediately.** Outdated registries cause sessions to recommend non-existent props.

All components are exported from `@id/ui` (`packages/ui/src/index.ts`).

### Layout — Shell

| Component | Key props | Notes |
|---|---|---|
| `AppShell` | `children` | Root wrapper, `h-screen overflow-hidden flex flex-col bg-base-200` |
| `Topbar` | `children` | `navbar` DaisyUI, `min-h-16 shrink-0`, `bg-base-100`, border-b |
| `SidebarLayout` | `children` | Flex row between Topbar and MobileDock; `flex-1 min-h-0 overflow-hidden` |
| `Sidebar` | `children` | `hidden lg:block w-72 shrink-0 border-r border-base-300 bg-base-100 p-4 overflow-y-auto` |
| `MainContent` | `children` | `<main>` inside SidebarLayout; `flex-col flex-1 min-h-0 overflow-y-auto` |
| `MobileRouteTabs` | `children` | Mobile-only wrapper for section-level route tabs; `lg:hidden border-b border-base-300 bg-base-100 px-6` |
| `MobileDock` | `children`, `ariaLabel?` | DaisyUI `dock` (= `dock-md` default), `bg-base-100 border-t border-base-300 lg:hidden` |

### Layout — Content

| Component | Key props | Notes |
|---|---|---|
| `PageHeader` | `children` | `border-b bg-base-100 px-6 py-4`, flex between |
| `PageBody` | `children` | `flex-1 p-6` |
| `PageSection` | `children`, `padding?: "none"\|"sm"\|"md"\|"lg"` | Wraps a `Container` |
| `Container` | `children`, `width?: "narrow"\|"content"\|"wide"\|"full"` | `max-w` constraint, `mx-auto` |
| `Panel` | `children`, `tone?: "base"\|"muted"`, `padding?` | `card`, `border border-base-300 shadow-sm` |
| `Stack` | `children`, `gap?: "xs"\|"sm"\|"md"\|"lg"` | Vertical flex column |
| `Inline` | `children`, `gap?`, `align?`, `justify?`, `wrap?` | Horizontal flex row |
| `Grid` | `children`, `columns?: "one"\|"two"\|"three"`, `gap?` | Responsive CSS grid |
| `Columns` | `children`, `gap?` | Two-column layout: `1fr 20rem` |
| `Spacer` | `size?: "xs"\|"sm"\|"md"\|"lg"` | Blank vertical space |

### Typography

| Component | Key props | Notes |
|---|---|---|
| `Text` | `variant?: "h1"\|"h2"\|"h3"\|"body"\|"caption"`, `as?` | Renders correct HTML element by default |
| `Heading` | `level?: "h1"\|"h2"\|"h3"` | Thin wrapper over `Text` |

### Interactive

| Component | Key props | Notes |
|---|---|---|
| `Button` | `variant?: "primary"\|"secondary"\|"danger"`, `size?: "sm"\|"md"`, `type?`, `name?`, `value?`, `disabled?`, `onClick?`, `iconName?`, `iconPosition?: "left"\|"right"` | React Aria Button styled with DaisyUI. `iconName` accepts a lucide icon name string (e.g. `"Plus"`). Icon uses `size-[1.2em]` (DaisyUI-native). Default position is left. |
| `LinkButton` | `href`, `variant?`, `size?` | Navigation, renders Next `Link` with DaisyUI button classes. |

### Form

| Component | Key props | Notes |
|---|---|---|
| `Form` | `children`, `onSubmit?`, `onInvalid?`, `action?`, `method?`, `validationBehavior?`, `validationErrors?` | React Aria Form wrapper. Use this instead of raw `<form>` in `workers/ui` and stories. |
| `TextInput` | `label`, `name`, `type?: "email"\|"password"\|"text"`, `size?`, `autoComplete?`, `required?`, `defaultValue?`, `error?`, `validate?`, `onChange?: (value: string) => void` | React Aria TextField styled with DaisyUI input classes and FieldError. No `placeholder` prop. No `type="number"` — use text+validation. Prefer FormData/native validation over manual field state when possible. |
| `HiddenInput` | `name`, `value` | Hidden form field |
| `RadioGroup` | `title`, `name`, `options: {value,label}[]`, `value?`, `defaultValue?`, `size?`, `required?`, `error?`, `onChange?` | Uses `react-aria` hooks (`useRadioGroupState` + `useRadioGroup` + `useRadio`) with native `<input type="radio">` elements carrying DaisyUI `radio` classes. Full keyboard nav + ARIA via hooks; visual via DaisyUI's native `:checked` pseudo-class. Use `defaultValue` for uncontrolled form submission and `value`/`onChange` for controlled flows. |
| `Checkbox` | `label`, `name`, `value?`, `selected?`, `defaultSelected?`, `required?`, `size?`, `error?`, `onChange?` | Uses `react-aria` hooks (`useToggleState` + `useCheckbox`) with native `<input type="checkbox">` elements carrying DaisyUI `checkbox` classes. Full keyboard + ARIA via hooks; visual via DaisyUI's native `:checked` pseudo-class (checkmark animation included). |

### Feedback

| Component | Key props | Notes |
|---|---|---|
| `Alert` | `tone?: "error"\|"success"\|"warning"\|"info"`, `children` | Full-width alert with icon |
| `Badge` | `tone?: "neutral"\|"primary"\|"secondary"\|"accent"\|"success"\|"warning"\|"error"\|"info"`, `size?: "sm"\|"md"`, `children` | `badge-sm badge-outline`. Note: `"ghost"` is NOT a valid tone. Use `"neutral"` for dimmed/expired states; badge tones depend on the `lumina-*` DaisyUI semantic color tokens in `globals.css`. |
| `Skeleton` | `rows?: number`, `height?: "xs"\|"sm"\|"md"` | Loading placeholder rows |
| `EmptyState` | `message`, `cta?`, `onCta?` | Centered empty message + optional primary CTA. `cta`/`onCta` must be passed as props, NOT as child Button components. |
| `ErrorAlert` | `message?`, `onRetry?` | Error alert with inline retry button |

### Data

| Component | Key props | Notes |
|---|---|---|
| `DataTable` | `columns: DataTableColumn<T>[]`, `rows: T[]`, `getRowKey`, `onRowClick?`, `sortBy?`, `sortDirection?`, `onSort?`, `pagination?: {total,limit,offset,onChange}` | React Aria Table backed by DaisyUI `table` class. Built-in keyboard navigation, sort indicators (chevron icons via `SortIcon`), and `onRowAction` handler. Renders native `<table>`/`<thead>`/`<tbody>` elements so DaisyUI classes apply directly. Sort state managed externally via `sortBy`/`sortDirection`/`onSort` (maps to RAC's `sortDescriptor`). Pagination rendered separately as `PaginationBar` (RAC Table has no built-in page pagination). |

### Navigation

| Component | Key props | Notes |
|---|---|---|
| `Tabs` | `items: { id, label, disabled?, content }[]` OR `items: { id, label, disabled?, href }[]`, `ariaLabel`, `selectedKey?`, `defaultSelectedKey?`, `disabledKeys?`, `onSelectionChange?`, `size?: "sm"\|"md"`, `variant?: "border"\|"box"\|"lift"` | Single React Aria Tabs primitive styled with DaisyUI `tabs`/`tab` classes. Use `content` items for in-page panels. Use `href` items for URL-addressable Next.js route tabs and pass `selectedKey` from route state. Do not mix `content` and `href` items in one instance. |
| `NavMenu` | `children`, `label?` | Renders `<nav><ul class="menu w-full p-0">`. Wraps sidebar navigation. |
| `NavLink` | `href`, `active?`, `current?`, `iconName?`, `children` | Single menu link inside `<li>`. `iconName` accepts a lucide icon name string (see `NavIcon` registry). Active state uses DaisyUI `menu-active` class. |
| `NavSection` | `title?`, `collapsible?`, `children` | Section header with nested items. When `collapsible`, renders `<details open><summary>{title}</summary>`. When not collapsible, renders `<h2 class="menu-title">`. |
| `DockLink` | `href`, `active?`, `current?`, `label`, `iconName?` | Mobile dock button. `iconName` accepts a lucide icon name string. Active state uses DaisyUI `dock-active` class. Without `iconName`, renders a small dot indicator. |

### Overlays

| Component | Key props | Notes |
|---|---|---|
| `ConfirmDialog` | `open`, `onOpenChange`, `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `variant?`, `error?`, `onConfirm(formData)`, `confirmDisabled?`, `children?` | React Aria Modal + Dialog with an internal React Aria Form. Uses DaisyUI `modal modal-open modal-box modal-action` classes. Enter/exit animations via `data-[entering]`/`data-[exiting]`. Pass form fields as `children`; confirm is `type="submit"` and supplies `FormData`. Return `false` from `onConfirm` to keep the dialog open for API/server errors; pass `error` to show a dialog-local alert. |

### Inputs

| Component | Key props | Notes |
|---|---|---|
| `SearchInput` | `value`, `onChange`, `placeholder?`, `grow?`, `size?: "sm"\|"md"` | React Aria SearchField. Controlled. Shows clear button when non-empty. `grow` adds `flex-1`. Default size `"md"`. |
| `FilterDropdown` | `label`, `options: { value, label }[]`, `value`, `onChange`, `size?: "sm"\|"md"` | React Aria Select styled as a filter pill. Default size `"md"`. Popover animates via React Aria `data-entering`/`data-exiting`. |

### Icons

| Component | Key props | Notes |
|---|---|---|
| `NavIcon` | `name?: string`, `variant?: "sidebar"\|"dock"` | Renders a lucide-react icon by name. Sidebar variant = `size-4`, dock variant = `size-[1.2em]` (DaisyUI-native). Used internally by `NavLink`, `DockLink`, and `Button`; never instantiate directly in route files. **Icon must be registered in `iconMap` in `nav-icons.tsx` before use** — unknown names render nothing. |

### Topbar Sub-components

| Component | Key props | Notes |
|---|---|---|
| `TopbarStart` | `children` | Left section of Topbar |
| `TopbarEnd` | `children` | Right section of Topbar |
| `TopbarBrandLink` | `href`, `children` | Brand/app name link, `btn btn-ghost text-xl font-semibold` |
| `TopbarBreadcrumb` | `items: string[]` | `breadcrumbs` DaisyUI component |
| `TopbarSearchField` | `placeholder?` | React Aria SearchField with Input + clear Button. Styled with DaisyUI `input input-bordered`. Shows `✕` clear button when non-empty. |
| `TopbarAvatarMenu` | `ariaLabel?`, `initials?`, `items: { label, href, badge? }[]` | Composes `Avatar` (trigger) + RAC `MenuTrigger`/`Menu`/`MenuItem` (dropdown) styled with DaisyUI. |
| `NavTitle` | `children` | Renders `<li><h2 class="menu-title">` — static section title without collapsible behavior |

### Avatar

| Component | Key props | Notes |
|---|---|---|
| `Avatar` | `initials?`, `image?`, `alt?`, `size?: "xs"\|"sm"\|"md"\|"lg"` | Pure DaisyUI: `avatar avatar-placeholder`. Shows image if `image` is provided, otherwise renders `initials` (first 2 chars) on a `bg-neutral text-neutral-content rounded-full` circle. Size maps: xs=20px, sm=28px, md=40px, lg=56px. |

### Menu

| Component | Key props | Notes |
|---|---|---|
| `MenuTrigger` | `children`, `isOpen?`, `onOpenChange?` | RAC `MenuTrigger` wrapper that splits `children` into trigger + menu slots. Renders `Popover` with `placement="bottom end"` and enter/exit animations. |
| `Menu` | `children`, `items?`, `renderEmptyState?`, ... | RAC `Menu` styled with DaisyUI `menu menu-sm dropdown-content bg-base-100 rounded-box shadow`. |
| `MenuItem` | `href?`, `label?`, `badge?`, `onAction?`, ... | RAC `MenuItem` with optional `menu-active` focus highlight. Accepts `badge` prop for a DaisyUI `badge badge-sm` suffix. |

## Screen Spec Format

File location: `workers/ui/docs/screens/<section>.md`
One file per admin section. Use second-level headings for detail pages within a section.

### Spec structure

Include a "Component gaps" table at the top listing any referenced components that don't exist yet in `@id/ui`:

```markdown
## Component gaps

| Component | Used on | Notes |
|---|---|---|
| `Avatar` | User detail | Image with fallback initials. Not yet in `@id/ui`. |
```

Then the screen spec:

```markdown
## /admin/path/to/page

[ASCII sketch showing full shell (topbar + sidebar + content) and ALL states:
 loading, empty, error, populated, AND all modals]

Components:
  AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  PageHeader: Inline(justify="between") > Text(variant="h1") + Inline > FilterDropdown + LinkButton(variant="primary")
  Panel(padding="none") > DataTable(columns=[...])
  Empty: EmptyState(message="...", cta="...", onCta=...)
  Delete: ConfirmDialog(title="...", variant="danger", onConfirm=...)

Data: GET /api/auth/some-endpoint → { items: [...], total }
      POST /api/auth/other-endpoint  body: { ... }

Behavior:
  - Describe what happens on each interaction
  - Debounce timing, filter composition, edge cases

States: loading → Skeleton ×5 | empty → EmptyState | error → ErrorAlert(message, onRetry)

Notes: ...
```

### Rules for ASCII sketches

- Show the full shell (topbar breadcrumb, sidebar nav, tab nav, content area) on every screen — not just the content panel.
- Show ALL states: loading (skeleton bars), empty, error, populated data, AND every modal (Create, Edit, Delete, Confirm) in the same sketch.
- Column headers and data values must be fully readable — no abbreviations past 3 chars.
- Use box-drawing characters: ┌─┐ └─┘ ├─┤ │

### Rules for Components block

- Use EXACT component names and prop names from the registry above.
- Nesting: use `>` to show parent-child relationships.
- Controlled components: describe the state variables they bind to (e.g., `value={role}`, `onChange={setRole}`).
- Modals: describe what ConfirmDialog wraps (form fields as children) and which API it calls on confirm.

### Rules for Data block

- List every API endpoint the page calls.
- Show the request shape (GET params or POST body).
- Show the response shape.
- Note any schema gaps (e.g., "Member schema has no user.name — must join via get-user").

The ASCII sketch resolves spatial relationships (left/right, stacked/inline, column order).
The Components block resolves exact `@id/ui` names and nesting — this is the LLM anchor.
Do not omit either. Both are required.

## References

- `docs/022_admin-ui-system.md` — architecture rationale, full token table, decisions
- `docs/023_admin-screen-story-strategy.md` — screen + story implementation contract (content component contract, actions file contract, route file contract, story file contract, shell decorator, workflow)
- `workers/ui/docs/screens/` — screen specs for all implemented and planned admin pages
- `workers/ui/src/app/globals.css` — DaisyUI theme definition (token source of truth)
- `packages/ui/src/` — component implementations (source of truth for prop shapes)
- `stories/_decorators/shell.tsx` — `AdminShell` decorator (for stories only, not exported from `@id/ui`)
- DaisyUI 5 docs: https://daisyui.com/components/
- DaisyUI 5 llms.txt (contract): https://daisyui.com/llms.txt
- React Aria Components docs: https://react-spectrum.adobe.com/react-aria/components.html
- React Aria llms.txt (contract): https://react-aria.adobe.com/llms.txt
