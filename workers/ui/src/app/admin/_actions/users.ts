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
  const url = new URL("/api/auth/admin/list-users", window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString());
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
