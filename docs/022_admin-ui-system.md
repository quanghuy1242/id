# id — Admin UI Design System

> Status: reference — active, update when layers change
>
> Date: 2026-05-27
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — the `id` identity provider monorepo
> - `/home/quanghuy1242/pjs/idco/packages/ui/` — shared component library
> - `workers/ui/` — admin UI worker
> - `workers/ui/docs/screens/` — screen spec folder
>
> Source docs:
>
> - `docs/003_future-implementation.md` §6, §11
> - `workers/ui/src/app/globals.css`
> - `/home/quanghuy1242/pjs/idco/packages/ui/src/**`
>
> Related docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/002_implementation-sequence.md` Phase 7

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Layer 1 — Design Tokens](#31-layer-1--design-tokens)
  - [3.2 Layer 2 — Component Library](#32-layer-2--component-library)
  - [3.3 Layer 3 — Screen Specs](#33-layer-3--screen-specs)
  - [3.4 Existing Admin Routes](#34-existing-admin-routes)
  - [3.5 Lint Enforcement](#35-lint-enforcement)
- [4. Target Model](#4-target-model)
  - [4.1 Layer 1 — Design Tokens](#41-layer-1--design-tokens)
  - [4.2 Layer 2 — Component Library](#42-layer-2--component-library)
  - [4.3 Layer 3 — Screen Specs](#43-layer-3--screen-specs)
  - [4.4 Screen Spec Format](#44-screen-spec-format)
  - [4.5 Consistency Gate](#45-consistency-gate)
- [5. Architecture Decisions](#5-architecture-decisions)
  - [5.1 Token Source Of Truth Is globals.css, Not A JSON Schema](#51-token-source-of-truth-is-globalscss-not-a-json-schema)
  - [5.2 Component Convention Is A DaisyUI Link, Not A JSON Registry](#52-component-convention-is-a-daisyui-link-not-a-json-registry)
  - [5.3 Screen Spec Is ASCII + Component List, Not Pseudo-Code Tree](#53-screen-spec-is-ascii--component-list-not-pseudo-code-tree)
  - [5.4 React Aria Stays](#54-react-aria-stays)
  - [5.5 Radix UI Rejected](#55-radix-ui-rejected)

## 1. Goal

Maintain visual and structural consistency across all `/admin/*` pages in `workers/ui`, specifically across multiple agent sessions that each start cold with no shared state. Without a contract, two sessions implementing adjacent pages will make independent decisions about layout, component choice, and visual hierarchy, producing a fragmented admin UI.

The design system establishes three layers:

1. **Tokens** — color, spacing, typography values that cannot be overridden at the component or page level.
2. **Component library** — `@idco/ui` primitives from the sibling idco repo that route files must use; raw DaisyUI/Tailwind classes are forbidden in route files.
3. **Screen specs** — per-page planning artifacts in `workers/ui/docs/screens/` that define layout and component composition before implementation. The spec is the brief that constrains an agent session.

Non-goals:

- Full W3C DTCG token format, JSON schema component registry, or automated code generation from specs. These add tooling overhead without value at the current scale.
- Storybook or visual regression testing infrastructure.
- Design token synchronization with an external design tool.

## 2. System Summary

```
globals.css (workers/ui/src/app/globals.css)
  └── DaisyUI 5 theme: idco-light / idco-dark
      └── CSS custom properties: base-100/200/300, base-content, primary

@idco/ui (/home/quanghuy1242/pjs/idco/packages/ui/src/)
  └── Layout: Page, AppShell, PageHeader, PageBody, Container, Panel, Stack, Inline, Grid, Columns, Spacer
  └── Typography: Text, Heading
  └── Interactive: Button, LinkButton
  └── Form: TextInput, HiddenInput, RadioGroup
  └── Feedback: Alert, Badge, Skeleton, EmptyState, ErrorAlert
  └── Data: DataTable
  └── Navigation: Tabs
  └── Overlays: ConfirmDialog
  └── Inputs: SearchInput, FilterDropdown
  └── Interactive leaves: react-aria-components (Dialog, Modal, Select, SearchField)

workers/ui/src/app/admin/**
  └── Route files: composition only — assemble @idco/ui primitives, no raw HTML/DaisyUI/Tailwind

workers/ui/docs/screens/
  └── One .md per admin page section — ASCII + component list + data + states
```

The lint rule `ui-route-composition` in `scripts/oxlint-js-plugins/architecture.js` enforces that route files under `workers/ui/src/app/` contain no raw visual layout, DaisyUI classes, or Tailwind visual utilities.

## 3. Current-State Findings

### 3.1 Layer 1 — Design Tokens

**File:** `workers/ui/src/app/globals.css`

The token layer is fully defined as a DaisyUI 5 CSS-first theme. Two themes exist: `idco-light` (default) and `idco-dark` (prefers-dark). The theme is applied automatically by DaisyUI based on `prefers-color-scheme`.

`/home/quanghuy1242/pjs/idco/packages/ui/src/theme/index.ts` exports only `themeName = "idco"`. This is used to reference the theme name in tests or configuration and is not a token definition file.

No `.tokens.json` file exists. The CSS file is the single source of truth.

### 3.2 Layer 2 — Component Library

**Package:** `packages/ui` (`@idco/ui`)

**Dependencies:** `react@19.2.6`, `react-aria-components@1.17.0`, `lucide-react@1.16.0`

**Exported components:**

| File | Exports |
|---|---|
| `app-shell/index.tsx` | `Page`, `Container`, `PageSection`, `PageHeader`, `PageBody`, `Panel`, `Stack`, `Grid`, `Columns`, `Spacer`, `AppShell`, `Topbar`, `Sidebar`, `MobileDock` |
| `typography.tsx` | `Text`, `Heading` |
| `button.tsx` | `Button`, `LinkButton` |
| `form.tsx` | `TextInput`, `HiddenInput`, `RadioGroup` |
| `alert.tsx` | `Alert` |
| `badge.tsx` | `Badge` |
| `inline.tsx` | `Inline` |
| `skeleton.tsx` | `Skeleton` |
| `empty-state.tsx` | `EmptyState` |
| `error-alert.tsx` | `ErrorAlert` |
| `search-input.tsx` | `SearchInput` |
| `filter-dropdown.tsx` | `FilterDropdown` |
| `tabs.tsx` | `Tabs`, `TabItem` |
| `confirm-dialog.tsx` | `ConfirmDialog` |
| `data-table.tsx` | `DataTable`, `DataTableColumn`, `SortDirection` |

React Aria wrappers for `Dialog`/`Modal`, `Select`, and `SearchField` live inside `confirm-dialog.tsx`, `filter-dropdown.tsx`, and `search-input.tsx` respectively. Route files never import `react-aria-components` directly.

**Note on `Tabs`:** Admin detail pages use URL-addressable tabs (each tab is a separate Next.js route). `Tabs` supports this by accepting `href` items and rendering React Aria tab anchors through Next `Link`; route files call `usePathname()` and pass the matching `selectedKey`. The same component also supports in-page panel switching when items provide `content` instead of `href`. Do not mix `href` and `content` items in the same instance.

### 3.3 Layer 3 — Screen Specs

`workers/ui/docs/screens/` contains:

| File | Covers | Status |
|---|---|---|
| `index.md` | Route registry — all `/admin/*` routes with status column | active |
| `identity.md` | All `/admin/identity/**` screens (8 routes) | specced |

Remaining sections (`oauth.md`, `security.md`, `system.md`, `dashboard.md`) are planned but not yet specced.

### 3.4 Existing Admin Routes

| File | Route | Status |
|---|---|---|
| `workers/ui/src/app/admin/page.tsx` | `/admin` | Scaffold — empty or placeholder |
| `workers/ui/src/app/ui-health/route.ts` | `/ui-health` | API route, no UI; kept outside `/admin` so the admin proxy protects every admin path and core keeps `/health` |

All other admin pages from `docs/003` §6.1 are unimplemented.

### 3.5 Lint Enforcement

The `ui-route-composition` rule in `scripts/oxlint-js-plugins/architecture.js` fires on route files under `workers/ui/src/app/`. It prohibits raw `div`, `main`, `section`, `header`, `nav`, `h1–h3`, `p`, `span`, and DaisyUI/Tailwind classes directly in route files. Fix the code; never suppress this rule.

## 4. Target Model

### 4.1 Layer 1 — Design Tokens

**Source of truth:** `workers/ui/src/app/globals.css`

Do not redefine token values anywhere else. Do not add inline `style={{ color: "#155eef" }}` — reference the DaisyUI semantic classes (`text-primary`, `bg-base-100`, etc.) inside `packages/ui` components. If a new color, radius, or spacing value is needed, add it to `globals.css` as a CSS custom property and map it to a DaisyUI semantic role.

**Token values (idco-light):**

| Token | Value | Usage |
|---|---|---|
| `--color-base-100` | `#ffffff` | Surface, card background |
| `--color-base-200` | `#f7f8fb` | Page background |
| `--color-base-300` | `#e6e8eb` | Borders, dividers |
| `--color-base-content` | `#1f2328` | Primary text |
| `--color-primary` | `#155eef` | Actions, links, focus |
| `--color-primary-content` | `#ffffff` | Text on primary |
| `--radius-field` | `0.375rem` | Input, button radius |
| `--radius-box` | `0.5rem` | Card, panel radius |

Dark theme uses the same structure with inverted base values; primary remains `#155eef`.

### 4.2 Layer 2 — Component Library

**Package:** `@idco/ui` at `/home/quanghuy1242/pjs/idco/packages/ui/src/`

Every visual element in a route file must come from `@idco/ui`. No exceptions. The component library grows as pages are added — when a required component does not exist, add it to the sibling idco package first, publish/repin, then use it in the route.

**Adding a new component:**

1. Create `/home/quanghuy1242/pjs/idco/packages/ui/src/<component-name>.tsx`.
2. Add a JSDoc link comment at the top of the file pointing to the relevant DaisyUI 5 component documentation. For React Aria wrapper components, add a second link to the React Aria component page.
3. Expose only tokenized props (`variant`, `tone`, `size`, `gap`, `padding`). Do not expose `className` as the primary API.
4. Export from `/home/quanghuy1242/pjs/idco/packages/ui/src/index.ts`.

**Example component header:**

```tsx
// DaisyUI 5: https://daisyui.com/components/table/
// React Aria: https://react-spectrum.adobe.com/react-aria/Table.html (if applicable)
```

**Component prop conventions:**

| Prop type | Values | Description |
|---|---|---|
| `variant` | `"primary" \| "secondary" \| "danger"` | Action intent |
| `tone` | `"base" \| "muted" \| "error" \| "success" \| "warning" \| "info"` | Surface or feedback tone |
| `size` | `"sm" \| "md" \| "lg"` | Density |
| `gap` | `"xs" \| "sm" \| "md" \| "lg"` | Spacing between children |
| `padding` | `"none" \| "sm" \| "md" \| "lg"` | Internal spacing |
| `width` | `"narrow" \| "content" \| "wide" \| "full"` | Container width |
| `align` | `"start" \| "center" \| "end"` | Cross-axis alignment |
| `justify` | `"start" \| "center" \| "between" \| "end"` | Main-axis alignment |

Do not invent new prop names for the same concern. Match existing conventions.

**React Aria usage:** Use `react-aria-components` for `Dialog`, `Select`, `Menu`, `Combobox`, `SearchField`, and other complex interactive components. Wrap each in a `packages/ui` component that applies DaisyUI classes and exposes only tokenized props. Route files never import `react-aria-components` directly.

### 4.3 Layer 3 — Screen Specs

**Location:** `workers/ui/docs/screens/`

**One file per admin section** (not per route). Name files by section: `applications.md`, `resource-apis.md`, `organizations.md`, `users.md`, etc. Detail pages for a section live in the same file under a second-level heading.

A screen spec is written before implementation. It is a planning artifact, not a living document that tracks implementation state. After implementation, the code is the ground truth. The spec is not maintained to match code changes.

**Hard rule:** A new `/admin` route file must not be created without a corresponding spec entry in `workers/ui/docs/screens/`. The spec does not need to be complete but must contain at minimum the ASCII sketch, the component list, and the data source line.

### 4.4 Screen Spec Format

Every spec entry uses this template:

```markdown
## /admin/path/to/page

[ASCII sketch — rough is fine, typos allowed]

Components:
  ParentComponent > ChildComponent > LeafComponent
  Inline actions: ComponentA + ComponentB(variant="x")
  Empty: EmptyState(cta="...")
  Dialogs: ConfirmDialog on delete

Data: METHOD /api/auth/endpoint → shape { field, field }
      METHOD /api/auth/other-endpoint (for dropdown, filter, etc.)
      column/field hidden/shown when actor.role === "..."

States: loading → skeleton ×N | empty → EmptyState | error → ErrorAlert + retry

Notes: non-obvious behavior, authorization guards, confirmation flows
```

**ASCII sketch rules:**

- Use `+--`, `|`, and `-` for borders. Approximate widths are fine.
- Show spatial relationships: left/right positioning, stacked vs inline, column order.
- Show action placement: where buttons, filters, and search sit relative to the table.
- One sketch per page or tab. Detail pages get their own sketch.

**Component list rules:**

- Use exact `@idco/ui` export names. If the component does not exist yet, write it anyway and create the component before implementing the page.
- Show nesting hierarchy with `>`.
- Note `variant` and `tone` only when non-default.
- Do not list every prop — only the ones that vary from defaults.

**Data rules:**

- List every API endpoint the page calls, with the HTTP method and the response shape fields the UI uses.
- Note conditional column visibility tied to actor role.

### 4.5 Consistency Gate

The screen spec is the consistency gate between agent sessions. An agent implementing a page reads the spec and is constrained to:

- The component names listed — it must use those exact `@idco/ui` exports.
- The spatial layout in the ASCII sketch — it cannot invert the column order or move actions to a different position.
- The data sources listed — it calls the stated endpoints and maps the stated fields.
- The states defined — it handles loading, empty, and error with the named components.

An agent reviewing a page implementation reads the spec and verifies those same constraints. Two independent sessions reading the same spec will produce structurally identical output.

## 5. Architecture Decisions

### 5.1 Token Source Of Truth Is globals.css, Not A JSON Schema

**Decision:** `workers/ui/src/app/globals.css` is the token source of truth. No `.tokens.json` or DTCG file.

**Why:** DTCG format requires a build pipeline (dispersa, Style Dictionary, or custom) to emit CSS. The DaisyUI 5 CSS-first setup already emits correct CSS custom properties directly from the theme definition. Adding a JSON intermediate layer adds tooling with no gain — the CSS is already the correct output format, and DaisyUI's CSS-layer approach means the variables are scoped and overridable without a build step.

**Constraint:** If the project adds a design tool (Figma, Penpot) that requires token export, adopt DTCG at that point. Until then the CSS file is sufficient and correct.

### 5.2 Component Convention Is A DaisyUI Link, Not A JSON Registry

**Decision:** Each `packages/ui` component file carries a `// DaisyUI 5: <url>` comment. No separate JSON schema registry.

**Why:** A JSON component registry (PatternFly-style, Prototyper-style) requires tooling to validate props at build time and must be kept in sync with the TypeScript source. The TypeScript types in `packages/ui` already define the valid prop surface. An AI agent reading the TypeScript file sees the same information a JSON schema would provide. The DaisyUI link anchors the visual contract; the TypeScript types anchor the code contract. No third artifact is needed.

**Constraint:** If `packages/ui` grows beyond ~30 components, revisit a lightweight index file that lists component names and their DaisyUI anchors for faster lookup by agents and tools.

### 5.3 Screen Spec Is ASCII + Component List, Not Pseudo-Code Tree

**Decision:** The screen spec format is ASCII sketch + component list + data + states. The full pseudo-code component tree from `docs/003` §11.8 is not used.

**Why:** A full pseudo-code component tree (every prop, every conditional, every event handler) is effectively code written in a different syntax. It will diverge from the implementation immediately and cannot be maintained without duplicating effort. The ASCII sketch captures spatial relationships (which the component list cannot); the component list captures exact primitive choices (which the ASCII cannot). Together they provide the minimum information needed for two cold agent sessions to agree on the same implementation. Prose descriptions of the same information are longer and more ambiguous.

**Constraint:** The spec is a planning artifact written before implementation. It is not updated after implementation. If a page changes significantly, update the spec only if a new implementation session will be started for that page.

### 5.4 React Aria Stays

**Decision:** `react-aria-components@1.17.0` remains the dependency for complex interactive components. No replacement.

**Why:** No confirmed build-time blocker with Vite or vinext exists. React Aria is pure ESM and compiles cleanly. The complexity tax is in the API (hooks, controlled state, context providers) not in the bundler. The `books` project already runs React Aria with DaisyUI/Tailwind without issues. The cost of replacing it (rewriting every future Dialog, Select, and Menu component) exceeds the cost of learning the API.

**If a concrete build blocker is discovered:** document it here with the exact error, package version, and build tool version, then evaluate replacement options at that point.

### 5.5 Radix UI Rejected

**Decision:** Radix UI is not adopted as a replacement for React Aria.

**Why:** User preference. Not adopted regardless of technical tradeoffs.
