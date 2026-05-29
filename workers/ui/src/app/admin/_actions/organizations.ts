import { authApiGetOrThrow, authApiPostOrThrow } from "@id/lib";

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
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
  inviterId: string;
};

export async function listOrganizations(): Promise<Organization[]> {
  return authApiGetOrThrow<Organization[]>("/organization/list");
}

export async function createOrganization(data: { name: string; slug: string; logo?: string; metadata?: string }): Promise<Organization> {
  return authApiPostOrThrow<Organization>("/organization/create", data);
}

export async function checkSlug(slug: string): Promise<void> {
  await authApiPostOrThrow("/organization/check-slug", { slug });
}

export async function getFullOrganization(organizationId: string): Promise<Organization> {
  return authApiGetOrThrow<Organization>("/organization/get-full-organization", { organizationId });
}

export async function updateOrganization(organizationId: string, data: Partial<{ name: string; slug: string; logo: string; metadata: string }>): Promise<Organization> {
  return authApiPostOrThrow<Organization>("/organization/update", { organizationId, data });
}

export async function deleteOrganization(organizationId: string): Promise<void> {
  await authApiPostOrThrow("/organization/delete", { organizationId });
}

export async function listMembers(organizationId: string): Promise<Member[]> {
  return authApiGetOrThrow<Member[]>("/organization/list-members", { organizationId });
}

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  await authApiPostOrThrow("/organization/update-member-role", { memberId, role });
}

export async function removeMember(memberIdOrEmail: string, organizationId: string): Promise<void> {
  await authApiPostOrThrow("/organization/remove-member", { memberIdOrEmail, organizationId });
}

export async function inviteMember(organizationId: string, email: string, role: string, resend?: boolean): Promise<void> {
  await authApiPostOrThrow("/organization/invite-member", { email, role, organizationId, ...(resend ? { resend: true } : {}) });
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await authApiPostOrThrow("/organization/cancel-invitation", { invitationId });
}

export async function listInvitations(organizationId: string): Promise<Invitation[]> {
  return authApiGetOrThrow<Invitation[]>("/organization/list-invitations", { organizationId });
}

export async function listTeams(organizationId: string): Promise<Team[]> {
  return authApiGetOrThrow<Team[]>("/organization/list-teams", { organizationId });
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  return authApiGetOrThrow<TeamMember[]>("/organization/list-team-members", { teamId });
}

export async function createTeam(name: string, organizationId: string): Promise<Team> {
  return authApiPostOrThrow<Team>("/organization/create-team", { name, organizationId });
}

export async function updateTeam(teamId: string, name: string): Promise<Team> {
  return authApiPostOrThrow<Team>("/organization/update-team", { teamId, data: { name } });
}

export async function removeTeam(teamId: string): Promise<void> {
  await authApiPostOrThrow("/organization/remove-team", { teamId });
}

export async function addTeamMember(teamId: string, userId: string, organizationId: string): Promise<void> {
  await authApiPostOrThrow("/organization/add-team-member", { teamId, userId, organizationId });
}

export async function removeTeamMember(teamId: string, userId: string, organizationId: string): Promise<void> {
  await authApiPostOrThrow("/organization/remove-team-member", { teamId, userId, organizationId });
}
