"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ResourceApiDetailContent, type ResourceApiDetailTab } from "../../../../../_components/oauth/resource-api-detail-content";

function activeTab(value: unknown): ResourceApiDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  return tab === "audit" ? "audit" : "overview";
}

export default function PlatformResourceApiDetailPage() {
  const params = useParams<{ resourceServerId: string; tab?: string[] }>();
  const router = useRouter();
  const basePath = `/admin/platform/access/resource-apis/${params.resourceServerId}`;

  return (
    <PageBody>
      <ResourceApiDetailContent
        resourceServerId={params.resourceServerId}
        activeTab={activeTab(params.tab)}
        routeBasePath={basePath}
        backHref="/admin/platform/access/resource-apis"
        onDeleted={() => router.push("/admin/platform/access/resource-apis")}
      />
    </PageBody>
  );
}
