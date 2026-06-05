import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import {
  ADMIN_STEP_UP_TTL_SECONDS,
  authPluginConfig,
} from "../../src/auth/config";
import { otpHmacHex } from "../../src/auth/plugins/admin-sign-in-guard/operations";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";
import {
  createCapturedAuthEmailSender,
  type CapturedAuthEmailSender,
} from "../helpers/test-email";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

const ADMIN_EMAIL = "admin@example.test";
const ADMIN_PASSWORD = "password12345";
const BETTER_AUTH_SECRET = "test-secret";
const ORIGIN = "https://id.example.test";

type Harness = {
  readonly auth: TestAuth;
  readonly raw: RawSqlite;
  readonly kv: BetterAuthKvStorage & { readonly values: Map<string, string> };
  readonly emailSender: CapturedAuthEmailSender;
};

type TestAuth = ReturnType<typeof createTestAuth>;

function createKv(): BetterAuthKvStorage & {
  readonly values: Map<string, string>;
} {
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

function createTestAuth(
  raw: RawSqlite,
  kv: BetterAuthKvStorage,
  emailSender: CapturedAuthEmailSender,
) {
  return betterAuth(
    getAuthOptions(
      {
        BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: ORIGIN,
        DB: drizzleAdapter(drizzle(raw), {
          provider: "sqlite",
          camelCase: true,
          schema: authSchema,
        }),
        KV: kv,
      },
      { validAudiences: [], scopes: [], scopeRows: [] },
      { emailSender },
    ),
  );
}

async function buildHarness(): Promise<Harness> {
  const { raw } = await createMemoryD1();
  const kv = createKv();
  const emailSender = createCapturedAuthEmailSender();
  const auth = createTestAuth(raw, kv, emailSender);

  await auth.api.createUser({
    body: {
      name: "Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      data: { role: "admin" },
    },
  });
  return { auth, raw, kv, emailSender };
}

function verifyEmail(raw: RawSqlite, email: string): void {
  raw.exec(`update "user" set "emailVerified" = 1 where "email" = '${email}';`);
}

function signIn(
  auth: Harness["auth"],
  body: Record<string, unknown>,
): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function signInCookie(auth: Harness["auth"]): Promise<string> {
  const res = await signIn(auth, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    callbackURL: "/admin",
  });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie") ?? "";
}

function authRequest(
  auth: Harness["auth"],
  path: string,
  cookie: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

function latestOtp(emailSender: CapturedAuthEmailSender): string {
  const message = emailSender.messages.findLast((m) => m.kind === "admin-otp");
  if (!message || message.kind !== "admin-otp")
    throw new Error("no admin-otp email captured");
  return message.otp;
}

function storedOtpEntry(kv: Harness["kv"]): readonly [string, string] {
  const entries = [...kv.values.entries()].filter(([key]) =>
    key.startsWith(authPluginConfig.adminOtpStoragePrefix),
  );
  if (entries.length !== 1)
    throw new Error(`expected one stored admin OTP, found ${entries.length}`);
  return entries[0] as readonly [string, string];
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
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        code: "missing_login_context",
      });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("rejects a callbackURL that does not target account or console", async () => {
      const res = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/dashboard",
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        code: "missing_login_context",
      });
    });

    it("accepts account and console callbacks without login-time OTP", async () => {
      const account = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/account/security",
      });
      expect(account.status).toBe(200);
      expect(account.headers.get("set-cookie")).toEqual(expect.any(String));
      await expect(account.json()).resolves.toMatchObject({
        redirect: true,
        url: "/account/security",
      });

      const admin = await signIn(harness.auth, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        callbackURL: "/admin",
      });
      expect(admin.status).toBe(200);
      expect(admin.headers.get("set-cookie")).toEqual(expect.any(String));
      await expect(admin.json()).resolves.toMatchObject({
        redirect: true,
        url: "/admin",
      });
      expect(harness.emailSender.messages).toHaveLength(0);
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
      await expect(res.json()).resolves.toMatchObject({
        error: "invalid_signature",
      });
    });
  });

  describe("platform step-up", () => {
    it("starts false, emails an OTP, and stores only an HMAC of the OTP", async () => {
      const cookie = await signInCookie(harness.auth);

      const status = await authRequest(
        harness.auth,
        "/admin/step-up/status",
        cookie,
      );
      expect(status.status).toBe(200);
      await expect(status.json()).resolves.toEqual({ steppedUp: false });

      const request = await authRequest(
        harness.auth,
        "/admin/step-up/request",
        cookie,
        {},
      );
      expect(request.status).toBe(200);
      await expect(request.json()).resolves.toMatchObject({
        status: true,
        maskedEmail: "a***@e***.test",
      });
      expect(harness.emailSender.messages).toContainEqual(
        expect.objectContaining({ kind: "admin-otp", to: ADMIN_EMAIL }),
      );
      const otp = latestOtp(harness.emailSender);
      const [key, stored] = storedOtpEntry(harness.kv);
      const userId = key.slice(authPluginConfig.adminOtpStoragePrefix.length);
      expect(stored).toBe(otpHmacHex(BETTER_AUTH_SECRET, userId, otp));
      expect(stored).not.toBe(otp);
    });

    it("marks the current session stepped up after a valid OTP", async () => {
      const cookie = await signInCookie(harness.auth);
      await authRequest(harness.auth, "/admin/step-up/request", cookie, {});
      const otp = latestOtp(harness.emailSender);

      const verify = await authRequest(
        harness.auth,
        "/admin/step-up/verify",
        cookie,
        { otp },
      );
      expect(verify.status).toBe(200);
      await expect(verify.json()).resolves.toMatchObject({
        steppedUp: true,
        expiresIn: ADMIN_STEP_UP_TTL_SECONDS,
      });

      const status = await authRequest(
        harness.auth,
        "/admin/step-up/status",
        cookie,
      );
      expect(status.status).toBe(200);
      await expect(status.json()).resolves.toEqual({ steppedUp: true });
    });

    it("records the proof on the session record, not a KV sidecar", async () => {
      const cookie = await signInCookie(harness.auth);
      await authRequest(harness.auth, "/admin/step-up/request", cookie, {});
      const otp = latestOtp(harness.emailSender);
      await authRequest(harness.auth, "/admin/step-up/verify", cookie, { otp });

      // The only step-up KV writes are the OTP code (now deleted) and rate-limit
      // counters — never a dedicated step-up status key.
      const stepUpKeys = [...harness.kv.values.keys()].filter((key) =>
        key.includes("step-up"),
      );
      expect(stepUpKeys).toEqual([]);
      const stepUpAt = harness.raw
        .prepare(
          `select "platformStepUpAt" as v from "session" order by "createdAt" desc limit 1`,
        )
        .get() as { v: number | null };
      expect(typeof stepUpAt.v).toBe("number");
    });

    it("scopes the proof to the session that completed step-up", async () => {
      const cookieA = await signInCookie(harness.auth);
      const cookieB = await signInCookie(harness.auth);

      await authRequest(harness.auth, "/admin/step-up/request", cookieA, {});
      const otp = latestOtp(harness.emailSender);
      const verify = await authRequest(
        harness.auth,
        "/admin/step-up/verify",
        cookieA,
        { otp },
      );
      expect(verify.status).toBe(200);

      const statusA = await authRequest(
        harness.auth,
        "/admin/step-up/status",
        cookieA,
      );
      await expect(statusA.json()).resolves.toEqual({ steppedUp: true });
      // A separate session for the same user does not inherit the proof; a new
      // session starts unstepped, which is how sign-out/revocation clears it.
      const statusB = await authRequest(
        harness.auth,
        "/admin/step-up/status",
        cookieB,
      );
      await expect(statusB.json()).resolves.toEqual({ steppedUp: false });
    });

    it("rejects an invalid or expired step-up OTP", async () => {
      const cookie = await signInCookie(harness.auth);
      await authRequest(harness.auth, "/admin/step-up/request", cookie, {});

      const invalid = await authRequest(
        harness.auth,
        "/admin/step-up/verify",
        cookie,
        { otp: "000000" },
      );
      expect(invalid.status).toBe(401);
      await expect(invalid.json()).resolves.toMatchObject({
        code: "invalid_otp",
      });
    });

    it("throttles step-up OTP generation and verification", async () => {
      const cookie = await signInCookie(harness.auth);
      const request = () =>
        authRequest(harness.auth, "/admin/step-up/request", cookie, {});
      expect((await request()).status).toBe(200);
      expect((await request()).status).toBe(200);
      expect((await request()).status).toBe(200);
      const throttledRequest = await request();
      expect(throttledRequest.status).toBe(429);

      harness.kv.values.clear();
      await request();
      const wrong = () =>
        authRequest(harness.auth, "/admin/step-up/verify", cookie, {
          otp: "000000",
        });
      for (let i = 0; i < 5; i += 1) {
        expect((await wrong()).status).toBe(401);
      }
      const throttledVerify = await wrong();
      expect(throttledVerify.status).toBe(429);
    });
  });
});
