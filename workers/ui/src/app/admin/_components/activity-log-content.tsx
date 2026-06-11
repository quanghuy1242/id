"use client";

import {
  Badge,
  DataTable,
  type DataTableColumn,
  Disclosure,
  EmptyState,
  ErrorAlert,
  Inline,
  JsonViewer,
  Panel,
  Skeleton,
  Stack,
  Text,
} from "@idco/ui";
import { useActivityLog, type ActivityLogActions } from "../_data/use-activity-log";
import type { AdminActivity } from "../_actions/audit";

type ActivityLogContentProps = {
  readonly organizationId?: string;
  readonly targetType?: string;
  readonly targetId?: string;
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
  const summary = entry.summary?.trim();
  if (summary) return summary;
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

function compactPayload(entry: AdminActivity): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  if (entry.details) payload.details = entry.details;
  if (entry.before) payload.before = entry.before;
  if (entry.after) payload.after = entry.after;
  if (entry.metadata) payload.metadata = entry.metadata;
  return Object.keys(payload).length > 0 ? payload : null;
}

function scopeTone(entry: AdminActivity): "primary" | "info" | "neutral" {
  if (entry.scope === "platform") return "primary";
  if (entry.scope === "organization") return "info";
  return "neutral";
}

function scopeLabel(entry: AdminActivity): string {
  if (entry.scope === "platform") return "Platform";
  if (entry.scope === "organization") return "Organization";
  return "Legacy";
}

function proofLabel(entry: AdminActivity): string {
  if (entry.steppedUp === true) return "Fresh step-up";
  if (entry.steppedUp === false) return "No fresh step-up";
  return "Not recorded";
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
    width: "xl",
    render: (entry) => (
      <Stack gap="xs">
        <Inline gap="xs">
          <Badge tone={toneFor(entry.action)} size="sm">{titleFor(entry.action)}</Badge>
        </Inline>
        <Text variant="caption" mono>{entry.action}</Text>
      </Stack>
    ),
  },
  { key: "actor", label: "Actor", width: "xl", render: (entry) => actorFor(entry) },
  {
    key: "scope",
    label: "Scope",
    width: "lg",
    render: (entry) => (
      <Stack gap="xs">
        <Inline gap="xs">
          <Badge tone={scopeTone(entry)} size="sm">{scopeLabel(entry)}</Badge>
          {entry.steppedUp === true ? <Badge tone="success" size="sm">Step-up</Badge> : null}
        </Inline>
        {entry.organizationId ? <Text variant="caption" mono>{entry.organizationId}</Text> : null}
        <Text variant="caption">{proofLabel(entry)}</Text>
      </Stack>
    ),
  },
  { key: "createdAt", label: "Time", width: "lg", render: (entry) => new Date(entry.createdAt).toLocaleString() },
  {
    key: "context",
    label: "Details",
    render: (entry) => {
      const payload = compactPayload(entry);
      return (
        <Stack gap="xs">
          <Text variant="body">{contextFor(entry)}</Text>
          <Text variant="caption" mono>{entry.targetType}:{entry.targetId}</Text>
          {payload ? (
            <Disclosure title="Payload" icon="plus" width="contained">
              <JsonViewer value={payload} maxHeight="sm" />
            </Disclosure>
          ) : null}
        </Stack>
      );
    },
  },
];

export function ActivityLogContent({
  organizationId,
  targetType,
  targetId,
  loading,
  error,
  actions,
}: ActivityLogContentProps) {
  const activity = useActivityLog({
    organizationId,
    targetType,
    targetId,
    loading,
    error,
    actions,
  });

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
          layout="fixed"
          overflow="contained"
          minWidth="lg"
        />
      )}
    </Panel>
  );
}
