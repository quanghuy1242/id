import { APIError } from "better-auth/api";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import type { PrincipalValidationAdapter } from "./types";

type JwksRow = {
  readonly id: string;
  readonly publicKey: string;
  readonly alg?: string | null;
};

type UserRow = {
  readonly id: string;
  readonly banned?: boolean | null;
};

type MemberRow = {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
};

type TeamRow = {
  readonly id: string;
  readonly organizationId: string;
};

function bearerToken(headers: Headers): string {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new APIError("UNAUTHORIZED");
  }
  return authorization.slice("Bearer ".length);
}

function tokenHasScope(scopeClaim: unknown, requiredScope: string): boolean {
  return typeof scopeClaim === "string" && scopeClaim.split(" ").includes(requiredScope);
}

export async function assertPrincipalValidationCaller(params: {
  readonly adapter: PrincipalValidationAdapter;
  readonly headers: Headers;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
}): Promise<void> {
  const token = bearerToken(params.headers);
  const header = decodeProtectedHeader(token);
  if (!header.kid) throw new APIError("UNAUTHORIZED");

  const keys = await params.adapter.findMany<JwksRow>({ model: "jwks" });
  const key = keys.find((row) => row.id === header.kid);
  if (!key) throw new APIError("UNAUTHORIZED");

  const cryptoKey = await importJWK(
    JSON.parse(key.publicKey) as JsonWebKey,
    key.alg ?? (typeof header.alg === "string" ? header.alg : "EdDSA"),
  );
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    ({ payload } = await jwtVerify(token, cryptoKey, {
      issuer: params.issuer,
      audience: params.audience,
    }));
  } catch {
    throw new APIError("UNAUTHORIZED");
  }

  if (!tokenHasScope(payload.scope, params.scope)) {
    throw new APIError("FORBIDDEN");
  }
}

export async function validateUser(adapter: PrincipalValidationAdapter, userId: string): Promise<void> {
  const user = await adapter.findOne<UserRow>({
    model: "user",
    where: [{ field: "id", value: userId }],
  });
  if (!user || user.banned) {
    throw new APIError("NOT_FOUND");
  }
}

export async function validateUserInOrganization(
  adapter: PrincipalValidationAdapter,
  userId: string,
  organizationId: string,
): Promise<void> {
  await validateUser(adapter, userId);
  const member = await adapter.findOne<MemberRow>({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });
  if (!member) throw new APIError("NOT_FOUND");
}

export async function validateTeamInOrganization(
  adapter: PrincipalValidationAdapter,
  teamId: string,
  organizationId: string,
): Promise<void> {
  const team = await adapter.findOne<TeamRow>({
    model: "team",
    where: [{ field: "id", value: teamId }],
  });
  if (!team || team.organizationId !== organizationId) {
    throw new APIError("NOT_FOUND");
  }
}

export async function validateOrganizationAdministrator(
  adapter: PrincipalValidationAdapter,
  userId: string,
  organizationId: string,
): Promise<void> {
  await validateUserInOrganization(adapter, userId, organizationId);
  const member = await adapter.findOne<MemberRow>({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });
  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new APIError("NOT_FOUND");
  }
}
