import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";
import { applyAuthMigrations } from "./d1-test-helper";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import { adminActivityLogBetterAuthFields } from "../../src/auth/plugins/admin-activity-log/schema";
import { stripActivitySecrets } from "../../src/auth/plugins/admin-activity-log/operations";

const capturedEmailSender = createCapturedAuthEmailSender();
const BASE = "https://id.example.test";

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

async function createAuth(raw: RawSqlite): Promise<TestAuth> {
  const db = drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema });
  return betterAuth(
    getAuthOptions(
      { BETTER_AUTH_SECRET: "test-secret", BETTER_AUTH_URL: BASE, DB: db, KV: createKv() },
      { validAudiences: [], scopes: [], scopeRows: [] },
      { emailSender: capturedEmailSender },
    ),
  );
}

async function createMemoryDatabase(): Promise<RawSqlite> {
  const { default: Database } = await import("better-sqlite3") as { readonly default: new (path: string) => RawSqlite };
  const raw = new Database(":memory:");
  applyAuthMigrations(raw);
  raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`);
  return raw;
}

async function signInSuperadmin(auth: TestAuth): Promise<string> {
  await auth.api.createUser({
    body: { name: "Admin", email: "admin@example.test", password: "password123", role: "admin", data: { emailVerified: true } },
  });
  const r = await adminOtpSignIn(auth, capturedEmailSender, { email: "admin@example.test", password: "password123" });
  return r.headers.get("set-cookie") ?? "";
}

describe("admin-activity-log plugin", () => {
  it("derives Better Auth fields from the canonical schema", () => {
    expect(adminActivityLogBetterAuthFields.actorId).toEqual(expect.objectContaining({ type: "string", required: true, index: true }));
    expect(adminActivityLogBetterAuthFields.targetType).toEqual(expect.objectContaining({ type: "string", required: true, index: true }));
    expect(adminActivityLogBetterAuthFields.before).toEqual(expect.objectContaining({ type: "string", required: false }));
    expect(adminActivityLogBetterAuthFields.createdAt).toEqual(expect.objectContaining({ type: "number", required: true, index: true }));
  });

  it("recursively strips secret material before persistence", () => {
    const stripped = stripActivitySecrets({
      client_id: "cli_1",
      client_secret: "secret_1",
      token_endpoint_auth_method: "client_secret_post",
      nested: {
        privateKey: "private",
        accessToken: "access",
        keep: "value",
      },
      rows: [{ refresh_token: "refresh", scope: "openid" }],
    });

    expect(stripped).toEqual({
      client_id: "cli_1",
      token_endpoint_auth_method: "client_secret_post",
      nested: { keep: "value" },
      rows: [{ scope: "openid" }],
    });
  });

  it("logs OAuth client creation without storing the returned client secret", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);

    const create = await auth.handler(new Request(`${BASE}/api/auth/oauth2/create-client`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Content API",
        redirect_uris: ["https://app.example.test/callback"],
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "openid profile",
      }),
    }));
    expect(create.status).toBe(200);
    const created = await create.json() as { client_id: string; client_secret?: string };
    expect(created.client_secret).toBeTruthy();

    const list = await auth.handler(new Request(`${BASE}/api/auth/admin/activity-log?targetType=oauth_client&targetId=${created.client_id}`, {
      method: "GET",
      headers: { cookie },
    }));
    expect(list.status).toBe(200);
    const text = await list.text();
    expect(text).not.toContain(created.client_secret);
    expect(text).not.toContain("\"client_secret\"");
    expect(text).toContain("oauth_client.create");
  });
});
