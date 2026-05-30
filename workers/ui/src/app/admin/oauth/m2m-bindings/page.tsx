"use client";

import { useRouter } from "next/navigation";
import { M2mBindingsContent } from "../../_components/oauth/m2m-bindings-content";

export default function M2mBindingsPage() {
  const router = useRouter();
  return <M2mBindingsContent onBindingClick={(id) => router.push(`/admin/oauth/m2m-bindings/${id}`)} />;
}
