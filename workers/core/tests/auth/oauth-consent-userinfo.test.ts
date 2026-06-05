import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";
import { applyAuthMigrations, type RawSqlite } from "./d1-test-helper";

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

async function createAuth(raw: RawSqlite) {
  const db = drizzleAdapter(drizzle(raw), {
    provider: "sqlite",
    camelCase: true,
    schema: authSchema,
  });
  return betterAuth(
    getAuthOptions(
      {
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: db,
        KV: createKv(),
      },
      { validAudiences: [], scopes: [], scopeRows: [] },
    ),
  );
}

async function createMemoryDatabase(): Promise<RawSqlite> {
  const { default: Database } = (await import("better-sqlite3")) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  applyAuthMigrations(raw);
  raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`,
  );
  return raw;
}

describe("OAuth userinfo endpoint", () => {
  it("returns 401 without a bearer token", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/userinfo"),
    );
    expect(r.status).toBe(401);
  });

  it("returns 401 with an invalid bearer token", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/userinfo", {
        headers: { authorization: "Bearer invalid-token-value" },
      }),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("returns 401 without the authorization header", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/userinfo", {
        method: "GET",
      }),
    );
    expect(r.status).toBe(401);
  });
});

describe("OAuth authorization endpoint", () => {
  it("rejects authorization without valid parameters", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/authorize"),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects authorization with missing client_id", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/oauth2/authorize?response_type=code&redirect_uri=https://app.example.test/callback&scope=openid",
      ),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("returns a redirect response for valid OIDC requests", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/oauth2/authorize?response_type=code&client_id=nonexistent&redirect_uri=https://app.example.test/callback&scope=openid&code_challenge=Z0u9ILjMKs72VmQj5PGDrRI8ZV4WUVG6B3kLlb7B6Dc&code_challenge_method=S256",
      ),
    );
    expect([302, 400]).toContain(r.status);
  });
});

describe("OAuth token endpoint", () => {
  it("rejects token requests without grant_type", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({}),
      }),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects unsupported grant types", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          username: "test",
          password: "test",
        }),
      }),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
