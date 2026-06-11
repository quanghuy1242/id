"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody } from "@idco/ui";
import { M2mBindingsContent } from "../../../../_components/oauth/m2m-bindings-content";

export default function OrgAccessM2mBindingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <M2mBindingsContent
        scope={{ kind: "organization", organizationId: orgId }}
        onBindingClick={(id) => router.push(`/admin/orgs/${orgId}/access/m2m-bindings/${id}`)}
      />
    </PageBody>
  );
}
