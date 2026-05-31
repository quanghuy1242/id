"use client";

import { useParams } from "next/navigation";
import { PageBody } from "@id/ui";
import { JwksDetailContent, type JwksDetailTab } from "../../../../../_components/security/jwks-detail-content";

function activeTab(value: unknown): JwksDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  if (tab === "public-jwk" || tab === "metrics" || tab === "audit") return tab;
  return "overview";
}

export default function PlatformJwksKeyPage() {
  const params = useParams<{ kid: string; tab?: string[] }>();
  const basePath = `/admin/platform/security/jwks/${params.kid}`;

  return (
    <PageBody>
      <JwksDetailContent
        kid={params.kid}
        activeTab={activeTab(params.tab)}
        routeBasePath={basePath}
        backHref="/admin/platform/security/jwks"
      />
    </PageBody>
  );
}
