import { authApiGetOrThrow, authApiPostOrThrow } from "@idco/lib";
import { listAdminSessions, revokeAdminSession } from "./audit";

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
  userId: string;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  impersonatedBy: string | null;
  createdAt: number | null;
  expiresAt: number | null;
};

export type CurrentSession = {
  session?: unknown;
  user?: {
    id?: string;
    impersonatedBy?: string | null;
  };
} | null;

type UserEnvelope = {
  user: User;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUserEnvelope(value: unknown): value is UserEnvelope {
  return isRecord(value) && isRecord(value.user);
}

function normalizeUserEnvelope(value: unknown): UserEnvelope {
  if (isUserEnvelope(value)) return value;
  if (isRecord(value)) return { user: value as User };
  throw new TypeError("Expected user response from Better Auth");
}

export async function listUsers(
  params: ListUsersParams,
): Promise<ListUsersResponse> {
  return authApiGetOrThrow<ListUsersResponse>(
    "/admin/list-users",
    params as Record<string, string | number | undefined>,
  );
}

export async function createUser(
  body: CreateUserBody,
): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/create-user", body);
}

export async function getUser(userId: string): Promise<{ user: User }> {
  const user = await authApiGetOrThrow<User>("/admin/get-user", { id: userId });
  return { user };
}

export async function updateUser(
  userId: string,
  data: Partial<{ name: string; email: string; image: string }>,
): Promise<{ user: User }> {
  return normalizeUserEnvelope(
    await authApiPostOrThrow<unknown>("/admin/update-user", { userId, data }),
  );
}

export async function setRole(
  userId: string,
  role: string,
): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/set-role", {
    userId,
    role,
  });
}

export async function setUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ status: boolean }> {
  return authApiPostOrThrow<{ status: boolean }>("/admin/set-user-password", {
    newPassword,
    userId,
  });
}

export async function banUser(
  userId: string,
  banReason?: string,
  banExpiresIn?: number,
): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/ban-user", {
    userId,
    ...(banReason ? { banReason } : {}),
    ...(banExpiresIn ? { banExpiresIn } : {}),
  });
}

export async function unbanUser(userId: string): Promise<{ user: User }> {
  return authApiPostOrThrow<{ user: User }>("/admin/unban-user", { userId });
}

export async function impersonateUser(
  userId: string,
): Promise<{ session: unknown; user: User }> {
  return authApiPostOrThrow<{ session: unknown; user: User }>(
    "/admin/impersonate-user",
    { userId },
  );
}

export async function stopImpersonating(): Promise<void> {
  await authApiPostOrThrow("/admin/stop-impersonating", {});
}

export async function removeUser(
  userId: string,
): Promise<{ success: boolean }> {
  return authApiPostOrThrow<{ success: boolean }>("/admin/remove-user", {
    userId,
  });
}

export async function listUserSessions(
  userId: string,
): Promise<{ sessions: Session[] }> {
  const pageLimit = 100;
  const firstPage = await listAdminSessions({
    limit: pageLimit,
    offset: 0,
    userId,
  });
  const stride = firstPage.limit > 0 ? firstPage.limit : pageLimit;
  const offsets: number[] = [];
  for (let offset = stride; offset < firstPage.total; offset += stride)
    offsets.push(offset);

  const rest = await Promise.all(
    offsets.map((offset) =>
      listAdminSessions({ limit: pageLimit, offset, userId }),
    ),
  );
  return { sessions: [firstPage, ...rest].flatMap((page) => page.sessions) };
}

export async function revokeUserSession(
  sessionId: string,
): Promise<{ success: boolean }> {
  await revokeAdminSession(sessionId);
  return { success: true };
}

export async function revokeUserSessions(
  userId: string,
): Promise<{ success: boolean }> {
  return authApiPostOrThrow<{ success: boolean }>(
    "/admin/revoke-user-sessions",
    { userId },
  );
}

export async function getCurrentSession(): Promise<CurrentSession> {
  try {
    return await authApiGetOrThrow<CurrentSession>(
      "/get-session",
      { disableRefresh: "true", disableCookieCache: "true" },
      { cache: "no-store", credentials: "include" },
    );
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await authApiPostOrThrow(
    "/sign-out",
    {},
    { cache: "no-store", credentials: "include" },
  );
}
