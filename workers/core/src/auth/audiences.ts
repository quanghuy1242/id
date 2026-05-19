import { authPluginConfig } from "./config";
import type { BetterAuthKvStorage } from "./secondary-storage";

export type ResourceAudienceRow = {
  readonly audience: string;
  readonly enabled: boolean;
};

export type AudienceLoadResult = {
  readonly audiences: readonly string[];
  readonly source: "cache" | "store";
};

export type ResourceAudienceLoader = () => Promise<readonly ResourceAudienceRow[]>;

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

export async function loadResourceAudiences(
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

export async function invalidateResourceAudiences(kv: BetterAuthKvStorage): Promise<void> {
  await kv.delete(authPluginConfig.resourceAudienceCacheKey);
}
