import { describe, expect, it } from "vitest";

import {
  resolvePlatformAuthority,
  type AdminDbAdapter,
} from "../../src/auth/policies/access";

function adapterWithMemberships(
  memberships: Array<Record<string, unknown>>,
): AdminDbAdapter {
  return {
    async findMany(params) {
      return memberships.filter((membership) =>
        params.where?.every(({ field, value }) => membership[field] === value),
      );
    },
  };
}

describe("resolvePlatformAuthority", () => {
  it("allows platform admins on the system tier", async () => {
    const authority = await resolvePlatformAuthority("admin", {
      adapter: adapterWithMemberships([]),
      userId: "user_admin",
      organizationId: null,
    });

    expect(authority).toEqual({
      tier: "system",
      organizationId: null,
      allowed: true,
      grantedBy: "platform-admin",
    });
  });

  it("denies non-admin users on the system tier", async () => {
    const authority = await resolvePlatformAuthority("user", {
      adapter: adapterWithMemberships([
        { userId: "user_member", organizationId: "org_1", role: "owner" },
      ]),
      userId: "user_member",
      organizationId: undefined,
    });

    expect(authority).toEqual({
      tier: "system",
      organizationId: null,
      allowed: false,
      grantedBy: null,
    });
  });

  it("allows platform admins on organization tiers without membership lookup", async () => {
    const authority = await resolvePlatformAuthority("admin", {
      adapter: {
        async findMany() {
          throw new Error("membership lookup should be skipped");
        },
      },
      userId: "user_admin",
      organizationId: "org_1",
    });

    expect(authority).toEqual({
      tier: "organization",
      organizationId: "org_1",
      allowed: true,
      grantedBy: "platform-admin",
    });
  });

  it("allows organization owners and admins on their organization tier", async () => {
    const adapter = adapterWithMemberships([
      { userId: "user_owner", organizationId: "org_1", role: "owner" },
      { userId: "user_admin", organizationId: "org_2", role: "admin" },
    ]);

    await expect(
      resolvePlatformAuthority("user", {
        adapter,
        userId: "user_owner",
        organizationId: "org_1",
      }),
    ).resolves.toMatchObject({
      tier: "organization",
      organizationId: "org_1",
      allowed: true,
      grantedBy: "organization-admin",
    });

    await expect(
      resolvePlatformAuthority("user", {
        adapter,
        userId: "user_admin",
        organizationId: "org_2",
      }),
    ).resolves.toMatchObject({
      tier: "organization",
      organizationId: "org_2",
      allowed: true,
      grantedBy: "organization-admin",
    });
  });

  it("denies ordinary members and cross-org memberships on organization tiers", async () => {
    const adapter = adapterWithMemberships([
      { userId: "user_member", organizationId: "org_1", role: "member" },
      { userId: "user_admin", organizationId: "org_other", role: "admin" },
    ]);

    await expect(
      resolvePlatformAuthority("user", {
        adapter,
        userId: "user_member",
        organizationId: "org_1",
      }),
    ).resolves.toMatchObject({
      tier: "organization",
      organizationId: "org_1",
      allowed: false,
      grantedBy: null,
    });

    await expect(
      resolvePlatformAuthority("user", {
        adapter,
        userId: "user_admin",
        organizationId: "org_1",
      }),
    ).resolves.toMatchObject({
      tier: "organization",
      organizationId: "org_1",
      allowed: false,
      grantedBy: null,
    });
  });
});
