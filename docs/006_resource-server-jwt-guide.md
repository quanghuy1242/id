# Resource Server JWT Verification Guide

Resource APIs verify `id` access tokens locally when an OAuth request included a `resource` parameter and Better Auth issued a JWT access token. Tokens without `resource` are opaque and are not the first-party resource-server contract described here.

## Required Checks

Every downstream API must validate:

- issuer: `https://<core-host>/api/auth`
- JWKS URL: `https://<core-host>/api/auth/jwks`
- audience: the resource server audience registered through `/api/auth/admin/resource-servers`
- expiration and signature through JOSE/JWKS
- required coarse OAuth scopes in the `scope` claim, for example `content:read`, `content:write`, or `content:share`
- selected context:
  - `org_id` present means workspace context and must match the loaded org-scoped resource
  - `org_id` absent means direct-share context and must not be downgraded from a mismatched workspace token
- concrete product policy inside the resource API after token checks pass

## Actor Construction

Workspace user token:

```json
{
  "sub": "user_alice",
  "org_id": "org_1",
  "scope": "content:read content:write",
  "team_ids": ["team_editorial"]
}
```

Direct-share user token:

```json
{
  "sub": "user_external",
  "scope": "content:read content:write",
  "team_ids": []
}
```

M2M token:

```json
{
  "azp": "import_bot_client",
  "client_id": "import_bot_client",
  "org_id": "org_1",
  "scope": "content:write"
}
```

Build actors from `sub`, `azp`/`client_id`, and `team_ids`. Team IDs are Better Auth team IDs scoped to one organization.

## Policy Boundary

`id` owns identity facts, OAuth client/resource/scope validation, token signing, `org_id`, and `team_ids`.

Resource APIs own product roles, permissions, concrete grants, inheritance, audit, and final decisions such as:

```ts
ContentPolicy.can(actor, "book.update", book);
```

OAuth scopes only decide whether a token may attempt an API operation. A `content:write` token is not a `book.update` grant.

## Direct Share

Direct-share tokens intentionally omit `org_id`, carry `team_ids=[]`, and cannot receive `content:share`. Resource APIs may allow ordinary object work, such as descendant creation inside an already shared book, through a direct `user:<sub>` binding. They should reject top-level organization creation, policy mutation, and organization-authority routes without workspace context.

## Revocation SLA

User access tokens expire after 900 seconds. Organization removal, team removal, or disabled scope rows are reflected on refresh/new issuance, but an already issued JWT can remain valid until its 15-minute expiry. Refresh-token lifetime is not the stale-team boundary because refresh reissues current claims.

Do not assume OAuth introspection automatically reloads current `team_ids`. If a resource API needs immediate revocation for a high-risk operation, define a separate live identity-status/membership contract with `id`.

## Principal Validation For Policy Writes

Today, durable policy writes that store `id` principal IDs still call the authenticated `principal-validation` API during the write. This is a temporary compatibility surface, not the target long-term contract.

Target contract:

- user, org-user, team/group, and org-admin lookup should move to read-only SCIM per [docs/017_scim-directory-and-m2m-principal-contract.md](docs/017_scim-directory-and-m2m-principal-contract.md)
- service-account/client binding semantics should move to the OAuth-client model in [docs/018_m2m-oauth-client-org-binding.md](docs/018_m2m-oauth-client-org-binding.md)

Current compatibility endpoints:

- `POST /api/auth/principal-validation/users/validate`
- `POST /api/auth/principal-validation/users/validate-organization-member`
- `POST /api/auth/principal-validation/teams/validate-organization-team`
- `POST /api/auth/principal-validation/service-accounts/validate-organization-grant`
- `POST /api/auth/principal-validation/organization-administrators/validate`

The current caller uses a dedicated M2M token with:

- audience: the `id` principal-validation API audience
- scope: `identity:principals:validate`

In the current compatibility path, service-account target validation accepts the public target API `resource` audience, and `id` resolves it to the internal resource-server row before checking `oauthClientOrganizationGrant`. That service-account path is superseded as the target design by [docs/018_m2m-oauth-client-org-binding.md](docs/018_m2m-oauth-client-org-binding.md).

## Failure Policy

Return:

- `401` for missing, malformed, expired, or signature-invalid tokens
- `403` for valid tokens missing the required scope, selected context, or object grant

Never log bearer tokens, authorization codes, refresh tokens, client secrets, or raw JWKS private material.
