import { authApiGetOrThrow, authApiPostOrThrow } from "@idco/lib";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  createdAt: string;
};

export type Member = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: string;
};

type ListMembersEnvelope = { members: Member[]; total?: number };
type OrganizationWire = Omit<Organization, "metadata"> & { metadata?: unknown };
type MetadataObject = Record<string, unknown>;
type CreateOrganizationInput = {
  name: string;
  slug: string;
  logo?: string;
  metadata?: string;
};
type UpdateOrganizationInput = Partial<{
  name: string;
  slug: string;
  logo: string;
  metadata: string;
}>;
type InvitationWire = Omit<Invitation, "status"> & { status: string };

export type Team = {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  createdAt: string;
};

export type Invitation = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  teamId: string | null;
  status: "pending" | "accepted" | "rejected" | "expired" | "canceled";
  expiresAt: string;
  createdAt: string;
  inviterId: string;
};

function isMetadataObject(data: unknown): data is MetadataObject {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function parseMetadataInput(
  metadata: string | undefined,
): MetadataObject | undefined {
  if (!metadata) return undefined;
  const parsed = JSON.parse(metadata) as unknown;
  if (!isMetadataObject(parsed))
    throw new Error("Metadata must be a JSON object");
  return parsed;
}

function normalizeMetadata(metadata: unknown): string | null {
  if (metadata === null || metadata === undefined || metadata === "")
    return null;
  if (typeof metadata === "string") return metadata;
  return JSON.stringify(metadata, null, 2);
}

function normalizeOrganization(org: OrganizationWire): Organization {
  return {
    ...org,
    metadata: normalizeMetadata(org.metadata),
  };
}

function normalizeInvitation(invitation: InvitationWire): Invitation {
  const expiresAt = Date.parse(invitation.expiresAt);
  const status =
    invitation.status === "pending" &&
    Number.isFinite(expiresAt) &&
    expiresAt < Date.now()
      ? "expired"
      : invitation.status === "cancelled"
        ? "canceled"
        : invitation.status;
  return {
    ...invitation,
    status: status as Invitation["status"],
  };
}

export async function listOrganizations(): Promise<Organization[]> {
  return (
    await authApiGetOrThrow<OrganizationWire[]>("/organization/list")
  ).map(normalizeOrganization);
}

export async function createOrganization(
  data: CreateOrganizationInput,
): Promise<Organization> {
  const metadata = parseMetadataInput(data.metadata);
  return normalizeOrganization(
    await authApiPostOrThrow<OrganizationWire>("/organization/create", {
      name: data.name,
      slug: data.slug,
      ...(data.logo ? { logo: data.logo } : {}),
      ...(metadata ? { metadata } : {}),
    }),
  );
}

export async function checkSlug(slug: string): Promise<void> {
  await authApiPostOrThrow("/organization/check-slug", { slug });
}

export async function getFullOrganization(
  organizationId: string,
): Promise<Organization | null> {
  const org = await authApiGetOrThrow<OrganizationWire | null>(
    "/organization/get-full-organization",
    { organizationId },
  );
  return org ? normalizeOrganization(org) : null;
}

function isListMembersEnvelope(data: unknown): data is ListMembersEnvelope {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { members?: unknown }).members)
  );
}

function unwrapListMembersResponse(data: unknown): Member[] {
  if (Array.isArray(data)) return data as Member[];
  if (isListMembersEnvelope(data)) return data.members;
  throw new Error("Unexpected /organization/list-members response");
}

export async function updateOrganization(
  organizationId: string,
  data: UpdateOrganizationInput,
): Promise<Organization> {
  const { metadata: metadataInput, ...rest } = data;
  const metadata = parseMetadataInput(metadataInput);
  return normalizeOrganization(
    await authApiPostOrThrow<OrganizationWire>("/organization/update", {
      organizationId,
      data: {
        ...rest,
        ...(metadata ? { metadata } : {}),
      },
    }),
  );
}

export async function deleteOrganization(
  organizationId: string,
): Promise<void> {
  await authApiPostOrThrow("/organization/delete", { organizationId });
}

export async function listMembers(organizationId: string): Promise<Member[]> {
  return unwrapListMembersResponse(
    await authApiGetOrThrow<unknown>("/organization/list-members", {
      organizationId,
    }),
  );
}

export async function updateMemberRole(
  memberId: string,
  role: string,
): Promise<void> {
  await authApiPostOrThrow("/organization/update-member-role", {
    memberId,
    role,
  });
}

export async function removeMember(
  memberIdOrEmail: string,
  organizationId: string,
): Promise<void> {
  await authApiPostOrThrow("/organization/remove-member", {
    memberIdOrEmail,
    organizationId,
  });
}

export async function inviteMember(
  organizationId: string,
  email: string,
  role: string,
  resend?: boolean,
): Promise<void> {
  await authApiPostOrThrow("/organization/invite-member", {
    email,
    role,
    organizationId,
    ...(resend ? { resend: true } : {}),
  });
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await authApiPostOrThrow("/organization/cancel-invitation", { invitationId });
}

export async function listInvitations(
  organizationId: string,
): Promise<Invitation[]> {
  return (
    await authApiGetOrThrow<InvitationWire[]>(
      "/organization/list-invitations",
      { organizationId },
    )
  ).map(normalizeInvitation);
}

export async function listTeams(organizationId: string): Promise<Team[]> {
  return authApiGetOrThrow<Team[]>("/organization/list-teams", {
    organizationId,
  });
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  return authApiGetOrThrow<TeamMember[]>("/organization/list-team-members", {
    teamId,
  });
}

export async function createTeam(
  name: string,
  organizationId: string,
): Promise<Team> {
  return authApiPostOrThrow<Team>("/organization/create-team", {
    name,
    organizationId,
  });
}

export async function updateTeam(
  teamId: string,
  name: string,
  organizationId?: string,
): Promise<Team> {
  return authApiPostOrThrow<Team>("/organization/update-team", {
    teamId,
    data: {
      name,
      ...(organizationId ? { organizationId } : {}),
    },
  });
}

export async function removeTeam(
  teamId: string,
  organizationId?: string,
): Promise<void> {
  await authApiPostOrThrow("/organization/remove-team", {
    teamId,
    ...(organizationId ? { organizationId } : {}),
  });
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  organizationId: string,
): Promise<void> {
  await authApiPostOrThrow("/organization/add-team-member", {
    teamId,
    userId,
    organizationId,
  });
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
  organizationId: string,
): Promise<void> {
  await authApiPostOrThrow("/organization/remove-team-member", {
    teamId,
    userId,
    organizationId,
  });
}
