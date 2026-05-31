"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { ApplicationsContent } from "../../../../_components/oauth/applications-content";

export default function OrgApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <ApplicationsContent
        scope={{ kind: "organization", organizationId: orgId }}
        createHref={`/admin/orgs/${orgId}/oauth/applications/new`}
        onClientClick={(clientId) => router.push(`/admin/orgs/${orgId}/oauth/applications/${clientId}`)}
      />
    </PageBody>
  );
}
