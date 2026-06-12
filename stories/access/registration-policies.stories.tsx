import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@idco/ui";
import { RegistrationPoliciesContent } from "../../workers/ui/src/app/admin/_components/access/registration-policies-content";
import { mockRegistrationIntents, mockRegistrationPolicies } from "../../workers/ui/src/app/admin/_mocks/registration-policies";
import type { RegistrationPolicy, RegistrationPolicyFormInput } from "../../workers/ui/src/app/admin/_actions/registration-policies";
import type { OAuthClient, OAuthResourceScope, ResourceServer } from "../../workers/ui/src/app/admin/_actions/oauth";
import type { Organization, Team } from "../../workers/ui/src/app/admin/_actions/organizations";
import { AdminShell } from "../_decorators/shell";

export default { title: "Admin / Access / Registration Policies" } satisfies StoryDefault;

const platformPath = "/admin/platform/access/registration-policies";

const mockClients: OAuthClient[] = [
  {
    client_id: "cli_content_web",
    client_name: "Content Web",
    redirect_uris: ["https://content.example.test/callback"],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
    scope: "openid profile email",
    type: "web",
  },
  {
    client_id: "cli_mobile",
    client_name: "Mobile App",
    redirect_uris: ["com.acme.app://callback"],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "openid profile",
    type: "native",
    public: true,
  },
];

const mockOrganizations: Organization[] = [
  { id: "org_001", name: "Acme Inc", slug: "acme", logo: null, metadata: null, createdAt: new Date().toISOString() },
  { id: "org_002", name: "Globex", slug: "globex", logo: null, metadata: null, createdAt: new Date().toISOString() },
];

const mockResourceServers: ResourceServer[] = [
  {
    id: "rs_content",
    organizationId: null,
    slug: "content-api",
    name: "Content API",
    audience: "https://content.example.test",
    description: "Content delivery API",
    enabled: true,
    createdBy: "admin",
    updatedBy: "admin",
    disabledAt: null,
    disabledBy: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockScopes: OAuthResourceScope[] = [
  { id: "sc_read", resourceServerId: "rs_content", scope: "content:read", description: "Read content", enabled: true, createdBy: "admin", updatedBy: "admin", createdAt: Date.now(), updatedAt: Date.now() },
  { id: "sc_write", resourceServerId: "rs_content", scope: "content:write", description: "Write content", enabled: true, createdBy: "admin", updatedBy: "admin", createdAt: Date.now(), updatedAt: Date.now() },
];

const mockTeams: Team[] = [
  { id: "team_readers", name: "Readers", organizationId: "org_001", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "team_writers", name: "Writers", organizationId: "org_001", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

function actions(policies: RegistrationPolicy[]) {
  let current = [...policies];
  const setStatus = async (id: string, status: RegistrationPolicy["status"]) => {
    const policy = current.find((entry) => entry.id === id);
    if (!policy) throw new Error("Policy not found");
    const next = { ...policy, status, updatedAt: Date.now() };
    current = current.map((entry) => entry.id === id ? next : entry);
    return next;
  };
  return {
    listRegistrationPolicies: async () => current,
    createRegistrationPolicy: async (input: RegistrationPolicyFormInput) => {
      const next = {
        ...mockRegistrationPolicies[0]!,
        ...input,
        id: "regpol_created",
        status: "draft" as const,
        quota: {
          policyId: "regpol_created",
          quotaLimit: input.quotaLimit ?? null,
          quotaUsed: 0,
          quotaReserved: 0,
          quotaTarget: input.quotaTarget ?? "memberships",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      current = [next, ...current];
      return next;
    },
    updateRegistrationPolicy: async (id: string, input: Partial<RegistrationPolicyFormInput>) => {
      const policy = current.find((entry) => entry.id === id);
      if (!policy) throw new Error("Policy not found");
      const next = {
        ...policy,
        ...input,
        quota: {
          ...policy.quota,
          quotaLimit: input.quotaLimit === undefined ? policy.quota.quotaLimit : input.quotaLimit,
          quotaTarget: input.quotaTarget ?? policy.quota.quotaTarget,
        },
        updatedAt: Date.now(),
      };
      current = current.map((entry) => entry.id === id ? next : entry);
      return next;
    },
    enableRegistrationPolicy: (id: string) => setStatus(id, "enabled"),
    pauseRegistrationPolicy: (id: string) => setStatus(id, "paused"),
    archiveRegistrationPolicy: (id: string) => setStatus(id, "archived"),
    listRegistrationPolicyIntents: async () => mockRegistrationIntents,
    listClients: async () => mockClients,
    listResourceServers: async () => mockResourceServers,
    listScopes: async () => mockScopes,
    listOrganizations: async () => mockOrganizations,
    listTeams: async () => mockTeams,
  };
}

export const Populated: Story = () => (
  <AdminShell activePath={platformPath}>
    <PageBody>
      <RegistrationPoliciesContent actions={actions(mockRegistrationPolicies)} selectedId="regpol_content_beta" />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={platformPath}>
    <PageBody>
      <RegistrationPoliciesContent actions={actions([])} />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={platformPath}>
    <PageBody>
      <RegistrationPoliciesContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={platformPath}>
    <PageBody>
      <RegistrationPoliciesContent error="Failed to load registration policies" />
    </PageBody>
  </AdminShell>
);
