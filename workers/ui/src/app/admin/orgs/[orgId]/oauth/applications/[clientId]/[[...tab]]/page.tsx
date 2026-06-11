"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ApplicationDetailContent, type ApplicationDetailTab } from "../../../../../../_components/oauth/application-detail-content";

function activeTab(value: unknown): ApplicationDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  if (tab === "credentials" || tab === "uris" || tab === "scopes" || tab === "connections" || tab === "quickstart" || tab === "audit") {
    return tab;
  }
  return "overview";
}

export default function OrgApplicationDetailPage() {
  const params = useParams<{ orgId: string; clientId: string; tab?: string[] }>();
  const router = useRouter();
  const scope = { kind: "organization" as const, organizationId: params.orgId };
  const basePath = `/admin/orgs/${params.orgId}/oauth/applications/${params.clientId}`;

  return (
    <PageBody>
      <ApplicationDetailContent
        clientId={params.clientId}
        activeTab={activeTab(params.tab)}
        scope={scope}
        routeBasePath={basePath}
        backHref={`/admin/orgs/${params.orgId}/oauth/applications`}
        onDeleted={() => router.push(`/admin/orgs/${params.orgId}/oauth/applications`)}
      />
    </PageBody>
  );
}
