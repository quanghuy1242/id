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

const listingTabIds = new Set(tabs.map((tab) => tab.id));

function normalizePathname(pathname: string | null): string {
  if (!pathname) return "";
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getListingTabId(pathname: string | null): string | undefined {
  const normalized = normalizePathname(pathname);
  return listingTabIds.has(normalized) ? normalized : undefined;
}

export default function OAuthLayout({ children }: OAuthLayoutProps) {
  const pathname = usePathname();
  const selectedTabId = getListingTabId(pathname);

  return (
    <PageBody>
      <Stack gap="md">
        {selectedTabId ? <Tabs ariaLabel="OAuth configuration" items={tabs} selectedKey={selectedTabId} /> : null}
        {children}
      </Stack>
    </PageBody>
  );
}
