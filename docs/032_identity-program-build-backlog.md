# Identity Program Build Backlog (028–031 Execution Tracker)

> Status: execution tracker / backlog
>
> Date: 2026-05-31
>
> Scope: sequences the implementation of [docs/028](028_tenant-scoped-platform-experience.md), [docs/029](029_account-center-and-self-service-identity.md), [docs/030](030_client-initiated-registration-and-onboarding.md), and [docs/031](031_platform-access-control.md). This file only orders the work, names dependencies and gates, and links back. Design rationale lives in those docs — follow the links, do not duplicate design here.

## How To Use This

- Tickets are ordered. Build top-down unless a ticket is marked independent.
- Each ticket links to the doc section that specifies it. Read that, not a copy here.
- A **Gate** is blocking — do not merge past it without its check.
- Check the box when done. Status across sessions lives here.

## Ordering Rules (read first)

- **Keystone:** Track A1 (scope contract + `console-scopes`) blocks most of 028, 029's account-orgs, and 031's Access section. Build it first.
- **Hard pair, last:** Track C (029 login-context split + 028 §8.8 step-up) is one security surface (the docs/024 OTP). Settle and build them together, after the console shell exists; the admin-OTP suite staying green is the gate.
- **Independent warm-up:** Track A0 (system seed) depends on nothing — grab it first for momentum or skip.
- **Parallel track:** Track D (registration, 030) needs the scope catalog (A1) but is otherwise independent; its signup-guard spike (D0) is a hard gate before guarded signup.

## Track A — Console + Access Foundation (028 + 031)

| ☐ | # | Ticket | Scope | Dep | Gate | Spec |
|---|---|--------|-------|-----|------|------|
| ☑ | A0 | System access seed | idempotent ensure of `/system` resource server + system scopes from config constants; invalidate caches | — | no hard-coded clients; plugin ops not SQL | [031 §4.7](031_platform-access-control.md#47-default-system-scope-catalog-and-seed) |
| ☑ | A1 | Scope contract + discovery | `ConsoleScope`/`ActiveScope`/`ConsolePermission` in `@id/lib`; `console-scopes` BA plugin endpoint | — | endpoint test: platform/single-org/multi-org/member | [028 §8.1–8.2](028_tenant-scoped-platform-experience.md#81-console-scope-contract) |
| ☑ | A2 | Console shell + nav | `AdminScopeProvider`, scope selector, single nav definition, `visibleNavItems` (platform lens), screen specs | A1 | `visibleNavItems` pure-filter test | [028 §7, §8.4, §14 ph2](028_tenant-scoped-platform-experience.md#84-navigation-rendering-contract) |
| ☑ | A3 | Entry gate + routing | proxy → `canEnterConsole`; `/admin/platform/**` prefix; legacy redirects; `/account` fallback | A1, A2 | redirect-matrix test | [028 §8.3, §14 ph3](028_tenant-scoped-platform-experience.md#83-url-owned-scope) |
| ☑ | A4 | Org lens surfaces | `/admin/orgs/:orgId/**` overview, members, teams, invitations | A2, A3 | — | [028 §14 ph4](028_tenant-scoped-platform-experience.md#14-implementation-phases) |
| ☑ | A5 | OAuth + resource scoping | scope-typed actions + SWR keys; server org filters + owner checks; active-org bridge | A1, A4 | **cross-tab isolation test** (bridge) | [028 §8.5–8.6, §14 ph5](028_tenant-scoped-platform-experience.md#85-better-auth-active-organization-bridge) |
| ☑ | A6 | Access section UI | unified Access section: admins/roles, service accounts, resource APIs, scope catalog, M2M bindings | A2, A5 | — | [031 §4.8–4.9](031_platform-access-control.md#48-the-console-access-section) |

Status note 2026-05-31: Track A is implemented through A6. A2–A5 provide shell scope discovery, canonical platform/org routing, org lens pages, scoped OAuth/action keys, explicit org query scoping for resource/scopes/bindings, and the cross-tab cache isolation test. The 028 route audit is tightened: platform admins receive platform plus organization scopes so `/admin/orgs/:orgId/**` is reachable from the platform organization list, and legacy `/admin/identity/**`, `/admin/oauth/**`, and `/admin/security/**` requests redirect to their canonical platform/access/org homes, including the moved OAuth access routes; the old route files have been removed so only proxy redirects preserve those URLs. The scope picker is the first breadcrumb item and uses the previous platform/org badge tones for its trigger. A6 now has the Access section surfaces for Admins & Roles, Service Accounts, Resource APIs, Scope Catalog, and M2M Bindings, plus service-account create routes that default to the M2M OAuth client flow. Admins & Roles is the docs/031 v1 read-only derived view only: platform admins from Better Auth admin users plus organization owner/admin memberships from Better Auth organization endpoints; full delegated role management remains deferred.

## Track B — Account Center (029)

| ☐ | # | Ticket | Scope | Dep | Gate | Spec |
|---|---|--------|-------|-----|------|------|
| ☑ | B1 | Recovery/verify pages | `/forgot-password`, `/reset-password`, `/verify-email` + `wrangler.jsonc` routes | — | BA reset/verify callback shape tested | [029 §15 ph2](029_account-center-and-self-service-identity.md#15-implementation-phases) |
| ☑ | B2 | Account shell + summary | `/account` shell, route protection, `idAccountCenter` summary endpoint | A1 (agree with `console-scopes`) | no secrets/tokens in responses | [029 §8.3, §15 ph3](029_account-center-and-self-service-identity.md#83-idaccountcenter-plugin) |
| ☑ | B3 | Profile + security | `name`/`image`, change-password, resend-verification; email-change shown unavailable | B2 | — | [029 §15 ph4](029_account-center-and-self-service-identity.md#15-implementation-phases) |
| ☑ | B4 | Sessions / consents / orgs | safe session + current-user consent + org-membership endpoints & pages | B2 | token-stripping + current-user-only tests; **verify consent schema first** | [029 §8.3, §15 ph5](029_account-center-and-self-service-identity.md#83-idaccountcenter-plugin) |

Status note 2026-05-31: Track B is implemented. The `idAccountCenter` Better Auth plugin exposes current-user `summary`, `sessions` (+ revoke / revoke-others / revoke-all), `consents` (+ revoke by `clientId`), and `organizations` projections; responses strip session/bearer tokens and resolve the stored token server-side from `sessionId` (mirrors `admin-audit`). Consent revoke is keyed per client/user (the per-resource assumption in 029 §8.3 was dropped after confirming the schema). The `/account/*` shell, profile, security, sessions, consents, and organizations pages use the SWR content-component contract; recovery/verify pages (`/forgot-password`, `/reset-password`, `/verify-email`) are centered-panel hosted pages. `wrangler.jsonc` `routes` + `run_worker_first` now cover `/account*` and the three token pages, and the `route-path-contract` lint allowlist + `docs/000` were widened to admit them. Screen specs live in `workers/ui/docs/screens/account.md` and `auth-flow.md`. The account organizations endpoint computes `canOpenConsole`/`consoleHref` from the same owner/admin authority as `console-scopes`.

## Track C — Login Context + Step-Up (LAST, paired)

| ☐ | # | Ticket | Scope | Dep | Gate | Spec |
|---|---|--------|-------|-----|------|------|
| ☑ | C1 | Step-up reframe + login context | move OTP persona→platform-scope/sensitive-action; OAuth/Console/Account callbacks; default `/login`→`/account` | A2, B2 | **admin-OTP suite green**; signed-in-admin-on-`/login` test; open-redirect check on widened callback | [028 §8.8](028_tenant-scoped-platform-experience.md#88-step-up-on-sensitive-scopes-and-actions), [029 §9.1](029_account-center-and-self-service-identity.md#91-login-context-model) |
| ☑ | C2 | Session-integrated step-up proof | replace the KV sidecar with Better Auth session-owned step-up state such as `platformStepUpAt` / method metadata; keep platform entry remembered for the current session while allowing future sensitive-action freshness checks | C1 | no per-request KV status read for platform entry; sign-out/revoke/new session clears proof; admin-OTP suite green | [028 §8.8](028_tenant-scoped-platform-experience.md#88-step-up-on-sensitive-scopes-and-actions) |

Status note 2026-05-31: Track C shipped alongside Track B. The OTP trigger moved off the login persona into signed-in platform-console step-up: `idAdminSignInGuard` now exposes `GET /admin/step-up/status`, `POST /admin/step-up/request`, and `POST /admin/step-up/verify` (session-bound KV proof, `ADMIN_STEP_UP_TTL_SECONDS`), and the proxy challenges step-up only on `/admin/platform/**` entry. The `/sign-in/email` before-hook still rejects context-less login but now accepts safe first-party `/admin` and `/account` callbacks; `loginPayload` defaults direct login to `/account`. The admin-OTP suite, the signed-in-admin-on-`/login` regression, and the widened-callback open-redirect check are green.

Status note 2026-06-01: Step-up email delivery was tightened after the login UI could show a generic "code sent" notice for non-2xx step-up request responses and the core runtime could queue admin OTP email via `waitUntil`. Platform step-up now awaits OTP email acceptance before returning success, and the login form uses throwing auth helpers for step-up request/verify so delivery, throttle, and authorization failures render as errors instead of a sent notice.

Status note 2026-06-01: Platform-entry step-up proof now uses a 2-day window instead of the original 15-minute freshness window. This is still a temporary KV sidecar bound to the session token, so sign-out, revocation, a new session, or TTL expiry requires a new platform step-up. Track C2 records the intended improvement: move this proof into Better Auth session-owned state so platform entry does not require a per-request KV status read, while future high-impact action gates can keep their own shorter freshness requirement.

Status note 2026-06-01 (C2 done): The KV step-up sidecar is gone. The proof now lives on the Better Auth session as a `platformStepUpAt` (epoch-ms) `additionalField` declared by `idAdminSignInGuard` (migration `0008`); `verify` writes it via `internalAdapter.updateSession` (write-through to D1 + KV secondary storage), and freshness is computed at read time by `isPlatformStepUpFresh` against `ADMIN_STEP_UP_TTL_SECONDS`. Because the proof is a session column it dies with the session on sign-out/revocation and a new session starts unstepped. The `id-console-scopes` envelope now carries `stepUpSatisfied` on its platform scope, so the UI proxy decides `/admin/platform/**` entry from the console-scopes response it already fetches — the second per-request fetch to `/admin/step-up/status` and its dedicated KV read are removed (platform entry is now one core fetch with no step-up KV lookup). `GET /admin/step-up/status` is retained as a session-derived read (no KV). The admin-OTP suite plus new session-scoping regressions are green. Driving the remaining console-scopes session read to zero KV (Better Auth cookie cache) is a separate, security-sensitive follow-on — it trades immediate session-revocation visibility for a short staleness window and needs an explicit decision.

## Track D — Registration (030, parallel)

| ☐ | # | Ticket | Scope | Dep | Gate | Spec |
|---|---|--------|-------|-----|------|------|
| ☑ | D0 | Signup-guard spike | prove BA `hooks.before` ordering vs `disableSignUp`; invert-and-keep the 400 test | — | **HARD GATE before D3** | [030 §9.3, REG-1](030_client-initiated-registration-and-onboarding.md#93-signup-guard-contract) |
| ☐ | D1 | `idRegistration` plugin | policy + intent schemas, admin policy endpoints, public evaluate/submit endpoints | A1 (scope catalog ref) | data-driven, no hard-coded client/scope | [030 §15 REG-2](030_client-initiated-registration-and-onboarding.md#reg-2-idregistration-plugin) |
| ☐ | D2 | Hosted `/register` UI | register form, denied/closed states, invite acceptance | D1 | UI never trusts client-supplied names/scopes | [030 §15 REG-3](030_client-initiated-registration-and-onboarding.md#reg-3-hosted-registration-ui) |
| ☐ | D3 | Guarded signup + onboarding | guard `/sign-up/email`, reserve/consume quota, org defaults, `/oauth2/continue` | D0, D1 | **soft-quota first** (strict atomic deferred) | [030 §15 REG-4, §7.3](030_client-initiated-registration-and-onboarding.md#reg-4-guarded-signup-and-onboarding) |
| ☐ | D4 | Docs + client guide | `prompt=create` guide, policy modes, scope narrowing | D3 | — | [030 §15 REG-5](030_client-initiated-registration-and-onboarding.md#reg-5-documentation-and-client-guide) |

Status note 2026-06-01 (D0 done — spike findings): The hook-based signup guard (030 §9.3) is **viable**; the custom-endpoint fallback is **not** needed. Verdict rests on Better Auth 1.6.11 source plus an isolated empirical proof (`workers/core/tests/auth/signup-guard-spike.test.ts`, in the core barrel).

- **Ordering is deterministic.** `runBeforeHooks` runs and can short-circuit (return/throw) *before* `endpoint(...)` executes (`dist/api/to-auth-endpoints.mjs`), and the `disableSignUp` rejection lives *inside* the `/sign-up/email` endpoint body (`dist/api/routes/sign-up.mjs:142`, code `EMAIL_PASSWORD_SIGN_UP_DISABLED`). Plugin `hooks.before` are collected into that same pre-endpoint phase by `getHooks`. So a plugin `before` hook on `ctx.path === "/sign-up/email"` always runs before the built-in disable check — answering review obligation (2) "before, not after."
- **The flag must flip, and then the guard is the *sole* closure.** Proof case (flag dominance): with `disableSignUp: true`, even a *passing* guard is still rejected in-handler. Guarded signup therefore requires `emailAndPassword.disableSignUp: false`, after which the before-hook is the only thing standing between the public and account creation. Any route, ordering bug, or refactor where the guard does not run reopens fully public signup. D3 must register the guard fail-closed and treat its proof test as a merge gate.
- **One guarded signup is permitted; BA owns account creation.** Proof case (permit): `disableSignUp: false` + a valid intent → `200` and exactly one `user` row, with Better Auth owning password hashing, account/session rows, and user shape (per 030 §9.3). Obligation (1) satisfied.
- **Invert-and-keep the 400.** Proof case (ordering): `disableSignUp: false` + intent-less POST → `400` carrying the *guard's* code (spike uses `missing_registration_intent`), not `EMAIL_PASSWORD_SIGN_UP_DISABLED`. The existing closure assertion in `workers/core/tests/auth/auth-core.test.ts` (currently `400` on `POST /sign-up/email` while `disableSignUp: true`) stays green today; when D3 flips the flag it must be *inverted and kept* — same `400`, asserting the guard's fail-closed code — never deleted. Obligation (3) satisfied.

Carry-forward constraints for D1/D3: (a) global `hooks.before` run ahead of plugin hooks, and plugin hooks run in registration order — `idRegistration` must be the only plugin hooking `/sign-up/email` (none do today) so nothing short-circuits ahead of it; (b) intent transport in the spike is a header (`x-id-registration-intent`) — REG-1 still needs to decide header vs signed nonce and bind intent to status/expiry/client/email/quota/policy; (c) the spike isolates the framework mechanism only (trivial hashing, no email) and never flips `disableSignUp` on the real `get-auth.ts`, so production signup remains closed until D3.

> **Backlog-completeness note (2026-06-01) — this list is spine-focused and is known to be incomplete; correct it before relying on it as the full scope.** This backlog tracks the build *spine* of docs 028–031; several surfaces those docs specify are not yet carried as tickets here (neither in a track table nor in the Deferred table). Treat the track tables as a starting set, not an exhaustive scope, until a completeness audit reconciles 032 against 028–031 section-by-section. Concretely identified gaps so far:
>
> - **Registration policy admin console screen — untracked.** [030 §10.4](030_client-initiated-registration-and-onboarding.md#104-admin-policy-screens) specifies an admin console section (`/admin/platform/identity/registration-policies` and `/admin/orgs/:orgId/identity/registration-policies`: list, status/mode/client/quota/validity, enable/pause/archive, intent/audit detail) to drive the policies that decide *which client may initiate registration*. The management **API** is in scope under D1 ([030 §9.1](030_client-initiated-registration-and-onboarding.md#91-admin-policy-endpoints)), and the **end-user** hosted `/register` page is D2 — but the **admin screen** is neither ticketed in Track D nor parked in Deferred. As written, D1 would ship the policy API with no console UI (admins manage policies via raw API until the screen exists). Likely belongs as a new Track D ticket (e.g. D5, dep D1) gated by a `workers/ui/docs/screens/` spec per the admin-UI hard gate; sequencing/owner is the user's call.
>
> _TODO (owner: user): run the 028–031 ⇄ 032 reconciliation and either ticket or explicitly defer each spec'd surface; append further gaps to this note as they are found._

## Deferred (parked — do not build until triggered)

| Item | Trigger to un-defer | Spec |
|------|---------------------|------|
| Admins & Roles management screen | v1 is read-only derived view; full role management only when a concrete partial-admin need exists | [031 §4.8](031_platform-access-control.md#48-the-console-access-section), [028 §8.10](028_tenant-scoped-platform-experience.md#810-future-delegated-administration) |
| `resolvePlatformAuthority` consolidation | do when collapsing the duplicated `authorize()` checks; pure refactor | [031 §11](031_platform-access-control.md#11-consolidation-touchpoints) |
| Strict atomic quota | only after architecture approval; soft-quota ships first | [030 §7.3](030_client-initiated-registration-and-onboarding.md#73-quota-and-reservation-model) |
| `idAdminDelegation` plugin | only when owner/admin proves too coarse | [028 §8.10](028_tenant-scoped-platform-experience.md#810-future-delegated-administration) |

## Cross-Cutting Gates (apply to every ticket)

- Coarse-scope bright line: `id` scopes never name resource objects ([031 D7](031_platform-access-control.md#6-architecture-decisions)).
- Server enforces every scope independent of UI gating ([028 D3](028_tenant-scoped-platform-experience.md#10-architecture-decisions)).
- No hand-written SQL/migrations; plugin schema + `pnpm db:generate` (repo rule 4).
- README + `workers/ui/docs/screens/` spec updated before any new route file (admin UI hard gate).
- `pnpm lint`, `pnpm test`, `pnpm check` after every change; `pnpm advise` after substantial source.

## Suggested First Move

A1 (keystone) if going straight for the spine, or A0 (system seed) as an independent warm-up that proves the build/test loop in ~half a day. Then A2 → A3 → A4 → A5/A6, with Track B alongside after A1, and Track C strictly last. Track D can start at D0 any time and needs A1 before D1.

Per-track definitions of done live in their docs: [028 §15](028_tenant-scoped-platform-experience.md#15-definition-of-done), [029 §17](029_account-center-and-self-service-identity.md#17-definition-of-done), [030 §17](030_client-initiated-registration-and-onboarding.md#17-definition-of-done), [031 §13](031_platform-access-control.md#13-definition-of-done).
