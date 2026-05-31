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
> - Okta End-User settings documentation: <https://help.okta.com/oie/en-us/content/topics/identity-engine/enduser/eu-settings.htm>
> - Okta End-User Dashboard documentation: <https://help.okta.com/oie/en-us/content/topics/identity-engine/enduser/end-user-dashboard.htm>
> - Okta MyAccount API overview: <https://developer.okta.com/docs/api/openapi/okta-myaccount/guides/overview/>
> - Auth0 Organizations overview: <https://auth0.com/docs/organizations>
> - Auth0 user profile metadata guidance: <https://auth0.com/docs/manage-users/user-accounts/metadata>
> - Auth0 Authentication API password-change flow: <https://auth0.com/docs/authenticate/database-connections/password-change>
> - Auth0 Management API users endpoint overview: <https://auth0.com/docs/api/management/v2/users>
>
> Assumptions:
>
> - `id` remains one authorization-server deployment and one issuer. The Account Center is a hosted product surface inside that issuer, not a second identity product.
> - Public self-registration remains disabled. Admins create users; users later manage their own account properties that the server explicitly exposes.
> - Better Auth `1.6.11` remains the pinned auth library for the first implementation. Endpoint shapes in this document are based on the installed package type declarations and should be rechecked if the package is upgraded.
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
  - [6.1 Surface Map](#61-surface-map)
  - [6.2 User And Client Responsibilities](#62-user-and-client-responsibilities)
  - [6.3 One Organization Lens Relationship](#63-one-organization-lens-relationship)
- [7. Account Center Information Architecture](#7-account-center-information-architecture)
  - [7.1 Route Map](#71-route-map)
  - [7.2 Shell Model](#72-shell-model)
  - [7.3 Screen Sketches](#73-screen-sketches)
- [8. API Proposal](#8-api-proposal)
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
- [15. Minimal Implementation Backlog](#15-minimal-implementation-backlog)
- [16. Future Backlog](#16-future-backlog)
- [17. Definition Of Done](#17-definition-of-done)
- [18. Final Model](#18-final-model)

## 1. Goal

Extend `id` with a normal-user self-service identity surface without weakening the existing standards-first architecture. The user should have one canonical place to manage their own identity, security, sessions, connected applications, and organization memberships. Client applications should display users through OIDC claims/UserInfo, redirect users to hosted account pages for shared identity changes, use SCIM only for privileged directory integration, and keep app-specific profile fields in their own domain.

The immediate product question is not "should every app call SCIM or a custom update-user API?" The answer is split by actor:

- Browser users manage themselves through hosted `/account/*` pages.
- OIDC clients display the current subject through ID token and UserInfo claims.
- Enterprise systems and resource servers use SCIM/OAuth/JWKS/introspection/revocation where those standards apply.
- Platform and delegated admins manage other users through `/admin/*`.

Non-goals for the first release:

- Do not make Account Center an admin console with friendlier labels.
- Do not expose session tokens, OAuth refresh tokens, client secrets, private JWKS material, reset tokens, or verification tokens to UI code.
- Do not use SCIM as a normal-user mutation API.
- Do not add broad user profile columns without a documented OIDC/SCIM claim contract.
- Do not enable user deletion before tenant, audit, OAuth grant, SCIM, and downstream application-data consequences are designed.
- Do not implement full MFA enrollment as part of the Account Center first pass. Admin OTP from [docs/024](024_admin-login-context-guard.md) is an admin login control, not a user-managed MFA feature.

## 2. Executive Recommendation

Add a hosted Account Center at `/account` and public utility pages at `/forgot-password`, `/reset-password`, and `/verify-email`. Keep `/admin` as the management surface and evolve it with the tenant-scoped model from [docs/028](028_tenant-scoped-platform-experience.md). Keep OAuth/OIDC, SCIM, JWT/JWKS, revocation, introspection, and logout on their standard protocol paths. Use Better Auth self-service endpoints where the installed package already provides the right primitive. Add one small Better Auth plugin, `idAccountCenter`, for safe current-user projections that should not call raw Better Auth routes directly from browser UI.

The most important implementation change is the login-context split. Today `/login` is effectively admin/OAuth-oriented. With Account Center, `/login` must support three contexts:

| Context | Entry | Result |
|---|---|---|
| OAuth/OIDC | Signed authorize query carried by `oauth_query` | Continue OAuth flow after sign-in. |
| Admin | Safe local `callbackURL` under `/admin` | Sign in, require admin OTP, then enforce admin route authorization. |
| Account | Safe local `callbackURL` under `/account` | Sign in as a normal user, skip admin OTP, then open Account Center. |

Direct `/login` should default to `/account` after the account pages exist. `/admin` should continue to redirect to `/login?callbackURL=/admin` and keep admin-specific OTP behavior.

This is not a whole-platform refactor. It is an additional hosted identity layer plus small server-side account projections. The broader platform mental model changes, but most existing OAuth/OIDC, SCIM, admin, organization, and resource-server contracts stay where they are.

## 3. Vocabulary

Account Center: hosted first-party UI under `/account/*` where a signed-in user manages their own shared identity state.

Hosted auth utility pages: public or token-driven pages under `/forgot-password`, `/reset-password`, and `/verify-email` that complete user recovery and verification flows with Better Auth endpoints.

Shared identity profile: the minimal profile data `id` owns and can issue as OIDC claims, initially `id`, `email`, `emailVerified`, `name`, and optionally `image`.

Application profile: product-specific preferences or profile fields owned by a client application. These should not be added to `id` unless they become shared identity claims.

Connected app: an OAuth/OIDC client for which the current user has an authorization consent grant.

Directory boundary: SCIM v2 Users and Groups read/query today, future privileged provisioning only if approved.

Protocol boundary: OIDC/OAuth/JWKS/UserInfo/logout/revocation/introspection contracts used by clients and resource servers.

Admin boundary: platform or delegated management of other users, organizations, OAuth clients, scopes, keys, sessions, consents, and audit events.

## 4. Research Findings

### 4.1 Current Repo Findings

F1. `ui-id` has hosted auth and admin pages, but no normal-user account pages. `workers/ui/src/app` contains `/login`, `/consent`, `/select-authorization-context`, `/admin`, `/ui-health`, and shared app files. There is no `/account`, `/forgot-password`, `/reset-password`, or `/verify-email` route.

F2. `workers/ui/wrangler.jsonc` routes only `/login*`, `/consent*`, `/select-authorization-context*`, `/admin*`, `/ui-health`, and `/assets/*` to `ui-id`. Account and recovery routes need both `assets.run_worker_first` and production `routes` entries. The wildcard suffix is required for browser routes because Cloudflare route matching includes query strings.

F3. `workers/ui/src/proxy.ts` currently protects `/admin` and `/admin/:path*` by requiring `session.user.role === "admin"`. It also intercepts `/login`, but only to skip signed-in admins into admin routes or allow OAuth authorize requests. It does not protect `/account` because the route family does not exist.

F4. `workers/ui/src/proxy.ts` and `workers/ui/src/app/login/login-form.tsx` currently treat safe first-party callbacks as admin-only. `safeAdminCallbackURL()` accepts `/admin` and rejects every other local path. `loginPayload()` defaults non-OAuth sign-in to `/admin`. Account Center requires a generalized safe first-party callback helper that accepts `/account` for normal users and `/admin` for admin flows.

F5. `workers/ui/src/app/login/login-form.tsx` uses `authApiPost` from `@id/lib` and `OAUTH_QUERY_PARAM` from `@id/lib`, which matches the repo rule that UI `/api/auth` calls use shared helpers. It has no forgot-password link or recovery transition.

F6. `workers/ui/docs/screens/auth-flow.md` documents the current hosted auth screens. The pages are centered panel flows, not admin shell pages. Account recovery and verification pages should follow that pattern. Account Center itself should be a first-party account shell, not the admin shell.

F7. `workers/core/src/auth/get-auth.ts` already enables Better Auth email/password, disables public sign-up, requires email verification, sends verification on sign-up, configures password reset email sending, stores sessions in the database, and registers organization/admin/jwt/OAuth/resource-server/scope-catalog/client-picker/admin-audit/admin-activity/SCIM/OpenAPI plugins.

F8. `workers/core/src/auth/types.ts` defines three auth email message kinds: `password-reset`, `verification`, and `admin-otp`. `workers/core/src/auth/adapters/auth-email-render.ts` renders password reset and verification as generic links using the Better Auth-provided URL. That is a valid backend primitive, but the product should route users through hosted UI states.

F9. Better Auth's installed route declarations provide the necessary first-pass self-service primitives: `POST /request-password-reset`, `GET /reset-password/:token`, `POST /reset-password`, `POST /verify-password`, `POST /update-user`, `POST /change-password`, `POST /send-verification-email`, and `GET /verify-email`. `POST /change-email` and `POST /delete-user` exist in the package shape only when corresponding user options are enabled; this repo has not enabled them.

F10. Better Auth's installed `GET /list-sessions` returns session rows that include `token`. `POST /revoke-session` accepts `{ token }`. Browser account UI should not receive bearer session tokens. The repo already solved the same problem for admin users: `workers/core/src/auth/plugins/admin-audit/operations.ts` strips session token material and `workers/core/src/auth/plugins/admin-audit/index.ts` revokes admin-visible sessions by `sessionId`, resolving the token server-side. Account Center should mirror this safety pattern for the current user.

F11. Existing admin audit consent endpoints are platform-admin-only. `GET /api/auth/admin/list-consents` and `POST /api/auth/admin/revoke-consent` operate across users after `requireAdmin`. Account Center needs current-user consent projections and current-user revocation, not reuse of platform-admin aggregate endpoints.

F12. `packages/ui/src/index.ts` already exports primitives needed for account pages: `Page`, `Panel`, `Stack`, `Text`, `Button`, `Form`, `TextInput`, `Alert`, `Badge`, `Tabs`, `DataTable`, `DescriptionList`, `Avatar`, `Menu`, `Switch`, `ConfirmDialog`, `Toast`, and other supporting components. No design-system rewrite is needed.

F13. [docs/028](028_tenant-scoped-platform-experience.md) already separates Platform, Organization, and Account contexts. This doc should deepen the Account context rather than re-open the whole tenant console design.

### 4.2 External Product Findings

Okta has a distinct end-user experience separate from admin management. The Okta End-User Dashboard is where users launch assigned apps and access settings, while admin and developer APIs remain separate. Okta's end-user settings pattern includes self-service password, security methods, and personal information surfaces depending on org policy. The design lesson for `id`: normal users need a recognizable account place even if they are not admins, and the account place should not expose admin IA.

Okta's MyAccount API is a current-user API family, not a general admin directory API. It scopes operations to the authenticated user's own profile, password, email, phone, and authenticator state. The design lesson for `id`: if we add repository-specific account endpoints, they should be current-user scoped and separate from admin APIs. They should not become a generic user-management API.

Auth0 separates user profile data, Management API operations, Authentication API flows, Organizations, and application authorization. User profile metadata guidance distinguishes profile/user metadata from application metadata and warns against mixing app-specific data into identity claims without intent. The design lesson for `id`: keep the shared identity profile small and avoid turning `id` into a junk drawer for every consuming app's profile fields.

Auth0 password-change flows are authentication/recovery flows, not SCIM operations. Auth0 Organizations represent B2B/customer context while still using the Auth0 tenant as the issuer/control plane. The design lesson for `id`: organization membership and account self-service can coexist, but the identity provider still owns recovery flows through hosted auth pages.

Across Okta/Auth0-like products, the pattern is stable: an end user can self-serve basic account/security actions; admins use a separate management console; clients integrate by redirecting or calling protocol APIs; enterprise directory integrations use SCIM or management APIs with privileged credentials. `id` should follow this split.

### 4.3 Standards Findings

OIDC Core standardizes ID tokens, UserInfo, standard claims, authentication requests, and consent/login flow behavior. It does not standardize a browser page where a user edits their profile, changes password, or lists sessions. Therefore `/account` is a product URL and repository/provider-specific extension, not an OIDC endpoint.

OIDC Discovery and OAuth Authorization Server Metadata standardize discovery of issuer capabilities and endpoint URLs. The first release should not publish account-center metadata as if it were a standard OIDC endpoint. A future provider-specific metadata field can be documented if clients need a discoverable account URL.

OIDC RP-Initiated Logout standardizes how a relying party can ask the OpenID Provider to log out the end user. It is the right standards-shaped answer for relying-party logout. It is not a password-change, session-inventory, or account-deletion mechanism.

RFC 7009 token revocation standardizes revoking OAuth tokens. It is not the same as revoking a browser session or deleting a user consent record. Account Center can provide "disconnect app" UX, but token revocation remains an OAuth authorization-server operation.

RFC 7662 token introspection standardizes token active-state lookup for protected resources or clients when introspection is appropriate. It should not be used as a user-profile or directory lookup API.

RFC 7643 and RFC 7644 standardize SCIM Users and Groups schemas/protocol operations. SCIM is the right shape for directory read/query and future privileged provisioning. It is not the normal-user account settings API.

RFC 9068 describes JWT access token claim shape. It is relevant to resource-server verification, not account-center mutations.

### 4.4 Better Auth Capability Findings

Better Auth `request-password-reset` accepts `{ email, redirectTo? }` and returns a neutral status/message shape. That supports hosted `/forgot-password` with neutral copy.

Better Auth `reset-password` accepts `{ newPassword, token? }` plus optional query token and returns `{ status }`. Better Auth also exposes `GET /reset-password/:token` with `callbackURL`, so implementation must test the exact browser callback shape before final route wiring.

Better Auth `send-verification-email` accepts `{ email, callbackURL? }`; `verify-email` accepts `{ token, callbackURL? }`. This supports hosted verification pages and safe local callbacks.

Better Auth `update-user` supports `name` and `image` in the base shape. It also permits additional configured fields, but this repo has not declared extra user profile fields. The first Account Center should expose only fields the repo intentionally owns.

Better Auth `change-password` accepts `{ currentPassword, newPassword, revokeOtherSessions? }` and returns a replacement token/user shape. Account Center can use it for signed-in password change.

Better Auth has session middleware variants including sensitive/fresh session behavior. Sensitive account operations should prefer Better Auth's existing middleware primitives or built-in endpoints instead of a custom credential-check route.

## 5. Standards And Capability Classification

| Mechanism | Classification | Correct Use In `id` | Wrong Use In `id` |
|---|---|---|---|
| OIDC ID Token | Protocol standard | Display current signed-in subject and standard claims after authentication. | Profile mutation, password reset, session listing, or durable directory search. |
| OIDC UserInfo | Protocol standard | Let clients refresh displayable claims for the current access-token subject. | Admin user lookup, SCIM replacement, or app-specific profile storage. |
| OIDC Discovery / RFC 8414 metadata | Protocol standard | Publish issuer, JWKS URI, OAuth/OIDC endpoints, supported scopes/claims. | Pretend a provider-specific `/account` page is a standard OIDC endpoint. |
| OIDC RP-Initiated Logout | Protocol standard | Relying-party initiated logout. | Password change, consent revoke, or "logout every app" shortcut outside protocol design. |
| OAuth Token Revocation | Protocol standard | Revoke OAuth tokens according to RFC 7009. | Revoke browser sessions by exposing session tokens to UI. |
| OAuth Token Introspection | Protocol standard | Token active-state lookup if opaque/introspected tokens are needed. | User profile management or directory read. |
| JWT/JWKS | Protocol standard / JWT profile | Resource server token verification. | Account settings or user mutation. |
| SCIM Users/Groups | Interoperability standard | Directory read/query today; future privileged provisioning if approved. | Normal end-user self-service. |
| Better Auth self-service endpoints | Library-supported capability | Password reset, verification, update-user, change-password, current session. | Cross-tenant directory integration or OAuth client management. |
| Hosted `/account` URL | Established industry pattern, provider-specific product surface | User self-service and client redirect target. | A portable standard endpoint that all OIDC clients can call generically. |
| `idAccountCenter` plugin | Repository-specific extension | Safe current-user projections for sessions, consents, org memberships, and summary. | Replacement for OIDC, OAuth revocation, SCIM, or admin APIs. |

Repository-specific extensions are allowed here only because the precise unmet requirement is human self-service UX and safe current-user projection. Existing standards are not a fit for that full product surface.

## 6. Target Product Model

### 6.1 Surface Map

| Surface | Route / Interface | Audience | Job |
|---|---|---|---|
| Account Center | `/account/*` | Any signed-in user | Manage own shared identity, security, sessions, connected apps, and organization memberships. |
| Hosted auth utility pages | `/forgot-password`, `/reset-password`, `/verify-email` | Browser users in recovery/verification flows | Complete recovery and verification with Better Auth token semantics behind first-party UI. |
| Admin Console | `/admin/*` | Platform admins and future delegated org admins | Manage users, tenants, OAuth clients, resource APIs, keys, sessions, consents, and audit. |
| OAuth/OIDC APIs | `/api/auth/oauth2/*`, `/api/auth/jwks`, discovery metadata, UserInfo | Clients and resource servers | Authentication, authorization, claims, token verification, token lifecycle. |
| SCIM directory | `/api/auth/scim/v2/*` | Privileged machine clients | Directory read/query and future provisioning if approved. |

### 6.2 User And Client Responsibilities

Users should go to `/account` when they want to change shared identity or security state.

Client apps should:

- display current user from ID token/UserInfo claims;
- redirect to `/account/profile` for shared profile edits;
- redirect to `/account/security` for password/security changes;
- redirect to `/account/consents` for connected-app review;
- store app-specific profile fields locally;
- use OIDC logout for relying-party logout behavior;
- use OAuth revocation only for OAuth token revocation use cases;
- use SCIM only from trusted machine integrations that need directory-shaped data.

Admins should use `/admin`, not `/account`, when acting on other users or tenant resources.

### 6.3 One Organization Lens Relationship

[docs/028](028_tenant-scoped-platform-experience.md) covers tenant-scoped admin. This document extends the Account context. The relationship is:

- `/account/organizations` tells the user where they belong and what they can do.
- If the user has exactly one organization, a single membership row is not awkward because it is part of a personal account overview, not a sparse admin table.
- If the user has multiple organizations, the same page becomes the personal tenant map.
- If the user can administer an organization, the row links to the tenant-scoped admin surface such as `/admin/orgs/:orgId`.
- If the user is only a member, the row shows membership and team context without implying management rights.

The UI should not route ordinary users into `/admin` just to show one org row. Account Center is the correct place for that.

## 7. Account Center Information Architecture

### 7.1 Route Map

| Route | Auth | First Release | Purpose |
|---|---|---|---|
| `/account` | Required | Yes | Overview with profile summary, verification state, security summary, organizations, sessions, and connected-app counts. |
| `/account/profile` | Required | Yes | Edit `name` and optional `image`; show email and verification state. |
| `/account/security` | Required | Yes | Change password, resend verification email, show MFA placeholder state, link to sessions. |
| `/account/sessions` | Required | Yes | List safe current-user sessions and revoke by session id. |
| `/account/consents` | Required | Yes | List connected OAuth/OIDC apps and revoke current-user grants. |
| `/account/organizations` | Required | Yes | List memberships, roles, teams, and allowed admin-console links. |
| `/forgot-password` | Public | Yes | Request reset email with neutral success state. |
| `/reset-password` | Token flow | Yes | Complete password reset through Better Auth token route/mutation. |
| `/verify-email` | Token flow | Yes | Complete or display email verification result. |
| `/account/delete` | Required | No | Defer until lifecycle and compliance design exists. |

### 7.2 Shell Model

Account Center should use a small first-party account shell, not `AdminShell`.

Shell requirements:

- First row: product identity, signed-in user identity, sign-out action.
- Navigation: Overview, Profile, Security, Sessions, Connected apps, Organizations.
- No platform metrics, platform sidebar, admin search, or admin route tree.
- On mobile, use tabs or compact menu; avoid nesting cards inside cards.
- Reuse `@id/ui` primitives where possible: `Page`, `Stack`, `Inline`, `Text`, `Button`, `Badge`, `Tabs`, `DescriptionList`, `DataTable`, `Avatar`, `ConfirmDialog`, `Alert`, `Toast`, `Menu`.
- Account content components should own data with SWR if they behave like admin content components. API action wrappers should stay plain functions and call `@id/lib` helpers.

Public recovery/verification pages should keep the existing auth-flow pattern: centered panel, no account/admin shell, server page component plus `"use client"` form component.

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
| Admin Org                                      Admin          Open admin     |
|                                                                            |
| Connected apps                                                             |
| 4 applications authorized                            Review access          |
+----------------------------------------------------------------------------+
```

Profile:

```text
+----------------------------------------------------------------------------+
| Profile                                                                    |
|                                                                            |
| Display name                                                               |
| [Person Example                                            ]               |
|                                                                            |
| Email                                                                      |
| person@example.com                                      Verified            |
|                                                                            |
| Avatar URL                                                                 |
| [https://example.com/avatar.png                            ]               |
|                                                                            |
| [Save changes]                                                             |
+----------------------------------------------------------------------------+
```

Security:

```text
+----------------------------------------------------------------------------+
| Security                                                                   |
|                                                                            |
| Password                                                                   |
| Current password                                                           |
| [                                                        ]                  |
| New password                                                               |
| [                                                        ]                  |
| Confirm new password                                                       |
| [                                                        ]                  |
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
|                                                                            |
| This browser                                      Current                   |
| Chrome on macOS                                   Last active now           |
| Created May 31, 2026                              Expires Jun 7, 2026       |
|                                                                            |
| Firefox on Windows                                Revoke                    |
| Last active May 30, 2026                                                   |
|                                                                            |
| [Sign out other devices]   [Sign out everywhere]                            |
+----------------------------------------------------------------------------+
```

Connected apps:

```text
+----------------------------------------------------------------------------+
| Connected apps                                                             |
|                                                                            |
| Content App                                                                |
| openid profile email content:read                                           |
| Resource: https://content-api.example.com                                   |
| Authorized May 20, 2026                              Revoke                 |
|                                                                            |
| Books App                                                                  |
| openid profile email                                                       |
| Authorized May 24, 2026                              Revoke                 |
+----------------------------------------------------------------------------+
```

Organizations:

```text
+----------------------------------------------------------------------------+
| Organizations                                                              |
|                                                                            |
| Acme                                                                       |
| Member                                                                     |
| Teams: Editors                                                             |
|                                                                            |
| Admin Org                                                                  |
| Admin                                                                      |
| [Open admin console]                                                       |
+----------------------------------------------------------------------------+
```

Forgot password:

```text
+------------------------------------------+
| Reset your password                      |
|                                          |
| Email                                    |
| [person@example.com                    ] |
|                                          |
| [Send reset link]                        |
+------------------------------------------+
```

Reset password:

```text
+------------------------------------------+
| Choose a new password                    |
|                                          |
| New password                             |
| [                                      ] |
| Confirm new password                     |
| [                                      ] |
|                                          |
| [Reset password]                         |
+------------------------------------------+
```

Verify email:

```text
+------------------------------------------+
| Verifying email                          |
|                                          |
| Checking your verification link...       |
+------------------------------------------+
```

## 8. API Proposal

### 8.1 API Rules

Every browser-facing account action should call same-origin `/api/auth/*` through `@id/lib` helpers. Do not call `fetch()` directly inside account route files, public auth utility form components, or action modules.

The Account Center API is a projection layer. It should not introduce a second account database. It should use Better Auth endpoints directly where safe and a Better Auth plugin where a safe current-user shape is missing.

New custom account endpoints should live under `/api/auth/account/*` and be implemented as a Better Auth plugin under `workers/core/src/auth/plugins/account-center/**`. This keeps auth-owned behavior inside the auth boundary and avoids `ui-id` importing Better Auth, Drizzle, D1/KV, or core source.

Endpoint responses must not include bearer tokens, session tokens, reset tokens, verification tokens, OAuth refresh/access token values, client secrets, or JWKS private material.

### 8.2 Direct Better Auth Endpoint Usage

| UI Need | Endpoint | Request | Response / Handling |
|---|---|---|---|
| Current session | `GET /api/auth/get-session` | Query may include `disableRefresh=true&disableCookieCache=true` for guards | Use for route protection and account shell identity. |
| Update minimal profile | `POST /api/auth/update-user` | `{ "name": "...", "image": "..." }` | Expose only allowed fields. |
| Request reset email | `POST /api/auth/request-password-reset` | `{ "email": "...", "redirectTo": "/reset-password" }` or tested callback shape | Always render neutral success. |
| Complete reset | `POST /api/auth/reset-password` | `{ "newPassword": "...", "token": "..." }` | Navigate to login/account after success. |
| Change password | `POST /api/auth/change-password` | `{ "currentPassword": "...", "newPassword": "...", "revokeOtherSessions": true }` | Treat returned token/user carefully; do not log token. |
| Verify current password | `POST /api/auth/verify-password` | `{ "password": "..." }` | Use later for freshness confirmation. |
| Send verification email | `POST /api/auth/send-verification-email` | `{ "email": "...", "callbackURL": "/verify-email" }` | Neutral success; exact callback tested. |
| Verify email | `GET /api/auth/verify-email` | `?token=...&callbackURL=/account/security` | Show success/expired/already-verified state. |

Do not use these in first release:

| Endpoint | Reason |
|---|---|
| `POST /api/auth/change-email` | Better Auth supports this when configured, but `get-auth.ts` has not enabled `user.changeEmail`; email change needs verification/freshness policy. |
| `POST /api/auth/delete-user` | Account deletion requires separate lifecycle design. |
| `GET /api/auth/list-sessions` directly in UI | Installed type shape includes `token`; use safe wrapper. |
| `POST /api/auth/revoke-session` directly in UI | Requires token; use safe wrapper by `sessionId`. |

### 8.3 `idAccountCenter` Plugin

Add a Better Auth plugin only for safe current-user projections. Initial plugin schema: none. It can use adapter reads of Better Auth-owned models, following the `admin-audit` plugin's session token stripping and server-side revoke pattern.

#### `GET /api/auth/account/summary`

Purpose: render the overview without over-fetching every tab.

Response:

```json
{
  "user": {
    "id": "usr_...",
    "email": "person@example.com",
    "emailVerified": true,
    "name": "Person Example",
    "image": null
  },
  "security": {
    "passwordEnabled": true,
    "mfaEnabled": false,
    "emailVerificationRequired": true
  },
  "counts": {
    "organizations": 2,
    "activeSessions": 3,
    "connectedApplications": 4
  }
}
```

#### `GET /api/auth/account/sessions`

Purpose: list current-user sessions without token exposure.

Response:

```json
{
  "sessions": [
    {
      "id": "sess_...",
      "current": true,
      "createdAt": "2026-05-31T09:20:00.000Z",
      "updatedAt": "2026-05-31T10:05:00.000Z",
      "expiresAt": "2026-06-07T09:20:00.000Z",
      "ipAddress": "203.0.113.10",
      "userAgent": "Chrome on macOS"
    }
  ]
}
```

Authorization: session required; return only sessions whose `userId` is the current user id. Never return `token`.

#### `POST /api/auth/account/sessions/revoke`

Request:

```json
{
  "sessionId": "sess_..."
}
```

Response:

```json
{
  "status": true
}
```

Authorization: session required; target session must belong to current user. Implementation should look up by `id` and current `userId`, then call the internal session adapter with the stored token server-side.

#### `POST /api/auth/account/sessions/revoke-others`

Request:

```json
{}
```

Response:

```json
{
  "status": true,
  "revoked": 2
}
```

This can delegate to Better Auth `revoke-other-sessions` if the implementation can normalize the response and avoid exposing tokens.

#### `POST /api/auth/account/sessions/revoke-all`

Request:

```json
{}
```

Response:

```json
{
  "status": true
}
```

UI behavior: navigate to `/login?callbackURL=/account` after success because the current session is gone.

#### `GET /api/auth/account/consents`

Purpose: current user's connected OAuth/OIDC apps.

Response:

```json
{
  "consents": [
    {
      "id": "consent_...",
      "clientId": "client_...",
      "clientName": "Content App",
      "scopes": ["openid", "profile", "email", "content:read"],
      "resources": ["https://content-api.example.com"],
      "createdAt": "2026-05-20T08:00:00.000Z",
      "updatedAt": "2026-05-25T12:00:00.000Z"
    }
  ]
}
```

Authorization: session required; filter `oauthConsent.userId` to current user. This endpoint is consent management, not RFC 7009 token revocation.

#### `POST /api/auth/account/consents/revoke`

Request:

```json
{
  "clientId": "client_...",
  "resource": "https://content-api.example.com"
}
```

Response:

```json
{
  "status": true
}
```

Authorization: session required; revoke only current-user consent rows. If consent is not resource-specific in the current Better Auth model, document that the request revokes the whole client/user consent.

#### `GET /api/auth/account/organizations`

Purpose: current user's membership map and tenant navigation.

Response:

```json
{
  "organizations": [
    {
      "id": "org_...",
      "name": "Acme",
      "slug": "acme",
      "role": "member",
      "teams": [
        {
          "id": "team_...",
          "name": "Editors"
        }
      ],
      "canOpenAdmin": false,
      "adminHref": null
    },
    {
      "id": "org_admin",
      "name": "Admin Org",
      "slug": "admin-org",
      "role": "admin",
      "teams": [],
      "canOpenAdmin": true,
      "adminHref": "/admin/orgs/org_admin"
    }
  ]
}
```

Authorization: session required; return only memberships for current user. `canOpenAdmin` must come from the same policy that will protect the target admin route, not from a display-only role string.

### 8.4 UI Action Contracts

Suggested files:

- `workers/ui/src/app/account/_actions/account.ts`
- `workers/ui/src/app/account/_components/account-shell.tsx`
- `workers/ui/src/app/account/_components/account-overview-content.tsx`
- `workers/ui/src/app/account/_components/profile-content.tsx`
- `workers/ui/src/app/account/_components/security-content.tsx`
- `workers/ui/src/app/account/_components/sessions-content.tsx`
- `workers/ui/src/app/account/_components/consents-content.tsx`
- `workers/ui/src/app/account/_components/organizations-content.tsx`
- `workers/ui/src/app/forgot-password/forgot-password-form.tsx`
- `workers/ui/src/app/reset-password/reset-password-form.tsx`
- `workers/ui/src/app/verify-email/verify-email-status.tsx`

Action function shape:

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

Current implementation has a strict admin context guard and admin OTP. Account Center needs the guard to accept an account context while preserving the security fix from [docs/024](024_admin-login-context-guard.md).

Target context rules:

| Request Shape | Context | Server Behavior | UI Behavior |
|---|---|---|---|
| `oauth_query` present | OAuth | Existing OAuth signed-query validation and continuation. | Login form does not inject callback URL. |
| `callbackURL` starts with `/admin` | Admin | Validate credentials, require admin OTP, then sign in. | OTP challenge after credential submit. |
| `callbackURL` starts with `/account` | Account | Validate credentials and sign in without admin OTP. | Normal account login. |
| no OAuth query and no callback | Account default | Server may treat as `/account`; UI should send `/account`. | Direct `/login` lands in Account Center. |
| absolute or unsafe callback | Invalid | Reject or normalize to safe account default. | Show error or ignore unsafe value. |

Implementation options:

- Keep plugin file name `admin-sign-in-guard` for compatibility but broaden logic to "sign-in context guard"; or
- Rename conceptually to `idSignInContextGuard` only when code churn is acceptable.

The important behavior is not the file name. It is that context-less login remains closed while `/account` is a valid first-party login target.

### 9.2 Forgot Password

Flow:

1. User opens `/forgot-password`.
2. UI submits `{ email, redirectTo }` to `POST /api/auth/request-password-reset`.
3. UI always renders neutral success copy.
4. Better Auth sends email through `sendResetPassword` configured in `get-auth.ts`.
5. Email link routes through Better Auth token semantics and lands at `/reset-password` or a callback that gives the UI a reset token.

Security requirements:

- Do not reveal whether the email exists.
- Do not log the submitted email with reset token context.
- Rate limiting stays at edge/WAF or a future plugin throttle, matching current `rateLimit.enabled: false` rationale in `get-auth.ts`.

### 9.3 Reset Password

Flow:

1. User follows email link.
2. UI enters `/reset-password` in a checking state.
3. UI either receives a usable token from Better Auth's reset callback route or reads a token in the tested callback shape.
4. User enters new password and confirmation.
5. UI submits `POST /api/auth/reset-password`.
6. On success, navigate to `/login?callbackURL=/account/security` or to `/account/security` if the backend signs the user in.

Implementation warning: Better Auth exposes both `GET /reset-password/:token` with `callbackURL` and `POST /reset-password`. The exact first browser link shape must be covered by integration tests before production routing is finalized.

### 9.4 Email Verification

Flow:

1. Verification email is sent on sign-up or user resends it from `/account/security`.
2. Link uses Better Auth verification token.
3. UI enters `/verify-email` checking state.
4. UI calls `GET /api/auth/verify-email?token=...&callbackURL=/account/security` or follows the tested callback path.
5. UI shows success, already verified, invalid, or expired state.

If the user is signed in, success returns to `/account/security`. If not signed in, the page can show success and provide sign-in.

### 9.5 Password Change

Signed-in password change belongs under `/account/security`.

Request:

```json
{
  "currentPassword": "existing secret",
  "newPassword": "new secret",
  "revokeOtherSessions": true
}
```

Endpoint: `POST /api/auth/change-password`.

UI:

- Validate presence and confirmation client-side.
- Let server enforce password policy.
- Offer "sign out other devices".
- After success, show confirmation and refresh sessions.
- Do not display or log returned token.

### 9.6 Email Change

Defer first release. When enabled:

- Use Better Auth `user.changeEmail`, not a custom `update-user` email write.
- Require current session and likely password freshness.
- Verify the new address before issuing changed OIDC `email` claim unless the selected Better Auth configuration explicitly supports pending email.
- Notify old address where feasible.
- Record a security event when identity event producer is available.

## 10. Data Model And Claim Policy

Initial shared identity fields:

| Field | Owner | Mutability | Claim / Use |
|---|---|---|---|
| `id` | Better Auth | Immutable | OIDC `sub` / internal user id. |
| `email` | Better Auth | Future verified email-change only | OIDC `email`; login identifier. |
| `emailVerified` | Better Auth | System-managed | OIDC `email_verified`; verification UI. |
| `name` | Better Auth | User-editable | OIDC `name`; display. |
| `image` | Better Auth | User-editable only as URL unless upload/storage is designed | OIDC-like `picture` mapping if emitted. |

Do not add app-specific fields to this table. A reading app's display preferences, a content app's bio, or a CRM's job title should remain in that application unless it becomes a shared identity claim.

Future `idUserProfile` plugin fields can be considered only with a claim contract:

- claim name;
- OIDC scope needed;
- SCIM mapping if any;
- update authority;
- visibility in Account Center;
- admin editability;
- audit/security behavior.

## 11. Architecture Decisions

### Decision 1: Host Account Center In `ui-id`

Recommended. `ui-id` already owns hosted UI pages and calls same-origin `/api/auth/*`. This keeps browser presentation out of `core-id` and keeps `core-id` focused on Better Auth and API contracts.

Rejected: build account pages in `core-id`. That would mix presentation into the authorization server worker and fight the established two-worker split.

### Decision 2: Use Better Auth Plugin For Safe Account Projections

Recommended. Session, user, OAuth consent, and organization membership data are auth-owned. A Better Auth plugin can use session middleware, adapter access, and internal session deletion without exposing tokens.

Rejected: Hono `/api/admin/*` or `/account/api/*` routes reading auth tables directly. That would blur ownership and risk raw D1/Drizzle access to Better Auth tables outside the auth boundary.

### Decision 3: Do Not Use SCIM For Browser Self-Service

Recommended. SCIM remains directory integration. Browser self-service uses hosted UI and Better Auth endpoints.

Rejected: having client apps update users through SCIM for normal profile edits. SCIM clients are privileged directory actors and do not represent the end user in a browser session.

### Decision 4: Keep The Shared User Profile Minimal

Recommended. Minimal shared profile avoids turning `id` into a domain-profile dumping ground and keeps OIDC claims trustworthy.

Rejected: adding arbitrary columns to make every client happy. That creates unclear ownership, unclear claim semantics, and bad migration pressure.

### Decision 5: Default Direct Login To Account Center

Recommended. Once `/account` exists, direct `/login` should send normal users to `/account`, not `/admin`.

Rejected: keep direct `/login` defaulting to `/admin`. That preserves an admin-centric assumption and makes account self-service feel bolted on.

## 12. Migration And Rollout

Phase 1: Generalize login context.

- Allow safe `/account` callback in UI and server guard.
- Keep `/admin` branch and admin OTP unchanged.
- Direct `/login` defaults to `/account`.
- Add tests for admin, account, OAuth, and unsafe callback behavior.

Phase 2: Add public utility routes.

- Add `/forgot-password`, `/reset-password`, and `/verify-email` under `workers/ui/src/app`.
- Add `workers/ui/docs/screens/auth-flow.md` entries for those pages if implementation touches screen specs.
- Update `workers/ui/wrangler.jsonc` routes/run_worker_first.
- Test reset/verification callback shapes against Better Auth.

Phase 3: Add Account Center shell and summary.

- Add account route protection in proxy.
- Add account shell and overview page.
- Add `idAccountCenter` summary endpoint.

Phase 4: Add self-service pages.

- Profile and security use direct Better Auth endpoints.
- Sessions/consents/organizations use safe account plugin endpoints.
- Add tests for token stripping and current-user scoping.

Phase 5: Documentation and client integration.

- Update integration guide to tell clients when to use UserInfo, Account Center links, SCIM, and app-local profile fields.
- Update README route topology after implementation changes.

Rollback:

- Account pages can be disabled by removing UI routes before any schema change because the first plugin has no new tables.
- Login-context change must be rolled back carefully because `/admin` security depends on it; keep admin tests as the rollback safety check.

## 13. Edge Cases And Failure Modes

Unsafe callback URL: reject or ignore absolute/external callbacks; route to `/account` default or show safe error. Never redirect to arbitrary origins.

OAuth authorize flow on `/login`: preserve current signed `oauth_query` behavior. Do not inject account callback into OAuth flow.

Admin login: `/admin` callback must still trigger admin OTP. Account context must not bypass admin route authorization.

Unauthenticated `/account`: redirect to `/login?callbackURL=/account...` and preserve safe local path/query.

One organization membership: render one membership row in account overview/organizations page. Do not force an org-picker page.

Many organization memberships: render searchable or grouped list later; first release can be a simple list if counts are small.

Session list stale after revoke: revalidate SWR key; if current session is revoked, navigate to login.

Better Auth session token exposure: never call `list-sessions` directly from browser UI if the response includes `token`.

Consent revoke with active access token: UI should say connected app access was revoked for future authorization. Existing access tokens may remain valid until expiry unless server policy also revokes token families.

Password reset token expired: show invalid/expired state and link to request a new reset.

Verification link already used: show already-verified or success state without exposing raw backend error.

Email enumeration: forgot-password and verification-resend flows show neutral success.

Email change attempted before enabled: UI should omit or disable email change; server should not expose a fake mutation.

Account deletion requested: not available in first release; link to support/admin process only if a lifecycle policy exists.

Cloudflare route mismatch: if `/account*` or token pages are missing from `wrangler.jsonc`, requests may hit `core-id`/404 instead of `ui-id`. Route smoke tests must cover deployed paths.

## 14. Test And Verification Plan

Docs-only verification for this proposal:

- Confirm doc uses metadata blockquote and table of contents.
- Confirm no unresolved placeholders.
- Confirm README Contracts list contains the document.
- Confirm no prose hard-wrap introduced manually.

Implementation verification:

- `pnpm lint`
- `pnpm check:dup`
- `pnpm typecheck`
- `pnpm test`
- `pnpm check`
- `pnpm deploy:ui:dry-run` after non-trivial UI changes.

Focused tests:

- Proxy redirects unauthenticated `/account` to `/login?callbackURL=/account`.
- Proxy redirects unauthenticated `/admin` to `/login?callbackURL=/admin`.
- Direct `/login` with no OAuth query defaults to account callback.
- OAuth login query continues unchanged.
- Unsafe callback URL is rejected.
- Account login does not require admin OTP.
- Admin login still requires admin OTP.
- Forgot password returns neutral state for known and unknown emails.
- Reset password handles success, missing token, invalid token, expired token.
- Verification handles success, invalid token, expired token, already verified.
- Account session list strips `token`.
- Account revoke session refuses another user's session id.
- Consent list returns only current user's grants.
- Consent revoke cannot revoke another user's grant.
- Organizations list returns only current user's memberships and computes `canOpenAdmin` through policy.

Manual smoke:

- Open `/forgot-password`, request reset, inspect email link target.
- Open reset link and complete password reset.
- Sign in to `/account`.
- Change password with "sign out other devices" checked.
- Revoke another session.
- Revoke connected app consent and verify next OAuth authorize asks for consent again if provider behavior supports it.
- Confirm ordinary user cannot open `/admin`.
- Confirm platform admin can still open `/admin` and admin OTP still appears.

## 15. Minimal Implementation Backlog

### AC-1. Generalize Login Context

Scope:

- `workers/core/src/auth/plugins/admin-sign-in-guard/**`
- `workers/core/src/auth/get-auth.ts`
- `workers/ui/src/proxy.ts`
- `workers/ui/src/app/login/login-form.tsx`
- `workers/ui/tests/**`

Tasks:

- [ ] Accept safe `/account` callbacks in the sign-in context guard.
- [ ] Keep `/admin` callbacks on admin OTP path.
- [ ] Keep OAuth `oauth_query` path unchanged.
- [ ] Default direct `/login` to `/account`.
- [ ] Reject unsafe callbacks.

Acceptance criteria:

- Account users can sign in to `/account`.
- Admin users still need OTP for `/admin`.
- Context-less or unsafe sign-in does not mint a session to an arbitrary redirect.

Tests:

- Proxy/login tests covering admin/account/OAuth/unsafe callback branches.

### AC-2. Hosted Recovery And Verification Pages

Scope:

- `workers/ui/src/app/forgot-password/**`
- `workers/ui/src/app/reset-password/**`
- `workers/ui/src/app/verify-email/**`
- `workers/ui/docs/screens/auth-flow.md`
- `workers/ui/wrangler.jsonc`

Tasks:

- [ ] Add public centered panel pages.
- [ ] Call Better Auth endpoints through `@id/lib` helpers.
- [ ] Test Better Auth reset/verification callback shapes.
- [ ] Add route/run_worker_first entries.

Acceptance criteria:

- User can request reset, complete reset, and verify email through hosted UI.
- Pages do not reveal enumeration-sensitive details.

Tests:

- UI component tests and route smoke tests.

### AC-3. Account Center Shell And Summary

Scope:

- `workers/ui/src/app/account/**`
- `workers/core/src/auth/plugins/account-center/**`
- `workers/core/src/auth/get-auth.ts`

Tasks:

- [ ] Add account shell and route protection.
- [ ] Add `GET /api/auth/account/summary`.
- [ ] Render overview using safe summary data.

Acceptance criteria:

- Signed-in user can open `/account`.
- Unauthenticated user is redirected to login.
- Summary response contains no secrets or token material.

Tests:

- Account route guard tests and plugin endpoint tests.

### AC-4. Profile And Security

Scope:

- `workers/ui/src/app/account/profile/**`
- `workers/ui/src/app/account/security/**`

Tasks:

- [ ] Add profile form for `name`/`image`.
- [ ] Add password change form.
- [ ] Add resend verification action.
- [ ] Show email change as unavailable or omit it.

Acceptance criteria:

- User can update supported fields and change password.
- UI does not expose unsupported email change.

Tests:

- Form validation, action success/failure, password change state.

### AC-5. Sessions, Consents, Organizations

Scope:

- `workers/core/src/auth/plugins/account-center/**`
- `workers/ui/src/app/account/sessions/**`
- `workers/ui/src/app/account/consents/**`
- `workers/ui/src/app/account/organizations/**`

Tasks:

- [ ] Add safe session list/revoke endpoints.
- [ ] Add current-user consent list/revoke endpoints.
- [ ] Add current-user organization membership endpoint.
- [ ] Add UI pages and confirmation dialogs.

Acceptance criteria:

- No session tokens are returned to browser code.
- User cannot see or mutate another user's sessions/consents.
- Organization admin links are authorization-backed.

Tests:

- Plugin authorization tests, UI state tests, manual OAuth consent smoke.

## 16. Future Backlog

- User-managed MFA enrollment using Better Auth-supported two-factor capability, with clear relationship to admin OTP.
- Verified email change flow using Better Auth `user.changeEmail`.
- Account deletion lifecycle after tenant ownership, SCIM deprovisioning, OAuth grants, audit, and downstream app data are designed.
- External application `return_to` support validated against registered OAuth client metadata.
- Provider-specific account-center metadata in discovery only if clients need discoverability and the field is documented as non-standard.
- Inbound SCIM provisioning if an enterprise source-of-truth requires it.
- Extended `idUserProfile` plugin for shared OIDC profile claims only after claim/update/visibility contracts are approved.
- Current-user security event feed once identity events are implemented.

## 17. Definition Of Done

- Document exists under numbered `docs/029_account-center-and-self-service-identity.md` with metadata blockquote, table of contents, findings, references, target model, API/UI design, backlog, risks, tests, and final model.
- README Contracts section links to the document.
- First implementation has `/account`, `/forgot-password`, `/reset-password`, and `/verify-email` routes in UI worker route config.
- Login context supports OAuth, admin, and account branches without weakening admin OTP.
- Account Center APIs are Better Auth plugin endpoints or direct Better Auth endpoint calls through `@id/lib`.
- Browser UI never receives session tokens or other bearer secret material.
- SCIM remains a directory boundary and is not used for normal-user self-service.
- Automated tests cover route protection, callback safety, account endpoint authorization, token stripping, and recovery/verification states.
- Integration docs tell clients how to display users, where to redirect for self-service, when to use SCIM, and what profile fields stay app-local.

## 18. Final Model

The final shape is a layered identity product, not one generic user API. `/account` is the user's home for self-service. `/admin` is the operator and delegated-admin console. OIDC/OAuth is the protocol layer for clients and resource servers. SCIM is the directory layer for machine integrations. Better Auth remains the auth runtime. Repository-specific account endpoints exist only where they safely project current-user data that no standard endpoint provides.

That gives `id` the missing normal-user capacity while keeping the standards boundaries clear.
