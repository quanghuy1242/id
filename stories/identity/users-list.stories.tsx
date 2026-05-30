import type { ReactNode } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { PageBody, Stack } from "@id/ui";
import { UsersListContent } from "../../workers/ui/src/app/admin/_components/identity/users-list-content";
import { UserDetailProvider } from "../../workers/ui/src/app/admin/_components/identity/user-detail-context";
import { UserDetailHeaderContent } from "../../workers/ui/src/app/admin/_components/identity/user-detail-header-content";
import { UserDetailOverviewContent } from "../../workers/ui/src/app/admin/_components/identity/user-detail-overview-content";
import { UserSessionsContent } from "../../workers/ui/src/app/admin/_components/identity/user-sessions-content";
import { ActivityLogContent } from "../../workers/ui/src/app/admin/_components/activity-log-content";
import type { CreateUserBody, ListUsersParams, User, Session, CurrentSession } from "../../workers/ui/src/app/admin/_actions/users";
import { AdminShell } from "../_decorators/shell";
import { mockUsers, mockSessions } from "../../workers/ui/src/app/admin/_mocks/users";
import { mockActivities } from "../../workers/ui/src/app/admin/_mocks/audit";

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

type UserDetailFrameActions =
  NonNullable<Parameters<typeof UserDetailProvider>[0]["actions"]> &
  NonNullable<Parameters<typeof UserDetailHeaderContent>[0]["actions"]>;

function UserDetailFrame({
  activePath,
  userId,
  activeTab,
  actions,
  loading,
  error,
  children,
}: {
  activePath: string;
  userId: string;
  activeTab: "overview" | "sessions" | "audit";
  actions?: UserDetailFrameActions;
  loading?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <AdminShell activePath={activePath}>
      <PageBody>
        <UserDetailProvider userId={userId} loading={loading} error={error} actions={actions}>
          <Stack gap="md">
            <UserDetailHeaderContent activeTab={activeTab} actions={actions} />
            {children}
          </Stack>
        </UserDetailProvider>
      </PageBody>
    </AdminShell>
  );
}

export const Populated: Story = () => {
  const actions = createStoryActions(mockUsers);
  return (
    <AdminShell activePath="/admin/identity/users">
      <PageBody>
        <UsersListContent actions={actions} defaultCreateOpen />
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
    <UserDetailFrame activePath="/admin/identity/users/user_001" userId="user_001" activeTab="overview" actions={actions}>
      <UserDetailOverviewContent actions={actions} />
    </UserDetailFrame>
  );
};
UserDetail_Populated.storyName = "User Detail / Populated";

export const UserDetail_Banned: Story = () => {
  const actions = createDetailActions(mockUsers[1]);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_002" userId="user_002" activeTab="overview" actions={actions}>
      <UserDetailOverviewContent actions={actions} />
    </UserDetailFrame>
  );
};
UserDetail_Banned.storyName = "User Detail / Banned";

export const UserDetail_Loading: Story = () => (
  <UserDetailFrame activePath="/admin/identity/users/user_001" userId="user_001" activeTab="overview" loading>
    <UserDetailOverviewContent />
  </UserDetailFrame>
);
UserDetail_Loading.storyName = "User Detail / Loading";

export const UserDetail_Error: Story = () => (
  <UserDetailFrame
    activePath="/admin/identity/users/user_001"
    userId="user_001"
    activeTab="overview"
    error="Failed to load user: 404 Not Found"
  >
    <UserDetailOverviewContent />
  </UserDetailFrame>
);
UserDetail_Error.storyName = "User Detail / Error";

export const UserDetail_Impersonating: Story = () => {
  const actions = createDetailActions(mockUsers[0], true);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_001" userId="user_001" activeTab="overview" actions={actions}>
      <UserDetailOverviewContent actions={actions} />
    </UserDetailFrame>
  );
};
UserDetail_Impersonating.storyName = "User Detail / Stop Impersonating";

function createSessionsActions(user: User, sessions: Session[]) {
  let current = [...sessions];
  return {
    getUser: async (_id: string) => ({ user }),
    getCurrentSession: async (): Promise<CurrentSession> => ({
      user: { id: "admin_001", impersonatedBy: null },
    }),
    impersonateUser: async (_id: string) => ({ session: {}, user }),
    stopImpersonating: async () => undefined,
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
    <UserDetailFrame activePath="/admin/identity/users/user_001/sessions" userId="user_001" activeTab="sessions" actions={actions}>
      <UserSessionsContent userId="user_001" userName={mockUsers[0].name} actions={actions} />
    </UserDetailFrame>
  );
};
UserSessions_Populated.storyName = "User Sessions / Populated";

export const UserSessions_Empty: Story = () => {
  const actions = createSessionsActions(mockUsers[0], []);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_001/sessions" userId="user_001" activeTab="sessions" actions={actions}>
      <UserSessionsContent userId="user_001" userName={mockUsers[0].name} actions={actions} />
    </UserDetailFrame>
  );
};
UserSessions_Empty.storyName = "User Sessions / Empty";

export const UserSessions_Loading: Story = () => (
  <UserDetailFrame activePath="/admin/identity/users/user_001/sessions" userId="user_001" activeTab="sessions" loading>
    <UserSessionsContent userId="user_001" loading />
  </UserDetailFrame>
);
UserSessions_Loading.storyName = "User Sessions / Loading";

export const UserSessions_Error: Story = () => {
  const actions = createSessionsActions(mockUsers[0], mockSessions);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_001/sessions" userId="user_001" activeTab="sessions" actions={actions}>
      <UserSessionsContent userId="user_001" userName={mockUsers[0].name} error="Failed to load sessions" />
    </UserDetailFrame>
  );
};
UserSessions_Error.storyName = "User Sessions / Error";

function createActivityActions(entries = mockActivities) {
  const userEntries = entries.filter((entry) => entry.targetType === "user");
  return {
    listActivityLog: async () => ({
      entries: userEntries,
      total: userEntries.length,
      limit: 25,
      offset: 0,
    }),
  };
}

export const UserAudit_Populated: Story = () => {
  const actions = createDetailActions(mockUsers[0]);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_001/audit" userId="user_001" activeTab="audit" actions={actions}>
      <ActivityLogContent targetType="user" targetId="user_001" actions={createActivityActions()} />
    </UserDetailFrame>
  );
};
UserAudit_Populated.storyName = "User Audit / Populated";

export const UserAudit_Empty: Story = () => {
  const actions = createDetailActions(mockUsers[0]);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_001/audit" userId="user_001" activeTab="audit" actions={actions}>
      <ActivityLogContent targetType="user" targetId="user_001" actions={createActivityActions([])} />
    </UserDetailFrame>
  );
};
UserAudit_Empty.storyName = "User Audit / Empty";

export const UserAudit_Loading: Story = () => (
  <UserDetailFrame activePath="/admin/identity/users/user_001/audit" userId="user_001" activeTab="audit" loading>
    <ActivityLogContent targetType="user" targetId="user_001" loading />
  </UserDetailFrame>
);
UserAudit_Loading.storyName = "User Audit / Loading";

export const UserAudit_Error: Story = () => {
  const actions = createDetailActions(mockUsers[0]);
  return (
    <UserDetailFrame activePath="/admin/identity/users/user_001/audit" userId="user_001" activeTab="audit" actions={actions}>
      <ActivityLogContent targetType="user" targetId="user_001" error="Failed to load activity" />
    </UserDetailFrame>
  );
};
UserAudit_Error.storyName = "User Audit / Error";
