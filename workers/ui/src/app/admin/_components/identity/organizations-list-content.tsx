"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Button,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorAlert,
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
  listOrganizations as listOrgsAction,
  createOrganization as createOrgAction,
  type Organization,
} from "../../_actions/organizations";

const defaultActions = {
  listOrganizations: listOrgsAction,
  createOrganization: createOrgAction,
};

const columns: DataTableColumn<Organization>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "slug", label: "Slug" },
  {
    key: "createdAt",
    label: "Created",
    sortable: true,
    render: (o) => new Date(o.createdAt).toLocaleDateString(),
  },
];

type OrgsListContentProps = {
  search?: string;
  onSearchChange?: (v: string) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string, dir: "asc" | "desc") => void;
  onRowClick?: (orgId: string) => void;
  loading?: boolean;
  error?: string;
  defaultCreateOpen?: boolean;
  actions?: typeof defaultActions;
};

export function OrganizationsListContent({
  loading: loadingOverride,
  error: errorOverride,
  onRowClick,
  defaultCreateOpen = false,
  actions = defaultActions,
  ...props
}: OrgsListContentProps) {
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [internalSearch, setInternalSearch] = useState("");
  const [internalSortBy, setInternalSortBy] = useState("name");
  const [internalSortDir, setInternalSortDir] = useState<"asc" | "desc">("asc");

  const [createOpen, setCreateOpen] = useState(defaultCreateOpen);
  const [createError, setCreateError] = useState<string | undefined>();
  const [metadataError, setMetadataError] = useState<string | undefined>();

  const effectiveSearch = props.search ?? internalSearch;
  const effectiveSortBy = props.sortBy ?? internalSortBy;
  const effectiveSortDir = props.sortDirection ?? internalSortDir;

  const handleSearchChange = props.onSearchChange ?? setInternalSearch;
  const handleSort = props.onSort ?? ((key: string, dir: "asc" | "desc") => {
    setInternalSortBy(key);
    setInternalSortDir(dir);
  });

  useEffect(() => {
    if (loadingOverride || errorOverride) return;
    setIsLoading(true);
    setFetchError(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const orgs = await actions.listOrganizations();
        if (!cancelled) { setAllOrgs(orgs); setIsLoading(false); }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load organizations");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, loadingOverride, errorOverride, fetchKey]);

  const displayedOrgs = useMemo(() => {
    let orgs = allOrgs;
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      orgs = orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
    }
    if (effectiveSortBy) {
      orgs = [...orgs].sort((a, b) => {
        const aVal = String(a[effectiveSortBy as keyof Organization] ?? "");
        const bVal = String(b[effectiveSortBy as keyof Organization] ?? "");
        const cmp = aVal.localeCompare(bVal);
        return effectiveSortDir === "desc" ? -cmp : cmp;
      });
    }
    return orgs;
  }, [allOrgs, effectiveSearch, effectiveSortBy, effectiveSortDir]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const logo = String(formData.get("logo") ?? "").trim() || undefined;
    const metaRaw = String(formData.get("metadata") ?? "").trim();
    if (metaRaw) {
      try { JSON.parse(metaRaw); } catch {
        setCreateError("Metadata must be valid JSON");
        return false;
      }
    }
    const metadata = metaRaw || undefined;
    try {
      const org = await actions.createOrganization({ name, slug, ...(logo ? { logo } : {}), ...(metadata ? { metadata } : {}) });
      setFetchKey((k) => k + 1);
      onRowClick?.(org.id);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
      return false;
    }
  }

  function renderContent() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />;
    if (displayedOrgs.length === 0) {
      if (effectiveSearch) {
        return (
          <EmptyState
            message="No organizations match your search"
            cta="Clear search"
            onCta={() => handleSearchChange("")}
          />
        );
      }
      return (
        <EmptyState
          message="No organizations"
          cta="Create Organization"
          onCta={() => setCreateOpen(true)}
        />
      );
    }
    return (
      <DataTable<Organization>
        columns={columns}
        rows={displayedOrgs}
        getRowKey={(o) => o.id}
        onRowClick={(o) => onRowClick?.(o.id)}
        sortBy={effectiveSortBy}
        sortDirection={effectiveSortDir}
        onSort={handleSort}
      />
    );
  }

  return (
    <Stack gap="md">
      <Panel>
        <Stack gap="sm">
          <Text variant="h1">Organizations</Text>
          <Inline gap="sm">
            <SearchInput
              grow
              placeholder="Search organizations…"
              value={effectiveSearch}
              onChange={handleSearchChange}
            />
            <Button variant="primary" iconName="Plus" onClick={() => setCreateOpen(true)}>
              Create
            </Button>
          </Inline>
        </Stack>
      </Panel>

      <Panel padding={displayedOrgs.length > 0 && !showLoading && !showError ? "none" : "md"}>
        {renderContent()}
      </Panel>

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateError(undefined); setMetadataError(undefined); } }}
        title="Create Organization"
        description="Choose a stable slug. It can be used by integrations and should remain unique."
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreate}
      >
        <TextInput label="Name" name="name" required />
        <TextInput label="Slug" name="slug" required />
        <TextInput label="Logo URL" name="logo" />
        <Textarea
          label="Metadata (JSON)"
          name="metadata"
          placeholder='{"plan":"enterprise"}'
          error={metadataError}
          onChange={(v) => {
            if (!v) { setMetadataError(undefined); return; }
            try { JSON.parse(v); setMetadataError(undefined); }
            catch { setMetadataError("Must be valid JSON"); }
          }}
        />
        <Text variant="caption">Metadata is optional and must be a JSON object or valid JSON value.</Text>
      </ConfirmDialog>
    </Stack>
  );
}
