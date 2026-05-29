import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { JwksContent } from "../../workers/ui/src/app/admin/_components/security/jwks-content";
import type { AdminJwk } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockAdminJwks } from "../../workers/ui/src/app/admin/_mocks/security";
import { AdminShell } from "../_decorators/shell";

export default { title: "Security / JWKS" } satisfies StoryDefault;

const ACTIVE = "/admin/security/jwks";

function makeActions(keys: AdminJwk[]) {
  return { listJwks: async (): Promise<AdminJwk[]> => keys };
}

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksContent actions={makeActions(mockAdminJwks)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksContent error="Failed to load JWKS" />
    </PageBody>
  </AdminShell>
);
