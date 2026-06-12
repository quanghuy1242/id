import { describe, expect, it } from "vitest";
import { getAuth } from "../../src/auth/get-auth";
import {
  bootstrapAdmin,
  createTestEnv,
  signInViaAdminOtp,
} from "./m2m-helpers";

async function createVerifiedUser(
  test: Awaited<ReturnType<typeof createTestEnv>>,
  args: { readonly email: string; readonly role?: "admin" | "user" },
): Promise<string> {
  const auth = getAuth(test.env);
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

describe("idAdminDelegation plugin", () => {
  it("creates delegated roles and bindings through Better Auth plugin endpoints", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);

    const roleResponse = await test.app.request(
      "/api/auth/admin/delegation/roles",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          slug: "registration-manager",
          label: "Registration Manager",
          description: "Manage registration policy for one organization",
          permissions: ["members:write"],
        }),
      },
      test.env,
    );
    expect(roleResponse.status).toBe(200);
    const role = (await roleResponse.json()) as {
      readonly id: string;
      readonly slug: string;
      readonly permissions: readonly string[];
    };
    expect(role).toEqual(
      expect.objectContaining({
        slug: "registration-manager",
        permissions: ["members:write"],
      }),
    );

    const principalId = await createVerifiedUser(test, {
      email: "delegate@example.test",
    });
    const bindingResponse = await test.app.request(
      "/api/auth/admin/delegation/bindings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          principalType: "user",
          principalId,
          roleId: role.id,
          scope: "organization:org_delegate",
        }),
      },
      test.env,
    );
    expect(bindingResponse.status).toBe(200);
    const binding = (await bindingResponse.json()) as {
      readonly id: string;
      readonly principalId: string;
      readonly roleId: string;
      readonly scope: string;
    };
    expect(binding).toEqual(
      expect.objectContaining({
        principalId,
        roleId: role.id,
        scope: "organization:org_delegate",
      }),
    );

    const duplicate = await test.app.request(
      "/api/auth/admin/delegation/bindings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          principalType: "user",
          principalId,
          roleId: role.id,
          scope: "organization:org_delegate",
        }),
      },
      test.env,
    );
    expect(duplicate.status).toBe(400);

    const listResponse = await test.app.request(
      "/api/auth/admin/delegation/roles",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      roles: [expect.objectContaining({ id: role.id })],
    });
  });

  it("rejects delegated-admin management for non-platform admins", async () => {
    const test = await createTestEnv();
    await createVerifiedUser(test, { email: "user@example.test" });
    const cookie = await signInViaAdminOtp(test.env, {
      email: "user@example.test",
      password: "password12345",
    });

    const response = await test.app.request(
      "/api/auth/admin/delegation/roles",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(response.status).toBe(403);
  });
});
