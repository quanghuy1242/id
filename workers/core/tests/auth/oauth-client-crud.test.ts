import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

type RawSqlite = { readonly exec: (sql: string) => void };
type TestAuth = ReturnType<typeof betterAuth>;

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

async function createAuth(raw: RawSqlite) {
  const db = drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema });
  return betterAuth(
    getAuthOptions(
      { BETTER_AUTH_SECRET: "test-secret", BETTER_AUTH_URL: "https://id.example.test", DB: db, KV: createKv() },
      { validAudiences: [], scopes: [], scopeRows: [] },
    ),
  );
}

async function createMemoryDatabase(): Promise<RawSqlite> {
  const { default: Database } = await import("better-sqlite3") as { readonly default: new (path: string) => RawSqlite };
  const raw = new Database(":memory:");
  raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
  raw.exec(readFileSync("migrations/0002_teams_oauth_scope_catalog.sql", "utf8"));
  raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`);
  return raw;
}

async function signInSuperadmin(auth: TestAuth): Promise<string> {
  await auth.api.createUser({
    body: { name: "Admin", email: "admin@example.test", password: "password123", role: "admin", data: { emailVerified: true } },
  });
  const r = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "password123" }),
  }));
  return r.headers.get("set-cookie") ?? "";
}

describe("OAuth client management", () => {
  it("lists clients (GET returns 200)", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/get-clients", {
      method: "GET", headers: { cookie },
    }));
    expect(r.status).toBe(200);
  });

  it("rejects unauthenticated client listing", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/get-clients", {
      method: "GET",
    }));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects unauthenticated client creation", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/create-client", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Unauth", redirect_uris: ["https://app.example.test/callback"],
        token_endpoint_auth_method: "client_secret_post", grant_types: ["authorization_code"],
        response_types: ["code"], scope: "openid",
      }),
    }));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
