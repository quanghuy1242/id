# id — Repository Architecture, Layers, And Enforcement

> Status: implementation-grade architecture specification
>
> Date: 2026-05-19
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — the `id` identity provider monorepo
>
> Source docs and reference implementations:
>
> - `/home/quanghuy1242/pjs/content-api` — reference for layer architecture, oxlint rules, entity patterns, repository/mapper contracts, and multi-worker setup
> - `/home/quanghuy1242/pjs/books` — reference for Lumina UI system (DaisyUI v5 + Tailwind v4 CSS-first, component token props, app shell, compact density)
> - `/home/quanghuy1242/pjs/auther` — prior art showing structural problems this architecture is designed to prevent
>
> Related local files:
>
> - `/home/quanghuy1242/pjs/auth/README.md`
> - `/home/quanghuy1242/pjs/auth/docs/001_first-batch-plan.md`
> - `/home/quanghuy1242/pjs/content-api/scripts/oxlint-js-plugins/architecture.js` (16 rules)
> - `/home/quanghuy1242/pjs/content-api/docs/architecture.md`
> - `/home/quanghuy1242/pjs/content-api/docs/003_entity-classes-and-oxlint-arch-linting.md`
> - `/home/quanghuy1242/pjs/content-api/docs/004_code-duplication-and-abstraction-linting.md`
> - `/home/quanghuy1242/pjs/books/docs/001_lumina_ui_system_daisyui_tailwind.md`
>
> Assumptions:
>
> - This document defines **how** the codebase is structured, layered, and enforced. The domain plan (`001_first-batch-plan.md`) defines **what** is built.
> - The first batch deploys two Cloudflare Workers: `core-id` (auth/OAuth/JWKS) and `ui-id` (admin dashboard).
> - Workers never import from each other. Shared code lives in `packages/`.
> - All enforcement rules are mechanical — lint gates, CI scripts, type constraints. No unwritten conventions.
> - This document can be extended as later batches introduce new packages or tables, but the original invariants should not be weakened.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Root Layout](#2-root-layout)
- [3. Worker Topology](#3-worker-topology)
  - [3.1 `core-id` — Auth And OAuth Worker](#31-core-id--auth-and-oauth-worker)
  - [3.2 `ui-id` — Admin UI Worker](#32-ui-id--admin-ui-worker)
  - [3.3 Worker Isolation](#33-worker-isolation)
- [4. Shared Packages](#4-shared-packages)
  - [4.1 `packages/ui` — Lumina Component Library](#41-packagesui--lumina-component-library)
  - [4.2 `packages/lib` — Shared Types, Constants, API Client](#42-packageslib--shared-types-constants-api-client)
  - [4.3 Package Isolation](#43-package-isolation)
- [5. Layer Architecture](#5-layer-architecture)
  - [5.1 Layer Definitions](#51-layer-definitions)
  - [5.2 Import Rules](#52-import-rules)
  - [5.3 Banned External Imports Per Layer](#53-banned-external-imports-per-layer)
- [6. Design Patterns](#6-design-patterns)
  - [6.1 Entity Class Pattern](#61-entity-class-pattern)
  - [6.2 Repository Pattern](#62-repository-pattern)
  - [6.3 Mapper Pattern](#63-mapper-pattern)
  - [6.4 Use Case Pattern](#64-use-case-pattern)
  - [6.5 Route Handler Pattern](#65-route-handler-pattern)
  - [6.6 Request-Scoped Container](#66-request-scoped-container)
  - [6.7 Better Auth Factory Pattern](#67-better-auth-factory-pattern)
  - [6.8 CrudAdapter Pattern](#68-crudadapter-pattern)
- [7. UI Architecture](#7-ui-architecture)
  - [7.1 Lumina System Contract](#71-lumina-system-contract)
  - [7.2 Route File Rules](#72-route-file-rules)
  - [7.3 Admin Page Conventions](#73-admin-page-conventions)
- [8. Enforcement System](#8-enforcement-system)
  - [8.1 Oxlint Architecture Rules](#81-oxlint-architecture-rules)
  - [8.2 Table Whitelist](#82-table-whitelist)
  - [8.3 Duplicate Code Gate](#83-duplicate-code-gate)
  - [8.4 TypeScript Strict Mode](#84-typescript-strict-mode)
  - [8.5 Advisory Pass](#85-advisory-pass)
  - [8.6 Quality Gate Summary](#86-quality-gate-summary)
- [9. Toolchain](#9-toolchain)
  - [9.1 Root Configuration](#91-root-configuration)
  - [9.2 Worker Configuration](#92-worker-configuration)
  - [9.3 Scripts](#93-scripts)
- [10. Rules Summary](#10-rules-summary)
- [11. Pre-Implementation Spikes](#11-pre-implementation-spikes)
- [12. Definition Of Done](#12-definition-of-done)

## 1. Goal

Define the repository structure, layer architecture, design patterns, and enforcement system for the `id` project. This document is the constitution — it constrains every line of code that enters the repo. The domain plan (`001_first-batch-plan.md`) defines what must be built. This document defines how it must be built.

The architecture is designed to prevent the structural problems observed in `/home/quanghuy1242/pjs/auther`:
- no layer boundaries (domain code imports from webhook delivery, auth config touches pipeline engine);
- no mechanical enforcement (rules live in the developer's head, not in the CI pipeline);
- direct database table access everywhere (Better Auth table writes from admin routes, making BA upgrades dangerous);
- entity state as plain objects (no guard against accidental field mutation or serialization leakage).

The reference implementation is `/home/quanghuy1242/pjs/content-api`, which enforces hexagonal architecture through 16 custom oxlint rules, a strict duplicate code gate, TypeScript strict mode, and advisory scanning. The `id` repo ports the same enforcement stack and adapts it to a two-worker topology with Better Auth as the auth foundation.

## 2. Root Layout

The root must stay minimal — no `wrangler.jsonc`, no framework configuration, no per-environment files. Worker-specific configuration lives inside each worker's directory. Shared packages live under `packages/`. Scripts live under `scripts/`. Documentation lives under `docs/`.

```
pjs/id/
├── package.json                    # Single package.json — Wrangler bundles each worker independently via esbuild
├── pnpm-workspace.yaml             # Workspace: . (root), packages/*
├── pnpm-lock.yaml
├── tsconfig.json                   # Base config; workers and packages extend it
├── .oxlintrc.json                  # Shared lint rules for all workers and packages
├── .schema-whitelist.json          # Approved custom table names — CI fails on unlisted tables
├── .advise-suppressions.json       # Known advisory noise filtered during pnpm advise
├── vitest.workspace.ts             # References workers/core/vitest.config.ts and workers/ui/vitest.config.ts
├── .dev.vars.example               # Documents required secret names; no real values
├── .gitignore
├── AGENTS.md                       # Agent/LLM workflow instructions
├── README.md
│
├── docs/
│   ├── 000_repo-architecture.md    # This document
│   ├── 001_first-batch-plan.md     # Domain and feature plan
│   └── ...
│
├── scripts/
│   ├── check-duplication-threshold.mjs     # Fallow hard gate wrapper
│   ├── check-schema-whitelist.mjs          # CI script: fails if Drizzle schema defines unlisted tables
│   ├── filter-advise.mjs                   # Filters Aislop + Fallow output through suppressions
│   └── oxlint-js-plugins/
│       └── architecture.js                 # Custom oxlint rules ported from content-api
│
├── packages/
│   ├── ui/                          # Lumina component library
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── actions/             # Button, LinkButton, AriaButton
│   │       ├── feedback/            # Toast
│   │       ├── forms/               # TextField, SearchField, Select
│   │       ├── layout/              # Stack, Inline, Grid, Panel, Container, Spacer
│   │       ├── navigation/          # Menu, Popover
│   │       ├── page/                # Page, PageHeader, PageBody, PageSection
│   │       ├── theme/               # ThemeScript
│   │       ├── typography/          # Text, Heading
│   │       ├── app-shell/           # AppShell, Topbar, Sidebar, MobileDock
│   │       └── index.ts
│   │
│   └── lib/                         # Shared primitives (zero framework imports)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types.ts             # Shared type definitions
│           ├── constants.ts         # Shared constants
│           ├── errors.ts            # Shared error codes or error types
│           └── api-client.ts        # Typed client for calling core-id admin API from ui-id
│
└── workers/
    ├── core/
    │   ├── package.json             # Dependencies: hono, better-auth, drizzle-orm, zod, jose
    │   ├── wrangler.jsonc           # Worker config: D1, KV, secrets, routes
    │   ├── tsconfig.json            # Extends root, path alias @/ → src/
    │   ├── vitest.config.ts         # Cloudflare Workers pool
    │   ├── src/
    │   │   ├── main.ts              # Hono entry: creates app, registers middleware and routes
    │   │   ├── app.ts               # createApp() factory for test injection
    │   │   ├── domain/              # Pure domain: entities, repository interfaces, policies
    │   │   │   ├── authz/           # Actor, authorization primitives
    │   │   │   └── resource-servers/# ResourceServer entity + repository interface
    │   │   ├── application/         # Use cases (one class per operation, one .execute() method)
    │   │   │   ├── auth/            # AuthenticateBearerTokenUseCase
    │   │   │   └── resource-servers/# CRUD use cases
    │   │   ├── composition/         # DI wiring: createRequestContainer(env, ctx?)
    │   │   │   └── create-container.ts
    │   │   ├── config/
    │   │   │   └── env.ts           # Zod-validated env + AppBindings type
    │   │   ├── http/                # Hono adapter layer
    │   │   │   ├── app-env.ts       # AppEnv type (Bindings + Variables)
    │   │   │   ├── middleware/       # auth, request-id, error-handler
    │   │   │   ├── presenters/       # Entity → JSON-safe response objects
    │   │   │   ├── routes/           # Route modules (*.routes.ts)
    │   │   │   │   ├── auth/        # Delegates to Better Auth handler
    │   │   │   │   ├── oauth/       # OAuth page routes (sign-in, consent, select-account, etc.)
    │   │   │   │   └── admin/       # Custom admin API routes
    │   │   │   ├── schemas/          # Zod request/response schemas
    │   │   │   └── helpers.ts        # requireActor, route registration helpers
    │   │   ├── infrastructure/       # Concrete implementations of domain interfaces
    │   │   │   ├── db/
    │   │   │   │   ├── client.ts    # createDb() — Drizzle/D1 factory
    │   │   │   │   └── schema.ts    # Custom table definitions only (no BA tables)
    │   │   │   ├── persistence/
    │   │   │   │   └── crud-adapter.ts
    │   │   │   └── repositories/
    │   │   │       ├── drizzle-*.repository.ts
    │   │   │       └── mappers/
    │   │   │           └── *.mapper.ts
    │   │   ├── shared/               # Cross-layer primitives (allowed everywhere)
    │   │   │   ├── constants.ts
    │   │   │   ├── errors.ts
    │   │   │   └── pagination/
    │   │   │       └── cursor.ts
    │   │   └── auth/                 # Better Auth integration (NOT in domain/application)
    │   │       ├── get-auth.ts       # Runtime factory: getAuth(env, request)
    │   │       ├── config.ts         # Shared pure config (scopes, pages, plugin options)
    │   │       ├── resource-audiences.ts  # D1-backed audience loader for validAudiences
    │   │       └── claims.ts         # Custom token claim helpers
    │   └── tests/
    │       ├── oauth-flows.test.ts
    │       ├── admin-auth.test.ts
    │       ├── resource-audience.test.ts
    │       └── jwks-rotation.test.ts
    │
    └── ui/
        ├── package.json             # Dependencies: react, react-dom, @/ui, hono (thin proxy)
        ├── wrangler.jsonc           # Worker config: CORE_ID service binding, no D1
        ├── tsconfig.json            # Extends root, jsx: react-jsx
        ├── vitest.config.ts         # jsdom environment
        ├── vinext.config.ts         # Vinext build config
        ├── src/
        │   ├── main.ts              # Hono entry: serves SPA, proxies admin API calls to core-id
        │   ├── app/                 # Vinext App Router (same conventions as books)
        │   │   ├── globals.css      # Tailwind v4 + DaisyUI v5 + lumina themes
        │   │   ├── layout.tsx       # AppShell, theme, global providers
        │   │   ├── page.tsx         # Redirect to /admin
        │   │   └── admin/           # Admin pages (composition-only, nothing else)
        │   │       ├── layout.tsx   # Admin layout with sidebar + topbar
        │   │       ├── page.tsx     # Dashboard
        │   │       ├── organizations/
        │   │       ├── clients/
        │   │       ├── resource-servers/
        │   │       ├── users/
        │   │       ├── consents/
        │   │       └── settings/
        │   └── lib/
        │       └── admin-api.ts     # Calls core-id via service binding (typed)
        └── tests/
            └── admin-pages.test.tsx
```

## 3. Worker Topology

Two Cloudflare Workers deployed independently. They communicate at runtime through Cloudflare service bindings, not through code imports.

```
Internet
    │
    ├──> https://id.quanghuy.dev/*           ──> core-id worker
    │                                              ├── D1 database
    │                                              ├── KV namespace
    │                                              └── Better Auth instance (per-request)
    │
    └──> https://id.quanghuy.dev/admin/*     ──> ui-id worker
                                                   ├── CORE_ID service binding ──> core-id (internal)
                                                   └── React/Vinext app (no D1, no BA)
```

### 3.1 `core-id` — Auth And OAuth Worker

**Responsibility:**
- Better Auth handler for all auth routes (`/api/auth/*`)
- OAuth2.1/OIDC provider endpoints (`/oauth2/*`)
- Well-known metadata (`/.well-known/*`)
- Custom admin API (`/api/admin/*`) for entities BA doesn't own
- OAuth flow pages: sign-in, sign-up, consent, select-account, select-organization, reset-password
- JWKS endpoint
- Token issuance, introspection, revocation

**Bindings:**
- `DB` — D1 database (Better Auth tables + custom tables)
- `KV` — Workers KV for secondary storage (rate limiting, session cache)
- `BETTER_AUTH_SECRET` — Better Auth secret key
- `BETTER_AUTH_URL` — Public issuer URL (`https://id.quanghuy.dev`)
- Email provider secrets (verification and password reset)

**Stack:** Hono, Better Auth 1.6.x, `@better-auth/oauth-provider`, Drizzle ORM, Zod, Jose.

**Framework constraint:** Cannot import `react`, `react-dom`, `vinext`, `@vitejs/*`, or any UI framework. Enforced by oxlint.

### 3.2 `ui-id` — Admin UI Worker

**Responsibility:**
- Serve the admin dashboard (React/Vinext SPA)
- Proxy admin API calls to `core-id` via service binding when needed
- Render pages: dashboard, organizations, OAuth clients, resource servers, users, consents, settings

**Bindings:**
- `CORE_ID` — service binding to `core-id` worker (internal, no public internet hop)
- No D1. No KV. No Better Auth instance.

**Stack:** Hono (thin proxy layer), Vinext (App Router), React 19, the `packages/ui` Lumina component library.

**Framework constraint:** Cannot import `better-auth`, `drizzle-orm`, `jose`, or any Cloudflare D1/KV binding type. Cannot directly access the database. All data flows through `core-id`'s API. Enforced by oxlint.

### 3.3 Worker Isolation

Workers are build-time isolated and runtime-communicating. The rule is absolute:

| Rule | Enforcement |
|---|---|
| `workers/core/src/**` must not import from `workers/ui/` | Oxlint architecture rule |
| `workers/ui/src/**` must not import from `workers/core/` | Oxlint architecture rule |
| `workers/core/src/**` must not import `react`, `react-dom` | Oxlint architecture rule |
| `workers/ui/src/**` must not import `better-auth`, `drizzle-orm`, `jose` | Oxlint architecture rule |
| Both workers may import from `packages/ui/` and `packages/lib/` | Allowed by layer-imports rule |

## 4. Shared Packages

### 4.1 `packages/ui` — Lumina Component Library

Reusable React components following the Lumina UI system. All visual primitives live here: buttons, layout, typography, forms, navigation, app shell.

**Design contract (from `books/docs/001_lumina_ui_system_daisyui_tailwind.md`):**

- Token props, not raw `className`: `<Button variant="primary" size="sm">` not `<button className="btn btn-primary btn-sm">`
- DaisyUI v5 + Tailwind v4 CSS-first (no `tailwind.config.ts`)
- Two themes: `lumina-light` (default) and `lumina-dark`, activated via `data-theme` on `<html>`
- Compact density everywhere: `btn-sm`, `input-sm`, `menu-sm`, `card-compact`
- React Aria wrapped at leaf components only (`AriaButton`, `Menu`, `Popover`, `Select`) — `"use client"` stays at leaves, never at pages
- Typography via `Text` component with variants (`h1`, `h2`, `h3`, `body`, `caption`, `label`, `sectionLabel`, `brand`)
- Button hierarchy: `Button` (actions, renders `<button>`), `LinkButton` (navigation, renders `<a>`), `AriaButton` (client-only `onPress`)
- Layout primitives: `Stack`, `Inline`, `Grid`, `Panel`, `Page`, `PageHeader`, `PageBody`, `PageSection`

**What this package must not import:** `hono`, `better-auth`, `drizzle-orm`, Cloudflare bindings, any `workers/*` code. Pure React component library.

### 4.2 `packages/lib` — Shared Types, Constants, API Client

Zero-framework primitives shared between workers.

**Contents:**

- Shared TypeScript types (entity DTOs, API response shapes, error codes)
- Shared constants (pagination defaults, token lifetimes, well-known paths)
- Error code enums or string constants used by both workers
- Typed API client for `core-id`'s admin API — used by `ui-id` when calling through the service binding

**What this package must not import:** `react`, `hono`, `better-auth`, `drizzle-orm`, Cloudflare bindings, `zod`, or any framework. Pure TypeScript. Can import from itself only.

### 4.3 Package Isolation

| Package | May import from | Must not import |
|---|---|---|
| `packages/ui/` | `packages/ui/`, `packages/lib/`, `react`, `react-dom`, `react-aria-components`, DaisyUI/Tailwind | `workers/`, `hono`, `better-auth`, `drizzle-orm`, Cloudflare bindings |
| `packages/lib/` | `packages/lib/` only | Everything else (pure TypeScript) |

## 5. Layer Architecture

Borrowed from `/home/quanghuy1242/pjs/content-api`. Hexagonal / clean architecture with strict import direction. The layers apply within `workers/core/src/`. The `ui-id` worker uses Vinext conventions instead.

### 5.1 Layer Definitions

| Layer | Path | Purpose |
|---|---|---|
| Domain | `src/domain/` | Pure business logic: entities, repository interfaces, policy objects. No framework code. No I/O. |
| Application | `src/application/` | Use cases that orchestrate domain objects. No HTTP awareness. No database access. |
| HTTP | `src/http/` | Hono adapter: route definitions, middleware, request/response schemas, presenters. |
| Infrastructure | `src/infrastructure/` | Concrete implementations: Drizzle repositories, D1 connection, CrudAdapter, mappers. |
| Composition | `src/composition/` | DI wiring: the one file that connects infrastructure implementations to application use cases. |
| Shared | `src/shared/` | Cross-cutting primitives: constants, error classes, pagination utilities. Importable by all layers. |
| Auth | `src/auth/` | Better Auth integration layer: factory, config, claims, resource-audience loader. Not a domain concern. |

**Key distinction: `src/auth/` is NOT a clean-architecture layer.** It is an integration concern — it knows about Better Auth, Cloudflare bindings, and the D1 database. It sits outside the domain/application/infrastructure layering. Domain and application layers must never import from `src/auth/`.

### 5.2 Import Rules

Enforced by the `architecture/layer-imports` oxlint rule.

| Layer | Allowed import sources |
|---|---|
| `domain/` | `@/domain/`, `@/shared/` |
| `application/` | `@/application/`, `@/domain/`, `@/shared/` |
| `http/` | `@/application/`, `@/composition/`, `@/config/`, `@/domain/`, `@/http/`, `@/shared/` |
| `infrastructure/` | `@/config/`, `@/domain/`, `@/infrastructure/`, `@/shared/` |
| `composition/` | `@/application/`, `@/composition/`, `@/config/`, `@/domain/`, `@/infrastructure/`, `@/shared/` |
| `shared/` | `@/shared/` only |
| `auth/` | `@/config/`, `@/domain/` (types only), `@/shared/`, `better-auth`, Cloudflare bindings |

**Critical: no layer may import from `src/auth/` except `http/` and `composition/`.** Domain entities must not know about Better Auth. Use cases must not call `getAuth()`.

### 5.3 Banned External Imports Per Layer

Enforced by `architecture/layer-imports` external ban configuration.

| Layer | Banned external imports |
|---|---|
| `domain/` | `@hono/`, `hono`, `drizzle-orm`, `better-auth`, `cloudflare:`, `@cloudflare/`, `react` |
| `application/` | `@hono/`, `hono`, `drizzle-orm`, `better-auth`, `cloudflare:`, `@cloudflare/`, `react` |
| `http/` | `drizzle-orm`, `better-auth` (use auth layer via composition), `react` |
| `infrastructure/` | `@hono/`, `hono`, `better-auth` |
| `shared/` | All external frameworks — pure TypeScript only |

## 6. Design Patterns

All patterns are ported from `/home/quanghuy1242/pjs/content-api`. Each pattern has a corresponding oxlint rule that prevents regression.

### 6.1 Entity Class Pattern

Every domain entity follows this contract. Enforced by `architecture/entity-class`.

```ts
// domain/resource-servers/resource-server.entity.ts
export type ResourceServerProps = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  audience: string;
  description: string | null;
  enabled: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  disabledAt: number | null;
  disabledBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateResourceServerProps = Omit<
  ResourceServerProps,
  "id" | "enabled" | "createdBy" | "updatedBy" | "disabledAt" | "disabledBy" | "createdAt" | "updatedAt"
>;

export type UpdateResourceServerProps = Partial<
  Pick<ResourceServerProps, "name" | "description" | "audience" | "slug">
>;

export class ResourceServer {
  private constructor(private props: ResourceServerProps) {}

  static create(input: CreateResourceServerProps & { createdBy: string }): ResourceServer {
    const now = Date.now();
    return new ResourceServer({
      ...input,
      id: crypto.randomUUID(),
      enabled: true,
      updatedBy: input.createdBy,
      disabledAt: null,
      disabledBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ResourceServerProps): ResourceServer {
    return new ResourceServer({ ...props });
  }

  get id() { return this.props.id; }
  get organizationId() { return this.props.organizationId; }
  get slug() { return this.props.slug; }
  get name() { return this.props.name; }
  get audience() { return this.props.audience; }
  get description() { return this.props.description; }
  get enabled() { return this.props.enabled; }
  get createdBy() { return this.props.createdBy; }
  get updatedBy() { return this.props.updatedBy; }
  get disabledAt() { return this.props.disabledAt; }
  get disabledBy() { return this.props.disabledBy; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }

  disable(actorId: string): void {
    this.props.enabled = false;
    this.props.disabledAt = Date.now();
    this.props.disabledBy = actorId;
    this.touch(actorId);
  }

  update(input: UpdateResourceServerProps, actorId: string): void {
    if (input.name !== undefined) this.props.name = input.name;
    if (input.description !== undefined) this.props.description = input.description;
    if (input.audience !== undefined) this.props.audience = input.audience;
    if (input.slug !== undefined) this.props.slug = input.slug;
    this.touch(actorId);
  }

  toSnapshot(): ResourceServerProps {
    return { ...this.props };
  }

  private touch(actorId: string): void {
    this.props.updatedAt = Date.now();
    this.props.updatedBy = actorId;
  }
}
```

**Why classes, not plain types:**
- `JSON.stringify(entity)` on a class instance returns `"{}"` — prevents accidental raw serialization
- `{ ...entity }` returns `{}` — prevents accidental field spreading
- `.toSnapshot()` is the only way to extract data for persistence or serialization
- State transitions (`disable()`, `update()`) are explicit methods, not ad-hoc field assignments
- `private constructor` prevents external construction without going through `create()` or `reconstitute()`

**Oxlint rule checks:**
- Entity file must export a class with `private constructor`
- Entity file must export `static create()` and `static reconstitute()` methods
- Entity file must export a `toSnapshot()` method
- Entity file must NOT be a plain type or interface

### 6.2 Repository Pattern

Domain defines the interface. Infrastructure implements it. Enforced by `architecture/repository-workflow`.

```ts
// domain/resource-servers/resource-server.repository.ts
export interface ResourceServerRepository {
  findMany(params: {
    organizationId: string;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<ResourceServer>>;

  findById(id: string): Promise<ResourceServer | null>;
  findByAudience(audience: string): Promise<ResourceServer | null>;
  findBySlug(organizationId: string, slug: string): Promise<ResourceServer | null>;
  findEnabled(): Promise<ResourceServer[]>;

  create(resourceServer: ResourceServer): Promise<ResourceServer>;
  update(resourceServer: ResourceServer): Promise<ResourceServer>;
  delete(id: string): Promise<boolean>;
}
```

**Infrastructure implementation must:**
- Use `CrudAdapter` for all CRUD operations (never `this.db.insert()` directly)
- Use mapper functions for row↔entity conversion (never inline `.reconstitute()` or `.toSnapshot()`)
- Never import policies or application code
- Accept and return domain entity instances (not partials, not raw rows)

### 6.3 Mapper Pattern

Mappers convert between database rows and domain entities. They live in `src/infrastructure/repositories/mappers/`. Enforced by `architecture/mapper-file` and `architecture/no-mapper-imports-outside-infra`.

```ts
// infrastructure/repositories/mappers/resource-server.mapper.ts
import { ResourceServer, type ResourceServerProps } from "@/domain/resource-servers/resource-server.entity";
import type { ResourceServerRow } from "@/infrastructure/db/schema";

export function resourceServerRowToEntity(row: ResourceServerRow): ResourceServer {
  return ResourceServer.reconstitute({
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    audience: row.audience,
    description: row.description,
    enabled: row.enabled === 1,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    disabledAt: row.disabledAt,
    disabledBy: row.disabledBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function resourceServerToInsertRow(entity: ResourceServer): Omit<ResourceServerRow, "id"> & { id: string } {
  const snapshot = entity.toSnapshot();
  return {
    id: snapshot.id,
    organizationId: snapshot.organizationId,
    slug: snapshot.slug,
    name: snapshot.name,
    audience: snapshot.audience,
    description: snapshot.description,
    enabled: snapshot.enabled ? 1 : 0,
    createdBy: snapshot.createdBy,
    updatedBy: snapshot.updatedBy,
    disabledAt: snapshot.disabledAt,
    disabledBy: snapshot.disabledBy,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
```

**Rules:**
- `RowToEntity` must call `Entity.reconstitute(...)` with every field explicitly
- `ToInsertRow` and `ToUpdateRow` must call `entity.toSnapshot()` first
- Must not spread the input directly — every field must be listed
- Must accept exactly one argument
- Mapper files must not be imported outside `src/infrastructure/`

### 6.4 Use Case Pattern

Use cases are classes with a single `execute()` method. Enforced by `architecture/route-handler-boundary` (one `.execute()` per handler) and `architecture/repository-workflow` (no direct DB access).

```ts
// application/resource-servers/create-resource-server.usecase.ts
import type { ResourceServerRepository } from "@/domain/resource-servers/resource-server.repository";
import { ResourceServer, type CreateResourceServerProps } from "@/domain/resource-servers/resource-server.entity";

export type CreateResourceServerInput = CreateResourceServerProps;

export class CreateResourceServerUseCase {
  constructor(
    private readonly resourceServerRepository: ResourceServerRepository,
  ) {}

  async execute(input: CreateResourceServerInput & { actorId: string }): Promise<ResourceServer> {
    const entity = ResourceServer.create({ ...input, createdBy: input.actorId });
    return this.resourceServerRepository.create(entity);
  }
}
```

**Rules:**
- Constructor receives repository interfaces and policy objects (DI)
- `.execute()` is the single public method
- Returns domain entities, not raw data
- Never accesses the database directly
- Never imports HTTP layer types
- Authorization checks happen in the use case or policy, not in the repository

### 6.5 Route Handler Pattern

Every route handler follows this contract. Enforced by `architecture/route-module` and `architecture/route-handler-boundary`.

```ts
// http/routes/admin/resource-servers.routes.ts
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "@/http/app-env";

const listResourceServersRoute = createRoute({
  method: "get",
  path: "/",
  security: [{ bearer: [] }],
  request: {
    query: z.object({
      organizationId: z.string(),
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional().default(20),
    }),
  },
  responses: {
    200: {
      description: "List of resource servers",
      content: { "application/json": { schema: z.object({ data: z.array(z.any()), cursor: z.string().nullable() }) } },
    },
  },
});

export function registerResourceServerRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(listResourceServersRoute, async (c) => {
    const actor = requireActor(c);
    const query = c.req.valid("query");

    const result = await c.get("container").resourceServers.list.execute({
      actor,
      organizationId: query.organizationId,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });

    return c.json({ data: result.items.map(presentResourceServer), cursor: result.cursor }, 200);
  });
}
```

**What is FORBIDDEN in route handlers (oxlint-guarded):**
- Accessing `c.env` directly — use the container
- Using `c.req.json()` instead of `c.req.valid("json")`
- Using `c.req.query()` instead of `c.req.valid("query")`
- Using `c.req.param()` instead of `c.req.valid("param")`
- Calling more than one use case `.execute()`
- Calling `fetch()` or making outbound HTTP requests
- Using `JSON.parse()` or `JSON.stringify()`
- Creating `new Request()` or `new Response()`
- Accessing `drizzle-orm` or the database directly

**What is REQUIRED in route handlers:**
- `requireActor(c)` call when `security: [{ bearer: [] }]` is declared — the two must pair
- Exactly one `.execute()` call on a container use case
- Presenter function wrapping each entity before `c.json()`

### 6.6 Request-Scoped Container

One file (`src/composition/create-container.ts`) wires all dependencies per request. This is the only place where infrastructure implementations meet domain interfaces.

```ts
// composition/create-container.ts
import { createDb } from "@/infrastructure/db/client";
import { DrizzleResourceServerRepository } from "@/infrastructure/repositories/drizzle-resource-server.repository";
import { CreateResourceServerUseCase } from "@/application/resource-servers/create-resource-server.usecase";
// ... other imports

export function createRequestContainer(env: AppBindings) {
  const db = createDb(env.DB);

  const resourceServerRepository = new DrizzleResourceServerRepository(db);

  return {
    resourceServers: {
      list: new ListResourceServersUseCase(resourceServerRepository),
      get: new GetResourceServerUseCase(resourceServerRepository),
      create: new CreateResourceServerUseCase(resourceServerRepository),
      update: new UpdateResourceServerUseCase(resourceServerRepository),
      disable: new DisableResourceServerUseCase(resourceServerRepository),
      delete: new DeleteResourceServerUseCase(resourceServerRepository),
    },
  };
}

export type AppContainer = ReturnType<typeof createRequestContainer>;
```

**Rules:**
- This is the ONLY file that imports from both `@/infrastructure/` and `@/application/` simultaneously
- Every use case must be instantiated here — no lazy instantiation
- The container type (`AppContainer`) is consumed by the Hono `AppEnv` for typed `c.get("container")` access
- No business logic in this file — pure wiring

### 6.7 Better Auth Factory Pattern

Better Auth cannot be stored in the DI container because on Cloudflare Workers it must be constructed per-request (D1 binding is request-scoped).

```ts
// auth/get-auth.ts
import { betterAuth } from "better-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { organization, jwt, admin } from "better-auth/plugins";
import { getAuthConfig } from "./config";
import { getResourceAudiences } from "./resource-audiences";
import { customClaims } from "./claims";

export function getAuth(env: AppBindings, request: Request) {
  const origin = env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  const config = getAuthConfig(env);

  return betterAuth({
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    secondaryStorage: {
      get: (key) => env.KV.get(key),
      set: (key, value, opts) => env.KV.put(key, value, opts),
      delete: (key) => env.KV.delete(key),
    },
    plugins: [
      organization(config.organization),
      jwt(config.jwt),
      admin(config.admin),
      oauthProvider({
        ...config.oauthProvider,
        validAudiences: getResourceAudiences(env),
        customAccessTokenClaims: customClaims.accessToken,
        customTokenResponseFields: customClaims.tokenResponse,
      }),
    ],
  });
}
```

**Rules:**
- Factory function only — no module-scope Better Auth instance
- Config lives in a pure helper (`config.ts`) that can be shared with CLI/schema generation paths
- `resource-audiences.ts` loads enabled audiences from D1 — this is the bridge between the UI-managed `resource_servers` table and the OAuth Provider's `validAudiences` config
- `claims.ts` contains custom claim enrichment functions — no inline claim logic in the factory
- The factory is called once per request from the Hono middleware that handles Better Auth routes

### 6.8 CrudAdapter Pattern

Centralized Drizzle/D1 persistence primitives. Every infrastructure repository delegates to it. Enforced by `architecture/repository-workflow` (repositories must use CrudAdapter, not raw `this.db.insert()`).

```ts
// infrastructure/persistence/crud-adapter.ts
export class CrudAdapter {
  constructor(private readonly db: DrizzleDatabase) {}

  listRows<Row>(params: ListParams): Promise<CursorPage<Row>> { /* cursor pagination */ }
  findRowById<Row>(id: string): Promise<Row | null> { /* single row by ID */ }
  insertRow<Row>(params: InsertParams): Promise<Row> { /* insert with optional onConflictDoNothing */ }
  updateRow<Row>(params: UpdateParams): Promise<Row> { /* partial update, drops undefined */ }
  deleteRowById(table, id): Promise<boolean> { /* returns whether a change occurred */ }
}
```

**Rules:**
- Every public method must have JSDoc (enforced by `architecture/crud-adapter-jsdoc`)
- Repositories must not import `drizzle-orm` operators directly — they use the CrudAdapter
- `db.batch()` is reserved for workflow ports only (idempotent multi-write operations); first batch doesn't need workflow ports

## 7. UI Architecture

### 7.1 Lumina System Contract

The `ui-id` worker's admin dashboard follows the Lumina UI system defined in `/home/quanghuy1242/pjs/books/docs/001_lumina_ui_system_daisyui_tailwind.md`. All visual components come from `packages/ui/`.

**Core rules:**
- DaisyUI v5 + Tailwind v4, CSS-first (no `tailwind.config.ts`)
- Token props on all components — no raw `className` on public API
- `unstable_className` escape hatch only on internal primitives, must be explainable in review
- Two themes: `lumina-light` (default) + `lumina-dark`
- Compact density as the baseline (`btn-sm`, `input-sm`, `menu-sm`, `card-compact`)
- React Aria at leaf components only — `"use client"` never at page level

### 7.2 Route File Rules

Admin pages in `workers/ui/src/app/admin/` follow these constraints:

**ALLOWED:**
- Compose `Page`, `PageHeader`, `PageBody`, `PageSection`, `Stack`, `Inline`, `Grid`, `Panel`, `Text`, `Heading`
- Compose `Button`, `LinkButton`, `TextField`, `Select`, and other `packages/ui/` components
- Pass route params, search params, data, and callbacks
- Call `packages/lib/` API client functions for data fetching

**FORBIDDEN:**
- Raw HTML layout tags: `div`, `main`, `section`, `header`, `footer`, `aside`, `nav`
- Raw typography tags: `h1`, `h2`, `h3`, `p`, `span`
- Raw DaisyUI classes: `btn`, `navbar`, `drawer`, `menu`, `card`, `dock`, `input`
- Raw Tailwind utility classes: `flex`, `grid`, `gap-*`, `p-*`, `text-*`, `bg-*`
- Direct `fetch()` calls — use the `packages/lib/` API client

### 7.3 Admin Page Conventions

```tsx
// workers/ui/src/app/admin/organizations/page.tsx
import { Page, PageHeader, PageBody, Stack, Panel, Text, Button } from "@id/ui";

export default function OrganizationsPage() {
  return (
    <Page>
      <PageHeader>
        <Text variant="h1">Organizations</Text>
        <Button variant="primary" size="sm">New Organization</Button>
      </PageHeader>
      <PageBody>
        <Stack gap="md">
          <Panel tone="base">...</Panel>
        </Stack>
      </PageBody>
    </Page>
  );
}
```

No raw HTML. No raw classes. No inline styles. Composition only.

## 8. Enforcement System

### 8.1 Oxlint Architecture Rules

The `scripts/oxlint-js-plugins/architecture.js` plugin contains rules ported from content-api, adapted for the id repo's two-worker topology. Rule details are implementation-accurate from the content-api source. Exact rule names may need minor adjustment during the pre-implementation spike.

| # | Rule | Severity | What it prevents |
|---|---|---|---|
| 1 | `layer-imports` | error | Layer boundary violations (domain importing drizzle, http importing drizzle, etc.) |
| 2 | `no-mapper-imports-outside-infra` | error | Mapper functions leaking into application/domain/HTTP layers |
| 3 | `no-storage-error-parsing` | error | SQLite/D1 error string matching outside infrastructure |
| 4 | `no-custom-errors-outside-shared` | error | Scattered error class definitions |
| 5 | `req-valid-usage` | error | Using raw `c.req.json()` instead of `c.req.valid("json")` |
| 6 | `no-plain-zod-import` | error | Importing plain `zod` instead of `@hono/zod-openapi` in schema files |
| 7 | `route-module` | error | Routes without `createRoute`, without `app.openapi`, without exactly one `.execute()`, security/requireActor mismatch |
| 8 | `route-handler-boundary` | error | `fetch()`, `c.env`, `JSON.parse`, direct storage calls, `new Response()` in handlers |
| 9 | `repository-workflow` | error | `this.db.insert()` instead of CrudAdapter, importing policies into repos, `db.batch()` outside workflow ports |
| 10 | `mapper-file` | error | Mappers that spread input without `.reconstitute()`/`.toSnapshot()`, importing from application/HTTP |
| 11 | `entity-class` | error | Plain type entities instead of classes with private constructor, `.create()`, `.reconstitute()`, `.toSnapshot()` |
| 12 | `no-raw-entity-serialization` | error | Passing entity instances directly to `JSON.stringify(entity)` or `{ ...entity }` |
| 13 | `crud-adapter-jsdoc` | error | Undocumented public methods on CrudAdapter |
| 14 | `no-magic-numbers` | error | Inline numeric literals in domain/application/HTTP/shared without named constants |
| 15 | `constants-placement` | error | `SCREAMING_SNAKE` constants outside `shared/`, `domain/`, or `infrastructure/` |
| 16 | `constants-jsdoc` | error | Undocumented exported constants |

**Additional rules specific to the id repo:**

| # | Rule | Severity | What it prevents |
|---|---|---|---|
| 17 | `worker-isolation` | error | `workers/core/` importing from `workers/ui/` and vice versa |
| 18 | `core-no-ui-deps` | error | `workers/core/` importing `react`, `react-dom`, `vinext`, `@vitejs/*` |
| 19 | `ui-no-auth-deps` | error | `workers/ui/` importing `better-auth`, `drizzle-orm`, `jose`, Cloudflare D1/KV bindings |
| 20 | `packages-lib-isolation` | error | `packages/lib/` importing any framework or package other than itself |
| 21 | `admin-auth-required` | error | Admin route handlers without `requireActor(c)` call |
| 22 | `no-console-log` | error | `console.log` in non-test production paths (oxlint built-in) |

**Configuration:**
- All architecture rules are `"error"` severity
- All architecture rules are disabled for `tests/**` and `**/*.d.ts` files
- Built-in oxlint plugins: `typescript`, `unicorn`, `oxc`, `vitest`, `import`, `promise`
- Built-in error-level rules: `typescript/no-explicit-any`, `import/no-cycle`, `no-console`, `eqeqeq`

### 8.2 Table Whitelist

Custom tables outside Better Auth's ownership must be explicitly approved. The `.schema-whitelist.json` file lists approved table names. A CI script (`scripts/check-schema-whitelist.mjs`) runs in `pnpm check` and fails if the Drizzle schema defines any table not in the whitelist.

```json
{
  "tables": ["resource_servers"],
  "note": "Add new tables only with explicit approval. Update this file and the planning doc together."
}
```

**Behavior:**
- Scans `workers/core/src/infrastructure/db/schema.ts` for exported Drizzle table definitions
- Any table name not in the whitelist → CI fails with: `Unapproved table: X. If this is intentional, update .schema-whitelist.json and the planning document.`
- Better Auth tables (user, session, organization, oauthClient, jwks, etc.) are NOT listed — they are managed by BA's CLI migration and are never defined in our `schema.ts`
- Custom tables defined via `additionalFields` on BA tables (e.g., `user.additionalFields.platformRole`) do not trigger the whitelist check — only standalone Drizzle table definitions

### 8.3 Duplicate Code Gate

Fallow runs in `--mode mild --min-tokens 50 --min-lines 5`. The `scripts/check-duplication-threshold.mjs` wrapper fails if duplication exceeds 3%.

This prevents LLM copy-paste patterns: identical use case flows, nearly-identical route handler blocks, duplicated entity definitions.

### 8.4 TypeScript Strict Mode

`strict: true` in the base `tsconfig.json`, extended by both workers and packages. Key options: `noEmit: true`, `moduleResolution: "bundler"`, `target: "ES2022"`. Path alias `@/*` → `src/*` in each worker.

### 8.5 Advisory Pass

`pnpm advise` runs two tools and filters output:

1. **Aislop** — broad agent-output scanner (duplicate imports, duplicate blocks, complexity, thin wrappers, narrative comments, security)
2. **Fallow** — conservative semantic duplication (`--mode semantic --min-tokens 150 --min-lines 10`)

The output is filtered through `.advise-suppressions.json`. Known architecture-mandated patterns (entity getter symmetry, mapper field mapping, create use case pattern, narrative JSDoc at boundaries) are auto-suppressed. New findings appear as review input. The suppression file should be reviewed periodically — if it grows significantly, the architecture may be generating noise.

### 8.6 Quality Gate Summary

| Gate | Command | Status |
|---|---|---|
| Lint | `pnpm lint` (oxlint with 22 architecture rules) | Hard gate in CI |
| Dup check | `pnpm check:dup` (Fallow <3%) | Hard gate in CI |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`) | Hard gate in CI |
| Tests | `pnpm test` (Vitest with Workers pool + jsdom) | Hard gate in CI |
| Schema whitelist | `pnpm check:schema` (custom script) | Hard gate in CI |
| Combined | `pnpm check` | All of the above |
| Advisory | `pnpm advise` (Aislop + Fallow semantic, filtered) | Non-blocking review input |

## 9. Toolchain

### 9.1 Root Configuration

**`package.json` (root)**
- Single package.json for the entire repo
- Wrangler bundles each worker independently via esbuild using per-worker `wrangler.jsonc`
- Dependencies: `better-auth`, `@better-auth/oauth-provider`, `hono`, `drizzle-orm`, `zod`, `jose`, `react`, `react-dom`, `react-aria-components`, `lucide-react`, `tailwindcss`, `daisyui`, `vinext`
- Dev dependencies: `oxlint`, `typescript`, `vitest`, `@cloudflare/vitest-pool-workers`, `@cloudflare/workers-types`, `wrangler`, `fallow`, `aislop`
- Package manager: `pnpm`

**`pnpm-workspace.yaml`**
```yaml
packages:
  - "."
  - "packages/*"
```

**`vitest.workspace.ts` (root)**
```ts
export default [
  "workers/core/vitest.config.ts",
  "workers/ui/vitest.config.ts",
];
```

### 9.2 Worker Configuration

**`workers/core/wrangler.jsonc`**
```jsonc
{
  "name": "id-core",
  "main": "src/main.ts",
  "compatibility_date": "2026-05-01",
  "d1_databases": [{ "binding": "DB", "database_name": "id", "database_id": "<UUID>" }],
  "kv_namespaces": [{ "binding": "KV", "id": "<ID>" }],
  "vars": {
    "BETTER_AUTH_URL": "https://id.quanghuy.dev"
  }
}
```

**`workers/ui/wrangler.jsonc`**
```jsonc
{
  "name": "id-ui",
  "main": "src/main.ts",
  "compatibility_date": "2026-05-01",
  "services": [{ "binding": "CORE_ID", "service": "id-core" }],
  "assets": { "directory": "./dist/client" }
}
```

### 9.3 Scripts

Defined in root `package.json`:

```json
{
  "scripts": {
    "dev": "wrangler dev --config workers/core/wrangler.jsonc",
    "dev:ui": "vinext dev --cwd workers/ui",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "check:dup": "node scripts/check-duplication-threshold.mjs",
    "check:schema": "node scripts/check-schema-whitelist.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "pnpm lint && pnpm check:dup && pnpm check:schema && pnpm typecheck && pnpm test",
    "advise": "node scripts/filter-advise.mjs",
    "advise:raw": "aislop scan && fallow dupes --mode semantic --min-tokens 150 --min-lines 10",
    "db:generate": "wrangler d1 migrations create id --config workers/core/wrangler.jsonc",
    "db:migrate:local": "wrangler d1 migrations apply id --local --config workers/core/wrangler.jsonc",
    "db:migrate:remote": "wrangler d1 migrations apply id --remote --config workers/core/wrangler.jsonc",
    "deploy:core": "wrangler deploy --config workers/core/wrangler.jsonc",
    "deploy:ui": "vinext deploy --cwd workers/ui"
  }
}
```

## 10. Rules Summary

Every rule in this document is mechanically enforced. No convention survives on good intentions alone.

| Category | Rule | Enforcement |
|---|---|---|
| Worker isolation | `workers/core/` and `workers/ui/` never cross-import | Oxlint `worker-isolation` |
| Core deps | `workers/core/` must not import React, React DOM, Vinext | Oxlint `core-no-ui-deps` |
| UI deps | `workers/ui/` must not import Better Auth, Drizzle, Jose, Cloudflare bindings | Oxlint `ui-no-auth-deps` |
| Package isolation | `packages/lib/` must not import any framework | Oxlint `packages-lib-isolation` |
| Layer imports | Domain ← Application ← HTTP ← Composition → Infrastructure | Oxlint `layer-imports` |
| Entity classes | Private constructor, `.create()`, `.reconstitute()`, `.toSnapshot()` | Oxlint `entity-class` |
| Serialization | No `JSON.stringify(entity)` — must use `.toSnapshot()` | Oxlint `no-raw-entity-serialization` |
| Route handlers | `c.req.valid()`, one `.execute()`, no `c.env`, no `fetch()` | Oxlint `route-module`, `route-handler-boundary` |
| Admin auth | Every admin route must call `requireActor(c)` | Oxlint `admin-auth-required` |
| Repositories | Use CrudAdapter, never `this.db.insert()`, never import policies | Oxlint `repository-workflow` |
| Mappers | `.reconstitute()` + `.toSnapshot()`, every field explicit, no external imports | Oxlint `mapper-file`, `no-mapper-imports-outside-infra` |
| Errors | All error classes in `shared/errors.ts` | Oxlint `no-custom-errors-outside-shared` |
| Constants | `SCREAMING_SNAKE` only in `shared/`, `domain/`, `infrastructure/` | Oxlint `constants-placement`, `no-magic-numbers` |
| Tables | Only `.schema-whitelist.json` tables may be defined in Drizzle schema | CI script `check:schema` |
| Duplication | <3% mild duplication threshold | Fallow gate in `pnpm check:dup` |
| Types | Strict mode, no explicit `any` | TypeScript + oxlint `typescript/no-explicit-any` |
| Console | No `console.log` in production paths | Oxlint `no-console` |
| UI composition | Route files compose components — no raw HTML, Tailwind, or DaisyUI classes | Code review (not lint-enforced in first batch; consider later) |

## 11. Pre-Implementation Spikes

Before full implementation, these architecture-level proofs must be completed:

### Spike A: Oxlint Rules Port

**Purpose:** Verify the 16 content-api architecture rules plus the 6 id-specific rules work against a minimal id codebase.

**Acceptance criteria:**
- A scaffolded `workers/core/src/` with one entity, one use case, one route handler, and one repository passes all rules
- A deliberately broken file (drizzle import in domain, raw `c.req.json()` in handler, plain type entity) fails all relevant rules
- Worker isolation rules detect cross-worker imports
- The oxlint config is committed and ready for implementation

### Spike B: Table Whitelist Script

**Purpose:** Verify `check-schema-whitelist.mjs` correctly identifies unapproved tables.

**Acceptance criteria:**
- A schema file with only `resource_servers` passes
- Adding a second Drizzle table definition fails the check
- The failure message includes the unapproved table name and remediation instructions

### Spike C: Single Package.json + Two Workers

**Purpose:** Verify Wrangler correctly bundles two workers from one `package.json` without dependency conflicts.

**Acceptance criteria:**
- `wrangler dev --config workers/core/wrangler.jsonc` starts and responds to requests
- `wrangler dev --config workers/ui/wrangler.jsonc` starts and serves a React page
- No runtime errors from shared dependencies
- Tree-shaking prevents React from landing in the core-id worker bundle

### Spike D: Service Binding Communication

**Purpose:** Verify `ui-id` can call `core-id`'s admin API through a Cloudflare service binding.

**Acceptance criteria:**
- A minimal `core-id` endpoint returns JSON
- A minimal `ui-id` page calls it via service binding and renders the response
- The round trip completes within `wrangler dev` local environment

## 12. Definition Of Done

### Required repository outcomes:

- [ ] Root layout matches the specification (≤12 config files, no noise)
- [ ] Single `package.json` with all dependencies; Wrangler bundles both workers correctly
- [ ] `packages/ui/` exists with Lumina component exports (buttons, layout, typography, app shell)
- [ ] `packages/lib/` exists with shared types, constants, and typed API client
- [ ] `workers/core/` has full hexagonal layer structure (domain, application, http, infrastructure, composition, shared, auth)
- [ ] `workers/ui/` has Vinext App Router with admin pages, importing only from `packages/ui/` and `packages/lib/`
- [ ] Workers never cross-import — enforced by oxlint
- [ ] Core never imports React, UI never imports Better Auth — enforced by oxlint

### Required enforcement outcomes:

- [ ] 22 oxlint architecture rules (16 ported + 6 id-specific) run as hard errors in CI
- [ ] `.schema-whitelist.json` exists and `check:schema` CI step fails on unapproved tables
- [ ] `pnpm check` passes (lint + dup <3% + schema whitelist + typecheck + tests)
- [ ] `pnpm advise` runs successfully and `.advise-suppressions.json` is populated for known architecture patterns
- [ ] TypeScript strict mode enabled and `typescript/no-explicit-any` is error-level

### Required pattern compliance:

- [ ] At least one domain entity follows the class contract (private constructor, `.create()`, `.reconstitute()`, `.toSnapshot()`)
- [ ] At least one infrastructure repository delegates to CrudAdapter
- [ ] At least one mapper follows the `.reconstitute()`/`.toSnapshot()` contract
- [ ] At least one route handler uses `createRoute`, `app.openapi`, `c.req.valid()`, exactly one `.execute()`, and `requireActor(c)`
- [ ] Request-scoped container is the only file importing from both `@/infrastructure/` and `@/application/`
- [ ] Better Auth factory is a per-request function, not a module-scope instance
- [ ] At least one admin page composes Lumina components without raw HTML/Tailwind/DaisyUI classes

### Required spike outcomes:

- [ ] Spike A: Oxlint rules port proven against scaffolded codebase
- [ ] Spike B: Table whitelist script proven with passing and failing cases
- [ ] Spike C: Single package.json + two workers bundle and start correctly
- [ ] Spike D: Service binding communication between ui-id and core-id works locally
