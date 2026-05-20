---
name: id-architecture
description: Use this skill when working in the id repository architecture: docs, Workers, Better Auth boundaries, OAuth/JWKS, admin APIs, shared packages, UI worker boundaries, tests, or deployment workflow.
---

# id Architecture

Use this skill to keep the local `id` repo aligned with its architecture without re-reading every rule on every task.

## Start Here

Read only the docs needed for the task:

- Repository and boundaries: `docs/000_repo-architecture.md`
- Product scope: `docs/001_first-batch-plan.md`
- Phase order/status: `docs/002_implementation-sequence.md`
- Detailed lint rules, only when needed: `references/architecture-rules.md`

## First Decision

Identify which boundary the change touches:

- `workers/core/src/auth/**`: Better Auth factory, plugins, plugin schemas/endpoints, CLI/schema generation.
- `workers/core/src/http/**`: Hono routes and presenters.
- `workers/core/src/domain/**` or `application/**`: entities, policies, use cases, repository interfaces.
- `workers/core/src/infrastructure/**`: Drizzle/D1 persistence for Hono-owned resources only.
- `workers/ui/**`: Vinext admin presentation under `/admin/*` and UI-owned BFF placeholders under `/admin/api`.
- `packages/lib/**`: framework-free shared contracts.
- `packages/ui/**`: reusable UI primitives.
- docs/skills only: keep architecture claims synchronized with current code and pinned package types.

## Hard Invariants

- Two Workers: `core-id` owns Better Auth, OAuth, D1/KV, JWKS, admin APIs, and domain rules; `ui-id` owns presentation under `/admin/*` and calls same-origin core `/api/auth/*` endpoints from browser pages when needed.
- Workers never import each other. Shared code lives in `packages/`.
- `packages/lib` is framework-free.
- Better Auth imports stay in `workers/core/src/auth/**`, approved mounting/schema files, or tests.
- Domain/application code never imports Better Auth, Hono, Drizzle, D1/KV, or Worker binding types.
- UI code never imports Better Auth, Drizzle, Jose, D1/KV types, or core source.
- Service binding traffic is transport, not trust. Core admin behavior still authorizes every request.

## Custom Table Rule

Custom tables belong to Better Auth plugins, not standalone Drizzle schemas.

- First-batch custom table: `idResourceServer` owns `resource_servers` through plugin `schema`.
- Plugin CRUD uses `createAuthEndpoint` and Better Auth endpoint context/adapter APIs.
- Plugin endpoints mount under the Better Auth base path, expected as `/api/auth/admin/resource-servers...` with the current base path.
- Do not add `workers/core/src/infrastructure/db/schema.ts` tables for first-batch custom data.
- Do not create `CrudAdapter`, mapper, repository, or entity layers for plugin-owned CRUD.
- Hono `/api/admin/*` routes are for aggregate reads or non-BA-owned workflows; they call `requireActor(c)`, call one use case, and present output.

## Pattern Reminders

- Entity classes use private constructor, `create`, `reconstitute`, getters, mutator methods, and `toSnapshot()`.
- Persistence mappers live only in `workers/core/src/infrastructure/repositories/mappers/*.mapper.ts` and explicitly map fields.
- Repositories use `CrudAdapter` only for Hono-owned Drizzle resources.
- Use cases depend on domain interfaces and shared errors, not HTTP or infrastructure.
- Core route handlers call `requireActor(c)` for `/api/admin/*`, exactly one use case, and presenters.
- Admin UI route files compose `@id/ui` primitives; no raw route HTML/classes/fetch/core imports.

## Verification

Match checks to the change:

- Docs/skill-only changes: run text searches for stale claims; run `pnpm typecheck` only if code/type claims need confirmation.
- Source or config changes: run the narrow relevant check first, then `pnpm lint`, `pnpm check:dup`, `pnpm typecheck`, and `pnpm test`.
- Substantial source changes: run `pnpm advise` and handle or suppress findings according to `AGENTS.md`.

Known current status from 2026-05-19 docs review: Phase 0 scaffold exists; Phase 1 enforcement is wired but not clean until current `pnpm lint` and `pnpm test` failures are fixed without loosening rules.
