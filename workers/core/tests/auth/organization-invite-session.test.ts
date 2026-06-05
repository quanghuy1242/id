import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import * as authSchema from "../../src/db/auth-schema";
import { applyAuthMigrations, type RawSqlite } from "./d1-test-helper";

const capturedEmailSender = createCapturedAuthEmailSender();

type TestAuth = Awaited<ReturnType<typeof createAuth>>;

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
      { emailSender: capturedEmailSender },
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

async function createAndSignInUser(
  auth: TestAuth,
  raw: RawSqlite,
  name: string,
  email: string,
): Promise<string> {
  await auth.api.createUser({
    body: {
      name,
      email,
      password: "password123",
      data: { emailVerified: true },
    },
  });
  const r = await adminOtpSignIn(auth, capturedEmailSender, {
    email,
    password: "password123",
  });
  return r.headers.get("set-cookie") ?? "";
}

describe("Organization invite", () => {
  it("creates an organization and invites a member", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await createAndSignInUser(
      auth,
      raw,
      "Owner",
      "owner@example.test",
    );

    const orgR = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/create", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "MyOrg", slug: "myorg" }),
      }),
    );
    expect(orgR.status).toBe(200);
    const org = await orgR.json<{ readonly id: string }>();

    const inviteR = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/organization/invite-member",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            organizationId: org.id,
            email: "invitee@example.test",
            role: "member",
          }),
        },
      ),
    );
    expect(inviteR.status).toBe(200);
  });

  it("accepts an organization invitation for the invited user", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const ownerCookie = await createAndSignInUser(
      auth,
      raw,
      "Owner",
      "owner@example.test",
    );

    const orgR = await auth.handler(
      new Request("https://id.example.test/api/auth/organization/create", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ name: "InviteOrg", slug: "inviteorg" }),
      }),
    );
    expect(orgR.status).toBe(200);
    const org = await orgR.json<{ readonly id: string }>();

    const inviteR = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/organization/invite-member",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie: ownerCookie },
          body: JSON.stringify({
            organizationId: org.id,
            email: "invitee@example.test",
            role: "member",
          }),
        },
      ),
    );
    expect(inviteR.status).toBe(200);
    const invite = await inviteR.json<{ readonly id: string }>();

    const inviteeCookie = await createAndSignInUser(
      auth,
      raw,
      "Invitee",
      "invitee@example.test",
    );
    const acceptR = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/organization/accept-invitation",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: inviteeCookie,
          },
          body: JSON.stringify({ invitationId: invite.id }),
        },
      ),
    );
    expect(acceptR.status).toBe(200);
    const accepted = await acceptR.json<{
      readonly invitation: { readonly status: string };
      readonly member: {
        readonly organizationId: string;
        readonly userId: string;
      };
    }>();
    expect(accepted.invitation.status).toBe("accepted");
    expect(accepted.member.organizationId).toBe(org.id);

    const member = raw
      .prepare(
        `select "id" from "member" where "organizationId" = ? and "userId" = ?`,
      )
      .get(org.id, accepted.member.userId);
    expect(member).toEqual(expect.objectContaining({ id: expect.any(String) }));
  });

  it("rejects invite from unauthenticated request", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);

    const r = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/organization/invite-member",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationId: "org_1",
            email: "invitee@example.test",
            role: "member",
          }),
        },
      ),
    );
    expect(r.status).toBeGreaterThanOrEqual(401);
  });

  it("rejects invite to nonexistent organization", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await createAndSignInUser(
      auth,
      raw,
      "User",
      "user@example.test",
    );

    const r = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/organization/invite-member",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({
            organizationId: "nonexistent_org",
            email: "invitee@example.test",
            role: "member",
          }),
        },
      ),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Session management", () => {
  it("returns active sessions for the authenticated user", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await createAndSignInUser(
      auth,
      raw,
      "Alice",
      "alice@example.test",
    );

    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/list-sessions", {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: expect.any(String) }),
      ]),
    );
  });

  it("returns 401 for session list without cookie", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);

    const r = await auth.handler(
      new Request("https://id.example.test/api/auth/list-sessions", {
        method: "GET",
      }),
    );
    expect(r.status).toBe(401);
  });

  it("revokes a specific session by token", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await createAndSignInUser(
      auth,
      raw,
      "Bob",
      "bob@example.test",
    );

    const sessionR = await auth.handler(
      new Request("https://id.example.test/api/auth/get-session", {
        headers: { cookie },
      }),
    );
    expect(sessionR.status).toBe(200);
    const sessionData = await sessionR.json<{
      readonly session?: { readonly token: string };
    }>();
    const sessionToken = sessionData?.session?.token;
    if (!sessionToken) return;

    const revokeR = await auth.handler(
      new Request("https://id.example.test/api/auth/revoke-session", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ token: sessionToken }),
      }),
    );
    expect(revokeR.status).toBe(200);
  });

  it("lists multiple sessions and removes a revoked session from subsequent listings", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    await auth.api.createUser({
      body: {
        name: "Dana",
        email: "dana@example.test",
        password: "password123",
        data: { emailVerified: true },
      },
    });

    const first = await adminOtpSignIn(
      auth,
      capturedEmailSender,
      { email: "dana@example.test", password: "password123" },
      { headers: { "user-agent": "first-browser" } },
    );
    const firstCookie = first.headers.get("set-cookie") ?? "";
    const second = await adminOtpSignIn(
      auth,
      capturedEmailSender,
      { email: "dana@example.test", password: "password123" },
      { headers: { "user-agent": "second-browser" } },
    );
    expect(second.status).toBe(200);

    const listR = await auth.handler(
      new Request("https://id.example.test/api/auth/list-sessions", {
        method: "GET",
        headers: { cookie: firstCookie },
      }),
    );
    expect(listR.status).toBe(200);
    const sessions =
      await listR.json<
        Array<{ readonly token: string; readonly userAgent?: string }>
      >();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const secondSession = sessions.find(
      (session) => session.userAgent === "second-browser",
    );
    expect(secondSession?.token).toEqual(expect.any(String));

    const revokeR = await auth.handler(
      new Request("https://id.example.test/api/auth/revoke-session", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: firstCookie },
        body: JSON.stringify({ token: secondSession?.token }),
      }),
    );
    expect(revokeR.status).toBe(200);

    const afterR = await auth.handler(
      new Request("https://id.example.test/api/auth/list-sessions", {
        method: "GET",
        headers: { cookie: firstCookie },
      }),
    );
    expect(afterR.status).toBe(200);
    const after = await afterR.json<Array<{ readonly token: string }>>();
    expect(after.map((session) => session.token)).not.toContain(
      secondSession?.token,
    );
  });

  it("removes the session cookie on sign out", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    const cookie = await createAndSignInUser(
      auth,
      raw,
      "Carol",
      "carol@example.test",
    );

    const signoutR = await auth.handler(
      new Request("https://id.example.test/api/auth/sign-out", {
        method: "POST",
        headers: { cookie },
      }),
    );
    expect(signoutR.status).toBe(200);
    expect(signoutR.headers.get("set-cookie")).toEqual(expect.any(String));
  });
});
