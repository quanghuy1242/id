import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { UsersListContent } from "../../workers/ui/src/app/admin/_components/identity/users-list-content";
import { AdminShell } from "../_decorators/shell";
import { mockUsers } from "../../workers/ui/src/app/admin/_mocks/users";

// Intercept fetch at the URL level — vi.mock is Vitest-only and unavailable in Ladle's Vite context.
function mockFetch(users: typeof mockUsers, total: number) {
  window.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/api/auth/admin/list-users")) {
      return new Response(
        JSON.stringify({ users, total, limit: 25, offset: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/api/auth/admin/create-user")) {
      return new Response(
        JSON.stringify({ user: users[0] ?? mockUsers[0] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  };
}

export default { title: "Identity / Users List" } satisfies StoryDefault;

export const Populated: Story = () => {
  mockFetch(mockUsers, mockUsers.length);
  return (
    <AdminShell activePath="/admin/identity/users">
      <PageBody>
        <UsersListContent />
      </PageBody>
    </AdminShell>
  );
};

export const Empty: Story = () => {
  mockFetch([], 0);
  return (
    <AdminShell activePath="/admin/identity/users">
      <PageBody>
        <UsersListContent />
      </PageBody>
    </AdminShell>
  );
};

// loading prop skips internal fetch entirely and shows Skeleton immediately.
export const Loading: Story = () => (
  <AdminShell activePath="/admin/identity/users">
    <PageBody>
      <UsersListContent loading />
    </PageBody>
  </AdminShell>
);

// error prop skips internal fetch entirely and shows ErrorAlert immediately.
export const Error: Story = () => (
  <AdminShell activePath="/admin/identity/users">
    <PageBody>
      <UsersListContent error="Failed to load users: Network error" />
    </PageBody>
  </AdminShell>
);
