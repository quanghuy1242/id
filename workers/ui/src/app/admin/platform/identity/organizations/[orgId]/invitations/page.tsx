"use client";

import { useOrgDetail } from "../../../../../_components/identity/org-detail-context";
import { OrganizationInvitationsContent } from "../../../../../_components/identity/organization-invitations-content";

export default function PlatformOrgInvitationsPage() {
  const { orgId } = useOrgDetail();

  return <OrganizationInvitationsContent orgId={orgId} />;
}
