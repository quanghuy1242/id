import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock } from "@id/ui";
import {
  AdminTopbar,
  AdminSidebarNav,
  AdminMobileNav,
  AdminMobileRouteTabs,
} from "../../workers/ui/src/app/admin/_components/admin-nav";
import { ADMIN_SWR_CONFIG } from "../../workers/ui/src/shared/swr-config";
import { setMockPathname } from "../../.ladle/mocks/next-navigation";

type AdminShellProps = {
  readonly activePath: string;
  readonly children: ReactNode;
};

export function AdminShell({ activePath, children }: AdminShellProps) {
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);

  // Each story gets a fresh SWR cache so mocked actions are re-fetched and one
  // story never serves another story's cached data.
  return (
    <SWRConfig value={{ ...ADMIN_SWR_CONFIG, provider: () => new Map() }}>
    <AppShell>
      <Topbar>
        <AdminTopbar />
      </Topbar>
      <AdminMobileRouteTabs />
      <SidebarLayout>
        <Sidebar>
          <AdminSidebarNav />
        </Sidebar>
        <MainContent>{children}</MainContent>
      </SidebarLayout>
      <MobileDock>
        <AdminMobileNav />
      </MobileDock>
    </AppShell>
    </SWRConfig>
  );
}
