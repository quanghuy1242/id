"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ApplicationCreateWizardContent } from "../../../../../_components/oauth/application-create-wizard-content";

export default function OrgNewApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");
  return (
    <PageBody>
      <ApplicationCreateWizardContent
        scope={{ kind: "organization", organizationId: orgId }}
        backHref={`/admin/orgs/${orgId}/oauth/applications`}
        onCreated={(clientId) => router.push(`/admin/orgs/${orgId}/oauth/applications/${clientId}`)}
      />
    </PageBody>
  );
}
