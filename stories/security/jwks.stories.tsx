import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { JwksContent } from "../../workers/ui/src/app/admin/_components/security/jwks-content";
import { JwksDetailContent } from "../../workers/ui/src/app/admin/_components/security/jwks-detail-content";
import type { AdminJwk } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockAdminJwks } from "../../workers/ui/src/app/admin/_mocks/security";
import { AdminShell } from "../_decorators/shell";

export default { title: "Security / JWKS" } satisfies StoryDefault;

const ACTIVE = "/admin/security/jwks";

function makeActions(keys: AdminJwk[]) {
  return {
    listJwks: async (): Promise<AdminJwk[]> => keys,
    rotateJwks: async (reason: string): Promise<AdminJwk & { reason: string }> => ({ ...(keys[0] ?? mockAdminJwks[0]), reason }),
  };
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

export const DetailOverview: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksDetailContent kid="abc123def456" actions={makeActions(mockAdminJwks)} />
    </PageBody>
  </AdminShell>
);

export const DetailPublicJwk: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksDetailContent kid="abc123def456" activeTab="public-jwk" actions={makeActions(mockAdminJwks)} />
    </PageBody>
  </AdminShell>
);

export const DetailMetrics: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksDetailContent kid="abc123def456" activeTab="metrics" actions={makeActions(mockAdminJwks)} />
    </PageBody>
  </AdminShell>
);

export const DetailNotFound: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <JwksDetailContent kid="missing-key" actions={makeActions(mockAdminJwks)} />
    </PageBody>
  </AdminShell>
);
