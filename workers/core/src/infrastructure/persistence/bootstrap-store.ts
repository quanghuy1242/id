/**
 * Checks for an existing native Better Auth admin before first-admin bootstrap.
 *
 * This intentionally uses raw D1 in `infrastructure/persistence` because the
 * bootstrap guard runs before any admin session exists, while Better Auth's
 * admin list-users API requires an already-authenticated admin. Keep raw D1
 * limited to this bootstrap chicken-and-egg check and audience loading.
 */
export async function nativeAdminExists(db: D1Database): Promise<boolean> {
  const result = await db
    .prepare(`select "id" from "user" where "role" = ? limit 1`)
    .bind("admin")
    .first();
  return Boolean(result);
}
