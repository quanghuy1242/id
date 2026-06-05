import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";
import { applyAuthMigrations, type RawSqlite } from "./d1-test-helper";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import { adminActivityLogBetterAuthFields } from "../../src/auth/plugins/admin-activity-log/schema";
import { stripActivitySecrets } from "../../src/auth/plugins/admin-activity-log/operations";

const capturedEmailSender = createCapturedAuthEmailSender();
const BASE = "https://id.example.test";

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
        BETTER_AUTH_URL: BASE,
        DB: db,
        KV: createKv(),
      },
      { validAudiences: [], scopes: [], scopeRows: [] },
      { emailSender: capturedEmailSender },
    ),
  );
}

type TestAuth = Awaited<ReturnType<typeof createAuth>>;

async function createMemoryDatabase(): Promise<RawSqlite> {
  const { default: Database } = (await import("better-sqlite3")) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  applyAuthMigrations(raw);
  raw.exec(`
    insert into "organization" ("id", "name", "slug", "createdAt") values
      ('org_1', 'Acme', 'acme', 1700000000000),
      ('org_2', 'Beta', 'beta', 1700000000000);
  `);
  return raw;
}

async function signInSuperadmin(auth: TestAuth): Promise<string> {
  await auth.api.createUser({
    body: {
      name: "Admin",
      email: "admin@example.test",
      password: "password123",
      role: "admin",
      data: { emailVerified: true },
    },
  });
  const r = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "admin@example.test",
    password: "password123",
  });
  return r.headers.get("set-cookie") ?? "";
}

async function signInOrgOwner(
  raw: RawSqlite,
  auth: TestAuth,
): Promise<{ cookie: string; userId: string }> {
  const created = await auth.api.createUser({
    body: {
      name: "Org Owner",
      email: "owner@example.test",
      password: "password123",
      data: { emailVerified: true },
    },
  });
  raw.exec(
    `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('mem_owner_1', 'org_1', '${created.user.id}', 'owner', 1700000000000);`,
  );
  const r = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "owner@example.test",
    password: "password123",
  });
  return { cookie: r.headers.get("set-cookie") ?? "", userId: created.user.id };
}

describe("admin-activity-log plugin", () => {
  it("derives Better Auth fields from the canonical schema", () => {
    expect(adminActivityLogBetterAuthFields.actorId).toEqual(
      expect.objectContaining({ type: "string", required: true, index: true }),
    );
    expect(adminActivityLogBetterAuthFields.targetType).toEqual(
      expect.objectContaining({ type: "string", required: true, index: true }),
    );
    expect(adminActivityLogBetterAuthFields.organizationId).toEqual(
      expect.objectContaining({ type: "string", required: false, index: true }),
    );
    expect(adminActivityLogBetterAuthFields.steppedUp).toEqual(
      expect.objectContaining({
        type: "boolean",
        required: false,
        index: true,
      }),
    );
    expect(adminActivityLogBetterAuthFields.summary).toEqual(
      expect.objectContaining({ type: "string", required: false }),
    );
    expect(adminActivityLogBetterAuthFields.details).toEqual(
      expect.objectContaining({ type: "string", required: false }),
    );
    expect(adminActivityLogBetterAuthFields.before).toEqual(
      expect.objectContaining({ type: "string", required: false }),
    );
    expect(adminActivityLogBetterAuthFields.createdAt).toEqual(
      expect.objectContaining({ type: "number", required: true, index: true }),
    );
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

    const create = await auth.handler(
      new Request(`${BASE}/api/auth/oauth2/create-client`, {
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
      }),
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as {
      client_id: string;
      client_secret?: string;
    };
    expect(created.client_secret).toBeTruthy();

    const list = await auth.handler(
      new Request(
        `${BASE}/api/auth/admin/activity-log?targetType=oauth_client&targetId=${created.client_id}`,
        {
          method: "GET",
          headers: { cookie },
        },
      ),
    );
    expect(list.status).toBe(200);
    const text = await list.text();
    expect(text).not.toContain(created.client_secret);
    expect(text).not.toContain('"client_secret"');
    expect(text).toContain("oauth_client.create");
    expect(text).toContain(`Created OAuth client ${created.client_id}`);
  });

  it("records semantic details for user bans", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);
    const created = await auth.api.createUser({
      body: {
        name: "Banned User",
        email: "banned@example.test",
        password: "password123",
        data: { emailVerified: true },
      },
    });

    const ban = await auth.handler(
      new Request(`${BASE}/api/auth/admin/ban-user`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          userId: created.user.id,
          banReason: "Abuse report",
          banExpiresIn: 604_800,
        }),
      }),
    );
    expect(ban.status).toBe(200);

    const list = await auth.handler(
      new Request(
        `${BASE}/api/auth/admin/activity-log?targetType=user&targetId=${created.user.id}&action=user.ban`,
        {
          method: "GET",
          headers: { cookie },
        },
      ),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      entries: Array<{
        summary: string | null;
        details: Record<string, unknown> | null;
      }>;
    };
    expect(body.entries).toEqual([
      expect.objectContaining({
        summary: `Banned user ${created.user.id} 7 days: Abuse report`,
        details: expect.objectContaining({
          userId: created.user.id,
          reason: "Abuse report",
          banExpiresIn: 604_800,
        }),
      }),
    ]);
  });

  it("logs organization creation through the Better Auth organization route", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await signInSuperadmin(auth);

    const create = await auth.handler(
      new Request(`${BASE}/api/auth/organization/create`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ name: "Created Org", slug: "created-org" }),
      }),
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as { id: string };

    const list = await auth.handler(
      new Request(
        `${BASE}/api/auth/admin/activity-log?targetType=organization&targetId=${created.id}`,
        {
          method: "GET",
          headers: { cookie },
        },
      ),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      entries: Array<{
        action: string;
        targetId: string;
        actorId: string;
        scope: string | null;
        organizationId: string | null;
        actorPlatformRole: string | null;
        steppedUp: boolean | null;
        summary: string | null;
        details: Record<string, unknown> | null;
      }>;
    };
    expect(body.entries).toEqual([
      expect.objectContaining({
        action: "organization.create",
        targetId: created.id,
        actorId: expect.any(String),
        scope: "organization",
        organizationId: created.id,
        actorPlatformRole: "admin",
        steppedUp: false,
        summary: `Created organization ${created.id}`,
        details: expect.objectContaining({ organizationId: created.id }),
      }),
    ]);
  });

  it("allows org owners to read only their organization activity", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const { cookie, userId } = await signInOrgOwner(raw, auth);
    raw.exec(`
      insert into "adminActivityLog"
        ("id", "actorId", "actorType", "action", "targetType", "targetId", "scope", "organizationId", "actorOrganizationRole", "steppedUp", "createdAt")
      values
        ('act_org_1', '${userId}', 'user', 'organization.update', 'organization', 'org_1', 'organization', 'org_1', 'owner', 0, 1700000000000),
        ('act_org_2', '${userId}', 'user', 'organization.update', 'organization', 'org_2', 'organization', 'org_2', null, 0, 1700000000001);
    `);

    const own = await auth.handler(
      new Request(`${BASE}/api/auth/admin/activity-log?organizationId=org_1`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as {
      entries: Array<{ targetId: string; organizationId: string | null }>;
    };
    expect(ownBody.entries).toEqual([
      expect.objectContaining({
        targetId: "org_1",
        organizationId: "org_1",
      }),
    ]);

    const crossOrg = await auth.handler(
      new Request(`${BASE}/api/auth/admin/activity-log?organizationId=org_2`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(crossOrg.status).toBe(403);
  });
});
