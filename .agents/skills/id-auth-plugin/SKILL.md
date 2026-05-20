# id Auth Plugin

Use this skill when creating, reviewing, or refactoring custom Better Auth plugins in this repository.

## Four-File Layout

Every plugin under `workers/core/src/auth/plugins/<name>/` uses this structure:

```text
index.ts       Better Auth plugin factory, schema, and endpoint wiring only
types.ts       Plugin option types, adapter context types, injected callback types
validation.ts  Zod schemas for request bodies and parsed input types
operations.ts  Business-rule helpers, row types, payload builders, assertions
```

`index.ts` exports the plugin factory returning `BetterAuthPlugin`. It may contain the BA `schema` block and `createAuthEndpoint` registrations. It must not contain business logic, helper functions, inline adapter types, authorization helpers, or payload builders.

`types.ts` owns plugin-level types. Adapter context types live here, not inline in `index.ts`.

`validation.ts` owns Zod validation only. It should not import Better Auth.

`operations.ts` owns pure helper functions. All exported functions in `operations.ts` must have JSDoc explaining behavior and thrown errors.

## Authorization

Authorization callbacks are injected from `workers/core/src/auth/get-auth.ts`. A plugin must not import `auth/admin/access.ts` directly. This keeps the plugin reusable and keeps platform/org policy composition in the auth factory.

## Tests

Unit-test `validation.ts` and `operations.ts` without a Better Auth context.

Integration-test endpoint handlers through `auth.handler()` using a real `betterAuth(getAuthOptions(...))` instance. Endpoint tests should exercise session behavior, adapter reads/writes, and authorization boundaries through Better Auth rather than calling handler internals.
