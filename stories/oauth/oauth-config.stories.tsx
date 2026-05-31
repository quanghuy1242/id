import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { useRouter } from "next/navigation";
import { PageBody, Stack, Tabs } from "@id/ui";
import { ApplicationsContent } from "../../workers/ui/src/app/admin/_components/oauth/applications-content";
import { ApplicationCreateWizardContent } from "../../workers/ui/src/app/admin/_components/oauth/application-create-wizard-content";
import { ApplicationDetailContent, type ApplicationDetailTab } from "../../workers/ui/src/app/admin/_components/oauth/application-detail-content";
import { ResourceApisContent } from "../../workers/ui/src/app/admin/_components/oauth/resource-apis-content";
import { ResourceApiDetailContent, type ResourceApiDetailTab } from "../../workers/ui/src/app/admin/_components/oauth/resource-api-detail-content";
import { ScopeCatalogContent } from "../../workers/ui/src/app/admin/_components/oauth/scope-catalog-content";
import { M2mBindingsContent } from "../../workers/ui/src/app/admin/_components/oauth/m2m-bindings-content";
import { M2mBindingDetailContent, type M2mBindingDetailTab } from "../../workers/ui/src/app/admin/_components/oauth/m2m-binding-detail-content";
import type {
  OAuthClient,
  ResourceServer,
  OAuthResourceScope,
  ClientResourceScope,
  CreateClientInput,
  UpdateClientInput,
  CreateResourceServerInput,
  UpdateResourceServerInput,
  CreateScopeInput,
  UpdateScopeInput,
  CreateBindingInput,
  UpdateBindingInput,
} from "../../workers/ui/src/app/admin/_actions/oauth";
import type { Organization } from "../../workers/ui/src/app/admin/_actions/organizations";
import {
  mockClients,
  mockResourceServers,
  mockScopes,
  mockBindings,
} from "../../workers/ui/src/app/admin/_mocks/oauth";
import { mockOrganizations } from "../../workers/ui/src/app/admin/_mocks/organizations";
import { AdminShell } from "../_decorators/shell";

export default { title: "Admin / OAuth / Section Pages" } satisfies StoryDefault;

const tabs = [
  { id: "/admin/platform/oauth/applications", href: "/admin/platform/oauth/applications", label: "Applications" },
  { id: "/admin/platform/access/resource-apis", href: "/admin/platform/access/resource-apis", label: "Resource APIs" },
  { id: "/admin/platform/access/scope-catalog", href: "/admin/platform/access/scope-catalog", label: "Scope Catalog" },
  { id: "/admin/platform/access/m2m-bindings", href: "/admin/platform/access/m2m-bindings", label: "M2M Bindings" },
];

const listingTabIds = new Set(tabs.map((tab) => tab.id));

function selectedListingTab(pathname: string): string | undefined {
  return listingTabIds.has(pathname) ? pathname : undefined;
}

function OAuthShell({ activePath, children }: { activePath: string; children: ReactNode }) {
  const selectedKey = selectedListingTab(activePath);
  return (
    <AdminShell activePath={activePath}>
      <PageBody>
        <Stack gap="md">
          {selectedKey ? <Tabs ariaLabel="OAuth configuration" items={tabs} selectedKey={selectedKey} /> : null}
          {children}
        </Stack>
      </PageBody>
    </AdminShell>
  );
}

function normalizeRoute(href: string): string {
  return new URL(href, "https://id.example.test").pathname;
}

function useLadleRoute(initialPath: string) {
  const router = useRouter();
  const [pathname, setPathname] = useState(() => normalizeRoute(initialPath));

  const navigate = useCallback((href: string, mode: "push" | "replace" = "push") => {
    setPathname(normalizeRoute(href));
    if (mode === "replace") router.replace(href);
    else router.push(href);
  }, [router]);

  useEffect(() => {
    navigate(initialPath, "replace");
  }, [initialPath, navigate]);

  return { pathname, navigate };
}

function splitRoute(pathname: string) {
  return pathname.split("?")[0]?.split("/").filter(Boolean) ?? [];
}

function oauthRouteContext(pathname: string): Pick<OAuthRouteContext, "route" | "id" | "tab"> {
  const parts = splitRoute(pathname);
  if (parts[1] === "platform" && parts[2] === "oauth") {
    return { route: parts[3], id: parts[4], tab: parts[5] };
  }
  if (parts[1] === "platform" && parts[2] === "access") {
    return { route: parts[3], id: parts[4], tab: parts[5] };
  }
  return { route: parts[2], id: parts[3], tab: parts[4] };
}

function applicationDetailTab(segment: string | undefined): ApplicationDetailTab {
  if (
    segment === "credentials"
    || segment === "uris"
    || segment === "scopes"
    || segment === "connections"
    || segment === "quickstart"
    || segment === "audit"
  ) {
    return segment;
  }
  return "overview";
}

function resourceDetailTab(segment: string | undefined): ResourceApiDetailTab {
  return segment === "audit" ? "audit" : "overview";
}

function bindingDetailTab(segment: string | undefined): M2mBindingDetailTab {
  return segment === "audit" ? "audit" : "overview";
}

// ── Applications ────────────────

function appsActions(clients: OAuthClient[]) {
  let current = [...clients];
  return {
    listClients: async (): Promise<OAuthClient[]> => current,
    createClient: async (data: CreateClientInput): Promise<OAuthClient> => {
      const created: OAuthClient = {
        client_id: `cli_new_${current.length + 1}`,
        client_secret: "sk-demo-secret-shown-once-xxxxxxxxxxxx",
        client_name: data.client_name ?? "New App",
        redirect_uris: data.redirect_uris,
        grant_types: data.grant_types ?? ["authorization_code", "refresh_token"],
        response_types: data.response_types ?? ["code"],
        token_endpoint_auth_method: data.token_endpoint_auth_method ?? "client_secret_post",
        scope: data.scope ?? "openid profile",
      };
      current = [created, ...current];
      return created;
    },
    updateClient: async (clientId: string, update: UpdateClientInput): Promise<OAuthClient> => {
      current = current.map((c) => (c.client_id === clientId ? { ...c, ...update } : c));
      return current.find((c) => c.client_id === clientId)!;
    },
    rotateClientSecret: async (_clientId: string) => ({ client_secret: "sk-rotated-secret-xxxxxxxxxxxxxxxxxxxx" }),
    deleteClient: async (clientId: string): Promise<void> => { current = current.filter((c) => c.client_id !== clientId); },
  };
}

// ── Resource APIs ───────────────

function rsActions(servers: ResourceServer[]) {
  let current = [...servers];
  return {
    listResourceServers: async (): Promise<ResourceServer[]> => current,
    createResourceServer: async (data: CreateResourceServerInput): Promise<ResourceServer> => {
      const created: ResourceServer = {
        id: `rs_new_${current.length + 1}`,
        organizationId: data.organizationId ?? null,
        slug: data.slug,
        name: data.name,
        audience: data.audience,
        description: data.description ?? null,
        enabled: true,
        createdBy: "user_001",
        updatedBy: "user_001",
        disabledAt: null,
        disabledBy: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      current = [created, ...current];
      return created;
    },
    updateResourceServer: async (id: string, data: UpdateResourceServerInput): Promise<ResourceServer> => {
      current = current.map((r) => (r.id === id ? { ...r, ...data } : r));
      return current.find((r) => r.id === id)!;
    },
    disableResourceServer: async (id: string): Promise<ResourceServer> => {
      current = current.map((r) => (r.id === id ? { ...r, enabled: false } : r));
      return current.find((r) => r.id === id)!;
    },
    enableResourceServer: async (id: string): Promise<ResourceServer> => {
      current = current.map((r) => (r.id === id ? { ...r, enabled: true, disabledAt: null, disabledBy: null } : r));
      return current.find((r) => r.id === id)!;
    },
    deleteResourceServer: async (id: string): Promise<void> => { current = current.filter((r) => r.id !== id); },
    listOrganizations: async (): Promise<Organization[]> => mockOrganizations,
  };
}

// ── Scope Catalog ───────────────

function scopeActions(scopes: OAuthResourceScope[]) {
  let current = [...scopes];
  return {
    listScopes: async (): Promise<OAuthResourceScope[]> => current,
    createScope: async (data: CreateScopeInput): Promise<OAuthResourceScope> => {
      const created: OAuthResourceScope = {
        id: `sc_new_${current.length + 1}`,
        resourceServerId: data.resourceServerId,
        scope: data.scope,
        description: data.description ?? null,
        enabled: true,
        createdBy: "user_001",
        updatedBy: "user_001",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      current = [created, ...current];
      return created;
    },
    updateScope: async (id: string, data: UpdateScopeInput): Promise<OAuthResourceScope> => {
      current = current.map((s) => (s.id === id ? { ...s, ...data } : s));
      return current.find((s) => s.id === id)!;
    },
    listResourceServers: async (): Promise<ResourceServer[]> => mockResourceServers,
  };
}

// ── M2M Bindings ────────────────

function bindingsActions(bindings: ClientResourceScope[]) {
  let current = [...bindings];
  return {
    listBindings: async (): Promise<ClientResourceScope[]> => current,
    createBinding: async (data: CreateBindingInput): Promise<ClientResourceScope> => {
      const created: ClientResourceScope = {
        id: `bind_new_${current.length + 1}`,
        clientId: data.clientId,
        resourceServerId: data.resourceServerId,
        allowedScopes: data.allowedScopes,
        enabled: true,
        createdBy: "user_001",
        updatedBy: "user_001",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      current = [created, ...current];
      return created;
    },
    updateBinding: async (id: string, data: UpdateBindingInput): Promise<ClientResourceScope> => {
      current = current.map((b) => (b.id === id ? { ...b, ...data } : b));
      return current.find((b) => b.id === id)!;
    },
    deleteBinding: async (id: string): Promise<void> => { current = current.filter((b) => b.id !== id); },
    listClients: async (): Promise<OAuthClient[]> => mockClients,
    listResourceServers: async (): Promise<ResourceServer[]> => mockResourceServers,
    listScopes: async (): Promise<OAuthResourceScope[]> => mockScopes,
  };
}

type OAuthStoryActions = {
  readonly appActions: ReturnType<typeof appsActions>;
  readonly resourceActions: ReturnType<typeof rsActions>;
  readonly catalogActions: ReturnType<typeof scopeActions>;
  readonly bindingActions: ReturnType<typeof bindingsActions>;
};

type OAuthRouteContext = OAuthStoryActions & {
  readonly route: string | undefined;
  readonly id: string | undefined;
  readonly tab: string | undefined;
  readonly navigate: (href: string) => void;
};

function renderApplicationRoute(context: OAuthRouteContext): ReactNode {
  const { id, tab, navigate, appActions, resourceActions, catalogActions, bindingActions } = context;
  if (id === "new") {
    return (
      <ApplicationCreateWizardContent
        backHref="/admin/platform/oauth/applications"
        onCreated={(clientId) => navigate(`/admin/platform/oauth/applications/${clientId}`)}
        actions={{ createClient: appActions.createClient, listScopes: catalogActions.listScopes }}
      />
    );
  }
  if (id) {
    const routeBasePath = `/admin/platform/oauth/applications/${id}`;
    return (
      <ApplicationDetailContent
        clientId={id}
        activeTab={applicationDetailTab(tab)}
        routeBasePath={routeBasePath}
        backHref="/admin/platform/oauth/applications"
        actions={{
          listClients: appActions.listClients,
          listBindings: bindingActions.listBindings,
          listResourceServers: resourceActions.listResourceServers,
          updateClient: appActions.updateClient,
          rotateClientSecret: appActions.rotateClientSecret,
          deleteClient: appActions.deleteClient,
        }}
        onDeleted={() => navigate("/admin/platform/oauth/applications")}
      />
    );
  }
  return (
    <ApplicationsContent
      createHref="/admin/platform/oauth/applications/new"
      actions={appActions}
      onClientClick={(clientId) => navigate(`/admin/platform/oauth/applications/${clientId}`)}
    />
  );
}

function renderResourceRoute(context: OAuthRouteContext): ReactNode {
  const { id, tab, navigate, resourceActions } = context;
  if (id) {
    const routeBasePath = `/admin/platform/access/resource-apis/${id}`;
    return (
      <ResourceApiDetailContent
        resourceServerId={id}
        activeTab={resourceDetailTab(tab)}
        routeBasePath={routeBasePath}
        backHref="/admin/platform/access/resource-apis"
        actions={{
          listResourceServers: resourceActions.listResourceServers,
          updateResourceServer: resourceActions.updateResourceServer,
          disableResourceServer: resourceActions.disableResourceServer,
          enableResourceServer: resourceActions.enableResourceServer,
          deleteResourceServer: resourceActions.deleteResourceServer,
        }}
        onDeleted={() => navigate("/admin/platform/access/resource-apis")}
      />
    );
  }
  return (
    <ResourceApisContent
      actions={resourceActions}
      onResourceClick={(resourceServerId) => navigate(`/admin/platform/access/resource-apis/${resourceServerId}`)}
    />
  );
}

function renderBindingRoute(context: OAuthRouteContext): ReactNode {
  const { id, tab, navigate, appActions, resourceActions, catalogActions, bindingActions } = context;
  if (id) {
    const routeBasePath = `/admin/platform/access/m2m-bindings/${id}`;
    return (
      <M2mBindingDetailContent
        bindingId={id}
        activeTab={bindingDetailTab(tab)}
        routeBasePath={routeBasePath}
        backHref="/admin/platform/access/m2m-bindings"
        actions={{
          listBindings: bindingActions.listBindings,
          listClients: appActions.listClients,
          listResourceServers: resourceActions.listResourceServers,
          listScopes: catalogActions.listScopes,
          updateBinding: bindingActions.updateBinding,
          deleteBinding: bindingActions.deleteBinding,
        }}
        onDeleted={() => navigate("/admin/platform/access/m2m-bindings")}
      />
    );
  }
  return (
    <M2mBindingsContent
      actions={bindingActions}
      onBindingClick={(bindingId) => navigate(`/admin/platform/access/m2m-bindings/${bindingId}`)}
    />
  );
}

function renderServiceAccountRoute(context: OAuthRouteContext): ReactNode {
  const { id, navigate, appActions, catalogActions } = context;
  if (id === "new") {
    return (
      <ApplicationCreateWizardContent
        defaultKind="M2M"
        title="New Service Account"
        backHref="/admin/platform/access/service-accounts"
        backLabel="Service Accounts"
        completeLabel="Create service account"
        onCreated={(clientId) => navigate(`/admin/platform/oauth/applications/${clientId}`)}
        actions={{ createClient: appActions.createClient, listScopes: catalogActions.listScopes }}
      />
    );
  }
  return (
    <ApplicationsContent
      variant="serviceAccounts"
      createHref="/admin/platform/access/service-accounts/new"
      actions={appActions}
      onClientClick={(clientId) => navigate(`/admin/platform/oauth/applications/${clientId}`)}
    />
  );
}

function renderOAuthContent(context: OAuthRouteContext): ReactNode {
  if (context.route === "service-accounts") return renderServiceAccountRoute(context);
  if (context.route === "resource-apis") return renderResourceRoute(context);
  if (context.route === "scope-catalog") return <ScopeCatalogContent actions={context.catalogActions} />;
  if (context.route === "m2m-bindings") return renderBindingRoute(context);
  return renderApplicationRoute(context);
}

function linkHrefFromEvent(event: MouseEvent<HTMLDivElement>): string | undefined {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return undefined;
  const rawTarget = event.target;
  const target = rawTarget instanceof Element
    ? rawTarget.closest("a[href]")
    : rawTarget instanceof Node
      ? rawTarget.parentElement?.closest("a[href]")
      : null;
  const href = target?.getAttribute("href");
  if (!href?.startsWith("/")) return undefined;
  const targetAttr = target.getAttribute("target");
  return targetAttr && targetAttr !== "_self" ? undefined : href;
}

function OAuthRoutes({ initialPath }: { readonly initialPath: string }) {
  const { pathname, navigate } = useLadleRoute(initialPath);
  const appActions = useMemo(() => appsActions(mockClients), []);
  const resourceActions = useMemo(() => rsActions(mockResourceServers), []);
  const catalogActions = useMemo(() => scopeActions(mockScopes), []);
  const bindingActions = useMemo(() => bindingsActions(mockBindings), []);
  const { route, id, tab } = oauthRouteContext(pathname);
  const content = renderOAuthContent({ route, id, tab, navigate, appActions, resourceActions, catalogActions, bindingActions });

  function handleRouteLink(event: MouseEvent<HTMLDivElement>) {
    const href = linkHrefFromEvent(event);
    if (!href) return;
    event.preventDefault();
    navigate(href);
  }

  return (
    <div onClickCapture={handleRouteLink}>
      <OAuthShell key={pathname} activePath={pathname}>{content}</OAuthShell>
    </div>
  );
}

export const Applications: Story = () => <OAuthRoutes initialPath="/admin/platform/oauth/applications" />;

export const ApplicationDetail: Story = () => <OAuthRoutes initialPath="/admin/platform/oauth/applications/cli_contentapi_a1b2c3d4e5f6" />;

export const ApplicationNewWizard: Story = () => <OAuthRoutes initialPath="/admin/platform/oauth/applications/new" />;

export const ServiceAccounts: Story = () => <OAuthRoutes initialPath="/admin/platform/access/service-accounts" />;

export const ServiceAccountNewWizard: Story = () => <OAuthRoutes initialPath="/admin/platform/access/service-accounts/new" />;

export const ResourceAPIs: Story = () => <OAuthRoutes initialPath="/admin/platform/access/resource-apis" />;

export const ResourceApiDetail: Story = () => <OAuthRoutes initialPath="/admin/platform/access/resource-apis/rs_001" />;

export const ScopeCatalog: Story = () => <OAuthRoutes initialPath="/admin/platform/access/scope-catalog" />;

export const M2mBindings: Story = () => <OAuthRoutes initialPath="/admin/platform/access/m2m-bindings" />;

export const M2mBindingDetail: Story = () => <OAuthRoutes initialPath="/admin/platform/access/m2m-bindings/bind_001" />;

// ── Shared states ───────────────

export const Loading: Story = () => (
  <OAuthShell activePath="/admin/platform/oauth/applications">
    <ApplicationsContent loading />
  </OAuthShell>
);

export const Error: Story = () => (
  <OAuthShell activePath="/admin/platform/oauth/applications">
    <ApplicationsContent error="Failed to load OAuth configuration" />
  </OAuthShell>
);
