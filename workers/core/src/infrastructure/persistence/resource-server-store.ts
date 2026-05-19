import type { ResourceAudienceRow } from "../../auth/adapters/audiences";
import type { CoreEnv } from "../../config/env";

/**
 * Loads enabled resource server audience rows from D1.
 *
 * This function uses raw D1 SQL because it must execute BEFORE the Better Auth
 * instance exists — a chicken-and-egg problem: Better Auth's OAuth Provider
 * needs `validAudiences` at construction time, but the audience list lives in
 * D1. The result is loaded during request setup in `http/routes/auth-mount.ts`
 * and passed into `getAuth(env, loaded.audiences)`.
 *
 * Because this runs outside of any Better Auth adapter context, it is the
 * single legitimate raw-D1 query site approved under the `no-direct-db-access`
 * architecture rule. All other data access uses Better Auth adapter APIs.
 */
export async function loadEnabledResourceAudienceRows(db: CoreEnv["DB"]): Promise<readonly ResourceAudienceRow[]> {
  const result = await db
    .prepare('select "audience", "enabled" from "resourceServer" where "enabled" = ? order by "audience" asc')
    .bind(1)
    .all<ResourceAudienceRow>();

  return result.results ?? [];
}
