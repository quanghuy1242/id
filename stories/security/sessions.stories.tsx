import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { SessionsContent } from "../../workers/ui/src/app/admin/_components/security/sessions-content";
import type { AdminSession, Paginated } from "../../workers/ui/src/app/admin/_actions/audit";
import { mockSessions } from "../../workers/ui/src/app/admin/_mocks/audit";
import { AdminShell } from "../_decorators/shell";

export default { title: "Security / Sessions" } satisfies StoryDefault;

const ACTIVE = "/admin/security/sessions";

function makeActions(sessions: AdminSession[]) {
  return {
    listAdminSessions: async (p: { limit: number; offset: number }): Promise<Paginated<"sessions", AdminSession>> =>
      ({ sessions, total: sessions.length, limit: p.limit, offset: p.offset }),
    revokeUserSession: async (_token: string) => undefined,
  };
}

export const Populated: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsContent actions={makeActions(mockSessions)} />
    </PageBody>
  </AdminShell>
);

export const Empty: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsContent actions={makeActions([])} />
    </PageBody>
  </AdminShell>
);

export const Loading: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsContent loading />
    </PageBody>
  </AdminShell>
);

export const Error: Story = () => (
  <AdminShell activePath={ACTIVE}>
    <PageBody>
      <SessionsContent error="Failed to load sessions" />
    </PageBody>
  </AdminShell>
);
