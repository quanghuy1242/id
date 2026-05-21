# Legacy Auth Flow Analysis And Correct OIDC Logout Model

> Status: reviewed and corrected after current `id` and `content-api` codebase inspection
>
> Date: 2026-05-21
>
> Scope: analysis of how three existing apps handle auth and logout against Better Auth, what the correct OIDC RP-Initiated Logout flow looks like, and what must be true for `content-ui` + `content-api` integration
>
> Source files:
>
> - `/home/quanghuy1242/pjs/next-blog/src/app/auth/logout/route.ts`
> - `/home/quanghuy1242/pjs/next-blog/src/app/auth/login/route.ts`
> - `/home/quanghuy1242/pjs/next-blog/src/app/auth/callback/route.ts`
> - `/home/quanghuy1242/pjs/next-blog/src/lib/domain/auth/oauth.ts`
> - `/home/quanghuy1242/pjs/next-blog/src/lib/domain/auth/next-cookies.ts`
> - `/home/quanghuy1242/pjs/payloadcms/src/lib/betterAuth/strategy.ts`
> - `/home/quanghuy1242/pjs/payloadcms/src/lib/betterAuth/tokens.ts`
> - `/home/quanghuy1242/pjs/payloadcms/src/lib/betterAuth/authorize.ts`
> - `/home/quanghuy1242/pjs/payloadcms/src/lib/betterAuth/users.ts`
> - `/home/quanghuy1242/pjs/payloadcms/src/lib/betterAuth/api.ts`
> - `/home/quanghuy1242/pjs/payloadcms/src/lib/betterAuth/env.ts`
> - `/home/quanghuy1242/pjs/auther/src/app/admin/actions.ts` (signOut)
> - `/home/quanghuy1242/pjs/auther/src/components/layout/logout-button.tsx`
> - `/home/quanghuy1242/pjs/auth/workers/core/src/auth/get-auth.ts`
> - `/home/quanghuy1242/pjs/auth/workers/core/src/auth/config.ts`
> - `/home/quanghuy1242/pjs/auth/workers/core/src/http/routes/auth-mount.ts`
> - `/home/quanghuy1242/pjs/auth/workers/core/tests/auth/oauth-auth-code.test.ts`
> - `/home/quanghuy1242/pjs/auth/workers/core/tests/auth/runtime-audience-worker.test.ts`
> - `/home/quanghuy1242/pjs/content-api/src/application/auth/authenticate-bearer-token.usecase.ts`
> - `/home/quanghuy1242/pjs/content-api/wrangler.jsonc`
> - Better Auth OAuth Provider docs, checked 2026-05-20: <https://www.better-auth.com/docs/plugins/oauth-provider>

## Table Of Contents

- [1. Three Apps, Three Auth Models](#1-three-apps-three-auth-models)
  - [1.1 auther — The IdP](#11-auther--the-idp)
  - [1.2 next-blog — OAuth Client With Custom Token Storage](#12-next-blog--oauth-client-with-custom-token-storage)
  - [1.3 payloadcms — OAuth Client With JWT Cookie And JWKS Verification](#13-payloadcms--oauth-client-with-jwt-cookie-and-jwks-verification)
- [2. The Logout Bug In payloadcms](#2-the-logout-bug-in-payloadcms)
- [3. The Correct OIDC RP-Initiated Logout](#3-the-correct-oidc-rp-initiated-logout)
- [4. What The New id Should Do](#4-what-the-new-id-should-do)
- [5. Token Storage And Logout For The New id + content-ui + content-api](#5-token-storage-and-logout-for-the-new-id--content-ui--content-api)
  - [5.1 Review Verdict](#51-review-verdict)
  - [5.2 OAuth Client And Resource Registration](#52-oauth-client-and-resource-registration)
  - [5.3 Who Stores What](#53-who-stores-what)
  - [5.4 Login Flow](#54-login-flow)
  - [5.5 API Call And Refresh Flow](#55-api-call-and-refresh-flow)
  - [5.6 RP-Initiated Logout](#56-rp-initiated-logout)
  - [5.7 Multi-Client Logout](#57-multi-client-logout)
  - [5.8 Cookie Summary](#58-cookie-summary)
  - [5.9 Integration Gaps Before content-ui + content-api](#59-integration-gaps-before-content-ui--content-api)
  - [5.10 What content-ui Must Never Do](#510-what-content-ui-must-never-do)
  - [5.11 Storage Rationale](#511-storage-rationale)

## 1. Three Apps, Three Auth Models

All three apps use Better Auth, but they handle sessions and tokens differently.

### 1.1 auther — The IdP

`auther` hosts the Better Auth instance. It owns the BA session cookie.

**Login (admin UI):** uses `nextCookies` plugin — Better Auth sets the session cookie directly on auther's domain.

**Logout (admin LogoutButton):**
```ts
// auther/src/app/admin/actions.ts:18-24
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
```

This properly destroys the BA session. All clients that depend on that session cookie lose access.

**Logout (user sign-in page):**
```ts
// auther/src/app/sign-in/actions.ts:52
await auth.api.signOut({ headers: await headers() });
```

Same — destroys the session. Used during sign-in to clear stale sessions before creating a new one.

### 1.2 next-blog — OAuth Client With Custom Token Storage

next-blog is an OAuth client app. It does NOT share the BA session cookie. It stores its own tokens.

**Login flow (`/auth/login`):**
1. Generates PKCE verifier + challenge
2. Stores verifier + state + returnTo in a `blogAuthState` cookie (encrypted JSON)
3. Redirects browser to auther's `/api/auth/oauth2/authorize` with PKCE params
4. User signs in at auther — BA session cookie set on auther's domain

**Callback flow (`/auth/callback`):**
1. Validates state matches `blogAuthState`
2. Calls `POST /api/auth/oauth2/token` with code + verifier → gets access token + refresh token
3. Stores the access token in two cookies: `betterAuthToken` and `payload-token`
4. Clears `blogAuthState` cookie
5. Redirects to returnTo URL

**Auth on every request:** reads `betterAuthToken` cookie, passes it as `Authorization: Bearer <token>` to downstream APIs (payloadcms).

**Logout (`/auth/logout`):**
```ts
// next-blog/src/app/auth/logout/route.ts
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL(destination, request.url), 307);
  clearBlogAuthStateCookie(response);      // clears blogAuthState
  clearBlogAuthTokenCookies(response, ...); // clears betterAuthToken + payload-token
  return response;
}
```

Clears its own three cookies. Does NOT call `auth.api.signOut()`. Does NOT touch auther's BA session.

**Result:** next-blog forgets the user. The BA session on auther stays alive. Next time the user visits next-blog, they can silently re-authenticate because the BA session cookie still exists.

### 1.3 payloadcms — OAuth Client With JWT Cookie And JWKS Verification

payloadcms is another OAuth client, but it verifies tokens locally instead of forwarding them.

**Login flow (Express middleware):**
1. Detects unauthenticated request to `/admin/*`
2. Calls `createAuthorizeUrl()` — generates PKCE, stores state in `betterAuthState` cookie
3. Redirects browser to auther's `/api/auth/oauth2/authorize`
4. After callback, stores the JWT access token in `betterAuthToken` cookie

**Auth on every request (`betterAuthStrategy`):**
```ts
// payloadcms/src/lib/betterAuth/strategy.ts:73-116
export const betterAuthStrategy: AuthStrategy = {
  name: 'better-auth',
  authenticate: async ({ headers, payload }) => {
    const token = extractTokenFromHeaders(headers); // Authorization header OR betterAuthToken cookie
    if (!token) return { user: null };
    const tokenPayload = await verifyBetterAuthToken(token); // JWKS verify locally
    const user = await upsertBetterAuthUser({ payload, token: tokenPayload });
    return { user: { ...user } };
  },
};
```

Key detail: the token is verified **locally** via JWKS. payloadcms never calls auther on each request. It `import { jwtVerify } from "jose"` and `createRemoteJWKSet(new URL('/api/auth/jwks', baseUrl))` — completely stateless verification.

**User upsert (`upsertBetterAuthUser`):**
- Looks up local Payload user by `betterAuthUserId` (which is `token.sub` — the BA user ID)
- If found: updates email/name/role if needed
- If not found: creates a new Payload user
- This creates a local mirror of the BA user identity

## 2. The Logout Bug In payloadcms

When `auth.api.signOut()` is called (on auther's side):

1. ✅ The BA session cookie on auther's domain is cleared — session destroyed in D1
2. ❌ The `betterAuthToken` JWT cookie on payload CMS's domain is NOT cleared
3. ❌ payload's `betterAuthStrategy` still reads the JWT from the cookie
4. ❌ `verifyBetterAuthToken(token)` calls JWKS locally — the JWT is still valid (not expired)
5. ❌ User appears still logged in to payloadcms

**Why the JWT is still valid:** JWT access tokens are stateless. Killing the BA session in D1 does not revoke an already-issued JWT. The JWT remains valid until its `exp` timestamp. BA would need a token revocation list or introspection check to detect this.

**Why the cookie persists:** The `betterAuthToken` cookie lives on `payload.quanghuy.dev`. Calling `auth.api.signOut()` on `auther.quanghuy.dev` cannot clear cookies on a different domain. Browser security prevents cross-domain cookie manipulation.

**This is not a Better Auth bug.** This is the expected behavior when a client stores a JWT in its own cookie and verifies it locally without calling the IdP. The client owns the cookie — the IdP cannot reach it.

## 3. The Correct OIDC RP-Initiated Logout

The standard OIDC flow solves this with a browser redirect chain:

### Step-by-step

```
content-ui shows "Sign out" button
         │
         ▼
Browser ───→ GET https://content.quanghuy.dev/logout         (1)
         │
         ←─── 302 → https://id.quanghuy.dev/api/auth/oauth2/end-session
              ?id_token_hint=<jwt>
              &post_logout_redirect_uri=https://content.quanghuy.dev/logout/callback
              &state=random                                            (2)
         │
         ▼
Browser ───→ GET https://id.quanghuy.dev/api/auth/oauth2/end-session  (3)
              Cookie: __session=...  ← sent because on id.quanghuy.dev
         │
         │  Better Auth:
         │  - Validates id_token_hint (aud, iss, exp)
         │  - Destroys session in D1
         │  - Clears session cookie (Set-Cookie: __session=; Max-Age=0; domain=.quanghuy.dev)
         │  - Validates post_logout_redirect_uri against client's registered URIs
         │
         ←─── 302 → https://content.quanghuy.dev/logout/callback?state=random  (4)
         │
         ▼
Browser ───→ GET https://content.quanghuy.dev/logout/callback       (5)
         │
         │  content-ui:
         │  - Clears its own app tokens/cookies
         │  - Clears any cached user state
         │  - Redirects to home page or shows "Signed out" message
         │
         ←─── 200 or 302 → home page                                (6)
```

### Why this works

| Step | What happens | Why it's necessary |
|---|---|---|
| (2) | Browser receives 302 to IdP's end-session | Browser will visit the IdP's domain |
| (3) | Browser sends BA session cookie to IdP | Browser is on `id.quanghuy.dev`, so the cookie is included |
| (3) | IdP destroys session + clears cookie | `Set-Cookie` with `Max-Age=0` on `.quanghuy.dev` — covers all subdomains |
| (4) | IdP redirects to client's callback | Browser will visit the client's domain |
| (5) | Client clears own tokens | Client owns `content.quanghuy.dev` cookies — can clear them |

The key insight: **the browser visits both domains in sequence.** The IdP clears cookies on its domain during step 3. The client clears cookies on its domain during step 5. Two domains, two `Set-Cookie` operations, one browser redirect chain.

### Better Auth support

Better Auth's OAuth Provider plugin supports RP-Initiated Logout natively (since late 2025):

| Feature | Config |
|---|---|
| Endpoint | `/api/auth/oauth2/end-session` |
| Discovery | Advertised as `end_session_endpoint` in `/.well-known/openid-configuration` |
| Per-client enable | `enable_end_session: true` on the OAuth client record (set via admin API) |
| Redirect URI validation | Client's `postLogoutRedirectUris` must include the callback URL |
| `id_token_hint` validation | BA validates `aud`, `iss`, `exp` on the hint when present |

### What the client must do

The client (content-ui, book-ui, etc.) needs:

1. A logout endpoint that redirects to the IdP's `end_session_endpoint`
2. A callback page that clears local tokens/cookies
3. The callback URL registered in the OAuth client's `postLogoutRedirectUris`

```
// content-ui logout endpoint (pseudo-code)
GET /logout
  → redirect to id.quanghuy.dev/api/auth/oauth2/end-session
    ?id_token_hint=<stored id token>
    &post_logout_redirect_uri=https://content.quanghuy.dev/logout/callback
    &state=random

// content-ui callback
GET /logout/callback
  → clear local tokens
  → clear cached user state
  → redirect to home page
```

## 4. What The New id Should Do

### id as IdP

Better Auth handles the protocol. No custom code needed beyond:
- Create clients with `enable_end_session: true`
- Set `postLogoutRedirectUris` on each client

### content-ui (and all clients)

Each client must:
1. Store the `id_token` from the token exchange response (JWTs that contain `sub`, `iss`, `aud`, `exp`)
2. Provide a logout endpoint that redirects to the IdP's `end_session_endpoint` with `id_token_hint` + `post_logout_redirect_uri`
3. Provide a callback page that clears all local state

### What next-blog and payloadcms need to fix

| App | Current behavior | What to change |
|---|---|---|
| next-blog | Clears own cookies, silent logout | Add IdP redirect to `end_session_endpoint` if true SLO is desired |
| payloadcms | JWT cookie persists after BA signOut | Replace local cookie-only logout with redirect chain through IdP |

These are legacy app concerns — not blocking the new `id` implementation.

## 5. Token Storage And Logout For The New id + content-ui + content-api

### 5.1 Review Verdict

The BFF model is right, but the previous draft of this section had three material flow gaps:

1. It omitted `resource=<content-api audience>` from the authorization-code and refresh token requests. In Better Auth 1.6.11, the token endpoint uses the request body's `resource` parameter to decide whether the access token is a JWKS-verifiable JWT. Without `resource`, `content-api` must treat the token as opaque and cannot verify it locally.
2. It scoped the `refresh_token` cookie to `/api/auth/token`, which means ordinary BFF API proxy routes such as `/api/posts` would not receive that cookie and therefore could not refresh transparently after a 401.
3. It did not store `state` explicitly. The callback and logout callback cannot validate `state` unless `content-ui` stores a short-lived httpOnly state cookie or server-side transaction record.

There is no current `id` code blocker for OAuth/OIDC protocol integration. The blockers are integration work in the downstream apps:

- `content-ui` does not exist in `/home/quanghuy1242/pjs`; it still needs the BFF routes described below.
- `content-api` is still configured for the legacy issuer/audience (`https://auth.quanghuy.dev`, `payload-content-api`) and currently rejects tokens unless they contain `token_use=access`. The new `id` access token does not add that legacy claim. `content-api` must switch to `https://id.quanghuy.dev/api/auth`, a URL-shaped registered audience, and standard JWT checks: signature, issuer, audience, expiry, subject, scope, and optional `org_id`.

The correct rule is: **browser JavaScript gets no raw OAuth tokens and application data calls go through `content-ui` only**. The browser still stores httpOnly cookies, including the IdP session cookie and BFF token cookies, so those cookies must be treated as credentials.

### 5.2 OAuth Client And Resource Registration

`content-api` must first be registered as an enabled resource server in `id`, for example:

```ts
{
  organizationId: "org_1",
  slug: "content-api",
  name: "Content API",
  audience: "https://content-api.quanghuy.dev",
}
```

`content-ui` is then registered on `id` as a confidential OAuth client:

```ts
{
  client_name: "content-ui",
  type: "web",
  token_endpoint_auth_method: "client_secret_post",
  redirect_uris: ["https://content.quanghuy.dev/auth/callback"],
  post_logout_redirect_uris: ["https://content.quanghuy.dev/auth/logout/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  scope: "openid email profile offline_access api:read",
  require_pkce: true,
  enable_end_session: true,
  skip_consent: true,
}
```

| Setting | Value | Reason |
|---|---|---|
| `type` | `"web"` | The BFF is a server-side web application — it can hold a client_secret safely. Better Auth requires `"web"` for confidential clients (not a `"confidential"` enum value). |
| `token_endpoint_auth_method` | `"client_secret_post"` | The token endpoint authenticates the BFF caller. Prevents unauthorized token exchange even if a code is stolen. |
| `require_pkce` | `true` | Defense-in-depth. PKCE proves the caller initiated the auth flow. Layered on top of client_secret — either alone is weaker. |
| `grant_types` | `"authorization_code"`, `"refresh_token"` | Code exchange for login. Refresh token for silent token rotation without re-authentication. |
| `scope` | includes `offline_access` | Required by Better Auth to issue a `refresh_token`. Without this, the user must re-authenticate every ~3 hours. |
| `enable_end_session` | `true` | Enables RP-Initiated Logout and causes the ID token to carry `sid`, which Better Auth requires during `/oauth2/end-session`. |
| `skip_consent` | `true` for first-party `content-ui` | Avoids a consent prompt for the trusted first-party app. Keep `/consent` as fallback for non-trusted clients. |

The `redirect_uris` and `post_logout_redirect_uris` values must exactly match the routes implemented by `content-ui`. The paths below use `/auth/callback` and `/auth/logout/callback` as the target contract.

### 5.3 Who Stores What

```
Browser
  │  no localStorage, no sessionStorage, no JS-readable OAuth tokens.
  │  holds httpOnly cookies that JavaScript cannot read:
  │    - id BA session cookie (.quanghuy.dev)
  │    - content-ui token/state cookies (host-only content.quanghuy.dev)
  ▼
content-ui BFF (content.quanghuy.dev)
  │  reads cookies server-side via request.cookies
  │  stores in httpOnly cookies (never exposed to JS):
  │    - access_token  — HttpOnly, Secure, SameSite=Lax, Path=/, host-only
  │    - refresh_token — HttpOnly, Secure, SameSite=Lax, Path=/, host-only
  │    - id_token      — HttpOnly, Secure, SameSite=Lax, Path=/, host-only
  │    - oauth_state   — HttpOnly, Secure, SameSite=Lax, Path=/auth/callback, host-only, short-lived
  │    - pkce_verifier — HttpOnly, Secure, SameSite=Lax, Path=/auth/callback, host-only, short-lived
  │    - logout_state  — HttpOnly, Secure, SameSite=Lax, Path=/auth/logout/callback, host-only, short-lived
  │  holds server-side:
  │    - client_secret — environment variable, never in a cookie
  │    - client_id     — environment variable
  │    - content_api_audience — environment variable, e.g. https://content-api.quanghuy.dev
  ▼
id (id.quanghuy.dev)
  │  owns: BA session cookie (Domain=.quanghuy.dev, shared across subdomains via crossSubDomainCookies)
  │        OAuth client records with client_secret hashes
  ▼
content-api (content-api.quanghuy.dev)
  │  verifies: access_token via JWKS (stateless, no call to id on every request)
  │  knows:     client_id and client_secret are irrelevant here — it only needs JWKS
```

Why this split:
- **Browser** is a cookie transport only for credentials. XSS on content-ui cannot read the raw OAuth tokens, though normal XSS risk still matters because injected code can cause same-origin actions.
- **content-ui BFF** is the sole token holder. It authenticates itself to id's token endpoint with `client_secret_post`. It forwards `Authorization: Bearer <access_token>` to content-api on every proxied request.
- **id** owns user sessions and issues tokens. The BA session cookie is shared across subdomains only for the IdP session; downstream apps must ignore it for API authorization.
- **content-api** verifies JWTs locally via `/api/auth/jwks`. No per-request call to id. The access token is self-contained only when the token request includes `resource=<registered audience>`.

### 5.4 Login Flow

```
1. Browser → GET content.quanghuy.dev
2. content-ui BFF → no token cookies → generate PKCE verifier + CSRF state, then set short-lived host-only cookies:
   Set-Cookie: pkce_verifier=<random>; HttpOnly; Secure; SameSite=Lax; Path=/auth/callback; Max-Age=600
   Set-Cookie: oauth_state=<random>;   HttpOnly; Secure; SameSite=Lax; Path=/auth/callback; Max-Age=600
3. content-ui BFF → 302 to id.quanghuy.dev/api/auth/oauth2/authorize
                   ?client_id=<CLIENT_ID>
                   &redirect_uri=https://content.quanghuy.dev/auth/callback
                   &response_type=code
                   &scope=openid+email+profile+offline_access+api:read
                   &resource=https://content-api.quanghuy.dev
                   &code_challenge=<S256(verifier)>
                   &code_challenge_method=S256
                   &state=<oauth_state>
4. Browser visits id.quanghuy.dev (now on id's origin)
5. id → user signs in (or reuses existing session)
6. id → consent screen (or skip_consent if the client is trusted)
7. id → sets/refreshes BA session cookie on .quanghuy.dev
8. id → 302 to content.quanghuy.dev/auth/callback?code=<auth_code>&state=<same_random>
9. content-ui BFF → validates state matches oauth_state cookie
                  → reads pkce_verifier cookie
                  → POST id.quanghuy.dev/api/auth/oauth2/token
                    body (application/x-www-form-urlencoded):
                      grant_type=authorization_code
                      &code=<auth_code>
                      &code_verifier=<pkce_verifier>
                      &client_id=<CLIENT_ID>
                      &client_secret=<CLIENT_SECRET>    ← BFF authenticates itself
                      &redirect_uri=https://content.quanghuy.dev/auth/callback
                      &resource=https://content-api.quanghuy.dev
10. id → validates client_secret, validates PKCE code_verifier against code_challenge
       → 200 { access_token, refresh_token, id_token, expires_in, token_type: "Bearer" }
11. content-ui BFF → sets httpOnly cookies on content.quanghuy.dev:
    Set-Cookie: access_token=<jwt>;  HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=10800
    Set-Cookie: refresh_token=<str>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
    Set-Cookie: id_token=<jwt>;      HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=10800
    Set-Cookie: pkce_verifier=; Max-Age=0  ← clear the PKCE cookie
    Set-Cookie: oauth_state=;   Max-Age=0  ← clear the state cookie
12. content-ui BFF → 302 to home page
```

Security properties of this flow:
- **auth_code is worthless without PKCE verifier** — the verifier is httpOnly, never in the URL
- **auth_code is worthless without client_secret** — even if an attacker steals the code + verifier, the token endpoint rejects unauthenticated callers
- **Browser never handles the token exchange** — the BFF does it server-to-server
- **Tokens go into httpOnly cookies** — JS cannot read them, cookies scoped to `content.quanghuy.dev` only
- **`resource` is sent during token exchange** — the resulting access token is a JWT with `aud=https://content-api.quanghuy.dev`, accepted by `content-api`

### 5.5 API Call And Refresh Flow

Every authenticated request: browser → BFF (same-origin) → content-api (server-to-server):

```
1. Browser → GET content.quanghuy.dev/api/posts
   Cookie: access_token=<jwt> (browser sends automatically, same-origin, httpOnly)
2. content-ui BFF → reads access_token from request.cookies
                  → GET content-api.quanghuy.dev/api/posts
                     Authorization: Bearer <access_token>
3. content-api → jwtVerify(access_token, JWKS, issuer, audience) → 200 { posts }
4. content-ui BFF → renders or proxies 200 to browser
```

Token refresh (silent — user does not notice):
```
2a. content-api → 401 { error: "expired_token" }
2b. content-ui BFF → reads refresh_token from request.cookies
                   → POST id.quanghuy.dev/api/auth/oauth2/token
                     body:
                       grant_type=refresh_token
                       &refresh_token=<stored>
                       &client_id=<CLIENT_ID>
                       &client_secret=<CLIENT_SECRET>
                       &resource=https://content-api.quanghuy.dev
2c. id → validates client_secret, validates refresh_token
       → 200 { access_token (new), refresh_token (rotated), id_token, expires_in }
2d. content-ui BFF → Set-Cookie updated access_token, refresh_token, id_token cookies
2e. Retry step 2 with new access_token
```

The browser never knows a refresh happened. The BFF does it transparently before retrying the failed request.

Important implementation details:

- The refresh-token cookie uses `Path=/`, not `/api/auth/token`, because every BFF proxy route must be able to read it server-side when a retry needs refresh.
- The refresh request must include the same `resource` audience. Otherwise Better Auth can issue an opaque access token, which `content-api` cannot verify through JWKS.
- State-changing BFF routes still need CSRF protection or strict Origin/Referer checks. HttpOnly protects token secrecy; it does not by itself authorize browser-initiated writes.

### 5.6 RP-Initiated Logout

When a user signs out of one client (content-ui), the logout destroys the IdP session and the initiating client's local state. **It does not automatically sign out other clients.** The OIDC RP-Initiated Logout spec is per-client — each RP must initiate its own logout or accept that its access token remains valid until expiry.

```
1. User clicks "Sign out" in content-ui
2. Browser → GET content.quanghuy.dev/auth/logout
3. content-ui BFF → reads id_token from request.cookies
                  → generates logout_state and stores it:
                    Set-Cookie: logout_state=<random>; HttpOnly; Secure; SameSite=Lax; Path=/auth/logout/callback; Max-Age=600
                  → 302 to id.quanghuy.dev/api/auth/oauth2/end-session
                    ?id_token_hint=<id_token>
                    &client_id=<CLIENT_ID>
                    &post_logout_redirect_uri=https://content.quanghuy.dev/auth/logout/callback
                    &state=<logout_state>
4. Browser visits id.quanghuy.dev/api/auth/oauth2/end-session
   → BA session cookie sent automatically (same-site, .quanghuy.dev domain)
5. id → verifies id_token_hint signature and validates issuer, audience/client_id, and sid
     → deletes the session row from D1
     → the browser may still physically store the old BA session cookie because this Better Auth endpoint deletes the server session but does not necessarily send an expiry `Set-Cookie`
     → the remaining cookie is only a stale session-token pointer; future IdP requests look it up in D1, find no backing session, and treat the user as signed out
     → validates post_logout_redirect_uri against client's registered URIs
     → 302 to content.quanghuy.dev/auth/logout/callback?state=<same_random>
6. Browser → GET content.quanghuy.dev/auth/logout/callback
7. content-ui BFF → validates state against logout_state cookie
                  → clears all token cookies:
   Set-Cookie: access_token=;  Max-Age=0; Path=/
   Set-Cookie: refresh_token=; Max-Age=0; Path=/
   Set-Cookie: id_token=;      Max-Age=0; Path=/
   Set-Cookie: logout_state=;  Max-Age=0; Path=/auth/logout/callback
8. content-ui BFF → 302 to home page
```

The key insight: the browser visits **both domains in sequence**. id deletes its session (step 5), content-ui clears its own cookies (step 7). One redirect chain.

If `id_token` is missing, `content-ui` cannot use Better Auth's `/oauth2/end-session` endpoint because Better Auth 1.6.11 requires `id_token_hint`. In that failure mode, `content-ui` should clear its own local cookies and treat global IdP logout as incomplete.

### 5.7 Multi-Client Logout

A single client's logout destroys the **IdP session** but does not affect other clients' tokens. This is the standard OIDC RP-Initiated Logout model. Major IdPs behave identically:

| Real-world example | Action | Other sessions |
|---|---|---|
| Google | Sign out of Gmail in Chrome | YouTube on Android stays signed in, Google Photos on iPad stays signed in |
| GitHub | Sign out of github.com in browser | `gh` CLI stays authenticated, VS Code extension stays authenticated |
| Microsoft | Sign out of Outlook Web | Teams desktop stays signed in, Azure CLI stays authenticated |

Why: each RP (client) holds its **own independent tokens**. The IdP session is scoped to the IdP — it proves the user has an active session *with the IdP*, not that they are actively using any particular client.

**What `end-session` actually does (Better Auth implementation, verified at oauth-provider line 1129-1227):**

| Layer | Immediately affected | Status on other clients |
|---|---|---|
| IdP session | Deleted from D1 (line 1202-1222) | Gone — future OAuth re-auth requires sign-in |
| BA session cookie | May remain physically stored in the browser if `/oauth2/end-session` does not send an expiry `Set-Cookie` | Stale pointer only — future IdP requests find no matching D1 session and treat the user as signed out |
| access_token (JWT) | Gone on the initiating client (its own cookie deleted) | **Still valid** — stateless JWT, no revocation call made |
| refresh_token | Gone on the initiating client (its own cookie deleted) | **Still valid** — stored in separate DB rows, not deleted by `end-session` |

**Result after content-ui logout:** other clients (content-admin, etc.) remain fully functional. They can use their existing access_token and refresh it silently. The user appears logged in to those clients. This is correct OIDC behavior — the IdP does not dictate RP session state.

**When other clients eventually lose access:**
- Their access_token expires naturally
- Their refresh attempt eventually fails (token rotation cycle, expiry, or explicit revocation via the OAuth client management API)
- Or the user initiates logout from each client individually

### 5.8 Cookie Summary

| Cookie | Domain/path | httpOnly | Set by | Who sends it | Purpose |
|---|---|---|---|---|---|
| BA session | `.quanghuy.dev`, Better Auth path | Yes | id | Browser to `*.quanghuy.dev`; downstream apps ignore it | Proves user session to IdP |
| access_token | host-only `content.quanghuy.dev`, `/` | Yes | content-ui BFF | Browser to content-ui | JWT for content-api calls |
| refresh_token | host-only `content.quanghuy.dev`, `/` | Yes | content-ui BFF | Browser to content-ui | Silent token rotation by any BFF proxy route |
| id_token | host-only `content.quanghuy.dev`, `/` | Yes | content-ui BFF | Browser to content-ui | `id_token_hint` for RP-Initiated Logout |
| oauth_state | host-only `content.quanghuy.dev`, `/auth/callback` | Yes | content-ui BFF | Browser to callback only | Authorization CSRF state |
| pkce_verifier | host-only `content.quanghuy.dev`, `/auth/callback` | Yes | content-ui BFF | Browser to callback only | Transient PKCE proof |
| logout_state | host-only `content.quanghuy.dev`, `/auth/logout/callback` | Yes | content-ui BFF | Browser to logout callback only | Logout CSRF state |

No OAuth token cookie is shared across unrelated origins. The BA session cookie on `.quanghuy.dev` is the only cross-subdomain cookie, and it contains only a session identifier, not an API access token.

### 5.9 Integration Gaps Before content-ui + content-api

`id` is ready enough for protocol integration after deployment and admin setup, but these downstream gaps must be closed:

| Area | Current state | Required before integration |
|---|---|---|
| `content-ui` | No `/home/quanghuy1242/pjs/content-ui` repo exists in the inspected workspace | Implement the BFF routes: `/auth/login`, `/auth/callback`, API proxy routes, `/auth/logout`, `/auth/logout/callback`, token cookie handling, state cookies, refresh retry, and CSRF/Origin checks. |
| `content-api` issuer | `wrangler.jsonc` uses `AUTH_ISSUER=https://auth.quanghuy.dev` | Use `AUTH_ISSUER=https://id.quanghuy.dev/api/auth`. |
| `content-api` JWKS | `wrangler.jsonc` uses `https://auth.quanghuy.dev/api/auth/jwks` | Use `https://id.quanghuy.dev/api/auth/jwks`. |
| `content-api` audience | `AUTH_AUDIENCE=payload-content-api`, but `id` resource-server audiences are URL-shaped | Register and use a URL audience, for example `https://content-api.quanghuy.dev`, and send it as the OAuth `resource` parameter. |
| `content-api` claim checks | `AuthenticateBearerTokenUseCase` requires `token_use=access`, a legacy Auther-style claim | Remove that requirement or make it optional. Verify standard JWT claims plus `scope` and optional `org_id` instead. |
| User mapping | `content-api` maps `sub` to a local user through `findByBetterAuthUserId` | Confirm that new `id` user IDs are stored in the same local field, or add a migration/linking strategy. |
| Client/resource setup | Requires admin-created OAuth client and resource server | Bootstrap admin, create resource server, create `content-ui` client, store `CLIENT_ID`, `CLIENT_SECRET`, issuer, JWKS URL, and audience in the downstream environments. |

None of these require custom token revocation, non-standard logout propagation, or patching Better Auth internals.

### 5.10 What content-ui Must Never Do (next-blog Anti-Patterns)

| Anti-pattern | What next-blog does | Correct approach |
|---|---|---|
| Mirror access_token to `.quanghuy.dev` | Stores the raw JWT access_token in a cookie on `.quanghuy.dev` for all subdomains | Scope token cookies to `content.quanghuy.dev` only. The BA session on `.quanghuy.dev` is sufficient for subdomain sign-in. |
| Skip refresh_token | Never requests `offline_access`. Tokens expire and the user must re-authenticate. | Request `offline_access` scope. Store refresh_token in httpOnly cookie. BFF refreshes silently. |
| Public client auth | Uses `token_endpoint_auth_method: "none"`. Any caller with the code can exchange it. | Use `"client_secret_post"`. The BFF authenticates itself at the token endpoint. |
| Browser fetches id directly | Browser calls `id.quanghuy.dev/api/auth/get-session` via `credentials: "include"` | All authenticated calls go through content-ui BFF only. Browser never talks to id for data. |
| Token in JS-accessible storage | N/A (next-blog uses httpOnly cookies — one thing it got right) | Keep all tokens in httpOnly cookies. Never `localStorage` or `sessionStorage`. |

### 5.11 Storage Rationale

| Storage | JS-accessible? | Survives restart? | Right for? |
|---|---|---|---|
| `sessionStorage` | Yes (XSS) | Per-tab only | **Never** — XSS steals it |
| `localStorage` | Yes (XSS) | Persists | **Never** — XSS steals it, survives tab close |
| HttpOnly cookie | No | Yes | **All tokens** — JS cannot read it, transparent to browser |
| Server memory | No | No (lost on deploy/restart) | Not suitable — causes re-auth on every deploy |
| Server-side KV | No | Yes | Fallback for tokens > 4KB |

HttpOnly host-only cookies are the primary mechanism. They are JS-inaccessible, scoped to `content.quanghuy.dev`, and survive browser restarts. The BFF reads them server-side and forwards only the access token in the `Authorization` header to `content-api`. If the cookie set approaches browser limits, store tokens server-side in D1/KV keyed by a short opaque BFF session cookie instead.
