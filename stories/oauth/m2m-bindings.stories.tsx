import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { M2mBindingsContent } from "../../workers/ui/src/app/admin/_components/oauth/m2m-bindings-content";
import type {
  ClientResourceScope,
  OAuthClient,
  ResourceServer,
  OAuthResourceScope,
  CreateBindingInput,
  UpdateBindingInput,
} from "../../workers/ui/src/app/admin/_actions/oauth";
import {
  mockBindings,
  mockClients,
  mockResourceServers,
  mockScopes,
} from "../../workers/ui/src/app/admin/_mocks/oauth";
import { AdminShell } from "../_decorators/shell";

export default { title: "OAuth / M2M Bindings" } satisfies StoryDefault;

const ACTIVE = "/admin/oauth/m2m-bindings";

function makeActions(bindings: ClientResourceScope[]) {
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

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <M2mBindingsContent actions={makeActions(mockBindings)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <M2mBindingsContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const CreateDialog: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <M2mBindingsContent actions={makeActions(mockBindings)} defaultCreateOpen />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <M2mBindingsContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <M2mBindingsContent error="Failed to load bindings" />
    </PageBody>
  </AdminShell>
);
