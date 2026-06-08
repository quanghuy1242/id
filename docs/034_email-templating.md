# Email Templating (Build-Time, react-email)

> Status: implementation-grade proposal — MVP scope
>
> Date: 2026-06-08
>
> Scope:
>
> - `workers/core/src/auth/adapters/auth-email.ts` — the send orchestrator (`sendAuthEmail`) and Resend sender factory
> - `workers/core/src/auth/adapters/auth-email-render.ts` — the single render seam (`renderAuthEmail`) that today hardcodes all email bodies
> - `workers/core/src/auth/adapters/resend-email.ts` — Resend transport
> - `workers/core/src/auth/get-auth.ts` — where the three email callbacks are wired
> - the proposed `emails/` source dir and its build-time compile step
>
> Source docs and local evidence:
>
> - [docs/000_repo-architecture.md](000_repo-architecture.md) — boundaries, framework-free `packages/lib`
> - [docs/003_future-implementation.md](003_future-implementation.md) §12 — the deferred DB-backed editing, theming, and builder design
> - [docs/024_admin-login-context-guard.md](024_admin-login-context-guard.md) — the admin-OTP flow (the existing awaited-send precedent)
> - `workers/core/src/auth/types.ts` — `AuthEmailKind` and `AuthEmailMessage` (three kinds today)
> - `workers/core/src/auth/get-auth.ts:128` — `sendOnSignUp: true` (signup fires the `verification` kind)
>
> External references checked on 2026-06-08:
>
> - react-email — component-to-HTML rendering, by Resend (the transport this repo already uses)
> - react-email + Resend on Cloudflare Workers — https://resend.com/docs/send-with-cloudflare-workers (runtime bundling caveats: resend-node #587, react-email #1508; not exercised by the build-time MVP)

## 1. Problem And Current State

`renderAuthEmail(message)` in `auth-email-render.ts` builds every transactional email body as string-concatenated HTML and text. Changing copy, layout, or branding means editing that function. The bodies are unstyled and share no layout, so the three emails look ad hoc.

The MVP keeps templates developer-authored and replaces the string concatenation with react-email components compiled to HTML at build time. Operators do not edit templates yet. The DB-backed editing, theming, and builder work moves to [docs/003 §12](003_future-implementation.md#12-email-templating-future) as deferred design, because that work depends on rendering inside the Worker at send time, which the MVP does not need.

Two facts shape the design:

- **One render seam.** All three flows funnel through `sendAuthEmail` → `createResendAuthEmailSender.send()` → `renderAuthEmail(message)`. Changing that one function covers every flow, including future kinds added to the `AuthEmailMessage` union.
- **Three kinds, two flows.** `AuthEmailMessage` carries `verification`, `password-reset`, and `admin-otp` (`workers/core/src/auth/types.ts`). `sendOnSignUp: true` (`get-auth.ts:128`) makes signup fire the `verification` kind, so signup needs no separate template. A distinct welcome email would be a new kind and a new Better Auth hook, out of MVP scope.

## 2. Decision Summary

- **Renderer: react-email, compiled at build time.** Author one component per kind plus one shared layout. A build step renders each to an HTML string with placeholder tokens, emitted as a generated TypeScript module. The Worker imports the strings and never runs react-email at runtime.
- **Why react-email over MJML.** Same TypeScript and React stack as the rest of the repo, so the lint, type, and test gates apply to the templates. Resend authors it and this repo sends through Resend. Slots become typed component props, so the compiler enforces the per-kind variable contract. It also keeps the runtime-render door open for the deferred work in 003 §12; MJML, a build-time-only compiler, closes that door.
- **Slots: a fixed per-kind allowlist, interpolated at runtime.** The compiled HTML carries `{{token}}` placeholders. At send time, `renderAuthEmail` replaces each token with its escaped value (§5).
- **Theme: a developer-owned `<EmailLayout>` component.** Brand color, logo, and footer live in that component. Changing the look means editing the layout and recompiling.

## 3. Architecture

### 3.1 Source layout

```
emails/
  layout.tsx            # <EmailLayout> — shared shell, brand tokens
  verification.tsx      # renders <EmailLayout> + verification body
  password-reset.tsx
  admin-otp.tsx
  build.ts              # compiles each component to HTML + text strings
```

Each kind component renders `<EmailLayout>` around its body and leaves slot values as placeholder tokens (`{{url}}`, `{{otp}}`, and so on). The component never receives real user data. It receives the literal token strings, so the compiled output contains the tokens verbatim.

### 3.2 Build step

`build.ts` renders each component through `@react-email/render` to an HTML string and a plain-text string, then writes a generated module, for example `auth-email-templates.generated.ts`:

```ts
export const AUTH_EMAIL_TEMPLATES = {
  verification: { subject: "...", html: "...{{url}}...", text: "...{{url}}..." },
  "password-reset": { subject: "...", html: "...", text: "..." },
  "admin-otp": { subject: "...", html: "...{{otp}}...", text: "..." },
} as const;
```

Two effort levels for running it:

- **Manual (start here).** Run the build script with a package script (`pnpm build:emails`) when a template changes, commit the generated module. No bundler wiring. Three rarely-changed emails do not justify more.
- **Wired.** Add `build:emails` as a prebuild step so the generated module rebuilds before the Worker bundles. Adopt this once manual regeneration becomes a chore.

One build-time check to confirm: react-email may URL-encode an `href`, which would turn `{{url}}` into an encoded form. If that happens, switch the href slot to a sentinel string the renderer leaves intact (for example `HREF_URL_SLOT`) and map it back in the generated module. Verify the tokens survive in the compiled output before relying on them.

### 3.3 Runtime seam

`renderAuthEmail` stays a pure, framework-free function. It reads the generated strings for the message kind, interpolates the message's slot values with escaping (§5), strips newlines from the subject, and returns `{ subject, html, text }`. The Resend transport stays unchanged. The send paths stay unchanged: verification and reset go through `waitUntil` as today, admin-OTP stays awaited because it is interactive.

## 4. Slot Allowlist

The per-kind contract is the component's typed props. The build step renders with token strings, and the runtime interpolator accepts only these keys per kind:

| Kind | Slots |
|---|---|
| `verification` (also signup) | `url`, `email`, `appName`, `expiresIn` |
| `password-reset` | `url`, `email`, `appName`, `expiresIn` |
| `admin-otp` | `otp`, `email`, `expiryMinutes` |

An unknown slot in a message fails fast in development. The template components, being typed, cannot reference a slot outside the contract without a type error at build.

## 5. Safety Model

The compiled HTML is developer-authored, reviewed in the repo, and passes the gates, so it is trusted. The runtime values poured into it are the surface. Build-time rendering means react-email already ran before any real value exists, so React auto-escaping does not protect these values. The runtime interpolator carries the protection:

| Slot | Source | Control |
|---|---|---|
| `email` | user-controlled (set at signup) | HTML-escape on interpolation. This is the live one. |
| `url` | Better Auth | HTML-escape, and validate the scheme is `https` before it lands in an `href`. HTML escaping alone does not block a `javascript:` link. |
| `otp` | Better Auth | HTML-escape for defense. |
| `appName`, `expiresIn`, `expiryMinutes` | system | escape anyway. |
| subject | template + slots | strip newlines to block header injection. |

Controls in the interpolator:

- HTML-escape every interpolated value, reusing the existing `escapeHtml`.
- Reject any value bound to an `href` slot whose scheme is not `https`.
- Strip CR and LF from the subject.
- No raw-output path. The interpolator does no expression evaluation, no property traversal, and no helpers, so there is no SSTI surface.

There is no operator-authored HTML in the MVP, so no sanitizer is needed.

## 6. Theme

`<EmailLayout>` owns the shell: a single-column email-client-safe structure with the brand color, logo, header, and footer. The three kind components render their body inside it. A developer changes branding by editing `layout.tsx` and recompiling. The MVP ships one platform theme. Per-org and operator-editable theming live in [docs/003 §12](003_future-implementation.md#12-email-templating-future).

## 7. Testing And Definition Of Done

- Unit-test the interpolator with no Better Auth context: HTML escaping, unknown-slot rejection, `https`-only href enforcement, and subject newline stripping.
- Snapshot-test the generated templates so a render change is visible in review.
- Verify the three flows still send after the seam change, with the generated strings in place.
- `pnpm check` green; `pnpm advise` handled per repo guidance.

**Definition of done:** the three emails render from react-email components compiled at build time, share one themed layout, and interpolate their slots at runtime with escaping plus an `https` href check. No operator editing, no DB, no runtime react-email. The deferred path is recorded in 003 §12.
