import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import type { ConsoleScopeEnvelope } from "@id/lib";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock, ToastRegion } from "@id/ui";
import {
  AdminTopbar,
  AdminSidebarNav,
  AdminMobileNav,
  AdminMobileRouteTabs,
} from "../../workers/ui/src/app/admin/_components/admin-nav";
import { AdminScopeProvider, fallbackConsoleScopeEnvelope } from "../../workers/ui/src/app/admin/_components/admin-scope-provider";
import { ADMIN_SWR_CONFIG } from "../../workers/ui/src/shared/swr-config";
import { setMockPathname } from "../../.ladle/mocks/next-navigation";

type AdminShellProps = {
  readonly activePath: string;
  readonly scopeEnvelope?: ConsoleScopeEnvelope;
  readonly children: ReactNode;
};

export function AdminShell({ activePath, scopeEnvelope = fallbackConsoleScopeEnvelope, children }: AdminShellProps) {
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);

  // Each story gets a fresh SWR cache so mocked actions are re-fetched and one
  // story never serves another story's cached data.
  return (
    <SWRConfig value={{ ...ADMIN_SWR_CONFIG, provider: () => new Map() }}>
      <AdminScopeProvider
        initialEnvelope={scopeEnvelope}
        actions={{ getConsoleScopes: async () => scopeEnvelope }}
      >
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
        {/* Mirrors app/admin/layout.tsx so toasts fired from content stories are visible. */}
        <ToastRegion />
      </AdminScopeProvider>
    </SWRConfig>
  );
}
