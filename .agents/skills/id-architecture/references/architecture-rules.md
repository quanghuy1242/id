# id Architecture Rules

## Source Of Truth

The implementation must follow the local docs first:

- `docs/000_repo-architecture.md`
- `docs/001_first-batch-plan.md`
- `docs/002_implementation-sequence.md`
- `docs/reference/content-api-architecture.md`
- `/home/quanghuy1242/pjs/content-api` for enforcement patterns

When docs and code disagree, fix code or stop and ask if the docs are ambiguous. Do not invent endpoints, fields, resource names, or topology exceptions.

## Clean Architecture Boundaries

`workers/core/src/domain` contains business vocabulary:

- entities and value shapes
- repository interfaces
- policies and authorization vocabulary
- no framework, Hono, Better Auth, Drizzle, D1/KV, or infrastructure imports

`workers/core/src/application` contains use cases:

- one explicit workflow per operation
- loads domain models through repository interfaces
- invokes policies and throws shared application errors
- no Hono context, request objects, Drizzle rows, SQL, or Better Auth imports

`workers/core/src/http` contains transport concerns:

- route registration with `@hono/zod-openapi`
- Zod/OpenAPI input and output schemas
- presenters that convert domain objects to documented JSON
- middleware for request context, optional authentication, and error shaping
- no permission logic beyond requiring an authenticated actor for protected use cases
- no database calls

`workers/core/src/infrastructure` contains persistence:

- `CrudAdapter` centralizes common row CRUD and shared persistence behavior
- `repositories/drizzle-*.repository.ts` implements domain repository interfaces
- `repositories/mappers/*.mapper.ts` owns row/entity conversion
- repositories must not contain policy or permission checks

`workers/core/src/composition` contains wiring:

- request-scoped construction of repositories, policies, and use cases
- runtime environment parsing
- dependency injection only, not business logic

`workers/core/src/auth` contains Better Auth integration:

- Better Auth factory and CLI/schema-generation export
- Better Auth plugin config
- custom Better Auth plugin schemas and endpoints
- no domain/application leakage of Better Auth imports

`workers/core/src/shared` is intentionally small:

- errors shared across layers
- constants
- cursor pagination primitives
- reusable validation fields
- no resource-specific behavior and no unused generic abstractions

`workers/ui` contains admin presentation:

- Vinext/App Router route files
- service binding calls through explicit UI-side helpers
- no Better Auth, Drizzle, Jose, D1/KV binding types, or imports from `workers/core`

`packages/lib` contains framework-free shared contracts:

- DTOs, constants, paths, API-client helpers, and errors
- no React, Hono, Better Auth, Drizzle, Jose, D1/KV, or UI dependencies

`packages/ui` contains Lumina UI primitives:

- React components and UI composition helpers
- no auth, persistence, signing, or core worker behavior

## Constant Placement Rule

Numeric literal values must be extracted to named constants:

- Magic numbers (numeric literals except 0 and 1) are forbidden in core `application`, `domain`, `http`, and `shared` layers.
- Cross-cutting constants belong in `workers/core/src/shared/constants.ts` or `packages/lib/src/constants.ts`.
- Resource-specific constants belong in `workers/core/src/domain/<resource>/`.
- Named constants must use `SCREAMING_SNAKE_CASE`.
- 0 and 1 are exempt as universal base values.
- Property keys, enum members, and type annotations are exempt as definition sites.
- Infrastructure layer is exempt from this rule.

## Error Placement Rule

Typed errors that cross layer boundaries belong in `workers/core/src/shared/errors.ts`.

- API-visible failures should extend `AppError` and be rendered only by HTTP error middleware.
- Internal cross-layer control-flow signals may extend `Error`, but still belong in `shared/errors.ts` when application and infrastructure both need the type.
- Storage-driver error parsing belongs in infrastructure helpers.
- Never parse SQLite, D1, Drizzle, or Cloudflare error messages in core `application`, `domain`, `http`, or `shared`.
- Repositories and workflow implementations must translate storage failures into shared typed errors or let unknown failures bubble to the global internal-error envelope.

## Mapper Placement Rule

Persistence mapping is infrastructure:

- `workers/core/src/infrastructure/repositories/mappers/*.mapper.ts` owns row-to-domain and domain-to-row conversion.
- Repositories and infrastructure workflow ports call mappers at the persistence boundary.
- Domain entities must not know Drizzle column names.
- Application use cases must not build Drizzle rows, call row mappers, or shape response DTOs.
- HTTP presenters are separate from persistence mappers; presenters map domain objects to documented API JSON.
- Do not import infrastructure mappers from `domain`, `application`, `http`, or `shared`.
- Mapper files must not import `application`, `http`, or `composition`.
- Mapper functions must accept exactly one object argument, map fields explicitly, and never return or spread the input object directly.
- Row-to-domain mappers for entities must call `Entity.reconstitute(...)`.
- Domain-to-row mappers for entities must call `entity.toSnapshot()`.

## Entity Rule

Before adding a new domain entity or resource, read an existing comparable resource from entity through tests and copy the repo's established shape.

Entity files must follow this exact class model:

- `XxxProps` is the full persisted snapshot and includes generated fields such as `id`, timestamps, generated slugs, default status/visibility, and lifecycle timestamps.
- `CreateXxxProps` is always `Omit<XxxProps, "...generated fields...">`; do not use `Pick` for create props.
- `static create(input: CreateXxxProps)` owns every generated field it assigns.
- `private constructor(private props: XxxProps)` is the only constructor shape.
- `static reconstitute(props: XxxProps)` rebuilds from trusted persistence/idempotency snapshots.
- `toSnapshot(): XxxProps` is required before persistence mapping, response spreading, or idempotency serialization.
- Use getters for entity fields; clone mutable values such as arrays on read/snapshot.
- Use entity methods such as `update(...)`, `enable()`, and `disable()` for mutation. Use cases should not rebuild replacement entities with spread snapshots when a mutation method is appropriate.
- Do not pass entity instances directly to `JSON.stringify(...)` or object spread in application/http code.

## CRUD Adapter Rule

The docs say common resource persistence belongs in `CrudAdapter`, not duplicated in each repository:

- list pagination
- id lookups
- arbitrary first-row lookups
- insert rows
- update rows with undefined omitted
- delete rows by id
- simple equality filters and stable cursor conditions

Repositories may provide table-specific predicates, mapping, and specialized lookups. They should still call `CrudAdapter` for common insert/update/delete/list/find behavior.

Every public `CrudAdapter` method needs JSDoc that states the invariant it centralizes. If a repository needs common behavior that is not covered by the adapter, add a small adapter method instead of duplicating raw persistence mechanics in each repository.

Repository and workflow implementation rules:

- `drizzle-*.repository.ts` and `drizzle-*.workflow.ts` must import and use infrastructure mappers.
- Do not call `Entity.reconstitute(...)` in repositories or workflows; row/entity reconstitution belongs in mappers.
- Do not import policies; authorization belongs in use cases and domain policies.
- Do not call `this.db.insert(...)`, `this.db.update(...)`, or `this.db.delete(...)` directly. Use `CrudAdapter`.
- `this.db.batch(...)` is only for infrastructure workflow ports and should batch statements built by `CrudAdapter`.

## Better Auth Boundary Rule

Better Auth is a runtime integration boundary:

- Allowed: `workers/core/src/auth/**`, approved core mounting files, Better Auth CLI/schema-generation files, and tests.
- Forbidden: `domain`, `application`, ordinary `http` route modules, `infrastructure`, `packages/lib`, and `workers/ui`.
- Custom first-batch tables live in Better Auth plugin `schema` definitions, not standalone Drizzle schemas.
- The `idResourceServer` plugin owns resource server table schema and endpoints.

## Worker And Package Boundary Rules

- `worker-isolation`: core and UI workers never import each other. Use service bindings at runtime.
- `core-no-ui-deps`: core never imports React, React DOM, Vinext, Vite UI plugins, React Aria, Lucide React, or `@id/ui`.
- `ui-no-auth-deps`: UI never imports Better Auth, Drizzle, Jose, D1/KV types, or core source.
- `packages-lib-isolation`: `packages/lib` remains framework-free and only imports relative files or itself.
- `auth-boundary`: Better Auth imports stay in approved core auth boundary files.
- `admin-auth-required`: every `/api/admin/*` OpenAPI route handler calls `requireActor(c)`.

## OpenAPI Route Rule

Every core API route must be registered through `createRoute` plus `app.openapi`. Plain `app.get`, `app.post`, `app.patch`, or `app.delete` should not appear in API route modules.

Route modules should follow this shape:

```ts
const resourceRoute = createRoute({
  method: "post",
  path: "/api/admin/resources",
  security: bearerSecurity,
  request: { body: { required: true, content: { "application/json": { schema } } } },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: responseSchema } },
    },
  },
});

app.openapi(resourceRoute, async (c) => {
  requireActor(c);
  const input = c.req.valid("json");
  const result = await getContainer(c).resources.create.execute(input);
  return c.json(result, 201);
});
```

Rules:

- import `z` from `@hono/zod-openapi`
- use presenters for response JSON when responses become non-trivial
- use `c.req.valid("param" | "query" | "json" | "header")`; do not call raw request parsers
- add exactly `security: bearerSecurity` to protected operations
- routes declaring `security: bearerSecurity` must call `requireActor(c)` in the handler
- `/api/admin/*` routes must call `requireActor(c)`
- route handlers should call exactly one use case `.execute(...)`
- let use cases and policies enforce authorization
- route handlers must not read `c.env`, call global `fetch`, use `crypto`, call `JSON.parse`/`JSON.stringify`, call direct storage methods, or construct `Request`/`Response` manually

## UI Composition Rule

The Phase 3 UI gate must fail admin route files for:

- raw JSX layout/typography elements such as `<div>`, `<main>`, `<section>`, `<h1>`, `<p>`, and `<span>`
- raw Tailwind/DaisyUI classes
- direct `fetch()`
- imports from `workers/core/**`
- imports of Better Auth, Drizzle, Jose, or D1/KV types

Valid admin route files compose `@id/ui` primitives and pass shaped data only.

## Testing And Audits

After modifying architecture, run:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Useful audits:

```bash
rg -n "app\\.(get|post|patch|delete)\\(" workers/core/src/http workers/core/src/main.ts
rg -n "this\\.db\\.(insert|update|delete|batch)\\(" workers/core/src/infrastructure/repositories
rg -n "\\.insert\\(|\\.update\\(|\\.delete\\(" workers/core/src/infrastructure workers/core/src/application workers/core/src/domain workers/core/src/http
rg -n "@/infrastructure|@/http" workers/core/src/domain workers/core/src/application
rg -n "UNIQUE constraint failed|SQLite|D1" workers/core/src/application workers/core/src/domain workers/core/src/http
rg -n "repositories/mappers" workers/core/src/application workers/core/src/domain workers/core/src/http workers/core/src/shared
rg -n "from \"zod\"" workers/core/src/http/schemas workers/core/src/shared
rg -n "from \"better-auth|from \"@better-auth" workers/core/src workers/ui/src packages
rg -n "from \"react|from \"vinext|from \"@id/ui" workers/core/src
rg -n "from \"better-auth|from \"drizzle-orm|from \"jose|D1Database|KVNamespace" workers/ui/src
```

Expected exceptions:

- Better Auth imports inside `workers/core/src/auth/**`
- Hono adapter code in worker entry files
- SQLite/D1 error parsing inside `workers/core/src/infrastructure/persistence/**`
- mapper imports inside `workers/core/src/infrastructure/**`
- UI dependencies inside `packages/ui/**` and `workers/ui/**`
