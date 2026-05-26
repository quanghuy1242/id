/**
 * The OAuth M2M bridge plugin owns no Better Auth schema rows — it is a
 * behavior-only plugin that registers a single `hooks.before` guard enforcing
 * doc 018 §5.5 D5 (immutable `referenceId` on `client_credentials` clients).
 *
 * This file is required by the `architecture/auth-plugin-folder-shape` linter.
 * The guard's row shape lives in `types.ts`; the grant-type check lives in
 * `operations.ts`; the wiring lives in `index.ts`.
 */
export type OAuthM2MBridgeSchema = Record<string, never>;
