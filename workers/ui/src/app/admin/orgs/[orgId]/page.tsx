"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody, Stack } from "@idco/ui";
import { OrgDetailProvider } from "../../_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "../../_components/identity/org-detail-header-content";
import { OrgDetailOverviewContent } from "../../_components/identity/org-detail-overview-content";

export default function OrgLensOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <OrgDetailProvider orgId={orgId}>
        <Stack gap="md">
          <OrgDetailHeaderContent
            activeTab="overview"
            routeBasePath={`/admin/orgs/${orgId}`}
            scopedRoute
            backHref="/admin/platform/identity/organizations"
            onNavigateToOrgs={() => router.push("/admin/platform/identity/organizations")}
          />
          <OrgDetailOverviewContent />
        </Stack>
      </OrgDetailProvider>
    </PageBody>
  );
}
