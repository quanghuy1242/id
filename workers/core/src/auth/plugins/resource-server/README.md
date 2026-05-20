# Resource Server Plugin

Better Auth plugin for admin-managed OAuth resource-server audiences.

## Ownership

This plugin owns the `resourceServer` Better Auth model and the `/api/auth/admin/resource-servers...` endpoint family. It is intentionally kept inside the `auth/` boundary because the table is a Better Auth plugin schema, not a standalone Drizzle/domain entity.

## File Responsibilities

- `schema.ts` is the source of truth for shapes. It defines the canonical Zod row schema, derives request body schemas, derives the Better Auth field map, and precomputes OpenAPI fragments.
- `index.ts` is the Better Auth contract. It registers the plugin schema and the six explicit endpoints. The endpoint blocks remain visible because each route has distinct validation, authorization, and cache-invalidation behavior.
- `operations.ts` holds testable helper logic: authorization wrappers, uniqueness checks, and create/update/disable payload builders.
- `types.ts` holds plugin options and runtime hooks injected from `get-auth.ts`. Keep this separate from `schema.ts`; callbacks are composition concerns, not data-shape concerns.

## Template Notes

Future custom Better Auth plugins should follow this shape before introducing a shared abstraction. Promote only stable utilities, such as Zod-to-BA field mapping or OpenAPI cleanup, after a second plugin proves the same needs. Do not extract a generic CRUD endpoint builder unless route-specific behavior becomes truly identical.

Module-scope schema artifacts are intentional. In Cloudflare Workers they are created when an isolate evaluates the module, while the plugin factory may still be called for each request-scoped Better Auth instance.
