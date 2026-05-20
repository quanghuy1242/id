export type AdminDbAdapter = {
  findMany: (params: { model: string; where?: Array<{ field: string; value: unknown }> }) => Promise<Array<Record<string, unknown>>>;
};

export function isPlatformAdmin(role: unknown): boolean {
  return role === "admin";
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

  return memberships.some(
    (m) =>
      (m.userId === userId || m.user_id === userId) &&
      (m.organizationId === organizationId || m.organization_id === organizationId) &&
      (m.role === "owner" || m.role === "admin"),
  );
}
