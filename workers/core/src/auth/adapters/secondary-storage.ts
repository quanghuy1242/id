import type { SecondaryStorage } from "better-auth";

export type BetterAuthKvStorage = {
  readonly get: (key: string, options?: { readonly cacheTtl?: number }) => Promise<string | null>;
  readonly put: (key: string, value: string, options?: { readonly expirationTtl?: number }) => Promise<unknown>;
  readonly delete: (key: string) => Promise<unknown>;
};

export function kvSecondaryStorage(kv: BetterAuthKvStorage): SecondaryStorage {
  return {
    get: (key) => kv.get(key),
    // KV has no compare-and-swap. Two concurrent reads of the same one-time token
    // both observe the value before either delete runs, enabling replay. BA 1.6.11
    // stores authorization codes in D1, so confirmed exploit paths are limited. Any
    // flow relying on secondaryStorage for single-use tokens must document and test
    // this limitation. (SEC-008)
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
