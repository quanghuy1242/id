import { describe, expect, it } from "vitest";
import { authorizeAdminAction, type AdminActor } from "../../src/application/admin/authorization";

const platformAdmin: AdminActor = {
  userId: "user_platform_admin",
  platformRole: "admin",
  organizations: [],
};

const owner: AdminActor = {
  userId: "user_owner",
  platformRole: "user",
  organizations: [{ organizationId: "org_1", role: "owner" }],
};

const orgAdmin: AdminActor = {
  userId: "user_org_admin",
  platformRole: "user",
  organizations: [{ organizationId: "org_1", role: "admin" }],
};

const member: AdminActor = {
  userId: "user_member",
  platformRole: "user",
  organizations: [{ organizationId: "org_1", role: "member" }],
};

describe("admin authorization model", () => {
  it("allows platform admin to perform platform-wide admin operations", () => {
    expect(authorizeAdminAction(platformAdmin, "listAnyOrganization")).toEqual({ allowed: true });
    expect(authorizeAdminAction(platformAdmin, "mutateAnyOrganization", "org_1")).toEqual({ allowed: true });
  });

  it("allows organization owner to manage only their own organization", () => {
    expect(authorizeAdminAction(owner, "manageOwnOrganization", "org_1")).toEqual({ allowed: true });
    expect(authorizeAdminAction(owner, "manageOwnOrganization", "org_2")).toEqual({
      allowed: false,
      status: 403,
      reason: "Organization owner role required",
    });
  });

  it("allows organization admin only delegated own-organization actions", () => {
    expect(authorizeAdminAction(orgAdmin, "delegateOwnOrganization", "org_1")).toEqual({ allowed: true });
    expect(authorizeAdminAction(orgAdmin, "manageOwnOrganization", "org_1")).toEqual({
      allowed: false,
      status: 403,
      reason: "Organization owner role required",
    });
  });

  it("rejects members and unauthenticated users", () => {
    expect(authorizeAdminAction(member, "delegateOwnOrganization", "org_1")).toEqual({
      allowed: false,
      status: 403,
      reason: "Organization owner or admin role required",
    });
    expect(authorizeAdminAction(null, "listAnyOrganization")).toEqual({
      allowed: false,
      status: 401,
      reason: "Authentication required",
    });
  });
});
