import { APIError } from "better-auth/api";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWTPayload } from "jose";

type JwksRow = {
  readonly id: string;
  readonly publicKey: string;
  readonly alg?: string | null;
};

type JwksReader = {
  readonly findMany: <T>(query: { model: string }) => Promise<T[]>;
};

function bearerToken(headers: Headers): string {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new APIError("UNAUTHORIZED");
  return authorization.slice("Bearer ".length);
}

function tokenHasScope(scopeClaim: unknown, requiredScope: string): boolean {
  return typeof scopeClaim === "string" && scopeClaim.split(" ").includes(requiredScope);
}

/**
 * Verifies an id-issued bearer JWT for an internal, scope-gated plugin route.
 * The plugin supplies its required system audience and scope; this boundary
 * owns the shared JWKS signature, issuer, audience, and scope checks.
 */
export async function verifyScopedBearerToken(params: {
  readonly adapter: JwksReader;
  readonly headers: Headers;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
}): Promise<JWTPayload> {
  const token = bearerToken(params.headers);
  let header: Awaited<ReturnType<typeof decodeProtectedHeader>>;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new APIError("UNAUTHORIZED");
  }
  if (!header.kid) throw new APIError("UNAUTHORIZED");

  const keys = await params.adapter.findMany<JwksRow>({ model: "jwks" });
  const key = keys.find((row) => row.id === header.kid);
  if (!key) throw new APIError("UNAUTHORIZED");

  const alg = key.alg ?? (typeof header.alg === "string" ? header.alg : "EdDSA");
  const cryptoKey = await importJWK(
    JSON.parse(key.publicKey) as JsonWebKey,
    alg,
  );
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, cryptoKey, {
      issuer: params.issuer,
      audience: params.audience,
      algorithms: [alg],
    }));
  } catch {
    throw new APIError("UNAUTHORIZED");
  }
  if (!tokenHasScope(payload.scope, params.scope)) {
    throw new APIError("FORBIDDEN");
  }
  return payload;
}
