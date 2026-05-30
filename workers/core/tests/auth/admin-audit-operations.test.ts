import { describe, expect, it } from "vitest";
import {
  toMs,
  parsePageParams,
  tokenPrefix,
  parsePublicJwk,
  deriveJwkStatus,
  uniqueIds,
  presentToken,
  presentSession,
  presentConsent,
  presentJwk,
  normalizeScopes,
} from "../../src/auth/plugins/admin-audit/operations";

describe("admin-audit operations", () => {
  describe("toMs", () => {
    it("normalizes Date, number, ISO string; null otherwise", () => {
      expect(toMs(new Date(1000))).toBe(1000);
      expect(toMs(1736900000000)).toBe(1736900000000);
      expect(toMs("2025-01-15T00:00:00.000Z")).toBe(Date.parse("2025-01-15T00:00:00.000Z"));
      expect(toMs(null)).toBeNull();
      expect(toMs(undefined)).toBeNull();
      expect(toMs("not-a-date")).toBeNull();
    });
  });

  describe("parsePageParams", () => {
    it("defaults, clamps to max, floors, and rejects negatives", () => {
      expect(parsePageParams(undefined)).toEqual({ limit: 25, offset: 0 });
      expect(parsePageParams({ limit: 10, offset: 5 })).toEqual({ limit: 10, offset: 5 });
      expect(parsePageParams({ limit: 9999 })).toEqual({ limit: 100, offset: 0 });
      expect(parsePageParams({ limit: -3, offset: -1 })).toEqual({ limit: 25, offset: 0 });
      expect(parsePageParams({ limit: "20", offset: "40" })).toEqual({ limit: 20, offset: 40 });
    });
  });

  describe("tokenPrefix", () => {
    it("returns an 8-char prefix and never the full token", () => {
      expect(tokenPrefix("abcdefghijklmnop", "id_1")).toBe("abcdefgh…");
      expect(tokenPrefix("abcdefghijklmnop", "id_1")).not.toContain("ijklmnop");
    });
    it("falls back to the id when the token is null", () => {
      expect(tokenPrefix(null, "id_123456789")).toBe("id_12345…");
    });
  });

  describe("parsePublicJwk", () => {
    it("parses JSON strings and tolerates garbage", () => {
      expect(parsePublicJwk('{"kty":"OKP"}')).toEqual({ kty: "OKP" });
      expect(parsePublicJwk("not json")).toEqual({});
      expect(parsePublicJwk(null)).toEqual({});
      expect(parsePublicJwk({ kty: "RSA" })).toEqual({ kty: "RSA" });
    });
  });

  describe("deriveJwkStatus", () => {
    const grace = 1000;
    it("active when no expiry or not expired", () => {
      expect(deriveJwkStatus(null, 100, grace)).toBe("active");
      expect(deriveJwkStatus(200, 100, grace)).toBe("active");
    });
    it("rotated inside the grace window, expired past it", () => {
      expect(deriveJwkStatus(100, 150, grace)).toBe("rotated");
      expect(deriveJwkStatus(100, 1101, grace)).toBe("expired");
    });
  });

  describe("uniqueIds", () => {
    it("collects defined, distinct ids", () => {
      expect(uniqueIds([{ u: "a" }, { u: "a" }, { u: null }, { u: "b" }], (r) => r.u)).toEqual(["a", "b"]);
    });
  });

  describe("normalizeScopes", () => {
    it("accepts arrays and space/comma strings", () => {
      expect(normalizeScopes(["a", "b"])).toEqual(["a", "b"]);
      expect(normalizeScopes("a b c")).toEqual(["a", "b", "c"]);
      expect(normalizeScopes("a,b")).toEqual(["a", "b"]);
      expect(normalizeScopes(undefined)).toEqual([]);
    });
  });

  describe("presenters", () => {
    it("presentToken returns only a prefix, never the token value", () => {
      const out = presentToken(
        { id: "t1", token: "supersecrettokenvalue", clientId: "cli_1", userId: "u1", scopes: ["s:read"], expiresAt: 5, createdAt: 1 },
        "access",
        new Map([["u1", "a@b.com"]]),
        new Map([["cli_1", "Content API"]]),
      );
      expect(out.tokenPrefix).toBe("supersec…");
      expect(JSON.stringify(out)).not.toContain("supersecrettokenvalue");
      expect(out.clientName).toBe("Content API");
      expect(out.userEmail).toBe("a@b.com");
      expect(out).not.toHaveProperty("token");
    });

    it("presentJwk never exposes a private key", () => {
      const out = presentJwk(
        { id: "k1", publicKey: '{"kty":"OKP","alg":"EdDSA"}', createdAt: 1, expiresAt: null } as never,
        100,
        1000,
      );
      expect(out.status).toBe("active");
      expect(out.alg).toBe("EdDSA");
      expect(JSON.stringify(out)).not.toContain("privateKey");
      expect(out).not.toHaveProperty("privateKey");
    });

    it("presentSession strips bearer tokens, enriches email, and leaves unknown ids null", () => {
      const session = presentSession(
        { id: "s1", token: "supersecretsessiontoken", userId: "u9", ipAddress: null, userAgent: null, activeOrganizationId: "org_1", activeTeamId: null, impersonatedBy: null, createdAt: 1, expiresAt: 2 },
        new Map([["u9", "u9@example.test"]]),
      );
      expect(session.userEmail).toBe("u9@example.test");
      expect(session.activeOrganizationId).toBe("org_1");
      expect(session.activeTeamId).toBeNull();
      expect(JSON.stringify(session)).not.toContain("supersecretsessiontoken");
      expect(session).not.toHaveProperty("token");
      const consent = presentConsent(
        { id: "c1", clientId: "cli_1", userId: "u1", scopes: ["openid"], createdAt: 1, updatedAt: 2 },
        new Map([["u1", "a@b.com"]]),
        new Map([["cli_1", "Content API"]]),
      );
      expect(consent.userEmail).toBe("a@b.com");
      expect(consent.clientName).toBe("Content API");
      expect(consent.scopes).toEqual(["openid"]);
    });
  });
});
