"use client";

import type { ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { PageBody, Stack } from "@id/ui";
import { OrgDetailProvider } from "../../../_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "../../../_components/identity/org-detail-header-content";

type OrgDetailLayoutProps = {
  readonly children: ReactNode;
};

type OrgDetailTab = "overview" | "members" | "teams" | "invitations" | "audit";

function activeTabFromPath(pathname: string | null): OrgDetailTab {
  if (pathname?.endsWith("/members")) return "members";
  if (pathname?.endsWith("/teams")) return "teams";
  if (pathname?.endsWith("/invitations")) return "invitations";
  if (pathname?.endsWith("/audit")) return "audit";
  return "overview";
}

export default function OrgDetailLayout({ children }: OrgDetailLayoutProps) {
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
            onNavigateToOrgs={() => router.push("/admin/identity/organizations")}
          />
          {children}
        </Stack>
      </OrgDetailProvider>
    </PageBody>
  );
}
