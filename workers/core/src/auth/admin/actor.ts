import { getAuth } from "../get-auth";
import type { CoreEnv } from "../../config/env";

type AuthSessionUser = {
  readonly id: string;
  readonly platformRole?: string | null;
};

type AuthSessionResult = {
  readonly user: AuthSessionUser;
};

export type AuthenticatedAdminActor = {
  readonly userId: string;
  readonly platformRole: "admin" | "member" | "superadmin";
  readonly organizations: readonly {
    readonly organizationId: string;
    readonly role: "admin" | "member" | "owner";
  }[];
};

type DbAdapter = {
  readonly findMany: (params: { model: string; where?: Array<{ field: string; value: unknown }> }) => Promise<Array<Record<string, unknown>>>;
};

function normalizePlatformRole(role: string | null | undefined): "admin" | "member" | "superadmin" {
  if (role === "admin" || role === "superadmin") {
    return role;
  }

  return "member";
}

function normalizeOrganizationRole(role: string): "admin" | "member" | "owner" {
  if (role === "admin" || role === "owner") {
    return role;
  }

  return "member";
}

export async function loadAdminActor(
  env: CoreEnv,
  adapter: DbAdapter,
  headers: Headers,
): Promise<AuthenticatedAdminActor | null> {
  const session = (await getAuth(env).api.getSession({ headers })) as AuthSessionResult | null;
  if (!session) {
    return null;
  }

  const memberships = await adapter.findMany({
    model: "member",
    where: [{ field: "userId", value: session.user.id }],
  });

  return {
    userId: session.user.id,
    platformRole: normalizePlatformRole(session.user.platformRole),
    organizations: memberships.map((membership) => ({
      organizationId: membership.organizationId as string,
      role: normalizeOrganizationRole(membership.role as string),
    })),
  };
}
