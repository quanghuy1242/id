"use client";

import { useParams, useRouter } from "next/navigation";
import { M2mBindingDetailContent } from "../../../../_components/oauth/m2m-binding-detail-content";

export default function M2mBindingAuditPage() {
  const params = useParams<{ bindingId: string }>();
  const router = useRouter();
  return <M2mBindingDetailContent bindingId={params.bindingId} activeTab="audit" onDeleted={() => router.push("/admin/oauth/m2m-bindings")} />;
}
