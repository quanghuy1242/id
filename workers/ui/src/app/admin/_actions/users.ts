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

export async function listUsers(params: ListUsersParams): Promise<ListUsersResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const res = await fetch(`/api/auth/admin/list-users?${search.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ListUsersResponse>;
}

export async function createUser(body: CreateUserBody): Promise<{ user: User }> {
  const res = await fetch("/api/auth/admin/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ user: User }>;
}

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

export async function getUser(userId: string): Promise<{ user: User }> {
  const res = await fetch(`/api/auth/admin/get-user?id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(await res.text());
  const user = await res.json() as User;
  return { user };
}

export async function updateUser(userId: string, data: Partial<{ name: string; email: string; image: string }>): Promise<{ user: User }> {
  const res = await fetch("/api/auth/admin/update-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, data: JSON.stringify(data) }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ user: User }>;
}

export async function setRole(userId: string, role: string): Promise<{ user: User }> {
  const res = await fetch("/api/auth/admin/set-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ user: User }>;
}

export async function setUserPassword(userId: string, newPassword: string): Promise<{ status: boolean }> {
  const res = await fetch("/api/auth/admin/set-user-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword, userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ status: boolean }>;
}

export async function banUser(userId: string, banReason?: string, banExpiresIn?: number): Promise<{ user: User }> {
  const res = await fetch("/api/auth/admin/ban-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...(banReason ? { banReason } : {}), ...(banExpiresIn ? { banExpiresIn } : {}) }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ user: User }>;
}

export async function unbanUser(userId: string): Promise<{ user: User }> {
  const res = await fetch("/api/auth/admin/unban-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ user: User }>;
}

export async function impersonateUser(userId: string): Promise<{ session: unknown; user: User }> {
  const res = await fetch("/api/auth/admin/impersonate-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ session: unknown; user: User }>;
}

export async function stopImpersonating(): Promise<void> {
  const res = await fetch("/api/auth/admin/stop-impersonating", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function removeUser(userId: string): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/admin/remove-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean }>;
}

export async function listUserSessions(userId: string): Promise<{ sessions: Session[] }> {
  const res = await fetch("/api/auth/admin/list-user-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ sessions: Session[] }>;
}

export async function revokeUserSession(sessionToken: string): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/admin/revoke-user-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean }>;
}

export async function revokeUserSessions(userId: string): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/admin/revoke-user-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean }>;
}

export async function getCurrentSession(): Promise<CurrentSession> {
  const res = await fetch("/api/auth/get-session?disableRefresh=true&disableCookieCache=true", {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json() as Promise<CurrentSession>;
}

export async function signOut(): Promise<void> {
  // Same-origin POST; the response Set-Cookie clears the host-only session cookie.
  const res = await fetch("/api/auth/sign-out", {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Sign-out failed with status ${res.status}`);
  }
}
