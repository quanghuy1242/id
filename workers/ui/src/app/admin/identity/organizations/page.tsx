"use client";

import { PageBody } from "@id/ui";
import { useRouter } from "next/navigation";
import { OrganizationsListContent } from "../../_components/identity/organizations-list-content";

export default function OrganizationsPage() {
  const router = useRouter();
  return (
    <PageBody>
      <OrganizationsListContent onRowClick={(id) => router.push(`/admin/identity/organizations/${id}`)} />
    </PageBody>
  );
}
