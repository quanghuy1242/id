import { APIError } from "better-auth/api";
import { verifyScopedBearerToken } from "../../verify-scoped-bearer";
import type { PrincipalValidationAdapter } from "./types";

type UserRow = {
  readonly id: string;
  readonly banned?: boolean | null;
};

type MemberRow = {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
};

type TeamRow = {
  readonly id: string;
  readonly organizationId: string;
};

export async function assertPrincipalValidationCaller(params: {
  readonly adapter: PrincipalValidationAdapter;
  readonly headers: Headers;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
}): Promise<void> {
  await verifyScopedBearerToken(params);
}

export async function validateUser(adapter: PrincipalValidationAdapter, userId: string): Promise<void> {
  const user = await adapter.findOne<UserRow>({
    model: "user",
    where: [{ field: "id", value: userId }],
  });
  if (!user || user.banned) {
    throw new APIError("NOT_FOUND");
  }
}

export async function validateUserInOrganization(
  adapter: PrincipalValidationAdapter,
  userId: string,
  organizationId: string,
): Promise<void> {
  await validateUser(adapter, userId);
  const member = await adapter.findOne<MemberRow>({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });
  if (!member) throw new APIError("NOT_FOUND");
}

export async function validateTeamInOrganization(
  adapter: PrincipalValidationAdapter,
  teamId: string,
  organizationId: string,
): Promise<void> {
  const team = await adapter.findOne<TeamRow>({
    model: "team",
    where: [{ field: "id", value: teamId }],
  });
  if (!team || team.organizationId !== organizationId) {
    throw new APIError("NOT_FOUND");
  }
}

export async function validateOrganizationAdministrator(
  adapter: PrincipalValidationAdapter,
  userId: string,
  organizationId: string,
): Promise<void> {
  await validateUserInOrganization(adapter, userId, organizationId);
  const member = await adapter.findOne<MemberRow>({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });
  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new APIError("NOT_FOUND");
  }
}
