import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { ScopeCatalogContent } from "../../workers/ui/src/app/admin/_components/oauth/scope-catalog-content";
import type {
  OAuthResourceScope,
  ResourceServer,
  CreateScopeInput,
  UpdateScopeInput,
} from "../../workers/ui/src/app/admin/_actions/oauth";
import { mockScopes, mockResourceServers } from "../../workers/ui/src/app/admin/_mocks/oauth";
import { AdminShell } from "../_decorators/shell";

export default { title: "OAuth / Scope Catalog" } satisfies StoryDefault;

const ACTIVE = "/admin/oauth/scope-catalog";

function makeActions(scopes: OAuthResourceScope[]) {
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

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ScopeCatalogContent actions={makeActions(mockScopes)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ScopeCatalogContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const CreateDialog: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ScopeCatalogContent actions={makeActions(mockScopes)} defaultCreateOpen />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ScopeCatalogContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ScopeCatalogContent error="Failed to load scopes" />
    </PageBody>
  </AdminShell>
);
