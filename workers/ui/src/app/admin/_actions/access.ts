import { getUser, listUsers, type User } from "./users";
import { listMembers, listOrganizations, type Member, type Organization } from "./organizations";

const ownerAdminRoles = new Set(["owner", "admin"]);

export type OrganizationAuthority = {
  readonly member: Member;
  readonly organization: Organization;
};

export type AdminsRolesSnapshot = {
  readonly platformAdmins: readonly User[];
  readonly organizationAuthorities: readonly OrganizationAuthority[];
};

async function listAllPlatformAdmins(): Promise<User[]> {
  const limit = 100;
  const firstPage = await listUsers({
    limit,
    offset: 0,
    filterField: "role",
    filterValue: "admin",
    filterOperator: "eq",
  });
  const stride = firstPage.limit > 0 ? firstPage.limit : limit;
  const offsets: number[] = [];
  for (let offset = stride; offset < firstPage.total; offset += stride) offsets.push(offset);

  const rest = await Promise.all(offsets.map((offset) => listUsers({
    limit: stride,
    offset,
    filterField: "role",
    filterValue: "admin",
    filterOperator: "eq",
  })));

  return [firstPage, ...rest].flatMap((page) => page.users);
}

export async function listAdminsRoles(): Promise<AdminsRolesSnapshot> {
  const [platformAdmins, organizations] = await Promise.all([
    listAllPlatformAdmins(),
    listOrganizations(),
  ]);
  const memberLists = await Promise.all(organizations.map(async (organization) => ({
    organization,
    members: await listMembers(organization.id),
  })));

  return {
    platformAdmins,
    organizationAuthorities: memberLists.flatMap(({ organization, members }) =>
      members
        .filter((member) => ownerAdminRoles.has(member.role))
        .map((member) => ({ member, organization })),
    ),
  };
}

export { getUser };
