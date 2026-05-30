"use client";

import { useParams } from "next/navigation";
import { ResourceApiDetailContent } from "../../../_components/oauth/resource-api-detail-content";

export default function ResourceApiDetailPage() {
  const params = useParams<{ resourceServerId: string }>();
  return <ResourceApiDetailContent resourceServerId={params.resourceServerId} activeTab="overview" />;
}
