export async function nativeAdminExists(db: D1Database): Promise<boolean> {
  const result = await db.prepare(`select "id" from "user" where "role" = ? limit 1`).bind("admin").first();
  return Boolean(result);
}
