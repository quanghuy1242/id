import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

function createKv(): BetterAuthKvStorage {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
  };
}

describe("idResourceServer plugin endpoint", () => {
  it("creates resource server rows through Better Auth plugin endpoints", async () => {
    const sqliteModuleName = "better-sqlite3";
    const { default: Database } = (await import(sqliteModuleName)) as {
      readonly default: new (path: string) => { exec(sql: string): void };
    };
    const raw = new Database(":memory:");
    raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
    raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`,
    );

    const db = drizzleAdapter(drizzle(raw), {
      provider: "sqlite",
      camelCase: true,
      schema: authSchema,
    });
    const auth = betterAuth(
      getAuthOptions(
        {
          BETTER_AUTH_SECRET: "test-secret",
          BETTER_AUTH_URL: "https://id.example.test",
          DB: db,
          KV: createKv(),
        },
        [],
      ),
    );

    const response = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: "org_1",
          slug: "api",
          name: "API",
          audience: "https://api.example.test",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        organizationId: "org_1",
        audience: "https://api.example.test",
        enabled: true,
      }),
    );
  });
});
