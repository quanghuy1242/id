"use client";

import useSWR from "swr";
import {
  listActivityLog as listActivityLogAction,
  type ActivityLogParams,
  type AdminActivity,
  type Paginated,
} from "../_actions/audit";
import { activityLogKey } from "./swr-keys";

const defaultActions = {
  listActivityLog: listActivityLogAction,
};

export type ActivityLogActions = typeof defaultActions;

export type UseActivityLogOptions = {
  readonly targetType: string;
  readonly targetId: string;
  readonly action?: string;
  readonly actorId?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: ActivityLogActions;
};

export type ActivityLogResult = {
  readonly entries: readonly AdminActivity[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly isLoading: boolean;
  readonly error: string | undefined;
  readonly refetch: () => void;
};

export function useActivityLog({
  targetType,
  targetId,
  action,
  actorId,
  limit = 25,
  offset = 0,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: UseActivityLogOptions): ActivityLogResult {
  const params: ActivityLogParams = {
    targetType,
    targetId,
    action,
    actorId,
    limit,
    offset,
  };
  const skip = Boolean(
    loadingOverride || errorOverride || !targetType || !targetId,
  );
  const { data, isLoading, error, mutate } = useSWR<
    Paginated<"entries", AdminActivity>
  >(skip ? null : activityLogKey(params), () =>
    actions.listActivityLog(params),
  );

  return {
    entries: data?.entries ?? [],
    total: data?.total ?? 0,
    limit,
    offset,
    isLoading: loadingOverride ?? (errorOverride ? false : isLoading),
    error:
      errorOverride ??
      (error instanceof Error
        ? error.message
        : error
          ? String(error)
          : undefined),
    refetch: () => {
      void mutate();
    },
  };
}
