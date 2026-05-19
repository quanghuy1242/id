import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resourceTokenFailure, verifyResourceToken } from "../../../../packages/lib/src/resource-token-verifier";

describe("resource token verifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies resource-bound JWTs through JWKS and enforces scope and organization claims", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: "key-1", alg: "RS256", use: "sig" }] })),
    );

    const token = await new SignJWT({
      scope: "api:read org:read",
      org_id: "org_1",
    })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer("https://id.example.test/api/auth")
      .setAudience("https://api.example.test")
      .setSubject("user_1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      verifyResourceToken({
        issuer: "https://id.example.test/api/auth",
        jwksUrl: "https://id.example.test/api/auth/jwks",
        audience: "https://api.example.test",
        requiredScopes: ["api:read"],
        organizationId: "org_1",
        token,
      }),
    ).resolves.toEqual({
      subject: "user_1",
      audience: "https://api.example.test",
      scopes: ["api:read", "org:read"],
      organizationId: "org_1",
    });
  });

  it("returns a JSON invalid-token failure response", async () => {
    const response = resourceTokenFailure();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_token" });
  });
});

