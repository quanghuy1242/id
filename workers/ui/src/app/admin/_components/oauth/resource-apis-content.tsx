"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  DescriptionList,
  EmptyState,
  ErrorAlert,
  Inline,
  PageIntro,
  Panel,
  RadioGroup,
  SearchInput,
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
  listResourceServers as listResourceServersAction,
  createResourceServer as createResourceServerAction,
  updateResourceServer as updateResourceServerAction,
  disableResourceServer as disableResourceServerAction,
  enableResourceServer as enableResourceServerAction,
  deleteResourceServer as deleteResourceServerAction,
  type ResourceServer,
} from "../../_actions/oauth";
import { listOrganizations as listOrganizationsAction } from "../../_actions/organizations";
import { resourceServersKey, orgsListKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listResourceServers: listResourceServersAction,
  createResourceServer: createResourceServerAction,
  updateResourceServer: updateResourceServerAction,
  disableResourceServer: disableResourceServerAction,
  enableResourceServer: enableResourceServerAction,
  deleteResourceServer: deleteResourceServerAction,
  listOrganizations: listOrganizationsAction,
};

function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "Never";
}

type ResourceApisContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  onResourceClick?: (resourceServerId: string) => void;
  loading?: boolean;
  error?: string;
  defaultCreateOpen?: boolean;
  actions?: typeof defaultActions;
};

export function ResourceApisContent({
  search: searchProp,
  onSearchChange,
  sortBy: sortByProp,
  sortDirection: sortDirProp,
  onSort,
  onResourceClick,
  loading: loadingOverride,
  error: errorOverride,
  defaultCreateOpen = false,
  actions = defaultActions,
}: ResourceApisContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalSortBy, setInternalSortBy] = useState("name");
  const [internalSortDir, setInternalSortDir] = useState<"asc" | "desc">("asc");

  const effectiveSearch = searchProp ?? internalSearch;
  const effectiveSortBy = sortByProp ?? internalSortBy;
  const effectiveSortDir = sortDirProp ?? internalSortDir;
  const handleSearchChange = onSearchChange ?? setInternalSearch;
  const handleSort = onSort ?? ((key: string, dir: "asc" | "desc") => { setInternalSortBy(key); setInternalSortDir(dir); });

  const [createOpen, setCreateOpen] = useState(defaultCreateOpen);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createOrgId, setCreateOrgId] = useState<string>("");

  const [editTarget, setEditTarget] = useState<ResourceServer | null>(null);
  const [editError, setEditError] = useState<string | undefined>();
  const lastEditRef = useRef<ResourceServer | null>(null);
  if (editTarget) lastEditRef.current = editTarget;
  const editDisplay = editTarget ?? lastEditRef.current;

  const [disableTarget, setDisableTarget] = useState<ResourceServer | null>(null);
  const [disableError, setDisableError] = useState<string | undefined>();

  const [enableTarget, setEnableTarget] = useState<ResourceServer | null>(null);
  const [enableError, setEnableError] = useState<string | undefined>();

  const [deleteTarget, setDeleteTarget] = useState<ResourceServer | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const { data: allServers, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : resourceServersKey(),
    () => actions.listResourceServers(),
  );

  // Organizations power the create-modal owner radio; cached + shared with the orgs page.
  const { data: orgs } = useSWR(createOpen ? orgsListKey() : null, () => actions.listOrganizations());
  const orgOptions = useMemo(
    () => [{ value: "", label: "System (id-owned)" }, ...(orgs ?? []).map((o) => ({ value: o.id, label: o.name }))],
    [orgs],
  );

  const displayed = useMemo(() => {
    let rows = allServers ?? [];
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
    }
    if (effectiveSortBy) {
      rows = [...rows].sort((a, b) => {
        const aVal = String(a[effectiveSortBy as keyof ResourceServer] ?? "");
        const bVal = String(b[effectiveSortBy as keyof ResourceServer] ?? "");
        const cmp = aVal.localeCompare(bVal);
        return effectiveSortDir === "desc" ? -cmp : cmp;
      });
    }
    return rows;
  }, [allServers, effectiveSearch, effectiveSortBy, effectiveSortDir]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const stats = useMemo(() => {
    const rows = allServers ?? [];
    return {
      total: rows.length,
      enabled: rows.filter((rs) => rs.enabled).length,
      disabled: rows.filter((rs) => !rs.enabled).length,
      system: rows.filter((rs) => rs.organizationId === null).length,
    };
  }, [allServers]);

  const columns: DataTableColumn<ResourceServer>[] = [
    { key: "name", label: "Name", sortable: true },
    { key: "slug", label: "Slug", sortable: true },
    { key: "audience", label: "Audience" },
    {
      key: "enabled",
      label: "Status",
      render: (rs) => (
        <Inline gap="xs">
          {rs.organizationId === null ? <Badge tone="accent" size="sm">System</Badge> : null}
          {rs.enabled ? <Badge tone="success" size="sm">Enabled</Badge> : <Badge tone="error" size="sm">Disabled</Badge>}
        </Inline>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated / By",
      sortable: true,
      render: (rs) => (
        <Stack gap="xs">
          <Text variant="body">{formatDate(rs.updatedAt)}</Text>
          <Text variant="caption" mono>{rs.updatedBy}</Text>
        </Stack>
      ),
    },
    { key: "description", label: "Description", render: (rs) => rs.description ?? "—" },
    {
      key: "actions",
      label: "Actions",
      render: (rs) => (
        <Inline gap="xs">
          <Button size="sm" variant="secondary" iconName="Pencil" ariaLabel={`Edit ${rs.name}`} tooltip="Edit resource API" onClick={() => { setEditError(undefined); setEditTarget(rs); }} />
          {rs.enabled ? (
            <Button size="sm" variant="secondary" ariaLabel={`Disable ${rs.name}`} tooltip="Reject new tokens for this audience" onClick={() => { setDisableError(undefined); setDisableTarget(rs); }}>Disable</Button>
          ) : (
            <Button size="sm" variant="secondary" ariaLabel={`Activate ${rs.name}`} tooltip="Allow tokens for this audience again" onClick={() => { setEnableError(undefined); setEnableTarget(rs); }}>Activate</Button>
          )}
          <Button size="sm" variant="danger" iconName="Trash2" ariaLabel={`Delete ${rs.name}`} tooltip="Delete resource API" onClick={() => { setDeleteError(undefined); setDeleteTarget(rs); }} />
        </Inline>
      ),
    },
  ];

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    try {
      const name = String(formData.get("name") ?? "").trim();
      await actions.createResourceServer({
        name,
        slug: String(formData.get("slug") ?? "").trim(),
        audience: String(formData.get("audience") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || undefined,
        ...(createOrgId ? { organizationId: createOrgId } : {}),
      });
      await mutate();
      setCreateOpen(false);
      toast.success("Resource API registered", `Define scopes for ${name} in the Scope Catalog.`);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to register resource API");
      return false;
    }
  }

  async function handleEdit(formData: FormData) {
    if (!editTarget) return false;
    setEditError(undefined);
    try {
      await actions.updateResourceServer(editTarget.id, {
        name: String(formData.get("name") ?? "").trim(),
        slug: String(formData.get("slug") ?? "").trim(),
        audience: String(formData.get("audience") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
      });
      await mutate();
      setEditTarget(null);
      toast.success("Resource API updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update resource API");
      return false;
    }
  }

  async function handleDisable() {
    if (!disableTarget) return false;
    setDisableError(undefined);
    try {
      const name = disableTarget.name;
      await actions.disableResourceServer(disableTarget.id);
      await mutate();
      setDisableTarget(null);
      toast.success("Resource API disabled", `New tokens for ${name} will be rejected.`);
      return true;
    } catch (err: unknown) {
      setDisableError(err instanceof Error ? err.message : "Failed to disable resource API");
      return false;
    }
  }

  async function handleEnable() {
    if (!enableTarget) return false;
    setEnableError(undefined);
    try {
      const name = enableTarget.name;
      await actions.enableResourceServer(enableTarget.id);
      await mutate();
      setEnableTarget(null);
      toast.success("Resource API activated", `${name} can issue tokens again.`);
      return true;
    } catch (err: unknown) {
      setEnableError(err instanceof Error ? err.message : "Failed to activate resource API");
      return false;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return false;
    setDeleteError(undefined);
    try {
      const name = deleteTarget.name;
      await actions.deleteResourceServer(deleteTarget.id);
      await mutate((cur) => (cur ?? []).filter((r) => r.id !== deleteTarget.id), { revalidate: false });
      setDeleteTarget(null);
      toast.success("Resource API deleted", `${name}, its scopes, and issued tokens were removed.`);
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete resource API");
      return false;
    }
  }

  function renderContent() {
    if (showLoading) return <Skeleton rows={4} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (displayed.length === 0) {
      if (effectiveSearch) {
        return <EmptyState message="No resource APIs match your search" cta="Clear search" onCta={() => handleSearchChange("")} />;
      }
      return <EmptyState message="No resource APIs registered" cta="Register Resource API" onCta={() => setCreateOpen(true)} />;
    }
    return (
      <DataTable<ResourceServer>
        columns={columns}
        rows={displayed}
        getRowKey={(rs) => rs.id}
        sortBy={effectiveSortBy}
        sortDirection={effectiveSortDir}
        onSort={handleSort}
        onRowClick={onResourceClick ? (rs) => onResourceClick(rs.id) : undefined}
      />
    );
  }

  const hasRows = displayed.length > 0 && !showLoading && !showError;

  return (
    <Stack gap="md">
      <PageIntro
        title="Resource APIs"
        description="Protected APIs that accept access tokens from this provider. Each defines an audience that tokens are minted for."
        info="A resource API (resource server) is something clients call with an access token — for example your backend API. The audience URL identifies it inside issued tokens, and the scopes you define here (in the Scope Catalog) gate what a token may do. Disabling an API rejects new tokens for its audience without deleting its configuration."
        actions={
          <Button variant="primary" iconName="Plus" onClick={() => { setCreateError(undefined); setCreateOrgId(""); setCreateOpen(true); }}>Register API</Button>
        }
      />
      <StatGroup columns={4}>
        <Stat title="Total" value={stats.total} description="resource APIs" tone="primary" />
        <Stat title="Enabled" value={stats.enabled} description="grantable" tone="success" />
        <Stat title="Disabled" value={stats.disabled} description="blocked" tone={stats.disabled > 0 ? "warning" : "neutral"} />
        <Stat title="System" value={stats.system} description="id-owned" tone="info" />
      </StatGroup>
      <Panel>
        <SearchInput grow placeholder="Search resource APIs…" value={effectiveSearch} onChange={handleSearchChange} />
      </Panel>

      <Panel padding={hasRows ? "none" : "md"}>{renderContent()}</Panel>

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateError(undefined); }}
        title="Register Resource API"
        confirmLabel="Register"
        error={createError}
        onConfirm={handleCreate}
      >
        <TextInput label="Name" name="name" required />
        <TextInput label="Slug" name="slug" required />
        <TextInput label="Audience URL" name="audience" required />
        <Textarea label="Description" name="description" />
        <RadioGroup title="Organization" name="organizationId" options={orgOptions} value={createOrgId} onChange={setCreateOrgId} />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => { if (!o) { setEditTarget(null); setEditError(undefined); } }}
        title="Edit Resource API"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        {editDisplay ? (
          <>
            <DescriptionList
              dense
              items={[
                { term: "Created", description: `${formatDate(editDisplay.createdAt)} by ${editDisplay.createdBy}` },
                { term: "Updated", description: `${formatDate(editDisplay.updatedAt)} by ${editDisplay.updatedBy}` },
              ]}
            />
            <TextInput label="Name" name="name" defaultValue={editDisplay.name} required />
            <TextInput label="Slug" name="slug" defaultValue={editDisplay.slug} required />
            <TextInput label="Audience URL" name="audience" defaultValue={editDisplay.audience} required />
            <Textarea label="Description" name="description" defaultValue={editDisplay.description ?? ""} />
          </>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(disableTarget)}
        onOpenChange={(o) => { if (!o) { setDisableTarget(null); setDisableError(undefined); } }}
        title="Disable API"
        description={`Disable ${disableTarget?.name ?? "this API"}? New tokens with this audience will be rejected until the API is activated again.`}
        confirmLabel="Disable"
        variant="danger"
        error={disableError}
        onConfirm={handleDisable}
      />

      <ConfirmDialog
        open={Boolean(enableTarget)}
        onOpenChange={(o) => { if (!o) { setEnableTarget(null); setEnableError(undefined); } }}
        title="Activate API"
        description={`Activate ${enableTarget?.name ?? "this API"}? Resource servers can request tokens for this audience again.`}
        confirmLabel="Activate"
        error={enableError}
        onConfirm={handleEnable}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(undefined); } }}
        title="Delete Resource API"
        description={`Delete ${deleteTarget?.name ?? "this API"}? This removes the resource server and ALL associated OAuth scopes, and invalidates every token issued for this audience.`}
        confirmLabel="Delete"
        variant="danger"
        error={deleteError}
        onConfirm={handleDelete}
      />
    </Stack>
  );
}
