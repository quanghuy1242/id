/**
 * Reusable request-context helpers that serve multiple plugins or route files.
 *
 * These are deliberately framework-free: no Better Auth, Hono, Drizzle, or
 * infrastructure imports. Put cross-cutting body/header parsing here instead
 * of duplicating it in individual plugin or route files.
 */

/**
 * Reads a string value from a flat Better Auth hook-context body.
 * Returns `undefined` when the key is absent or the value is not a string.
 */
export function readString(body: Record<string, unknown>, key: string): string | undefined {
  return typeof body[key] === "string" ? (body[key] as string) : undefined;
}

/**
 * Coerces the Better Auth hook-context `body` into a flat key/value object.
 * Returns `{}` when body is absent or not an object.
 */
export function readBody(ctx: { readonly body?: unknown }): Record<string, unknown> {
  return ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, unknown>) : {};
}

/**
 * Extracts a bare Bearer token from an Authorization header value.
 * Returns `null` when the header is absent, empty, or does not start with
 * `"Bearer "`.  Callers must validate and throw/handle the `null` case.
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) return null;
  return authorizationHeader.slice(prefix.length);
}
