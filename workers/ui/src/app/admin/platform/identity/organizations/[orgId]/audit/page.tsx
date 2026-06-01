"use client";

import { ActivityLogContent } from "../../../../../_components/activity-log-content";
import { useOrgDetail } from "../../../../../_components/identity/org-detail-context";

export default function PlatformOrgAuditPage() {
  const { orgId } = useOrgDetail();

  return <ActivityLogContent targetType="organization" targetId={orgId} />;
}
