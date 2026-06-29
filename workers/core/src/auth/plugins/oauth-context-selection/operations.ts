/**
 * Pure request-path helpers for the `id-oauth-context-selection` plugin. Kept
 * free of Better Auth so the path matching is unit-testable in isolation;
 * `index.ts` owns the hook wiring.
 */

function pathMatches(ctx: { readonly path?: string }, suffix: string): boolean {
  return (
    typeof ctx.path === "string" &&
    (ctx.path === suffix || ctx.path.endsWith(suffix))
  );
}

/** Whether the request targets one of the OAuth post-login `continue` endpoints. */
export function isContinuePath(ctx: { readonly path?: string }): boolean {
  return (
    pathMatches(ctx, "/oauth2/continue") ||
    pathMatches(ctx, "/oauth2/admin/continue") ||
    pathMatches(ctx, "/admin/oauth2/continue")
  );
}
