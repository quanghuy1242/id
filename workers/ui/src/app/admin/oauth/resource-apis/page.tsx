"use client";

import { useRouter } from "next/navigation";
import { ResourceApisContent } from "../../_components/oauth/resource-apis-content";

export default function ResourceApisPage() {
  const router = useRouter();
  return <ResourceApisContent onResourceClick={(id) => router.push(`/admin/oauth/resource-apis/${id}`)} />;
}
