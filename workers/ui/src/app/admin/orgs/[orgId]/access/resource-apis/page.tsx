"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { ResourceApisContent } from "../../../../_components/oauth/resource-apis-content";

export default function OrgAccessResourceApisPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <ResourceApisContent
        scope={{ kind: "organization", organizationId: orgId }}
        onResourceClick={(id) => router.push(`/admin/orgs/${orgId}/access/resource-apis/${id}`)}
      />
    </PageBody>
  );
}
