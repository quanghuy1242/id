"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { UserSessionsContent } from "../../../../_components/identity/user-sessions-content";

export default function UserSessionsPage() {
  return (
    <PageBody>
      <Suspense fallback={<UserSessionsContent userId="" loading />}>
        <UserSessionsPageContent />
      </Suspense>
    </PageBody>
  );
}

function UserSessionsPageContent() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params.userId ?? "");

  return (
    <UserSessionsContent
      userId={userId}
      onNavigateToOverview={() => router.push(`/admin/identity/users/${userId}`)}
    />
  );
}
