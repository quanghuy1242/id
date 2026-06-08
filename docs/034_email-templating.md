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

Two facts make this tractable here:

- **One render seam.** All three flows funnel through `sendAuthEmail` → `createResendAuthEmailSender.send()` → `renderAuthEmail(message)`. Intercept there to cover every flow, including future kinds added to the `AuthEmailMessage` union.
- **Three flows exist.** `verification` (`emailVerification.sendVerificationEmail`), `password-reset` (`emailAndPassword.sendResetPassword`), and `admin-otp` (the `idAdminSignInGuard` plugin). Organization invitations and change-email confirmations are not wired.

The seam carries one observability gap, marked as `TODO(email-observability)` in `auth-email.ts`. Production sends go out through `waitUntil`, so a Resend rejection stays invisible. Backgrounding is the right call for verification and reset. The auth flow must not block on a third-party send, and returning the provider's status would leak account existence. Making production sends synchronous stays out of scope. The template work needs only the interactive awaited path, which admin-OTP uses today and test-send adds below, to report a real send result.

## 2. Goals / Non-Goals

Goals:

- Operators edit subject and content for each email kind in the admin UI; values persist in D1.
- Every flow resolves the stored template at send time, with a guaranteed safe fallback.
- Authoring stays safe by construction against XSS, email header injection, and SSTI.
- A test-send and a live preview let operators validate before relying on a template.

Non-goals (v1):

- Free-form full-document HTML authored by operators. Rejected on security grounds; see §6.
- Logic in templates (conditionals, loops). Deferred; see §4.4 and §9.
- Per-locale templates. Seam left open; see §7.
- Reworking the production async send into a synchronous one; see §1.

## 3. Standards Classification

Per the repo's standards-first rule, no protocol or interoperability standard governs email body content. A DB-backed template store is a **repository-specific extension**. It fits the rule because the unmet requirement, operator-editable templates, is real and no standard covers it. RFC 7591 sits in a separate workstream: it governs OAuth client metadata for the consent screen (see [docs/035](035_oauth-consent-client-metadata.md)). Do not conflate the two.

## 4. Architecture

### 4.1 The single seam is the leverage point

Keep `renderAuthEmail` as a pure, framework-free function and change its inputs. Instead of producing hardcoded bodies, it interpolates a resolved template (subject/html/text strings plus a variable map). A new adapter loads the template from DB/KV, and the send orchestrator passes it in. The pure interpolation stays inside the framework-free lint boundary; the adapter owns the async load with env access.

### 4.2 Resolution pipeline

At send time:

1. **Load** the template for `(kind, organizationId?)` from KV (cached), then D1, then the hardcoded default that `renderAuthEmail` ships today.
2. **Resolve order:** organization override → platform default → hardcoded fallback. A missing, disabled, or invalid template falls through to the next tier and never blocks a verification, reset, or OTP.
3. **Interpolate** the resolved subject/html/text with the kind's variable map (the pure step, §4.4).
4. **Send** through the existing Resend transport, unchanged.

### 4.3 Two safety concerns, two tools

These concerns are orthogonal. Solve each with its own tool:

- **(a) Variable-interpolation safety.** Stop XSS and SSTI from operator-authored text. The engine choice handles it (§4.4).
- **(b) Email-client-safe HTML.** The layout has to render across Gmail, Outlook, and Apple Mail. A fixed developer-owned base layout handles it (§4.4); operators edit slots only.

### 4.4 Engine decision (committed)

**Variables: a small logic-less `{{variable}}` interpolator over a fixed per-kind allowlist, built on the existing `escapeHtml`.** It matches Mustache for safety: `{{x}}` always HTML-escapes, no `{{{raw}}}` opt-out reaches operators, and it evaluates no expressions. Zero dependency, no SSTI surface, and short enough to audit inside the framework-free render module.

The popular "safe" engines stay safe only when a team configures them with care, and they carry real advisories when a team ships the defaults:

- **LiquidJS** (Shopify's customer-facing engine) skips autoescape by default; you must set `outputEscape`. Its docs state templates are "not sandboxed." It has a stored-XSS advisory and an SSTI-to-arbitrary-file-read advisory.
- **Handlebars** has a documented SSTI-to-RCE writeup. Version 4.6.0 hardened it, though the surface stays larger.
- **Mustache** is logic-less and escapes by default. The custom interpolator copies that behavior.

**Layout: a fixed, email-client-safe base shell owned by developers.** react-email fits well: Resend builds it, we already send through Resend, it renders components to inlined email-safe HTML, and it runs on Workers with known bundling caveats. A hand-tuned MJML or HTML shell is the dependency-free alternative. Operators edit slots (subject, heading, body copy, CTA label, footer) and leave the surrounding markup alone. Postmark, Customer.io, and Shopify ship this same pattern: a safe layout plus safe slots, with operators kept away from raw HTML on a sensitive origin.

If templates need conditionals or loops later, move to LiquidJS with `outputEscape: "escape"`, a restricted tag and filter allowlist, and input sanitization. Treat that as a documented upgrade, not a starting point.

### 4.5 Per-kind variable contracts (the allowlist)

The editor validates at save time that a template references only its kind's variables, and it rejects an unknown `{{x}}` before save.

| Kind | Allowed variables |
|---|---|
| `verification` | `url`, `email`, `appName`, `expiresIn` |
| `password-reset` | `url`, `email`, `appName`, `expiresIn` |
| `admin-otp` | `otp`, `email`, `expiryMinutes` |

The interpolator escapes system values (`url`, `otp`) per output context and strips newlines from the subject to block header injection.

### 4.6 Storage — `idEmailTemplates` Better Auth plugin

Per the Custom Table Rule, a Better Auth plugin owns the table through its `schema`, never a standalone Drizzle schema. Proposed `emailTemplate` model. Run `pnpm db:generate` after editing the plugin schema; never hand-write SQL.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `organizationId` | text, nullable | `NULL` = platform default; non-null = org override |
| `kind` | text | one of the `AuthEmailMessage` kinds |
| `locale` | text, default `"en"` | i18n seam (§7) |
| `subject` | text | |
| `html` | text | slot content, not full document |
| `text` | text | |
| `enabled` | boolean | disabled falls through to the next tier |
| `version` | integer | optimistic concurrency / rollback seam |
| `updatedAt` | timestamp | |
| `updatedBy` | text | actor id, for audit |

Uniqueness on `(organizationId, kind, locale)`. CRUD runs through `createAuthEndpoint`, mounts under `/api/auth/admin/email-templates...`, authorizes through the injected `authorize` callback (the `idResourceServer` pattern), and writes an audit record.

### 4.7 Caching and invalidation

Reuse the resource-server audience pattern (`resource-server/audiences.ts`): a KV write-through cache keyed by `(kind, organizationId, locale)` with a D1 fallback, invalidated on each template write. This adds one cached read per send, which costs little on `waitUntil` sends and stays acceptable on the awaited OTP and test paths.

### 4.8 Send paths

- **Production (verification, reset):** `waitUntil`, async, non-blocking, same as today. Resolution and interpolation run before dispatch, and the hardcoded fallback guarantees a rendered email.
- **Interactive (admin-OTP, test-send):** awaited, and the caller sees the real send result. admin-OTP already works this way; test-send reuses the path. Template work touches the synchronous contract only here.

## 5. Admin UI

Hard gate: a screen spec in `workers/ui/docs/screens/` (for example `email-templates.md`) with ASCII sketch, `Components:`, and `Data:` must exist and earn approval before any `/admin` route file. The screen, in brief:

- **List** of kinds with platform/override status badges.
- **Editor** per kind: `TextInput` (subject), `CodeEditor` (html/text slots), a variable palette (the §4.5 allowlist), and a live preview that renders sample data in a sandboxed surface.
- **Test-send** button into the awaited send path (§4.8), which reports the true Resend result.
- All `/api/auth` calls go through the `@id/lib` typed helpers; route files compose `@id/ui` primitives only.

## 6. Security Model

- **XSS:** autoescape-by-default `{{var}}`, no raw-output escape hatch for operators, slot editing only.
- **Header injection:** the interpolator strips newlines from the subject.
- **SSTI:** none by construction. The interpolator runs no expression evaluation, no property traversal, and no helpers.
- **Fallback safety:** a disabled, missing, or invalid template degrades to the platform default and then the hardcoded default; a broken template never blocks auth.
- **Audit:** every template write flows through `idAdminAudit` and `idAdminActivityLog`.
- **Preview isolation:** preview renders sample data only and executes no operator-controlled script.

## 7. Tenancy And i18n

The schema carries `organizationId` (nullable) and `locale` from the start, so adding org overrides or locales later needs no migration. Exposing per-org editing and locale switching in the v1 UI is a scoping choice on top of the same schema. Default posture: platform-level editing first, per-org override second.

## 8. Phasing

- **Phase 0:** test-send foundation plus email observability hooks (logs, optional delivery/audit record). Establishes the awaited interactive path and closes the `TODO(email-observability)` gap.
- **Phase 1:** `idEmailTemplates` plugin, table, KV/D1 resolver, custom `{{var}}` interpolator, and hardcoded fallback wired through the seam. Platform-level only.
- **Phase 2:** admin editor screen (spec → mocks → actions → content → story → route) with preview and test-send.
- **Phase 3:** per-organization overrides in the UI.
- **Phase 4 (deferred):** locale support, and a richer engine (hardened LiquidJS) once conditionals or loops become necessary.

## 9. Open Decisions

- **Engine power:** committed to logic-less escaped `{{var}}` for v1. Revisit once a concrete template needs conditionals or loops.
- **Tenancy in v1 UI:** platform-only, or per-org from the start. The schema supports both; the recommendation is platform-first.
- **Layout dependency:** react-email, or a dependency-free MJML/HTML shell, given react-email's Workers bundling caveats.

## 10. Testing And Definition Of Done

- Unit-test the interpolator: escaping, unknown-variable rejection, subject newline stripping, and per-kind allowlist enforcement, with no BA context.
- Unit-test the resolver: org → platform → hardcoded fallback, plus cache hit, miss, and invalidation.
- Integration-test the plugin CRUD endpoints through `auth.handler()`.
- Verify every existing email flow still sends with no template rows present (the hardcoded fallback path).
- `pnpm check` green; `pnpm advise` handled per repo guidance.

**Definition of done:** operators edit subject and content per kind, persisted to D1; all flows render from the stored template with a guaranteed safe fallback; authoring cannot inject script or headers; preview and test-send work; audit records every edit.
