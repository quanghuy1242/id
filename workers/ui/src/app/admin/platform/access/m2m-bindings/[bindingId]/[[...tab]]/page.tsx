"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { M2mBindingDetailContent, type M2mBindingDetailTab } from "../../../../../_components/oauth/m2m-binding-detail-content";

function activeTab(value: unknown): M2mBindingDetailTab {
  const tab = Array.isArray(value) ? value[0] : undefined;
  return tab === "audit" ? "audit" : "overview";
}

export default function PlatformM2mBindingDetailPage() {
  const params = useParams<{ bindingId: string; tab?: string[] }>();
  const router = useRouter();
  const basePath = `/admin/platform/access/m2m-bindings/${params.bindingId}`;

  return (
    <PageBody>
      <M2mBindingDetailContent
        bindingId={params.bindingId}
        activeTab={activeTab(params.tab)}
        routeBasePath={basePath}
        backHref="/admin/platform/access/m2m-bindings"
        onDeleted={() => router.push("/admin/platform/access/m2m-bindings")}
      />
    </PageBody>
  );
}
