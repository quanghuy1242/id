"use client";

import { useRouter } from "next/navigation";
import { UserDetailOverviewContent } from "../../../_components/identity/user-detail-overview-content";

export default function UserDetailPage() {
  const router = useRouter();

  return (
    <UserDetailOverviewContent
      onNavigateToUsers={() => router.push("/admin/identity/users")}
    />
  );
}
