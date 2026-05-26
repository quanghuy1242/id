import { APIError, createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  assertPrincipalValidationCaller,
  validateOrganizationAdministrator,
  validateTeamInOrganization,
  validateUser,
  validateUserInOrganization,
} from "./operations";
import {
  validateOrganizationAdministratorPrincipalBody,
  validateTeamInOrganizationPrincipalBody,
  validateUserInOrganizationPrincipalBody,
  validateUserPrincipalBody,
  principalValidationEndpointMeta,
} from "./schema";
import type { PrincipalValidationAdapter, PrincipalValidationPluginOptions } from "./types";

export type { PrincipalValidationPluginOptions } from "./types";

function principalAdapter(adapter: unknown): PrincipalValidationAdapter {
  return adapter as PrincipalValidationAdapter;
}

function requestHeaders(request: { readonly headers: Headers } | undefined): Headers {
  if (!request) throw new APIError("UNAUTHORIZED");
  return request.headers;
}

async function assertCaller(ctx: {
  readonly context: { readonly adapter: unknown; readonly baseURL: string };
  readonly request?: { readonly headers: Headers };
}, options: PrincipalValidationPluginOptions): Promise<PrincipalValidationAdapter> {
  const adapter = principalAdapter(ctx.context.adapter);
  await assertPrincipalValidationCaller({
    adapter,
    headers: requestHeaders(ctx.request),
    issuer: options.issuer ?? ctx.context.baseURL,
    audience: options.audience,
    scope: options.scope,
  });
  return adapter;
}

const validateUserMeta = principalValidationEndpointMeta({
  description: "Validate that an id user exists",
  requestSchema: validateUserPrincipalBody,
});

const validateUserInOrgMeta = principalValidationEndpointMeta({
  description: "Validate that a user is a current member of the given organization",
  requestSchema: validateUserInOrganizationPrincipalBody,
});

const validateTeamInOrgMeta = principalValidationEndpointMeta({
  description: "Validate that a team exists and belongs to the given organization",
  requestSchema: validateTeamInOrganizationPrincipalBody,
});

const validateOrgAdminMeta = principalValidationEndpointMeta({
  description: "Validate that a user is a current Better Auth organization owner/admin",
  requestSchema: validateOrganizationAdministratorPrincipalBody,
});

/**
 * Better Auth plugin that owns authenticated exact-ID identity-principal validation
 * for users, organization users, teams, and organization administrators. Doc 017 will
 * replace these endpoints with a read-only SCIM profile; service-account validation has
 * been removed in favour of doc 018's `oauthClientResourceScope` token-issuance enforcement.
 */
export const idPrincipalValidation = (options: PrincipalValidationPluginOptions): BetterAuthPlugin => ({
  id: "id-principal-validation",
  endpoints: {
    validateUserPrincipal: createAuthEndpoint(
      "/principal-validation/users/validate",
      { method: "POST", body: validateUserPrincipalBody, metadata: validateUserMeta },
      async (ctx) => {
        const adapter = await assertCaller(ctx, options);
        await validateUser(adapter, ctx.body.userId);
        return ctx.json({ valid: true });
      },
    ),

    validateUserInOrganizationPrincipal: createAuthEndpoint(
      "/principal-validation/users/validate-organization-member",
      { method: "POST", body: validateUserInOrganizationPrincipalBody, metadata: validateUserInOrgMeta },
      async (ctx) => {
        const adapter = await assertCaller(ctx, options);
        await validateUserInOrganization(adapter, ctx.body.userId, ctx.body.organizationId);
        return ctx.json({ valid: true });
      },
    ),

    validateTeamInOrganizationPrincipal: createAuthEndpoint(
      "/principal-validation/teams/validate-organization-team",
      { method: "POST", body: validateTeamInOrganizationPrincipalBody, metadata: validateTeamInOrgMeta },
      async (ctx) => {
        const adapter = await assertCaller(ctx, options);
        await validateTeamInOrganization(adapter, ctx.body.teamId, ctx.body.organizationId);
        return ctx.json({ valid: true });
      },
    ),

    validateOrganizationAdministratorPrincipal: createAuthEndpoint(
      "/principal-validation/organization-administrators/validate",
      { method: "POST", body: validateOrganizationAdministratorPrincipalBody, metadata: validateOrgAdminMeta },
      async (ctx) => {
        const adapter = await assertCaller(ctx, options);
        await validateOrganizationAdministrator(adapter, ctx.body.userId, ctx.body.organizationId);
        return ctx.json({ valid: true });
      },
    ),
  },
});
