# First Batch Gaps And Integration Readiness

> Status: gap analysis — documents what is untested, missing, or blocking real usage
>
> Date: 2026-05-20
>
> Scope: cross-reference with `001_first-batch-plan.md` Section 18 and the content-api integration scenario

## Table Of Contents

- [1. Email Sending (Blocker)](#1-email-sending-blocker)
- [2. Consent Page (Blocker)](#2-consent-page-blocker)
- [3. Bootstrap Admin (Blocker)](#3-bootstrap-admin-blocker)
- [4. Rate Limiting](#4-rate-limiting)
- [5. Missing Tests](#5-missing-tests)
- [6. Real-World Integration Scenario: content-api](#6-real-world-integration-scenario-content-api)
- [7. Full Gap List](#7-full-gap-list)

## 1. Email Sending (Blocker)

Email verification and password reset links are stored in KV but never sent. No SMTP or email provider is configured.

**Current state:**
- `sendVerificationEmail` callback writes `{ email, url, token }` to KV at `id-email:verification:{email}`
- `sendResetPassword` callback writes to KV at `id-email:password-reset:{email}`
- No provider (Resend, SendGrid, Postmark, etc.) wired

**Impact:** Users cannot verify email or reset passwords without manually reading KV and visiting the link. The test suite bypasses this by running raw SQL: `update "user" set "emailVerified" = 1`.

**Fix:**
Wire a real email provider in the `sendVerificationEmail` / `sendResetPassword` callbacks. Resend is the simplest for Workers — REST API, no SMTP, environment-agnostic.

```ts
// Example: Resend integration
sendVerificationEmail: async ({ user, url }) => {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "id@quanghuy.dev",
      to: user.email,
      subject: "Verify your email",
      html: `<a href="${url}">Verify</a>`,
    }),
  });
},
```

Needs a new Cloudflare secret: `RESEND_API_KEY`.

## 2. Consent Page (Blocker)

The OAuth Provider is configured with `consentPage: "/admin/consent"` but no page exists at that path. When a non-trusted client initiates an authorization flow, Better Auth redirects the user to `/admin/consent` — which returns 404.

**Impact:** Any OAuth authorization_code flow for a non-trusted client will fail with a 404 after sign-in.

**Quickest fix:** Configure all first-party clients as trusted (skip consent). For production later, build the consent page in `ui-id`.

```ts
// In oauthProvider config:
trustedOrigins: ["https://content-api.quanghuy.dev"],
// Or: set skipConsent on individual OAuth clients via admin API
```

## 3. Bootstrap Admin (Blocker)

New users get `platformRole: "member"` by default. No user can perform admin operations (create OAuth clients, resource servers, invite members) until their `platformRole` is manually set to `"superadmin"` via D1.

No bootstrap script, seed, or first-run flow exists.

**Impact:** First deploy requires manual D1 SQL intervention before the system is usable.

**Fix:** Add a bootstrap script or a `--seed` option that creates a superadmin user. For CI/local, add a `pnpm db:seed` command. The seed should:
1. Create a superadmin user with known credentials
2. Create a default organization
3. Create a first-party OAuth client for content-api

## 4. Rate Limiting

Better Auth supports built-in rate limiting via `secondaryStorage` (KV), but no rate-limit config is set.

**Impact:** Sign-in, sign-up, and token endpoints have no brute-force protection.

**Fix:** One line of config in `getAuthOptions`:

```ts
rateLimit: {
  windowMs: 60_000,
  max: 10,
},
```

This limits to 10 auth attempts per minute per IP, state stored in KV via `secondaryStorage`.

## 5. Missing Tests

### 5.1 Authorization Code + PKCE Flow

`grantTypes` includes `"authorization_code"`. Better Auth handles the protocol. No end-to-end test exists.

**What to test:**
- Redirect to `/api/auth/oauth2/authorize` with PKCE parameters
- Follow sign-in redirect
- Exchange code at `/api/auth/oauth2/token`
- Verify resulting token (JWT or opaque depending on `resource` parameter)

### 5.2 Token Type Behavior (Resource vs No-Resource)

The OAuth Provider returns JWT access tokens only when `resource` is present. Without `resource`, tokens are opaque.

Our `oauth-flows.test.ts` tests the JWT path only (client_credentials with resource). No test covers:
- Auth code without `resource` → opaque token
- Auth code with `resource` → JWT token
- Refresh token exchange and resulting token type

### 5.3 UserInfo Endpoint

Route exists at `/api/auth/oauth2/userinfo` (documented in `contracts.ts`). No test verifies correct user data with `openid` scope.

### 5.4 Introspection + Revocation

Routes exist at `/api/auth/oauth2/introspect` and `/api/auth/oauth2/revoke`. No test verifies:
- Introspect reports `active: true` for valid token
- Revoke invalidates the token
- Introspect reports `active: false` after revocation

### 5.5 Refresh Token

`grantTypes` includes `"refresh_token"`. No test covers:
- Obtain refresh token during authorization_code
- Exchange refresh token for new access token
- Token type of refreshed token (JWT/opaque)
- Replay detection

### 5.6 Organization Invitations

Better Auth provides built-in invite/accept endpoints. No test covers the end-to-end flow:
- Owner calls `POST /api/auth/organization/invite-member`
- Invitee accepts via `POST /api/auth/organization/accept-invitation`

### 5.7 Organization Isolation

The plugin's `authorize` callback prevents org A members from mutating org B resources. No explicit isolation test exists.

### 5.8 Prompt Flows

`prompt=create`, `prompt=select_account`, and post-login org selection are configured in options. No browser-flow tests verify the redirect chain.

## 6. Real-World Integration Scenario: content-api

content-api is expected to be the first downstream consumer — acting as both a **resource server** (verifying JWTs for API access) and a **private OAuth client** (its UI authenticating users).

### 6.1 content-api as Resource Server

What content-api needs and what we have:

| Requirement | Status | Notes |
|---|---|---|
| JWKS URL to verify tokens | ✅ Ready | Served at `/api/auth/jwks`, advertised in well-known metadata |
| Downstream JWT verifier | ✅ Ready | `packages/lib/src/resource-token-verifier.ts` — `jose`-based, works in Workers |
| Issuer discovery | ✅ Ready | `/.well-known/oauth-authorization-server` returns `issuer`, `jwks_uri`, `token_endpoint` |
| Token audience matching | ✅ Ready | Resource server is created with a specific `audience`, JWT `aud` matches it |
| Scope enforcement | ✅ Ready | Verifier checks `requiredScopes` against JWT `scope` claim |
| Org isolation | ✅ Ready | Verifier checks `org_id` claim when `organizationId` is provided |

### 6.2 content-api UI as Private OAuth Client

| Requirement | Status | Notes |
|---|---|---|
| Create a confidential OAuth client | ⚠️ Blocked | No bootstrap admin — cannot create the client without manual D1 intervention |
| Client ID + secret | ⚠️ Blocked | Generated at client creation; cannot get them without admin |
| Redirect URIs | ⚠️ Blocked | Set at client creation; cannot configure without admin |
| Authorization code + PKCE flow | ⚠️ Untested | Configured but no browser-flow test |
| Get JWT for API access | ⚠️ Untested | Works for M2M; auth code path needs test |
| Consent screen | ❌ Missing | Will 404 unless client is marked trusted |

### 6.3 Minimum Viable Integration Checklist

To enable content-api to integrate as a real OAuth client + resource server:

1. **Bootstrap admin** — seed a superadmin user
2. **Wire email sending** — or temporarily disable `requireEmailVerification`
3. **Create first-party OAuth client** — confidential client for content-api's UI
4. **Create resource server** — with audience matching content-api's API domain
5. **Set client as trusted** — bypass consent screen until consent UI is built
6. **Test auth code flow** — end-to-end from redirect to token to API call
7. **Enable rate limiting** — basic brute-force protection

## 7. Full Gap List

| # | Item | Type | DoD Status |
|---|---|---|---|
| 1 | Email sending not wired | Blocker | ❌ |
| 2 | Consent page 404s | Blocker | ❌ |
| 3 | No bootstrap admin | Blocker | ❌ |
| 4 | Rate limiting not configured | Missing | ❌ |
| 5 | Auth code + PKCE flow test | Untested | ~ |
| 6 | Token type behavior (opaque vs JWT) | Untested | ~ |
| 7 | UserInfo endpoint test | Untested | ~ |
| 8 | Introspection + revocation test | Untested | ~ |
| 9 | Refresh token test | Untested | ~ |
| 10 | Org invitation test | Untested | ~ |
| 11 | Org isolation test | Untested | ~ |
| 12 | Prompt flows (`select_account`, `create`, post-login org) | Untested | ~ |
| 13 | `core-id` not deployed to Cloudflare | Not done | ❌ |
| 14 | No `db:seed` command | Missing | ❌ |
