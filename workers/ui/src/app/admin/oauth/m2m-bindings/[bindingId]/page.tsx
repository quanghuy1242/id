"use client";

import { useParams, useRouter } from "next/navigation";
import { M2mBindingDetailContent } from "../../../_components/oauth/m2m-binding-detail-content";

export default function M2mBindingDetailPage() {
  const params = useParams<{ bindingId: string }>();
  const router = useRouter();
  return <M2mBindingDetailContent bindingId={params.bindingId} activeTab="overview" onDeleted={() => router.push("/admin/oauth/m2m-bindings")} />;
}
