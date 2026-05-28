import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { UsersListContent } from "../../workers/ui/src/app/admin/_components/identity/users-list-content";
import { UserDetailContent } from "../../workers/ui/src/app/admin/_components/identity/user-detail-content";
import { UserSessionsContent } from "../../workers/ui/src/app/admin/_components/identity/user-sessions-content";
import type { CreateUserBody, ListUsersParams, User, Session, CurrentSession } from "../../workers/ui/src/app/admin/_actions/users";
import { AdminShell } from "../_decorators/shell";
import { mockUsers, mockSessions } from "../../workers/ui/src/app/admin/_mocks/users";

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

// ─── User Detail ─────────────────────────────────────────────────────────────

function createDetailActions(user: User, isImpersonating = false) {
  let current = { ...user };
  return {
    getUser: async (_id: string) => ({ user: current }),
    getCurrentSession: async (): Promise<CurrentSession> => ({
      user: { id: "admin_001", impersonatedBy: isImpersonating ? "admin_001" : null },
    }),
    updateUser: async (_id: string, data: Partial<{ name: string; email: string; image: string }>) => {
      current = { ...current, ...data };
      return { user: current };
    },
    setRole: async (_id: string, role: string) => {
      current = { ...current, role };
      return { user: current };
    },
    setUserPassword: async (_id: string, _pw: string) => ({ status: true }),
    banUser: async (_id: string, banReason?: string, banExpiresIn?: number) => {
      current = {
        ...current,
        banned: true,
        banReason: banReason ?? null,
        banExpires: banExpiresIn ? new Date(Date.now() + banExpiresIn * 1000).toISOString() : null,
      };
      return { user: current };
    },
    unbanUser: async (_id: string) => {
      current = { ...current, banned: false, banReason: null, banExpires: null };
      return { user: current };
    },
    impersonateUser: async (_id: string) => ({ session: {}, user: current }),
    stopImpersonating: async () => undefined,
    removeUser: async (_id: string) => ({ success: true }),
  };
}

export const UserDetail_Populated: Story = () => {
  const actions = createDetailActions(mockUsers[0]);
  return (
    <AdminShell activePath="/admin/identity/users/user_001">
      <PageBody>
        <UserDetailContent userId="user_001" actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
UserDetail_Populated.storyName = "User Detail / Populated";

export const UserDetail_Banned: Story = () => {
  const actions = createDetailActions(mockUsers[1]);
  return (
    <AdminShell activePath="/admin/identity/users/user_002">
      <PageBody>
        <UserDetailContent userId="user_002" actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
UserDetail_Banned.storyName = "User Detail / Banned";

export const UserDetail_Loading: Story = () => (
  <AdminShell activePath="/admin/identity/users/user_001">
    <PageBody>
      <UserDetailContent userId="user_001" loading />
    </PageBody>
  </AdminShell>
);
UserDetail_Loading.storyName = "User Detail / Loading";

export const UserDetail_Error: Story = () => (
  <AdminShell activePath="/admin/identity/users/user_001">
    <PageBody>
      <UserDetailContent userId="user_001" error="Failed to load user: 404 Not Found" />
    </PageBody>
  </AdminShell>
);
UserDetail_Error.storyName = "User Detail / Error";

export const UserDetail_Impersonating: Story = () => {
  const actions = createDetailActions(mockUsers[0], true);
  return (
    <AdminShell activePath="/admin/identity/users/user_001">
      <PageBody>
        <UserDetailContent userId="user_001" actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
UserDetail_Impersonating.storyName = "User Detail / Stop Impersonating";

// ─── User Sessions ────────────────────────────────────────────────────────────

function createSessionsActions(user: User, sessions: Session[]) {
  let current = [...sessions];
  return {
    getUser: async (_id: string) => ({ user }),
    listUserSessions: async (_id: string) => ({ sessions: current }),
    revokeUserSession: async (token: string) => {
      current = current.filter((s) => s.token !== token);
      return { success: true };
    },
    revokeUserSessions: async (_id: string) => {
      current = [];
      return { success: true };
    },
  };
}

export const UserSessions_Populated: Story = () => {
  const actions = createSessionsActions(mockUsers[0], mockSessions);
  return (
    <AdminShell activePath="/admin/identity/users/user_001/sessions">
      <PageBody>
        <UserSessionsContent userId="user_001" actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
UserSessions_Populated.storyName = "User Sessions / Populated";

export const UserSessions_Empty: Story = () => {
  const actions = createSessionsActions(mockUsers[0], []);
  return (
    <AdminShell activePath="/admin/identity/users/user_001/sessions">
      <PageBody>
        <UserSessionsContent userId="user_001" actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
UserSessions_Empty.storyName = "User Sessions / Empty";

export const UserSessions_Loading: Story = () => (
  <AdminShell activePath="/admin/identity/users/user_001/sessions">
    <PageBody>
      <UserSessionsContent userId="user_001" loading />
    </PageBody>
  </AdminShell>
);
UserSessions_Loading.storyName = "User Sessions / Loading";

export const UserSessions_Error: Story = () => (
  <AdminShell activePath="/admin/identity/users/user_001/sessions">
    <PageBody>
      <UserSessionsContent userId="user_001" error="Failed to load sessions" />
    </PageBody>
  </AdminShell>
);
UserSessions_Error.storyName = "User Sessions / Error";
