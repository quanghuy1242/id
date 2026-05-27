import { APIError, createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { authPluginConfig } from "../../config";
import { verifyScopedBearerToken } from "../../verify-scoped-bearer";
import {
  SCIM_HTTP_BAD_REQUEST,
  SCIM_HTTP_METHOD_NOT_ALLOWED,
  SCIM_HTTP_NOT_FOUND,
  SCIM_ORG_ADMINS_GROUP_ID,
} from "../../../shared/constants";
import {
  findOrgAdmins,
  findOrgUser,
  findTeam,
  findUser,
  isOrgAdmin,
} from "./operations";
import { parseScimFilter } from "./filters";
import {
  scimError,
  scimJsonResponse,
  toScimListResponse,
  toScimOrgAdminsGroup,
  toScimOrgUser,
  toScimTeamGroup,
  toScimUser,
} from "./resources";
import {
  buildResourceTypes,
  buildSchemas,
  buildServiceProviderConfig,
  scimEndpointMeta,
  scimErrorOpenApiSchema,
  scimGroupOpenApiSchema,
  scimListResponseOpenApiSchema,
  scimOrgUserOpenApiSchema,
  scimUserOpenApiSchema,
} from "./schema";
import type { ScimAdapter, ScimDirectoryPluginOptions } from "./types";

export type { ScimDirectoryPluginOptions } from "./types";

function requireHeaders(ctx: { readonly request?: { readonly headers: Headers } | undefined }): Headers {
  if (!ctx.request?.headers) throw new APIError("UNAUTHORIZED");
  return ctx.request.headers;
}

function scimAdapter(adapter: unknown): ScimAdapter {
  return adapter as ScimAdapter;
}

async function assertScimCaller(
  ctx: {
    readonly context: { readonly adapter: unknown; readonly baseURL: string };
    readonly request?: { readonly headers: Headers } | undefined;
  },
  options: ScimDirectoryPluginOptions,
): Promise<ScimAdapter> {
  const adapter = scimAdapter(ctx.context.adapter);
  await verifyScopedBearerToken({
    adapter,
    headers: requireHeaders(ctx),
    issuer: options.issuer ?? ctx.context.baseURL,
    audience: options.audience,
    scope: options.scope ?? authPluginConfig.scimDirectoryScope,
  });
  return adapter;
}

/** Response for unsupported SCIM mutation methods (POST/PUT/PATCH/DELETE). */
function scimMethodNotAllowed(): Response {
  return new Response(
    JSON.stringify(scimError(SCIM_HTTP_METHOD_NOT_ALLOWED, "This SCIM server is read-only. Provisioning operations are not supported.")),
    { status: SCIM_HTTP_METHOD_NOT_ALLOWED, headers: { "Content-Type": "application/scim+json", Allow: "GET" } },
  );
}

// ── Precomputed endpoint metadata ─────────────────────────────────────────────

const scimServiceProviderConfigMetadata = scimEndpointMeta({
  description: "SCIM ServiceProviderConfig (RFC 7643 §5). Advertises read-only support and filter capabilities.",
  responseSchema: { type: "object" },
  responseDescription: "ServiceProviderConfig document",
});

const scimSchemasMetadata = scimEndpointMeta({
  description: "SCIM Schemas list (RFC 7643 §7). Describes User, Group, and TenantMembership schemas.",
  responseSchema: { type: "array", items: { type: "object" } },
  responseDescription: "SCIM schema definitions",
});

const scimResourceTypesMetadata = scimEndpointMeta({
  description: "SCIM ResourceTypes list (RFC 7644 §6). Describes available resource type endpoints.",
  responseSchema: { type: "array", items: { type: "object" } },
  responseDescription: "SCIM resource type definitions",
});

const scimGetUserMetadata = scimEndpointMeta({
  description: "Retrieve a global SCIM User by ID. Returns active:false for banned users per RFC 7644.",
  pathParams: [{ name: "userId", description: "User ID" }],
  responseSchema: scimUserOpenApiSchema,
  responseDescription: "SCIM User resource",
});

const scimListUsersMetadata = scimEndpointMeta({
  description: "Query global SCIM Users. Supported filters: id eq and userName eq.",
  responseSchema: scimListResponseOpenApiSchema,
  responseDescription: "SCIM ListResponse of User resources",
});

const scimGetOrgUserMetadata = scimEndpointMeta({
  description: "Retrieve an org-scoped SCIM User. Returns 404 when the user is not a member of the org.",
  pathParams: [
    { name: "orgId", description: "Organization ID" },
    { name: "userId", description: "User ID" },
  ],
  responseSchema: scimOrgUserOpenApiSchema,
  responseDescription: "Org-scoped SCIM User with tenant-membership extension",
});

const scimGetOrgGroupMetadata = scimEndpointMeta({
  description: "Retrieve a tenant SCIM Group by ID. Use groupId=org-admins for the virtual administrators group.",
  pathParams: [
    { name: "orgId", description: "Organization ID" },
    { name: "groupId", description: "Team ID or the sentinel 'org-admins'" },
  ],
  responseSchema: scimGroupOpenApiSchema,
  responseDescription: "SCIM Group resource",
});

const scimListOrgGroupsMetadata = scimEndpointMeta({
  description: "Query tenant SCIM Groups. Supported filters: id eq and compound id+members.value eq for membership checks.",
  pathParams: [{ name: "orgId", description: "Organization ID" }],
  responseSchema: scimListResponseOpenApiSchema,
  responseDescription: "SCIM ListResponse of Group resources",
});

const scimErrorMetadata = scimEndpointMeta({
  description: "Not supported — this SCIM server is read-only.",
  responseSchema: scimErrorOpenApiSchema,
  responseDescription: "405 Method Not Allowed",
});

/**
 * Read-only SCIM v2 directory plugin.
 *
 * Exposes user, org-scoped user, tenant team, and virtual org-admin Group resources
 * as defined by doc 017 §4.2 and §7.1. Full SCIM provisioning is not supported;
 * mutation methods return 405.
 *
 * Authentication: M2M bearer token with
 * `aud = systemResourceServerAudience(baseUrl)` (i.e. `{idBaseUrl}/system`) and
 * `scope = identity:directory:read` (authPluginConfig.scimDirectoryScope).
 *
 * The audience is deliberately `/system`, shared with the OAuth client picker plugin,
 * so a single M2M token serves both SCIM reads and OAuth client lookups
 * (see doc 020 §2). The original per-doc-017 `/scim` audience is no longer used.
 */
export const idScimDirectory = (options: ScimDirectoryPluginOptions): BetterAuthPlugin => ({
  id: "id-scim-directory",
  endpoints: {
    // ── Discovery endpoints (no auth required) ───────────────────────────────

    scimServiceProviderConfig: createAuthEndpoint(
      "/scim/v2/ServiceProviderConfig",
      { method: "GET", metadata: scimServiceProviderConfigMetadata },
      async (ctx) => scimJsonResponse(buildServiceProviderConfig(ctx.context.baseURL)),
    ),

    scimSchemas: createAuthEndpoint(
      "/scim/v2/Schemas",
      { method: "GET", metadata: scimSchemasMetadata },
      async (ctx) => scimJsonResponse(buildSchemas(ctx.context.baseURL)),
    ),

    scimResourceTypes: createAuthEndpoint(
      "/scim/v2/ResourceTypes",
      { method: "GET", metadata: scimResourceTypesMetadata },
      async (ctx) => scimJsonResponse(buildResourceTypes(ctx.context.baseURL)),
    ),

    // ── Global user endpoints ─────────────────────────────────────────────────

    /** GET /api/auth/scim/v2/Users/:userId — returns SCIM User or 404. */
    scimGetUser: createAuthEndpoint(
      "/scim/v2/Users/:userId",
      { method: "GET", metadata: scimGetUserMetadata },
      async (ctx) => {
        const adapter = await assertScimCaller(ctx, options);
        const userId = ctx.params?.userId as string | undefined;
        if (!userId) return scimJsonResponse(scimError(SCIM_HTTP_BAD_REQUEST, "Missing userId"), SCIM_HTTP_BAD_REQUEST);

        const user = await findUser(adapter, userId);
        if (!user) return scimJsonResponse(scimError(SCIM_HTTP_NOT_FOUND, "User not found"), SCIM_HTTP_NOT_FOUND);

        return scimJsonResponse(toScimUser(user, ctx.context.baseURL));
      },
    ),

    /**
     * GET /api/auth/scim/v2/Users?filter=... — filtered user query.
     * Supports: `id eq "value"` and `userName eq "value"`.
     *
     * TODO(scim-compliance): SCIM_MAX_FILTER_RESULTS is advertised in
     * ServiceProviderConfig but not enforced here. Approved filters (id eq,
     * userName eq) return at most 1 result, so the cap is inherently satisfied.
     * If broader filters are added, enforce the cap and add startIndex/count
     * pagination parameters per RFC 7644 §3.4.2.
     */
    scimListUsers: createAuthEndpoint(
      "/scim/v2/Users",
      { method: "GET", metadata: scimListUsersMetadata },
      async (ctx) => {
        const adapter = await assertScimCaller(ctx, options);
        const rawFilter = typeof ctx.query?.filter === "string" ? ctx.query.filter : undefined;

        let parsed;
        try {
          parsed = parseScimFilter(rawFilter);
        } catch {
          return scimJsonResponse(
            scimError(SCIM_HTTP_BAD_REQUEST, "Unsupported filter expression", "invalidFilter"),
            SCIM_HTTP_BAD_REQUEST,
          );
        }

        if (!parsed) {
          return scimJsonResponse(toScimListResponse([]));
        }

        if (parsed.kind !== "single") {
          return scimJsonResponse(
            scimError(SCIM_HTTP_BAD_REQUEST, "Compound filters are not supported on /Users", "invalidFilter"),
            SCIM_HTTP_BAD_REQUEST,
          );
        }

        const { field, value } = parsed.clause;
        if (field !== "id" && field !== "userName") {
          return scimJsonResponse(
            scimError(SCIM_HTTP_BAD_REQUEST, `Filter field '${field}' is not supported on /Users`, "invalidFilter"),
            SCIM_HTTP_BAD_REQUEST,
          );
        }

        // findUser searches by id column as its single where clause. Both id eq and
        // userName eq routes come here because userName is currently set to user.id (privacy
        // rule, resources.ts:28-31). If that mapping ever changes, this call site must match.
        const user = await findUser(adapter, value);
        if (!user) return scimJsonResponse(toScimListResponse([]));

        return scimJsonResponse(toScimListResponse([toScimUser(user, ctx.context.baseURL)]));
      },
    ),

    /** POST /api/auth/scim/v2/Users — always 405 (read-only). */
    scimCreateUserNotAllowed: createAuthEndpoint(
      "/scim/v2/Users",
      { method: "POST", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** PUT /api/auth/scim/v2/Users/:userId — always 405 (read-only). */
    scimReplaceUserNotAllowed: createAuthEndpoint(
      "/scim/v2/Users/:userId",
      { method: "PUT", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** PATCH /api/auth/scim/v2/Users/:userId — always 405 (read-only). */
    scimPatchUserNotAllowed: createAuthEndpoint(
      "/scim/v2/Users/:userId",
      { method: "PATCH", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** DELETE /api/auth/scim/v2/Users/:userId — always 405 (read-only). */
    scimDeleteUserNotAllowed: createAuthEndpoint(
      "/scim/v2/Users/:userId",
      { method: "DELETE", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    // ── Tenant-scoped user endpoints ──────────────────────────────────────────

    /**
     * GET /api/auth/scim/v2/tenants/:orgId/Users/:userId — org-scoped user.
     *
     * Returns the user with tenant-membership extension if they are a current member of orgId,
     * or 404 if the user does not exist globally or is not a member of that org.
     */
    scimGetOrgUser: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Users/:userId",
      { method: "GET", metadata: scimGetOrgUserMetadata },
      async (ctx) => {
        const adapter = await assertScimCaller(ctx, options);
        const orgId = ctx.params?.orgId as string | undefined;
        const userId = ctx.params?.userId as string | undefined;
        if (!orgId || !userId) {
          return scimJsonResponse(scimError(SCIM_HTTP_BAD_REQUEST, "Missing orgId or userId"), SCIM_HTTP_BAD_REQUEST);
        }

        const result = await findOrgUser(adapter, userId, orgId);
        if (!result) {
          return scimJsonResponse(
            scimError(SCIM_HTTP_NOT_FOUND, "User not found in this organization"),
            SCIM_HTTP_NOT_FOUND,
          );
        }

        return scimJsonResponse(toScimOrgUser(result.user, result.member, orgId, ctx.context.baseURL));
      },
    ),

    /** POST /api/auth/scim/v2/tenants/:orgId/Users — always 405 (read-only). */
    scimCreateOrgUserNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Users",
      { method: "POST", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** PUT /api/auth/scim/v2/tenants/:orgId/Users/:userId — always 405 (read-only). */
    scimReplaceOrgUserNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Users/:userId",
      { method: "PUT", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** PATCH /api/auth/scim/v2/tenants/:orgId/Users/:userId — always 405 (read-only). */
    scimPatchOrgUserNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Users/:userId",
      { method: "PATCH", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** DELETE /api/auth/scim/v2/tenants/:orgId/Users/:userId — always 405 (read-only). */
    scimDeleteOrgUserNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Users/:userId",
      { method: "DELETE", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** POST /api/auth/scim/v2/Bulk — always 405 (SCIM Bulk is not supported). */
    scimBulkNotAllowed: createAuthEndpoint(
      "/scim/v2/Bulk",
      { method: "POST", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    // ── Tenant-scoped group endpoints ─────────────────────────────────────────

    /**
     * GET /api/auth/scim/v2/tenants/:orgId/Groups/:groupId — tenant group by ID.
     *
     * `:groupId` is either a concrete team ID or the virtual `org-admins` sentinel.
     * For `org-admins`, returns the virtual group of all owner/admin members.
     * Cross-org team lookups return 404.
     */
    scimGetOrgGroup: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Groups/:groupId",
      { method: "GET", metadata: scimGetOrgGroupMetadata },
      async (ctx) => {
        const adapter = await assertScimCaller(ctx, options);
        const orgId = ctx.params?.orgId as string | undefined;
        const groupId = ctx.params?.groupId as string | undefined;
        if (!orgId || !groupId) {
          return scimJsonResponse(scimError(SCIM_HTTP_BAD_REQUEST, "Missing orgId or groupId"), SCIM_HTTP_BAD_REQUEST);
        }

        if (groupId === SCIM_ORG_ADMINS_GROUP_ID) {
          const admins = await findOrgAdmins(adapter, orgId);
          return scimJsonResponse(toScimOrgAdminsGroup(admins, orgId, ctx.context.baseURL));
        }

        const team = await findTeam(adapter, groupId, orgId);
        if (!team) {
          return scimJsonResponse(
            scimError(SCIM_HTTP_NOT_FOUND, "Group not found in this organization"),
            SCIM_HTTP_NOT_FOUND,
          );
        }

        return scimJsonResponse(toScimTeamGroup(team, ctx.context.baseURL));
      },
    ),

    /**
     * GET /api/auth/scim/v2/tenants/:orgId/Groups?filter=... — filtered group query.
     *
     * Supported filters:
     *   - `id eq "teamId"` → returns single team as ListResponse
     *   - `id eq "org-admins"` → returns org-admins virtual group as ListResponse
     *   - `id eq "org-admins" and members.value eq "userId"` → membership check
     */
    scimListOrgGroups: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Groups",
      { method: "GET", metadata: scimListOrgGroupsMetadata },
      async (ctx) => {
        const adapter = await assertScimCaller(ctx, options);
        const orgId = ctx.params?.orgId as string | undefined;
        if (!orgId) {
          return scimJsonResponse(scimError(SCIM_HTTP_BAD_REQUEST, "Missing orgId"), SCIM_HTTP_BAD_REQUEST);
        }

        const rawFilter = typeof ctx.query?.filter === "string" ? ctx.query.filter : undefined;

        let parsed;
        try {
          parsed = parseScimFilter(rawFilter);
        } catch {
          return scimJsonResponse(
            scimError(SCIM_HTTP_BAD_REQUEST, "Unsupported filter expression", "invalidFilter"),
            SCIM_HTTP_BAD_REQUEST,
          );
        }

        if (!parsed) {
          return scimJsonResponse(toScimListResponse([]));
        }

        // Compound filter: `id eq "org-admins" and members.value eq "userId"` — membership check.
        if (parsed.kind === "and") {
          const { left, right } = parsed;
          const idClause = left.field === "id" ? left : right.field === "id" ? right : null;
          const memberClause = left.field === "members.value" ? left : right.field === "members.value" ? right : null;

          if (!idClause || !memberClause) {
            return scimJsonResponse(
              scimError(SCIM_HTTP_BAD_REQUEST, "Compound filter must combine 'id eq' and 'members.value eq'", "invalidFilter"),
              SCIM_HTTP_BAD_REQUEST,
            );
          }

          if (idClause.value !== SCIM_ORG_ADMINS_GROUP_ID) {
            return scimJsonResponse(
              scimError(SCIM_HTTP_BAD_REQUEST, "members.value filter is only supported for org-admins group", "invalidFilter"),
              SCIM_HTTP_BAD_REQUEST,
            );
          }

          const admin = await isOrgAdmin(adapter, memberClause.value, orgId);
          if (!admin) return scimJsonResponse(toScimListResponse([]));

          const admins = await findOrgAdmins(adapter, orgId);
          return scimJsonResponse(toScimListResponse([toScimOrgAdminsGroup(admins, orgId, ctx.context.baseURL)]));
        }

        // Single filter.
        const { field, value } = parsed.clause;

        if (field !== "id") {
          return scimJsonResponse(
            scimError(SCIM_HTTP_BAD_REQUEST, `Filter field '${field}' is not supported on Groups`, "invalidFilter"),
            SCIM_HTTP_BAD_REQUEST,
          );
        }

        if (value === SCIM_ORG_ADMINS_GROUP_ID) {
          const admins = await findOrgAdmins(adapter, orgId);
          return scimJsonResponse(toScimListResponse([toScimOrgAdminsGroup(admins, orgId, ctx.context.baseURL)]));
        }

        const team = await findTeam(adapter, value, orgId);
        if (!team) return scimJsonResponse(toScimListResponse([]));

        return scimJsonResponse(toScimListResponse([toScimTeamGroup(team, ctx.context.baseURL)]));
      },
    ),

    /** POST /api/auth/scim/v2/tenants/:orgId/Groups — always 405 (read-only). */
    scimCreateGroupNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Groups",
      { method: "POST", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** PUT /api/auth/scim/v2/tenants/:orgId/Groups/:groupId — always 405 (read-only). */
    scimReplaceGroupNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Groups/:groupId",
      { method: "PUT", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** PATCH /api/auth/scim/v2/tenants/:orgId/Groups/:groupId — always 405 (read-only). */
    scimPatchGroupNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Groups/:groupId",
      { method: "PATCH", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),

    /** DELETE /api/auth/scim/v2/tenants/:orgId/Groups/:groupId — always 405 (read-only). */
    scimDeleteGroupNotAllowed: createAuthEndpoint(
      "/scim/v2/tenants/:orgId/Groups/:groupId",
      { method: "DELETE", disableBody: true, metadata: scimErrorMetadata },
      async () => scimMethodNotAllowed(),
    ),
  },
});
