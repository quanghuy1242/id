import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  ADMIN_ACTIVITY_LOG_MODEL,
  USER_MODEL,
} from "../../../shared/constants";
import { readBody, readString } from "../../../shared/request";
import {
  activityFilters,
  appendActivityLog,
  parseActivityPageParams,
  presentActivity,
  uniqueActorIds,
} from "./operations";
import {
  adminActivityLogBetterAuthFields,
  adminActivityLogEndpointMeta,
  listActivityLogOpenApiSchema,
  type AdminActivityLogRow,
} from "./schema";
import type { ActivityAdapter, ActivityRecordDraft, AdminActivityLogPluginOptions } from "./types";

export type { AdminActivityLogPluginOptions } from "./types";

type UserRow = { id: string; email?: string | null };

function activityAdapter(ctx: { context: Record<string, unknown> }): ActivityAdapter {
  return ctx.context.adapter as ActivityAdapter;
}

function requireAdmin(authorize: AdminActivityLogPluginOptions["authorize"], session: { user: unknown } | null): void {
  if (!session) throw new APIError("UNAUTHORIZED");
  const role = (session.user as { role?: string | null } | null)?.role;
  if (!authorize || !authorize(role)) throw new APIError("FORBIDDEN");
}

async function actorEmailMap(adapter: ActivityAdapter, actorIds: string[]): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();
  const users = await adapter.findMany<UserRow>({
    model: USER_MODEL,
    where: [{ field: "id", value: actorIds, operator: "in" }],
  });
  const map = new Map<string, string>();
  for (const user of users) if (user.email) map.set(user.id, user.email);
  return map;
}

const listActivityLogMeta = adminActivityLogEndpointMeta({
  description: "List append-only admin activity entries (platform admin only)",
  responseSchema: listActivityLogOpenApiSchema,
  responseDescription: "Paginated activity-log entries with actor-email enrichment",
});

type HookContext = {
  readonly path?: string;
  readonly method?: string;
  readonly body?: unknown;
  readonly params?: { readonly id?: unknown };
  readonly context: Record<string, unknown> & {
    readonly adapter?: unknown;
    readonly session?: { readonly user?: unknown } | null;
    readonly returned?: unknown;
  };
};

function sessionUser(ctx: HookContext): { id: string; role?: string | null } | null {
  const user = ctx.context.session?.user as { id?: unknown; role?: string | null } | undefined;
  return typeof user?.id === "string" ? { id: user.id, role: user.role } : null;
}

function returnedRecord(ctx: HookContext): Record<string, unknown> | null {
  const returned = ctx.context.returned;
  return returned && typeof returned === "object" && !Array.isArray(returned)
    ? returned as Record<string, unknown>
    : null;
}

function pathId(ctx: HookContext): string | undefined {
  const id = ctx.params?.id;
  return typeof id === "string" ? id : undefined;
}

function stringFromReturned(ctx: HookContext, ...keys: string[]): string | undefined {
  const returned = returnedRecord(ctx);
  for (const key of keys) {
    const value = returned?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function userTargetId(ctx: HookContext): string | undefined {
  const body = readBody(ctx);
  return readString(body, "userId") ?? stringFromReturned(ctx, "id");
}

function organizationTargetId(ctx: HookContext): string | undefined {
  const body = readBody(ctx);
  return readString(body, "organizationId") ?? stringFromReturned(ctx, "id");
}

function teamTargetId(ctx: HookContext): string | undefined {
  const body = readBody(ctx);
  return readString(body, "teamId") ?? stringFromReturned(ctx, "id");
}

function activityFromHook(ctx: HookContext): ActivityRecordDraft | null {
  const body = readBody(ctx);
  const path = ctx.path ?? "";
  const method = ctx.method ?? "";
  const id = pathId(ctx);

  if (path === "/oauth2/create-client") return { action: "oauth_client.create", targetType: "oauth_client", targetId: stringFromReturned(ctx, "client_id", "clientId") ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/oauth2/update-client") return { action: "oauth_client.update", targetType: "oauth_client", targetId: readString(body, "client_id") ?? "unknown", after: body.update ?? returnedRecord(ctx), metadata: { path } };
  if (path === "/oauth2/client/rotate-secret") return { action: "oauth_client.rotate_secret", targetType: "oauth_client", targetId: readString(body, "client_id") ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/oauth2/delete-client") return { action: "oauth_client.delete", targetType: "oauth_client", targetId: readString(body, "client_id") ?? "unknown", before: { clientId: readString(body, "client_id") }, metadata: { path } };

  if (path === "/admin/resource-servers" && method === "POST") return { action: "resource_server.create", targetType: "resource_server", targetId: stringFromReturned(ctx, "id") ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/resource-servers/:id" && method === "PATCH") return { action: "resource_server.update", targetType: "resource_server", targetId: id ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/resource-servers/:id" && method === "DELETE") return { action: "resource_server.delete", targetType: "resource_server", targetId: id ?? "unknown", before: { id }, metadata: { path } };
  if (path === "/admin/resource-servers/:id/disable") return { action: "resource_server.disable", targetType: "resource_server", targetId: id ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/resource-servers/:id/enable") return { action: "resource_server.enable", targetType: "resource_server", targetId: id ?? "unknown", after: returnedRecord(ctx), metadata: { path } };

  if (path === "/admin/oauth-scopes" && method === "POST") return { action: "oauth_scope.create", targetType: "oauth_scope", targetId: stringFromReturned(ctx, "id") ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/oauth-scopes/:id") return { action: "oauth_scope.update", targetType: "oauth_scope", targetId: id ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/oauth-client-resource-scopes" && method === "POST") return { action: "client_resource_scope.create", targetType: "client_resource_scope", targetId: stringFromReturned(ctx, "id") ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/oauth-client-resource-scopes/:id" && method === "PATCH") return { action: "client_resource_scope.update", targetType: "client_resource_scope", targetId: id ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/oauth-client-resource-scopes/:id" && method === "DELETE") return { action: "client_resource_scope.delete", targetType: "client_resource_scope", targetId: id ?? "unknown", before: { id }, metadata: { path } };

  if (path === "/admin/revoke-consent") return { action: "consent.revoke", targetType: "oauth_consent", targetId: `${readString(body, "clientId") ?? "unknown"}:${readString(body, "userId") ?? "unknown"}`, before: body, metadata: { path } };
  if (path === "/admin/jwks/rotate") return { action: "jwks.rotate", targetType: "jwks", targetId: stringFromReturned(ctx, "id") ?? "unknown", after: returnedRecord(ctx), metadata: { path, reason: readString(body, "reason") } };
  if (path === "/admin/create-user") return { action: "user.create", targetType: "user", targetId: stringFromReturned(ctx, "id") ?? (returnedRecord(ctx)?.user as { id?: string } | undefined)?.id ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/update-user") return { action: "user.update", targetType: "user", targetId: userTargetId(ctx) ?? "unknown", after: body.data ?? returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/set-role") return { action: "user.set_role", targetType: "user", targetId: userTargetId(ctx) ?? "unknown", after: { role: readString(body, "role") }, metadata: { path } };
  if (path === "/admin/set-user-password") return { action: "user.set_password", targetType: "user", targetId: userTargetId(ctx) ?? "unknown", metadata: { path } };
  if (path === "/admin/ban-user") return { action: "user.ban", targetType: "user", targetId: userTargetId(ctx) ?? "unknown", after: returnedRecord(ctx), metadata: { path, reason: readString(body, "banReason") } };
  if (path === "/admin/unban-user") return { action: "user.unban", targetType: "user", targetId: userTargetId(ctx) ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/admin/remove-user") return { action: "user.delete", targetType: "user", targetId: userTargetId(ctx) ?? "unknown", before: { userId: userTargetId(ctx) }, metadata: { path } };

  if (path === "/organization/create") return { action: "organization.create", targetType: "organization", targetId: organizationTargetId(ctx) ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/organization/update") return { action: "organization.update", targetType: "organization", targetId: organizationTargetId(ctx) ?? "unknown", after: body.data ?? returnedRecord(ctx), metadata: { path } };
  if (path === "/organization/delete") return { action: "organization.delete", targetType: "organization", targetId: organizationTargetId(ctx) ?? "unknown", before: { organizationId: organizationTargetId(ctx) }, metadata: { path } };
  if (path === "/organization/invite-member") return { action: "organization.invite_member", targetType: "organization", targetId: organizationTargetId(ctx) ?? "unknown", after: body, metadata: { path } };
  if (path === "/organization/update-member-role") return { action: "organization.update_member_role", targetType: "organization_member", targetId: readString(body, "memberId") ?? "unknown", after: { role: readString(body, "role") }, metadata: { path } };
  if (path === "/organization/remove-member") return { action: "organization.remove_member", targetType: "organization", targetId: organizationTargetId(ctx) ?? "unknown", before: { memberIdOrEmail: readString(body, "memberIdOrEmail") }, metadata: { path } };
  if (path === "/organization/cancel-invitation") return { action: "organization.cancel_invitation", targetType: "invitation", targetId: readString(body, "invitationId") ?? "unknown", before: { invitationId: readString(body, "invitationId") }, metadata: { path } };
  if (path === "/organization/create-team") return { action: "team.create", targetType: "team", targetId: teamTargetId(ctx) ?? stringFromReturned(ctx, "id") ?? "unknown", after: returnedRecord(ctx), metadata: { path } };
  if (path === "/organization/update-team") return { action: "team.update", targetType: "team", targetId: teamTargetId(ctx) ?? "unknown", after: body.data ?? returnedRecord(ctx), metadata: { path } };
  if (path === "/organization/remove-team") return { action: "team.delete", targetType: "team", targetId: teamTargetId(ctx) ?? "unknown", before: { teamId: teamTargetId(ctx) }, metadata: { path } };
  if (path === "/organization/add-team-member") return { action: "team.add_member", targetType: "team", targetId: teamTargetId(ctx) ?? "unknown", after: { userId: readString(body, "userId") }, metadata: { path, organizationId: organizationTargetId(ctx) } };
  if (path === "/organization/remove-team-member") return { action: "team.remove_member", targetType: "team", targetId: teamTargetId(ctx) ?? "unknown", before: { userId: readString(body, "userId") }, metadata: { path, organizationId: organizationTargetId(ctx) } };

  return null;
}

const loggedMutationPaths = new Set([
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/delete-client",
  "/admin/resource-servers",
  "/admin/resource-servers/:id",
  "/admin/resource-servers/:id/disable",
  "/admin/resource-servers/:id/enable",
  "/admin/oauth-scopes",
  "/admin/oauth-scopes/:id",
  "/admin/oauth-client-resource-scopes",
  "/admin/oauth-client-resource-scopes/:id",
  "/admin/revoke-consent",
  "/admin/jwks/rotate",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/invite-member",
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/cancel-invitation",
  "/organization/create-team",
  "/organization/update-team",
  "/organization/remove-team",
  "/organization/add-team-member",
  "/organization/remove-team-member",
]);

function isLoggedMutation(ctx: { readonly path?: string; readonly method?: string }): boolean {
  const method = ctx.method ?? "";
  return method !== "GET" && loggedMutationPaths.has(ctx.path ?? "");
}

/** Better Auth plugin that owns the append-only admin activity log table and read endpoint. */
export const idAdminActivityLog = (options: AdminActivityLogPluginOptions = {}): BetterAuthPlugin => ({
  id: "id-admin-activity-log",
  schema: {
    adminActivityLog: {
      fields: adminActivityLogBetterAuthFields,
    },
  },
  hooks: {
    after: [
      {
        matcher: isLoggedMutation,
        handler: createAuthMiddleware(async (ctx) => {
          const hookCtx = ctx as HookContext;
          const user = sessionUser(hookCtx);
          if (!user) return;
          const activity = activityFromHook(hookCtx);
          if (!activity) return;
          await appendActivityLog(activityAdapter(hookCtx), {
            ...activity,
            actorId: user.id,
            actorType: "user",
          });
        }),
      },
    ],
  },
  endpoints: {
    listAdminActivityLog: createAuthEndpoint(
      "/admin/activity-log",
      { method: "GET", use: [sessionMiddleware], metadata: listActivityLogMeta },
      async (ctx) => {
        requireAdmin(options.authorize, ctx.context.session);
        const adapter = activityAdapter(ctx);
        const { limit, offset } = parseActivityPageParams(ctx.query);
        const where = activityFilters(ctx.query as Record<string, unknown> | undefined);

        const total = Number(await adapter.count({ model: ADMIN_ACTIVITY_LOG_MODEL, where }));
        const rows = await adapter.findMany<AdminActivityLogRow>({
          model: ADMIN_ACTIVITY_LOG_MODEL,
          where,
          limit,
          offset,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const emails = await actorEmailMap(adapter, uniqueActorIds(rows));
        return ctx.json({ entries: rows.map((row) => presentActivity(row, emails)), total, limit, offset });
      },
    ),
  },
});
