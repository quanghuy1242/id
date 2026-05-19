Now I have all the information needed. Here is the comprehensive summary:

---

# Content API Codebase Architecture - Detailed Summary

## 1. Full Directory Tree

```
/home/quanghuy1242/pjs/content-api/
├── .advise-suppressions.json          # Known advisory noise suppression list
├── .dev.vars.example                  # Local secret vars template
├── .github/workflows/ci-deploy.yml    # CI/CD pipeline (check → migrate → deploy-api + deploy-media-processor)
├── .oxlintrc.json                     # Oxlint config with architecture JS plugin + override rules
├── AGENTS.md                          # Agent/LLM workflow instructions
├── README.md                          # Project overview and setup guide
├── docs/
│   ├── architecture.md                # Master architecture specification (1803 lines)
│   ├── 001_idempotency-batch-design.md
│   ├── 002_media-upload-flow.md
│   ├── 003_entity-classes-and-oxlint-arch-linting.md
│   ├── 004_code-duplication-and-abstraction-linting.md
│   ├── payloadcms-schema-spec.md
│   └── payloadcms-access-control-policy-spec.md
├── drizzle/
│   ├── 0000_dapper_korvac.sql
│   ├── 0001_unique_starhawk.sql
│   ├── 0002_media_upload_flow.sql
│   └── meta/                            # Drizzle journal + snapshots
├── drizzle.config.ts                   # Drizzle Kit config
├── package.json                        # Scripts, deps
├── patches/zod@4.4.3.patch             # Patched zod dependency
├── pnpm-lock.yaml
├── pnpm-workspace.yaml                 # Workspace root
├── scripts/
│   ├── check-duplication-threshold.mjs  # Fallow hard-gate wrapper (3% threshold)
│   ├── filter-advise.mjs               # Filters Aislop+Fallow output through suppressions
│   └── oxlint-js-plugins/
│       └── architecture.js             # 1258-line oxlint JS plugin with 16 architecture rules
├── src/
│   ├── main.ts                         # Worker entry point: creates Hono app, wires middleware + container
│   ├── application/                    # Use cases (workflow logic)
│   │   ├── auth/                       # authenticate-bearer-token.usecase.ts
│   │   ├── categories/                 # create/get/list/update/delete-category.usecase.ts
│   │   ├── deferred-grants/            # CRUD use cases for deferred grants
│   │   ├── grant-mirror/               # CRUD use cases for grant mirrors
│   │   ├── media/                      # 10 use cases: create-upload, delete, generate-derivatives,
│   │   │                               #   get, list, process-upload, publish, unpublish, serve-variant, update
│   │   ├── posts/                      # CRUD + publish/unpublish use cases
│   │   ├── relationships/              # create/delete/list relationship use cases
│   │   └── users/                      # CRUD user use cases
│   ├── composition/                    # DI wiring only
│   │   └── create-request-container.ts # Builds the entire request-scoped object graph
│   ├── config/
│   │   └── env.ts                      # Zod-validated env parsing + AppBindings type
│   ├── domain/                         # Pure domain: entities, repository interfaces, policies, workflows
│   │   ├── authz/                      # Actor, AssertCan, Relationship entity + repository, ReBAC helpers
│   │   ├── categories/                 # Category entity + repository + policy
│   │   ├── deferred-grants/            # DeferredGrant entity + repository + policy
│   │   ├── grant-mirror/               # GrantMirror entity + repository + policy
│   │   ├── idempotency/                # IdempotencyRecord type + repository interface
│   │   ├── media/                      # Media entity + repository + policy + workflow + object-storage interface + image-service interface
│   │   ├── posts/                      # Post entity + repository + policy + workflow interface
│   │   └── users/                      # User entity + repository + policy
│   ├── http/                           # Hono HTTP adapter layer
│   │   ├── app-env.ts                  # AppEnv type (Bindings + Variables with container, actor, requestId)
│   │   ├── middleware/                  # auth, error, request middleware
│   │   ├── openapi.ts                  # Shared OpenAPI helpers (jsonContent, bearerSecurity, etc.)
│   │   ├── presenters/                 # Entity-to-JSON presenters (authz, category, media, post, user)
│   │   ├── routes/                     # Route modules (*.routes.ts) + index + helpers
│   │   ├── schemas/                    # Zod schemas per resource (authz, categories, common, media, posts, users)
│   │   └── swagger-ui.ts              # Swagger UI helper
│   ├── infrastructure/                 # Concrete implementations of domain interfaces
│   │   ├── db/
│   │   │   ├── client.ts              # createDb() — Drizzle/D1 factory
│   │   │   └── schema.ts             # Drizzle schema definitions (users, categories, posts, media, etc.)
│   │   ├── images/
│   │   │   └── cloudflare-images-service.ts  # Cloudflare Images binding adapter
│   │   ├── persistence/
│   │   │   ├── crud-adapter.ts        # Shared CRUD adapter (listRows, findRowById, insertRow, etc.)
│   │   │   └── sqlite-errors.ts       # isSqliteUniqueConstraintError() helper
│   │   ├── repositories/
│   │   │   ├── drizzle-*.repository.ts    # 8 Drizzle-backed repository implementations
│   │   │   ├── drizzle-*-create.workflow.ts # 4 transaction workflow ports (batch inserts with idempotency)
│   │   │   └── mappers/
│   │   │       └── *.mapper.ts            # 8 mapper files (row↔entity conversion)
│   │   └── storage/
│   │       ├── r2-object-storage.ts        # R2 Bucket adapter implementing ObjectStorage interface
│   │       └── r2-presigned-url-signer.ts  # AWS4-HMAC-SHA256 presigned URL signer
│   ├── shared/                         # Cross-layer primitives (allowed by all layers)
│   │   ├── constants.ts               # HTTP status codes, pagination limits, media variants, idempotency config
│   │   ├── errors.ts                  # AppError base + all error subclasses + toErrorResponse()
│   │   ├── idempotency.ts             # sha256Hex helper
│   │   ├── media/                     # Media-specific shared constants
│   │   ├── pagination/
│   │   │   └── cursor.ts             # Cursor encode/decode
│   │   └── validation/
│   │       └── fields.ts             # Reusable Zod field schemas
│   └── types/                          # Ambient type declarations
│       ├── cloudflare-env.d.ts        # D1Database, R2Bucket, ImagesBinding types
│       └── raw.d.ts                   # ?raw import module declaration
├── tests/
│   ├── api.test.ts                     # API integration tests (401, 403, 404, media lifecycle)
│   └── media-upload.test.ts           # Media upload flow tests
├── tsconfig.json                       # TypeScript config with @/* path alias
├── vitest.config.mts                   # Vitest with @cloudflare/vitest-pool-workers
├── wrangler.jsonc                      # Production Cloudflare Worker config
├── wrangler.test.jsonc                 # Test wrangler config (mock credentials)
└── workers/
    └── media-processor/               # Separate Cloudflare Worker for queue-based media processing
        ├── src/
        │   ├── index.ts              # Queue handler: R2 event → ProcessMediaUploadUseCase
        │   └── config.ts             # Zod-validated env for the processor
        ├── tsconfig.json
        └── wrangler.jsonc            # Worker config: queue consumer, D1, R2, Images bindings
```

---

## 2. Package.json Scripts (Quality and Build Pipeline)

| Script | What it does |
|--------|-------------|
| `lint` | `oxlint` — single-pass lint with 178 rules (166 built-in + 12 architecture plugin rules) |
| `lint:fix` | `oxlint --fix` — auto-fix safe issues |
| `check` | **Hard gate:** `pnpm lint && pnpm check:dup && pnpm typecheck && pnpm test` |
| `check:dup` | `node scripts/check-duplication-threshold.mjs` — Fallow mild duplication at <3% threshold |
| `typecheck` | `tsc --noEmit` — TypeScript type checking |
| `test` | `vitest run` (with Cloudflare Workers pool) |
| `test:watch` | `vitest` (watch mode) |
| `advise` | `node scripts/filter-advise.mjs` — advisory Aislop + semantic Fallow (filtered through `.advise-suppressions.json`) |
| `advise:raw` | Unfiltered Aislop + Fallow (bypasses suppressions) |
| `advise:aislop` | `aislop scan` — broad agent-output scanner |
| `advise:dupes` | `fallow dupes --mode semantic --min-tokens 150 --min-lines 10` — conservative semantic duplication |
| `advise:json` | Machine-readable Aislop JSON output |
| `db:generate` | Drizzle Kit schema → SQL migration generation |
| `db:migrate:local` / `db:migrate:remote` | Apply D1 migrations |

**Key dependencies:** hono 4.12.19, drizzle-orm 0.45.2, zod 4.4.3, jose 6.2.3, oxlint ^1.65.0, typescript 6.0.3, vitest 4.1.6, fallow 2.75.0, aislop 0.9.0

---

## 3. Config Files Summary

### `.oxlintrc.json`
- **6 built-in plugins:** typescript, unicorn, oxc, vitest, import, promise
- **1 JS plugin:** `./scripts/oxlint-js-plugins/architecture.js` (16 custom rules)
- **Categories:** correctness=error, suspicious=error, perf=warn
- **Key built-in rules:** `no-console`=error, `eqeqeq`=error, `import/no-cycle`=error, `typescript/no-explicit-any`=error
- **Overrides:** All `architecture/*` rules are `off` for `tests/**` and `**/*.d.ts` files; route-module off for `docs.routes.ts`
- **Layer-imports config** is embedded in the rule options (internalAllowed + externalBanned maps)

### `tsconfig.json`
- Target: ES2022, module: ESNext, moduleResolution: Bundler
- `strict: true`, `noEmit: true`
- Path alias: `@/*` → `src/*`
- Types: `@cloudflare/workers-types`, `node`, `vitest/globals`

### `vitest.config.mts`
- Uses `@cloudflare/vitest-pool-workers` with `cloudflarePool` and `cloudflareTest` plugin
- Test config points to `wrangler.test.jsonc`

### `wrangler.jsonc` (API Worker)
- Bindings: D1 (`DB` on `content_api`), R2 (`MEDIA_R2` on `content-api-media`)
- Vars: auth issuer, audience, JWKS URL, R2 bucket name, max upload bytes (10MB), upload URL TTL (300s)

### `wrangler.test.jsonc` (Test Worker)
- Same bindings as production but with mock R2 credentials (local-access-key/local-secret-key)

### `workers/media-processor/wrangler.jsonc` (Media Processor Worker)
- Shares the same D1 + R2 bindings as the API Worker
- Additional: `IMAGES` binding (Cloudflare Images), queue consumer on `media-processing`

---

## 4. Source Structure Deep Dive

### Layer Architecture (Hexagonal / Clean Architecture)

The codebase enforces strict layer boundaries through the oxlint architecture plugin and `no-restricted-imports` rules. The layers are:

```
http/ ──┐
         ├──> application/ ──> domain/ ──> shared/
         │
composition/ ──> infrastructure/ ──> domain/ (interfaces) + shared/
```

**Detailed import rules:**

| Layer | May import from |
|-------|----------------|
| `domain/` | `@/domain/`, `@/shared/` only |
| `application/` | `@/application/`, `@/domain/`, `@/shared/` |
| `http/` | `@/application/`, `@/composition/`, `@/config/`, `@/domain/`, `@/http/`, `@/shared/` (NOT `@/infrastructure/db/`) |
| `infrastructure/` | `@/config/`, `@/domain/`, `@/infrastructure/`, `@/shared/` |
| `composition/` | `@/application/`, `@/composition/`, `@/config/`, `@/domain/`, `@/infrastructure/`, `@/shared/` |
| `shared/` | `@/shared/` only |

**Banned external imports per layer:**
- `domain/`: No `@hono/`, `hono`, `drizzle-orm`, `cloudflare:`, `@cloudflare/`
- `application/`: No `@hono/`, `hono`, `drizzle-orm`, `cloudflare:`, `@cloudflare/`
- `http/`: No `drizzle-orm`
- `infrastructure/`: No `@hono/`, `hono`

### Entry Point (`src/main.ts`)
1. Creates `OpenAPIHono<AppEnv>` app with Zod default hook that throws `ValidationError`
2. Registers global error handler (`handleAppError`)
3. **Three global middlewares in order:**
   - `requestContextMiddleware` — sets `c.set("requestId", crypto.randomUUID())`
   - **Container middleware** — `c.set("container", createRequestContainer(c.env, options))` — wires the full DI graph per request
   - `optionalAuthMiddleware` — reads `Authorization` header, calls `container.auth.execute(header)`, sets `c.set("actor", actor)` or `null`
4. Registers all resource routes via `registerRoutes(app)` + OpenAPI docs via `registerDocsRoutes(app)`
5. Export defaults the app; `createApp()` is exported for test injection

### Request-Scoped Container (`src/composition/create-request-container.ts`)

This file is the **only place** where HTTP bindings, infrastructure implementations, domain policies, and application use cases are wired together. It:

1. Parses env via `parseEnv(env)` (Zod-validated)
2. Creates D1 database via `createDb(env)` (Drizzle)
3. Instantiates all 8 infrastructure repositories (D1-backed, implementing domain interfaces)
4. Instantiates storage adapters (`R2ObjectStorage`, `R2PresignedUrlSigner`)
5. Instantiates 4 workflow ports (`DrizzlePostCreateWorkflow`, etc.)
6. Instantiates all domain policy objects, injecting `RelationshipRepository`
7. Returns a flat object grouped by resource with all use cases pre-wired:

```ts
return {
  auth: AuthenticateBearerTokenUseCase,
  users: { list, get, create, update, delete },
  categories: { list, get, create, update, delete },
  posts: { list, get, create, update, publish, unpublish, delete },
  media: { list, get, create, update, publish, unpublish, delete, serveVariant },
  grantMirror: { list, get, create, update, delete },
  deferredGrants: { list, get, create, update, delete },
  relationships: { list, create, delete },
}
```

**AppEnv type** (`src/http/app-env.ts`) types `c.get("container")` as `AppContainer = ReturnType<typeof createRequestContainer>`.

### Route Handler Pattern

Routes follow a strict pattern enforced by the `architecture/route-module` and `architecture/route-handler-boundary` oxlint rules:

```ts
// 1. Import createRoute + z from @hono/zod-openapi (NOT plain "zod")
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";

// 2. Define route with createRoute({...}) — method, path, request schema, responses
const mediaCreateRoute = createRoute({
  method: "post",
  path: "/media",
  security: bearerSecurity,   // <-- must pair with requireActor(c) in handler
  request: { headers: ..., body: ... },
  responses: { 201: ..., ...commonErrorResponses },
});

// 3. Register with app.openapi(route, handler)
export function registerMediaRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(mediaCreateRoute, async (c) => {
    const actor = requireActor(c);                    // Guards auth
    const body = c.req.valid("json");                 // NOT c.req.json()
    const headers = c.req.valid("header");            // NOT c.req.header()
    const result = await c.get("container").media.create.execute({
      actor,                                          // Exactly ONE .execute() call
      idempotencyKey: headers["idempotency-key"],
      input: body,
    });
    return c.json({ data: presentMediaUploadResult(result) }, HTTP_STATUS_CREATED);
  });
}
```

**Enforced rules (violations cause lint errors):**
- Must use `c.req.valid("param"|"query"|"json"|"header")` — no raw `c.req.json()`, `c.req.query()`, etc.
- Handler must call exactly ONE use case `.execute(...)`
- Must not access `c.env` directly (use composition/container)
- Must not call `fetch`, `crypto`, `JSON.parse`/`JSON.stringify`, or create `new Request()`/`new Response()` in handlers
- `requireActor(c)` usage must pair with `security: bearerSecurity` in the route definition

### Domain Entities (The Entity Class Pattern)

Every entity in `src/domain/**/*.entity.ts` follows a strict class pattern verified by `architecture/entity-class` rule:

```ts
export type XxxProps = { /* all fields, including id, createdAt, updatedAt */ };
export type CreateXxxProps = Omit<XxxProps, "id" | "createdAt" | "updatedAt" | ...>;
export type UpdateXxxProps = Partial<Pick<XxxProps, /* mutable fields only */>>;

export class Xxx {
  private constructor(private props: XxxProps) {}  // Must be private

  static create(input: CreateXxxProps): Xxx {       // Generated IDs/timestamps owned by entity
    // assigns crypto.randomUUID(), Date.now(), etc.
  }
  static reconstitute(props: XxxProps): Xxx {       // For rebuilding from persistence
    return new Xxx({ ...props });
  }

  // Getters for every field
  get id() { return this.props.id; }

  update(input: UpdateXxxProps) { /* apply mutable fields, call touch() */ }
  toSnapshot(): XxxProps { return { ...this.props }; }
  private touch() { this.props.updatedAt = new Date(); }
}
```

**Why classes (not plain types):** Prevents `JSON.stringify(entity)` returning `"{}"` (no own enumerable properties on class instances) and `{ ...entity }` returning `{}`. All serialization must go through `.toSnapshot()`. The `architecture/entity-class` rule blocks regression to plain types.

### Domain Repository Interfaces

Defined in `src/domain/*/xxx.repository.ts` as TypeScript interfaces. Example:

```ts
export interface MediaRepository {
  findMany(params: { limit, cursor?, includePrivateOwnedBy?, includePublicOnly }): Promise<CursorPage<Media>>;
  findById(id: string): Promise<Media | null>;
  findByOriginalKey(key: string): Promise<Media | null>;
  create(input: Media): Promise<Media>;      // Takes entity, not partials
  update(media: Media): Promise<Media>;
  delete(id: string): Promise<boolean>;
}
```

### Infrastructure Repository Implementations

Located in `src/infrastructure/repositories/drizzle-*.repository.ts`. Each:
- Implements a domain repository interface
- Uses `CrudAdapter` for all CRUD operations (enforced by `architecture/repository-workflow` — no direct `this.db.insert/update/delete`)
- Uses mapper functions for row↔entity conversion (enforced — no inline `.reconstitute()`)
- Never imports policies (enforced — authorization stays in application/domain)

### Mapper Pattern

Mappers live in `src/infrastructure/repositories/mappers/*.mapper.ts` and follow strict rules:

```ts
// Row → Entity: must call Entity.reconstitute(...)
export function mediaRowToEntity(row: MediaRow): Media {
  return Media.reconstitute({ id: row.id, alt: row.alt, /* ... every field explicitly */ });
}

// Entity → Insert Row: must call entity.toSnapshot()
export function mediaToInsertRow(input: Media) {
  return mediaSnapshotToPersistence(input.toSnapshot());
}

// Entity → Update Row: must call entity.toSnapshot()
export function mediaToUpdateRow(input: Media) {
  const snapshot = input.toSnapshot();
  return { alt: snapshot.alt, /* ... */ };
}
```

**Enforced rules:**
- Mappers must NOT be imported outside `src/infrastructure/` (rule: `no-mapper-imports-outside-infra`)
- Mappers must never import from `@/application/`, `@/http/`, or `@/composition/`
- `RowToEntity` functions must call `.reconstitute()`, `ToInsertRow`/`ToUpdateRow` must call `.toSnapshot()`
- Must not spread or return input directly (explicit field mapping required)
- Must accept exactly one argument

### CrudAdapter (`src/infrastructure/persistence/crud-adapter.ts`)

Centralized Drizzle/D1 persistence primitive providing:
- `listRows<Row>()` — cursor pagination with `(createdAt, id)` seek cursors, filter/sort support
- `findRowById<Row>()` — single row by ID column
- `findFirstRow<Row>()` — single row by arbitrary predicate
- `insertRow()` — with optional `onConflictDoNothing`
- `updateRow()` — drops `undefined` fields for PATCH semantics
- `deleteRowById()` — returns whether a change occurred
- `deleteRows()` — scoped multi-row delete
- `buildInsert()` — for composing batch inserts in workflow ports
- `relationAnyCondition()` — shared `inArray` predicate

**Enforced:** Every public method must have JSDoc (`architecture/crud-adapter-jsdoc` rule).

### Policy Pattern (ReBAC Authorization)

Policies are pure domain objects that:
- Accept an `Actor` and domain entity
- Query the `RelationshipRepository` to resolve ReBAC facts
- Return `Promise<boolean>` (never throw — throwing is done by the `assertAllowed` helper in use cases)

```ts
export class MediaPolicy {
  constructor(private readonly relationships: RelationshipRepository) {}
  canCreate(actor: Actor | null): Promise<boolean> { ... }
  canRead(actor: Actor | null, media: Media): Promise<boolean> {
    if (media.visibility === "public" && media.status === "ready") return Promise.resolve(true);
    return canUserActorAccessByRelation({ actor, relationships: this.relationships, relation: "owner", ... });
  }
  canUpdate/canDelete/canPublish/canUnpublish: similar pattern
}
```

**ReBAC help:** `canUserActorAccessByRelation()` — admins automatically pass; other users must have a matching relationship row. `createUserSubjectRelationship()` — factory for relationship entities.

### Use Case Pattern

Use cases live in `src/application/` and follow the pattern:

```ts
export class CreateMediaUploadUseCase {
  constructor(
    private readonly mediaRepository: MediaRepository,       // Domain interface
    private readonly relationships: RelationshipRepository,   // Domain interface
    private readonly idempotency: IdempotencyRepository,      // Domain interface
    private readonly mediaCreateWorkflow: MediaCreateWorkflow, // Domain interface
    private readonly mediaPolicy: MediaPolicy,                // Domain policy
    private readonly signer: ObjectStorageSigner,             // Domain interface
    private readonly maxImageUploadBytes: number,             // Config value
    private readonly uploadUrlTtlSeconds: number,             // Config value
  ) {}

  async execute(params: { actor: Actor; idempotencyKey?: string; input: CreateMediaUploadInput }) {
    // 1. Check policy via assertAllowed()
    // 2. Validate input via domain constants
    // 3. Build entity via Entity.create()
    // 4. Build relationship via createUserSubjectRelationship()
    // 5. If idempotency key: check replay, handle conflict/reservation race
    // 6. Otherwise: direct create + return
  }
}
```

**Idempotency pattern:** Use cases delegate to workflow ports (`XxxCreateWorkflow`) which do atomic `db.batch([insert idempotency, insert resource, insert relationship])`. If the unique constraint on idempotency key triggers, the workflow throws `IdempotencyReservationConflictError`, the use case catches it, re-reads the idempotency row, and replays the cached response (verifying request hash matches). This avoids the "insert-and-check-exists" race condition.

### Presenter Pattern

Presenters (`src/http/presenters/*.presenter.ts`) convert domain entities to JSON-safe response objects:

```ts
export function presentMedia(media: Media): z.infer<typeof mediaResponseSchema> {
  const snapshot = media.toSnapshot();  // Must call .toSnapshot() — enforced
  return {
    ...snapshot,
    uploadExpiresAt: snapshot.uploadExpiresAt?.toISOString() ?? null,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    variantUrls: media.status === "ready" ? { /* computed URLs */ } : undefined,
  };
}
```

**Enforced:** `architecture/no-raw-entity-serialization` — application/HTTP code must not pass entity instances directly to `JSON.stringify()` or object spread without `.toSnapshot()`.

### Error Handling

All errors extend `AppError` (lives in `src/shared/errors.ts` — enforced by `architecture/no-custom-errors-outside-shared`):
- `ValidationError` → 400
- `UnauthorizedError` → 401
- `ForbiddenError` → 403
- `NotFoundError` → 404
- `ConflictError` → 409
- `IdempotencyReservationConflictError` → internal signal (not an AppError, caught by use cases)

The global error middleware (`handleAppError`) normalizes all errors to the JSON envelope: `{ error: { code, message, requestId, details } }`.

### Idempotency System

- `Idempotency-Key` header supported on `POST /categories`, `POST /posts`, `POST /media`, `POST /users`
- Idempotency table: composite primary key `(key, actorId, route)`
- Workflow ports do atomic `db.batch()` inserting idempotency row + resource row + relationship row
- Unique constraint violations are translated from SQLite errors (only in `sqlite-errors.ts` — enforced by `architecture/no-storage-error-parsing`) to `IdempotencyReservationConflictError`
- Use cases handle the race: catch conflict error → re-read idempotency row → verify request hash → replay cached response
- Expired idempotency records are deleted before new insert attempts

---

## 5. Workers (Multi-Worker Setup)

### API Worker (`content-api`)
- Entry: `src/main.ts`
- Handles all HTTP API requests via Hono
- Has D1 + R2 bindings
- Has env secrets for R2 presigned URL signing

### Media Processor Worker (`content-api-media-processor`)
- Entry: `workers/media-processor/src/index.ts`
- Purely a Cloudflare Queue consumer
- Triggered by R2 object-created notifications (filtered: `media/*` prefix, `*/original` suffix)
- **Pipeline:** R2 event → queue → find media by `originalKey` → verify metadata (content type, size match) → mark processing → generate derivatives (blur placeholder + all variants) via Cloudflare Images → store variants in R2 → mark ready
- **Idempotent:** Skips if media already in terminal state (`ready`, `failed`, `expired`)
- **Shared code:** Imports use cases and repositories from the main `src/` tree → same entity classes, same domain interfaces, same infrastructure implementations
- **Own `wrangler.jsonc`**: Inherits same D1 + R2 bindings, adds `IMAGES` binding, declares queue consumer on `media-processing`
- **CI/CD:** Deployed in parallel with API Worker (both wait for migrations)

### CI/CD Pipeline (`.github/workflows/ci-deploy.yml`)
```
push to main → 
  1. check (pnpm check)           # lint + dup gate + typecheck + test
  2. migrate (wrangler d1 migrations apply)
  3. deploy-api (wrangler deploy) ──┐
  4. deploy-media-processor ────────┘ (parallel)
```

---

## 6. How the Codebase Prevents LLM Agents from Making a Mess

The codebase has a **multi-layered defense system** designed specifically to constrain LLM agents:

### Layer 1: Architecture Lint Rules (16 oxlint rules, hard gate)
These are the **primary defense** — they mechanically block common LLM mistakes:

| Rule | What it prevents |
|------|-----------------|
| `layer-imports` | LLM importing Drizzle into domain, Hono into application, infrastructure into HTTP |
| `no-mapper-imports-outside-infra` | LLM leaking persistence mapping into application/Domain code |
| `no-storage-error-parsing` | LLM adding SQLite/D1 string matching outside infrastructure |
| `no-custom-errors-outside-shared` | LLM scattering error classes across layers |
| `req-valid-usage` | LLM using raw `c.req.json()` instead of `c.req.valid("json")` |
| `no-plain-zod-import` | LLM importing plain `zod` instead of `@hono/zod-openapi` in schemas |
| `route-module` | LLM defining routes without `createRoute`, without `app.openapi`, without exactly one `.execute()` per handler, mismatching `security` and `requireActor` |
| `route-handler-boundary` | LLM putting `fetch()`, `c.env`, `JSON.parse`, direct storage calls, or `new Response()` in route handlers |
| `repository-workflow` | LLM writing `this.db.insert()` instead of using CrudAdapter, importing policies into repos, using `db.batch()` outside workflow ports |
| `mapper-file` | LLM writing mappers that spread input without `.reconstitute()`/`.toSnapshot()`, importing from application/HTTP |
| `entity-class` | LLM reverting to plain type entities instead of classes with `private constructor`, `static create()`, `static reconstitute()`, `toSnapshot()` |
| `no-raw-entity-serialization` | LLM passing entity instances directly to `JSON.stringify(entity)` or `{ ...entity }` (which returns `{}` for classes) |
| `crud-adapter-jsdoc` | LLM adding undocumented methods to CrudAdapter |
| `no-magic-numbers` | LLM inlining numeric literals in application/domain/HTTP/shared without extracting to named constants |
| `constants-placement` | LLM putting `SCREAMING_SNAKE` constants outside `shared/`, `domain/`, or `infrastructure/` |
| `constants-jsdoc` | LLM adding undocumented constants |

All 16 architecture rules run as `"error"` severity. **The rules are disabled for tests and `.d.ts` files** but fully enforced on production code.

### Layer 2: TypeScript Strict Mode
`strict: true` with `no-explicit-any` enforced as lint error. This catches type mismatches, null handling issues, and implicit any.

### Layer 3: Duplicate Code Gate (Fallow, hard gate)
`pnpm check:dup` runs Fallow `--mode mild --min-tokens 50 --min-lines 5` and fails if duplication exceeds 3%. This prevents LLMs from copy-pasting entire use case flows, entity definitions, or route handlers.

### Layer 4: Advisory Pass (Aislop + Semantic Fallow)
`pnpm advise` runs Aislop (duplicate imports, duplicate blocks, complexity, thin wrappers, narrative comments, security) and conservative semantic Fallow. The output is filtered through `.advise-suppressions.json` — 32 known architecture-mandated patterns are suppressed (e.g., entity getter/update symmetry, idempotent create pattern, mapper field mapping). New findings appear as review input.

### Layer 5: Agent Instructions (`AGENTS.md`)
Explicitly instructs agents to:
1. Never loosen lint rules to pass
2. Run `pnpm check` as final verification
3. Run `pnpm advise` after code changes
4. Auto-suppress known architecture patterns (entity symmetry, route handler pattern, mapper pattern, narrative JSDoc, thin wrappers)
5. Review but never auto-suppress: new rule types, new clone groups, security findings, errors

### Layer 6: `.advise-suppressions.json`
A machine-readable suppression file that filters advisory noise. Auto-suppressed categories include:
- `complexity/file-too-large` in architecture.js plugin
- `complexity/function-too-long` in composition wiring and route registration
- `code-quality/duplicate-block` in route files and mapper files
- `ai-slop/narrative-comment` (required JSDoc at architectural boundaries)
- `ai-slop/thin-wrapper` for intentional public APIs like `createDb`, `encodeCursor`
- `ai-slop/double-type-assertion` in `crud-adapter.ts`
- Entity clone groups between entity files (getter/update/toSnapshot pattern)
- Create use case idempotency pattern across resources
- Entity-mapper field mapping pattern

---

## 7. Key Design Decisions Embedded in the Codebase

1. **Entities as classes with private constructors**: Prevents accidental raw serialization, forces `.toSnapshot()` for persistence boundaries, makes state transitions explicit methods
2. **Separate Create*Props using Omit<>**: Generated fields (IDs, timestamps) cannot be accidentally accepted from callers; the entity class owns their generation
3. **Idempotency through workflow ports + db.batch()**: Avoids the classic "check-then-insert" race by making the idempotency row insertion and the resource creation atomic
4. **ReBAC as relationship table, not role columns**: Authorization facts are stored in a dedicated `relationships` table with `(subjectType, subjectId, relation, objectType, objectId)` — this supports fine-grained permission queries
5. **Admins bypass relationship checks in shared helper**: `canUserActorAccessByRelation()` auto-approves admins, reducing redundant relationship queries
6. **R2 bucket is private; variants served through API Worker**: Centralizes authorization in `MediaPolicy` instead of leaking authorization to bucket-level access
7. **Media processor is a separate Worker triggered by queue**: Decouples async image processing from the request-response cycle
8. **Shared constants for all media values**: Variant dimensions, quality settings, MIME allowlists, TTLs live in one place (`src/shared/constants.ts`) to prevent drift between API Worker, processor Worker, and tests
9. **Cursor pagination only**: No offset pagination — avoids the consistency issues of offset-based paging
10. **No generic CRUD framework**: Despite having a CrudAdapter, each resource gets explicit use cases and repositories rather than a generic `CrudController<T>` — this makes authorization, validation, and lifecycle operations explicit per resource
