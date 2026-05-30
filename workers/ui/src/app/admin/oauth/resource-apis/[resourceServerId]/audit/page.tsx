"use client";

import { useParams, useRouter } from "next/navigation";
import { ResourceApiDetailContent } from "../../../../_components/oauth/resource-api-detail-content";

export default function ResourceApiAuditPage() {
  const params = useParams<{ resourceServerId: string }>();
  const router = useRouter();
  return <ResourceApiDetailContent resourceServerId={params.resourceServerId} activeTab="audit" onDeleted={() => router.push("/admin/oauth/resource-apis")} />;
}
