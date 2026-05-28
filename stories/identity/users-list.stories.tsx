import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { UsersListContent } from "../../workers/ui/src/app/admin/_components/identity/users-list-content";
import type { CreateUserBody, ListUsersParams, User } from "../../workers/ui/src/app/admin/_actions/users";
import { AdminShell } from "../_decorators/shell";
import { mockUsers } from "../../workers/ui/src/app/admin/_mocks/users";

function createStoryActions(initialUsers: readonly User[]) {
  let users = [...initialUsers];

  return {
    async listUsers(params: ListUsersParams) {
      const searchValue = params.searchValue?.toLowerCase();
      let filteredUsers = users.filter((user) => {
        const matchesSearch = searchValue
          ? user.name.toLowerCase().includes(searchValue) || user.email.toLowerCase().includes(searchValue)
          : true;
        const matchesRole = params.filterField === "role" && params.filterValue
          ? user.role === params.filterValue
          : true;
        return matchesSearch && matchesRole;
      });

      if (params.sortBy) {
        filteredUsers = [...filteredUsers].sort((a, b) => {
          const aVal = String(a[params.sortBy as keyof User] ?? "");
          const bVal = String(b[params.sortBy as keyof User] ?? "");
          const cmp = aVal.localeCompare(bVal);
          return params.sortDirection === "desc" ? -cmp : cmp;
        });
      }

      return {
        users: filteredUsers,
        total: filteredUsers.length,
        limit: params.limit ?? 25,
        offset: params.offset ?? 0,
      };
    },
    async createUser(body: CreateUserBody) {
      const user: User = {
        id: `story-user-${users.length + 1}`,
        name: body.name,
        email: body.email,
        emailVerified: false,
        image: null,
        role: body.role ?? "user",
        banned: false,
        banReason: null,
        banExpires: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      users = [user, ...users];
      return { user };
    },
  };
}

export default { title: "Identity / Users List" } satisfies StoryDefault;

export const Populated: Story = () => {
  const actions = createStoryActions(mockUsers);
  return (
    <AdminShell activePath="/admin/identity/users">
      <PageBody>
        <UsersListContent actions={actions} />
      </PageBody>
    </AdminShell>
  );
};

export const Empty: Story = () => {
  const actions = createStoryActions([]);
  return (
    <AdminShell activePath="/admin/identity/users">
      <PageBody>
        <UsersListContent actions={actions} />
      </PageBody>
    </AdminShell>
  );
};

export const CreateDialog: Story = () => {
  const actions = createStoryActions(mockUsers);
  return (
    <AdminShell activePath="/admin/identity/users">
      <PageBody>
        <UsersListContent actions={actions} />
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
