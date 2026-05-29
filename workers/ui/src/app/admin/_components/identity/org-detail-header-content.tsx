"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorAlert,
  Inline,
  LinkButton,
  Skeleton,
  Tabs,
  Text,
  TextInput,
} from "@id/ui";
import {
  deleteOrganization as deleteOrganizationAction,
} from "../../_actions/organizations";
import { useOrgDetail } from "./org-detail-context";
import { isOrgsListKey } from "@/app/admin/_data/swr-keys";

const defaultActions = {
  deleteOrganization: deleteOrganizationAction,
};

type OrgDetailHeaderContentProps = {
  activeTab?: "overview" | "members" | "teams" | "invitations";
  onNavigateToOrgs?: () => void;
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

export function OrgDetailHeaderContent({
  activeTab = "overview",
  onNavigateToOrgs,
  actions = defaultActions,
}: OrgDetailHeaderContentProps) {
  const { orgId, org, isLoading, error, refetch } = useOrgDetail();
  const { mutate: globalMutate } = useSWRConfig();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [typedSlug, setTypedSlug] = useState("");

  async function handleDelete() {
    setDeleteError(undefined);
    try {
      await actions.deleteOrganization(orgId);
      await globalMutate(isOrgsListKey, undefined, { revalidate: false });
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
          {error && !org && <Text variant="h1">Organization unavailable</Text>}
        </Inline>
        {!error && (
          <Button variant="danger" disabled={!org} onClick={() => { setTypedSlug(""); setDeleteOpen(true); }}>
            Delete
          </Button>
        )}
      </Inline>

      {error && !org && <ErrorAlert message={error} onRetry={refetch} />}

      <Tabs
        ariaLabel="Organization detail tabs"
        selectedKey={activeTab}
        items={orgTabs(orgId)}
      />

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
