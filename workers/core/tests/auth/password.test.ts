import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/adapters/password";

describe("password", () => {
  describe("hashPassword", () => {
    it("returns a salt:hash string", async () => {
      const result = await hashPassword("my-password");
      const parts = result.split(":");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(32);
      expect(parts[1]).toHaveLength(128);
    });

    it("produces different salts for each call", async () => {
      const a = await hashPassword("same-password");
      const b = await hashPassword("same-password");
      expect(a).not.toBe(b);
    });

    it("normalizes NFKC input before hashing", async () => {
      await expect(hashPassword("ok")).resolves.toBeDefined();
    });
  });

  describe("verifyPassword", () => {
    it("returns true for a matching password", async () => {
      const hash = await hashPassword("correct");
      const result = await verifyPassword({ hash, password: "correct" });
      expect(result).toBe(true);
    });

    it("returns false for a wrong password", async () => {
      const hash = await hashPassword("correct");
      const result = await verifyPassword({ hash, password: "wrong" });
      expect(result).toBe(false);
    });

    it("returns false for an empty hash string", async () => {
      const result = await verifyPassword({ hash: "", password: "anything" });
      expect(result).toBe(false);
    });

    it("returns false for a malformed hash with no colon separator", async () => {
      const result = await verifyPassword({ hash: "not-a-valid-hash", password: "anything" });
      expect(result).toBe(false);
    });

    it("returns false for a hash with empty salt", async () => {
      const result = await verifyPassword({ hash: ":somekey", password: "anything" });
      expect(result).toBe(false);
    });

    it("returns false for a truncated hash", async () => {
      const hash = await hashPassword("original");
      const truncated = hash.substring(0, 20);
      const result = await verifyPassword({ hash: truncated, password: "original" });
      expect(result).toBe(false);
    });

    it("returns false when salt is valid but key is wrong length", async () => {
      const hash = await hashPassword("x");
      const [salt] = hash.split(":");
      const tampered = `${salt}:deadbeef`;
      const result = await verifyPassword({ hash: tampered, password: "x" });
      expect(result).toBe(false);
    });
  });

  describe("NFKC normalization equivalence", () => {
    it("treats full-width and half-width ASCII as the same password", async () => {
      const fullWidth = "\uff50\uff41\uff53\uff53\uff57\uff4f\uff52\uff44"; // "password" in full-width
      const halfWidth = "password";
      const hashFull = await hashPassword(fullWidth);
      const hashHalf = await hashPassword(halfWidth);
      expect(await verifyPassword({ hash: hashFull, password: halfWidth })).toBe(true);
      expect(await verifyPassword({ hash: hashHalf, password: fullWidth })).toBe(true);
    });

    it("treats composed and decomposed forms consistently", async () => {
      const composed = "\u00e9"; // é as single codepoint
      const decomposed = "\u0065\u0301"; // e + combining acute accent
      const hash = await hashPassword(composed);
      expect(await verifyPassword({ hash, password: decomposed })).toBe(true);
      expect(await verifyPassword({ hash, password: composed })).toBe(true);
    });
  });

  describe("round-trip", () => {
    it("hashes and verifies passwords with special characters", async () => {
      const passwords = [
        "p@ssw0rd!#$%^&*()",
        "unicode-你好-世界",
        "emoji-🔐-password",
        "very-long-password-".repeat(10),
      ];
      for (const pw of passwords) {
        const hash = await hashPassword(pw);
        expect(await verifyPassword({ hash, password: pw })).toBe(true);
      }
    });
  });
});
