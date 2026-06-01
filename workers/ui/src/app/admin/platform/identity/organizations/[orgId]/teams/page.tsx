"use client";

import { useOrgDetail } from "../../../../../_components/identity/org-detail-context";
import { OrganizationTeamsContent } from "../../../../../_components/identity/organization-teams-content";

export default function PlatformOrgTeamsPage() {
  const { orgId } = useOrgDetail();

  return <OrganizationTeamsContent orgId={orgId} />;
}
