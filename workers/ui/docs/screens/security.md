# Security Screens

## Component registry (all implemented)

Same component set as identity.md and oauth.md. All components exist in `@id/ui`.

**Mobile patterns:** See identity.md "Mobile patterns" section — FilterDropdown folding via MobileFilterMenu, breadcrumb via ResponsiveBreadcrumb, visibility props on Button/LinkButton.

Covers routes under `/admin/security`. Platform admin only.

Box-drawing key: ┌─┐ top · └─┘ bottom · ├─┤ mid · │ vertical · ↕ sortable · ▸ active · ● on · ○ off · ✓ yes · ✗ no

---

## /admin/security/jwks

Read-only view of the JSON Web Key Set used for JWT signing. Public information, displayed for admin visibility.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◈ id admin  ▸ Admin ▸ JWKS                                         │
├──────────────────┬────────────────────────────────────────────────────┤
│   (sidebar)      │ ┌── loading ────────────────────────────────────┐ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎                │ │
│                  │ │ ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎                │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── JWKS keys ───────────────────────────────────┐ │
│                  │ │                                                │ │
│                  │ │  ┌─ Active Key ───────────────────────────┐    │ │
│                  │ │  │ kid:  abc123def456                      │    │ │
│                  │ │  │ alg:  EdDSA                             │    │ │
│                  │ │  │ createdAt:  2024-01-15 12:00 UTC        │    │ │
│                  │ │  │ expiresAt:  2025-01-15 12:00 UTC        │    │ │
│                  │ │  │                                        │    │ │
│                  │ │  │ Public JWK:                            │    │ │
│                  │ │  │ ┌──────────────────────────────────┐    │    │ │
│                  │ │  │ │ {                                │    │    │ │
│                  │ │  │ │   "kty": "OKP",                  │    │    │ │
│                  │ │  │ │   "crv": "Ed25519",              │    │    │ │
│                  │ │  │ │   "x": "abc123...",              │    │    │ │
│                  │ │  │ │   "kid": "abc123def456",         │    │    │ │
│                  │ │  │ │   "use": "sig",                  │    │    │ │
│                  │ │  │ │   "alg": "EdDSA"                 │    │    │ │
│                  │ │  │ │ }                                │    │    │ │
│                  │ │  │ └──────────────────────────────────┘    │    │ │
│                  │ │  │                                  [Copy] │    │ │
│                  │ │  └──────────────────────────────────────────┘    │ │
│                  │ │                                                │ │
│                  │ │  ┌─ Rotated Key — expires 2024-02-15 ──────┐    │ │
│                  │ │  │ kid:  xyz789ghi012                       │    │ │
│                  │ │  │ alg:  EdDSA                              │    │ │
│                  │ │  │ expiresAt:  2024-03-01 12:00 UTC (grace) │    │ │
│                  │ │  │ Public JWK:   { "kty": "OKP", ... }     │    │ │
│                  │ │  │                                  [Copy] │    │ │
│                  │ │  └──────────────────────────────────────────┘    │ │
│                  │ │                                                │ │
│                  │ │  ┌─ Expired Key — expired 2024-01-15 ────────┐   │ │
│                  │ │  │ kid:  old123key456                        │   │ │
│                  │ │  │ alg:  EdDSA                              │   │ │
│                  │ │  │ (dimmed panel)                            │   │ │
│                  │ │  │ Public JWK:   { "kty": "OKP", ... }     │   │ │
│                  │ │  │                                 [Copy] │   │ │
│                  │ │  └───────────────────────────────────────────┘   │ │
│                  │ │                                                │ │
│                  │ │ Total: 3 keys (1 active, 1 rotated, 1 expired) │ │
│                  │ └─────────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── empty ──────────────────────────────────────┐ │
│                  │ │     📥  No JWKS keys available                │ │
│                  │ └───────────────────────────────────────────────┘ │
│                  │                                                    │
│                  │ ┌── error ───────────────────────────────────────┐ │
│                  │ │ ⚠ Failed to load JWKS                     Retry│ │
│                  │ └─────────────────────────────────────────────────┘ │
└──────────────────┴────────────────────────────────────────────────────┘
```

Components:
  PageBody > Suspense > JwksContent
  Stack(gap="md")
    PageHeader
      Inline(justify="between")
        Inline(gap="sm")
          Text(variant="h1", "JWKS")
        Inline(gap="sm")
          Badge(tone="info", children="Public")
          Text(variant="caption", "These keys are public — safe to share with resource servers.")

    Stack(gap="md") — one Panel per key
      Active key:
        Panel(tone="base")
          Stack(gap="sm")
            Grid(columns="two")
              Text(variant="caption", "Key ID") + Text(variant="body", key.id, mono)
              Text(variant="caption", "Algorithm") + Text(variant="body", key.alg || "EdDSA")
              Text(variant="caption", "Created") + Text(variant="body", formatDate(key.createdAt))
              Text(variant="caption", "Expires") + Text(variant="body", formatDate(key.expiresAt || "Never"))
            CodeBlock(label="Public JWK", value=JSON.stringify(key.publicJwk, null, 2), action=Button(size="sm", variant="secondary", iconName="Copy", onClick=copyKey(key.id), "Copy"))
        — If key is active (createdAt most recent, expiresAt in future): Badge(tone="success", "Active")
        — If key is in grace period (expired but within grace window): Badge(tone="warning", "Rotated")
        — If key is fully expired: Panel tone="muted", Badge(tone="neutral", "Expired")
        — Expired keys: dimmed Panel with tone="muted"

      Loading: Skeleton(rows=6, height="md")
      Empty: EmptyState(message="No JWKS keys available")
      Error: ErrorAlert(message, onRetry=refetch)

Data: GET /api/auth/admin/jwks → { keys: AdminJwk[] }
      AdminJwk shape: { id, alg, createdAt, expiresAt, status, publicJwk }
      — `publicJwk` contains public material ONLY: { kid, kty, crv, x, use, alg } for EdDSA/Ed25519.
      — The endpoint must never return `privateKey` or a private JWK `d` member.

Behavior:
  - Fetch the admin JWKS metadata endpoint (`GET /api/auth/admin/jwks`) and parse the `keys` array.
  - Copy button: `navigator.clipboard.writeText(JSON.stringify(key.publicJwk, null, 2))`.
  - This is a read-only informational page. No mutations.
  - The JWKS route returns `application/json` with `{ keys: [...] }` per RFC 7517.

Badge mappings (per-key status — ENRICHED only, needs the admin endpoint above):
  active → Badge(tone="success", "Active")
  rotated (in grace period) → Badge(tone="warning", "Rotated")
  expired → Badge(tone="neutral", "Expired")

Notes:
  - Better Auth JWT plugin handles key rotation automatically (config in `auth/config.ts`).
    Rotation interval: JWKS_ROTATION_INTERVAL_SECONDS (86400s = 24h).
    Grace period: JWKS_GRACE_PERIOD_SECONDS (1209600s = 14d).
  - The admin page does NOT rotate keys — that's automatic.
  - No private keys are exposed. Only public JWK material is shown.

---

## /admin/security/consents

Read-only view of OAuth consent grants across all users.

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
    On confirm: POST /api/auth/oauth2/revoke-consent { clientId, userId }

Data:
  — Note: No admin endpoint to list all consents exists in the current API.
    The `oauthConsent` table stores per-user, per-client consent records.
    **This screen requires a new aggregate admin endpoint.**
    Document as "API Gap" for first implementation.
    Options: (a) placeholder page with "Coming soon",
    (b) implement admin consent list endpoint reading from D1 `oauthConsent` table,
    (c) per-user consent lookup.

  If/when available:
    GET /api/auth/admin/list-consents → { consents: OAuthConsent[] }
      query params: clientId?, limit?, offset?
    POST /api/auth/oauth2/revoke-consent → { success: boolean }
      body: { clientId, userId }

  OAuthConsent shape: { id, clientId, userId, referenceId?, scopes: string[], createdAt, updatedAt }

Notes:
  - This screen is deferred — it requires API support that doesn't exist yet.
  - First implementation: show "Coming Soon" placeholder with description.
  - Future: list all consents with client-side filtering by client and user email.
  - User email lookup: requires join with `user` table. Without join, display userId.
  - Revoke consent: removes the consent record; user re-prompted on next authz request.
  - For now the route file renders a simple placeholder Panel:
    ```
    PageBody
      PageHeader > Text(variant="h1", "Consents")
      Panel > Text(variant="body", "Consent management is coming soon. The consent viewer will show all OAuth authorization grants across all users and clients.")
    ```
