# `id-registration` Plugin

> **Purpose**: Lets OAuth clients start standards-shaped account creation through OIDC `prompt=create` while keeping raw public signup closed. Hosted `/register` uses this plugin to evaluate policy, reserve quota, and pass a one-time intent to Better Auth signup so account creation still stays inside `id`.

## Setup

The plugin is registered in `get-auth.ts` and owns three generated Better Auth tables: `registrationPolicy`, `registrationIntent`, and `registrationQuotaReservation`. Run `pnpm db:generate` after schema changes and apply the generated migration before enabling registration policies.

Registration remains closed until an admin creates and enables a data-backed policy. There are no hard-coded client IDs, organization IDs, client names, or scopes in source.

## Usage

### Admin Policy Management

All admin routes require an authenticated admin session. Organization-scoped policies are visible to platform admins or users with owner/admin access to that organization.

```text
POST   /api/auth/admin/registration-policies
GET    /api/auth/admin/registration-policies
GET    /api/auth/admin/registration-policies/:id
PATCH  /api/auth/admin/registration-policies/:id
POST   /api/auth/admin/registration-policies/:id/enable
POST   /api/auth/admin/registration-policies/:id/pause
POST   /api/auth/admin/registration-policies/:id/archive
GET    /api/auth/admin/registration-policies/:id/intents
GET    /api/auth/admin/registration-policies/:id/quota
```

Create a client-initiated policy:

```http
POST /api/auth/admin/registration-policies
Content-Type: application/json

{
  "slug": "content-beta",
  "name": "Content beta",
  "mode": "client_initiated",
  "clientId": "cli_content_web",
  "organizationId": "org_acme",
  "allowedScopes": ["openid", "profile", "email", "content:read"],
  "emailDomains": ["acme.com"],
  "defaultRole": "member",
  "defaultTeamIds": [],
  "quotaLimit": 1000,
  "quotaTarget": "memberships",
  "requiresEmailVerification": true
}
```

### Hosted Registration

`/register` calls the public policy-gated endpoints:

```text
POST /api/auth/registration/evaluate
POST /api/auth/registration/submit
GET  /api/auth/registration/status?intentId=...
POST /api/auth/registration/cancel
```

Evaluate an OAuth request:

```http
POST /api/auth/registration/evaluate
Content-Type: application/json

{ "oauthQuery": "response_type=code&client_id=cli_content_web&scope=openid%20profile%20email" }
```

Allowed responses include trusted client and organization names from server data, never client-supplied display strings. Denied responses are returned before account creation.

### Signup Guard

Better Auth `POST /api/auth/sign-up/email` is enabled only behind the plugin before-hook guard. Calls must include:

```text
x-id-registration-intent: regint_...
```

Intent-less signup returns `400 missing_registration_intent`; this is the fail-closed regression gate from docs/030 §9.3 and docs/032 D0.

## Technical Detail

`schema.ts` owns the policy, intent, and reservation schemas plus OpenAPI metadata. `operations.ts` owns data-driven policy evaluation, scope narrowing, soft quota reservation, and post-signup onboarding helpers. `index.ts` declares the Better Auth endpoints and the `/sign-up/email` before/after hooks.

The first quota implementation is soft quota: adapter count plus reservation insert. This matches docs/030 §7.3 and deliberately defers the raw-D1 strict atomic quota exception until a separate architecture-approved change.
