# `id-oauth-protocol-scopes` plugin

> **Purpose**: Ensures every OAuth client registered or updated through the client-admin endpoints can request the universal OIDC protocol scopes (`openid`, `profile`, `email`, `offline_access`). Without this, a client granted only resource scopes is rejected with `invalid_scope` the moment it starts an authorization-code flow.

Behavior-only Better Auth plugin. No endpoints, no configuration; transparent to callers.

Better Auth validates an `/oauth2/authorize` request's scopes against the client's own stored `scopes`, falling back to the provider's global scope set only when the client has none. A client registered with resource scopes alone (for example `content:read content:write content:share`) is therefore rejected for `openid`/`profile`/`email`/`offline_access`, even though those scopes are globally available and are not resource-bound catalog scopes the admin can attach. This surfaced when the content admin (the first OIDC consumer to register a resource-scoped confidential client) could not reach the login page: id bounced the authorize request back with `invalid_scope: openid, profile, email, offline_access`.

Registered as a `hooks.before` matcher on every BA create/update client path (`/oauth2/create-client`, `/oauth2/admin/create-client`, `/admin/oauth2/create-client`, and the `update-client` variants). The handler folds `authPluginConfig.oauthProtocolScopes` into the request body before the provider persists the client: it rewrites the RFC 7591 `scope` string on create and the `update.scopes` array on update. The merge is order-preserving (protocol scopes lead) and de-duplicated, and is a no-op when no scopes are supplied (the provider already defaults those to the global set).

Pure merge logic lives in `operations.ts` (`parseScopeValue`, `withProtocolScopes`); `index.ts` wires the matchers and the body rewrite.
