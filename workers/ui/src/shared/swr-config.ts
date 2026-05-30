import type { SWRConfiguration } from "swr";
import { AuthApiError } from "@id/lib";

/**
 * Site-wide SWR defaults for the admin UI, tuned for the core-id rate limit
 * (~10 requests / 10 seconds per IP). See `docs/025_admin-ui-swr-caching-strategy.md`.
 *
 * The intent is a *manual-revalidation* cache with focus-window refresh: SWR
 * deduplicates and serves cache across navigation, and re-fetches when the
 * user returns to the tab. The only automatic network call is the first fetch
 * for a key that has no cached data. Every other fetch is explicit — a user
 * action, a mutation, or a window focus event.
 *
 * Do NOT add `revalidateOnMount: true`. With SWR's documented precedence an
 * explicit `revalidateOnMount: true` always refetches on mount even when the
 * cache holds data, which would defeat cross-navigation caching. Left unset,
 * SWR fetches on mount only when there is no cached data — exactly what we
 * want alongside `revalidateIfStale: false`.
 */
export const ADMIN_SWR_CONFIG: SWRConfiguration = {
  revalidateIfStale: false,
  revalidateOnFocus: true,
  revalidateOnReconnect: false,
  keepPreviousData: true,
  dedupingInterval: 5_000,
  errorRetryCount: 2,
  // Do not retry rate-limit responses — retrying spends the budget we protect.
  onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
    if (isRateLimited(error)) return;
    if (retryCount >= 2) return;
    setTimeout(() => void revalidate({ retryCount }), 1_000 * 2 ** retryCount);
  },
};

/**
 * The auth-fetch helpers normalize Better Auth error bodies into AuthApiError.
 * Keep the textual fallback for legacy callers and non-auth failures.
 */
function isRateLimited(error: unknown): boolean {
  if (error instanceof AuthApiError && error.status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b/.test(message) || /too many requests|rate limit/i.test(message);
}
