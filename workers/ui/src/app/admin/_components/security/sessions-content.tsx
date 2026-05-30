"use client";

import { useMemo, useState } from "react";
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
  PageIntro,
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  toast,
} from "@id/ui";
import {
  listAdminSessions as listAdminSessionsAction,
  type AdminSession,
} from "../../_actions/audit";
import { revokeUserSession as revokeUserSessionAction } from "../../_actions/users";
import { adminSessionsKey } from "@/app/admin/_data/swr-keys";
import { ADMIN_AUDIT_PAGE_SIZE } from "@/shared/constants";

const defaultActions = {
  listAdminSessions: listAdminSessionsAction,
  revokeUserSession: revokeUserSessionAction,
};

type Actions = typeof defaultActions;

type SessionsContentProps = {
  loading?: boolean;
  error?: string;
  actions?: Actions;
};

function formatDate(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleDateString();
}

function sessionColumns(onRevoke: (session: AdminSession) => void): DataTableColumn<AdminSession>[] {
  return [
    { key: "userEmail", label: "User Email", render: (s) => s.userEmail ?? s.userId },
    { key: "ipAddress", label: "IP Address", render: (s) => s.ipAddress ?? "—" },
    { key: "userAgent", label: "User Agent", render: (s) => (s.userAgent ? s.userAgent.slice(0, 32) : "—") },
    { key: "createdAt", label: "Created", render: (s) => formatDate(s.createdAt) },
    { key: "expiresAt", label: "Expires", render: (s) => formatDate(s.expiresAt) },
    {
      key: "actions",
      label: "Actions",
      render: (s) => (
        <Inline gap="xs">
          {s.impersonatedBy ? <Badge tone="warning" size="sm">Impersonated</Badge> : null}
          <Button variant="danger" size="sm" onClick={() => onRevoke(s)}>Revoke</Button>
        </Inline>
      ),
    },
  ];
}

function SessionsStats({ showLoading, total, impersonatedCount, uniqueUsers }: { readonly showLoading: boolean; readonly total: number; readonly impersonatedCount: number; readonly uniqueUsers: number }) {
  return (
    <StatGroup columns={3}>
      <Stat title="Total sessions" value={showLoading ? <Skeleton rows={1} /> : total} iconName="Activity" />
      <Stat title="Impersonated" value={showLoading ? <Skeleton rows={1} /> : impersonatedCount} tone={impersonatedCount > 0 ? "warning" : "neutral"} description="in page" iconName="UserCog" />
      <Stat title="Unique users" value={showLoading ? <Skeleton rows={1} /> : uniqueUsers} description="in page" iconName="Users" />
    </StatGroup>
  );
}

function RevokeSessionDialog({ target, error, onCancel, onConfirm }: { readonly target: AdminSession | null; readonly error?: string; readonly onCancel: () => void; readonly onConfirm: () => Promise<boolean> }) {
  return (
    <ConfirmDialog
      open={Boolean(target)}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Revoke Session"
      description={`Revoke the session for ${target?.userEmail ?? "this user"}? They will be signed out immediately.`}
      confirmLabel="Revoke"
      variant="danger"
      error={error}
      onConfirm={onConfirm}
    />
  );
}

export function SessionsContent({ loading, error, actions = defaultActions }: SessionsContentProps) {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<AdminSession | null>(null);
  const [revokeError, setRevokeError] = useState<string | undefined>();

  const params = useMemo(() => ({ limit: ADMIN_AUDIT_PAGE_SIZE, offset }), [offset]);
  const { data, isLoading, error: swrError, mutate } = useSWR(
    loading || error ? null : adminSessionsKey(params),
    () => actions.listAdminSessions(params),
  );

  const showLoading = loading ?? isLoading;
  const showError = error ?? (swrError instanceof Error ? swrError.message : swrError ? String(swrError) : undefined);

  const all = useMemo(() => data?.sessions ?? [], [data]);
  const rows = useMemo(() => {
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((s) => (s.userEmail ?? "").toLowerCase().includes(q) || (s.ipAddress ?? "").toLowerCase().includes(q));
  }, [all, search]);

  const impersonatedCount = useMemo(() => all.filter((s) => s.impersonatedBy).length, [all]);
  const uniqueUsers = useMemo(() => new Set(all.map((s) => s.userId)).size, [all]);

  async function handleRevoke() {
    if (!revokeTarget) return false;
    setRevokeError(undefined);
    try {
      const who = revokeTarget.userEmail ?? "the user";
      await actions.revokeUserSession(revokeTarget.token);
      await mutate();
      setRevokeTarget(null);
      toast.success("Session revoked", `${who} was signed out.`);
      return true;
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke session");
      return false;
    }
  }

  const columns = sessionColumns((session) => { setRevokeError(undefined); setRevokeTarget(session); });

  function renderContent() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if ((data?.total ?? 0) === 0) return <EmptyState message="No active browser sessions" />;
    return (
      <DataTable<AdminSession>
        columns={columns}
        rows={rows}
        getRowKey={(s) => s.id}
        pagination={{ total: data?.total ?? 0, limit: ADMIN_AUDIT_PAGE_SIZE, offset, onChange: setOffset }}
      />
    );
  }

  const hasRows = (data?.total ?? 0) > 0 && !showLoading && !showError;

  return (
    <Stack gap="md">
      <PageIntro
        title="Sessions"
        description="Live audit of interactive browser sign-ins across the whole identity provider."
        info="Browser Sessions are interactive sign-ins backed by cookies — revoke one to sign that person out immediately. Use this page to spot unexpected activity and cut off compromised sessions. Impersonated sessions are flagged so you can tell admin-initiated sessions apart from the user's own."
      />
      <SessionsStats showLoading={showLoading} total={data?.total ?? 0} impersonatedCount={impersonatedCount} uniqueUsers={uniqueUsers} />
      <Panel>
        <SearchInput grow placeholder="Search by email or IP…" value={search} onChange={setSearch} />
      </Panel>
      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>

      <RevokeSessionDialog target={revokeTarget} error={revokeError} onCancel={() => { setRevokeTarget(null); setRevokeError(undefined); }} onConfirm={handleRevoke} />
    </Stack>
  );
}
