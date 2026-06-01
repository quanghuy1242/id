import { APIError } from "better-auth/api";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";
import {
  MEMBER_MODEL,
  OAUTH_CLIENT_MODEL,
  OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
  OAUTH_RESOURCE_SCOPE_MODEL,
  ORGANIZATION_MODEL,
  REGISTRATION_INTENT_MODEL,
  REGISTRATION_POLICY_MODEL,
  REGISTRATION_QUOTA_RESERVATION_MODEL,
  RESOURCE_SERVER_MODEL,
  TEAM_MEMBER_MODEL,
  USER_MODEL,
} from "../../../shared/constants";
import { authPluginConfig, HEX_BYTE_PAD_LENGTH, HEX_RADIX, MS_PER_SECOND, REGISTRATION_INTENT_HEADER, REGISTRATION_INTENT_TTL_MS } from "../../config";
import {
  type CreateRegistrationPolicyBody,
  type EvaluateRegistrationBody,
  type RegistrationIntentRow,
  type RegistrationPolicyRow,
  type RegistrationQuotaReservationRow,
  type SubmitRegistrationBody,
  type UpdateRegistrationPolicyBody,
} from "./schema";
import type { RegistrationAdapter, RegistrationAuthorize } from "./types";

type OAuthClientRow = {
  readonly clientId: string;
  readonly name?: string | null;
  readonly clientName?: string | null;
  readonly disabled?: boolean | null;
};

type OrganizationRow = {
  readonly id: string;
  readonly name: string;
};

type ResourceServerRow = {
  readonly id: string;
  readonly audience: string;
  readonly enabled?: boolean | null;
};

type ClientResourceScopeRow = {
  readonly clientId: string;
  readonly resourceServerId: string;
  readonly allowedScopes: readonly string[];
};

type UserRow = {
  readonly id: string;
  readonly email: string;
};

function now(): number {
  return Date.now();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailDomain(email: string): string {
  return normalizeEmail(email).split("@").at(1) ?? "";
}

function protocolScopes(): ReadonlySet<string> {
  return new Set([...authPluginConfig.oauthProtocolScopes, ...authPluginConfig.bootstrapOAuthScopes]);
}

function splitScopes(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(/\s+/u).map((scope) => scope.trim()).filter(Boolean))];
}

function scopeDifference(left: readonly string[], right: ReadonlySet<string>): string[] {
  return left.filter((scope) => !right.has(scope));
}

function domainAllowed(policy: RegistrationPolicyRow, email: string): boolean {
  if (policy.emailDomains.length === 0) return true;
  const domain = emailDomain(email);
  return policy.emailDomains.some((allowed) => allowed.toLowerCase() === domain);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_PAD_LENGTH, "0")).join("")}`;
}

async function verifySignedOAuthQuery(oauthQuery: string, secret: string): Promise<boolean> {
  const params = new URLSearchParams(oauthQuery);
  const signature = params.get("sig");
  const expiresAtSeconds = Number(params.get("exp"));
  params.delete("sig");

  if (!signature || !Number.isFinite(expiresAtSeconds)) return false;

  const expectedSignature = await makeSignature(params.toString(), secret);
  return constantTimeEqual(signature, expectedSignature) && expiresAtSeconds * MS_PER_SECOND >= now();
}

export function registrationIntentHeaderName(): string {
  return REGISTRATION_INTENT_HEADER;
}

export function intentTtlMs(value: number | undefined): number {
  return value ?? REGISTRATION_INTENT_TTL_MS;
}

export function buildCreatePolicyPayload(body: CreateRegistrationPolicyBody, actorId: string): Record<string, unknown> {
  const timestamp = now();
  return {
    ...body,
    status: "draft",
    clientId: body.clientId ?? null,
    organizationId: body.organizationId ?? null,
    resourceServerId: body.resourceServerId ?? null,
    quotaLimit: body.quotaLimit ?? null,
    startsAt: body.startsAt ?? null,
    expiresAt: body.expiresAt ?? null,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildUpdatePolicyPayload(body: UpdateRegistrationPolicyBody, actorId: string): Record<string, unknown> {
  return {
    ...body,
    ...(body.clientId === undefined ? {} : { clientId: body.clientId }),
    ...(body.organizationId === undefined ? {} : { organizationId: body.organizationId }),
    ...(body.resourceServerId === undefined ? {} : { resourceServerId: body.resourceServerId }),
    ...(body.quotaLimit === undefined ? {} : { quotaLimit: body.quotaLimit }),
    ...(body.startsAt === undefined ? {} : { startsAt: body.startsAt }),
    ...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
    updatedBy: actorId,
    updatedAt: now(),
  };
}

export async function assertRegistrationAdminAccess(
  authorize: RegistrationAuthorize | undefined,
  organizationId: string | null | undefined,
  userId: string,
  role: unknown,
  adapter: RegistrationAdapter,
): Promise<void> {
  if (!authorize || !(await authorize(organizationId, userId, role, adapter))) {
    throw new APIError("FORBIDDEN");
  }
}

export async function assertUniqueRegistrationPolicySlug(
  adapter: RegistrationAdapter,
  slug: string,
  existingId?: string,
): Promise<void> {
  const existing = await adapter.findOne<RegistrationPolicyRow>({
    model: REGISTRATION_POLICY_MODEL,
    where: [{ field: "slug", value: slug }],
  });
  if (existing && existing.id !== existingId) {
    throw new APIError("CONFLICT", { code: "registration_policy_slug_exists", message: "Registration policy slug already exists" });
  }
}

function policyIsActive(policy: RegistrationPolicyRow, at: number): boolean {
  if (policy.status !== "enabled") return false;
  if (policy.startsAt !== null && policy.startsAt !== undefined && policy.startsAt > at) return false;
  if (policy.expiresAt !== null && policy.expiresAt !== undefined && policy.expiresAt <= at) return false;
  return true;
}

async function loadClient(adapter: RegistrationAdapter, clientId: string): Promise<OAuthClientRow | null> {
  return adapter.findOne<OAuthClientRow>({
    model: OAUTH_CLIENT_MODEL,
    where: [{ field: "clientId", value: clientId }],
  });
}

async function loadOrganization(adapter: RegistrationAdapter, organizationId: string | null | undefined): Promise<OrganizationRow | null> {
  if (!organizationId) return null;
  return adapter.findOne<OrganizationRow>({
    model: ORGANIZATION_MODEL,
    where: [{ field: "id", value: organizationId }],
  });
}

async function findEnabledPolicy(
  adapter: RegistrationAdapter,
  clientId: string,
  at: number,
): Promise<RegistrationPolicyRow | null> {
  const policies = await adapter.findMany<RegistrationPolicyRow>({
    model: REGISTRATION_POLICY_MODEL,
    where: [{ field: "status", value: "enabled" }],
    sortBy: { field: "createdAt", direction: "desc" },
  });
  return policies.find((policy) => {
    if (!policyIsActive(policy, at)) return false;
    if (policy.mode !== "client_initiated" && policy.mode !== "public_limited" && policy.mode !== "domain_allowlist") {
      return false;
    }
    return !policy.clientId || policy.clientId === clientId;
  }) ?? null;
}

async function assertScopesAllowed(
  adapter: RegistrationAdapter,
  policy: RegistrationPolicyRow,
  clientId: string,
  requestedScopes: readonly string[],
  resource: string | null,
): Promise<string[]> {
  const policyScopeSet = new Set(policy.allowedScopes);
  const allowedScopes = requestedScopes.filter((scope) => policyScopeSet.has(scope));
  if (allowedScopes.length === 0 && requestedScopes.length > 0) {
    throw new APIError("BAD_REQUEST", { code: "registration_scope_denied", message: "Requested scopes are not allowed by registration policy" });
  }

  const nonProtocolScopes = scopeDifference(allowedScopes, protocolScopes());
  if (nonProtocolScopes.length === 0) return allowedScopes;
  if (!resource) {
    throw new APIError("BAD_REQUEST", { code: "registration_resource_required", message: "Resource is required for product scopes" });
  }

  const resourceServer = await adapter.findOne<ResourceServerRow>({
    model: RESOURCE_SERVER_MODEL,
    where: [{ field: "audience", value: resource }],
  });
  if (!resourceServer || resourceServer.enabled === false) {
    throw new APIError("BAD_REQUEST", { code: "registration_resource_denied", message: "Requested resource is not enabled" });
  }
  if (policy.resourceServerId && policy.resourceServerId !== resourceServer.id) {
    throw new APIError("BAD_REQUEST", { code: "registration_resource_denied", message: "Requested resource is not allowed by registration policy" });
  }

  const catalogScopes = await adapter.findMany<{ readonly scope: string }>({
    model: OAUTH_RESOURCE_SCOPE_MODEL,
    where: [{ field: "resourceServerId", value: resourceServer.id }],
  });
  const catalogScopeSet = new Set(catalogScopes.map((row) => row.scope));
  const missingCatalogScope = nonProtocolScopes.find((scope) => !catalogScopeSet.has(scope));
  if (missingCatalogScope) {
    throw new APIError("BAD_REQUEST", { code: "registration_scope_denied", message: "Requested scope is not in the scope catalog" });
  }

  const clientScope = await adapter.findOne<ClientResourceScopeRow>({
    model: OAUTH_CLIENT_RESOURCE_SCOPE_MODEL,
    where: [
      { field: "clientId", value: clientId },
      { field: "resourceServerId", value: resourceServer.id },
    ],
  });
  const clientAllowed = new Set(clientScope?.allowedScopes ?? []);
  const missingClientScope = nonProtocolScopes.find((scope) => !clientAllowed.has(scope));
  if (missingClientScope) {
    throw new APIError("BAD_REQUEST", { code: "registration_scope_denied", message: "Requested scope is not allowed for this client/resource" });
  }

  return allowedScopes;
}

function denial(reason: string, message: string) {
  return { decision: "denied" as const, reason, message };
}

export async function evaluateRegistration(
  adapter: RegistrationAdapter,
  body: EvaluateRegistrationBody,
  ttlMs: number,
  secret: string,
) {
  if (!(await verifySignedOAuthQuery(body.oauthQuery, secret))) {
    return denial("invalid_oauth_query", "Registration requires a valid application request.");
  }

  const params = new URLSearchParams(body.oauthQuery);
  const clientId = params.get("client_id");
  if (!clientId) return denial("missing_client", "Registration requires a client.");

  const client = await loadClient(adapter, clientId);
  if (!client || client.disabled === true) return denial("invalid_client", "Registration is unavailable for this application.");

  const at = now();
  const policy = await findEnabledPolicy(adapter, clientId, at);
  if (!policy) return denial("no_policy", "Registration is closed for this application.");

  try {
    const requestedScopes = splitScopes(params.get("scope"));
    const resource = params.get("resource");
    const allowedScopes = await assertScopesAllowed(adapter, policy, clientId, requestedScopes, resource);
    if (await quotaFull(adapter, policy, at)) {
      return denial("quota_full", "Registration is full for this application.");
    }

    const expiresAt = at + ttlMs;
    const intent = await adapter.create<RegistrationIntentRow>({
      model: REGISTRATION_INTENT_MODEL,
      data: {
        policyId: policy.id,
        clientId,
        organizationId: policy.organizationId ?? null,
        invitationId: body.invitationId ?? null,
        requestedScopes,
        allowedScopes,
        resource,
        oauthQuery: body.oauthQuery,
        oauthQueryHash: await sha256Hex(body.oauthQuery),
        email: null,
        status: "started",
        expiresAt,
        createdAt: at,
        updatedAt: at,
        completedAt: null,
        userId: null,
        failureReason: null,
      },
    });
    const organization = await loadOrganization(adapter, policy.organizationId);
    return {
      decision: "allowed" as const,
      intentId: intent.id,
      client: {
        clientId,
        clientName: client.name || client.clientName || clientId,
      },
      organization: organization ? { id: organization.id, name: organization.name } : null,
      requestedScopes,
      allowedScopes,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof APIError) {
      const apiError = error as APIError & { readonly body?: { readonly code?: string; readonly message?: string } };
      return denial(apiError.body?.code ?? "policy_denied", apiError.body?.message ?? "Registration is unavailable for this application.");
    }
    throw error;
  }
}

async function loadIntent(adapter: RegistrationAdapter, intentId: string): Promise<RegistrationIntentRow> {
  const intent = await adapter.findOne<RegistrationIntentRow>({
    model: REGISTRATION_INTENT_MODEL,
    where: [{ field: "id", value: intentId }],
  });
  if (!intent) throw new APIError("BAD_REQUEST", { code: "invalid_registration_intent", message: "Registration intent is invalid" });
  return intent;
}

async function loadPolicy(adapter: RegistrationAdapter, policyId: string): Promise<RegistrationPolicyRow> {
  const policy = await adapter.findOne<RegistrationPolicyRow>({
    model: REGISTRATION_POLICY_MODEL,
    where: [{ field: "id", value: policyId }],
  });
  if (!policy) throw new APIError("BAD_REQUEST", { code: "invalid_registration_intent", message: "Registration policy no longer exists" });
  return policy;
}

async function activeReservations(adapter: RegistrationAdapter, policyId: string, at: number): Promise<RegistrationQuotaReservationRow[]> {
  const rows = await adapter.findMany<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    where: [{ field: "policyId", value: policyId }],
  });
  return rows.filter((row) => row.status === "consumed" || (row.status === "reserved" && row.expiresAt > at));
}

async function quotaFull(adapter: RegistrationAdapter, policy: RegistrationPolicyRow, at: number): Promise<boolean> {
  if (!policy.quotaLimit) return false;
  return (await activeReservations(adapter, policy.id, at)).length >= policy.quotaLimit;
}

async function ensureReservation(
  adapter: RegistrationAdapter,
  policy: RegistrationPolicyRow,
  intent: RegistrationIntentRow,
  at: number,
): Promise<void> {
  const existing = await adapter.findOne<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    where: [{ field: "intentId", value: intent.id }],
  });
  if (existing) {
    if (existing.status === "released") {
      throw new APIError("BAD_REQUEST", { code: "registration_intent_expired", message: "Registration intent is no longer active" });
    }
    return;
  }
  if (await quotaFull(adapter, policy, at)) {
    throw new APIError("BAD_REQUEST", { code: "registration_quota_full", message: "Registration is full for this application" });
  }
  await adapter.create<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    data: {
      policyId: policy.id,
      intentId: intent.id,
      status: "reserved",
      createdAt: at,
      expiresAt: intent.expiresAt,
      consumedAt: null,
    },
  });
}

export async function submitRegistration(
  adapter: RegistrationAdapter,
  body: SubmitRegistrationBody,
): Promise<{ readonly status: "ready"; readonly intentId: string; readonly email: string; readonly continueOAuth: boolean }> {
  const intent = await loadIntent(adapter, body.intentId);
  const policy = await loadPolicy(adapter, intent.policyId);
  const at = now();
  assertIntentOpen(intent, policy, at);
  if (!domainAllowed(policy, body.email)) {
    throw new APIError("BAD_REQUEST", { code: "registration_email_domain_denied", message: "Use an allowed email domain to register" });
  }
  await ensureReservation(adapter, policy, intent, at);
  await adapter.update<RegistrationIntentRow>({
    model: REGISTRATION_INTENT_MODEL,
    where: [{ field: "id", value: intent.id }],
    update: { status: "submitted", email: normalizeEmail(body.email), updatedAt: at },
  });
  return { status: "ready", intentId: intent.id, email: normalizeEmail(body.email), continueOAuth: true };
}

function assertIntentOpen(intent: RegistrationIntentRow, policy: RegistrationPolicyRow, at: number): void {
  if (!policyIsActive(policy, at)) {
    throw new APIError("BAD_REQUEST", { code: "registration_policy_closed", message: "Registration policy is not active" });
  }
  if (intent.expiresAt <= at) {
    throw new APIError("BAD_REQUEST", { code: "registration_intent_expired", message: "Registration intent expired" });
  }
  if (intent.status !== "started" && intent.status !== "submitted") {
    throw new APIError("BAD_REQUEST", { code: "registration_intent_used", message: "Registration intent is no longer active" });
  }
}

export async function assertSignupAllowed(
  adapter: RegistrationAdapter,
  intentId: string | null,
  email: string | undefined,
): Promise<RegistrationIntentRow> {
  if (!intentId) {
    throw new APIError("BAD_REQUEST", { code: "missing_registration_intent", message: "Missing registration intent" });
  }
  if (!email) {
    throw new APIError("BAD_REQUEST", { code: "missing_registration_email", message: "Missing registration email" });
  }
  const intent = await loadIntent(adapter, intentId);
  const policy = await loadPolicy(adapter, intent.policyId);
  const at = now();
  assertIntentOpen(intent, policy, at);
  const normalizedEmail = normalizeEmail(email);
  if (intent.email && intent.email !== normalizedEmail) {
    throw new APIError("BAD_REQUEST", { code: "registration_email_mismatch", message: "Registration intent email does not match" });
  }
  if (!domainAllowed(policy, normalizedEmail)) {
    throw new APIError("BAD_REQUEST", { code: "registration_email_domain_denied", message: "Use an allowed email domain to register" });
  }
  const existingUser = await adapter.findOne<UserRow>({
    model: USER_MODEL,
    where: [{ field: "email", value: normalizedEmail }],
  });
  if (existingUser) {
    throw new APIError("BAD_REQUEST", { code: "registration_user_exists", message: "Sign in with the existing account" });
  }
  await ensureReservation(adapter, policy, intent, at);
  return intent;
}

async function userIdFromReturned(adapter: RegistrationAdapter, returned: unknown, email: string | null | undefined): Promise<string | null> {
  const record = returned && typeof returned === "object" ? returned as Record<string, unknown> : {};
  const user = record.user && typeof record.user === "object" ? record.user as Record<string, unknown> : {};
  if (typeof user.id === "string") return user.id;
  if (!email) return null;
  const row = await adapter.findOne<UserRow>({
    model: USER_MODEL,
    where: [{ field: "email", value: email }],
  });
  return row?.id ?? null;
}

export async function completeSignup(
  adapter: RegistrationAdapter,
  intentId: string | null,
  returned: unknown,
): Promise<void> {
  if (!intentId) return;
  const intent = await loadIntent(adapter, intentId);
  if (intent.status === "completed") return;
  const userId = await userIdFromReturned(adapter, returned, intent.email);
  if (!userId) {
    await adapter.update<RegistrationIntentRow>({
      model: REGISTRATION_INTENT_MODEL,
      where: [{ field: "id", value: intent.id }],
      update: { status: "failed", failureReason: "missing_user_after_signup", updatedAt: now() },
    });
    return;
  }
  const policy = await loadPolicy(adapter, intent.policyId);
  if (policy.organizationId) {
    await ensureMembership(adapter, policy, userId);
  }
  await consumeReservation(adapter, intent.id);
  const timestamp = now();
  await adapter.update<RegistrationIntentRow>({
    model: REGISTRATION_INTENT_MODEL,
    where: [{ field: "id", value: intent.id }],
    update: { status: "completed", userId, completedAt: timestamp, updatedAt: timestamp },
  });
}

async function ensureMembership(adapter: RegistrationAdapter, policy: RegistrationPolicyRow, userId: string): Promise<void> {
  const existing = await adapter.findOne<{ readonly id: string }>({
    model: MEMBER_MODEL,
    where: [
      { field: "organizationId", value: policy.organizationId },
      { field: "userId", value: userId },
    ],
  });
  if (!existing) {
    await adapter.create({
      model: MEMBER_MODEL,
      data: { organizationId: policy.organizationId, userId, role: policy.defaultRole, createdAt: now() },
    });
  }
  await Promise.all(policy.defaultTeamIds.map(async (teamId) => {
    const existingTeamMember = await adapter.findOne<{ readonly id: string }>({
      model: TEAM_MEMBER_MODEL,
      where: [
        { field: "teamId", value: teamId },
        { field: "userId", value: userId },
      ],
    });
    if (!existingTeamMember) {
      await adapter.create({
        model: TEAM_MEMBER_MODEL,
        data: { teamId, userId, createdAt: now() },
      });
    }
  }));
}

async function consumeReservation(adapter: RegistrationAdapter, intentId: string): Promise<void> {
  const existing = await adapter.findOne<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    where: [{ field: "intentId", value: intentId }],
  });
  if (!existing) return;
  await adapter.update<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    where: [{ field: "intentId", value: intentId }],
    update: { status: "consumed", consumedAt: now() },
  });
}

export async function cancelRegistration(adapter: RegistrationAdapter, intentId: string): Promise<{ readonly cancelled: true }> {
  const intent = await loadIntent(adapter, intentId);
  if (intent.status === "completed") {
    throw new APIError("BAD_REQUEST", { code: "registration_intent_used", message: "Completed registration cannot be cancelled" });
  }
  await adapter.update<RegistrationIntentRow>({
    model: REGISTRATION_INTENT_MODEL,
    where: [{ field: "id", value: intent.id }],
    update: { status: "cancelled", updatedAt: now() },
  });
  await releaseReservation(adapter, intent.id);
  return { cancelled: true };
}

async function releaseReservation(adapter: RegistrationAdapter, intentId: string): Promise<void> {
  const existing = await adapter.findOne<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    where: [{ field: "intentId", value: intentId }],
  });
  if (!existing || existing.status !== "reserved") return;
  await adapter.update<RegistrationQuotaReservationRow>({
    model: REGISTRATION_QUOTA_RESERVATION_MODEL,
    where: [{ field: "intentId", value: intentId }],
    update: { status: "released" },
  });
}

export async function policyQuota(adapter: RegistrationAdapter, policyId: string) {
  const policy = await loadPolicy(adapter, policyId);
  const active = await activeReservations(adapter, policyId, now());
  return {
    policyId,
    quotaLimit: policy.quotaLimit ?? null,
    quotaUsed: active.filter((row) => row.status === "consumed").length,
    quotaReserved: active.filter((row) => row.status === "reserved").length,
    quotaTarget: policy.quotaTarget,
  };
}

export async function presentPolicyWithQuota(adapter: RegistrationAdapter, policy: RegistrationPolicyRow) {
  return {
    ...policy,
    quota: await policyQuota(adapter, policy.id),
  };
}

export function statusPayload(intent: RegistrationIntentRow) {
  return {
    intentId: intent.id,
    status: intent.status,
    email: intent.email ?? null,
    expiresAt: intent.expiresAt,
    completedAt: intent.completedAt ?? null,
  };
}

export async function registrationStatus(adapter: RegistrationAdapter, intentId: string) {
  return statusPayload(await loadIntent(adapter, intentId));
}
