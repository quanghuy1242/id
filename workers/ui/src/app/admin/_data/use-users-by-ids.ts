"use client";

import useSWR, { useSWRConfig } from "swr";
import { userDetailKey } from "./swr-keys";
import type { User } from "../_actions/users";

type GetUser = (id: string) => Promise<{ user: User }>;

/**
 * Resolves a set of user ids to a `Map<id, User | null>` through SWR.
 *
 * The batch is cached under its sorted id list (cross-navigation + dedup), and
 * each resolved user is back-populated into its own `userDetailKey` slot so the
 * user-detail page and other surfaces resolve the same id from cache with no
 * extra network call (see `docs/025` §7.4). Per-id failures resolve to `null`
 * so one missing user never fails the whole enrichment.
 */
export function useUsersByIds(
  ids: string[],
  getUser: GetUser,
): { usersById: Map<string, User | null>; isLoading: boolean } {
  const { mutate } = useSWRConfig();
  const uniqueSorted = [...new Set(ids)].sort();

  const { data, isLoading } = useSWR(
    uniqueSorted.length > 0 ? ["users-by-ids", uniqueSorted] : null,
    async () => {
      const entries = await Promise.all(
        uniqueSorted.map(async (id) => {
          try {
            const { user } = await getUser(id);
            await mutate(userDetailKey(id), { user }, { revalidate: false });
            return [id, user] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      return new Map<string, User | null>(entries);
    },
  );

  return { usersById: data ?? new Map<string, User | null>(), isLoading };
}
