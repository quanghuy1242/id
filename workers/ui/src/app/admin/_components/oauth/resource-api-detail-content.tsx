"use client";

import useSWR from "swr";
import {
  Badge,
  DescriptionList,
  ErrorAlert,
  LinkButton,
  Panel,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "@id/ui";
import {
  listResourceServers as listResourceServersAction,
  type ResourceServer,
} from "../../_actions/oauth";
import { ActivityLogContent } from "../activity-log-content";
import { resourceServersKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listResourceServers: listResourceServersAction,
};

export type ResourceApiDetailTab = "overview" | "audit";

function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "Never";
}

function tabs(id: string) {
  return [
    { id: "overview", href: `/admin/oauth/resource-apis/${id}`, label: "Overview" },
    { id: "audit", href: `/admin/oauth/resource-apis/${id}/audit`, label: "Audit" },
  ];
}

function Header({ resource, id, activeTab }: { readonly resource: ResourceServer | undefined; readonly id: string; readonly activeTab: ResourceApiDetailTab }) {
  return (
    <Stack gap="sm">
      <LinkButton href="/admin/oauth/resource-apis" variant="secondary" size="sm" iconName="ChevronLeft">Resource APIs</LinkButton>
      <Text variant="h1">{resource?.name ?? id}</Text>
      {resource ? (
        <Stack gap="xs">
          {resource.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="error">Disabled</Badge>}
          {resource.organizationId === null ? <Badge tone="accent">System</Badge> : null}
        </Stack>
      ) : null}
      <Tabs ariaLabel="Resource API detail tabs" selectedKey={activeTab} items={tabs(id)} />
    </Stack>
  );
}

function Overview({ resource }: { readonly resource: ResourceServer }) {
  return (
    <Panel>
      <DescriptionList
        columns={2}
        items={[
          { term: "Name", description: resource.name },
          { term: "Slug", description: resource.slug, mono: true },
          { term: "Audience", description: resource.audience, mono: true },
          { term: "Status", description: resource.enabled ? "Enabled" : "Disabled" },
          { term: "Organization", description: resource.organizationId ?? "System" },
          { term: "Description", description: resource.description ?? "None" },
          { term: "Created", description: `${formatDate(resource.createdAt)} by ${resource.createdBy}` },
          { term: "Updated", description: `${formatDate(resource.updatedAt)} by ${resource.updatedBy}` },
        ]}
      />
    </Panel>
  );
}

export function ResourceApiDetailContent({
  resourceServerId,
  activeTab = "overview",
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: {
  readonly resourceServerId: string;
  readonly activeTab?: ResourceApiDetailTab;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: typeof defaultActions;
}) {
  const { data, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : resourceServersKey(),
    () => actions.listResourceServers(),
  );
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const resource = data?.find((item) => item.id === resourceServerId);

  if (showLoading) return <Stack gap="md"><Header id={resourceServerId} resource={undefined} activeTab={activeTab} /><Skeleton rows={6} /></Stack>;
  if (showError) return <Stack gap="md"><Header id={resourceServerId} resource={undefined} activeTab={activeTab} /><ErrorAlert message={showError} onRetry={() => void mutate()} /></Stack>;
  if (!resource) return <Stack gap="md"><Header id={resourceServerId} resource={undefined} activeTab={activeTab} /><ErrorAlert message="Resource API not found" onRetry={() => void mutate()} /></Stack>;
  return (
    <Stack gap="md">
      <Header id={resourceServerId} resource={resource} activeTab={activeTab} />
      {activeTab === "audit" ? <ActivityLogContent targetType="resource_server" targetId={resource.id} /> : <Overview resource={resource} />}
    </Stack>
  );
}
