import type { SecondaryStorage } from "better-auth";

export type BetterAuthKvStorage = {
  readonly get: (key: string, options?: { readonly cacheTtl?: number }) => Promise<string | null>;
  readonly put: (key: string, value: string, options?: { readonly expirationTtl?: number }) => Promise<unknown>;
  readonly delete: (key: string) => Promise<unknown>;
};

export function kvSecondaryStorage(kv: BetterAuthKvStorage): SecondaryStorage {
  return {
    get: (key) => kv.get(key),
    getAndDelete: async (key) => {
      const value = await kv.get(key);
      await kv.delete(key);
      return value;
    },
    set: (key, value, ttl) => kv.put(key, value, ttl ? { expirationTtl: ttl } : undefined),
    delete: async (key) => {
      await kv.delete(key);
    },
  };
}
