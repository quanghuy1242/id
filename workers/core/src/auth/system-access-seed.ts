import { authPluginConfig, systemResourceServerAudience } from "./config";
import { invalidateOAuthResourceScopes } from "./plugins/oauth-scope-catalog/scopes";
import { ensureOAuthResourceScope } from "./plugins/oauth-scope-catalog/operations";
import { invalidateResourceServerAudiences } from "./plugins/resource-server/audiences";
import { ensureResourceServerByAudience } from "./plugins/resource-server/operations";
import type { AdapterContext } from "./plugins/oauth-scope-catalog/types";
import type { BackgroundTaskRunner } from "./types";
import type { CoreEnv } from "../config/env";

export type SystemAccessSeedResult = {
  readonly resourceServerId: string;
  readonly scopeIds: readonly string[];
  readonly changed: boolean;
};

type SystemAccessSeedEnv = Pick<CoreEnv, "BETTER_AUTH_URL" | "KV">;

/**
 * Ensures the id-owned system audience and default system scopes exist.
 *
 * This is bootstrap data, not schema: tables remain Better Auth plugin-owned
 * and rows are written through the Better Auth adapter with plugin operation
 * helpers.
 */
export async function ensureSystemAccessCatalog(
  env: SystemAccessSeedEnv,
  adapter: AdapterContext,
  actorId: string,
  backgroundTaskRunner?: BackgroundTaskRunner,
): Promise<SystemAccessSeedResult> {
  const resourceServer = await ensureResourceServerByAudience(
    adapter,
    {
      organizationId: null,
      slug: authPluginConfig.systemResourceServerSlug,
      name: authPluginConfig.systemResourceServerName,
      audience: systemResourceServerAudience(env.BETTER_AUTH_URL),
    },
    actorId,
  );

  const scopes = await Promise.all([
    ensureOAuthResourceScope(
      adapter,
      {
        resourceServerId: resourceServer.row.id,
        scope: authPluginConfig.scimDirectoryScope,
      },
      actorId,
    ),
    ensureOAuthResourceScope(
      adapter,
      {
        resourceServerId: resourceServer.row.id,
        scope: authPluginConfig.systemOAuthClientPickerScope,
      },
      actorId,
    ),
  ]);

  const scopeChanged = scopes.some((scope) => scope.changed);
  if (resourceServer.changed) {
    await invalidateResourceServerAudiences(env, backgroundTaskRunner);
  }
  if (resourceServer.changed || scopeChanged) {
    await invalidateOAuthResourceScopes(env, backgroundTaskRunner);
  }

  return {
    resourceServerId: resourceServer.row.id,
    scopeIds: scopes.map((scope) => scope.row.id),
    changed: resourceServer.changed || scopeChanged,
  };
}
