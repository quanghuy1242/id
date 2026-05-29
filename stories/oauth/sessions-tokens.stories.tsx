import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { SessionsTokensContent } from "../../workers/ui/src/app/admin/_components/oauth/sessions-tokens-content";
import type { AdminSession, AdminToken, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockSessions, mockTokens, mockRefreshTokens } from "../../workers/ui/src/app/admin/_mocks/audit";
import { AdminShell } from "../_decorators/shell";

export default { title: "OAuth / Sessions & Tokens" } satisfies StoryDefault;

const ACTIVE = "/admin/oauth/sessions-tokens";

function makeActions(sessions: AdminSession[], access: AdminToken[], refresh: AdminToken[]) {
  return {
    listAdminSessions: async (p: { limit: number; offset: number }): Promise<Paginated<"sessions", AdminSession>> =>
      ({ sessions, total: sessions.length, limit: p.limit, offset: p.offset }),
    listAdminTokens: async (p: { limit: number; offset: number; type: "access" | "refresh" }): Promise<Paginated<"tokens", AdminToken>> => {
      const tokens = p.type === "refresh" ? refresh : access;
      return { tokens, total: tokens.length, limit: p.limit, offset: p.offset };
    },
    revokeUserSession: async (_token: string) => undefined,
  };
}

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsTokensContent actions={makeActions(mockSessions, mockTokens, mockRefreshTokens)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsTokensContent actions={makeActions([], [], [])} />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsTokensContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsTokensContent error="Failed to load sessions" />
    </PageBody>
  </AdminShell>
);
