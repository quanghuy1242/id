# Auth Plugins

Custom Better Auth plugins that extend the auth server with domain-specific tables and admin API endpoints.

## Why plugins

Better Auth's native `organization` and `admin` plugins cover general multi-tenancy. Custom plugins add tables and endpoints the stock plugins don't provide — in this codebase, that means admin-managed resource-server registration and OAuth audience lifecycle.

Every custom plugin lives fully inside the `auth/` boundary: BA schema + `createAuthEndpoint` + adapter context. Plugins never use standalone Drizzle schemas, repositories, or `domain/` / `application/` use-case chains. For anything outside the BA adapter context, use a Hono route in `http/routes/`.

## Plugins

| Plugin | Path | Purpose |
|---|---|---|
| `id-resource-server` | `resource-server/` | Admin CRUD for resource-server records and audience cache invalidation |
| `id-oauth-scope-catalog` | `oauth-scope-catalog/` | Admin CRUD for resource-server-bound OAuth scopes, layer-matched M2M resource-scope rows, and runtime scope/grant preload |
| `id-oauth-m2m-bridge` | `oauth-m2m-bridge/` | M2M OAuth client identity mirror and immutable client-reference boundary required by the BA token hook contract |
| `id-oauth-client-picker` | `oauth-client-picker/` | Scoped system-M2M client metadata and advisory OAuth resource-eligibility lookup with tenant-context isolation |
| `id-principal-validation` | `principal-validation/` | Authenticated exact-ID principal validation for downstream durable policy writes (temporary compatibility surface — see doc 017) |
| `id-scim-directory` | `scim-directory/` | Read-only SCIM v2 directory (RFC 7644) for users, org users, teams/groups, and virtual org-admin group — doc 017 A3 |

## File structure

Every plugin follows this layout:

```
plugins/<name>/
├── index.ts       — plugin factory: BA schema registration + explicit endpoint wiring
├── schema.ts      — canonical Zod model, request schemas, BA field map, OpenAPI fragments
├── types.ts       — `PluginOptions` type and composition hooks
├── operations.ts  — auth assertions, uniqueness checks, and payload builders
├── <runtime>.ts   — optional plugin-owned pre-auth/runtime companion
└── README.md      — (optional) plugin-specific docs
```

### Rules

- **`index.ts`** exports a single function that returns `BetterAuthPlugin`. It registers the BA `schema` block and `createAuthEndpoint` calls. Endpoint declarations should stay explicit even when there are several CRUD routes; handlers stay thin: extract session → call helpers → adapter call → JSON response.
- **`schema.ts`** is the data/API source of truth. Prefer one canonical Zod row schema, derive request body schemas from its fields, derive the BA field map once at module scope, and precompute OpenAPI schema fragments once at module scope. Strip internal metadata from public OpenAPI output.
- **`types.ts`** exports plugin options and narrow runtime hook types. Keep this separate from `schema.ts`: composition callbacks are runtime wiring, not persisted/request data shape.
- **`operations.ts`** contains business-rule helpers: payload builders, timestamp stamping, uniqueness checks, and authorization assertion wrappers. Authorization itself is injected via a callback from `get-auth.ts`; operations never import from `auth/policies/access.ts`.
- Optional runtime companion modules stay plugin-owned. Use them only for behavior that cannot execute inside a Better Auth endpoint context, such as resource-server audience loading before `oauthProvider({ validAudiences })` is constructed.
- The BA model name (e.g. `"resourceServer"`) lives in `src/shared/constants.ts` as a `SCREAMING_SNAKE_CASE` const. Plugin-owned raw D1 exceptions must stay inside the owning plugin directory and document why the Better Auth adapter is not available yet.
- Model names must include JSDoc per architecture lint (`constants-jsdoc`).
- Custom plugin modules may use JSDoc at architectural boundaries. Keep comments focused on ownership and invariants rather than narrating each assignment.
- Use Zod for runtime data boundaries: plugin rows, request bodies, response bodies, OpenAPI fragments, and env/config values. Use TypeScript-only types for internal callback options and adapter capability surfaces that are never parsed from untrusted input.
- Natural-key uniqueness for plugin rows must be represented through supported plugin schema fields. For compound logical keys, persist a deterministic internal key with `unique: true`, compute it only in the owning endpoint operations, and omit it from public responses.

## Writing a new plugin

1. Create `plugins/<name>/` with the files above.
2. Define the canonical row schema and request body schemas in `schema.ts`. Put Better Auth-only storage hints in `.meta().betterAuth`, then strip those hints from generated OpenAPI output.
3. Derive and export module-scope artifacts from `schema.ts`: `<name>BetterAuthFields`, OpenAPI response schemas, and OpenAPI request bodies. Add snapshot-style tests for the derived BA field map.
4. Define the BA schema block in `index.ts` using the precomputed field map. Define endpoint metadata constants at module scope, then wire explicit `createAuthEndpoint` calls inside the plugin factory.
5. Export `PluginOptions` from `types.ts`. Include `authorize` as a callback when access depends on platform or organization policy. Never import `isPlatformAdmin` / `hasOrganizationAccess` directly inside the plugin.
6. Put helper logic in `operations.ts`: payload construction, authorization wrappers, uniqueness checks, and adapter-row helpers.
7. Add a plugin-owned runtime companion only when Better Auth requires data before the plugin endpoint context exists. Keep caching and invalidation in that companion instead of Hono routes or infrastructure persistence.
8. Register the plugin in `get-auth.ts` under the `plugins` array, passing callbacks composed from the appropriate auth boundary modules.
9. Write tests in `workers/core/tests/auth/<name>-*.test.ts`. Unit-test schema derivation, runtime companions, and operations without a BA context. BA endpoint handlers are integration-tested separately.

## Resource-server implementation notes

`id-resource-server` is the current template for custom Better Auth plugins in this repo:

- `schema.ts` owns the canonical resource-server Zod model and exports the precomputed BA field map. That keeps schema walking and OpenAPI conversion out of the per-request plugin factory path in warm Cloudflare Worker isolates.
- `audiences.ts` owns the pre-auth OAuth audience runtime. It uses a short per-isolate memory cache before KV, falls back to the plugin-owned D1 query on cache miss, writes the same KV key with TTL, and exposes invalidation for mutation endpoints. Auth route mounting should call it only for OAuth endpoints that validate resource audiences.
- `index.ts` still contains six endpoint declarations. That is acceptable because these are the actual Better Auth contract declarations; extracting them into a generic CRUD builder would hide route-specific validation, authorization, and cache-invalidation behavior.
- `types.ts` remains separate from `schema.ts` because plugin options are runtime composition hooks. If this pattern is promoted to `packages/`, schema generation utilities can move first; app-specific callbacks should stay at the auth-worker boundary.
