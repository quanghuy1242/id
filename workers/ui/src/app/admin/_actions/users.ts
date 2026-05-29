import { authApiGetOrThrow, authApiPostOrThrow } from "@id/lib";

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListUsersParams = {
  searchValue?: string;
  searchField?: "email" | "name";
  searchOperator?: "contains" | "starts_with" | "ends_with";
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterValue?: string;
  filterOperator?: string;
};

export type ListUsersResponse = {
  users: User[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateUserBody = {
  name: string;
  email: string;
  password?: string;
  role?: string;
};

export type Session = {
  id: string;
  token: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  impersonatedBy: string | null;
  createdAt: string;
  expiresAt: string;
};

export type CurrentSession = {
  user?: {
    id?: string;
    impersonatedBy?: string | null;
  };
} | null;

export async function listUsers(params: ListUsersParams): Promise<ListUsersResponse> {
  return authApiGetOrThrow<ListUsersResponse>("/admin/list-users", params as Record<string, string | number | undefined>);
}

export async function createUser(body: CreateUserBody): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/create-user", body);
}

export async function getUser(userId: string): Promise<{ user: User }> {
  const user = await authApiGetOrThrow<User>("/admin/get-user", { id: userId });
  return { user };
}

export async function updateUser(userId: string, data: Partial<{ name: string; email: string; image: string }>): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/update-user", { userId, data: JSON.stringify(data) });
}

export async function setRole(userId: string, role: string): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/set-role", { userId, role });
}

export async function setUserPassword(userId: string, newPassword: string): Promise<{ status: boolean }> {
  return authApiPostOrThrow<{ status: boolean }>("/admin/set-user-password", { newPassword, userId });
}

export async function banUser(userId: string, banReason?: string, banExpiresIn?: number): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/ban-user", { userId, ...(banReason ? { banReason } : {}), ...(banExpiresIn ? { banExpiresIn } : {}) });
}

export async function unbanUser(userId: string): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/unban-user", { userId });
}

export async function impersonateUser(userId: string): Promise<{ session: unknown; user: User }> {
  return authApiPostOrThrow<{ session: unknown; user: User }>("/admin/impersonate-user", { userId });
}

export async function stopImpersonating(): Promise<void> {
  await authApiPostOrThrow("/admin/stop-impersonating", {});
}

export async function removeUser(userId: string): Promise<{ success: boolean }> {
  return authApiPostOrThrow<{ success: boolean }>("/admin/remove-user", { userId });
}

export async function listUserSessions(userId: string): Promise<{ sessions: Session[] }> {
  return authApiPostOrThrow<{ sessions: Session[] }>("/admin/list-user-sessions", { userId });
}

export async function revokeUserSession(sessionToken: string): Promise<{ success: boolean }> {
  return authApiPostOrThrow<{ success: boolean }>("/admin/revoke-user-session", { sessionToken });
}

export async function revokeUserSessions(userId: string): Promise<{ success: boolean }> {
  return authApiPostOrThrow<{ success: boolean }>("/admin/revoke-user-sessions", { userId });
}

export async function getCurrentSession(): Promise<CurrentSession> {
  try {
    return await authApiGetOrThrow<CurrentSession>("/get-session", { disableRefresh: "true", disableCookieCache: "true" }, { cache: "no-store", credentials: "include" });
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await authApiPostOrThrow("/sign-out", {}, { cache: "no-store", credentials: "include" });
}
