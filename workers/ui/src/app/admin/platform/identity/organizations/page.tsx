"use client";

import { PageBody } from "@id/ui";
import { useRouter } from "next/navigation";
import { OrganizationsListContent } from "../../../_components/identity/organizations-list-content";

export default function PlatformOrganizationsPage() {
  const router = useRouter();
  return (
    <PageBody>
      <OrganizationsListContent onRowClick={(id) => router.push(`/admin/platform/identity/organizations/${id}`)} />
    </PageBody>
  );
}
