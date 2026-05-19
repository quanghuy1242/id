import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { authPluginConfig } from "../../src/auth/config";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

type RawSqlite = {
  readonly exec: (sql: string) => void;
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

async function createMemoryDatabase(): Promise<RawSqlite> {
  const sqliteModuleName = "better-sqlite3";
  const { default: Database } = (await import(sqliteModuleName)) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
  return raw;
}

describe("Better Auth core flows", () => {
  it("signs up, stores verification/reset links, signs in, reads session, signs out, and creates owner organization", async () => {
    const raw = await createMemoryDatabase();
    const kv = createKv();
    const auth = betterAuth(
      getAuthOptions({
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema }),
        KV: kv,
      }),
    );

    const signup = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Alice",
          email: "alice@example.test",
          password: "password123",
        }),
      }),
    );
    expect(signup.status).toBe(200);
    expect(kv.values.has(`${authPluginConfig.emailVerificationStoragePrefix}alice@example.test`)).toBe(true);

    const blockedSignIn = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.test",
          password: "password123",
        }),
      }),
    );
    expect(blockedSignIn.status).toBe(403);

    raw.exec(`update "user" set "emailVerified" = 1 where "email" = 'alice@example.test';`);

    const signin = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.test",
          password: "password123",
        }),
      }),
    );
    expect(signin.status).toBe(200);
    const cookie = signin.headers.get("set-cookie");
    expect(cookie).toEqual(expect.any(String));

    const session = await auth.handler(
      new Request("https://id.example.test/api/auth/get-session", {
        headers: { cookie: cookie ?? "" },
      }),
    );
    expect(session.status).toBe(200);

    const organization = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/create", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookie ?? "" },
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      }),
    );
    expect(organization.status).toBe(200);
    await expect(organization.json()).resolves.toEqual(expect.objectContaining({ slug: "acme" }));

    const reset = await auth.handler(
      new Request("https://id.example.test/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@example.test", redirectTo: "https://app.example.test/reset" }),
      }),
    );
    expect(reset.status).toBe(200);
    expect(kv.values.has(`${authPluginConfig.passwordResetStoragePrefix}alice@example.test`)).toBe(true);

    const signout = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-out", {
        method: "POST",
        headers: { cookie: cookie ?? "" },
      }),
    );
    expect(signout.status).toBe(200);
  });
});

