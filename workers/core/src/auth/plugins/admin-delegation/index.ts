import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  ADMIN_ROLE_BINDING_MODEL,
  ADMIN_ROLE_MODEL,
} from "../../../shared/constants";
import {
  adminRoleBetterAuthFields,
  adminRoleBindingBetterAuthFields,
  adminRoleBindingOpenApiSchema,
  adminRoleOpenApiSchema,
  adminDelegationEndpointMeta,
  createAdminRoleBindingBody,
  createAdminRoleBindingOpenApiRequestBody,
  createAdminRoleBody,
  createAdminRoleOpenApiRequestBody,
  deleteAdminRoleBindingOpenApiSchema,
  listAdminRoleBindingsOpenApiSchema,
  listAdminRolesOpenApiSchema,
  updateAdminRoleBody,
  updateAdminRoleOpenApiRequestBody,
  type AdminRoleBindingRow,
  type AdminRoleRow,
} from "./schema";
import {
  assertAdminDelegationAccess,
  assertMutableRole,
  assertRoleExists,
  assertUniqueAdminRoleSlug,
  assertUniqueRoleBinding,
  buildCreateBindingPayload,
  buildCreateRolePayload,
  buildUpdateRolePayload,
  adminRoleBindingKey,
} from "./operations";
import type { AdapterContext, AdminDelegationPluginOptions } from "./types";

export type { AdminDelegationPluginOptions } from "./types";

const listRolesMetadata = adminDelegationEndpointMeta({
  description: "List delegated admin roles",
  responseSchema: listAdminRolesOpenApiSchema,
  responseDescription: "Delegated admin roles",
});

const createRoleMetadata = adminDelegationEndpointMeta({
  description: "Create a delegated admin role",
  requestBody: createAdminRoleOpenApiRequestBody,
  responseSchema: adminRoleOpenApiSchema,
  responseDescription: "Delegated admin role created",
});

const updateRoleMetadata = adminDelegationEndpointMeta({
  description: "Update a delegated admin role",
  hasIdParam: true,
  requestBody: updateAdminRoleOpenApiRequestBody,
  responseSchema: adminRoleOpenApiSchema,
  responseDescription: "Delegated admin role updated",
});

const listBindingsMetadata = adminDelegationEndpointMeta({
  description: "List delegated admin role bindings",
  responseSchema: listAdminRoleBindingsOpenApiSchema,
  responseDescription: "Delegated admin role bindings",
});

const createBindingMetadata = adminDelegationEndpointMeta({
  description: "Create a delegated admin role binding",
  requestBody: createAdminRoleBindingOpenApiRequestBody,
  responseSchema: adminRoleBindingOpenApiSchema,
  responseDescription: "Delegated admin role binding created",
});

const deleteBindingMetadata = adminDelegationEndpointMeta({
  description: "Delete a delegated admin role binding",
  hasIdParam: true,
  responseSchema: deleteAdminRoleBindingOpenApiSchema,
  responseDescription: "Delegated admin role binding deleted",
});

async function assertSessionAccess(
  options: AdminDelegationPluginOptions,
  session: NonNullable<unknown>,
  adapter: unknown,
): Promise<{ userId: string; role: string | null | undefined }> {
  const user = (session as { user?: { id?: unknown; role?: unknown } }).user;
  if (!user || typeof user.id !== "string") throw new APIError("UNAUTHORIZED");
  const role =
    typeof user.role === "string" ||
    user.role === null ||
    user.role === undefined
      ? user.role
      : undefined;
  await assertAdminDelegationAccess(options.authorize, user.id, role, adapter);
  return { userId: user.id, role };
}

/** Better Auth plugin for repository-specific delegated console roles. */
export const idAdminDelegation = (
  options: AdminDelegationPluginOptions = {},
): BetterAuthPlugin => ({
  id: "id-admin-delegation",
  schema: {
    adminRole: {
      fields: adminRoleBetterAuthFields,
    },
    adminRoleBinding: {
      fields: adminRoleBindingBetterAuthFields,
    },
  },
  endpoints: {
    listAdminRoles: createAuthEndpoint(
      "/admin/delegation/roles",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: listRolesMetadata,
      },
      async (ctx) => {
        await assertSessionAccess(
          options,
          ctx.context.session,
          ctx.context.adapter,
        );
        const roles = await ctx.context.adapter.findMany<AdminRoleRow>({
          model: ADMIN_ROLE_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        return ctx.json({ roles });
      },
    ),

    createAdminRole: createAuthEndpoint(
      "/admin/delegation/roles",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createAdminRoleBody,
        metadata: createRoleMetadata,
      },
      async (ctx) => {
        const session = await assertSessionAccess(
          options,
          ctx.context.session,
          ctx.context.adapter,
        );
        const adapter = ctx.context.adapter as AdapterContext;
        await assertUniqueAdminRoleSlug(adapter, ctx.body.slug);
        const row = await adapter.create<AdminRoleRow>({
          model: ADMIN_ROLE_MODEL,
          data: buildCreateRolePayload(ctx.body, session.userId),
        });
        return ctx.json(row);
      },
    ),

    updateAdminRole: createAuthEndpoint(
      "/admin/delegation/roles/:id",
      {
        method: "PATCH",
        use: [sessionMiddleware],
        body: updateAdminRoleBody,
        metadata: updateRoleMetadata,
      },
      async (ctx) => {
        const session = await assertSessionAccess(
          options,
          ctx.context.session,
          ctx.context.adapter,
        );
        const adapter = ctx.context.adapter as AdapterContext;
        const existing = await adapter.findOne<AdminRoleRow>({
          model: ADMIN_ROLE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        assertMutableRole(existing);
        const row = await adapter.update<AdminRoleRow>({
          model: ADMIN_ROLE_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
          update: buildUpdateRolePayload(ctx.body, session.userId),
        });
        return ctx.json(row);
      },
    ),

    listAdminRoleBindings: createAuthEndpoint(
      "/admin/delegation/bindings",
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: listBindingsMetadata,
      },
      async (ctx) => {
        await assertSessionAccess(
          options,
          ctx.context.session,
          ctx.context.adapter,
        );
        const bindings =
          await ctx.context.adapter.findMany<AdminRoleBindingRow>({
            model: ADMIN_ROLE_BINDING_MODEL,
            sortBy: { field: "createdAt", direction: "desc" },
          });
        return ctx.json({ bindings });
      },
    ),

    createAdminRoleBinding: createAuthEndpoint(
      "/admin/delegation/bindings",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createAdminRoleBindingBody,
        metadata: createBindingMetadata,
      },
      async (ctx) => {
        const session = await assertSessionAccess(
          options,
          ctx.context.session,
          ctx.context.adapter,
        );
        const adapter = ctx.context.adapter as AdapterContext;
        await assertRoleExists(adapter, ctx.body.roleId);
        await assertUniqueRoleBinding(adapter, adminRoleBindingKey(ctx.body));
        const row = await adapter.create<AdminRoleBindingRow>({
          model: ADMIN_ROLE_BINDING_MODEL,
          data: buildCreateBindingPayload(ctx.body, session.userId),
        });
        return ctx.json(row);
      },
    ),

    deleteAdminRoleBinding: createAuthEndpoint(
      "/admin/delegation/bindings/:id",
      {
        method: "DELETE",
        use: [sessionMiddleware],
        metadata: deleteBindingMetadata,
      },
      async (ctx) => {
        await assertSessionAccess(
          options,
          ctx.context.session,
          ctx.context.adapter,
        );
        const adapter = ctx.context.adapter as AdapterContext;
        const existing = await adapter.findOne<AdminRoleBindingRow>({
          model: ADMIN_ROLE_BINDING_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        if (!existing) throw new APIError("NOT_FOUND");
        await adapter.delete({
          model: ADMIN_ROLE_BINDING_MODEL,
          where: [{ field: "id", value: ctx.params?.id }],
        });
        return ctx.json({ deleted: true });
      },
    ),
  },
});
