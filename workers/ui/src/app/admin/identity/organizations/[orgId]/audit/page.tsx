"use client";

import { useOrgDetail } from "../../../../_components/identity/org-detail-context";
import { ActivityLogContent } from "../../../../_components/activity-log-content";

export default function OrgAuditPage() {
  const { orgId } = useOrgDetail();

  return <ActivityLogContent targetType="organization" targetId={orgId} />;
}
