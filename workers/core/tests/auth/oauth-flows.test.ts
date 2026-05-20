import { readFileSync } from "node:fs";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

type RawSqlite = {
  readonly exec: (sql: string) => void;
};

type TestAuth = ReturnType<typeof betterAuth>;

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

async function createAuth(raw: RawSqlite, validAudiences: readonly string[] = []) {
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
      validAudiences,
    ),
  );
}

async function signInSuperadmin(auth: TestAuth, _raw: RawSqlite): Promise<string> {
  await auth.api.createUser({
    body: {
      name: "Root Admin",
      email: "root@example.test",
      password: "password123",
      role: "admin",
      data: { emailVerified: true },
    },
  });

  const response = await auth.handler(
    new Request("https://id.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "root@example.test",
        password: "password123",
      }),
    }),
  );

  const cookie = response.headers.get("set-cookie");
  expect(cookie).toEqual(expect.any(String));
  return cookie ?? "";
}

async function createMemoryDatabase(): Promise<RawSqlite> {
  const sqliteModuleName = "better-sqlite3";
  const { default: Database } = (await import(sqliteModuleName)) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
  raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`);
  return raw;
}

describe("OAuth Provider flows", () => {
  it("creates a confidential client through the admin endpoint and issues a resource-bound M2M JWT", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw, ["https://api.example.test"]);
    const cookie = await signInSuperadmin(auth, raw);

    const clientResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/create-client", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          client_name: "Worker API",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
          scope: "api:read",
        }),
      }),
    );

    expect(clientResponse.status).toBe(200);
    const client = (await clientResponse.json()) as {
      readonly client_id: string;
      readonly client_secret: string;
    };

    const tokenResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: client.client_id,
          client_secret: client.client_secret,
          resource: "https://api.example.test",
          scope: "api:read",
        }),
      }),
    );

    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()) as {
      readonly access_token: string;
      readonly expires_in: number;
      readonly grant_type: string;
      readonly token_type: string;
    };
    expect(token.grant_type).toBe("client_credentials");
    expect(token.token_type).toBe("Bearer");
    expect(token).toEqual(expect.objectContaining({ expires_in: 10_800 }));

    const jwksResponse = await auth.handler(new Request("https://id.example.test/api/auth/jwks"));
    const jwks = await jwksResponse.json();
    const decoded = decodeJwt(token.access_token);
    expect(decoded.iss).toBe("https://id.example.test/api/auth");
    const { payload } = await jwtVerify(
      token.access_token,
      createLocalJWKSet(jwks),
      {
        issuer: String(decoded.iss),
        audience: "https://api.example.test",
      },
    );
    expect(payload.aud).toBe("https://api.example.test");
    expect(payload.scope).toBe("api:read");
    expect(payload.sub).toBeUndefined();
  });
});
