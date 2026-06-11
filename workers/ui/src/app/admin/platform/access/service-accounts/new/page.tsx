"use client";

import { useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ApplicationCreateWizardContent } from "../../../../_components/oauth/application-create-wizard-content";

export default function PlatformServiceAccountCreatePage() {
  const router = useRouter();

  return (
    <PageBody>
      <ApplicationCreateWizardContent
        variant="serviceAccount"
        title="New Service Account"
        backHref="/admin/platform/access/service-accounts"
        backLabel="Service Accounts"
        completeLabel="Create service account"
        onCreated={(clientId) => router.push(`/admin/platform/oauth/applications/${clientId}`)}
      />
    </PageBody>
  );
}
