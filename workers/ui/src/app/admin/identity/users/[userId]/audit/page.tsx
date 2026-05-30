"use client";

import { useUserDetail } from "../../../../_components/identity/user-detail-context";
import { ActivityLogContent } from "../../../../_components/activity-log-content";

export default function UserAuditPage() {
  const { userId } = useUserDetail();

  return <ActivityLogContent targetType="user" targetId={userId} />;
}
