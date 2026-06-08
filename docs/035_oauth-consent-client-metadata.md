# OAuth Consent Screen Client Metadata (RFC 7591)

> Status: implementation-grade research and proposal
>
> Date: 2026-06-08
>
> Scope:
>
> - `workers/ui/src/app/consent/consent-form.tsx` — the hosted consent screen (today shows a placeholder client name)
> - `workers/core/src/auth/oauth-provider.ts` — the Better Auth OIDC provider wiring (`consentPage: "/consent"`)
> - Better Auth `oidc-provider` plugin — client model and the `/oauth2/consent` flow
> - `workers/core/src/auth/plugins/oauth-scope-catalog/**` — DB-backed scope rows (source of human-readable scope descriptions)
> - `workers/ui/src/app/admin/**` OAuth client screens — where client metadata is managed
>
> Source docs and local evidence:
>
> - [docs/005_oauth2-oidc-integration-guide.md](005_oauth2-oidc-integration-guide.md) — app integration / OAuth flows
> - [docs/026_admin-oauth-security-screens-and-api-contracts.md](026_admin-oauth-security-screens-and-api-contracts.md) — OAuth admin screens and contracts
> - [docs/031_platform-access-control.md](031_platform-access-control.md) — scope catalog as runtime classifier
> - [docs/034_email-templating.md](034_email-templating.md) — sibling "dynamic surface" work (kept separate by design)
> - `node_modules/better-auth/dist/plugins/oidc-provider/schema.mjs` — stored client schema (`name`, `icon`, `metadata`)
> - `node_modules/better-auth/dist/plugins/oidc-provider/index.mjs` — DCR registration accepts the full 7591 set; `/oauth2/consent` is `consent_code`-driven
>
> External references checked on 2026-06-08:
>
> - RFC 7591 — OAuth 2.0 Dynamic Client Registration Protocol (client metadata: `client_name`, `client_uri`, `logo_uri`, `tos_uri`, `policy_uri`, `contacts`, `scope`)
> - RFC 6749 §3.3 / OIDC Core — scope semantics (no human-readable descriptions defined)

## 1. Problem

The consent screen does not show who the user is granting access to. `consent-form.tsx` parses `client_id` out of the OAuth query string and **fabricates** a display name (`name: \`Client ${client_id}\``); it shows raw scope tokens as badges and renders no logo, terms, or privacy links. This also violates the repository rule that client identity must be DB-driven, not derived/hardcoded.

We want the consent screen to be **dynamic per client** the standards-correct way — by reading the registered client's metadata — rather than by introducing operator-authored consent "templates."

## 2. What The Standard Covers (And What It Does Not)

**RFC 7591 (Dynamic Client Registration) governs the OAuth *client's* metadata**, which is exactly the per-client consent display data: `client_name`, `client_uri`, `logo_uri`, `tos_uri`, `policy_uri`, `contacts`, and `scope`. A consent screen that renders these from the registered client record is the standards-correct way to make consent dynamic per client.

What RFC 7591 does **not** cover, and where this doc must not over-claim (per the standards-first rule):

- **Human-readable scope descriptions.** RFC 7591 / RFC 6749 treat `scope` as an opaque space-delimited list with no descriptions. Our descriptions come from the `oauth-scope-catalog` plugin (DB rows) — a **repository-specific** (but existing, DB-driven) extension. Legitimate, just not "7591."
- **The authorization server's own hosted-page branding** — the look of the login/recovery/verify pages and the IdP's own logo/theme. No IETF standard governs AS hosted-UI theming. Out of scope here; if ever wanted, it is a separately-justified repo branding extension, not something 7591 "covers."

Classification summary:

| Surface | Posture |
|---|---|
| Consent client identity (name, logo, ToS/privacy, homepage) | **RFC 7591** client metadata — standard |
| Consent scope descriptions | Repo extension (scope catalog), DB-driven |
| Login/recovery/verify page theming, IdP branding | No standard — out of scope |

## 3. Current State In Better Auth (verified, 1.6.11)

- The OIDC provider's **DCR registration endpoint accepts the full 7591 set** (`client_name`, `client_uri`, `logo_uri`, `tos_uri`, `policy_uri`, `contacts`) — see `oidc-provider/index.mjs`.
- The **stored client schema first-classes only `name`, `icon`, and `metadata`** (`oidc-provider/schema.mjs`). On registration, `client_name`→`name` and `logo_uri`→`icon`; `client_uri`, `tos_uri`, `policy_uri`, and `contacts` are folded into the `metadata` JSON blob (or dropped if not mapped). So the 7591 fields are **capturable today inside `metadata`** without a schema migration.
- The consent flow is **`consent_code`-driven**: `/oauth2/consent` reads a `consent_code` (body or signed cookie) whose verification value holds `clientId`, `scope`, and `requireConsent`. The provider is configured with `consentPage: "/consent"` in `oauth-provider.ts`.
- The current `consent-form.tsx` ignores all of this and posts `accept` plus the raw OAuth query string; it never fetches the client record.

## 4. Target Design

### 4.1 Consent data source

The consent page must obtain, for the pending request, the client's display metadata and the resolved scope descriptions. Two implementation options (to be settled against BA 1.6.11 during build):

- **A — read-only consent-info endpoint:** a small core endpoint that, given the `consent_code` (or `client_id` for the pending authorization), returns `{ client: { name, logoUri, clientUri, tosUri, policyUri }, scopes: [{ value, description }] }`. The page calls it via the `@id/lib` typed helpers. Client display fields come from `name`/`icon`/`metadata`; scope descriptions join the `oauth-scope-catalog` rows.
- **B — surface the data in the consent redirect:** if BA can carry sufficient client/scope detail into the consent page params, render directly. Lower-effort but constrained by what BA passes; likely insufficient for ToS/privacy/logo, so A is the expected choice.

### 4.2 Field mapping

| 7591 field | Source today | Action |
|---|---|---|
| `client_name` | `oauthApplication.name` | read directly |
| `logo_uri` | `oauthApplication.icon` | read directly; render as `<img>` only (§6) |
| `client_uri` | `metadata` JSON | read from blob, or first-class via additionalFields |
| `tos_uri` | `metadata` JSON | read from blob, or first-class |
| `policy_uri` | `metadata` JSON | read from blob, or first-class |
| `contacts` | `metadata` JSON | optional; not shown on consent |
| scope descriptions | `oauth-scope-catalog` rows | join by scope value |

Decision to record at build time: keep `client_uri`/`tos_uri`/`policy_uri` inside `metadata`, or promote them to first-class client columns (via BA `additionalFields`) for cleaner admin editing. First-classing is the cleaner long-term shape and aligns admin forms with 7591 names.

### 4.3 Admin management

Operators set these fields where OAuth clients are already managed (the admin OAuth client screens, [docs/026](026_admin-oauth-security-screens-and-api-contracts.md)). No new operator concept is introduced — they edit standard client metadata. Any schema additions follow `pnpm db:generate` (never hand-written SQL) and the screen-spec gate for UI changes.

### 4.4 Consent screen rendering

`consent-form.tsx` stops fabricating the name and instead renders: client name + logo, the requested scopes with their catalog descriptions, and ToS/privacy/homepage links when present. It remains a `@id/ui`-composed page calling `/api/auth` through the typed helpers.

## 5. Standards Posture Recap

The consent client identity is **standard (RFC 7591)**; scope descriptions are a **DB-driven repo extension** already owned by the scope catalog; AS hosted-page branding is **out of scope** (no governing standard). Nothing here is justified by mixing an unrelated standard.

## 6. Security

- **`logo_uri`:** render as a same-document `<img src>` only; do **not** fetch server-side (SSRF). Enforce `https` and consider a CSP `img-src` allowlist; expect mixed-content/broken images and degrade gracefully to initials.
- **`client_uri` / `tos_uri` / `policy_uri`:** must be absolute `https` URLs; render with `rel="noopener noreferrer"`; validate on write to avoid `javascript:`/open-redirect payloads.
- **Trust source:** display metadata comes from the registered client record (admin- or DCR-provisioned), not from the live OAuth query string — the current query-derived name is itself the bug.

## 7. Phasing

- **Phase 1** — Consent-info read path (endpoint A) + `consent-form.tsx` rendering real client name, logo, and scope descriptions. Read from existing `name`/`icon`/`metadata` + scope catalog; no migration.
- **Phase 2** — First-class `client_uri`/`tos_uri`/`policy_uri` client fields + admin editing + ToS/privacy/homepage links on consent.
- **Phase 3 (optional, separate doc)** — AS hosted-page branding, if ever desired. Explicitly not part of this 7591 work.

## 8. Open Items

- Confirm against BA 1.6.11 whether the consent page can retrieve client/scope detail via the `consent_code` lookup, fixing endpoint shape A vs B.
- Decide `metadata`-blob vs first-class columns for the three URI fields.
- Confirm scope-catalog join shape for descriptions on the consent path.

## 9. Definition Of Done

The consent screen shows the real client name and logo, the requested scopes with human-readable descriptions, and (Phase 2) ToS/privacy/homepage links — all sourced from the DB client record and scope catalog, with no fabricated names and no query-string-derived identity. Link/logo rendering is XSS/SSRF-safe.
