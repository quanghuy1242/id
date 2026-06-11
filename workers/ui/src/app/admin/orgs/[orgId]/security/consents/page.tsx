"use client";

import { useParams } from "next/navigation";
import { PageBody } from "@idco/ui";
import { ConsentsContent } from "../../../../_components/security/consents-content";

export default function OrgSecurityConsentsPage() {
  const params = useParams();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <ConsentsContent scope={{ kind: "organization", organizationId: orgId }} />
    </PageBody>
  );
}
