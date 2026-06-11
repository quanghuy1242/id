"use client";

import { useParams, useRouter } from "next/navigation";
import { PageBody, Stack } from "@idco/ui";
import { OrgDetailProvider, useOrgDetail } from "../../../_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "../../../_components/identity/org-detail-header-content";
import { ActivityLogContent } from "../../../_components/activity-log-content";

function OrgAuditContent() {
  const { orgId } = useOrgDetail();

  return (
    <ActivityLogContent organizationId={orgId} />
  );
}

export default function OrgLensAuditPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <OrgDetailProvider orgId={orgId}>
        <Stack gap="md">
          <OrgDetailHeaderContent
            activeTab="audit"
            routeBasePath={`/admin/orgs/${orgId}`}
            scopedRoute
            backHref="/admin/platform/identity/organizations"
            onNavigateToOrgs={() => router.push("/admin/platform/identity/organizations")}
          />
          <OrgAuditContent />
        </Stack>
      </OrgDetailProvider>
    </PageBody>
  );
}
