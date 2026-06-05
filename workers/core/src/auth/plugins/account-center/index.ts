import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { OAUTH_CONSENT_MODEL, SESSION_MODEL } from "../../../shared/constants";
import {
  loadAccountConsents,
  loadAccountOrganizations,
  loadActiveSessions,
  loadConnectedApplicationCount,
  loadPasswordEnabled,
  presentAccountSession,
  presentAccountUser,
  type AccountCenterAdapter,
} from "./operations";
import {
  accountCenterEndpointMeta,
  accountConsentsOpenApiSchema,
  accountOrganizationsOpenApiSchema,
  accountSessionsOpenApiSchema,
  accountSuccessOpenApiSchema,
  accountSummaryOpenApiSchema,
  revokeAccountConsentBody,
  revokeAccountConsentOpenApiRequestBody,
  revokeAccountSessionBody,
  revokeAccountSessionOpenApiRequestBody,
  revokeOthersOpenApiSchema,
  type AccountSessionRow,
  type AccountUserRow,
} from "./schema";
import type { AccountCenterPluginOptions } from "./types";

export type { AccountCenterPluginOptions } from "./types";

type AuthenticatedSession = {
  readonly user: AccountUserRow & { readonly role?: unknown };
  readonly session: {
    readonly id?: string | null;
    readonly token?: string | null;
  };
};

type InternalSessionAdapter = {
  readonly deleteSession: (sessionToken: string) => Promise<unknown>;
  readonly deleteSessions: (userId: string) => Promise<unknown>;
};

function accountAdapter(ctx: {
  context: { adapter: unknown };
}): AccountCenterAdapter {
  return ctx.context.adapter as AccountCenterAdapter;
}

function internalSessionAdapter(ctx: {
  context: { internalAdapter: unknown };
}): InternalSessionAdapter {
  return ctx.context.internalAdapter as InternalSessionAdapter;
}

function requireCurrentSession(session: unknown): AuthenticatedSession {
  if (
    !session ||
    typeof session !== "object" ||
    !("user" in session) ||
    !("session" in session)
  ) {
    throw new APIError("UNAUTHORIZED");
  }
  return session as AuthenticatedSession;
}

const summaryMeta = accountCenterEndpointMeta({
  description: "Current-user account summary without secret material",
  responseSchema: accountSummaryOpenApiSchema,
});

const sessionsMeta = accountCenterEndpointMeta({
  description: "List current-user browser sessions without session tokens",
  responseSchema: accountSessionsOpenApiSchema,
});

const revokeSessionMeta = accountCenterEndpointMeta({
  description: "Revoke a current-user browser session by session id",
  requestBody: revokeAccountSessionOpenApiRequestBody,
  responseSchema: accountSuccessOpenApiSchema,
  responseDescription: "Session revoked",
});

const revokeOthersMeta = accountCenterEndpointMeta({
  description:
    "Revoke every current-user browser session except this request's session",
  responseSchema: revokeOthersOpenApiSchema,
  responseDescription: "Other sessions revoked",
});

const revokeAllMeta = accountCenterEndpointMeta({
  description:
    "Revoke every current-user browser session, including this request's session",
  responseSchema: accountSuccessOpenApiSchema,
  responseDescription: "All sessions revoked",
});

const consentsMeta = accountCenterEndpointMeta({
  description:
    "List current-user OAuth consent grants with client display metadata",
  responseSchema: accountConsentsOpenApiSchema,
});

const revokeConsentMeta = accountCenterEndpointMeta({
  description: "Revoke a current-user OAuth consent grant by client id",
  requestBody: revokeAccountConsentOpenApiRequestBody,
  responseSchema: accountSuccessOpenApiSchema,
  responseDescription: "Consent revoked",
});

const organizationsMeta = accountCenterEndpointMeta({
  description:
    "List the current user's organizations and console links computed from account authority",
  responseSchema: accountOrganizationsOpenApiSchema,
});

export const idAccountCenter = (
  options: AccountCenterPluginOptions = {},
): BetterAuthPlugin => ({
  id: "id-account-center",
  endpoints: {
    getAccountSummary: createAuthEndpoint(
      "/account/summary",
      { method: "GET", use: [sessionMiddleware], metadata: summaryMeta },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        const adapter = accountAdapter(ctx);
        const [
          passwordEnabled,
          activeSessions,
          connectedApplications,
          organizations,
        ] = await Promise.all([
          loadPasswordEnabled(adapter, session.user.id),
          loadActiveSessions(adapter, session.user.id),
          loadConnectedApplicationCount(adapter, session.user.id),
          loadAccountOrganizations({
            adapter,
            userId: session.user.id,
            role: session.user.role,
            isPlatformAdmin: options.isPlatformAdmin ?? (() => false),
          }),
        ]);

        return ctx.json({
          user: presentAccountUser(session.user),
          security: {
            passwordEnabled,
            mfaEnabled: false,
            emailVerificationRequired: true,
          },
          counts: {
            organizations: organizations.length,
            activeSessions: activeSessions.length,
            connectedApplications,
          },
        });
      },
    ),

    listAccountSessions: createAuthEndpoint(
      "/account/sessions",
      { method: "GET", use: [sessionMiddleware], metadata: sessionsMeta },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        const rows = await loadActiveSessions(
          accountAdapter(ctx),
          session.user.id,
        );
        return ctx.json({
          sessions: rows.map((row) =>
            presentAccountSession(row, session.session.id),
          ),
        });
      },
    ),

    revokeAccountSession: createAuthEndpoint(
      "/account/sessions/revoke",
      {
        method: "POST",
        use: [sensitiveSessionMiddleware],
        body: revokeAccountSessionBody,
        metadata: revokeSessionMeta,
      },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        const row = await accountAdapter(ctx).findOne<AccountSessionRow>({
          model: SESSION_MODEL,
          where: [
            { field: "id", value: ctx.body.sessionId },
            { field: "userId", value: session.user.id },
          ],
        });
        if (!row) throw new APIError("NOT_FOUND");

        await internalSessionAdapter(ctx).deleteSession(row.token);
        return ctx.json({ status: true });
      },
    ),

    revokeOtherAccountSessions: createAuthEndpoint(
      "/account/sessions/revoke-others",
      {
        method: "POST",
        use: [sensitiveSessionMiddleware],
        metadata: revokeOthersMeta,
      },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        const rows = await loadActiveSessions(
          accountAdapter(ctx),
          session.user.id,
        );
        const otherRows = rows.filter(
          (row) => row.token !== session.session.token,
        );
        await Promise.all(
          otherRows.map((row) =>
            internalSessionAdapter(ctx).deleteSession(row.token),
          ),
        );
        return ctx.json({ status: true, revoked: otherRows.length });
      },
    ),

    revokeAllAccountSessions: createAuthEndpoint(
      "/account/sessions/revoke-all",
      {
        method: "POST",
        use: [sensitiveSessionMiddleware],
        metadata: revokeAllMeta,
      },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        await internalSessionAdapter(ctx).deleteSessions(session.user.id);
        return ctx.json({ status: true });
      },
    ),

    listAccountConsents: createAuthEndpoint(
      "/account/consents",
      { method: "GET", use: [sessionMiddleware], metadata: consentsMeta },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        return ctx.json({
          consents: await loadAccountConsents(
            accountAdapter(ctx),
            session.user.id,
          ),
        });
      },
    ),

    revokeAccountConsent: createAuthEndpoint(
      "/account/consents/revoke",
      {
        method: "POST",
        use: [sensitiveSessionMiddleware],
        body: revokeAccountConsentBody,
        metadata: revokeConsentMeta,
      },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        await accountAdapter(ctx).delete({
          model: OAUTH_CONSENT_MODEL,
          where: [
            { field: "clientId", value: ctx.body.clientId },
            { field: "userId", value: session.user.id },
          ],
        });
        return ctx.json({ status: true });
      },
    ),

    listAccountOrganizations: createAuthEndpoint(
      "/account/organizations",
      { method: "GET", use: [sessionMiddleware], metadata: organizationsMeta },
      async (ctx) => {
        const session = requireCurrentSession(ctx.context.session);
        const organizations = await loadAccountOrganizations({
          adapter: accountAdapter(ctx),
          userId: session.user.id,
          role: session.user.role,
          isPlatformAdmin: options.isPlatformAdmin ?? (() => false),
        });
        return ctx.json({ organizations });
      },
    ),
  },
});
