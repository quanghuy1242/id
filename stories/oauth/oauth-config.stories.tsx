import type { ReactNode } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { PageBody, Stack, Tabs } from "@id/ui";
import { ApplicationsContent } from "../../workers/ui/src/app/admin/_components/oauth/applications-content";
import { ApplicationCreateWizardContent } from "../../workers/ui/src/app/admin/_components/oauth/application-create-wizard-content";
import { ApplicationDetailContent } from "../../workers/ui/src/app/admin/_components/oauth/application-detail-content";
import { ResourceApisContent } from "../../workers/ui/src/app/admin/_components/oauth/resource-apis-content";
import { ResourceApiDetailContent } from "../../workers/ui/src/app/admin/_components/oauth/resource-api-detail-content";
import { ScopeCatalogContent } from "../../workers/ui/src/app/admin/_components/oauth/scope-catalog-content";
import { M2mBindingsContent } from "../../workers/ui/src/app/admin/_components/oauth/m2m-bindings-content";
import { M2mBindingDetailContent } from "../../workers/ui/src/app/admin/_components/oauth/m2m-binding-detail-content";
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
  { id: "/admin/oauth/applications", href: "/admin/oauth/applications", label: "Applications" },
  { id: "/admin/oauth/resource-apis", href: "/admin/oauth/resource-apis", label: "Resource APIs" },
  { id: "/admin/oauth/scope-catalog", href: "/admin/oauth/scope-catalog", label: "Scope Catalog" },
  { id: "/admin/oauth/m2m-bindings", href: "/admin/oauth/m2m-bindings", label: "M2M Bindings" },
];

function OAuthShell({ activePath, children }: { activePath: string; children: ReactNode }) {
  const selectedKey = tabs.find((t) => activePath.startsWith(t.id))?.id ?? tabs[0].id;
  return (
    <AdminShell activePath={activePath}>
      <PageBody>
        <Stack gap="md">
          <Tabs ariaLabel="OAuth configuration" items={tabs} selectedKey={selectedKey} />
          {children}
        </Stack>
      </PageBody>
    </AdminShell>
  );
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

export const Applications: Story = () => (
  <OAuthShell activePath="/admin/oauth/applications">
    <ApplicationsContent createHref="/admin/oauth/applications/new" actions={appsActions(mockClients)} />
  </OAuthShell>
);

export const ApplicationDetail: Story = () => (
  <OAuthShell activePath="/admin/oauth/applications/cli_contentapi_a1b2c3d4e5f6">
    <ApplicationDetailContent
      clientId="cli_contentapi_a1b2c3d4e5f6"
      actions={{
        listClients: async () => mockClients,
        listBindings: async () => mockBindings,
        listResourceServers: async () => mockResourceServers,
      }}
    />
  </OAuthShell>
);

export const ApplicationNewWizard: Story = () => (
  <OAuthShell activePath="/admin/oauth/applications/new">
    <ApplicationCreateWizardContent
      actions={{
        createClient: appsActions(mockClients).createClient,
        listScopes: async () => mockScopes,
      }}
    />
  </OAuthShell>
);

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

export const ResourceAPIs: Story = () => (
  <OAuthShell activePath="/admin/oauth/resource-apis">
    <ResourceApisContent actions={rsActions(mockResourceServers)} />
  </OAuthShell>
);

export const ResourceApiDetail: Story = () => (
  <OAuthShell activePath="/admin/oauth/resource-apis/rs_001">
    <ResourceApiDetailContent resourceServerId="rs_001" actions={{ listResourceServers: async () => mockResourceServers }} />
  </OAuthShell>
);

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

export const ScopeCatalog: Story = () => (
  <OAuthShell activePath="/admin/oauth/scope-catalog">
    <ScopeCatalogContent actions={scopeActions(mockScopes)} />
  </OAuthShell>
);

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

export const M2mBindings: Story = () => (
  <OAuthShell activePath="/admin/oauth/m2m-bindings">
    <M2mBindingsContent actions={bindingsActions(mockBindings)} />
  </OAuthShell>
);

export const M2mBindingDetail: Story = () => (
  <OAuthShell activePath="/admin/oauth/m2m-bindings/bind_001">
    <M2mBindingDetailContent bindingId="bind_001" actions={{
      listBindings: async () => mockBindings,
      listClients: async () => mockClients,
      listResourceServers: async () => mockResourceServers,
    }} />
  </OAuthShell>
);

// ── Shared states ───────────────

export const Loading: Story = () => (
  <OAuthShell activePath="/admin/oauth/applications">
    <ApplicationsContent loading />
  </OAuthShell>
);

export const Error: Story = () => (
  <OAuthShell activePath="/admin/oauth/applications">
    <ApplicationsContent error="Failed to load OAuth configuration" />
  </OAuthShell>
);
