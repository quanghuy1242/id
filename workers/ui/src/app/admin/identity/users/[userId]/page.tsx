"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { UserDetailContent } from "../../../_components/identity/user-detail-content";

export default function UserDetailPage() {
  return (
    <PageBody>
      <Suspense fallback={<UserDetailContent userId="" loading />}>
        <UserDetailPageContent />
      </Suspense>
    </PageBody>
  );
}

function UserDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params.userId ?? "");

  return (
    <UserDetailContent
      userId={userId}
      onNavigateToSessions={() => router.push(`/admin/identity/users/${userId}/sessions`)}
      onNavigateToUsers={() => router.push("/admin/identity/users")}
      onImpersonateRedirect={() => router.push("/")}
    />
  );
}
