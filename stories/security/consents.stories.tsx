import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { ConsentsContent } from "../../workers/ui/src/app/admin/_components/security/consents-content";
import type { AdminConsent, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import type { OAuthClient } from "../../workers/ui/src/app/admin/_actions/oauth";
import { mockConsents } from "../../workers/ui/src/app/admin/_mocks/security";
import { mockClients } from "../../workers/ui/src/app/admin/_mocks/oauth";
import { AdminShell } from "../_decorators/shell";

export default { title: "Security / Consents" } satisfies StoryDefault;

const ACTIVE = "/admin/security/consents";

function makeActions(consents: AdminConsent[]) {
  let current = [...consents];
  return {
    listAdminConsents: async (p: { limit: number; offset: number; clientId?: string }): Promise<Paginated<"consents", AdminConsent>> => {
      const filtered = p.clientId ? current.filter((c) => c.clientId === p.clientId) : current;
      return { consents: filtered, total: filtered.length, limit: p.limit, offset: p.offset };
    },
    revokeConsent: async (clientId: string, userId: string) => { current = current.filter((c) => !(c.clientId === clientId && c.userId === userId)); },
    listClients: async (): Promise<OAuthClient[]> => mockClients,
  };
}

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ConsentsContent actions={makeActions(mockConsents)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ConsentsContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ConsentsContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <ConsentsContent error="Failed to load consents" />
    </PageBody>
  </AdminShell>
);
