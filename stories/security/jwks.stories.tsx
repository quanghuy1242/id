import type { Story, StoryDefault } from "@ladle/react";
import { JwksContent } from "../../workers/ui/src/app/admin/_components/security/jwks-content";
import { JwksDetailContent } from "../../workers/ui/src/app/admin/_components/security/jwks-detail-content";
import type { AdminJwk } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockAdminJwks } from "../../workers/ui/src/app/admin/_mocks/security";
import { SecurityShell } from "../_decorators/security-shell";

export default { title: "Admin / Grants & Keys / Signing Keys" } satisfies StoryDefault;

const ACTIVE = "/admin/platform/security/jwks";

function makeActions(keys: AdminJwk[]) {
  return {
    listJwks: async (): Promise<AdminJwk[]> => keys,
    rotateJwks: async (reason: string): Promise<AdminJwk & { reason: string }> => ({ ...(keys[0] ?? mockAdminJwks[0]), reason }),
  };
}

export const Populated: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <JwksContent actions={makeActions(mockAdminJwks)} />
  </SecurityShell>
);

export const Empty: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <JwksContent actions={makeActions([])} />
  </SecurityShell>
);

export const Loading: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <JwksContent loading />
  </SecurityShell>
);

export const Error: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <JwksContent error="Failed to load JWKS" />
  </SecurityShell>
);

export const DetailOverview: Story = () => (
  <SecurityShell activePath="/admin/platform/security/jwks/abc123def456">
    <JwksDetailContent kid="abc123def456" actions={makeActions(mockAdminJwks)} />
  </SecurityShell>
);

export const DetailPublicJwk: Story = () => (
  <SecurityShell activePath="/admin/platform/security/jwks/abc123def456/public-jwk">
    <JwksDetailContent kid="abc123def456" activeTab="public-jwk" actions={makeActions(mockAdminJwks)} />
  </SecurityShell>
);

export const DetailMetrics: Story = () => (
  <SecurityShell activePath="/admin/platform/security/jwks/abc123def456/metrics">
    <JwksDetailContent kid="abc123def456" activeTab="metrics" actions={makeActions(mockAdminJwks)} />
  </SecurityShell>
);

export const DetailNotFound: Story = () => (
  <SecurityShell activePath="/admin/platform/security/jwks/missing-key">
    <JwksDetailContent kid="missing-key" actions={makeActions(mockAdminJwks)} />
  </SecurityShell>
);
