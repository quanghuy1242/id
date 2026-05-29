import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { ResourceApisContent } from "../../workers/ui/src/app/admin/_components/oauth/resource-apis-content";
import type {
  ResourceServer,
  CreateResourceServerInput,
  UpdateResourceServerInput,
} from "../../workers/ui/src/app/admin/_actions/oauth";
import type { Organization } from "../../workers/ui/src/app/admin/_actions/organizations";
import { mockResourceServers } from "../../workers/ui/src/app/admin/_mocks/oauth";
import { mockOrganizations } from "../../workers/ui/src/app/admin/_mocks/organizations";
import { AdminShell } from "../_decorators/shell";

export default { title: "OAuth / Resource APIs" } satisfies StoryDefault;

const ACTIVE = "/admin/oauth/resource-apis";

function makeActions(servers: ResourceServer[]) {
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

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ResourceApisContent actions={makeActions(mockResourceServers)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ResourceApisContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const CreateDialog: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ResourceApisContent actions={makeActions(mockResourceServers)} defaultCreateOpen />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ResourceApisContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ResourceApisContent error="Failed to load resource APIs" />
    </PageBody>
  </AdminShell>
);
