# `id-oauth-context-selection` plugin

> **Purpose**: Captures the post-login authorization-context selection (`x-id-oauth-context`) on the `/oauth2/continue` request so the OAuth provider's `consentReferenceId` callback can resolve it. Without this, every context selection failed with "OAuth authorization context was not selected".

Behavior-only Better Auth plugin. No endpoints, no configuration; transparent to callers.

The BA OAuth provider runs `postLogin.shouldRedirect` — the callback that can read request headers — only on the **initial** `/oauth2/authorize` request, where the user has not chosen a context yet. On the `/oauth2/continue` request that actually carries the `x-id-oauth-context` header, `shouldRedirect` is skipped (`settings.postLogin` is set), so the header was never read and `consentReferenceId` (which receives only `{ user, session, scopes }`) had nothing to resolve. This surfaced when the content admin became the first OIDC consumer to exercise post-login context selection: workspace and direct-share alike failed identically.

This plugin registers a `hooks.before` matcher on the continue paths (`/oauth2/continue`, `/oauth2/admin/continue`, `/admin/oauth2/continue`). It reads the selection header, resolves the session id via `getSessionFromCtx`, and records the selection in the in-isolate bridge (`src/auth/authorization-context-selection.ts`). Because the hook and `consentReferenceId` run in the same request — therefore the same Worker isolate — this is a reliable read-after-write, unlike the eventually-consistent KV path that the provider's `consentReferenceId` keeps only as a fallback.
