import { describe, expect, it } from "vitest";
import { getAuth } from "../../src/auth/get-auth";
import { signInViaAdminOtp, type TestEnv, createTestEnv } from "./m2m-helpers";

type TestAuth = ReturnType<typeof getAuth>;

async function createVerifiedUser(
  test: TestEnv,
  auth: TestAuth,
  args: {
    readonly email: string;
    readonly role?: "admin" | "user";
    readonly name?: string;
  },
): Promise<string> {
  const created = await auth.api.createUser({
    body: {
      name: args.name ?? args.email,
      email: args.email,
      password: "password12345",
      ...(args.role === "admin" ? { role: "admin" } : {}),
      data: { emailVerified: true },
    },
  });
  test.raw
    .prepare(
      `update "user" set "emailVerified" = 1, "role" = ?, "image" = ? where "id" = ?`,
    )
    .run(
      args.role ?? "user",
      "https://img.example/avatar.png",
      created.user.id,
    );
  return created.user.id;
}

async function createOrganization(
  test: TestEnv,
  auth: TestAuth,
  args: {
    readonly userId: string;
    readonly name: string;
    readonly slug: string;
    readonly role?: "owner" | "admin" | "member";
  },
): Promise<string> {
  const organization = await auth.api.createOrganization({
    body: { name: args.name, slug: args.slug, userId: args.userId },
  });
  if (args.role && args.role !== "owner") {
    test.raw
      .prepare(
        `update "member" set "role" = ? where "organizationId" = ? and "userId" = ?`,
      )
      .run(args.role, organization.id, args.userId);
  }
  return organization.id;
}

async function signIn(test: TestEnv, email: string): Promise<string> {
  return signInViaAdminOtp(test.env, { email, password: "password12345" });
}

function seedSession(
  test: TestEnv,
  args: {
    readonly id: string;
    readonly token: string;
    readonly userId: string;
  },
): void {
  test.raw
    .prepare(
      `insert into "session" ("id","token","userId","expiresAt","createdAt","updatedAt","ipAddress","userAgent") values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.id,
      args.token,
      args.userId,
      1900000000000,
      1700000000000,
      1700000100000,
      "203.0.113.10",
      "Firefox on Linux",
    );
}

function seedConsent(
  test: TestEnv,
  args: {
    readonly id: string;
    readonly clientId: string;
    readonly userId: string;
    readonly scopes?: string;
  },
): void {
  test.raw
    .prepare(
      `insert or ignore into "oauthClient" ("id","clientId","name","uri","icon","redirectUris","createdAt","updatedAt") values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `oauth_${args.clientId}`,
      args.clientId,
      "Content App",
      "https://content.example.test",
      "https://content.example.test/icon.png",
      "[]",
      1700000000000,
      1700000000000,
    );
  test.raw
    .prepare(
      `insert into "oauthConsent" ("id","clientId","userId","scopes","createdAt","updatedAt") values (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.id,
      args.clientId,
      args.userId,
      args.scopes ?? `["openid","profile","content:read"]`,
      1700000000000,
      1700000100000,
    );
}

describe("id-account-center plugin", () => {
  it("rejects unauthenticated account-center requests", async () => {
    const test = await createTestEnv();
    const response = await test.app.request(
      "/api/auth/account/summary",
      { method: "GET" },
      test.env,
    );

    expect(response.status).toBe(401);
  });

  it("returns summary and sessions without exposing session tokens", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "person@example.test",
      name: "Person Example",
    });
    const otherUserId = await createVerifiedUser(test, auth, {
      email: "other@example.test",
    });
    await createOrganization(test, auth, {
      userId,
      name: "Acme",
      slug: "acme",
      role: "owner",
    });
    seedSession(test, {
      id: "sess_visible",
      token: "SECRET_ACCOUNT_SESSION_TOKEN",
      userId,
    });
    seedSession(test, {
      id: "sess_other",
      token: "SECRET_OTHER_USER_SESSION_TOKEN",
      userId: otherUserId,
    });
    seedConsent(test, {
      id: "cons_current",
      clientId: "client_content",
      userId,
    });
    const cookie = await signIn(test, "person@example.test");

    const summary = await test.app.request(
      "/api/auth/account/summary",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(summary.status).toBe(200);
    await expect(summary.json()).resolves.toMatchObject({
      user: {
        id: userId,
        email: "person@example.test",
        emailVerified: true,
        name: "Person Example",
        image: "https://img.example/avatar.png",
      },
      security: {
        passwordEnabled: true,
        mfaEnabled: false,
        emailVerificationRequired: true,
      },
      counts: { organizations: 1, connectedApplications: 1 },
    });

    const sessions = await test.app.request(
      "/api/auth/account/sessions",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(sessions.status).toBe(200);
    const text = await sessions.text();
    expect(text).not.toContain("SECRET_ACCOUNT_SESSION_TOKEN");
    expect(text).not.toContain("SECRET_OTHER_USER_SESSION_TOKEN");
    const body = JSON.parse(text) as {
      sessions: Array<{ id: string; current: boolean; token?: string }>;
    };
    expect(body.sessions.some((session) => session.id === "sess_visible")).toBe(
      true,
    );
    expect(body.sessions.some((session) => session.id === "sess_other")).toBe(
      false,
    );
    expect(body.sessions.every((session) => !("token" in session))).toBe(true);
    expect(body.sessions.some((session) => session.current)).toBe(true);
  });

  it("revokes only current-user sessions by id", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "person@example.test",
    });
    const otherUserId = await createVerifiedUser(test, auth, {
      email: "other@example.test",
    });
    seedSession(test, { id: "sess_visible", token: "TOKEN_VISIBLE", userId });
    seedSession(test, {
      id: "sess_other",
      token: "TOKEN_OTHER",
      userId: otherUserId,
    });
    const cookie = await signIn(test, "person@example.test");

    const revokeOwn = await test.app.request(
      "/api/auth/account/sessions/revoke",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess_visible" }),
      },
      test.env,
    );
    expect(revokeOwn.status).toBe(200);
    expect(
      test.raw
        .prepare(`select "id" from "session" where "id" = 'sess_visible'`)
        .get(),
    ).toBeUndefined();

    const revokeOther = await test.app.request(
      "/api/auth/account/sessions/revoke",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess_other" }),
      },
      test.env,
    );
    expect(revokeOther.status).toBe(404);
    expect(
      test.raw
        .prepare(`select "id" from "session" where "id" = 'sess_other'`)
        .get(),
    ).toEqual({ id: "sess_other" });
  });

  it("lists and revokes only current-user OAuth consents", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "person@example.test",
    });
    const otherUserId = await createVerifiedUser(test, auth, {
      email: "other@example.test",
    });
    seedConsent(test, {
      id: "cons_current",
      clientId: "client_content",
      userId,
    });
    seedConsent(test, {
      id: "cons_other",
      clientId: "client_content",
      userId: otherUserId,
      scopes: `["openid"]`,
    });
    const cookie = await signIn(test, "person@example.test");

    const list = await test.app.request(
      "/api/auth/account/consents",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(list.status).toBe(200);
    const listText = await list.text();
    expect(listText).not.toContain(otherUserId);
    const body = JSON.parse(listText) as {
      consents: Array<{
        id: string;
        clientName: string | null;
        scopes: string[];
      }>;
    };
    expect(body.consents).toEqual([
      expect.objectContaining({
        id: "cons_current",
        clientName: "Content App",
        scopes: ["openid", "profile", "content:read"],
      }),
    ]);

    const revoke = await test.app.request(
      "/api/auth/account/consents/revoke",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client_content" }),
      },
      test.env,
    );
    expect(revoke.status).toBe(200);
    expect(
      test.raw
        .prepare(`select "id" from "oauthConsent" where "id" = 'cons_current'`)
        .get(),
    ).toBeUndefined();
    expect(
      test.raw
        .prepare(`select "id" from "oauthConsent" where "id" = 'cons_other'`)
        .get(),
    ).toEqual({ id: "cons_other" });
  });

  it("returns membership rows, teams, and authorization-backed console links", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "person@example.test",
    });
    const adminOrg = await createOrganization(test, auth, {
      userId,
      name: "Admin Org",
      slug: "admin-org",
      role: "admin",
    });
    const memberOrg = await createOrganization(test, auth, {
      userId,
      name: "Member Org",
      slug: "member-org",
      role: "member",
    });
    test.raw
      .prepare(
        `insert into "team" ("id","name","organizationId","createdAt","updatedAt") values ('team_editors','Editors',?,1700000000000,1700000000000)`,
      )
      .run(memberOrg);
    test.raw
      .prepare(
        `insert into "teamMember" ("id","teamId","userId","createdAt") values ('tm_editors','team_editors',?,1700000000000)`,
      )
      .run(userId);
    const cookie = await signIn(test, "person@example.test");

    const response = await test.app.request(
      "/api/auth/account/organizations",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      organizations: [
        expect.objectContaining({
          id: adminOrg,
          name: "Admin Org",
          role: "admin",
          canOpenConsole: true,
          consoleHref: `/admin/orgs/${adminOrg}`,
        }),
        expect.objectContaining({
          id: memberOrg,
          name: "Member Org",
          role: "member",
          canOpenConsole: false,
          consoleHref: null,
          teams: expect.arrayContaining([
            { id: "team_editors", name: "Editors" },
          ]),
        }),
      ],
    });
  });

  it("shows all organizations as console-openable for a platform admin", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const adminId = await createVerifiedUser(test, auth, {
      email: "admin@example.test",
      role: "admin",
    });
    const memberId = await createVerifiedUser(test, auth, {
      email: "member@example.test",
    });
    const orgId = await createOrganization(test, auth, {
      userId: memberId,
      name: "Acme",
      slug: "acme",
      role: "owner",
    });
    const cookie = await signIn(test, "admin@example.test");

    const response = await test.app.request(
      "/api/auth/account/organizations",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      organizations: Array<{
        id: string;
        role: string;
        canOpenConsole: boolean;
        consoleHref: string;
      }>;
    };
    expect(adminId).toBeTruthy();
    expect(body.organizations).toContainEqual(
      expect.objectContaining({
        id: orgId,
        role: "platform-admin",
        canOpenConsole: true,
        consoleHref: `/admin/orgs/${orgId}`,
      }),
    );
  });
});
