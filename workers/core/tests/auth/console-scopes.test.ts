import { describe, expect, it } from "vitest";
import { getAuth } from "../../src/auth/get-auth";
import { consoleScopeEnvelopeSchema } from "../../src/auth/plugins/console-scopes/schema";
import type { ConsoleScopeEnvelope } from "@id/lib";
import { signInViaAdminOtp, type TestEnv, createTestEnv } from "./m2m-helpers";

type TestAuth = ReturnType<typeof getAuth>;

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
});
