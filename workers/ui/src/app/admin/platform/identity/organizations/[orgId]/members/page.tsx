"use client";

import { useOrgDetail } from "../../../../../_components/identity/org-detail-context";
import { OrganizationMembersContent } from "../../../../../_components/identity/organization-members-content";

export default function PlatformOrgMembersPage() {
  const { orgId, org } = useOrgDetail();

  return <OrganizationMembersContent orgId={orgId} orgName={org?.name} />;
}
