/**
 * The OAuth context-selection plugin owns no Better Auth schema rows — it is a
 * behavior-only plugin that registers a single `hooks.before` matcher on
 * `/oauth2/continue` to capture the post-login authorization-context selection.
 *
 * This file is required by the `architecture/auth-plugin-folder-shape` linter.
 * The in-isolate bridge it writes to lives in
 * `src/auth/authorization-context-selection.ts`; the wiring lives in
 * `index.ts`.
 */
export type OAuthContextSelectionSchema = Record<string, never>;
