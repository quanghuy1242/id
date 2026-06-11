"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Badge,
  DataTable,
  type DataTableColumn,
  DescriptionList,
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
} from "@idco/ui";
import type { ActiveScope } from "@idco/lib";
import {
  archiveRegistrationPolicy as archiveRegistrationPolicyAction,
  enableRegistrationPolicy as enableRegistrationPolicyAction,
  listRegistrationPolicies as listRegistrationPoliciesAction,
  listRegistrationPolicyIntents as listRegistrationPolicyIntentsAction,
  pauseRegistrationPolicy as pauseRegistrationPolicyAction,
  type RegistrationIntent,
  type RegistrationPolicy,
  type RegistrationPolicyStatus,
} from "../../_actions/registration-policies";
import { registrationPoliciesKey, registrationPolicyIntentsKey } from "@/app/admin/_data/swr-keys";

const platformScope: ActiveScope = { kind: "platform" };
const statusOptions = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "enabled", label: "Enabled" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

const defaultActions = {
  listRegistrationPolicies: listRegistrationPoliciesAction,
  enableRegistrationPolicy: enableRegistrationPolicyAction,
  pauseRegistrationPolicy: pauseRegistrationPolicyAction,
  archiveRegistrationPolicy: archiveRegistrationPolicyAction,
  listRegistrationPolicyIntents: listRegistrationPolicyIntentsAction,
};

type RegistrationPoliciesActions = typeof defaultActions;

type RegistrationPoliciesContentProps = {
  readonly scope?: ActiveScope;
  readonly search?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly status?: string;
  readonly onStatusChange?: (value: string) => void;
  readonly sortBy?: string;
  readonly sortDirection?: "asc" | "desc";
  readonly onSort?: (key: string, dir: "asc" | "desc") => void;
  readonly selectedId?: string;
  readonly onSelectedIdChange?: (id: string) => void;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: RegistrationPoliciesActions;
};

function statusTone(status: string): "neutral" | "success" | "warning" | "error" | "info" {
  if (status === "enabled" || status === "completed") return "success";
  if (status === "paused") return "warning";
  if (status === "failed" || status === "continuation_failed") return "error";
  if (status === "started" || status === "submitted") return "info";
  return "neutral";
}

function formatDate(value: number | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: number | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function quotaLabel(policy: RegistrationPolicy): string {
  const limit = policy.quota.quotaLimit ?? policy.quotaLimit;
  if (!limit) return "—";
  return `${policy.quota.quotaUsed}/${limit} used · ${policy.quota.quotaReserved} reserved`;
}

function matchesPolicy(policy: RegistrationPolicy, search: string, status: string): boolean {
  if (status !== "all" && policy.status !== status) return false;
  if (!search) return true;
  const q = search.toLowerCase();
  return [
    policy.name,
    policy.slug,
    policy.mode,
    policy.clientId ?? "",
    policy.organizationId ?? "",
    policy.resourceServerId ?? "",
  ].some((value) => value.toLowerCase().includes(q));
}

function sortPolicies(policies: readonly RegistrationPolicy[], sortBy: string, sortDirection: "asc" | "desc"): RegistrationPolicy[] {
  return [...policies].sort((a, b) => {
    const aValue = String(a[sortBy as keyof RegistrationPolicy] ?? "");
    const bValue = String(b[sortBy as keyof RegistrationPolicy] ?? "");
    const result = aValue.localeCompare(bValue, undefined, { numeric: true });
    return sortDirection === "desc" ? -result : result;
  });
}

const intentColumns: DataTableColumn<RegistrationIntent>[] = [
  { key: "email", label: "Email", render: (intent) => intent.email ?? "—" },
  { key: "status", label: "Status", render: (intent) => <Badge tone={statusTone(intent.status)}>{intent.status}</Badge> },
  { key: "createdAt", label: "Created", render: (intent) => formatDateTime(intent.createdAt) },
  { key: "completedAt", label: "Completed", render: (intent) => formatDateTime(intent.completedAt) },
  { key: "failureReason", label: "Failure", render: (intent) => intent.failureReason ?? "—" },
];

export function RegistrationPoliciesContent({
  scope = platformScope,
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
  ...props
}: RegistrationPoliciesContentProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalStatus, setInternalStatus] = useState("all");
  const [internalSortBy, setInternalSortBy] = useState("updatedAt");
  const [internalSortDirection, setInternalSortDirection] = useState<"asc" | "desc">("desc");
  const [internalSelectedId, setInternalSelectedId] = useState<string | undefined>();

  const search = props.search ?? internalSearch;
  const status = props.status ?? internalStatus;
  const sortBy = props.sortBy ?? internalSortBy;
  const sortDirection = props.sortDirection ?? internalSortDirection;
  const selectedId = props.selectedId ?? internalSelectedId;

  const setSearch = props.onSearchChange ?? setInternalSearch;
  const setStatus = props.onStatusChange ?? setInternalStatus;
  const setSelectedId = props.onSelectedIdChange ?? setInternalSelectedId;
  const setSort = props.onSort ?? ((key: string, dir: "asc" | "desc") => {
    setInternalSortBy(key);
    setInternalSortDirection(dir);
  });

  const { data, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : registrationPoliciesKey(scope),
    () => actions.listRegistrationPolicies(scope),
  );
  const selectedPolicy = useMemo(
    () => (data ?? []).find((policy) => policy.id === selectedId) ?? null,
    [data, selectedId],
  );
  const { data: intents, isLoading: intentsLoading, error: intentsError, mutate: mutateIntents } = useSWR(
    selectedPolicy && !loadingOverride && !errorOverride ? registrationPolicyIntentsKey(selectedPolicy.id) : null,
    () => actions.listRegistrationPolicyIntents(selectedPolicy!.id),
  );

  const filteredPolicies = useMemo(
    () => sortPolicies((data ?? []).filter((policy) => matchesPolicy(policy, search, status)), sortBy, sortDirection),
    [data, search, sortBy, sortDirection, status],
  );

  const stats = useMemo(() => {
    const policies = data ?? [];
    return {
      total: policies.length,
      enabled: policies.filter((policy) => policy.status === "enabled").length,
      reserved: policies.reduce((sum, policy) => sum + policy.quota.quotaReserved, 0),
      used: policies.reduce((sum, policy) => sum + policy.quota.quotaUsed, 0),
    };
  }, [data]);

  async function updateStatus(policy: RegistrationPolicy, nextStatus: RegistrationPolicyStatus) {
    const update = nextStatus === "enabled"
      ? actions.enableRegistrationPolicy
      : nextStatus === "paused"
        ? actions.pauseRegistrationPolicy
        : actions.archiveRegistrationPolicy;
    await update(policy.id);
    await mutate();
    await mutateIntents();
    toast.success("Registration policy updated", `${policy.name} is now ${nextStatus}.`);
  }

  const policyColumns: DataTableColumn<RegistrationPolicy>[] = [
    { key: "name", label: "Name", sortable: true, render: (policy) => <Text variant="body">{policy.name}</Text> },
    { key: "status", label: "Status", sortable: true, render: (policy) => <Badge tone={statusTone(policy.status)}>{policy.status}</Badge> },
    { key: "mode", label: "Mode", sortable: true },
    { key: "clientId", label: "Client", render: (policy) => policy.clientId ?? "—" },
    { key: "organizationId", label: "Organization", render: (policy) => policy.organizationId ?? "—" },
    { key: "quotaLimit", label: "Quota", render: quotaLabel },
    { key: "updatedAt", label: "Updated", sortable: true, render: (policy) => formatDate(policy.updatedAt) },
    {
      key: "actions",
      label: "Actions",
      actions: (policy) => [
        { id: "enable", label: "Enable", iconName: "Check", disabled: policy.status === "enabled", onAction: () => void updateStatus(policy, "enabled") },
        { id: "pause", label: "Pause", iconName: "X", disabled: policy.status === "paused", onAction: () => void updateStatus(policy, "paused") },
        { id: "archive", label: "Archive", variant: "danger", iconName: "FileText", disabled: policy.status === "archived", onAction: () => void updateStatus(policy, "archived") },
      ],
    },
  ];

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const showIntentError = intentsError instanceof Error ? intentsError.message : intentsError ? String(intentsError) : undefined;

  function renderPolicies() {
    if (showLoading) return <Skeleton rows={5} />;
    if (showError) return <ErrorAlert message={showError} onRetry={() => void mutate()} />;
    if (filteredPolicies.length === 0) {
      return (
        <EmptyState
          message={(data ?? []).length === 0 ? "No registration policies" : "No registration policies match"}
          cta={(data ?? []).length === 0 ? undefined : "Clear filters"}
          onCta={(data ?? []).length === 0 ? undefined : () => { setSearch(""); setStatus("all"); }}
        />
      );
    }
    return (
      <DataTable
        columns={policyColumns}
        rows={filteredPolicies}
        getRowKey={(policy) => policy.id}
        onRowClick={(policy) => setSelectedId(policy.id)}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={setSort}
      />
    );
  }

  return (
    <Stack gap="md">
      <PageIntro
        title="Registration Policies"
        description="Control which applications and invitations may create accounts through hosted registration."
        info="Clients request registration with OIDC prompt=create, but these server-side policies decide whether account creation is allowed, which scopes may continue, and which organization defaults apply."
      />
      <StatGroup columns={4}>
        <Stat title="Policies" value={showLoading ? "…" : stats.total} description="visible" tone="primary" />
        <Stat title="Enabled" value={showLoading ? "…" : stats.enabled} description="admitting signup" tone="success" />
        <Stat title="Reserved" value={showLoading ? "…" : stats.reserved} description="active slots" tone="info" />
        <Stat title="Used" value={showLoading ? "…" : stats.used} description="consumed slots" />
      </StatGroup>
      <Panel>
        <Inline gap="sm" wrap>
          <SearchInput grow placeholder="Search policies…" value={search} onChange={setSearch} />
          <FilterDropdown label="Status" options={statusOptions} value={status} onChange={setStatus} />
        </Inline>
      </Panel>
      <Panel padding={filteredPolicies.length > 0 && !showLoading && !showError ? "none" : "md"}>
        {renderPolicies()}
      </Panel>
      {selectedPolicy ? (
        <Panel>
          <Stack gap="md">
            <Inline justify="between" align="center" wrap>
              <Stack gap="xs">
                <Text variant="h2">{selectedPolicy.name}</Text>
                <Inline gap="xs" wrap>
                  <Badge tone={statusTone(selectedPolicy.status)}>{selectedPolicy.status}</Badge>
                  <Badge tone="info">{selectedPolicy.mode}</Badge>
                </Inline>
              </Stack>
            </Inline>
            <DescriptionList
              columns={3}
              dense
              items={[
                { term: "Slug", description: selectedPolicy.slug, mono: true },
                { term: "Client", description: selectedPolicy.clientId ?? "—", mono: true },
                { term: "Organization", description: selectedPolicy.organizationId ?? "—", mono: true },
                { term: "Resource", description: selectedPolicy.resourceServerId ?? "—", mono: true },
                { term: "Domains", description: selectedPolicy.emailDomains.join(", ") || "Any" },
                { term: "Scopes", description: selectedPolicy.allowedScopes.join(" ") || "—", mono: true },
                { term: "Quota", description: quotaLabel(selectedPolicy) },
                { term: "Starts", description: formatDateTime(selectedPolicy.startsAt) },
                { term: "Expires", description: formatDateTime(selectedPolicy.expiresAt) },
              ]}
            />
            <Text variant="h3">Recent Intents</Text>
            {intentsLoading ? <Skeleton rows={4} /> : showIntentError ? (
              <ErrorAlert message={showIntentError} onRetry={() => void mutateIntents()} />
            ) : (intents ?? []).length === 0 ? (
              <EmptyState message="No registration intents" />
            ) : (
              <DataTable
                columns={intentColumns}
                rows={intents ?? []}
                getRowKey={(intent) => intent.id}
                sortBy="createdAt"
                sortDirection="desc"
              />
            )}
          </Stack>
        </Panel>
      ) : null}
    </Stack>
  );
}
