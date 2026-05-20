import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from "../../shared/http-status";

export type PlatformRole = "admin" | "user";
export type OrganizationRole = "admin" | "member" | "owner";

export type AdminActor = {
  readonly userId: string;
  readonly platformRole: PlatformRole;
  readonly organizations: readonly {
    readonly organizationId: string;
    readonly role: OrganizationRole;
  }[];
};

export type AdminAction =
  | "listAnyOrganization"
  | "mutateAnyOrganization"
  | "manageOwnOrganization"
  | "delegateOwnOrganization";

export type AuthorizationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly status: 401 | 403; readonly reason: string };

function deny(status: 401 | 403, reason: string): AuthorizationDecision {
  return { allowed: false, status, reason };
}

function organizationRole(actor: AdminActor, organizationId: string): OrganizationRole | null {
  return actor.organizations.find((membership) => membership.organizationId === organizationId)?.role ?? null;
}

export function authorizeAdminAction(
  actor: AdminActor | null,
  action: AdminAction,
  organizationId?: string,
): AuthorizationDecision {
  if (!actor) {
    return deny(HTTP_UNAUTHORIZED, "Authentication required");
  }

  if (action === "listAnyOrganization" || action === "mutateAnyOrganization") {
    return actor.platformRole === "admin"
      ? { allowed: true }
      : deny(HTTP_FORBIDDEN, "Platform admin role required");
  }

  if (!organizationId) {
    return deny(HTTP_FORBIDDEN, "Organization scope required");
  }

  const role = organizationRole(actor, organizationId);
  if (action === "manageOwnOrganization") {
    return role === "owner" ? { allowed: true } : deny(HTTP_FORBIDDEN, "Organization owner role required");
  }

  if (action === "delegateOwnOrganization") {
    return role === "owner" || role === "admin"
      ? { allowed: true }
      : deny(HTTP_FORBIDDEN, "Organization owner or admin role required");
  }

  return deny(HTTP_FORBIDDEN, "Unsupported admin action");
}
