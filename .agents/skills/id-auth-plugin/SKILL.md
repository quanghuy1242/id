---
name: id-auth-plugin
description: Maintain custom Better Auth plugins in this repository. Use when creating, reviewing, refactoring, or testing code under workers/core/src/auth/plugins/**, especially plugin schema definitions, createAuthEndpoint handlers, plugin options, OpenAPI metadata, and resource-server plugin patterns.
---

# id Auth Plugin

Use this skill for custom Better Auth plugin work in `/home/quanghuy1242/pjs/auth`.

## Required Reference

Read `workers/core/src/auth/plugins/README.md` before changing plugin structure, adding a plugin, or refactoring shared plugin patterns. Treat it as the detailed guideline for file layout, ownership boundaries, and promotion rules.

For the current concrete template, also read `workers/core/src/auth/plugins/resource-server/README.md` when working on `id-resource-server` or modeling a new plugin after it.

## Before Writing Plugin Code

Before creating a new plugin or modifying an existing one, perform these discovery steps in order:

1. **Poke 2 existing plugins** to learn the established patterns. Open `resource-server/` (a table-owning CRUD plugin with schema endpoints) and one of `admin-sign-in-guard/` or `oauth-m2m-bridge/` (behavior-only plugins with hooks.before guards). Note how each splits responsibilities across `index.ts` (BA contract surface), `schema.ts` (data shapes), `types.ts` (composition hooks), and `operations.ts` (business-rule helpers). Your new code must follow the same file-role division.

2. **Browse `workers/core/src/shared/`** — especially `constants.ts` (BA model names like `RESOURCE_SERVER_MODEL`, framework model names like `USER_MODEL`, `MEMBER_MODEL`, `JWKS_MODEL`) and `request.ts` (shared context-access helpers `readBody`, `readString`, `extractBearerToken`). If your plugin needs a model name or a context-access helper, it must come from here; add a new constant/helper to the shared file before using it in your plugin.

3. **Read `workers/core/src/auth/plugins/README.md`** for the current file-structure rules, model-name-constant rule, and data-driven stub generation rule. Consciously verify your plugin conforms to every rule before declaring it done.

## Core Rules

- Keep custom plugins inside the `auth/` boundary: Better Auth schema, `createAuthEndpoint`, adapter context, validation, and plugin-local helpers.
- Do not add standalone Drizzle schemas, repositories, domain entities, or application use cases for Better Auth-owned plugin tables.
- Keep `index.ts` as the Better Auth contract surface: plugin factory, schema registration, explicit endpoint declarations.
- Keep `schema.ts` as the data/API shape surface: canonical Zod model, request schemas, derived Better Auth field map, and OpenAPI fragments.
- Keep `types.ts` for runtime composition hooks injected by `get-auth.ts`; do not merge callback options into `schema.ts`.
- Keep `operations.ts` for helper logic that can be unit-tested without a Better Auth request context.
- Keep plugin-owned pre-auth runtime companions inside the plugin directory when Better Auth needs data before endpoint context exists, such as the resource-server audience KV cache and D1 fallback.
- Inject authorization callbacks from `workers/core/src/auth/get-auth.ts`; never import `auth/policies/access.ts` directly inside a plugin.

## Plugin READMEs

When writing or updating a plugin's `README.md`, follow this structure so the
document is useful to both consumers and contributors.

### 1. Purpose block (mandatory, first)

Start with a one-sentence `> **Purpose**:` blockquote that answers three
questions for someone who has never seen the codebase:

- What problem does this plugin solve?
- Who calls it (admin user? M2M client? which downstream system)?
- Why does the caller need it — what breaks without it?

Keep it at the consumer level. Use concrete examples and system names
(`content-api`, `id`). Avoid framework jargon (Better Auth, Drizzle, BA adapter).

Good:

```markdown
> **Purpose**: Lets resource servers look up OAuth client metadata without a
> user session. `content-api` uses this to show which service accounts are
> available when an admin creates a policy binding — without the admin
> needing to hold any client secrets.
```

Bad:

```markdown
# OAuth Client Picker Plugin
Read-only M2M wrapper around oauthClient rows. Doc 018 D3.
```

If the plugin is transparent to callers, say so:

```markdown
> **Purpose**: Prevents service-account clients from being moved between
> organizations. Enforced transparently — no consumer action needed.
```

### 2. Setup (if applicable)

If the plugin needs provisioning before it is usable (M2M client, resource
server, scope, oauthClientResourceScope row), describe the steps in numbered
order. A new operator should be able to follow them without reading source.

Model this on `oauth-client-picker/README.md` Deployment section.

If the plugin has no setup (registered in `get-auth.ts` and immediately
available after admin sign-in), say so briefly.

### 3. Usage (if callable)

For every distinct consumer action, show a concrete HTTP request and the
response. Include headers (`Authorization`, `Content-Type`, `Accept` where
meaningful). Show real URL paths with real parameter values (`org_content`,
`user_123`), not placeholders.

Model this on `scim-directory/README.md` Usage section.

### 4. Routes (reference table)

After usage examples, list every route in a compact table or code block for
quick scanning. For read-only plugins, also list the mutation-method routes
and their expected status codes.

### 5. Technical detail

After the consumer-facing sections, add implementation notes: file
responsibilities, important internal invariants, cache invalidation behavior,
and architectural rationale. This section is for contributors, not consumers.

If the plugin is transparent and has no endpoints, the technical detail can
be a single paragraph describing the hook or behavior.

## Better Auth Endpoint Metadata

When writing `createAuthEndpoint` options, follow these rules:

### `metadata.openapi.responses` type constraint

Better Auth's underlying `better-call` package hardcodes the allowed response content-type keys to `"application/json"`, `"text/plain"`, and `"text/html"` (see `better-call` `EndpointBaseOptions.metadata.openapi.responses`). You **cannot** use any other content-type key — the TypeScript compiler will reject it.

If your plugin returns a non-standard content type on the wire:

1. Use `"application/json"` as the OpenAPI metadata content-type key — it is the closest available match.
2. Leave a `TODO` comment at the metadata helper noting the limitation, the relevant standard, and that the actual wire response already sends the correct content type.
3. Never weaken the type or cast to `any` to force an unsupported key through.

Type the `responses` value as `Record<string, { description: string; content?: { "application/json"?: { schema: Record<string, unknown> } } }>` to satisfy the `better-call` type.

### `disableBody: true` for mutation-rejection endpoints

When an endpoint always rejects a method (e.g. returning 405 for POST/PUT/PATCH/DELETE on a read-only resource), add `disableBody: true` to the endpoint options. Without it, Better Auth's global `allowedMediaTypes` check will reject requests whose `Content-Type` does not match the configured allowed list — returning 415 instead of the intended protocol-level error. With `disableBody: true`, body parsing is skipped entirely, so the handler receives the request and returns the correct error status.

### `metadata.openapi.tags`

Tag every endpoint with a plugin-specific tag. Group all endpoints in the same plugin under the same tag.

### Endpoint metadata helper pattern

Model the metadata builder on `resourceServerEndpointMeta`, `oauthScopeCatalogEndpointMeta`, or `scimEndpointMeta` from the corresponding plugin's `schema.ts`. The helper should:

- Accept `description`, optional path params (with `name`, `in`, `required`, `schema`, `description`), optional `requestBody`, optional `responseSchema` from `zodSchemaToOpenApi`, and optional `responseDescription`.
- Return `{ openapi: { tags, description, parameters?, requestBody?, responses } }`.

## Zod Schemas and Derived Types

- `schema.ts` owns canonical Zod schemas for all API/response shapes the plugin produces. Other plugin files import types from `schema.ts`, not from `types.ts`.
- `types.ts` is reserved for runtime composition hooks (adapter interfaces, filter types, plugin callback options) — not data shapes that can be expressed as Zod schemas.
- Use `zodSchemaToOpenApi` from `../../openapi` to derive OpenAPI fragments from Zod schemas. Do not hand-write OpenAPI JSON Schema objects when a Zod schema exists.
- Use `.meta({ id: "SchemaName" })` on Zod schemas so `z.toJSONSchema` includes the schema id.

## Validation

- Unit-test schema derivation and operation helpers without Better Auth context.
- Unit-test plugin runtime companions such as audience cache hit/miss/invalidation behavior without a Better Auth context.
- Integration-test endpoint handlers through `auth.handler()` using `betterAuth(getAuthOptions(...))`.
- For endpoints that reject mutations, send the protocol's standard content type and a body in the test request — this verifies `disableBody: true` is present and the 415 bypass works correctly. Do not strip the content-type header from tests to sidestep a BA validation error.
- Run `pnpm check` after code changes.
- Run `pnpm advise` after substantial plugin refactors and handle new findings according to repo guidance.