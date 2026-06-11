import { describe, expect, it } from "vitest";
import { getAuth } from "../../src/auth/get-auth";
import { consoleScopeEnvelopeSchema } from "../../src/auth/plugins/console-scopes/schema";
import type { ConsoleScopeEnvelope } from "@idco/lib";
import {
  signInViaAdminOtp,
  type InspectableTestKv,
  type TestEnv,
  createTestEnv,
} from "./m2m-helpers";

type TestAuth = ReturnType<typeof getAuth>;
type SessionRow = {
  readonly token: string;
  readonly expiresAt: number;
  readonly updatedAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESHABLE_SESSION_EXPIRES_IN_MS = 5 * DAY_MS;
const STALE_SESSION_UPDATED_AT_MS = 1_700_000_100_000;

async function createVerifiedUser(
  test: TestEnv,
  auth: TestAuth,
  args: { readonly email: string; readonly role?: "admin" | "user" },
): Promise<string> {
  const created = await auth.api.createUser({
    body: {
      name: args.email,
      email: args.email,
      password: "password12345",
      ...(args.role === "admin" ? { role: "admin" } : {}),
      data: { emailVerified: true },
    },
  });
  test.raw
    .prepare(`update "user" set "emailVerified" = 1, "role" = ? where "id" = ?`)
    .run(args.role ?? "user", created.user.id);
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

async function consoleScopes(
  test: TestEnv,
  cookie: string,
): Promise<ConsoleScopeEnvelope> {
  const response = await test.app.request(
    "/api/auth/admin/console-scopes",
    { method: "GET", headers: { cookie } },
    test.env,
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<ConsoleScopeEnvelope>;
}

function latestSession(test: TestEnv): SessionRow {
  const row = test.raw
    .prepare(
      `select "token", "expiresAt", "updatedAt" from "session" order by "createdAt" desc limit 1`,
    )
    .get() as SessionRow | undefined;
  expect(row).toBeDefined();
  return row as SessionRow;
}

async function mirrorSessionRefreshWindowToKv(
  kv: InspectableTestKv,
  args: {
    readonly token: string;
    readonly expiresAt: number;
    readonly updatedAt: number;
  },
): Promise<string> {
  const cached = await kv.get(args.token);
  expect(cached).not.toBeNull();
  const payload = JSON.parse(cached ?? "{}") as {
    session?: Record<string, unknown>;
  };
  expect(payload.session).toBeDefined();
  payload.session = {
    ...payload.session,
    expiresAt: new Date(args.expiresAt).toISOString(),
    updatedAt: new Date(args.updatedAt).toISOString(),
  };
  const value = JSON.stringify(payload);
  await kv.put(args.token, value, {
    expirationTtl: Math.ceil((args.expiresAt - Date.now()) / 1000),
  });
  return value;
}

describe("id-console-scopes endpoint", () => {
  it("returns platform plus every organization scope for a platform admin", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "platform@example.test",
      role: "admin",
    });
    const ownedOrganizationId = await createOrganization(test, auth, {
      userId,
      name: "Acme Publishing",
      slug: "acme",
      role: "owner",
    });
    const otherUserId = await createVerifiedUser(test, auth, {
      email: "owner@example.test",
    });
    const otherOrganizationId = await createOrganization(test, auth, {
      userId: otherUserId,
      name: "Globex",
      slug: "globex",
      role: "owner",
    });
    const cookie = await signInViaAdminOtp(test.env, {
      email: "platform@example.test",
      password: "password12345",
    });

    const envelope = await consoleScopes(test, cookie);
    expect(() => consoleScopeEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope).toEqual({
      actor: { userId, email: "platform@example.test", canEnterConsole: true },
      scopes: [
        expect.objectContaining({
          kind: "platform",
          id: "platform",
          label: "Platform",
          role: "platform-admin",
          requiresStepUp: true,
        }),
        expect.objectContaining({
          kind: "organization",
          id: `organization:${ownedOrganizationId}`,
          organizationId: ownedOrganizationId,
          label: "Acme Publishing",
          role: "platform-admin",
          requiresStepUp: false,
        }),
        expect.objectContaining({
          kind: "organization",
          id: `organization:${otherOrganizationId}`,
          organizationId: otherOrganizationId,
          label: "Globex",
          role: "platform-admin",
          requiresStepUp: false,
        }),
      ],
      memberships: [],
      defaultScopeId: "platform",
    });
  });

  it("defaults a single-org admin directly to that organization scope", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "admin@example.test",
    });
    const organizationId = await createOrganization(test, auth, {
      userId,
      name: "Acme Publishing",
      slug: "acme",
      role: "admin",
    });
    const cookie = await signInViaAdminOtp(test.env, {
      email: "admin@example.test",
      password: "password12345",
    });

    await expect(consoleScopes(test, cookie)).resolves.toEqual({
      actor: { userId, email: "admin@example.test", canEnterConsole: true },
      scopes: [
        expect.objectContaining({
          kind: "organization",
          id: `organization:${organizationId}`,
          organizationId,
          label: "Acme Publishing",
          role: "admin",
          permissions: expect.arrayContaining([
            "members:read",
            "members:write",
            "resource-servers:read",
          ]),
        }),
      ],
      memberships: [],
      defaultScopeId: `organization:${organizationId}`,
    });
  });

  it("returns sorted operable scopes and member hints for a multi-org admin", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "multi@example.test",
    });
    const globexId = await createOrganization(test, auth, {
      userId,
      name: "Globex",
      slug: "globex",
      role: "admin",
    });
    const acmeId = await createOrganization(test, auth, {
      userId,
      name: "Acme Publishing",
      slug: "acme",
      role: "owner",
    });
    const memberOnlyId = await createOrganization(test, auth, {
      userId,
      name: "Initech",
      slug: "initech",
      role: "member",
    });
    const cookie = await signInViaAdminOtp(test.env, {
      email: "multi@example.test",
      password: "password12345",
    });

    await expect(consoleScopes(test, cookie)).resolves.toEqual({
      actor: { userId, email: "multi@example.test", canEnterConsole: true },
      scopes: [
        expect.objectContaining({
          id: `organization:${acmeId}`,
          label: "Acme Publishing",
          role: "owner",
        }),
        expect.objectContaining({
          id: `organization:${globexId}`,
          label: "Globex",
          role: "admin",
        }),
      ],
      memberships: [
        { organizationId: memberOnlyId, label: "Initech", role: "member" },
      ],
      defaultScopeId: `organization:${acmeId}`,
    });
  });

  it("returns only membership hints for an ordinary member", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "member@example.test",
    });
    const organizationId = await createOrganization(test, auth, {
      userId,
      name: "Acme Publishing",
      slug: "acme",
      role: "member",
    });
    const cookie = await signInViaAdminOtp(test.env, {
      email: "member@example.test",
      password: "password12345",
    });

    await expect(consoleScopes(test, cookie)).resolves.toEqual({
      actor: { userId, email: "member@example.test", canEnterConsole: false },
      scopes: [],
      memberships: [
        { organizationId, label: "Acme Publishing", role: "member" },
      ],
      defaultScopeId: null,
    });
  });

  it("does not refresh stale sessions during the read-only scope lookup", async () => {
    const test = await createTestEnv();
    const auth = getAuth(test.env);
    const userId = await createVerifiedUser(test, auth, {
      email: "stale-session@example.test",
      role: "admin",
    });
    await createOrganization(test, auth, {
      userId,
      name: "Acme Publishing",
      slug: "acme",
      role: "owner",
    });
    const cookie = await signInViaAdminOtp(test.env, {
      email: "stale-session@example.test",
      password: "password12345",
    });
    const session = latestSession(test);
    const staleExpiresAt = Date.now() + REFRESHABLE_SESSION_EXPIRES_IN_MS;
    test.raw
      .prepare(
        `update "session" set "expiresAt" = ?, "updatedAt" = ? where "token" = ?`,
      )
      .run(staleExpiresAt, STALE_SESSION_UPDATED_AT_MS, session.token);
    const kv = test.env.KV as InspectableTestKv;
    const cachedSessionBefore = await mirrorSessionRefreshWindowToKv(kv, {
      token: session.token,
      expiresAt: staleExpiresAt,
      updatedAt: STALE_SESSION_UPDATED_AT_MS,
    });
    const writeCountBefore = kv.operations.filter(
      (operation) => operation.kind === "put",
    ).length;

    const envelope = await consoleScopes(test, cookie);

    expect(envelope.actor).toEqual({
      userId,
      email: "stale-session@example.test",
      canEnterConsole: true,
    });
    expect(latestSession(test)).toEqual({
      token: session.token,
      expiresAt: staleExpiresAt,
      updatedAt: STALE_SESSION_UPDATED_AT_MS,
    });
    await expect(kv.get(session.token)).resolves.toBe(cachedSessionBefore);
    expect(
      kv.operations.filter((operation) => operation.kind === "put"),
    ).toHaveLength(writeCountBefore);
  });
});
