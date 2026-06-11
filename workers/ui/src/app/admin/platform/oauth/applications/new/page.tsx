"use client";

import { useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ApplicationCreateWizardContent } from "../../../../_components/oauth/application-create-wizard-content";

export default function PlatformNewApplicationPage() {
  const router = useRouter();
  return (
    <PageBody>
      <ApplicationCreateWizardContent
        backHref="/admin/platform/oauth/applications"
        onCreated={(clientId) => router.push(`/admin/platform/oauth/applications/${clientId}`)}
      />
    </PageBody>
  );
}
