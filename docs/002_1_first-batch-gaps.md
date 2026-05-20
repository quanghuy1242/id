# First Batch Gaps And Integration Readiness

> Status: implementation-grade gap review after current codebase inspection
>
> Date: 2026-05-20
>
> Scope: `/home/quanghuy1242/pjs/auth` first-batch readiness for real downstream integration, with emphasis on `workers/core`, `workers/ui`, `packages/lib`, deployment docs, and Sender transactional email
>
> Source docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/001_first-batch-plan.md` Section 18, Definition of Done
> - `docs/002_implementation-sequence.md`
> - `docs/003_future-implementation.md`
> - `docs/004_admin-api-reference.md`
> - `docs/005_oauth2-oidc-integration-guide.md`
> - `docs/006_resource-server-jwt-guide.md`
> - `docs/007_cloudflare-deployment-runbooks.md`
> - Sender pricing, checked 2026-05-20: <https://www.sender.net/pricing/>
> - Sender transactional email API, checked 2026-05-20: <https://api.sender.net/transactional-campaigns/send-transactional/>
> - Sender transactional setup and domain requirements, checked 2026-05-20: <https://www.sender.net/help/transactional-emails/getting-started/> and <https://www.sender.net/help/transactional-emails/sender-identity-and-domain-requirements/>
> - Sender transactional rate limits, checked 2026-05-20: <https://www.sender.net/help/transactional-emails/transactional-email-rate-limits/>
> - Better Auth email/password, email, OAuth Provider, and rate-limit docs, checked 2026-05-20: <https://better-auth.com/docs/authentication/email-password>, <https://better-auth.com/docs/concepts/email>, <https://better-auth.com/docs/plugins/oauth-provider>, <https://better-auth.com/docs/concepts/rate-limit>
> - Better Auth Admin, API Key, API Key advanced, and CLI docs, checked 2026-05-20: <https://better-auth.com/docs/plugins/admin>, <https://better-auth.com/docs/plugins/api-key>, <https://better-auth.com/docs/plugins/api-key/advanced>, <https://better-auth.com/docs/concepts/cli>
>
> Assumptions:
>
> - `content-api` is the first downstream app. API resource-server verification and M2M/client setup come first; browser OAuth can follow after login and consent fallback surfaces exist.
> - Email sending should use the Sender free plan, not Cloudflare Email Service.
> - First-release email volume stays well below Sender's free-plan monthly quota and per-minute API limits.
> - Full admin UI pages are deferred. First-release administration is API-only.
> - Minimal hosted auth pages are still required if `content-ui` needs user sign-in through OAuth. Admin UI is not required for that. First release needs only login plus a small consent fallback.
> - Public email/password sign-up is not part of the first release. Admin-only user creation should use Better Auth Admin `createUser`; `/api/auth/sign-up/email` must be disabled.
> - Browser OAuth is production-domain only. Preview `*.workers.dev` deployments are API-only because shared parent-domain cookies are impossible on the public suffix.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Review Verdict](#2-review-verdict)
- [3. Current-State Findings](#3-current-state-findings)
  - [3.1 Working Capabilities](#31-working-capabilities)
  - [3.2 Email Current State](#32-email-current-state)
  - [3.3 OAuth And UI Flow Current State](#33-oauth-and-ui-flow-current-state)
  - [3.4 Admin And Resource-Server Current State](#34-admin-and-resource-server-current-state)
  - [3.5 Documentation And Deployment Drift](#35-documentation-and-deployment-drift)
- [4. Blocker Gaps](#4-blocker-gaps)
  - [4.1 Sender Transactional Email](#41-sender-transactional-email)
  - [4.2 OAuth Browser Pages And Consent](#42-oauth-browser-pages-and-consent)
  - [4.3 Bootstrap Admin](#43-bootstrap-admin)
  - [4.4 Resource-Server Read Authorization](#44-resource-server-read-authorization)
  - [4.5 Runtime Audience Integration Proof](#45-runtime-audience-integration-proof)
  - [4.6 Disable Public Sign-Up](#46-disable-public-sign-up)
  - [4.7 Production Cookie And Preview Boundary](#47-production-cookie-and-preview-boundary)
  - [4.8 OAuth Token Lifetimes And Refresh Rotation](#48-oauth-token-lifetimes-and-refresh-rotation)
- [5. High-Priority Non-Blocker Gaps](#5-high-priority-non-blocker-gaps)
- [6. Sender Target Model](#6-sender-target-model)
  - [6.1 Provider Facts](#61-provider-facts)
  - [6.2 Recommended Worker Integration](#62-recommended-worker-integration)
  - [6.3 Email Templates And Data Handling](#63-email-templates-and-data-handling)
  - [6.4 Failure Policy](#64-failure-policy)
- [7. API-Only Admin Operations Target Model](#7-api-only-admin-operations-target-model)
  - [7.1 Native Better Auth Platform Admin](#71-native-better-auth-platform-admin)
  - [7.2 One-Time Bootstrap](#72-one-time-bootstrap)
  - [7.3 Wrangler-Gated Generic Request Helper](#73-wrangler-gated-generic-request-helper)
  - [7.4 API Key Position](#74-api-key-position)
- [8. Browser OAuth Target Model](#8-browser-oauth-target-model)
  - [8.1 Why Minimal Auth Pages Are Required](#81-why-minimal-auth-pages-are-required)
  - [8.2 Consent Behavior](#82-consent-behavior)
  - [8.3 Trusted Clients Without Hard Config](#83-trusted-clients-without-hard-config)
  - [8.4 Production Domain, Cookies, And Preview Boundary](#84-production-domain-cookies-and-preview-boundary)
  - [8.5 OAuth Token Lifetimes And Refresh Rotation](#85-oauth-token-lifetimes-and-refresh-rotation)
  - [8.6 Public Sign-Up Policy](#86-public-sign-up-policy)
- [9. Missing Tests](#9-missing-tests)
- [10. Integration Scenario: content-api](#10-integration-scenario-content-api)
- [11. Implementation Backlog](#11-implementation-backlog)
- [12. Edge Cases And Failure Modes](#12-edge-cases-and-failure-modes)
- [13. Verification Plan](#13-verification-plan)
- [14. Definition Of Done](#14-definition-of-done)
- [15. Final Model](#15-final-model)

## 1. Goal

Close the gap between the current configured/tested scaffold and a production-usable first batch where a downstream app can:

- send verification and reset emails for admin-created users through real email delivery;
- keep public sign-up disabled until there is an explicit product decision to open it;
- expose API-only admin operation without building an admin UI;
- complete a browser authorization-code + PKCE sign-in flow for `content-ui` through the two minimal hosted auth pages required for first release;
- receive resource-bound JWT access tokens for a registered resource server;
- verify those tokens locally through JWKS;
- rely on admin/resource-server APIs that enforce tenant and platform authorization; and
- operate the deployment without manual D1 edits for the first admin user.

This document is a readiness review and implementation handoff. It replaces the previous Cloudflare Email Service plan with a Sender free-plan plan.

## 2. Review Verdict

The first-batch implementation is solid as a protocol and architecture proof, but it is not ready for real downstream integration yet. The biggest blockers are not Better Auth contract discovery, JWKS, or M2M token issuance. Those are already tested. The blockers are operational wiring and user-facing browser/email flows.

Required before `content-api` integration:

| Priority | Gap | Why it blocks |
|---|---|---|
| P0 | Sender transactional email is not wired | New users cannot receive verification links and password reset links. |
| P0 | Public email/password sign-up is still enabled | Anyone can call `POST /api/auth/sign-up/email`; first-release user creation must be admin-only through Better Auth Admin `createUser`. |
| P0 | Minimal hosted OAuth login page is missing | `content-ui` cannot let users sign in unless the IdP login redirect can create a Better Auth session and resume `/oauth2/authorize`. |
| P0 | Minimal hosted consent fallback is missing | Trusted first-party clients should use DB-backed `skip_consent`, but any future non-trusted browser client needs a real fallback page because Better Auth does not ship a default consent UI. |
| P0 | No bootstrap admin path | Native Better Auth admin endpoints cannot be used until the first admin user exists. |
| P0 | Platform admin uses custom `platformRole` instead of Better Auth native `user.role` | The Admin plugin already uses `user.role`; keeping a separate platform role duplicates policy and makes official admin APIs harder to reason about. |
| P0 | Resource-server read endpoints are session-only | Any signed-in user can list/read all resource servers through plugin endpoints. |
| P0 | No end-to-end runtime audience proof through the actual Worker route | Tests prove cache and token issuance separately, but not create/disable resource server -> D1/KV -> Hono mount -> OAuth token behavior. |
| P0 | Production session cookie config is missing | `id.quanghuy.dev` and `content.quanghuy.dev` need a shared parent-domain session cookie, and `id` must not collide with legacy `auther` cookie names during migration. |
| P0 | OAuth token lifetimes and refresh rotation are not asserted | Defaults are one-hour access tokens and 30-day refresh tokens; first release wants 3-hour access tokens, 7-day refresh tokens, and replay rejection coverage. |
| P1 | No Wrangler-gated generic operator request path | API-only operation should not require a UI, raw API-key env vars, or custom commands for every Better Auth endpoint. |
| P1 | Rate limiting is not explicitly configured | Better Auth has production defaults, but the repo should set Cloudflare IP headers and stricter auth/token endpoint rules intentionally. |
| P1 | Resource-server audit fields can be spoofed or bypassed | `createdBy` is accepted from request body and `PATCH enabled` can bypass disable audit fields. |
| P1 | Docs drift from code | Dashboard route is documented in some places after being removed; README/runbook/workflow deployment claims are inconsistent. |
| P1 | Missing OAuth/OIDC tests | PKCE, refresh, introspection, revocation, userinfo, token type behavior, prompt flows, and org invitations are not covered. |

## 3. Current-State Findings

### 3.1 Working Capabilities

Observed working or directly tested areas:

| Capability | Evidence |
|---|---|
| Better Auth base path and route map | `workers/core/src/auth/contracts.ts`, `workers/core/tests/auth/contracts.test.ts` |
| Sign-up/sign-in/session/sign-out happy path | `workers/core/tests/auth/auth-core.test.ts` |
| Email verification requirement blocks unverified sign-in | `workers/core/tests/auth/auth-core.test.ts` |
| Password reset callback is triggered | `workers/core/tests/auth/auth-core.test.ts` |
| M2M `client_credentials` token issuance with JWT + JWKS verification | `workers/core/tests/auth/oauth-flows.test.ts` |
| JWKS `kid` proof and rotation grace behavior | `workers/core/tests/auth/jwks-proof.test.ts` |
| Resource-server plugin mutation endpoints exist | `workers/core/src/auth/plugins/resource-server/index.ts` |
| Resource-server payload builders and validation are tested | `workers/core/tests/auth/resource-server-operations.test.ts`, `workers/core/tests/auth/resource-server-validation.test.ts` |
| KV resource-audience cache hit/miss/invalidate | `workers/core/tests/auth/audiences.test.ts` |
| Downstream JWT verifier helper | `packages/lib/src/resource-token-verifier.ts`, `workers/core/tests/auth/resource-token-verifier.test.ts` |
| Two-worker service binding smoke | `workers/ui/tests/service-binding.test.ts` |
| Architecture gates | `.oxlintrc.json`, `scripts/oxlint-js-plugins/architecture.js`, `workers/core/tests/oxlint-rules.test.ts` |

### 3.2 Email Current State

Current code:

- `workers/core/src/auth/get-auth.ts` sets `emailVerification.sendOnSignUp: true`.
- `workers/core/src/auth/get-auth.ts` sets `emailAndPassword.requireEmailVerification: true`.
- `workers/core/src/auth/get-auth.ts` does not set `emailAndPassword.disableSignUp: true`, so `POST /api/auth/sign-up/email` is currently public.
- `sendVerificationEmail` calls `storeVerificationEmailLink(env.KV, { email, url, token })`.
- `sendResetPassword` calls `storePasswordResetEmailLink(env.KV, { email, url, token })`.
- `workers/core/src/auth/adapters/storage-email.ts` stores a single JSON payload per lowercased email key.
- `workers/core/src/config/env.ts` has only `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DB`, and `KV`.
- `.dev.vars.example` already lists generic `EMAIL_FROM` and `EMAIL_PROVIDER_API_KEY`, but the Worker env type and runtime code do not use them.
- `workers/core/wrangler.jsonc` has no email-related vars or bindings.
- Tests bypass real verification by raw SQL updates to `"user"."emailVerified"`.

Email gaps:

- No actual email provider call exists.
- Verification and reset links are stored in KV without TTL.
- Verification/reset links and raw tokens are stored in clear text in KV. That is acceptable only as a local test capture mechanism, not production behavior.
- Better Auth docs recommend not awaiting email sends and using a serverless `waitUntil` style mechanism. Current `getAuth(env, validAudiences)` has no way to receive `ExecutionContext.waitUntil` from Hono.
- There is no test double for email delivery. Tests assert KV capture instead of an email adapter contract.
- There is no sender-domain setup checklist for SPF, DKIM, DMARC, API token, Sender logs, or verified `from.email`.

### 3.3 OAuth And UI Flow Current State

Configured OAuth UI paths:

| Flow | Config | Current UI state |
|---|---|---|
| Login | `loginPage: "/admin/login"` | Missing |
| Consent | `consentPage: "/admin/consent"` | Missing |
| Prompt create | `signup.page: "/admin/sign-up"` | Missing and should be removed from first-release config |
| Select account | `selectAccount.page: "/admin/select-account"` | Missing and should be removed from first-release config |
| Post-login org selection | `postLogin.page: "/admin/select-organization"` | Missing and should be removed from first-release config |

`workers/ui/src/app/admin/page.tsx` exists, but `workers/ui/wrangler.jsonc` points the deployed Worker at `workers/ui/src/main.ts`, which currently serves JSON for `/admin`. The real browser pages needed by OAuth are not implemented.

Better Auth OAuth Provider docs state that trusted clients with `skipConsent: true` bypass the consent screen, and otherwise the provider redirects to the configured `consentPage` with client and scope query details. The current code does not create a first-party trusted client by default, and no test proves `skipConsent`.

Browser deployment findings:

- `content-ui` should start `/api/auth/oauth2/authorize` as top-level browser navigation, not `fetch`. CORS is not needed for that redirect flow.
- In production, `id.quanghuy.dev` and `content.quanghuy.dev` are same-site under `quanghuy.dev`; token and consent `POST` calls can be kept same-origin by hosting/proxying the minimal auth pages on the auth origin.
- If hosted auth pages and API endpoints are split across origins, `/api/auth/oauth2/token` and `/api/auth/oauth2/consent` become browser `fetch` calls and would need CORS. First release should avoid that by treating preview `*.workers.dev` browser OAuth as unsupported.
- Shared cookies cannot be made to work across arbitrary `*.workers.dev` hosts because browsers reject cookies on public suffixes.
- Better Auth 1.6.11 uses cookie names derived from `advanced.cookiePrefix` and per-cookie overrides under `advanced.cookies`. Session token defaults to `better-auth.session_token` at runtime, with secure production prefixing when secure cookies are enabled.
- The code does not configure `advanced.crossSubDomainCookies`, `advanced.cookiePrefix`, or `advanced.cookies.session_token.name`, so it has no explicit production parent-domain cookie or collision protection against legacy `auther`.

Token lifetime findings from installed `@better-auth/oauth-provider@1.6.11`:

- `accessTokenExpiresIn` defaults to 3600 seconds.
- `m2mAccessTokenExpiresIn` defaults to 3600 seconds.
- `refreshTokenExpiresIn` defaults to 2592000 seconds.
- Refresh-token rotation is implemented natively: refresh exchange marks the old refresh-token row revoked and creates a new refresh token. Reuse of a revoked refresh token invalidates the client/user refresh-token family.

### 3.4 Admin And Resource-Server Current State

Admin state:

- New users default to `platformRole: "member"` in `workers/core/src/auth/get-auth.ts`.
- Better Auth Admin plugin uses native `user.role` for platform admin decisions. The installed Admin plugin supports `adminRoles` and `adminUserIds`, and its endpoints check admin permissions from the session user's native role.
- Tests promote admins with raw SQL.
- There is no `db:seed` command, first-admin CLI, or documented remote bootstrap path.
- `workers/core/src/auth/admin/actor.ts` and `workers/core/src/application/admin/authorization.ts` exist but have no production Hono callers after the dashboard route was removed.

Resource-server endpoint state:

- Mutating endpoints call `assertResourceServerAccess(...)`.
- `listResourceServers` and `getResourceServer` only require a session and do not filter by platform role, organization membership, or organization id.
- `createResourceServerBody` accepts optional `createdBy`, and `buildCreatePayload` trusts it when present.
- `updateResourceServerBody` accepts `enabled`. A caller can disable or re-enable through `PATCH` without going through `disableResourceServer`, which means `disabledAt` and `disabledBy` can be missing or stale.
- `resourceServer.slug` is documented as unique per organization in `docs/001_first-batch-plan.md`, but the current plugin schema and generated D1 table do not enforce `(organizationId, slug)` uniqueness.

### 3.5 Documentation And Deployment Drift

Observed drift:

- `docs/002_implementation-sequence.md` still says the dashboard endpoint exists in Phase 5.3, then later says it was removed in Phase 5.7.
- `docs/004_admin-api-reference.md` documents `GET /api/admin/dashboard`, but no route is registered in `workers/core/src/composition/create-app.ts`.
- `docs/006_resource-server-jwt-guide.md` says the helper source is `workers/core/src/auth/resource-token-verifier.ts`; the actual helper is `packages/lib/src/resource-token-verifier.ts`.
- `README.md` says `docs/007_cloudflare-deployment-runbooks.md` includes Email Service setup, but the runbook only mentions "any email provider secrets".
- `.github/workflows/ci.yml` runs checks, local D1 migration proof, and deploy dry-runs. It does not implement the manual deploy job described in `README.md`.
- `scripts/remote-smoke.mjs` verifies health, JWKS, metadata, and `/admin`, but it does not verify sign-up email, admin bootstrap, OAuth browser flow, token exchange, or resource-server runtime audience loading.

## 4. Blocker Gaps

### 4.1 Sender Transactional Email

Current production behavior would create or locate Better Auth verification/reset tokens, but no user receives an email. This blocks verified sign-in for admin-created users, password reset, organization invitations that require email, and realistic OAuth browser flows.

Required target:

- Use Sender REST API, not SMTP, because Cloudflare Workers can call HTTPS APIs with `fetch`.
- Keep the email provider behind a small adapter in `workers/core/src/auth/adapters/`.
- Add explicit env names:
  - `SENDER_API_TOKEN`
  - `EMAIL_FROM`
  - `EMAIL_FROM_NAME`
- Prefer replacing `.dev.vars.example` `EMAIL_PROVIDER_API_KEY` with `SENDER_API_TOKEN` for clarity when the implementation lands.
- Do not store raw verification/reset tokens in production KV.
- For tests, inject a fake email sender or a local capture adapter instead of using KV as production behavior.

### 4.2 OAuth Browser Pages And Consent

Authorization-code flows can redirect into missing UI routes. Admin UI can be deferred, but browser sign-in for `content-ui` cannot work without some hosted auth surface.

Better Auth behavior verified from docs and installed package:

- If no session exists, `/api/auth/oauth2/authorize` redirects to `loginPage` with a signed OAuth query.
- After sign-in creates a session, the OAuth Provider after-hook resumes authorization when the sign-in request includes the signed `oauth_query`.
- If the client has `skipConsent`, the provider can issue an authorization code after sign-in.
- If the client does not have `skipConsent` and no prior consent covers the requested scopes, the provider redirects to `consentPage`.
- The provider exposes `/api/auth/oauth2/consent`; it does not ship a built-in default consent UI.

Required target:

- Build only the two minimal hosted auth pages needed for first release, not a full admin UI:
  - `/admin/login` or a renamed `/login` page that posts to `/api/auth/sign-in/email` with `oauth_query`;
  - `/admin/consent` or a renamed `/consent` page that calls `/api/auth/oauth2/consent` as a hardcoded fallback for any future non-trusted client.
- For first-party `content-ui`, prefer setting `skip_consent: true` on the OAuth client through Better Auth's restricted admin create/update path, not through hard-coded source lists.
- For any non-trusted client, consent page is required.
- Remove `signup`, `selectAccount`, and `postLogin` OAuth page configuration from `workers/core/src/auth/get-auth.ts` until those pages are actually built. Their product intent belongs in `docs/003_future-implementation.md`.

Rejected option: assume a default Better Auth consent page exists. The docs show a configured `consentPage` and a consent endpoint; the page is application-owned.

Rejected option: keep configured redirect pages that do not exist because the redirect is "unlikely." Missing configured pages are latent production failures.

### 4.3 Bootstrap Admin

There is no path from empty production D1 to "an authorized admin can create clients and resource servers" without manual SQL. That is operationally fragile and bypasses the intended authorization model.

Required target:

- Add a one-time bootstrap endpoint, for example `POST /api/bootstrap/admin`, protected by `ID_BOOTSTRAP_TOKEN`.
- `ID_BOOTSTRAP_TOKEN` must be a long random Cloudflare secret.
- The endpoint must refuse to run after a native Better Auth admin exists.
- The endpoint should call official Better Auth server APIs where practical, especially `auth.api.createUser`, and set the native Better Auth admin role (`user.role = "admin"`).
- After bootstrap, remove or rotate `ID_BOOTSTRAP_TOKEN` so the route is unusable even before the "admin exists" guard runs.
- Document local and remote bootstrap through `pnpm wrangler` commands, not raw SQL pasted by hand.

Rejected option: use `BETTER_AUTH_SECRET` as a master key. It is auth cryptographic secret material, not an operator credential.

Rejected option: make a broad custom admin CLI. Once the first admin exists, use Better Auth Admin and OAuth Provider endpoints directly.

### 4.4 Resource-Server Read Authorization

`GET /api/auth/admin/resource-servers` and `GET /api/auth/admin/resource-servers/:id` currently require only `sessionMiddleware`. That leaks resource-server inventory across tenants to any signed-in user.

Required target:

- Platform `admin` can list/read all. Add `superadmin` only if Better Auth custom access control needs a separate role later.
- Organization owner/admin can list/read only their own organization's resource servers.
- Organization member cannot list/read admin resource-server data unless a product decision explicitly allows read-only visibility.
- Unauthenticated callers receive `401`.
- Cross-org reads receive `403` or filtered results depending on endpoint:
  - list should return only visible rows;
  - get by id should return `404` or `403` consistently. Prefer `404` for cross-org id probing resistance unless the API already exposes id existence elsewhere.

### 4.5 Runtime Audience Integration Proof

The code has the pieces:

- resource-server rows are created through the Better Auth plugin;
- `loadResourceAudiences` reads and caches enabled audiences;
- `registerAuthRoutes` loads audiences before constructing Better Auth;
- M2M token issuance works when `validAudiences` is passed directly in a test.

Missing proof:

- create resource server through the actual Worker/Hono route;
- request an OAuth token with that audience through `/api/auth/oauth2/token`;
- verify the JWT via `/api/auth/jwks`;
- disable the resource server;
- prove new token issuance for that audience fails after cache invalidation or expiry.

This is the core integration guarantee from `docs/001_first-batch-plan.md`, and it should be a P0 test.

### 4.6 Disable Public Sign-Up

The current first-release model is admin-created users only. Public registration creates an uncontrolled onboarding path before there is a consent page, invitation policy, abuse controls, and email deliverability monitoring.

Required target:

- Set `emailAndPassword.disableSignUp: true` in `workers/core/src/auth/get-auth.ts`.
- Keep `emailAndPassword.enabled: true` so admin-created users can still sign in with email/password.
- Create users through Better Auth Admin `createUser` after the first admin exists.
- Do not expose a first-release sign-up page.
- Move `prompt=create`, sign-up page, invite-only signup, domain-restricted signup, and password-recovery UX notes to future implementation unless explicitly pulled into first release.

Acceptance criteria:

- `POST /api/auth/sign-up/email` rejects public callers.
- Admin `createUser` remains available to native Better Auth admins.
- Tests prove public sign-up is closed and admin user creation is the supported path.

### 4.7 Production Cookie And Preview Boundary

Browser OAuth needs the Better Auth session cookie to survive across the production auth and content subdomains.

Required target:

- Configure Better Auth advanced cookies for production:
  - `advanced.crossSubDomainCookies.enabled: true`
  - `advanced.crossSubDomainCookies.domain: ".quanghuy.dev"`
  - `advanced.cookiePrefix: "id-auth"` or an explicit `advanced.cookies.session_token.name`, for example `"id-auth.session_token"`
- Prefer `advanced.cookiePrefix: "id-auth"` unless there is a reason to override only one cookie. A prefix avoids collisions for `session_token`, `session_data`, `account_data`, and future Better Auth cookies, not just the primary session token.
- Keep the explicit cookie prefix permanently. It is not a temporary migration flag.
- Do not support browser OAuth on `*.workers.dev` preview domains. Preview supports API-only smoke, M2M OAuth, admin API, and Worker health/JWKS checks.
- Register production redirect URIs only for browser clients. Do not create dynamic preview redirect URIs for `content-ui`.
- Do not add broad CORS middleware for OAuth as a workaround for preview. Top-level authorize redirects do not need CORS, and production token/consent calls should remain same-site.

Acceptance criteria:

- A production login at `id.quanghuy.dev` sets an `id-auth...` session cookie scoped to `.quanghuy.dev`.
- Legacy `auther` and new `id` cookies can coexist during migration.
- Preview smoke docs clearly state "API-only; no browser OAuth."

### 4.8 OAuth Token Lifetimes And Refresh Rotation

The installed OAuth Provider defaults are not the desired product policy. First release should be explicit so downstream apps can design session refresh behavior correctly.

Required target:

- Set OAuth Provider `accessTokenExpiresIn: 10800` for a 3-hour user access token lifetime.
- Decide whether M2M should also use 3 hours by setting `m2mAccessTokenExpiresIn: 10800`, or keep a separate shorter M2M policy and document it. Do not leave it implicit.
- Set `refreshTokenExpiresIn: 604800` for a 7-day refresh token lifetime.
- Rely on Better Auth's native refresh-token rotation. In 1.6.11, refresh exchange revokes the old refresh-token row and creates a new one; replay of a revoked refresh token invalidates the refresh-token family for that client/user.
- Require `offline_access` in browser authorization requests when `content-ui` needs refresh tokens.

Acceptance criteria:

- Authorization-code exchange returns `expires_in` near 10800 and a refresh token when `offline_access` is requested.
- Refresh-token grant returns a new access token and a new refresh token.
- Replaying the old refresh token is rejected and covered by tests.

## 5. High-Priority Non-Blocker Gaps

| Gap | Impact | Target |
|---|---|---|
| Custom `platformRole` duplicates Better Auth Admin `user.role` | Official Admin plugin endpoints and local policy can disagree. | Use native `user.role` as platform access source of truth; keep org membership roles separate. |
| No generic API-only operator helper | Operators may fall back to ad hoc curl, UI work, or endpoint-specific scripts. | Add a thin request helper that calls arbitrary paths, gates on `pnpm wrangler whoami`, and does not accept raw admin API keys through env vars or command arguments. |
| No explicit Better Auth rate-limit config | Defaults may be okay in production, but Cloudflare IP headers and stricter auth/token rules are not intentional. | Configure `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"]` and `rateLimit` with `storage: "secondary-storage"`. |
| OAuth token type behavior untested | Downstream apps may treat opaque tokens as JWTs. | Test `resource` present -> JWT; no `resource` -> opaque/server-validated token. |
| Refresh/introspection/revocation untested | Incident and long-lived session behavior is unproven. | Add endpoint tests with real issued tokens, including refresh-token rotation and old-token replay rejection. |
| UserInfo untested | OIDC client integration may fail late. | Test `/api/auth/oauth2/userinfo` with `openid email profile`. |
| Organization invitations untested | Tenant onboarding depends on this. | Test invite and accept flows. |
| Extra OAuth prompt pages are configured but not built | `prompt=create`, `prompt=select_account`, and post-login org selection can redirect to dead routes. | Remove `signup`, `selectAccount`, and `postLogin` config from first release; keep future notes in `docs/003_future-implementation.md`. |
| OAuth client management authorization unproven | `clientPrivileges` allows read/list for any signed-in user. | Add tests for platform admin, org owner/admin, member, and cross-org behavior. |
| Client/resource relationship not proven | `referenceId` and `org_id` behavior for browser and M2M clients is not asserted. | Test client creation with active organization/reference id and token claims. |
| Preview browser OAuth would be misleading | `*.workers.dev` cannot share parent-domain cookies and dynamic preview redirect URIs should not be registered. | Document preview as API-only; production browser clients use fixed `*.quanghuy.dev` redirect URIs. |
| Docs drift | Engineers may call routes that do not exist. | Update docs after implementation decisions. |
| CI deploy claims drift | Manual deployment may be assumed but not present. | Either implement deploy workflow or correct README/runbook. |

## 6. Sender Target Model

### 6.1 Provider Facts

Current Sender facts from primary docs:

- The Free Forever plan offers up to 2,500 subscribers and 15,000 emails monthly and does not expire.
- Transactional email is available on all Sender plans, including Free.
- Sender REST transactional sends use `POST https://api.sender.net/v2/message/send`.
- Requests use `Authorization: Bearer <token>`, `Content-Type: application/json`, and a body with `from`, `to`, `subject`, and optional `text`, `html`, `headers`, `variables`, and `attachments`.
- Sender requires the `from.email` domain to be verified. Setup requires domain ownership and SPF, DKIM, and DMARC records for reliable delivery.
- The API response example includes `success`, `message`, and `emailId`.
- Sender enforces per-minute rate limits per API token. The exact limit is returned in `X-RateLimit-Limit`; callers should inspect `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and handle `429` with `Retry-After`.

Conclusion: Sender is viable for the first batch if the account/domain is configured before deploy and the Worker treats provider failure as an operational error to surface in logs and smoke checks.

### 6.2 Recommended Worker Integration

Add a small adapter rather than calling Sender inline from `get-auth.ts`.

Recommended files:

| File | Purpose |
|---|---|
| `workers/core/src/auth/adapters/sender-email.ts` | Low-level Sender API client using `fetch`. |
| `workers/core/src/auth/adapters/auth-email.ts` | Auth-specific verification/reset message builders and sender abstraction. |
| `workers/core/tests/helpers/test-email.ts` | In-memory capture helper for tests, if needed. |
| `workers/core/src/config/env.ts` | Add `SENDER_API_TOKEN`, `EMAIL_FROM`, `EMAIL_FROM_NAME`. |
| `workers/core/src/auth/get-auth.ts` | Use injected auth email sender in Better Auth callbacks. |
| `workers/core/src/http/routes/auth-mount.ts` | Pass `c.executionCtx.waitUntil(...)` or equivalent background task runner into the auth factory. |

Recommended types:

```ts
export type AuthEmailKind = "password-reset" | "verification";

export type AuthEmailMessage = {
  readonly kind: AuthEmailKind;
  readonly to: string;
  readonly url: string;
};

export type AuthEmailSender = {
  readonly send: (message: AuthEmailMessage) => Promise<void>;
};

export type BackgroundTaskRunner = {
  readonly waitUntil: (task: Promise<unknown>) => void;
};
```

Recommended callback behavior:

- In production Worker requests, schedule the email send through `waitUntil`.
- In unit tests, use an injected sender and await it deterministically.
- If no `waitUntil` is available, returning the email promise is acceptable in tests and CLI contexts, but production Hono should pass the runner.
- Do not log raw `url`, `token`, API token, or authorization headers.

### 6.3 Email Templates And Data Handling

First-release templates should be simple, owned in code, and provider-neutral:

| Email | Subject | Required content |
|---|---|---|
| Verification | `Verify your email for id` | One link to Better Auth verification URL, expiry note, ignore-if-unrequested copy. |
| Password reset | `Reset your id password` | One link to Better Auth reset URL, expiry note, ignore-if-unrequested copy. |

Data rules:

- Send one recipient per API call.
- Use both `text` and `html`.
- HTML-escape URLs and user-controlled display values.
- Do not include the raw token separately when the URL already contains it.
- Do not store verification/reset links in KV in production.
- If a local capture adapter is retained, guard it behind test/local configuration and write with a short TTL.

### 6.4 Failure Policy

Better Auth docs advise avoiding awaited email sends to reduce timing attack risk. That creates a product tradeoff: admin user creation, verification resend, or reset request may return success while the background email send later fails.

First-release policy:

- Verification and reset request responses should not reveal whether a mailbox exists or whether Sender accepted the message.
- Background email send failures should be logged as structured operational events with redacted fields.
- A remote smoke command should be able to send one test message to an operator-controlled mailbox and assert Sender accepted it.
- For `429`, respect `Retry-After` only for short retries that fit within Worker execution limits. Do not build a durable retry queue in the first batch.
- If durable retry becomes necessary, add a queue-backed email outbox in a later batch instead of blocking auth responses on provider availability.

## 7. API-Only Admin Operations Target Model

### 7.1 Native Better Auth Platform Admin

Use Better Auth's native Admin plugin as the platform-admin model. The source of truth for platform access should be `user.role`, not the repo's current custom `platformRole` field.

Recommended first-release role model:

| Concern | Source of truth | Notes |
|---|---|---|
| Platform admin | Better Auth `user.role` | Use `admin` first. Add `superadmin` only if custom access control needs different permissions. |
| Organization access | Better Auth Organization plugin membership role | `owner`, `admin`, and `member` remain org-scoped and separate from platform admin. |
| Resource-server plugin access | Native `user.role` plus org membership | Platform `admin` can manage all; org owner/admin can manage own org rows. |

Implementation direction:

- Configure `admin()` with native roles rather than relying on `platformRole`.
- Remove `platformRole` from new policy paths, or keep it only as a temporary compatibility mirror with a deletion task.
- Update `clientPrivileges` in `workers/core/src/auth/get-auth.ts` to use `user.role`.
- Update `idResourceServer` authorization callback types and tests to use native `role`.
- Keep organization owner/admin policy separate. Platform admin is not the same as organization membership.

### 7.2 One-Time Bootstrap

The only custom privileged operation needed before normal Better Auth admin operation is first-admin bootstrap.

Target shape:

```text
POST /api/bootstrap/admin
Authorization: Bearer <ID_BOOTSTRAP_TOKEN>
```

Request body:

```json
{
  "email": "admin@example.com",
  "password": "long-random-initial-password",
  "name": "Root Admin",
  "organization": {
    "name": "Default",
    "slug": "default"
  }
}
```

Rules:

- `ID_BOOTSTRAP_TOKEN` is a long random Cloudflare secret.
- The route refuses to run if any user already has a native admin role.
- The route creates the user through Better Auth server APIs where practical.
- The created user gets native `role: "admin"`.
- The created user is email-verified because this is an operator bootstrap path, not public sign-up.
- The route creates the default organization through Better Auth Organization APIs where practical.
- After success, the operator removes or rotates `ID_BOOTSTRAP_TOKEN` through `pnpm wrangler secret`.

This route is not a general seed script and not a backdoor. It exists only to solve the first-admin problem.

### 7.3 Wrangler-Gated Generic Request Helper

API-only operation should be simpler than raw `curl`, but it must not become a custom admin SDK. The helper should be generic enough to call any current or future Better Auth/plugin endpoint without new command code.

Recommended shape:

```bash
pnpm auth:api POST /api/auth/admin/create-user '{"email":"a@example.com","password":"...","name":"A","role":"admin"}'
pnpm auth:api POST /api/auth/oauth2/create-client '{"client_name":"content-api","redirect_uris":["https://content.example.com/callback"],"grant_types":["client_credentials"],"response_types":["code"],"scope":"api:read"}'
pnpm auth:api POST /api/auth/admin/resource-servers '{"organizationId":"org_1","slug":"content-api","name":"content-api","audience":"https://content-api.example.com"}'
pnpm auth:api GET /api/auth/admin/list-users
```

Hard constraints:

- The helper is curl-like: method, path, optional inline JSON body.
- The helper must not define endpoint-specific subcommands such as `create-user` or `create-client`.
- The helper must not accept a raw admin API key through an environment variable or command argument.
- The helper must run `pnpm wrangler whoami` first and fail if the local operator is not authenticated with Wrangler.
- The helper should use a Better Auth session cookie obtained by an interactive sign-in flow, or another explicitly documented Wrangler-gated credential path. Do not require static IP or MAC address checks.
- If a local session cache is introduced, store only a session cookie with a clear expiry and a logout command; do not store a long-lived admin API key.

This gives local API-only ergonomics without committing to a custom CLI surface.

### 7.4 API Key Position

Better Auth's API Key plugin is useful, but it should not be the first bootstrap mechanism.

Recommended sequencing:

1. Bootstrap first admin with the one-time bootstrap token.
2. Use native Better Auth admin session for ordinary API-only operation.
3. Add `@better-auth/api-key` only when there is a concrete need for non-interactive automation.
4. If `enableSessionForAPIKeys` is enabled, treat those keys as admin-equivalent credentials and keep them short-lived, revocable, and rate-limited.
5. Do not pass raw admin API keys through `ID_ADMIN_API_KEY=... pnpm ...` flows.

Better Auth API keys can be created by server API calls with a `userId` and permissions. That is useful for automation after the admin user exists. It does not remove the need for first-admin bootstrap because a key still needs an owner and a configured plugin schema.

Rejected option: use Better Auth CLI as a generic endpoint caller. The documented CLI covers initialization, schema generation, migrations, secret generation, and diagnostics; it is not a generic way to call arbitrary Admin/OAuth Provider/plugin endpoints from `auth.ts`.

## 8. Browser OAuth Target Model

### 8.1 Why Minimal Auth Pages Are Required

`content-ui` is the browser-facing client for user sign-in. It can start the OAuth flow, receive the callback, store its own application session, and call `content-api`. It cannot replace the IdP login page unless the IdP deliberately redirects to a surface that can create a Better Auth session on the auth service.

Better Auth OAuth Provider expects this sequence:

1. `content-ui` redirects the browser to `/api/auth/oauth2/authorize`.
2. If the user has no Better Auth session, the provider redirects to `loginPage` with a signed OAuth query.
3. The login page posts credentials to `/api/auth/sign-in/email` and includes the signed OAuth query as `oauth_query`.
4. Better Auth creates the session cookie and the OAuth Provider resumes authorization.
5. If consent is skipped or already granted, the provider redirects to `content-ui`'s callback with `code`, `state`, and `iss`.
6. `content-ui` exchanges the code at `/api/auth/oauth2/token`.
7. `content-ui` receives tokens and can call `content-api` with a resource-bound JWT.

Therefore a minimal login page is P0 for browser sign-in. This is not the same as building the admin dashboard.

### 8.2 Consent Behavior

Better Auth consent behavior is explicit:

- Non-trusted clients require consent unless existing stored consent covers the requested scopes.
- Trusted clients are clients with `skipConsent`.
- `prompt=consent` forces consent even if consent already exists.
- The provider redirects to `consentPage` when consent is required.
- The application-owned consent page calls `/api/auth/oauth2/consent` with `accept: true` or `accept: false`.

There is no default consent page in the installed OAuth Provider. A page must be built, or every first-release browser client must be trusted with `skip_consent: true`.

### 8.3 Trusted Clients Without Hard Config

The previous hard-config approach can be avoided.

Better Auth supports a `skip_consent` field on OAuth clients. Docs identify `skip_consent` as a restricted field that admin users can set through server-only admin OAuth client create/update APIs. The installed schema also includes `oauthClient.skipConsent`.

Recommended first-release approach:

- Do not maintain a source-code list of trusted client ids.
- Use native Better Auth admin APIs to create `content-ui` as a trusted first-party client with `skip_consent: true`.
- Still ship a tiny consent page as a hardcoded fallback because it is cheap and prevents the next non-trusted client from discovering a dead redirect in production.
- Do not use `cachedTrustedClients` for first-party trust. It is hard configuration and cached clients are immutable through CRUD endpoints.

### 8.4 Production Domain, Cookies, And Preview Boundary

Production browser OAuth target:

| Concern | Target |
|---|---|
| Auth origin | `https://id.quanghuy.dev` |
| Browser client origin | `https://content.quanghuy.dev` |
| Shared cookie domain | `.quanghuy.dev` |
| Better Auth cookie config | `advanced.crossSubDomainCookies: { enabled: true, domain: ".quanghuy.dev" }` |
| Collision avoidance | `advanced.cookiePrefix: "id-auth"` or explicit `advanced.cookies.session_token.name` |
| Redirect URIs | Production `content-ui` callback URIs only |

Use top-level browser navigation for `/api/auth/oauth2/authorize`. Do not call authorize with `fetch`.

CORS policy:

- Same-site production browser OAuth should not need broad CORS.
- If a hosted auth page makes a browser `fetch` to `/api/auth/oauth2/token` or `/api/auth/oauth2/consent` from a different origin, that specific cross-origin case would need CORS. First release should avoid that topology.
- Preview `*.workers.dev` is API-only. Do not attempt browser OAuth there and do not register preview callback URLs.

Cookie collision policy:

- During migration, legacy `auther` and new `id` can both run under `.quanghuy.dev`.
- If both use Better Auth defaults and both set parent-domain cookies, a single default cookie slot can be overwritten by whichever IdP writes last.
- Configure `id` with a unique prefix/name now. Keeping that name after `auther` is decommissioned is fine.

### 8.5 OAuth Token Lifetimes And Refresh Rotation

First-release token policy:

| Token | Lifetime | Config |
|---|---:|---|
| User access token | 3 hours | `accessTokenExpiresIn: 10800` |
| Refresh token | 7 days | `refreshTokenExpiresIn: 604800` |
| M2M access token | Explicitly decide before implementation | `m2mAccessTokenExpiresIn` |

Better Auth 1.6.11 already rotates refresh tokens on the refresh grant. The implementation should rely on that native behavior and test it instead of adding custom rotation state.

`content-ui` must request `offline_access` if it should avoid forcing users to re-authenticate every 3 hours.

### 8.6 Public Sign-Up Policy

First release is not public self-service registration.

Target behavior:

- `POST /api/auth/sign-up/email` is disabled through `emailAndPassword.disableSignUp: true`.
- User creation goes through Better Auth Admin `createUser`.
- The hosted login page signs in existing/admin-created users only.
- Sign-up, `prompt=create`, invitation-aware registration, and domain-restricted onboarding are future implementation notes, not live config.

## 9. Missing Tests

### T1. Sender Adapter Unit Tests

Scope:

- `workers/core/src/auth/adapters/sender-email.ts`
- `workers/core/tests/auth/sender-email.test.ts`

Assertions:

- Sends `POST https://api.sender.net/v2/message/send`.
- Uses `Authorization: Bearer <token>` without logging the token.
- Sends `from.email`, `from.name`, `to.email`, `subject`, `text`, and `html`.
- Treats non-2xx and `success: false` as failed sends.
- Captures `emailId` for success observability without exposing private link data.
- Handles `429` and exposes retry metadata from `Retry-After`/rate-limit headers.

### T2. Better Auth Email Callback Tests

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/auth-core.test.ts`

Assertions:

- Public `POST /api/auth/sign-up/email` is disabled when `emailAndPassword.disableSignUp: true`.
- The supported verification-email path schedules or calls the verification email sender.
- Unverified sign-in triggers verification behavior expected by Better Auth config.
- Password reset schedules or calls reset email sender.
- Tests no longer depend on production KV token storage.

### T3. Authorization Code + PKCE

Scope:

- `workers/core/tests/auth/oauth-auth-code.test.ts`

Assertions:

- Create a public or confidential client with `authorization_code` and `refresh_token`.
- Use S256 `code_challenge`.
- Start at `/api/auth/oauth2/authorize` and assert unauthenticated users redirect to the configured login page.
- Submit sign-in through `/api/auth/sign-in/email` with the signed `oauth_query` from the login redirect.
- Assert the OAuth Provider resumes after sign-in.
- Complete consent through `/api/auth/oauth2/consent`, or prove `skip_consent: true` bypasses consent for the trusted `content-ui` client.
- Exchange code with correct verifier.
- Mismatched verifier is rejected.
- Resulting resource-bound access token verifies through JWKS.
- `expires_in` reflects the configured 3-hour access token lifetime.
- `offline_access` returns a refresh token.

### T4. Token Type Behavior

Assertions:

- `resource` present and valid -> access token is JWT and verifies with JWKS.
- `resource` absent -> token is opaque or not treated as a resource JWT.
- Invalid resource audience is rejected.
- Disabled resource audience is rejected after invalidation/expiry.

### T5. UserInfo, Introspection, Revocation, Refresh

Assertions:

- `/api/auth/oauth2/userinfo` returns expected OIDC claims for an access token with `openid`.
- `/api/auth/oauth2/introspect` returns active state for a live token.
- `/api/auth/oauth2/revoke` invalidates the relevant token.
- `grant_type=refresh_token` produces a new access token and a new refresh token.
- Replaying the old refresh token is rejected.
- Reuse of a revoked refresh token invalidates the refresh-token family as Better Auth implements it.

### T6. Organization Invitations

Assertions:

- Owner/admin invites a member.
- Invitee accepts.
- Email verification requirement is handled.
- Invitee membership is visible to admin policy code.

### T7. Resource-Server Authorization And Audit

Assertions:

- Member cannot list all resource servers.
- Org owner/admin sees only own org rows unless platform admin.
- Cross-org `GET :id` is denied or hidden consistently.
- `createdBy` is always the actor id, never request body input.
- Disable path stamps `disabledAt` and `disabledBy`.
- `PATCH enabled` cannot bypass disable/re-enable audit policy.

### T8. OAuth Prompt And UI Redirects

Assertions:

- Missing login/consent pages fail the browser flow and are not acceptable for `content-ui`.
- Minimal hosted login page preserves and submits the signed `oauth_query`.
- Minimal hosted consent page calls `/api/auth/oauth2/consent` and follows its returned `redirect_uri`.
- `prompt=create`, `prompt=select_account`, and post-login org selection are not configured in first release unless their pages exist.
- First-party trusted client does not hit missing `/admin/consent`.

### T9. Cookie And Preview Boundary

Assertions:

- Production auth config sets `advanced.crossSubDomainCookies.domain` to `.quanghuy.dev`.
- Session cookie uses an `id`-specific prefix/name and does not use the Better Auth default.
- Preview configuration or runbook marks browser OAuth as unsupported on `*.workers.dev`.
- OAuth browser client redirect URIs are production URIs only.

### T10. Runtime Audience Worker Integration

Assertions:

- Through `createApp()`, create a resource server row, issue a token for its audience, verify it.
- Disable the row through the plugin endpoint.
- Confirm cache invalidation and new token rejection.
- Confirm D1/KV failures fail closed for new token issuance.

### T11. Native Admin Bootstrap And API-Only Operation

Assertions:

- `POST /api/bootstrap/admin` rejects missing or wrong `ID_BOOTSTRAP_TOKEN`.
- Bootstrap creates exactly one native Better Auth admin user.
- Bootstrap refuses to run once an admin exists.
- Native `user.role = "admin"` can call Better Auth Admin endpoints.
- A non-admin user cannot call platform admin endpoints.
- `pnpm auth:api` fails before sending requests when `pnpm wrangler whoami` fails.
- `pnpm auth:api` can call an arbitrary Better Auth/plugin path with inline JSON and does not require endpoint-specific command code.

### T12. content-ui Full Browser Sign-In Smoke

Assertions:

- `content-ui` starts authorization-code + PKCE with `resource=<content-api audience>`.
- Auth service redirects unauthenticated browser to hosted login page.
- Login page signs in through Better Auth and resumes the OAuth flow.
- Trusted `content-ui` client with `skip_consent: true` returns directly to callback, or non-trusted client goes through hosted consent page.
- Callback exchanges code for tokens.
- Access token is a resource-bound JWT accepted by the downstream verifier.
- Refresh-token grant extends the session without a full re-login and rotates the refresh token.

## 10. Integration Scenario: content-api

### content-api as resource server

Minimum needed:

- `resourceServer.audience` registered as the expected API audience, for example `https://content-api.quanghuy.dev`.
- `packages/lib/src/resource-token-verifier.ts` imported by downstream code or copied as a contract.
- JWT verification configured with:
  - issuer: `https://<core-host>/api/auth`;
  - JWKS URL: `https://<core-host>/api/auth/jwks`;
  - audience: content API audience;
  - required scopes per route;
  - `org_id` check for organization-scoped routes.

Current readiness:

| Requirement | Status |
|---|---|
| JWKS endpoint | Implemented and tested |
| JWT verifier helper | Implemented and tested |
| Runtime audience loading | Implemented in pieces; missing Worker-level integration proof |
| Disable resource server behavior | Implemented in pieces; missing token issuance rejection proof |
| Org claim behavior | Configured; insufficient auth-code and M2M claim tests |

### content-api API-only first integration

Minimum needed:

- bootstrap native Better Auth admin;
- use API-only operation to create an OAuth client for server-side or M2M usage;
- create a resource server for the content API audience;
- issue `client_credentials` tokens with `resource=<content-api audience>`;
- verify the access token is a JWT and passes `packages/lib/src/resource-token-verifier.ts`.

Current blockers:

- No first-admin bootstrap endpoint.
- Platform admin policy still uses custom `platformRole`.
- No Wrangler-gated generic API helper.
- Missing Worker-level runtime audience proof.
- Missing Sender email delivery.

### content-ui browser sign-in integration

Use `content-ui` as the name for the browser-facing client. Avoid `content-api-ui`; `content-api` is the API/resource server.

Minimum needed:

- create a public or confidential OAuth client named `content-ui`;
- configure exact redirect URI(s);
  - use production redirect URIs only, not preview `*.workers.dev` callbacks;
- decide trusted status:
  - first-party trusted: set `skip_consent: true` through Better Auth admin OAuth client creation/update;
  - non-trusted: build hosted consent page before use;
- provide a hosted IdP login page that can post to `/api/auth/sign-in/email` with the signed `oauth_query`;
- run full authorization-code + PKCE from browser redirect through token exchange;
- request `resource=<content-api audience>` so the API access token is a JWT accepted by `content-api`.

Current blockers:

- No hosted login page exists.
- No hosted consent page exists for non-trusted clients.
- No full browser-style auth-code + PKCE test exists.
- No explicit production cookie-domain/cookie-name policy exists.
- No refresh-token rotation test exists for `content-ui`.
- Current docs overstate API-only readiness if `content-ui` sign-in is part of the first integration.

## 11. Implementation Backlog

### P0-A. Wire Sender Transactional Email

Scope:

- `workers/core/src/auth/adapters/sender-email.ts`
- `workers/core/src/auth/adapters/auth-email.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/http/routes/auth-mount.ts`
- `workers/core/src/config/env.ts`
- `.dev.vars.example`
- `README.md`
- `docs/007_cloudflare-deployment-runbooks.md`

Tasks:

- [ ] Add `SENDER_API_TOKEN`, `EMAIL_FROM`, and `EMAIL_FROM_NAME` to `CoreEnv`.
- [ ] Replace generic `.dev.vars.example` `EMAIL_PROVIDER_API_KEY` with `SENDER_API_TOKEN`, or explicitly map the generic name in code.
- [ ] Implement Sender REST client with typed success/failure results.
- [ ] Implement verification and reset email builders.
- [ ] Inject or construct `AuthEmailSender` in the auth factory.
- [ ] Pass a background task runner from Hono to Better Auth callbacks.
- [ ] Remove production reliance on `storage-email.ts`, or restrict it to tests/local capture with TTL.
- [ ] Add unit tests with mocked `fetch`.
- [ ] Add runbook steps for Sender account, API token, verified domain, SPF/DKIM/DMARC, and log inspection.

Acceptance criteria:

- A supported verification-email path sends through Sender in a smoke environment.
- Password reset sends a reset email through Sender in a smoke environment.
- Tests prove request shape and failure handling without calling Sender.
- No raw token, URL, API key, or authorization header is logged.

### P0-B. Disable Public Email/Password Sign-Up

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/auth-core.test.ts`
- `docs/005_oauth2-oidc-integration-guide.md`
- `README.md`

Tasks:

- [ ] Set `emailAndPassword.disableSignUp: true`.
- [ ] Keep email/password sign-in enabled for admin-created users.
- [ ] Add tests proving `POST /api/auth/sign-up/email` is rejected.
- [ ] Add tests proving Better Auth Admin `createUser` remains the supported creation path after bootstrap.
- [ ] Remove first-release docs that imply public self-service sign-up exists.

Acceptance criteria:

- Public sign-up is closed.
- Admin-only user creation is documented and tested.

### P0-C. Use Native Better Auth Admin Role

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/auth/admin/access.ts`
- `workers/core/src/auth/admin/actor.ts`
- `workers/core/src/auth/plugins/resource-server/types.ts`
- `workers/core/src/auth/plugins/resource-server/index.ts`
- `workers/core/tests/auth/**`
- `workers/core/tests/application/admin-authorization.test.ts`

Tasks:

- [ ] Configure Better Auth Admin plugin with native `user.role` as platform access source of truth.
- [ ] Replace `platformRole` checks in OAuth `clientPrivileges` with native `role`.
- [ ] Replace resource-server authorization callback `platformRole` argument with native `role`.
- [ ] Decide whether `superadmin` is needed. Default to `admin` unless custom access control needs a separate role.
- [ ] Update tests that currently promote users through `"platformRole"` SQL.
- [ ] Add migration or compatibility plan to stop relying on `platformRole`.

Acceptance criteria:

- Native Better Auth Admin plugin endpoints and local resource-server policy agree on who is a platform admin.

### P0-D. Add One-Time Bootstrap Endpoint

Scope:

- `workers/core/src/http/routes/bootstrap.routes.ts`
- `workers/core/src/composition/create-app.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/config/env.ts`
- `workers/core/tests/auth/bootstrap.test.ts`
- `README.md`
- `docs/007_cloudflare-deployment-runbooks.md`

Tasks:

- [ ] Add `ID_BOOTSTRAP_TOKEN` to `CoreEnv` and secret documentation.
- [ ] Implement `POST /api/bootstrap/admin`.
- [ ] Require `Authorization: Bearer <ID_BOOTSTRAP_TOKEN>`.
- [ ] Refuse to run if any native admin already exists.
- [ ] Create the user through Better Auth server APIs where practical.
- [ ] Set native `role: "admin"` and verified email state.
- [ ] Create the default organization through Better Auth APIs where practical.
- [ ] Document `pnpm wrangler secret put ID_BOOTSTRAP_TOKEN`, first call, and immediate secret removal/rotation.

Acceptance criteria:

- A fresh local or remote D1 can be bootstrapped into one native Better Auth admin without manual SQL and without leaving the bootstrap token useful afterward.

### P0-E. Add Wrangler-Gated Generic API Helper

Scope:

- `scripts/auth-api.mjs`
- `package.json`
- `README.md`
- `docs/007_cloudflare-deployment-runbooks.md`

Tasks:

- [ ] Add a generic `pnpm auth:api <METHOD> <PATH> [inline-json]` helper.
- [ ] Make the helper call `pnpm wrangler whoami` and fail before sending any request when Wrangler auth is unavailable.
- [ ] Support inline JSON bodies so common calls do not require temporary JSON files.
- [ ] Do not add endpoint-specific subcommands.
- [ ] Do not accept admin API keys through env vars, CLI args, or checked-in config.
- [ ] Use native Better Auth session-cookie login first, or document another Wrangler-gated credential path before enabling it.
- [ ] Add `auth:api:logout` only if a local session cache is implemented.

Acceptance criteria:

- Operators can call official Better Auth Admin, OAuth Provider, and repo plugin endpoints without an admin UI, custom per-endpoint wrappers, or raw API-key env flows.

### P0-F. Enforce Resource-Server Read Authorization

Scope:

- `workers/core/src/auth/plugins/resource-server/index.ts`
- `workers/core/src/auth/plugins/resource-server/types.ts`
- `workers/core/tests/auth/resource-server-plugin.test.ts`

Tasks:

- [ ] Extend plugin authorization handling to list/get endpoints.
- [ ] Filter list results by visible organization for org owner/admin.
- [ ] Decide `403` vs `404` for cross-org `GET :id`; prefer `404`.
- [ ] Add platform admin, org owner/admin, org member, unauthenticated, and cross-org tests.

Acceptance criteria:

- Non-admin members cannot enumerate resource-server rows outside their authorization boundary.

### P0-G. Add Runtime Audience Worker Integration Test

Scope:

- `workers/core/src/composition/create-app.ts`
- `workers/core/tests/auth/oauth-flows.test.ts` or new Worker-level test

Tasks:

- [ ] Exercise `createApp()` rather than `auth.handler(...)` directly.
- [ ] Create a resource server through `/api/auth/admin/resource-servers`.
- [ ] Issue a token for that audience.
- [ ] Verify JWT through `/api/auth/jwks`.
- [ ] Disable the resource server.
- [ ] Prove new token issuance fails after invalidation.

Acceptance criteria:

- The runtime-managed audience table is proven to feed OAuth Provider `validAudiences` in the actual Worker route path.

### P0-H. Add Minimal Hosted Auth Pages For content-ui

Scope:

- `workers/ui/src/app/admin/login/**` or a renamed hosted auth route
- `workers/ui/src/app/admin/consent/**` or a renamed hosted auth route
- `workers/ui/src/main.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/oauth-auth-code.test.ts`
- `workers/ui/tests/**`
- `docs/005_oauth2-oidc-integration-guide.md`

Tasks:

- [ ] Decide route names. Current config uses `/admin/login` and `/admin/consent`; keep them or rename both config and docs together.
- [ ] Build a minimal login page that preserves the signed OAuth query and posts it as `oauth_query` to `/api/auth/sign-in/email`.
- [ ] Build a minimal hardcoded consent fallback page that displays client/scopes and calls `/api/auth/oauth2/consent`.
- [ ] Remove `signup`, `selectAccount`, and `postLogin` from `oauthProvider(...)` options until those pages exist.
- [ ] Create `content-ui` OAuth client with exact redirect URI and `skip_consent: true` if it is trusted first-party.
- [ ] Prove non-trusted clients hit consent page.
- [ ] Prove trusted `content-ui` bypasses consent but still completes login and token exchange.
- [ ] Keep full admin dashboard/users/client management UI out of this workstream.

Acceptance criteria:

- `content-ui` can complete authorization-code + PKCE through a real hosted login page and receive a resource-bound JWT for `content-api`.
- Non-trusted clients have a working consent path.

### P0-I. Configure Production Cookies And Preview Boundary

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/auth-core.test.ts` or a focused cookie config test
- `docs/005_oauth2-oidc-integration-guide.md`
- `docs/007_cloudflare-deployment-runbooks.md`
- `README.md`

Tasks:

- [ ] Add `advanced.crossSubDomainCookies.enabled: true`.
- [ ] Add `advanced.crossSubDomainCookies.domain: ".quanghuy.dev"` for production.
- [ ] Add `advanced.cookiePrefix: "id-auth"` or explicit `advanced.cookies.session_token.name`.
- [ ] Prefer `advanced.cookiePrefix: "id-auth"` to avoid collisions for all Better Auth cookies.
- [ ] Document that browser OAuth works only on production `*.quanghuy.dev` domains.
- [ ] Document that preview `*.workers.dev` is API-only and does not support browser OAuth.
- [ ] Ensure browser OAuth clients use production redirect URIs only.

Acceptance criteria:

- Better Auth session cookies are parent-domain cookies for `.quanghuy.dev` and cannot collide with legacy `auther` defaults.
- Preview runbooks do not promise browser OAuth.

### P0-J. Configure Token Lifetimes And Refresh Rotation Tests

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/oauth-auth-code.test.ts`
- `workers/core/tests/auth/oauth-flows.test.ts`
- `docs/005_oauth2-oidc-integration-guide.md`

Tasks:

- [ ] Set `accessTokenExpiresIn: 10800`.
- [ ] Set `refreshTokenExpiresIn: 604800`.
- [ ] Decide and set `m2mAccessTokenExpiresIn` explicitly.
- [ ] Ensure `offline_access` is requested and allowed for `content-ui` refresh behavior.
- [ ] Test authorization-code exchange returns a refresh token when `offline_access` is requested.
- [ ] Test refresh-token grant returns a new access token and a new refresh token.
- [ ] Test replaying the old refresh token is rejected.

Acceptance criteria:

- `content-ui` can refresh without forcing re-login every 3 hours.
- Refresh-token replay behavior is tested against Better Auth's native rotation/reuse handling.

### P1-A. Fix Resource-Server Audit And Schema Semantics

Scope:

- `workers/core/src/auth/plugins/resource-server/validation.ts`
- `workers/core/src/auth/plugins/resource-server/operations.ts`
- `workers/core/src/auth/plugins/resource-server/index.ts`
- migration generation if schema changes

Tasks:

- [ ] Remove `createdBy` from create request body.
- [ ] Always set `createdBy` from session actor.
- [ ] Prevent generic `PATCH` from directly toggling `enabled`, or route enable/disable through explicit audited endpoints.
- [ ] Add re-enable endpoint only if product needs it, with `enabledAt`/`enabledBy` or clear stale disable fields.
- [ ] Enforce `(organizationId, slug)` uniqueness if Better Auth plugin schema supports compound indexes; otherwise add application-level check before create/update.

Acceptance criteria:

- Audit fields are actor-owned and cannot be spoofed by request body.
- Disable/re-enable behavior has one audited path.

### P1-B. Configure Rate Limiting

Scope:

- `workers/core/src/auth/get-auth.ts`
- `workers/core/tests/auth/rate-limit.test.ts`

Tasks:

- [ ] Add `advanced.ipAddress.ipAddressHeaders` for Cloudflare.
- [ ] Add `rateLimit.enabled: true`.
- [ ] Use `storage: "secondary-storage"` so KV backs serverless rate-limit state.
- [ ] Set explicit global and custom rules for `/sign-in/email`, `/sign-up/email`, `/request-password-reset`, `/oauth2/token`, `/oauth2/authorize`, `/oauth2/introspect`, `/oauth2/revoke`, and `/oauth2/create-client`.
- [ ] Add tests for a strict endpoint rule.

Acceptance criteria:

- Rapid repeated sign-in or token requests from the same IP produce `429`.

### P1-C. Add OAuth/OIDC Flow Coverage

Scope:

- `workers/core/tests/auth/`

Tasks:

- [ ] T3 auth-code + PKCE.
- [ ] T4 token type behavior.
- [ ] T5 userinfo, introspection, revocation, refresh.
- [ ] T6 org invitations.
- [ ] T8 configured-page redirect behavior.
- [ ] T9 cookie and preview boundary.
- [ ] T12 content-ui full browser sign-in smoke.

Acceptance criteria:

- The documented OAuth integration guide is backed by tests for every first-release flow.

### P1-D. Reconcile Documentation And Deployment Workflow

Scope:

- `README.md`
- `docs/002_implementation-sequence.md`
- `docs/004_admin-api-reference.md`
- `docs/006_resource-server-jwt-guide.md`
- `docs/007_cloudflare-deployment-runbooks.md`
- `.github/workflows/ci.yml`
- `scripts/remote-smoke.mjs`

Tasks:

- [ ] Remove or mark `GET /api/admin/dashboard` as deferred everywhere unless reimplemented.
- [ ] Fix resource-token verifier path in docs.
- [ ] Add Sender setup and smoke instructions.
- [ ] Add admin bootstrap runbook.
- [ ] Either implement manual deployment workflow or correct README to say current CI performs dry-run deployment proofs only.
- [ ] Expand remote smoke to cover email acceptance and a minimal token flow when safe test credentials are available.

Acceptance criteria:

- Docs match implemented routes and scripts.

## 12. Edge Cases And Failure Modes

| Failure mode | Expected behavior | Workstream |
|---|---|---|
| Sender API token missing | Email sends fail closed operationally; startup or first send surfaces a clear redacted error. | P0-A |
| Sender domain unverified | API rejects the send; runbook points to domain verification and SPF/DKIM/DMARC. | P0-A |
| Sender 429 | Background send logs throttling metadata; no user enumeration leak. | P0-A |
| Sender accepts but mail bounces | Operator checks Sender transactional logs; future webhook/outbox can track bounces. | P0-A |
| Email background task fails after verification/reset request | User sees generic check-email state; operator log captures failure. | P0-A |
| Public sign-up abuse | `POST /api/auth/sign-up/email` is disabled; admins create users through Better Auth Admin `createUser`. | P0-B |
| Missing login page | `content-ui` browser sign-in cannot complete. Build minimal hosted login page; this is separate from the admin UI. | P0-H |
| Missing consent page | Trusted `content-ui` with `skip_consent: true` can bypass consent, but the fallback page should exist before any non-trusted client is supported. | P0-H |
| Dead prompt page redirect | `signup`, `selectAccount`, and `postLogin` config is removed until matching pages exist. | P0-H |
| No admin user | One-time bootstrap endpoint creates native Better Auth admin; admin APIs stay locked before bootstrap. | P0-D |
| Bootstrap token leaked after first use | Route refuses once a native admin exists; operator removes or rotates `ID_BOOTSTRAP_TOKEN` through Wrangler. | P0-D |
| `platformRole` and `user.role` disagree | Native Better Auth `user.role` wins after migration; compatibility mirror is removed or ignored. | P0-C |
| Generic API helper runs on non-operator machine | Helper fails before request if `pnpm wrangler whoami` fails. No static IP or MAC allowlist is required. | P0-E |
| Raw admin API key is passed to local helper | Unsupported by design; helper accepts session-cookie login or another documented Wrangler-gated path, not key env vars or args. | P0-E |
| Member lists resource servers | Denied or filtered to zero rows. | P0-F |
| Resource server disabled while JWTs exist | New tokens rejected after cache invalidation/expiry; existing JWTs remain valid until expiry. | P0-G |
| D1 unavailable during audience load | Token issuance fails closed with 5xx; already issued JWT verification by downstream services remains independent. | P0-G |
| KV stale or unavailable | Fallback policy must be explicit. Prefer D1 load on cache miss; fail closed if D1 unavailable. | P0-G |
| Legacy `auther` and new `id` cookie collision | `id` uses `advanced.cookiePrefix: "id-auth"` or an explicit unique session-token cookie name. | P0-I |
| Preview browser OAuth attempted on `*.workers.dev` | Unsupported by design; previews are API-only because shared parent-domain cookies cannot work on the public suffix. | P0-I |
| Refresh token stolen or replayed | Better Auth native rotation rejects old-token replay; tests assert old refresh token cannot be reused. | P0-J |
| Duplicate resource-server slug in same org | Reject before create/update. | P1-A |
| OAuth client created without active organization/reference | Token `org_id` may be absent. Tests must define expected behavior for M2M and browser clients. | P1-C |

## 13. Verification Plan

Run after P0/P1 implementation:

```bash
pnpm lint
pnpm check:dup
pnpm typecheck
pnpm test
pnpm check
pnpm advise
```

Manual/smoke verification:

- Create Sender account on Free plan.
- Add and verify sending domain.
- Confirm SPF, DKIM, and DMARC indicators are green in Sender.
- Store `SENDER_API_TOKEN`, `EMAIL_FROM`, and `EMAIL_FROM_NAME`.
- Run local verification/reset email paths with fake sender in automated tests.
- Run remote smoke to send one real verification-style email to an operator mailbox.
- Set `ID_BOOTSTRAP_TOKEN` with `pnpm wrangler secret put ID_BOOTSTRAP_TOKEN`.
- Call `POST /api/bootstrap/admin` once, then remove or rotate `ID_BOOTSTRAP_TOKEN`.
- Confirm the created user has native Better Auth `role = "admin"`.
- Confirm public `POST /api/auth/sign-up/email` is disabled.
- Run `pnpm auth:api` after `pnpm wrangler whoami` succeeds.
- Create `content-api` resource server and OAuth client through API-only calls.
- Issue a `client_credentials` token with `resource=<content-api audience>`.
- Verify the API access token with `packages/lib/src/resource-token-verifier.ts`.
- Create `content-ui` OAuth client with exact production redirect URI.
- Confirm Better Auth uses `.quanghuy.dev` cross-subdomain cookies and a unique `id-auth` cookie prefix/name.
- Run browser-style authorization-code + PKCE through hosted login.
- For trusted `content-ui`, verify `skip_consent: true` bypasses consent.
- For a non-trusted test client, verify hosted consent page completes `/api/auth/oauth2/consent`.
- Exchange code and verify the resulting resource-bound JWT against `content-api` expectations.
- Request `offline_access`, refresh the token, and verify old refresh-token replay is rejected.
- Confirm preview `*.workers.dev` smoke stays API-only and does not register browser OAuth redirect URIs.

## 14. Definition Of Done

- [ ] Sender transactional email sends verification and reset emails from a verified domain.
- [ ] Production code no longer stores raw verification/reset tokens in KV as the email delivery mechanism.
- [ ] Public `POST /api/auth/sign-up/email` is disabled.
- [ ] Admin-only user creation through Better Auth Admin `createUser` is tested and documented.
- [ ] Platform admin access uses native Better Auth `user.role`, not custom `platformRole`.
- [ ] One-time first-admin bootstrap works without manual SQL and becomes unusable after bootstrap.
- [ ] API-only operation works through a Wrangler-gated generic request helper.
- [ ] No local helper accepts raw admin API keys through env vars or command arguments.
- [ ] `content-api` resource server and M2M OAuth client can be created without an admin UI.
- [ ] `content-ui` browser authorization-code + PKCE completes through a real hosted login page.
- [ ] Only login and consent OAuth UI pages are configured in first release; sign-up, select-account, and post-login pages are removed until implemented.
- [ ] Trusted `content-ui` consent bypass is stored on the OAuth client with `skip_consent`, not hard-coded in source.
- [ ] Non-trusted browser clients have a working consent fallback page before they are supported.
- [ ] Better Auth cookies are configured for `.quanghuy.dev` with an `id`-specific cookie prefix/name that cannot collide with legacy `auther`.
- [ ] Preview `*.workers.dev` environments are documented and treated as API-only for OAuth.
- [ ] OAuth Provider token lifetimes are explicit: 3-hour user access tokens and 7-day refresh tokens.
- [ ] Refresh-token grant returns a rotated refresh token and old refresh-token replay is rejected in tests.
- [ ] Resource-server read/list endpoints enforce platform/org visibility.
- [ ] Runtime resource-server audience creation/disable behavior is proven through the actual Worker route path.
- [ ] Rate limiting is explicitly configured for Cloudflare Workers.
- [ ] Resource-server audit fields cannot be spoofed or bypassed.
- [ ] Missing OAuth/OIDC tests are added or the corresponding flows are removed from first-release claims.
- [ ] README and runbooks match the implemented commands, routes, and deployment workflow.
- [ ] `pnpm check` and `pnpm advise` are clean or have reviewed/suppressed advisory findings per `AGENTS.md`.

## 15. Final Model

The first batch should ship as a small but real IdP, not just a protocol proof:

- Better Auth owns identity, sessions, OAuth/OIDC, organizations, tokens, and consents.
- Better Auth native `user.role` owns platform admin access; organization membership roles remain org-scoped.
- `idResourceServer` owns resource-server metadata and feeds OAuth Provider `validAudiences` at request time through D1/KV.
- Sender owns transactional email delivery through REST API calls scheduled from Worker background tasks.
- First-release admin operation is API-only; the admin dashboard is deferred.
- Browser sign-in for `content-ui` uses exactly the minimal hosted login and consent pages, not the full admin UI.
- Public self-service sign-up is disabled; admins create users through Better Auth Admin.
- Production browser OAuth runs on `*.quanghuy.dev` with parent-domain `id-auth` cookies; preview Worker URLs are API-only.
- OAuth access tokens last 3 hours, refresh tokens last 7 days, and refresh-token rotation is tested.
- One-time admin bootstrap is protected by a long random Wrangler-managed secret and disabled after use.
- Local operator calls use a Wrangler-gated generic request helper, not a broad custom admin SDK.
- Resource-server admin data is tenant-scoped on read and mutation.
- Tests cover the actual flows that `content-api` will use before integration begins.
