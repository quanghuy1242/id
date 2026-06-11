"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  Inline,
  InfoPopover,
  Panel,
  Skeleton,
  Stack,
  Text,
  toast,
} from "@idco/ui";
import {
  listUserSessions as listUserSessionsAction,
  revokeUserSession as revokeUserSessionAction,
  revokeUserSessions as revokeUserSessionsAction,
  type Session,
} from "../../_actions/users";
import { userSessionsKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listUserSessions: listUserSessionsAction,
  revokeUserSession: revokeUserSessionAction,
  revokeUserSessions: revokeUserSessionsAction,
};

function isExpired(session: Session): boolean {
  return session.expiresAt !== null && new Date(session.expiresAt) < new Date();
}

function formatDate(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleDateString();
}

type UserSessionsContentProps = {
  userId: string;
  userName?: string;
  loading?: boolean;
  error?: string;
  actions?: typeof defaultActions;
};

export function UserSessionsContent({
  userId,
  userName,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: UserSessionsContentProps) {
  const { data: sessions = [], isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : userSessionsKey(userId),
    () => actions.listUserSessions(userId).then((r) => r.sessions),
  );

  const [revokeTarget, setRevokeTarget] = useState<Session | null>(null);
  const [revokeError, setRevokeError] = useState<string | undefined>();

  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeAllError, setRevokeAllError] = useState<string | undefined>();

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  const columns: DataTableColumn<Session>[] = [
    { key: "ipAddress", label: "IP Address", render: (s) => s.ipAddress ?? "—" },
    { key: "userAgent", label: "User Agent", render: (s) => s.userAgent ? s.userAgent.slice(0, 40) : "—" },
    {
      key: "activeOrganizationId",
      label: "Organization",
      render: (s) => s.activeOrganizationId ? s.activeOrganizationId.slice(0, 12) + "…" : "—",
    },
    { key: "createdAt", label: "Created", render: (s) => formatDate(s.createdAt) },
    { key: "expiresAt", label: "Expires", render: (s) => formatDate(s.expiresAt) },
    {
      key: "impersonatedBy",
      label: "Flags",
      render: (s) => (
        <Inline gap="xs">
          {!isExpired(s) && (
            <Button variant="danger" size="sm" onClick={() => { setRevokeError(undefined); setRevokeTarget(s); }}>
              Revoke
            </Button>
          )}
          {s.impersonatedBy && <Badge tone="warning" size="sm">Impersonated</Badge>}
        </Inline>
      ),
    },
  ];

  async function handleRevoke() {
    if (!revokeTarget) return false;
    setRevokeError(undefined);
    try {
      await actions.revokeUserSession(revokeTarget.id);
      await mutate((cur) => (cur ?? []).filter((s) => s.id !== revokeTarget.id), { revalidate: false });
      toast.success("Session revoked", "That device has been signed out.");
      return true;
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke session");
      return false;
    }
  }

  async function handleRevokeAll() {
    setRevokeAllError(undefined);
    try {
      await actions.revokeUserSessions(userId);
      await mutate([], { revalidate: false });
      toast.success("All sessions revoked", `${userName ?? "The user"} has been signed out everywhere.`);
      return true;
    } catch (err: unknown) {
      setRevokeAllError(err instanceof Error ? err.message : "Failed to revoke all sessions");
      return false;
    }
  }

  if (showLoading) return <Skeleton rows={4} />;
  if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;

  return (
    <Stack gap="md">
      <Inline gap="xs" align="center">
        <Text variant="caption">
          Active sign-ins for this user. Revoke a single device or sign the user out everywhere.
        </Text>
        <InfoPopover title="Sessions" label="About sessions">
          Each row is a browser or device session. Revoking a session signs that device out immediately; the user must sign in again. &quot;Revoke All&quot; ends every session at once — including this admin session if you are currently impersonating the user.
        </InfoPopover>
      </Inline>

      <Panel padding={sessions.length > 0 ? "none" : "md"}>
        {sessions.length === 0
          ? <EmptyState message="No active sessions" />
          : (
            <DataTable<Session>
              columns={columns}
              rows={sessions}
              getRowKey={(s) => s.id}
            />
          )}
      </Panel>

      {sessions.length > 0 && (
        <Inline justify="end">
          <Button variant="danger" onClick={() => setRevokeAllOpen(true)}>
            Revoke All Sessions
          </Button>
        </Inline>
      )}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setRevokeError(undefined); } }}
        title="Revoke Session"
        description={`Revoke session from ${revokeTarget?.ipAddress ?? "this device"}?`}
        confirmLabel="Revoke"
        variant="danger"
        error={revokeError}
        onConfirm={handleRevoke}
      />

      <ConfirmDialog
        open={revokeAllOpen}
        onOpenChange={(o) => { setRevokeAllOpen(o); if (!o) setRevokeAllError(undefined); }}
        title="Revoke All Sessions"
        description={`This will sign out all sessions for ${userName ?? "this user"}, including this admin session if you are impersonating.`}
        confirmLabel="Revoke All"
        variant="danger"
        error={revokeAllError}
        onConfirm={handleRevokeAll}
      />
    </Stack>
  );
}
