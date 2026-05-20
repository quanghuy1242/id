import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

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

describe("Better Auth rate limiting", () => {
  it("uses secondary storage for strict auth endpoint rules", async () => {
    const sqliteModuleName = "better-sqlite3";
    const { default: Database } = (await import(sqliteModuleName)) as {
      readonly default: new (path: string) => { exec: (sql: string) => void };
    };
    const raw = new Database(":memory:");
    raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
    const auth = betterAuth(
      getAuthOptions({
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema }),
        KV: createKv(),
      }),
    );

    const attempts: Response[] = [];
    for (let index = 0; index < 4; index += 1) {
      attempts.push(
        await auth.handler(
          new Request("https://id.example.test/api/auth/sign-up/email", {
            method: "POST",
            headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
            body: JSON.stringify({
              name: "Alice",
              email: "alice@example.test",
              password: "password123",
            }),
          }),
        ),
      );
    }

    expect(attempts.map((response) => response.status)).toContain(429);
  });
});
