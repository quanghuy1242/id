import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import type { ConsolePermission, ConsoleScope, ConsoleScopeEnvelope } from "@id/lib";
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

const storyOrgPermissions = [
  "members:read",
  "members:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
] as const satisfies readonly ConsolePermission[];

function storyOrgScope(organizationId: string): ConsoleScope {
  return {
    kind: "organization",
    id: `organization:${organizationId}`,
    organizationId,
    label: organizationId === "org_acme" ? "Acme Publishing" : organizationId,
    role: "admin",
    permissions: storyOrgPermissions,
    requiresStepUp: false,
  };
}

function routeOrganizationId(pathname: string): string | undefined {
  const match = /^\/admin\/orgs\/([^/]+)/u.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function defaultScopeEnvelopeForPath(activePath: string): ConsoleScopeEnvelope {
  const organizationId = routeOrganizationId(activePath);
  if (!organizationId) return fallbackConsoleScopeEnvelope;
  const scope = storyOrgScope(organizationId);
  return {
    actor: { userId: "usr_org_story", email: "owner@acme.example", canEnterConsole: true },
    scopes: [scope],
    memberships: [],
    defaultScopeId: scope.id,
  };
}

export function AdminShell({ activePath, scopeEnvelope, children }: AdminShellProps) {
  const resolvedScopeEnvelope = scopeEnvelope ?? defaultScopeEnvelopeForPath(activePath);
  setMockPathname(activePath);
  if (typeof window !== "undefined") window.history.replaceState({}, "", activePath);

  // Each story gets a fresh SWR cache so mocked actions are re-fetched and one
  // story never serves another story's cached data.
  return (
    <SWRConfig value={{ ...ADMIN_SWR_CONFIG, provider: () => new Map() }}>
      <AdminScopeProvider
        initialEnvelope={resolvedScopeEnvelope}
        actions={{ getConsoleScopes: async () => resolvedScopeEnvelope }}
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
