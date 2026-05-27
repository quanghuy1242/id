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
2. For a **new page**: read the screen spec in `workers/ui/docs/screens/<section>.md` before writing any code. If no spec exists, draft one and get approval before implementing.
3. For a **new component**: add it to `packages/ui/src/`, add the DaisyUI 5 link comment, export from `packages/ui/src/index.ts`, then use it.
   **Tree-shaking constraint:** `packages/ui/package.json` declares `"sideEffects": false`. Every component file must be side-effect-free at module level — no `import "./styles.css"`, no global registry calls, no top-level mutations. If a file must have a side effect, add it to the `sideEffects` array in package.json explicitly (e.g. `"sideEffects": ["./src/that-file.tsx"]`) rather than changing `false` to `true`.
4. For a **spec draft**: use the exact format in the Screen Spec Format section below.
5. Keep route files under `workers/ui/src/app/admin/**` as composition boundaries — assemble `@id/ui` primitives, pass data, no raw markup.
6. Run `pnpm lint` and `pnpm check` after any change to `packages/ui` or `workers/ui`.
7. Run `pnpm deploy:ui:dry-run` after any non-trivial change to `packages/ui` or `workers/ui`. This does a full Cloudflare Worker build and verifies the bundle assembles correctly without deploying. Fix any build errors before completing.

## Hard Rules

- Do not put raw `div`, `main`, `section`, `header`, `nav`, `aside`, `footer` in route files.
- Do not put raw typography tags (`h1`–`h3`, `p`, `span`) in route files. Use `Text` or `Heading`.
- Do not put DaisyUI classes (`btn`, `card`, `menu`, `navbar`, `input`, `badge`, `alert`, `table`, etc.) in route files.
- Do not put Tailwind visual utilities (`flex`, `grid`, `gap-*`, `p-*`, `m-*`, `text-*`, `bg-*`, `border-*`, `rounded-*`) in route files.
- Do not expose raw `className` as the primary styling API on new `packages/ui` components.
- Do not import `react-aria-components` directly in route files. Use `@id/ui` wrappers only.
- Do not create a new `/admin` route without a spec entry in `workers/ui/docs/screens/`.
- Do not invent new component names — use exact exports from `@id/ui` listed in the registry below.

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
| `radius-field` | `0.375rem` | same | Input, button corner radius |
| `radius-box` | `0.5rem` | same | Card, panel corner radius |

Use DaisyUI semantic classes (`bg-base-100`, `text-primary`, `border-base-300`) inside `packages/ui` components. Never hardcode hex values.

## Component Registry

All components are exported from `@id/ui` (`packages/ui/src/index.ts`).

### Layout — Shell

| Component | Key props | Notes |
|---|---|---|
| `AppShell` | `children` | Root wrapper, `h-screen overflow-hidden flex flex-col bg-base-200` |
| `Topbar` | `children` | `navbar` DaisyUI, `h-14 shrink-0`, `bg-base-100`, border-b |
| `SidebarLayout` | `children` | Flex row between Topbar and MobileDock; `flex-1 min-h-0 overflow-hidden` |
| `Sidebar` | `children` | `menu menu-sm w-64 shrink-0`; **hidden on mobile** (`hidden lg:flex`), `overflow-y-auto` |
| `MainContent` | `children` | `<main>` inside SidebarLayout; `flex-col flex-1 min-h-0 overflow-y-auto` |
| `MobileDock` | `children`, `ariaLabel?` | DaisyUI `dock dock-sm`, `lg:hidden` |
| `Page` | `layout?: "centered" \| "dashboard"` | Centered = auth pages; dashboard = legacy (prefer AdminLayout) |

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
| `Button` | `variant?: "primary"\|"secondary"\|"danger"`, `size?: "sm"\|"md"`, `type?`, `disabled?`, `onClick?` | Form/action button |
| `LinkButton` | `href`, `variant?`, `size?` | Navigation, renders `<a>` |

### Form

| Component | Key props | Notes |
|---|---|---|
| `TextInput` | `label`, `name`, `type?`, `autoComplete?`, `required?`, `defaultValue?`, `error?` | Labeled input with error display |
| `HiddenInput` | `name`, `value` | Hidden form field |
| `RadioGroup` | `title`, `name`, `options`, `value`, `onChange` | Controlled radio set |

### Feedback

| Component | Key props | Notes |
|---|---|---|
| `Alert` | `tone?: "error"\|"success"\|"warning"\|"info"` | Full-width alert with icon |
| `Badge` | `tone?: "neutral"\|"primary"\|"secondary"\|"accent"\|"success"\|"warning"\|"error"\|"info"` | `badge-sm badge-outline` |
| `Skeleton` | `rows?: number`, `height?: "xs"\|"sm"\|"md"` | Loading placeholder rows |
| `EmptyState` | `message`, `cta?`, `onCta?` | Centered empty message + optional CTA |
| `ErrorAlert` | `message?`, `onRetry?` | Error alert with inline retry button |

### Data

| Component | Key props | Notes |
|---|---|---|
| `DataTable` | `columns`, `rows`, `getRowKey`, `onRowClick?`, `sortBy?`, `sortDirection?`, `onSort?`, `pagination?` | Sortable, paginated table. `columns` is `DataTableColumn<T>[]`. |

### Navigation

| Component | Key props | Notes |
|---|---|---|
| `TabNav` | `items: { href, label, active? }[]` | URL-routed tab bar. Set `active` from `usePathname()` in route file. Not React Aria Tabs — each tab is a navigation link. |

### Overlays

| Component | Key props | Notes |
|---|---|---|
| `ConfirmDialog` | `open`, `onOpenChange`, `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `variant?`, `onConfirm`, `confirmDisabled?`, `children?` | React Aria Modal + Dialog. Pass form fields as `children`. |

### Inputs

| Component | Key props | Notes |
|---|---|---|
| `SearchInput` | `value`, `onChange`, `placeholder?` | React Aria SearchField. Controlled. Shows clear button when non-empty. |
| `FilterDropdown` | `label`, `options: { value, label }[]`, `value`, `onChange` | React Aria Select styled as a filter pill. |

## Screen Spec Format

File location: `workers/ui/docs/screens/<section>.md`
One file per admin section. Use second-level headings for detail pages within a section.

```markdown
## /admin/path/to/page

[ASCII sketch — rough is fine, typos allowed]
+-- Header -------------------------+
| Title           [Filter] [+ New]  |
+-----------------------------------+
| Col A   | Col B  | Col C          |
| row...  | ...    | ...            |
+-----------------------------------+

Components:
  AppShell > Topbar + Sidebar + PageBody
  PageHeader: Inline(justify="between") > Text(variant="h1") + Inline > FilterDropdown + LinkButton(variant="primary")
  Panel(padding="none") > DataTable(columns=[...])
  Empty: EmptyState(cta="Create ...")
  Delete: ConfirmDialog

Data: GET /api/auth/some-endpoint → { items: [...], total }
      GET /api/auth/other-endpoint (for filter dropdown options)
      "org" column hidden when actor.role === "org_admin"

States: loading → Skeleton ×5 | empty → EmptyState | error → ErrorAlert + retry

Notes: bulk delete requires ConfirmDialog before calling DELETE
       platform admin sees org column; org admin does not
```

The ASCII sketch resolves spatial relationships (left/right, stacked/inline, column order).
The Components block resolves exact `@id/ui` names and nesting — this is the LLM anchor.
Do not omit either. Both are required.

## References

- `docs/022_admin-ui-system.md` — architecture rationale, full token table, decisions
- `workers/ui/docs/screens/` — screen specs for all implemented and planned admin pages
- `workers/ui/src/app/globals.css` — DaisyUI theme definition (token source of truth)
- `packages/ui/src/` — component implementations
- DaisyUI 5 docs: https://daisyui.com/components/
- React Aria Components: https://react-spectrum.adobe.com/react-aria/components.html
