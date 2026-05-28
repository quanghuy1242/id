"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { OrganizationDetailContent } from "../../../_components/identity/organization-detail-content";

export default function OrgDetailPage() {
  return (
    <PageBody>
      <Suspense fallback={<OrganizationDetailContent orgId="" loading />}>
        <OrgDetailPageContent />
      </Suspense>
    </PageBody>
  );
}

function OrgDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <OrganizationDetailContent
      orgId={orgId}
      onNavigateToOrgs={() => router.push("/admin/identity/organizations")}
      onNavigateToMembers={() => router.push(`/admin/identity/organizations/${orgId}/members`)}
      onNavigateToTeams={() => router.push(`/admin/identity/organizations/${orgId}/teams`)}
      onNavigateToInvitations={() => router.push(`/admin/identity/organizations/${orgId}/invitations`)}
    />
  );
}
