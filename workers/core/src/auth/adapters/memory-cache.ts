/** Small in-isolate TTL cache surface for Worker-local, non-durable values. */
export type MemoryTtlCache<T> = {
  /** Return the cached value when present and unexpired, otherwise null. */
  readonly get: (now?: number) => T | null;
  /** Store a value until ttlMs elapses from the provided or current timestamp. */
  readonly set: (value: T, now?: number) => void;
  /** Drop the current in-memory value immediately. */
  readonly clear: () => void;
};

/**
 * Creates a per-isolate cache for performance hints, not authorization truth.
 * Cloudflare may discard the isolate at any time, so callers must have a
 * durable fallback such as KV, D1, or the canonical Better Auth store.
 */
export function createMemoryTtlCache<T>(ttlMs: number): MemoryTtlCache<T> {
  let entry: { readonly value: T; readonly expiresAt: number } | null = null;

  return {
    get: (now = Date.now()) => {
      if (!entry || entry.expiresAt <= now) {
        return null;
      }

      return entry.value;
    },
    set: (value, now = Date.now()) => {
      entry = {
        value,
        expiresAt: now + ttlMs,
      };
    },
    clear: () => {
      entry = null;
    },
  };
}
