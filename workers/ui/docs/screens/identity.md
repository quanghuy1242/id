# Identity Screens

## Component registry (all implemented)

All components exist in `packages/ui/src/` with the exact props described in this spec:
`AppShell`, `Topbar`, `TopbarStart`, `TopbarEnd`, `TopbarBrandLink`, `TopbarSearchField`, `TopbarBreadcrumb`, `TopbarAvatarMenu`,
`Sidebar`, `SidebarLayout`, `MainContent`, `MobileDock`,
`PageHeader`, `PageBody`, `PageSection`, `Panel`, `Stack`, `Inline`, `Grid`, `Columns`, `Spacer`,
`NavMenu`, `NavSection`, `NavLink`, `DockLink`, `NavTitle`,
`Text`, `Heading`,
`Button` (variant/size/iconName/iconPosition/ariaLabel/circle/disabled/onClick — `children` optional for icon-only buttons),
`LinkButton` (href/variant/size/children),
`TextInput` (label/name/type/required/defaultValue/autoComplete/error/validate/onChange — no `placeholder`, no `type="number"`),
`Textarea` (label/name/required/defaultValue/error/rows/placeholder/onChange — monospace font-mono, used for JSON/multiline fields),
`RadioGroup` (title/name/options/value/onChange — fully controlled),
`Avatar` (initials/image/alt/size),
`Alert` (tone); `Badge` (tone/size/children); `Skeleton` (rows/height); `EmptyState` (message/cta/onCta);
`ErrorAlert` (message/onRetry); `SearchInput` (value/onChange/placeholder/grow/size); `FilterDropdown` (label/options/value/onChange/size);
`Tabs` (ariaLabel/selectedKey/items/onSelectionChange — route-tab items with href);
`ConfirmDialog` (open/onOpenChange/title/description/confirmLabel/cancelLabel/variant/onConfirm/confirmDisabled/error/children);
`DataTable` (columns/rows/getRowKey/onRowClick/sortBy/sortDirection/onSort/pagination={total/limit/offset/onChange});
`MobileFilterMenu` (groups=[{key,label,options,value,onChange}], size) — folds multiple FilterDropdowns into a … menu on mobile;
`ResponsiveBreadcrumb` (items=string[]) — auto-collapses overflow items into a … menu using ResizeObserver;
`MenuTrigger` > `Button` + `Menu` > `MenuItem` — generic dropdown menu pattern used for mobile action folding.

**Button/LinkButton responsive props:** `hideOnMobile` adds `hidden lg:inline-flex`, `hideOnDesktop` adds `lg:hidden`. Use these to swap desktop/mobile controls without raw className in admin route files.

**Icon names registered in nav-icons.tsx:** Activity, AppWindow, Bot, Building2, ChevronDown, ChevronLeft, ChevronRight,
Ellipsis, FileCheck2, Fingerprint, Globe, HeartPulse, KeyRound, LayoutDashboard, Link2, Pencil, Plus, Server, Settings, Tags, Trash2, Users.
Add new icons to `iconMap` in `packages/ui/src/nav-icons.tsx` before using them.

**Icon-only LinkButton:** Pass `iconName` + `ariaLabel` + `href` with no `children`.
```tsx
<LinkButton href="/admin/identity/users" variant="secondary" size="sm" hideOnMobile iconName="ChevronLeft" ariaLabel="Back to Users" />
```

**Mobile patterns (summary):**
- Filter bars → `MobileFilterMenu` (folds N FilterDropdowns into a single … menu on mobile)
- Single action buttons → `MenuTrigger` > `Button(iconName="Ellipsis", hideOnDesktop)` + `Menu(MenuItem)` on mobile, `Button(hideOnMobile)` on desktop
- Detail back buttons → `LinkButton(iconName="ChevronLeft", size="sm", hideOnMobile)`
- Breadcrumbs → `ResponsiveBreadcrumb(items)` instead of `TopbarBreadcrumb` — auto-collapses at any viewport, no manual breakpoints

---

Covers all routes under `/admin/identity`. Actor-scoping rules:
- Platform admin (`user.role = "admin"`) — full access to users and all organizations.
- Org admin (`member.role = "owner" | "admin"`) — no access to `/admin/identity/users`; directed to their own org detail only.

Box-drawing key: ┌─┐ top edge · └─┘ bottom · ├─┤ mid · │ vertical · ↕ sortable · ▸ active · ● on · ○ off · ✓ yes · ✗ no

**Ladle story pattern for nested detail pages:**
User and organization detail routes use a nested layout. Stories render the provider, header content, and route-specific content together,
matching the route file structure. This ensures the shared header, active tab, and child panel are visible in every story state.
```tsx
export const OrgMembers_Populated: Story = () => (
  <AdminShell activePath="/admin/identity/organizations/org_001/members">
    <PageBody>
      <OrgDetailProvider orgId="org_001" actions={detailActions}>
        <Stack gap="md">
          <OrgDetailHeaderContent activeTab="members" actions={detailActions} />
          <OrganizationMembersContent orgId="org_001" actions={membersActions} />
        </Stack>
      </OrgDetailProvider>
    </PageBody>
  </AdminShell>
);
```

---

## /admin/identity/users

Platform admin only. Implemented route: `workers/ui/src/app/admin/identity/users/page.tsx`.
The admin shell is supplied by `workers/ui/src/app/admin/layout.tsx`; this route owns only the `PageBody` content.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Users                              [Role: All Roles ▾] [Status: All ▾] │
│ │ [Search name or email...                                  ] [+ New] │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Name ↕        Email ↕          Role      Status     Verified Created ↕ │
│ │ John Doe      john@acme.com    admin     Active     Verified 1/15/2024 │
│ │ Jane Adams    jane@beta.com    user      Banned     Unverified 2/1/2024│
│ │ Bob King      bob@corp.com     user      Active     Verified 3/10/2024 │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌── loading ──────────────────────────────────────────────────────┐ │
│ │ ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎  ∎∎                │ │
│ │ ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎  ∎∎                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌── empty ────────────────────────────────────────────────────────┐ │
│ │                         [Inbox icon]                            │ │
│ │                         No users found                          │ │
│ │                         [Create User]                           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌── search-empty/filter-empty ────────────────────────────────────┐ │
│ │                         [Inbox icon]                            │ │
│ │       No users match your search / No users matching filters     │ │
│ │                  [Clear search] / [Clear filters]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌── error ────────────────────────────────────────────────────────┐ │
│ │ ⚠ Failed to load users                                      Retry│ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌── Create User modal ────────────────────────────────────────────┐ │
│ │ Create User                                                     │ │
│ │ Name     [                                      ]                │ │
│ │ Email    [                                      ]                │ │
│ │ Password [                                      ]                │ │
│ │ Role     ○ User  ● Admin                                        │ │
│ │                                      [Cancel] [Create]          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

Components:
  Admin layout owns AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  Route owns:
  PageBody
    Suspense(fallback=<UsersListContent loading />)
      UsersListContent
  UsersListContent:
  Stack(gap="md")
    Panel > Stack(gap="sm")
      Inline(justify="between", wrap=false)
        Text(variant="h2", children="Users")
        Inline(gap="sm")
          FilterDropdown(label="Role", options=[{value:"all",label:"All Roles"},{value:"admin",label:"Admin"},{value:"user",label:"User"}], value, onChange, className="hidden lg:block")
          FilterDropdown(label="Status", options=[{value:"all",label:"All"},{value:"active",label:"Active"},{value:"banned",label:"Banned"}], value, onChange, className="hidden lg:block")
          MobileFilterMenu(groups=[{key:"role",label:"Role",options:[...],value,onChange},{key:"status",label:"Status",options:[...],value,onChange}])
      Inline(gap="sm")
        SearchInput(grow, placeholder="Search name or email...", value, onChange) — debounced 300ms, resets offset
        Button(variant="primary", iconName="Plus", onClick=openCreateModal, "New")
    Panel(padding="none" when table has rows, else padding="md")
      DataTable(
        columns=[name(sortable), email(sortable), role(col), status(col), emailVerified(col), createdAt(sortable)],
        rows, getRowKey=(user)=>user.id,
        onRowClick=navigate to /admin/identity/users/:userId,
        sortBy, sortDirection, onSort,
        pagination={ total, limit, offset, onChange: setOffset }
      )
      Loading: Skeleton(rows=5)
      Empty state: EmptyState(message="No users found", cta="Create User", onCta=openCreateModal) — CTA renders primary
      Search-empty: EmptyState(message="No users match your search", cta="Clear search", onCta=clearSearch)
      Filter-empty: EmptyState(message="No users matching filters", cta="Clear filters", onCta=clearFilters)
      Error: ErrorAlert(message=error, onRetry=refetch)
  Create modal:
    ConfirmDialog(open, onOpenChange, title="Create User", confirmLabel="Create", onConfirm)
      TextInput(label="Name", name="name", required)
      TextInput(label="Email", name="email", type="email", required)
      TextInput(label="Password", name="password", type="password") — optional; omit from request when empty
      RadioGroup(title="Role", name="role", options=[{value:"user",label:"User"},{value:"admin",label:"Admin"}], value=role, onChange=setRole)
    On confirm: POST /api/auth/admin/create-user; on success close modal + refresh list

Data: GET /api/auth/admin/list-users → { users: User[], total: number, limit: number, offset: number }
        query params: searchValue, searchField("email"|"name"), searchOperator("contains"|"starts_with"|"ends_with"),
          limit, offset, sortBy, sortDirection, filterField, filterValue, filterOperator
      POST /api/auth/admin/create-user → { user: User }
        body: { email: string, password?: string, name: string, role?: string }

Route URL params: q, role, status, sortBy, sortDir, page
Content defaults: searchField="email", searchOperator="contains", limit=25, sortBy="createdAt", sortDirection="desc",
  role="all", status="all", page=1

Behavior:
  - Route file reads URL params with useSearchParams inside UsersPageContent only; outer UsersPage owns Suspense.
  - SearchInput onChange → update q route param, debounce 300ms inside UsersListContent, call list-users with searchValue, reset page/offset.
  - Role FilterDropdown onChange → update role route param; when not "all", call list-users with filterField="role", filterValue, filterOperator="eq".
  - Status FilterDropdown onChange → update status route param; status filtering is currently applied client-side to the returned users page.
  - Filter "all" → omit corresponding route/API filter params.
  - Sort: click column header → call onSort(key, "asc") first time, toggle "asc"/"desc" on repeated clicks
  - Pagination: route `page` maps to offset `(page-1)*limit`; DataTable handles the ‹/› buttons internally.
  - Row click → navigate to /admin/identity/users/:userId
  - Search/filter/sort/page compose through URLSearchParams; each change preserves unrelated params and resets page where needed.
  - Empty create CTA opens the same Create User modal as the toolbar `New` button.

Badge mappings:
  role:  "admin"→Badge(tone="primary"),  "user"→Badge(tone="neutral")
  banned: false→Badge(tone="success", children="Active"), true→Badge(tone="error", children="Banned")
  emailVerified: true→Badge(tone="success", children="Verified"), false→Badge(tone="warning", children="Unverified")

---

## /admin/identity/users/:userId

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ id admin   ▸ Admin ▸ Users ▸ John Doe          [Impersonate] │
├──────────────────┬───────────────────────────────────────────────┤
│ ▸ Dashboard      │ ┌─ Tabs ────────────────────────────────────┐ │
│                  │ │  ▸ Overview          Sessions              │ │
│ ▸ Identity       │ └───────────────────────────────────────────┘ │
│   · Users        │                                               │
│   · Organizatns  │ ┌─── Profile ──────────────────────────────┐ │
│                  │ │                                           │ │
│ ▸ OAuth          │ │  [            ] Name    John Doe          │ │
│   · Applicatns   │ │  (avatar or     Role    admin             │ │
│   · Resource APIs│ │   initials)     Email   john@acme.com     │ │
│   · Scope Catlg  │ │                Verified ✓                 │ │
│   · M2M Bindngs  │ │                Banned   No                │ │
│   · Sessns&Tokns │ │                Created  2024-01-15        │ │
│ │                  │                                           │ │
│ ▸ Security       │ └───────────────────────────────────────────┘ │
│   · JWKS         │                                               │
│   · Consents     │ ┌─── Actions ───────────────────────────────┐ │
│                  │ │ [Edit Profile] [Set Role] [Reset Password] │ │
│ ▸ System         │ │ [Ban User]                   [Delete User] │ │
│   · Service Accts│ └───────────────────────────────────────────┘ │
│   · Issuer Metadt│                                               │
│   · SCIM Status  │ ══════════════════════════════════════════════ │
│   · Health       │ ┌── banned banner ──────────────────────────┐ │
│   · Settings     │ │ ⚠ This user is banned                     │ │
│                  │ │ Reason: Spam · Expires: 2025-06-15        │ │
│                  │ │ [Unban User]                               │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── loading ─────────────────────────────────┐ │
│                  │ │  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎         │ │
│                  │ │  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎         │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Ban modal ──────────────────────────────┐ │
│                  │ │ Ban John Doe                               │ │
│                  │ │ Reason [                      ]            │ │
│                  │ │ Expires in (seconds) [        ]            │ │
│                  │ │ Note: leave empty for permanent ban        │ │
│                  │ │              [Cancel]    [Ban User]        │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Delete modal ───────────────────────────┐ │
│                  │ │ ⚠ Delete John Doe                         │ │
│                  │ │ This is irreversible. ALL user data,      │ │
│                  │ │ sessions, and accounts will be removed.    │ │
│                  │ │                                           │ │
│                  │ │ Type the user's email to confirm:         │ │
│                  │ │ [                            ]            │ │
│                  │ │              [Cancel]  [Delete User]       │ │
│                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  MainContent > users/:userId/layout.tsx
    PageBody > UserDetailProvider > Stack(gap="md")
    UserDetailHeaderContent:
      Inline(justify="between")
      Inline(gap="sm")
        LinkButton(href="/admin/identity/users", variant="secondary", size="sm", hideOnMobile, iconName="ChevronLeft", ariaLabel="Back to Users")
        Text(variant="h1", children=user.name)
        Badge(tone=role==="admin"?"primary":"neutral", children=user.role)
      ResponsiveActions(ariaLabel="User actions")
        Direct actions while space allows: Edit Profile, Impersonate|Stop Impersonating, Set Role, Reset Password, Ban User|Unban User, Delete User
        Overflow: Button(iconName="Ellipsis", ariaLabel="User actions") + Menu(trailing actions)

    Tabs(
      selectedKey="overview",
      items=[
        {id:"overview", href:`/admin/identity/users/${userId}`, label:"Overview"},
        {id:"sessions", href:`/admin/identity/users/${userId}/sessions`, label:"Sessions"},
        {id:"audit", href:`/admin/identity/users/${userId}/audit`, label:"Audit"}
      ]
    )

    users/:userId/page.tsx:
      UserDetailOverviewContent()

    — If banned: Alert(tone="warning") showing "This user is banned. Reason: {banReason}. Expires: {banExpires}."
    — If loading: Skeleton(rows=4, height="md")

    Panel(tone="base") — Profile
      Grid(columns="two")
        — Column 1: Avatar(initials/image/alt/size)
        — All label/value pairs: Text(variant="caption") for labels, Text(variant="body") for values
        Fields: Name, Email, Role, Email Verified (Badge), Banned (Badge/Yes-No), Created At

  Modals (all use ConfirmDialog):
    Edit Profile: ConfirmDialog(open, onOpenChange, title="Edit Profile", confirmLabel="Save", onConfirm)
      TextInput(label="Name", name="name", defaultValue=user.name)
      TextInput(label="Email", name="email", type="email", defaultValue=user.email)
      TextInput(label="Avatar URL", name="image", defaultValue=user.image||"")
      On confirm: POST /api/auth/admin/update-user { userId, data: { name, email, image } }

    Set Role: ConfirmDialog(title="Set Role", confirmLabel="Save", onConfirm)
      RadioGroup(title="Role", name="role",
        options=[{value:"user",label:"User"},{value:"admin",label:"Admin"}],
        value=selectedRole, onChange=setSelectedRole)
      On confirm: POST /api/auth/admin/set-role { userId, role }

    Reset Password: ConfirmDialog(title="Reset Password", confirmLabel="Set Password", onConfirm)
      TextInput(label="New Password", name="password", type="password", autoComplete="new-password", validate=min 12 chars)
      On confirm: POST /api/auth/admin/set-user-password { newPassword, userId }

    Ban User: ConfirmDialog(title="Ban User", confirmLabel="Ban User", variant="danger", onConfirm)
      TextInput(label="Reason", name="banReason")
      TextInput(label="Ban duration (seconds)", name="banExpiresIn")
        — NOTE: TextInput type does not accept "number". Use type="text" and validate numeric on submit.
        — Leave empty for permanent ban.
      On confirm: POST /api/auth/admin/ban-user { userId, banReason?, banExpiresIn? }

    Unban: ConfirmDialog(title="Unban User", description="Restore access for {user.name}?", confirmLabel="Unban", onConfirm)
      On confirm: POST /api/auth/admin/unban-user { userId }

    Impersonate: ConfirmDialog(title="Impersonate User",
      description="You will be signed in as {user.name}. Your admin session remains active. Use 'Stop Impersonating' to return.",
      confirmLabel="Impersonate", onConfirm)
      On confirm: POST /api/auth/admin/impersonate-user { userId }, then redirect to /

    Delete: ConfirmDialog(title="Delete User", confirmLabel="Delete User", variant="danger",
      confirmDisabled=typedEmail !== user.email, onConfirm)
      Text(variant="body", "This is irreversible. Type the user's email to confirm:")
      TextInput(label="Email", name="confirmEmail", defaultValue="")
        — User must type user.email exactly. confirmDisabled is true until typedEmail matches user.email.
      On confirm: POST /api/auth/admin/remove-user { userId }, then navigate to /admin/identity/users

Data: GET /api/auth/admin/get-user?id=:userId → { user: User }
      POST /api/auth/admin/update-user → raw User; admin action normalizes to { user: User }     body: { userId, data: { name?, email?, image? } }
      POST /api/auth/admin/set-role → { user: User }         body: { userId, role }
      POST /api/auth/admin/set-user-password → { status: boolean }  body: { newPassword, userId }
      POST /api/auth/admin/ban-user → { user: User }         body: { userId, banReason?, banExpiresIn? }
      POST /api/auth/admin/unban-user → { user: User }       body: { userId }
      POST /api/auth/admin/impersonate-user → { session, user }  body: { userId }
      POST /api/auth/admin/stop-impersonating → void          (no body)
      POST /api/auth/admin/remove-user → { success: boolean }  body: { userId }

Notes:
  - banExpiresIn is seconds (number), not a date. Compute display from user.banExpires (timestamp_ms).
  - update-user `data` is an object. Send only changed fields. Better Auth 1.6.11 OpenAPI documents an envelope, but runtime returns the raw user.
  - Delete modal: compare typedEmail against user.email; disable Confirm until match.
  - Impersonate opens new session; redirect admin to /. On re-entering this page while impersonating,
    show "Stop Impersonating" button (detect via current session.impersonatedBy field).
  - Avatar: no dedicated @id/ui Avatar component exists. Options:
    a) Implement inline in the route file (one-off, acceptable for detail page).
    b) Skip avatar for now and just show text-only profile.
    c) Create a small Avatar component in packages/ui/ if used in multiple pages.
    Prefer option (a) or (b) for initial implementation.

---

## /admin/identity/users/:userId/sessions

Inherits parent shell + PageHeader + Tabs. Sessions tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...   ▸ ... ▸ John Doe                        [Impersonate]  │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│                  │ │   Overview          ▸ Sessions             │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── loading ─────────────────────────────────┐ │
│                  │ │  ∎∎∎∎  ∎∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎  ∎∎∎∎∎∎∎│ │
│                  │ │  ∎∎∎∎  ∎∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎  ∎∎∎∎∎∎∎│ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── active sessions ─────────────────────────┐ │
│                  │ │ IP Address    User Agent    Created  Expires│ │
│                  │ │ 192.168.1.1   Chrome/macOS   12/01   01/01 │ │
│                  │ │ 10.0.0.5      Firefox/Win    12/05   01/05 │ │
│                  │ │                          ⚠ Impersonation   │ │
│                  │ │                               [Revoke]     │ │
│                  │ │ ─────────────────────────────────────────── │ │
│                  │ │ 192.168.1.2   Safari/iOS     10/15   11/15 │ │
│                  │ │   (expired — dimmed row)                   │ │
│                  │ │ ═══════════════════════════════════════════ │ │
│                  │ │                       ⚠ Revoke All Sessions│ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── empty ───────────────────────────────────┐ │
│                  │ │  📥  No active sessions                    │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Revoke All modal ────────────────────────┐ │
│                  │ │ Revoke All Sessions                        │ │
│                  │ │ This will sign out all sessions for        │ │
│                  │ │ John Doe, including this admin session     │ │
│                  │ │ if you are impersonating.                  │ │
│                  │ │              [Cancel]   [Revoke All]       │ │
│                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  Panel(padding="none") > DataTable(
    columns=[ipAddress, userAgent, organization, createdAt, expiresAt],
    rows=sessions, getRowKey=(s)=>s.id,
    — Per-row: if session.impersonatedBy: Badge(tone="warning", "Impersonation")
    — Per-row (only one revoke at a time): a Button per row "Revoke" (variant="danger", size="sm").
      Click opens per-row ConfirmDialog before calling the revoke API.
    — Expired rows (expiresAt < now): dim the entire row via a CSS class or render prop.
  )
  Footer: Inline(justify="end")
    Button(variant="danger", "Revoke All Sessions", onClick=openRevokeAllModal)
  Revoke All modal: ConfirmDialog(title="Revoke All Sessions", confirmLabel="Revoke All", variant="danger", onConfirm)
  Loading: Skeleton(rows=4)
  Empty: EmptyState(message="No active sessions")

Data: GET /api/auth/admin/list-sessions?userId=:userId&limit=100&offset=:offset → { sessions: Session[], total, limit, offset }
      POST /api/auth/admin/revoke-session → { success: boolean }
        body: { sessionId: string }
      POST /api/auth/admin/revoke-user-sessions → { success: boolean }
        body: { userId }

Session shape: { id, userId, userEmail, ipAddress, userAgent, createdAt, expiresAt,
                 activeOrganizationId, activeTeamId, impersonatedBy }

Notes:
  - Single-session revoke uses the repo-owned revoke-by-id route. Do not route this screen through Better Auth's `revoke-user-session`, because that contract requires exposing a live session token to the browser.
  - `_actions/users.ts` pages through the safe aggregate endpoint and returns all matching rows to the component.
  - Organization column: show org name from a lookup or show `activeOrganizationId` truncated. If no lookup: "—".
  - Impersonation badge: show per row when `session.impersonatedBy` is truthy.

---

## /admin/identity/users/:userId/audit

Inherits parent shell + shared `UserDetailProvider` header. Audit tab active. This route is powered by the append-only `admin-activity-log` plugin from docs/027 §12.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...   ▸ ... ▸ John Doe                        [Impersonate]  │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│                  │ │ Overview   Sessions   ▸ Audit             │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │ ┌── Audit ──────────────────────────────────┐ │
│                  │ │ ● User Update                             │ │
│                  │ │   admin@example.test · 1/15/2025, 12:00   │ │
│                  │ │   /admin/update-user                      │ │
│                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  users/:userId/audit/page.tsx
    ActivityLogContent(targetType="user", targetId=userId)
  ActivityLogContent:
    Panel > Stack(gap="md") > Text(variant="h2", "Audit") + Timeline(items)
    Loading: Skeleton(rows=5)
    Empty: EmptyState(message="No activity recorded for this resource")
    Error: ErrorAlert(message, onRetry)

Data: GET /api/auth/admin/activity-log?targetType=user&targetId=:userId&limit=25&offset=0 → { entries, total, limit, offset }

---

## /admin/identity/organizations

Platform admin only. Org admins redirected to their own org detail.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ id admin   ▸ Admin ▸ Organizations   [🔍      ]  [+ Create] │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌── loading ─────────────────────────────────┐ │
│                  │ │ ∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎   │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── orgs list ───────────────────────────────┐ │
│                  │ │ Name ↕          Slug ↕        Created ↕   │ │
│                  │ │ Acme Corp       acme          2024-01-15  │ │
│                  │ │ Beta Inc        beta-inc      2024-03-20  │ │
│                  │ │ Gamma LLC       gamma         2024-08-01  │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── empty ───────────────────────────────────┐ │
│                  │ │  📥  No organizations                      │ │
│                  │ │       [Create Organization]                 │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Create modal ────────────────────────────┐ │
│                  │ │ Create Organization                        │ │
│                  │ │ Name  [                         ]          │ │
│                  │ │ Slug  [                         ]          │ │
│                  │ │ Logo  [                         ]          │ │
│                  │ │ Metadata [{                      }]        │ │
│                  │ │             [Cancel]    [Create]           │ │
│                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  MainContent > PageBody > Stack(gap="md")
    Panel > Inline(justify="between")
      Text(variant="h1", "Organizations")
      Inline(gap="sm")
        SearchInput(placeholder="Search organizations…", value=search, onChange)
        Button(variant="primary", iconName="Plus", onClick=openCreateModal, "Create")

    Panel(padding="none") > DataTable(
      columns=[name(sortable), slug, createdAt(sortable)],
      rows=filteredOrgs, getRowKey=(o)=>o.id,
      onRowClick=navigate to /admin/identity/organizations/${id},
      sortBy, sortDirection, onSort
    )
    Loading: Skeleton(rows=5)
    Empty: EmptyState(message="No organizations", cta="Create Organization", onCta=openCreateModal)
    Search-empty: EmptyState(message="No organizations match your search", cta="Clear search", onCta=clearSearch)

  Create modal: ConfirmDialog(title="Create Organization", confirmLabel="Create", onConfirm)
    TextInput(label="Name", name="name", required)
    TextInput(label="Slug", name="slug", required)
    TextInput(label="Logo URL", name="logo")
    CodeEditor(label="Metadata (JSON)", name="metadata", placeholder='{"plan":"enterprise"}', error=metadataError)
      — Validate as a JSON object on change; show inline error via CodeEditor error prop.
      — Use CodeEditor for all JSON/multiline fields.
    On confirm: POST /api/auth/organization/create { name, slug, logo?, metadata? } where metadata is parsed from editor text and sent as a JSON object
    On success: navigate to /admin/identity/organizations/${id}

Data: GET /api/auth/organization/list → Organization[]   (no pagination; metadata may be object or string on the wire and the action normalizes it to formatted JSON text)
      POST /api/auth/organization/create → Organization    body: { name, slug, logo?, metadata?: object }
      POST /api/auth/organization/check-slug → 200 if unique, error if taken  body: { slug }

Behavior:
  - No server-side pagination from BA — fetch full list once.
  - Client-side search: filter by name (case-insensitive contains). SearchInput triggers local filter, no API call.
  - Sort: client-side sorting by name/createdAt via DataTable onSort → sort the fetched array.
  - Slug validation: on blur of slug input, call check-slug. Show error message under slug field.
    If editing existing org, skip validation if slug unchanged.
  - Logo: text input for URL. No file upload. Show preview in the detail page only.
  - Metadata: free-text JSON object. On change, try JSON.parse and require a non-array object; if it fails, set error prop on CodeEditor.

---

## /admin/identity/organizations/:orgId

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│                  │ │  ▸ Overview  Members  Teams  Invitations  │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── loading ─────────────────────────────────┐ │
│                  │ │  ∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎          │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Details ─────────────────────────────────┐ │
│                  │ │                                            │ │
│                  │ │  Logo:  [ preview or placeholder ]         │ │
│                  │ │                                            │ │
│                  │ │  Name      Acme Corp                       │ │
│                  │ │  Slug      acme                            │ │
│                  │ │  Created   2024-01-15                      │ │
│                  │ │  Metadata  {"plan":"enterprise"}           │ │
│                  │ │                                            │ │
│                  │ │                     [Edit Organization]    │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Edit modal ─────────────────────────────┐ │
│                  │ │ Edit Organization                          │ │
│                  │ │ Name  [Acme Corp                 ]         │ │
│                  │ │ Slug  [acme                      ]         │ │
│                  │ │ Logo  [https://...               ]         │ │
│                  │ │ Metadata [{ "plan": "enterprise" }]        │ │
│                  │ │             [Cancel]    [Save]             │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │                                               │
│                  │ ┌── Delete modal ───────────────────────────┐ │
│                  │ │ ⚠ Delete Acme Corp                        │ │
│                  │ │ This will remove the organization and ALL  │ │
│                  │ │ members, teams, and invitations.           │ │
│                  │ │ This cannot be undone.                     │ │
│                  │ │                                           │ │
│                  │ │ Type "acme" to confirm:                   │ │
│                  │ │ [                            ]             │ │
│                  │ │              [Cancel]   [Delete Org]       │ │
│                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  MainContent > organizations/:orgId/layout.tsx
    PageBody > OrgDetailProvider > Stack(gap="md")
    OrgDetailHeaderContent:
      Inline(justify="between")
      Inline(gap="sm")
        LinkButton(href="/admin/identity/organizations", variant="secondary", size="sm", hideOnMobile, iconName="ChevronLeft", ariaLabel="Back to Organizations")
        Text(variant="h1", org.name)
        Badge(tone="neutral", children=`#${org.slug}`)
      Button(variant="danger", onClick=openDeleteModal, "Delete")

    Tabs(
      ariaLabel="Organization detail tabs",
      selectedKey=activeTab,   — "overview" | "members" | "teams" | "invitations" | "audit"; default "overview"
      items=[
        {id:"overview", href:`/admin/identity/organizations/${orgId}`, label:"Overview"},
        {id:"members", href:`/admin/identity/organizations/${orgId}/members`, label:"Members"},
        {id:"teams", href:`/admin/identity/organizations/${orgId}/teams`, label:"Teams"},
        {id:"invitations", href:`/admin/identity/organizations/${orgId}/invitations`, label:"Invitations"},
        {id:"audit", href:`/admin/identity/organizations/${orgId}/audit`, label:"Audit"}
      ]
    )
    — NOTE: the layout derives activeTab from pathname and renders the shared header once.
      Sub-page route files render only OrganizationMembersContent, OrganizationTeamsContent, or OrganizationInvitationsContent.

    organizations/:orgId/page.tsx:
      OrgDetailOverviewContent

    Panel
      Stack(gap="xs") label/value pairs using Text(variant="caption") / Text(variant="body")
      Panel(tone="muted", padding="sm") for formatted metadata
      Inline(justify="end")
        Button(variant="secondary", onClick=openEditModal, "Edit Organization")

  Edit modal: ConfirmDialog(title="Edit Organization", confirmLabel="Save", onConfirm)
    TextInput(label="Name", name="name", defaultValue=org.name)
    TextInput(label="Slug", name="slug", defaultValue=org.slug)
    TextInput(label="Logo URL", name="logo", defaultValue=org.logo||"")
    CodeEditor(label="Metadata (JSON)", name="metadata", defaultValue=org.metadata||"", placeholder='{"plan":"enterprise"}', error=editMetaError)
      — Validate as a JSON object on change. Use CodeEditor for JSON fields.
    On confirm: POST /api/auth/organization/update { organizationId, data: { name, slug, logo, metadata } } where metadata is parsed from editor text and sent as a JSON object

  Delete modal: ConfirmDialog(title="Delete Organization", confirmLabel="Delete Org", variant="danger",
    confirmDisabled=typedSlug !== org.slug, onConfirm)
    Text(variant="body", "This will remove the organization and ALL members, teams, and invitations. This cannot be undone.")
    TextInput(label="Type the slug to confirm", name="confirmSlug")
    On confirm: POST /api/auth/organization/delete { organizationId }, then navigate to /admin/identity/organizations

Data: GET /api/auth/organization/get-full-organization → Organization | null (with metadata normalized by the action)
      POST /api/auth/organization/update   body: { organizationId, data: { name?, slug?, logo?, metadata?: object } }
      POST /api/auth/organization/delete   body: { organizationId }

Notes:
  - Slug validation on blur in edit modal (same as create, skip if unchanged).
  - Metadata displayed as a `<pre>` block with `JSON.stringify(JSON.parse(...), null, 2)` formatting for readability.
    Use CSS vars `var(--color-base-200)` for background and `var(--radius-box)` for border-radius.
  - Metadata edited as raw JSON object text via `CodeEditor` component (monospace, multiline).

---

## /admin/identity/organizations/:orgId/members

Inherits parent shell + PageHeader + Tabs. Members tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│ │                  │ │   Overview  ▸ Members  Teams  Invitations │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── filter bar ─────────────────────────────┐ │
│ │                  │ │ Role ▾ all              [+ Invite Member] │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── loading ─────────────────────────────────┐ │
│ │                  │ │  ∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎∎ │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── member list ─────────────────────────────┐ │
│ │                  │ │ Name         Email              Role  Joined│ │
│ │                  │ │ John Doe     john@acme.com      owner 01/15│ │
│ │                  │ │ Jane Adams   jane@acme.com      admin 02/01│ │
│ │                  │ │ Bob King     bob@acme.com       member03/10│ │
│ │                  │ │                          Chg Role  Remove  │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── empty ───────────────────────────────────┐ │
│ │                  │ │  📥  No members                            │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── filter-empty ───────────────────────────┐ │
│ │                  │ │  📥  No members with this role             │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Change Role modal ──────────────────────┐ │
│ │                  │ │ Change role for John Doe                   │ │
│ │                  │ │ ○ owner  ○ admin  ● member                │ │
│ │                  │ │             [Cancel]    [Save]             │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Remove member modal ────────────────────┐ │
│ │                  │ │ Remove John Doe from Acme Corp?            │ │
│ │                  │ │              [Cancel]    [Remove]          │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Invite modal ───────────────────────────┐ │
│ │                  │ │ Invite Member                             │ │
│ │                  │ │ Email [                         ]          │ │
│ │                  │ │ Role  ○ owner  ○ admin  ● member          │ │
│ │                  │ │             [Cancel]    [Send Invite]      │ │
│ │                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  Inline(justify="between")
    FilterDropdown(label="Role",
      options=[{value:"all",label:"All"},{value:"owner",label:"Owner"},{value:"admin",label:"Admin"},{value:"member",label:"Member"}],
      value=roleFilter, onChange=setRoleFilter)
    Button(variant="primary", iconName="Plus", "Invite Member") — opens Invite modal

  Panel(padding="none") > DataTable(
    columns=[name, email, role(col with Badge), joinedAt(sortable)],
    rows=filteredMembers, getRowKey=(m)=>m.id
  )
  Per-row: Inline(gap="sm")
    Button(size="sm", variant="secondary", iconName="Pencil", ariaLabel="Change role", onClick=openRoleModal)
    Button(variant="danger", size="sm", iconName="Trash2", ariaLabel="Remove member", onClick=openRemoveModal)
      — disabled if member.role==="owner" AND owners.length===1 (last owner guard)

  Loading: Skeleton(rows=5)
  Empty: EmptyState(message="No members")
  Filter-empty: EmptyState(message="No members with this role")

Modals:
  Change Role: ConfirmDialog(title="Change role", confirmLabel="Save", onConfirm)
    RadioGroup(title=`Role for {memberName}`, name="role",
      options=[{value:"owner",label:"Owner"},{value:"admin",label:"Admin"},{value:"member",label:"Member"}],
      value=selectedRole, onChange=setSelectedRole)
      — Pre-select current role. Show current role name in description.
      — Guard on submit: if this is the last owner, block changing the role away from owner.
    On confirm: POST /api/auth/organization/update-member-role { memberId, role }

  Remove: ConfirmDialog(title=`Remove {memberName}`, confirmLabel="Remove", variant="danger", onConfirm)
    description: "This will remove {memberName} from {orgName}."
    On confirm: POST /api/auth/organization/remove-member { memberIdOrEmail, organizationId }

  Invite: ConfirmDialog(title="Invite Member", confirmLabel="Send Invite", onConfirm)
    TextInput(label="Email", name="email", type="email", required)
    RadioGroup(title="Role", name="role",
      options=[{value:"owner",label:"Owner"},{value:"admin",label:"Admin"},{value:"member",label:"Member"}],
      value=selectedRole, onChange=setSelectedRole)
    On confirm: POST /api/auth/organization/invite-member { email, role, organizationId }

Data: GET /api/auth/organization/list-members → { members: Member[], total: number }; admin action unwraps to Member[] for the content component.
        Member shape: { id, organizationId, userId, role, createdAt, user? }
        User display data resolves through the shared get-user cache:
          GET /api/auth/admin/get-user?id={userId} per member when needed.
          Batch these (Promise.all) and cache per userId to avoid refetching the same user for the teams tab.
      POST /api/auth/organization/update-member-role  body: { memberId, role }
      POST /api/auth/organization/remove-member        body: { memberIdOrEmail, organizationId? }
      POST /api/auth/organization/invite-member        body: { email, role, organizationId }

Behavior:
  - Role filter: client-side. Filter members by `.role` after fetching.
  - Last owner guard: compute `owners = members.filter(m => m.role==="owner")`.
    If owners.length===1 and row is that owner, disable Remove button.
  - After remove/role-change/invite → refetch list and reset selection state.

Notes:
  - Team association in invite modal: omit teamId for initial implementation (pending Select component).
  - Member name/email: if API doesn't join, fetch users by userId. Cache in a Map<userId, User>.

---

## /admin/identity/organizations/:orgId/teams

Inherits parent shell + PageHeader + Tabs. Teams tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│ │                  │ │   Overview  Members  ▸ Teams  Invitations │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── header ─────────────────────────────────┐ │
│ │                  │ │ Teams (3)                [+ Create Team]  │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── loading ─────────────────────────────────┐ │
│ │                  │ │  ∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎          │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── team list ───────────────────────────────┐ │
│ │                  │ │ Name         Members  Created     Actions  │ │
│ │                  │ │ Frontend     4         2024-01-15  ▶ Ren ✕│ │
│ │                  │ │ Backend      7         2025-02-01  ▶ Ren ✕│ │
│ │                  │ │ Design       2         2025-03-10  ▶ Ren ✕│ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── expanded: Backend · 7 members ──────────┐ │
│ │                  │ │ + Add Member ▾                             │ │
│ │                  │ │ John Doe    john@acme.com       ⚠ Remove  │ │
│ │                  │ │ Jane Adams  jane@acme.com       ⚠ Remove  │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── empty (no teams) ───────────────────────┐ │
│ │                  │ │  📥  No teams yet                         │ │
│ │                  │ │       [Create Team]                       │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── empty (team members) ───────────────────┐ │
│ │                  │ │  📥  No members in this team              │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Create/Rename modal ────────────────────┐ │
│ │                  │ │ {Create|Rename} Team                       │ │
│ │                  │ │ Name [                         ]           │ │
│ │                  │ │             [Cancel]    [Save]             │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Delete team modal ──────────────────────┐ │
│ │                  │ │ Delete team Frontend?                      │ │
│ │                  │ │ 4 team members will be removed from        │ │
│ │                  │ │ the team (org membership is preserved).    │ │
│ │                  │ │              [Cancel]    [Delete]          │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Remove member modal ────────────────────┐ │
│ │                  │ │ Remove John Doe from Backend?              │ │
│ │                  │ │              [Cancel]    [Remove]          │ │
│ │                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  Inline(justify="between")
    Text(variant="h3", `Teams (${teams.length})`)
    Button(variant="primary", onClick=openCreateModal, "+ Create Team")

  Panel(padding="none") > DataTable(
    columns=[name(sortable), memberCount, createdAt(sortable), actions],
    rows=teams, getRowKey=(t)=>t.id
  )
  Per-row actions: Inline(gap="xs")
    Button(size="sm", variant="secondary", iconName="ChevronRight"/"ChevronDown", ariaLabel="Expand"/"Collapse", onClick=selectTeam)
    Button(size="sm", variant="secondary", iconName="Pencil", ariaLabel="Rename team", onClick=openRenameModal)
    Button(variant="danger", size="sm", iconName="Trash2", ariaLabel="Delete team", onClick=openDeleteModal)

  — Expanded member panel (visible when a team row is selected):
    Panel(tone="muted")
      Inline(justify="between")
        Text(variant="h4", `${team.name} · ${teamMembers.length} members`)
        ResourceSelector(kind="member", source={ mode:"sync", items:eligibleMembers }, excludeIds=currentTeamMemberIds, value=selectedMemberId, onChange=addMemberToTeam)
      Stack(gap="xs") — one row per team member:
        Inline(justify="between")
          Inline(gap="sm")
            Text(variant="body", userName)
            Text(variant="caption", userEmail)
          Button(variant="danger", size="sm", onClick=openRemoveMemberModal, "Remove")

Modals:
  Create: ConfirmDialog(title="Create Team", confirmLabel="Create", onConfirm)
    TextInput(label="Team Name", name="name", required)
    On confirm: POST /api/auth/organization/create-team { name, organizationId }

  Rename: ConfirmDialog(title="Rename Team", confirmLabel="Save", onConfirm)
    TextInput(label="Team Name", name="name", defaultValue=team.name)
    On confirm: POST /api/auth/organization/update-team { teamId, data: { name, organizationId } }

  Delete: ConfirmDialog(title="Delete Team", confirmLabel="Delete", variant="danger", onConfirm)
    description: "{n} team members will be removed from the team (org membership is preserved)."
    On confirm: POST /api/auth/organization/remove-team { teamId, organizationId }, then collapse member panel, refresh list

  Remove Member: ConfirmDialog(title="Remove Member", confirmLabel="Remove", variant="danger", onConfirm)
    description: "Remove {userName} from {teamName}?"
    On confirm: POST /api/auth/organization/remove-team-member { teamId, userId }, refresh members

Data: GET /api/auth/organization/list-teams → Team[]
        Team: { id, name, organizationId, createdAt, updatedAt }
      GET /api/auth/organization/list-team-members → TeamMember[]
        TeamMember: { id, teamId, userId, createdAt }
      POST /api/auth/organization/create-team      body: { name, organizationId? }
      POST /api/auth/organization/update-team      body: { teamId, data: { name, organizationId? } }
      POST /api/auth/organization/remove-team      body: { teamId, organizationId? }
      POST /api/auth/organization/add-team-member   body: { teamId, userId, organizationId? }
      POST /api/auth/organization/remove-team-member body: { teamId, userId, organizationId? }

Behavior:
  - On page load: fetch teams (list-teams) + user cache (for member names).
  - memberCount: call list-team-members for each team in parallel → count results → map by teamId.
    Loading: show "…" in memberCount column until resolved.
  - Clicking "▶" on a team row: fetch list-team-members for that team, show expanded panel below the table row.
    Clicking again collapses it. Only one team expanded at a time.
  - Add Member: ResourceSelector filters org members (from list-members) minus already-assigned teamMembers, renders name/email/role, and returns the selected userId for add-team-member.
    Selecting from ResourceSelector calls add-team-member, clears the selected value, re-fetches team members, and updates memberCount. No raw userId entry is exposed.
  - User names: same cache as members page — fetch get-user per userId if API doesn't join names.
  - Deleting a team cascade-deletes team members (FK: ON DELETE CASCADE). Warn in dialog.

---

## /admin/identity/organizations/:orgId/invitations

Inherits parent shell + PageHeader + Tabs. Invitations tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│ │                  │ │  Overview  Members  Teams  ▸ Invitations │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── filter bar ─────────────────────────────┐ │
│ │                  │ │ Status ▾ all            [+ Invite Member] │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── loading ─────────────────────────────────┐ │
│ │                  │ │  ∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎  ∎∎∎∎∎∎  ∎∎∎∎  ∎∎ │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── invitation list ─────────────────────────┐ │
│ │                  │ │ Email               Role    Team  Invt By  │ │
│ │                  │ │ bob@corp.com        member  —     Admin    │ │
│ │                  │ │ alice@venture.com   admin   Bknd  Admin    │ │
│ │                  │ │ old@example.com     member  —     Admin    │ │
│ │                  │ │                       Exp  Status  Actions │ │
│ │                  │ │                       01/01 pending  Res C │ │
│ │                  │ │                       12/20 pending  Res C │ │
│ │                  │ │                       11/01 expired    C   │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── empty (all) ─────────────────────────────┐ │
│ │                  │ │  📥  No invitations yet                    │ │
│ │                  │ │       [+ Invite Member]                    │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── empty (pending filter) ──────────────────┐ │
│ │                  │ │  📥  No pending invitations                │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Resend confirm ─────────────────────────┐ │
│ │                  │ │ Resend invitation to bob@corp.com?         │ │
│ │                  │ │              [Cancel]    [Resend]          │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Cancel confirm ─────────────────────────┐ │
│ │                  │ │ Cancel invitation for bob@corp.com?        │ │
│ │                  │ │              [Cancel]    [Yes, Cancel]     │ │
│ │                  │ └───────────────────────────────────────────┘ │
│ │                  │                                               │
│ │                  │ ┌── Invite modal ───────────────────────────┐ │
│ │                  │ │ Invite Member                             │ │
│ │                  │ │ Email [                         ]          │ │
│ │                  │ │ Role  ○ owner  ○ admin  ● member          │ │
│ │                  │ │             [Cancel]    [Send Invite]      │ │
│ │                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  Inline(justify="between")
    FilterDropdown(label="Status",
      options=[
        {value:"all",label:"All"},
        {value:"pending",label:"Pending"},
        {value:"expired",label:"Expired"},
        {value:"accepted",label:"Accepted"},
        {value:"rejected",label:"Rejected"},
        {value:"canceled",label:"Cancelled"}
      ],
      value=statusFilter, onChange=setStatusFilter)
    Button(variant="primary", iconName="Plus", onClick=openInviteModal, "Invite Member")

  Panel(padding="none") > DataTable(
    columns=[email(sortable), role(col), team(col), inviterName(col), expiresAt(sortable), status(col), actions(col)],
    rows=filteredInvitations, getRowKey=(inv)=>inv.id
  )
  Per-row actions (only when status==="pending"):
    Inline(gap="xs")
      Button(size="sm", onClick=openResendConfirm, "Resend")
      Button(variant="danger", size="sm", onClick=openCancelConfirm, "Cancel")
  Expired rows: dim text (opacity-50). Only Cancel action visible.

  Loading: Skeleton(rows=4)
  Empty-all: EmptyState(message="No invitations yet", cta="Invite Member", onCta=openInviteModal)
  Empty-pending: EmptyState(message="No pending invitations")
  Empty-other: EmptyState(message="No invitations with this status")

Modals:
  Resend: ConfirmDialog(title="Resend Invitation", confirmLabel="Resend", onConfirm)
    description: "Resend invitation to {invitation.email}?"
    On confirm: POST /api/auth/organization/invite-member { email: inv.email, role: inv.role, organizationId, resend: true }

  Cancel: ConfirmDialog(title="Cancel Invitation", confirmLabel="Yes, Cancel", variant="danger", onConfirm)
    description: "Cancel invitation for {invitation.email}?"
    On confirm: POST /api/auth/organization/cancel-invitation { invitationId }

  Invite: ConfirmDialog(title="Invite Member", confirmLabel="Send Invite", onConfirm)
    TextInput(label="Email", name="email", type="email", required)
    RadioGroup(title="Role", name="role",
      options=[{value:"owner",label:"Owner"},{value:"admin",label:"Admin"},{value:"member",label:"Member"}],
      value=selectedRole, onChange=setSelectedRole)
    On confirm: POST /api/auth/organization/invite-member { email, role, organizationId }

Data: GET /api/auth/organization/list-invitations → Invitation[]
        Invitation: { id, organizationId, email, role, teamId, status, expiresAt, createdAt, inviterId }
        Better Auth wire statuses are "pending" | "accepted" | "rejected" | "canceled"; the admin action derives "expired" from pending invitations whose expiresAt is in the past.
      POST /api/auth/organization/invite-member  body: { email, role, organizationId?, teamId?, resend? }
      POST /api/auth/organization/cancel-invitation  body: { invitationId }

Behavior:
  - Status filter: client-side filter by normalized invitation.status.
  - Resend: uses `resend: true` on the invite-member endpoint. Pass same email, role, organizationId.
    Do NOT use cancel+re-invite; the API natively supports resend.
  - Inviter name: Invitation has inviterId but no name. Fetch via GET /api/auth/admin/get-user?id={inviterId}.
    Cache inviter names in a Map<string,string> to avoid duplicate fetches. Show "—" if lookup fails.
  - Team name: Invitation has teamId (nullable in DB, marked required in OpenAPI spec — verify at runtime).
    If teamId is set, resolve team name from the teams list fetched on the Overview tab.
    For initial implementation, skip team name resolution (show "—") and note it will be wired when lookup is available.
  - Expired rows: only Cancel action available (to clean up). No Resend on expired; admin must create a new invite.
  - Status badge: pending→tone="warning", accepted→tone="success", rejected→tone="error", expired/canceled→tone="neutral"

---

## /admin/identity/organizations/:orgId/audit

Inherits parent shell + shared `OrgDetailProvider` header. Audit tab active. This route is powered by the append-only `admin-activity-log` plugin from docs/027 §12.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...   ▸ Organizations ▸ Acme Corp                 [Delete]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ Tabs ────────────────────────────────────┐ │
│                  │ │ Overview Members Teams Invitations ▸Audit │ │
│                  │ └───────────────────────────────────────────┘ │
│                  │ ┌── Audit ──────────────────────────────────┐ │
│                  │ │ ● Team Add Member                         │ │
│                  │ │   admin@example.test · 1/14/2025, 12:00   │ │
│                  │ │   /organization/add-team-member           │ │
│                  │ └───────────────────────────────────────────┘ │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  organizations/:orgId/audit/page.tsx
    ActivityLogContent(targetType="organization", targetId=orgId)
  ActivityLogContent:
    Panel > Stack(gap="md") > Text(variant="h2", "Audit") + Timeline(items)
    Loading: Skeleton(rows=5)
    Empty: EmptyState(message="No activity recorded for this resource")
    Error: ErrorAlert(message, onRetry)

Data: GET /api/auth/admin/activity-log?targetType=organization&targetId=:orgId&limit=25&offset=0 → { entries, total, limit, offset }
