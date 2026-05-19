import {
  createLocalJWKSet,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  jwtVerify,
  SignJWT,
} from "jose";

export type ProofJwk = {
  readonly kid: string;
  readonly kty: string;
  readonly alg: string;
  readonly use: "sig";
  readonly n?: string;
  readonly e?: string;
  readonly crv?: string;
  readonly x?: string;
  readonly y?: string;
};

export type ProofKey = {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicJwk: ProofJwk;
};

export type JwksRotationState = {
  readonly active: ProofKey;
  readonly retired: readonly ProofKey[];
};

export async function createProofKey(kid: string): Promise<ProofKey> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const exported = await exportJWK(publicKey);
  return {
    kid,
    privateKey,
    publicJwk: {
      ...exported,
      kid,
      alg: "RS256",
      use: "sig",
    } as ProofJwk,
  };
}

export async function signProofJwt(key: ProofKey, issuer: string, audience: string): Promise<string> {
  return new SignJWT({ scope: "openid" })
    .setProtectedHeader({ alg: "RS256", kid: key.kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("user_1")
    .setExpirationTime("5m")
    .sign(key.privateKey);
}

export function publishProofJwks(state: JwksRotationState): { readonly keys: readonly ProofJwk[] } {
  return { keys: [state.active.publicJwk, ...state.retired.map((key) => key.publicJwk)] };
}

export async function rotateProofJwks(state: JwksRotationState, nextKid: string): Promise<JwksRotationState> {
  return {
    active: await createProofKey(nextKid),
    retired: [state.active, ...state.retired],
  };
}

export async function verifyProofJwt(
  token: string,
  jwks: { readonly keys: readonly ProofJwk[] },
  issuer: string,
  audience: string,
): Promise<string> {
  const { payload } = await jwtVerify(token, createLocalJWKSet({ keys: [...jwks.keys] } satisfies JSONWebKeySet), {
    issuer,
    audience,
  });
  return String(payload.sub);
}

export function tokenKid(token: string): string | undefined {
  return decodeProtectedHeader(token).kid;
}
