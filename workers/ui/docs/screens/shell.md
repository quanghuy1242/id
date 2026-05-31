# Admin Shell

Applies to all routes under `/admin`. The shell chrome (Topbar, Sidebar, MobileDock) is rendered once by `workers/ui/src/app/admin/layout.tsx`. The topbar leads with the console scope selector from `GET /api/auth/admin/console-scopes`; the route-owned scope (`/admin/platform/**` or `/admin/orgs/:orgId/**`) determines the selected lens, navigation visibility, and breadcrumb. Individual page files render body content and any route-specific action rows.

---

## Shell — Desktop (lg+)

```
+-- Topbar (navbar bg-base-100 shadow-sm border-b px-4 sm:px-6) --+
| id [ Platform v ] / Dashboard                         [bell][avatar] |
+-- Sidebar (aside bg-base-100 border-r p-4) -+-- MainContent -----+
| +-- menu bg-base-200 rounded-box --------+ |                    |
| | Overview                               | |  PageHeader        |
| |   Dashboard                            | |  +------------+   |
| | Identity                               | |  +------------+   |
| |   Users                                | |  | Title      |   |
| |   Organizations                        | |  | [Actions]  |   |
| | Applications                           | |  PageBody         |
| |   Applications                         | |  (scrolls)        |
| | Access                                 | |                   |
| |   Admins & Roles                       | |                   |
| |   Service Accounts                     | |                   |
| |   Resource APIs                        | |                   |
| |   Scope Catalog                        | |                   |
| |   M2M Bindings                         | |                   |
| | Security                               | |                   |
| |   Sessions                             | |                   |
| |   Tokens                               | |                   |
| |   Consents                             | |                   |
| |   Introspection                        | |                   |
| |   JWKS                                 | |                   |
| | Audit                                  | |                   |
| |   Audit                                | |                   |
| +----------------------------------------+ |                   |
+---------------------------------------------+------------------+
```

## Shell — Mobile (< lg)

```
+-- Topbar (navbar bg-base-100 shadow-sm border-b) ---------------+
| id [ Acme Publishing v ] / Members                       [avatar] |
+----------------------------------------------------------------+
| MobileRouteTabs (visible only when current section has siblings)|
|  [Members] [Teams] [Invitations]                               |
+----------------------------------------------------------------+
| MainContent (full width, no sidebar visible)                   |
|                                                                |
|  PageHeader                                                    |
|  +----------------------------------------------------------+  |
|  | Title                                      [Actions]     |  |
|  +----------------------------------------------------------+  |
|  PageBody (scrolls inside MainContent)                         |
|                                                                |
+-- MobileDock (dock dock-sm bg-base-100 border-t) --------------+
|  [• Dash] [• Identity] [• Apps] [• Access] [• Audit]          |
+----------------------------------------------------------------+
```

Components:
  AdminSwrProvider > AdminScopeProvider > AppShell > Topbar + AdminMobileRouteTabs + SidebarLayout + MobileDock
  AdminScopeProvider: fetches `GET /api/auth/admin/console-scopes` through `_actions/console-scopes.ts`, resolves the active scope from the URL, and exposes the envelope, active `ConsoleScope`, loading/error state, and scope-switch hrefs.
  Topbar: AdminTopbar (`usePathname()` + AdminScopeProvider-driven breadcrumb in `navbar-start`; DaisyUI navbar with `btn btn-ghost text-xl normal-case` brand link, scope selector `MenuTrigger` rendered as the first breadcrumb item, `ScopePickerTrigger` using normal button height with tighter horizontal padding and badge-toned border/text (`accent` for platform, `info` for organization), current page crumb, notifications, and avatar menu in `navbar-end`)
  Scope selector: operable `ConsoleScope` rows link to the equivalent route under the selected scope when an equivalent exists; member-only `ConsoleMembershipHint` rows link to `/account/organizations` and are never selectable console scopes.
  AdminMobileRouteTabs: `MobileRouteTabs` > section-level `Tabs` using URL-route items from the active visible nav section. Empty sections do not render, and dashboard hides tabs because its section has one item.
  SidebarLayout > Sidebar + MainContent
  Sidebar: AdminSidebarNav ("use client", usePathname for active, hidden on mobile) renders `visibleNavSections(activeScope)` from the single nav definition in `workers/ui/src/shared/constants.ts`; grouped sections use DaisyUI collapsible `details > summary + ul > li > a`
  MainContent: children slot — each page renders content body here; route title lives in the topbar breadcrumb
  MobileDock: AdminMobileNav ("use client", usePathname for dock-active, lg:hidden) with one section-level entry per visible section, `dock-label` text under a compact glyph

Active state rules:
  Sidebar items: active item uses the same menu row shape as all other items, with only text emphasis + aria-current; Dashboard uses exact match within the active route scope.
  Dock items:    className="dock-active" + aria-current="page" when any item in that visible section matches the current route.
  Mobile tabs:   React Aria `Tabs` route mode; selectedKey is the current group item href.
                 Shell tabs are hidden on desktop; route-owned detail tabs may still render inside content layouts where they describe entity-local tabs.

Actor info:
  Topbar avatar initials derive from `ConsoleScopeEnvelope.actor.email` when available.
  Avatar menu includes Account settings (`/account`), Theme, and Logout.

Notes:
  Sidebar, MobileRouteTabs, and MobileDock are implemented in workers/ui/src/app/admin/_components/admin-nav.tsx.
  AdminTopbar and the scope selector are also in admin-nav.tsx.
  `visibleNavItems(CONSOLE_NAV_ITEMS, activeScope)` is the pure lens filter; server endpoints still enforce authorization independently.
  Planned System routes remain in the screen registry but are not linked from the shell until their route files and specs exist.
  No mobile drawer — MobileDock provides top-level section navigation.
  Shell scrolling model: AppShell is h-screen overflow-hidden; MainContent scrolls independently.
  DaisyUI structure is authoritative: sidebar follows the documented `ul.menu > li > h2.menu-title + ul > li > a` pattern, and the topbar brand follows the navbar title/button pattern from the DaisyUI navbar examples.
