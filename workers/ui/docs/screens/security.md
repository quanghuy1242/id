# Security Screens

## Component registry (all implemented)

Same component set as identity.md and oauth.md. All components exist in `@idco/ui`.

**Mobile patterns:** See identity.md "Mobile patterns" section — FilterDropdown folding via MobileFilterMenu, breadcrumb via ResponsiveBreadcrumb, visibility props on Button/LinkButton.

Covers platform security routes under `/admin/platform/security/**` plus the bounded org consent route under `/admin/orgs/:orgId/security/consents`. Legacy `/admin/security/**` URLs are proxy redirects only; the old route files have been removed. Sessions, token audit, JWKS, and introspection remain platform-only.

Box-drawing key: ┌─┐ top · └─┘ bottom · ├─┤ mid · │ vertical · ↕ sortable · ▸ active · ● on · ○ off · ✓ yes · ✗ no

## Unified grants section (docs/027 §6)

Sessions, access tokens, refresh tokens, and consents are facets of one concept (live grants), with Signing Keys (JWKS) and the standards-based Token Decoder as siblings. Under Track A these are canonical platform routes and the shell's mobile route tabs own section-level navigation:

```
Sessions · Access Tokens · Refresh Tokens · Consents · Signing Keys · Token Decoder
```

The two token tabs share `/admin/platform/security/tokens` and are distinguished by the `?type=access|refresh` query param. The legacy `/admin/oauth/sessions-tokens` route redirects to `/admin/platform/security/sessions`. All data comes from the read-only `admin-audit` aggregate endpoints — no token bodies or private keys are ever returned.

---

## /admin/security/sessions

Live audit of interactive browser sign-ins, with a stats header and a server-paginated table.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ Grants & Keys                                 │
│ [ Sessions | Access Tokens | Refresh Tokens | Consents | Signing Keys ]│
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌ Total: 24 ┬ Impersonated: 1 ┬ Unique users: 18 ┐ │
│                  │ └───────────┴─────────────────┴──────────────────┘ │
│                  │ [🔍 search by email or IP]                          │
│                  │ ┌──────────────────────────────────────────────┐   │
│                  │ │ User Email ↕   IP   User Agent  Created Exp ⋯ │   │
│                  │ │ john@acme.com  1.2  Mozilla…    01/15  …  [Revoke]│
│                  │ │ bob@corp.com   1.7  Mozilla…  [Impersonated][Revoke]│
│                  │ └──────────────────────────────────────────────┘   │
│                  │  ‹ Prev   Page 1 of 1   Next ›                       │
│                  │ ┌ empty ─ No active browser sessions ─┐              │
│                  │ ┌ error ─ ⚠ Failed to load   [Retry] ─┐             │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  SessionsContent (route tabs from security/layout.tsx)
  Stack(gap="md")
    PageIntro(title="Sessions", description, info)
    StatGroup(columns=3): Stat(Total sessions) Stat(Impersonated, warning if >0) Stat(Unique users)
    Panel > SearchInput(grow, "Search by email or IP…")
    Panel(padding=none) > DataTable<AdminSession>(columns=[userEmail, ipAddress, userAgent, created, expires, actions], pagination)
    Revoke: ConfirmDialog(variant="danger") → revokeAdminSession(session.id) → mutate()

Data: GET /api/auth/admin/list-sessions → { sessions, total, limit, offset }
      POST /api/auth/admin/revoke-session  body: { sessionId }

Behavior:
  - Server-paginated (limit/offset in the SWR key). Search filters the loaded page client-side by email/IP.
  - Impersonated sessions show a warning Badge; revoke signs the user out immediately.
  - Session rows never include Better Auth session tokens; the auth worker resolves the token from `sessionId` before deleting it.

States: loading → Skeleton | empty → EmptyState("No active browser sessions") | error → ErrorAlert(onRetry=mutate)

---

## /admin/security/tokens

Live audit of OAuth tokens, with a type filter that is URL-addressable (`?type=access|refresh`).

```
┌───────────────────────────────────────────────────────────────────────┐
│ [ Sessions | Access Tokens | Refresh Tokens | Consents | Signing Keys ]│
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌ Access tokens: 12 ┬ Clients: 5 ┐                  │
│                  │ └───────────────────┴────────────┘                  │
│                  │ [Type ▾ Access]   [🔍 search by client or user]     │
│                  │ ┌──────────────────────────────────────────────┐   │
│                  │ │ Type   Client    User    Token   Scopes  Exp │   │
│                  │ │ access Content   john@    a1b2…   [rd]    01/16│  │
│                  │ └──────────────────────────────────────────────┘   │
│                  │  Token values are never exposed — 8-char prefix only.│
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  TokensContent (route tabs from security/layout.tsx)
  Stack(gap="md")
    PageIntro(title="Access Tokens" | "Refresh Tokens", description, info)
    StatGroup(columns=2): Stat(token count, primary) Stat(Clients)
    Panel > Inline > FilterDropdown(Type: access|refresh) + SearchInput
    Panel(padding=none) > DataTable<AdminToken>(columns=[type, client, user, tokenPrefix, scopes, expires], pagination)
    Text(caption, "Token values are never exposed — only an 8-character prefix is shown.")

Data: GET /api/auth/admin/list-tokens?type=access|refresh → { tokens, total, limit, offset }

Behavior:
  - The route owns `type` from the `?type` query param; changing the FilterDropdown pushes `/admin/security/tokens?type=…`. `type` + page window are in the SWR key. Search filters the loaded page by client/user.
  - The two route tabs (Access Tokens, Refresh Tokens) both target this route with different `?type`.

States: loading → Skeleton | empty → EmptyState("No active access/refresh tokens") | error → ErrorAlert(onRetry=mutate)

---

## /admin/security/jwks

Signing-key list with lifecycle stats, a table, detail navigation, and a guarded emergency rotate action. Only public JWK material is displayed; private key material is never returned or logged.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ Grants & Keys                                  │
│ [ Sessions | Access Tokens | Refresh Tokens | Consents | Signing Keys ]│
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ Signing Keys                         [⟳ Rotate]    │
│                  │ ┌ Total ┬ Active ┬ Rotated ┬ Expired ┐             │
│                  │ │ 3     │ 1      │ 1       │ 1       │             │
│                  │ └───────┴────────┴─────────┴─────────┘             │
│                  │ ┌──────────────────────────────────────────────┐   │
│                  │ │ Key ID ↕        Alg    Status    Created ↕   │   │
│                  │ │ abc123def456    EdDSA  ● Active  01/15       │   │
│                  │ │ xyz789ghi012    EdDSA  ◷ Rotated 12/16       │   │
│                  │ │ old123key456    EdDSA  ○ Expired 12/12       │   │
│                  │ └──────────────────────────────────────────────┘   │
│                  │ ┌ rotate modal: reason required, danger confirm ┐  │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > Suspense > JwksContent
  Stack(gap="md")
    PageIntro(title="Signing Keys", description, info, actions=Button(variant="secondary", iconName="RefreshCw", "Emergency Rotate"))
    StatGroup(columns=4): Stat(Total) Stat(Active, success) Stat(Rotated, warning) Stat(Expired)
    Panel(padding=none) > DataTable<AdminJwk>(columns=[id, alg, status(Badge), createdAt, expiresAt], onRowClick=router.push(`/admin/security/jwks/${kid}`))
    ConfirmDialog(variant="danger", title="Emergency rotate signing keys") > Textarea(label="Reason", required)

Data: GET /api/auth/admin/jwks → { keys: AdminJwk[] }
      POST /api/auth/admin/jwks/rotate body: { reason } → AdminJwk & { reason }
      AdminJwk shape: { id, alg, createdAt, expiresAt, status, publicJwk }
      `publicJwk` contains public material only; the endpoint must never return `privateKey` or a private JWK `d` member.

Behavior:
  - Fetch the admin JWKS metadata endpoint and sort active → rotated → expired, newest first within status.
  - Row click navigates to the detail route; list data is reused by the detail route because no per-key GET exists.
  - Emergency rotate calls Better Auth's JWT key creation path, creates a new signing key, keeps prior keys published for the grace window, appends `admin-activity-log` action `jwks.rotate`, then revalidates `adminJwksKey()`.
  - Loading → Skeleton(rows=6); empty → EmptyState("No JWKS keys available"); error → ErrorAlert(onRetry=mutate).

Badge mappings: active → Badge(tone="success", "Active"); rotated → Badge(tone="warning", "Rotated"); expired → Badge(tone="neutral", "Expired").

---

## /admin/security/jwks/:kid

Deep-linkable public-key detail route. The detail route has its own tabs; the security layout hides the section route tabs on nested detail pages.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ‹ Signing Keys                                                        │
│ abc123def456                                      [Active]            │
│ [ Overview | Public JWK | Metrics | Audit ]                           │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ Overview: DescriptionList + [Download public JWK]  │
│                  │ Public JWK: JsonViewer + [Copy] [Download]         │
│                  │ Metrics: EmptyState(per-key usage not collected)   │
│                  │ Audit: DataTable(summary + payload details)        │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  JwksDetailContent(kid, activeTab)
    Header: Inline(LinkButton back, Text(h1 key.id), Badge(status))
    Tabs(items=[Overview, Public JWK, Metrics, Audit])
    Overview: Panel > DescriptionList(columns=2, items=[Key ID, Algorithm, Status, Created, Expires]) + Button(iconName="Download")
    Public JWK: JsonViewer(value=key.publicJwk, action=Inline(Button(Copy), Button(Download)))
    Metrics: EmptyState(message="Per-key usage metrics are not yet collected")
    Audit: ActivityLogContent(targetType="jwks", targetId=kid)

Data: GET /api/auth/admin/jwks → { keys: AdminJwk[] } selected client-side by `kid`.
      GET /api/auth/admin/activity-log?targetType=jwks&targetId=:kid → { entries, total, limit, offset } where new entries include nullable `summary` and structured `details`.

Behavior:
  - Missing `kid` shows ErrorAlert("Signing key not found") with the back button still available.
  - Copy/download serialize `key.publicJwk` only. Private JWK members must not render.

---

## /admin/security/consents

OAuth consent grants across all users in the platform lens. Platform admins can revoke any single consent grant, forcing the user to re-consent on the next authorization request.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ Security Consents  [🔍...]  [Client ▾ All]   │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌── loading ────────────────────────────────────┐ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎  ∎∎∎∎∎∎∎∎∎         │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── consent list ────────────────────────────────┐ │
│                  │ │ User Email ↕      Client ↕       Scopes  Date ↕│ │
│                  │ │ john@acme.com     Content API   [ct:rd] 01/15  │ │
│                  │ │ jane@beta.com     Vendor API    [all]   02/01  │ │
│                  │ │ bob@corp.com      Analytics     [an:rd] 03/10  │ │
│                  │ │ alice@demo.com    Content API   [2 scr] 01/20  │ │
│                  │ │ ─────────────────────────────────────────────── │ │
│                  │ │ 42 consents                                     │ │
│                  │ │   [Prev]   Page 1 of 2   [Next]               │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── empty ──────────────────────────────────────┐ │
│                  │ │        📥  No OAuth consent records           │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── filter-empty ───────────────────────────────┐ │
│                  │ │     📥  No consents for selected client       │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── Revoke modal ────────────────────────────────┐ │
│                  │ │ Revoke consent for john@acme.com?               │ │
│                  │ │ The user will need to re-consent on next        │ │
│                  │ │ authorization request for Content API.           │ │
│                  │ │              [Cancel]    [Revoke]              │ │
│                  │ └───────────────────────────────────────────────┘ │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > Suspense > ConsentsContent
  Stack(gap="md")
    PageHeader
      Inline(justify="between")
        Text(variant="h1", "Consents")
        Inline(gap="sm")
          FilterDropdown(label="Client", options=clientOptions, value=selectedClient, onChange=setSelectedClient)
          SearchInput(placeholder="Search by email...", value=search, onChange=setSearch, grow)

    Panel(padding="none")
      DataTable(
        columns=[userEmail(col), clientName(col), scopes(col), createdAt(sortable)],
        rows=filteredConsents, getRowKey=(c)=>c.id,
        sortBy, sortDirection, onSort,
        pagination={ total, limit, offset, onChange }
        — Per-row: revoke Button(variant="danger", size="sm", onClick=openRevokeModal(consent))
      )
      Loading: Skeleton(rows=5)
      Empty: EmptyState(message="No OAuth consent records")
      Filter-empty: EmptyState(message="No consents for selected client", cta="Clear filter", onCta=clearFilter)
      Error: ErrorAlert(message, onRetry=refetch)

  Revoke modal: ConfirmDialog(title="Revoke Consent", confirmLabel="Revoke", variant="danger", onConfirm)
    Text(variant="body", "The user will need to re-consent on next authorization request.")
    On confirm: POST /api/auth/admin/revoke-consent { clientId, userId }

Data:
  GET /api/auth/admin/list-consents → { consents, total, limit, offset }
    query params: clientId?, limit?, offset?
  POST /api/auth/admin/revoke-consent → { success: boolean }
    body: { clientId, userId }

  OAuthConsent shape: { id, clientId, userId, referenceId?, scopes: string[], createdAt, updatedAt }

Notes:
  - `admin-audit` owns the aggregate endpoint and enriches user email and client name with batched adapter reads.
  - Revoke consent: removes the consent record; user re-prompted on next authz request.

---

## /admin/orgs/:orgId/security/consents

Organization-scoped OAuth consent grants for org-owned clients. This is intentionally narrower than the platform security section: sessions, tokens, JWKS, and token introspection do not render in the organization lens because they require a bounded candidate set or platform-level key authority.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Acme ▸ Consents                                      │
├──────────────────┬────────────────────────────────────────────────────┤
│   (org nav)      │ Consents                                           │
│                  │ [🔍 Search by email…] [Client ▾ All clients]       │
│                  │ ┌──────────────────────────────────────────────┐   │
│                  │ │ User Email       Client        Scopes  Grant │   │
│                  │ │ owner@acme.com   Content API   [read]  01/15 │   │
│                  │ └──────────────────────────────────────────────┘   │
│                  │ ┌ empty ─ No OAuth consent records ─┐             │
│                  │ ┌ revoke modal: client + user grant ┐             │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > ConsentsContent(scope={ kind: "organization", organizationId: orgId })
    Stack(gap="md")
      PageIntro(title="Consents", description, info)
      Panel > Inline(SearchInput + FilterDropdown(Client))
      Panel(padding=none|md) > DataTable<AdminConsent>(columns=[userEmail, clientName, scopes, createdAt, actions], pagination)
      Revoke: ConfirmDialog(variant="danger") → revokeConsent(clientId, userId, organizationId) → mutate()

Data: GET /api/auth/admin/list-consents?organizationId=:orgId&clientId?&limit&offset → { consents, total, limit, offset }
      POST /api/auth/admin/revoke-consent body: { organizationId: orgId, clientId, userId } → { success: true }
      GET /api/auth/oauth2/get-clients after `organization/set-active` → client filter list, client-side filtered to `reference_id == orgId`

Behavior:
  - The endpoint first authorizes the actor for `organizationId`, then bounds reads to clients where `oauthClient.referenceId == organizationId`; an explicit `clientId` outside that set returns an empty page.
  - Revoke verifies the submitted `clientId` is owned by the same organization before deleting the consent row; cross-org revoke returns `404`.
  - The organization nav exposes only Consents under Security. Platform-only security siblings remain hidden in the org lens.

---

## /admin/security/introspect

Standards-based token decoder and RFC 7662 introspection console. Decoding is local and does not prove token validity; introspection calls the existing OAuth2 provider endpoint.

```
┌───────────────────────────────────────────────────────────────────────┐
│ [ Sessions | Access Tokens | Refresh Tokens | Consents | Signing Keys | Token Decoder ] │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ Token Decoder                                      │
│                  │ [ CodeEditor: paste JWT or opaque token ]           │
│                  │ [Type ▾ Access] [Client ID] [Client Secret] [Resource] [Introspect] │
│                  │ ┌ Format ┬ Signing kid ┬ Audience ┐                │
│                  │ │ JWT    │ kid_123     │ content  │                │
│                  │ └────────┴─────────────┴──────────┘                │
│                  │ Decoded Header / Decoded Claims JsonViewer          │
│                  │ Introspection Response JsonViewer + status fields    │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  TokenIntrospectContent
    PageIntro(title="Token Decoder", description, info)
    Panel > Form > CodeEditor(label="Token") + FilterDropdown(Token type hint) + TextInput(Client ID) + TextInput(Client Secret type=password) + TextInput(Resource) + Button(Introspect)
    StatGroup(columns=3): Stat(Format) Stat(Signing kid) Stat(Audience)
    JsonViewer(Decoded Header) + JsonViewer(Decoded Claims) when JWT decode succeeds
    Panel > DescriptionList(Status, Client ID, Token type, Scopes, Expires, Username) + JsonViewer(Introspection Response) after submit

Data: POST /api/auth/oauth2/introspect body: { token, token_type_hint?, client_id?, client_secret?, resource? } → RFC 7662 token introspection response

Behavior:
  - Local JWT decode only splits and base64url-decodes header/claims; it never treats decoded claims as proof of active access.
  - Opaque tokens show Format=Opaque and can still be introspected.
  - Client credentials are used only for the standard introspection request and are not stored in component state after navigation, not logged, and not sent to any repository-specific admin endpoint.

States: empty → Waiting stat | malformed JWT → caption message | introspection error → ErrorAlert | success → DescriptionList + JsonViewer
