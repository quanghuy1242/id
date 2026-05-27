import type { ReactNode } from "react";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock } from "@id/ui";
import { AdminTopbar, AdminSidebarNav, AdminMobileNav } from "./_components/admin-nav";

export default function AdminLayout({ children }: { readonly children: ReactNode }) {
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
