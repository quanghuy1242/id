# Account Center And Self-Service Identity

> Status: implementation-grade research and proposal
>
> Date: 2026-05-31
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — `core-id` authorization server and `ui-id` hosted user/admin UI
> - `workers/core/src/auth/**` — Better Auth configuration, plugins, OAuth/OIDC, SCIM, email/password recovery, sessions, consents, and auth-owned API wrappers
> - `workers/ui/src/app/**` — hosted auth pages, proposed account pages, login context behavior, route protection, and UI-owned actions
> - `packages/lib/src/auth-fetch.ts` — same-origin typed `/api/auth/*` client helpers
> - `packages/ui/src/**` — shared UI primitives used by hosted auth/account/admin surfaces
>
> Source docs and local evidence:
>
> - [docs/000_repo-architecture.md](000_repo-architecture.md)
> - [docs/001_first-batch-plan.md](001_first-batch-plan.md)
> - [docs/005_oauth2-oidc-integration-guide.md](005_oauth2-oidc-integration-guide.md)
> - [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md)
> - [docs/022_admin-ui-system.md](022_admin-ui-system.md)
> - [docs/024_admin-login-context-guard.md](024_admin-login-context-guard.md)
> - [docs/026_admin-oauth-security-screens-and-api-contracts.md](026_admin-oauth-security-screens-and-api-contracts.md)
> - [docs/028_tenant-scoped-platform-experience.md](028_tenant-scoped-platform-experience.md)
> - [workers/ui/docs/screens/auth-flow.md](../workers/ui/docs/screens/auth-flow.md)
> - [workers/core/src/auth/get-auth.ts](../workers/core/src/auth/get-auth.ts)
> - [workers/core/src/auth/types.ts](../workers/core/src/auth/types.ts)
> - [workers/core/src/auth/adapters/auth-email-render.ts](../workers/core/src/auth/adapters/auth-email-render.ts)
> - [workers/core/src/auth/plugins/admin-audit/operations.ts](../workers/core/src/auth/plugins/admin-audit/operations.ts)
> - [workers/core/src/auth/plugins/admin-audit/index.ts](../workers/core/src/auth/plugins/admin-audit/index.ts)
> - [workers/ui/src/proxy.ts](../workers/ui/src/proxy.ts)
> - [workers/ui/src/app/login/login-form.tsx](../workers/ui/src/app/login/login-form.tsx)
> - [workers/ui/wrangler.jsonc](../workers/ui/wrangler.jsonc)
> - `node_modules/better-auth/dist/api/routes/password.d.mts`
> - `node_modules/better-auth/dist/api/routes/update-user.d.mts`
> - `node_modules/better-auth/dist/api/routes/session.d.mts`
> - `node_modules/better-auth/dist/api/routes/email-verification.d.mts`
>
> External references checked on 2026-05-31:
>
> - OpenID Connect Core 1.0: <https://openid.net/specs/openid-connect-core-1_0-18.html>
> - OpenID Connect Discovery 1.0: <https://openid.net/specs/openid-connect-discovery-1_0.html>
> - OpenID Connect RP-Initiated Logout 1.0: <https://openid.net/specs/openid-connect-rpinitiated-1_0.html>
> - RFC 7009, OAuth 2.0 Token Revocation: <https://www.rfc-editor.org/rfc/rfc7009>
> - RFC 7662, OAuth 2.0 Token Introspection: <https://www.rfc-editor.org/rfc/rfc7662>
> - RFC 8414, OAuth 2.0 Authorization Server Metadata: <https://www.rfc-editor.org/rfc/rfc8414>
> - RFC 9068, JWT Profile for OAuth 2.0 Access Tokens: <https://www.rfc-editor.org/rfc/rfc9068>
> - RFC 7643, SCIM Core Schema: <https://www.rfc-editor.org/rfc/rfc7643>
> - RFC 7644, SCIM Protocol: <https://www.rfc-editor.org/rfc/rfc7644>
> - Google Account vs Cloud Console split (myaccount): <https://support.google.com/accounts/answer/3024190>
> - Okta End-User settings documentation: <https://help.okta.com/oie/en-us/content/topics/identity-engine/enduser/eu-settings.htm>
> - Okta MyAccount API overview: <https://developer.okta.com/docs/api/openapi/okta-myaccount/guides/overview/>
> - Auth0 user profile metadata guidance: <https://auth0.com/docs/manage-users/user-accounts/metadata>
> - Auth0 Authentication API password-change flow: <https://auth0.com/docs/authenticate/database-connections/password-change>
>
> Assumptions:
>
> - `id` remains one authorization-server deployment and one issuer. The Account Center is a hosted product surface inside that issuer, not a second identity product.
> - Public self-registration remains disabled. Admins create users; users later manage account properties the server explicitly exposes. Client-initiated registration is specified separately in [docs/030](030_client-initiated-registration-and-onboarding.md).
> - Better Auth `1.6.11` remains the pinned auth library for the first implementation. Endpoint shapes here are based on the installed package type declarations and should be rechecked on upgrade.
> - The console model is canonical in [docs/028](028_tenant-scoped-platform-experience.md): one operator console under `/admin/**`, scope-selected, entered only by users with an operable scope. This document specifies the *other* shell — the self-service account surface under `/account/**` — and the login-context behavior shared by both.
> - The first release should not add account deletion, full user-managed MFA, inbound SCIM provisioning, custom profile schemas, or external-app return redirects unless separately approved.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Executive Recommendation](#2-executive-recommendation)
- [3. Vocabulary](#3-vocabulary)
- [4. Research Findings](#4-research-findings)
  - [4.1 Current Repo Findings](#41-current-repo-findings)
  - [4.2 External Product Findings](#42-external-product-findings)
  - [4.3 Standards Findings](#43-standards-findings)
  - [4.4 Better Auth Capability Findings](#44-better-auth-capability-findings)
- [5. Standards And Capability Classification](#5-standards-and-capability-classification)
- [6. Target Product Model](#6-target-product-model)
  - [6.1 Two Shells, One Issuer](#61-two-shells-one-issuer)
  - [6.2 User And Client Responsibilities](#62-user-and-client-responsibilities)
  - [6.3 Relationship To The Console Scope Model](#63-relationship-to-the-console-scope-model)
- [7. Account Center Information Architecture](#7-account-center-information-architecture)
  - [7.1 Route Map](#71-route-map)
  - [7.2 Shell Model](#72-shell-model)
  - [7.3 Screen Sketches](#73-screen-sketches)
- [8. API Design](#8-api-design)
  - [8.1 API Rules](#81-api-rules)
  - [8.2 Direct Better Auth Endpoint Usage](#82-direct-better-auth-endpoint-usage)
  - [8.3 `idAccountCenter` Plugin](#83-idaccountcenter-plugin)
  - [8.4 UI Action Contracts](#84-ui-action-contracts)
- [9. Login, Recovery, And Verification Flow Design](#9-login-recovery-and-verification-flow-design)
  - [9.1 Login Context Model](#91-login-context-model)
  - [9.2 Forgot Password](#92-forgot-password)
  - [9.3 Reset Password](#93-reset-password)
  - [9.4 Email Verification](#94-email-verification)
  - [9.5 Password Change](#95-password-change)
  - [9.6 Email Change](#96-email-change)
- [10. Data Model And Claim Policy](#10-data-model-and-claim-policy)
- [11. Architecture Decisions](#11-architecture-decisions)
- [12. Migration And Rollout](#12-migration-and-rollout)
- [13. Edge Cases And Failure Modes](#13-edge-cases-and-failure-modes)
- [14. Test And Verification Plan](#14-test-and-verification-plan)
- [15. Implementation Phases](#15-implementation-phases)
- [16. Future Backlog](#16-future-backlog)
- [17. Definition Of Done](#17-definition-of-done)
- [18. Final Model](#18-final-model)

## 1. Goal

Give a normal user one canonical place to manage their own identity, security, sessions, connected applications, and organization memberships, without weakening the standards-first architecture. This is the second of the two shells in the product model: [docs/028](028_tenant-scoped-platform-experience.md) specifies the operator Console (`/admin/**`, scope-selected, entered only with an operable scope); this document specifies the self-service Account shell (`/account/**`, entered by any signed-in user). The split mirrors Google's separation of `myaccount.google.com` from the Cloud console, and it is why collapsing administration into one scope-gated console (028) does not collapse self-service into it: a non-admin should never be dropped into an operator surface.

The product question "should every app call SCIM or a custom update-user API?" is answered by actor:

- Browser users manage themselves through hosted `/account/*` pages.
- OIDC clients display the current subject through ID token and UserInfo claims.
- Enterprise systems and resource servers use SCIM/OAuth/JWKS/introspection/revocation where those standards apply.
- Platform and organization admins manage other users and tenant resources through the Console (028).

Non-goals for the first release:

- Do not make the Account shell an operator console with friendlier labels.
- Do not expose session tokens, OAuth refresh tokens, client secrets, private JWKS material, reset tokens, or verification tokens to UI code.
- Do not use SCIM as a normal-user mutation API.
- Do not add broad user profile columns without a documented OIDC/SCIM claim contract.
- Do not enable user deletion before tenant, audit, OAuth grant, SCIM, and downstream application-data consequences are designed.
- Do not implement full MFA enrollment in the first pass.

## 2. Executive Recommendation

Add a hosted Account shell at `/account` and public utility pages at `/forgot-password`, `/reset-password`, and `/verify-email`. Keep the operator Console at `/admin` and evolve it with the scope-selected model from [docs/028](028_tenant-scoped-platform-experience.md). Keep OAuth/OIDC, SCIM, JWT/JWKS, revocation, introspection, and logout on their standard protocol paths. Use Better Auth self-service endpoints where the installed package already provides the right primitive. Add one small Better Auth plugin, `idAccountCenter`, for safe current-user projections that must not call raw Better Auth routes directly from browser UI.

The most important shared-behavior change is the login-context model. Today `/login` is effectively admin/OAuth-oriented. With the two-shell model, `/login` supports three destinations and step-up is decoupled from login (it attaches to sensitive console scopes/actions per [docs/028](028_tenant-scoped-platform-experience.md) §8.8, not to a login persona):

| Context | Entry | Result |
|---|---|---|
| OAuth/OIDC | Signed authorize query carried by `oauth_query` | Continue the OAuth flow after sign-in. |
| Console | Safe local `callbackURL` under `/admin` | Sign in; the Console enforces step-up when the actor enters the platform scope or a sensitive action. |
| Account | Safe local `callbackURL` under `/account`, or no callback | Sign in as a normal user and open the Account shell. |

Direct `/login` defaults to `/account` once the account pages exist. This is an additional hosted identity layer plus small server-side account projections; most existing OAuth/OIDC, SCIM, admin, organization, and resource-server contracts stay where they are.

## 3. Vocabulary

Account shell: hosted first-party UI under `/account/*` where a signed-in user manages their own shared identity state. The self-service counterpart to the operator Console.

Console: the operator surface under `/admin/*` specified in [docs/028](028_tenant-scoped-platform-experience.md). Scope-selected, entered only with an operable scope.

Hosted auth utility pages: public or token-driven pages under `/forgot-password`, `/reset-password`, and `/verify-email` that complete recovery and verification with Better Auth endpoints.

Shared identity profile: the minimal profile data `id` owns and can issue as OIDC claims — initially `id`, `email`, `emailVerified`, `name`, and optionally `image`.

Application profile: product-specific fields owned by a client application; not added to `id` unless they become shared identity claims.

Connected app: an OAuth/OIDC client for which the current user holds an authorization consent grant.

Step-up: re-authentication for sensitive console scopes/actions, defined in [docs/028](028_tenant-scoped-platform-experience.md) §8.8. The Account shell never requires step-up.

## 4. Research Findings

### 4.1 Current Repo Findings

F1. `ui-id` has hosted auth and admin pages but no normal-user account pages. `workers/ui/src/app` contains `/login`, `/consent`, `/select-authorization-context`, `/admin`, `/ui-health`, and shared files. There is no `/account`, `/forgot-password`, `/reset-password`, or `/verify-email` route.

F2. `workers/ui/wrangler.jsonc` routes only `/login*`, `/consent*`, `/select-authorization-context*`, `/admin*`, `/ui-health`, and `/assets/*` to `ui-id`. Account and recovery routes need both `assets.run_worker_first` and production `routes` entries. The wildcard suffix is required because Cloudflare route matching includes query strings.

F3. `workers/ui/src/proxy.ts` protects `/admin` and `/admin/:path*` by requiring `session.user.role === "admin"`, and intercepts `/login` only to skip signed-in admins into admin routes or allow OAuth authorize requests. It does not protect `/account` because that route family does not exist. Note: [docs/028](028_tenant-scoped-platform-experience.md) changes the `/admin` gate from `role === "admin"` to "has an operable scope"; this document depends on that change and adds the `/account` branch.

F4. `workers/ui/src/proxy.ts` (`adminLoginTarget`) and `workers/ui/src/app/login/login-form.tsx` (`safeAdminCallbackURL`, `loginPayload`) treat safe first-party callbacks as admin-only: `safeAdminCallbackURL()` accepts `/admin` and rejects every other local path, and `loginPayload()` defaults non-OAuth sign-in to `/admin`. The Account shell requires a generalized safe first-party callback helper that accepts `/account` and `/admin` and still rejects absolute/external paths.

F5. `workers/ui/src/app/login/login-form.tsx` uses `authApiPost` and `OAUTH_QUERY_PARAM` from `@id/lib`, matching the repo rule that UI `/api/auth` calls use shared helpers. It has no forgot-password link.

F6. `workers/ui/docs/screens/auth-flow.md` documents the current centered-panel auth screens. Recovery/verification pages follow that pattern; the Account shell is a first-party account shell, not the operator shell.

F7. `workers/core/src/auth/get-auth.ts` already enables Better Auth email/password, disables public sign-up, requires email verification, sends verification on sign-up, configures password-reset email sending, stores sessions in the database, and registers organization/admin/jwt/OAuth/resource-server/scope-catalog/client-picker/admin-audit/admin-activity/SCIM/OpenAPI plugins.

F8. `workers/core/src/auth/types.ts` defines three auth email kinds: `password-reset`, `verification`, and `admin-otp`. `workers/core/src/auth/adapters/auth-email-render.ts` renders reset and verification as generic links using the Better Auth-provided URL.

F9. Better Auth's installed route declarations provide the first-pass self-service primitives: `POST /request-password-reset`, `GET /reset-password/:token`, `POST /reset-password`, `POST /verify-password`, `POST /update-user`, `POST /change-password`, `POST /send-verification-email`, and `GET /verify-email`. `POST /change-email` and `POST /delete-user` exist in the package shape only when corresponding user options are enabled; this repo has not enabled them.

F10. Better Auth's installed `GET /list-sessions` returns session rows that include `token`, and `POST /revoke-session` accepts `{ token }`. Browser account UI must not receive bearer session tokens. The repo already solved this for admins: `workers/core/src/auth/plugins/admin-audit/operations.ts` strips session token material and `.../index.ts` revokes by `sessionId`, resolving the token server-side. The Account shell mirrors this pattern for the current user.

F11. Existing admin audit consent endpoints are platform-admin-only: `GET /api/auth/admin/list-consents` and `POST /api/auth/admin/revoke-consent` operate across users after `requireAdmin`. The Account shell needs current-user consent projections and current-user revocation, not reuse of the platform-admin aggregate endpoints.

F12. `packages/ui/src/index.ts` already exports the primitives account pages need: `Page`, `Panel`, `Stack`, `Inline`, `Text`, `Button`, `Form`, `TextInput`, `Alert`, `Badge`, `Tabs`, `DataTable`, `DescriptionList`, `Avatar`, `Menu`, `Switch`, `ConfirmDialog`, and `Toast` (verified present). No design-system rewrite is needed.

F13. [docs/028](028_tenant-scoped-platform-experience.md) defines the two-shell model and the `console-scopes` endpoint. This document reuses that endpoint's scope/membership data for the account organizations page rather than re-deriving memberships.

### 4.2 External Product Findings

Google separates `myaccount.google.com` (profile, security, sessions, connected apps) from the Cloud console. That separation is the direct model for `id`: the Account shell is the user's `myaccount`, and the Console (028) is the operator surface. A normal user lands in the Account shell and is never shown operator IA.

Okta has a distinct end-user experience (the End-User Dashboard plus self-service settings for password, security methods, and personal information) separate from admin management. Okta's MyAccount API is a current-user API family, not a general admin directory API — scoped to the authenticated user's own profile, password, email, phone, and authenticator state. The lesson: repository-specific account endpoints should be current-user-scoped and separate from admin APIs.

Auth0 separates user profile data, Management API operations, Authentication API flows, Organizations, and application authorization, and warns against mixing app-specific data into identity claims. The lesson: keep the shared identity profile small and avoid turning `id` into a junk drawer for every consuming app's profile fields. Auth0 password-change flows are authentication/recovery flows, not SCIM operations.

The stable cross-product pattern: end users self-serve basic account/security actions; admins use a separate management surface; clients integrate by redirecting or calling protocol APIs; enterprise directory integrations use SCIM or management APIs with privileged credentials.

### 4.3 Standards Findings

OIDC Core standardizes ID tokens, UserInfo, standard claims, and authentication/consent flow behavior. It does not standardize a browser page where a user edits their profile, changes password, or lists sessions. `/account` is a product URL and provider-specific extension, not an OIDC endpoint.

OIDC Discovery and OAuth Authorization Server Metadata standardize discovery of issuer capabilities and endpoint URLs. The first release must not publish account-center metadata as if it were a standard OIDC endpoint; a future provider-specific metadata field can be documented if clients need a discoverable account URL.

OIDC RP-Initiated Logout is the standards-shaped answer for relying-party logout; it is not a password-change, session-inventory, or account-deletion mechanism. RFC 7009 token revocation is not the same as revoking a browser session or deleting a consent record. RFC 7662 introspection is a token active-state lookup, not a profile/directory API. RFC 7643/7644 SCIM is the directory read/query (and future provisioning) shape, not the normal-user account settings API. RFC 9068 describes access-token claim shape, relevant to resource-server verification, not account-center mutations.

### 4.4 Better Auth Capability Findings

`request-password-reset` accepts `{ email, redirectTo? }` and returns a neutral status/message shape, supporting hosted `/forgot-password` with neutral copy.

`reset-password` accepts `{ newPassword, token? }` plus an optional query token and returns `{ status }`. Better Auth also exposes `GET /reset-password/:token` with `callbackURL`, so implementation must test the exact browser callback shape before final route wiring.

`send-verification-email` accepts `{ email, callbackURL? }`; `verify-email` accepts `{ token, callbackURL? }`, supporting hosted verification pages with safe local callbacks.

`update-user` supports `name` and `image` in the base shape, plus any configured extra fields (none declared in this repo). `change-password` accepts `{ currentPassword, newPassword, revokeOtherSessions? }` and returns a replacement token/user shape. Sensitive operations should prefer Better Auth's existing fresh/sensitive session middleware over a custom credential-check route.

## 5. Standards And Capability Classification

| Mechanism | Classification | Correct Use In `id` | Wrong Use In `id` |
|---|---|---|---|
| OIDC ID Token | Protocol standard | Display the current signed-in subject and standard claims after authentication. | Profile mutation, password reset, session listing, directory search. |
| OIDC UserInfo | Protocol standard | Let clients refresh displayable claims for the current access-token subject. | Admin user lookup, SCIM replacement, app-specific profile storage. |
| OIDC Discovery / RFC 8414 metadata | Protocol standard | Publish issuer, JWKS URI, endpoints, supported scopes/claims. | Pretend `/account` is a standard OIDC endpoint. |
| OIDC RP-Initiated Logout | Protocol standard | Relying-party initiated logout. | Password change, consent revoke, "logout every app" shortcut outside protocol design. |
| OAuth Token Revocation | Protocol standard | Revoke OAuth tokens per RFC 7009. | Revoke browser sessions by exposing session tokens to UI. |
| OAuth Token Introspection | Protocol standard | Token active-state lookup. | User profile management or directory read. |
| JWT/JWKS | Protocol standard / JWT profile | Resource-server token verification. | Account settings or user mutation. |
| SCIM Users/Groups | Interoperability standard | Directory read/query; future privileged provisioning. | Normal end-user self-service. |
| Better Auth self-service endpoints | Library-supported capability | Password reset, verification, update-user, change-password, current session. | Cross-tenant directory integration or OAuth client management. |
| Hosted `/account` shell | Established industry pattern (the `myaccount` surface) | User self-service and client redirect target. | A portable standard endpoint all OIDC clients can call generically. |
| `idAccountCenter` plugin | Repository-specific extension | Safe current-user projections for sessions, consents, org memberships, and summary. | Replacement for OIDC, OAuth revocation, SCIM, or admin APIs. |

Repository-specific extensions are allowed here only because the precise unmet requirement is human self-service UX and safe current-user projection; existing standards do not fit that full product surface.

## 6. Target Product Model

### 6.1 Two Shells, One Issuer

| Surface | Route / Interface | Audience | Job |
|---|---|---|---|
| Account shell | `/account/*` | Any signed-in user | Manage own shared identity, security, sessions, connected apps, and organization memberships. |
| Hosted auth utility pages | `/forgot-password`, `/reset-password`, `/verify-email` | Browser users in recovery/verification | Complete recovery and verification with Better Auth token semantics behind first-party UI. |
| Console | `/admin/*` | Users with an operable scope | Scope-selected operator surface (see [docs/028](028_tenant-scoped-platform-experience.md)). |
| OAuth/OIDC APIs | `/api/auth/oauth2/*`, `/api/auth/jwks`, discovery metadata, UserInfo | Clients and resource servers | Authentication, authorization, claims, token verification, lifecycle. |
| SCIM directory | `/api/auth/scim/v2/*` | Privileged machine clients | Directory read/query and future provisioning. |

### 6.2 User And Client Responsibilities

Users go to `/account` to change shared identity or security state.

Client apps should: display the current user from ID token/UserInfo claims; redirect to `/account/profile` for shared profile edits, `/account/security` for password/security changes, and `/account/consents` for connected-app review; store app-specific profile fields locally; use OIDC logout for relying-party logout; use OAuth revocation only for OAuth token revocation; use SCIM only from trusted machine integrations needing directory-shaped data.

Admins use the Console (028), not `/account`, when acting on other users or tenant resources.

### 6.3 Relationship To The Console Scope Model

The account organizations page ([7.1](#71-route-map)) and the Console scope selector ([docs/028](028_tenant-scoped-platform-experience.md) §7.2) draw from the same source: the `console-scopes` endpoint returns operable scopes plus member-only membership hints. The Account shell renders the union; the Console renders only operable scopes.

- `/account/organizations` shows where the user belongs and what they can do.
- A member-only organization shows membership and team context without implying management rights.
- An organization the user can administer links into the Console at `/admin/orgs/:orgId` via `consoleHref` — the same scope route the Console selector navigates to, computed from the same owner/admin policy.
- A user is never routed into the Console just to show one membership row. The Account shell is the home for that, and the Console is entered only with an operable scope.

This keeps `/account` meaningful for everyone and keeps the Console an operator surface, removing the pressure to make `/admin` half-readable for non-admins.

## 7. Account Center Information Architecture

### 7.1 Route Map

| Route | Auth | First Release | Purpose |
|---|---|---|---|
| `/account` | Required | Yes | Overview: profile summary, verification state, security summary, organizations, sessions, connected-app counts. |
| `/account/profile` | Required | Yes | Edit `name` and optional `image`; show email and verification state. |
| `/account/security` | Required | Yes | Change password, resend verification, MFA placeholder, link to sessions. |
| `/account/sessions` | Required | Yes | List safe current-user sessions and revoke by session id. |
| `/account/consents` | Required | Yes | List connected OAuth/OIDC apps and revoke current-user grants. |
| `/account/organizations` | Required | Yes | List memberships, roles, teams, and allowed Console links. |
| `/forgot-password` | Public | Yes | Request reset email with neutral success state. |
| `/reset-password` | Token flow | Yes | Complete reset through Better Auth token route/mutation. |
| `/verify-email` | Token flow | Yes | Complete or display email verification result. |
| `/account/delete` | Required | No | Defer until lifecycle and compliance design exists. |

### 7.2 Shell Model

The Account shell is a small first-party shell, not the operator `AdminShell`.

- First row: product identity, signed-in user identity, sign-out action.
- Navigation: Overview, Profile, Security, Sessions, Connected apps, Organizations.
- No platform metrics, no scope selector, no operator sidebar, no admin route tree.
- On mobile, use tabs or a compact menu; avoid nesting cards inside cards.
- Reuse `@id/ui` primitives: `Page`, `Stack`, `Inline`, `Text`, `Button`, `Badge`, `Tabs`, `DescriptionList`, `DataTable`, `Avatar`, `ConfirmDialog`, `Alert`, `Toast`, `Menu`.
- Account content components own data with SWR like admin content components; action wrappers stay plain functions that call `@id/lib` helpers.

Public recovery/verification pages keep the existing auth-flow pattern: centered panel, no account/admin shell, server page component plus a `"use client"` form component.

### 7.3 Screen Sketches

Account overview:

```text
+----------------------------------------------------------------------------+
| id                                                  Person Example  Sign out |
+----------------------------------------------------------------------------+
| Overview | Profile | Security | Sessions | Connected apps | Organizations   |
+----------------------------------------------------------------------------+
| Person Example                                                             |
| person@example.com                                      Verified            |
|                                                                            |
| Security                                                                   |
| Password enabled                                     Change password        |
| Active sessions: 3                                  View sessions           |
|                                                                            |
| Organizations                                                              |
| Acme                                           Member                       |
| Admin Org                                      Admin          Open console   |
|                                                                            |
| Connected apps                                                             |
| 4 applications authorized                            Review access          |
+----------------------------------------------------------------------------+
```

Profile:

```text
+----------------------------------------------------------------------------+
| Profile                                                                    |
| Display name                                                               |
| [Person Example                                            ]               |
| Email                                                                      |
| person@example.com                                      Verified            |
| Avatar URL                                                                 |
| [https://example.com/avatar.png                            ]               |
| [Save changes]                                                             |
+----------------------------------------------------------------------------+
```

Security:

```text
+----------------------------------------------------------------------------+
| Security                                                                   |
| Password                                                                   |
| Current password   [                                        ]              |
| New password       [                                        ]              |
| Confirm new        [                                        ]              |
| [x] Sign out other devices                                                  |
| [Change password]                                                          |
|                                                                            |
| Email verification                                                         |
| person@example.com                                      Verified            |
| [Send verification email]                                                   |
|                                                                            |
| Multi-factor authentication                                                |
| Not configured                                           Coming later       |
+----------------------------------------------------------------------------+
```

Sessions:

```text
+----------------------------------------------------------------------------+
| Sessions                                                                   |
| This browser           Current      Chrome on macOS      Last active now    |
| Created May 31, 2026                Expires Jun 7, 2026                     |
| Firefox on Windows     Revoke       Last active May 30, 2026                |
| [Sign out other devices]   [Sign out everywhere]                            |
+----------------------------------------------------------------------------+
```

Connected apps:

```text
+----------------------------------------------------------------------------+
| Connected apps                                                             |
| Content App      openid profile email content:read                          |
|                  Resource: https://content-api.example.com                  |
|                  Authorized May 20, 2026                     Revoke         |
| Books App        openid profile email                                       |
|                  Authorized May 24, 2026                     Revoke         |
+----------------------------------------------------------------------------+
```

Organizations:

```text
+----------------------------------------------------------------------------+
| Organizations                                                              |
| Acme         Member    Teams: Editors                                       |
| Admin Org    Admin     [Open console]                                       |
+----------------------------------------------------------------------------+
```

Forgot / reset / verify (centered panels):

```text
+------------------------------+   +------------------------------+   +------------------------------+
| Reset your password          |   | Choose a new password        |   | Verifying email              |
| Email [person@example.com  ] |   | New password     [        ]  |   | Checking your link...        |
| [Send reset link]            |   | Confirm password [        ]  |   |                              |
+------------------------------+   | [Reset password]             |   +------------------------------+
                                   +------------------------------+
```

## 8. API Design

### 8.1 API Rules

Every browser-facing account action calls same-origin `/api/auth/*` through `@id/lib` helpers. Do not call `fetch()` directly inside account route files, public auth utility form components, or action modules.

The Account Center API is a projection layer. It introduces no second account database. It uses Better Auth endpoints directly where safe, and a Better Auth plugin where a safe current-user shape is missing. New custom account endpoints live under `/api/auth/account/*`, implemented as a Better Auth plugin under `workers/core/src/auth/plugins/account-center/**`, keeping auth-owned behavior inside the auth boundary so `ui-id` never imports Better Auth, Drizzle, D1/KV, or core source.

Endpoint responses must not include bearer tokens, session tokens, reset tokens, verification tokens, OAuth refresh/access token values, client secrets, or JWKS private material.

### 8.2 Direct Better Auth Endpoint Usage

| UI Need | Endpoint | Request | Handling |
|---|---|---|---|
| Current session | `GET /api/auth/get-session` | `disableRefresh=true&disableCookieCache=true` for guards | Route protection and shell identity. |
| Update minimal profile | `POST /api/auth/update-user` | `{ "name": "...", "image": "..." }` | Expose only allowed fields. |
| Request reset email | `POST /api/auth/request-password-reset` | `{ "email": "...", "redirectTo": "/reset-password" }` or tested callback shape | Always render neutral success. |
| Complete reset | `POST /api/auth/reset-password` | `{ "newPassword": "...", "token": "..." }` | Navigate to login/account on success. |
| Change password | `POST /api/auth/change-password` | `{ "currentPassword": "...", "newPassword": "...", "revokeOtherSessions": true }` | Do not log the returned token. |
| Verify current password | `POST /api/auth/verify-password` | `{ "password": "..." }` | For later freshness confirmation. |
| Send verification email | `POST /api/auth/send-verification-email` | `{ "email": "...", "callbackURL": "/verify-email" }` | Neutral success; exact callback tested. |
| Verify email | `GET /api/auth/verify-email` | `?token=...&callbackURL=/account/security` | Show success/expired/already-verified state. |

Do not use in first release:

| Endpoint | Reason |
|---|---|
| `POST /api/auth/change-email` | `get-auth.ts` has not enabled `user.changeEmail`; email change needs verification/freshness policy. |
| `POST /api/auth/delete-user` | Account deletion requires separate lifecycle design. |
| `GET /api/auth/list-sessions` in UI | Installed type shape includes `token`; use the safe wrapper. |
| `POST /api/auth/revoke-session` in UI | Requires token; use the safe wrapper by `sessionId`. |

### 8.3 `idAccountCenter` Plugin

Add a Better Auth plugin only for safe current-user projections. Initial plugin schema: none. It uses adapter reads of Better Auth-owned models, following the `admin-audit` plugin's session-token stripping and server-side revoke pattern.

#### `GET /api/auth/account/summary`

```json
{
  "user": { "id": "usr_...", "email": "person@example.com", "emailVerified": true, "name": "Person Example", "image": null },
  "security": { "passwordEnabled": true, "mfaEnabled": false, "emailVerificationRequired": true },
  "counts": { "organizations": 2, "activeSessions": 3, "connectedApplications": 4 }
}
```

#### `GET /api/auth/account/sessions`

```json
{
  "sessions": [
    { "id": "sess_...", "current": true, "createdAt": "2026-05-31T09:20:00.000Z", "updatedAt": "2026-05-31T10:05:00.000Z",
      "expiresAt": "2026-06-07T09:20:00.000Z", "ipAddress": "203.0.113.10", "userAgent": "Chrome on macOS" }
  ]
}
```

Authorization: session required; return only sessions whose `userId` is the current user. Never return `token`.

#### `POST /api/auth/account/sessions/revoke`

Request `{ "sessionId": "sess_..." }` → `{ "status": true }`. Session required; target must belong to the current user. Look up by `id` + current `userId`, then call the internal session adapter with the stored token server-side.

#### `POST /api/auth/account/sessions/revoke-others`

Request `{}` → `{ "status": true, "revoked": 2 }`. May delegate to Better Auth `revoke-other-sessions` if the response is normalized and no tokens are exposed.

#### `POST /api/auth/account/sessions/revoke-all`

Request `{}` → `{ "status": true }`. UI navigates to `/login?callbackURL=/account` afterward because the current session is gone.

#### `GET /api/auth/account/consents`

```json
{
  "consents": [
    { "id": "consent_...", "clientId": "client_...", "clientName": "Content App",
      "scopes": ["openid", "profile", "email", "content:read"], "resources": ["https://content-api.example.com"],
      "createdAt": "2026-05-20T08:00:00.000Z", "updatedAt": "2026-05-25T12:00:00.000Z" }
  ]
}
```

Authorization: session required; filter `oauthConsent.userId` to the current user. This is consent management, not RFC 7009 token revocation.

#### `POST /api/auth/account/consents/revoke`

Request `{ "clientId": "client_...", "resource": "https://content-api.example.com" }` → `{ "status": true }`. Session required; revoke only current-user consent rows.

> Review note (2026-05-31): the `clientId + resource` request shape and the `oauthConsent.userId`/`resources` fields above are an assumption about Better Auth's consent schema, not a verified fact. Before settling this contract, inspect the installed `@better-auth/oauth-provider` consent model and confirm whether consent is keyed per-resource or only per-client/user. If per-client/user only, drop `resource` from the request and make the UI say the whole app is disconnected. Recheck on any Better Auth upgrade. Keep the standards boundary explicit in the UI: existing access tokens may remain valid until expiry.

#### `GET /api/auth/account/organizations`

```json
{
  "organizations": [
    { "id": "org_...", "name": "Acme", "slug": "acme", "role": "member",
      "teams": [{ "id": "team_...", "name": "Editors" }], "canOpenConsole": false, "consoleHref": null },
    { "id": "org_admin", "name": "Admin Org", "slug": "admin-org", "role": "admin",
      "teams": [], "canOpenConsole": true, "consoleHref": "/admin/orgs/org_admin" }
  ]
}
```

Authorization: session required; return only the current user's memberships. `canOpenConsole`/`consoleHref` come from the same owner/admin policy the Console uses ([docs/028](028_tenant-scoped-platform-experience.md) §8.2), not from a display-only role string. This endpoint and the Console `console-scopes` endpoint must agree on which organizations are operable.

### 8.4 UI Action Contracts

Suggested files:

- `workers/ui/src/app/account/_actions/account.ts`
- `workers/ui/src/app/account/_components/account-shell.tsx`
- `workers/ui/src/app/account/_components/{account-overview,profile,security,sessions,consents,organizations}-content.tsx`
- `workers/ui/src/app/forgot-password/forgot-password-form.tsx`
- `workers/ui/src/app/reset-password/reset-password-form.tsx`
- `workers/ui/src/app/verify-email/verify-email-status.tsx`

```ts
import { authApiGetOrThrow, authApiPostOrThrow } from "@id/lib";

export async function getAccountSummary(): Promise<AccountSummary> {
  return authApiGetOrThrow<AccountSummary>("/account/summary");
}

export async function updateProfile(input: UpdateProfileInput): Promise<void> {
  await authApiPostOrThrow("/update-user", input);
}

export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  return authApiPostOrThrow<ChangePasswordResult>("/change-password", input);
}

export async function listAccountSessions(): Promise<AccountSessionsResponse> {
  return authApiGetOrThrow<AccountSessionsResponse>("/account/sessions");
}

export async function revokeAccountSession(sessionId: string): Promise<void> {
  await authApiPostOrThrow("/account/sessions/revoke", { sessionId });
}
```

The path passed to `authApi*` is relative to `/api/auth`, matching existing admin actions.

## 9. Login, Recovery, And Verification Flow Design

### 9.1 Login Context Model

`/login` decides only the post-login destination. Step-up is decoupled from login and enforced by the Console when the actor enters a sensitive scope or action ([docs/028](028_tenant-scoped-platform-experience.md) §8.8), preserving the docs/024 security property that a context-less or arbitrary-redirect login cannot mint an elevated session.

| Request Shape | Context | Server Behavior | UI Behavior |
|---|---|---|---|
| `oauth_query` present | OAuth | Existing signed-query validation and continuation. | Login form does not inject a callback URL. |
| `callbackURL` starts with `/admin` | Console | Validate credentials and sign in. | No OTP at login; the Console challenges step-up on platform-scope entry once per session, or again for sensitive actions that require a fresh check. |
| `callbackURL` starts with `/account` | Account | Validate credentials and sign in. | Normal account login. |
| no OAuth query and no callback | Account default | Treat as `/account`. | Direct `/login` lands in the Account shell. |
| absolute or unsafe callback | Invalid | Reject or normalize to the safe account default. | Show error or ignore the unsafe value. |

Implementation:

- Generalize `safeAdminCallbackURL` into a safe first-party callback helper that accepts local `/admin` and `/account` paths and rejects absolute/external paths. The widening of this allowlist is the easiest place to introduce an open redirect — re-verify against installed types that non-local and non-`/admin`/`/account` paths are still rejected, and cover it with a test.
- Default `loginPayload()` non-OAuth sign-in to `/account` instead of `/admin`.
- The sign-in context guard plugin (currently `admin-sign-in-guard`) keeps context-less login closed; its OTP trigger moves to the Console's platform-scope/sensitive-action step-up per [docs/028](028_tenant-scoped-platform-experience.md). Keep the file name for compatibility; broaden the logic to a sign-in context guard.

> Review note (2026-05-31): this change touches the one guard that enforces step-up (the docs/024 OTP fix), so the existing admin-OTP test suite is the regression gate and must stay green through every step. One interaction is easy to miss: `guardLogin` in `workers/ui/src/proxy.ts` currently redirects an already-signed-in admin off `/login` to the admin target. Once direct `/login` defaults to `/account` (Decision 5), add an explicit test for the signed-in-admin-on-bare-`/login` case so the account default and the admin skip do not produce a surprising redirect. Confirm the move of OTP from login to platform-scope entry keeps a stepped-up session requirement before any platform surface renders.

### 9.2 Forgot Password

1. User opens `/forgot-password`.
2. UI submits `{ email, redirectTo }` to `POST /api/auth/request-password-reset`.
3. UI always renders neutral success copy.
4. Better Auth sends email through `sendResetPassword` configured in `get-auth.ts`.
5. The email link routes through Better Auth token semantics and lands at `/reset-password` or a callback that gives the UI a reset token.

Security: do not reveal whether the email exists; do not log the submitted email with reset-token context; rate limiting stays at edge/WAF or a future plugin throttle, matching the current `rateLimit.enabled: false` rationale in `get-auth.ts`.

### 9.3 Reset Password

1. User follows the email link.
2. UI enters `/reset-password` in a checking state.
3. UI either receives a usable token from Better Auth's reset callback route or reads a token in the tested callback shape.
4. User enters new password and confirmation.
5. UI submits `POST /api/auth/reset-password`.
6. On success, navigate to `/login?callbackURL=/account/security` or to `/account/security` if the backend signs the user in.

Implementation warning: Better Auth exposes both `GET /reset-password/:token` with `callbackURL` and `POST /reset-password`. The exact first browser link shape must be covered by integration tests before production routing is finalized.

### 9.4 Email Verification

1. Verification email is sent on sign-up or resent from `/account/security`.
2. The link uses a Better Auth verification token.
3. UI enters `/verify-email` checking state.
4. UI calls `GET /api/auth/verify-email?token=...&callbackURL=/account/security` or follows the tested callback path.
5. UI shows success, already-verified, invalid, or expired state.

If signed in, success returns to `/account/security`; if not, the page shows success and provides sign-in.

### 9.5 Password Change

Signed-in password change lives under `/account/security`. Request `{ "currentPassword": "...", "newPassword": "...", "revokeOtherSessions": true }` to `POST /api/auth/change-password`. Validate presence/confirmation client-side; let the server enforce password policy; offer "sign out other devices"; refresh sessions after success; never display or log the returned token.

### 9.6 Email Change

Defer to a later release. When enabled: use Better Auth `user.changeEmail`, not a custom `update-user` email write; require current session and likely password freshness; verify the new address before issuing a changed OIDC `email` claim unless the configuration explicitly supports pending email; notify the old address where feasible; record a security event when an identity-event producer exists.

## 10. Data Model And Claim Policy

Initial shared identity fields:

| Field | Owner | Mutability | Claim / Use |
|---|---|---|---|
| `id` | Better Auth | Immutable | OIDC `sub` / internal user id. |
| `email` | Better Auth | Future verified email-change only | OIDC `email`; login identifier. |
| `emailVerified` | Better Auth | System-managed | OIDC `email_verified`; verification UI. |
| `name` | Better Auth | User-editable | OIDC `name`; display. |
| `image` | Better Auth | User-editable as URL unless upload/storage is designed | OIDC-like `picture` mapping if emitted. |

Do not add app-specific fields to this table. A reading app's display preferences, a content app's bio, or a CRM's job title stay in that application unless they become a shared identity claim.

A future `idUserProfile` plugin field is considered only with a claim contract: claim name; OIDC scope needed; SCIM mapping if any; update authority; Account Center visibility; admin editability; audit/security behavior.

## 11. Architecture Decisions

### Decision 1: Host The Account Shell In `ui-id`

Recommended. `ui-id` already owns hosted UI pages and calls same-origin `/api/auth/*`, keeping presentation out of `core-id`. Rejected: build account pages in `core-id`, which would mix presentation into the authorization server worker.

### Decision 2: Use A Better Auth Plugin For Safe Account Projections

Recommended. Session, user, OAuth consent, and organization membership data are auth-owned; a Better Auth plugin can use session middleware, adapter access, and internal session deletion without exposing tokens. Rejected: Hono `/api/admin/*` or `/account/api/*` routes reading auth tables directly, which would blur ownership and risk raw D1/Drizzle access to Better Auth tables outside the auth boundary.

### Decision 3: Do Not Use SCIM For Browser Self-Service

Recommended. SCIM remains directory integration; browser self-service uses hosted UI and Better Auth endpoints. Rejected: client apps updating users through SCIM for normal profile edits.

### Decision 4: Keep The Shared User Profile Minimal

Recommended. A minimal shared profile keeps OIDC claims trustworthy and avoids turning `id` into a domain-profile dumping ground. Rejected: arbitrary columns to satisfy every client.

### Decision 5: Default Direct Login To The Account Shell

Recommended. Once `/account` exists, direct `/login` sends normal users to `/account`, not `/admin`. Rejected: keep defaulting to `/admin`, which preserves an admin-centric assumption and makes self-service feel bolted on.

### Decision 6: Keep Step-Up Out Of Account Login

Recommended. The Account shell never requires step-up; step-up attaches to sensitive Console scopes/actions per [docs/028](028_tenant-scoped-platform-experience.md) §8.8. Rejected: requiring OTP for all logins that might later reach `/admin`, which re-creates the admin-persona login assumption this model removes.

## 12. Migration And Rollout

Phase order is sequenced; the login-context change (Phase 1) is the security-sensitive one and shares the docs/028 step-up reframe.

1. Generalize login context: safe `/account` and `/admin` callbacks in UI and server guard; direct `/login` defaults to `/account`; move OTP trigger to Console platform-scope entry per docs/028; tests for OAuth/Console/Account/unsafe callbacks and the signed-in-admin-on-bare-`/login` case.
2. Public utility routes: `/forgot-password`, `/reset-password`, `/verify-email` under `workers/ui/src/app`; `auth-flow.md` entries; `wrangler.jsonc` routes/`run_worker_first`; test reset/verification callback shapes against Better Auth.
3. Account shell + summary: `/account` route protection in proxy; account shell and overview; `idAccountCenter` `GET /account/summary`.
4. Self-service pages: profile/security via direct Better Auth endpoints; sessions/consents/organizations via the safe account plugin endpoints; tests for token stripping and current-user scoping.
5. Docs and client integration: update the integration guide (UserInfo vs Account links vs SCIM vs app-local fields); update README route topology.

Rollback: account pages can be disabled by removing UI routes before any schema change (the first plugin has no new tables). The login-context change must roll back carefully because Console step-up depends on it; keep the admin-OTP suite as the rollback safety check.

## 13. Edge Cases And Failure Modes

- Unsafe callback URL: reject/ignore absolute or external callbacks; route to the `/account` default or a safe error. Never redirect to arbitrary origins.
- OAuth authorize flow on `/login`: preserve current signed `oauth_query` behavior; do not inject an account callback into the OAuth flow.
- Console login: a `/admin` callback signs in normally; the Console enforces step-up on platform-scope entry. Account context must not bypass Console authorization.
- Unauthenticated `/account`: redirect to `/login?callbackURL=/account...`, preserving the safe local path/query.
- One organization membership: render one membership row in the overview/organizations page; do not force an org-picker page.
- Many organization memberships: a simple list first; searchable/grouped later.
- Session list stale after revoke: revalidate the SWR key; if the current session is revoked, navigate to login.
- Better Auth session-token exposure: never call `list-sessions` directly from browser UI if the response includes `token`.
- Consent revoke with an active access token: UI says future authorization is revoked; existing access tokens may remain valid until expiry unless server policy revokes token families.
- Password reset token expired: show invalid/expired state and a link to request a new reset.
- Verification link already used: show already-verified/success without exposing a raw backend error.
- Email enumeration: forgot-password and verification-resend show neutral success.
- Email change before enabled: UI omits or disables it; the server exposes no fake mutation.
- Account deletion requested: not available in first release; link to a support/admin process only if a lifecycle policy exists.
- Cloudflare route mismatch: missing `/account*` or token-page entries in `wrangler.jsonc` send requests to `core-id`/404 instead of `ui-id`; route smoke tests must cover deployed paths.

## 14. Test And Verification Plan

Docs-only verification: metadata blockquote and TOC present; no unresolved placeholders; README Contracts list contains this document; no manual prose hard-wrap.

Implementation: `pnpm lint`, `pnpm check:dup`, `pnpm typecheck`, `pnpm test`, `pnpm check`, and `pnpm deploy:ui:dry-run` after non-trivial UI changes.

Focused tests:

- Proxy redirects unauthenticated `/account` to `/login?callbackURL=/account` and unauthenticated `/admin` to `/login?callbackURL=/admin`.
- Direct `/login` with no OAuth query defaults to the account callback; OAuth login query continues unchanged; unsafe callback URL rejected.
- Console login does not OTP at login; platform-scope entry requires step-up (the docs/028 reframe); the admin-OTP suite stays green.
- Signed-in-admin-on-bare-`/login` lands coherently (regression for the §9.1 review note).
- Forgot password returns neutral state for known and unknown emails.
- Reset password handles success, missing token, invalid token, expired token.
- Verification handles success, invalid token, expired token, already verified.
- Account session list strips `token`; account revoke refuses another user's session id.
- Consent list returns only the current user's grants; consent revoke cannot revoke another user's grant.
- Organizations list returns only the current user's memberships and computes `canOpenConsole` through policy, agreeing with the Console `console-scopes` endpoint.

Manual smoke: request and complete a password reset from the email link; sign in to `/account`; change password with "sign out other devices"; revoke another session; revoke a connected app and verify the next authorize re-prompts consent if the provider supports it; confirm an ordinary user cannot open `/admin`; confirm a platform admin still hits step-up on platform-scope entry.

## 15. Implementation Phases

The work is sequenced; each phase is independently shippable and testable.

1. Login context (security-sensitive): generalize the safe-callback helper to `/admin` + `/account`, default direct login to `/account`, move OTP to Console platform-scope entry per docs/028, and cover OAuth/Console/Account/unsafe/signed-in-admin cases. Acceptance: account users sign in to `/account`; platform-scope entry still requires step-up; context-less or unsafe login mints no elevated session.
2. Hosted recovery/verification pages: public centered-panel pages calling Better Auth through `@id/lib`; tested reset/verification callback shapes; `wrangler.jsonc` route + `run_worker_first` entries. Acceptance: a user can request reset, complete reset, and verify email through hosted UI without enumeration leakage.
3. Account shell + summary: account route protection in proxy, account shell, overview page, `idAccountCenter` `GET /account/summary`. Acceptance: a signed-in user opens `/account`; an unauthenticated user is redirected; the summary contains no secrets.
4. Profile + security: profile form for `name`/`image`, password-change form, resend-verification action, email change shown as unavailable. Acceptance: a user updates supported fields and changes password; the UI exposes no unsupported email change.
5. Sessions, consents, organizations: safe session list/revoke, current-user consent list/revoke, current-user organization membership endpoint, UI pages with confirmation dialogs. Acceptance: no session tokens reach browser code; a user cannot see or mutate another user's sessions/consents; organization Console links are authorization-backed and agree with `console-scopes`.

## 16. Future Backlog

This section is the Account future-decision ledger. The items are intentionally parked until the trigger is real and the boundary is resolved. Do not start implementation from a row below just because the Account shell exists; first classify the mechanism, choose the owner surface, and write the missing lifecycle or claim contract.

| Item | Current verdict | Trigger | Owner surface | Standards classification | Boundary required before implementation |
|---|---|---|---|---|---|
| User-managed MFA enrollment | Parked | Users need to enroll or remove their own second factor outside an operator workflow | `/account/security`, with Console step-up continuing to own sensitive operator action freshness | Better Auth-supported capability plus hosted Account product behavior; not an OIDC endpoint | Define the relationship between user MFA, platform-entry step-up, and shorter action-level step-up so Account login does not become an admin persona gate. |
| Verified email change | Parked | Product approves self-service email replacement | `/account/profile` or `/account/security` | Better Auth-supported `user.changeEmail` capability plus OIDC claim policy; not SCIM self-service | Define verification of the new address, notification of the old address, freshness requirements, audit/security event behavior, and when `email` / `email_verified` claims change. |
| Account deletion lifecycle | Parked | Legal/product policy requires user-initiated deletion or deactivation | `/account/security` plus Console/admin runbooks for exceptional cases | Repository-specific lifecycle composed with OAuth grants, sessions, SCIM, audit, and downstream app contracts; not OIDC logout or OAuth revocation | Define tenant ownership transfer/blocking, organization membership effects, active OAuth grants and sessions, SCIM deprovisioning or tombstone behavior, identity-event emission, audit retention, and downstream app-data responsibility. |
| External application `return_to` | Parked | Clients need a supported way to send users back after visiting Account Center | `/account/*` entry/exit behavior and OAuth client metadata | Repository-specific provider extension over registered OAuth client metadata; not standard OIDC behavior | Validate return targets against registered client redirect/origin metadata, reject arbitrary URLs, define whether the link is advisory UI state or a signed first-party handoff. |
| Provider-specific account-center metadata in discovery | Parked | Multiple clients need a discoverable Account Center URL instead of hard-coded first-party links | OAuth/OIDC integration guide and provider metadata docs | Provider-specific metadata extension; not standard OIDC Discovery | Name the metadata field, document that it is non-standard, define issuer/tenant URL behavior, and keep clients from treating it as a portable OIDC endpoint. |
| `idUserProfile` shared profile plugin | Parked | A concrete shared claim is needed beyond `id`, `email`, `emailVerified`, `name`, and `image` | Better Auth plugin schema, `/account/profile`, UserInfo/ID-token claims, and possibly SCIM projection | Repository-specific profile extension with an explicit OIDC/SCIM claim contract | Define claim names, scopes, update authority, validation, admin visibility, Account visibility, audit/security behavior, SCIM mapping if any, and migration from app-local fields. |
| Inbound SCIM provisioning | Parked | An enterprise source-of-truth needs to create, update, deactivate, or group-sync users in `id` | `/api/auth/scim/v2/*` machine integration and deployment runbooks | SCIM v2 interoperability standard | Decide source-of-truth precedence, local-account conflict handling, deactivation vs deletion semantics, organization/group mapping, email verification implications, and event/audit behavior. |
| Current-user security-event feed | Parked until identity events exist | Users need to review recent sign-in, password, verification, MFA, or consent/security activity | `/account/security` or a future `/account/activity` current-user projection | Repository-specific current-user read over the identity-event/audit program; individual event formats may use SET/RISC/SSF where appropriate | Define producer payloads, privacy filtering, retention, current-user-only authorization, relationship to admin audit rows, and whether events are informational only. This feed must not expose admin audit internals or cross-user/operator activity. |

## 17. Definition Of Done

- A hosted Account shell exists at `/account` with profile, security, sessions, consents, and organizations, plus public `/forgot-password`, `/reset-password`, and `/verify-email` pages, all in the UI worker route config.
- The Account shell is distinct from the operator Console (028); a non-admin user lands in the Account shell, never an empty console.
- Login context supports OAuth, Console, and Account destinations; step-up is enforced by the Console on sensitive scopes/actions, not by an admin-persona login, and the docs/024 security property holds.
- Account Center APIs are Better Auth plugin endpoints or direct Better Auth endpoint calls through `@id/lib`; browser UI never receives session tokens or other bearer secret material.
- The account organizations endpoint and the Console `console-scopes` endpoint agree on which organizations are operable.
- SCIM remains a directory boundary and is not used for normal-user self-service.
- Automated tests cover route protection, callback safety, account endpoint authorization, token stripping, recovery/verification states, and the step-up reframe.
- Integration docs tell clients how to display users, where to redirect for self-service, when to use SCIM, and what profile fields stay app-local.

## 18. Final Model

`id` is a layered identity product with two hosted shells over one issuer: the Account shell (`/account`) is the user's self-service home, mirroring `myaccount.google.com`; the Console (`/admin`) is the scope-selected operator surface from [docs/028](028_tenant-scoped-platform-experience.md). OIDC/OAuth is the protocol layer for clients and resource servers; SCIM is the directory layer for machine integrations; Better Auth is the auth runtime. Step-up attaches to sensitive Console scopes and actions, not to login, so a normal user signs in cleanly to the Account shell while platform operations still demand a second factor. Repository-specific account endpoints exist only where they safely project current-user data that no standard endpoint provides. That gives `id` the missing normal-user capacity while keeping the standards boundaries — and the two-shell split — clear.
