"use client";

import { useParams, useRouter } from "next/navigation";
import { ApplicationDetailContent } from "../../../../_components/oauth/application-detail-content";

export default function ApplicationConnectionsPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  return <ApplicationDetailContent clientId={params.clientId} activeTab="connections" onDeleted={() => router.push("/admin/oauth/applications")} />;
}
