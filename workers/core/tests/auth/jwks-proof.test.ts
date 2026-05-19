import { describe, expect, it } from "vitest";
import {
  createProofKey,
  publishProofJwks,
  rotateProofJwks,
  signProofJwt,
  tokenKid,
  verifyProofJwt,
} from "../../src/auth/jwks/proof";

describe("JWKS signing and rotation proof", () => {
  it("signs, publishes, verifies, rotates, and keeps old keys valid during grace", async () => {
    const issuer = "https://id.example.test/api/auth";
    const audience = "https://api.example.test";
    const initial = await createProofKey("kid-initial");
    const state = { active: initial, retired: [] };

    const oldToken = await signProofJwt(state.active, issuer, audience);
    const oldJwks = publishProofJwks(state);

    expect(tokenKid(oldToken)).toBe("kid-initial");
    expect(oldJwks.keys.map((key) => key.kid)).toContain("kid-initial");
    await expect(verifyProofJwt(oldToken, oldJwks, issuer, audience)).resolves.toBe("user_1");

    const rotated = await rotateProofJwks(state, "kid-next");
    const newToken = await signProofJwt(rotated.active, issuer, audience);
    const rotatedJwks = publishProofJwks(rotated);

    expect(tokenKid(newToken)).toBe("kid-next");
    expect(rotatedJwks.keys.map((key) => key.kid)).toEqual(["kid-next", "kid-initial"]);
    await expect(verifyProofJwt(newToken, rotatedJwks, issuer, audience)).resolves.toBe("user_1");
    await expect(verifyProofJwt(oldToken, rotatedJwks, issuer, audience)).resolves.toBe("user_1");
  });
});
