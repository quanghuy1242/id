import type { Story, StoryDefault } from "@ladle/react";
import { ConsentsContent } from "../../workers/ui/src/app/admin/_components/security/consents-content";
import type { AdminConsent, ConsentListParams, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import type { OAuthClient } from "../../workers/ui/src/app/admin/_actions/oauth";
import type { ActiveScope } from "@id/lib";
import { mockConsents } from "../../workers/ui/src/app/admin/_mocks/security";
import { mockClients } from "../../workers/ui/src/app/admin/_mocks/oauth";
import { SecurityShell } from "../_decorators/security-shell";
import { AdminShell } from "../_decorators/shell";

export default { title: "Admin / Grants & Keys / Consents" } satisfies StoryDefault;

const ACTIVE = "/admin/platform/security/consents";
// NOTE: consents now live in the unified grants section (docs/027 §6).
const orgStoryClients = mockClients.map((client) =>
  Object.assign({}, client, { reference_id: "org_001" }),
);

function makeActions(consents: AdminConsent[]) {
  let current = [...consents];
  return {
    listAdminConsents: async (p: ConsentListParams): Promise<Paginated<"consents", AdminConsent>> => {
      const filtered = p.clientId ? current.filter((c) => c.clientId === p.clientId) : current;
      return { consents: filtered, total: filtered.length, limit: p.limit, offset: p.offset };
    },
    revokeConsent: async (clientId: string, userId: string) => { current = current.filter((c) => !(c.clientId === clientId && c.userId === userId)); },
    listClients: async (scope?: ActiveScope): Promise<OAuthClient[]> =>
      scope?.kind === "organization"
        ? orgStoryClients.filter((client) => client.reference_id === scope.organizationId)
        : mockClients,
  };
}

export const Populated: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <ConsentsContent actions={makeActions(mockConsents)} />
  </SecurityShell>
);

export const Empty: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <ConsentsContent actions={makeActions([])} />
  </SecurityShell>
);

export const Loading: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <ConsentsContent loading />
  </SecurityShell>
);

export const Error: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <ConsentsContent error="Failed to load consents" />
  </SecurityShell>
);

export const OrganizationScope: Story = () => (
  <AdminShell activePath="/admin/orgs/org_001/security/consents">
    <ConsentsContent
      scope={{ kind: "organization", organizationId: "org_001" }}
      actions={makeActions(mockConsents)}
    />
  </AdminShell>
);
