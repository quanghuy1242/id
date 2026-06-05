import {
  MEMBER_MODEL,
  TEAM_MODEL,
  USER_MODEL,
} from "../../../shared/constants";
import type { ScimAdapter } from "./types";

export type UserRow = {
  readonly id: string;
  readonly email?: string | null;
  readonly banned?: boolean | null;
};

export type MemberRow = {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
};

export type TeamRow = {
  readonly id: string;
  readonly name: string;
  readonly organizationId: string;
};

const adminRoles = new Set(["owner", "admin"]);

/** Looks up a single user by ID. Returns the row or null when absent. */
export async function findUser(
  adapter: ScimAdapter,
  userId: string,
): Promise<UserRow | null> {
  return adapter.findOne<UserRow>({
    model: USER_MODEL,
    where: [{ field: "id", value: userId }],
  });
}

/**
 * Looks up a user who is a current active member of the given organization.
 * Returns null when the user is absent globally or is not a member of orgId.
 */
export async function findOrgUser(
  adapter: ScimAdapter,
  userId: string,
  orgId: string,
): Promise<{ readonly user: UserRow; readonly member: MemberRow } | null> {
  const user = await findUser(adapter, userId);
  if (!user) return null;

  const member = await adapter.findOne<MemberRow>({
    model: MEMBER_MODEL,
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: orgId },
    ],
  });
  if (!member) return null;

  return { user, member };
}

/**
 * Looks up a team that belongs to the given organization.
 * Returns null when the team does not exist or belongs to a different org.
 */
export async function findTeam(
  adapter: ScimAdapter,
  teamId: string,
  orgId: string,
): Promise<TeamRow | null> {
  const team = await adapter.findOne<TeamRow>({
    model: TEAM_MODEL,
    where: [{ field: "id", value: teamId }],
  });
  if (!team || team.organizationId !== orgId) return null;
  return team;
}

/**
 * Returns all owner/admin members of an organization for the virtual `org-admins` group.
 */
export async function findOrgAdmins(
  adapter: ScimAdapter,
  orgId: string,
): Promise<MemberRow[]> {
  const members = await adapter.findMany<MemberRow>({
    model: MEMBER_MODEL,
    where: [{ field: "organizationId", value: orgId }],
  });
  return members.filter((m) => adminRoles.has(m.role));
}

/**
 * Checks whether a specific user is a current owner or admin of the given organization.
 */
export async function isOrgAdmin(
  adapter: ScimAdapter,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const member = await adapter.findOne<MemberRow>({
    model: MEMBER_MODEL,
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: orgId },
    ],
  });
  return member !== null && adminRoles.has(member.role);
}
