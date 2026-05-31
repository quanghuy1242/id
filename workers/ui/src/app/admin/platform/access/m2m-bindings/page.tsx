"use client";

import { useRouter } from "next/navigation";
import { PageBody } from "@id/ui";
import { M2mBindingsContent } from "../../../_components/oauth/m2m-bindings-content";

export default function PlatformAccessM2mBindingsPage() {
  const router = useRouter();
  return (
    <PageBody>
      <M2mBindingsContent onBindingClick={(id) => router.push(`/admin/platform/access/m2m-bindings/${id}`)} />
    </PageBody>
  );
}
