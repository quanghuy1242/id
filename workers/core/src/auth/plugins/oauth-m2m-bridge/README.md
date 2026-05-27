# `id-oauth-m2m-bridge` plugin

> **Purpose**: Prevents service-account clients from being silently moved to a
> different organization. A client's org ownership (`referenceId`) is immutable;
> if reassignment were allowed, existing bindings would point at the wrong
> tenant. This plugin enforces that rule transparently.

Behavior-only Better Auth plugin. No endpoints, no configuration.
transparent to callers.

Enforces doc 018 §5.5 D5: the `oauthClient.referenceId` column is immutable
for clients whose `grantTypes` include `client_credentials`. Relocating a
service-account client to a different organization must be done by creating a
new client and migrating its bindings.

Registered as a `hooks.before` matcher on every BA `update-client` path
(`/oauth2/update-client`, `/oauth2/admin/update-client`,
`/admin/oauth2/update-client`). The handler rejects with `409 invalid_request`
when the proposed `reference_id` differs from the stored value.
