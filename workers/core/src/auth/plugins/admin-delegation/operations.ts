import { APIError } from "better-auth/api";
import {
  ADMIN_ROLE_BINDING_MODEL,
  ADMIN_ROLE_MODEL,
} from "../../../shared/constants";
import type { AdminDelegationPluginOptions, AdapterContext } from "./types";
import type {
  AdminRoleBindingRow,
  AdminRoleRow,
  CreateAdminRoleBindingBody,
  CreateAdminRoleBody,
  UpdateAdminRoleBody,
} from "./schema";

export type AuthorizeFn = NonNullable<
  AdminDelegationPluginOptions["authorize"]
>;

export async function assertAdminDelegationAccess(
  authorize: AuthorizeFn | undefined,
  userId: string,
  role: string | null | undefined,
  adapter: unknown,
): Promise<void> {
  if (!authorize || !(await authorize(userId, role, adapter))) {
    throw new APIError("FORBIDDEN");
  }
}

export async function assertUniqueAdminRoleSlug(
  adapter: AdapterContext,
  slug: string,
  ignoreId?: string,
): Promise<void> {
  const rows = await adapter.findMany<AdminRoleRow>({
    model: ADMIN_ROLE_MODEL,
    where: [{ field: "slug", value: slug }],
  });
  if (rows.some((row) => row.id !== ignoreId)) {
    throw new APIError("BAD_REQUEST", {
      message: "Admin role slug already exists",
    });
  }
}

export function adminRoleBindingKey(
  body: Pick<
    CreateAdminRoleBindingBody,
    "principalType" | "principalId" | "roleId" | "scope"
  >,
): string {
  return [body.principalType, body.principalId, body.roleId, body.scope].join(
    ":",
  );
}

export async function assertRoleExists(
  adapter: AdapterContext,
  roleId: string,
): Promise<AdminRoleRow> {
  const row = await adapter.findOne<AdminRoleRow>({
    model: ADMIN_ROLE_MODEL,
    where: [{ field: "id", value: roleId }],
  });
  if (!row) throw new APIError("BAD_REQUEST", { message: "Role not found" });
  return row;
}

export async function assertUniqueRoleBinding(
  adapter: AdapterContext,
  bindingKey: string,
): Promise<void> {
  const row = await adapter.findOne<AdminRoleBindingRow>({
    model: ADMIN_ROLE_BINDING_MODEL,
    where: [{ field: "bindingKey", value: bindingKey }],
  });
  if (row) {
    throw new APIError("BAD_REQUEST", {
      message: "Admin role binding already exists",
    });
  }
}

export function buildCreateRolePayload(
  body: CreateAdminRoleBody,
  actorId: string,
): Omit<AdminRoleRow, "id"> {
  const now = Date.now();
  return {
    ...body,
    system: false,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdateRolePayload(
  body: UpdateAdminRoleBody,
  actorId: string,
): Partial<AdminRoleRow> {
  return {
    ...body,
    updatedBy: actorId,
    updatedAt: Date.now(),
  };
}

export function buildCreateBindingPayload(
  body: CreateAdminRoleBindingBody,
  actorId: string,
): Omit<AdminRoleBindingRow, "id"> {
  return {
    ...body,
    bindingKey: adminRoleBindingKey(body),
    expiresAt: body.expiresAt ?? null,
    createdBy: actorId,
    createdAt: Date.now(),
  };
}

export function assertMutableRole(role: AdminRoleRow): void {
  if (role.system) {
    throw new APIError("BAD_REQUEST", {
      message: "System admin roles are read-only",
    });
  }
}
