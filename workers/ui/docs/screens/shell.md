# Admin Shell

Applies to all routes under `/admin`. The shell chrome (Topbar, Sidebar, MobileDock) is rendered once by
`workers/ui/src/app/admin/layout.tsx`. Route location/title is shown in the topbar breadcrumb. Individual page files render body content and any route-specific action rows.

---

## Shell — Desktop (lg+)

```
+-- Topbar (navbar bg-base-100 shadow-sm border-b px-4 sm:px-6) --+
| [btn btn-ghost text-xl] id admin / Admin / Dashboard [input][avatar] |
+-- Sidebar (aside bg-base-100 border-r p-4) -+-- MainContent -----+
| +-- menu bg-base-200 rounded-box --------+ |                    |
| | Dashboard                              | |  PageHeader        |
| | Identity                               | |  +------------+   |
| |   Users                                | |  | Title      |   |
| |   Organizations                        | |  | [Actions]  |   |
| | OAuth                                  | |  +------------+   |
| | Grants & Keys                          | |  PageBody         |
| |                                        | |  (scrolls)        |
| | OAuth/Security sub-tabs live in pages  | |                   |
| | System                                 | |                   |
| |   Service Accounts                     | |                   |
| |   Issuer Metadata                      | |                   |
| |   SCIM Status                          | |                   |
| |   Health                               | |                   |
| |   Settings                             | |                   |
| +----------------------------------------+ |                   |
+---------------------------------------------+------------------+
```

## Shell — Mobile (< lg)

```
+-- Topbar (navbar bg-base-100 shadow-sm border-b) ---------------+
| [btn btn-ghost text-xl] id admin / Admin / Dashboard [input][avatar] |
+----------------------------------------------------------------+
| MobileRouteTabs (visible only when current section has siblings)|
|  [Users] [Organizations]                                       |
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
|  [• Dash] [• Identity] [• OAuth] [• Security] [• System]      |
+----------------------------------------------------------------+
```

Components:
  AppShell > Topbar + AdminMobileRouteTabs + SidebarLayout + MobileDock
  Topbar: AdminTopbar (`usePathname()`-driven breadcrumb in `navbar-start`; DaisyUI navbar with `btn btn-ghost text-xl normal-case` brand button, `ResponsiveBreadcrumb(items)` (auto-collapses overflow with ResizeObserver), and avatar menu in `navbar-end`)
  AdminMobileRouteTabs: `MobileRouteTabs` > section-level `Tabs` using URL-route items from active grouped sidebar sections. Identity uses shell tabs; OAuth and Security own their own route-tab bars inside their section layouts because their desktop sidebar entries are flat.
  SidebarLayout > Sidebar + MainContent
  Sidebar: AdminSidebarNav ("use client", usePathname for active, hidden on mobile) rendered as one `ul.menu.bg-base-200.rounded-box`; flat section entries are direct `li > a`, grouped sections use DaisyUI collapsible `details > summary + ul > li > a`
  MainContent: children slot — each page renders content body here; route title lives in the topbar breadcrumb
  MobileDock: AdminMobileNav ("use client", usePathname for dock-active, lg:hidden) with `dock-label` text under a compact glyph

Active state rules:
  Sidebar items: active item uses the same menu row shape as all other items, with only text emphasis + aria-current
                 Dashboard uses exact match (pathname === "/admin")
  Dock items:    className="dock-active" + aria-current="page" when pathname.startsWith(section.activeHref)
                 Dashboard uses exact match
  Mobile tabs:   React Aria `Tabs` route mode; selectedKey is the current group item href.
                 Shell tabs are hidden on desktop and do not replace route-owned OAuth/Security tabs.

Actor info:
  Topbar avatar dropdown is a placeholder shell control until auth/session wiring exists.
  Replace initials + menu targets with real actor data once session is available in layout.

Notes:
  Sidebar, MobileRouteTabs, and MobileDock are implemented in workers/ui/src/app/admin/_components/admin-nav.tsx.
  AdminTopbar is also in admin-nav.tsx (server-safe; no hooks).
  No mobile drawer — MobileDock provides top-level section navigation.
  Shell scrolling model: AppShell is h-screen overflow-hidden; MainContent scrolls independently.
  DaisyUI structure is authoritative: sidebar follows the documented `ul.menu > li > h2.menu-title + ul > li > a` pattern, and the topbar brand follows the navbar title/button pattern from the DaisyUI navbar examples.
