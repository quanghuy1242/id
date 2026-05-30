"use client";

import { useRouter } from "next/navigation";
import { ApplicationsContent } from "../../_components/oauth/applications-content";

export default function ApplicationsPage() {
  const router = useRouter();

  return (
    <ApplicationsContent
      createHref="/admin/oauth/applications/new"
      onClientClick={(clientId) => router.push(`/admin/oauth/applications/${clientId}`)}
    />
  );
}
