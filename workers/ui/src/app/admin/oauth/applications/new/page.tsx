"use client";

import { useRouter } from "next/navigation";
import { ApplicationCreateWizardContent } from "../../../_components/oauth/application-create-wizard-content";

export default function NewApplicationPage() {
  const router = useRouter();
  return <ApplicationCreateWizardContent onCreated={(clientId) => router.push(`/admin/oauth/applications/${clientId}`)} />;
}
