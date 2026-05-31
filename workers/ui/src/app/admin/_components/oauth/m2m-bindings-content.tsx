"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ActiveScope } from "@id/lib";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
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
  toast,
} from "@id/ui";
import {
  listBindings as listBindingsAction,
  createBinding as createBindingAction,
  deleteBinding as deleteBindingAction,
  listClients as listClientsAction,
  listResourceServers as listResourceServersAction,
  listScopes as listScopesAction,
  type ClientResourceScope,
  type OAuthClient,
  type ResourceServer,
} from "../../_actions/oauth";
import {
  m2mBindingsKey,
  oauthClientsKey,
  resourceServersKey,
  oauthScopesKey,
} from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listBindings: listBindingsAction,
  createBinding: createBindingAction,
  deleteBinding: deleteBindingAction,
  listClients: listClientsAction,
  listResourceServers: listResourceServersAction,
  listScopes: listScopesAction,
};

const platformScope: ActiveScope = { kind: "platform" };

function toggleScope(list: string[], scope: string, on: boolean): string[] {
  return on ? [...new Set([...list, scope])] : list.filter((s) => s !== scope);
}

function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "Never";
}

type M2mBindingsContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  onBindingClick?: (bindingId: string) => void;
  loading?: boolean;
  error?: string;
  defaultCreateOpen?: boolean;
  scope?: ActiveScope;
  actions?: typeof defaultActions;
};

export function M2mBindingsContent({
  search: searchProp,
  onSearchChange,
  onBindingClick,
  loading: loadingOverride,
  error: errorOverride,
  defaultCreateOpen = false,
  scope = platformScope,
  actions = defaultActions,
}: M2mBindingsContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const effectiveSearch = searchProp ?? internalSearch;
  const handleSearchChange = onSearchChange ?? setInternalSearch;

  const [createOpen, setCreateOpen] = useState(defaultCreateOpen);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createClientId, setCreateClientId] = useState("");
  const [createRsId, setCreateRsId] = useState("");
  const [createScopes, setCreateScopes] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<ClientResourceScope | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const { data: bindings, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : m2mBindingsKey(scope),
    () => actions.listBindings(scope),
  );
  const skipFetch = loadingOverride || errorOverride;
  const { data: clients } = useSWR(skipFetch ? null : oauthClientsKey(scope), () => actions.listClients(scope));
  const { data: servers } = useSWR(skipFetch ? null : resourceServersKey(scope), () => actions.listResourceServers(scope));
  const { data: scopes } = useSWR(skipFetch ? null : oauthScopesKey(scope), () => actions.listScopes(scope));

  const clientById = useMemo(() => {
    const map = new Map<string, OAuthClient>();
    for (const c of clients ?? []) map.set(c.client_id, c);
    return map;
  }, [clients]);
  const serverById = useMemo(() => {
    const map = new Map<string, ResourceServer>();
    for (const s of servers ?? []) map.set(s.id, s);
    return map;
  }, [servers]);

  const clientOptions = useMemo(
    () => (clients ?? []).map((c) => ({ value: c.client_id, label: `${c.client_name} (${c.client_id.slice(0, 12)}…)` })),
    [clients],
  );
  const rsOptions = useMemo(
    () => (servers ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.slug})` })),
    [servers],
  );

  function scopeOptionsFor(rsId: string): string[] {
    return (scopes ?? []).filter((s) => s.resourceServerId === rsId).map((s) => s.scope);
  }

  const displayed = useMemo(() => {
    const rows = bindings ?? [];
    if (!effectiveSearch) return rows;
    const q = effectiveSearch.toLowerCase();
    return rows.filter((b) => {
      const clientName = clientById.get(b.clientId)?.client_name ?? b.clientId;
      const rsName = serverById.get(b.resourceServerId)?.name ?? b.resourceServerId;
      return clientName.toLowerCase().includes(q) || rsName.toLowerCase().includes(q);
    });
  }, [bindings, effectiveSearch, clientById, serverById]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const stats = useMemo(() => {
    const rows = bindings ?? [];
    const uniqueClients = new Set(rows.map((binding) => binding.clientId));
    const uniqueResources = new Set(rows.map((binding) => binding.resourceServerId));
    return {
      total: rows.length,
      active: rows.filter((binding) => binding.enabled).length,
      clients: uniqueClients.size,
      resources: uniqueResources.size,
    };
  }, [bindings]);

  const columns: DataTableColumn<ClientResourceScope>[] = [
    { key: "clientId", label: "Client", render: (b) => clientById.get(b.clientId)?.client_name ?? b.clientId },
    { key: "resourceServerId", label: "Resource API", render: (b) => serverById.get(b.resourceServerId)?.name ?? b.resourceServerId },
    {
      key: "allowedScopes",
      label: "Scopes",
      render: (b) => (
        <Inline gap="xs" wrap>
          {b.allowedScopes.map((s) => <Badge key={s} tone="primary" size="sm">{s}</Badge>)}
        </Inline>
      ),
    },
    {
      key: "enabled",
      label: "Status",
      render: (b) => (b.enabled ? <Badge tone="success" size="sm">Active</Badge> : <Badge tone="error" size="sm">Disabled</Badge>),
    },
    {
      key: "updatedAt",
      label: "Updated / By",
      render: (b) => (
        <Stack gap="xs">
          <Text variant="body">{formatDate(b.updatedAt)}</Text>
          <Text variant="caption" mono>{b.updatedBy}</Text>
        </Stack>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      actions: (b) => [
        {
          id: "delete",
          label: "Delete",
          variant: "danger",
          iconName: "Trash2",
          ariaLabel: "Delete binding",
          tooltip: "Delete binding",
          onAction: () => { setDeleteError(undefined); setDeleteTarget(b); },
        },
      ],
    },
  ];

  async function handleCreate() {
    setCreateError(undefined);
    if (!createClientId || !createRsId) { setCreateError("Select a client and a resource API"); return false; }
    if (createScopes.length === 0) { setCreateError("Select at least one scope"); return false; }
    try {
      await actions.createBinding({ clientId: createClientId, resourceServerId: createRsId, allowedScopes: createScopes }, scope);
      await mutate();
      setCreateOpen(false);
      toast.success("Binding created", "The client can now request these scopes for this API.");
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create binding");
      return false;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return false;
    setDeleteError(undefined);
    try {
      await actions.deleteBinding(deleteTarget.id, scope);
      await mutate((cur) => (cur ?? []).filter((b) => b.id !== deleteTarget.id), { revalidate: false });
      setDeleteTarget(null);
      toast.success("Binding deleted", "The client lost access to these scopes.");
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete binding");
      return false;
    }
  }

  function renderContent() {
    if (showLoading) return <Skeleton rows={4} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (displayed.length === 0) {
      if (effectiveSearch) {
        return <EmptyState message="No bindings match your search" cta="Clear search" onCta={() => handleSearchChange("")} />;
      }
      return <EmptyState message="No M2M client bindings" cta="Create Binding" onCta={() => setCreateOpen(true)} />;
    }
    return <DataTable<ClientResourceScope> columns={columns} rows={displayed} getRowKey={(b) => b.id} onRowClick={onBindingClick ? (b) => onBindingClick(b.id) : undefined} />;
  }

  const hasRows = displayed.length > 0 && !showLoading && !showError;
  const createScopeOptions = scopeOptionsFor(createRsId);

  return (
    <Stack gap="md">
      <PageIntro
        title="M2M Bindings"
        description="Grant machine-to-machine clients access to specific resource APIs and scopes via the client-credentials flow."
        info="A binding links an M2M (client-credentials) application to a resource API and the exact scopes it may request — there is no user in this flow. When the client authenticates with its ID and secret, it can only obtain tokens for the scopes bound here. Disable a binding to cut off access without deleting it."
        actions={
          <Button variant="primary" iconName="Plus" onClick={() => { setCreateError(undefined); setCreateClientId(""); setCreateRsId(""); setCreateScopes([]); setCreateOpen(true); }}>New Binding</Button>
        }
      />
      <StatGroup columns={4}>
        <Stat title="Total" value={stats.total} description="bindings" tone="primary" />
        <Stat title="Active" value={stats.active} description="enabled" tone="success" />
        <Stat title="Clients" value={stats.clients} description="with access" />
        <Stat title="Resources" value={stats.resources} description="covered APIs" tone="info" />
      </StatGroup>
      <Panel>
        <SearchInput grow placeholder="Search bindings…" value={effectiveSearch} onChange={handleSearchChange} />
      </Panel>

      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateError(undefined); }}
        title="Create M2M Binding"
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreate}
      >
        <FilterDropdown label="Client" options={clientOptions} value={createClientId} onChange={setCreateClientId} showLabel />
        <FilterDropdown label="Resource API" options={rsOptions} value={createRsId} onChange={(v) => { setCreateRsId(v); setCreateScopes([]); }} showLabel />
        {createRsId ? (
          <Stack gap="xs">
            <Text variant="caption">Allowed Scopes</Text>
            {createScopeOptions.length === 0
              ? <Text variant="caption">No scopes defined for this resource API.</Text>
              : createScopeOptions.map((s) => (
                <Checkbox key={s} label={s} name={`scope:${s}`} selected={createScopes.includes(s)} onChange={(on) => setCreateScopes((cur) => toggleScope(cur, s, on))} />
              ))}
          </Stack>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(undefined); } }}
        title="Delete M2M Binding"
        description="The client will lose access to these scopes for the selected resource server."
        confirmLabel="Delete"
        variant="danger"
        error={deleteError}
        onConfirm={handleDelete}
      />
    </Stack>
  );
}
