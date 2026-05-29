/**
 * The admin sign-in guard owns no Better Auth schema rows — it is a
 * behavior-only plugin that registers a single `hooks.before` guard on
 * `/sign-in/email` (doc 024). OTP codes and rate-limit counters live in KV,
 * not the relational schema.
 *
 * This file is required by the `architecture/auth-plugin-folder-shape` linter.
 * Plugin options live in `types.ts`; OTP/credential/rate-limit helpers live in
 * `operations.ts`; the guard wiring lives in `index.ts`.
 */
export type AdminSignInGuardSchema = Record<string, never>;
