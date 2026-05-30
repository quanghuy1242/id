"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PageBody, Stack, Tabs } from "@id/ui";

type OAuthLayoutProps = {
  readonly children: ReactNode;
};

const tabs = [
  { id: "/admin/oauth/applications", href: "/admin/oauth/applications", label: "Applications" },
  { id: "/admin/oauth/resource-apis", href: "/admin/oauth/resource-apis", label: "Resource APIs" },
  { id: "/admin/oauth/scope-catalog", href: "/admin/oauth/scope-catalog", label: "Scope Catalog" },
  { id: "/admin/oauth/m2m-bindings", href: "/admin/oauth/m2m-bindings", label: "M2M Bindings" },
];

export default function OAuthLayout({ children }: OAuthLayoutProps) {
  const pathname = usePathname();
  const selectedTab = tabs.find((tab) => pathname === tab.id || pathname?.startsWith(`${tab.id}/`)) ?? (pathname === "/admin/oauth" ? tabs[0] : undefined);

  return (
    <PageBody>
      <Stack gap="md">
        {selectedTab ? <Tabs ariaLabel="OAuth configuration" items={tabs} selectedKey={selectedTab.id} /> : null}
        {children}
      </Stack>
    </PageBody>
  );
}
