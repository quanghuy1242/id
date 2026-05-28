"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { OrganizationDetailContent } from "../../../../_components/identity/organization-detail-content";
import { OrganizationTeamsContent } from "../../../../_components/identity/organization-teams-content";

export default function OrgTeamsPage() {
  return (
    <PageBody>
      <Suspense fallback={<OrgTeamsPageSkeleton />}>
        <OrgTeamsPageContent />
      </Suspense>
    </PageBody>
  );
}

function OrgTeamsPageSkeleton() {
  return (
    <Stack gap="md">
      <OrganizationDetailContent orgId="" activeTab="teams" loading />
      <OrganizationTeamsContent orgId="" loading />
    </Stack>
  );
}

function OrgTeamsPageContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <Stack gap="md">
      <OrganizationDetailContent
        orgId={orgId}
        activeTab="teams"
        onNavigateToOrgs={() => router.push("/admin/identity/organizations")}
        onNavigateToMembers={() => router.push(`/admin/identity/organizations/${orgId}/members`)}
        onNavigateToTeams={() => router.push(`/admin/identity/organizations/${orgId}/teams`)}
        onNavigateToInvitations={() => router.push(`/admin/identity/organizations/${orgId}/invitations`)}
      />
      <OrganizationTeamsContent orgId={orgId} />
    </Stack>
  );
}
