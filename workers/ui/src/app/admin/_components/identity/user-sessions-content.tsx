"use client";

import { useState, useEffect } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  Inline,
  LinkButton,
  Panel,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "@id/ui";
import {
  getUser as getUserAction,
  listUserSessions as listUserSessionsAction,
  revokeUserSession as revokeUserSessionAction,
  revokeUserSessions as revokeUserSessionsAction,
  type Session,
  type User,
} from "../../_actions/users";

const defaultActions = {
  getUser: getUserAction,
  listUserSessions: listUserSessionsAction,
  revokeUserSession: revokeUserSessionAction,
  revokeUserSessions: revokeUserSessionsAction,
};

function isExpired(session: Session): boolean {
  return new Date(session.expiresAt) < new Date();
}

function sessionTabsFor(uid: string) {
  return [
    { id: "overview", href: `/admin/identity/users/${uid}`, label: "Overview" },
    { id: "sessions", href: `/admin/identity/users/${uid}/sessions`, label: "Sessions" },
  ];
}

type UserSessionsContentProps = {
  userId: string;
  loading?: boolean;
  error?: string;
  onNavigateToOverview?: () => void;
  actions?: typeof defaultActions;
};

export function UserSessionsContent({
  userId,
  loading: loadingOverride,
  error: errorOverride,
  onNavigateToOverview,
  actions = defaultActions,
}: UserSessionsContentProps) {
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [revokeTarget, setRevokeTarget] = useState<Session | null>(null);
  const [revokeError, setRevokeError] = useState<string | undefined>();

  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeAllError, setRevokeAllError] = useState<string | undefined>();

  useEffect(() => {
    if (loadingOverride || errorOverride) return;
    setIsLoading(true);
    setFetchError(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const [{ user: fetchedUser }, { sessions: fetchedSessions }] = await Promise.all([
          actions.getUser(userId),
          actions.listUserSessions(userId),
        ]);
        if (!cancelled) {
          setUser(fetchedUser);
          setSessions(fetchedSessions);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load sessions");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, userId, loadingOverride, errorOverride, fetchKey]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  const columns: DataTableColumn<Session>[] = [
    {
      key: "ipAddress",
      label: "IP Address",
      render: (s) => s.ipAddress ?? "—",
    },
    {
      key: "userAgent",
      label: "User Agent",
      render: (s) => s.userAgent ? s.userAgent.slice(0, 40) : "—",
    },
    {
      key: "activeOrganizationId",
      label: "Organization",
      render: (s) => s.activeOrganizationId ? s.activeOrganizationId.slice(0, 12) + "…" : "—",
    },
    {
      key: "createdAt",
      label: "Created",
      render: (s) => new Date(s.createdAt).toLocaleDateString(),
    },
    {
      key: "expiresAt",
      label: "Expires",
      render: (s) => new Date(s.expiresAt).toLocaleDateString(),
    },
    {
      key: "impersonatedBy",
      label: "Flags",
      render: (s) => (
        <Inline gap="xs">
          {s.impersonatedBy && <Badge tone="warning" size="sm">Impersonation</Badge>}
          {!isExpired(s) && (
            <Button variant="danger" size="sm" onClick={() => { setRevokeError(undefined); setRevokeTarget(s); }}>
              Revoke
            </Button>
          )}
        </Inline>
      ),
    },
  ];

  async function handleRevoke() {
    if (!revokeTarget) return false;
    setRevokeError(undefined);
    try {
      await actions.revokeUserSession(revokeTarget.token);
      setSessions((prev) => prev.filter((s) => s.id !== revokeTarget.id));
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
      setFetchKey((k) => k + 1);
      return true;
    } catch (err: unknown) {
      setRevokeAllError(err instanceof Error ? err.message : "Failed to revoke all sessions");
      return false;
    }
  }

  const pageHeader = (
    <Inline justify="between">
      <Inline gap="sm">
        <LinkButton href="/admin/identity/users" variant="secondary">
          ← Users
        </LinkButton>
        {user && (
          <>
            <Text variant="h1">{user.name}</Text>
            <Badge tone={user.role === "admin" ? "primary" : "neutral"}>{user.role}</Badge>
          </>
        )}
        {showLoading && !user && <Text variant="h1">Loading…</Text>}
      </Inline>
    </Inline>
  );

  return (
    <Stack gap="md">
      {pageHeader}

      <Tabs
        ariaLabel="User detail tabs"
        selectedKey="sessions"
        items={sessionTabsFor(userId)}
        onSelectionChange={(key) => {
          if (key === "overview") onNavigateToOverview?.();
        }}
      />

      {showLoading && <Skeleton rows={4} />}

      {!showLoading && showError && (
        <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />
      )}

      {!showLoading && !showError && (
        <>
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
        </>
      )}

      {/* Revoke single session */}
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

      {/* Revoke all sessions */}
      <ConfirmDialog
        open={revokeAllOpen}
        onOpenChange={(o) => { setRevokeAllOpen(o); if (!o) setRevokeAllError(undefined); }}
        title="Revoke All Sessions"
        description={`This will sign out all sessions for ${user?.name ?? "this user"}, including this admin session if you are impersonating.`}
        confirmLabel="Revoke All"
        variant="danger"
        error={revokeAllError}
        onConfirm={handleRevokeAll}
      />
    </Stack>
  );
}
