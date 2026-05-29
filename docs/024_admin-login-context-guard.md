# Admin Login Context Guard

> Status: implemented (2026-05-29)
>
> Date: 2026-05-29
>
> Scope:
>
> - `workers/core/src/auth/plugins/` (new plugin)
> - `workers/core/src/auth/get-auth.ts`
> - `workers/core/src/auth/types.ts` + `workers/core/src/auth/adapters/resend-email.ts` (email message union)
> - `workers/ui/src/app/login/login-form.tsx`
> - `workers/ui/src/app/admin/page.tsx` (resolve the existing MFA TODO)
> - `stories/auth-flow.stories.tsx` (Ladle story for the OTP challenge state)
>
> Source docs:
>
> - `docs/000_repo-architecture.md`
> - `docs/022_admin-ui-system.md`
>
> Related docs:
>
> - `docs/002_implementation-sequence.md`

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
- [4. Target Model](#4-target-model)
- [5. Architecture Decisions](#5-architecture-decisions)
- [6. Detailed Implementation Plan](#6-detailed-implementation-plan)
- [7. Edge Cases And Failure Modes](#7-edge-cases-and-failure-modes)
- [8. Definition Of Done](#8-definition-of-done)

## 1. Goal

Prevent session creation when `POST /api/auth/sign-in/email` is called without a valid login context. Additionally, require an email-OTP challenge for every admin login (`callbackURL` targeting `/admin`), enforced server-side before session minting.

**Non-goals:**

- Per-user two-factor enrollment (TOTP, authenticator apps).
- Changing the OAuth/PKCE sign-in flow.
- Modifying the SCIM or resource-server plugins.
- Session-freshness re-authentication for admin routes (the `page.tsx` TODO floats this; it is a separate concern, deferred — see §5.3).

## 2. System Summary

The `/login` page serves two distinct flows through the same `POST /api/auth/sign-in/email` endpoint:

**Admin flow:** An unauthenticated user visits `/admin` → `guardAdmin()` in `workers/ui/src/proxy.ts` redirects to `/login?callbackURL=%2Fadmin`. The form sends `{ email, password, oauth_query: "", callbackURL: "/admin" }`.

**OAuth/PKCE flow:** A client app calls `/oauth2/authorize?client_id=...` → Better Auth OAuth provider redirects to `/login?client_id=...&sig=...` with signed query params. The form sends `{ email, password, oauth_query: "client_id=...&sig=...", callbackURL: undefined }`.

The `signInEmail` handler in Better Auth processes both flows identically — it validates credentials and creates a session without inspecting role or context. The distinction between admin and OAuth users is handled post-authentication by the Next.js proxy middleware (`guardAdmin`) and the OAuth provider's `after` hook.

**The shared form** (`workers/ui/src/app/login/login-form.tsx`) infers context from the URL: `useOauthQuery()` strips `callbackURL` and `error` params, returning whatever remains. Non-empty → OAuth flow. Empty → admin flow.

## 3. Current-State Findings

All claims below were verified against the installed Better Auth `1.6.11` and `@better-auth/oauth-provider@1.6.11` source, not just the public docs.

### 3.1 Relevant Files

| File | Role |
|---|---|
| `workers/core/src/http/routes/auth-mount.ts` | Single `app.all("/api/auth/*")` → `auth.handler()`. No per-endpoint interception. |
| `workers/core/src/auth/get-auth.ts` | `getAuthOptions()` wires all plugins. Sign-in config: `requireEmailVerification: true`, `disableSignUp: true`. BA `rateLimit.enabled: false` (edge WAF handles throttling). |
| `workers/core/src/auth/plugins/oauth-m2m-bridge/index.ts` | Template for `hooks.before` pattern on specific paths (uses exact `ctx.path` matching, `readBody(ctx)` helper). |
| `workers/core/src/auth/adapters/password.ts` | `hashPassword` / `verifyPassword` via `node:crypto.scrypt`. Wired into `emailAndPassword.password`. Establishes the `import { ... } from "node:crypto"` convention. |
| `workers/core/src/auth/types.ts` | `AuthEmailMessage = { kind: "password-reset" \| "verification"; to; url }` — `url` is required; there is no `otp` field today. |
| `workers/ui/src/app/login/login-form.tsx` | Login form. `loginPayload()` sends `callbackURL` only when present in URL. `submitLogin()` interprets `redirect: false` (no `url`) as failure. |
| `workers/ui/src/app/admin/page.tsx` | Scaffold page. Carries a TODO proposing TOTP via Better Auth `twoFactor` enforced in proxy + session-freshness re-auth. This plan supersedes that TODO (see §5.2/§5.3). |
| `workers/ui/src/lib/oauth-query.ts` | `useOauthQuery()` strips `callbackURL`/`error`; returns non-empty string for OAuth, `""` for admin. |
| `workers/ui/src/proxy.ts` | `guardLogin()`/`guardAdmin()` distinguish OAuth vs admin and enforce `role === "admin"` post-session. |
| `packages/lib/src/auth-fetch.ts` | `postAuthApi()` does `fetch("/api/auth" + path, ...)` and parses JSON **regardless of HTTP status** (returns `{}` only on parse failure). Non-2xx bodies are surfaced to the caller. |
| `packages/lib/src/constants.ts` | `OAUTH_QUERY_PARAM = "oauth_query"`. |
| `stories/auth-flow.stories.tsx` | Ladle stories for `/login`, `/consent`, `/select-authorization-context` using `setMockUrl()` + `window.fetch` mocks. |

### 3.2 Verified Behavior

**Bug A — session created on context-less login (confirmed).**

The handler at `better-auth/dist/api/routes/sign-in.mjs` lines 243–258:

```js
const session = await ctx.context.internalAdapter.createSession(user.user.id, ...); // 243
await setSessionCookie(ctx, { session, user: user.user }, ...);                     // 248
if (ctx.body.callbackURL) ctx.setHeader("Location", ctx.body.callbackURL);          // 252
return ctx.json({
  redirect: !!ctx.body.callbackURL,   // false when callbackURL absent
  token: session.token,
  url: ctx.body.callbackURL,          // undefined when callbackURL absent
  user: parseUserOutput(...),
});
```

Sequence: visit `/login` directly → `currentAdminCallbackURL()` returns `""` → `loginPayload()` omits `callbackURL` (line 73: `if (callbackURL)` — `""` is falsy) → body `{ email, password, oauth_query: "" }` → handler creates the session and sets the cookie, then returns `{ redirect: false, url: undefined, token, user }`. The client's `submitLogin()` (login-form.tsx lines 80–90) treats `redirect: false` with no `url` as `{ error: "Sign in failed" }`. The user sees an error while the session cookie is already set; a subsequent visit to `/admin` is silently authenticated.

**OAuth before-hook actually validates signatures (confirmed).**

`@better-auth/oauth-provider/dist/index.mjs` lines 2856–2862 registers a `hooks.before` whose matcher is `ctx.body?.oauth_query` (any path, not just sign-in) and which throws `APIError("BAD_REQUEST", { error: "invalid_signature" })` when `verifyOAuthQueryParams` fails. So "let the OAuth path through; the existing hook validates it" is sound — an invalid signature is still rejected before any session is minted.

**No server-side guard on login context (confirmed).**

There is no `hooks.before` matcher for `/sign-in/email`. The OAuth hook only engages when `oauth_query` is truthy; the admin path has zero server-side context validation.

**No per-login MFA for admin (confirmed), and `requireEmailVerification` is not the mechanism people assume.**

`requireEmailVerification` is evaluated on **every** sign-in (sign-in.mjs lines 229–242), not once at first sign-in as previously documented. It gates on the persistent `user.emailVerified` flag: once `true`, it always passes. It therefore provides **no** per-login challenge. The `twoFactor` plugin is not enabled.

### 3.3 Current Problems

| Problem | Severity | Root Cause |
|---|---|---|
| Session minted without valid login context | **High** | No `hooks.before` guard on `/sign-in/email`; client misinterprets `redirect: false` |
| No MFA for admin-context logins | **Medium** | No per-step challenge; `requireEmailVerification` is a persistent-flag gate, not a per-login factor |
| Client-side "Sign in failed" is misleading | **Low** | `submitLogin()` treats missing redirect URL as failure |
| `page.tsx` TODO proposes a divergent MFA design | **Low** | Pre-dates this plan; suggests user-scoped TOTP, which is not selected for this scope (see §5.2) and folded in as future work |

## 4. Target Model

### 4.1 Server-Side Enforcement

A new Better Auth plugin `id-admin-sign-in-guard` with a `hooks.before` matcher on `ctx.path === "/sign-in/email"` that runs **before** the `signInEmail` endpoint body (and therefore before password verification, the email-verification gate, and `createSession`).

**Context gate:**

```
If ctx.body.oauth_query is truthy
  → OAuth flow: return (the OAuth before-hook validates the signature)
Else if ctx.body.callbackURL starts with "/admin" (i.e. "/admin" or "/admin/...")
  → Admin login: proceed to MFA gate
Else
  → throw APIError("BAD_REQUEST", { message: "Missing login context" })
```

**Admin MFA gate (email OTP):**

```
Resolve email + password from body. If either is missing → return
  (let signInEmail produce its own validation error).

Look up the user by email (internalAdapter.findUserByEmail, { includeAccounts: true }).

First submit (ctx.body.otp absent):
  - Validate credentials in the guard, mirroring the real handler's branches
    AND its timing: on user-not-found / no-credential-account / no-password /
    bad-password, call ctx.context.password.hash(password) then throw the
    invalid-credentials error (user-enumeration resistance).
  - If user.user.emailVerified is false → throw EMAIL_NOT_VERIFIED now
    (do not send an OTP the handler would reject anyway — see §7).
  - Check the OTP-generation rate limit FIRST.
  - generate 6-digit OTP, hash with SHA-256, store in KV
    (key = "admin-otp:{userId}", value = sha256(otp), TTL = 300s).
  - queue OTP email via opts.sendEmail.
  - throw APIError("UNAUTHORIZED", { code: "admin_otp_required",
                                     maskedEmail: "a***@e***.com" })

Second submit (ctx.body.otp present):
  - Check the OTP-verification rate limit.
  - Read stored hash from KV; if missing or mismatched (timing-safe compare)
    → throw APIError("UNAUTHORIZED", { code: "invalid_otp" }).
  - Delete the KV entry, then return (let signInEmail continue → it
    re-verifies the password and creates the session).
```

> Note: the guard does **not** re-verify the password on the second submit; the real `signInEmail` handler does that. The guard only proves possession of the OTP. This keeps password verification in exactly one authoritative place (the handler) while the OTP is the guard's only added secret.

**OTP rate limiting:** Track OTP generation per user in KV (key: `admin-otp-attempts:{userId}`, TTL 900s, ≤ 3 per 15 min). Track verification attempts separately (key: `admin-otp-verify:{userId}`, TTL 300s, ≤ 5 per OTP window). The generation counter is incremented only **after** a correct password, so it is not a free oracle for valid emails. **Caveat:** Cloudflare KV read-modify-write is not atomic, so these limits are best-effort under concurrency (see §7); they are a backstop, not the primary brute-force control — edge WAF remains the primary throttle for password guessing on `/sign-in/email`.

### 4.2 Client-Side Polish

**Default `callbackURL` fallback in `login-form.tsx`:**

`loginPayload()` should default `callbackURL` to `"/admin"` when none is present in the URL **and** the request is not an OAuth flow. This alone closes Bug A's client symptom even before the server guard: the handler then returns `redirect: true, url: "/admin"`.

```ts
const callbackURL = data[OAUTH_QUERY_PARAM]
  ? currentAdminCallbackURL()                 // OAuth: never inject a callbackURL
  : (currentAdminCallbackURL() || "/admin");  // admin: default to /admin
```

**OTP challenge UI:** On an `admin_otp_required` response, reveal a 6-digit OTP `TextInput`. The email/password fields keep their values (uncontrolled inputs), the user enters the code, and resubmits the same form — the body now includes `otp`.

```
POST /api/auth/sign-in/email
{ email, password, oauth_query: "", callbackURL: "/admin", otp: "123456" }
```

**OAuth flows unchanged:** When `useOauthQuery()` is non-empty, no `callbackURL` is injected, the context gate returns on the OAuth branch, the MFA gate never engages, and the OAuth after-hook drives the redirect. Zero impact.

## 5. Architecture Decisions

### 5.1 Recommended Approach

**Custom `hooks.before` plugin (`id-admin-sign-in-guard`).**

Rationale:

- **Runs before session creation.** The `hooks.before` matcher fires before `signInEmail`'s body. Throwing an `APIError` prevents `createSession`/`setSessionCookie` from ever running.
- **Custom error fields reach the client.** `better-call`'s `APIError(status, body)` stores `body` verbatim and serializes the whole object as the JSON response. Combined with `postAuthApi()` surfacing non-2xx bodies, the client can read `code` and `maskedEmail` directly.
- **Existing proven pattern.** `id-oauth-m2m-bridge` already uses `hooks.before` + `createAuthMiddleware` + exact `ctx.path` matching. The new plugin mirrors it.
- **Context-scoped, not user-scoped.** MFA fires whenever a login targets `/admin`, independent of any per-user 2FA enrollment. This matches the requirement: MFA every time anyone signs in for `/admin`.
- **OAuth flow untouched.** The `oauth_query` path bypasses both gates.

### 5.2 MFA Mechanism Evaluation (standards classification)

Per `docs/000_repo-architecture.md` (standards-first identity research), every candidate is classified before selection. None of the options below are wrong or dismissed in a general sense — each is a legitimate, standards-aligned mechanism. They are simply **not the right fit for the narrow scope this document addresses** (close Bug A and add a per-login, context-scoped challenge for the first-party `/admin` UI). The classification records *why each is out of scope today* and *when it would become the preferred mechanism*, so a future scope change is an additive decision rather than a reversal.

**Option — Better Auth `twoFactor` plugin (TOTP/OTP second factor).** *Classification: Better Auth-supported capability.* By default it gates `/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number`. **Not selected for this scope** because: (a) it is **user-scoped** — it requires each admin to *enroll* a factor and challenges them on every credential sign-in including OAuth, not just `/admin`; (b) this scope is **context-scoped** (challenge only when `callbackURL` targets `/admin`); (c) it adds enrollment friction we don't want for the current bug. *Becomes preferred when:* we want real per-user 2FA (TOTP/authenticator apps, backup codes) as an account-level security feature across all sign-ins. This is also the mechanism the `page.tsx` TODO floated; that TODO is folded here, not discarded — it is the natural home for that future expansion.

**Option — Better Auth `emailOTP` plugin (`/sign-in/email-otp`).** *Classification: Better Auth-supported capability.* **Not selected for this scope** because it is **passwordless primary authentication** (the OTP *replaces* the password), not a password-then-OTP second factor, and adopting it now would change the credential model for all users. *Becomes preferred when:* we decide to offer passwordless / magic-style sign-in as a first-class login method.

**Option — OAuth/OIDC step-up (RFC 9470, `acr_values`/`acr`/`amr`).** *Classification: protocol standard.* **Out of scope here** because step-up applies to the OAuth authorize flow, and admin login is a **direct credential sign-in to the hosted admin UI**, not an OAuth `authorize` request — there is no `acr_values` channel to drive it. *Becomes preferred when:* a downstream OAuth client (including a future SPA-based admin console that authenticates *through* `/oauth2/authorize`) needs to request and assert an MFA assurance level. At that point step-up is the correct standards-based answer, and this plugin would not be on that path.

**Selected for this scope — `id-admin-sign-in-guard` context-scoped email OTP.** *Classification: repository-specific extension.* Chosen because the precise requirement (per-login, context-scoped MFA on the first-party admin UI, no per-user enrollment) is not expressible through `twoFactor` (user-scoped), `emailOTP` (passwordless), or RFC 9470 (OAuth-only). It keeps password verification on Better Auth's standard `signInEmail` path and adds only an email-OTP possession check in front of it — no new wire protocol, just an internal pre-condition on an existing endpoint.

**Forward path — does expanding scope throw this plugin away?** Mostly no. The plugin has two responsibilities, and they age differently:

- **Context gate (Bug A fix).** This is independent of the MFA mechanism — it enforces that `/sign-in/email` carries a valid login context (`oauth_query` *or* an `/admin` `callbackURL`). It stays valuable regardless of which MFA option we later adopt, because none of `twoFactor` / `emailOTP` / RFC 9470 enforce *this* invariant. Keep it.
- **MFA gate (email OTP).** This is the piece that would be *superseded*, not deleted-and-replaced, if scope grows:
  - Adopting `twoFactor` for account-level 2FA does not conflict — that challenge fires on credential verification; our context gate can simply stop running its own OTP branch (delete the MFA block, keep the context gate) once `twoFactor` covers the `/admin` case, or the two can coexist during migration.
  - Moving the admin console onto an OAuth/`authorize` flow (RFC 9470) would remove the `/admin` `callbackURL` shape entirely; at that point the MFA branch becomes dead code and is removed, while the context gate's `oauth_query` branch already covers the new flow.

So the design is intentionally **additive and reversible**: the context gate is a long-lived invariant, and the OTP branch is a contained, removable block. Expanding scope later means deleting one well-isolated `if (!otp) { ... }` region and wiring the standards-based plugin — not unwinding this work.

### 5.3 Mechanism Placement (why `hooks.before`, not elsewhere)

These alternatives concern *where* the guard runs, not *which* MFA mechanism to use. Unlike §5.2, the constraints here are technical, not scope-dependent — they would apply no matter how MFA evolves.


**Hono middleware in `auth-mount.ts`** — *Not suitable:* the `Request` body can be read only once (Better Auth would receive a consumed body), and it puts auth logic outside the BA plugin boundary (`docs/000_repo-architecture.md`).

**`hooks.after`** — *Not suitable:* the session and cookie already exist; revoking after the fact races the response and violates "invalid logins never mint a session."

**`onRequest` hook** — *Not suitable:* fires on every endpoint, requires manual URL parsing, and has no access to the parsed body.

**Session-freshness re-auth for `/admin` (the `page.tsx` TODO's second idea)** — *Deferred, not rejected:* re-authenticating when an admin session exceeds an age threshold is a reasonable hardening but is orthogonal to context-gating and per-login MFA. Tracked as future work; the TODO comment is removed and folded into this document so it is not lost.

## 6. Detailed Implementation Plan

### 6.1 Plugin: `id-admin-sign-in-guard`

**Files to create:**

- `workers/core/src/auth/plugins/admin-sign-in-guard/index.ts`
- `workers/core/src/auth/plugins/admin-sign-in-guard/types.ts`

**`types.ts` — Plugin options:**

```ts
export interface AdminSignInGuardOptions {
  /** Sends the OTP email (queued via sendAuthEmail). */
  readonly sendEmail: (params: { to: string; otp: string }) => Promise<void>;
  /** KV namespace for OTP storage and rate-limit counters. */
  readonly kv: KVNamespace;
}
```

**`index.ts` — Plugin factory (corrected against source):**

```ts
import { randomInt } from "node:crypto";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import type { AdminSignInGuardOptions } from "./types";

export const idAdminSignInGuard = (opts: AdminSignInGuardOptions): BetterAuthPlugin => ({
  id: "id-admin-sign-in-guard",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/sign-in/email",
        handler: createAuthMiddleware(async (ctx) => {
          const body = readBody(ctx);
          const callbackURL = typeof body.callbackURL === "string" ? body.callbackURL : undefined;
          const oauthQuery = typeof body.oauth_query === "string" ? body.oauth_query : undefined;

          // --- Context gate ---
          if (oauthQuery) return; // OAuth flow — its own before-hook validates the signature.

          if (!callbackURL || !(callbackURL === "/admin" || callbackURL.startsWith("/admin/"))) {
            throw new APIError("BAD_REQUEST", { message: "Missing login context" });
          }

          // --- Admin MFA gate ---
          const email = typeof body.email === "string" ? body.email : undefined;
          const password = typeof body.password === "string" ? body.password : undefined;
          const otp = typeof body.otp === "string" ? body.otp : undefined;
          if (!email || !password) return; // Let signInEmail produce its validation error.

          const found = await ctx.context.internalAdapter.findUserByEmail(email, { includeAccounts: true });

          if (!otp) {
            // Step 1: validate credentials (same branches + timing as signInEmail), then send OTP.
            const credential = found?.accounts.find((a) => a.providerId === "credential"); // NOTE: providerId, not provider
            if (!found || !credential?.password) {
              await ctx.context.password.hash(password); // equalize timing
              throw invalidCredentialsError();
            }
            const ok = await ctx.context.password.verify({ hash: credential.password, password });
            if (!ok) throw invalidCredentialsError();

            // Don't send an OTP the handler would reject for an unverified email.
            if (!found.user.emailVerified) {
              throw new APIError("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED" });
            }

            await assertOtpGenerateLimit(opts.kv, found.user.id); // check BEFORE rotating the stored OTP
            const code = generateOtp();
            await opts.kv.put(otpKey(found.user.id), await sha256(code), { expirationTtl: 300 });
            await opts.sendEmail({ to: email, otp: code });

            throw new APIError("UNAUTHORIZED", {
              code: "admin_otp_required",
              maskedEmail: maskEmail(email),
            });
          }

          // Step 2: verify OTP. (Password is re-verified by signInEmail itself.)
          if (!found) throw invalidCredentialsError();
          await assertOtpVerifyLimit(opts.kv, found.user.id);
          const stored = await opts.kv.get(otpKey(found.user.id));
          if (!stored || !timingSafeEqualHex(stored, await sha256(otp))) {
            throw new APIError("UNAUTHORIZED", { code: "invalid_otp" });
          }
          await opts.kv.delete(otpKey(found.user.id));
          // return → signInEmail continues, re-verifies password, creates the session.
        }),
      },
    ],
  },
});
```

**Module-private helpers in `index.ts`:**

- `readBody(ctx)` — same shape guard as `oauth-m2m-bridge` (`ctx.body && typeof === "object" ? ... : {}`).
- `otpKey(userId)` → `"admin-otp:{userId}"`.
- `generateOtp()` → `String(randomInt(100000, 1000000))` using **`node:crypto`'s `randomInt`** (the global Workers `crypto` has no `randomInt`; `nodejs_compat` is enabled and the repo already imports from `node:crypto`).
- `sha256(input)` → hex of `crypto.subtle.digest("SHA-256", encode(input))` (WebCrypto, available globally).
- `timingSafeEqualHex(a, b)` → constant-time compare of two equal-length hex strings (`node:crypto`'s `timingSafeEqual`, as used in `bootstrap.routes.ts`).
- `maskEmail(email)` → first char + `***` + masked domain.
- `invalidCredentialsError()` → `new APIError("UNAUTHORIZED", { message: "Invalid email or password" })`.
- `assertOtpGenerateLimit(kv, userId)` / `assertOtpVerifyLimit(kv, userId)` — KV counter reads with the TTLs/limits in §4.1; throw an `APIError` when exceeded. Best-effort (KV is not atomic).

**Corrections relative to the previous draft (all verified against source):**

1. Credential lookup uses **`a.providerId === "credential"`** (sign-in.mjs:210), not `a.provider`. The old `a.provider` always returned `undefined`, breaking every admin login.
2. OTP generation uses **`node:crypto` `randomInt`** via an explicit import, not bare `crypto.randomInt`.
3. The rate-limit check is performed **before** storing/rotating the OTP, so a throttled attempt cannot invalidate a legitimately pending code.
4. Credential branches in step 1 **call `ctx.context.password.hash(password)`** on the not-found / no-credential path to match the handler's timing (user-enumeration resistance, mirroring sign-in.mjs:206/212/218).
5. Unverified-email accounts are **short-circuited before** an OTP is generated/sent (the handler would otherwise reject with `EMAIL_NOT_VERIFIED` after the user already consumed an OTP).
6. OTP hashes are compared **timing-safely**.

### 6.2 Register the plugin: `get-auth.ts`

Add to the `plugins` array immediately after `idOAuthM2MBridge()` (before `createOAuthProviderPlugin`). Ordering is not load-bearing because the guard returns early on the `oauth_query` branch, but keeping it adjacent to the other id-owned `hooks.before` plugin documents intent:

```ts
idAdminSignInGuard({
  sendEmail: ({ to, otp }) =>
    sendAuthEmail(emailSender, { kind: "admin-otp", to, otp }, runtime.backgroundTaskRunner),
  kv: env.KV,
}),
```

### 6.3 Email message union: `types.ts` + `resend-email.ts`

The current `AuthEmailMessage` requires a `url`. An OTP message carries `otp`, not `url`, so widen the type into a discriminated union and add the render branch:

```ts
export type AuthEmailMessage =
  | { readonly kind: "password-reset" | "verification"; readonly to: string; readonly url: string }
  | { readonly kind: "admin-otp"; readonly to: string; readonly otp: string };
```

Add the `"admin-otp"` case to the `renderAuthEmail` rendering used by the Resend sender (subject + body containing the 6-digit code and a 5-minute expiry note). Do **not** put the code in a link.

### 6.4 Client: `login-form.tsx`

- **Default `callbackURL`** to `"/admin"` only when not an OAuth flow (§4.2 snippet); forward `data.otp` when present.
- **`submitLogin()`** returns `{ redirectUrl?, error?, errorCode?, maskedEmail? }`, reading `body.code` / `body.maskedEmail` from the (non-2xx) JSON body.
- **`handleSubmit`**: on `errorCode === "admin_otp_required"`, set `otpRequired` state and a helper message (`Enter the code sent to ${maskedEmail}`); otherwise fall back to the existing error display.
- **OTP input** rendered only when `otpRequired`:

```tsx
{otpRequired && (
  <TextInput
    label="Verification code"
    name="otp"
    type="text"
    autoComplete="one-time-code"
    required
    validate={(v) => (/^\d{6}$/.test(v) ? undefined : "Enter the 6-digit code")}
  />
)}
```

### 6.5 Resolve `workers/ui/src/app/admin/page.tsx`

Remove the stale MFA TODO (it proposes user-scoped TOTP and session-freshness, both addressed in §5). Replace it with a one-line pointer to this document so the rationale is discoverable; no functional change to the scaffold page.

### 6.6 Ladle story: `stories/auth-flow.stories.tsx`

The OTP challenge is a UI state worth a visual story alongside the existing `Login`/`Consent` stories. Add an `AdminLoginOtpChallenge` story that:

- `setMockUrl("/login", "")` (admin context — no `oauth_query`).
- Installs a `window.fetch` mock (same pattern as `installOrganizationFetchMock`) for `POST /api/auth/sign-in/email` returning HTTP 401 with `{ "code": "admin_otp_required", "maskedEmail": "a***@e***.com" }`, so the rendered form advances to the OTP-input state.
- Renders `<LoginPage />`.

Keep it in the existing `stories/` folder (Ladle `stories` glob already includes `stories/**/*.stories.tsx`). Follow the side-effect-free module rule for any shared component touched (`packages/ui` `sideEffects: false`).

### 6.7 Tests

**Plugin tests:** `workers/core/tests/auth/admin-sign-in-guard.test.ts` (add to the core barrel `tests/all.test.ts`):

- Context gate rejects requests with neither `callbackURL` nor `oauth_query` (`400`).
- Context gate rejects `callbackURL` not starting with `/admin`.
- OAuth path (truthy `oauth_query`) returns (passes through).
- Admin path, first submit, valid creds, verified email: stores OTP in mock KV, sends email, throws `admin_otp_required` with `maskedEmail`.
- First submit, invalid creds: throws invalid-credentials **and** still calls `password.hash` (timing parity).
- First submit, unverified email: throws `EMAIL_NOT_VERIFIED`, sends **no** OTP.
- First submit, generation rate limit exceeded: throws before rotating the stored OTP.
- Second submit, valid OTP: deletes KV entry and returns.
- Second submit, invalid / expired OTP: throws `invalid_otp`.
- Second submit, verify rate limit exceeded: throws rate-limit error.

**Client tests:** `workers/ui/tests/login-form.test.tsx` (add to the UI barrel):

- No `callbackURL` in URL + no `oauth_query` → body has `callbackURL: "/admin"`.
- `callbackURL` present in URL → forwarded verbatim.
- Non-empty `oauth_query` → **no** `callbackURL` injected.
- `admin_otp_required` response → OTP input appears; resubmit includes `otp`.

## 7. Edge Cases And Failure Modes

| Scenario | Expected behavior |
|---|---|
| No `callbackURL`, no `oauth_query` | `hooks.before` throws `400 BAD_REQUEST`; no session created |
| `callbackURL=/admin/dashboard` | Valid admin path — MFA gate engages |
| `callbackURL=https://evil.com/admin` | Rejected: the form already same-origin-checks, and the server requires a `/admin` **path prefix** on a relative value |
| `oauth_query` present but signature invalid | OAuth before-hook throws `invalid_signature`; session never created |
| Admin account with `emailVerified === false` | Guard throws `EMAIL_NOT_VERIFIED` in step 1 **before** any OTP is generated/sent; user must verify email first |
| OTP email fails to send | `sendEmail` throws → `500`; no session, no usable OTP; user retries (new OTP) |
| User submits OTP after KV TTL expires | KV returns `null` → `invalid_otp`; user re-initiates |
| Two admin login tabs | Each step-1 rotates `admin-otp:{userId}`; last OTP wins, earlier ones become invalid |
| OAuth login in another tab while admin OTP pending | OAuth path bypasses both gates; no interference |
| Brute-force OTP | Verify limit (≤5/window) — best-effort under KV non-atomicity; exhaustion throws; user re-initiates |
| Password brute-force on `/sign-in/email` | Guard returns invalid-credentials with handler-parity timing and increments **no** counter (generation counter increments only after a correct password). App-level password throttling is **not** added here; edge WAF remains the primary control. Not a regression — the guard adds no session side effects |
| Concurrent OTP requests for one user | KV read-modify-write counters can both pass; limits are best-effort. A hard guarantee would require a Durable Object (out of scope) |
| KV unavailable | `hooks.before` throws `500`; no session; user retries |
| User with `role: "user"` logging in with `callbackURL=/admin` | `signInEmail` still creates a session after OTP; `guardAdmin()` redirects them to `/login?error=admin_required`. Session exists but admin UI is unreachable. Pre-existing behavior; a future role check in the guard could deny non-admins before OTP |
| OTP hash exposure (KV dump) | SHA-256 of a 6-digit code is brute-forceable offline; the hash is defense-in-depth only. Real controls are the 300s TTL + verify limit |

## 8. Definition Of Done

- [x] `id-admin-sign-in-guard` plugin created with `hooks.before` on `ctx.path === "/sign-in/email"`.
- [x] Credential lookup uses `providerId === "credential"`; OTP generation uses `node:crypto` `randomInt`; rate-limit checked before OTP storage; timing-parity `password.hash` on invalid-credential branches; unverified-email short-circuit; timing-safe OTP compare.
- [x] Plugin registered in `getAuthOptions()` after `idOAuthM2MBridge()`.
- [x] `AuthEmailMessage` widened to a discriminated union with `"admin-otp"`; `sender-email.ts` renders the code (no link).
- [x] `login-form.tsx` defaults `callbackURL` to `"/admin"` only for non-OAuth flows; shows OTP input on `admin_otp_required`; `submitLogin()` extracts `code`/`maskedEmail`. The OTP prompt renders as an `info` Alert (not an error).
- [x] `admin/page.tsx` MFA TODO removed and replaced with a pointer to this doc.
- [x] `AdminLoginOtpChallenge` Ladle story added in `stories/auth-flow.stories.tsx`.
- [x] Plugin and client tests added to the respective barrels and passing (`pnpm test` — 544 passing). Existing contextless test sign-ins migrated to a shared `adminOtpSignIn`/`signInViaAdminOtp` helper.
- [x] `pnpm lint` clean (architecture gate). `pnpm typecheck` clean. `pnpm advise` clean.
- [ ] Manual smoke: `/login` direct → sign in → OTP prompt → enter code → redirected to `/admin`.
- [ ] Manual smoke: OAuth flow (`/oauth2/authorize?...`) → sign in → no OTP prompt → redirected to client app.
