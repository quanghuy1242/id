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
  FilterDropdown,
  Inline,
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "@id/ui";
import {
  listAdminSessions as listAdminSessionsAction,
  listAdminTokens as listAdminTokensAction,
  type AdminSession,
  type AdminToken,
} from "../../_actions/audit";
import { revokeUserSession as revokeUserSessionAction } from "../../_actions/users";
import { adminSessionsKey, adminTokensKey } from "@/app/admin/_data/swr-keys";
import { ADMIN_AUDIT_PAGE_SIZE } from "@/shared/constants";

const defaultActions = {
  listAdminSessions: listAdminSessionsAction,
  listAdminTokens: listAdminTokensAction,
  revokeUserSession: revokeUserSessionAction,
};

type Actions = typeof defaultActions;

type SessionsTokensContentProps = {
  loading?: boolean;
  error?: string;
  actions?: Actions;
};

function formatDate(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleDateString();
}

export function SessionsTokensContent({ loading, error, actions = defaultActions }: SessionsTokensContentProps) {
  const [tab, setTab] = useState("sessions");

  return (
    <Stack gap="md">
      <Tabs
        ariaLabel="Sessions and tokens"
        selectedKey={tab}
        onSelectionChange={(k) => setTab(String(k))}
        items={[
          { id: "sessions", label: "Browser Sessions", content: <SessionsPanel loading={loading} error={error} actions={actions} /> },
          { id: "tokens", label: "OAuth Tokens", content: <TokensPanel loading={loading} error={error} actions={actions} /> },
        ]}
      />
    </Stack>
  );
}

function SessionsPanel({ loading, error, actions }: { loading?: boolean; error?: string; actions: Actions }) {
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

  const rows = useMemo(() => {
    const all = data?.sessions ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((s) => (s.userEmail ?? "").toLowerCase().includes(q) || (s.ipAddress ?? "").toLowerCase().includes(q));
  }, [data, search]);

  async function handleRevoke() {
    if (!revokeTarget) return false;
    setRevokeError(undefined);
    try {
      await actions.revokeUserSession(revokeTarget.token);
      await mutate();
      setRevokeTarget(null);
      return true;
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke session");
      return false;
    }
  }

  const columns: DataTableColumn<AdminSession>[] = [
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
          <Button variant="danger" size="sm" onClick={() => { setRevokeError(undefined); setRevokeTarget(s); }}>Revoke</Button>
        </Inline>
      ),
    },
  ];

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
      <Panel>
        <Inline justify="between" align="center">
          <Text variant="h2">Browser Sessions</Text>
          <SearchInput grow placeholder="Search by email or IP…" value={search} onChange={setSearch} />
        </Inline>
      </Panel>
      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setRevokeError(undefined); } }}
        title="Revoke Session"
        description={`Revoke the session for ${revokeTarget?.userEmail ?? "this user"}? They will be signed out immediately.`}
        confirmLabel="Revoke"
        variant="danger"
        error={revokeError}
        onConfirm={handleRevoke}
      />
    </Stack>
  );
}

function TokensPanel({ loading, error, actions }: { loading?: boolean; error?: string; actions: Actions }) {
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<"access" | "refresh">("access");
  const [search, setSearch] = useState("");

  const params = useMemo(() => ({ limit: ADMIN_AUDIT_PAGE_SIZE, offset, type }), [offset, type]);
  const { data, isLoading, error: swrError, mutate } = useSWR(
    loading || error ? null : adminTokensKey(params),
    () => actions.listAdminTokens(params),
  );

  const showLoading = loading ?? isLoading;
  const showError = error ?? (swrError instanceof Error ? swrError.message : swrError ? String(swrError) : undefined);

  const rows = useMemo(() => {
    const all = data?.tokens ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((t) => (t.clientName ?? "").toLowerCase().includes(q) || (t.userEmail ?? "").toLowerCase().includes(q));
  }, [data, search]);

  const columns: DataTableColumn<AdminToken>[] = [
    { key: "type", label: "Type", render: (t) => <Badge tone={t.type === "access" ? "primary" : "secondary"} size="sm">{t.type}</Badge> },
    { key: "clientName", label: "Client", render: (t) => t.clientName ?? t.clientId },
    { key: "userEmail", label: "User", render: (t) => t.userEmail ?? t.userId ?? "—" },
    { key: "tokenPrefix", label: "Token", render: (t) => <Text variant="body" mono>{t.tokenPrefix}</Text> },
    { key: "scopes", label: "Scopes", render: (t) => <Inline gap="xs" wrap>{t.scopes.map((s) => <Badge key={s} tone="neutral" size="sm">{s}</Badge>)}</Inline> },
    { key: "expiresAt", label: "Expires", render: (t) => formatDate(t.expiresAt) },
  ];

  function renderContent() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if ((data?.total ?? 0) === 0) return <EmptyState message="No active OAuth tokens" />;
    return (
      <DataTable<AdminToken>
        columns={columns}
        rows={rows}
        getRowKey={(t) => t.id}
        pagination={{ total: data?.total ?? 0, limit: ADMIN_AUDIT_PAGE_SIZE, offset, onChange: setOffset }}
      />
    );
  }

  const hasRows = (data?.total ?? 0) > 0 && !showLoading && !showError;

  return (
    <Stack gap="md">
      <Panel>
        <Inline justify="between" align="center">
          <Text variant="h2">OAuth Tokens</Text>
          <Inline gap="sm">
            <FilterDropdown
              label="Type"
              options={[{ value: "access", label: "Access" }, { value: "refresh", label: "Refresh" }]}
              value={type}
              onChange={(v) => { setType(v === "refresh" ? "refresh" : "access"); setOffset(0); }}
            />
            <SearchInput grow placeholder="Search by client or user…" value={search} onChange={setSearch} />
          </Inline>
        </Inline>
      </Panel>
      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>
      <Text variant="caption">Token values are never exposed — only an 8-character prefix is shown.</Text>
    </Stack>
  );
}
