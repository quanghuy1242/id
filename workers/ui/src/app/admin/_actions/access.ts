import { authApiGetOrThrow } from "@idco/lib";
import { getUser, listUsers, type User } from "./users";
import {
  listMembers,
  listOrganizations,
  type Member,
  type Organization,
} from "./organizations";

const ownerAdminRoles = new Set(["owner", "admin"]);

export type OrganizationAuthority = {
  readonly member: Member;
  readonly organization: Organization;
};

export type AdminDelegationRole = {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly description?: string;
  readonly permissions: readonly string[];
  readonly system: boolean;
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type AdminDelegationBinding = {
  readonly id: string;
  readonly bindingKey: string;
  readonly principalType: "user" | "team" | "group" | "oauth_client";
  readonly principalId: string;
  readonly roleId: string;
  readonly scope: string;
  readonly expiresAt?: number | null;
  readonly createdBy?: string;
  readonly createdAt: number;
};

export type AdminsRolesSnapshot = {
  readonly platformAdmins: readonly User[];
  readonly organizationAuthorities: readonly OrganizationAuthority[];
  readonly delegatedRoles: readonly AdminDelegationRole[];
  readonly delegatedBindings: readonly AdminDelegationBinding[];
};

type DelegatedRolesEnvelope = { roles: AdminDelegationRole[] };
type DelegatedBindingsEnvelope = { bindings: AdminDelegationBinding[] };

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
  for (let offset = stride; offset < firstPage.total; offset += stride)
    offsets.push(offset);

  const rest = await Promise.all(
    offsets.map((offset) =>
      listUsers({
        limit: stride,
        offset,
        filterField: "role",
        filterValue: "admin",
        filterOperator: "eq",
      }),
    ),
  );

  return [firstPage, ...rest].flatMap((page) => page.users);
}

export async function listAdminsRoles(): Promise<AdminsRolesSnapshot> {
  const [platformAdmins, organizations, delegatedRoles, delegatedBindings] =
    await Promise.all([
      listAllPlatformAdmins(),
      listOrganizations(),
      authApiGetOrThrow<DelegatedRolesEnvelope>("/admin/delegation/roles"),
      authApiGetOrThrow<DelegatedBindingsEnvelope>(
        "/admin/delegation/bindings",
      ),
    ]);
  const memberLists = await Promise.all(
    organizations.map(async (organization) => ({
      organization,
      members: await listMembers(organization.id),
    })),
  );

  return {
    platformAdmins,
    delegatedRoles: delegatedRoles.roles,
    delegatedBindings: delegatedBindings.bindings,
    organizationAuthorities: memberLists.flatMap(({ organization, members }) =>
      members
        .filter((member) => ownerAdminRoles.has(member.role))
        .map((member) => ({ member, organization })),
    ),
  };
}

export { getUser };
