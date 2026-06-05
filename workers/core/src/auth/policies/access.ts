import { MEMBER_MODEL } from "../../shared/constants";

export type AdminDbAdapter = {
  findMany: (params: {
    model: string;
    where?: Array<{ field: string; value: unknown }>;
  }) => Promise<Array<Record<string, unknown>>>;
};

export type PlatformAuthorityTier = "system" | "organization";

export type PlatformAuthorityGrant = "platform-admin" | "organization-admin";

export type PlatformAuthority = {
  readonly tier: PlatformAuthorityTier;
  readonly organizationId: string | null;
  readonly allowed: boolean;
  readonly grantedBy: PlatformAuthorityGrant | null;
};

export type ResolvePlatformAuthorityParams = {
  readonly adapter: AdminDbAdapter;
  readonly userId: string;
  readonly organizationId?: string | null;
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
    model: MEMBER_MODEL,
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });

  return memberships.some(
    (m) =>
      m.userId === userId &&
      m.organizationId === organizationId &&
      (m.role === "owner" || m.role === "admin"),
  );
}

export async function resolvePlatformAuthority(
  role: unknown,
  params: ResolvePlatformAuthorityParams,
): Promise<PlatformAuthority> {
  const organizationId = params.organizationId ?? null;
  const platformAdmin = isPlatformAdmin(role);

  if (organizationId === null) {
    return {
      tier: "system",
      organizationId,
      allowed: platformAdmin,
      grantedBy: platformAdmin ? "platform-admin" : null,
    };
  }

  if (platformAdmin) {
    return {
      tier: "organization",
      organizationId,
      allowed: true,
      grantedBy: "platform-admin",
    };
  }

  const organizationAdmin = await hasOrganizationAccess(
    params.adapter,
    params.userId,
    organizationId,
  );

  return {
    tier: "organization",
    organizationId,
    allowed: organizationAdmin,
    grantedBy: organizationAdmin ? "organization-admin" : null,
  };
}
