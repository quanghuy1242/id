"use client";

import { useUserDetail } from "../../../../_components/identity/user-detail-context";
import { UserSessionsContent } from "../../../../_components/identity/user-sessions-content";

export default function UserSessionsPage() {
  const { userId, user } = useUserDetail();

  return <UserSessionsContent userId={userId} userName={user?.name} />;
}
