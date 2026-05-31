import type { Story, StoryDefault } from "@ladle/react";
import { TokensContent } from "../../workers/ui/src/app/admin/_components/security/tokens-content";
import type { AdminToken, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockTokens, mockRefreshTokens } from "../../workers/ui/src/app/admin/_mocks/audit";
import { SecurityShell } from "../_decorators/security-shell";

export default { title: "Admin / Grants & Keys / Tokens" } satisfies StoryDefault;

const ACTIVE = "/admin/platform/security/tokens?type=access";

function makeActions(access: AdminToken[], refresh: AdminToken[]) {
  return {
    listAdminTokens: async (p: { limit: number; offset: number; type: "access" | "refresh" }): Promise<Paginated<"tokens", AdminToken>> => {
      const tokens = p.type === "refresh" ? refresh : access;
      return { tokens, total: tokens.length, limit: p.limit, offset: p.offset };
    },
  };
}

export const Populated: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <TokensContent type="access" actions={makeActions(mockTokens, mockRefreshTokens)} />
  </SecurityShell>
);

export const Refresh: Story = () => (
  <SecurityShell activePath="/admin/platform/security/tokens?type=refresh">
    <TokensContent type="refresh" actions={makeActions(mockTokens, mockRefreshTokens)} />
  </SecurityShell>
);

export const Empty: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <TokensContent type="access" actions={makeActions([], [])} />
  </SecurityShell>
);

export const Loading: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <TokensContent type="access" loading />
  </SecurityShell>
);

export const Error: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <TokensContent type="access" error="Failed to load tokens" />
  </SecurityShell>
);
