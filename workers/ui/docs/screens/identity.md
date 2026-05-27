# Identity Screens

Covers all routes under `/admin/identity`. Actor-scoping rules:
- Platform admin (`user.role = "admin"`) — full access to users and all organizations.
- Org admin (`member.role = "owner" | "admin"`) — no access to `/admin/identity/users`; directed to their own org detail only.

---

## /admin/identity/users

```
+-- Topbar --------------------------------------------------------+
| [≡] id admin                               [@ platform-admin]   |
+-- Sidebar --------+-- Content ------------------------------------+
| Dashboard         |                                              |
| Identity        > | +-- PageHeader ----------------------------+ |
|   Users           | | Users          [Search...] [+ Create]   | |
|   Organizations   | +------------------------------------------+ |
| OAuth           > | +-- Panel(padding="none") -----------------+ |
| Security          | | Name ↕  | Email ↕         | Role  | St.  | |
| System            | | John D. | john@acme.com   | admin | ●    | |
|                   | | Jane A. | jane@beta.com   | user  | ⊘    | |
|                   | | Bob K.  | bob@corp.com    | user  | ●    | |
|                   | |                    [< 1  2  3  >]        | |
+-------------------+----------------------------------------------+
```

Components:
  AppShell > Topbar + Sidebar + PageBody
  PageHeader: Inline(justify="between") > Text(variant="h1", "Users") + Inline > SearchInput + LinkButton(variant="primary", "+ Create")
  Panel(padding="none") > DataTable(
    columns=[name(sortable), email(sortable), role-badge, status-badge, createdAt(sortable)],
    paginated, rowClick → /admin/identity/users/:userId
  )
  Create: modal ConfirmDialog-style form — name, email, role, password fields

Data: GET /api/auth/admin/list-users → { users: User[], total, limit, offset }
      params: searchValue, searchField (email|name), searchOperator (contains|starts_with|ends_with),
              limit, offset, sortBy, sortDirection, filterField, filterValue, filterOperator
      POST /api/auth/admin/create-user (modal form submit)

States: loading → Skeleton ×8 | empty → EmptyState("No users found") | error → ErrorAlert + retry
        search-empty → EmptyState("No users match your search") + Button("Clear search")

Notes:
  role badge: "admin" → Badge(tone="primary"), "user" → Badge(tone="neutral")
  status badge: banned=false → Badge(tone="success", "Active"), banned=true → Badge(tone="error", "Banned")
  emailVerified=false → Badge(tone="warning", "Unverified") shown in email column

---

## /admin/identity/users/:userId

```
+-- PageHeader -------------------------------------------------+
| ← Users   John Doe   john@acme.com   [Impersonate] [⋯ more]  |
+--------------------------------------------------------------+
| [Overview]  [Sessions]                                        |
+--------------------------------------------------------------+
| +-- Panel: Profile ----------------------------------------+ |
| | Name         John Doe          Email  john@acme.com      | |
| | Role         admin             Verified  ✓               | |
| | Banned       No                Created   2024-01-15      | |
| +----------------------------------------------------------+ |
| +-- Panel: Actions ----------------------------------------+ |
| | [Edit Profile]  [Set Role]  [Reset Password]             | |
| | [Ban User]                  [Delete User]                | |
| +----------------------------------------------------------+ |
```

Components:
  AppShell > Topbar + Sidebar + PageBody
  PageHeader: Inline(justify="between") >
    Inline(gap="sm") > LinkButton(variant="secondary", "← Users") + Text(variant="h1") + Badge(tone per status)
    Inline(gap="sm") > Button("Impersonate", variant="secondary") + DropdownMenu(more actions)
  TabNav: items=[{ href: /admin/identity/users/:userId, label: "Overview" }, { href: .../sessions, label: "Sessions" }], active driven by usePathname()
  Panel "Profile": Grid(columns="two") of Text(variant="caption") label + Text(variant="body") value pairs
  Panel "Actions": Inline(wrap) > Button per action, destructive actions use variant="danger"
  Edit Profile: ConfirmDialog-style modal — TextInput for name, email
  Set Role: ConfirmDialog modal — RadioGroup(options=[user, admin])
  Reset Password: ConfirmDialog modal — TextInput(type="password")
  Ban: ConfirmDialog modal — TextInput(banReason) + optional banExpires date
  Delete: ConfirmDialog modal — confirmation text, Button(variant="danger")

Data: GET /api/auth/admin/get-user?id=:userId → { user: User }
      POST /api/auth/admin/update-user (edit modal)
      POST /api/auth/admin/set-role
      POST /api/auth/admin/set-user-password
      POST /api/auth/admin/ban-user
      POST /api/auth/admin/unban-user
      POST /api/auth/admin/impersonate-user
      POST /api/auth/admin/remove-user

States: loading → Skeleton blocks | not-found → Alert(tone="error", "User not found") + back link
        banned → Banner Alert(tone="warning") at top of page with banReason + banExpires

Notes:
  Impersonate opens a new session as the user — show confirmation modal before proceeding
  Delete requires typing the user's email in the confirmation modal to confirm
  Ban/unban toggle: show "Unban User" when user.banned=true, "Ban User" when false
  DropdownMenu (⋯) contains: Set Password, Delete — keep primary actions as top-level buttons

---

## /admin/identity/users/:userId/sessions

```
+-- PageHeader (same as parent, Sessions tab active) ----------+
+-- Panel ---------------------------------------------------+ |
| IP Address     | User Agent        | Created    | Expires   | |
| 192.168.1.1   | Chrome/Mac        | 2024-12-01 | 2025-01-01| |
| 10.0.0.5      | Firefox/Win       | 2024-12-05 | 2025-01-05| |
|                                           [Revoke All]       | |
+------------------------------------------------------------+ |
```

Components:
  (inherits shell and tab nav from parent page)
  Panel(padding="none") > DataTable(columns=[ipAddress, userAgent, activeOrganizationId, createdAt, expiresAt])
  Per-row action: Button(variant="danger", size="sm", "Revoke")
  Footer action: Button(variant="danger", "Revoke All Sessions") — requires ConfirmDialog

Data: GET /api/auth/admin/list-user-sessions (body: { userId }) → { sessions: Session[] }
      POST /api/auth/admin/revoke-user-session (body: { sessionId })
      POST /api/auth/admin/revoke-user-sessions (body: { userId }) — revoke all

States: loading → Skeleton ×4 | empty → EmptyState("No active sessions") | error → ErrorAlert + retry

Notes:
  impersonatedBy field: if set, show Badge(tone="warning", "Impersonation") in row
  activeOrganizationId: show org name if available, else show id shortened
  expiresAt < now: row is dimmed, session is expired but not yet cleaned up

---

## /admin/identity/organizations

Platform admin only. Org admins are redirected to their own org detail directly.

```
+-- PageHeader -----------------------------------------------+
| Organizations                            [+ Create Org]     |
+------------------------------------------------------------+
| +-- Panel(padding="none") ----------------------------------+|
| | Name ↕       | Slug ↕       | Created ↕                  ||
| | Acme Corp    | acme         | 2024-01-15                  ||
| | Beta Inc     | beta-inc     | 2024-03-20                  ||
| | Gamma LLC    | gamma        | 2024-08-01                  ||
| +-----------------------------------------------------------+|
```

Components:
  AppShell > Topbar + Sidebar + PageBody
  PageHeader: Inline(justify="between") > Text(variant="h1", "Organizations") + LinkButton(variant="primary", "+ Create")
  Panel(padding="none") > DataTable(
    columns=[name(sortable), slug, createdAt(sortable)],
    rowClick → /admin/identity/organizations/:orgId
  )
  Create: ConfirmDialog-style modal — TextInput(name), TextInput(slug), TextInput(logo url optional)

Data: GET /api/auth/organization/list → Organization[]
      POST /api/auth/organization/create (modal form submit)

States: loading → Skeleton ×5 | empty → EmptyState("No organizations") + create CTA | error → ErrorAlert + retry

Notes:
  No pagination in the BA organization/list endpoint — renders full list; if list grows large, add client-side search
  Slug must be unique — validate against POST /api/auth/organization/check-slug on blur in create modal
  After create, navigate to /admin/identity/organizations/:newOrgId

---

## /admin/identity/organizations/:orgId

```
+-- PageHeader -----------------------------------------------+
| ← Organizations   Acme Corp   [slug: acme]      [Delete]   |
+------------------------------------------------------------+
| [Overview]  [Members]  [Teams]  [Invitations]              |
+------------------------------------------------------------+
| +-- Panel: Details ----------------------------------------+|
| | Name     Acme Corp         Slug   acme                   ||
| | Logo     https://...       Created  2024-01-15           ||
| | Metadata  —                                              ||
| |                                     [Edit Organization]  ||
| +---------------------------------------------------------+|
```

Components:
  AppShell > Topbar + Sidebar + PageBody
  PageHeader: Inline(justify="between") >
    Inline > LinkButton(variant="secondary", "← Organizations") + Text(variant="h1", orgName) + Badge(tone="neutral", "slug: {slug}")
    Button(variant="danger", "Delete")
  TabNav: Inline(gap="sm") > LinkButton per tab (Overview active = variant="primary", others = "secondary")
    Overview → /admin/identity/organizations/:orgId
    Members  → /admin/identity/organizations/:orgId/members
    Teams    → /admin/identity/organizations/:orgId/teams
    Invitations → /admin/identity/organizations/:orgId/invitations
  Panel "Details": Grid(columns="two") of label/value pairs + Button("Edit Organization")
  Edit: ConfirmDialog-style modal — TextInput(name), TextInput(slug), TextInput(logo)
  Delete: ConfirmDialog modal — requires typing org slug to confirm

Data: GET /api/auth/organization/get-full-organization → { organization: Organization }
      POST /api/auth/organization/update (edit modal)
      POST /api/auth/organization/delete (delete modal, then redirect to /admin/identity/organizations)

States: loading → Skeleton blocks | not-found → Alert(tone="error") + back link

Notes:
  Slug edit: re-validate with /api/auth/organization/check-slug on blur
  Delete is irreversible — cascade deletes members, teams, invitations per FK constraints

---

## /admin/identity/organizations/:orgId/members

```
+-- PageHeader + TabNav (Members tab active) -----------------+
+-- Inline(justify="between") --------------------------------+
| [Filter by role v]                      [+ Invite Member]  |
+------------------------------------------------------------+
| +-- Panel(padding="none") ----------------------------------+|
| | Name ↕       | Email           | Role     | Joined ↕     ||
| | John Doe     | john@acme.com   | [owner▼] | 2024-01-15   ||
| | Jane Adams   | jane@acme.com   | [admin▼] | 2024-02-01   ||
| | Bob King     | bob@acme.com    | [member▼]| 2024-03-10   ||
| |                                          [Remove]         ||
| +-----------------------------------------------------------+|
```

Components:
  (inherits shell, PageHeader, TabNav from parent org page)
  Inline(justify="between", padding below tabs): FilterDropdown(label="Role", options=[all,owner,admin,member]) + LinkButton(variant="primary", "+ Invite Member")
  Panel(padding="none") > DataTable(
    columns=[name, email, role-select(inline dropdown), joinedAt(sortable)],
    per-row action: Button(variant="danger", size="sm", "Remove")
  )
  Role column: inline Select per row — onChange calls update-member-role immediately
  Invite: ConfirmDialog-style modal — TextInput(email), RadioGroup(role: owner|admin|member), optional Select(team)
  Remove: ConfirmDialog modal before POST

Data: GET /api/auth/organization/list-members → Member[] (with user name/email joined)
      POST /api/auth/organization/update-member-role (body: { memberId, role })
      POST /api/auth/organization/remove-member (body: { memberIdOrEmail })
      POST /api/auth/organization/invite-member (body: { email, role, organizationId, teamId? })

States: loading → Skeleton ×5 | empty → EmptyState("No members") | error → ErrorAlert + retry
        filter-empty → EmptyState("No members with this role")

Notes:
  Cannot remove the last owner — show disabled Remove button with tooltip
  Role dropdown onChange shows ConfirmDialog before submitting to prevent accidental role change
  Invite modal: teamId is optional — links the invitation to a specific team

---

## /admin/identity/organizations/:orgId/teams

```
+-- PageHeader + TabNav (Teams tab active) -------------------+
+-- Inline(justify="between") --------------------------------+
| Teams (3)                               [+ Create Team]    |
+------------------------------------------------------------+
| +-- Panel(padding="none"): teams table --------------------+|
| | Name ↕         | Members | Created ↕                    ||
| | Frontend       | 4       | 2024-01-15          [▶] [⋯] ||
| | Backend        | 7       | 2024-02-01          [▶] [⋯] ||
| | Design         | 2       | 2024-03-10          [▶] [⋯] ||
| +-----------------------------------------------------------+|
|                                                             |
| (row expanded or navigated → members panel below)          |
| +-- Panel: Backend · 7 members ----------------------------+|
| | + [Add Member v]                                         ||
| | John D.  jane@...  [Remove]                              ||
| | Jane A.  john@...  [Remove]                              ||
| +-----------------------------------------------------------+|
```

Components:
  (inherits shell, PageHeader, TabNav from parent org page)
  Inline(justify="between"): Text(variant="h3", "Teams ({n})") + Button(variant="primary", "+ Create Team")
  Panel(padding="none") > DataTable(
    columns=[name(sortable), memberCount, createdAt(sortable)],
    per-row actions: Button("▶ View", size="sm") + DropdownMenu(Rename, Delete)
  )
  Expanded members Panel below table (or slide-out):
    Inline(justify="between"): Text(variant="h3", teamName) + FilterDropdown(add member — search org members)
    Stack > each TeamMember row: Inline > user name + email + Button(variant="danger", size="sm", "Remove")
  Create team: ConfirmDialog modal — TextInput(name)
  Rename: ConfirmDialog modal — TextInput(name, prefilled)
  Delete: ConfirmDialog modal

Data: GET /api/auth/organization/list-teams → Team[] (with member count — or count from list-team-members)
      GET /api/auth/organization/list-team-members (body: { teamId }) → TeamMember[]
      POST /api/auth/organization/create-team (body: { name, organizationId })
      POST /api/auth/organization/update-team (rename modal)
      POST /api/auth/organization/remove-team
      POST /api/auth/organization/add-team-member (body: { teamId, userId })
      POST /api/auth/organization/remove-team-member (body: { teamId, userId })

States: loading → Skeleton ×4 | empty → EmptyState("No teams yet") + create CTA | error → ErrorAlert + retry
        team-members loading → Skeleton ×3 | team-members empty → EmptyState("No members in this team")

Notes:
  Member count is not in the Team schema directly — derive from list-team-members length or cache
  Add Member dropdown searches existing org members (from list-members), not all platform users
  Cannot delete a team with active members — show error or auto-remove members first (confirm)
  TeamMember.userId needs user name/email lookup — join with org member list on client

---

## /admin/identity/organizations/:orgId/invitations

```
+-- PageHeader + TabNav (Invitations tab active) -------------+
+-- Inline(justify="between") --------------------------------+
| [Status filter: pending ▼]               [+ Invite Member] |
+------------------------------------------------------------+
| +-- Panel(padding="none") ----------------------------------+|
| | Email ↕          | Role   | Team    | Expires ↕ | Status ||
| | bob@corp.com     | member | —       | 2025-01-01| pending||
| | alice@inc.com    | admin  | Backend | 2024-12-20| pending||
| | old@example.com  | member | —       | 2024-11-01| expired||
| | [Resend] [Cancel]                                         ||
| +-----------------------------------------------------------+|
```

Components:
  (inherits shell, PageHeader, TabNav from parent org page)
  Inline(justify="between"): FilterDropdown(status: all|pending|expired|accepted|rejected) + Button(variant="primary", "+ Invite Member")
  Panel(padding="none") > DataTable(
    columns=[email, role-badge, team-name, expiresAt(sortable), status-badge],
    per-row actions (pending only): Button("Resend", size="sm") + Button("Cancel", variant="danger", size="sm")
  )
  Invite modal: TextInput(email), RadioGroup(role: owner|admin|member), optional Select(team from org teams)

Data: GET /api/auth/organization/list-invitations → Invitation[]
      POST /api/auth/organization/invite-member (body: { email, role, organizationId, teamId? })
      POST /api/auth/organization/cancel-invitation (body: { invitationId })
      (resend = cancel + re-invite with same email/role — no direct resend endpoint in API)

States: loading → Skeleton ×4 | empty (pending filter) → EmptyState("No pending invitations") + invite CTA
        empty (other filters) → EmptyState("No invitations with this status") | error → ErrorAlert + retry

Notes:
  Resend: no dedicated resend endpoint — cancel the existing invitation then create a new one
  expired status: row is dimmed, only Cancel action available (to clean up)
  teamId on invitation: show team name if set, else "—"
  Invitation.inviterId: could show "Invited by {name}" as tooltip or secondary text
