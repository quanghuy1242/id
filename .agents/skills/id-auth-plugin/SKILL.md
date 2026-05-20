---
name: id-auth-plugin
description: Maintain custom Better Auth plugins in this repository. Use when creating, reviewing, refactoring, or testing code under workers/core/src/auth/plugins/**, especially plugin schema definitions, createAuthEndpoint handlers, plugin options, OpenAPI metadata, and resource-server plugin patterns.
---

# id Auth Plugin

Use this skill for custom Better Auth plugin work in `/home/quanghuy1242/pjs/auth`.

## Required Reference

Read `workers/core/src/auth/plugins/README.md` before changing plugin structure, adding a plugin, or refactoring shared plugin patterns. Treat it as the detailed guideline for file layout, ownership boundaries, and promotion rules.

For the current concrete template, also read `workers/core/src/auth/plugins/resource-server/README.md` when working on `id-resource-server` or modeling a new plugin after it.

## Core Rules

- Keep custom plugins inside the `auth/` boundary: Better Auth schema, `createAuthEndpoint`, adapter context, validation, and plugin-local helpers.
- Do not add standalone Drizzle schemas, repositories, domain entities, or application use cases for Better Auth-owned plugin tables.
- Keep `index.ts` as the Better Auth contract surface: plugin factory, schema registration, explicit endpoint declarations.
- Keep `schema.ts` as the data/API shape surface: canonical Zod model, request schemas, derived Better Auth field map, and OpenAPI fragments.
- Keep `types.ts` for runtime composition hooks injected by `get-auth.ts`; do not merge callback options into `schema.ts`.
- Keep `operations.ts` for helper logic that can be unit-tested without a Better Auth request context.
- Inject authorization callbacks from `workers/core/src/auth/get-auth.ts`; never import `auth/admin/access.ts` directly inside a plugin.

## Validation

- Unit-test schema derivation and operation helpers without Better Auth context.
- Integration-test endpoint handlers through `auth.handler()` using `betterAuth(getAuthOptions(...))`.
- Run `pnpm check` after code changes.
- Run `pnpm advise` after substantial plugin refactors and handle new findings according to repo guidance.
