"use client";

import type { ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { PageBody, Stack } from "@idco/ui";
import { OrgDetailProvider } from "../../../../_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "../../../../_components/identity/org-detail-header-content";

function activeTabFromPath(pathname: string | null) {
  if (pathname?.endsWith("/members")) return "members";
  if (pathname?.endsWith("/teams")) return "teams";
  if (pathname?.endsWith("/invitations")) return "invitations";
  if (pathname?.endsWith("/audit")) return "audit";
  return "overview";
}

export default function PlatformOrgDetailLayout({ children }: { readonly children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const orgId = String(params.orgId ?? "");
  const orgsHref = "/admin/platform/identity/organizations";
  const routeBasePath = `${orgsHref}/${orgId}`;

  return (
    <PageBody>
      <OrgDetailProvider orgId={orgId}>
        <Stack gap="md">
          <OrgDetailHeaderContent
            activeTab={activeTabFromPath(pathname)}
            routeBasePath={routeBasePath}
            backHref={orgsHref}
            onNavigateToOrgs={() => router.push(orgsHref)}
          />
          {children}
        </Stack>
      </OrgDetailProvider>
    </PageBody>
  );
}
