"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorAlert,
  Inline,
  PageIntro,
  Panel,
  Skeleton,
  Stack,
  Text,
  toast,
  type DataTableColumn,
} from "@id/ui";
import { accountSessionsKey } from "../_data/swr-keys";
import { defaultAccountActions, type AccountActions, type AccountSession } from "../_actions/account";
import { dateLabel } from "./account-format";

type AccountSessionsContentProps = {
  readonly actions?: Pick<AccountActions, "listAccountSessions" | "revokeAccountSession" | "revokeOtherSessions" | "revokeAllSessions">;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onSignedOut?: () => void;
};

function defaultSignedOut() {
  window.location.href = "/login?callbackURL=/account";
}

export function AccountSessionsContent({
  actions = defaultAccountActions,
  loading,
  error: errorOverride,
  onSignedOut = defaultSignedOut,
}: AccountSessionsContentProps) {
  const skipFetch = loading || errorOverride;
  const { data, isLoading, error, mutate } = useSWR(skipFetch ? null : accountSessionsKey(), () => actions.listAccountSessions());
  const [pendingSession, setPendingSession] = useState<AccountSession | null>(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeOtherOpen, setRevokeOtherOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>();
  const showLoading = loading ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const sessions = data?.sessions ?? [];

  async function revokeSession(session: AccountSession): Promise<boolean> {
    setDialogError(undefined);
    try {
      await actions.revokeAccountSession(session.id);
      if (session.current) {
        toast.success("Current session revoked");
        onSignedOut();
        return true;
      }
      await mutate();
      toast.success("Session revoked");
      return true;
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : "Failed to revoke session");
      return false;
    }
  }

  async function revokeOthers(): Promise<boolean> {
    setDialogError(undefined);
    try {
      const result = await actions.revokeOtherSessions();
      await mutate();
      toast.success("Other sessions revoked", `${result.revoked} session${result.revoked === 1 ? "" : "s"} removed.`);
      return true;
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : "Failed to revoke sessions");
      return false;
    }
  }

  async function revokeAll(): Promise<boolean> {
    setDialogError(undefined);
    try {
      await actions.revokeAllSessions();
      toast.success("Signed out everywhere");
      onSignedOut();
      return true;
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : "Failed to revoke sessions");
      return false;
    }
  }

  const columns: readonly DataTableColumn<AccountSession>[] = [
    {
      key: "browser",
      label: "Browser",
      render: (session) => (
        <Stack gap="xs">
          <Inline>
            <Text>{session.userAgent ?? "Unknown browser"}</Text>
            {session.current ? <Badge tone="success" size="sm">Current</Badge> : null}
          </Inline>
          <Text variant="caption">{session.ipAddress ?? "Unknown IP"}</Text>
        </Stack>
      ),
    },
    { key: "updatedAt", label: "Last active", render: (session) => dateLabel(session.updatedAt) },
    { key: "expiresAt", label: "Expires", render: (session) => dateLabel(session.expiresAt) },
    {
      key: "actions",
      label: "",
      actions: (session) => [{
        id: "revoke",
        label: session.current ? "Sign out" : "Revoke",
        variant: session.current ? "danger" : "secondary",
        onAction: () => setPendingSession(session),
      }],
    },
  ];

  if (showLoading) {
    return (
      <Stack>
        <PageIntro title="Sessions" description="Review active browser sessions and sign out devices you no longer use." />
        <Panel><Skeleton rows={8} /></Panel>
      </Stack>
    );
  }

  if (showError) {
    return (
      <Stack>
        <PageIntro title="Sessions" description="Review active browser sessions and sign out devices you no longer use." />
        <ErrorAlert message={showError} onRetry={() => void mutate()} />
      </Stack>
    );
  }

  return (
    <>
      <Stack>
        <PageIntro
          title="Sessions"
          description="Review active browser sessions and sign out devices you no longer use."
          actions={(
            <Inline>
              <Button variant="secondary" onClick={() => setRevokeOtherOpen(true)}>Sign out other devices</Button>
              <Button variant="danger" onClick={() => setRevokeAllOpen(true)}>Sign out everywhere</Button>
            </Inline>
          )}
        />
        <Panel padding={sessions.length > 0 ? "none" : "md"}>
          {sessions.length === 0 ? (
            <EmptyState message="No active sessions" />
          ) : (
            <DataTable columns={columns} rows={sessions} getRowKey={(session) => session.id} />
          )}
        </Panel>
      </Stack>
      <ConfirmDialog
        open={pendingSession !== null}
        onOpenChange={(open) => { if (!open) { setPendingSession(null); setDialogError(undefined); } }}
        title={pendingSession?.current ? "Sign Out This Browser" : "Revoke Session"}
        description={pendingSession?.current ? "This ends the session you are using now." : "This browser will need to sign in again."}
        confirmLabel={pendingSession?.current ? "Sign Out" : "Revoke"}
        variant="danger"
        error={dialogError}
        onConfirm={() => pendingSession ? revokeSession(pendingSession) : Promise.resolve(true)}
      />
      <ConfirmDialog
        open={revokeOtherOpen}
        onOpenChange={(open) => { setRevokeOtherOpen(open); if (!open) setDialogError(undefined); }}
        title="Sign Out Other Devices"
        description="Every other browser session will need to sign in again."
        confirmLabel="Sign Out Other Devices"
        variant="danger"
        error={dialogError}
        onConfirm={revokeOthers}
      />
      <ConfirmDialog
        open={revokeAllOpen}
        onOpenChange={(open) => { setRevokeAllOpen(open); if (!open) setDialogError(undefined); }}
        title="Sign Out Everywhere"
        description="All browser sessions, including this one, will be revoked."
        confirmLabel="Sign Out Everywhere"
        variant="danger"
        error={dialogError}
        onConfirm={revokeAll}
      />
    </>
  );
}

