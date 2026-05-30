"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
  FilterDropdown,
  Inline,
  PageIntro,
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Text,
} from "@id/ui";
import {
  listAdminTokens as listAdminTokensAction,
  type AdminToken,
} from "../../_actions/audit";
import { adminTokensKey } from "@/app/admin/_data/swr-keys";
import { ADMIN_AUDIT_PAGE_SIZE } from "@/shared/constants";

const defaultActions = {
  listAdminTokens: listAdminTokensAction,
};

type Actions = typeof defaultActions;

export type TokenType = "access" | "refresh";

type TokensContentProps = {
  loading?: boolean;
  error?: string;
  /** URL-addressable token type. When provided the route owns it; otherwise internal state. */
  type?: TokenType;
  onTypeChange?: (type: TokenType) => void;
  actions?: Actions;
};

function formatDate(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleDateString();
}

export function TokensContent({ loading, error, type: typeOverride, onTypeChange, actions = defaultActions }: TokensContentProps) {
  const [offset, setOffset] = useState(0);
  const [internalType, setInternalType] = useState<TokenType>("access");
  const [search, setSearch] = useState("");

  const type = typeOverride ?? internalType;
  function setType(next: TokenType) {
    setOffset(0);
    if (onTypeChange) onTypeChange(next);
    else setInternalType(next);
  }

  const params = useMemo(() => ({ limit: ADMIN_AUDIT_PAGE_SIZE, offset, type }), [offset, type]);
  const { data, isLoading, error: swrError, mutate } = useSWR(
    loading || error ? null : adminTokensKey(params),
    () => actions.listAdminTokens(params),
  );

  const showLoading = loading ?? isLoading;
  const showError = error ?? (swrError instanceof Error ? swrError.message : swrError ? String(swrError) : undefined);

  const all = useMemo(() => data?.tokens ?? [], [data]);
  const rows = useMemo(() => {
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((t) => (t.clientName ?? "").toLowerCase().includes(q) || (t.userEmail ?? "").toLowerCase().includes(q));
  }, [all, search]);

  const uniqueClients = useMemo(() => new Set(all.map((t) => t.clientId)).size, [all]);

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
    if ((data?.total ?? 0) === 0) return <EmptyState message={`No active ${type} tokens`} />;
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
      <PageIntro
        title={type === "refresh" ? "Refresh Tokens" : "Access Tokens"}
        description="Live audit of OAuth tokens issued to applications across the identity provider."
        info="Access tokens are short-lived credentials applications use to call APIs; refresh tokens are longer-lived and used to obtain new access tokens. Tokens are listed for visibility only and always show an 8-character prefix, never the full value. Switch the type filter to inspect each kind."
      />
      <StatGroup columns={2}>
        <Stat title={`${type === "refresh" ? "Refresh" : "Access"} tokens`} value={showLoading ? <Skeleton rows={1} /> : data?.total ?? 0} iconName="KeyRound" tone="primary" />
        <Stat title="Clients" value={showLoading ? <Skeleton rows={1} /> : uniqueClients} description="in page" iconName="AppWindow" />
      </StatGroup>
      <Panel>
        <Inline gap="sm" wrap>
          <FilterDropdown
            label="Type"
            options={[{ value: "access", label: "Access" }, { value: "refresh", label: "Refresh" }]}
            value={type}
            onChange={(v) => setType(v === "refresh" ? "refresh" : "access")}
          />
          <SearchInput grow placeholder="Search by client or user…" value={search} onChange={setSearch} />
        </Inline>
      </Panel>
      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>
      <Text variant="caption">Token values are never exposed — only an 8-character prefix is shown.</Text>
    </Stack>
  );
}
