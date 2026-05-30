"use client";

import {
  EmptyState,
  ErrorAlert,
  Panel,
  Skeleton,
  Stack,
  Text,
  Timeline,
  type TimelineItem,
} from "@id/ui";
import { useActivityLog, type ActivityLogActions } from "../_data/use-activity-log";
import type { AdminActivity } from "../_actions/audit";

type ActivityLogContentProps = {
  readonly targetType: string;
  readonly targetId: string;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: ActivityLogActions;
};

function titleFor(action: string): string {
  return action
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function metaFor(entry: AdminActivity): string {
  const actor = entry.actorEmail ?? entry.actorId;
  return `${actor} · ${new Date(entry.createdAt).toLocaleString()}`;
}

function detailFor(entry: AdminActivity) {
  const reason = entry.metadata?.reason;
  if (typeof reason === "string" && reason.length > 0) {
    return <Text variant="caption">Reason: {reason}</Text>;
  }
  const path = entry.metadata?.path;
  if (typeof path === "string" && path.length > 0) {
    return <Text variant="caption">{path}</Text>;
  }
  return undefined;
}

function toneFor(action: string): TimelineItem["tone"] {
  if (action.includes("delete") || action.includes("remove") || action.includes("ban") || action.includes("revoke")) return "error";
  if (action.includes("disable") || action.includes("rotate")) return "warning";
  if (action.includes("create") || action.includes("enable") || action.includes("invite") || action.includes("add")) return "success";
  return "primary";
}

function timelineItems(entries: readonly AdminActivity[]): TimelineItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: titleFor(entry.action),
    meta: metaFor(entry),
    detail: detailFor(entry),
    tone: toneFor(entry.action),
  }));
}

export function ActivityLogContent({
  targetType,
  targetId,
  loading,
  error,
  actions,
}: ActivityLogContentProps) {
  const activity = useActivityLog({ targetType, targetId, loading, error, actions });

  if (activity.isLoading) return <Skeleton rows={5} height="md" />;
  if (activity.error) return <ErrorAlert message={activity.error} onRetry={activity.refetch} />;

  return (
    <Panel>
      <Stack gap="md">
        <Text variant="h2">Audit</Text>
        {activity.entries.length === 0 ? (
          <EmptyState message="No activity recorded for this resource" />
        ) : (
          <Timeline items={timelineItems(activity.entries)} />
        )}
      </Stack>
    </Panel>
  );
}
