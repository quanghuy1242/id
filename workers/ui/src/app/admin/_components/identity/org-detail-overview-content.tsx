"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Inline,
  Panel,
  Skeleton,
  Stack,
  Text,
  Textarea,
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

function formatMetadata(metadata: string | null): string {
  if (!metadata) return "No metadata";
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
}

export function OrgDetailOverviewContent({
  actions = defaultActions,
}: OrgDetailOverviewContentProps) {
  const { orgId, org, setOrg, isLoading, error } = useOrgDetail();

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [editMetaError, setEditMetaError] = useState<string | undefined>();

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
          <Stack gap="xs">
            <Inline gap="sm">
              <Text variant="caption">Name</Text>
              <Text variant="body">{org.name}</Text>
            </Inline>
            <Inline gap="sm">
              <Text variant="caption">Slug</Text>
              <Badge tone="neutral">{org.slug}</Badge>
            </Inline>
            <Inline gap="sm">
              <Text variant="caption">Logo URL</Text>
              <Text variant="body">{org.logo || "No logo configured"}</Text>
            </Inline>
            <Inline gap="sm">
              <Text variant="caption">Created</Text>
              <Text variant="body">{new Date(org.createdAt).toLocaleDateString()}</Text>
            </Inline>
          </Stack>
          <Panel tone="muted" padding="sm">
            <Stack gap="xs">
              <Text variant="caption">Metadata</Text>
              <Text variant="body" as="pre">{formatMetadata(org.metadata)}</Text>
            </Stack>
          </Panel>
          <Inline justify="end">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit Organization</Button>
          </Inline>
        </Stack>
      </Panel>

      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) { setEditError(undefined); setEditMetaError(undefined); } }}
        title="Edit Organization"
        description="Changing the slug can affect organization links and integrations that store it. Metadata must be valid JSON."
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={org.name} required />
        <TextInput label="Slug" name="slug" defaultValue={org.slug} required />
        <TextInput label="Logo URL" name="logo" defaultValue={org.logo ?? ""} />
        <Textarea
          label="Metadata (JSON)"
          name="metadata"
          defaultValue={org.metadata ?? ""}
          placeholder='{"plan":"enterprise"}'
          error={editMetaError}
          onChange={(v) => {
            if (!v) { setEditMetaError(undefined); return; }
            try { JSON.parse(v); setEditMetaError(undefined); }
            catch { setEditMetaError("Must be valid JSON"); }
          }}
        />
      </ConfirmDialog>
    </Stack>
  );
}
