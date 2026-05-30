import type { Story, StoryDefault } from "@ladle/react";
import { SessionsContent } from "../../workers/ui/src/app/admin/_components/security/sessions-content";
import type { AdminSession, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockSessions } from "../../workers/ui/src/app/admin/_mocks/audit";
import { SecurityShell } from "../_decorators/security-shell";

export default { title: "Admin / Grants & Keys / Sessions" } satisfies StoryDefault;

const ACTIVE = "/admin/security/sessions";

function makeActions(sessions: AdminSession[]) {
  return {
    listAdminSessions: async (p: { limit: number; offset: number }): Promise<Paginated<"sessions", AdminSession>> =>
      ({ sessions, total: sessions.length, limit: p.limit, offset: p.offset }),
    revokeAdminSession: async (_sessionId: string) => undefined,
  };
}

export const Populated: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <SessionsContent actions={makeActions(mockSessions)} />
  </SecurityShell>
);

export const Empty: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <SessionsContent actions={makeActions([])} />
  </SecurityShell>
);

export const Loading: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <SessionsContent loading />
  </SecurityShell>
);

export const Error: Story = () => (
  <SecurityShell activePath={ACTIVE}>
    <SessionsContent error="Failed to load sessions" />
  </SecurityShell>
);
