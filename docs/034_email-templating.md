# DB-Backed Email Templating

> Status: implementation-grade research and proposal
>
> Date: 2026-06-08
>
> Scope:
>
> - `workers/core/src/auth/adapters/auth-email.ts` — the send orchestrator (`sendAuthEmail`) and Resend sender factory
> - `workers/core/src/auth/adapters/auth-email-render.ts` — the single render seam (`renderAuthEmail`) that today hardcodes all email bodies
> - `workers/core/src/auth/adapters/resend-email.ts` — Resend transport
> - `workers/core/src/auth/get-auth.ts` — where the three email callbacks are wired
> - `workers/core/src/auth/plugins/**` — home of the proposed `idEmailTemplates` plugin (Custom Table Rule)
> - `workers/ui/src/app/admin/**` and `workers/ui/docs/screens/` — the proposed admin editor screen
>
> Source docs and local evidence:
>
> - [docs/000_repo-architecture.md](000_repo-architecture.md) — boundaries, Custom Table Rule
> - [docs/009_plugin_first_auth_architecture.md](009_plugin_first_auth_architecture.md) — BA-plugin-owned table pattern
> - [docs/022_admin-ui-system.md](022_admin-ui-system.md) — admin UI design system
> - [docs/023_admin-screen-story-strategy.md](023_admin-screen-story-strategy.md) — screen spec gate
> - [docs/024_admin-login-context-guard.md](024_admin-login-context-guard.md) — the admin-OTP flow (the existing awaited-send precedent)
> - [docs/028_tenant-scoped-platform-experience.md](028_tenant-scoped-platform-experience.md) — tenant scoping model
> - `workers/core/src/auth/plugins/resource-server/audiences.ts` — the KV-cache + D1-fallback pattern reused here
>
> External references checked on 2026-06-08:
>
> - LiquidJS options (`outputEscape`) — https://liquidjs.com/tutorials/options.html (no autoescape by default; templates "not sandboxed")
> - Liquid stored-XSS advisory — https://github.com/CentauriSolutions/EyeDP/security/advisories/GHSA-w4c8-gjjh-cwq5
> - LiquidJS SSTI → arbitrary file read — https://www.hacefresko.com/posts/liquidjs-ssti-to-arbitrary-file-read
> - Handlebars SSTI → RCE — https://mahmoudsec.blogspot.com/2019/04/handlebars-template-injection-and-rce.html
> - react-email + Resend on Cloudflare Workers — https://resend.com/docs/send-with-cloudflare-workers (bundling caveats: resend-node #587, react-email #1508)

## 1. Problem And Current State

Today every transactional email body is hardcoded in `renderAuthEmail(message)` (`auth-email-render.ts`) as string-concatenated HTML/text. Operators cannot change subject lines, copy, or branding without a code deploy. We want operators to author templates in the admin UI, store them in the database, and have every email flow pick the stored template at send time.

Two facts make this tractable in this repo specifically:

- **There is exactly one render seam.** All three current flows funnel through `sendAuthEmail` → `createResendAuthEmailSender.send()` → `renderAuthEmail(message)`. Intercepting at that seam covers every flow at once, including future kinds added to the `AuthEmailMessage` union.
- **The three flows are:** `verification` (`emailVerification.sendVerificationEmail`), `password-reset` (`emailAndPassword.sendResetPassword`), and `admin-otp` (the `idAdminSignInGuard` plugin). Organization invitations and change-email confirmations are **not** wired today.

Related observability gap (documented at the seam as `TODO(email-observability)` in `auth-email.ts`): production sends are dispatched via `waitUntil` and a Resend rejection is currently unobservable. This is **correct** for verification/reset (the auth flow must not block on, or be failed by, a third-party send — latency plus enumeration safety), and is out of scope to "fix" by making production sends synchronous. The template work only needs the **interactive** awaited path (admin-OTP today, and **test-send** introduced here) to surface real send results.

## 2. Goals / Non-Goals

Goals:

- Operators edit subject + content for each email kind in the admin UI; values persist in D1.
- Every flow resolves the stored template at send time, with a guaranteed safe fallback.
- Authoring is **safe by construction** against XSS, email header injection, and SSTI.
- A test-send and a live preview let operators validate before relying on a template.

Non-goals (v1):

- Free-form full-document HTML authored by operators (rejected on security grounds — see §6).
- Logic in templates (conditionals/loops). Deferred; see §4.4 and §9.
- Per-locale templates (seam left open; see §7).
- Reworking the production async send into a synchronous one (see §1).

## 3. Standards Classification

Per the repo's standards-first rule: **email body content is governed by no protocol or interoperability standard.** A DB-backed template store is therefore a **repository-specific extension**, which is appropriate because the unmet requirement (operator-editable templates) is real and no standard covers it. This is unrelated to RFC 7591 (that governs OAuth *client* metadata for the consent screen — see [docs/035](035_oauth-consent-client-metadata.md)); the two must not be conflated.

## 4. Architecture

### 4.1 The single seam is the leverage point

Keep `renderAuthEmail` as a **pure, framework-free** function, but change its inputs: instead of always producing hardcoded bodies, it interpolates a resolved template (subject/html/text strings + variable map). Template *loading* (DB/KV) happens in a new adapter and is threaded into the send orchestrator. The pure interpolation stays where the framework-free lint boundary wants it; the async loading lives in an adapter with env access.

### 4.2 Resolution pipeline

At send time:

1. **Load** the template for `(kind, organizationId?)` from KV (cached), falling back to D1, falling back to the **hardcoded default** that `renderAuthEmail` ships today.
2. **Resolve order:** organization override → platform default → hardcoded fallback. A missing, disabled, or invalid template must never block a verification/reset/OTP — it silently degrades to the next tier.
3. **Interpolate** the resolved subject/html/text with the kind's variable map (pure step, §4.4).
4. **Send** via the existing Resend transport (unchanged).

### 4.3 Two safety concerns, two tools

These are orthogonal and must not be solved with one tool:

- **(a) Variable-interpolation safety** — preventing XSS/SSTI from operator-authored text. Solved by the engine choice (§4.4).
- **(b) Email-client-safe HTML** — the layout actually rendering across Gmail/Outlook/Apple Mail. Solved by a fixed developer-owned base layout (§4.4), not by operators.

### 4.4 Engine decision (committed)

**Variables: a small custom logic-less `{{variable}}` interpolator over a fixed per-kind allowlist, built on the existing `escapeHtml`.** This gives Mustache-equivalent safety (autoescape by default; `{{x}}` always HTML-escaped; no `{{{raw}}}` opt-out exposed to operators) with **zero dependency and zero SSTI surface**, and is trivially auditable inside the framework-free render module.

Rationale, with evidence — the popular "safe" engines are only safe when carefully configured, and have real-world advisories when used naively:

- **LiquidJS** (Shopify's customer-facing engine) does **not** autoescape by default (`outputEscape` must be set), its own docs state templates are "not sandboxed," and it has documented stored-XSS and an SSTI→arbitrary-file-read advisory.
- **Handlebars** has a documented SSTI→RCE (hardened since 4.6.0, but larger surface).
- **Mustache** is logic-less and escapes by default — the smallest blast radius, which is what we replicate with the custom interpolator.

**Layout: a fixed, email-client-safe base shell owned by developers** (react-email is the natural fit — it is made by Resend, which we already use, renders components → inlined email-safe HTML, and runs on Workers with known bundling caveats; a hand-tuned MJML/HTML shell is the dependency-free alternative). Operators edit **slots** (subject, heading, body copy, CTA label, footer), never the surrounding markup. This is the mainstream pattern (Postmark/Customer.io/Shopify-style): safe layout + safe slots, never raw operator HTML on a sensitive origin.

If logic (conditionals/loops) is genuinely needed later, the upgrade path is LiquidJS with `outputEscape: "escape"`, a restricted tag/filter allowlist, and input sanitization — a deliberate, documented step, not a starting point.

### 4.5 Per-kind variable contracts (the allowlist)

The editor validates at save time that a template references only its kind's variables; an unknown `{{x}}` is a save error, not a runtime surprise.

| Kind | Allowed variables |
|---|---|
| `verification` | `url`, `email`, `appName`, `expiresIn` |
| `password-reset` | `url`, `email`, `appName`, `expiresIn` |
| `admin-otp` | `otp`, `email`, `expiryMinutes` |

System-generated values (`url`, `otp`) are escaped per output context; the subject is rendered with newline stripping (header-injection defense).

### 4.6 Storage — `idEmailTemplates` Better Auth plugin

Per the Custom Table Rule, the table is owned by a Better Auth plugin `schema`, never a standalone Drizzle schema. Proposed `emailTemplate` model (final field map via `pnpm db:generate` after editing the plugin schema — never hand-write SQL):

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `organizationId` | text, nullable | `NULL` = platform default; non-null = org override |
| `kind` | text | one of the `AuthEmailMessage` kinds |
| `locale` | text, default `"en"` | i18n seam (§7) |
| `subject` | text | |
| `html` | text | slot content, not full document |
| `text` | text | |
| `enabled` | boolean | disabled → falls through to next tier |
| `version` | integer | optimistic concurrency / rollback seam |
| `updatedAt` | timestamp | |
| `updatedBy` | text | actor id, for audit |

Uniqueness on `(organizationId, kind, locale)`. CRUD via `createAuthEndpoint`, mounted under `/api/auth/admin/email-templates...`, authorized through the injected `authorize` callback (same pattern as `idResourceServer`), and audited.

### 4.7 Caching and invalidation

Reuse the resource-server audience pattern (`resource-server/audiences.ts`): KV write-through cache keyed by `(kind, organizationId, locale)` with a D1 fallback, invalidated on template write. This adds one cached read per send — negligible for `waitUntil` sends and acceptable for the awaited OTP/test paths.

### 4.8 Send paths

- **Production (verification/reset):** unchanged — `waitUntil`, async, non-blocking. Resolution + interpolation happen before dispatch; the hardcoded fallback guarantees an email is always rendered.
- **Interactive (admin-OTP, test-send):** awaited, with the real send result surfaced (admin-OTP already does this; test-send adopts the same path). This is the only place template work touches the synchronous contract.

## 5. Admin UI

Hard gate: a screen spec in `workers/ui/docs/screens/` (e.g. `email-templates.md`) with ASCII sketch + `Components:` + `Data:` must exist and be approved before any `/admin` route file. The screen, in brief:

- **List** of kinds with platform/override status badges.
- **Editor** per kind: `TextInput` (subject), `CodeEditor` (html/text slots), a variable palette (the §4.5 allowlist), and a **live preview** rendered with sample data in a sandboxed surface.
- **Test-send** button → the awaited send path (§4.8), surfacing the true Resend result.
- All `/api/auth` calls go through the `@id/lib` typed helpers; route files compose `@id/ui` primitives only.

## 6. Security Model

- **XSS:** autoescape-by-default `{{var}}`; no raw-output operator escape hatch; operators edit slots, not document markup.
- **Header injection:** subject rendered with newline stripping.
- **SSTI:** none by construction — the interpolator has no expression evaluation, no property traversal, no helpers.
- **Fallback safety:** disabled/missing/invalid template degrades to platform default then hardcoded default; a broken template can never block auth.
- **Audit:** every template write flows through `idAdminAudit` / `idAdminActivityLog`.
- **Preview isolation:** preview renders sample data only and never executes operator-controlled script.

## 7. Tenancy And i18n

The schema carries `organizationId` (nullable) and `locale` from day one so the data model never needs migration to add org overrides or locales. Whether the **UI** exposes per-org editing and locale switching in v1 is a scoping toggle, not a schema change. Default posture: platform-level editing first; per-org override second.

## 8. Phasing

- **Phase 0** — Test-send foundation + email observability hooks (logs + optional delivery/audit record). Establishes the awaited interactive path and closes the `TODO(email-observability)` gap.
- **Phase 1** — `idEmailTemplates` plugin + table + KV/D1 resolver + custom `{{var}}` interpolator + hardcoded fallback wired through the seam. Platform-level only.
- **Phase 2** — Admin editor screen (spec → mocks → actions → content → story → route) with preview + test-send.
- **Phase 3** — Per-organization overrides exposed in the UI.
- **Phase 4 (deferred)** — Locale support; richer engine (LiquidJS, hardened) only if conditionals/loops become a real need.

## 9. Open Decisions

- **Engine power:** committed to logic-less escaped `{{var}}` for v1. Revisit only if a concrete template needs conditionals/loops.
- **Tenancy in v1 UI:** platform-only vs per-org from the start (schema supports both; default recommendation is platform-first).
- **Layout dependency:** react-email vs a dependency-free MJML/HTML shell, given react-email's Workers bundling caveats.

## 10. Testing And Definition Of Done

- Unit-test the interpolator: escaping, unknown-variable rejection, subject newline stripping, per-kind allowlist enforcement (no BA context needed).
- Unit-test the resolver: org→platform→hardcoded fallback, cache hit/miss/invalidation.
- Integration-test the plugin CRUD endpoints through `auth.handler()`.
- Verify every existing email flow still sends with no template rows present (hardcoded fallback path).
- `pnpm check` green; `pnpm advise` handled per repo guidance.

**Definition of done:** operators can edit subject/content per kind, persisted to D1; all flows render from the stored template with a guaranteed safe fallback; authoring cannot inject script or headers; preview and test-send work; audit records every edit.
