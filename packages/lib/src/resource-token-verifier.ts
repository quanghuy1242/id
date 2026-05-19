import { createRemoteJWKSet, jwtVerify } from "jose";

export type ResourceTokenVerificationInput = {
  readonly issuer: string;
  readonly jwksUrl: string;
  readonly audience: string;
  readonly requiredScopes?: readonly string[];
  readonly token: string;
  readonly organizationId?: string;
};

export type VerifiedResourceToken = {
  readonly subject: string;
  readonly audience: string;
  readonly scopes: readonly string[];
  readonly organizationId?: string;
};

function scopesFromClaim(value: unknown): readonly string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value.split(" ").filter((scope) => scope.length > 0);
}

export async function verifyResourceToken(input: ResourceTokenVerificationInput): Promise<VerifiedResourceToken> {
  const { payload } = await jwtVerify(input.token, createRemoteJWKSet(new URL(input.jwksUrl)), {
    issuer: input.issuer,
    audience: input.audience,
  });
  const scopes = scopesFromClaim(payload.scope);
  const organizationId = typeof payload.org_id === "string" ? payload.org_id : undefined;

  if (input.requiredScopes?.some((scope) => !scopes.includes(scope))) {
    throw new Error("Required scope missing");
  }

  if (input.organizationId && organizationId !== input.organizationId) {
    throw new Error("Organization claim mismatch");
  }

  if (typeof payload.sub !== "string") {
    throw new Error("Subject claim missing");
  }

  return {
    subject: payload.sub,
    audience: input.audience,
    scopes,
    organizationId,
  };
}

export function resourceTokenFailure(status = 401) {
  return new Response(JSON.stringify({ error: "invalid_token" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
