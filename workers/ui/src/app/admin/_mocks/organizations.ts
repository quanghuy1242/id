import type { Invitation, Member, Organization, Team, TeamMember } from "../_actions/organizations";

export const mockOrganizations: Organization[] = [
  {
    id: "org_001",
    name: "Acme Corp",
    slug: "acme",
    logo: null,
    metadata: '{"plan":"enterprise"}',
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "org_002",
    name: "Beta Inc",
    slug: "beta-inc",
    logo: null,
    metadata: null,
    createdAt: "2024-03-20T00:00:00.000Z",
  },
  {
    id: "org_003",
    name: "Gamma LLC",
    slug: "gamma",
    logo: null,
    metadata: '{"plan":"starter"}',
    createdAt: "2024-08-01T00:00:00.000Z",
  },
];

export const mockMembers: Member[] = [
  { id: "mem_001", organizationId: "org_001", userId: "user_001", role: "owner", createdAt: "2024-01-15T00:00:00.000Z" },
  { id: "mem_002", organizationId: "org_001", userId: "user_002", role: "admin", createdAt: "2024-02-01T00:00:00.000Z" },
  { id: "mem_003", organizationId: "org_001", userId: "user_003", role: "member", createdAt: "2024-03-10T00:00:00.000Z" },
];

export const mockTeams: Team[] = [
  { id: "team_001", name: "Frontend", organizationId: "org_001", createdAt: "2024-01-15T00:00:00.000Z", updatedAt: "2024-01-15T00:00:00.000Z" },
  { id: "team_002", name: "Backend", organizationId: "org_001", createdAt: "2025-02-01T00:00:00.000Z", updatedAt: "2025-02-01T00:00:00.000Z" },
  { id: "team_003", name: "Design", organizationId: "org_001", createdAt: "2025-03-10T00:00:00.000Z", updatedAt: "2025-03-10T00:00:00.000Z" },
];

export const mockTeamMembers: Record<string, TeamMember[]> = {
  team_001: [
    { id: "tm_001", teamId: "team_001", userId: "user_001", createdAt: "2024-01-15T00:00:00.000Z" },
    { id: "tm_002", teamId: "team_001", userId: "user_003", createdAt: "2024-03-10T00:00:00.000Z" },
  ],
  team_002: [
    { id: "tm_003", teamId: "team_002", userId: "user_001", createdAt: "2025-02-01T00:00:00.000Z" },
    { id: "tm_004", teamId: "team_002", userId: "user_002", createdAt: "2025-02-15T00:00:00.000Z" },
  ],
  team_003: [],
};

export const mockInvitations: Invitation[] = [
  {
    id: "inv_001",
    organizationId: "org_001",
    email: "bob@corp.com",
    role: "member",
    teamId: null,
    status: "pending",
    expiresAt: "2025-02-01T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    inviterId: "user_001",
  },
  {
    id: "inv_002",
    organizationId: "org_001",
    email: "alice@venture.com",
    role: "admin",
    teamId: "team_002",
    status: "pending",
    expiresAt: "2025-01-20T00:00:00.000Z",
    createdAt: "2024-12-20T00:00:00.000Z",
    inviterId: "user_001",
  },
  {
    id: "inv_003",
    organizationId: "org_001",
    email: "old@example.com",
    role: "member",
    teamId: null,
    status: "expired",
    expiresAt: "2024-11-01T00:00:00.000Z",
    createdAt: "2024-10-01T00:00:00.000Z",
    inviterId: "user_002",
  },
];
