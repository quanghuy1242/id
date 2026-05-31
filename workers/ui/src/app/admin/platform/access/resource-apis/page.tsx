"use client";

import { useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { ResourceApisContent } from "../../../_components/oauth/resource-apis-content";

export default function PlatformAccessResourceApisPage() {
  const router = useRouter();
  return (
    <PageBody>
      <ResourceApisContent onResourceClick={(id) => router.push(`/admin/platform/access/resource-apis/${id}`)} />
    </PageBody>
  );
}
