import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import * as authSchema from "../../src/db/auth-schema";
import { applyAuthMigrations, type RawSqlite } from "./d1-test-helper";

const capturedEmailSender = createCapturedAuthEmailSender();

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

async function signInSuperadmin(auth: ReturnType<typeof betterAuth>, _raw: { exec(sql: string): void }) {
  await auth.api.createUser({
    body: {
      name: "Root Admin",
      email: "root@example.test",
      password: "password123",
      role: "admin",
      data: { emailVerified: true },
    },
  });

  const response = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "root@example.test",
    password: "password123",
  });
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toEqual(expect.any(String));
  return cookie ?? "";
}

describe("idResourceServer plugin endpoint", () => {
  it("creates resource server rows through Better Auth plugin endpoints", async () => {
    const sqliteModuleName = "better-sqlite3";
    const { default: Database } = (await import(sqliteModuleName)) as {
      readonly default: new (path: string) => RawSqlite;
    };
    const raw = new Database(":memory:");
    applyAuthMigrations(raw);
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
        { validAudiences: [], scopes: [], scopeRows: [] },
        { emailSender: capturedEmailSender },
      ),
    );
    const cookie = await signInSuperadmin(auth, raw);

    const response = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          organizationId: "org_1",
          slug: "api",
          name: "API",
          audience: "https://api.example.test",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const created = await response.json() as { readonly id: string; readonly organizationId: string; readonly audience: string; readonly enabled: boolean };
    expect(created).toEqual(
      expect.objectContaining({
        organizationId: "org_1",
        audience: "https://api.example.test",
        enabled: true,
      }),
    );

    const disable = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/resource-servers/${created.id}/disable`, {
        method: "POST",
        headers: { cookie },
      }),
    );
    expect(disable.status).toBe(200);
    await expect(disable.json()).resolves.toEqual(expect.objectContaining({ enabled: false }));

    const enable = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/resource-servers/${created.id}/enable`, {
        method: "POST",
        headers: { cookie },
      }),
    );
    expect(enable.status).toBe(200);
    await expect(enable.json()).resolves.toEqual(
      expect.objectContaining({ enabled: true, disabledAt: null, disabledBy: null }),
    );
  });

  it("filters resource server reads by platform and organization access", async () => {
    const sqliteModuleName = "better-sqlite3";
    const { default: Database } = (await import(sqliteModuleName)) as {
      readonly default: new (path: string) => RawSqlite;
    };
    const raw = new Database(":memory:");
    applyAuthMigrations(raw);
    raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_2', 'Other', 'other', 1700000000000);`,
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
        undefined,
        { emailSender: capturedEmailSender },
      ),
    );

    const owner = await auth.api.createUser({
      body: {
        name: "Owner",
        email: "owner@example.test",
        password: "password123",
        data: { emailVerified: true },
      },
    });
    const member = await auth.api.createUser({
      body: {
        name: "Member",
        email: "member@example.test",
        password: "password123",
        data: { emailVerified: true },
      },
    });
    raw.exec(
      `update "user" set "emailVerified" = 1 where "id" in ('${owner.user.id}', '${member.user.id}');`,
    );

    const organizationOne = await auth.api.createOrganization({
      body: { name: "Acme", slug: "acme", userId: owner.user.id },
    });
    const ownerMemberships = (
      raw as unknown as { prepare: (sql: string) => { all: () => Array<Record<string, unknown>> } }
    ).prepare(`select * from "member" where "userId" = '${owner.user.id}'`).all();
    expect(ownerMemberships).toEqual([expect.objectContaining({ role: "owner" })]);
    raw.exec(
      `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('m_member', '${organizationOne.id}', '${member.user.id}', 'member', 1700000000000);`,
    );
    const ownerSignIn = await adminOtpSignIn(auth, capturedEmailSender, {
      email: "owner@example.test",
      password: "password123",
    });
    expect(ownerSignIn.status).toBe(200);
    const ownerCookie = ownerSignIn.headers.get("set-cookie") ?? "";
    const ownerSession = await auth.api.getSession({ headers: new Headers({ cookie: ownerCookie }) });
    expect(ownerSession?.user.id).toBe(owner.user.id);
    const resourceOne = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          organizationId: organizationOne.id,
          slug: "api",
          name: "API",
          audience: "https://api.example.test",
        }),
      }),
    );
    expect(resourceOne.status).toBe(200);
    const createdOne = (await resourceOne.json()) as { readonly id: string };
    const adminCookie = await signInSuperadmin(auth, raw);
    const resourceTwo = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          organizationId: "org_2",
          slug: "other",
          name: "Other",
          audience: "https://other.example.test",
        }),
      }),
    );
    expect(resourceTwo.status).toBe(200);
    const createdTwo = (await resourceTwo.json()) as { readonly id: string };

    const platformScopedCrossOrgPatch = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/resource-servers/${createdTwo.id}?organizationId=${organizationOne.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ description: "cross-org update attempt" }),
      }),
    );
    expect(platformScopedCrossOrgPatch.status).toBe(404);

    const platformOrgList = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/resource-servers?organizationId=${organizationOne.id}`, {
        headers: { cookie: adminCookie },
      }),
    );
    expect(platformOrgList.status).toBe(200);
    await expect(platformOrgList.json()).resolves.toEqual({
      resourceServers: [expect.objectContaining({ id: createdOne.id, organizationId: organizationOne.id })],
    });

    const list = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({
      resourceServers: [expect.objectContaining({ id: createdOne.id })],
    });

    const crossOrg = await auth.handler(
      new Request(`https://id.example.test/api/auth/admin/resource-servers/${createdTwo.id}`, {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(crossOrg.status).toBe(404);

    const memberSignIn = await adminOtpSignIn(auth, capturedEmailSender, {
      email: "member@example.test",
      password: "password123",
    });
    expect(memberSignIn.status).toBe(200);
    const memberCookie = memberSignIn.headers.get("set-cookie") ?? "";
    const memberList = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        headers: { cookie: memberCookie },
      }),
    );
    expect(memberList.status).toBe(200);
    await expect(memberList.json()).resolves.toEqual({ resourceServers: [] });
  });
});
