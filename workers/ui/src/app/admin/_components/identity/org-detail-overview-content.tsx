"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  CodeEditor,
  ConfirmDialog,
  DescriptionList,
  Inline,
  JsonViewer,
  Panel,
  Skeleton,
  Stack,
  TextInput,
  toast,
} from "@id/ui";
import {
  updateOrganization as updateOrganizationAction,
} from "../../_actions/organizations";
import { useOrgDetail } from "./org-detail-context";

const defaultActions = {
  updateOrganization: updateOrganizationAction,
};

type OrgDetailOverviewContentProps = {
  actions?: typeof defaultActions;
};

export function OrgDetailOverviewContent({
  actions = defaultActions,
}: OrgDetailOverviewContentProps) {
  const { orgId, org, setOrg, isLoading, error } = useOrgDetail();

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [editMetaError, setEditMetaError] = useState<string | undefined>();
  const [editMetadata, setEditMetadata] = useState("");

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
    if (metadata) {
      try {
        JSON.parse(metadata);
      } catch {
        setEditError("Metadata must be valid JSON");
        return false;
      }
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

  if (isLoading) return <Skeleton rows={4} height="md" />;
  if (error) return null;
  if (!org) return null;

  return (
    <Stack gap="md">
      <Panel>
        <Stack gap="md">
          <DescriptionList
            columns={2}
            items={[
              { term: "Name", description: org.name },
              { term: "Slug", description: <Badge tone="neutral">{org.slug}</Badge> },
              { term: "Logo URL", description: org.logo || "No logo configured", mono: Boolean(org.logo) },
              { term: "Created", description: new Date(org.createdAt).toLocaleDateString() },
            ]}
          />
          {org.metadata ? (
            <JsonViewer label="Metadata" value={org.metadata} maxHeight="sm" />
          ) : null}
          <Inline justify="end">
            <Button variant="secondary" onClick={openEditDialog}>Edit Organization</Button>
          </Inline>
        </Stack>
      </Panel>

      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) { setEditError(undefined); setEditMetaError(undefined); setEditMetadata(""); } }}
        title="Edit Organization"
        description="Changing the slug can affect organization links and integrations that store it. Metadata must be valid JSON."
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={org.name} required />
        <TextInput label="Slug" name="slug" defaultValue={org.slug} required />
        <TextInput label="Logo URL" name="logo" defaultValue={org.logo ?? ""} />
        <CodeEditor
          label="Metadata (JSON)"
          name="metadata"
          value={editMetadata}
          placeholder='{"plan":"enterprise"}'
          error={editMetaError}
          onChange={(v) => {
            setEditMetadata(v);
            if (!v) { setEditMetaError(undefined); return; }
            try { JSON.parse(v); setEditMetaError(undefined); }
            catch { setEditMetaError("Must be valid JSON"); }
          }}
        />
      </ConfirmDialog>
    </Stack>
  );
}
