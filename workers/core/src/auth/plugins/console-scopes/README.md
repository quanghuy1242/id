# `id-console-scopes` Plugin

> **Purpose**: Lets the console and account surfaces discover which platform or organization scopes the signed-in user can operate. The hosted console uses this to decide whether the user can enter `/admin`, which scope should open by default, and which member-only organizations should link to `/account` instead.

## Setup

The plugin is registered in `get-auth.ts` and needs no provisioning. It reads the current Better Auth session, user role, organization memberships, and organization labels.

## Usage

```http
GET /api/auth/admin/console-scopes
Cookie: id-auth.session_token=...
Accept: application/json
```

Response:

```json
{
  "actor": { "userId": "usr_123", "email": "owner@example.test", "canEnterConsole": true },
  "scopes": [
    {
      "kind": "organization",
      "id": "organization:org_acme",
      "organizationId": "org_acme",
      "label": "Acme Publishing",
      "role": "owner",
      "permissions": ["members:read", "members:write", "oauth-clients:read", "oauth-clients:write", "resource-servers:read", "resource-servers:write", "security-audit:read"],
      "requiresStepUp": false
    }
  ],
  "memberships": [],
  "defaultScopeId": "organization:org_acme"
}
```

## Routes

```text
GET /api/auth/admin/console-scopes
```

## Technical Detail

This is a behavior-only Better Auth plugin: it owns no table and creates no migration. `index.ts` is the Better Auth endpoint surface, `schema.ts` owns response schemas and OpenAPI metadata, `operations.ts` derives the envelope from adapter rows, and `types.ts` holds the composition callback shape. The platform-admin test is injected by `get-auth.ts`; the plugin does not import access-policy modules directly.
