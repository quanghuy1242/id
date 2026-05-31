"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { ResourceApiDetailContent, type ResourceApiDetailTab } from "../../../../../../_components/oauth/resource-api-detail-content";

function activeTab(value: unknown): ResourceApiDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  return tab === "audit" ? "audit" : "overview";
}

export default function OrgResourceApiDetailPage() {
  const params = useParams<{ orgId: string; resourceServerId: string; tab?: string[] }>();
  const router = useRouter();
  const scope = { kind: "organization" as const, organizationId: params.orgId };
  const basePath = `/admin/orgs/${params.orgId}/access/resource-apis/${params.resourceServerId}`;

  return (
    <PageBody>
      <ResourceApiDetailContent
        resourceServerId={params.resourceServerId}
        activeTab={activeTab(params.tab)}
        scope={scope}
        routeBasePath={basePath}
        backHref={`/admin/orgs/${params.orgId}/access/resource-apis`}
        onDeleted={() => router.push(`/admin/orgs/${params.orgId}/access/resource-apis`)}
      />
    </PageBody>
  );
}
