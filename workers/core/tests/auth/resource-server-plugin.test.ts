import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAuth } from "../../src/auth/get-auth";
import type { CoreEnv } from "../../src/config/env";

type NodeSqliteModule = {
  readonly DatabaseSync: new (path: string) => {
    exec(sql: string): void;
  };
};

function createKv(): KVNamespace {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
  } as unknown as KVNamespace;
}

describe("idResourceServer plugin endpoint", () => {
  it("creates resource server rows through Better Auth plugin endpoints", async () => {
    const sqliteModuleName = "node:sqlite";
    const { DatabaseSync } = (await import(sqliteModuleName)) as NodeSqliteModule;
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync("better-auth_migrations/0001_better_auth.sql", "utf8"));
    db.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`,
    );

    const env = {
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "https://id.example.test",
      DB: db as unknown as D1Database,
      KV: createKv(),
    } satisfies CoreEnv;
    const auth = getAuth(env);

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
