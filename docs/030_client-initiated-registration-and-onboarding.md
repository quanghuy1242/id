# Client-Initiated Registration And Onboarding

> Status: implementation-grade research and proposal
>
> Date: 2026-05-31
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` - `core-id` authorization server and `ui-id` hosted auth/account UI
> - `workers/core/src/auth/get-auth.ts` - Better Auth email/password, OAuth provider, organization, admin, and plugin registration
> - `workers/core/src/auth/oauth-provider.ts` - OAuth/OIDC authorize flow, post-login organization context, catalog scope validation, and future `prompt=create` signup page wiring
> - `workers/core/src/auth/plugins/**` - proposed `id-registration` plugin, registration policies, guarded signup, registration intents, and quota enforcement
> - `workers/ui/src/app/**` - proposed hosted `/register` and invitation/registration utility pages
> - `packages/lib/src/auth-fetch.ts` - same-origin `/api/auth/*` helpers used by hosted UI actions
>
> Source docs and local evidence:
>
> - [docs/000_repo-architecture.md](000_repo-architecture.md)
> - [docs/002_implementation-sequence.md](002_implementation-sequence.md)
> - [docs/005_oauth2-oidc-integration-guide.md](005_oauth2-oidc-integration-guide.md)
> - [docs/010_organization-teams-oauth-flow.md](010_organization-teams-oauth-flow.md)
> - [docs/017_scim-directory-and-m2m-principal-contract.md](017_scim-directory-and-m2m-principal-contract.md)
> - [docs/018_m2m-oauth-client-org-binding.md](018_m2m-oauth-client-org-binding.md)
> - [docs/028_tenant-scoped-platform-experience.md](028_tenant-scoped-platform-experience.md)
> - [docs/029_account-center-and-self-service-identity.md](029_account-center-and-self-service-identity.md)
> - [workers/core/src/auth/get-auth.ts](../workers/core/src/auth/get-auth.ts)
> - [workers/core/src/auth/oauth-provider.ts](../workers/core/src/auth/oauth-provider.ts)
> - [workers/core/src/auth/plugins/README.md](../workers/core/src/auth/plugins/README.md)
> - [workers/core/src/auth/plugins/oauth-scope-catalog/README.md](../workers/core/src/auth/plugins/oauth-scope-catalog/README.md)
> - [workers/core/tests/auth/auth-core.test.ts](../workers/core/tests/auth/auth-core.test.ts)
> - [workers/core/tests/auth/contracts.test.ts](../workers/core/tests/auth/contracts.test.ts)
> - [workers/core/tests/auth/fixtures/route-contracts.ts](../workers/core/tests/auth/fixtures/route-contracts.ts)
> - [workers/core/tests/auth/organization-invite-session.test.ts](../workers/core/tests/auth/organization-invite-session.test.ts)
> - [README.md](../README.md)
> - `node_modules/better-auth/dist/api/routes/sign-up.d.mts`
> - `node_modules/@better-auth/oauth-provider/dist/oauth-BqWgUea8.d.mts`
>
> External references checked on 2026-05-31:
>
> - OpenID Connect Initiating User Registration 1.0: <https://openid.net/specs/openid-connect-prompt-create-1_0-final.html>
> - OpenID Connect Core 1.0: <https://openid.net/specs/openid-connect-core-1_0-18.html>
> - OAuth 2.0 Authorization Framework, RFC 6749: <https://www.rfc-editor.org/rfc/rfc6749>
> - OAuth 2.0 Pushed Authorization Requests, RFC 9126: <https://www.rfc-editor.org/rfc/rfc9126>
> - OAuth 2.0 Rich Authorization Requests, RFC 9396: <https://www.rfc-editor.org/rfc/rfc9396>
> - OAuth 2.0 Authorization Server Metadata, RFC 8414: <https://www.rfc-editor.org/rfc/rfc8414>
> - OAuth 2.0 Dynamic Client Registration, RFC 7591: <https://www.rfc-editor.org/rfc/rfc7591>
> - SCIM Core Schema, RFC 7643: <https://www.rfc-editor.org/rfc/rfc7643>
> - SCIM Protocol, RFC 7644: <https://www.rfc-editor.org/rfc/rfc7644>
> - Okta self-service registration concepts: <https://developer.okta.com/docs/concepts/self-service-registration/>
> - Auth0 organization invitation flow: <https://auth0.com/docs/organizations/invite-members>
> - Auth0 connection settings and signup controls: <https://auth0.com/docs/authenticate/connection-settings-best-practices>
>
> Assumptions:
>
> - Public anonymous signup must remain closed unless a server-side registration policy explicitly allows the transaction.
> - Client applications may request registration and scopes, but they never issue identity permissions themselves.
> - The first implementation should support OIDC `prompt=create`, invite-only registration, client-bound registration policies, email verification, default organization membership, least-privilege defaults, and quotas.
> - The first implementation should not implement inbound SCIM provisioning, RAR/PAR, dynamic client registration changes, full user-managed MFA, or arbitrary app-specific profile fields.
> - The repo should continue to use Better Auth as the account/session/password runtime and should not duplicate password account creation logic unless a package-level proof shows no guarded Better Auth signup path is viable.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Executive Recommendation](#2-executive-recommendation)
- [3. Vocabulary](#3-vocabulary)
- [4. Current-State Findings](#4-current-state-findings)
  - [4.1 Repo Findings](#41-repo-findings)
  - [4.2 Standards Findings](#42-standards-findings)
  - [4.3 External Product Findings](#43-external-product-findings)
  - [4.4 Better Auth Findings](#44-better-auth-findings)
  - [4.5 Prior Art And Anti-Pattern (Legacy `auther`)](#45-prior-art-and-anti-pattern-legacy-auther)
- [5. Standards And Capability Classification](#5-standards-and-capability-classification)
- [6. Target Product Model](#6-target-product-model)
  - [6.1 Registration Entry Points](#61-registration-entry-points)
  - [6.2 Policy Modes](#62-policy-modes)
  - [6.3 Permission And Scope Semantics](#63-permission-and-scope-semantics)
- [7. Registration Policy Model](#7-registration-policy-model)
  - [7.1 Policy Record](#71-policy-record)
  - [7.2 Registration Intent](#72-registration-intent)
  - [7.3 Quota And Reservation Model](#73-quota-and-reservation-model)
  - [7.4 Invitation Relationship](#74-invitation-relationship)
- [8. OAuth And Onboarding Flow](#8-oauth-and-onboarding-flow)
  - [8.1 Client-Initiated Signup With `prompt=create`](#81-client-initiated-signup-with-promptcreate)
  - [8.2 Invite-Acceptance Signup](#82-invite-acceptance-signup)
  - [8.3 Admin-Created User Completion](#83-admin-created-user-completion)
  - [8.4 Policy Denial Flow](#84-policy-denial-flow)
- [9. API Design](#9-api-design)
  - [9.1 Admin Policy Endpoints](#91-admin-policy-endpoints)
  - [9.2 Public Registration Endpoints](#92-public-registration-endpoints)
  - [9.3 Signup Guard Contract](#93-signup-guard-contract)
  - [9.4 OAuth Continue Contract](#94-oauth-continue-contract)
- [10. UI Design](#10-ui-design)
  - [10.1 Hosted Register Page](#101-hosted-register-page)
  - [10.2 Invite Page](#102-invite-page)
  - [10.3 Closed Or Quota-Full Page](#103-closed-or-quota-full-page)
  - [10.4 Admin Policy Screens](#104-admin-policy-screens)
- [11. Architecture Decisions](#11-architecture-decisions)
- [12. Migration And Rollout](#12-migration-and-rollout)
- [13. Edge Cases And Failure Modes](#13-edge-cases-and-failure-modes)
- [14. Test And Verification Plan](#14-test-and-verification-plan)
- [15. Minimal Implementation Backlog](#15-minimal-implementation-backlog)
- [16. Future Backlog](#16-future-backlog)
- [17. Definition Of Done](#17-definition-of-done)
- [18. Final Model](#18-final-model)

## 1. Goal

Define how `id` should support controlled signup and onboarding when a client application redirects a new user to `id` for registration. The design must keep registration standards-aligned where standards exist, avoid giving clients the authority to mint permissions, and add product policy for cases that standards intentionally leave to the authorization server: closed signup, invite-only signup, domain allowlists, default organization membership, least-privilege defaults, and quotas such as "allow up to 1000 users for this app/org/campaign."

The desired system is not public signup. The desired system is policy-gated registration:

- A client can ask `id` to start registration using OIDC `prompt=create`.
- The client can request scopes and resources in the OAuth authorization request.
- `id` validates the request against OAuth/OIDC rules, the scope catalog, client metadata, and registration policy.
- `id` decides whether the user can create an account, which organization/team/role defaults apply, and which requested access is allowed to proceed.
- After registration, `id` continues the normal OAuth/OIDC flow so the client receives tokens only through the standard authorization-code path.

Non-goals:

- Do not let client applications call a custom "create user" API.
- Do not let client applications issue roles, teams, product permissions, or OAuth grants by assertion.
- Do not use SCIM for browser signup.
- Do not silently grant product scopes that the user did not request or consent to.
- Do not implement user-generated OAuth clients or dynamic client self-registration in this scope.
- Do not hard-code client ids, client names, organization ids, or scope names in source code. Policy must be database-backed.

## 2. Executive Recommendation

Use OIDC `prompt=create` as the standards-shaped browser entry point for client-initiated signup. Keep Better Auth generic public signup closed unless a registration intent created by `id` authorizes the transaction. Implement registration policy as an auth-boundary Better Auth plugin named `idRegistration`.

Recommended first-release model:

1. Add `signup: { page: "/register" }` to the OAuth provider configuration only after registration policy exists.
2. Add hosted `/register` UI in `ui-id`.
3. Add `idRegistration` plugin in `workers/core/src/auth/plugins/registration/**`.
4. On authorization requests with `prompt=create`, evaluate client, redirect URI, requested scopes, resource, organization hint or invitation, and registration policy.
5. Create a short-lived registration intent that carries the allowed path forward.
6. Let the user submit registration only with that intent.
7. Use Better Auth's sign-up machinery behind a server-side guard if viable, so password account creation remains Better Auth-owned.
8. Verify email before account activation or before OAuth continuation, matching current `requireEmailVerification` posture.
9. Apply least-privilege defaults from server policy: no platform role, org role `member` unless policy/invite says otherwise, minimal teams, no product access unless requested and allowed.
10. Continue the OAuth flow using Better Auth OAuth Provider `/oauth2/continue` with `created: true`, and use existing post-login context selection or a policy-backed selected org context.

The policy layer is repository-specific, but it surrounds standard mechanisms instead of replacing them. `prompt=create`, `scope`, authorization code, consent, and token issuance remain protocol surfaces. Quotas, invite requirements, domain allowlists, and default memberships are product policy.

## 3. Vocabulary

Registration: creating a new `id` user account through a controlled first-party flow.

Onboarding: post-account setup, such as email verification, default organization membership, team assignment, account center redirection, and OAuth flow continuation.

Registration policy: database-backed rule set that decides whether registration is open for a client, organization, invitation, email domain, scope set, resource, quota, or campaign.

Registration intent: short-lived server-side record created after an authorization request is validated. It allows exactly one guarded signup transaction to proceed.

Registration quota: limit on successful registrations or memberships for a policy. A quota may be soft or strict depending on whether the implementation can reserve slots atomically.

Requested scope: OAuth scope value sent by the client in the authorization request.

Allowed scope: scope that exists in `id`'s scope catalog, is allowed for the client/resource/policy, and can continue to consent/token issuance.

Issued scope: final scope included in a token response. OAuth allows this to be narrower than requested.

Default membership: organization role/team assignment applied after signup by server policy or invitation, not by client assertion.

## 4. Current-State Findings

### 4.1 Repo Findings

F1. `workers/core/src/auth/get-auth.ts` has `emailAndPassword.disableSignUp: true`. The public `POST /api/auth/sign-up/email` route exists in Better Auth, but the repo intentionally blocks it. `workers/core/tests/auth/auth-core.test.ts` asserts the route returns `400`.

F2. `README.md` explicitly says public `POST /api/auth/sign-up/email` is disabled and admins create users through Better Auth Admin `createUser`, then send verification through `/api/auth/send-verification-email`.

F3. `workers/core/tests/auth/contracts.test.ts` proves the installed Better Auth email/password config uses `disableSignUp`, while the installed OAuth provider type exposes `signup?:`. The same test records that this distinction came from installed package types, not memory.

F4. `workers/core/src/auth/oauth-provider.ts` configures `loginPage`, `consentPage`, `postLogin`, `clientReference`, `clientPrivileges`, custom token claims, resource audience validation, and catalog scope checks. It does not currently configure `signup`.

F5. The installed OAuth provider package supports `prompt=create` parsing and a `signup` configuration block with `page` and `shouldRedirect`. The package type says completing signup should call `/oauth2/continue` with `created: true`.

F6. `workers/core/src/auth/oauth-provider.ts` already distinguishes protocol scopes from product scopes. Product scopes trigger authorization context selection and require resource-scope catalog validation.

F7. `id-oauth-scope-catalog` already owns resource-server-bound OAuth scope rows and client-resource-scope rows. This is the right place to validate whether a requested product scope exists and whether a client can obtain it. Registration policy should not duplicate the scope catalog; it should reference it.

F8. Better Auth organization invitations are already present in the generated schema and exercised in `workers/core/tests/auth/organization-invite-session.test.ts`. Existing org invitation acceptance requires an authenticated user. Registration policy can extend this by allowing an invited email to create the account first, then accept membership.

F9. `ui-id` currently hosts `/login`, `/consent`, `/select-authorization-context`, `/admin`, and `/ui-health`. There is no `/register` route and no production route entry for `/register*` in `workers/ui/wrangler.jsonc`.

F10. `packages/lib/src/auth-fetch.ts` supports sending custom headers in `authApiPost` and `authApiPostOrThrow` through the `RequestInit` argument. That can carry a registration-intent header if the signup guard should avoid extra body fields.

F11. The current architecture requires custom auth tables to be Better Auth plugin schemas, not standalone Drizzle schema definitions. Registration policy and registration intent tables should live in an auth plugin schema.

### 4.2 Standards Findings

OIDC Initiating User Registration defines `prompt=create`. A client can signal that the user wants account creation instead of login. The OP decides how to present account creation, and success is only known when the normal OIDC response completes with valid tokens.

OAuth scopes are requested by the client, but the authorization server may fully or partially ignore requested scopes based on policy or the resource owner's instructions. If issued scope differs from requested scope, the token response must inform the client of the actual granted scope. This directly supports least-privilege narrowing.

OAuth does not define registration quotas, invite-only signup, domain allowlists, default organization roles, or "allow N users for this campaign." Those are authorization-server product policy.

PAR lets a client push a full authorization request to the authorization server before browser redirection and then redirect with a `request_uri`. This is valuable later if registration requests become large or sensitive, because onboarding can involve organization hints, invitation context, and richer permission data.

RAR defines `authorization_details` for structured fine-grained authorization requests. It is useful later if simple scopes become too coarse. It should not be invented as a custom JSON parameter when RFC 9396 already defines the standard shape.

SCIM standardizes directory Users and Groups. It is the right shape for enterprise provisioning and directory synchronization, not browser self-registration.

### 4.3 External Product Findings

Okta treats self-service registration as a policy-controlled flow. Their documentation describes policies for collected profile attributes, authenticator enrollment, email verification, progressive enrollment, and app assignment. The useful pattern is policy-gated registration rather than a raw public signup endpoint.

Auth0 supports organization invitation flows where an invited user can create an account or log in and join an organization, optionally with predefined roles. The useful pattern is invite context as a product-specific onboarding envelope around OIDC login/signup, not an OAuth scope that grants identity administration.

Auth0 also has connection-level signup controls and guidance for disabling signups when appropriate. The useful pattern is that "signup enabled" is not only a UI toggle; it belongs to connection/client/policy context.

Across Okta/Auth0-style products, registration is a hosted identity-provider journey. Clients redirect; the identity provider enforces policy; tokens return through OAuth/OIDC only after account creation and authorization complete.

### 4.4 Better Auth Findings

Better Auth `signUpEmail` accepts `name`, `email`, `password`, optional `image`, `callbackURL`, and `rememberMe`. It returns a user and token when enabled. This is the correct primitive for password-account creation if it can be guarded safely.

Better Auth `signUpEmail` currently cannot be used while `disableSignUp: true` remains effective. Therefore the implementation must first prove whether a `hooks.before` guard can allow only intent-backed signup while the endpoint itself is enabled. If not, a different internal creation path must be designed and tested.

Better Auth OAuth Provider `signup` is specifically tied to `prompt=create` and expects `/oauth2/continue` with `created: true` after signup. This is the correct integration point for client-initiated registration.

Better Auth organization plugin already supports invitations, accepting invitations, organizations, members, teams, and active organization context. Registration should reuse that behavior instead of creating parallel tenant membership tables.

### 4.5 Prior Art And Anti-Pattern (Legacy `auther`)

A previous in-house auth service (`~/pjs/auther`) implemented client-initiated registration in a way this document deliberately rejects. It is recorded here as the concrete anti-pattern to avoid, because the failures are subtle and easy to recreate.

What `auther` did:

- A bespoke `POST /api/auth/signup-intents` endpoint that the *client* (or a resource server) called with its own credentials to mint an HMAC-signed intent token, plus a custom `/sign-up?intent=<token>` page. There was no OIDC `prompt=create`; registration was a private protocol invented in-house.
- The client passed `requestedGrants` as raw authorization tuples (`{ entityTypeId, relation, entityId }`) that a `user.create.after` hook drained from a pending queue and wrote into the authorization model. In effect the client asserted permissions, gated only by custom policy.
- Completion was a custom `returnUrl` redirect rather than the standard authorization-code flow. Registration was a side-channel decoupled from `/oauth2/authorize` and token issuance, so tokens did not return through the protocol path tied to the original request.
- It accreted bespoke surface: registration contexts, signup-intent nonces, platform invites, authorization spaces, client-space links, trigger principals, and an in-house signed-token format.

Why it is "out of place": it reimplemented the protocol. It built a private registration transport, let clients inject grants, and bypassed the authorization-code flow. That is precisely the custom-identity-API path the repository rules forbid.

How this proposal differs, point for point:

| `auther` (rejected) | This proposal |
|---|---|
| Custom `signup-intents` API + `/sign-up?intent=` URL; no `prompt=create` | OIDC `prompt=create` at the standard `/oauth2/authorize` |
| Client mints a signed intent token it carries | `id` creates the intent server-side after validating a standard authorize request; the client never mints it |
| Client sends `requestedGrants` (authorization tuples) | Client sends OAuth `scope` only; `id` narrows via catalog + policy + consent |
| Defaults/grants applied from client-supplied data | `defaultRole`/`defaultTeamIds` come only from the server-side policy record, never from client input |
| Completion via custom `returnUrl` side-channel | Completion via `/oauth2/continue` with `created: true` → normal consent/code/token |
| Invents registration protocol + token format | One `idRegistration` plugin for *product policy* that surrounds standard mechanisms |

The single most important invariant to hold during implementation, and the exact place `auther` went wrong, is that `defaultRole` and `defaultTeamIds` are admin-configured policy fields, not client-asserted request fields. If that line drifts, this proposal regresses into `auther`.

## 5. Standards And Capability Classification

| Mechanism | Classification | Use Here | Do Not Use It For |
|---|---|---|---|
| OIDC `prompt=create` | Protocol standard | Client-initiated registration entry at the authorization endpoint. | Quota, invite, domain, role, or product-permission policy. |
| OAuth `scope` | Protocol standard | Client requests access ranges; `id` narrows/denies according to catalog and policy. | Client-issued permissions or default org/team assignment. |
| OAuth authorization code + PKCE | Protocol standard | Return user to client after registration and consent. | Direct account creation API. |
| OAuth consent | Protocol standard / product UX | User approves requested client access. | Granting tenant roles or platform privileges. |
| OAuth PAR | Protocol standard, future | Secure/compact request transport for sensitive or large registration requests. | First-release requirement. |
| OAuth RAR | Protocol standard, future | Structured fine-grained authorization requests beyond flat scopes. | Ad hoc signup policy payload unless adopted intentionally. |
| SCIM Users/Groups | Interoperability standard | Future enterprise provisioning and directory sync. | Browser signup or client-initiated account creation. |
| Better Auth `sign-up/email` | Library-supported capability | Password account creation after a server-side registration intent is validated. | Open public signup endpoint. |
| Better Auth organization invitations | Library-supported capability | Invite-only org membership onboarding. | General signup policy model by itself. |
| `idRegistration` policy plugin | Repository-specific extension | Closed/invite/client/domain/quota/default-role policy and registration intent tracking. | Replacing OAuth/OIDC authorization or SCIM provisioning. |
| Registration quotas | Repository-specific product policy | "Allow up to N signups" campaign or tenant controls. | Protocol-standard permission issuance. |

The main standard answer is `prompt=create`. The rest is local authorization-server policy. That is acceptable if the document names it clearly and keeps the protocol path intact.

## 6. Target Product Model

### 6.1 Registration Entry Points

| Entry Point | Actor | Standard Shape | First-Release Behavior |
|---|---|---|---|
| Client-initiated signup | OAuth/OIDC client redirects browser | `/oauth2/authorize?...&prompt=create&scope=...` | Evaluate policy, show `/register`, create user if allowed, continue OAuth. |
| Invitation signup | Organization admin invites email | Product-specific invite URL plus OIDC login/signup | Validate invite, require matching email, create user if needed, accept membership. |
| Admin-created user | Platform/org admin creates user | Better Auth Admin | Existing path remains. User verifies email and signs in. |
| Enterprise provisioning | SCIM client creates/deactivates users | SCIM v2, future | Not first release. |
| Public anonymous signup | Any browser user | No standard requirement | Closed unless a policy explicitly enables it. |

### 6.2 Policy Modes

| Mode | Meaning | Typical Use |
|---|---|---|
| `closed` | No self-service registration. Existing admin-created/invited/provisioned users only. | Default platform posture. |
| `invite_only` | Valid invitation token required. | Customer workspace onboarding. |
| `client_initiated` | Specific OAuth clients may request `prompt=create`. | Consumer-style app signup through hosted `id`. |
| `domain_allowlist` | Email domain can self-register into a configured org or account state. | Company tenant with `@acme.com` employees. |
| `public_limited` | Public registration allowed until quota or date limit. | Beta, launch campaign, trial. |
| `admin_provisioned` | Users are created only by admin APIs or future SCIM. | Enterprise tenants. |

Modes can be combined through explicit policy precedence, but the first implementation should keep evaluation deterministic:

1. Hard global block wins.
2. Invitation policy wins for matching valid invite.
3. Client-specific policy wins for `client_id`.
4. Organization/domain policy applies when the request has a matching org/domain.
5. Public policy applies only if explicitly enabled.
6. Otherwise deny registration.

### 6.3 Permission And Scope Semantics

The client can request scopes. The client cannot issue permissions.

The authorization server's decision should be an intersection:

```text
requested scopes
AND scopes supported by OAuth provider
AND scopes present/enabled in id scope catalog
AND scopes allowed for the OAuth client/resource binding
AND scopes allowed by registration policy
AND scopes the user consents to
AND scopes compatible with selected org/direct-share context
= effective scopes that may continue to token issuance
```

Least privilege should mean:

- New users get `user.role = "user"`, never platform `admin`.
- Organization membership defaults to `member`.
- Team assignment defaults to none or the smallest configured team set.
- Product scopes are not silently added.
- Requested scopes may be narrowed.
- Resource servers still enforce domain permissions from token claims.

Example:

```text
Client asks: openid profile email content:read content:write
Client-resource binding allows: content:read content:write
Registration policy allows: openid profile email content:read
User consents: all shown scopes
Issued request may continue with: openid profile email content:read
```

## 7. Registration Policy Model

### 7.1 Policy Record

Proposed Better Auth plugin model: `registrationPolicy`.

```json
{
  "id": "regpol_beta_content",
  "slug": "content-api-beta",
  "name": "Content API beta",
  "status": "enabled",
  "mode": "client_initiated",
  "clientId": "cli_content_web",
  "organizationId": "org_acme",
  "resourceServerId": "rs_content",
  "allowedScopes": ["openid", "profile", "email", "content:read"],
  "emailDomains": ["acme.com"],
  "defaultRole": "member",
  "defaultTeamIds": ["team_readers"],
  "quotaLimit": 1000,
  "quotaTarget": "memberships",
  "requiresEmailVerification": true,
  "startsAt": "2026-06-01T00:00:00.000Z",
  "expiresAt": "2026-07-01T00:00:00.000Z",
  "createdAt": "2026-05-31T00:00:00.000Z",
  "updatedAt": "2026-05-31T00:00:00.000Z"
}
```

Field guidance:

| Field | Rule |
|---|---|
| `status` | `draft`, `enabled`, `paused`, `archived`. Only `enabled` admits signup. |
| `mode` | One of the deterministic modes in section 6.2. |
| `clientId` | Optional. When set, only that OAuth client can use the policy. |
| `organizationId` | Optional. When set, successful signup creates or accepts membership in that organization. |
| `resourceServerId` | Optional. Used to scope allowed product scopes to one resource API. |
| `allowedScopes` | Must be protocol scopes or enabled catalog scopes. No hard-coded scope names in code. |
| `defaultRole` | First release should allow only `member` unless explicit invite policy allows `admin` or `owner`, and even then this should be rare. |
| `quotaLimit` | Optional integer cap. Missing means no policy cap. |
| `quotaTarget` | `accounts` or `memberships`. Prefer `memberships` for org/campaign caps. |

### 7.2 Registration Intent

Proposed Better Auth plugin model: `registrationIntent`.

```json
{
  "id": "regint_...",
  "policyId": "regpol_beta_content",
  "clientId": "cli_content_web",
  "organizationId": "org_acme",
  "invitationId": null,
  "requestedScopes": ["openid", "profile", "email", "content:read"],
  "allowedScopes": ["openid", "profile", "email", "content:read"],
  "resource": "https://content-api.example.com",
  "authorizationDetails": null,
  "oauthQueryHash": "sha256:...",
  "email": null,
  "status": "started",
  "expiresAt": "2026-05-31T10:15:00.000Z",
  "createdAt": "2026-05-31T10:05:00.000Z",
  "completedAt": null
}
```

Intent rules:

- Created only after the OAuth authorization request is validated.
- Short-lived, for example 10 to 15 minutes.
- Bound to client id, redirect URI/request hash, policy id, and requested resource/scope set.
- Single use.
- Does not contain password or verification token.
- May store email only after user submits it or after a validated invitation binds it.
- Should be referenced from UI by opaque id plus HMAC/signature or stored in KV with an opaque nonce.

### 7.3 Quota And Reservation Model

The product requirement "allow up to N signups" needs precise semantics:

| Quota Target | Counts | Recommended Use |
|---|---|---|
| `accounts` | Newly created user accounts. | Consumer app beta where every new user counts once. |
| `memberships` | New membership in a specific organization/policy. | B2B tenant onboarding cap. |
| `verified_accounts` | Accounts after email verification. | Softer cap where unverified abandoned forms should not consume slots. |

Recommended first release: `memberships` or `accounts`, with a reservation TTL.

Reservation flow:

1. On registration form submit, reserve a quota slot for the registration intent.
2. If the same intent retries, reuse the reservation.
3. If email verification is required, keep reservation until verification TTL expires.
4. On successful account/membership completion, mark reservation consumed.
5. On timeout or cancellation, release reservation.

Strict quota needs atomic reservation. If Better Auth adapter APIs cannot express "insert reservation only when count below limit" atomically, the implementation must choose one of two explicit paths:

- Soft quota: adapter count plus insert, documented as best-effort under concurrency.
- Strict quota: plugin-owned D1 helper inside `workers/core/src/auth/plugins/registration/` that performs an atomic conditional reservation, documented as a narrow auth-plugin exception because the Better Auth adapter cannot express it.

Do not hand-write migrations, triggers, or snapshots for quota enforcement. Any tables still come from Better Auth plugin schema and `pnpm db:generate`.

> Review note (2026-05-31): a plugin-owned D1 helper performing an atomic conditional reservation is a raw-SQL exception to the repo custom-table rule. It is defensible only as the documented "narrow auth-plugin exception" pattern already set by `workers/core/src/auth/plugins/resource-server/audiences.ts` (the approved D1 fallback), and it still requires explicit architecture-plan approval before it lands — it is exactly the "repository-specific mechanism allowed only when the precise unmet requirement is documented" case from the architecture rules. Recommendation: ship the soft-quota path first (adapter count + insert, documented best-effort under concurrency) and defer strict atomic reservation to its own approved change with its own concurrency tests, rather than bundling raw-SQL atomicity into the first release. Oversubscription on a beta/campaign cap is a low-severity failure; an unreviewed raw-SQL surface inside the auth boundary is not.

### 7.4 Invitation Relationship

Existing organization invitations should remain the membership source of truth for invite flows. `idRegistration` should not create a parallel invitation table for organization membership.

Invite-only registration should:

- validate invitation id/token and organization;
- require the registering email to match the invited email;
- create the user if needed;
- require email verification or treat a verified invitation email as verified only if the chosen policy explicitly allows that;
- accept the invitation through Better Auth organization behavior after the user exists and is authenticated;
- apply invite role rather than policy default role when they differ.

If a policy allows invite URLs without OAuth client context, the final destination can be `/account/organizations` or a configured safe first-party path. If the invite came from an OAuth app, continuation should return through the standard authorization flow.

## 8. OAuth And Onboarding Flow

### 8.1 Client-Initiated Signup With `prompt=create`

Request:

```text
GET /api/auth/oauth2/authorize
  ?response_type=code
  &client_id=cli_content_web
  &redirect_uri=https%3A%2F%2Fcontent.example.com%2Fcallback
  &scope=openid%20profile%20email%20content%3Aread
  &resource=https%3A%2F%2Fcontent-api.example.com
  &state=...
  &code_challenge=...
  &code_challenge_method=S256
  &prompt=create
```

Flow:

1. Better Auth OAuth Provider validates the authorization request.
2. Because `prompt=create` is present, OAuth Provider redirects to configured signup page `/register` with the signed OAuth query context.
3. `/register` calls `POST /api/auth/registration/evaluate` with the OAuth query.
4. `idRegistration` validates policy, client, requested scopes, resource, quota, invite/domain constraints, and creates a registration intent.
5. UI renders registration form with client name, org/campaign context, allowed access summary, and quota/closed state if denied.
6. User submits name, email, password, and the registration intent.
7. Signup guard validates the intent and permits one Better Auth sign-up transaction.
8. User verifies email if required.
9. Registration plugin applies default organization membership/team and marks the intent complete.
10. UI calls `/api/auth/oauth2/continue` with `created: true` and the original OAuth query. If product scopes require organization context, the continuation includes or routes through the existing context selection path.
11. Normal consent/token issuance continues. The client receives only the scopes the authorization server allows and the user consents to.

### 8.2 Invite-Acceptance Signup

Request shape can be a provider-specific hosted link:

```text
GET /register/invite/<invitationId>?client_id=cli_content_web
```

or a client authorization request carrying an invitation context through a server-created registration intent. The first release should prefer a hosted `id` invite URL because OAuth does not define a standard `invitation` authorization parameter.

Flow:

1. User clicks invite link.
2. `id` validates invitation state and expiry.
3. If no user exists for the invited email, show register form.
4. Create user, verify email as policy requires, then accept the invitation.
5. If a client continuation exists, resume OAuth. Otherwise route to `/account/organizations`.

### 8.3 Admin-Created User Completion

Existing path remains:

1. Admin creates user through Better Auth Admin.
2. Admin or system sends verification email.
3. User verifies email and signs in.
4. User lands in `/account` or client OAuth flow depending on entry.

This is not client-initiated registration. It is still important because many tenants should stay admin-provisioned.

### 8.4 Policy Denial Flow

Denial should happen before account creation.

Denial examples:

- signup globally closed;
- client has no registration policy;
- requested scope outside catalog/policy;
- resource missing or disabled;
- quota full;
- policy expired;
- email domain not allowed;
- invitation invalid or expired;
- redirect URI/client invalid.

For OAuth-originated requests, return a standard OAuth error to the registered redirect URI only when OAuth rules allow redirecting. If client id or redirect URI is invalid, show a hosted error page and do not redirect to an untrusted URI.

User-facing copy should be short and policy-aware:

- "Registration is closed for this application."
- "This invitation has expired."
- "The beta is full."
- "Use your Acme email address to join this workspace."

## 9. API Design

### 9.1 Admin Policy Endpoints

All endpoints are Better Auth plugin endpoints under `/api/auth/admin/registration-policies*`, require admin or future delegated org admin authorization, and use `@idco/lib` helpers from UI.

```text
POST   /api/auth/admin/registration-policies
GET    /api/auth/admin/registration-policies
GET    /api/auth/admin/registration-policies/:id
PATCH  /api/auth/admin/registration-policies/:id
POST   /api/auth/admin/registration-policies/:id/enable
POST   /api/auth/admin/registration-policies/:id/pause
POST   /api/auth/admin/registration-policies/:id/archive
GET    /api/auth/admin/registration-policies/:id/intents
GET    /api/auth/admin/registration-policies/:id/quota
```

Create request:

```json
{
  "slug": "content-api-beta",
  "name": "Content API beta",
  "mode": "client_initiated",
  "clientId": "cli_content_web",
  "organizationId": "org_acme",
  "resourceServerId": "rs_content",
  "allowedScopes": ["openid", "profile", "email", "content:read"],
  "emailDomains": ["acme.com"],
  "defaultRole": "member",
  "defaultTeamIds": ["team_readers"],
  "quotaLimit": 1000,
  "quotaTarget": "memberships",
  "requiresEmailVerification": true,
  "startsAt": "2026-06-01T00:00:00.000Z",
  "expiresAt": "2026-07-01T00:00:00.000Z"
}
```

Admin response should include quota usage:

```json
{
  "policy": {
    "id": "regpol_beta_content",
    "status": "enabled",
    "quotaLimit": 1000,
    "quotaUsed": 231,
    "quotaReserved": 4
  }
}
```

### 9.2 Public Registration Endpoints

Public endpoints are still policy-gated. They do not create users unless an intent exists and passes.

```text
POST /api/auth/registration/evaluate
POST /api/auth/registration/submit
GET  /api/auth/registration/status
POST /api/auth/registration/cancel
```

Evaluate request:

```json
{
  "oauthQuery": "response_type=code&client_id=cli_content_web&...",
  "invitationId": null
}
```

Evaluate response:

```json
{
  "decision": "allowed",
  "intentId": "regint_...",
  "client": {
    "clientId": "cli_content_web",
    "clientName": "Content App"
  },
  "organization": {
    "id": "org_acme",
    "name": "Acme"
  },
  "requestedScopes": ["openid", "profile", "email", "content:read"],
  "allowedScopes": ["openid", "profile", "email", "content:read"],
  "expiresAt": "2026-05-31T10:15:00.000Z"
}
```

Denied response:

```json
{
  "decision": "denied",
  "reason": "quota_full",
  "message": "Registration is full for this application."
}
```

Submit request:

```json
{
  "intentId": "regint_...",
  "name": "Person Example",
  "email": "person@acme.com",
  "password": "long user password"
}
```

Submit response:

```json
{
  "status": "verification_required",
  "email": "person@acme.com"
}
```

or:

```json
{
  "status": "created",
  "continueOAuth": true
}
```

### 9.3 Signup Guard Contract

Recommended implementation if Better Auth hook ordering proves viable:

- Set `emailAndPassword.disableSignUp` to `false` only with `idRegistration` guard active.
- Add `hooks.before` on `ctx.path === "/sign-up/email"`.
- Require a valid `x-id-registration-intent` header or equivalent signed nonce.
- Validate intent status, expiry, client binding, email/domain, quota reservation, and policy.
- Reject every request without a valid intent.
- Let Better Auth own password hashing, account row creation, session creation, verification email behavior, and user row shape.

This preserves Better Auth as the account-creation runtime while keeping direct public signup blocked.

If proof tests show Better Auth cannot be safely guarded this way, use a custom plugin endpoint only after documenting how it creates a password account without duplicating or bypassing Better Auth internals. That fallback is riskier and should not be the first choice.

> Review note (2026-05-31, hard gate): this is the single highest-risk change in the registration program. Setting `disableSignUp: false` trades a hard library-level closure (today proven by `workers/core/tests/auth/auth-core.test.ts` asserting `400` on `POST /sign-up/email`) for a soft, hook-dependent closure. Any path, ordering bug, or later refactor where the `hooks.before` guard does not run reopens fully public signup. The Phase-0 spike must therefore prove three things, not two: (1) a valid intent permits one guarded signup; (2) hook ordering relative to Better Auth's own `disableSignUp`/sign-up short-circuit — confirm whether `before` hooks run before or after the built-in disable check, because if the built-in check short-circuits first the guard is moot; (3) intent-less direct `POST /sign-up/email` still returns `400` after the flag flips. Do not delete the existing 400 assertion. Invert and keep it: it must continue to fail closed for any request without a valid intent, and that test is the merge gate for this section. If the spike cannot prove (2) deterministically, prefer the custom-endpoint fallback over flipping the flag.

### 9.4 OAuth Continue Contract

Better Auth OAuth Provider expects signup completion to call `/api/auth/oauth2/continue` with `created: true`.

Continue body should include the serialized OAuth query already used by hosted login/consent flows and any current context header required by post-login selection:

```json
{
  "created": true,
  "oauth_query": "response_type=code&client_id=cli_content_web&..."
}
```

Headers when policy fixed organization context:

```text
x-id-oauth-context: workspace:org_acme
```

If the policy does not fix context and product scopes are requested, route through `/select-authorization-context` after signup, exactly like normal login.

## 10. UI Design

### 10.1 Hosted Register Page

Route: `/register`

Shell: hosted auth page style, centered panel, no admin shell.

```text
+-------------------------------------------------------+
| Create your id account                                |
|                                                       |
| Content App is requesting access                      |
| Acme workspace                                        |
|                                                       |
| Access after signup                                   |
| [openid] [profile] [email] [content:read]             |
|                                                       |
| Name                                                  |
| _____________________________________________________ |
| Email                                                 |
| _____________________________________________________ |
| Password                                              |
| _____________________________________________________ |
|                                                       |
|                                      [ Create account ]|
+-------------------------------------------------------+
```

Rules:

- Show client/app name from trusted OAuth client metadata, not request text.
- Show organization name only after policy validates it.
- Show requested/allowed scopes clearly; do not say "permission granted" before consent/token issuance.
- If requested scopes are narrowed, show "requested by app" and "allowed by policy" distinction.
- Do not expose policy internals such as quota counts unless product wants that.

### 10.2 Invite Page

Route: `/register/invite/[id]` or `/register?invitation=...`

```text
+-------------------------------------------------------+
| Join Acme                                             |
|                                                       |
| You were invited as Member                            |
| invitee@example.com                                   |
|                                                       |
| Name                                                  |
| _____________________________________________________ |
| Password                                              |
| _____________________________________________________ |
|                                                       |
|                                      [ Accept invite ] |
+-------------------------------------------------------+
```

Rules:

- Lock or prefill invited email.
- If signed in as a different email, show a safe "switch account" path.
- If invite expired, show expired state and do not create user.

### 10.3 Closed Or Quota-Full Page

```text
+-------------------------------------------------------+
| Registration unavailable                              |
|                                                       |
| The beta is full for Content App.                     |
|                                                       |
|                                      [ Back to app ]   |
+-------------------------------------------------------+
```

Rules:

- Do not create an account before this state.
- Return to client with OAuth error only if redirect URI was valid.
- Avoid leaking whether a specific email already exists unless the user is authenticated.

### 10.4 Admin Policy Screens

Admin UI later needs a registration policy section. It can live under the tenant-scoped console from [docs/028](028_tenant-scoped-platform-experience.md), likely:

```text
/admin/platform/identity/registration-policies
/admin/orgs/:orgId/identity/registration-policies
```

First screen needs:

- list policies;
- status badge;
- mode;
- client;
- organization;
- quota used/reserved/limit;
- starts/expires;
- enable/pause/archive actions;
- intent/audit detail.

Do not create `/admin` route files without the required screen spec in `workers/ui/docs/screens/`.

## 11. Architecture Decisions

### Decision 1: Use `prompt=create` For Client-Initiated Registration

Recommended. It is the OpenID Connect standard for clients to request account creation UX.

Rejected: custom `?signup=true` or app-specific `/register?client_id=...` as the primary client contract. Those can exist as hosted product links, but the protocol entry should be `prompt=create`.

### Decision 2: Keep Clients As Requesters, Not Issuers

Recommended. Clients request scopes and context. `id` validates and narrows. The resource owner consents. Resource servers enforce.

Rejected: allowing clients to send "user should get role X/team Y/scope Y" as trusted data. That is privilege injection unless policy independently verifies it.

### Decision 3: Guard Better Auth Signup Instead Of Reimplementing It

Recommended pending proof. Better Auth already owns password account creation. A guard plus registration intent keeps public signup closed while preserving Better Auth internals.

Rejected: custom user/password creation in a new plugin as first choice. That risks diverging from Better Auth's account/session/password behavior.

### Decision 4: Model Signup Policy In A Better Auth Plugin

Recommended. Registration policy is auth-owned and must be evaluated inside the Better Auth/OAuth boundary.

Rejected: standalone Hono route with Drizzle tables. That violates this repo's custom-table rule for auth-owned data.

### Decision 5: Treat Quotas As Product Policy

Recommended. Quotas are not standards. They are useful product controls and should be explicit in policy.

Rejected: overloading OAuth scopes to mean "number of allowed signups" or "campaign permission." Scopes represent access ranges, not registration capacity.

### Decision 6: Defer RAR And PAR

Recommended. Use simple scopes first. Add RAR only when structured authorization is needed; add PAR when requests are large/sensitive or high-integrity clients need it.

Rejected: inventing a custom JSON `permissions` parameter while ignoring RFC 9396.

## 12. Migration And Rollout

Phase 0: Proof spike.

- Prove Better Auth hook ordering for `/sign-up/email`.
- Prove direct signup without registration intent is blocked.
- Prove guarded signup can create a user when policy permits.
- Prove OAuth Provider `signup.page` redirects for `prompt=create` and `/oauth2/continue` resumes the authorization flow.

Phase 1: Policy schema and admin API.

- Add `idRegistration` plugin with policy and intent schemas.
- Add admin CRUD/status endpoints.
- Add tests for policy validation and scope catalog references.
- Generate schema with `pnpm db:generate`; do not hand-write SQL.

Phase 2: Hosted registration UI.

- Add `/register` route, `/register/invite` route if needed, and route config.
- Add UI action functions through `@idco/lib`.
- Show allowed/denied states.

Phase 3: OAuth integration.

- Configure OAuth Provider `signup.page`.
- Add evaluate/start intent flow.
- Add guarded signup.
- Add OAuth continue.
- Wire organization context and invitation acceptance.

Phase 4: Quotas.

- Add reservation/consumption behavior.
- Decide soft versus strict quota implementation.
- Add concurrency tests for strict quota if selected.

Phase 5: Docs and client guide.

- Update OAuth integration guide with `prompt=create`.
- Document policy modes and client expectations.
- Update README route topology after implementation.

Rollback:

- Disable all registration policies to close self-service immediately.
- Remove or disable OAuth Provider `signup.page` to stop `prompt=create` registration UI.
- Keep direct public signup blocked by guard tests.

## 13. Edge Cases And Failure Modes

Direct call to `/api/auth/sign-up/email`: must fail without a valid registration intent.

OAuth request has invalid `client_id` or `redirect_uri`: show hosted error and do not redirect to untrusted URI.

Client requests unsupported scope: deny or narrow according to OAuth rules; return actual issued scope if token is issued.

Client requests product scope without resource: existing token rules should reject as invalid scope/resource context.

Policy expires during registration form: submit fails gracefully; do not create user.

Quota fills after evaluate but before submit: submit should fail before account creation unless a valid reservation already exists.

User submits email outside allowlist: reject before account creation.

Existing user attempts register: route to login or account-link behavior; do not create duplicate user.

Invite email mismatch: reject and offer switch account/sign out.

Email verification abandoned: release quota reservation after TTL.

OAuth continuation after user creation fails: account remains created; intent status should record failed continuation and user can retry from login/account.

User denies consent after registration: account remains created; client gets OAuth denial; no product grant should be created.

Admin pauses policy while active forms exist: new evaluations fail; existing intents can either be honored until expiry or invalidated depending on policy setting. First release should invalidate on pause for safer behavior.

RAR/PAR clients send unsupported params: reject with clear unsupported error rather than silently treating them as permissions.

## 14. Test And Verification Plan

Docs-only checks for this proposal:

- Manual TOC present.
- Metadata blockquote present.
- No unresolved placeholders.
- README Contracts entry added.
- `git diff --check`.

Implementation checks:

- `pnpm lint`
- `pnpm check:dup`
- `pnpm typecheck`
- `pnpm test`
- `pnpm check`
- `pnpm advise` after substantial source changes.
- `pnpm deploy:ui:dry-run` after non-trivial UI route/component changes.

Focused tests:

- Better Auth contract test proves `signup.page` type and `/oauth2/continue` expectation from installed package.
- Direct `/sign-up/email` without intent fails. This is the inverted-and-kept regression of the current `auth-core.test.ts` 400 assertion and is a hard merge gate per the §9.3 review note: it must keep failing closed after `disableSignUp` flips to `false`.
- Guarded `/sign-up/email` with valid intent succeeds.
- Guarded signup cannot reuse intent.
- `prompt=create` redirects to `/register`.
- `/register` evaluate denies closed policy.
- `/register` evaluate denies missing client policy.
- `/register` evaluate denies unsupported scope/resource.
- Client requested scopes are narrowed by policy.
- Quota full denies before account creation.
- Reservation prevents oversubscription if strict quota selected.
- Invite signup requires matching email.
- Successful invite signup accepts organization invitation.
- Default membership creates only `member` role unless policy/invite explicitly says otherwise.
- OAuth continue after signup returns to normal consent/context/token flow.
- Existing OAuth login and admin OTP flows remain unchanged.

## 15. Minimal Implementation Backlog

### REG-1. Registration Contract Spike

Scope:

- `workers/core/tests/auth/contracts.test.ts`
- `workers/core/tests/auth/*registration*.test.ts`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/auth/oauth-provider.ts`

Tasks:

- [ ] Prove OAuth Provider `signup.page` and `prompt=create` redirect behavior.
- [ ] Prove `/oauth2/continue` accepts `created: true` for signup continuation.
- [ ] Prove `/sign-up/email` can be guarded with a Better Auth hook before enabling implementation.

Acceptance criteria:

- Direct public signup remains blocked.
- Prompt-create path can be tested end-to-end in memory.

Tests:

- Vitest auth integration tests.

### REG-2. `idRegistration` Plugin

Scope:

- `workers/core/src/auth/plugins/registration/**`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/shared/constants.ts`

Tasks:

- [ ] Add policy, intent, and quota/reservation schemas.
- [ ] Add admin policy endpoints.
- [ ] Add public evaluate/status/cancel endpoints.
- [ ] Inject authorization callback from `get-auth.ts`.
- [ ] Generate migration with `pnpm db:generate`.

Acceptance criteria:

- Policy evaluation is data-driven and no client/org/scope is hard-coded.
- Plugin conforms to auth plugin file structure.

Tests:

- Schema derivation, operations, endpoint integration.

### REG-3. Hosted Registration UI

Scope:

- `workers/ui/src/app/register/**`
- `workers/ui/docs/screens/auth-flow.md`
- `workers/ui/wrangler.jsonc`

Tasks:

- [ ] Add register page and client form.
- [ ] Add policy denied/closed states.
- [ ] Add invite acceptance page if included in release.
- [ ] Add route config for `/register*`.

Acceptance criteria:

- Registration UI calls only `@idco/lib` auth helpers.
- UI never trusts client-provided names/scopes without server evaluation.

Tests:

- UI route/component tests and deployed route smoke.

### REG-4. Guarded Signup And Onboarding

Scope:

- `workers/core/src/auth/plugins/registration/**`
- `workers/core/src/auth/get-auth.ts`
- `workers/core/src/auth/oauth-provider.ts`

Tasks:

- [ ] Guard `/sign-up/email` with registration intent.
- [ ] Reserve/consume quota.
- [ ] Create user through Better Auth signup.
- [ ] Apply organization membership/team defaults.
- [ ] Continue OAuth flow.

Acceptance criteria:

- Successful registration returns to OAuth flow.
- Failed registration creates no user.
- No over-broad role/team/scope is applied from client input.

Tests:

- End-to-end prompt-create registration tests.

### REG-5. Documentation And Client Guide

Scope:

- `docs/005_oauth2-oidc-integration-guide.md`
- `README.md`
- New plugin README under `workers/core/src/auth/plugins/registration/README.md`

Tasks:

- [ ] Document `prompt=create` for clients.
- [ ] Document policy modes and scope narrowing.
- [ ] Document quota semantics.
- [ ] Update route topology after implementation.

Acceptance criteria:

- Client authors know how to request registration and what they cannot assume.

Tests:

- Docs lint/search for stale paths.

## 16. Future Backlog

- PAR support for high-integrity registration requests and large request payloads.
- RAR support for structured permission requests beyond flat scope strings.
- User-managed MFA or authenticator enrollment during registration.
- Progressive profile collection after first sign-in.
- Admin approval workflow for registration requests.
- Waitlist mode when quota is full.
- Inbound SCIM provisioning for enterprise tenants.
- Dynamic Client Registration changes only if client self-service onboarding becomes a product goal.
- Registration analytics and abuse-detection dashboards.

### 16.1 Registration Identity-Event Decision

Registration events remain future work. They do not join the existing identity-event producer now, and the current `idRegistration` plugin remains the synchronous authority for policy evaluation, quota reservation, signup intent consumption, invite acceptance, and OAuth continuation. Events must never become a prerequisite for allowing or denying registration.

The future event plan is intentionally informational/reliability-oriented:

| Candidate event | Current verdict | Classification | Trigger to implement | Boundary before implementation |
|---|---|---|---|---|
| Registration started | Parked | Repository-specific SET event candidate | Operators need lifecycle analytics or abuse/retry visibility beyond admin activity logs | Define a SET event URI, subject identifier, policy/client/org fields, privacy filtering, retention, and whether the event is emitted for OAuth, invite, or both paths. |
| Registration denied | Parked | Repository-specific SET event candidate | Operators need policy-denial analytics, abuse detection, or support diagnostics | Define safe denial reason taxonomy; do not leak domain/invite/quota internals to clients or external subscribers without approval. |
| Registration completed | Parked | Repository-specific SET event candidate, potentially related to RISC account lifecycle but not a standard RISC signup event | Downstream audit/reconciliation needs to know that `id` created a user through guarded registration | Define subject shape, user/org membership fields, invite/default-role context, and replay/idempotency semantics before any producer writes. |
| Registration quota full | Parked | Repository-specific SET event candidate | Product needs quota dashboards or alerting | Define aggregation vs per-attempt event behavior so high-volume denial traffic does not become an event-amplification path. |
| Invite accepted through registration | Parked | Repository-specific SET event candidate | Operators or resource servers need invitation lifecycle history | Define relationship to Better Auth organization invitation state, membership creation timing, and whether ordinary invite acceptance without signup emits the same event. |

If this starts later, define producer payloads in the identity-event program before changing `idRegistration` writes. The first implementation may emit from admin/activity-style mutation hooks or outbox producers, but event delivery remains asynchronous and best-effort relative to the registration decision.

## 17. Definition Of Done

- New numbered doc exists and README Contracts links it.
- Current public signup remains blocked unless a valid registration intent exists.
- OIDC `prompt=create` launches hosted `/register`.
- Registration policy is database-backed and plugin-owned.
- Requested scopes are validated against OAuth Provider support, scope catalog, client-resource binding, registration policy, and consent.
- New users receive least-privilege defaults.
- Invitation signup can create account and accept membership when policy allows.
- Quotas are implemented with explicitly documented soft or strict semantics.
- OAuth continuation after signup uses `/oauth2/continue` and normal authorization-code flow.
- SCIM remains out of browser signup.
- Tests cover direct signup denial, prompt-create success/denial, quotas, invite email mismatch, scope narrowing, and existing login/OAuth regressions.

## 18. Final Model

`id` should support registration as a policy-gated authorization-server journey, not as a raw public signup endpoint. The standard entry is OIDC `prompt=create`. OAuth scopes are requests, not client-issued permissions. The scope catalog, client-resource bindings, registration policies, user consent, and resource-server enforcement decide what actually happens. Quotas, invite-only modes, domain allowlists, and default memberships are repo-specific product policy implemented inside `idRegistration`.

That gives client applications a clean way to send users to `id` for signup while keeping the authority to create identities and issue access inside `id`.
