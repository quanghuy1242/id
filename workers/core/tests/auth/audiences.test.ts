import { beforeEach, describe, expect, it } from "vitest";
import { authPluginConfig } from "../../src/auth/config";
import {
  invalidateResourceServerAudiences,
  loadResourceServerAudiences,
  loadResourceAudiencesFromCache,
} from "../../src/auth/plugins/resource-server/audiences";

type StoredValue = {
  readonly value: string;
  readonly ttl?: number;
};

function createKv() {
  const values = new Map<string, StoredValue>();
  const getOptions: { readonly cacheTtl?: number }[] = [];
  const kv = {
    get: async (key: string, options?: { readonly cacheTtl?: number }) => {
      if (options) {
        getOptions.push(options);
      }
      return values.get(key)?.value ?? null;
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      values.set(key, { value, ttl: options?.expirationTtl });
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as unknown as KVNamespace;

  return { getOptions, kv, values };
}

describe("resource audience cache", () => {
  beforeEach(async () => {
    await invalidateResourceServerAudiences({ KV: createKv().kv });
  });

  it("serves valid audiences from KV without hitting the store", async () => {
    const { getOptions, kv, values } = createKv();
    values.set(authPluginConfig.resourceAudienceCacheKey, { value: JSON.stringify(["https://api.example.test"]) });

    const result = await loadResourceAudiencesFromCache(kv, async () => {
      throw new Error("store should not be read on cache hit");
    });

    expect(result).toEqual({ audiences: ["https://api.example.test"], source: "cache" });
    expect(getOptions).toEqual([{ cacheTtl: authPluginConfig.resourceAudienceCacheTtlSeconds }]);
  });

  it("serves warm isolate audiences from memory before KV", async () => {
    const { kv, values } = createKv();

    await loadResourceAudiencesFromCache(kv, async () => [{ audience: "https://api.example.test", enabled: true }]);
    values.delete(authPluginConfig.resourceAudienceCacheKey);

    const result = await loadResourceAudiencesFromCache(kv, async () => {
      throw new Error("store should not be read on memory hit");
    });

    expect(result).toEqual({ audiences: ["https://api.example.test"], source: "memory" });
  });

  it("loads enabled audiences from the store and writes the KV cache", async () => {
    const { kv, values } = createKv();

    const result = await loadResourceAudiencesFromCache(kv, async () => [
      { audience: "https://disabled.example.test", enabled: false },
      { audience: "https://api.example.test", enabled: true },
      { audience: "https://api.example.test", enabled: true },
      { audience: "https://mcp.example.test", enabled: true },
    ]);

    expect(result).toEqual({
      audiences: ["https://api.example.test", "https://mcp.example.test"],
      source: "store",
    });
    expect(values.get(authPluginConfig.resourceAudienceCacheKey)).toEqual({
      value: JSON.stringify(["https://api.example.test", "https://mcp.example.test"]),
      ttl: authPluginConfig.resourceAudienceCacheTtlSeconds,
    });
  });

  it("treats malformed KV values as cache misses", async () => {
    const { kv, values } = createKv();
    values.set(authPluginConfig.resourceAudienceCacheKey, { value: JSON.stringify({ audience: "https://api.example.test" }) });

    const result = await loadResourceAudiencesFromCache(kv, async () => [
      { audience: "https://api.example.test", enabled: true },
    ]);

    expect(result).toEqual({ audiences: ["https://api.example.test"], source: "store" });
  });

  it("loads enabled audiences from the plugin-owned D1 query on KV miss", async () => {
    const { kv } = createKv();
    const db = {
      prepare: (sql: string) => {
        expect(sql).toContain('from "resourceServer"');
        return {
          bind: (enabled: number) => {
            expect(enabled).toBe(1);
            return {
              all: async () => ({
                results: [
                  { audience: "https://api.example.test", enabled: true },
                  { audience: "https://mcp.example.test", enabled: true },
                ],
              }),
            };
          },
        };
      },
    } as unknown as D1Database;

    const result = await loadResourceServerAudiences({ DB: db, KV: kv });

    expect(result).toEqual({
      audiences: ["https://api.example.test", "https://mcp.example.test"],
      source: "store",
    });
  });

  it("invalidates the audience cache after plugin-owned resource server mutation", async () => {
    const { kv, values } = createKv();
    values.set(authPluginConfig.resourceAudienceCacheKey, { value: JSON.stringify(["https://api.example.test"]) });

    await invalidateResourceServerAudiences({ KV: kv });

    expect(values.has(authPluginConfig.resourceAudienceCacheKey)).toBe(false);
  });
});
