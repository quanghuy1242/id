"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { OrganizationDetailContent } from "../../../../_components/identity/organization-detail-content";
import { OrganizationInvitationsContent } from "../../../../_components/identity/organization-invitations-content";

export default function OrgInvitationsPage() {
  return (
    <PageBody>
      <Suspense fallback={<OrgInvitationsPageSkeleton />}>
        <OrgInvitationsPageContent />
      </Suspense>
    </PageBody>
  );
}

function OrgInvitationsPageSkeleton() {
  return (
    <Stack gap="md">
      <OrganizationDetailContent orgId="" activeTab="invitations" loading />
      <OrganizationInvitationsContent orgId="" loading />
    </Stack>
  );
}

function OrgInvitationsPageContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <Stack gap="md">
      <OrganizationDetailContent
        orgId={orgId}
        activeTab="invitations"
        onNavigateToOrgs={() => router.push("/admin/identity/organizations")}
        onNavigateToMembers={() => router.push(`/admin/identity/organizations/${orgId}/members`)}
        onNavigateToTeams={() => router.push(`/admin/identity/organizations/${orgId}/teams`)}
        onNavigateToInvitations={() => router.push(`/admin/identity/organizations/${orgId}/invitations`)}
      />
      <OrganizationInvitationsContent orgId={orgId} />
    </Stack>
  );
}
