import type { ReactNode } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { PageBody, Stack } from "@id/ui";
import { OrganizationsListContent } from "../../workers/ui/src/app/admin/_components/identity/organizations-list-content";
import { OrgDetailProvider } from "../../workers/ui/src/app/admin/_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "../../workers/ui/src/app/admin/_components/identity/org-detail-header-content";
import { OrgDetailOverviewContent } from "../../workers/ui/src/app/admin/_components/identity/org-detail-overview-content";
import { OrganizationMembersContent } from "../../workers/ui/src/app/admin/_components/identity/organization-members-content";
import { OrganizationTeamsContent } from "../../workers/ui/src/app/admin/_components/identity/organization-teams-content";
import { OrganizationInvitationsContent } from "../../workers/ui/src/app/admin/_components/identity/organization-invitations-content";
import { ActivityLogContent } from "../../workers/ui/src/app/admin/_components/activity-log-content";
import type { Organization, Member, Team, TeamMember, Invitation } from "../../workers/ui/src/app/admin/_actions/organizations";
import type { User } from "../../workers/ui/src/app/admin/_actions/users";
import { AdminShell } from "../_decorators/shell";
import {
  mockOrganizations,
  mockMembers,
  mockTeams,
  mockTeamMembers,
  mockInvitations,
} from "../../workers/ui/src/app/admin/_mocks/organizations";
import { mockUsers } from "../../workers/ui/src/app/admin/_mocks/users";
import { mockActivities } from "../../workers/ui/src/app/admin/_mocks/audit";

export default { title: "Admin / Identity / Organizations" } satisfies StoryDefault;

function createListActions(orgs: Organization[]) {
  let current = [...orgs];
  return {
    listOrganizations: async () => current,
    createOrganization: async (data: { name: string; slug: string; logo?: string; metadata?: string }) => {
      const org: Organization = {
        id: `org_story_${current.length + 1}`,
        name: data.name,
        slug: data.slug,
        logo: data.logo ?? null,
        metadata: data.metadata ?? null,
        createdAt: new Date().toISOString(),
      };
      current = [org, ...current];
      return org;
    },
  };
}

export const OrgList_Populated: Story = () => {
  const actions = createListActions(mockOrganizations);
  return (
    <AdminShell activePath="/admin/identity/organizations">
      <PageBody>
        <OrganizationsListContent actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
OrgList_Populated.storyName = "Org List / Populated";

export const OrgList_Empty: Story = () => {
  const actions = createListActions([]);
  return (
    <AdminShell activePath="/admin/identity/organizations">
      <PageBody>
        <OrganizationsListContent actions={actions} />
      </PageBody>
    </AdminShell>
  );
};
OrgList_Empty.storyName = "Org List / Empty";

export const OrgList_CreateDialog: Story = () => {
  const actions = createListActions(mockOrganizations);
  return (
    <AdminShell activePath="/admin/identity/organizations">
      <PageBody>
        <OrganizationsListContent actions={actions} defaultCreateOpen />
      </PageBody>
    </AdminShell>
  );
};
OrgList_CreateDialog.storyName = "Org List / Create Dialog";

export const OrgList_Loading: Story = () => (
  <AdminShell activePath="/admin/identity/organizations">
    <PageBody>
      <OrganizationsListContent loading />
    </PageBody>
  </AdminShell>
);
OrgList_Loading.storyName = "Org List / Loading";

export const OrgList_Error: Story = () => (
  <AdminShell activePath="/admin/identity/organizations">
    <PageBody>
      <OrganizationsListContent error="Failed to load organizations" />
    </PageBody>
  </AdminShell>
);
OrgList_Error.storyName = "Org List / Error";

function createDetailActions(org: Organization) {
  let current = { ...org };
  return {
    getFullOrganization: async (_id: string) => current,
    updateOrganization: async (_id: string, data: Partial<{ name: string; slug: string; logo: string; metadata: string }>) => {
      current = { ...current, ...data };
      return current;
    },
    deleteOrganization: async (_id: string) => undefined,
  };
}

type OrgDetailFrameActions =
  NonNullable<Parameters<typeof OrgDetailProvider>[0]["actions"]> &
  NonNullable<Parameters<typeof OrgDetailHeaderContent>[0]["actions"]>;

function OrgDetailFrame({
  activePath,
  orgId,
  activeTab,
  actions,
  loading,
  error,
  children,
}: {
  activePath: string;
  orgId: string;
  activeTab: "overview" | "members" | "teams" | "invitations" | "audit";
  actions?: OrgDetailFrameActions;
  loading?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <AdminShell activePath={activePath}>
      <PageBody>
        <OrgDetailProvider orgId={orgId} loading={loading} error={error} actions={actions}>
          <Stack gap="md">
            <OrgDetailHeaderContent activeTab={activeTab} actions={actions} />
            {children}
          </Stack>
        </OrgDetailProvider>
      </PageBody>
    </AdminShell>
  );
}

export const OrgOverview_Populated: Story = () => {
  const actions = createDetailActions(mockOrganizations[0]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001" orgId="org_001" activeTab="overview" actions={actions}>
      <OrgDetailOverviewContent actions={actions} />
    </OrgDetailFrame>
  );
};
OrgOverview_Populated.storyName = "Org Overview / Populated";

export const OrgOverview_Empty: Story = () => {
  const actions = createDetailActions(mockOrganizations[1]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_002" orgId="org_002" activeTab="overview" actions={actions}>
      <OrgDetailOverviewContent actions={actions} />
    </OrgDetailFrame>
  );
};
OrgOverview_Empty.storyName = "Org Overview / Empty";

export const OrgOverview_Loading: Story = () => (
  <OrgDetailFrame activePath="/admin/identity/organizations/org_001" orgId="org_001" activeTab="overview" loading>
    <OrgDetailOverviewContent />
  </OrgDetailFrame>
);
OrgOverview_Loading.storyName = "Org Overview / Loading";

export const OrgOverview_Error: Story = () => (
  <OrgDetailFrame
    activePath="/admin/identity/organizations/org_001"
    orgId="org_001"
    activeTab="overview"
    error="Failed to load organization"
  >
    <OrgDetailOverviewContent />
  </OrgDetailFrame>
);
OrgOverview_Error.storyName = "Org Overview / Error";

const userMap = new Map<string, User>(mockUsers.map((u) => [u.id, u]));

function createMembersActions(members: Member[]) {
  let current = [...members];
  return {
    listMembers: async (_orgId: string) => current,
    updateMemberRole: async (memberId: string, role: string) => {
      current = current.map((m) => m.id === memberId ? { ...m, role } : m);
    },
    removeMember: async (memberIdOrEmail: string, _orgId: string) => {
      current = current.filter((m) => m.id !== memberIdOrEmail);
    },
    inviteMember: async (_orgId: string, _email: string, _role: string) => undefined,
    getUser: async (userId: string) => {
      const user = userMap.get(userId) ?? { id: userId, name: userId, email: `${userId}@example.com`, emailVerified: true, image: null, role: "user", banned: false, banReason: null, banExpires: null, createdAt: "", updatedAt: "" };
      return { user };
    },
  };
}

export const OrgMembers_Populated: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  const actions = createMembersActions(mockMembers);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/members" orgId="org_001" activeTab="members" actions={detail}>
      <OrganizationMembersContent orgId="org_001" orgName="Acme Corp" actions={actions} />
    </OrgDetailFrame>
  );
};
OrgMembers_Populated.storyName = "Org Members / Populated";

export const OrgMembers_Empty: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  const actions = createMembersActions([]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/members" orgId="org_001" activeTab="members" actions={detail}>
      <OrganizationMembersContent orgId="org_001" actions={actions} />
    </OrgDetailFrame>
  );
};
OrgMembers_Empty.storyName = "Org Members / Empty";

export const OrgMembers_Loading: Story = () => (
  <OrgDetailFrame activePath="/admin/identity/organizations/org_001/members" orgId="org_001" activeTab="members" loading>
    <OrganizationMembersContent orgId="org_001" loading />
  </OrgDetailFrame>
);
OrgMembers_Loading.storyName = "Org Members / Loading";

export const OrgMembers_Error: Story = () => (
  <OrgDetailFrame
    activePath="/admin/identity/organizations/org_001/members"
    orgId="org_001"
    activeTab="members"
    error="Failed to load organization"
  >
    <OrganizationMembersContent orgId="org_001" error="Failed to load members" />
  </OrgDetailFrame>
);
OrgMembers_Error.storyName = "Org Members / Error";

function createTeamsActions(teams: Team[]) {
  let currentTeams = [...teams];
  return {
    listTeams: async (_orgId: string) => currentTeams,
    listTeamMembers: async (teamId: string): Promise<TeamMember[]> => mockTeamMembers[teamId] ?? [],
    listMembers: async (_orgId: string): Promise<Member[]> => mockMembers,
    createTeam: async (name: string, orgId: string): Promise<Team> => {
      const t: Team = { id: `team_story_${Date.now()}`, name, organizationId: orgId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      currentTeams = [...currentTeams, t];
      return t;
    },
    updateTeam: async (teamId: string, name: string): Promise<Team> => {
      const found = currentTeams.find((team) => team.id === teamId)!;
      currentTeams = currentTeams.map((team) => team.id === teamId ? { ...team, name } : team);
      return Object.assign({}, found, { name });
    },
    removeTeam: async (teamId: string) => {
      currentTeams = currentTeams.filter((t) => t.id !== teamId);
    },
    addTeamMember: async (_teamId: string, _userId: string, _orgId: string) => undefined,
    removeTeamMember: async (_teamId: string, _userId: string, _orgId: string) => undefined,
    getUser: async (userId: string) => {
      const user = userMap.get(userId) ?? { id: userId, name: userId, email: `${userId}@example.com`, emailVerified: true, image: null, role: "user", banned: false, banReason: null, banExpires: null, createdAt: "", updatedAt: "" };
      return { user };
    },
  };
}

export const OrgTeams_Populated: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  const actions = createTeamsActions(mockTeams);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/teams" orgId="org_001" activeTab="teams" actions={detail}>
      <OrganizationTeamsContent orgId="org_001" actions={actions} />
    </OrgDetailFrame>
  );
};
OrgTeams_Populated.storyName = "Org Teams / Populated";

export const OrgTeams_Empty: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  const actions = createTeamsActions([]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/teams" orgId="org_001" activeTab="teams" actions={detail}>
      <OrganizationTeamsContent orgId="org_001" actions={actions} />
    </OrgDetailFrame>
  );
};
OrgTeams_Empty.storyName = "Org Teams / Empty";

export const OrgTeams_Loading: Story = () => (
  <OrgDetailFrame activePath="/admin/identity/organizations/org_001/teams" orgId="org_001" activeTab="teams" loading>
    <OrganizationTeamsContent orgId="org_001" loading />
  </OrgDetailFrame>
);
OrgTeams_Loading.storyName = "Org Teams / Loading";

export const OrgTeams_Error: Story = () => (
  <OrgDetailFrame
    activePath="/admin/identity/organizations/org_001/teams"
    orgId="org_001"
    activeTab="teams"
    error="Failed to load organization"
  >
    <OrganizationTeamsContent orgId="org_001" error="Failed to load teams" />
  </OrgDetailFrame>
);
OrgTeams_Error.storyName = "Org Teams / Error";

function createInvsActions(invs: Invitation[]) {
  let current = [...invs];
  return {
    listInvitations: async (_orgId: string) => current,
    inviteMember: async (_orgId: string, _email: string, _role: string, _resend?: boolean) => undefined,
    cancelInvitation: async (invitationId: string) => {
      current = current.filter((i) => i.id !== invitationId);
    },
    getUser: async (userId: string) => {
      const user = userMap.get(userId) ?? { id: userId, name: "Admin", email: `${userId}@example.com`, emailVerified: true, image: null, role: "admin", banned: false, banReason: null, banExpires: null, createdAt: "", updatedAt: "" };
      return { user };
    },
  };
}

export const OrgInvitations_Populated: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  const actions = createInvsActions(mockInvitations);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/invitations" orgId="org_001" activeTab="invitations" actions={detail}>
      <OrganizationInvitationsContent orgId="org_001" actions={actions} />
    </OrgDetailFrame>
  );
};
OrgInvitations_Populated.storyName = "Org Invitations / Populated";

export const OrgInvitations_Empty: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  const actions = createInvsActions([]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/invitations" orgId="org_001" activeTab="invitations" actions={detail}>
      <OrganizationInvitationsContent orgId="org_001" actions={actions} />
    </OrgDetailFrame>
  );
};
OrgInvitations_Empty.storyName = "Org Invitations / Empty";

export const OrgInvitations_Loading: Story = () => (
  <OrgDetailFrame activePath="/admin/identity/organizations/org_001/invitations" orgId="org_001" activeTab="invitations" loading>
    <OrganizationInvitationsContent orgId="org_001" loading />
  </OrgDetailFrame>
);
OrgInvitations_Loading.storyName = "Org Invitations / Loading";

export const OrgInvitations_Error: Story = () => (
  <OrgDetailFrame
    activePath="/admin/identity/organizations/org_001/invitations"
    orgId="org_001"
    activeTab="invitations"
    error="Failed to load organization"
  >
    <OrganizationInvitationsContent orgId="org_001" error="Failed to load invitations" />
  </OrgDetailFrame>
);
OrgInvitations_Error.storyName = "Org Invitations / Error";

function createActivityActions(entries = mockActivities) {
  const orgEntries = entries.filter((entry) => entry.targetType === "organization");
  return {
    listActivityLog: async () => ({
      entries: orgEntries,
      total: orgEntries.length,
      limit: 25,
      offset: 0,
    }),
  };
}

export const OrgAudit_Populated: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/audit" orgId="org_001" activeTab="audit" actions={detail}>
      <ActivityLogContent targetType="organization" targetId="org_001" actions={createActivityActions()} />
    </OrgDetailFrame>
  );
};
OrgAudit_Populated.storyName = "Org Audit / Populated";

export const OrgAudit_Empty: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/audit" orgId="org_001" activeTab="audit" actions={detail}>
      <ActivityLogContent targetType="organization" targetId="org_001" actions={createActivityActions([])} />
    </OrgDetailFrame>
  );
};
OrgAudit_Empty.storyName = "Org Audit / Empty";

export const OrgAudit_Loading: Story = () => (
  <OrgDetailFrame activePath="/admin/identity/organizations/org_001/audit" orgId="org_001" activeTab="audit" loading>
    <ActivityLogContent targetType="organization" targetId="org_001" loading />
  </OrgDetailFrame>
);
OrgAudit_Loading.storyName = "Org Audit / Loading";

export const OrgAudit_Error: Story = () => {
  const detail = createDetailActions(mockOrganizations[0]);
  return (
    <OrgDetailFrame activePath="/admin/identity/organizations/org_001/audit" orgId="org_001" activeTab="audit" actions={detail}>
      <ActivityLogContent targetType="organization" targetId="org_001" error="Failed to load activity" />
    </OrgDetailFrame>
  );
};
OrgAudit_Error.storyName = "Org Audit / Error";
