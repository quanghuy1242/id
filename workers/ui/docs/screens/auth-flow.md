# Auth Flow Screens

Hosted UI pages that form the OAuth2/OIDC user-facing flow. All use `Page layout="centered"` — a single narrow
panel centered on the page. No admin shell (no Topbar, Sidebar, or MobileDock).

Route files live under `workers/ui/src/app/` (not `/admin`). Each page delegates interaction to a `"use client"`
form component; the page itself is a server component.

---

## /login

```
+------------- centered panel (max-w-md) ---------------+
| Sign in                                               |
|                                                       |
| [! Error message if server error]                     |
|                                                       |
| Email                                                 |
| _____________________________________________________ |
| [! invalid email message]                             |
|                                                       |
| Password                                              |
| _____________________________________________________ |
| [! password required message]                         |
|                                                       |
|                                     [ Sign in ]      |
+-------------------------------------------------------+
```

Components:
  Page(layout="centered") > Panel > Stack
  Stack: Text(variant="h1", "Sign in") + LoginForm
  LoginForm ("use client"): Stack
    [if server error] Alert(tone="error", message)
    form > Stack
      HiddenInput(name=OAUTH_QUERY_PARAM, value=useOauthQuery())
      TextInput(label="Email", name="email", type="email", autoComplete="username", required, error?)
      TextInput(label="Password", name="password", type="password", autoComplete="current-password", required, error?)
      Inline(justify="end") > Button(type="submit", variant="primary", disabled=loading) "Sign in" | "Signing in..."

Data: POST /api/auth/sign-in/email
        body: { email, password, [OAUTH_QUERY_PARAM]: oauthQuery }
        success: { redirect: true, url } → router.push(url) [same-origin validated]
        failure: { message | error } → Alert

States:
  idle        — form ready
  field-error — client-side validation failed; errors shown inline under each TextInput
  loading     — submit in-flight; button disabled and relabelled
  server-error — Alert(tone="error") above the form

Notes:
  OAUTH_QUERY_PARAM is a serialized URLSearchParams string that carries the OAuth authorization
  request (client_id, scope, redirect_uri, state, etc.) through the sign-in flow.
  Client-side validation: email regex + required; password required only.
  Redirect target is same-origin validated before router.push to prevent open redirect.

---

## /consent

```
+------------- centered panel (max-w-md) ---------------+
| Authorize application                                 |
|                                                       |
| Acme App is requesting permission to access           |
| your account.                                         |
|                                                       |
| Requested access:                                     |
| [openid]  [profile]  [email]  [org:read]              |
|                                                       |
| [! Error message if consent call fails]               |
|                                                       |
|                              [  Deny  ] [  Allow  ]   |
+-------------------------------------------------------+
```

Components:
  Page(layout="centered") > Panel > Stack
  Stack: Text(variant="h1", "Authorize application") + ConsentForm
  ConsentForm ("use client"): Stack
    Text(variant="body") — "{clientName} is requesting permission to access your account."
    [if scopes.length > 0]
      Stack(gap="xs")
        Text(variant="caption", "Requested access:")
        Inline(gap="xs") > Badge(tone="neutral") × scopes.length
    [if error] Alert(tone="error", message)
    Inline(justify="end")
      Button(variant="secondary", disabled=loading, onClick=deny) "Deny"
      Button(variant="primary", disabled=loading, onClick=allow) "Allow"

Data: POST /api/auth/oauth2/consent
        body: { accept: boolean, [OAUTH_QUERY_PARAM]: oauthQuery }
        success: { redirect_uri | url | redirectURL } → router.push
        failure: { message | error } → Alert
      client_id + scope parsed from OAUTH_QUERY_PARAM (useOauthQuery); no separate fetch

States:
  idle    — buttons active
  loading — both Deny and Allow disabled (either button click triggers loading)
  error   — Alert above button row; buttons re-enabled after error

Notes:
  clientName currently shown as "Client {client_id}" — will improve to resolved client name once
  client-metadata lookup is available in the OAuth flow.
  Scope row is hidden when scopes is empty (no scope param in the OAuth request).
  Both Deny and Allow call the same endpoint with accept: false / accept: true.

---

## /select-authorization-context

```
+------------- centered panel (max-w-md) ---------------+
| Choose access context                                 |
|                                                       |
| Select how you want to access this application.       |
| [request description from OAuth params]               |
|                                                       |
| Workspace access                                      |
| ○  Acme Corp                                          |
| ○  Beta Team                                          |
|                                                       |
|   — or, if no orgs —                                 |
| No organizations available.                           |
|                                                       |
| Individual access                                     |
| ○  Direct share — individual collaborator             |
|                                                       |
| [! Error message if continue call fails]              |
|                                                       |
|                                    [    Continue →   ]|
+-------------------------------------------------------+
```

Components:
  Page(layout="centered") > Panel > Stack
  Stack: Text(variant="h1", "Choose access context") + Text(variant="body") + SelectContextForm
  SelectContextForm ("use client"): Stack
    Text(variant="body") — useOauthRequestDescription(oauthQuery)
    [if orgs.length > 0]
      RadioGroup(title="Workspace access", name="context-workspace",
                 options=[{ value: "workspace:{orgId}", label: orgName }, ...],
                 value=selection, onChange=setSelection)
    [if orgs.length === 0]
      Text(variant="caption", "No organizations available.")
    RadioGroup(title="Individual access", name="context-individual",
               options=[{ value: DIRECT_SHARE_VALUE, label: "Direct share — individual collaborator" }],
               value=selection, onChange=setSelection)
    [if error] Alert(tone="error", message)
    Inline(justify="end")
      Button(variant="primary", disabled=!selection || loading) "Continue" | "Processing..."

Data: GET /api/auth/organization/list → Organization[] (fetched on mount via useEffect)
      POST /api/auth/oauth2/continue
        body: { postLogin: true, [OAUTH_QUERY_PARAM]: oauthQuery }
        headers: { "x-id-oauth-context": selection }
        success: { redirect_uri | url | redirectURL } → router.push
        failure: { message | error } → Alert

States:
  loading-orgs  — org list fetching on mount; Continue disabled until selection is set
  no-orgs       — org list empty; only Individual section shown; selection defaults to DIRECT_SHARE_VALUE
  selected      — a radio is chosen; Continue enabled
  submitting    — Continue in-flight; button disabled and relabelled "Processing..."
  error         — Alert above button; button re-enabled

Notes:
  Both RadioGroups share a single `selection` state string — selecting one automatically deselects the other.
  Selection is initialized to "workspace:{orgs[0].id}" if orgs exist, otherwise DIRECT_SHARE_VALUE.
  x-id-oauth-context header encoding: workspace access = "workspace:{orgId}"; personal = "direct-share".
  DIRECT_SHARE_VALUE and WORKSPACE_CONTEXT_PREFIX are exported from @/shared/constants.

---

## /forgot-password

```
+------------- centered panel (max-w-md) ---------------+
| Reset your password                                   |
|                                                       |
| Email                                                 |
| _____________________________________________________ |
| [! invalid email message]                             |
|                                                       |
| [ Back ]                          [ Send reset link ] |
|                                                       |
|   — after submit (neutral) —                          |
| [✓ If that account exists, a reset link has been sent]|
| Use the latest email link. Older links may expire.    |
|                                       [ Back to sign in ] |
+-------------------------------------------------------+
```

Components:
  Page(layout="centered") > Panel > Stack
  Stack: Text(variant="h1", "Reset your password") + ForgotPasswordForm
  ForgotPasswordForm ("use client"):
    [if submitted] Stack
      Alert(tone="success", neutral copy) + Text(variant="caption") + Inline(justify="end") > LinkButton(href="/login?callbackURL=/account")
    [else] Form > Stack
      TextInput(label="Email", name="email", type="email", autoComplete="username", required, validate)
      Inline(justify="between") > LinkButton(href="/login?callbackURL=/account", variant="ghost") "Back" + Button(type="submit", disabled=submitting) "Send reset link" | "Sending..."

Data: POST /api/auth/request-password-reset
        body: { email, redirectTo: "/reset-password" }
        always render neutral success (no enumeration)

States: idle | field-error | submitting | submitted (neutral success, terminal)

Notes:
  Email enumeration is prevented: success copy is identical for known and unknown emails.
  Submitted state is shown even if the request fails (the action does not throw to the form).

---

## /reset-password

```
+------------- centered panel (max-w-md) ---------------+
| Choose a new password                                 |
|                                                       |
|   — if no token —                                     |
| [! This reset link is missing a token]                |
|                              [ Request a new link ]   |
|                                                       |
|   — with token —                                      |
| [! Error if reset fails]                              |
| New password     ____________________________________ |
| Confirm password ____________________________________ |
|                                     [ Reset password ]|
+-------------------------------------------------------+
```

Components:
  Page(layout="centered") > Panel > Stack
  Stack: Text(variant="h1", "Choose a new password") + Suspense(fallback=Skeleton) > ResetPasswordForm
  ResetPasswordForm ("use client"): reads token from useSearchParams ("token" or "code")
    [if no token] Stack > Alert(tone="error") + Inline(justify="end") > LinkButton(href="/forgot-password")
    [else] Stack
      [if error] Alert(tone="error", message)
      Form(validationErrors) > Stack
        TextInput(label="New password", name="newPassword", type="password", autoComplete="new-password", required, validate≥12)
        TextInput(label="Confirm password", name="confirmPassword", type="password", autoComplete="new-password", required)
        Inline(justify="end") > Button(type="submit", disabled=submitting) "Reset password" | "Resetting..."

Data: POST /api/auth/reset-password
        body: { newPassword, token }
        success → router.push("/login?callbackURL=/account/security")

States: no-token | idle | field-error (length/match) | submitting | server-error

Notes:
  Token comes from the Better Auth reset email callback (?token=... or ?code=...).
  Client validation: newPassword ≥ 12 chars; confirmPassword must match. Server enforces full policy.
  The Suspense boundary is required because the form reads useSearchParams().

---

## /verify-email

```
+------------- centered panel (max-w-md) ---------------+
| Verifying email                                       |
|                                                       |
|   — checking —                                        |
| ▒▒▒▒▒▒▒▒▒▒▒▒▒  (Skeleton rows=3)                      |
|                                                       |
|   — success —                                         |
| [✓ Email verified]                                    |
| You can return to your account security settings.     |
|                              [ Open security settings ] |
|                                                       |
|   — invalid / expired / no token —                    |
| [! Verification link is invalid or expired]           |
|                              [ Open security settings ] |
+-------------------------------------------------------+
```

Components:
  Page(layout="centered") > Panel > Stack
  Stack: Text(variant="h1", "Verifying email") + Suspense(fallback=Skeleton rows=3) > VerifyEmailStatus
  VerifyEmailStatus ("use client"): reads token from useSearchParams; useSWR(["/verify-email", token]) → verifyEmail(token)
    [if no token] Stack > Alert(tone="error") + LinkButton(href="/account/security")
    [if loading] Skeleton(rows=3)
    [if data.error] Stack > Alert(tone="error", data.message) + LinkButton(href="/account/security")
    [else] Stack > Alert(tone="success", "Email verified.") + Text(variant="caption") + LinkButton(href="/account/security")

Data: GET /api/auth/verify-email
        params: { token, callbackURL: "/account/security" }
        response surfaces success / { error, message } for invalid/expired/already-verified

States: no-token | checking (Skeleton) | success | invalid/expired

Notes:
  Resend originates from /account/security; the link carries a Better Auth verification token.
  The exact Better Auth callback shape (JSON vs redirect) is verified by integration tests before final production routing (docs/029 §9.4).
