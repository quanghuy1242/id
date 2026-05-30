"use client";

import useSWR from "swr";
import {
  Badge,
  DescriptionList,
  ErrorAlert,
  Inline,
  LinkButton,
  Panel,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "@id/ui";
import {
  listBindings as listBindingsAction,
  listClients as listClientsAction,
  listResourceServers as listResourceServersAction,
  type ClientResourceScope,
  type OAuthClient,
  type ResourceServer,
} from "../../_actions/oauth";
import { ActivityLogContent } from "../activity-log-content";
import { m2mBindingsKey, oauthClientsKey, resourceServersKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listBindings: listBindingsAction,
  listClients: listClientsAction,
  listResourceServers: listResourceServersAction,
};

export type M2mBindingDetailTab = "overview" | "audit";

function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "Never";
}

function tabs(id: string) {
  return [
    { id: "overview", href: `/admin/oauth/m2m-bindings/${id}`, label: "Overview" },
    { id: "audit", href: `/admin/oauth/m2m-bindings/${id}/audit`, label: "Audit" },
  ];
}

function Header({ binding, title, id, activeTab }: { readonly binding: ClientResourceScope | undefined; readonly title: string; readonly id: string; readonly activeTab: M2mBindingDetailTab }) {
  return (
    <Stack gap="sm">
      <LinkButton href="/admin/oauth/m2m-bindings" variant="secondary" size="sm" iconName="ChevronLeft">M2M Bindings</LinkButton>
      <Inline gap="sm">
        <Text variant="h1">{title}</Text>
        {binding ? (binding.enabled ? <Badge tone="success">Active</Badge> : <Badge tone="error">Disabled</Badge>) : null}
      </Inline>
      <Tabs ariaLabel="M2M binding detail tabs" selectedKey={activeTab} items={tabs(id)} />
    </Stack>
  );
}

function Overview({
  binding,
  client,
  resource,
}: {
  readonly binding: ClientResourceScope;
  readonly client: OAuthClient | undefined;
  readonly resource: ResourceServer | undefined;
}) {
  return (
    <Panel>
      <Stack gap="md">
        <DescriptionList
          columns={2}
          items={[
            { term: "Client", description: client?.client_name ?? binding.clientId },
            { term: "Client ID", description: binding.clientId, mono: true },
            { term: "Resource API", description: resource?.name ?? binding.resourceServerId },
            { term: "Resource ID", description: binding.resourceServerId, mono: true },
            { term: "Status", description: binding.enabled ? "Active" : "Disabled" },
            { term: "Created", description: `${formatDate(binding.createdAt)} by ${binding.createdBy}` },
            { term: "Updated", description: `${formatDate(binding.updatedAt)} by ${binding.updatedBy}` },
          ]}
        />
        <Inline gap="xs" wrap>
          {binding.allowedScopes.map((scope) => <Badge key={scope} tone="primary" size="sm">{scope}</Badge>)}
        </Inline>
      </Stack>
    </Panel>
  );
}

export function M2mBindingDetailContent({
  bindingId,
  activeTab = "overview",
  loading: loadingOverride,
  error: errorOverride,
  actions = defaultActions,
}: {
  readonly bindingId: string;
  readonly activeTab?: M2mBindingDetailTab;
  readonly loading?: boolean;
  readonly error?: string;
  readonly actions?: typeof defaultActions;
}) {
  const skip = loadingOverride || errorOverride;
  const { data: bindings, isLoading, error, mutate } = useSWR(skip ? null : m2mBindingsKey(), () => actions.listBindings());
  const { data: clients } = useSWR(skip ? null : oauthClientsKey(), () => actions.listClients());
  const { data: resources } = useSWR(skip ? null : resourceServersKey(), () => actions.listResourceServers());
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const binding = bindings?.find((item) => item.id === bindingId);
  const client = binding ? clients?.find((item) => item.client_id === binding.clientId) : undefined;
  const resource = binding ? resources?.find((item) => item.id === binding.resourceServerId) : undefined;
  const title = binding ? `${client?.client_name ?? binding.clientId} -> ${resource?.name ?? binding.resourceServerId}` : bindingId;

  if (showLoading) return <Stack gap="md"><Header id={bindingId} binding={undefined} title={title} activeTab={activeTab} /><Skeleton rows={6} /></Stack>;
  if (showError) return <Stack gap="md"><Header id={bindingId} binding={undefined} title={title} activeTab={activeTab} /><ErrorAlert message={showError} onRetry={() => void mutate()} /></Stack>;
  if (!binding) return <Stack gap="md"><Header id={bindingId} binding={undefined} title={title} activeTab={activeTab} /><ErrorAlert message="M2M binding not found" onRetry={() => void mutate()} /></Stack>;
  return (
    <Stack gap="md">
      <Header id={bindingId} binding={binding} title={title} activeTab={activeTab} />
      {activeTab === "audit" ? <ActivityLogContent targetType="client_resource_scope" targetId={binding.id} /> : <Overview binding={binding} client={client} resource={resource} />}
    </Stack>
  );
}
