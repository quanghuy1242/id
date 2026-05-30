import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { TokensContent } from "../../workers/ui/src/app/admin/_components/security/tokens-content";
import type { AdminToken, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockTokens, mockRefreshTokens } from "../../workers/ui/src/app/admin/_mocks/audit";
import { AdminShell } from "../_decorators/shell";

export default { title: "Security / Tokens" } satisfies StoryDefault;

const ACTIVE = "/admin/security/tokens?type=access";

function makeActions(access: AdminToken[], refresh: AdminToken[]) {
  return {
    listAdminTokens: async (p: { limit: number; offset: number; type: "access" | "refresh" }): Promise<Paginated<"tokens", AdminToken>> => {
      const tokens = p.type === "refresh" ? refresh : access;
      return { tokens, total: tokens.length, limit: p.limit, offset: p.offset };
    },
  };
}

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <TokensContent type="access" actions={makeActions(mockTokens, mockRefreshTokens)} />
    </PageBody>
  </AdminShell>
);

export const Refresh: Story = () => (
  <AdminShell activePath="/admin/security/tokens?type=refresh">
    <PageBody>
      <TokensContent type="refresh" actions={makeActions(mockTokens, mockRefreshTokens)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <TokensContent type="access" actions={makeActions([], [])} />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <TokensContent type="access" loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <TokensContent type="access" error="Failed to load tokens" />
    </PageBody>
  </AdminShell>
);
