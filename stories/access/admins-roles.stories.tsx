import type { ReactNode } from "react";
import type { Story, StoryDefault } from "@ladle/react";
import { PageBody } from "@id/ui";
import { AdminsRolesContent } from "../../workers/ui/src/app/admin/_components/access/admins-roles-content";
import type { AdminsRolesSnapshot } from "../../workers/ui/src/app/admin/_actions/access";
import { mockMembers, mockOrganizations } from "../../workers/ui/src/app/admin/_mocks/organizations";
import { mockUsers } from "../../workers/ui/src/app/admin/_mocks/users";
import { AdminShell } from "../_decorators/shell";

export default { title: "Admin / Access / Admins & Roles" } satisfies StoryDefault;

const activePath = "/admin/platform/access/admins-roles";

function snapshot(platformAdmins = mockUsers.filter((user) => user.role === "admin")): AdminsRolesSnapshot {
  return {
    platformAdmins,
    organizationAuthorities: mockMembers
      .filter((member) => member.role === "owner" || member.role === "admin")
      .map((member) => ({
        member,
        organization: mockOrganizations.find((organization) => organization.id === member.organizationId) ?? mockOrganizations[0],
      })),
  };
}

function actions(data: AdminsRolesSnapshot) {
  return {
    listAdminsRoles: async () => data,
    getUser: async (userId: string) => ({ user: mockUsers.find((user) => user.id === userId) ?? mockUsers[0] }),
  };
}

function Frame({ children }: { readonly children: ReactNode }) {
  return (
    <AdminShell activePath={activePath}>
      <PageBody>{children}</PageBody>
    </AdminShell>
  );
}

export const Populated: Story = () => (
  <Frame>
    <AdminsRolesContent actions={actions(snapshot())} />
  </Frame>
);

export const Empty: Story = () => (
  <Frame>
    <AdminsRolesContent actions={actions({ platformAdmins: [], organizationAuthorities: [] })} />
  </Frame>
);

export const Loading: Story = () => (
  <Frame>
    <AdminsRolesContent loading />
  </Frame>
);

export const Error: Story = () => (
  <Frame>
    <AdminsRolesContent error="Failed to load admins and roles" />
  </Frame>
);
