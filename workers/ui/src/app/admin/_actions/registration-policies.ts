import {
  authApiGetOrThrow,
  authApiPostOrThrow,
  type ActiveScope,
} from "@id/lib";

const platformScope: ActiveScope = { kind: "platform" };

function orgParams(
  scope: ActiveScope,
): { organizationId?: string } | undefined {
  return scope.kind === "organization"
    ? { organizationId: scope.organizationId }
    : undefined;
}

export type RegistrationPolicyStatus =
  | "draft"
  | "enabled"
  | "paused"
  | "archived";

export type RegistrationPolicy = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: RegistrationPolicyStatus;
  readonly mode: string;
  readonly clientId: string | null;
  readonly organizationId: string | null;
  readonly resourceServerId: string | null;
  readonly allowedScopes: readonly string[];
  readonly emailDomains: readonly string[];
  readonly defaultRole: string;
  readonly defaultTeamIds: readonly string[];
  readonly quotaLimit: number | null;
  readonly quotaTarget: string;
  readonly requiresEmailVerification: boolean;
  readonly startsAt: number | null;
  readonly expiresAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly quota: {
    readonly policyId: string;
    readonly quotaLimit: number | null;
    readonly quotaUsed: number;
    readonly quotaReserved: number;
    readonly quotaTarget: string;
  };
};

export type RegistrationIntent = {
  readonly id: string;
  readonly policyId: string;
  readonly clientId: string;
  readonly organizationId: string | null;
  readonly invitationId: string | null;
  readonly requestedScopes: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly resource: string | null;
  readonly email: string | null;
  readonly status: string;
  readonly expiresAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
  readonly userId: string | null;
  readonly failureReason: string | null;
};

export async function listRegistrationPolicies(
  scope: ActiveScope = platformScope,
): Promise<RegistrationPolicy[]> {
  const response = await authApiGetOrThrow<{ policies: RegistrationPolicy[] }>(
    "/admin/registration-policies",
    orgParams(scope),
  );
  return response.policies ?? [];
}

export async function enableRegistrationPolicy(
  policyId: string,
): Promise<RegistrationPolicy> {
  return authApiPostOrThrow<RegistrationPolicy>(
    `/admin/registration-policies/${encodeURIComponent(policyId)}/enable`,
    {},
  );
}

export async function pauseRegistrationPolicy(
  policyId: string,
): Promise<RegistrationPolicy> {
  return authApiPostOrThrow<RegistrationPolicy>(
    `/admin/registration-policies/${encodeURIComponent(policyId)}/pause`,
    {},
  );
}

export async function archiveRegistrationPolicy(
  policyId: string,
): Promise<RegistrationPolicy> {
  return authApiPostOrThrow<RegistrationPolicy>(
    `/admin/registration-policies/${encodeURIComponent(policyId)}/archive`,
    {},
  );
}

export async function listRegistrationPolicyIntents(
  policyId: string,
): Promise<RegistrationIntent[]> {
  const response = await authApiGetOrThrow<{ intents: RegistrationIntent[] }>(
    `/admin/registration-policies/${encodeURIComponent(policyId)}/intents`,
  );
  return response.intents ?? [];
}
