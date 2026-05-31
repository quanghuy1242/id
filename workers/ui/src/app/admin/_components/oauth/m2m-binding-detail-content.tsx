"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ActiveScope } from "@id/lib";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DescriptionList,
  ErrorAlert,
  Inline,
  Menu,
  MenuItem,
  MenuTrigger,
  Panel,
  Skeleton,
  Stack,
  Tabs,
  Text,
  toast,
} from "@id/ui";
import {
  deleteBinding as deleteBindingAction,
  listBindings as listBindingsAction,
  listClients as listClientsAction,
  listResourceServers as listResourceServersAction,
  listScopes as listScopesAction,
  updateBinding as updateBindingAction,
  type ClientResourceScope,
  type OAuthClient,
  type ResourceServer,
} from "../../_actions/oauth";
import { AdminDetailTitleRow } from "../admin-detail-title-row";
import { ActivityLogContent } from "../activity-log-content";
import { m2mBindingsKey, oauthClientsKey, oauthScopesKey, resourceServersKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listBindings: listBindingsAction,
  listClients: listClientsAction,
  listResourceServers: listResourceServersAction,
  listScopes: listScopesAction,
  updateBinding: updateBindingAction,
  deleteBinding: deleteBindingAction,
};

const platformScope: ActiveScope = { kind: "platform" };

export type M2mBindingDetailTab = "overview" | "audit";

function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "Never";
}

function toggleScope(list: string[], scope: string, on: boolean): string[] {
  return on ? [...new Set([...list, scope])] : list.filter((s) => s !== scope);
}

function tabs(routeBasePath: string) {
  return [
    { id: "overview", href: routeBasePath, label: "Overview" },
    { id: "audit", href: `${routeBasePath}/audit`, label: "Audit" },
  ];
}

function Header({
  binding,
  activeTab,
  routeBasePath,
  backHref,
  onEdit,
  onDelete,
}: {
  readonly binding: ClientResourceScope | undefined;
  readonly activeTab: M2mBindingDetailTab;
  readonly routeBasePath: string;
  readonly backHref: string;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
}) {
  return (
    <Stack gap="sm">
      <Inline justify="between">
        <AdminDetailTitleRow
          backHref={backHref}
          backLabel="M2M Bindings"
          title="Resource Access Binding"
        >
          {binding ? (binding.enabled ? <Badge tone="success">Active</Badge> : <Badge tone="error">Disabled</Badge>) : null}
        </AdminDetailTitleRow>
        {binding ? (
          <Inline gap="sm" justify="end">
            <Button variant="secondary" hideOnMobile iconName="Pencil" onClick={onEdit}>
              Edit Binding
            </Button>
            <Button variant="danger" hideOnMobile iconName="Trash2" onClick={onDelete}>
              Delete
            </Button>
            <MenuTrigger>
              <Button variant="ghost" size="sm" hideOnDesktop iconName="Ellipsis" ariaLabel="Actions" tooltip="More actions" />
              <Menu onAction={(key) => {
                if (key === "edit") onEdit?.();
                if (key === "delete") onDelete?.();
              }}>
                <MenuItem id="edit">Edit Binding</MenuItem>
                <MenuItem id="delete">Delete</MenuItem>
              </Menu>
            </MenuTrigger>
          </Inline>
        ) : null}
      </Inline>
      <Tabs ariaLabel="M2M binding detail tabs" selectedKey={activeTab} items={tabs(routeBasePath)} />
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
  onDeleted,
  scope,
  routeBasePath,
  backHref,
  actions = defaultActions,
}: {
  readonly bindingId: string;
  readonly activeTab?: M2mBindingDetailTab;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onDeleted?: () => void;
  readonly scope?: ActiveScope;
  readonly routeBasePath?: string;
  readonly backHref?: string;
  readonly actions?: typeof defaultActions;
}) {
  const effectiveScope = scope ?? platformScope;
  const effectiveRouteBasePath = routeBasePath ?? `/admin/oauth/m2m-bindings/${bindingId}`;
  const effectiveBackHref = backHref ?? "/admin/oauth/m2m-bindings";
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [editEnabled, setEditEnabled] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const skip = loadingOverride || errorOverride;
  const { data: bindings, isLoading, error, mutate } = useSWR(skip ? null : m2mBindingsKey(effectiveScope), () => actions.listBindings(effectiveScope));
  const { data: clients } = useSWR(skip ? null : oauthClientsKey(effectiveScope), () => actions.listClients(effectiveScope));
  const { data: resources } = useSWR(skip ? null : resourceServersKey(effectiveScope), () => actions.listResourceServers(effectiveScope));
  const { data: scopes } = useSWR(skip ? null : oauthScopesKey(effectiveScope), () => actions.listScopes(effectiveScope));
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const binding = bindings?.find((item) => item.id === bindingId);
  const client = binding ? clients?.find((item) => item.client_id === binding.clientId) : undefined;
  const resource = binding ? resources?.find((item) => item.id === binding.resourceServerId) : undefined;
  const editScopeOptions = binding
    ? (scopes ?? []).filter((scopeRow) => scopeRow.resourceServerId === binding.resourceServerId).map((scopeRow) => scopeRow.scope)
    : [];

  function openEditDialog() {
    if (!binding) return;
    setEditError(undefined);
    setEditScopes([...binding.allowedScopes]);
    setEditEnabled(binding.enabled);
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!binding) return false;
    setEditError(undefined);
    if (editScopes.length === 0) {
      setEditError("Select at least one scope");
      return false;
    }
    try {
      const updated = await actions.updateBinding(binding.id, { allowedScopes: editScopes, enabled: editEnabled }, effectiveScope);
      await mutate((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item), { revalidate: false });
      setEditOpen(false);
      toast.success("Binding updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update binding");
      return false;
    }
  }

  async function handleDelete() {
    if (!binding) return false;
    setDeleteError(undefined);
    try {
      await actions.deleteBinding(binding.id, effectiveScope);
      await mutate((current) => (current ?? []).filter((item) => item.id !== binding.id), { revalidate: false });
      setDeleteOpen(false);
      toast.success("Binding deleted", "The client lost access to these scopes.");
      onDeleted?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete binding");
      return false;
    }
  }

  if (showLoading) return <Stack gap="md"><Header binding={undefined} activeTab={activeTab} routeBasePath={effectiveRouteBasePath} backHref={effectiveBackHref} /><Skeleton rows={6} /></Stack>;
  if (showError) return <Stack gap="md"><Header binding={undefined} activeTab={activeTab} routeBasePath={effectiveRouteBasePath} backHref={effectiveBackHref} /><ErrorAlert message={showError} onRetry={() => void mutate()} /></Stack>;
  if (!binding) return <Stack gap="md"><Header binding={undefined} activeTab={activeTab} routeBasePath={effectiveRouteBasePath} backHref={effectiveBackHref} /><ErrorAlert message="M2M binding not found" onRetry={() => void mutate()} /></Stack>;
  return (
    <Stack gap="md">
      <Header
        binding={binding}
        activeTab={activeTab}
        routeBasePath={effectiveRouteBasePath}
        backHref={effectiveBackHref}
        onEdit={openEditDialog}
        onDelete={() => { setDeleteError(undefined); setDeleteOpen(true); }}
      />
      {activeTab === "audit" ? <ActivityLogContent targetType="client_resource_scope" targetId={binding.id} /> : <Overview binding={binding} client={client} resource={resource} />}
      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditError(undefined); }}
        title="Edit M2M Binding"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <Stack gap="xs">
          <DescriptionList
            dense
            items={[
              { term: "Created", description: `${formatDate(binding.createdAt)} by ${binding.createdBy}` },
              { term: "Updated", description: `${formatDate(binding.updatedAt)} by ${binding.updatedBy}` },
              { term: "Client", description: client?.client_name ?? binding.clientId },
              { term: "Resource API", description: resource?.name ?? binding.resourceServerId },
            ]}
          />
          <Text variant="caption">Allowed Scopes</Text>
          {editScopeOptions.length === 0
            ? <Text variant="caption">No scopes defined for this resource API.</Text>
            : editScopeOptions.map((scopeName) => (
              <Checkbox key={scopeName} label={scopeName} name={`scope:${scopeName}`} selected={editScopes.includes(scopeName)} onChange={(on) => setEditScopes((current) => toggleScope(current, scopeName, on))} />
            ))}
          <Checkbox label="Enabled" name="enabled" selected={editEnabled} onChange={setEditEnabled} />
        </Stack>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteError(undefined); }}
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
