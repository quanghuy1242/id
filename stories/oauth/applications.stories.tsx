import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { ApplicationsContent } from "../../workers/ui/src/app/admin/_components/oauth/applications-content";
import type { OAuthClient, CreateClientInput, UpdateClientInput } from "../../workers/ui/src/app/admin/_actions/oauth";
import { mockClients } from "../../workers/ui/src/app/admin/_mocks/oauth";
import { AdminShell } from "../_decorators/shell";

export default { title: "OAuth / Applications" } satisfies StoryDefault;

const ACTIVE = "/admin/oauth/applications";

function makeActions(clients: OAuthClient[]) {
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

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ApplicationsContent actions={makeActions(mockClients)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ApplicationsContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const CreateDialog: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ApplicationsContent actions={makeActions(mockClients)} defaultCreateOpen />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ApplicationsContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ApplicationsContent error="Failed to load applications" />
    </PageBody>
  </AdminShell>
);
