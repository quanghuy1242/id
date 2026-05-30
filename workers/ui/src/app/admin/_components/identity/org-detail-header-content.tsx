"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import {
  Badge,
  Button,
  CodeEditor,
  ConfirmDialog,
  DescriptionList,
  ErrorAlert,
  Inline,
  Menu,
  MenuItem,
  MenuTrigger,
  Skeleton,
  Tabs,
  TextInput,
  toast,
} from "@id/ui";
import {
  updateOrganization as updateOrganizationAction,
  deleteOrganization as deleteOrganizationAction,
} from "../../_actions/organizations";
import { AdminDetailTitleRow } from "../admin-detail-title-row";
import { useOrgDetail } from "./org-detail-context";
import { isOrgsListKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  updateOrganization: updateOrganizationAction,
  deleteOrganization: deleteOrganizationAction,
};

type OrgDetailHeaderContentProps = {
  activeTab?: "overview" | "members" | "teams" | "invitations" | "audit";
  onNavigateToOrgs?: () => void;
  actions?: typeof defaultActions;
};

function orgTabs(orgId: string) {
  return [
    { id: "overview", href: `/admin/identity/organizations/${orgId}`, label: "Overview" },
    { id: "members", href: `/admin/identity/organizations/${orgId}/members`, label: "Members" },
    { id: "teams", href: `/admin/identity/organizations/${orgId}/teams`, label: "Teams" },
    { id: "invitations", href: `/admin/identity/organizations/${orgId}/invitations`, label: "Invitations" },
    { id: "audit", href: `/admin/identity/organizations/${orgId}/audit`, label: "Audit" },
  ];
}

function isJsonObjectString(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function OrgDetailHeaderContent({
  activeTab = "overview",
  onNavigateToOrgs,
  actions = defaultActions,
}: OrgDetailHeaderContentProps) {
  const { orgId, org, setOrg, isLoading, error, refetch } = useOrgDetail();
  const { mutate: globalMutate } = useSWRConfig();

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [editMetaError, setEditMetaError] = useState<string | undefined>();
  const [editMetadata, setEditMetadata] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [typedSlug, setTypedSlug] = useState("");

  function openEditDialog() {
    setEditMetadata(org?.metadata ?? "");
    setEditOpen(true);
  }

  async function handleEdit(formData: FormData) {
    setEditError(undefined);
    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const logo = String(formData.get("logo") ?? "").trim();
    const metadata = String(formData.get("metadata") ?? "").trim();
    if (metadata && !isJsonObjectString(metadata)) {
      setEditError("Metadata must be a JSON object");
      return false;
    }
    try {
      const updated = await actions.updateOrganization(orgId, {
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
        logo: logo || "",
        metadata,
      });
      setOrg(updated);
      toast.success("Organization updated");
      return true;
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update organization");
      return false;
    }
  }

  async function handleDelete() {
    setDeleteError(undefined);
    try {
      await actions.deleteOrganization(orgId);
      await globalMutate(isOrgsListKey, undefined, { revalidate: false });
      toast.success("Organization deleted", `${org?.name ?? "The organization"} and its memberships were removed.`);
      onNavigateToOrgs?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete organization");
      return false;
    }
  }

  if (isLoading) {
    return <Skeleton rows={2} height="md" />;
  }

  return (
    <>
      <Inline justify="between">
        <AdminDetailTitleRow
          backHref="/admin/identity/organizations"
          backLabel="Organizations"
          title={org?.name ?? "Organization unavailable"}
        >
          {org ? <Badge tone="neutral">#{org.slug}</Badge> : null}
        </AdminDetailTitleRow>
        {!error && (
          <Inline gap="sm" justify="end">
            <Button variant="secondary" hideOnMobile disabled={!org} onClick={openEditDialog}>
              Edit Organization
            </Button>
            <Button variant="danger" hideOnMobile disabled={!org} onClick={() => { setTypedSlug(""); setDeleteOpen(true); }}>
              Delete
            </Button>
            <MenuTrigger>
              <Button variant="ghost" size="sm" hideOnDesktop iconName="Ellipsis" ariaLabel="Actions" tooltip="More actions" />
              <Menu onAction={(key) => {
                if (key === "edit") openEditDialog();
                if (key === "delete") { setTypedSlug(""); setDeleteOpen(true); }
              }}>
                <MenuItem id="edit" isDisabled={!org}>Edit Organization</MenuItem>
                <MenuItem id="delete" isDisabled={!org}>Delete</MenuItem>
              </Menu>
            </MenuTrigger>
          </Inline>
        )}
      </Inline>

      {error && !org && <ErrorAlert message={error} onRetry={refetch} />}

      <Tabs
        ariaLabel="Organization detail tabs"
        selectedKey={activeTab}
        items={orgTabs(orgId)}
      />

      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) { setEditError(undefined); setEditMetaError(undefined); setEditMetadata(""); } }}
        title="Edit Organization"
        description="Changing the slug can affect organization links and integrations that store it. Metadata must be a JSON object."
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={org?.name ?? ""} required />
        <TextInput label="Slug" name="slug" defaultValue={org?.slug ?? ""} required />
        <TextInput label="Logo URL" name="logo" defaultValue={org?.logo ?? ""} />
        <CodeEditor
          label="Metadata (JSON)"
          name="metadata"
          value={editMetadata}
          placeholder='{"plan":"enterprise"}'
          error={editMetaError}
          onChange={(v) => {
            setEditMetadata(v);
            if (!v) { setEditMetaError(undefined); return; }
            setEditMetaError(isJsonObjectString(v) ? undefined : "Must be a JSON object");
          }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) { setDeleteError(undefined); setTypedSlug(""); } }}
        title={`Delete ${org?.name ?? "Organization"}`}
        description="This removes the organization, its memberships, teams, and pending invitations. This cannot be undone."
        confirmLabel="Delete Org"
        variant="danger"
        confirmDisabled={typedSlug !== (org?.slug ?? "")}
        error={deleteError}
        onConfirm={handleDelete}
      >
        {org ? (
          <DescriptionList
            columns={1}
            dense
            items={[
              { term: "Organization ID", description: org.id, mono: true },
              { term: "Slug", description: org.slug, mono: true },
              { term: "Name", description: org.name },
            ]}
          />
        ) : null}
        <TextInput
          label={`Type "${org?.slug ?? ""}" to confirm`}
          name="confirmSlug"
          defaultValue=""
          onChange={setTypedSlug}
        />
      </ConfirmDialog>
    </>
  );
}
