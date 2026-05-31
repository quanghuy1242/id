"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { ApplicationDetailContent, type ApplicationDetailTab } from "../../../../../_components/oauth/application-detail-content";

function activeTab(value: unknown): ApplicationDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  if (tab === "credentials" || tab === "uris" || tab === "scopes" || tab === "connections" || tab === "quickstart" || tab === "audit") {
    return tab;
  }
  return "overview";
}

export default function PlatformApplicationDetailPage() {
  const params = useParams<{ clientId: string; tab?: string[] }>();
  const router = useRouter();
  const basePath = `/admin/platform/oauth/applications/${params.clientId}`;

  return (
    <PageBody>
      <ApplicationDetailContent
        clientId={params.clientId}
        activeTab={activeTab(params.tab)}
        routeBasePath={basePath}
        backHref="/admin/platform/oauth/applications"
        onDeleted={() => router.push("/admin/platform/oauth/applications")}
      />
    </PageBody>
  );
}
