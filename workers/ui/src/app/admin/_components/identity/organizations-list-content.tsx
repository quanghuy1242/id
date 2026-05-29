"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
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
import { orgsListKey } from "@/app/admin/_data/swr-keys";

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

  // Single server fetch; search and sort are applied client-side, so the key
  // carries no params and typing/sorting triggers zero network calls.
  const { data: allOrgs, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : orgsListKey(),
    () => actions.listOrganizations(),
  );

  const displayedOrgs = useMemo(() => {
    let orgs = allOrgs ?? [];
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
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

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
      await mutate();
      onRowClick?.(org.id);
      return true;
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
      return false;
    }
  }

  function renderContent() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
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
