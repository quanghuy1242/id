# Admin Shell

Applies to all routes under `/admin`. The shell chrome (Topbar, Sidebar, MobileDock) is rendered once by
`workers/ui/src/app/admin/layout.tsx`. Individual page files render only `PageHeader` + `PageBody`.

---

## Shell — Desktop (lg+)

```
+-- Topbar (navbar, h-14, bg-base-100, border-b, shrink-0) ------+
| id admin                                          [actor-name]  |
+-- Sidebar (w-64, lg:flex, overflow-y-auto) -+-- MainContent ---+
| Dashboard                                    |                  |
|                                              |  PageHeader      |
| Identity                                     |  +------------+  |
|   Users                                      |  | Title      |  |
|   Organizations                              |  | [Actions]  |  |
|                                              |  +------------+  |
| OAuth                                        |  PageBody        |
|   Applications                               |  (scrolls)       |
|   Resource APIs                              |                  |
|   Scope Catalog                              |                  |
|   M2M Bindings                               |                  |
|   Sessions & Tokens                          |                  |
|                                              |                  |
| Security                                     |                  |
|   JWKS                                       |                  |
|   Consents                                   |                  |
|                                              |                  |
| System                                       |                  |
|   Service Accounts                           |                  |
|   Issuer Metadata                            |                  |
|   SCIM Status                                |                  |
|   Health                                     |                  |
|   Settings                                   |                  |
+---------------------------------------------+------------------+
```

## Shell — Mobile (< lg)

```
+-- Topbar (h-14, bg-base-100, border-b) ------------------------+
| id admin                                          [actor-name]  |
+----------------------------------------------------------------+
| MainContent (full width, no sidebar visible)                   |
|                                                                |
|  PageHeader                                                    |
|  +----------------------------------------------------------+  |
|  | Title                                      [Actions]     |  |
|  +----------------------------------------------------------+  |
|  PageBody (scrolls inside MainContent)                         |
|                                                                |
+-- MobileDock (dock, dock-sm, fixed bottom, lg:hidden) ---------+
|  [Dash]   [Identity]   [OAuth]   [Security]   [System]        |
+----------------------------------------------------------------+
```

Components:
  AppShell > Topbar + SidebarLayout + MobileDock
  Topbar: AdminTopbar (non-client; DaisyUI navbar-start/navbar-end layout)
  SidebarLayout > Sidebar + MainContent
  Sidebar: AdminSidebarNav ("use client", usePathname for active, hidden on mobile)
  MainContent: children slot — each page renders PageHeader + PageBody here
  MobileDock: AdminMobileNav ("use client", usePathname for dock-active, lg:hidden)

Active state rules:
  Sidebar items: className="active" + aria-current="page" when pathname.startsWith(item.href)
                 Dashboard uses exact match (pathname === "/admin")
  Dock items:    className="dock-active" + aria-current="page" when pathname.startsWith(section.primaryHref)
                 Dashboard uses exact match

Actor info:
  Topbar right slot — placeholder "Admin" until auth middleware is wired.
  Replace with actor name + role badge once session is available in layout.

Notes:
  Sidebar and MobileDock are implemented in workers/ui/src/app/admin/_components/admin-nav.tsx.
  AdminTopbar is also in admin-nav.tsx (server-safe; no hooks).
  No mobile drawer — MobileDock provides top-level section navigation.
  Shell scrolling model: AppShell is h-screen overflow-hidden; MainContent scrolls independently.
