# id-admin-sign-in-guard

> **Purpose**: Protects the hosted admin console at `/admin`. Anyone signing in
> there must enter a one-time code emailed to them, on top of their password —
> so a leaked admin password alone cannot open the console. It also stops a
> bare email/password POST (with no admin or app context) from silently
> creating a session. Enforced server-side; the only consumer that needs to do
> anything is the `/login` page, which shows the code field when prompted.

## Setup

None. The plugin is registered in `workers/core/src/auth/get-auth.ts` and is
active for every `POST /api/auth/sign-in/email`. It needs an email sender and a
KV binding, both injected at registration:

```ts
idAdminSignInGuard({
  sendEmail: ({ to, otp }) =>
    sendAuthEmail(emailSender, { kind: "admin-otp", to, otp }, runtime.backgroundTaskRunner),
  kv: env.KV,
}),
```

Admin accounts must have a verified email — an unverified admin is rejected
before any code is sent (the underlying sign-in would reject it anyway).

## Usage

Admin login is a two-step exchange against the standard sign-in endpoint.

**Step 1 — credentials.** The `/login` page sends the admin `callbackURL`:

```http
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "admin@id.example", "password": "…", "oauth_query": "", "callbackURL": "/admin" }
```

```http
401 Unauthorized
{ "code": "admin_otp_required", "maskedEmail": "a***@i***.example" }
```

A 6-digit code is emailed; no session cookie is set.

**Step 2 — code.** The user re-submits the same form with the code:

```http
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "admin@id.example", "password": "…", "oauth_query": "", "callbackURL": "/admin", "otp": "123456" }
```

```http
200 OK
Set-Cookie: id-auth.session_token=…
{ "redirect": true, "url": "/admin", "user": { … } }
```

OAuth/PKCE sign-ins carry a signed `oauth_query` instead of an admin
`callbackURL`; they bypass both gates and are unaffected.

## Routes

The plugin declares no endpoints of its own. It hooks one existing path:

| Hook | Path | Outcomes |
|---|---|---|
| `hooks.before` | `POST /sign-in/email` | `400 missing_login_context` (no admin/OAuth context) · `401 admin_otp_required` (step 1) · `403 EMAIL_NOT_VERIFIED` · `401 invalid_otp` · `429 too_many_requests` · pass-through → `200` + session (valid OTP) |

## Technical detail

Two gates run inside the `hooks.before` matcher on `ctx.path === "/sign-in/email"`,
before the stock `signInEmail` body — so throwing an `APIError` here can never
leave a session cookie behind.

1. **Context gate.** A truthy `oauth_query` returns immediately (the OAuth
   provider's own before-hook validates the signature). Otherwise the request
   must carry a `callbackURL` of `/admin` or `/admin/*`; anything else is
   rejected with `400 missing_login_context`.

2. **Admin MFA gate (email OTP).**
   - *First submit (no `otp`)*: verify credentials mirroring `signInEmail`'s
     branches and timing (calls `password.hash` on the not-found/no-credential
     path for user-enumeration resistance), short-circuit unverified emails,
     check the generation rate limit, store a purpose-bound HMAC-SHA256 digest
     in KV (5-minute TTL), email the code, and throw `401 admin_otp_required`
     with a masked email.
   - *Second submit (`otp` present)*: check the verification rate limit, compare
     the stored digest in constant time, delete it, and return so `signInEmail`
     re-verifies the password and creates the session.

**Storage.** OTP digests and rate-limit counters live in KV
(`BetterAuthKvStorage`), keyed by the prefixes in `auth/config.ts`. OTP digests
are HMAC-SHA256 values derived from `BETTER_AUTH_SECRET`, the user ID, and the
purpose string `admin-login-otp:v1`, so a KV-only leak cannot brute-force the
6-digit code offline. KV read-modify-write is not atomic, so the rate limits are
best-effort backstops; edge WAF remains the primary throttle for password
guessing.

**File responsibilities.**

- `index.ts` — the Better Auth contract surface: the plugin factory and the
  single `hooks.before` matcher/handler. No endpoints.
- `operations.ts` — context-helpers unit-testable without a BA context: OTP
  generation/HMAC digesting, email masking, the KV rate-limit helpers, and the
  invalid-credentials error.
- `types.ts` — `AdminSignInGuardOptions` (injected `sendEmail`/`kv`/HMAC
  secret) and the narrow `AdminSignInGuardContext`/`AdminSignInGuardUser`
  runtime shapes.
- `schema.ts` — linter-required marker only; the plugin owns no relational rows.

**Boundaries & future work.** `sendEmail`, `kv`, and the HMAC secret are injected
from `get-auth.ts`; the plugin never reaches into the email sender, KV binding,
or env directly. Expansion (account-level TOTP via `twoFactor`, or OAuth step-up
per RFC 9470) is additive: the context gate stays, and the OTP block is a
contained region that can be removed when a standards-based mechanism supersedes
it. See doc 024 §5.2.
