import {
  SCIM_ERROR_SCHEMA,
  SCIM_GROUP_SCHEMA,
  SCIM_HTTP_OK,
  SCIM_LIST_RESPONSE_SCHEMA,
  SCIM_ORG_ADMINS_GROUP_ID,
  SCIM_TENANT_MEMBERSHIP_SCHEMA,
  SCIM_USER_SCHEMA,
} from "../../../shared/constants";
import type { MemberRow, TeamRow, UserRow } from "./operations";
import type {
  ScimError,
  ScimGroup,
  ScimGroupMember,
  ScimListResponse,
  ScimOrgUser,
  ScimUser,
} from "./schema";

function userLocation(baseUrl: string, userId: string): string {
  return `${baseUrl}/api/auth/scim/v2/Users/${userId}`;
}

function orgUserLocation(
  baseUrl: string,
  orgId: string,
  userId: string,
): string {
  return `${baseUrl}/api/auth/scim/v2/tenants/${orgId}/Users/${userId}`;
}

function orgGroupLocation(
  baseUrl: string,
  orgId: string,
  groupId: string,
): string {
  return `${baseUrl}/api/auth/scim/v2/tenants/${orgId}/Groups/${groupId}`;
}

/**
 * Maps a Better Auth user row to a global SCIM User resource.
 *
 * userName is set to user.id (not email/name) per doc 017 §7.2:
 * "Privacy rule: do not expose email, name, or avatar by default."
 * When PII attributes are green-lit, upgrade userName to user.email and
 * add the corresponding SCIM schema attributes in schema.ts.
 */
export function toScimUser(user: UserRow, baseUrl: string): ScimUser {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    userName: user.id,
    active: user.banned !== true,
    meta: {
      resourceType: "User",
      location: userLocation(baseUrl, user.id),
    },
  };
}

/**
 * Maps a Better Auth user + member row to a tenant-scoped SCIM User resource.
 * Includes the repository-specific tenant-membership extension.
 *
 * userName is set to user.id (not email/name) per doc 017 §7.2 privacy rule.
 */
export function toScimOrgUser(
  user: UserRow,
  member: MemberRow,
  orgId: string,
  baseUrl: string,
): ScimOrgUser {
  return {
    schemas: [SCIM_USER_SCHEMA, SCIM_TENANT_MEMBERSHIP_SCHEMA],
    id: user.id,
    userName: user.id,
    active: user.banned !== true,
    [SCIM_TENANT_MEMBERSHIP_SCHEMA]: {
      tenantId: orgId,
      role: member.role,
    },
    meta: {
      resourceType: "User",
      location: orgUserLocation(baseUrl, orgId, user.id),
    },
  };
}

/** Maps a Better Auth team row to a SCIM Group resource (members not populated here). */
export function toScimTeamGroup(team: TeamRow, baseUrl: string): ScimGroup {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: team.id,
    displayName: team.name,
    members: [],
    meta: {
      resourceType: "Group",
      location: orgGroupLocation(baseUrl, team.organizationId, team.id),
    },
  };
}

/**
 * Builds the virtual `org-admins` SCIM Group from the org's owner/admin member list.
 *
 * This group has no corresponding DB row; it is derived dynamically from the
 * Better Auth member table filtered to `role in ("owner", "admin")`.
 */
export function toScimOrgAdminsGroup(
  members: MemberRow[],
  orgId: string,
  baseUrl: string,
): ScimGroup {
  const scimMembers: ScimGroupMember[] = members.map((m) => ({
    value: m.userId,
    $ref: userLocation(baseUrl, m.userId),
    display: m.userId,
  }));
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: SCIM_ORG_ADMINS_GROUP_ID,
    displayName: "Organization Administrators",
    members: scimMembers,
    meta: {
      resourceType: "Group",
      location: orgGroupLocation(baseUrl, orgId, SCIM_ORG_ADMINS_GROUP_ID),
    },
  };
}

/** Wraps an item array into a SCIM ListResponse. */
export function toScimListResponse<T>(
  items: readonly T[],
): ScimListResponse<T> {
  return {
    schemas: [SCIM_LIST_RESPONSE_SCHEMA],
    totalResults: items.length,
    startIndex: 1,
    itemsPerPage: items.length,
    Resources: items,
  };
}

/** Builds a SCIM-formatted error body (RFC 7644 §3.12). */
export function scimError(
  status: number,
  detail: string,
  scimType?: string,
): ScimError {
  return {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  };
}

/** Returns a SCIM Response with `application/scim+json` content type. */
export function scimJsonResponse(
  body: unknown,
  status: number = SCIM_HTTP_OK,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/scim+json" },
  });
}
