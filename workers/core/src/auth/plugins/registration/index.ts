import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import {
  REGISTRATION_INTENT_MODEL,
  REGISTRATION_POLICY_MODEL,
} from "../../../shared/constants";
import { readBody, readString } from "../../../shared/request";
import {
  assertRegistrationAdminAccess,
  assertSignupAllowed,
  assertUniqueRegistrationPolicySlug,
  buildCreatePolicyPayload,
  buildUpdatePolicyPayload,
  cancelRegistration,
  completeSignup,
  evaluateRegistration,
  invalidateActivePolicyIntents,
  intentTtlMs,
  policyQuota,
  presentPolicyWithQuota,
  recordContinuationFailure,
  registrationIntentHeaderName,
  registrationStatus,
  submitRegistration,
} from "./operations";
import {
  createRegistrationPolicyBody,
  continuationFailureRegistrationBody,
  createRegistrationPolicyOpenApiRequestBody,
  evaluateRegistrationBody,
  evaluateRegistrationOpenApiRequestBody,
  evaluateRegistrationOpenApiSchema,
  listRegistrationPoliciesOpenApiSchema,
  registrationEndpointMeta,
  registrationIntentBetterAuthFields,
  registrationPolicyBetterAuthFields,
  registrationPolicyOpenApiSchema,
  registrationQuotaReservationBetterAuthFields,
  submitRegistrationBody,
  submitRegistrationOpenApiRequestBody,
  submitRegistrationOpenApiSchema,
  updateRegistrationPolicyBody,
  updateRegistrationPolicyOpenApiRequestBody,
  type RegistrationIntentRow,
  type RegistrationPolicyRow,
  type RegistrationPolicyStatus,
} from "./schema";
import type { RegistrationAdapter, RegistrationPluginOptions } from "./types";

export type { RegistrationPluginOptions } from "./types";

type SessionUser = {
  readonly id: string;
  readonly role?: unknown;
};

type HookContext = {
  readonly path?: string;
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Headers;
  readonly context: Record<string, unknown> & {
    readonly adapter?: unknown;
    readonly returned?: unknown;
  };
};

function adapterFrom(ctx: {
  readonly context: { readonly adapter?: unknown };
}): RegistrationAdapter {
  return ctx.context.adapter as RegistrationAdapter;
}

function sessionUser(
  session: { readonly user?: unknown } | null | undefined,
): SessionUser {
  const user = session?.user as
    | { readonly id?: unknown; readonly role?: unknown }
    | undefined;
  if (typeof user?.id !== "string") throw new APIError("UNAUTHORIZED");
  return { id: user.id, role: user.role };
}

function requestedOrganizationId(
  query: Record<string, unknown> | undefined,
): string | null | undefined {
  if (!query || !("organizationId" in query)) return undefined;
  return typeof query.organizationId === "string" && query.organizationId
    ? query.organizationId
    : null;
}

async function requirePolicyAccess(
  options: RegistrationPluginOptions,
  adapter: RegistrationAdapter,
  session: { readonly user?: unknown } | null | undefined,
  organizationId: string | null | undefined,
): Promise<SessionUser> {
  const user = sessionUser(session);
  await assertRegistrationAdminAccess(
    options.authorize,
    organizationId,
    user.id,
    user.role,
    adapter,
  );
  return user;
}

async function requirePolicyMoveAccess(
  options: RegistrationPluginOptions,
  adapter: RegistrationAdapter,
  session: { readonly user?: unknown } | null | undefined,
  existingOrganizationId: string | null | undefined,
  targetOrganizationId: string | null | undefined,
): Promise<SessionUser> {
  const user = await requirePolicyAccess(
    options,
    adapter,
    session,
    existingOrganizationId,
  );
  if (targetOrganizationId !== existingOrganizationId) {
    await assertRegistrationAdminAccess(
      options.authorize,
      targetOrganizationId,
      user.id,
      user.role,
      adapter,
    );
  }
  return user;
}

async function findPolicy(
  adapter: RegistrationAdapter,
  id: string | undefined,
): Promise<RegistrationPolicyRow> {
  const row = await adapter.findOne<RegistrationPolicyRow>({
    model: REGISTRATION_POLICY_MODEL,
    where: [{ field: "id", value: id }],
  });
  if (!row) throw new APIError("NOT_FOUND");
  return row;
}

async function setPolicyStatus(
  adapter: RegistrationAdapter,
  id: string | undefined,
  status: RegistrationPolicyStatus,
  userId: string,
): Promise<RegistrationPolicyRow> {
  const timestamp = Date.now();
  return adapter.update<RegistrationPolicyRow>({
    model: REGISTRATION_POLICY_MODEL,
    where: [{ field: "id", value: id }],
    update: { status, updatedBy: userId, updatedAt: timestamp },
  });
}

async function transitionPolicyStatus(
  adapter: RegistrationAdapter,
  policy: RegistrationPolicyRow,
  status: RegistrationPolicyStatus,
  userId: string,
): Promise<Awaited<ReturnType<typeof presentPolicyWithQuota>>> {
  const updated = await setPolicyStatus(adapter, policy.id, status, userId);
  if (status === "paused" || status === "archived") {
    await invalidateActivePolicyIntents(
      adapter,
      policy.id,
      status === "paused" ? "policy_paused" : "policy_archived",
    );
  }
  return presentPolicyWithQuota(adapter, updated);
}

function signUpMutation(ctx: {
  readonly path?: string;
  readonly method?: string;
}): boolean {
  return ctx.path === "/sign-up/email" && ctx.method === "POST";
}

const createPolicyMetadata = registrationEndpointMeta({
  description: "Create a registration policy",
  requestBody: createRegistrationPolicyOpenApiRequestBody,
  responseSchema: registrationPolicyOpenApiSchema,
});
const listPolicyMetadata = registrationEndpointMeta({
  description: "List registration policies visible to the current admin",
  responseSchema: listRegistrationPoliciesOpenApiSchema,
});
const getPolicyMetadata = registrationEndpointMeta({
  description: "Get a registration policy",
  hasIdParam: true,
  responseSchema: registrationPolicyOpenApiSchema,
});
const updatePolicyMetadata = registrationEndpointMeta({
  description: "Update a registration policy",
  hasIdParam: true,
  requestBody: updateRegistrationPolicyOpenApiRequestBody,
  responseSchema: registrationPolicyOpenApiSchema,
});
const evaluateMetadata = registrationEndpointMeta({
  description:
    "Evaluate a public registration request and create an intent when allowed",
  requestBody: evaluateRegistrationOpenApiRequestBody,
  responseSchema: evaluateRegistrationOpenApiSchema,
});
const submitMetadata = registrationEndpointMeta({
  description:
    "Preflight a registration form submit and reserve soft quota before Better Auth signup",
  requestBody: submitRegistrationOpenApiRequestBody,
  responseSchema: submitRegistrationOpenApiSchema,
});

/** Better Auth plugin that owns registration policy, intent, and signup guard state. */
export const idRegistration = (
  options: RegistrationPluginOptions = {},
): BetterAuthPlugin => ({
  id: "id-registration",
  schema: {
    registrationPolicy: {
      fields: registrationPolicyBetterAuthFields,
    },
    registrationIntent: {
      fields: registrationIntentBetterAuthFields,
    },
    registrationQuotaReservation: {
      fields: registrationQuotaReservationBetterAuthFields,
    },
  },
  endpoints: {
    createRegistrationPolicy: createAuthEndpoint(
      "/admin/registration-policies",
      {
        method: "POST",
        use: [sessionMiddleware],
        body: createRegistrationPolicyBody,
        metadata: createPolicyMetadata,
      },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const user = await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          ctx.body.organizationId,
        );
        await assertUniqueRegistrationPolicySlug(adapter, ctx.body.slug);
        const policy = await adapter.create<RegistrationPolicyRow>({
          model: REGISTRATION_POLICY_MODEL,
          data: buildCreatePolicyPayload(ctx.body, user.id),
        });
        return ctx.json(await presentPolicyWithQuota(adapter, policy));
      },
    ),
    listRegistrationPolicies: createAuthEndpoint(
      "/admin/registration-policies",
      { method: "GET", use: [sessionMiddleware], metadata: listPolicyMetadata },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const user = sessionUser(ctx.context.session);
        const requestedOrgId = requestedOrganizationId(ctx.query);
        const rows = await adapter.findMany<RegistrationPolicyRow>({
          model: REGISTRATION_POLICY_MODEL,
          sortBy: { field: "createdAt", direction: "desc" },
        });
        const visible = (
          await Promise.all(
            rows.map(async (row) => {
              if (
                requestedOrgId !== undefined &&
                row.organizationId !== requestedOrgId
              )
                return null;
              const allowed = await options.authorize?.(
                row.organizationId,
                user.id,
                user.role,
                adapter,
              );
              return allowed ? presentPolicyWithQuota(adapter, row) : null;
            }),
          )
        ).filter((row): row is NonNullable<typeof row> => row !== null);
        return ctx.json({ policies: visible });
      },
    ),
    getRegistrationPolicy: createAuthEndpoint(
      "/admin/registration-policies/:id",
      { method: "GET", use: [sessionMiddleware], metadata: getPolicyMetadata },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const policy = await findPolicy(adapter, ctx.params?.id);
        await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          policy.organizationId,
        );
        return ctx.json(await presentPolicyWithQuota(adapter, policy));
      },
    ),
    updateRegistrationPolicy: createAuthEndpoint(
      "/admin/registration-policies/:id",
      {
        method: "PATCH",
        use: [sessionMiddleware],
        body: updateRegistrationPolicyBody,
        metadata: updatePolicyMetadata,
      },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const existing = await findPolicy(adapter, ctx.params?.id);
        const targetOrgId =
          ctx.body.organizationId === undefined
            ? existing.organizationId
            : ctx.body.organizationId;
        const user = await requirePolicyMoveAccess(
          options,
          adapter,
          ctx.context.session,
          existing.organizationId,
          targetOrgId,
        );
        if (ctx.body.slug)
          await assertUniqueRegistrationPolicySlug(
            adapter,
            ctx.body.slug,
            existing.id,
          );
        const policy = await adapter.update<RegistrationPolicyRow>({
          model: REGISTRATION_POLICY_MODEL,
          where: [{ field: "id", value: existing.id }],
          update: buildUpdatePolicyPayload(ctx.body, user.id),
        });
        return ctx.json(await presentPolicyWithQuota(adapter, policy));
      },
    ),
    enableRegistrationPolicy: createAuthEndpoint(
      "/admin/registration-policies/:id/enable",
      { method: "POST", use: [sessionMiddleware], metadata: getPolicyMetadata },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const policy = await findPolicy(adapter, ctx.params?.id);
        const user = await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          policy.organizationId,
        );
        return ctx.json(
          await transitionPolicyStatus(adapter, policy, "enabled", user.id),
        );
      },
    ),
    pauseRegistrationPolicy: createAuthEndpoint(
      "/admin/registration-policies/:id/pause",
      { method: "POST", use: [sessionMiddleware], metadata: getPolicyMetadata },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const policy = await findPolicy(adapter, ctx.params?.id);
        const user = await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          policy.organizationId,
        );
        return ctx.json(
          await transitionPolicyStatus(adapter, policy, "paused", user.id),
        );
      },
    ),
    archiveRegistrationPolicy: createAuthEndpoint(
      "/admin/registration-policies/:id/archive",
      { method: "POST", use: [sessionMiddleware], metadata: getPolicyMetadata },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const policy = await findPolicy(adapter, ctx.params?.id);
        const user = await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          policy.organizationId,
        );
        return ctx.json(
          await transitionPolicyStatus(adapter, policy, "archived", user.id),
        );
      },
    ),
    listRegistrationPolicyIntents: createAuthEndpoint(
      "/admin/registration-policies/:id/intents",
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const policy = await findPolicy(adapter, ctx.params?.id);
        await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          policy.organizationId,
        );
        const intents = await adapter.findMany<RegistrationIntentRow>({
          model: REGISTRATION_INTENT_MODEL,
          where: [{ field: "policyId", value: policy.id }],
          sortBy: { field: "createdAt", direction: "desc" },
        });
        return ctx.json({ intents });
      },
    ),
    getRegistrationPolicyQuota: createAuthEndpoint(
      "/admin/registration-policies/:id/quota",
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => {
        const adapter = adapterFrom(ctx);
        const policy = await findPolicy(adapter, ctx.params?.id);
        await requirePolicyAccess(
          options,
          adapter,
          ctx.context.session,
          policy.organizationId,
        );
        return ctx.json(await policyQuota(adapter, policy.id));
      },
    ),
    evaluateRegistration: createAuthEndpoint(
      "/registration/evaluate",
      {
        method: "POST",
        body: evaluateRegistrationBody,
        metadata: evaluateMetadata,
      },
      async (ctx) =>
        ctx.json(
          await evaluateRegistration(
            adapterFrom(ctx),
            ctx.body,
            intentTtlMs(options.intentTtlMs),
            ctx.context.secret,
          ),
        ),
    ),
    submitRegistration: createAuthEndpoint(
      "/registration/submit",
      {
        method: "POST",
        body: submitRegistrationBody,
        metadata: submitMetadata,
      },
      async (ctx) =>
        ctx.json(await submitRegistration(adapterFrom(ctx), ctx.body)),
    ),
    getRegistrationStatus: createAuthEndpoint(
      "/registration/status",
      { method: "GET" },
      async (ctx) => {
        const intentId =
          typeof ctx.query?.intentId === "string" ? ctx.query.intentId : "";
        return ctx.json(await registrationStatus(adapterFrom(ctx), intentId));
      },
    ),
    cancelRegistration: createAuthEndpoint(
      "/registration/cancel",
      { method: "POST", body: submitRegistrationBody.pick({ intentId: true }) },
      async (ctx) =>
        ctx.json(await cancelRegistration(adapterFrom(ctx), ctx.body.intentId)),
    ),
    markRegistrationContinuationFailed: createAuthEndpoint(
      "/registration/continuation-failed",
      { method: "POST", body: continuationFailureRegistrationBody },
      async (ctx) =>
        ctx.json(await recordContinuationFailure(adapterFrom(ctx), ctx.body)),
    ),
  },
  hooks: {
    before: [
      {
        matcher: signUpMutation,
        handler: createAuthMiddleware(async (ctx) => {
          const hookCtx = ctx as HookContext;
          await assertSignupAllowed(
            adapterFrom(hookCtx),
            hookCtx.headers?.get(registrationIntentHeaderName()) ?? null,
            readString(readBody(hookCtx), "email"),
          );
        }),
      },
    ],
    after: [
      {
        matcher: signUpMutation,
        handler: createAuthMiddleware(async (ctx) => {
          const hookCtx = ctx as HookContext;
          await completeSignup(
            adapterFrom(hookCtx),
            hookCtx.headers?.get(registrationIntentHeaderName()) ?? null,
            hookCtx.context.returned,
          );
        }),
      },
    ],
  },
});
