export type AdminDbAdapter = {
  findOne?: (params: { model: string; where?: Array<{ field: string; value: unknown }> }) => Promise<Record<string, unknown> | null>;
  findMany: (params: { model: string; where?: Array<{ field: string; value: unknown }> }) => Promise<Array<Record<string, unknown>>>;
};

export async function hasAdminAccess(
  _adapter: AdminDbAdapter,
  _userId: string,
  role: string | null | undefined,
): Promise<boolean> {
  if (role === "admin") {
    return true;
  }

  return false;
}

export async function hasOrganizationAccess(
  adapter: AdminDbAdapter,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const memberships = await adapter.findMany({
    model: "member",
    where: [{ field: "organizationId", value: organizationId }],
  });

  return memberships.some(
    (m) =>
      (m.userId === userId || m.user_id === userId) &&
      (m.organizationId === organizationId || m.organization_id === organizationId) &&
      (m.role === "owner" || m.role === "admin"),
  );
}
