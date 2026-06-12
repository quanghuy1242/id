# `id-admin-delegation` Plugin

> **Purpose**: Lets platform admins define repository-specific console roles and bind them to principals on typed scopes. Admins & Roles uses this to show delegated authority separately from Better Auth platform admins and organization owner/admin memberships, without treating coarse membership roles as the final delegation model.

## Setup

The plugin is registered in `get-auth.ts`. No bootstrap role is required; platform admins manage the role catalog and bindings through the admin API. Role bindings are stored in Better Auth plugin-owned tables and are not standalone Drizzle schema.

## Usage

All endpoints require an authenticated platform-admin session cookie.

```text
GET    /api/auth/admin/delegation/roles
POST   /api/auth/admin/delegation/roles
PATCH  /api/auth/admin/delegation/roles/:id
GET    /api/auth/admin/delegation/bindings
POST   /api/auth/admin/delegation/bindings
DELETE /api/auth/admin/delegation/bindings/:id
```

Create role:

```json
{
  "slug": "registration-manager",
  "label": "Registration Manager",
  "description": "Can manage registration policies for an organization",
  "permissions": ["members:write"]
}
```

Create binding:

```json
{
  "principalType": "user",
  "principalId": "user_123",
  "roleId": "role_123",
  "scope": "organization:org_123",
  "expiresAt": null
}
```

Allowed binding scopes are `platform`, `organization:<id>`, `oauth-client:<id>`, and `resource-server:<id>`. Principal types are `user`, `team`, `group`, and `oauth_client`.

## Technical detail

This plugin owns two Better Auth models:

- `adminRole` — role definitions with a slug, display label, optional description, `ConsolePermission[]`, `system`, and audit timestamps.
- `adminRoleBinding` — principal-to-role bindings with a deterministic unique binding key, principal type/id, role id, typed scope, optional expiry, creator, and timestamp.

The first implementation is management/read-surface only: it gives Admins & Roles a real delegated-role source while keeping console entry and navigation projection on the existing platform-admin and organization owner/admin sources. Projection into `ConsoleScope.permissions` is the next 3.1 slice because it requires extending the shared scope contract deliberately instead of overloading owner/admin membership roles.
