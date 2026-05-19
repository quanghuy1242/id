export type AdminDbAdapter = {
  findMany: (params: { model: string; where?: Array<{ field: string; value: unknown }> }) => Promise<Array<Record<string, unknown>>>;
};

export async function hasAdminAccess(
  adapter: AdminDbAdapter,
  userId: string,
  platformRole: string | null | undefined,
): Promise<boolean> {
  if (platformRole === "admin" || platformRole === "superadmin") {
    return true;
  }

  const memberships = await adapter.findMany({
    model: "member",
    where: [{ field: "userId", value: userId }],
  });

  return memberships.some((m) => m.role === "owner" || m.role === "admin");
}

export async function hasOrganizationAccess(
  adapter: AdminDbAdapter,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const memberships = await adapter.findMany({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });

  return memberships.some((m) => m.role === "owner" || m.role === "admin");
}
