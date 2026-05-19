# Resource Server JWT Verification Guide

Resource servers should verify API access tokens locally only when the OAuth request included a `resource` parameter and the token is a JWT. Tokens without `resource` are opaque/server-validated tokens.

## Required Checks

Every downstream API must validate:

- issuer: `https://<core-host>/api/auth`
- JWKS URL: `https://<core-host>/api/auth/jwks`
- audience: the resource server audience registered through `/api/auth/admin/resource-servers`
- required scopes in the `scope` claim
- organization claim `org_id` when the API route is organization-scoped
- expiration and signature through JOSE/JWKS

## Helper

The source helper is `workers/core/src/auth/resource-token-verifier.ts`. It accepts issuer, JWKS URL, expected audience, required scopes, optional organization id, and the bearer token. It returns the verified subject, audience, scopes, and organization id.

Example:

```ts
await verifyResourceToken({
  issuer: "https://id.example.com/api/auth",
  jwksUrl: "https://id.example.com/api/auth/jwks",
  audience: "https://api.example.com",
  requiredScopes: ["api:read"],
  organizationId: "org_1",
  token,
});
```

## Failure Policy

Resource servers should return:

- `401` for missing, malformed, expired, or signature-invalid tokens;
- `403` for valid tokens missing the required scope or organization access.

Never log bearer tokens, authorization codes, refresh tokens, client secrets, or raw JWKS private material.

## Test Fixture

`workers/core/tests/auth/resource-token-verifier.test.ts` signs a fixture JWT, serves a fixture JWKS, verifies audience/scope/org claims, and proves the JSON failure response shape.

