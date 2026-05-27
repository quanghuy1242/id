# 020 — Workers Security Findings (workers/core, workers/ui)

> Status: implementation-grade research and findings
>
> Date: 2026-05-27
>
> Scope:
>
> - `workers/core/**` — Better Auth runtime, OAuth/OIDC plugins, JWKS, bootstrap, persistence companions
> - `workers/ui/**` — Next.js (vinext) hosted login, consent, select-context, admin shell
> - Supporting code: `packages/lib/**`, `workers/core/src/db/auth-schema.ts`
>
> Source docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/005_oauth2-oidc-integration-guide.md`
> - `docs/009_plugin_first_auth_architecture.md`
> - `docs/011_oauth-postlogin-context-ui.md`
> - `docs/018_m2m-oauth-client-org-binding.md`
>
> Related docs:
>
> - `docs/019_content-api-gated-security-recommendations.md`
>
> Assumptions:
>
> - Cloudflare Workers + D1 + KV is the only deployed runtime.
> - The Worker is served behind Cloudflare with a custom domain (`id.quanghuy.dev`); the implicit `*.workers.dev` route exposure is treated as unknown unless disabled.
> - Edge-side WAF / rate-limit rules exist but are not committed to this repo and cannot be audited from the code alone.

## Table Of Contents

- [1. Purpose](#1-purpose)
- [2. Methodology And Scope](#2-methodology-and-scope)
- [3. System Summary](#3-system-summary)
- [4. Severity Rubric](#4-severity-rubric)
- [5. Findings Summary](#5-findings-summary)
- [6. Detailed Findings — workers/core](#6-detailed-findings--workerscore)
  - [6.1 Bootstrap bearer-token comparison is not constant-time](#61-bootstrap-bearer-token-comparison-is-not-constant-time)
  - [6.2 Bootstrap endpoint has no application-level rate limit and depends on un-audited edge rules](#62-bootstrap-endpoint-has-no-application-level-rate-limit-and-depends-on-un-audited-edge-rules)
  - [6.3 Better Auth rate limiting is disabled globally](#63-better-auth-rate-limiting-is-disabled-globally)
  - [6.4 JWT verification does not pin the expected signing algorithm](#64-jwt-verification-does-not-pin-the-expected-signing-algorithm)
  - [6.5 ipAddressHeaders trusts client-supplied `x-forwarded-for`](#65-ipaddressheaders-trusts-client-supplied-x-forwarded-for)
  - [6.6 Cross-subdomain session cookie shares trust with every sibling subdomain](#66-cross-subdomain-session-cookie-shares-trust-with-every-sibling-subdomain)
  - [6.7 Bootstrap check-then-act race window](#67-bootstrap-check-then-act-race-window)
  - [6.8 KV `getAndDelete` is not atomic — risk for one-time tokens](#68-kv-getanddelete-is-not-atomic--risk-for-one-time-tokens)
  - [6.9 `ID_BOOTSTRAP_TOKEN` has no minimum strength enforcement](#69-id_bootstrap_token-has-no-minimum-strength-enforcement)
  - [6.10 JWKS retired-key grace period is long with no per-`kid` revocation surface](#610-jwks-retired-key-grace-period-is-long-with-no-per-kid-revocation-surface)
  - [6.11 `verify-scoped-bearer` reads all JWKS rows on every protected call](#611-verify-scoped-bearer-reads-all-jwks-rows-on-every-protected-call)
- [7. Detailed Findings — workers/ui](#7-detailed-findings--workersui)
  - [7.1 Consent page displays attacker-controlled `client_name` from the URL](#71-consent-page-displays-attacker-controlled-client_name-from-the-url)
  - [7.2 Hosted UI pages lack `frame-ancestors` / clickjacking protection](#72-hosted-ui-pages-lack-frame-ancestors--clickjacking-protection)
  - [7.3 Client-side `router.push` accepts unvalidated server-supplied redirect URLs](#73-client-side-routerpush-accepts-unvalidated-server-supplied-redirect-urls)
  - [7.4 No CSP / HSTS / referrer-policy / permissions-policy headers](#74-no-csp--hsts--referrer-policy--permissions-policy-headers)
  - [7.5 `/admin/api` placeholder leaks developer-style metadata to unauthenticated callers](#75-adminapi-placeholder-leaks-developer-style-metadata-to-unauthenticated-callers)
  - [7.6 `fetchOrganizations` accepts unvalidated JSON shape](#76-fetchorganizations-accepts-unvalidated-json-shape)
  - [7.7 Login form enforces only client-side password length](#77-login-form-enforces-only-client-side-password-length)
- [8. Cross-Cutting Observations](#8-cross-cutting-observations)
- [9. Risks, Edge Cases, And Failure Modes](#9-risks-edge-cases-and-failure-modes)
- [10. Test And Verification Plan](#10-test-and-verification-plan)
- [11. Definition Of Done For Remediation](#11-definition-of-done-for-remediation)
- [12. Final Model](#12-final-model)

## 1. Purpose

Produce an implementation-grade record of security findings discovered while reading the `workers/core` and `workers/ui` source. The document is the audit handoff: each finding pins the exact file/line, names the threat, scores severity, and explains the recommended mitigation. Per the user's instruction, no implementation backlog or ticket section is included.

Non-goals:

- Penetration testing or dynamic verification (no requests issued against production).
- Auditing tests, packages outside `packages/lib`, migrations, or edge-side WAF rules (those are not in the repository view).
- Reviewing dependency CVEs at runtime — `pnpm advise` already surfaces dependency findings; treat them separately.

## 2. Methodology And Scope

The audit was a static read-through of source files under:

- `workers/core/src/**` — auth config, Better Auth wiring, JWKS verification, custom plugins, persistence companions, Hono mount, HTTP routes.
- `workers/ui/src/**` — Next.js (vinext) app router pages: `login`, `consent`, `select-authorization-context`, `admin`, `admin/api`, `admin/health`, `layout.tsx`, hooks, constants.
- `packages/lib/src/auth-fetch.ts` — the shared client used by all hosted UI pages.
- `workers/core/src/db/auth-schema.ts` — Better Auth Drizzle schema for context on stored secrets.
- `wrangler.jsonc` for both workers — routing, custom-domain mode, bindings.

For each file, the audit asked: (a) what attacker-controlled inputs reach this code, (b) what trust boundaries are crossed, (c) where authentication / authorization / cryptographic decisions are made, (d) what gets persisted or logged, and (e) what cross-origin / cross-subdomain / cross-tenant assumptions are made. Findings reflect what the code currently does, not what `docs/000_repo-architecture.md` says it should do.

## 3. System Summary

- `workers/core` runs Better Auth behind a Hono app. It mounts `/health`, `/api/bootstrap/admin`, `/api/auth/*` (the Better Auth handler), and the standards-defined `/.well-known/oauth-authorization-server` + `/.well-known/openid-configuration` discovery endpoints (with `/api/auth` aliases for the non-root issuer). JWKS lives at `/api/auth/jwks` via the BA JWT plugin.
- The OAuth/OIDC surface is provided by `@better-auth/oauth-provider`, extended with five repository-owned plugins: `oauth-m2m-bridge`, `oauth-scope-catalog`, `resource-server`, `principal-validation`, `oauth-client-picker`. Custom token claims are issued in `workers/core/src/auth/oauth-provider.ts::customAccessTokenClaims`.
- Passwords are hashed with `node:crypto.scrypt` (N=16384 in prod). Sessions are persisted in D1 and mirrored to KV via `kvSecondaryStorage`.
- `workers/ui` is a small Next.js (vinext) app deployed as a separate Worker. The login, consent, and select-authorization-context pages are client components that POST to same-origin `/api/auth/*` endpoints; `workers/ui` never imports Better Auth, Drizzle, or D1 types.
- The bootstrap route `POST /api/bootstrap/admin` exists to create the first platform admin before any session exists. It is gated by the `ID_BOOTSTRAP_TOKEN` environment variable and by `nativeAdminExists`.

## 4. Severity Rubric

| Severity | Definition |
| --- | --- |
| **High** | Direct path to account takeover, token forgery, or cross-tenant data exposure under realistic conditions. |
| **Medium** | Weakens an important defense or exposes a high-value target (consent prompt, bootstrap, session boundary); exploitation requires a plausible precondition. |
| **Low** | Defense-in-depth concern, information disclosure with no immediate path to abuse, or a hardening recommendation. |
| **Info** | Observation, hardening idea, or operational note. |

## 5. Findings Summary

| # | Area | Title | Severity |
| --- | --- | --- | --- |
| 6.1 | core/bootstrap | Bootstrap bearer-token comparison is not constant-time | Medium |
| 6.2 | core/bootstrap | Bootstrap endpoint has no application-level rate limit | Medium |
| 6.3 | core/auth | Better Auth rate limiting is disabled globally | Medium |
| 6.4 | core/jwt | JWT verification does not pin algorithm via `algorithms` allowlist | Medium |
| 6.5 | core/config | `ipAddressHeaders` trusts client-supplied `x-forwarded-for` | Medium |
| 6.6 | core/auth | Cross-subdomain session cookie scope | Medium |
| 6.7 | core/bootstrap | Check-then-act race in first-admin creation | Low |
| 6.8 | core/kv | `kvSecondaryStorage.getAndDelete` is not atomic | Medium |
| 6.9 | core/env | `ID_BOOTSTRAP_TOKEN` has no minimum-strength enforcement | Low |
| 6.10 | core/jwks | 30-day JWKS grace period with no per-`kid` revocation | Info |
| 6.11 | core/jwt | `verify-scoped-bearer` scans all JWKS rows per call | Info (perf, not security) |
| 7.1 | ui/consent | Consent prompt displays attacker-controlled `client_name` | Medium |
| 7.2 | ui/headers | Hosted UI pages lack clickjacking / `frame-ancestors` protection | Medium |
| 7.3 | ui/router | `router.push` accepts unvalidated redirect URLs from API responses | Low |
| 7.4 | ui/headers | Missing CSP / HSTS / referrer / permissions-policy headers | Medium |
| 7.5 | ui/admin | `/admin/api` placeholder leaks developer-style message | Low |
| 7.6 | ui/orgs | `fetchOrganizations` accepts unvalidated JSON | Low |
| 7.7 | ui/login | Client-side-only password-length validation | Info |

## 6. Detailed Findings — workers/core

### 6.1 Bootstrap bearer-token comparison is not constant-time

- File: `workers/core/src/http/routes/bootstrap.routes.ts:41`
- Code: `if (bearerToken(c.req.header("authorization") ?? null) !== expectedToken)`

The comparison uses JavaScript's `!==` string equality, which short-circuits on the first mismatched byte. An attacker who can issue many requests to `/api/bootstrap/admin` can, in principle, mount a timing-side-channel attack to recover `ID_BOOTSTRAP_TOKEN`.

Realistic exploitability is reduced because:

- The endpoint is one-shot: once `nativeAdminExists()` returns true, the entire route returns `403 bootstrap_already_completed`.
- Cloudflare adds network-level jitter that makes single-byte timing attacks difficult.

It is still cheap to fix and removes the question entirely.

Recommendation: replace the comparison with a constant-time check.

```ts
import { timingSafeEqual } from "node:crypto";
const provided = bearerToken(c.req.header("authorization") ?? null);
const a = Buffer.from(provided ?? "", "utf8");
const b = Buffer.from(expectedToken, "utf8");
if (a.length !== b.length || !timingSafeEqual(a, b)) {
  return c.json({ error: "unauthorized" }, HTTP_UNAUTHORIZED);
}
```

Severity: **Medium** — pre-bootstrap, before any admin exists, before any session protection exists.

### 6.2 Bootstrap endpoint has no application-level rate limit and depends on un-audited edge rules

- File: `workers/core/src/http/routes/bootstrap.routes.ts`
- Related: `workers/core/src/auth/get-auth.ts:88` (`rateLimit.enabled: false` — see 6.3)

`/api/bootstrap/admin` accepts an unbounded number of bearer-token attempts. The repository comment in `get-auth.ts` says "Edge rules own throttling," but no edge rule definition is checked into the repo for this route. If `ID_BOOTSTRAP_TOKEN` is set to a low-entropy value (see 6.9) and the operator forgets to add a WAF rule, the token can be brute-forced before the first admin is created.

Recommendation:

- Add an application-level rate limit specifically for `/api/bootstrap/admin` (e.g., a KV counter keyed by `cf-connecting-ip` with a small window — five attempts per IP per minute is sufficient since legitimate bootstrap happens once).
- Document the required WAF rule in `docs/007_cloudflare-deployment-runbooks.md`. Treat the rule as part of the deploy DoD, not an unwritten assumption.

Severity: **Medium**.

### 6.3 Better Auth rate limiting is disabled globally

- File: `workers/core/src/auth/get-auth.ts:88`
- Code:

```ts
rateLimit: {
  // Edge rules own throttling; BA counters would add per-request storage I/O.
  enabled: false,
},
```

The justification (avoiding per-request KV writes) is reasonable, but the result is that every Better Auth route — `sign-in/email`, `send-reset-password`, `verify-email`, `/oauth2/token`, `/oauth2/authorize`, the admin endpoints — relies on Cloudflare-side throttling. If the Worker is also reachable through the `*.workers.dev` URL (which is on by default unless disabled in `wrangler.jsonc` via `workers_dev: false`), an attacker can bypass the route-bound WAF rule entirely and credential-stuff at full Worker capacity.

Recommendations:

- Add `"workers_dev": false` to both `workers/core/wrangler.jsonc` and `workers/ui/wrangler.jsonc` (or verify it is set at the dashboard level).
- Either re-enable a minimal BA `rateLimit` for `sign-in/email`, `send-reset-password`, and `/oauth2/token`, or commit the corresponding Cloudflare WAF/Rate-Limit rules to a runbook so they are reviewed alongside code changes.

Severity: **Medium**.

### 6.4 JWT verification does not pin the expected signing algorithm

- File: `workers/core/src/auth/verify-scoped-bearer.ts:36-56`
- Code:

```ts
const cryptoKey = await importJWK(
  JSON.parse(key.publicKey) as JsonWebKey,
  key.alg ?? (typeof header.alg === "string" ? header.alg : "EdDSA"),
);
({ payload } = await jwtVerify(token, cryptoKey, {
  issuer: params.issuer,
  audience: params.audience,
}));
```

`jwtVerify` is called without an `algorithms` option. The algorithm is taken from the JWKS row (`key.alg`), and falls back to whatever the token's own `alg` header claims. Historically (RFC 7518), failing to pin `algorithms` is the root cause of the entire "alg confusion" family (`alg: "none"`, RS256↔HS256 substitution). `jose` does check key-vs-alg compatibility, so the symmetric/asymmetric confusion is largely blocked, but pinning the allowed algorithms is the recommended defense and costs nothing.

Recommendation:

```ts
const alg = (key.alg ?? "EdDSA");
({ payload } = await jwtVerify(token, cryptoKey, {
  issuer: params.issuer,
  audience: params.audience,
  algorithms: [alg],
}));
```

This is the only JWT verification path for the system-audienced internal endpoints (principal validation, OAuth client picker), so the blast radius for any future regression is large.

Severity: **Medium** (current behavior is most likely safe via `jose`'s key-type check, but the defense is missing).

### 6.5 `ipAddressHeaders` trusts client-supplied `x-forwarded-for`

- File: `workers/core/src/auth/get-auth.ts:83-86`
- Code:

```ts
ipAddress: {
  ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
},
```

Behind Cloudflare's custom-domain route, `cf-connecting-ip` is authoritative. `x-forwarded-for`, however, is client-supplied if the Worker is accessible through any non-CF path (workers.dev fallback, direct Origin Rule bypass, future routing change). Better Auth uses these for session metadata, abuse heuristics, and audit logs. An attacker that sets `x-forwarded-for: 8.8.8.8` causes spoofed source IPs to be persisted in `session.ipAddress` and reflected to ops dashboards.

Recommendations:

- Drop `x-forwarded-for` from the list. Cloudflare always sets `cf-connecting-ip`; if it is missing the request did not come from the CF edge and should not be trusted at all.
- Combine with the `"workers_dev": false` recommendation from 6.3.

Severity: **Medium** (depends on the workers.dev exposure; without it, this is Low).

### 6.6 Cross-subdomain session cookie shares trust with every sibling subdomain

- File: `workers/core/src/auth/get-auth.ts:77-82`
- Production var: `BETTER_AUTH_COOKIE_DOMAIN = ".quanghuy.dev"` (`workers/core/wrangler.jsonc:30`).

The session cookie is scoped to `.quanghuy.dev`, which means every subdomain under `quanghuy.dev` can read it (assuming `SameSite` is the BA default and `Domain` is set). A vulnerable application on `*.quanghuy.dev` (XSS, dependent-confusion subdomain takeover, leftover GitHub Pages CNAME, leaked DNS record) can exfiltrate the active id session.

This is a documented design choice for cross-subdomain SSO and is required for the platform model. Still, the trade-off should be made explicit in `docs/000_repo-architecture.md` and operations should:

- Enumerate every CNAME under `quanghuy.dev` quarterly and verify ownership.
- Make sure the BA cookie is `HttpOnly` + `Secure` + `SameSite=Lax` (defaults in BA, verify against current version).
- Treat any new subdomain hosting third-party content as a session-bearing surface.

Severity: **Medium** (operational, not a code bug — but worth documenting).

### 6.7 Bootstrap check-then-act race window

- File: `workers/core/src/http/routes/bootstrap.routes.ts:45-72`

`nativeAdminExists(env.DB)` is read, then the request body is parsed, then `auth.api.createUser(...)` runs. Two concurrent requests with the same valid `ID_BOOTSTRAP_TOKEN` can both pass the existence check before either commits a user row, resulting in two `role = "admin"` users being created.

Mitigations are partial:

- The bootstrap token is only known by the operator, so a malicious attacker would need both the token and exact concurrent requests.
- Better Auth's user email column is unique, so duplicate emails are rejected by D1. Different emails are not.

Recommendation: after creating the user, re-check `nativeAdminExists` count > 1 and either roll back the second insert or surface a `409 conflict`. Alternatively, gate the entire handler with a KV lock (`bootstrap:in-progress`) with a short TTL.

Severity: **Low**.

### 6.8 KV `getAndDelete` is not atomic — risk for one-time tokens

- File: `workers/core/src/auth/adapters/secondary-storage.ts:12-16`
- Code:

```ts
getAndDelete: async (key) => {
  const value = await kv.get(key);
  await kv.delete(key);
  return value;
},
```

Cloudflare KV does not support compare-and-swap. Two concurrent reads of the same one-time token (e.g., OAuth authorization code, password-reset token, email-verification token if BA stores them via secondary storage) will both observe the value and the delete will run after both reads. The protocol assumes single-use; any consumer that double-fetches in a race window has effectively achieved replay.

Mitigations already in place:

- Most OAuth state is persisted to D1, not KV, in this BA wiring (`storeSessionInDatabase: true`).
- KV usage in this codebase is dominated by long-lived caches (`id-oauth-scopes:*`, `id-resource-servers:audiences`) and short-lived selection state (`id-oauth-context:<sessionId>`), not single-use OTPs.

Recommendation:

- Document explicitly which Better Auth flows fall back to `secondaryStorage` for single-use tokens. If any flow does, move that flow to D1 and accept the extra latency — KV cannot enforce one-shot semantics.
- For the OAuth authorization-code grant, verify BA `oauth-provider` stores codes in D1 (it does in 1.6.11; pin in tests so a future upgrade does not regress).

Severity: **Medium** (potential, not confirmed exploit path).

### 6.9 `ID_BOOTSTRAP_TOKEN` has no minimum strength enforcement

- File: `workers/core/src/config/env.ts:7` (declaration only); `workers/core/src/http/routes/bootstrap.routes.ts:37-43` (only checks presence).

The token is treated as opaque. There is no minimum length, alphabet, or entropy check. Combined with finding 6.2 (no app-level rate limit on the bootstrap route), a weak operator-chosen token is brute-forceable.

Recommendation: at handler entry, reject the request with `503` and log a warning if `expectedToken.length < 32` or if it is in a hard-coded blacklist (e.g., literal "changeme"). Document the requirement in `docs/007_cloudflare-deployment-runbooks.md`.

Severity: **Low**.

### 6.10 JWKS retired-key grace period is long with no per-`kid` revocation surface

- File: `workers/core/src/auth/config.ts:14-17` — `JWKS_GRACE_PERIOD_SECONDS = 2_592_000` (30 days).

If a private key is compromised, the system has no way to forcibly revoke a `kid` short of manually deleting the row from D1. Resource servers cache JWKS responses for hours-to-days, so even a manual deletion leaves a window. This is policy, not a bug, but the 30-day grace is on the long end.

Recommendations:

- Shorten the grace period (7-14 days is the typical industry value for short-lived access tokens with a 15-minute lifetime; the access token is 900 s, see `OAUTH_ACCESS_TOKEN_EXPIRES_SECONDS`).
- Add a documented operator procedure for emergency rotation: delete the `jwks` row, invalidate KV cache, force a roll. Track it in `docs/007_cloudflare-deployment-runbooks.md`.

Severity: **Info / Hardening**.

### 6.11 `verify-scoped-bearer` scans all JWKS rows per call

- File: `workers/core/src/auth/verify-scoped-bearer.ts:40-42`

`adapter.findMany({ model: "jwks" })` returns every key and then a `.find` linearly matches `kid`. With a 30-day grace period (6.10) and 1-day rotation, JWKS row count is small (~30), so the perf cost is negligible. This is noted as a maintainability item, not a security issue: a future per-`kid` lookup helper would avoid scanning.

Severity: **Info**.

## 7. Detailed Findings — workers/ui

### 7.1 Consent page displays attacker-controlled `client_name` from the URL

- File: `workers/ui/src/app/consent/consent-form.tsx:14-21,55`
- Code:

```ts
function parseClientInfo(oauthQuery: string): ClientInfo {
  if (!oauthQuery) return { name: "an application", scopes: [] };
  const search = new URLSearchParams(oauthQuery);
  return {
    name: search.get("client_name") ?? search.get("client_id") ?? "an application",
    scopes: (search.get("scope") ?? "").split(" ").filter(Boolean),
  };
}
...
<strong>{clientInfo.name}</strong> is requesting permission to access your account.
```

The consent UI takes the displayed client name from the page's URL query string. `client_name` is not a parameter validated by the OAuth `/authorize` endpoint; an attacker can send a user to:

```
https://id.quanghuy.dev/consent?client_id=evil&client_name=Acme%20Bank&scope=content:read
```

and the prompt will read **"Acme Bank is requesting permission to access your account"** even though the consent that would actually be granted (after Continue) is for `evil`. This is a classic consent-screen spoofing pattern; the same pattern is at `workers/ui/src/app/select-authorization-context/select-context-form.tsx` via `useOauthRequestDescription` (`workers/ui/src/lib/oauth-query.ts:21-25`).

React's default escaping prevents this from being XSS, but the social-engineering value is the entire point of a consent screen.

Recommendation: the consent prompt's text must come from a server-resolved client-metadata fetch keyed by the BA-trusted authorization-request id, not from URL parameters. The hosted UI is same-origin with the core worker, so either:

- Have the core worker render the consent page server-side (with the trusted `client_name` resolved from `oauthClient` row), or
- Add a `GET /api/auth/oauth2/consent-context` (or equivalent BA endpoint) that the consent page calls to fetch the validated `{ clientName, scopes, redirectUri }`. Reject any consent submission where the URL `client_id` does not match the server-derived authorization request.

The select-authorization-context page should be remediated the same way.

Severity: **Medium**.

### 7.2 Hosted UI pages lack `frame-ancestors` / clickjacking protection

- File: `workers/ui/src/app/layout.tsx`
- Symptom: No `Content-Security-Policy: frame-ancestors 'none'` and no `X-Frame-Options: DENY` is emitted for `/login`, `/consent`, `/select-authorization-context`, or `/admin/*`.

The consent page is the canonical clickjacking target. An attacker who can serve a page on any origin can iframe `https://id.quanghuy.dev/consent?...` (with a valid pre-existing session) and overlay a UI that tricks the victim into clicking "Allow". Because cookies are cross-subdomain (`.quanghuy.dev`), even framing from a sibling subdomain works.

Recommendation: configure vinext / the UI worker to set on every HTML response:

- `Content-Security-Policy: frame-ancestors 'none'` (or `'self'` if same-origin embedding is required).
- `X-Frame-Options: DENY` for legacy browsers.

Apply via a vinext middleware/edge response header or, equivalently, via Cloudflare's "Transform Rules → Response Headers" on the UI route.

Severity: **Medium** — for consent and select-authorization-context specifically. The login page is also worth covering.

### 7.3 Client-side `router.push` accepts unvalidated server-supplied redirect URLs

- Files:
  - `workers/ui/src/app/login/login-form.tsx:60-65`
  - `workers/ui/src/app/consent/consent-form.tsx:40-44`
  - `workers/ui/src/app/select-authorization-context/select-context-form.tsx:54-58`
- Code (login):

```ts
if (body.redirect) {
  router.push((body.url || body.redirectURL || "/") as string);
  return;
}
if (body.url) {
  router.push(body.url as string);
  return;
}
```

`router.push` is called with whatever URL the same-origin `/api/auth/*` response provides, with no allowlist check. Under nominal operation this URL is produced by Better Auth / the OAuth provider and is safe. But:

- If a misconfigured OAuth client registers an over-broad `redirect_uri` (the OAuth provider plugin enforces matching, but operator misconfiguration is the threat), the resulting `redirect_uri` is then trusted by the hosted UI for navigation.
- If a future regression in the BA response shape ever lets an attacker influence `body.url` (e.g., via an open redirector inside BA), the UI will obey.

This is a defense-in-depth concern, not a confirmed bug.

Recommendation: before calling `router.push`, parse the URL and require either same-origin, or origin equal to the OAuth client's pre-registered redirect URI (the hosted UI does not have that allowlist locally — keeping the redirect strictly same-origin is the safe default for the login page, while the consent flow naturally needs cross-origin for the client redirect URI and should rely on the server-side validation already done by BA).

Severity: **Low**.

### 7.4 No CSP / HSTS / referrer-policy / permissions-policy headers

- File: `workers/ui/src/app/layout.tsx` (no `headers()` export), `workers/ui/next.config.ts` (no `headers()` config), `workers/ui/wrangler.jsonc` (no response-header transform).

Independent of clickjacking (7.2), the UI worker emits none of:

- `Content-Security-Policy` — would block injected inline scripts even if React XSS regressed.
- `Strict-Transport-Security` — Cloudflare can set this at the edge, but the application does not assert it.
- `Referrer-Policy: no-referrer` (or `strict-origin-when-cross-origin`) — login and consent pages can leak referrer to the OAuth client's `redirect_uri`.
- `Permissions-Policy` — disables sensors/camera/etc. on auth surfaces.

Recommendation: set these for `/login`, `/consent`, `/select-authorization-context`, `/admin/*` either via a vinext route handler that wraps the response, or via Cloudflare Transform Rules. A reasonable starting CSP:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
frame-ancestors 'none';
form-action 'self' https://*.quanghuy.dev;
base-uri 'self';
```

Severity: **Medium** (cumulative: each header is Low individually).

### 7.5 `/admin/api` placeholder leaks developer-style metadata to unauthenticated callers

- File: `workers/ui/src/app/admin/api/route.ts`
- Response: `{ ok: true, service: "id-ui", message: "Admin BFF placeholder. Implement UI-owned endpoints here when they need server-side shaping." }`

Anyone hitting `https://id.quanghuy.dev/admin/api` (no auth required) sees the placeholder message. This is information disclosure, signaling "in-development backend here," which attackers use to prioritize targets.

Recommendation: either delete the route until there is a real BFF, or return a generic `404` (`Response.json(..., { status: 404 })`) until then. If kept, gate behind an admin session and remove the developer-hint copy.

Severity: **Low**.

### 7.6 `fetchOrganizations` accepts unvalidated JSON

- File: `workers/ui/src/app/select-authorization-context/select-context-form.tsx:15-24`
- Code:

```ts
const data: unknown = await res.json();
if (!Array.isArray(data)) return [];
return data as Organization[];
```

The `as Organization[]` cast is unchecked. If the BA `organization/list` endpoint ever returns objects whose `id` or `name` are not strings (or `null`), the UI will render undefined values into `RadioGroup` and possibly send `workspace:undefined` to the server. React's escaping prevents XSS, but the input still flows into a cookie-equivalent selection key.

Recommendation: validate each element with a Zod schema (`z.object({ id: z.string(), name: z.string() }).array()`) before mapping. Reject the request silently and fall back to direct-share if validation fails.

Severity: **Low**.

### 7.7 Login form enforces only client-side password length

- File: `workers/ui/src/app/login/login-form.tsx:22-26`
- Code: `if (value.length < 8) return "Password must be at least 8 characters";`

Client-side validation never enforces a real boundary. Better Auth performs server-side checks, but the bootstrap path uses `MIN_BOOTSTRAP_PASSWORD_LENGTH = 12` while normal sign-up/sign-in is governed by BA defaults. The mismatch and the absence of any explicit min-length on `emailAndPassword` configuration (`get-auth.ts:100-110`) should be made explicit — either pin a `password.minLength` on BA or document the BA default and accept it.

Recommendation: add `password: { hash, verify, minLength: 12 }` (BA supports this) so that the constant matches the bootstrap requirement and the policy is enforced server-side.

Severity: **Info** (hardening / policy alignment, not a vulnerability).

## 8. Cross-Cutting Observations

- **Logging hygiene is good.** `workers/core/src/shared/log-redaction.ts` defines a redaction list including `access_token`, `authorization`, `code`, `client_secret`, `id_token`, `refresh_token`, `token`. There is no evidence in the inspected code that any logger writes raw secrets. If new logging is added in any plugin, route it through `structuredLog` so the redaction is applied.
- **No raw-HTML injection on the React side.** All UI rendering uses React expressions; no raw-HTML escape hatch was found in `workers/ui/src`. Email rendering escapes via `escapeHtml` (`workers/core/src/auth/adapters/auth-email-render.ts:17`) — the helper is correct (ampersand first), URLs are escaped before interpolation.
- **SQL safety is good.** All raw D1 `.prepare()` calls in inspected files use `?`-parameter binding (`bootstrap-store.ts`, `audiences.ts`, `scopes.ts`, `grants.ts`, `authorization-context.ts`). No string interpolation into SQL was found.
- **Trust boundaries between plugins and worker:** `verify-scoped-bearer` is the single bearer-token verifier shared by `principal-validation` and `oauth-client-picker`. Centralization is good; pin algorithm allowlist (6.4) and the entire surface is hardened in one place.
- **Bootstrap is fail-closed when token is missing.** `if (!expectedToken) return c.json({ error: "bootstrap_disabled" }, 403)`. This is the correct default.
- **Session cookie domain.** Verify (outside this review's scope) that the BA session cookie still emits `HttpOnly`, `Secure`, and `SameSite=Lax` after the `crossSubDomainCookies` config is applied. None of those are explicitly set in `get-auth.ts`, so they rely on BA's defaults.

## 9. Risks, Edge Cases, And Failure Modes

- **Operator forgets to set `workers_dev: false`.** Both 6.3 and 6.5 escalate from Medium to High in that environment.
- **Operator reuses `ID_BOOTSTRAP_TOKEN` from documentation/example.** 6.9 + 6.2 combine into a practical compromise path against a fresh install.
- **Phishing campaign uses `consent?client_name=Acme%20Bank&...`.** 7.1 is the lever — without server-side resolution, the UI lies to the user.
- **Sibling subdomain takeover.** 6.6 means any takeover of `*.quanghuy.dev` is a session-stealing primitive.
- **JWKS row deleted accidentally.** 6.10 — no documented recovery procedure; the system fails-closed (verification rejects all tokens with that `kid`), so user impact is "everyone has to refresh." Operator must invalidate KV `id-resource-servers:audiences` and `id-oauth-scopes:enabled` to avoid stale catalog while issuing a new key.
- **Concurrent bootstrap requests.** 6.7 — two admin rows; recoverable via DB cleanup but should not be possible.
- **OAuth code reuse.** 6.8 — depends on whether BA stores codes in KV or D1; verify in tests.

## 10. Test And Verification Plan

The audit was static. Each finding above should be validated by an integration test or a manual probe before it is closed:

- 6.1 — Unit test asserting `bearerToken` comparison is constant-time after fix (test by replacing comparator and asserting the implementation does not contain `!==` for the token).
- 6.2 — Integration test: 100 sequential POSTs to `/api/bootstrap/admin` with wrong token. Without rate limit, all return `401` in roughly equal time; with the fix, the Nth request returns `429`.
- 6.3 — Integration test: 50 sign-in attempts with wrong password against `/api/auth/sign-in/email`. Expect 429 after a small threshold once BA rate limit is re-enabled.
- 6.4 — Test: forge a JWT with `alg: "HS256"` signed by HMAC over the JWKS public key bytes; verify the call rejects with UNAUTHORIZED. Add to `workers/core/tests/auth/principal-validation.test.ts`.
- 6.5 — Manual: from a non-CF origin (curl direct to workers.dev URL), POST with `x-forwarded-for: 8.8.8.8`; confirm `session.ipAddress` is not `8.8.8.8` after fix.
- 6.6 — Manual: enumerate DNS records under `quanghuy.dev`; verify each one is currently owned.
- 6.7 — Integration test: fire two simultaneous bootstrap requests; assert exactly one succeeds.
- 6.8 — Test: spin up two `getAndDelete` calls in parallel against the same key; assert exactly one returns a value (will fail today on real KV).
- 6.9 — Unit test asserting that bootstrap handler returns 503 when `ID_BOOTSTRAP_TOKEN.length < 32` after the policy is added.
- 6.10 — Operational: write the rotation runbook.
- 7.1 — Manual probe: visit `/consent?client_name=Acme%20Bank&client_id=actually-something-else&scope=openid` and confirm the prompt no longer uses `client_name` after the fix.
- 7.2 — Manual: `curl -I https://id.quanghuy.dev/consent` and assert `content-security-policy: frame-ancestors 'none'` (or `x-frame-options: DENY`).
- 7.3 — Unit test: assert `router.push` is only called with same-origin URLs on the login flow.
- 7.4 — Manual: `curl -I` against each hosted UI page; assert presence of CSP/HSTS/Referrer-Policy headers.
- 7.5 — Manual: `curl https://id.quanghuy.dev/admin/api` returns 404 (or auth-gated) after fix.
- 7.6 — Unit test: mocked BA returns malformed `[{ id: null }]` and the UI falls back to direct-share without rendering `undefined`.
- 7.7 — Unit test: POST to `/api/auth/sign-up/email` with 8-char password is rejected once `password.minLength = 12` is set.

## 11. Definition Of Done For Remediation

A future remediation effort is "done" only when:

- Each finding above is either fixed in code, mitigated by a documented operational control, or formally accepted with rationale in this document's appendix (or a successor doc).
- The Cloudflare WAF / Rate-Limit / Transform-Rule configuration referenced by 6.2, 6.3, 6.5, 7.2, and 7.4 is checked into the repo (Terraform, `wrangler` rules file, or a runbook with exact JSON), not held in tribal knowledge.
- `pnpm check` and `pnpm test` continue to pass.
- New tests cover 6.4, 6.7, 7.1, 7.6, 7.7 at minimum.
- `docs/007_cloudflare-deployment-runbooks.md` is updated for 6.2, 6.3, 6.5, 6.9, 6.10.
- `docs/020_workers-security-findings.md` (this doc) is updated to mark closed findings with the closing PR or commit.

## 12. Final Model

The system's standards-compliant OAuth / OIDC core is reasonably well-built: JWT verification, JWKS rotation, scope catalog enforcement, M2M binding, and tenant isolation are all explicit and tested. The most pressing risks live in the periphery:

- **Consent UX is spoofable.** The single highest-impact UX finding is 7.1 — display text that should be authoritative is in fact attacker-controlled.
- **Bootstrap is the soft spot of the runtime.** Findings 6.1, 6.2, 6.7, and 6.9 cluster around the first-admin route; together they describe a "set up a fresh tenant carefully" surface that is currently easier to misuse than it should be.
- **Throttling is implicit.** Findings 6.3 and 6.5 both rely on a Cloudflare edge configuration that the code claims exists but the repository does not enforce. Either commit the rules or add the application-level fallback.
- **Hosted UI hardening is missing.** Findings 7.2 and 7.4 are the standard browser-defense headers that every auth UI is expected to set; their absence is currently the simplest hardening win in the codebase.
- **Cookie scope is policy, not a bug.** Finding 6.6 is real and the trade-off is intentional; the document should make that explicit so future contributors do not narrow it accidentally and break SSO, and so operations know which sibling subdomains are session-trusted.

Fix the four Medium findings touching the consent, bootstrap, JWT pinning, and KV-atomicity items first; everything else is hardening that compounds with them.
