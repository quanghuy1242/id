import type { ReactNode } from "react";
import { AppShell, Topbar, SidebarLayout, Sidebar, MainContent, MobileDock, ToastRegion } from "@idco/ui";
import { AdminTopbar, AdminSidebarNav, AdminMobileNav, AdminMobileRouteTabs } from "./_components/admin-nav";
import { AdminScopeProvider } from "./_components/admin-scope-provider";
import { AdminSwrProvider } from "./_components/admin-swr-provider";

export default function AdminLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AdminSwrProvider>
      <AdminScopeProvider>
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
        <ToastRegion />
      </AdminScopeProvider>
    </AdminSwrProvider>
  );
}
