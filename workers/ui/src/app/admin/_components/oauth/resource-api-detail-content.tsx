"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { ActiveScope } from "@id/lib";
import {
  Badge,
  Button,
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
  Textarea,
  TextInput,
  toast,
} from "@id/ui";
import {
  deleteResourceServer as deleteResourceServerAction,
  disableResourceServer as disableResourceServerAction,
  enableResourceServer as enableResourceServerAction,
  listResourceServers as listResourceServersAction,
  updateResourceServer as updateResourceServerAction,
  type ResourceServer,
} from "../../_actions/oauth";
import { AdminDetailTitleRow } from "../admin-detail-title-row";
import { ActivityLogContent } from "../activity-log-content";
import { isM2mBindingsKey, isOauthScopesKey, resourceServersKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  listResourceServers: listResourceServersAction,
  updateResourceServer: updateResourceServerAction,
  disableResourceServer: disableResourceServerAction,
  enableResourceServer: enableResourceServerAction,
  deleteResourceServer: deleteResourceServerAction,
};

const platformScope: ActiveScope = { kind: "platform" };

export type ResourceApiDetailTab = "overview" | "audit";

function formatDate(ms: number | null | undefined): string {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "Never";
}

function tabs(routeBasePath: string) {
  return [
    { id: "overview", href: routeBasePath, label: "Overview" },
    { id: "audit", href: `${routeBasePath}/audit`, label: "Audit" },
  ];
}

function Header({
  resource,
  id,
  activeTab,
  routeBasePath,
  backHref,
  onEdit,
  onToggleEnabled,
  onDelete,
}: {
  readonly resource: ResourceServer | undefined;
  readonly id: string;
  readonly activeTab: ResourceApiDetailTab;
  readonly routeBasePath: string;
  readonly backHref: string;
  readonly onEdit?: () => void;
  readonly onToggleEnabled?: () => void;
  readonly onDelete?: () => void;
}) {
  return (
    <Stack gap="sm">
      <Inline justify="between">
        <AdminDetailTitleRow
          backHref={backHref}
          backLabel="Resource APIs"
          title={resource?.name ?? id}
        >
          {resource ? (
            <>
              {resource.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="error">Disabled</Badge>}
              {resource.organizationId === null ? <Badge tone="accent">System</Badge> : null}
            </>
          ) : null}
        </AdminDetailTitleRow>
        {resource ? (
          <Inline gap="sm" justify="end">
            <Button variant="secondary" hideOnMobile iconName="Pencil" onClick={onEdit}>
              Edit Resource API
            </Button>
            <Button variant="secondary" hideOnMobile onClick={onToggleEnabled}>
              {resource.enabled ? "Disable" : "Activate"}
            </Button>
            <Button variant="danger" hideOnMobile iconName="Trash2" onClick={onDelete}>
              Delete
            </Button>
            <MenuTrigger>
              <Button variant="ghost" size="sm" hideOnDesktop iconName="Ellipsis" ariaLabel="Actions" tooltip="More actions" />
              <Menu onAction={(key) => {
                if (key === "edit") onEdit?.();
                if (key === "toggle") onToggleEnabled?.();
                if (key === "delete") onDelete?.();
              }}>
                <MenuItem id="edit">Edit Resource API</MenuItem>
                <MenuItem id="toggle">{resource.enabled ? "Disable" : "Activate"}</MenuItem>
                <MenuItem id="delete">Delete</MenuItem>
              </Menu>
            </MenuTrigger>
          </Inline>
        ) : null}
      </Inline>
      <Tabs ariaLabel="Resource API detail tabs" selectedKey={activeTab} items={tabs(routeBasePath)} />
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
  onDeleted,
  scope,
  routeBasePath,
  backHref,
  actions = defaultActions,
}: {
  readonly resourceServerId: string;
  readonly activeTab?: ResourceApiDetailTab;
  readonly loading?: boolean;
  readonly error?: string;
  readonly onDeleted?: () => void;
  readonly scope?: ActiveScope;
  readonly routeBasePath?: string;
  readonly backHref?: string;
  readonly actions?: typeof defaultActions;
}) {
  const effectiveScope = scope ?? platformScope;
  const effectiveRouteBasePath = routeBasePath ?? `/admin/oauth/resource-apis/${resourceServerId}`;
  const effectiveBackHref = backHref ?? "/admin/oauth/resource-apis";
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableError, setDisableError] = useState<string | undefined>();
  const [enableOpen, setEnableOpen] = useState(false);
  const [enableError, setEnableError] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const { mutate: globalMutate } = useSWRConfig();

  const { data, isLoading, error, mutate } = useSWR(
    loadingOverride || errorOverride ? null : resourceServersKey(effectiveScope),
    () => actions.listResourceServers(effectiveScope),
  );
  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? (error instanceof Error ? error.message : error ? String(error) : undefined);
  const resource = data?.find((item) => item.id === resourceServerId);

  async function handleEdit(formData: FormData) {
    if (!resource) return false;
    setEditError(undefined);
    try {
      const updated = await actions.updateResourceServer(resource.id, {
        name: String(formData.get("name") ?? "").trim(),
        slug: String(formData.get("slug") ?? "").trim(),
        audience: String(formData.get("audience") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
      }, effectiveScope);
      await mutate((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item), { revalidate: false });
      setEditOpen(false);
      toast.success("Resource API updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update resource API");
      return false;
    }
  }

  async function handleDisable() {
    if (!resource) return false;
    setDisableError(undefined);
    try {
      const updated = await actions.disableResourceServer(resource.id, effectiveScope);
      await mutate((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item), { revalidate: false });
      setDisableOpen(false);
      toast.success("Resource API disabled", `New tokens for ${resource.name} will be rejected.`);
      return true;
    } catch (err: unknown) {
      setDisableError(err instanceof Error ? err.message : "Failed to disable resource API");
      return false;
    }
  }

  async function handleEnable() {
    if (!resource) return false;
    setEnableError(undefined);
    try {
      const updated = await actions.enableResourceServer(resource.id, effectiveScope);
      await mutate((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item), { revalidate: false });
      setEnableOpen(false);
      toast.success("Resource API activated", `${resource.name} can issue tokens again.`);
      return true;
    } catch (err: unknown) {
      setEnableError(err instanceof Error ? err.message : "Failed to activate resource API");
      return false;
    }
  }

  async function handleDelete() {
    if (!resource) return false;
    setDeleteError(undefined);
    try {
      await actions.deleteResourceServer(resource.id, effectiveScope);
      await mutate((current) => (current ?? []).filter((item) => item.id !== resource.id), { revalidate: false });
      await globalMutate(isOauthScopesKey, undefined, { revalidate: false });
      await globalMutate(isM2mBindingsKey, undefined, { revalidate: false });
      setDeleteOpen(false);
      toast.success("Resource API deleted", `${resource.name}, its scopes, and issued tokens were removed.`);
      onDeleted?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete resource API");
      return false;
    }
  }

  if (showLoading) return <Stack gap="md"><Header id={resourceServerId} resource={undefined} activeTab={activeTab} routeBasePath={effectiveRouteBasePath} backHref={effectiveBackHref} /><Skeleton rows={6} /></Stack>;
  if (showError) return <Stack gap="md"><Header id={resourceServerId} resource={undefined} activeTab={activeTab} routeBasePath={effectiveRouteBasePath} backHref={effectiveBackHref} /><ErrorAlert message={showError} onRetry={() => void mutate()} /></Stack>;
  if (!resource) return <Stack gap="md"><Header id={resourceServerId} resource={undefined} activeTab={activeTab} routeBasePath={effectiveRouteBasePath} backHref={effectiveBackHref} /><ErrorAlert message="Resource API not found" onRetry={() => void mutate()} /></Stack>;
  return (
    <Stack gap="md">
      <Header
        id={resourceServerId}
        resource={resource}
        activeTab={activeTab}
        routeBasePath={effectiveRouteBasePath}
        backHref={effectiveBackHref}
        onEdit={() => setEditOpen(true)}
        onToggleEnabled={() => {
          if (resource.enabled) {
            setDisableError(undefined);
            setDisableOpen(true);
          } else {
            setEnableError(undefined);
            setEnableOpen(true);
          }
        }}
        onDelete={() => { setDeleteError(undefined); setDeleteOpen(true); }}
      />
      {activeTab === "audit" ? <ActivityLogContent targetType="resource_server" targetId={resource.id} /> : <Overview resource={resource} />}
      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditError(undefined); }}
        title="Edit Resource API"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <DescriptionList
          dense
          items={[
            { term: "Created", description: `${formatDate(resource.createdAt)} by ${resource.createdBy}` },
            { term: "Updated", description: `${formatDate(resource.updatedAt)} by ${resource.updatedBy}` },
          ]}
        />
        <TextInput label="Name" name="name" defaultValue={resource.name} required />
        <TextInput label="Slug" name="slug" defaultValue={resource.slug} required />
        <TextInput label="Audience URL" name="audience" defaultValue={resource.audience} required />
        <Textarea label="Description" name="description" defaultValue={resource.description ?? ""} />
      </ConfirmDialog>
      <ConfirmDialog
        open={disableOpen}
        onOpenChange={(o) => { setDisableOpen(o); if (!o) setDisableError(undefined); }}
        title="Disable API"
        description={`Disable ${resource.name}? New tokens with this audience will be rejected until the API is activated again.`}
        confirmLabel="Disable"
        variant="danger"
        error={disableError}
        onConfirm={handleDisable}
      />
      <ConfirmDialog
        open={enableOpen}
        onOpenChange={(o) => { setEnableOpen(o); if (!o) setEnableError(undefined); }}
        title="Activate API"
        description={`Activate ${resource.name}? Resource servers can request tokens for this audience again.`}
        confirmLabel="Activate"
        error={enableError}
        onConfirm={handleEnable}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteError(undefined); }}
        title="Delete Resource API"
        description={`Delete ${resource.name}? This removes the resource server and ALL associated OAuth scopes, and invalidates every token issued for this audience.`}
        confirmLabel="Delete"
        variant="danger"
        error={deleteError}
        onConfirm={handleDelete}
      />
    </Stack>
  );
}
