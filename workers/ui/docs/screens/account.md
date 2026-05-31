# Account Center Screens (`/account/*`)

Self-service Account shell from [docs/029](../../../../docs/029_account-center-and-self-service-identity.md). This is the user's `myaccount` surface — distinct from the operator Console under `/admin/*` ([docs/028](../../../../docs/028_tenant-scoped-platform-experience.md)). Any signed-in user lands here; there is no scope selector, no platform metrics, and no operator sidebar.

Route files live under `workers/ui/src/app/account/`. `layout.tsx` wraps every page in `AccountSwrProvider > AccountShell`; each `page.tsx` renders `PageBody > <Section>Content`. Content components own their data with `useSWR` through the injected `actions` from `_actions/account.ts`; route files own zero URL/data logic. Public recovery/verification pages live in [auth-flow.md](auth-flow.md).

## Shell

```
+-------------------------------------------------------------------------------+
| id   Breadcrumb                                  🔔   (AV) person@example.com │  Topbar
+-------------------------------------------------------------------------------+
| Overview | Profile | Security | Sessions | Connected apps | Organizations     |  MobileRouteTabs (lg:hidden)
+----------------+--------------------------------------------------------------+
| ▸ Overview     |                                                              |
|   Profile      |   <PageBody> content                                         |
|   Security     |                                                              |
|   Sessions     |                                                              |
|   Connected.. |                                                              |
|   Organizations|                                                              |
+----------------+--------------------------------------------------------------+
| Home  Profile  Security  Sessions  Apps                                       |  MobileDock (lg:hidden)
+-------------------------------------------------------------------------------+
```

Components:
  AppShell > Topbar(TopbarStart[TopbarBrandLink "id" + TopbarBreadcrumb] + TopbarEnd[Button(iconName="Bell") + TopbarAvatarMenu]) + MobileRouteTabs(Tabs href) + SidebarLayout(Sidebar[NavMenu > NavLink×6] + MainContent) + MobileDock(DockLink×5)
  TopbarAvatarMenu items: { email (badge "Account"), Console → /admin, Theme → ThemeDialog, Logout → ConfirmDialog }
  Logout: ConfirmDialog(variant="danger") → signOut() then location.href="/login?callbackURL=/account"

Data: GET /api/auth/account/summary (for avatar initials/email)

Nav: Overview `/account` (exact) · Profile `/account/profile` · Security `/account/security` · Sessions `/account/sessions` · Connected apps `/account/consents` · Organizations `/account/organizations`. MobileDock shows the first five.

---

## /account

```
+-------------------------------------------------------------------------------+
| Account — Your profile, security state, sessions, connected apps, orgs.        |
| [ Organizations: 2 ]   [ Sessions: 2 ]   [ Connected apps: 2 ]                 |  StatGroup(columns=3)
| +---------------------------+   +--------------------------------------------+ |
| | Profile          [Edit]   |   | Security              [Manage]             | |
| | Name   Person Example     |   | Password         Enabled                   | |
| | Email  person@example.com |   | Email verification Required                | |
| | Verification  [Verified]  |   | Multi-factor     [Coming later]            | |
| +---------------------------+   +--------------------------------------------+ |
| | Organizations                                            [View all]        | |
| | Acme            Teams: Editors                            [Member]         | |
| | Admin Org                                                 [Owner]          | |
+-------------------------------------------------------------------------------+
```

Components:
  PageBody > AccountOverviewContent
  Stack: PageIntro(title="Account", description) + StatGroup(columns=3)[Stat ×3] + Grid(columns="two")[Panel "Profile" + Panel "Security"] + Panel "Organizations"
  Profile/Security panels: Inline(justify="between")[Text(h2) + LinkButton] + DescriptionList(columns=1)
  Organizations panel: top 3 memberships, each Inline(name + teams/slug caption + Badge(roleTone))

Data: GET /api/auth/account/summary → { user, security, counts }
      GET /api/auth/account/organizations → { organizations } (top 3 shown)

States: loading → PageIntro + Panel(Skeleton rows=6) | error/no-summary → ErrorAlert(onRetry=mutate)

---

## /account/profile

Components:
  PageBody > AccountProfileContent
  Stack: PageIntro + Panel > Stack[ DescriptionList(User ID mono, Email, Verification badge) + Form(validationErrors) ]
  Form: TextInput("Display name", name, required, validate ≤80) + TextInput("Avatar URL", name="image", validate https) + Inline(justify="between")[Text(caption "Email changes are not available in this release.") + Button(submit) "Save changes"]

Data: GET /api/auth/account/summary → { user }
      POST /api/auth/update-user  body: { name, image? }  (image omitted when blank)

Behavior: client-validate name (required, ≤80) + image (https URL); pessimistic save → mutate summary → toast.success. Email is read-only (change-email not enabled — docs/029 §9.6).

States: loading → Skeleton rows=6 | error → ErrorAlert(onRetry)

---

## /account/security

Components:
  PageBody > AccountSecurityContent
  Stack: PageIntro
    + Panel "Password" > Form(validationErrors)[ TextInput(currentPassword) + TextInput(newPassword, validate≥12) + TextInput(confirmPassword) + Checkbox("Sign out other devices", defaultSelected) + Button(submit) "Change password" ]
    + Panel "Email verification" > Inline(email + Badge Verified/Unverified) + Button(secondary) "Send verification email"
    + Panel > DescriptionList[ Multi-factor "Coming later", Session review hint ]

Data: GET /api/auth/account/summary
      POST /api/auth/change-password  body: { currentPassword, newPassword, revokeOtherSessions }
      POST /api/auth/send-verification-email  body: { email, callbackURL: "/verify-email" }

Behavior: password change validates presence/length≥12/match client-side; server enforces policy; on success form.reset + toast; returned token never displayed/logged (docs/029 §9.5). Resend verification uses neutral toast.

States: loading → Skeleton rows=8 | error → ErrorAlert(onRetry)

---

## /account/sessions

Components:
  PageBody > AccountSessionsContent
  Stack: PageIntro(actions=Inline[Button(secondary)"Sign out other devices" + Button(danger)"Sign out everywhere"]) + Panel(padding none|md) > DataTable | EmptyState
  DataTable columns: Browser(userAgent + Current badge + ipAddress caption) · Last active(updatedAt) · Expires(expiresAt) · actions(Sign out|Revoke per row)
  Three ConfirmDialog(variant="danger"): revoke one (current vs other copy) · revoke others · revoke all

Data: GET /api/auth/account/sessions → { sessions } (no token field)
      POST /api/auth/account/sessions/revoke  body: { sessionId }
      POST /api/auth/account/sessions/revoke-others → { revoked }
      POST /api/auth/account/sessions/revoke-all

Behavior: revoking the current session (or revoke-all) calls onSignedOut → /login?callbackURL=/account; other revokes mutate the list. Session tokens never reach the browser (server resolves token from sessionId — docs/029 §8.3, F10).

States: loading → Skeleton rows=8 | error → ErrorAlert(onRetry) | empty → EmptyState("No active sessions")

---

## /account/consents

Components:
  PageBody > AccountConsentsContent
  Stack: PageIntro(info popover about token validity) + Panel(padding none|md) > DataTable | EmptyState
  DataTable columns: Application(clientName + clientId mono) · Scopes(Badge per scope) · Last authorized · actions(Disconnect, danger)
  ConfirmDialog(variant="danger") "Disconnect Application"

Data: GET /api/auth/account/consents → { consents } (current user only)
      POST /api/auth/account/consents/revoke  body: { clientId }

Behavior: revoke by clientId for the current user only; the info popover and toast state that existing access tokens may remain valid until expiry and the next authorize re-prompts consent. Consent is keyed per client/user (not per resource) — docs/029 §8.3 review note.

States: loading → Skeleton rows=8 | error → ErrorAlert(onRetry) | empty → EmptyState("No connected applications")

---

## /account/organizations

Components:
  PageBody > AccountOrganizationsContent
  Stack: PageIntro + Panel(padding none|md) > DataTable | EmptyState
  DataTable columns: Organization(name + slug/id caption) · Role(Badge roleTone) · Teams(Badge per team | "None") · actions(LinkButton "Open console" when canOpenConsole, else caption "Member access")

Data: GET /api/auth/account/organizations → { organizations: [{ id, name, slug, role, teams, canOpenConsole, consoleHref }] }

Behavior: `canOpenConsole`/`consoleHref` come from the same owner/admin authority the Console uses; this endpoint and `console-scopes` must agree on operable orgs (docs/029 §8.3, §6.3). `consoleHref` links into `/admin/orgs/:orgId`.

States: loading → Skeleton rows=8 | error → ErrorAlert(onRetry) | empty → EmptyState("No organization memberships")

Notes: roleLabel/roleTone map platform-admin→primary, owner→accent, admin→secondary, member→neutral (`account-format.ts`).
