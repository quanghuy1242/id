/**
 * The OAuth protocol-scopes plugin owns no Better Auth schema rows — it is a
 * behavior-only plugin that registers `hooks.before` matchers folding the
 * universal OIDC protocol scopes into a client's registered scope set on
 * create/update.
 *
 * This file is required by the `architecture/auth-plugin-folder-shape` linter.
 * The plugin's option shape lives in `types.ts`; the pure merge logic lives in
 * `operations.ts`; the wiring lives in `index.ts`.
 */
export type OAuthProtocolScopesSchema = Record<string, never>;
