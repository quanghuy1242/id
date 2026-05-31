# id-admin-sign-in-guard

> **Purpose**: Protects platform-console entry by requiring a signed-in platform admin to complete an emailed one-time-code step-up before `/admin/platform/**` renders. It also stops bare email/password POSTs with no OAuth, Account, or Console context from silently creating a session.

## Setup

None. The plugin is registered in `workers/core/src/auth/get-auth.ts`. It needs an email sender, a KV binding, the OTP HMAC secret, and the platform-admin role predicate, all injected at registration:

```ts
idAdminSignInGuard({
  sendEmail: ({ to, otp }) => sendAuthEmail(emailSender, { kind: "admin-otp", to, otp }),
  kv: env.KV,
  otpHmacSecret: env.BETTER_AUTH_SECRET,
  isPlatformAdmin,
}),
```

Platform admins must have a verified email before a code is sent.

## Usage

Email/password login is a normal Better Auth sign-in when the request has a safe first-party context.

```http
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "admin@id.example", "password": "...", "callbackURL": "/admin" }
```

```http
200 OK
Set-Cookie: id-auth.session_token=...
{ "redirect": true, "url": "/admin", "user": { ... } }
```

When the signed-in actor enters `/admin/platform/**`, the UI proxy redirects to `/login?callbackURL=/admin/platform...&stepUp=platform`. The login page then starts the platform step-up:

```http
POST /api/auth/admin/step-up/request
Content-Type: application/json

{}
```

```http
200 OK
{ "status": true, "maskedEmail": "a***@i***.example" }
```

A 6-digit code is emailed and stored as a purpose-bound HMAC digest in KV.

The user submits the code:

```http
POST /api/auth/admin/step-up/verify
Content-Type: application/json

{ "otp": "123456" }
```

```http
200 OK
{ "steppedUp": true, "expiresIn": 172800 }
```

OAuth/PKCE sign-ins carry a signed `oauth_query`; they bypass the context gate here and are validated by the OAuth provider's own hook.

## Routes

The plugin declares the platform step-up endpoints and hooks one existing sign-in path:

| Kind | Path | Outcomes |
|---|---|---|
| endpoint | `GET /admin/step-up/status` | `{ steppedUp: boolean }` for the current session |
| endpoint | `POST /admin/step-up/request` | `200` with masked email · `403 EMAIL_NOT_VERIFIED` · `403 platform_step_up_required` · `429 too_many_requests` |
| endpoint | `POST /admin/step-up/verify` | `200` with proof TTL · `401 invalid_otp` · `403 platform_step_up_required` · `429 too_many_requests` |
| hook | `POST /sign-in/email` | `400 missing_login_context` for no OAuth or safe first-party callback · pass-through to Better Auth sign-in otherwise |

## Technical detail

The sign-in hook runs before the stock `signInEmail` body, so a missing context cannot leave a session cookie behind. A truthy `oauth_query` returns immediately because the OAuth provider validates the signed query. Otherwise the request must carry a local `/admin`, `/admin/*`, `/account`, or `/account/*` `callbackURL`.

The step-up endpoints use Better Auth's `sessionMiddleware`. `request` verifies the actor is a platform admin with a verified email, checks the generation throttle, stores a purpose-bound OTP digest in KV for 5 minutes, and awaits transactional email acceptance before returning success. `verify` checks the verification throttle, compares the submitted code in constant time, deletes the OTP digest, and stores a session-bound step-up proof in KV for `ADMIN_STEP_UP_TTL_SECONDS` (2 days).

**Storage.** OTP digests and rate-limit counters live in KV
(`BetterAuthKvStorage`), keyed by the prefixes in `auth/config.ts`. OTP digests are HMAC-SHA256 values derived from `BETTER_AUTH_SECRET`, the user ID, and the purpose string `admin-login-otp:v1`, so a KV-only leak cannot brute-force the 6-digit code offline. The final step-up proof is bound to the Better Auth session token, so changing sessions requires a new step-up. KV read-modify-write is not atomic, so the rate limits are best-effort backstops; edge WAF remains the primary throttle for password guessing.

**File responsibilities.**

- `index.ts` — the Better Auth contract surface: the plugin factory, step-up endpoints, and the sign-in context hook.
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
