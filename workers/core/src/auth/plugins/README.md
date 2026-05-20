# Auth Plugins

Custom Better Auth plugins that extend the auth server with domain-specific tables and admin API endpoints.

## Why plugins

Better Auth's native `organization` and `admin` plugins cover general multi-tenancy. Custom plugins add tables and endpoints the stock plugins don't provide — in this codebase, that means admin-managed resource-server registration and OAuth audience lifecycle.

Every custom plugin lives fully inside the `auth/` boundary: BA schema + `createAuthEndpoint` + adapter context. Plugins never use standalone Drizzle schemas, repositories, or `domain/` / `application/` use-case chains. For anything outside the BA adapter context, use a Hono route in `http/routes/`.

## Plugins

| Plugin | Path | Purpose |
|---|---|---|
| `id-resource-server` | `resource-server/` | Admin CRUD for resource-server records and audience cache invalidation |

## File structure

Every plugin follows this layout:

```
plugins/<name>/
├── index.ts       — plugin factory: BA schema definition + endpoint wiring (no business logic)
├── types.ts       — `PluginOptions` type (callbacks, hooks)
├── validation.ts  — Zod schemas for request body validation
├── operations.ts  — pure helpers: auth assertions, payload builders, row types
└── README.md      — (optional) plugin-specific docs
```

### Rules

- **`index.ts`** exports a single function that returns `BetterAuthPlugin`. It contains the BA `schema` block and `createAuthEndpoint` calls — nothing else. Handlers are thin: extract session → call helpers → adapter call → JSON response.
- **`types.ts`** exports only the options type. Cross-cutting authorization callbacks go here so `get-auth.ts` can compose them.
- **`validation.ts`** contains Zod validation schemas for HTTP request bodies. No BA imports.
- **`operations.ts`** contains pure business-rule functions: row types, timestamp stamping, payload construction, and authorization assertion wrappers. Authorization itself is injected via a callback from `get-auth.ts` — operations.ts never imports from `auth/admin/access.ts`.
- The BA model name (e.g. `"resourceServer"`) lives in `src/shared/constants.ts` as a `SCREAMING_SNAKE_CASE` const. Both the plugin and the raw-D1 store (`infrastructure/persistence/`) import it from there.
- Model names must include JSDoc per architecture lint (`constants-jsdoc`).

## Writing a new plugin

1. Create `plugins/<name>/` with the four files above.
2. Define the BA schema block in `index.ts`. Use `schema: { <table>: { fields: { ... } } }` matching the canonical BA field DSL.
3. Export `PluginOptions` from `types.ts`. Include `authorize` as a callback — never import `hasAdminAccess` / `hasOrganizationAccess` directly. Let `get-auth.ts` compose and inject the access check.
4. Write Zod request validation in `validation.ts`.
5. Put business helpers (row type, payload builders, assertion wrappers) in `operations.ts`.
6. Register the plugin in `get-auth.ts` under the `plugins` array, passing the `authorize` callback composed from `auth/admin/access.ts`.
7. Write tests in `workers/core/tests/auth/<name>-*.test.ts`. Unit-test validation and operations without a BA context. BA endpoint handlers are integration-tested separately.
