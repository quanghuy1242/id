import { describe, expect, it } from "vitest";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createMemoryD1 } from "./d1-test-helper";
import * as authSchema from "../../src/db/auth-schema";

/**
 * Track D · D0 — Signup-guard spike (docs/032). HARD GATE before D3.
 *
 * Proves, against an isolated Better Auth instance, the three obligations from
 * 030 §9.3: (1) a valid intent permits one guarded signup; (2) a plugin
 * `hooks.before` on `/sign-up/email` runs *before* Better Auth's built-in
 * `disableSignUp` short-circuit; (3) an intent-less `POST /sign-up/email` still
 * fails closed (400) once `disableSignUp` is flipped to `false`.
 *
 * Source basis (better-auth 1.6.11): `runBeforeHooks` runs and may short-circuit
 * before `endpoint(...)` executes (`dist/api/to-auth-endpoints.mjs`), and the
 * `disableSignUp` check lives *inside* the `/sign-up/email` endpoint body
 * (`dist/api/routes/sign-up.mjs`). Plugin `hooks.before` are collected into the
 * same pre-endpoint phase (`getHooks`). This test is the empirical confirmation.
 *
 * Isolated by design: it builds its own minimal Better Auth (trivial password
 * hashing, no email) so it proves the framework mechanism only. It never flips
 * `disableSignUp` on the real `get-auth.ts` instance, so production signup stays
 * closed.
 */

const ORIGIN = "https://id.spike.test";
const VALID_INTENT = "intent_ok";

/** Minimal stand-in for the future `idRegistration` before-hook guard. */
const registrationGuardSpike = (): BetterAuthPlugin => ({
  id: "registration-guard-spike",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/sign-up/email",
        handler: createAuthMiddleware(async (ctx) => {
          if (ctx.headers?.get("x-id-registration-intent") !== VALID_INTENT) {
            throw new APIError("BAD_REQUEST", {
              code: "missing_registration_intent",
              message: "Missing or invalid registration intent",
            });
          }
        }),
      },
    ],
  },
});

async function buildAuth(disableSignUp: boolean) {
  const { raw } = await createMemoryD1();
  const auth = betterAuth({
    baseURL: ORIGIN,
    basePath: "/api/auth",
    secret: "spike-secret",
    database: drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      requireEmailVerification: false,
      // Trivial reversible "hashing" — the spike proves hook ordering, not crypto.
      password: {
        hash: async (password) => `plain:${password}`,
        verify: async ({ hash, password }) => hash === `plain:${password}`,
      },
    },
    plugins: [registrationGuardSpike()],
  });
  return { auth, raw };
}

function signUp(auth: Awaited<ReturnType<typeof buildAuth>>["auth"], intent?: string): Promise<Response> {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(intent ? { "x-id-registration-intent": intent } : {}),
      },
      body: JSON.stringify({ name: "Spike User", email: "spike@example.test", password: "password12345" }),
    }),
  );
}

function userCount(raw: Awaited<ReturnType<typeof buildAuth>>["raw"], email: string): number {
  const row = raw.prepare(`select count(*) as n from "user" where "email" = ?`).get(email) as { n: number };
  return row.n;
}

describe("Track D · D0 signup-guard spike", () => {
  it("(ordering) the guard short-circuits pre-handler: intent-less signup returns the guard's 400, not BA's", async () => {
    // disableSignUp:false isolates the guard as the only gate. The 400 carries the
    // guard's own code, proving the before-hook ran and returned before the
    // endpoint body (where BA's disableSignUp/account-creation logic lives).
    const { auth, raw } = await buildAuth(false);
    const res = await signUp(auth);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "missing_registration_intent" });
    expect(userCount(raw, "spike@example.test")).toBe(0);
  });

  it("(permit) a valid intent lets exactly one guarded signup through; BA owns account creation", async () => {
    const { auth, raw } = await buildAuth(false);
    const res = await signUp(auth, VALID_INTENT);
    expect(res.status).toBe(200);
    expect(userCount(raw, "spike@example.test")).toBe(1);
  });

  it("(flag dominance) with disableSignUp:true a passing guard is still rejected by BA's in-handler check", async () => {
    // Even when the guard allows the request, the built-in check at sign-up.mjs:142
    // throws EMAIL_PASSWORD_SIGN_UP_DISABLED. Therefore guarded signup REQUIRES
    // disableSignUp:false, and when false the before-hook is the sole closure.
    const { auth, raw } = await buildAuth(true);
    const res = await signUp(auth, VALID_INTENT);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
    expect(userCount(raw, "spike@example.test")).toBe(0);
  });
});
