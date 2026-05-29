"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
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
  Panel,
  SearchInput,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
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

const defaultActions = {
  listScopes: listScopesAction,
  createScope: createScopeAction,
  updateScope: updateScopeAction,
  listResourceServers: listResourceServersAction,
};

/** Scope strings are lowercase per the OpenAPI contract. */
function isValidScope(scope: string): boolean {
  return /^[a-z][a-z0-9:_-]*$/.test(scope);
}

type ScopeCatalogContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  loading?: boolean;
  error?: string;
  defaultCreateOpen?: boolean;
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

  const [editTarget, setEditTarget] = useState<OAuthResourceScope | null>(null);
  const [editError, setEditError] = useState<string | undefined>();
  const [editEnabled, setEditEnabled] = useState(true);
  const lastEditRef = useRef<OAuthResourceScope | null>(null);
  if (editTarget) lastEditRef.current = editTarget;
  const editDisplay = editTarget ?? lastEditRef.current;

  const { data: allScopes, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : oauthScopesKey(),
    () => actions.listScopes(),
  );
  const { data: servers } = useSWR(
    loadingOverride || errorOverride ? null : resourceServersKey(),
    () => actions.listResourceServers(),
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

  const displayed = useMemo(() => {
    let rows = allScopes ?? [];
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      rows = rows.filter((s) => s.scope.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
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
  }, [allScopes, effectiveSearch, effectiveSortBy, effectiveSortDir]);

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
      render: (s) => (
        <Inline gap="xs">
          <Button size="sm" variant="secondary" iconName="Pencil" ariaLabel={`Edit ${s.scope}`} onClick={() => { setEditError(undefined); setEditEnabled(s.enabled); setEditTarget(s); }} />
        </Inline>
      ),
    },
  ];

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    if (!createRsId) { setCreateError("Select a resource API"); return false; }
    const scope = String(formData.get("scope") ?? "").trim();
    if (!isValidScope(scope)) {
      setCreateError("Scope must be lowercase and match ^[a-z][a-z0-9:_-]*$");
      return false;
    }
    try {
      await actions.createScope({
        resourceServerId: createRsId,
        scope,
        description: String(formData.get("description") ?? "").trim() || undefined,
      });
      await mutate();
      setCreateOpen(false);
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
      });
      await mutate();
      setEditTarget(null);
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update scope");
      return false;
    }
  }

  function renderContent() {
    if (showLoading) return <Skeleton rows={4} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (displayed.length === 0) {
      if (effectiveSearch) {
        return <EmptyState message="No scopes match your search" cta="Clear search" onCta={() => handleSearchChange("")} />;
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
      <Panel>
        <Stack gap="sm">
          <Text variant="h2">Scope Catalog</Text>
          <Inline gap="sm">
            <SearchInput grow placeholder="Search scopes…" value={effectiveSearch} onChange={handleSearchChange} />
            <Button variant="primary" iconName="Plus" onClick={() => { setCreateError(undefined); setCreateRsId(""); setCreateOpen(true); }}>New Scope</Button>
          </Inline>
        </Stack>
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
