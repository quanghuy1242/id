"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { OrganizationDetailContent } from "../../../../_components/identity/organization-detail-content";
import { OrganizationMembersContent } from "../../../../_components/identity/organization-members-content";

export default function OrgMembersPage() {
  return (
    <PageBody>
      <Suspense fallback={<OrgMembersPageSkeleton />}>
        <OrgMembersPageContent />
      </Suspense>
    </PageBody>
  );
}

function OrgMembersPageSkeleton() {
  return (
    <Stack gap="md">
      <OrganizationDetailContent orgId="" activeTab="members" loading />
      <OrganizationMembersContent orgId="" loading />
    </Stack>
  );
}

function OrgMembersPageContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <Stack gap="md">
      <OrganizationDetailContent
        orgId={orgId}
        activeTab="members"
        onNavigateToOrgs={() => router.push("/admin/identity/organizations")}
        onNavigateToMembers={() => router.push(`/admin/identity/organizations/${orgId}/members`)}
        onNavigateToTeams={() => router.push(`/admin/identity/organizations/${orgId}/teams`)}
        onNavigateToInvitations={() => router.push(`/admin/identity/organizations/${orgId}/invitations`)}
      />
      <OrganizationMembersContent orgId={orgId} />
    </Stack>
  );
}
