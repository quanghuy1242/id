import { describe, expect, it } from "vitest";
import { authPluginConfig } from "../../src/auth/config";
import { invalidateResourceAudiences, loadResourceAudiences } from "../../src/auth/audiences";

type StoredValue = {
  readonly value: string;
  readonly ttl?: number;
};

function createKv() {
  const values = new Map<string, StoredValue>();
  const kv = {
    get: async (key: string) => values.get(key)?.value ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      values.set(key, { value, ttl: options?.expirationTtl });
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as unknown as KVNamespace;

  return { kv, values };
}

describe("resource audience cache", () => {
  it("serves valid audiences from KV without hitting the store", async () => {
    const { kv, values } = createKv();
    values.set(authPluginConfig.resourceAudienceCacheKey, { value: JSON.stringify(["https://api.example.test"]) });

    const result = await loadResourceAudiences(kv, async () => {
      throw new Error("store should not be read on cache hit");
    });

    expect(result).toEqual({ audiences: ["https://api.example.test"], source: "cache" });
  });

  it("loads enabled audiences from the store and writes the KV cache", async () => {
    const { kv, values } = createKv();

    const result = await loadResourceAudiences(kv, async () => [
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

  it("invalidates the audience cache after plugin-owned resource server mutation", async () => {
    const { kv, values } = createKv();
    values.set(authPluginConfig.resourceAudienceCacheKey, { value: JSON.stringify(["https://api.example.test"]) });

    await invalidateResourceAudiences(kv);

    expect(values.has(authPluginConfig.resourceAudienceCacheKey)).toBe(false);
  });
});
