# `id-oauth-m2m-bridge` plugin

Behavior-only Better Auth plugin that enforces doc 018 §5.5 D5: the
`oauthClient.referenceId` column is immutable for clients whose `grantTypes`
include `client_credentials`. Relocating a service-account client to a different
organization is a different operation and must be done by creating a new client.

Registered as a `hooks.before` matcher on every BA `update-client` path
(`/oauth2/update-client`, `/oauth2/admin/update-client`,
`/admin/oauth2/update-client`). The handler rejects with `409 invalid_request`
when the proposed `reference_id` differs from the stored value.

The plugin has no schema, no endpoints, no options.
