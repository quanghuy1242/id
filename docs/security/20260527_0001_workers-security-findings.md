# 20260527_0001 — Security Audit: workers/core + workers/ui

> Date: 2026-05-27
> Register baseline: — (first audit; establishes SEC-001–018)
> Scope: `workers/core`, `workers/ui`, `packages/lib`
> Excluded: tests, packages outside `lib`, migrations, edge-side WAF rules

## Files Read

- `workers/core/src/auth/get-auth.ts` — Better Auth config, rate limit, cookie domain, IP headers
- `workers/core/src/auth/verify-scoped-bearer.ts` — JWT verification, JWKS lookup
- `workers/core/src/auth/adapters/secondary-storage.ts` — KV `getAndDelete`
- `workers/core/src/auth/config.ts` — JWKS grace period constant
- `workers/core/src/auth/oauth-provider.ts` — custom access token claims
- `workers/core/src/http/routes/bootstrap.routes.ts` — first-admin creation
- `workers/core/src/config/env.ts` — environment variable declarations
- `workers/core/src/db/auth-schema.ts` — Better Auth Drizzle schema
- `workers/core/src/shared/log-redaction.ts` — logging redaction list
- `workers/ui/src/app/login/login-form.tsx` — login form, redirect handling
- `workers/ui/src/app/consent/consent-form.tsx` — consent display, URL parameter parsing
- `workers/ui/src/app/select-authorization-context/select-context-form.tsx` — context selection
- `workers/ui/src/app/admin/api/route.ts` — admin BFF placeholder
- `workers/ui/src/app/layout.tsx` — response headers
- `workers/ui/src/lib/oauth-query.ts` — OAuth query param helpers
- `packages/lib/src/auth-fetch.ts` — shared auth client
- `workers/core/wrangler.jsonc` — routing, bindings, cookie domain var
- `workers/ui/wrangler.jsonc` — routing, bindings

## New Findings

| ID      | Title                                              | Severity |
|---------|----------------------------------------------------|----------|
| SEC-001 | Bootstrap bearer comparison is not constant-time   | Medium   |
| SEC-002 | Bootstrap endpoint has no app-level rate limit     | Medium   |
| SEC-003 | Better Auth rate limiting disabled globally        | Medium   |
| SEC-004 | JWT verification does not pin signing algorithm    | Medium   |
| SEC-005 | `ipAddressHeaders` trusts client-supplied XFF      | Medium   |
| SEC-006 | Cross-subdomain session cookie scope               | Medium   |
| SEC-007 | Bootstrap check-then-act race window               | Low      |
| SEC-008 | KV `getAndDelete` is not atomic                    | Medium   |
| SEC-009 | `ID_BOOTSTRAP_TOKEN` has no minimum-strength check | Low      |
| SEC-010 | JWKS 30-day grace period, no per-`kid` revocation  | Info     |
| SEC-011 | `verify-scoped-bearer` scans all JWKS rows per call| Info     |
| SEC-012 | Consent displays attacker-controlled `client_name` | Medium   |
| SEC-013 | Hosted UI pages lack `frame-ancestors` protection  | Medium   |
| SEC-014 | `router.push` accepts unvalidated redirect URLs    | Low      |
| SEC-015 | Missing CSP / HSTS / referrer / permissions-policy | Medium   |
| SEC-016 | `/admin/api` placeholder leaks developer metadata  | Low      |
| SEC-017 | `fetchOrganizations` accepts unvalidated JSON shape | Low      |
| SEC-018 | Login enforces only client-side password length    | Info     |

## Detailed Findings — workers/core

### SEC-001 — Bootstrap bearer comparison is not constant-time

- **File**: `workers/core/src/http/routes/bootstrap.routes.ts:41`
- **Severity**: Medium

`bearerToken(...) !== expectedToken` uses JavaScript's short-circuiting string equality. An attacker issuing many requests before the first admin exists can in principle recover `ID_BOOTSTRAP_TOKEN` via a timing side-channel. Network jitter from Cloudflare reduces practical exploitability, and the endpoint becomes a no-op once bootstrap completes — but the fix is trivial.

**Recommendation**:

```ts
import { timingSafeEqual } from "node:crypto";
const provided = bearerToken(c.req.header("authorization") ?? null);
const a = Buffer.from(provided ?? "", "utf8");
const b = Buffer.from(expectedToken, "utf8");
if (a.length !== b.length || !timingSafeEqual(a, b)) {
  return c.json({ error: "unauthorized" }, HTTP_UNAUTHORIZED);
}
```

---

### SEC-002 — Bootstrap endpoint has no app-level rate limit

- **File**: `workers/core/src/http/routes/bootstrap.routes.ts`
- **Severity**: Medium

`/api/bootstrap/admin` accepts unbounded bearer-token attempts. The codebase delegates throttling to edge rules, but no WAF rule for this route is committed to the repo. Combined with SEC-009 (weak token), a fresh install with a low-entropy token is brute-forceable before the first admin is created.

**Recommendation**: Add a KV counter keyed by `cf-connecting-ip` — five attempts per IP per minute is sufficient since legitimate bootstrap happens once. Document the required WAF rule in `docs/007_cloudflare-deployment-runbooks.md` as a deploy prerequisite.

---

### SEC-003 — Better Auth rate limiting disabled globally

- **File**: `workers/core/src/auth/get-auth.ts:88`
- **Severity**: Medium

```ts
rateLimit: { enabled: false }
```

Every Better Auth route — `sign-in/email`, `send-reset-password`, `/oauth2/token`, `/oauth2/authorize`, admin endpoints — relies solely on Cloudflare-side throttling. If the Worker is reachable via the `*.workers.dev` URL (on by default unless `workers_dev: false`), any route-bound WAF rule is bypassed entirely.

**Recommendation**: Set `"workers_dev": false` in both `wrangler.jsonc` files. Either re-enable a minimal BA `rateLimit` for `sign-in/email`, `send-reset-password`, and `/oauth2/token`, or commit the Cloudflare WAF rules to a runbook so they are reviewed alongside code changes.

---

### SEC-004 — JWT verification does not pin signing algorithm

- **File**: `workers/core/src/auth/verify-scoped-bearer.ts:36-56`
- **Severity**: Medium

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

`jwtVerify` is called without an `algorithms` option; the algorithm falls back to whatever the token's own `alg` header claims. `jose` blocks symmetric/asymmetric confusion via key-type checking, but pinning the allowed algorithms is the standard defense and costs nothing. This is the single JWT verification path for all system-audienced internal endpoints (`principal-validation`, `oauth-client-picker`).

**Recommendation**:

```ts
const alg = key.alg ?? "EdDSA";
({ payload } = await jwtVerify(token, cryptoKey, {
  issuer: params.issuer,
  audience: params.audience,
  algorithms: [alg],
}));
```

---

### SEC-005 — `ipAddressHeaders` trusts client-supplied `x-forwarded-for`

- **File**: `workers/core/src/auth/get-auth.ts:83-86`
- **Severity**: Medium

```ts
ipAddress: {
  ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
},
```

Behind Cloudflare, `cf-connecting-ip` is authoritative. `x-forwarded-for` is client-supplied on any non-CF path (workers.dev fallback, direct origin bypass). A spoofed `x-forwarded-for: 8.8.8.8` persists into `session.ipAddress` and ops audit logs.

**Recommendation**: Remove `x-forwarded-for` from the list. Combine with the `workers_dev: false` fix from SEC-003 — without that fix, this finding escalates to High.

---

### SEC-006 — Cross-subdomain session cookie scope

- **File**: `workers/core/src/auth/get-auth.ts:77-82`
- **Production var**: `BETTER_AUTH_COOKIE_DOMAIN = ".quanghuy.dev"` (`workers/core/wrangler.jsonc:30`)
- **Severity**: Medium

The session cookie is scoped to `.quanghuy.dev`, meaning every subdomain can read it. This is a deliberate design decision for cross-subdomain SSO — narrowing the domain would break the platform model. The trade-off needs to be explicit in `docs/000_repo-architecture.md` so future contributors don't accidentally narrow it, and so operations knows which sibling subdomains are session-trusted surfaces.

**Recommendation**: Document the cookie domain trade-off in `docs/000_repo-architecture.md`. Enumerate CNAMEs under `quanghuy.dev` quarterly. Verify the BA cookie emits `HttpOnly`, `Secure`, and `SameSite=Lax` with `crossSubDomainCookies` applied (these rely on BA defaults and are not explicitly set in `get-auth.ts`).

---

### SEC-007 — Bootstrap check-then-act race window

- **File**: `workers/core/src/http/routes/bootstrap.routes.ts:45-72`
- **Severity**: Low

`nativeAdminExists(env.DB)` is read, the request body is parsed, then `auth.api.createUser(...)` runs. Two concurrent requests with the same valid token can both pass the existence check before either commits, creating two `role = "admin"` rows. The DB unique constraint blocks duplicate emails but two different admin emails would both succeed.

**Recommendation**: After creating the user, re-check `nativeAdminExists` and surface a `409` if count > 1. Alternatively, gate the handler with a KV lock (`bootstrap:in-progress`) with a short TTL.

---

### SEC-008 — KV `getAndDelete` is not atomic

- **File**: `workers/core/src/auth/adapters/secondary-storage.ts:12-16`
- **Severity**: Medium

```ts
getAndDelete: async (key) => {
  const value = await kv.get(key);
  await kv.delete(key);
  return value;
},
```

Cloudflare KV has no compare-and-swap. Two concurrent reads of the same one-time token both observe the value before the delete runs, enabling replay. Most OAuth state is persisted to D1 in this wiring (`storeSessionInDatabase: true`), so confirmed exploit paths are limited — but the gap is real.

**Recommendation**: Document which Better Auth flows fall back to `secondaryStorage` for single-use tokens. For any that do, move that flow to D1. For the authorization-code grant specifically, verify in tests that BA stores codes in D1 (true in 1.6.11) so a future upgrade cannot silently regress to KV.

---

### SEC-009 — `ID_BOOTSTRAP_TOKEN` has no minimum-strength check

- **File**: `workers/core/src/config/env.ts:7` (declaration); `workers/core/src/http/routes/bootstrap.routes.ts:37-43` (checks presence only)
- **Severity**: Low

The bootstrap handler verifies the token is present but applies no minimum length, entropy, or blacklist check. Combined with SEC-002, a weak operator-chosen token on a fresh install is brute-forceable.

**Recommendation**: At handler entry, return `503` if `expectedToken.length < 32` or if it matches a known weak value. Document the minimum-strength requirement in `docs/007_cloudflare-deployment-runbooks.md`.

---

### SEC-010 — JWKS 30-day grace period, no per-`kid` revocation

- **File**: `workers/core/src/auth/config.ts:14-17` — `JWKS_GRACE_PERIOD_SECONDS = 2_592_000`
- **Severity**: Info

If a private key is compromised, manual D1 row deletion is the only revocation path. Resource servers cache JWKS responses for hours to days, leaving a window even after deletion. The 30-day grace period is long relative to the 15-minute access token lifetime (`OAUTH_ACCESS_TOKEN_EXPIRES_SECONDS = 900`).

**Recommendation**: Shorten grace period to 7–14 days. Add a documented emergency rotation procedure to `docs/007_cloudflare-deployment-runbooks.md`: delete the `jwks` row, invalidate KV caches for `id-resource-servers:audiences` and `id-oauth-scopes:enabled`, wait for a new key to be issued.

---

### SEC-011 — `verify-scoped-bearer` scans all JWKS rows per call

- **File**: `workers/core/src/auth/verify-scoped-bearer.ts:40-42`
- **Severity**: Info

`adapter.findMany({ model: "jwks" })` returns all keys and a `.find` matches by `kid`. With a 30-day grace and 1-day rotation the row count is ~30, so the cost is negligible today. Noted as a future maintainability item — a per-`kid` lookup would avoid the full scan.

---

## Detailed Findings — workers/ui

### SEC-012 — Consent displays attacker-controlled `client_name`

- **File**: `workers/ui/src/app/consent/consent-form.tsx:14-21,55`
- **Severity**: Medium

```ts
name: search.get("client_name") ?? search.get("client_id") ?? "an application",
```

The consent prompt's displayed name comes directly from the URL query string. An attacker can craft `?client_id=evil&client_name=Acme+Bank` and the prompt reads "**Acme Bank** is requesting permission to access your account" while any granted consent goes to `evil`. React's escaping prevents XSS; the social-engineering value is the point. The same pattern exists in `select-authorization-context` via `useOauthRequestDescription` (`workers/ui/src/lib/oauth-query.ts:21-25`).

**Recommendation**: Resolve display values server-side from the BA-trusted authorization-request record, not from URL params. Add a `GET /api/auth/oauth2/consent-context` endpoint that returns `{ clientName, scopes, redirectUri }` keyed by the server-side auth request id. Apply the same fix to the select-authorization-context page.

---

### SEC-013 — Hosted UI pages lack `frame-ancestors` protection

- **File**: `workers/ui/src/app/layout.tsx`
- **Severity**: Medium

No `Content-Security-Policy: frame-ancestors 'none'` or `X-Frame-Options: DENY` is emitted for any hosted UI page. An attacker can iframe the consent page (which reads the `.quanghuy.dev`-scoped session cookie from SEC-006) and overlay UI to trick the victim into clicking Allow.

**Recommendation**: Emit on every HTML response via vinext middleware or Cloudflare Transform Rules:
- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Frame-Options: DENY` (legacy browsers)

---

### SEC-014 — `router.push` accepts unvalidated server-supplied redirect URLs

- **Files**: `workers/ui/src/app/login/login-form.tsx:60-65`, `consent/consent-form.tsx:40-44`, `select-authorization-context/select-context-form.tsx:54-58`
- **Severity**: Low

`router.push(body.url)` is called on whatever URL the `/api/auth/*` response provides with no allowlist check. Under nominal operation BA produces safe URLs. If a future regression in BA's response shape lets an attacker influence `body.url`, the UI obeys.

**Recommendation**: For the login flow, parse the URL and require same-origin before calling `router.push`. The consent flow legitimately needs cross-origin (the client's redirect URI) and should rely on BA server-side validation already in place.

---

### SEC-015 — Missing CSP / HSTS / referrer-policy / permissions-policy

- **File**: `workers/ui/src/app/layout.tsx`, `workers/ui/next.config.ts`, `workers/ui/wrangler.jsonc`
- **Severity**: Medium

The UI worker emits none of the standard browser-defense headers. A reasonable starting CSP for auth surfaces:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
frame-ancestors 'none';
form-action 'self' https://*.quanghuy.dev;
base-uri 'self';
```

**Recommendation**: Set these for `/login`, `/consent`, `/select-authorization-context`, `/admin/*` via a vinext route handler or Cloudflare Transform Rules.

---

### SEC-016 — `/admin/api` placeholder leaks developer metadata

- **File**: `workers/ui/src/app/admin/api/route.ts`
- **Severity**: Low

`{ ok: true, service: "id-ui", message: "Admin BFF placeholder. Implement UI-owned endpoints here when they need server-side shaping." }` is returned to unauthenticated callers, signaling an in-development surface to attackers.

**Recommendation**: Delete the route until a real BFF endpoint exists, or return a generic `404` with no body.

---

### SEC-017 — `fetchOrganizations` accepts unvalidated JSON shape

- **File**: `workers/ui/src/app/select-authorization-context/select-context-form.tsx:15-24`
- **Severity**: Low

```ts
const data: unknown = await res.json();
if (!Array.isArray(data)) return [];
return data as Organization[];
```

The `as Organization[]` cast is unchecked. Malformed objects (e.g., `{ id: null }`) flow into `RadioGroup` and possibly into a cookie-equivalent selection key as `undefined`.

**Recommendation**: Validate with Zod before mapping: `z.object({ id: z.string(), name: z.string() }).array()`. Fall back to direct-share if validation fails.

---

### SEC-018 — Login enforces only client-side password length

- **File**: `workers/ui/src/app/login/login-form.tsx:22-26`
- **Severity**: Info

The 8-character client-side check does not match the 12-character bootstrap minimum (`MIN_BOOTSTRAP_PASSWORD_LENGTH = 12`). No explicit `password.minLength` is set on the BA `emailAndPassword` config, so the server-side policy relies on BA defaults.

**Recommendation**: Add `password: { minLength: 12 }` to BA config so the policy is enforced server-side and consistent with the bootstrap constant.

---

## Cross-Cutting Observations

- **Logging redaction is correct.** `workers/core/src/shared/log-redaction.ts` covers `access_token`, `authorization`, `code`, `client_secret`, `id_token`, `refresh_token`, `token`. Route new logging through `structuredLog` so redaction applies automatically.
- **No raw-HTML injection.** All UI rendering uses React expressions. Email rendering uses `escapeHtml` with ampersand-first ordering (`auth-email-render.ts:17`).
- **SQL is parameterized throughout.** All raw D1 `.prepare()` calls in `bootstrap-store.ts`, `audiences.ts`, `scopes.ts`, `grants.ts`, `authorization-context.ts` use `?`-binding. No string interpolation into SQL found.
- **`verify-scoped-bearer` is the single JWT verification entry point** for `principal-validation` and `oauth-client-picker`. Fixing SEC-004 here hardens both plugins at once.
- **Bootstrap fails closed when token is absent.** `if (!expectedToken) return c.json({ error: "bootstrap_disabled" }, 403)` is correct.

## Risks and Edge Cases

- **`workers_dev: false` not set.** SEC-003 and SEC-005 escalate from Medium to High if the Worker is accessible via `*.workers.dev`.
- **Operator reuses example `ID_BOOTSTRAP_TOKEN`.** SEC-009 + SEC-002 combine into a practical first-install compromise path.
- **Phishing via consent spoofing.** SEC-012 is the lever — without server-side resolution the UI lies about which client is requesting access.
- **Sibling subdomain takeover.** SEC-006 means any takeover of `*.quanghuy.dev` is a session-stealing primitive.
- **Concurrent bootstrap requests.** SEC-007 — two admin rows; recoverable via DB cleanup but preventable.
- **OAuth code reuse.** SEC-008 — depends on whether BA stores codes in KV or D1; must be pinned in tests.
- **JWKS row deleted accidentally.** All tokens with that `kid` fail immediately (fail-closed). Operator must also invalidate KV caches for `id-resource-servers:audiences` and `id-oauth-scopes:enabled` to avoid stale catalog while a new key is issued.

## Test and Verification Plan

- **SEC-001** — Unit test: assert token comparison uses `timingSafeEqual`; assert `!==` is not used for the bearer comparison after fix.
- **SEC-002** — Integration test: 100 sequential bad-token POSTs to `/api/bootstrap/admin`; expect `429` after threshold once the KV counter is in place.
- **SEC-003** — Integration test: 50 wrong-password sign-in attempts; expect `429` after threshold once BA rate limit is re-enabled.
- **SEC-004** — Test: forge a JWT with `alg: "HS256"` signed over the JWKS public key bytes; assert `verify-scoped-bearer` rejects it. Add to `workers/core/tests/auth/principal-validation.test.ts`.
- **SEC-005** — Manual: from a non-CF origin, POST with `x-forwarded-for: 8.8.8.8`; confirm `session.ipAddress` is not `8.8.8.8` after fix.
- **SEC-006** — Manual: enumerate DNS records under `quanghuy.dev`; verify ownership of each subdomain.
- **SEC-007** — Integration test: fire two simultaneous bootstrap requests; assert exactly one succeeds.
- **SEC-008** — Test: two parallel `getAndDelete` calls against the same key; assert exactly one returns a value (expected to fail until addressed).
- **SEC-009** — Unit test: bootstrap handler returns `503` when `ID_BOOTSTRAP_TOKEN.length < 32`.
- **SEC-010** — Operational: write rotation runbook in `docs/007_cloudflare-deployment-runbooks.md`.
- **SEC-012** — Manual: visit `/consent?client_name=Acme+Bank&client_id=other&scope=openid`; confirm prompt no longer uses URL `client_name` after fix.
- **SEC-013** — `curl -I https://id.quanghuy.dev/consent`; assert `content-security-policy: frame-ancestors 'none'` is present.
- **SEC-014** — Unit test: assert `router.push` is only called with same-origin URLs on the login flow.
- **SEC-015** — `curl -I` against each hosted UI page; assert CSP, HSTS, and Referrer-Policy headers are present.
- **SEC-016** — `curl https://id.quanghuy.dev/admin/api`; assert `404` after fix.
- **SEC-017** — Unit test: mocked BA returns `[{ id: null }]`; assert UI falls back to direct-share without rendering `undefined`.
- **SEC-018** — Unit test: POST to `/api/auth/sign-up/email` with 8-char password; assert rejected once `password.minLength: 12` is set.

## Register Updates

New findings added: SEC-001 – SEC-018
