"use client";

import { useMemo, useRef, useState } from "react";
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
  FileDropzone,
  FilterDropdown,
  Inline,
  PageIntro,
  Panel,
  ScopeBuilder,
  type ScopeSuggestion,
  Skeleton,
  Stack,
  Stat,
  StatGroup,
  Text,
  Textarea,
  TextInput,
  toast,
} from "@id/ui";
import {
  listScopes as listScopesAction,
  createScope as createScopeAction,
  updateScope as updateScopeAction,
  listResourceServers as listResourceServersAction,
  type OAuthResourceScope,
  type ResourceServer,
} from "../../_actions/oauth";
import { oauthScopesKey, resourceServersKey } from "@/app/admin/_data/swr-keys";
import { ADMIN_RECENT_WINDOW_MS } from "@/shared/constants";

const defaultActions = {
  listScopes: listScopesAction,
  createScope: createScopeAction,
  updateScope: updateScopeAction,
  listResourceServers: listResourceServersAction,
};

const platformScope: ActiveScope = { kind: "platform" };

/** Scope strings are lowercase per the OpenAPI contract. */
function isValidScope(scope: string): boolean {
  return /^[a-z][a-z0-9:_-]*$/.test(scope);
}

type BulkScopeRow = {
  readonly scope: string;
  readonly resourceServerId: string | null;
  readonly description?: string;
  readonly error?: string;
};

type ScopeCatalogContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  loading?: boolean;
  error?: string;
  defaultCreateOpen?: boolean;
  scope?: ActiveScope;
  actions?: typeof defaultActions;
};

export function ScopeCatalogContent({
  search: searchProp,
  onSearchChange,
  sortBy: sortByProp,
  sortDirection: sortDirProp,
  onSort,
  loading: loadingOverride,
  error: errorOverride,
  defaultCreateOpen = false,
  scope = platformScope,
  actions = defaultActions,
}: ScopeCatalogContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalSortBy, setInternalSortBy] = useState("scope");
  const [internalSortDir, setInternalSortDir] = useState<"asc" | "desc">("asc");

  const effectiveSearch = searchProp ?? internalSearch;
  const effectiveSortBy = sortByProp ?? internalSortBy;
  const effectiveSortDir = sortDirProp ?? internalSortDir;
  const handleSearchChange = onSearchChange ?? setInternalSearch;
  const handleSort = onSort ?? ((key: string, dir: "asc" | "desc") => { setInternalSortBy(key); setInternalSortDir(dir); });

  const [createOpen, setCreateOpen] = useState(defaultCreateOpen);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createRsId, setCreateRsId] = useState<string>("");
  const [scopeFilters, setScopeFilters] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | undefined>();
  const [bulkRows, setBulkRows] = useState<BulkScopeRow[]>([]);

  const [editTarget, setEditTarget] = useState<OAuthResourceScope | null>(null);
  const [editError, setEditError] = useState<string | undefined>();
  const [editEnabled, setEditEnabled] = useState(true);
  const lastEditRef = useRef<OAuthResourceScope | null>(null);
  if (editTarget) lastEditRef.current = editTarget;
  const editDisplay = editTarget ?? lastEditRef.current;

  const { data: allScopes, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : oauthScopesKey(scope),
    () => actions.listScopes(scope),
  );
  const { data: servers } = useSWR(
    loadingOverride || errorOverride ? null : resourceServersKey(scope),
    () => actions.listResourceServers(scope),
  );

  const serverById = useMemo(() => {
    const map = new Map<string, ResourceServer>();
    for (const s of servers ?? []) map.set(s.id, s);
    return map;
  }, [servers]);

  const rsOptions = useMemo(
    () => (servers ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.slug})` })),
    [servers],
  );
  const scopeSuggestions: ScopeSuggestion[] = useMemo(
    () => (allScopes ?? []).map((s) => ({ value: s.scope, description: s.description ?? undefined, group: serverById.get(s.resourceServerId)?.name })),
    [allScopes, serverById],
  );
  const stats = useMemo(() => {
    const rows = allScopes ?? [];
    const resourceIds = new Set(rows.map((s) => s.resourceServerId));
    const recentThreshold = Date.now() - ADMIN_RECENT_WINDOW_MS;
    return {
      total: rows.length,
      disabled: rows.filter((s) => !s.enabled).length,
      resources: resourceIds.size,
      recent: rows.filter((s) => s.updatedAt >= recentThreshold).length,
    };
  }, [allScopes]);

  const displayed = useMemo(() => {
    let rows = allScopes ?? [];
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      rows = rows.filter((s) => s.scope.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
    }
    if (scopeFilters.length > 0) {
      rows = rows.filter((s) => scopeFilters.some((filter) => {
        const trimmed = filter.trim();
        if (trimmed.endsWith("*")) return s.scope.startsWith(trimmed.slice(0, -1));
        return s.scope === trimmed;
      }));
    }
    if (effectiveSortBy) {
      rows = [...rows].sort((a, b) => {
        const aVal = String(a[effectiveSortBy as keyof OAuthResourceScope] ?? "");
        const bVal = String(b[effectiveSortBy as keyof OAuthResourceScope] ?? "");
        const cmp = aVal.localeCompare(bVal);
        return effectiveSortDir === "desc" ? -cmp : cmp;
      });
    }
    return rows;
  }, [allScopes, effectiveSearch, scopeFilters, effectiveSortBy, effectiveSortDir]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  const columns: DataTableColumn<OAuthResourceScope>[] = [
    { key: "scope", label: "Scope", sortable: true, render: (s) => <Text variant="body" mono>{s.scope}</Text> },
    { key: "resourceServerId", label: "Resource API", render: (s) => serverById.get(s.resourceServerId)?.name ?? s.resourceServerId },
    {
      key: "enabled",
      label: "Status",
      render: (s) => (s.enabled ? <Badge tone="success" size="sm">Enabled</Badge> : <Badge tone="error" size="sm">Disabled</Badge>),
    },
    { key: "description", label: "Description", render: (s) => s.description ?? "—" },
    {
      key: "actions",
      label: "Actions",
      actions: (s) => [
        {
          id: "edit",
          label: "Edit",
          iconName: "Pencil",
          ariaLabel: `Edit ${s.scope}`,
          tooltip: "Edit scope",
          onAction: () => { setEditError(undefined); setEditEnabled(s.enabled); setEditTarget(s); },
        },
      ],
    },
  ];

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    if (!createRsId) { setCreateError("Select a resource API"); return false; }
    const scopeName = String(formData.get("scope") ?? "").trim();
    if (!isValidScope(scopeName)) {
      setCreateError("Scope must be lowercase and match ^[a-z][a-z0-9:_-]*$");
      return false;
    }
    try {
      await actions.createScope({
        resourceServerId: createRsId,
        scope: scopeName,
        description: String(formData.get("description") ?? "").trim() || undefined,
      }, scope);
      await mutate();
      setCreateOpen(false);
      toast.success("Scope created", `"${scopeName}" can now be requested by clients.`);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create scope");
      return false;
    }
  }

  async function handleEdit(formData: FormData) {
    if (!editTarget) return false;
    setEditError(undefined);
    try {
      await actions.updateScope(editTarget.id, {
        description: String(formData.get("description") ?? "").trim() || null,
        enabled: editEnabled,
      }, scope);
      await mutate();
      setEditTarget(null);
      toast.success("Scope updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update scope");
      return false;
    }
  }

  function parseBulkCsv(text: string): BulkScopeRow[] {
    const existing = new Set((allScopes ?? []).map((catalogScope) => catalogScope.scope));
    const serverLookup = new Map<string, ResourceServer>();
    for (const server of servers ?? []) {
      serverLookup.set(server.id, server);
      serverLookup.set(server.slug, server);
      serverLookup.set(server.name.toLowerCase(), server);
    }
    return text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line, index) => !(index === 0 && line.toLowerCase().startsWith("scope,")))
      .map((line) => {
        const [rawScope, rawServer, ...descriptionParts] = line.split(",");
        const scopeName = (rawScope ?? "").trim();
        const serverKey = (rawServer ?? "").trim();
        const server = serverLookup.get(serverKey) ?? serverLookup.get(serverKey.toLowerCase());
        const description = descriptionParts.join(",").trim() || undefined;
        if (!isValidScope(scopeName)) return { scope: scopeName, resourceServerId: null, description, error: "Invalid scope" };
        if (existing.has(scopeName)) return { scope: scopeName, resourceServerId: null, description, error: "Already exists" };
        if (!server) return { scope: scopeName, resourceServerId: null, description, error: "Unknown resource API" };
        return { scope: scopeName, resourceServerId: server.id, description };
      });
  }

  async function handleBulkFiles(files: File[]) {
    setBulkError(undefined);
    const file = files[0];
    if (!file) return;
    setBulkRows(parseBulkCsv(await file.text()));
  }

  async function handleBulkImport() {
    setBulkError(undefined);
    const validRows = bulkRows.filter((row): row is BulkScopeRow & { resourceServerId: string } => Boolean(row.resourceServerId) && !row.error);
    if (validRows.length === 0) {
      setBulkError("No valid scopes to import");
      return false;
    }
    try {
      await Promise.all(validRows.map((row) => actions.createScope({ resourceServerId: row.resourceServerId, scope: row.scope, description: row.description }, scope)));
      await mutate();
      setBulkOpen(false);
      setBulkRows([]);
      toast.success("Scopes imported", `${validRows.length} scopes were created.`);
      return true;
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : "Failed to import scopes");
      return false;
    }
  }

  function renderContent() {
    if (showLoading) return <Skeleton rows={4} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (displayed.length === 0) {
      if (effectiveSearch || scopeFilters.length > 0) {
        return <EmptyState message="No scopes match your filters" cta="Clear filters" onCta={() => { handleSearchChange(""); setScopeFilters([]); }} />;
      }
      return <EmptyState message="No OAuth scopes defined" cta="Create Scope" onCta={() => setCreateOpen(true)} />;
    }
    return (
      <DataTable<OAuthResourceScope>
        columns={columns}
        rows={displayed}
        getRowKey={(s) => s.id}
        sortBy={effectiveSortBy}
        sortDirection={effectiveSortDir}
        onSort={handleSort}
      />
    );
  }

  const hasRows = displayed.length > 0 && !showLoading && !showError;

  return (
    <Stack gap="md">
      <PageIntro
        title="Scope Catalog"
        description="Permissions that clients can request and resource APIs enforce. Each scope belongs to one resource API."
        info="A scope is a named permission (for example invoices:read) attached to a resource API. Clients request scopes during authorization; the resulting access token carries the granted scopes, and your resource server checks them. Scope strings are lowercase and match ^[a-z][a-z0-9:_-]*$. Disable a scope to stop granting it without deleting its history."
        actions={
          <Inline>
            <Button variant="secondary" iconName="Upload" onClick={() => { setBulkError(undefined); setBulkRows([]); setBulkOpen(true); }}>Bulk Import</Button>
            <Button variant="primary" iconName="Plus" onClick={() => { setCreateError(undefined); setCreateRsId(""); setCreateOpen(true); }}>New Scope</Button>
          </Inline>
        }
      />
      <StatGroup columns={4}>
        <Stat title="Total" value={stats.total} description="scopes" tone="primary" />
        <Stat title="Disabled" value={stats.disabled} description="not grantable" tone={stats.disabled > 0 ? "warning" : "neutral"} />
        <Stat title="Resources" value={stats.resources} description="with scopes" />
        <Stat title="Updated 7d" value={stats.recent} description="recent changes" tone="info" />
      </StatGroup>
      <Panel>
        <ScopeBuilder
          label="Search and filter scopes"
          value={scopeFilters}
          onChange={setScopeFilters}
          suggestions={scopeSuggestions}
          allowCustom
          variant="menu"
          placeholder="Search scopes or add filters…"
          searchValue={effectiveSearch}
          onSearchValueChange={handleSearchChange}
        />
      </Panel>

      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateError(undefined); }}
        title="Create OAuth Scope"
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreate}
      >
        <FilterDropdown label="Resource API" options={rsOptions} value={createRsId} onChange={setCreateRsId} showLabel />
        <TextInput label="Scope" name="scope" required />
        <Textarea label="Description" name="description" />
      </ConfirmDialog>

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={(o) => { setBulkOpen(o); if (!o) { setBulkError(undefined); setBulkRows([]); } }}
        title="Bulk Import Scopes"
        description="Upload CSV rows as scope,resourceServer,description. The resource server may be an id, slug, or name."
        confirmLabel="Import valid scopes"
        error={bulkError}
        onConfirm={handleBulkImport}
      >
        <FileDropzone label="CSV file" accept={[".csv", "text/csv"]} onFiles={(files) => void handleBulkFiles(files)} hint="Header row is optional." />
        {bulkRows.length > 0 ? (
          <Stack gap="xs">
            <Text variant="caption">{bulkRows.filter((row) => !row.error).length} valid, {bulkRows.filter((row) => row.error).length} skipped</Text>
            {bulkRows.slice(0, 5).map((row, index) => (
              <Inline key={`${row.scope}:${row.resourceServerId ?? row.error}:${index}`} gap="sm">
                <Text variant="body" mono>{row.scope || "(blank)"}</Text>
                <Badge tone={row.error ? "error" : "success"} size="sm">{row.error ?? "Valid"}</Badge>
              </Inline>
            ))}
          </Stack>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => { if (!o) { setEditTarget(null); setEditError(undefined); } }}
        title="Edit OAuth Scope"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        {editDisplay ? (
          <>
            <Inline gap="sm" align="center">
              <Text variant="caption">Scope:</Text>
              <Text variant="body" mono>{editDisplay.scope}</Text>
            </Inline>
            <Textarea label="Description" name="description" defaultValue={editDisplay.description ?? ""} />
            <Checkbox label="Enabled" name="enabled" selected={editEnabled} onChange={setEditEnabled} />
          </>
        ) : null}
      </ConfirmDialog>
    </Stack>
  );
}
