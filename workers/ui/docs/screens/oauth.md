# OAuth Screens

## Component registry (all implemented)

All components exist in `@idco/ui` with the exact props described in this spec:
`AppShell`, `Topbar`, `TopbarStart`, `TopbarEnd`, `TopbarBrandLink`, `TopbarBreadcrumb`, `TopbarAvatarMenu`,
`Sidebar`, `SidebarLayout`, `MainContent`, `MobileDock`,
`PageHeader`, `PageBody`, `PageSection`, `Panel`, `Stack`, `Inline`, `Grid`, `Columns`, `Spacer`,
`NavMenu`, `NavSection`, `NavLink`, `DockLink`, `NavTitle`,
`Text`, `Heading`,
`Button`, `LinkButton`, `TextInput`, `RadioGroup`, `Avatar`, `Alert`, `Badge`, `Skeleton`, `EmptyState`,
`ErrorAlert`, `SearchInput`, `FilterDropdown`, `Tabs`, `ConfirmDialog`, `DataTable`, `Textarea`,
`MobileFilterMenu`, `ResponsiveBreadcrumb`, `MenuTrigger`/`Menu`/`MenuItem`.

**Icon names registered in nav-icons.tsx:** See identity.md for full list. Add new icons to `iconMap` before using.

**Mobile patterns:** See identity.md "Mobile patterns" section — FilterDropdown folding via MobileFilterMenu, breadcrumb via ResponsiveBreadcrumb, action folding via MenuTrigger, visibility props on Button/LinkButton.

Covers OAuth application screens under `/admin/platform/oauth/**` and `/admin/orgs/:orgId/oauth/**`, plus Access-owned Resource APIs, Scope Catalog, and M2M Bindings under `/admin/platform/access/**` and `/admin/orgs/:orgId/access/**`. Legacy `/admin/oauth/**` URLs are proxy redirects only; the old route files have been removed.

Box-drawing key: ┌─┐ top · └─┘ bottom · ├─┤ mid · │ vertical · ↕ sortable · ▸ active · ● enabled · ○ disabled · ⊙ disabled

---

## /admin/oauth (legacy redirect → /admin/platform/oauth/applications)

The OAuth section root is a legacy entry URL. `/admin/platform/oauth/applications` is the canonical platform application index so the list always gets the route-backed detail navigation and create wizard.

Components:
  Proxy redirect: `/admin/oauth` → `/admin/platform/oauth/applications`

Data: none.

Behavior:
  - Old links and bookmarks to `/admin/oauth` redirect to `/admin/platform/oauth/applications`.
  - Desktop and mobile navigation both link directly to `/admin/platform/oauth/applications`.

---

## /admin/oauth/applications

Lists OAuth2 client applications registered through the OAuth Provider plugin. The enriched version uses a stats header, row navigation to a detail route, and a dedicated create-wizard route.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ OAuth Applications        [🔍...]  [+ New App] │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌── loading ────────────────────────────────────┐ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎         │ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎         │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── client list ─────────────────────────────────┐ │
│                  │ │ Name ↕         Client ID              Type   ↕ │ │
│                  │ │ Content API     cli_contentapi_...   M2M       │ │
│                  │ │ Admin Client    cli_adminapp_...     Public    │ │
│                  │ │ Vendor Portal   cli_portal_...       Confidntl │ │
│                  │ │ ─────────────────────────────────────────────── │ │
│                  │ │ Content API     cli_contentapi_...   M2M       │ │
│                  │ │   ↳ Reference: org_001 (Acme Corp)             │ │
│                  │ │   ↳ Client Secret ⋯⋯⋯⋯ [Rotate]               │ │
│                  │ │   [Edit]                                  [×]  │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── empty ──────────────────────────────────────┐ │
│                  │ │          📥  No OAuth applications            │ │
│                  │ │               [Create Application]            │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Create App modal ───────────────────────────┐ │
│                  │ │ Create OAuth Application                     │ │
│                  │ │ Name      [Content API            ]           │ │
│                  │ │ Type      ● Confidential  ○ Public  ○ M2M    │ │
│                  │ │ Auth      ● client_secret_post ○ basic       │ │
│                  │ │ Grant     ☑ auth_code  ☑ refresh   ☐ M2M    │ │
│                  │ │ Rspnse    ☑ code                                  │ │
│                  │ │ Scopes    [openid profile content:read     ]  │ │
│                  │ │ Redirects [https://app.example.com/callback ]  │ │
│                  │ │ Post-Logout[https://app.example.com/logged-out]│ │
│                  │ │ URI       [https://app.example.com        ]  │ │
│                  │ │ Logo URI  [https://app.example.com/logo.png]  │ │
│                  │ │ TOS URI   [https://app.example.com/tos    ]  │ │
│                  │ │ Policy URI[https://app.example.com/privacy ]  │ │
│                  │ │ Contacts  [admin@example.com             ]  │ │
│                  │ │                               [Cancel] [Create]│
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Edit App modal ───────────────────────────────┐ │
│                  │ │ Edit Content API                               │ │
│                  │ │ (Same fields as create, pre-filled)            │ │
│                  │ │                                [Cancel] [Save] │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Rotate Secret modal ──────────────────────────┐ │
│                  │ │ ⚠ Rotate Client Secret for Content API         │ │
│                  │ │ This invalidates the current secret immediately.│ │
│                  │ │ Make sure to update your application config.    │ │
│                  │ │                                               │ │
│                  │ │ New secret (shown once — copy now):            │ │
│                  │ │ ┌───────────────────────────────────────┐      │ │
│                  │ │ │ sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   │      │ │
│                  │ │ └───────────────────────────────────────┘      │ │
│                  │ │                            [Close] [Copy]     │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Delete modal ────────────────────────────────┐ │
│                  │ │ ⚠ Delete Content API?                        │ │
│                  │ │ This will remove the OAuth application and    │ │
│                  │ │ invalidate all tokens issued for this client.  │ │
│                  │ │ All app integrations using this client will    │ │
│                  │ │ stop working.                                  │ │
│                  │ │              [Cancel]    [Delete Application]  │ │
│                  │ └───────────────────────────────────────────────┘ │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > Suspense(fallback=<ApplicationsContent loading />)
    ApplicationsContent
    Stack(gap="md")
      PageIntro(title="OAuth Applications", actions=LinkButton(href="/admin/oauth/applications/new", iconName="Plus", "New App"))
      StatGroup(columns=4): Stat(Total) Stat(Confidential) Stat(Public) Stat(M2M)
      Panel > SearchInput(placeholder="Search applications...", value=search, onChange, grow)

      Stack(gap="sm") — one Panel per client, each expandable:
        Panel(tone="muted", padding="sm")
          Inline(justify="between")
            Inline(gap="sm")
              Text(variant="body", children=client.client_name)
              Badge(tone=typeBadge[clientType(client)], children=typeLabel[clientType(client)])
              Badge(tone="neutral", children=client.client_id) — truncated, first 16 chars
            Inline(gap="sm")
              Button(size="sm", variant="secondary", iconName="Pencil", ariaLabel="Edit", onClick=openEdit(client))
              Button(size="sm", variant="danger", iconName="Trash2", ariaLabel="Delete", onClick=openDelete(client))
          Spacer(size="xs")
          Inline(gap="md") — detail row (visible on expand or shown inline for all)
            Text(variant="caption", "Client ID:") + Text(variant="body", client.client_id, mono)
          Text(variant="caption", "Secret:") + Text(variant="body", "⋯⋯⋯⋯", mono)
          Button(size="sm", variant="secondary", iconName="RefreshCw", onClick=openRotate(client), "Rotate")
          Text(variant="caption", "Redirect URIs:") + Text(variant="body", (client.redirect_uris ?? []).join(", "))
          Text(variant="caption", "Scopes:") + Inline(gap="xs") > scopeBadges (from client.scope.split(" "))
          Text(variant="caption", "Grant Types:") + Inline(gap="xs") > grantBadges (from client.grant_types)

  Representation note (the API boundary is snake_case — do NOT use the DB camelCase):
    - GET /api/auth/oauth2/get-clients returns **OAuth2-formatted (snake_case)** objects — `client_id`,
      `client_name`, `redirect_uris`, `post_logout_redirect_uris`, `grant_types`, `response_types`,
      `token_endpoint_auth_method`, `client_uri`, `logo_uri`, `contacts`, `tos_uri`, `policy_uri`,
      `software_id`, `software_version`, `software_statement`, and `scope` (a **space-delimited string**,
      not an array). create-client / update-client use the same snake_case (RFC 7591). List/detail rendering
      and modal form `name=` attributes are therefore ALL snake_case.
    - The underlying `oauthClient` D1 table is camelCase (`clientId`, `name`, `redirectUris`, …), but that
      shape is NOT what any OAuth2 endpoint returns. Do not read camelCase fields off the API response.
    - There is no confidential/public/M2M `type` enum. `clientType(client)` is derived:
      M2M if `grant_types` includes `"client_credentials"`; else Public if
      `token_endpoint_auth_method === "none"`; else Confidential.

      Empty: EmptyState(message="No OAuth applications", cta="Create Application", ctaHref="/admin/oauth/applications/new")

  Create: route to `/admin/oauth/applications/new`. The list surface must not open the legacy create modal.

  Edit modal: ConfirmDialog(title="Edit Application", confirmLabel="Save", onConfirm)
    — Same fields as create, pre-filled. client_id and client_secret NOT editable.
    On confirm: POST /api/auth/oauth2/update-client { client_id, update: { client_name?, scope?, redirect_uris?, ... } }
      — The mutable fields are nested under `update:` (NOT `data:`). `scope` is a space-delimited string.

  Rotate Secret modal: ConfirmDialog(title="Rotate Client Secret", confirmLabel="Rotate", variant="danger", onConfirm)
    — After confirm, show the new secret in a monospace Panel with copy button.
    On confirm: POST /api/auth/oauth2/client/rotate-secret { client_id }
    — On success: Better Auth returns the OAuth client object with a one-time `client_secret`; render that value in a `<Text variant="body">` with monospace font.
      Add Button(variant="primary", onClick=copy, "Copy") — copy to clipboard via navigator.clipboard.writeText.

  Delete modal: ConfirmDialog(title="Delete Application", confirmLabel="Delete", variant="danger", onConfirm)
    On confirm: POST /api/auth/oauth2/delete-client { client_id }

Data: GET /api/auth/oauth2/get-clients → OAuthClient[] | null  (OAuth2-formatted, snake_case; UI action normalizes null to [])
      POST /api/auth/oauth2/create-client → { client_id, client_secret, ... }  (snake_case)
        body (flat snake_case; redirect_uris REQUIRED and non-empty): { client_name?, token_endpoint_auth_method?, scope?, redirect_uris[], grant_types?[], response_types?[], post_logout_redirect_uris?[], client_uri?, logo_uri?, tos_uri?, policy_uri?, contacts?[], type? }
        — There is no accepted `public` field on this public Better Auth route. Public is derived by Better Auth from `token_endpoint_auth_method: "none"`; see clientType derivation above. To create an M2M client send grant_types: ["client_credentials"] and still send one registered redirect URI because the route schema requires it.
        — Optional array fields with Better Auth `min(1)` schemas (`post_logout_redirect_uris`, `contacts`) are omitted when empty; do not send `[]`.
      POST /api/auth/oauth2/update-client → OAuthClient
        body: { client_id, update: { client_name?, scope?, redirect_uris?, ... } }  (mutable fields under `update:`, NOT `data:`)
        — `redirect_uris`, `post_logout_redirect_uris`, and `contacts` are optional but non-empty when present. The public update route does not accept `token_endpoint_auth_method`.
      POST /api/auth/oauth2/client/rotate-secret → OAuthClient with `client_secret`
        body: { client_id }
      POST /api/auth/oauth2/delete-client → empty success body
        body: { client_id }

OAuthClient shape (the OAuth2-formatted response from get-clients/create/update — **snake_case**):
  { client_id, client_secret?, client_name, redirect_uris: string[], post_logout_redirect_uris?: string[],
    grant_types: string[], response_types: string[], token_endpoint_auth_method, scope: string (space-delimited),
    client_uri?, logo_uri?, contacts?: string[], tos_uri?, policy_uri?, software_id?, software_version?,
    software_statement? }
  — `scope` is a SPACE-DELIMITED STRING, not an array — split on " " to render scope badges.
  — `client_secret` is only present in create/rotate responses (and may be absent for public clients), never re-fetched by get-clients.
  — The underlying `oauthClient` D1 table is camelCase (`clientId`, `name`, `redirectUris`, `grantTypes`,
    `public`, `disabled`, `referenceId`, …); that is the storage shape, NOT the API response shape.

Behavior:
  - No server-side search; full client list fetched once. Client-side search filters by client_name and clientId.
  - Row click navigates to `/admin/oauth/applications/:clientId`; inline action buttons remain available for edit, secret rotation, and delete.
  - Expand rows: each Panel is a card showing summary + detail fields. Or use a table with row expansion.
  - type labels: "confidential" → "Confidential", "public" → "Public", M2M ("client_credentials" in grantTypes) → "M2M"
  - Badge tones for type: M2M→"accent", Confidential→"neutral", Public→"info"
  - Secret rotation: show new secret once, auto-hide on modal close.
  - The OAuth Provider's create-client response includes client_secret. Show modal after creation.
  - Delete: no confirmation slug/email required; regular ConfirmDialog with danger variant.

Badge mappings:
  type: "confidential"→Badge(tone="neutral"), "public"→Badge(tone="info"), M2M→Badge(tone="accent")
  disabled: true→Badge(tone="error", children="Disabled"), false→(no badge)

---

## /admin/oauth/applications/:clientId

Deep-linkable OAuth client detail route backed by `GET /api/auth/oauth2/get-clients` and selected client-side by `client_id`.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ‹ OAuth Applications                                                  │
│ Content API                       [M2M] cli_contentapi_a1b2…          │
│ [ Overview | Credentials | URIs | Scopes & Grants | Connections | Quickstart | Audit ] │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ Overview: DescriptionList for type, status, auth   │
│                  │ Credentials: client_id copy + secret rotation note │
│                  │ URIs: redirect and post-logout URI lists           │
│                  │ Scopes & Grants: scope/grant badges                │
│                  │ Connections: effective-access stats + M2M bindings │
│                  │ Quickstart: authorize/token/discovery snippets     │
│                  │ Audit: DataTable(summary + payload details)        │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  ApplicationDetailContent(clientId, activeTab)
    Header: LinkButton back + Text(h1 client.client_name) + Badge(clientType) + Text(client_id, mono)
    Tabs(items=[Overview, Credentials, URIs, Scopes & Grants, Connections, Quickstart, Audit])
    Overview: Panel > DescriptionList(columns=2)
    Credentials: Panel > DescriptionList(client_id, token_endpoint_auth_method, public/confidential) + copy button
    URIs: Panel > DescriptionList(redirect_uris, post_logout_redirect_uris)
    Scopes & Grants: Panel > Inline(Badge scopes) + Inline(Badge grants)
    Connections: StatGroup(Resource APIs, Allowed Scopes, Requested Covered, Disabled Bindings) + ApplicationConnectionsContent(clientId) filtering `listBindings()`
    Quickstart: CodeBlock snippets derived from `client_id`
    Audit: ActivityLogContent(targetType="oauth_client", targetId=clientId)

Data: GET /api/auth/oauth2/get-clients → OAuthClient[] | null (UI action normalizes null to []); GET /api/auth/admin/oauth-client-resource-scopes → { oauthClientResourceScopes: ClientResourceScope[] }; GET /api/auth/admin/resource-servers → { resourceServers: ResourceServer[] }; GET /api/auth/admin/activity-log?targetType=oauth_client&targetId=:clientId → { entries, total, limit, offset } where new entries include nullable `summary` and structured `details`.

Behavior:
  - Missing `clientId` shows ErrorAlert("Application not found").
  - Secret value is never displayed except the existing one-time create/rotate modal; credentials tab only states whether a secret exists.
  - The Connections tab composes the client's default `scope` with active M2M bindings' `allowedScopes` so admins can see effective resource access without issuing a test token.
  - Edit uses POST `/api/auth/oauth2/update-client` with `{ client_id, update }`. Optional array fields are sent only when non-empty because Better Auth rejects `[]` for fields with `min(1)`; clearing existing `post_logout_redirect_uris` or `contacts` is not supported through this public update route.

---

## /admin/oauth/applications/new

Dedicated OAuth application creation wizard over the existing `POST /api/auth/oauth2/create-client` endpoint. `type` remains UI-only and is translated to standard OAuth client metadata.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ‹ OAuth Applications                                                  │
│ New OAuth Application                                                 │
│ ① Type ─ ② Auth ─ ③ URIs ─ ④ Scopes ─ ⑤ Review                       │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ Step content + [Back] [Next/Create application]    │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  ApplicationCreateWizardContent
    LinkButton back
    Stepper(steps=[Type, Auth, URIs, Scopes, Review])
    Type: RadioGroup(type: confidential | public) + TextInput(name)
    Auth: RadioGroup(token_endpoint_auth_method) for confidential; read-only label for public PKCE
    URIs: UrlListBuilder(redirect_uris) + UrlListBuilder(post_logout_redirect_uris)
    Scopes: ScopeBuilder(suggestions=scope catalog, allowCustom)
    Review: DescriptionList summary
    Secret reveal: existing one-shot ConfirmDialog after create

Data: GET /api/auth/admin/oauth-scopes → suggestions; POST /api/auth/oauth2/create-client → OAuthClient.

Behavior:
  - M2M is not offered from the OAuth application wizard. Machine clients are created from Access → Service Accounts so admins do not mix app and service-account paths.
  - Redirect URIs are required by Better Auth's `/oauth2/create-client` schema for every client registration.
  - Public clients force `token_endpoint_auth_method: "none"`; confidential clients select `client_secret_post` or `client_secret_basic`.

---

## /admin/oauth/resource-apis

CRUD for OAuth resource servers (audience definitions for access tokens). The enriched list surfaces lifecycle stats plus the created/updated actor metadata that already exists on the rows.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ OAuth Resource APIs  [🔍...]  [+ New API]    │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌── loading ────────────────────────────────────┐ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎         │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── resource server list ────────────────────────┐ │
│                  │ │ Name ↕        Slug ↕        Audience  Status ↕ │ │
│                  │ │ Content API   content-api  https://.. ▸ Enabled │ │
│                  │ │ Vendor API    vendor-api   https://.. ▸ Enabled │ │
│                  │ │ Analytics     analytics    https://.. ⊙ Disabled│ │
│                  │ │ ─────────────────────────────────────────────── │ │
│                  │ │ id System     id-system    https://.. ▸ System  │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── empty ──────────────────────────────────────┐ │
│                  │ │        📥  No resource APIs registered        │ │
│                  │ │             [Register Resource API]           │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Create modal ───────────────────────────────┐ │
│                  │ │ Register Resource API                        │ │
│                  │ │ Name      [Content API             ]          │ │
│                  │ │ Slug      [content-api             ]          │ │
│                  │ │ Audience  [https://content-api.example.com]   │ │
│                  │ │ Description[Main content API       ]          │ │
│                  │ │ Organization ○ System (id-owned)              │ │
│                  │ │               ● Acme Corp                    │ │
│                  │ │              [Cancel]    [Register]           │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Edit modal ───────────────────────────────────┐ │
│                  │ │ Edit Resource API                             │ │
│                  │ │ (Same as create, organization not changeable)  │ │
│                  │ │                                [Cancel] [Save] │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Disable modal ────────────────────────────────┐ │
│                  │ │ Disable Content API?                           │ │
│                  │ │ Tokens with this audience will be rejected.     │ │
│                  │ │              [Cancel]    [Disable]              │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Delete modal ────────────────────────────────┐ │
│                  │ │ ⚠ Delete Content API?                         │ │
│                  │ │ This removes the resource server and ALL       │ │
│                  │ │ associated OAuth scopes.                       │ │
│                  │ │ All tokens issued for this audience will be    │ │
│                  │ │ invalidated.                                    │ │
│                  │ │              [Cancel]    [Delete]              │ │
│                  │ └───────────────────────────────────────────────┘ │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > Suspense > ResourceApisContent
  Stack(gap="md")
    Panel > Inline(justify="between")
      Text(variant="h2", "Resource APIs")
      Inline(gap="sm")
        SearchInput(placeholder="Search resource APIs...", value=search, onChange, grow)
        Button(variant="primary", iconName="Plus", onClick=openCreateModal, "Register API")

    Panel(padding="none")
      DataTable(
        columns=[name(sortable), slug, audience(col), status(col), updatedBy/updatedAt(col), description(col)],
        rows=filteredServers, getRowKey=(rs)=>rs.id,
        onRowClick=openDetail or navigate,
        sortBy, sortDirection, onSort
      )
      Loading: Skeleton(rows=4)
      Empty: EmptyState(message="No resource APIs registered", cta="Register Resource API", onCta=openCreateModal)
      Error: ErrorAlert(message, onRetry=refetch)
      Search-empty: EmptyState(message="No resource APIs match your search", cta="Clear search", onCta=clearSearch)

  Create modal: ConfirmDialog(title="Register Resource API", confirmLabel="Register", onConfirm)
    TextInput(label="Name", name="name", required)
    TextInput(label="Slug", name="slug", required)
    TextInput(label="Audience URL", name="audience", required)
    TextInput(label="Description", name="description")
    RadioGroup(title="Organization", name="organizationId", options=orgOptions, value=selectedOrgId, onChange=setSelectedOrgId)
    On confirm: POST /api/auth/admin/resource-servers { name, slug, audience, description?, organizationId? }

  Edit modal: ConfirmDialog(title="Edit Resource API", confirmLabel="Save", onConfirm)
    TextInput(label="Name", name="name", defaultValue=rs.name, required)
    TextInput(label="Slug", name="slug", defaultValue=rs.slug, required) — validate uniqueness on blur if changed
    TextInput(label="Audience URL", name="audience", defaultValue=rs.audience, required)
    TextInput(label="Description", name="description", defaultValue=rs.description||"")
    On confirm: PATCH /api/auth/admin/resource-servers/{id} { slug?, name?, audience?, description? }
      — Flat body (NOT wrapped in `data:`). This plugin uses a strict flat schema, unlike the BA
        admin/organization update endpoints in identity.md which wrap payloads in `data:`.

  Disable: ConfirmDialog(title="Disable API", confirmLabel="Disable", variant="danger", onConfirm)
      On confirm: POST /api/auth/admin/resource-servers/{id}/disable { }  (no body)

  Activate: ConfirmDialog(title="Activate API", confirmLabel="Activate", onConfirm)
      On confirm: POST /api/auth/admin/resource-servers/{id}/enable { }  (no body)
    — PATCH still does not accept `enabled`; status transitions use explicit status endpoints.

  Delete modal: ConfirmDialog(title="Delete Resource API", confirmLabel="Delete", variant="danger", onConfirm)
    On confirm: DELETE /api/auth/admin/resource-servers/{id}

Data: GET /api/auth/admin/resource-servers → { resourceServers: ResourceServer[] }
      POST /api/auth/admin/resource-servers → ResourceServer
        body: { name, slug, audience, description?, organizationId? }
      GET /api/auth/admin/resource-servers/{id} → ResourceServer
      PATCH /api/auth/admin/resource-servers/{id} → ResourceServer
        body: { slug?, name?, audience?, description? }  (flat; description may be null to clear)
      DELETE /api/auth/admin/resource-servers/{id} → { deleted: true }
      POST /api/auth/admin/resource-servers/{id}/disable → ResourceServer
      POST /api/auth/admin/resource-servers/{id}/enable → ResourceServer

ResourceServer shape: { id, organizationId, slug, name, audience, description?, enabled, createdBy, updatedBy, disabledAt?, disabledBy?, createdAt, updatedAt }
  — Timestamps (createdAt, updatedAt, disabledAt) are **epoch milliseconds (numbers)**, not ISO strings —
    unlike identity.md's `User` whose timestamps are ISO strings. The same applies to OAuthResourceScope and
    OAuthClientResourceScope below. Use `new Date(ms)` for display.

Behavior:
  - No server-side pagination; fetch full list once. Client-side search by name/slug.
  - Status column: enabled→"Enabled" Badge(tone="success"), disabled→"Disabled" Badge(tone="error")
  - Status action: enabled rows show Disable; disabled rows show Activate.
  - System resource servers (organizationId IS NULL, slug = "id-system") show "System" badge.
  - Organization dropdown in create: fetch organization list, show "System (id-owned)" + org options.
  - Slug validation on blur: check uniqueness via check-slug if slug changed in edit.
  - Row click: navigate to detail view (or show inline expand/edit if we keep it simple).
  - Row/detail surfaces show `createdBy`, `updatedBy`, `createdAt`, and `updatedAt`. The Audit tab reads `targetType="resource_server"`, `targetId=resourceServer.id`.

Badge mappings:
  enabled: true→Badge(tone="success", "Enabled"), false→Badge(tone="error", "Disabled")
  organizationId: null→Badge(tone="accent", "System")

---

## /admin/oauth/resource-apis/:resourceServerId

Resource API detail route with Overview and Audit tabs over existing list endpoints.

```
‹ Resource APIs
Content API  [Enabled] [System]
[ Overview | Audit ]
Overview: DescriptionList(name, slug, audience, status, created/updated by)
Audit: DataTable(summary + payload details, targetType="resource_server", targetId=:resourceServerId)
```

Components:
  ResourceApiDetailContent(resourceServerId, activeTab)
    Header(LinkButton back, Text(h1), Badge status)
    Tabs(Overview, Audit)
    Overview: Panel > DescriptionList(columns=2)
    Audit: ActivityLogContent(targetType="resource_server", targetId=resourceServerId)

Data: GET /api/auth/admin/resource-servers → select by id; GET /api/auth/admin/activity-log?targetType=resource_server&targetId=:resourceServerId → { entries, total, limit, offset } where new entries include nullable `summary` and structured `details`.

---

## /admin/oauth/scope-catalog

CRUD for OAuth scopes bound to resource servers. Enriched with `StatGroup`, `ScopeBuilder` filters, and a CSV bulk import convenience over the existing per-scope create endpoint.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ OAuth Scope Catalog  [🔍...]  [+ New Scope]  │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌── loading ────────────────────────────────────┐ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎         │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── scope list ──────────────────────────────────┐ │
│                  │ │ Scope ↕          Resource API     Status Desc ↕│ │
│                  │ │ content:read     Content API   ▸ Enabled  Read │ │
│                  │ │ content:write    Content API   ▸ Enabled  Write│ │
│                  │ │ content:admin    Content API   ⊙ Disabled Admin│ │
│                  │ │ vendor:read      Vendor API    ▸ Enabled  Read │ │
│                  │ │ ─────────────────────────────────────────────── │ │
│                  │ │ content:read     Content API   ▸ Enabled  Read │ │
│                  │ │   ↳ Package: content:read, content:write        │ │
│                  │ │   [Edit]  [× Delete]                            │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── empty ──────────────────────────────────────┐ │
│                  │ │        📥  No OAuth scopes defined            │ │
│                  │ │             [Create Scope]                     │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Create modal ───────────────────────────────┐ │
│                  │ │ Create OAuth Scope                           │ │
│                  │ │ Resource API │ Content API (content-api) ▾    │ │
│                  │ │ Scope        [content:read           ]        │ │
│                  │ │ Description  [Read access to content  ]        │ │
│                  │ │                              [Cancel] [Create] │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Edit modal ───────────────────────────────────┐ │
│                  │ │ Edit OAuth Scope                              │ │
│                  │ │ (Same as create; scope string not changeable)   │ │
│                  │ │                                [Cancel] [Save] │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Delete modal ────────────────────────────────┐ │
│                  │ │ ⚠ Delete Scope content:read?                   │ │
│                  │ │ All existing client-resource-scope bindings    │ │
│                  │ │ referencing this scope will be invalid.        │ │
│                  │ │              [Cancel]    [Delete Scope]        │ │
│                  │ └───────────────────────────────────────────────┘ │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > Suspense > ScopeCatalogContent
  Stack(gap="md")
    StatGroup(columns=4): Total, Disabled, Resource APIs, Updated 7d
    Panel > Inline(justify="between")
      Text(variant="h2", "Scope Catalog")
      Inline(gap="sm")
        SearchInput(placeholder="Search scopes...", value=search, onChange, grow)
        ScopeBuilder(label="Scope filters", suggestions=loaded catalog, allowCustom for prefix filters such as `content:*`)
        Button(iconName="Upload", "Bulk Import") -> ConfirmDialog + FileDropzone CSV preview
        Button(variant="primary", iconName="Plus", onClick=openCreateModal, "New Scope")

    Panel(padding="none")
      DataTable(
        columns=[scope(sortable), resourceServer(col), status(col), description(col)],
        rows=filteredScopes, getRowKey=(s)=>s.id,
        onRowClick=openDetail,
        sortBy, sortDirection, onSort
      )
      Loading: Skeleton(rows=4)
      Empty: EmptyState(message="No OAuth scopes defined", cta="Create Scope", onCta=openCreateModal)
      Error: ErrorAlert(message, onRetry=refetch)
      Search-empty: EmptyState(message="No scopes match your search", cta="Clear search", onCta=clearSearch)

  Create modal: ConfirmDialog(title="Create OAuth Scope", confirmLabel="Create", onConfirm)
    FilterDropdown(label="Resource API", options=resourceServerOptions, value=selectedResourceServerId, onChange=setSelectedResourceServerId) — options: [{value:rs.id, label:`${rs.name} (${rs.slug})`}]
    TextInput(label="Scope", name="scope", required, placeholder="content:read")
    Textarea(label="Description", name="description", placeholder="Grants read access to content resources")
    On confirm: POST /api/auth/admin/oauth-scopes { resourceServerId, scope, description? }

  Edit modal: ConfirmDialog(title="Edit OAuth Scope", confirmLabel="Save", onConfirm)

  Bulk import modal: ConfirmDialog(title="Bulk Import Scopes", confirmLabel="Import valid scopes", onConfirm)
    FileDropzone(accept=[".csv","text/csv"])
    Preview rows from CSV shape `scope,resourceServer,description`; resourceServer may be id, slug, or name.

Behavior:
  - Route owns `q`, `sortBy`, and `sortDir` from the URL query string and passes them to `ScopeCatalogContent`; search and sort updates push `/admin/oauth/scope-catalog?...`.
  - CSV import is a repository-specific operator convenience; it loops existing `POST /admin/oauth-scopes` for valid rows after preview. Invalid, duplicate, or unknown-resource rows are skipped and shown in preview.

---

## /admin/oauth/m2m-bindings/:bindingId

M2M binding detail route with Overview and Audit tabs over existing list endpoints.

```
‹ M2M Bindings
Content API -> Content API  [Active]
[ Overview | Audit ]
Overview: client, resource API, scopes, enabled, created/updated by
Audit: DataTable(summary + payload details, targetType="client_resource_scope", targetId=:bindingId)
```

Components:
  M2mBindingDetailContent(bindingId, activeTab)
    Header(LinkButton back, Text(h1), Badge status)
    Tabs(Overview, Audit)
    Overview: Panel > DescriptionList + scope Badge row
    Audit: ActivityLogContent(targetType="client_resource_scope", targetId=bindingId)

Data: GET /api/auth/admin/oauth-client-resource-scopes → select by id; GET /api/auth/oauth2/get-clients and GET /api/auth/admin/resource-servers for labels; GET /api/auth/admin/activity-log?targetType=client_resource_scope&targetId=:bindingId → { entries, total, limit, offset } where new entries include nullable `summary` and structured `details`.

---

## /admin/oauth/sessions-tokens (moved → /admin/security)

The grants surfaces (sessions, tokens, consents) were unified under `/admin/security` per docs/027 §6. This route now permanently redirects to `/admin/security/sessions` so old links and bookmarks do not 404. See `security.md` for the current Sessions / Tokens / Consents / Signing Keys specs.

```
PageBody is owned by /admin/security/layout.tsx (route tabs: Sessions · Access Tokens · Refresh Tokens · Consents · Signing Keys).
/admin/oauth/sessions-tokens/page.tsx → permanentRedirect("/admin/security/sessions")   [Next.js permanent server redirect]
```

Notes:
  - The combined `SessionsTokensContent` (in-page tabs) was split into `SessionsContent` and `TokensContent` (URL-addressable; the token type is a `?type=access|refresh` query param). The OAuth section keeps only Applications / Resource APIs / Scope Catalog / M2M Bindings.
