import type { ReactNode } from "react";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock } from "@id/ui";
import { AdminTopbar, AdminSidebarNav, AdminMobileNav } from "../../workers/ui/src/app/admin/_components/admin-nav";
import { setMockPathname } from "../../.ladle/mocks/next-navigation";

type AdminShellProps = {
  readonly activePath: string;
  readonly children: ReactNode;
};

export function AdminShell({ activePath, children }: AdminShellProps) {
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);

  return (
    <AppShell>
      <Topbar>
        <AdminTopbar />
      </Topbar>
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
  );
}
