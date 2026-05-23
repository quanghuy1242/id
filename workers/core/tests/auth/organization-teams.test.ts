import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import * as authSchema from "../../src/db/auth-schema";

type RawStatement = {
  readonly all: () => Array<Record<string, unknown>>;
};

type RawSqlite = {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => RawStatement;
};

function createKv(): BetterAuthKvStorage {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
  };
}

async function createMemoryDatabase(): Promise<RawSqlite> {
  const sqliteModuleName = "better-sqlite3";
  const { default: Database } = (await import(sqliteModuleName)) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
  raw.exec(readFileSync("migrations/0002_teams_oauth_scope_catalog.sql", "utf8"));
  return raw;
}

async function signIn(auth: ReturnType<typeof betterAuth>, email: string): Promise<string> {
  const response = await auth.handler(
    new Request("https://id.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie") ?? "";
}

describe("Better Auth team contract", () => {
  it("creates, lists, adds, and removes teams with stable org-scoped team IDs", async () => {
    const raw = await createMemoryDatabase();
    const auth = betterAuth(
      getAuthOptions({
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema }),
        KV: createKv(),
      }),
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

    const cookie = await signIn(auth, "owner@example.test");
    const organization = await auth.api.createOrganization({
      headers: new Headers({ cookie }),
      body: { name: "Acme", slug: "acme", userId: owner.user.id },
    });
    raw.exec(
      `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('m_member', '${organization.id}', '${member.user.id}', 'member', 1700000000000);`,
    );

    const teamResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/create-team", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ organizationId: organization.id, name: "Editorial" }),
      }),
    );
    expect(teamResponse.status).toBe(200);
    const team = (await teamResponse.json()) as { readonly id: string; readonly organizationId: string };
    expect(team.organizationId).toBe(organization.id);

    const addMember = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/add-team-member", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ organizationId: organization.id, teamId: team.id, userId: member.user.id }),
      }),
    );
    expect(addMember.status).toBe(200);
    await expect(addMember.json()).resolves.toEqual(expect.objectContaining({ teamId: team.id, userId: member.user.id }));

    const addOwner = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/add-team-member", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ organizationId: organization.id, teamId: team.id, userId: owner.user.id }),
      }),
    );
    expect(addOwner.status).toBe(200);

    const teamMemberRows = raw.prepare(`select * from "teamMember" where "teamId" = '${team.id}' and "userId" = '${member.user.id}'`).all();
    expect(teamMemberRows).toEqual([expect.objectContaining({ teamId: team.id, userId: member.user.id })]);
    expect(teamMemberRows[0]).not.toHaveProperty("memberId");

    const list = await auth.handler(
      new Request(`https://id.example.test/api/auth/organization/list-team-members?teamId=${team.id}&organizationId=${organization.id}`, {
        headers: { cookie },
      }),
    );
    expect(list.status).toBe(200);

    const removeMember = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/remove-team-member", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ organizationId: organization.id, teamId: team.id, userId: member.user.id }),
      }),
    );
    expect(removeMember.status).toBe(200);
    expect(raw.prepare(`select * from "teamMember" where "teamId" = '${team.id}' and "userId" = '${member.user.id}'`).all()).toEqual([]);
  });
});
