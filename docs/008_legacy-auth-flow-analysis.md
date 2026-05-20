# Legacy Auth Flow Analysis And Correct OIDC Logout Model

> Status: observation notes — unverified, no action required
>
> Date: 2026-05-20
>
> Scope: analysis of how three existing apps handle auth and logout against Better Auth, and what the correct OIDC RP-Initiated Logout flow looks like
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
> - Better Auth OAuth Provider docs, checked 2026-05-20: <https://www.better-auth.com/docs/plugins/oauth-provider>

## Table Of Contents

- [1. Three Apps, Three Auth Models](#1-three-apps-three-auth-models)
  - [1.1 auther — The IdP](#11-auther--the-idp)
  - [1.2 next-blog — OAuth Client With Custom Token Storage](#12-next-blog--oauth-client-with-custom-token-storage)
  - [1.3 payloadcms — OAuth Client With JWT Cookie And JWKS Verification](#13-payloadcms--oauth-client-with-jwt-cookie-and-jwks-verification)
- [2. The Logout Bug In payloadcms](#2-the-logout-bug-in-payloadcms)
- [3. The Correct OIDC RP-Initiated Logout](#3-the-correct-oidc-rp-initiated-logout)
- [4. What The New id Should Do](#4-what-the-new-id-should-do)

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

## 5. Token Storage And Logout For The New id + content-ui

The legacy apps store access tokens in cookies (`betterAuthToken`) because they are server-rendered (Next.js SSR / Payload Express). For the new `id`, content-ui should follow the Backend-For-Frontend (BFF) model — tokens are stored on the server side of content-ui's own backend, never exposed to the browser.

### 5.1 Token Storage Model

```
Browser (content-ui)
  │  no tokens stored — only a content-ui application session cookie
  ▼
content-ui server (Next.js route handler or static SPA with proxy)
  │  stores: access_token (in-memory or short-lived cookie)
  │           refresh_token (HttpOnly cookie, domain=content.quanghuy.dev)
  │           id_token (in-memory, needed for logout redirect)
  ▼
id (IdP)
  │  owns: BA session cookie (domain=.quanghuy.dev)
  ▼
content-api (resource server)
  │  verifies: access_token via JWKS (stateless)
```

Why this split:
- **Browser** never sees raw tokens — less XSS surface
- **content-ui server** holds tokens, proxies API calls with `Authorization: Bearer`
- **id** owns the user session — one cookie per user, shared across all subdomains
- **content-api** verifies JWTs locally — zero calls to id

### 5.2 Login Flow

```
1. Browser → GET content.quanghuy.dev
2. content-ui → no app session → 302 to id.quanghuy.dev/api/auth/oauth2/authorize
              ?client_id=content-ui
              &redirect_uri=https://content.quanghuy.dev/auth/callback
              &code_challenge=...
              &code_challenge_method=S256
              &scope=openid+email+profile
              &state=random
3. id → BA session cookie set on .quanghuy.dev ← browser now on id's domain
4. id → 302 to content.quanghuy.dev/auth/callback?code=...&state=...
5. content-ui server → POST id.quanghuy.dev/api/auth/oauth2/token
                      { code, code_verifier, client_id, client_secret }
6. id → 200 { access_token, id_token, refresh_token, expires_in }
7. content-ui server stores:
   - access_token in server memory or short-lived encrypted cookie
   - refresh_token in HttpOnly cookie (domain=content.quanghuy.dev)
   - id_token in server memory (for logout)
8. content-ui server → set app session cookie → 302 to home page
```

### 5.3 API Call Flow (After Login)

```
1. Browser → GET content.quanghuy.dev/api/posts (app session cookie)
2. content-ui server → reads access_token from storage
                     → GET content-api.quanghuy.dev/posts
                        Authorization: Bearer <access_token>
3. content-api → jwtVerify(access_token, JWKS from id) → 200
4. content-ui server → 200 to browser
```

If access_token expires:
```
2a. content-api → 401
2b. content-ui server → POST id.quanghuy.dev/api/auth/oauth2/token
                        { grant_type: "refresh_token", refresh_token, client_id, client_secret }
2c. id → 200 { access_token (new), refresh_token (rotated), id_token }
2d. Retry step 2 with new access_token
```

### 5.4 RP-Initiated Logout Flow

```
1. User clicks "Sign out" in content-ui
2. Browser → GET content.quanghuy.dev/auth/logout
3. content-ui server → builds end-session URL:
   id.quanghuy.dev/api/auth/oauth2/end-session
     ?id_token_hint=<stored id_token>
     &post_logout_redirect_uri=https://content.quanghuy.dev/auth/logout/callback
     &state=random
4. Browser → 302 to id's end-session endpoint
   → BA session cookie sent (browser is on id.quanghuy.dev)
5. id → kills session in D1
     → Set-Cookie: better-auth.session=; Max-Age=0; domain=.quanghuy.dev
     → 302 to content.quanghuy.dev/auth/logout/callback
6. Browser → GET content.quanghuy.dev/auth/logout/callback
   → content-ui app session cookie sent (browser is on content.quanghuy.dev)
7. content-ui server:
   → clears access_token, id_token from memory
   → Set-Cookie: refresh_token=; Max-Age=0; domain=content.quanghuy.dev
   → clears app session cookie
   → 302 to home page with "Signed out" message
```

### 5.5 Cookie Domain Summary

| Cookie | Domain | Set by | Purpose |
|---|---|---|---|
| BA session | `.quanghuy.dev` | id (Better Auth) | Proves user session to IdP. Shared across all subdomains. |
| content-ui refresh_token | `content.quanghuy.dev` | content-ui server | Recovers access_token silently when expired. Not shared. |
| content-ui app session | `content.quanghuy.dev` | content-ui server | Marks content-ui session (optional, depends on framework). |

No `access_token` cookie on any domain — access tokens live server-side only. This avoids the leak surface seen in next-blog/payloadcms where the access_token JWT was stored in a cookie readable by any subdomain on `.quanghuy.dev`.

### 5.6 Why Not SessionStorage Or Cookies For The access_token

| Storage | Leaks to | Survives refresh? | Right for? |
|---|---|---|---|
| `sessionStorage` | Any JS on the origin (XSS) | Yes | **No** — XSS steals it |
| `localStorage` | Any JS on the origin (XSS) | Yes | **No** — persists beyond tab close |
| HttpOnly cookie | Nil (inaccessible to JS) | Yes | refresh_token (sent only to token endpoint) |
| Server memory | Nil | No (per-process) | access_token (BFF proxy pattern) |

For a plain SPA without a BFF proxy, `access_token` goes in-memory (JavaScript closure). Lost on page refresh — the refresh_token cookie recovers it. For content-ui with a server backend, access_token stays server-side where JS can't reach it.
