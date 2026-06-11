import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@idco/ui";
import { RegistrationPoliciesContent } from "../../workers/ui/src/app/admin/_components/identity/registration-policies-content";
import { mockRegistrationIntents, mockRegistrationPolicies } from "../../workers/ui/src/app/admin/_mocks/registration-policies";
import type { RegistrationPolicy } from "../../workers/ui/src/app/admin/_actions/registration-policies";
import { AdminShell } from "../_decorators/shell";

export default { title: "Admin / Identity / Registration Policies" } satisfies StoryDefault;

const platformPath = "/admin/platform/identity/registration-policies";

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
    enableRegistrationPolicy: (id: string) => setStatus(id, "enabled"),
    pauseRegistrationPolicy: (id: string) => setStatus(id, "paused"),
    archiveRegistrationPolicy: (id: string) => setStatus(id, "archived"),
    listRegistrationPolicyIntents: async () => mockRegistrationIntents,
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
