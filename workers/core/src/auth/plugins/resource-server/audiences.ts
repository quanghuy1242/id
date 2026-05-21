import { authPluginConfig } from "../../config";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";
import type { CoreEnv } from "../../../config/env";
import { RESOURCE_SERVER_MODEL } from "../../../shared/constants";

export type ResourceAudienceRow = {
  readonly audience: string;
  readonly enabled: boolean;
};

export type AudienceLoadResult = {
  readonly audiences: readonly string[];
  readonly source: "cache" | "store";
};

type ResourceAudienceEnv = {
  readonly DB: CoreEnv["DB"];
  readonly KV: BetterAuthKvStorage;
};

type ResourceAudienceLoader = () => Promise<readonly ResourceAudienceRow[]>;

function parseCachedAudiences(value: string | null): readonly string[] | null {
  if (value === null) {
    return null;
  }

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
    return null;
  }

  return parsed;
}

function enabledAudiences(rows: readonly ResourceAudienceRow[]): readonly string[] {
  return [...new Set(rows.filter((row) => row.enabled).map((row) => row.audience))].sort();
}

async function loadEnabledResourceAudienceRows(db: CoreEnv["DB"]): Promise<readonly ResourceAudienceRow[]> {
  const result = await db
    .prepare(`select "audience", "enabled" from "${RESOURCE_SERVER_MODEL}" where "enabled" = ? order by "audience" asc`)
    .bind(1)
    .all<ResourceAudienceRow>();

  return result.results ?? [];
}

export async function loadResourceAudiencesFromCache(
  kv: BetterAuthKvStorage,
  loadRows: ResourceAudienceLoader,
): Promise<AudienceLoadResult> {
  const cached = parseCachedAudiences(await kv.get(authPluginConfig.resourceAudienceCacheKey));
  if (cached) {
    return { audiences: cached, source: "cache" };
  }

  const audiences = enabledAudiences(await loadRows());
  await kv.put(authPluginConfig.resourceAudienceCacheKey, JSON.stringify(audiences), {
    expirationTtl: authPluginConfig.resourceAudienceCacheTtlSeconds,
  });
  return { audiences, source: "store" };
}

export function loadResourceServerAudiences(env: ResourceAudienceEnv): Promise<AudienceLoadResult> {
  return loadResourceAudiencesFromCache(env.KV, () => loadEnabledResourceAudienceRows(env.DB));
}

export async function invalidateResourceServerAudiences(env: Pick<ResourceAudienceEnv, "KV">): Promise<void> {
  await env.KV.delete(authPluginConfig.resourceAudienceCacheKey);
}
