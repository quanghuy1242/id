"use client";

import { useParams } from "next/navigation";
import { ApplicationDetailContent } from "../../../../_components/oauth/application-detail-content";

export default function ApplicationConnectionsPage() {
  const params = useParams<{ clientId: string }>();
  return <ApplicationDetailContent clientId={params.clientId} activeTab="connections" />;
}
