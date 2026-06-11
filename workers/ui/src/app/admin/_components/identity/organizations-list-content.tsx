"use client";

import { useState, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Avatar,
  Button,
  CodeEditor,
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
  Text,
  TextInput,
  toast,
} from "@idco/ui";
import {
  listOrganizations as listOrgsAction,
  createOrganization as createOrgAction,
  type Organization,
} from "../../_actions/organizations";
import { isConsoleScopesKey, orgsListKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listOrganizations: listOrgsAction,
  createOrganization: createOrgAction,
};

const columns: DataTableColumn<Organization>[] = [
  {
    key: "name",
    label: "Organization",
    sortable: true,
    render: (o) => (
      <Inline gap="sm" align="center">
        <Avatar initials={o.name.slice(0, 2).toUpperCase()} image={o.logo ?? undefined} alt={o.name} size="sm" />
        <Text variant="body">{o.name}</Text>
      </Inline>
    ),
  },
  { key: "slug", label: "Slug" },
  {
    key: "createdAt",
    label: "Created",
    sortable: true,
    render: (o) => new Date(o.createdAt).toLocaleDateString(),
  },
];

function isJsonObjectString(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

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
  const [metadataValue, setMetadataValue] = useState("");

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
  const { mutate: globalMutate } = useSWRConfig();
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

  const stats = useMemo(() => {
    const orgs = allOrgs ?? [];
    const recentCutoff = Date.now() - 90 * 86_400_000;
    return {
      total: orgs.length,
      withMetadata: orgs.filter((org) => Boolean(org.metadata)).length,
      withLogo: orgs.filter((org) => Boolean(org.logo)).length,
      recent: orgs.filter((org) => Date.parse(org.createdAt) >= recentCutoff).length,
    };
  }, [allOrgs]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);

  async function handleCreate(formData: FormData) {
    setCreateError(undefined);
    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const logo = String(formData.get("logo") ?? "").trim() || undefined;
    const metaRaw = String(formData.get("metadata") ?? "").trim();
    if (metaRaw && !isJsonObjectString(metaRaw)) {
      setCreateError("Metadata must be a JSON object");
      return false;
    }
    const metadata = metaRaw || undefined;
    try {
      const org = await actions.createOrganization({ name, slug, ...(logo ? { logo } : {}), ...(metadata ? { metadata } : {}) });
      await mutate();
      await globalMutate(isConsoleScopesKey);
      toast.success("Organization created", `${name} is ready. Add members to get started.`);
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
          onCta={() => { setMetadataValue(""); setCreateOpen(true); }}
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
      <PageIntro
        title="Organizations"
        description="Tenants that group members, teams, and invitations. Members sign in and pick an active organization."
        info="An organization is a workspace or tenant. Each has a unique slug that integrations and the active-organization session context rely on, so keep it stable. Open an organization to manage its members, teams, and pending invitations."
        actions={
          <Button variant="primary" iconName="Plus" onClick={() => { setMetadataValue(""); setCreateOpen(true); }}>
            Create Organization
          </Button>
        }
      />
      <StatGroup columns={4}>
        <Stat title="Organizations" value={showLoading ? "…" : stats.total} description="total tenants" tone="primary" />
        <Stat title="Metadata" value={showLoading ? "…" : stats.withMetadata} description="configured" />
        <Stat title="Logos" value={showLoading ? "…" : stats.withLogo} description="configured" />
        <Stat title="Recent" value={showLoading ? "…" : stats.recent} description="created in 90d" />
      </StatGroup>
      <Panel>
        <SearchInput
          grow
          placeholder="Search organizations…"
          value={effectiveSearch}
          onChange={handleSearchChange}
        />
      </Panel>

      <Panel padding={displayedOrgs.length > 0 && !showLoading && !showError ? "none" : "md"}>
        {renderContent()}
      </Panel>

      <ConfirmDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateError(undefined); setMetadataError(undefined); setMetadataValue(""); } }}
        title="Create Organization"
        description="Choose a stable slug. It can be used by integrations and should remain unique."
        confirmLabel="Create"
        error={createError}
        onConfirm={handleCreate}
      >
        <TextInput label="Name" name="name" required />
        <TextInput label="Slug" name="slug" required />
        <TextInput label="Logo URL" name="logo" />
        <CodeEditor
          label="Metadata (JSON)"
          name="metadata"
          value={metadataValue}
          placeholder='{"plan":"enterprise"}'
          error={metadataError}
          onChange={(v) => {
            setMetadataValue(v);
            if (!v) { setMetadataError(undefined); return; }
            setMetadataError(isJsonObjectString(v) ? undefined : "Must be a JSON object");
          }}
        />
        <Text variant="caption">Metadata is optional and must be a JSON object.</Text>
      </ConfirmDialog>
    </Stack>
  );
}
