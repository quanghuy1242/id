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

async function postOrg(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`/api/auth/organization${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function getOrg(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URLSearchParams(params).toString();
  const res = await fetch(`/api/auth/organization${path}${url ? `?${url}` : ""}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listOrganizations(): Promise<Organization[]> {
  return getOrg("/list") as Promise<Organization[]>;
}

export async function createOrganization(data: { name: string; slug: string; logo?: string; metadata?: string }): Promise<Organization> {
  return postOrg("/create", data) as Promise<Organization>;
}

export async function checkSlug(slug: string): Promise<void> {
  await postOrg("/check-slug", { slug });
}

export async function getFullOrganization(organizationId: string): Promise<Organization> {
  return getOrg("/get-full-organization", { organizationId }) as Promise<Organization>;
}

export async function updateOrganization(organizationId: string, data: Partial<{ name: string; slug: string; logo: string; metadata: string }>): Promise<Organization> {
  return postOrg("/update", { organizationId, data }) as Promise<Organization>;
}

export async function deleteOrganization(organizationId: string): Promise<void> {
  await postOrg("/delete", { organizationId });
}

export async function listMembers(organizationId: string): Promise<Member[]> {
  return getOrg("/list-members", { organizationId }) as Promise<Member[]>;
}

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  await postOrg("/update-member-role", { memberId, role });
}

export async function removeMember(memberIdOrEmail: string, organizationId: string): Promise<void> {
  await postOrg("/remove-member", { memberIdOrEmail, organizationId });
}

export async function inviteMember(organizationId: string, email: string, role: string, resend?: boolean): Promise<void> {
  await postOrg("/invite-member", { email, role, organizationId, ...(resend ? { resend: true } : {}) });
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await postOrg("/cancel-invitation", { invitationId });
}

export async function listInvitations(organizationId: string): Promise<Invitation[]> {
  return getOrg("/list-invitations", { organizationId }) as Promise<Invitation[]>;
}

export async function listTeams(organizationId: string): Promise<Team[]> {
  return getOrg("/list-teams", { organizationId }) as Promise<Team[]>;
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  return getOrg("/list-team-members", { teamId }) as Promise<TeamMember[]>;
}

export async function createTeam(name: string, organizationId: string): Promise<Team> {
  return postOrg("/create-team", { name, organizationId }) as Promise<Team>;
}

export async function updateTeam(teamId: string, name: string): Promise<Team> {
  return postOrg("/update-team", { teamId, data: { name } }) as Promise<Team>;
}

export async function removeTeam(teamId: string): Promise<void> {
  await postOrg("/remove-team", { teamId });
}

export async function addTeamMember(teamId: string, userId: string, organizationId: string): Promise<void> {
  await postOrg("/add-team-member", { teamId, userId, organizationId });
}

export async function removeTeamMember(teamId: string, userId: string, organizationId: string): Promise<void> {
  await postOrg("/remove-team-member", { teamId, userId, organizationId });
}
