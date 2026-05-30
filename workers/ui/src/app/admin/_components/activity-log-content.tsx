"use client";

import {
  Badge,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  Inline,
  Panel,
  Skeleton,
  Stack,
  Text,
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

function actorFor(entry: AdminActivity): string {
  return entry.actorEmail ?? entry.actorId;
}

function contextFor(entry: AdminActivity): string {
  const reason = entry.metadata?.reason;
  if (typeof reason === "string" && reason.length > 0) {
    return `Reason: ${reason}`;
  }
  const path = entry.metadata?.path;
  if (typeof path === "string" && path.length > 0) {
    return path;
  }
  return "—";
}

function toneFor(action: string): "primary" | "success" | "warning" | "error" | "info" {
  if (action.includes("delete") || action.includes("remove") || action.includes("ban") || action.includes("revoke")) return "error";
  if (action.includes("disable") || action.includes("rotate")) return "warning";
  if (action.includes("create") || action.includes("enable") || action.includes("invite") || action.includes("add")) return "success";
  return "primary";
}

const columns: DataTableColumn<AdminActivity>[] = [
  {
    key: "action",
    label: "Event",
    render: (entry) => (
      <Stack gap="xs">
        <Inline gap="xs">
          <Badge tone={toneFor(entry.action)} size="sm">{titleFor(entry.action)}</Badge>
        </Inline>
        <Text variant="caption" mono>{entry.action}</Text>
      </Stack>
    ),
  },
  { key: "actor", label: "Actor", render: (entry) => actorFor(entry) },
  { key: "createdAt", label: "Time", render: (entry) => new Date(entry.createdAt).toLocaleString() },
  { key: "context", label: "Context", render: (entry) => <Text variant="body" mono>{contextFor(entry)}</Text> },
];

export function ActivityLogContent({
  targetType,
  targetId,
  loading,
  error,
  actions,
}: ActivityLogContentProps) {
  const activity = useActivityLog({ targetType, targetId, loading, error, actions });

  if (activity.isLoading) return <Panel><Skeleton rows={5} height="md" /></Panel>;
  if (activity.error) return <Panel><ErrorAlert message={activity.error} onRetry={activity.refetch} /></Panel>;

  return (
    <Panel padding={activity.entries.length > 0 ? "none" : "md"}>
      {activity.entries.length === 0 ? (
        <EmptyState message="No activity recorded for this resource" />
      ) : (
        <DataTable<AdminActivity>
          columns={columns}
          rows={activity.entries}
          getRowKey={(entry) => entry.id}
        />
      )}
    </Panel>
  );
}
