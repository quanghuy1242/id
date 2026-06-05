import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  ADMIN_ACTIVITY_LOG_MODEL,
  MEMBER_MODEL,
  USER_MODEL,
} from "../../../shared/constants";
import {
  isActionStepUpFresh,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
} from "../../config";
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
import type {
  ActivityAdapter,
  ActivityRecordDraft,
  AdminActivityLogPluginOptions,
} from "./types";

export type { AdminActivityLogPluginOptions } from "./types";

type UserRow = { id: string; email?: string | null };
type MemberRow = {
  userId: string;
  organizationId: string;
  role?: string | null;
};
type SessionUser = {
  id: string;
  role?: string | null;
  platformStepUpAt?: number | null;
};

function activityAdapter(ctx: {
  context: Record<string, unknown>;
}): ActivityAdapter {
  return ctx.context.adapter as ActivityAdapter;
}

async function actorEmailMap(
  adapter: ActivityAdapter,
  actorIds: string[],
): Promise<Map<string, string>> {
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
  description:
    "List append-only admin activity entries, scoped to platform or one organization",
  responseSchema: listActivityLogOpenApiSchema,
  responseDescription:
    "Paginated activity-log entries with actor-email enrichment",
});

type HookContext = {
  readonly path?: string;
  readonly method?: string;
  readonly body?: unknown;
  readonly params?: { readonly id?: unknown };
  readonly query?: Record<string, unknown>;
  readonly context: Record<string, unknown> & {
    readonly adapter?: unknown;
    readonly session?: {
      readonly user?: unknown;
      readonly session?: { readonly platformStepUpAt?: unknown } | null;
    } | null;
    readonly returned?: unknown;
  };
};

function userFromSession(
  session: { readonly user?: unknown } | null | undefined,
): SessionUser | null {
  const user = session?.user as
    | { id?: unknown; role?: string | null }
    | undefined;
  const sessionRecord = (
    session as
      | { readonly session?: { readonly platformStepUpAt?: unknown } | null }
      | null
      | undefined
  )?.session;
  const platformStepUpAt = sessionRecord?.platformStepUpAt;
  return typeof user?.id === "string"
    ? {
        id: user.id,
        role: user.role,
        platformStepUpAt:
          typeof platformStepUpAt === "number" ? platformStepUpAt : null,
      }
    : null;
}

async function actorUser(ctx: HookContext): Promise<SessionUser | null> {
  const existing = userFromSession(ctx.context.session);
  if (existing) return existing;
  const session = await getSessionFromCtx(
    ctx as Parameters<typeof getSessionFromCtx>[0],
    { disableRefresh: true },
  ).catch(() => null);
  return userFromSession(session);
}

function returnedRecord(ctx: HookContext): Record<string, unknown> | null {
  const returned = ctx.context.returned;
  return returned && typeof returned === "object" && !Array.isArray(returned)
    ? (returned as Record<string, unknown>)
    : null;
}

function pathId(ctx: HookContext): string | undefined {
  const id = ctx.params?.id;
  return typeof id === "string" ? id : undefined;
}

function readQueryString(
  query: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return typeof query?.[key] === "string" ? (query[key] as string) : undefined;
}

function stringFromRecord(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function stringFromReturned(
  ctx: HookContext,
  ...keys: string[]
): string | undefined {
  return stringFromRecord(returnedRecord(ctx), ...keys);
}

function userTargetId(ctx: HookContext): string | undefined {
  const body = readBody(ctx);
  return readString(body, "userId") ?? stringFromReturned(ctx, "id");
}

function organizationTargetId(ctx: HookContext): string | undefined {
  const body = readBody(ctx);
  return (
    readString(body, "organizationId") ??
    readQueryString(ctx.query, "organizationId") ??
    stringFromReturned(ctx, "id")
  );
}

function teamTargetId(ctx: HookContext): string | undefined {
  const body = readBody(ctx);
  return readString(body, "teamId") ?? stringFromReturned(ctx, "id");
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function idLabel(value: string | undefined): string {
  return value && value.length > 0 ? value : "unknown";
}

function compactDetails(
  entries: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    details[key] = value;
  }
  return details;
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function changedFields(value: unknown): string[] {
  const record = recordFrom(value);
  return record ? Object.keys(record).sort() : [];
}

function changedFieldsText(value: unknown): string {
  const fields = changedFields(value);
  return fields.length > 0 ? fields.join(", ") : "fields";
}

function nestedUserFromReturned(
  ctx: HookContext,
): Record<string, unknown> | null {
  const returned = returnedRecord(ctx);
  return recordFrom(returned?.user) ?? returned;
}

function returnedUserEmail(ctx: HookContext): string | undefined {
  return stringFromRecord(nestedUserFromReturned(ctx), "email");
}

function returnedUserBanExpires(ctx: HookContext): string | undefined {
  return stringFromRecord(nestedUserFromReturned(ctx), "banExpires");
}

function durationText(seconds: number | undefined): string {
  if (!seconds) return "permanently";
  if (seconds % SECONDS_PER_DAY === 0) {
    const days = seconds / SECONDS_PER_DAY;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (seconds % SECONDS_PER_HOUR === 0) {
    const hours = seconds / SECONDS_PER_HOUR;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${seconds} seconds`;
}

function banSummary(
  userId: string | undefined,
  seconds: number | undefined,
  reason: string | undefined,
): string {
  const base = `Banned user ${idLabel(userId)} ${durationText(seconds)}`;
  return reason ? `${base}: ${reason}` : base;
}

function activityFromHook(ctx: HookContext): ActivityRecordDraft | null {
  const body = readBody(ctx);
  const path = ctx.path ?? "";
  const method = ctx.method ?? "";
  const id = pathId(ctx);

  if (path === "/oauth2/create-client")
    return {
      action: "oauth_client.create",
      targetType: "oauth_client",
      targetId: stringFromReturned(ctx, "client_id", "clientId") ?? "unknown",
      summary: `Created OAuth client ${idLabel(stringFromReturned(ctx, "client_id", "clientId"))}`,
      details: compactDetails([
        ["path", path],
        ["clientId", stringFromReturned(ctx, "client_id", "clientId")],
        ["clientName", readString(body, "client_name")],
        ["grantTypes", body.grant_types],
        ["redirectUris", body.redirect_uris],
        ["scope", readString(body, "scope")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/oauth2/update-client")
    return {
      action: "oauth_client.update",
      targetType: "oauth_client",
      targetId: readString(body, "client_id") ?? "unknown",
      summary: `Updated OAuth client ${idLabel(readString(body, "client_id"))}: ${changedFieldsText(body.update)}`,
      details: compactDetails([
        ["path", path],
        ["clientId", readString(body, "client_id")],
        ["changedFields", changedFields(body.update)],
      ]),
      after: body.update ?? returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/oauth2/client/rotate-secret")
    return {
      action: "oauth_client.rotate_secret",
      targetType: "oauth_client",
      targetId: readString(body, "client_id") ?? "unknown",
      summary: `Rotated secret for OAuth client ${idLabel(readString(body, "client_id"))}`,
      details: compactDetails([
        ["path", path],
        ["clientId", readString(body, "client_id")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/oauth2/delete-client")
    return {
      action: "oauth_client.delete",
      targetType: "oauth_client",
      targetId: readString(body, "client_id") ?? "unknown",
      summary: `Deleted OAuth client ${idLabel(readString(body, "client_id"))}`,
      details: compactDetails([
        ["path", path],
        ["clientId", readString(body, "client_id")],
      ]),
      before: { clientId: readString(body, "client_id") },
      metadata: { path },
    };

  if (path === "/admin/resource-servers" && method === "POST")
    return {
      action: "resource_server.create",
      targetType: "resource_server",
      targetId: stringFromReturned(ctx, "id") ?? "unknown",
      summary: `Created resource server ${idLabel(stringFromReturned(ctx, "id"))}`,
      details: compactDetails([
        ["path", path],
        ["resourceServerId", stringFromReturned(ctx, "id")],
        ["audience", readString(body, "audience")],
        ["name", readString(body, "name")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/resource-servers/:id" && method === "PATCH")
    return {
      action: "resource_server.update",
      targetType: "resource_server",
      targetId: id ?? "unknown",
      summary: `Updated resource server ${idLabel(id)}: ${changedFieldsText(body)}`,
      details: compactDetails([
        ["path", path],
        ["resourceServerId", id],
        ["changedFields", changedFields(body)],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/resource-servers/:id" && method === "DELETE")
    return {
      action: "resource_server.delete",
      targetType: "resource_server",
      targetId: id ?? "unknown",
      summary: `Deleted resource server ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["resourceServerId", id],
      ]),
      before: { id },
      metadata: { path },
    };
  if (path === "/admin/resource-servers/:id/disable")
    return {
      action: "resource_server.disable",
      targetType: "resource_server",
      targetId: id ?? "unknown",
      summary: `Disabled resource server ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["resourceServerId", id],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/resource-servers/:id/enable")
    return {
      action: "resource_server.enable",
      targetType: "resource_server",
      targetId: id ?? "unknown",
      summary: `Enabled resource server ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["resourceServerId", id],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };

  if (path === "/admin/oauth-scopes" && method === "POST")
    return {
      action: "oauth_scope.create",
      targetType: "oauth_scope",
      targetId: stringFromReturned(ctx, "id") ?? "unknown",
      summary: `Created OAuth scope ${idLabel(stringFromReturned(ctx, "id"))}`,
      details: compactDetails([
        ["path", path],
        ["scopeId", stringFromReturned(ctx, "id")],
        ["resourceServerId", readString(body, "resourceServerId")],
        ["name", readString(body, "name")],
        ["scope", readString(body, "scope")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/oauth-scopes/:id")
    return {
      action: "oauth_scope.update",
      targetType: "oauth_scope",
      targetId: id ?? "unknown",
      summary: `Updated OAuth scope ${idLabel(id)}: ${changedFieldsText(body)}`,
      details: compactDetails([
        ["path", path],
        ["scopeId", id],
        ["changedFields", changedFields(body)],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/oauth-client-resource-scopes" && method === "POST")
    return {
      action: "client_resource_scope.create",
      targetType: "client_resource_scope",
      targetId: stringFromReturned(ctx, "id") ?? "unknown",
      summary: `Bound OAuth client scope ${idLabel(stringFromReturned(ctx, "id"))}`,
      details: compactDetails([
        ["path", path],
        ["bindingId", stringFromReturned(ctx, "id")],
        ["clientId", readString(body, "clientId")],
        ["resourceServerId", readString(body, "resourceServerId")],
        ["scopeId", readString(body, "scopeId")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/oauth-client-resource-scopes/:id" && method === "PATCH")
    return {
      action: "client_resource_scope.update",
      targetType: "client_resource_scope",
      targetId: id ?? "unknown",
      summary: `Updated OAuth client scope binding ${idLabel(id)}: ${changedFieldsText(body)}`,
      details: compactDetails([
        ["path", path],
        ["bindingId", id],
        ["changedFields", changedFields(body)],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/oauth-client-resource-scopes/:id" && method === "DELETE")
    return {
      action: "client_resource_scope.delete",
      targetType: "client_resource_scope",
      targetId: id ?? "unknown",
      summary: `Removed OAuth client scope binding ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["bindingId", id],
      ]),
      before: { id },
      metadata: { path },
    };
  if (path === "/admin/registration-policies" && method === "POST")
    return {
      action: "registration_policy.create",
      targetType: "registration_policy",
      targetId: stringFromReturned(ctx, "id") ?? "unknown",
      summary: `Created registration policy ${idLabel(stringFromReturned(ctx, "id"))}`,
      details: compactDetails([
        ["path", path],
        ["policyId", stringFromReturned(ctx, "id")],
        ["organizationId", readString(body, "organizationId")],
        ["clientId", readString(body, "clientId")],
        ["mode", readString(body, "mode")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/registration-policies/:id" && method === "PATCH")
    return {
      action: "registration_policy.update",
      targetType: "registration_policy",
      targetId: id ?? "unknown",
      summary: `Updated registration policy ${idLabel(id)}: ${changedFieldsText(body)}`,
      details: compactDetails([
        ["path", path],
        ["policyId", id],
        ["changedFields", changedFields(body)],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/registration-policies/:id/enable")
    return {
      action: "registration_policy.enable",
      targetType: "registration_policy",
      targetId: id ?? "unknown",
      summary: `Enabled registration policy ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["policyId", id],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/registration-policies/:id/pause")
    return {
      action: "registration_policy.pause",
      targetType: "registration_policy",
      targetId: id ?? "unknown",
      summary: `Paused registration policy ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["policyId", id],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/registration-policies/:id/archive")
    return {
      action: "registration_policy.archive",
      targetType: "registration_policy",
      targetId: id ?? "unknown",
      summary: `Archived registration policy ${idLabel(id)}`,
      details: compactDetails([
        ["path", path],
        ["policyId", id],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };

  if (path === "/admin/revoke-consent")
    return {
      action: "consent.revoke",
      targetType: "oauth_consent",
      targetId: `${readString(body, "clientId") ?? "unknown"}:${readString(body, "userId") ?? "unknown"}`,
      summary: `Revoked OAuth consent for user ${idLabel(readString(body, "userId"))} and client ${idLabel(readString(body, "clientId"))}`,
      details: compactDetails([
        ["path", path],
        ["clientId", readString(body, "clientId")],
        ["userId", readString(body, "userId")],
        ["organizationId", readString(body, "organizationId")],
      ]),
      before: body,
      metadata: { path },
    };
  if (path === "/admin/jwks/rotate")
    return {
      action: "jwks.rotate",
      targetType: "jwks",
      targetId: stringFromReturned(ctx, "id") ?? "unknown",
      summary: `Rotated signing key ${idLabel(stringFromReturned(ctx, "id"))}`,
      details: compactDetails([
        ["path", path],
        ["keyId", stringFromReturned(ctx, "id")],
        ["reason", readString(body, "reason")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path, reason: readString(body, "reason") },
    };
  if (path === "/admin/create-user")
    return {
      action: "user.create",
      targetType: "user",
      targetId:
        stringFromReturned(ctx, "id") ??
        (returnedRecord(ctx)?.user as { id?: string } | undefined)?.id ??
        "unknown",
      summary: `Created user ${idLabel(stringFromRecord(nestedUserFromReturned(ctx), "id"))}`,
      details: compactDetails([
        ["path", path],
        ["userId", stringFromRecord(nestedUserFromReturned(ctx), "id")],
        ["email", returnedUserEmail(ctx) ?? readString(body, "email")],
        ["name", readString(body, "name")],
        ["role", readString(body, "role")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/update-user")
    return {
      action: "user.update",
      targetType: "user",
      targetId: userTargetId(ctx) ?? "unknown",
      summary: `Updated user ${idLabel(userTargetId(ctx))}: ${changedFieldsText(body.data)}`,
      details: compactDetails([
        ["path", path],
        ["userId", userTargetId(ctx)],
        ["changedFields", changedFields(body.data)],
      ]),
      after: body.data ?? returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/set-role")
    return {
      action: "user.set_role",
      targetType: "user",
      targetId: userTargetId(ctx) ?? "unknown",
      summary: `Set role for user ${idLabel(userTargetId(ctx))} to ${idLabel(readString(body, "role"))}`,
      details: compactDetails([
        ["path", path],
        ["userId", userTargetId(ctx)],
        ["role", readString(body, "role")],
      ]),
      after: { role: readString(body, "role") },
      metadata: { path },
    };
  if (path === "/admin/set-user-password")
    return {
      action: "user.set_password",
      targetType: "user",
      targetId: userTargetId(ctx) ?? "unknown",
      summary: `Changed password for user ${idLabel(userTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["userId", userTargetId(ctx)],
      ]),
      metadata: { path },
    };
  if (path === "/admin/ban-user")
    return {
      action: "user.ban",
      targetType: "user",
      targetId: userTargetId(ctx) ?? "unknown",
      summary: banSummary(
        userTargetId(ctx),
        readNumber(body, "banExpiresIn"),
        readString(body, "banReason"),
      ),
      details: compactDetails([
        ["path", path],
        ["userId", userTargetId(ctx)],
        ["reason", readString(body, "banReason")],
        ["banExpiresIn", readNumber(body, "banExpiresIn")],
        ["banExpires", returnedUserBanExpires(ctx)],
      ]),
      after: returnedRecord(ctx),
      metadata: { path, reason: readString(body, "banReason") },
    };
  if (path === "/admin/unban-user")
    return {
      action: "user.unban",
      targetType: "user",
      targetId: userTargetId(ctx) ?? "unknown",
      summary: `Unbanned user ${idLabel(userTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["userId", userTargetId(ctx)],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/admin/remove-user")
    return {
      action: "user.delete",
      targetType: "user",
      targetId: userTargetId(ctx) ?? "unknown",
      summary: `Deleted user ${idLabel(userTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["userId", userTargetId(ctx)],
      ]),
      before: { userId: userTargetId(ctx) },
      metadata: { path },
    };

  if (path === "/organization/create")
    return {
      action: "organization.create",
      targetType: "organization",
      targetId: organizationTargetId(ctx) ?? "unknown",
      summary: `Created organization ${idLabel(organizationTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["organizationId", organizationTargetId(ctx)],
        ["name", readString(body, "name")],
        ["slug", readString(body, "slug")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/organization/update")
    return {
      action: "organization.update",
      targetType: "organization",
      targetId: organizationTargetId(ctx) ?? "unknown",
      summary: `Updated organization ${idLabel(organizationTargetId(ctx))}: ${changedFieldsText(body.data)}`,
      details: compactDetails([
        ["path", path],
        ["organizationId", organizationTargetId(ctx)],
        ["changedFields", changedFields(body.data)],
      ]),
      after: body.data ?? returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/organization/delete")
    return {
      action: "organization.delete",
      targetType: "organization",
      targetId: organizationTargetId(ctx) ?? "unknown",
      summary: `Deleted organization ${idLabel(organizationTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["organizationId", organizationTargetId(ctx)],
      ]),
      before: { organizationId: organizationTargetId(ctx) },
      metadata: { path },
    };
  if (path === "/organization/invite-member")
    return {
      action: "organization.invite_member",
      targetType: "organization",
      targetId: organizationTargetId(ctx) ?? "unknown",
      summary: `Invited ${idLabel(readString(body, "email"))} to organization ${idLabel(organizationTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["organizationId", organizationTargetId(ctx)],
        ["email", readString(body, "email")],
        ["role", readString(body, "role")],
        ["teamId", readString(body, "teamId")],
        ["resend", body.resend],
      ]),
      after: body,
      metadata: { path },
    };
  if (path === "/organization/update-member-role")
    return {
      action: "organization.update_member_role",
      targetType: "organization_member",
      targetId: readString(body, "memberId") ?? "unknown",
      summary: `Set organization member ${idLabel(readString(body, "memberId"))} role to ${idLabel(readString(body, "role"))}`,
      details: compactDetails([
        ["path", path],
        ["memberId", readString(body, "memberId")],
        ["role", readString(body, "role")],
      ]),
      after: { role: readString(body, "role") },
      metadata: { path },
    };
  if (path === "/organization/remove-member")
    return {
      action: "organization.remove_member",
      targetType: "organization",
      targetId: organizationTargetId(ctx) ?? "unknown",
      summary: `Removed member ${idLabel(readString(body, "memberIdOrEmail"))} from organization ${idLabel(organizationTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["organizationId", organizationTargetId(ctx)],
        ["memberIdOrEmail", readString(body, "memberIdOrEmail")],
      ]),
      before: { memberIdOrEmail: readString(body, "memberIdOrEmail") },
      metadata: { path },
    };
  if (path === "/organization/cancel-invitation")
    return {
      action: "organization.cancel_invitation",
      targetType: "invitation",
      targetId: readString(body, "invitationId") ?? "unknown",
      summary: `Canceled invitation ${idLabel(readString(body, "invitationId"))}`,
      details: compactDetails([
        ["path", path],
        ["invitationId", readString(body, "invitationId")],
      ]),
      before: { invitationId: readString(body, "invitationId") },
      metadata: { path },
    };
  if (path === "/organization/create-team")
    return {
      action: "team.create",
      targetType: "team",
      targetId: teamTargetId(ctx) ?? stringFromReturned(ctx, "id") ?? "unknown",
      summary: `Created team ${idLabel(teamTargetId(ctx) ?? stringFromReturned(ctx, "id"))}`,
      details: compactDetails([
        ["path", path],
        ["teamId", teamTargetId(ctx) ?? stringFromReturned(ctx, "id")],
        ["organizationId", organizationTargetId(ctx)],
        ["name", readString(body, "name")],
      ]),
      after: returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/organization/update-team")
    return {
      action: "team.update",
      targetType: "team",
      targetId: teamTargetId(ctx) ?? "unknown",
      summary: `Updated team ${idLabel(teamTargetId(ctx))}: ${changedFieldsText(body.data)}`,
      details: compactDetails([
        ["path", path],
        ["teamId", teamTargetId(ctx)],
        ["organizationId", organizationTargetId(ctx)],
        ["changedFields", changedFields(body.data)],
      ]),
      after: body.data ?? returnedRecord(ctx),
      metadata: { path },
    };
  if (path === "/organization/remove-team")
    return {
      action: "team.delete",
      targetType: "team",
      targetId: teamTargetId(ctx) ?? "unknown",
      summary: `Deleted team ${idLabel(teamTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["teamId", teamTargetId(ctx)],
        ["organizationId", organizationTargetId(ctx)],
      ]),
      before: { teamId: teamTargetId(ctx) },
      metadata: { path },
    };
  if (path === "/organization/add-team-member")
    return {
      action: "team.add_member",
      targetType: "team",
      targetId: teamTargetId(ctx) ?? "unknown",
      summary: `Added user ${idLabel(readString(body, "userId"))} to team ${idLabel(teamTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["teamId", teamTargetId(ctx)],
        ["userId", readString(body, "userId")],
        ["organizationId", organizationTargetId(ctx)],
      ]),
      after: { userId: readString(body, "userId") },
      metadata: { path, organizationId: organizationTargetId(ctx) },
    };
  if (path === "/organization/remove-team-member")
    return {
      action: "team.remove_member",
      targetType: "team",
      targetId: teamTargetId(ctx) ?? "unknown",
      summary: `Removed user ${idLabel(readString(body, "userId"))} from team ${idLabel(teamTargetId(ctx))}`,
      details: compactDetails([
        ["path", path],
        ["teamId", teamTargetId(ctx)],
        ["userId", readString(body, "userId")],
        ["organizationId", organizationTargetId(ctx)],
      ]),
      before: { userId: readString(body, "userId") },
      metadata: { path, organizationId: organizationTargetId(ctx) },
    };

  return null;
}

function organizationIdFromActivity(
  ctx: HookContext,
  activity: ActivityRecordDraft,
): string | undefined {
  const body = readBody(ctx);
  const bodyUpdate =
    body.update &&
    typeof body.update === "object" &&
    !Array.isArray(body.update)
      ? (body.update as Record<string, unknown>)
      : null;
  const direct =
    readString(body, "organizationId") ??
    readQueryString(ctx.query, "organizationId") ??
    stringFromReturned(ctx, "organizationId", "referenceId", "reference_id") ??
    stringFromRecord(
      bodyUpdate,
      "organizationId",
      "referenceId",
      "reference_id",
    );
  if (direct) return direct;

  const metadataOrg = activity.metadata?.organizationId;
  if (typeof metadataOrg === "string" && metadataOrg.length > 0)
    return metadataOrg;

  if (activity.targetType === "organization" && activity.targetId !== "unknown")
    return activity.targetId;
  return undefined;
}

async function actorOrganizationRole(
  adapter: ActivityAdapter,
  userId: string,
  organizationId: string,
): Promise<"owner" | "admin" | null> {
  const rows = await adapter.findMany<MemberRow>({
    model: MEMBER_MODEL,
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });
  const role = rows.find(
    (row) =>
      row.userId === userId &&
      row.organizationId === organizationId &&
      (row.role === "owner" || row.role === "admin"),
  )?.role;
  return role === "owner" || role === "admin" ? role : null;
}

async function activityContext(
  adapter: ActivityAdapter,
  ctx: HookContext,
  user: SessionUser,
  activity: ActivityRecordDraft,
): Promise<
  Pick<
    ActivityRecordDraft,
    | "scope"
    | "organizationId"
    | "actorPlatformRole"
    | "actorOrganizationRole"
    | "steppedUp"
  >
> {
  const organizationId = organizationIdFromActivity(ctx, activity) ?? null;
  return {
    scope: organizationId ? "organization" : "platform",
    organizationId,
    actorPlatformRole: user.role === "admin" ? "admin" : null,
    actorOrganizationRole: organizationId
      ? await actorOrganizationRole(adapter, user.id, organizationId)
      : null,
    steppedUp: isActionStepUpFresh(user.platformStepUpAt ?? null),
  };
}

async function requireActivityReadAccess(
  authorize: AdminActivityLogPluginOptions["authorize"],
  session: { readonly user?: unknown } | null,
  adapter: ActivityAdapter,
  organizationId: string | null,
): Promise<void> {
  const user = userFromSession(session);
  if (!user) throw new APIError("UNAUTHORIZED");
  if (
    !authorize ||
    !(await authorize(organizationId, user.id, user.role, adapter))
  ) {
    throw new APIError("FORBIDDEN");
  }
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
  "/admin/registration-policies",
  "/admin/registration-policies/:id",
  "/admin/registration-policies/:id/enable",
  "/admin/registration-policies/:id/pause",
  "/admin/registration-policies/:id/archive",
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

function isLoggedMutation(ctx: {
  readonly path?: string;
  readonly method?: string;
}): boolean {
  const method = ctx.method ?? "";
  return method !== "GET" && loggedMutationPaths.has(ctx.path ?? "");
}

/** Better Auth plugin that owns the append-only admin activity log table and read endpoint. */
export const idAdminActivityLog = (
  options: AdminActivityLogPluginOptions = {},
): BetterAuthPlugin => ({
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
          const user = await actorUser(hookCtx);
          if (!user) return;
          const activity = activityFromHook(hookCtx);
          if (!activity) return;
          const adapter = activityAdapter(hookCtx);
          await appendActivityLog(adapter, {
            ...activity,
            ...(await activityContext(adapter, hookCtx, user, activity)),
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
      {
        method: "GET",
        use: [sessionMiddleware],
        metadata: listActivityLogMeta,
      },
      async (ctx) => {
        const adapter = activityAdapter(ctx);
        const organizationId =
          readQueryString(ctx.query, "organizationId") ?? null;
        await requireActivityReadAccess(
          options.authorize,
          ctx.context.session,
          adapter,
          organizationId,
        );
        const { limit, offset } = parseActivityPageParams(ctx.query);
        const where =
          activityFilters(ctx.query as Record<string, unknown> | undefined) ??
          [];
        if (organizationId)
          where.push({ field: "organizationId", value: organizationId });
        const filters = where.length > 0 ? where : undefined;

        const total = Number(
          await adapter.count({
            model: ADMIN_ACTIVITY_LOG_MODEL,
            where: filters,
          }),
        );
        const rows = await adapter.findMany<AdminActivityLogRow>({
          model: ADMIN_ACTIVITY_LOG_MODEL,
          where: filters,
          limit,
          offset,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const emails = await actorEmailMap(adapter, uniqueActorIds(rows));
        return ctx.json({
          entries: rows.map((row) => presentActivity(row, emails)),
          total,
          limit,
          offset,
        });
      },
    ),
  },
});
