"use client";

import { useState, useEffect } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorAlert,
  Inline,
  LinkButton,
  Panel,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@id/ui";
import {
  getFullOrganization as getOrgAction,
  updateOrganization as updateOrgAction,
  deleteOrganization as deleteOrgAction,
  type Organization,
} from "../../_actions/organizations";

const defaultActions = {
  getFullOrganization: getOrgAction,
  updateOrganization: updateOrgAction,
  deleteOrganization: deleteOrgAction,
};

type OrgDetailContentProps = {
  orgId: string;
  activeTab?: "overview" | "members" | "teams" | "invitations";
  loading?: boolean;
  error?: string;
  onNavigateToOrgs?: () => void;
  onNavigateToMembers?: () => void;
  onNavigateToTeams?: () => void;
  onNavigateToInvitations?: () => void;
  actions?: typeof defaultActions;
};

function orgTabs(orgId: string) {
  return [
    { id: "overview", href: `/admin/identity/organizations/${orgId}`, label: "Overview" },
    { id: "members", href: `/admin/identity/organizations/${orgId}/members`, label: "Members" },
    { id: "teams", href: `/admin/identity/organizations/${orgId}/teams`, label: "Teams" },
    { id: "invitations", href: `/admin/identity/organizations/${orgId}/invitations`, label: "Invitations" },
  ];
}

export function OrganizationDetailContent({
  orgId,
  activeTab = "overview",
  loading: loadingOverride,
  error: errorOverride,
  onNavigateToOrgs,
  onNavigateToMembers,
  onNavigateToTeams,
  onNavigateToInvitations,
  actions = defaultActions,
}: OrgDetailContentProps) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(!loadingOverride && !errorOverride);
  const [fetchError, setFetchError] = useState<string | undefined>();
  const [fetchKey, setFetchKey] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [editMetaError, setEditMetaError] = useState<string | undefined>();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [typedSlug, setTypedSlug] = useState("");

  useEffect(() => {
    if (loadingOverride || errorOverride) return;
    setIsLoading(true);
    setFetchError(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const fetched = await actions.getFullOrganization(orgId);
        if (!cancelled) { setOrg(fetched); setIsLoading(false); }
      } catch (err: unknown) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load organization");
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [actions, orgId, loadingOverride, errorOverride, fetchKey]);

  const showLoading = loadingOverride ?? isLoading;
  const showError = errorOverride ?? fetchError;

  async function handleEdit(formData: FormData) {
    setEditError(undefined);
    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const logo = String(formData.get("logo") ?? "").trim();
    const metaRaw = String(formData.get("metadata") ?? "").trim();
    if (metaRaw) {
      try { JSON.parse(metaRaw); } catch {
        setEditError("Metadata must be valid JSON");
        return false;
      }
    }
    try {
      const updated = await actions.updateOrganization(orgId, {
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
        logo: logo || "",
        ...(metaRaw ? { metadata: metaRaw } : {}),
      });
      setOrg(updated);
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
      onNavigateToOrgs?.();
      return true;
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete organization");
      return false;
    }
  }

  return (
    <Stack gap="md">
      <Inline justify="between">
        <Inline gap="sm">
          <LinkButton href="/admin/identity/organizations" variant="secondary">
            ← Organizations
          </LinkButton>
          {org && (
            <>
              <Text variant="h1">{org.name}</Text>
              <Badge tone="neutral">#{org.slug}</Badge>
            </>
          )}
          {showLoading && !org && <Text variant="h1">Loading…</Text>}
        </Inline>
        <Button variant="danger" onClick={() => { setTypedSlug(""); setDeleteOpen(true); }}>
          Delete
        </Button>
      </Inline>

      <Tabs
        ariaLabel="Organization detail tabs"
        selectedKey={activeTab}
        items={orgTabs(orgId)}
        onSelectionChange={(key) => {
          if (key === "members") onNavigateToMembers?.();
          if (key === "teams") onNavigateToTeams?.();
          if (key === "invitations") onNavigateToInvitations?.();
        }}
      />

      {showLoading && activeTab === "overview" && <Skeleton rows={4} height="md" />}
      {!showLoading && showError && activeTab === "overview" && (
        <ErrorAlert message={showError} onRetry={() => setFetchKey((k) => k + 1)} />
      )}

      {!showLoading && !showError && org && activeTab === "overview" && (
        <Panel>
          <Stack gap="md">
            {org.logo && (
              <img src={org.logo} alt={`${org.name} logo`} style={{ maxWidth: 120, maxHeight: 60, objectFit: "contain" }} />
            )}
            <Stack gap="xs">
              <Inline gap="sm">
                <Text variant="caption">Name</Text>
                <Text variant="body">{org.name}</Text>
              </Inline>
              <Inline gap="sm">
                <Text variant="caption">Slug</Text>
                <Text variant="body">{org.slug}</Text>
              </Inline>
              <Inline gap="sm">
                <Text variant="caption">Created</Text>
                <Text variant="body">{new Date(org.createdAt).toLocaleDateString()}</Text>
              </Inline>
              {org.metadata && (
                <Stack gap="xs">
                  <Text variant="caption">Metadata</Text>
                  <pre style={{ margin: 0, fontSize: "0.8rem", background: "var(--color-base-200)", borderRadius: "var(--radius-box)", padding: "0.75rem", overflowX: "auto" }}>
                    {(() => { try { return JSON.stringify(JSON.parse(org.metadata), null, 2); } catch { return org.metadata; } })()}
                  </pre>
                </Stack>
              )}
            </Stack>
            <Inline justify="end">
              <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit Organization</Button>
            </Inline>
          </Stack>
        </Panel>
      )}

      {/* Edit Organization */}
      <ConfirmDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) { setEditError(undefined); setEditMetaError(undefined); } }}
        title="Edit Organization"
        confirmLabel="Save"
        error={editError}
        onConfirm={handleEdit}
      >
        <TextInput label="Name" name="name" defaultValue={org?.name ?? ""} />
        <TextInput label="Slug" name="slug" defaultValue={org?.slug ?? ""} />
        <TextInput label="Logo URL" name="logo" defaultValue={org?.logo ?? ""} />
        <Textarea
          label="Metadata (JSON)"
          name="metadata"
          defaultValue={org?.metadata ?? ""}
          placeholder='{"plan":"enterprise"}'
          error={editMetaError}
          onChange={(v) => {
            if (!v) { setEditMetaError(undefined); return; }
            try { JSON.parse(v); setEditMetaError(undefined); }
            catch { setEditMetaError("Must be valid JSON"); }
          }}
        />
      </ConfirmDialog>

      {/* Delete Organization */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => { setDeleteOpen(o); if (!o) { setDeleteError(undefined); setTypedSlug(""); } }}
        title={`Delete ${org?.name ?? "Organization"}`}
        confirmLabel="Delete Org"
        variant="danger"
        confirmDisabled={typedSlug !== (org?.slug ?? "")}
        error={deleteError}
        onConfirm={handleDelete}
      >
        <Text variant="body">
          This will remove the organization and ALL members, teams, and invitations. This cannot be undone.
        </Text>
        <TextInput
          label={`Type "${org?.slug ?? ""}" to confirm`}
          name="confirmSlug"
          defaultValue=""
          onChange={setTypedSlug}
        />
      </ConfirmDialog>
    </Stack>
  );
}
