# Identity Screens

## Component gaps

These `@id/ui` components are referenced in this spec but do **not** exist yet.
They must be built before the corresponding screens can be implemented.

| Component | Used on | Notes |
|---|---|---|
| `Avatar` / `AvatarPlaceholder` | User detail (profile panel) | Renders `<img>` if `user.image` set, else circle with initials. DaisyUI `avatar` + `avatar-placeholder` classes. Used only on the user detail page; acceptable to skip for initial implementation (show text-only profile) or inline as a one-off in the route file until needed elsewhere. |

**Everything else exists** in `packages/ui/src/` with the exact props described in this spec:
`AppShell`, `Topbar`, `TopbarStart`, `TopbarEnd`, `TopbarBrandLink`, `TopbarSearchField`, `TopbarBreadcrumb`, `TopbarAvatarMenu`,
`Sidebar`, `SidebarLayout`, `MainContent`, `MobileDock`,
`Page`, `PageHeader`, `PageBody`, `PageSection`, `Panel`, `Stack`, `Inline`, `Grid`, `Columns`, `Spacer`,
`NavMenu`, `NavSection`, `NavLink`, `DockLink`, `NavTitle`,
`Text`, `Heading`, `Button`, `LinkButton`,
`TextInput` (label/name/type/required/defaultValue/error — no `placeholder` prop; no `type="number"`, use text+validation),
`RadioGroup` (title/name/options/value/onChange — fully controlled, no `default`),
`Alert` (tone); `Badge` (tone/size/children); `Skeleton` (rows/height); `EmptyState` (message/cta/onCta);
`ErrorAlert` (message/onRetry); `SearchInput` (value/onChange/placeholder); `FilterDropdown` (label/options/value/onChange);
`TabNav` (items); `ConfirmDialog` (open/onOpenChange/title/description/confirmLabel/cancelLabel/variant/onConfirm/confirmDisabled/children);
`DataTable` (columns/rows/getRowKey/onRowClick/sortBy/sortDirection/onSort/pagination={total/limit/offset/onChange}).

---

Covers all routes under `/admin/identity`. Actor-scoping rules:
- Platform admin (`user.role = "admin"`) — full access to users and all organizations.
- Org admin (`member.role = "owner" | "admin"`) — no access to `/admin/identity/users`; directed to their own org detail only.

Box-drawing key: ┌─┐ top edge · └─┘ bottom · ├─┤ mid · │ vertical · ↕ sortable · ▸ active · ● on · ○ off · ✓ yes · ✗ no

---

## /admin/identity/users

Platform admin only. Full-shell sketch with all states.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ id admin   ▸ Admin ▸ Users              [🔍         ]  [👤]  │
├──────────────────┬───────────────────────────────────────────────┤
│ ▸ Dashboard      │ ┌───────────────────────────────────────────┐ │
│                  │ │ Users  [Role ▾] [Status ▾]                │ │
│ ▸ Identity       │ │ [🔍 Search name or email…     ]  [+ New] │ │
│   ▸ Users        │ └───────────────────────────────────────────┘ │
│   · Organizatns  │ ┌───────────────────────────────────────────┐ │
│                  │ │ Name ↕      Email ↕       Role  Status Vfy│ │
│ ▸ OAuth          │ │ John Doe    j@acme.com    admin  ●     ✓ │ │
│   · Applicatns   │ │ Jane Adams  j@beta.com    user   ○     ✗ │ │
│   · Resource APIs│ │ Bob King    b@corp.com    user   ●     ✓ │ │
│   · Scope Catlg  │ │              Showing 1-3 of 42      ‹   ›│ │
│   · M2M Bindngs  │ └───────────────────────────────────────────┘ │
│   · Sessns&Tokns │                                               │
│                  │  ┌── loading ──────────────────────────────┐  │
│ ▸ Security       │  │ ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎  ∎∎│  │
│   · JWKS         │  │ ∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎  ∎∎∎∎∎  ∎∎∎∎∎  ∎∎│  │
│   · Consents     │  └─────────────────────────────────────────┘  │
│                  │                                               │
│ ▸ System         │  ┌── empty ────────────────────────────────┐  │
│   · Service Accts│  │  📥  No users found                     │  │
│   · Issuer Metadt│  │       [Create User]                      │  │
│   · SCIM Status  │  └─────────────────────────────────────────┘  │
│   · Health       │                                               │
│   · Settings     │  ┌── search-empty ─────────────────────────┐  │
│                  │  │  📥  No users match your search          │  │
│                  │  │       [Clear search]                      │  │
│                  │  └─────────────────────────────────────────┘  │
│                  │                                               │
│                  │  ┌── error ────────────────────────────────┐  │
│                  │  │  ⚠ Something went wrong.   [Retry]       │  │
│                  │  └─────────────────────────────────────────┘  │
│                  │                                               │
│                  │  ┌── Create User modal ────────────────────┐  │
│                  │  │ Create User                              │  │
│                  │  │ Name   [                    ]            │  │
│                  │  │ Email  [                    ]            │  │
│                  │  │ Password [           ]  (optional)       │  │
│                  │  │ Role   ○ user  ● admin                  │  │
│                  │  │         [Cancel]  [Create]               │  │
│                  │  └─────────────────────────────────────────┘  │
└──────────────────┴───────────────────────────────────────────────┘
```

Components:
  AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  Sidebar: AdminSidebarNav (from admin-nav.tsx)
  Topbar: AdminTopbar (from admin-nav.tsx)
  MainContent > PageBody > Stack(gap="md")
    Panel(padding="none") > Stack(gap="sm")
      Inline(justify="between")
        Inline(gap="sm")
          FilterDropdown(label="Role", options=[{value:"all",label:"All Roles"},{value:"admin",label:"Admin"},{value:"user",label:"User"}], value, onChange)
          FilterDropdown(label="Status", options=[{value:"all",label:"All"},{value:"active",label:"Active"},{value:"banned",label:"Banned"}], value, onChange)
        LinkButton(href="/admin/identity/users/new", variant="primary", "+ New")  — or SearchInput + LinkButton
      Inline(justify="between")
        SearchInput(placeholder="Search name or email…", value, onChange) — debounced 300ms, resets offset
      DataTable(
        columns=[name(sortable), email(sortable), role(col), status(col), emailVerified(col), createdAt(sortable)],
        rows, getRowKey=(user)=>user.id,
        onRowClick=navigate to /admin/identity/users/:userId,
        sortBy, sortDirection, onSort,
        pagination={ total, limit, offset, onChange: setOffset }
      )
    Empty state: EmptyState(message="No users found", cta="Create User", onCta=openCreateModal)
    Search-empty: EmptyState(message="No users match your search", cta="Clear search", onCta=clearSearch)
    Filter-empty: EmptyState(message="No users matching filters", cta="Clear filters", onCta=clearFilters)
    Error: ErrorAlert(message="Failed to load users", onRetry=refetch)
  Create modal:
    ConfirmDialog(open, onOpenChange, title="Create User", confirmLabel="Create", onConfirm)
      TextInput(label="Name", name="name", required)
      TextInput(label="Email", name="email", type="email", required)
      TextInput(label="Password", name="password", type="password")  — optional
      RadioGroup(title="Role", name="role", options=[{value:"user",label:"User"},{value:"admin",label:"Admin"}], value=role, onChange=setRole)
    On confirm: POST /api/auth/admin/create-user; on success close modal + refresh list

Data: GET /api/auth/admin/list-users → { users: User[], total: number, limit: number, offset: number }
        query params: searchValue, searchField("email"|"name"), searchOperator("contains"|"starts_with"|"ends_with"),
          limit, offset, sortBy, sortDirection, filterField, filterValue, filterOperator
      POST /api/auth/admin/create-user → { user: User }
        body: { email: string, password?: string, name: string, role?: string }

Defaults: searchField="email", searchOperator="contains", limit=25, sortBy="createdAt", sortDirection="desc"

Behavior:
  - SearchInput onChange → debounce 300ms → call list-users with searchValue, reset offset to 0
  - FilterDropdown onChange → call list-users with filterField + filterValue + filterOperator="eq" + reset offset
  - Filter "all" → omit filterField and filterValue params entirely
  - Sort: click column header → call onSort(key, "asc") first time, toggle "asc"/"desc" on repeated clicks
  - Pagination: offset computed as (page-1)*limit; DataTable handles the ‹/› buttons internally
  - Row click → navigate to /admin/identity/users/:userId
  - All three (search + filter + sort) compose: each change preserves the others, only the changed param differs

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
│ ▸ Dashboard      │ ┌─ TabNav ──────────────────────────────────┐ │
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
  MainContent > PageBody > Stack(gap="md")
    PageHeader: Inline(justify="between")
      Inline(gap="sm")
        LinkButton(href="/admin/identity/users", variant="secondary", "← Users")
        Text(variant="h1", children=user.name)
        Badge(tone=role==="admin"?"primary":"neutral", children=user.role)
      — If impersonating (current session.impersonatedBy is set):
        Button(variant="secondary", onClick=stopImpersonating, "Stop Impersonating")
      — If not impersonating:
        Button(variant="secondary", onClick=openImpersonateModal, "Impersonate")

    TabNav(items=[
      {href: `/admin/identity/users/${userId}`, label:"Overview", active:true},
      {href: `/admin/identity/users/${userId}/sessions`, label:"Sessions"}
    ])

    — If banned: Alert(tone="warning") showing "This user is banned. Reason: {banReason}. Expires: {banExpires}."
    — If loading: Skeleton(rows=4, height="md")

    Panel(tone="base") — Profile
      Grid(columns="two")
        — Column 1: Avatar area + Text pairs
          NOTE: no Avatar component exists in @id/ui yet. For initial implementation, either:
            a) Create a minimal avatar in the route using raw markup inside a div,
               since this is a one-off detail-view requirement, OR
            b) Show no avatar, just the text pairs.
          If avatar implemented: show <img> if user.image set (mask-squircle via class),
          else show circle with initials.
        — All label/value pairs: Text(variant="caption") for labels, Text(variant="body") for values
        Fields: Name, Email, Role, Email Verified (Badge), Banned (Badge/Yes-No), Created At

    Panel(tone="base") — Actions
      Inline(wrap, gap="md")
        Button(variant="secondary", onClick=openEditModal, "Edit Profile")
        Button(variant="secondary", onClick=openRoleModal, "Set Role")
        Button(variant="secondary", onClick=openPasswordModal, "Reset Password")
        — Toggle: user.banned ? Button("Unban User", onClick=unbanUser) : Button(variant="danger", onClick=openBanModal, "Ban User")
        Button(variant="danger", onClick=openDeleteModal, "Delete User")

  Modals (all use ConfirmDialog):
    Edit Profile: ConfirmDialog(open, onOpenChange, title="Edit Profile", confirmLabel="Save", onConfirm)
      TextInput(label="Name", name="name", defaultValue=user.name)
      TextInput(label="Email", name="email", type="email", defaultValue=user.email)
      TextInput(label="Avatar URL", name="image", defaultValue=user.image||"")
      On confirm: POST /api/auth/admin/update-user { userId, data: JSON.stringify({ name, email, image }) }

    Set Role: ConfirmDialog(title="Set Role", confirmLabel="Save", onConfirm)
      RadioGroup(title="Role", name="role",
        options=[{value:"user",label:"User"},{value:"admin",label:"Admin"}],
        value=selectedRole, onChange=setSelectedRole)
      On confirm: POST /api/auth/admin/set-role { userId, role }

    Reset Password: ConfirmDialog(title="Reset Password", confirmLabel="Set Password", onConfirm)
      TextInput(label="New Password", name="password", type="password")
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
      POST /api/auth/admin/update-user → { user: User }     body: { userId, data: JSON-stringified { name?, email?, image? } }
      POST /api/auth/admin/set-role → { user: User }         body: { userId, role }
      POST /api/auth/admin/set-user-password → { status: boolean }  body: { newPassword, userId }
      POST /api/auth/admin/ban-user → { user: User }         body: { userId, banReason?, banExpiresIn? }
      POST /api/auth/admin/unban-user → { user: User }       body: { userId }
      POST /api/auth/admin/impersonate-user → { session, user }  body: { userId }
      POST /api/auth/admin/stop-impersonating → void          (no body)
      POST /api/auth/admin/remove-user → { success: boolean }  body: { userId }

Notes:
  - banExpiresIn is seconds (number), not a date. Compute display from user.banExpires (timestamp_ms).
  - update-user `data` is a JSON string. Send only changed fields.
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

Inherits parent shell + PageHeader + TabNav. Sessions tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...   ▸ ... ▸ John Doe                        [Impersonate]  │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ TabNav ──────────────────────────────────┐ │
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

Data: POST /api/auth/admin/list-user-sessions → { sessions: Session[] }
        body: { userId }
      POST /api/auth/admin/revoke-user-session → { success: boolean }
        body: { sessionToken: string }   ← uses Session.token NOT Session.id
      POST /api/auth/admin/revoke-user-sessions → { success: boolean }
        body: { userId }

Session shape: { id, token, userId, ipAddress, userAgent, createdAt, expiresAt,
                 activeOrganizationId, activeTeamId, impersonatedBy }

Notes:
  - revoke-user-session uses `sessionToken` (the `token` field), not `id`. Fetch from the row's `session.token`.
  - No pagination; render all sessions returned by the API.
  - Organization column: show org name from a lookup or show `activeOrganizationId` truncated. If no lookup: "—".
  - Impersonation badge: show per row when `session.impersonatedBy` is truthy.

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
    PageHeader: Inline(justify="between")
      Text(variant="h1", "Organizations")
      Inline(gap="sm")
        SearchInput(placeholder="Search organizations…", value=search, onChange)
        LinkButton(href="#", variant="primary", "+ Create")  — opens create modal

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
    TextInput(label="Slug", name="slug", required)  — validate: check-slug on blur
    TextInput(label="Logo URL", name="logo")
    TextInput(label="Metadata", name="metadata")
      — NOTE: raw JSON string. Validate parseable on blur; show inline error via TextInput error prop.
    On confirm: POST /api/auth/organization/create { name, slug, logo?, metadata? }
    On success: navigate to /admin/identity/organizations/${id}

Data: GET /api/auth/organization/list → Organization[]   (no pagination)
      POST /api/auth/organization/create → Organization    body: { name, slug, logo?, metadata? }
      POST /api/auth/organization/check-slug → 200 if unique, error if taken  body: { slug }

Behavior:
  - No server-side pagination from BA — fetch full list once.
  - Client-side search: filter by name (case-insensitive contains). SearchInput triggers local filter, no API call.
  - Sort: client-side sorting by name/createdAt via DataTable onSort → sort the fetched array.
  - Slug validation: on blur of slug input, call check-slug. Show error message under slug field.
    If editing existing org, skip validation if slug unchanged.
  - Logo: text input for URL. No file upload. Show preview in the detail page only.
  - Metadata: free-text JSON. On blur, try JSON.parse; if fails, set error prop on TextInput.

---

## /admin/identity/organizations/:orgId

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ TabNav ──────────────────────────────────┐ │
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
  MainContent > PageBody > Stack(gap="md")
    PageHeader: Inline(justify="between")
      Inline(gap="sm")
        LinkButton(href="/admin/identity/organizations", variant="secondary", "← Organizations")
        Text(variant="h1", org.name)
        Badge(tone="neutral", children=`#${org.slug}`)
      Button(variant="danger", onClick=openDeleteModal, "Delete")

    TabNav(items=[
      {href:`/admin/identity/organizations/${orgId}`, label:"Overview", active:true},
      {href:`/admin/identity/organizations/${orgId}/members`, label:"Members"},
      {href:`/admin/identity/organizations/${orgId}/teams`, label:"Teams"},
      {href:`/admin/identity/organizations/${orgId}/invitations`, label:"Invitations"}
    ])

    Panel
      Grid(columns="two")
        — Left: Logo preview (if org.logo: <img> else placeholder text "No logo")
        — Right + below: label/value pairs using Text(variant="caption") / Text(variant="body")
      Inline(justify="end")
        Button(variant="secondary", onClick=openEditModal, "Edit Organization")

  Edit modal: ConfirmDialog(title="Edit Organization", confirmLabel="Save", onConfirm)
    TextInput(label="Name", name="name", defaultValue=org.name)
    TextInput(label="Slug", name="slug", defaultValue=org.slug)
    TextInput(label="Logo URL", name="logo", defaultValue=org.logo||"")
    TextInput(label="Metadata", name="metadata", defaultValue=org.metadata||"")
    On confirm: POST /api/auth/organization/update { data: { name, slug, logo, metadata } }

  Delete modal: ConfirmDialog(title="Delete Organization", confirmLabel="Delete Org", variant="danger",
    confirmDisabled=typedSlug !== org.slug, onConfirm)
    Text(variant="body", "This will remove the organization and ALL members, teams, and invitations. This cannot be undone.")
    TextInput(label="Type the slug to confirm", name="confirmSlug")
    On confirm: POST /api/auth/organization/delete { organizationId }, then navigate to /admin/identity/organizations

Data: GET /api/auth/organization/get-full-organization → Organization (with metadata)
      POST /api/auth/organization/update   body: { organizationId?, data: { name?, slug?, logo?, metadata? } }
      POST /api/auth/organization/delete   body: { organizationId }

Notes:
  - Slug validation on blur in edit modal (same as create, skip if unchanged).
  - Metadata displayed as monospace pre/code block; edit as raw JSON string.

---

## /admin/identity/organizations/:orgId/members

Inherits parent shell + PageHeader + TabNav. Members tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ TabNav ──────────────────────────────────┐ │
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
    LinkButton(href="#", variant="primary", "+ Invite Member") — opens Invite modal

  Panel(padding="none") > DataTable(
    columns=[name, email, role(col with Badge), joinedAt(sortable)],
    rows=filteredMembers, getRowKey=(m)=>m.id
  )
  Per-row: Inline(gap="sm")
    Button(size="sm", onClick=openRoleModal, "Chg Role")
    Button(variant="danger", size="sm", onClick=openRemoveModal, "Remove")
      — disabled if member.role==="owner" AND owners.length===1 (tooltip: "Cannot remove the last owner")

  Loading: Skeleton(rows=5)
  Empty: EmptyState(message="No members")
  Filter-empty: EmptyState(message="No members with this role")

Modals:
  Change Role: ConfirmDialog(title="Change role", confirmLabel="Save", onConfirm)
    RadioGroup(title=`Role for {memberName}`, name="role",
      options=[{value:"owner",label:"Owner"},{value:"admin",label:"Admin"},{value:"member",label:"Member"}],
      value=selectedRole, onChange=setSelectedRole)
      — Pre-select current role. Show current role name in description.
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

Data: GET /api/auth/organization/list-members → Member[]
        Member shape: { id, organizationId, userId, role, createdAt }
        CAVEAT: Member has no user.name/email. If API does NOT join user data, do:
          GET /api/auth/admin/get-user?id={userId} per member.
          Batch these (Promise.all) and cache per userId to avoid refetching same user for teams tab.
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

Inherits parent shell + PageHeader + TabNav. Teams tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ TabNav ──────────────────────────────────┐ │
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
    Button(size="sm", onClick=selectTeam, "▶")           — expand/collapse member panel
    Button(size="sm", onClick=openRenameModal, "Ren")    — Rename
    Button(variant="danger", size="sm", onClick=openDeleteModal, "✕")  — Delete

  — Expanded member panel (visible when a team row is selected):
    Panel(tone="muted")
      Inline(justify="between")
        Text(variant="h4", `${team.name} · ${teamMembers.length} members`)
        FilterDropdown(label="Add Member",
          options=eligibleMembers,  — org members NOT in this team
          value="", onChange=addMemberToTeam)
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
    On confirm: POST /api/auth/organization/update-team { teamId, data: { name } }

  Delete: ConfirmDialog(title="Delete Team", confirmLabel="Delete", variant="danger", onConfirm)
    description: "{n} team members will be removed from the team (org membership is preserved)."
    On confirm: POST /api/auth/organization/remove-team { teamId }, then collapse member panel, refresh list

  Remove Member: ConfirmDialog(title="Remove Member", confirmLabel="Remove", variant="danger", onConfirm)
    description: "Remove {userName} from {teamName}?"
    On confirm: POST /api/auth/organization/remove-team-member { teamId, userId }, refresh members

Data: GET /api/auth/organization/list-teams → Team[]
        Team: { id, name, organizationId, createdAt, updatedAt }
      GET/POST /api/auth/organization/list-team-members → TeamMember[]
        TeamMember: { id, teamId, userId, createdAt }
      POST /api/auth/organization/create-team      body: { name, organizationId? }
      POST /api/auth/organization/update-team      body: { teamId, data: { name } }
      POST /api/auth/organization/remove-team      body: { teamId, organizationId? }
      POST /api/auth/organization/add-team-member   body: { teamId, userId, organizationId? }
      POST /api/auth/organization/remove-team-member body: { teamId, userId, organizationId? }

Behavior:
  - On page load: fetch teams (list-teams) + user cache (for member names).
  - memberCount: call list-team-members for each team in parallel → count results → map by teamId.
    Loading: show "…" in memberCount column until resolved.
  - Clicking "▶" on a team row: fetch list-team-members for that team, show expanded panel below the table row.
    Clicking again collapses it. Only one team expanded at a time.
  - Add Member: filter org members (from list-members) minus already-assigned teamMembers.
    Selecting from FilterDropdown calls add-team-member, re-fetches team members, updates memberCount.
  - User names: same cache as members page — fetch get-user per userId if API doesn't join names.
  - Deleting a team cascade-deletes team members (FK: ON DELETE CASCADE). Warn in dialog.

---

## /admin/identity/organizations/:orgId/invitations

Inherits parent shell + PageHeader + TabNav. Invitations tab active.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◈ ...  ▸ ... ▸ Acme Corp         #acme       ⚠ [Delete Org]   │
├──────────────────┬───────────────────────────────────────────────┤
│   (sidebar)      │ ┌─ TabNav ──────────────────────────────────┐ │
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
        {value:"rejected",label:"Rejected"}
      ],
      value=statusFilter, onChange=setStatusFilter)
    Button(variant="primary", onClick=openInviteModal, "+ Invite Member")

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
      POST /api/auth/organization/invite-member  body: { email, role, organizationId?, teamId?, resend? }
      POST /api/auth/organization/cancel-invitation  body: { invitationId }

Behavior:
  - Status filter: client-side filter by invitation.status.
  - Resend: uses `resend: true` on the invite-member endpoint. Pass same email, role, organizationId.
    Do NOT use cancel+re-invite; the API natively supports resend.
  - Inviter name: Invitation has inviterId but no name. Fetch via GET /api/auth/admin/get-user?id={inviterId}.
    Cache inviter names in a Map<string,string> to avoid duplicate fetches. Show "—" if lookup fails.
  - Team name: Invitation has teamId (nullable in DB, marked required in OpenAPI spec — verify at runtime).
    If teamId is set, resolve team name from the teams list fetched on the Overview tab.
    For initial implementation, skip team name resolution (show "—") and note it will be wired when lookup is available.
  - Expired rows: only Cancel action available (to clean up). No Resend on expired; admin must create a new invite.
  - Status badge: pending→tone="warning", accepted→tone="success", rejected→tone="error", expired→tone="neutral"
