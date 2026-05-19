# id — Repository Architecture, Layers, And Enforcement

> Status: implementation-grade architecture specification, rewritten after claim review
>
> Date: 2026-05-19
>
> Scope:
>
> - `/home/quanghuy1242/pjs/auth` — the `id` identity provider monorepo
>
> Source docs and reference implementations:
>
> - `/home/quanghuy1242/pjs/auth/README.md` — current repo contract; declares two Workers
> - `/home/quanghuy1242/pjs/auth/docs/001_first-batch-plan.md` — domain plan; older one-Worker topology is superseded by this architecture document
> - `/home/quanghuy1242/pjs/auth/docs/reference/content-api-architecture.md` — accepted content-api architecture facts for this review
> - `/home/quanghuy1242/pjs/content-api/scripts/oxlint-js-plugins/architecture.js` — verified 16-rule architecture plugin
> - `/home/quanghuy1242/pjs/content-api/.oxlintrc.json` — verified strict layer-import, route, entity, mapper, repository, constants, and test override rules
> - `/home/quanghuy1242/pjs/content-api/scripts/check-duplication-threshold.mjs` — verified 3% Fallow hard gate
> - `/home/quanghuy1242/pjs/books/docs/001_lumina_ui_system_daisyui_tailwind.md` — Lumina UI system reference
> - `/home/quanghuy1242/pjs/auther/package.json`
> - `/home/quanghuy1242/pjs/auther/src/lib/auth.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/app-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/rebac-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/pipeline-schema.ts`
> - `/home/quanghuy1242/pjs/auther/src/db/platform-access-schema.ts`
> - Better Auth OAuth Provider docs, checked on 2026-05-19: <https://better-auth.com/docs/plugins/oauth-provider>
> - Better Auth JWT plugin docs, checked on 2026-05-19: <https://better-auth.com/docs/plugins/jwt>
> - Better Auth Organization plugin docs, checked on 2026-05-19: <https://better-auth.com/docs/plugins/organization>
> - Better Auth database docs, checked on 2026-05-19: <https://www.better-auth.com/docs/concepts/database>
> - Cloudflare Workers service bindings docs, checked on 2026-05-19: <https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/>
> - Cloudflare Workers multi-Worker local development docs, checked on 2026-05-19: <https://developers.cloudflare.com/workers/development-testing/multi-workers/>
> - Cloudflare D1 Worker API docs, checked on 2026-05-19: <https://developers.cloudflare.com/d1/worker-api/d1-database/>
> - Vinext repository docs, checked on 2026-05-19: <https://github.com/cloudflare/vinext>
>
> Assumptions:
>
> - This document defines **how** the codebase is structured, layered, and enforced. `001_first-batch-plan.md` defines **what** is built.
> - This document is newer than the one-Worker wording in `001_first-batch-plan.md`; for repository topology, this document supersedes `001`.
> - The first batch deploys two Cloudflare Workers: `core-id` for auth/OAuth/JWKS/admin API and `ui-id` for the admin dashboard.
> - Workers never import from each other. Shared code lives in `packages/`.
> - Architecture rules are mechanical gates. LLM-friendly implementation freedom is not a goal of this document.
> - ReBAC, ABAC/Lua, webhook delivery, custom registration contexts, and pipeline scripting are intentionally out of first batch.

## Table Of Contents

- [1. Goal](#1-goal)
- [2. Review Findings And Corrections](#2-review-findings-and-corrections)
  - [2.1 Verified Claims To Keep Strong](#21-verified-claims-to-keep-strong)
  - [2.2 Corrections Applied](#22-corrections-applied)
  - [2.3 Architecture Gaps Strengthened](#23-architecture-gaps-strengthened)
- [3. Root Layout](#3-root-layout)
- [4. Worker Topology](#4-worker-topology)
  - [4.1 `core-id` — Auth And OAuth Worker](#41-core-id--auth-and-oauth-worker)
  - [4.2 `ui-id` — Admin UI Worker](#42-ui-id--admin-ui-worker)
  - [4.3 Worker Isolation](#43-worker-isolation)
  - [4.4 Local Multi-Worker Development](#44-local-multi-worker-development)
- [5. Shared Packages](#5-shared-packages)
  - [5.1 `packages/ui` — Lumina Component Library](#51-packagesui--lumina-component-library)
  - [5.2 `packages/lib` — Shared Types, Constants, API Client](#52-packageslib--shared-types-constants-api-client)
  - [5.3 Package Isolation](#53-package-isolation)
- [6. Core Layer Architecture](#6-core-layer-architecture)
  - [6.1 Layer Definitions](#61-layer-definitions)
  - [6.2 Import Rules](#62-import-rules)
  - [6.3 Banned External Imports Per Layer](#63-banned-external-imports-per-layer)
  - [6.4 Better Auth Boundary](#64-better-auth-boundary)
- [7. Design Patterns](#7-design-patterns)
  - [7.1 Entity Class Pattern](#71-entity-class-pattern)
  - [7.2 Repository Pattern](#72-repository-pattern)
  - [7.3 Mapper Pattern](#73-mapper-pattern)
  - [7.4 Use Case Pattern](#74-use-case-pattern)
  - [7.5 Route Handler Pattern](#75-route-handler-pattern)
  - [7.6 Request-Scoped Container](#76-request-scoped-container)
  - [7.7 Better Auth Factory Pattern](#77-better-auth-factory-pattern)
  - [7.8 CrudAdapter Pattern](#78-crudadapter-pattern)
- [8. UI Architecture](#8-ui-architecture)
  - [8.1 Lumina System Contract](#81-lumina-system-contract)
  - [8.2 Route File Rules](#82-route-file-rules)
  - [8.3 Admin Page Convention](#83-admin-page-convention)
  - [8.4 UI Enforcement](#84-ui-enforcement)
- [9. Data Ownership And Schema Control](#9-data-ownership-and-schema-control)
  - [9.1 Better Auth-Owned Tables](#91-better-auth-owned-tables)
  - [9.2 Custom Tables](#92-custom-tables)
  - [9.3 Table Whitelist](#93-table-whitelist)
- [10. Enforcement System](#10-enforcement-system)
  - [10.1 Oxlint Architecture Rules](#101-oxlint-architecture-rules)
  - [10.2 Duplicate Code Gate](#102-duplicate-code-gate)
  - [10.3 TypeScript Strict Mode](#103-typescript-strict-mode)
  - [10.4 Advisory Pass](#104-advisory-pass)
  - [10.5 Quality Gate Summary](#105-quality-gate-summary)
- [11. Toolchain](#11-toolchain)
  - [11.1 Root Configuration](#111-root-configuration)
  - [11.2 Worker Configuration](#112-worker-configuration)
  - [11.3 Scripts](#113-scripts)
- [12. Rules Summary](#12-rules-summary)
- [13. Pre-Implementation Spikes](#13-pre-implementation-spikes)
- [14. Risks, Edge Cases, And Failure Modes](#14-risks-edge-cases-and-failure-modes)
- [15. Test And Verification Plan](#15-test-and-verification-plan)
- [16. Definition Of Done](#16-definition-of-done)
- [17. Final Model](#17-final-model)

## 1. Goal

Define the repository structure, layer architecture, design patterns, and enforcement system for the `id` project. This document is the constitution: it constrains every line of code that enters the repo. The domain plan (`001_first-batch-plan.md`) defines what must be built. This document defines how it must be built.

The architecture prevents the structural problems observed in `/home/quanghuy1242/pjs/auther`:

- no layer boundaries: auth configuration imports pipeline hooks, webhook delivery, and permission services directly;
- no mechanical architecture enforcement: conventions are distributed through code and docs rather than CI gates;
- direct persistence access scattered across feature code, making auth-library and schema upgrades risky;
- entity state modeled as plain objects, making accidental serialization, mutation, and field leakage easy;
- too many control-plane systems in the first runtime: ReBAC, ABAC/Lua, pipeline execution, webhooks, registration contexts, and OAuth are all coupled.

The reference implementation is `/home/quanghuy1242/pjs/content-api`. It demonstrates a Cloudflare Worker with clean layer boundaries, a request-scoped container, domain entity classes, repository/mapper separation, 16 custom oxlint architecture rules, a strict duplicate-code gate, TypeScript strict mode, and advisory scanning. The `id` repo ports that enforcement stack, then adds worker/package/UI rules needed for a two-worker Better Auth system.

## 2. Review Findings And Corrections

### 2.1 Verified Claims To Keep Strong

The strict posture of the original architecture document is correct and should not be relaxed.

Verified local claims:

- `content-api` has a 16-rule `architecture` oxlint plugin with rules for layer imports, mapper isolation, storage error parsing, custom errors, request validation, route shape, route handler boundaries, repository workflow, mapper files, entity classes, raw entity serialization, CrudAdapter JSDoc, magic numbers, constants placement, and constants JSDoc.
- `content-api` runs `pnpm check` as a hard gate: lint, duplicate-code threshold, typecheck, and tests.
- `content-api` uses a 3% Fallow duplication threshold with `--mode mild --min-tokens 50 --min-lines 5`.
- `auther` uses Better Auth 1.3.x with `oidcProvider`, `jwt`, `apiKey`, `admin`, `username`, `oAuthProxy`, and `nextCookies`.
- `auther` contains resource-server, authorization-space, OAuth-client metadata, ReBAC, ABAC, webhook, pipeline, and registration-context persistence. Those are real systems and are intentionally not first-batch `id` systems.
- `README.md` declares the two-worker target: `core-id` and `ui-id`.

Verified external claims:

- Better Auth OAuth Provider is documented as an OAuth 2.1 provider plugin with OIDC compatibility, authorization-code with PKCE, refresh tokens, `client_credentials`, introspection, revocation, UserInfo, dynamic registration, JWT signing when requesting a `resource`, and remote JWKS verification. Source: [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider).
- Better Auth OAuth Provider requires well-known metadata endpoints at the issuer path. Source: [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider).
- Better Auth JWT plugin exposes `/api/auth/jwks` by default, supports custom `jwksPath`, and supports key rotation via `rotationInterval` and `gracePeriod`. Source: [Better Auth JWT](https://better-auth.com/docs/plugins/jwt).
- Better Auth database docs show Cloudflare Workers/D1 examples using a D1 binding in runtime config and CLI/schema generation paths for Cloudflare projects. Source: [Better Auth database docs](https://www.better-auth.com/docs/concepts/database).
- Package metadata checked with `npm view` on 2026-05-19: `better-auth@1.6.11`, `@better-auth/oauth-provider@1.6.11`, `vinext@0.0.50`, and `wrangler@4.92.0`.
- Cloudflare service bindings allow one Worker to call another without a public URL, support both HTTP-style `fetch()` and RPC-style calls, and are configured on the caller Worker. Source: [Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).
- Cloudflare documents running multiple Workers locally with multiple `-c` config flags; the first config is the primary HTTP Worker and the rest are accessible through service bindings. Source: [Cloudflare multi-Worker development](https://developers.cloudflare.com/workers/development-testing/multi-workers/).
- D1 `batch()` executes statements as a transaction and aborts or rolls back the whole sequence on failure. Source: [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
- Vinext currently documents Cloudflare Worker deployment for App Router and Pages Router, but it is still an experimental project. Source: [cloudflare/vinext](https://github.com/cloudflare/vinext).

### 2.2 Corrections Applied

These are corrections to facts or wording, not loosened architecture decisions:

- `001_first-batch-plan.md` still contains one-Worker wording. That is not a blocker for this document. This architecture document is newer and supersedes the old topology wording.
- The repo path is `/home/quanghuy1242/pjs/auth`; examples may refer to the product/package name `id`, but implementation paths should use the actual repo path.
- UserInfo should be documented as `/oauth2/userinfo` from Better Auth OAuth Provider. Depending on Better Auth base path/mounting, the public URL may include the auth base path; tests must assert the final route map.
- Better Auth JWT's default JWKS endpoint is `/api/auth/jwks`; custom OIDC-style paths such as `/.well-known/jwks.json` require explicit `jwksPath` configuration.
- The OAuth Provider sign-up prompt docs show `signUp` in configuration. Do not invent `signup` or other option names.
- `validAudiences`, custom token claims, JWKS rotation, and route mounting must be proven by the pinned installed packages before feature work proceeds. This proof is required because exact TypeScript option shapes matter, not because the architecture is optional.
- The root URL `/` should be owned by `core-id` by default. It can redirect to `/admin` or return service metadata, but `ui-id` must not become the default catch-all owner of auth/API paths.
- UI route composition cannot stay review-only. It must be mechanically enforced by an oxlint rule or a dedicated AST script before substantial admin pages merge.

### 2.3 Architecture Gaps Strengthened

The original hexagonal/clean architecture is good enough for `core-id`, but three boundaries need stronger wording:

1. Better Auth boundary:
   Better Auth is a runtime integration boundary. It is allowed in `src/auth/**`, selected route mounting files, migration/schema scripts, and tests. It is forbidden in domain and application code.

2. UI boundary:
   Admin route files must not draw UI directly. The route-file rules are strict and must become a mechanical gate, not just code review guidance.

3. Service binding boundary:
   Service binding traffic is internal transport, not trust. `core-id` admin routes must authorize every request even when called through `CORE_ID`.

## 3. Root Layout

The root stays minimal. No root `wrangler.jsonc`, no framework config that belongs to only one Worker, and no real environment files. Worker-specific configuration lives inside each worker directory. Shared packages live under `packages/`. Scripts live under `scripts/`. Documentation lives under `docs/`.

```text
/home/quanghuy1242/pjs/auth/
├── package.json                    # Single root package.json; each Worker bundles independently
├── pnpm-workspace.yaml             # Workspace: . (root), packages/*
├── pnpm-lock.yaml
├── tsconfig.json                   # Base config; workers and packages extend it
├── .oxlintrc.json                  # Shared lint rules for all workers and packages
├── .schema-whitelist.json          # Approved custom table names; CI fails on unlisted tables
├── .advise-suppressions.json       # Known advisory noise filtered during pnpm advise
├── vitest.workspace.ts             # References workers/core and workers/ui test configs
├── .dev.vars.example               # Documents required secret names; no real values
├── .gitignore
├── AGENTS.md                       # Agent/LLM workflow instructions
├── README.md
│
├── docs/
│   ├── 000_repo-architecture.md    # This document
│   ├── 001_first-batch-plan.md     # Domain and feature plan
│   └── reference/
│       └── content-api-architecture.md
│
├── scripts/
│   ├── check-duplication-threshold.mjs
│   ├── check-schema-whitelist.mjs
│   ├── check-ui-route-composition.mjs
│   ├── filter-advise.mjs
│   └── oxlint-js-plugins/
│       └── architecture.js
│
├── packages/
│   ├── ui/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── actions/
│   │       ├── feedback/
│   │       ├── forms/
│   │       ├── layout/
│   │       ├── navigation/
│   │       ├── page/
│   │       ├── theme/
│   │       ├── typography/
│   │       ├── app-shell/
│   │       └── index.ts
│   │
│   └── lib/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types.ts
│           ├── constants.ts
│           ├── errors.ts
│           ├── paths.ts
│           └── api-client.ts
│
└── workers/
    ├── core/
    │   ├── package.json
    │   ├── wrangler.jsonc
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/
    │   │   ├── main.ts
    │   │   ├── app.ts
    │   │   ├── domain/
    │   │   ├── application/
    │   │   ├── composition/
    │   │   ├── config/
    │   │   ├── http/
    │   │   ├── infrastructure/
    │   │   ├── shared/
    │   │   └── auth/
    │   └── tests/
    │
    └── ui/
        ├── package.json
        ├── wrangler.jsonc
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── vinext.config.ts
        ├── src/
        │   ├── main.ts
        │   ├── app/
        │   └── lib/
        └── tests/
```

## 4. Worker Topology

Two Cloudflare Workers deploy independently and communicate at runtime through service bindings, not through source imports.

```text
Internet
    │
    ├──> https://id.quanghuy.dev/                 ──> core-id worker
    ├──> https://id.quanghuy.dev/api/auth/*       ──> core-id worker
    ├──> https://id.quanghuy.dev/oauth2/*         ──> core-id worker
    ├──> https://id.quanghuy.dev/.well-known/*    ──> core-id worker
    ├──> https://id.quanghuy.dev/api/admin/*      ──> core-id worker
    │
    └──> https://id.quanghuy.dev/admin/*          ──> ui-id worker
                                                       └── CORE_ID service binding ──> core-id
```

Route specificity is part of the architecture. `/admin/*` is the UI Worker. Auth, OAuth, metadata, and admin API routes are the core Worker. `ui-id` must not become a public catch-all proxy for auth or API routes.

### 4.1 `core-id` — Auth And OAuth Worker

Responsibility:

- Better Auth handler for auth routes.
- OAuth 2.1/OIDC provider endpoints.
- well-known metadata endpoints.
- JWKS endpoint, using Better Auth JWT default `/api/auth/jwks` or an explicitly configured `jwksPath`.
- custom admin API for first-batch entities Better Auth does not own.
- OAuth flow pages if they need server-hosted auth state.
- token issuance, introspection, and revocation.
- resource audience loading and validation.

Bindings:

- `DB` — D1 database for Better Auth tables and approved custom tables.
- `KV` — secondary storage where Better Auth or local rate/session code needs it.
- `BETTER_AUTH_SECRET` — Better Auth secret key.
- `BETTER_AUTH_URL` — public issuer/base URL.
- email provider secrets.

Allowed stack:

- Hono.
- Better Auth 1.6.x.
- `@better-auth/oauth-provider`.
- Drizzle ORM.
- Zod.
- Jose, when needed for downstream verification tests or custom verification helpers.

Forbidden stack:

- React.
- React DOM.
- Vinext.
- Vite UI plugins.
- React Aria.
- DaisyUI/Tailwind runtime imports.
- UI package imports.

### 4.2 `ui-id` — Admin UI Worker

Responsibility:

- serve the admin dashboard.
- render admin pages for dashboard, organizations, OAuth clients, resource servers, users, consents, and settings.
- call `core-id` admin APIs through service binding on server-side UI paths or through public admin endpoints from browser code, depending on the session flow.
- never own auth state, token signing, D1 schema, or Better Auth initialization.

Bindings:

- `CORE_ID` — service binding to `core-id`.
- no D1.
- no KV unless a later document adds UI-specific cache storage.
- no Better Auth instance.

Allowed stack:

- Hono as a thin Worker adapter/proxy only.
- Vinext App Router.
- React 19.
- `packages/ui`.
- `packages/lib`.

Forbidden stack:

- Better Auth.
- Drizzle ORM.
- Jose.
- Cloudflare D1/KV binding types.
- imports from `workers/core/**`.

### 4.3 Worker Isolation

Workers are build-time isolated and runtime-communicating. The rule is absolute.

| Rule | Enforcement |
|---|---|
| `workers/core/src/**` must not import from `workers/ui/**` | Oxlint `worker-isolation` |
| `workers/ui/src/**` must not import from `workers/core/**` | Oxlint `worker-isolation` |
| `workers/core/src/**` must not import React, React DOM, Vinext, or Vite UI tooling | Oxlint `core-no-ui-deps` |
| `workers/ui/src/**` must not import Better Auth, Drizzle, Jose, or D1/KV bindings | Oxlint `ui-no-auth-deps` |
| Both workers may import from `packages/lib` | Allowed by package rules |
| Only `workers/ui` may import from `packages/ui` | Oxlint `core-no-ui-deps` |

### 4.4 Local Multi-Worker Development

Cloudflare supports service bindings in local development and supports multiple Worker configs in one `wrangler dev` command. Because only the first config is exposed as the primary HTTP Worker, the repo must include scripts for both common local modes.

```json
{
  "scripts": {
    "dev:core": "wrangler dev --config workers/core/wrangler.jsonc",
    "dev:ui": "vinext dev --cwd workers/ui",
    "dev:stack:core": "wrangler dev -c workers/core/wrangler.jsonc -c workers/ui/wrangler.jsonc",
    "dev:stack:ui": "wrangler dev -c workers/ui/wrangler.jsonc -c workers/core/wrangler.jsonc"
  }
}
```

Acceptance requirement:

- `dev:stack:ui` proves `/admin` can call `core-id` through `CORE_ID`.
- `dev:stack:core` proves core routes can run while the UI Worker is available as a secondary service.

## 5. Shared Packages

### 5.1 `packages/ui` — Lumina Component Library

Reusable React components follow the Lumina UI system from `/home/quanghuy1242/pjs/books/docs/001_lumina_ui_system_daisyui_tailwind.md`.

Design contract:

- token props, not raw `className`: `<Button variant="primary" size="sm">`, not `<button className="btn btn-primary btn-sm">`;
- DaisyUI v5 and Tailwind v4 CSS-first setup;
- two themes: `lumina-light` and `lumina-dark`;
- compact density everywhere;
- React Aria wrapped at leaf components only;
- `"use client"` stays at leaves and shell providers, never at route pages by default;
- typography via `Text` and `Heading`;
- layout via `Stack`, `Inline`, `Grid`, `Panel`, `Page`, `PageHeader`, `PageBody`, and `PageSection`;
- app shell via `AppShell`, `Topbar`, `Sidebar`, and `MobileDock`.

This package must not import Hono, Better Auth, Drizzle, Cloudflare bindings, or any `workers/**` code.

### 5.2 `packages/lib` — Shared Types, Constants, API Client

Zero-framework primitives shared between workers.

Contents:

- DTOs and API response shapes.
- error code constants.
- pagination types and constants.
- public path constants.
- typed API client for `core-id` admin APIs.

This package must not import React, Hono, Better Auth, Drizzle, Zod, Cloudflare bindings, or any worker-local source. If runtime validation is needed, keep schemas in the owning Worker and export inferred DTO types or duplicate a minimal type-only contract.

### 5.3 Package Isolation

| Package | May import from | Must not import |
|---|---|---|
| `packages/ui` | `packages/ui`, `packages/lib`, React, React DOM, React Aria, UI-only helpers | `workers/**`, Hono, Better Auth, Drizzle, Cloudflare bindings |
| `packages/lib` | `packages/lib` only | all frameworks, runtime adapters, workers |

## 6. Core Layer Architecture

The clean architecture applies inside `workers/core/src`. `ui-id` uses Vinext route conventions plus the UI composition rules in Section 8.

### 6.1 Layer Definitions

| Layer | Path | Purpose |
|---|---|---|
| Domain | `src/domain/` | Pure business logic: entities, repository interfaces, policies, value objects. No framework code. No I/O. |
| Application | `src/application/` | Use cases that orchestrate domain objects. No HTTP awareness. No database access. |
| HTTP | `src/http/` | Hono adapter: route definitions, middleware, schemas, presenters. |
| Infrastructure | `src/infrastructure/` | Concrete implementations: Drizzle repositories, D1 client, CrudAdapter, mappers. |
| Composition | `src/composition/` | Request-scoped DI wiring. |
| Config | `src/config/` | env parsing and binding types. |
| Shared | `src/shared/` | constants, error classes, pagination, validation primitives. |
| Auth | `src/auth/` | Better Auth integration: factory, config, claims, resource audience loader. |

`src/auth` is not a clean-architecture layer. It is an integration boundary. Domain and application code must never import it.

### 6.2 Import Rules

| Layer | Allowed internal imports |
|---|---|
| `domain/` | `@/domain/`, `@/shared/` |
| `application/` | `@/application/`, `@/domain/`, `@/shared/` |
| `http/` | `@/application/`, `@/composition/`, `@/config/`, `@/domain/`, `@/http/`, `@/shared/`, selected `@/auth/` route-mounting entrypoints |
| `infrastructure/` | `@/config/`, `@/domain/`, `@/infrastructure/`, `@/shared/` |
| `composition/` | `@/application/`, `@/composition/`, `@/config/`, `@/domain/`, `@/infrastructure/`, `@/shared/`, selected `@/auth/` factory/config entrypoints |
| `shared/` | `@/shared/` only |
| `auth/` | `@/config/`, `@/shared/`, selected domain types only, Better Auth packages |

### 6.3 Banned External Imports Per Layer

| Layer | Banned external imports |
|---|---|
| `domain/` | `@hono/`, `hono`, `drizzle-orm`, `better-auth`, `@better-auth/*`, `cloudflare:`, `@cloudflare/`, `react` |
| `application/` | `@hono/`, `hono`, `drizzle-orm`, `better-auth`, `@better-auth/*`, `cloudflare:`, `@cloudflare/`, `react` |
| `http/` | `drizzle-orm`, direct D1 access, React |
| `infrastructure/` | `@hono/`, `hono`, Better Auth, React |
| `shared/` | all runtime/framework packages unless explicitly approved |

### 6.4 Better Auth Boundary

Allowed Better Auth import locations:

- `workers/core/src/auth/**`.
- the minimal route mounting file if Better Auth's handler requires direct access there.
- migration/schema generation scripts.
- tests.

Forbidden:

- domain entities.
- repository interfaces.
- use cases.
- policies.
- mappers.
- `packages/lib`.
- `workers/ui`.

Better Auth records must not become domain entities. Domain code may receive stable IDs, actor data, scopes, organization IDs, and resource audiences through explicit DTOs.

## 7. Design Patterns

### 7.1 Entity Class Pattern

Every custom domain entity follows this contract. Enforced by `architecture/entity-class`.

```ts
// workers/core/src/domain/resource-servers/resource-server.entity.ts
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
      createdBy: input.createdBy,
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

Why classes:

- `JSON.stringify(entity)` returns `{}` unless a serializer is added.
- `{ ...entity }` returns `{}`.
- `.toSnapshot()` is the only data extraction path.
- mutations are named methods.
- `private constructor` prevents uncontrolled construction.

### 7.2 Repository Pattern

Domain defines repository interfaces. Infrastructure implements them. Enforced by `architecture/repository-workflow`.

```ts
// workers/core/src/domain/resource-servers/resource-server.repository.ts
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

Infrastructure repositories must:

- implement domain interfaces.
- use CrudAdapter for CRUD.
- use mapper functions for row/entity conversion.
- never import policies, use cases, or HTTP types.
- return entities, not rows.

### 7.3 Mapper Pattern

Mappers live under `workers/core/src/infrastructure/repositories/mappers`. Enforced by `architecture/mapper-file` and `architecture/no-mapper-imports-outside-infra`.

```ts
// workers/core/src/infrastructure/repositories/mappers/resource-server.mapper.ts
import { ResourceServer } from "@/domain/resource-servers/resource-server.entity";
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

export function resourceServerToInsertRow(entity: ResourceServer): ResourceServerRow {
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

Rules:

- explicitly map every field.
- never spread raw rows into entities.
- never serialize entities outside presenters/mappers.
- never import mappers from HTTP/application/domain.

### 7.4 Use Case Pattern

Use cases are classes with one public `execute()` method.

```ts
// workers/core/src/application/resource-servers/create-resource-server.usecase.ts
export type CreateResourceServerInput = CreateResourceServerProps & {
  actorId: string;
};

export class CreateResourceServerUseCase {
  constructor(
    private readonly resourceServerRepository: ResourceServerRepository,
  ) {}

  async execute(input: CreateResourceServerInput): Promise<ResourceServer> {
    const entity = ResourceServer.create(input);
    return this.resourceServerRepository.create(entity);
  }
}
```

Rules:

- constructor receives repository interfaces and policies.
- no HTTP context types.
- no database access.
- no Better Auth import.
- authorization lives in use cases or policies.

### 7.5 Route Handler Pattern

Custom API route handlers follow this shape. Better Auth handler routes are isolated exceptions.

```ts
// workers/core/src/http/routes/admin/resource-servers.routes.ts
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
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(z.any()),
            cursor: z.string().nullable(),
          }),
        },
      },
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

    return c.json({
      data: result.items.map(presentResourceServer),
      cursor: result.cursor,
    }, 200);
  });
}
```

Forbidden in custom route handlers:

- `c.env` direct access.
- `c.req.json()`, `c.req.query()`, or `c.req.param()` after schema validation is available.
- more than one use case `.execute()` for simple CRUD handlers.
- direct `fetch()`.
- direct database access.
- `JSON.parse()` or `JSON.stringify()` for business payloads.
- `new Response()` instead of framework response helpers, except low-level auth adapter boundaries.

Required:

- `security` metadata and `requireActor(c)` stay paired.
- exactly one use-case call for simple CRUD.
- presenter wraps entities before JSON.

### 7.6 Request-Scoped Container

One file wires dependencies per request.

```ts
// workers/core/src/composition/create-request-container.ts
import { createDb } from "@/infrastructure/db/client";
import { DrizzleResourceServerRepository } from "@/infrastructure/repositories/drizzle-resource-server.repository";
import { CreateResourceServerUseCase } from "@/application/resource-servers/create-resource-server.usecase";

export function createRequestContainer(env: AppBindings) {
  const db = createDb(env.DB);
  const resourceServerRepository = new DrizzleResourceServerRepository(db);

  return {
    resourceServers: {
      create: new CreateResourceServerUseCase(resourceServerRepository),
    },
  };
}

export type AppContainer = ReturnType<typeof createRequestContainer>;
```

Rules:

- only this file imports both infrastructure implementations and application use cases.
- no business logic.
- no route parsing.
- no module-scope request state.

### 7.7 Better Auth Factory Pattern

Better Auth must be constructed from Worker bindings through a runtime factory.

```ts
// workers/core/src/auth/get-auth.ts
import { betterAuth } from "better-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { organization, admin } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { getAuthConfig } from "./config";
import { getResourceAudiences } from "./resource-audiences";
import { customClaims } from "./claims";

export async function getAuth(env: AppBindings, request: Request) {
  const origin = env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  const config = getAuthConfig(env);
  const validAudiences = await getResourceAudiences(env);

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
        validAudiences,
        customAccessTokenClaims: customClaims.accessToken,
        customTokenResponseFields: customClaims.tokenResponse,
      }),
    ],
  });
}
```

Implementation notes:

- The async shape is intentional because D1-backed resource audiences may be loaded before constructing the provider.
- If Better Auth requires `validAudiences` to be synchronous in the installed version, the resource audience loader must use a request-local cache or the architecture must choose a static bootstrap source and document the tradeoff.
- Better Auth config option names must be proven against the pinned package types.
- No module-scope Better Auth instance can capture runtime bindings.
- Config used for runtime and schema generation must be factored so migrations cannot drift from runtime config.

### 7.8 CrudAdapter Pattern

Centralized Drizzle/D1 persistence primitives. Every infrastructure repository delegates to it.

```ts
// workers/core/src/infrastructure/persistence/crud-adapter.ts
export class CrudAdapter {
  constructor(private readonly db: DrizzleDatabase) {}

  /** Lists rows with cursor pagination. */
  listRows<Row>(params: ListParams): Promise<CursorPage<Row>> {
    // implementation
  }

  /** Finds one row by ID. */
  findRowById<Row>(id: string): Promise<Row | null> {
    // implementation
  }

  /** Inserts one row and returns the inserted row. */
  insertRow<Row>(params: InsertParams): Promise<Row> {
    // implementation
  }

  /** Updates one row and returns the updated row. */
  updateRow<Row>(params: UpdateParams): Promise<Row> {
    // implementation
  }

  /** Deletes one row by ID and reports whether it existed. */
  deleteRowById(table: unknown, id: string): Promise<boolean> {
    // implementation
  }
}
```

Rules:

- every public method has JSDoc.
- repositories use CrudAdapter, not raw `this.db.insert()`.
- `db.batch()` is reserved for workflow ports or infrastructure methods explicitly documented as atomic multi-write operations.

## 8. UI Architecture

### 8.1 Lumina System Contract

The admin dashboard follows Lumina.

Core rules:

- DaisyUI v5 and Tailwind v4 CSS-first.
- token props on public components.
- no raw `className` in route files.
- `unstable_className` only on internal primitives and only with review explanation.
- two themes: `lumina-light` and `lumina-dark`.
- compact density.
- React Aria only at leaf interactive components or shell/provider boundaries.
- no `"use client"` at page level unless a specific page is a client-only island and the exception is documented.

### 8.2 Route File Rules

Admin pages in `workers/ui/src/app/admin/**` are composition files. Full admin pages are deferred (see `001_first-batch-plan.md` Section 10), but the composition rules apply from the first page committed.

Allowed:

- import app-specific page sections.
- import `packages/ui` primitives.
- import `packages/lib` DTOs/API-client helpers.
- pass route params, search params, and already-shaped data.

Forbidden:

- raw layout tags: `div`, `main`, `section`, `header`, `footer`, `aside`, `nav`;
- raw typography tags: `h1`, `h2`, `h3`, `p`, `span`;
- raw DaisyUI classes: `btn`, `navbar`, `drawer`, `menu`, `card`, `dock`, `input`;
- raw Tailwind utility classes: `flex`, `grid`, `gap-*`, `p-*`, `text-*`, `bg-*`;
- direct `fetch()`;
- importing from `workers/core/**`;
- importing Better Auth, Drizzle, D1/KV types, or Jose.

### 8.3 Admin Page Convention

```tsx
// workers/ui/src/app/admin/organizations/page.tsx
import { Page, PageBody, PageHeader, Panel, Stack, Text, Button } from "@id/ui";

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

### 8.4 UI Enforcement

UI route-file rules must be mechanical.

Implement one of:

- `architecture/ui-route-composition` oxlint rule.
- `scripts/check-ui-route-composition.mjs` AST script.

The rule/script must fail on:

- forbidden JSX intrinsic elements in `workers/ui/src/app/admin/**/page.tsx` and layout route files;
- forbidden `className` values containing raw Tailwind/DaisyUI classes;
- direct `fetch()`;
- imports from core source;
- forbidden auth/persistence packages.

Tests must include passing and failing fixtures. This is a first-batch quality gate, not future polish.

## 9. Data Ownership And Schema Control

### 9.1 Better Auth-Owned Tables

Better Auth owns its generated schema:

- users.
- sessions.
- accounts.
- verification/reset state.
- organizations, members, invitations, teams.
- OAuth clients, tokens, consents, and related OAuth Provider tables.
- JWT/JWKS tables.

Do not define Better Auth tables in `workers/core/src/infrastructure/db/schema.ts`.

### 9.2 Custom Tables

First-batch custom standalone tables are minimal.

Approved starting table:

- `resource_servers`

Likely fields:

- `id`
- `organization_id`
- `slug`
- `name`
- `audience`
- `description`
- `enabled`
- `created_by`
- `updated_by`
- `disabled_at`
- `disabled_by`
- `created_at`
- `updated_at`

Forbidden in first batch:

- `authorization_spaces`
- ReBAC tuple/model tables
- ABAC policy tables
- webhook tables
- pipeline tables
- registration-context tables

### 9.3 Table Whitelist

`.schema-whitelist.json` is mandatory.

```json
{
  "tables": ["resource_servers"],
  "note": "Add new custom tables only with explicit architecture-doc approval."
}
```

`scripts/check-schema-whitelist.mjs` fails CI when `workers/core/src/infrastructure/db/schema.ts` defines an unlisted standalone Drizzle table. Better Auth generated schema is outside this file and outside this whitelist.

## 10. Enforcement System

### 10.1 Oxlint Architecture Rules

The architecture plugin is ported from content-api and extended for `id`.

Content-api rules, all hard errors:

| # | Rule | What it prevents |
|---|---|---|
| 1 | `layer-imports` | wrong internal/external imports per layer |
| 2 | `no-mapper-imports-outside-infra` | mapper leakage outside infrastructure |
| 3 | `no-storage-error-parsing` | storage error string matching outside infrastructure |
| 4 | `no-custom-errors-outside-shared` | scattered custom error classes |
| 5 | `req-valid-usage` | raw request parsing instead of validated input |
| 6 | `no-plain-zod-import` | plain `zod` imports in OpenAPI schema contexts |
| 7 | `route-module` | routes without required createRoute/openapi/security shape |
| 8 | `route-handler-boundary` | side effects and persistence in handlers |
| 9 | `repository-workflow` | raw DB writes and policy imports in repositories |
| 10 | `mapper-file` | unsafe mapper structure |
| 11 | `entity-class` | plain object entities |
| 12 | `no-raw-entity-serialization` | spreading/stringifying entities |
| 13 | `crud-adapter-jsdoc` | undocumented CrudAdapter methods |
| 14 | `no-magic-numbers` | unnamed numeric policy/config literals |
| 15 | `constants-placement` | constants outside approved locations |
| 16 | `constants-jsdoc` | undocumented exported constants |

Id-specific rules, all hard errors:

| # | Rule | What it prevents |
|---|---|---|
| 17 | `worker-isolation` | cross-imports between core and UI workers |
| 18 | `core-no-ui-deps` | React/Vinext/UI dependencies in core |
| 19 | `ui-no-auth-deps` | Better Auth/Drizzle/Jose/D1/KV dependencies in UI |
| 20 | `packages-lib-isolation` | framework/runtime imports in `packages/lib` |
| 21 | `auth-boundary` | Better Auth imports outside approved core files |
| 22 | `admin-auth-required` | admin API routes without explicit actor requirement |
| 23 | `ui-route-composition` | raw HTML/classes/fetch/core imports in admin route files |

Built-in hard rules:

- `no-console`
- `eqeqeq`
- `import/no-cycle`
- `typescript/no-explicit-any`

Tests and `.d.ts` files may disable architecture rules only through explicit overrides.

### 10.2 Duplicate Code Gate

Fallow hard gate:

```text
fallow dupes --mode mild --min-tokens 50 --min-lines 5 --skip-local --ignore-imports --format json --quiet
```

Threshold: 3%.

The gate exists specifically to stop LLM copy-paste drift in route handlers, use cases, entities, mappers, and UI pages.

### 10.3 TypeScript Strict Mode

Base config:

- `strict: true`
- `noEmit: true`
- `moduleResolution: "bundler"`
- `target: "ES2022"`

Each worker owns its own `@/* -> src/*` alias. Packages use package imports, not worker-local aliases.

### 10.4 Advisory Pass

`pnpm advise` runs Aislop plus semantic Fallow and filters through `.advise-suppressions.json`.

Advisory output is not a substitute for hard gates. It is review input for structural risk that the hard gates do not cover.

### 10.5 Quality Gate Summary

| Gate | Command | Status |
|---|---|---|
| Lint | `pnpm lint` | Hard gate |
| Dup check | `pnpm check:dup` | Hard gate |
| Schema whitelist | `pnpm check:schema` | Hard gate |
| UI composition | `pnpm check:ui` | Hard gate |
| Typecheck | `pnpm typecheck` | Hard gate |
| Tests | `pnpm test` | Hard gate |
| Combined | `pnpm check` | Hard gate |
| Advisory | `pnpm advise` | Review input, must be run before major PRs |

## 11. Toolchain

### 11.1 Root Configuration

Root `package.json`:

- one dependency manifest for the monorepo;
- per-worker package manifests may exist for ownership and scripts, but root owns install/lock;
- Wrangler bundles workers from per-worker config;
- dependencies include Better Auth, OAuth Provider, Hono, Drizzle, Zod, Jose, React, React DOM, React Aria, Lucide, Tailwind, DaisyUI, and Vinext;
- dev dependencies include oxlint, TypeScript, Vitest, Cloudflare Workers types/pool, Wrangler, Fallow, and Aislop.

Workspace:

```yaml
packages:
  - "."
  - "packages/*"
  - "workers/*"
```

### 11.2 Worker Configuration

`workers/core/wrangler.jsonc`:

```jsonc
{
  "name": "id-core",
  "main": "src/main.ts",
  "compatibility_date": "2026-05-19",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "id",
      "database_id": "<UUID>"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "<ID>"
    }
  ],
  "vars": {
    "BETTER_AUTH_URL": "https://id.quanghuy.dev"
  }
}
```

`workers/ui/wrangler.jsonc`:

```jsonc
{
  "name": "id-ui",
  "main": "src/main.ts",
  "compatibility_date": "2026-05-19",
  "services": [
    {
      "binding": "CORE_ID",
      "service": "id-core"
    }
  ],
  "assets": {
    "directory": "./dist/client"
  }
}
```

### 11.3 Scripts

```json
{
  "scripts": {
    "dev:core": "wrangler dev --config workers/core/wrangler.jsonc",
    "dev:ui": "vinext dev --cwd workers/ui",
    "dev:stack:core": "wrangler dev -c workers/core/wrangler.jsonc -c workers/ui/wrangler.jsonc",
    "dev:stack:ui": "wrangler dev -c workers/ui/wrangler.jsonc -c workers/core/wrangler.jsonc",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "check:dup": "node scripts/check-duplication-threshold.mjs",
    "check:schema": "node scripts/check-schema-whitelist.mjs",
    "check:ui": "node scripts/check-ui-route-composition.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "pnpm lint && pnpm check:dup && pnpm check:schema && pnpm check:ui && pnpm typecheck && pnpm test",
    "advise": "node scripts/filter-advise.mjs",
    "db:generate": "auth generate && drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply id --local --config workers/core/wrangler.jsonc",
    "db:migrate:remote": "wrangler d1 migrations apply id --remote --config workers/core/wrangler.jsonc",
    "deploy:core": "wrangler deploy --config workers/core/wrangler.jsonc",
    "deploy:ui": "vinext deploy --cwd workers/ui"
  }
}
```

The exact `db:generate` command must be finalized after the Better Auth schema-generation spike. The invariant is fixed: Better Auth schema generation and custom Drizzle migration generation must both be represented, repeatable, and documented.

## 12. Rules Summary

Every rule in this document is mechanically enforced. No convention survives on good intentions.

| Category | Rule | Enforcement |
|---|---|---|
| Worker isolation | core and UI workers never cross-import | Oxlint `worker-isolation` |
| Core deps | core never imports UI packages/deps | Oxlint `core-no-ui-deps` |
| UI deps | UI never imports auth/persistence/signing deps | Oxlint `ui-no-auth-deps` |
| Package isolation | `packages/lib` stays framework-free | Oxlint `packages-lib-isolation` |
| Auth boundary | Better Auth imports stay in approved files | Oxlint `auth-boundary` |
| Layer imports | domain/application/http/infrastructure/composition/shared imports stay directional | Oxlint `layer-imports` |
| Entity classes | private constructor, create, reconstitute, toSnapshot | Oxlint `entity-class` |
| Serialization | no raw entity spreading/stringifying | Oxlint `no-raw-entity-serialization` |
| Routes | validated inputs, one use case, presenter output | Oxlint route rules |
| Admin auth | admin API routes require actor | Oxlint `admin-auth-required` |
| Repositories | CrudAdapter and mapper workflow only | Oxlint `repository-workflow` |
| Mappers | explicit row/entity conversion | Oxlint mapper rules |
| Errors | custom errors centralized | Oxlint `no-custom-errors-outside-shared` |
| Constants | placement and JSDoc rules | Oxlint constants rules |
| Tables | only approved custom tables | `check:schema` |
| UI route composition | no raw admin route UI | `ui-route-composition` or `check:ui` |
| Duplication | <3% mild duplication | `check:dup` |
| Types | strict and no explicit `any` | TypeScript + oxlint |
| Console | no production console logging | oxlint built-in |

## 13. Pre-Implementation Spikes

These are not permission to loosen the architecture. They are proof tasks required before broad implementation.

### Spike A: Architecture Rule Port

Purpose: port the 16 content-api rules and add id-specific rules.

Acceptance:

- valid fixture with one entity, mapper, repository, use case, route, and UI page passes;
- invalid fixtures fail each rule;
- all rules are hard errors in `pnpm lint`.

### Spike B: Table Whitelist Script

Purpose: prove custom table control.

Acceptance:

- `resource_servers` passes;
- an unlisted table fails;
- Better Auth generated tables are not scanned from custom schema.

### Spike C: Better Auth Contract

Purpose: prove the installed Better Auth 1.6.11 API shape.

Acceptance:

- OAuth Provider route map is documented from tests/types;
- `/oauth2/userinfo` route behavior is tested;
- JWKS default/custom path is tested;
- `validAudiences`, custom claims, and resource-bound JWT behavior are tested;
- key rotation with `kid` and grace period is tested;
- schema generation command is finalized.

### Spike D: Two Workers And Service Binding

Purpose: prove Cloudflare topology.

Acceptance:

- `core-id` starts independently;
- `ui-id` starts independently;
- `dev:stack:ui` renders `/admin` and calls `core-id`;
- deployed service binding order is documented: deploy `id-core` before `id-ui`.

### Spike E: UI Composition Gate

Purpose: prove admin pages cannot bypass Lumina.

Acceptance:

- raw admin route `<div>` fails;
- raw Tailwind/DaisyUI class fails;
- direct `fetch()` fails;
- import from `workers/core` fails;
- valid composition page passes.

## 14. Risks, Edge Cases, And Failure Modes

| Risk | Failure mode | Required mitigation |
|---|---|---|
| Old one-Worker wording in `001` | Implementer scaffolds wrong topology | Update `001` to state it is superseded by `000` for repo topology. |
| Better Auth route mismatch | UI/tests target stale endpoint names | Spike C route-map tests. |
| JWKS path confusion | resource servers fetch wrong key URL | Decide default `/api/auth/jwks` vs custom `/.well-known/jwks.json` and test discovery. |
| Dynamic audiences unsupported | UI-managed resource servers cannot feed provider config | Prove `validAudiences` runtime shape or choose documented static/cached bridge. |
| Service binding trust bypass | internal UI call skips auth | core admin API authorizes every request. |
| D1 transaction overreach | multi-step flows assume long-lived transactions | use D1 `batch()` only for bounded atomic writes; add idempotency for multi-call flows. |
| Legacy scope creep | ReBAC/ABAC/webhooks/pipeline tables appear | schema whitelist and docs review. |
| UI raw markup drift | LLM writes route pages directly | `check:ui` or oxlint UI rule. |
| Package leak | `packages/lib` imports runtime frameworks | package isolation lint. |
| Bundle leak | React/Vinext enters core | `core-no-ui-deps` plus bundle smoke. |
| Secret leakage | `.dev.vars` committed | `.dev.vars.example` only and secret scan if available. |

## 15. Test And Verification Plan

Automated:

- `pnpm lint`
- `pnpm check:dup`
- `pnpm check:schema`
- `pnpm check:ui`
- `pnpm typecheck`
- `pnpm test`
- `pnpm check`

Core tests:

- env parsing.
- Better Auth factory construction under Worker bindings.
- OAuth authorization-code + PKCE.
- `client_credentials`.
- invalid resource audience rejection.
- JWKS verification and rotation.
- admin route auth.
- `resource_servers` CRUD.
- schema whitelist passing/failing fixtures.
- route-handler lint failing fixtures.

UI tests:

- `/admin` render.
- app shell render.
- service binding API call path.
- unauthorized admin state.
- UI composition failing fixtures.

Manual smoke:

- run `dev:stack:ui`;
- visit `/admin`;
- sign in;
- create resource server;
- create OAuth client;
- complete PKCE flow;
- verify access token against JWKS from a standalone script;
- deploy `core-id`, then `ui-id`, and repeat smoke.

## 16. Definition Of Done

Required repository outcomes:

- [ ] `001_first-batch-plan.md` explicitly notes that this document supersedes its one-Worker topology.
- [ ] root layout matches this spec.
- [ ] `packages/ui` exists and exports Lumina primitives.
- [ ] `packages/lib` exists and remains framework-free.
- [ ] `workers/core` has full clean architecture layers plus `src/auth`.
- [ ] `workers/ui` has Vinext admin pages and no auth/persistence/signing imports.
- [ ] two-worker local dev works through service bindings.
- [ ] deployed route ownership is documented and tested.

Required enforcement outcomes:

- [ ] 16 content-api architecture rules are ported.
- [ ] id-specific rules are implemented as hard errors.
- [ ] UI route composition is mechanically enforced.
- [ ] `.schema-whitelist.json` exists.
- [ ] `check:schema` fails on unapproved custom tables.
- [ ] duplicate-code threshold is <3%.
- [ ] TypeScript strict mode is enabled.
- [ ] `pnpm check` passes from a clean checkout.
- [ ] `pnpm advise` runs and suppressions are reviewed.

Required pattern compliance:

- [ ] at least one custom entity follows the class contract.
- [ ] at least one repository uses CrudAdapter.
- [ ] at least one mapper explicitly maps row/entity fields.
- [ ] at least one custom route follows the route-handler contract.
- [ ] request-scoped container is the only app/infrastructure wiring file.
- [ ] Better Auth factory is request/binding-aware.
- [ ] at least one admin page passes UI composition enforcement.

Required auth/platform outcomes:

- [ ] Better Auth schema generation and D1 migration path is documented.
- [ ] OAuth Provider routes are tested.
- [ ] JWKS default/custom path decision is tested.
- [ ] resource-bound JWT access token is verified by JWKS.
- [ ] service binding communication is tested locally.

## 17. Final Model

`id` is a strict two-worker identity-provider monorepo.

`core-id` owns auth, OAuth, tokens, JWKS, D1/KV, custom admin APIs, resource audiences, and authorization checks. `ui-id` owns admin presentation and calls `core-id`; it never owns persistence, Better Auth, signing, or domain rules. `packages/lib` carries only framework-free contracts. `packages/ui` carries reusable Lumina UI components.

The clean architecture from content-api is strong enough for the core Worker. The correct improvement is not to loosen it; the correct improvement is to add the missing Better Auth boundary, UI route composition enforcement, and service-binding authorization invariant.
