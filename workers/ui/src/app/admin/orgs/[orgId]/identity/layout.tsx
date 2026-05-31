"use client";

import type { ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { OrgDetailProvider } from "../../../_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "../../../_components/identity/org-detail-header-content";

type OrgLensIdentityLayoutProps = {
  readonly children: ReactNode;
};

type OrgDetailTab = "members" | "teams" | "invitations";

function activeTabFromPath(pathname: string | null): OrgDetailTab {
  if (pathname?.endsWith("/identity/teams")) return "teams";
  if (pathname?.endsWith("/identity/invitations")) return "invitations";
  return "members";
}

export default function OrgLensIdentityLayout({ children }: OrgLensIdentityLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");

  return (
    <PageBody>
      <OrgDetailProvider orgId={orgId}>
        <Stack gap="md">
          <OrgDetailHeaderContent
            activeTab={activeTabFromPath(pathname)}
            routeBasePath={`/admin/orgs/${orgId}`}
            scopedRoute
            backHref="/admin/platform/identity/organizations"
            onNavigateToOrgs={() => router.push("/admin/platform/identity/organizations")}
          />
          {children}
        </Stack>
      </OrgDetailProvider>
    </PageBody>
  );
}
