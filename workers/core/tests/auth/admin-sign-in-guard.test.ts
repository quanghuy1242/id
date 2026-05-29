import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";
import { createCapturedAuthEmailSender, type CapturedAuthEmailSender } from "../helpers/test-email";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

const ADMIN_EMAIL = "admin@example.test";
const ADMIN_PASSWORD = "password12345";
const ORIGIN = "https://id.example.test";

type Harness = {
  readonly auth: ReturnType<typeof betterAuth>;
  readonly raw: RawSqlite;
  readonly kv: BetterAuthKvStorage & { readonly values: Map<string, string> };
  readonly emailSender: CapturedAuthEmailSender;
};

function createKv(): BetterAuthKvStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

async function buildHarness(): Promise<Harness> {
  const { raw } = await createMemoryD1();
  const kv = createKv();
  const emailSender = createCapturedAuthEmailSender();
  const auth = betterAuth(
    getAuthOptions(
      {
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: ORIGIN,
        DB: drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema }),
        KV: kv,
      },
      { validAudiences: [], scopes: [], scopeRows: [] },
      { emailSender },
    ),
  );

  await auth.api.createUser({ body: { name: "Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  return { auth, raw, kv, emailSender };
}

function verifyEmail(raw: RawSqlite, email: string): void {
  raw.exec(`update "user" set "emailVerified" = 1 where "email" = '${email}';`);
}

function signIn(auth: Harness["auth"], body: Record<string, unknown>): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function latestOtp(emailSender: CapturedAuthEmailSender): string {
  const message = emailSender.messages.findLast((m) => m.kind === "admin-otp");
  if (!message || message.kind !== "admin-otp") throw new Error("no admin-otp email captured");
  return message.otp;
}

describe("id-admin-sign-in-guard", () => {
  let harness: Harness;

  // Build the database + admin user once; per-test we only reset the KV (OTP
  // codes and rate-limit counters) and the verified flag, which keeps the suite
  // fast while preserving isolation for the rate-limit cases.
  beforeAll(async () => {
    harness = await buildHarness();
  });

  beforeEach(() => {
    harness.kv.values.clear();
    (harness.emailSender.messages as unknown as unknown[]).length = 0;
    verifyEmail(harness.raw, ADMIN_EMAIL);
  });

  describe("context gate", () => {
    it("rejects a sign-in with neither callbackURL nor oauth_query", async () => {
      const res = await signIn(harness.auth, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ code: "missing_login_context" });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("rejects a callbackURL that does not target /admin", async () => {
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/dashboard",
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ code: "missing_login_context" });
    });

    it("lets the OAuth flow through to the OAuth provider's signature check", async () => {
      // A truthy oauth_query bypasses the admin gate; the OAuth before-hook then
      // rejects the unsigned query, proving the guard did not short-circuit it.
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        oauth_query: "client_id=acme",
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "invalid_signature" });
    });
  });

  describe("admin MFA gate", () => {
    it("emails an OTP and withholds the session on the first submit", async () => {
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/admin",
      });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({
        code: "admin_otp_required",
        maskedEmail: "a***@e***.test",
      });
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(harness.emailSender.messages).toContainEqual(
        expect.objectContaining({ kind: "admin-otp", to: ADMIN_EMAIL }),
      );
    });

    it("rejects invalid credentials without sending an OTP", async () => {
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: "wrong-password",
        callbackURL: "/admin",
      });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
      expect(harness.emailSender.messages).toHaveLength(0);
    });

    it("blocks an unverified admin before sending an OTP", async () => {
      harness.raw.exec(`update "user" set "emailVerified" = 0 where "email" = '${ADMIN_EMAIL}';`);
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/admin",
      });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
      expect(harness.emailSender.messages).toHaveLength(0);
    });

    it("throttles OTP generation after the limit", async () => {
      const attempt = () =>
        signIn(harness.auth, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, callbackURL: "/admin" });
      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      expect((await attempt()).status).toBe(401);
      const throttled = await attempt();
      expect(throttled.status).toBe(429);
      await expect(throttled.json()).resolves.toMatchObject({ code: "too_many_requests" });
    });

    it("creates the session on the second submit with a valid OTP", async () => {
      await signIn(harness.auth, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, callbackURL: "/admin" });
      const otp = latestOtp(harness.emailSender);

      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/admin",
        otp,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toEqual(expect.any(String));
      await expect(res.json()).resolves.toMatchObject({ redirect: true, url: "/admin" });
    });

    it("rejects an invalid OTP", async () => {
      await signIn(harness.auth, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, callbackURL: "/admin" });
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/admin",
        otp: "000000",
      });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ code: "invalid_otp" });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("treats an expired (missing) OTP as invalid", async () => {
      await signIn(harness.auth, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, callbackURL: "/admin" });
      const otp = latestOtp(harness.emailSender);
      // Simulate TTL expiry by dropping every stored OTP code.
      for (const key of harness.kv.values.keys()) {
        if (key.includes(":code:")) harness.kv.values.delete(key);
      }
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/admin",
        otp,
      });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ code: "invalid_otp" });
    });

    it("throttles OTP verification after the limit", async () => {
      await signIn(harness.auth, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, callbackURL: "/admin" });
      const wrong = () =>
        signIn(harness.auth, {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          callbackURL: "/admin",
          otp: "000000",
        });
      for (let i = 0; i < 5; i += 1) {
        expect((await wrong()).status).toBe(401);
      }
      const throttled = await wrong();
      expect(throttled.status).toBe(429);
      await expect(throttled.json()).resolves.toMatchObject({ code: "too_many_requests" });
    });
  });
});
