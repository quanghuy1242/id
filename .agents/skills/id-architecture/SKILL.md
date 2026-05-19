---
name: id-architecture
description: Use this skill whenever working with the id repository — whether analyzing, reviewing, reading, answering questions about, or modifying its architecture, Cloudflare Worker routes, Better Auth boundary, OAuth/JWKS behavior, admin API routes, domain entities, use cases, repositories, shared packages, UI worker boundaries, tests, or deployment workflow behavior.
---

# id Architecture

## Start Here

Use this skill to preserve the clean architecture of the local `id` repo. Before editing, read the source docs that govern the change:

- `docs/000_repo-architecture.md`
- `docs/001_first-batch-plan.md`
- `docs/002_implementation-sequence.md`
- `docs/reference/content-api-architecture.md`
- `/home/quanghuy1242/pjs/content-api` code when porting architecture enforcement patterns

For detailed file-level rules, read [references/architecture-rules.md](references/architecture-rules.md).

## Required Workflow

1. Identify the worker/package/layer touched by the request before editing.
2. Read the matching docs and existing implementation for the same pattern.
3. Keep core Hono routes thin: validate OpenAPI input, call `requireActor(c)` for `/api/admin/*`, call one use case, present output.
4. Keep authorization in use cases/domain policies or explicit auth helpers, never in repositories.
5. Keep typed application failures in `workers/core/src/shared/errors.ts`; keep storage-driver error parsing inside infrastructure only.
6. Keep row/entity conversion in `workers/core/src/infrastructure/repositories/mappers/*.mapper.ts`; do not inline mapping in routes or use cases.
7. Keep D1/Drizzle code in infrastructure repositories and shared CRUD in `CrudAdapter`.
8. Keep Better Auth imports inside `workers/core/src/auth/**`, approved mounting files, and tests.
9. **Custom tables belong in Better Auth plugin `schema` definitions**, never as standalone Drizzle table definitions in `workers/core/src/infrastructure/db/schema.ts`. Every new table must be defined through a BA plugin that owns its schema, migrations, and CRUD operations. New standalone Drizzle tables require explicit architecture-plan approval.
10. Keep `workers/ui` free of Better Auth, Drizzle, Jose, D1/KV binding types, and core source imports.
11. Run targeted audits after edits, then `corepack pnpm lint`, `corepack pnpm check:dup`, `corepack pnpm typecheck`, and `corepack pnpm test`.
12. Treat `corepack pnpm lint` as the architecture gate as well as the code-style gate; it must catch layer-boundary, entity, mapper, repository, persistence, Better Auth boundary, worker boundary, package boundary, UI route composition, and route violations before review.
12. If the change introduces lint failures that the repo can auto-correct safely, run `corepack pnpm lint:fix` and re-run `corepack pnpm lint`.
13. Run `corepack pnpm advise` after substantial code changes and treat the output as review input, not a hard architecture gate.

## Layer Rules

- `workers/core/src/domain/**`: entities, repository interfaces, policies, and authorization vocabulary. No Hono, Better Auth, Drizzle, D1/KV, or infrastructure imports.
- `workers/core/src/application/**`: explicit use cases and workflow logic. Depends on domain interfaces and shared errors only.
- `workers/core/src/http/**`: OpenAPI route definitions, request/response schemas, presenters, and middleware. No Drizzle and no resource-specific permission logic.
- `workers/core/src/infrastructure/**`: persistence adapters, repository implementations, and row/entity mappers. No permission decisions.
- `workers/core/src/composition/**`: request-scoped dependency wiring only.
- `workers/core/src/auth/**`: Better Auth factory, plugin config, plugin schemas/endpoints, and CLI auth exports.
- `workers/core/src/shared/**`: small cross-cutting primitives used by multiple layers, such as errors, constants, pagination, and reusable validation fields.
- `workers/ui/src/app/**`: Vinext App Router route composition only. Admin page files use `@id/ui` primitives, not raw app markup/classes/fetch.
- `packages/lib/src/**`: framework-free contracts, constants, paths, errors, and API-client helpers.
- `packages/ui/src/**`: reusable Lumina UI primitives and app-shell components.

## Error Rules

- Put API-visible application errors and cross-layer control-flow errors in `workers/core/src/shared/errors.ts`.
- Use cases and policies may throw shared errors, but must not depend on HTTP response objects or infrastructure error classes.
- Infrastructure may catch SQLite/D1/Drizzle-specific errors, but must translate them before crossing into application code.
- Do not parse storage error messages in `workers/core/src/application/**`, `workers/core/src/domain/**`, `workers/core/src/http/**`, or `workers/core/src/shared/**`.
- Keep HTTP error envelope shaping in middleware/presenters.

## Mapper Rules

- Row/entity conversion belongs in `workers/core/src/infrastructure/repositories/mappers/*.mapper.ts`.
- Repository and workflow implementations should call mappers before persistence and after reads.
- Use cases should build or mutate domain entities, not Drizzle rows.
- HTTP presenters convert domain objects to response JSON; they are not persistence mappers.
- Do not import infrastructure mappers outside `workers/core/src/infrastructure/**`.
- Mapper files must not import `application`, `http`, or `composition`.
- Mapper functions must accept one object argument, map fields explicitly, and never return or spread the input object directly.
- Entity row-to-domain mappers must call `Entity.reconstitute(...)`.
- Entity-to-row mappers must derive persistence payloads from `entity.toSnapshot()`.

## Persistence Rules

- Common CRUD behavior belongs in `CrudAdapter`.
- Add JSDoc for every public `CrudAdapter` method because it defines repository behavior across resources.
- Resource repositories own table-specific predicates and mapper calls, but should not duplicate common CRUD mechanics.
- Workflow-specific repositories may compose multiple `CrudAdapter` statements into `db.batch(...)`; they must still keep Drizzle details in infrastructure.
- Storage-driver helpers belong under `workers/core/src/infrastructure/persistence/**`.
- `workers/core/src/infrastructure/repositories/drizzle-*.repository.ts` and `drizzle-*.workflow.ts` must import the relevant infrastructure mapper.
- Repository and workflow code must not call `Entity.reconstitute(...)` directly; that belongs in mappers.
- Repository and workflow writes must go through `CrudAdapter` helpers.
- Repositories and workflows must not import policies; authorization stays in use cases and domain policies.

## Better Auth Rules

- Better Auth is a runtime integration boundary.
- Better Auth imports are allowed in `workers/core/src/auth/**`, selected core mounting files, schema/CLI auth files, and tests.
- Domain and application code must not import Better Auth.
- Custom first-batch tables are Better Auth plugin schemas, not standalone Drizzle schema definitions.
- The first custom plugin is `idResourceServer` under `workers/core/src/auth/plugins/resource-server/**`.
- Phase 2 must prove route maps, JWKS behavior, valid audience shape, custom claims, and schema generation against installed packages.

## OpenAPI Rules

All core API routes must use `@hono/zod-openapi`:

- Use `OpenAPIHono`, `createRoute`, and `app.openapi`.
- Use `c.req.valid("param" | "query" | "json" | "header")`; do not manually parse route input.
- Do not call raw route request parsers such as `req.json()`, `req.query()`, `req.param()`, `req.header()`, `req.text()`, `req.formData()`, or `req.parseBody()` in route modules.
- Route schemas must import `z` from `@hono/zod-openapi`.
- Authenticated operations must declare `security: bearerSecurity`.
- Routes declaring `security: bearerSecurity` must call `requireActor(c)` in the handler.
- `/api/admin/*` routes must call `requireActor(c)` even when reached over service bindings.
- Route handlers must call exactly one use case `.execute(...)`; do not orchestrate multiple workflows in a route.
- Route handlers must stay thin: no direct `c.env`, global `fetch`, `crypto`, JSON serialization, storage calls, or manual `Request`/`Response` construction.

## Entity Class Rules

All `workers/core/src/domain/**/*.entity.ts` files must use the same class model:

- Export the domain entity class plus supporting exported type aliases.
- Use `export type XxxProps = { ... }` as the full persisted snapshot. It includes generated fields such as `id`, timestamps, generated slugs, status fields, and nullable lifecycle timestamps.
- Use `private constructor(private props: XxxProps)`.
- Use `static create(input: CreateXxxProps): Xxx` for new entities. It owns generated fields such as `crypto.randomUUID()`, timestamps, generated slugs, default status, and lifecycle timestamps.
- Use `export type CreateXxxProps = Omit<XxxProps, "...generated fields...">`; do not use `Pick` for create props.
- `CreateXxxProps` must omit every field assigned by `static create(...)`.
- Use `static reconstitute(props: XxxProps): Xxx` only for trusted persistence/idempotency snapshots.
- Add getters for entity fields; clone mutable references such as arrays on read and in `toSnapshot()`.
- Use `update(input: UpdateXxxProps)` for mutable entities and update timestamps inside the entity when the resource has `updatedAt`.
- Use `toSnapshot(): XxxProps` before persistence mapping, response spreading, or idempotency serialization.
- Never pass domain entity instances directly to `JSON.stringify(...)` or object spread in application/http code.

## Worker And Package Boundaries

- Core must not import React, React DOM, Vinext, React Aria, Lucide React, Vite UI plugins, or `@id/ui`.
- UI must not import Better Auth, Drizzle, Jose, D1/KV binding types, or core source.
- `packages/lib` may only import relative files or itself.
- `packages/ui` may use React and UI dependencies, but must not own auth/persistence/signing behavior.
- Service binding traffic is internal transport, not trust. Core admin routes authorize every request.

## Oxlint Architecture Gate

`scripts/oxlint-js-plugins/architecture.js` is the executable version of these rules. It enforces all content-api rules plus id-specific worker/package/auth/admin rules.

When explicitly asked to change, rename, debug, or extend this linter, use the local `id-architecture-lint` skill first. Do not use that linter-maintenance skill for ordinary feature-work lint failures; fix the code instead.
