"use client";

import { useParams, useRouter } from "next/navigation";
import { ApplicationDetailContent } from "../../../../_components/oauth/application-detail-content";

export default function ApplicationScopesPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  return <ApplicationDetailContent clientId={params.clientId} activeTab="scopes" onDeleted={() => router.push("/admin/oauth/applications")} />;
}
