# Select Authorization Context — OAuth PostLogin UI

> Status: implementation-grade proposal
>
> Date: 2026-05-23
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — workers/ui page and wrangler route only
>
> Source docs:
>
> - `docs/010_organization-teams-oauth-flow.md` sections 4.4, 7.2
> - `workers/core/src/auth/oauth-provider.ts` lines 79–98
> - `workers/core/src/auth/config.ts`
> - `workers/ui/src/app/consent/consent-form.tsx`
> - `workers/ui/src/app/consent/page.tsx`
> - `workers/ui/wrangler.jsonc`
>
> Related docs:
>
> - `workers/core/src/auth/plugins/README.md`

## Table Of Contents

- [1. Goal](#1-goal)
- [2. System Summary](#2-system-summary)
- [3. Current-State Findings](#3-current-state-findings)
- [4. Target Model](#4-target-model)
- [5. Architecture Decisions](#5-architecture-decisions)
- [6. Implementation Strategy](#6-implementation-strategy)
- [7. Detailed Implementation Plan](#7-detailed-implementation-plan)
- [8. Edge Cases And Failure Modes](#8-edge-cases-and-failure-modes)
- [9. Implementation Backlog](#9-implementation-backlog)
- [10. Definition Of Done](#10-definition-of-done)

## 1. Goal

Add the OAuth PostLogin context-selection page at `/select-authorization-context` so users can choose workspace or direct-share context during OAuth authorization flows that request product scopes.

Non-goals:

- Do not change the `oauth-provider.ts` postLogin hooks (already correct).
- Do not build admin UI for scope catalog, M2M grants, or teams (deferred per 010 §7.3).

## 2. System Summary

The OAuth flow for product scopes (`content:read`, `content:write`, `content:share`) requires explicit authorization context:

```text
/oauth2/authorize
  → postLogin.shouldRedirect checks x-id-oauth-context header
  → no header present → redirects to /select-authorization-context?<oauth_query>
  → user selects workspace or direct-share
  → page submits selection to OAuth continue endpoint with x-id-oauth-context header
  → BA stores selection in KV, proceeds to consent
  → consentReferenceId resolves org_id or direct-share marker
  → token issued with correct org_id/team_ids or direct-share claims
```

Without this page, any PKCE OAuth client requesting product scopes hits a 404 after login.

## 3. Current-State Findings

### 3.1 Backend Is Complete

`workers/core/src/auth/oauth-provider.ts` lines 79–98 implement the full postLogin flow:

```ts
postLogin: {
  page: "/select-authorization-context",
  shouldRedirect: async ({ headers, scopes, session }) => {
    if (!hasProductScope(scopes)) return false;
    const selectedContext = headers.get("x-id-oauth-context");
    if (!selectedContext) return true;
    await env.KV.put(authorizationSelectionKey(session.id), selectedContext, { expirationTtl: 300 });
    return false;
  },
  consentReferenceId: async ({ session, scopes }) => {
    // reads KV, returns org_id or direct-share marker
  },
},
```

- OIDC-only flows (`openid`, `profile`, `email`, `offline_access`) bypass the redirect — `hasProductScope` returns false.
- M2M flows use `client_credentials` — no user, no postLogin, different code path entirely.

### 3.2 UI Worker Routes Have Explicit Allowlists

`workers/ui/wrangler.jsonc` has four route patterns:

```jsonc
{ "pattern": "id.quanghuy.dev/login", "zone_name": "quanghuy.dev" },
{ "pattern": "id.quanghuy.dev/consent", "zone_name": "quanghuy.dev" },
{ "pattern": "id.quanghuy.dev/admin/*", "zone_name": "quanghuy.dev" },
{ "pattern": "id.quanghuy.dev/assets/*", "zone_name": "quanghuy.dev" }
```

`/select-authorization-context` is not listed. The Worker will not receive requests for this path.

### 3.3 UI Page Pattern Is Established

Both login and consent pages follow the same structure:

- `workers/ui/src/app/login/page.tsx` — server component wrapping a client form
- `workers/ui/src/app/consent/page.tsx` — server component wrapping a client form
- Client forms use `@id/ui` components: `Page`, `Panel`, `Stack`, `Text`, `Button`, `Badge`, `Alert`, `Inline`
- Client forms call `postAuthApi` from `@id/lib` for OAuth flows
- The consent form reads OAuth query params from `useOauthQuery()` hook

No selection page or form exists under `workers/ui/src/app/select-authorization-context/`.

## 4. Target Model

A new page at `workers/ui/src/app/select-authorization-context/` that:

1. Reads the OAuth query parameters from the URL.
2. Lists the user's organizations as workspace options.
3. Shows a "Direct share — individual collaborator" option.
4. On selection, submits the choice via a BA OAuth endpoint that sets `x-id-oauth-context` header.
5. BA stores the selection and redirects to the consent page.

### 4.1 Page Content

```text
/id/select-authorization-context?<oauth_query_params>

┌─────────────────────────────────────────┐
│ Select how you want to access           │
│                                         │
│ This application is requesting access   │
│ to: content:read content:write          │
│                                         │
│ Workspace access:                       │
│  ○ My Org (org_name)                   │
│    Use your organization membership     │
│    and team permissions.                │
│                                         │
│  ○ Direct share                         │
│    Access as an individual collaborator.│
│    No organization authority.           │
│                                         │
│              [ Cancel ]  [ Continue ]   │
└─────────────────────────────────────────┘
```

### 4.2 Route Whitelist

Add to `workers/ui/wrangler.jsonc`:

```jsonc
{ "pattern": "id.quanghuy.dev/select-authorization-context", "zone_name": "quanghuy.dev" }
```

## 5. Architecture Decisions

### 5.1 Single Page with Workspace List

The user must see their actual organizations when choosing workspace context. The page fetches the user's organizations from `id`'s API (the authenticated session is available via cookies on the same origin) or reads them from the OAuth query params if the provider exposes them.

Rejected: hardcoded workspace-only option. The user needs to know which org they're selecting.

### 5.2 Follow Existing Consent Form Integration Pattern

Use `useOauthQuery()` to read OAuth params, `postAuthApi` to submit the selection, and `@id/ui` components for presentation. This mirrors `consent-form.tsx` exactly.

### 5.3 Direct-Share Available Even Without Organization Membership

A user with no organizations can still select "Direct share." The workspace option list may be empty, which is valid.

## 6. Implementation Strategy

Single phase, no migration, no feature flags:

1. Add the route pattern to `workers/ui/wrangler.jsonc`.
2. Create `workers/ui/src/app/select-authorization-context/page.tsx` and `select-context-form.tsx`.
3. OpenAPI-only scopes silently skip this page — no code change needed. M2M flows are unaffected.

## 7. Detailed Implementation Plan

### 7.1 Wrangler Route

Current problem:

- UI Worker does not route `/select-authorization-context`.

Target behavior:

- The Worker handles requests to this path.

Implementation tasks:

- [ ] Add route entry to `workers/ui/wrangler.jsonc`:

```jsonc
{ "pattern": "id.quanghuy.dev/select-authorization-context", "zone_name": "quanghuy.dev" }
```

Acceptance:

- Deployed Worker receives requests at the path.

### 7.2 Select Context Page And Form

Current problem:

- No page exists. OAuth PostLogin redirects to a 404.

Target behavior:

- Page renders workspace vs direct-share choice and submits selection.

Implementation tasks:

- [ ] Create `workers/ui/src/app/select-authorization-context/page.tsx`:

```tsx
import { Page, Panel, Stack, Text } from "@id/ui";
import { SelectContextForm } from "./select-context-form";

export default function SelectAuthorizationContextPage() {
  return (
    <Page>
      <Panel>
        <Stack>
          <Text variant="h1">Choose access context</Text>
          <SelectContextForm />
        </Stack>
      </Panel>
    </Page>
  );
}
```

- [ ] Create `workers/ui/src/app/select-authorization-context/select-context-form.tsx` as a client component.
- [ ] Fetch the user's organizations (authenticated session available via same-origin cookies to `/api/auth/...` endpoints).
- [ ] Render radio-button selection: each org as "Workspace: <org name>" + one "Direct share" option.
- [ ] On submit, call the BA OAuth continue endpoint with `x-id-oauth-context` header set to `workspace:<orgId>` or `direct-share`.
- [ ] BA redirects to consent page.

Edge cases in the form:

- User has zero organizations: show only direct-share, pre-selected.
- User has one organization: pre-select it, still show both options.
- Submit while loading: disable button.
- API error: show `Alert` with error message.

Tests:

- Manual smoke: start PKCE flow with product scopes, verify page loads, select workspace, verify token includes `org_id` and `team_ids`.
- Manual smoke: start PKCE flow with product scopes, select direct-share, verify token omits `org_id`, has `team_ids: []`, rejects `content:share`.
- Manual smoke: OIDC-only scope request bypasses the page entirely.
- `pnpm typecheck`

No automated test for the UI page is required; the consent form has the same pattern and is not integration-tested. The backend postLogin flow is already covered by `oauth-auth-code.test.ts` and `oauth-scope-catalog.test.ts`.

## 8. Edge Cases And Failure Modes

| Scenario | Expected behavior |
|---|---|
| User has zero organizations | Only "Direct share" option shown, pre-selected |
| User has organizations but not all scopes available | Show organization list; scope gating happens at token issuance time |
| User selects workspace but org membership was revoked during flow | Token issuance fails in `customAccessTokenClaims` with `FORBIDDEN` — not this page's concern |
| User navigates to page without OAuth query params | Show error: "No authorization request in progress" |
| OAuth API call fails during submission | Show error `Alert`, allow retry |
| Page is accessed directly (no session) | BA session middleware on the continue endpoint returns 401 — redirect to login is handled by BA |

## 9. Implementation Backlog

### S1-A. Add Route And Page

Scope:

- `workers/ui/wrangler.jsonc`
- `workers/ui/src/app/select-authorization-context/page.tsx`
- `workers/ui/src/app/select-authorization-context/select-context-form.tsx`

Tasks:

- [ ] Add `/select-authorization-context` route to `workers/ui/wrangler.jsonc`.
- [ ] Create page server component.
- [ ] Create form client component with org fetch, radio selection, and submission via BA OAuth continue endpoint.
- [ ] Handle zero-org, one-org, and multi-org states.
- [ ] Handle API errors with `Alert`.

Acceptance criteria:

- OAuth PKCE flow with product scopes renders the selection page.
- Workspace selection produces a token with `org_id` and `team_ids`.
- Direct-share selection produces a token with no `org_id` and `team_ids: []`.
- OIDC-only flows bypass the page.

Tests:

- Manual smoke as described in §7.2.
- `pnpm typecheck`

## 10. Definition Of Done

- `workers/ui/wrangler.jsonc` routes `/select-authorization-context` to the UI Worker.
- `workers/ui/src/app/select-authorization-context/page.tsx` exists and renders.
- `workers/ui/src/app/select-authorization-context/select-context-form.tsx` exists and submits workspace or direct-share selection.
- OAuth authorization flows with product scopes complete successfully for both workspace and direct-share contexts.
- OIDC-only flows are unaffected.
- `pnpm typecheck` passes.
