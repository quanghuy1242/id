"use client";

import { useParams } from "next/navigation";
import { M2mBindingDetailContent } from "../../../_components/oauth/m2m-binding-detail-content";

export default function M2mBindingDetailPage() {
  const params = useParams<{ bindingId: string }>();
  return <M2mBindingDetailContent bindingId={params.bindingId} activeTab="overview" />;
}
