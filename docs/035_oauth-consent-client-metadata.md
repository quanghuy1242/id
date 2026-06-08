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

The consent screen hides who the user grants access to. `consent-form.tsx` parses `client_id` from the OAuth query string and fabricates a display name of the form `Client <client_id>`, shows raw scope tokens as badges, and renders no logo, terms, or privacy links. It also breaks the repository rule that client identity comes from the database, not from a derived or hardcoded value.

We want the consent screen to vary per client the standards way, by reading the registered client's metadata. No operator-authored consent templates.

## 2. What The Standard Covers (And What It Does Not)

RFC 7591 (Dynamic Client Registration) governs the OAuth client's metadata, which is the per-client consent display data: `client_name`, `client_uri`, `logo_uri`, `tos_uri`, `policy_uri`, `contacts`, and `scope`. A consent screen that renders these from the registered client record varies per client the standards way.

What RFC 7591 leaves out, where the doc avoids over-claiming under the standards-first rule:

- **Human-readable scope descriptions.** RFC 7591 and RFC 6749 treat `scope` as an opaque space-delimited list with no descriptions. The descriptions come from the `oauth-scope-catalog` plugin (DB rows), a repository-specific extension that already exists. Legitimate, though outside 7591.
- **The authorization server's own hosted-page branding.** This covers the look of the login, recovery, and verify pages and the IdP's logo or theme. No IETF standard governs AS hosted-UI theming. Out of scope here. If you want it later, scope it as its own repo branding extension; 7591 does not reach it.

Classification summary:

| Surface | Posture |
|---|---|
| Consent client identity (name, logo, ToS/privacy, homepage) | RFC 7591 client metadata, standard |
| Consent scope descriptions | Repo extension (scope catalog), DB-driven |
| Login/recovery/verify page theming, IdP branding | No standard, out of scope |

## 3. Current State In Better Auth (verified, 1.6.11)

- The OIDC provider's DCR registration endpoint accepts the full 7591 set (`client_name`, `client_uri`, `logo_uri`, `tos_uri`, `policy_uri`, `contacts`). See `oidc-provider/index.mjs`.
- The stored client schema first-classes only `name`, `icon`, and `metadata` (`oidc-provider/schema.mjs`). On registration it maps `client_name` to `name` and `logo_uri` to `icon`, and folds `client_uri`, `tos_uri`, `policy_uri`, and `contacts` into the `metadata` JSON blob. The `metadata` blob can hold the 7591 fields without a schema migration.
- The consent flow runs on a `consent_code`: `/oauth2/consent` reads a `consent_code` (body or signed cookie) whose verification value holds `clientId`, `scope`, and `requireConsent`. The provider sets `consentPage: "/consent"` in `oauth-provider.ts`.
- The current `consent-form.tsx` ignores all of this. It posts `accept` plus the raw OAuth query string and never fetches the client record.

## 4. Target Design

### 4.1 Consent data source

For the pending request, the consent page needs the client's display metadata and the resolved scope descriptions. Two options, to settle against BA 1.6.11 during build:

- **Option A, a read-only consent-info endpoint.** Given the `consent_code` or the pending `client_id`, a small core endpoint returns `{ client: { name, logoUri, clientUri, tosUri, policyUri }, scopes: [{ value, description }] }`. The page calls it through the `@id/lib` typed helpers. Client fields come from `name`, `icon`, and `metadata`; scope descriptions join the `oauth-scope-catalog` rows.
- **Option B, data in the consent redirect.** If BA carries enough client and scope detail into the consent page params, render from those. This depends on what BA passes and probably lacks ToS, privacy, and logo. Option A is the expected choice.

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

Decision to record at build time: keep `client_uri`, `tos_uri`, and `policy_uri` inside `metadata`, or promote them to first-class client columns through BA `additionalFields`. Promoting them simplifies admin editing and aligns the admin form fields with the 7591 names.

### 4.3 Admin management

Operators set these fields where they already manage OAuth clients (the admin OAuth client screens, [docs/026](026_admin-oauth-security-screens-and-api-contracts.md)). The concept stays the same: they edit standard client metadata. Schema additions go through `pnpm db:generate`, never hand-written SQL, and UI changes go through the screen-spec gate.

### 4.4 Consent screen rendering

`consent-form.tsx` stops fabricating the name. It renders the client name and logo, the requested scopes with their catalog descriptions, and ToS, privacy, and homepage links when present. It stays a `@id/ui`-composed page that calls `/api/auth` through the typed helpers.

## 5. Standards Posture Recap

Consent client identity follows RFC 7591. Scope descriptions are a DB-driven repo extension that the scope catalog already owns. AS hosted-page branding stays out of scope, since no standard governs it. Nothing here leans on an unrelated standard.

## 6. Security

- **`logo_uri`:** render as a same-document `<img src>` only. Never fetch it server-side, which opens SSRF. Enforce `https`, consider a CSP `img-src` allowlist, and fall back to initials on a broken or blocked image.
- **`client_uri`, `tos_uri`, `policy_uri`:** require absolute `https` URLs, render them with `rel="noopener noreferrer"`, and validate on write to block `javascript:` and open-redirect payloads.
- **Trust source:** read display metadata from the registered client record that an admin or DCR provisioned. The current code reads it from the live OAuth query string, which is the bug.

## 7. Phasing

- **Phase 1:** consent-info read path (option A) plus `consent-form.tsx` rendering the real client name, logo, and scope descriptions. Read from existing `name`, `icon`, `metadata`, and the scope catalog. No migration.
- **Phase 2:** first-class `client_uri`, `tos_uri`, and `policy_uri` client fields, admin editing, and ToS, privacy, and homepage links on consent.
- **Phase 3 (optional, separate doc):** AS hosted-page branding, once you want it. Not part of this 7591 work.

## 8. Open Items

- Confirm against BA 1.6.11 whether the consent page can retrieve client and scope detail through the `consent_code` lookup, which settles option A versus B.
- Decide between the `metadata` blob and first-class columns for the three URI fields.
- Confirm the scope-catalog join shape for descriptions on the consent path.

## 9. Definition Of Done

The consent screen shows the real client name and logo, the requested scopes with human-readable descriptions, and (Phase 2) ToS, privacy, and homepage links. All values come from the DB client record and the scope catalog, with no fabricated names and no query-string identity. Logo and link rendering stays XSS-safe and SSRF-safe.
