# Access Screens

The Access section groups platform access-control surfaces from docs/031 and docs/033: admission policy, human authority, machine principals, resource APIs, scope catalog, and M2M bindings. Registration Policies live here because they decide which clients, invitations, domains, quotas, and default org grants may admit a new account; they are not pure Identity records. Resource APIs, Scope Catalog, and M2M Bindings reuse the OAuth screen specs because their rows and plugin contracts already live in `oauth.md`; this file covers the Access-specific registration-policy, service-account, and admins/roles surfaces.

## /admin/platform/access/registration-policies and /admin/orgs/:orgId/access/registration-policies

Platform and organization lenses for registration admission policy. Legacy `/admin/platform/identity/registration-policies` and `/admin/orgs/:orgId/identity/registration-policies` routes redirect here with query params preserved.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ id admin · Platform · Access                                         │
├──────────────────┬──────────────────────────────────────────────────┤
│ ▸ Dashboard      │ Registration Policies                    [+ New] │
│ ▸ Identity       │ Control which applications and invitations may... │
│ ▸ Applications   │ Policies  Enabled  Reserved  Used                │
│ ▸ Access         │ 12        5        3         231                 │
│   · Reg Policies │ [Search policy/client/org...] [Status: All ▾]    │
│   · Admins/Roles │ Name ↕        Status  Mode       Client  Quota   │
│   · Service Acct │ Content beta  Enabled Client     app_ui  231/1000│
│   · Resource API │ Acme invites  Paused  Invite     —       4/50    │
│   · Scope Catlg  │ Trial         Draft   Public     trial   —       │
│   · M2M Bindings │                                                  │
│ ▸ Security       │ Selected Policy                                  │
│                  │ Content beta                                     │
│                  │ Status enabled · Mode client_initiated           │
│                  │ [Edit] [Enable] [Pause] [Archive]                │
│                  │ Recent Intents                                   │
│                  │ Email              Status      Created  Failure   │
│                  │ new@acme.com       completed   10:01    —         │
│                  │                                                  │
│                  │ ┌── New/Edit Policy modal ────────────────────┐ │
│                  │ │ Name [Content beta] Slug [content-beta]     │ │
│                  │ │ Mode ○ Client ● Invite ○ Public             │ │
│                  │ │ Client ID [content-ui] Org ID [org_acme]    │ │
│                  │ │ Scopes [openid profile content:read]        │ │
│                  │ │ Domains [acme.com beta.acme.com]            │ │
│                  │ │ Quota [1000] Target ○ Accounts ● Membership │ │
│                  │ │ Require email verification ●                │ │
│                  │ │ Starts [2026-06-01] Expires [2026-07-01]    │ │
│                  │ │                         [Cancel] [Save]     │ │
│                  │ └──────────────────────────────────────────────┘ │
└──────────────────┴──────────────────────────────────────────────────┘
```

Components:
  Admin layout owns AppShell > Topbar + SidebarLayout(Sidebar + MainContent)
  Route owns:
  PageBody
    Suspense(fallback=<RegistrationPoliciesContent scope loading />)
      RegistrationPoliciesContent(scope)
  RegistrationPoliciesContent:
  Stack(gap="md")
    PageIntro(title="Registration Policies", description, info, actions=Button(variant="primary", iconName="Plus", onClick=openCreateDialog, children="New Policy"))
    StatGroup(columns=4)
      Stat(title="Policies")
      Stat(title="Enabled")
      Stat(title="Reserved")
      Stat(title="Used")
    Panel
      Inline(gap="sm", wrap)
        SearchInput(grow, placeholder="Search policies…", value, onChange)
        FilterDropdown(label="Status", options=[all,draft,enabled,paused,archived], value, onChange)
    Panel(padding="none" when rows exist)
      DataTable(columns=[name(sortable), status(sortable), mode(sortable), client, organization, quota, updated(sortable), actions=[Edit, Enable, Pause, Archive]], rows, getRowKey=(policy)=>policy.id, onRowClick=select policy, sortBy, sortDirection, onSort)
      Loading: Skeleton(rows=5)
      Empty: EmptyState(message="No registration policies")
      Search/filter empty: EmptyState(message="No registration policies match", cta="Clear filters", onCta=clear)
      Error: ErrorAlert(message=error, onRetry=refetch)
    Panel(selected detail, shown when a row is selected)
      Stack(gap="md")
        Inline(justify="between")
          Stack > Text(variant="h2", selected.name) + Badge(status) + Badge(mode)
          Button(variant="secondary", iconName="Pencil", onClick=openEditDialog, children="Edit")
        DescriptionList(items=[slug, client, organization, resource, domains, scopes, quota, starts, expires])
        Text(variant="h3", children="Recent Intents")
        DataTable(intent rows: email, status, created, completed, failure)
    Create/Edit:
      ConfirmDialog(title="New Registration Policy"|"Edit Registration Policy", confirmLabel="Create"|"Save", onConfirm)
        TextInput(label="Name", name="name", required)
        TextInput(label="Slug", name="slug", required)
        RadioGroup(title="Mode", name="mode", options=[client_initiated,invite_only,public_limited], defaultValue)
        TextInput(label="Client ID", name="clientId")
        TextInput(label="Organization ID", name="organizationId")
        TextInput(label="Resource server ID", name="resourceServerId")
        TextInput(label="Allowed scopes", name="allowedScopes")
        TextInput(label="Email domains", name="emailDomains")
        TextInput(label="Default team IDs", name="defaultTeamIds")
        TextInput(label="Quota limit", name="quotaLimit")
        RadioGroup(title="Quota target", name="quotaTarget", options=[memberships,accounts], defaultValue)
        Switch(label="Require email verification", name="requiresEmailVerification", selected, onChange)
        TextInput(label="Starts at", name="startsAt")
        TextInput(label="Expires at", name="expiresAt")

Data: GET /api/auth/admin/registration-policies → { policies: RegistrationPolicy[] }
      POST /api/auth/admin/registration-policies body: { slug, name, mode, clientId?, organizationId?, resourceServerId?, allowedScopes, emailDomains, defaultRole: "member", defaultTeamIds, quotaLimit?, quotaTarget, requiresEmailVerification, startsAt?, expiresAt? } → RegistrationPolicy
      PATCH /api/auth/admin/registration-policies/:id body: partial create body plus optional status → RegistrationPolicy
      POST /api/auth/admin/registration-policies/:id/enable → RegistrationPolicy
      POST /api/auth/admin/registration-policies/:id/pause → RegistrationPolicy, invalidates active intents
      POST /api/auth/admin/registration-policies/:id/archive → RegistrationPolicy, invalidates active intents
      GET /api/auth/admin/registration-policies/:id/intents → { intents: RegistrationIntent[] }

Route URL params: q, status, sortBy, sortDir, selected
Content defaults: q="", status="all", sortBy="updatedAt", sortDirection="desc"

Behavior:
  - Route files read URL params with useSearchParams inside PageContent only; outer route owns Suspense.
  - Search and status filter are client-side over the fetched policy list; the SWR key contains only the active scope.
  - Platform route sends no organization param; org route passes the active organization scope and defaults the create/edit organization field to that org id.
  - New Policy opens a dialog and creates a draft policy. Edit opens the same dialog prefilled from the selected policy. Successful create/update refreshes the policy list, selects the saved row, and renders toast feedback.
  - Allowed scopes, email domains, and default team ids are typed as space/comma-separated values in the dialog and sent as arrays to the plugin endpoint.
  - Enable/Pause/Archive call actions, refresh the policy list and selected intent detail, and render toast feedback.
  - Pause and Archive are operational close-switches: active started/submitted intents become unusable in core before any account can be created.
  - UI displays client IDs, organization IDs, scopes, domains, and quota values returned by the server; it never trusts OAuth request text or client-supplied display names.

States: loading → Skeleton ×5 | empty → EmptyState | error → ErrorAlert(message, onRetry) | create/edit error → ConfirmDialog error

Badge mappings:
  status: draft→neutral, enabled→success, paused→warning, archived→neutral
  intent status: completed→success, continuation_failed/failed→error, expired/cancelled→neutral, started/submitted→info

## /admin/platform/access/service-accounts

Lists OAuth clients whose grant types include `client_credentials`, grouped by system (`reference_id == null`) and tenant (`reference_id != null`) tier. This is a presentation lens over OAuth clients, not a separate service-account table.

```text
┌────────────────────────────────────────────────────────────────┐
│ Service Accounts                                      [+ New]  │
│ Total 7 · System 2 · Tenant 5 · Disabled 0                      │
│ [Search service accounts...]                                    │
│ Name                 Client ID              Tier      Scopes    │
│ id scim directory    cli_dir_a1b2…          System    identity:* │
│ content worker       cli_content_…          Tenant    content:*  │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > ApplicationsContent(variant="serviceAccounts", createHref="/admin/platform/access/service-accounts/new")
  ApplicationsContent renders PageIntro(title="Service Accounts"), StatGroup(Total/System/Tenant/Disabled), SearchInput, DataTable(columns=[Service Account, Tier, Owner, Scopes, Grants, Actions]), Rotate/Delete dialogs, and one-time secret dialog.

Data: `GET /api/auth/oauth2/get-clients` through `listClients({ kind: "platform" })`, client-side filtered to `client_credentials`; mutations use OAuth client-management endpoints.

## /admin/platform/access/service-accounts/new

Creates a system or tenant service account through the same Better Auth OAuth client endpoint, but defaults the wizard to the machine-to-machine client type. The back link returns to the Access service-account list; after the one-time secret is acknowledged, the route opens the OAuth client detail surface for follow-up configuration.

```text
┌────────────────────────────────────────────────────────────────┐
│ < Service Accounts                                              │
│ New Service Account                                             │
│ Steps: Basics → URIs → Scopes → Review                          │
│ Flow: client_credentials                                        │
│ Complete: Create service account                                │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > ApplicationCreateWizardContent(variant="serviceAccount", title="New Service Account", backHref="/admin/platform/access/service-accounts", completeLabel="Create service account")

Data: `POST /api/auth/oauth2/create-client` through `createClient(input, { kind: "platform" })`; the action clears the Better Auth active organization before the OAuth client call so a platform service account is not accidentally attached to a stale org session.
Behavior: the service-account variant fixes the OAuth client type to M2M, hides the application type and token-auth choice steps, sends `grant_types: ["client_credentials"]`, and still collects the redirect URI required by Better Auth's registration schema.

## /admin/orgs/:orgId/access/service-accounts

Organization lens for tenant service accounts. Rows are OAuth clients with `grant_types` including `client_credentials` and `reference_id == :orgId`; the active-organization bridge is called only inside the OAuth client action wrapper before Better Auth client endpoints.

```text
┌────────────────────────────────────────────────────────────────┐
│ Service Accounts                                      [+ New]  │
│ Total 3 · System 0 · Tenant 3 · Disabled 0                      │
│ [Search service accounts...]                                    │
│ Name                 Client ID              Type      Scopes    │
│ content worker       cli_content_…          M2M       content:* │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > ApplicationsContent(scope={organization}, variant="serviceAccounts", createHref="/admin/orgs/:orgId/access/service-accounts/new")
  ApplicationsContent uses the organization-scoped SWR key and list/mutate actions; no raw fetch in route files.

Data: `GET /api/auth/oauth2/get-clients` through `listClients({ kind: "organization", organizationId })`, client-side filtered to `reference_id == organizationId` and `client_credentials`; mutations use OAuth client endpoints after the active-org bridge.

## /admin/orgs/:orgId/access/service-accounts/new

Creates a tenant service account in the selected organization. The route org id is passed into the wizard's `scope` prop and the OAuth action sets Better Auth's active organization immediately before calling the OAuth client endpoint.

```text
┌────────────────────────────────────────────────────────────────┐
│ < Service Accounts                                              │
│ New Service Account                                             │
│ Steps: Basics → URIs → Scopes → Review                          │
│ Flow: client_credentials                                        │
│ Complete: Create service account                                │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > ApplicationCreateWizardContent(scope={organization}, variant="serviceAccount", title="New Service Account", backHref="/admin/orgs/:orgId/access/service-accounts", completeLabel="Create service account")

Data: `POST /api/auth/organization/set-active` with `{ organizationId }`, then `POST /api/auth/oauth2/create-client`.
Behavior: the organization route uses the same fixed service-account wizard variant and scopes the OAuth create action to the selected organization before registration.

## /admin/platform/access/admins-roles

Authority view for human principals holding platform/org authority plus delegated admin role bindings from docs/028 §8.10. Role and binding management is backed by the `idAdminDelegation` plugin; this screen currently renders the delegated binding rows alongside the derived platform-admin and organization owner/admin rows.

```text
┌────────────────────────────────────────────────────────────────┐
│ Admins & Roles                                                  │
│ Platform admins 1 · Org authorities 2 · Delegated 1 · Orgs 1    │
│ [Search principals, scopes, or roles...]                        │
│                                                                │
│ Principal            Authority          Scope        Source     │
│ John Doe             Platform Admin     Platform     user.role  │
│ Jane Adams           Org Admin          Acme Corp    member.role│
│ Sam Lee              Registration Mgr   Org org_001 adminRole… │
└────────────────────────────────────────────────────────────────┘
```

Components:
  PageBody > AdminsRolesContent
  AdminsRolesContent renders PageIntro(title="Admins & Roles"), StatGroup(Platform admins, Org authorities, Delegated, Organizations), a standalone SearchInput panel, and a separate DataTable panel with zero padding when rows are present so the table matches Users and Organizations.

Data: Composed from Better Auth and delegated-admin plugin endpoints: `GET /api/auth/admin/list-users?filterField=role&filterValue=admin&filterOperator=eq`, `GET /api/auth/organization/list`, `GET /api/auth/organization/list-members?organizationId=:orgId`, `GET /api/auth/admin/delegation/roles`, `GET /api/auth/admin/delegation/bindings`, and `GET /api/auth/admin/get-user?id=:userId` for member/delegated user enrichment.
Behavior: organization authority rows display the organization name and slug; delegated binding rows display the role label, principal, typed scope, and `adminRoleBinding` source. Raw organization IDs remain searchable but are not shown as the secondary label for membership-derived rows.
