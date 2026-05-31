"use client";

import { useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { ApplicationsContent } from "../../../_components/oauth/applications-content";

export default function PlatformApplicationsPage() {
  const router = useRouter();

  return (
    <PageBody>
      <ApplicationsContent
        createHref="/admin/platform/oauth/applications/new"
        onClientClick={(clientId) => router.push(`/admin/platform/oauth/applications/${clientId}`)}
      />
    </PageBody>
  );
}
