import { describe, expect, it } from "vitest";
import { bootstrapAdmin, createTestEnv } from "./m2m-helpers";

describe("OAuth client ownership via BA clientReference", () => {
  it("attaches referenceId from the active session's organization to newly created clients", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    const defaultOrg = test.raw.prepare(`select "id" from "organization" where "slug" = 'default'`).get() as { readonly id: string };
    expect(defaultOrg.id).toEqual(expect.any(String));
    const setActive = await test.app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ organizationId: defaultOrg.id }),
      },
      test.env,
    );
    expect(setActive.status).toBe(200);

    const response = await test.app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          client_name: "Default-org SA",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
        }),
      },
      test.env,
    );
    expect(response.status).toBe(200);
    const created = (await response.json()) as { readonly client_id: string };

    const row = test.raw
      .prepare(`select "referenceId" from "oauthClient" where "clientId" = ?`)
      .get(created.client_id) as { readonly referenceId: string | null };
    expect(row.referenceId).toBe(defaultOrg.id);
  });

  it("allows an organization owner without platform role to create a client in the active organization", async () => {
    const test = await createTestEnv();
    const adminCookie = await bootstrapAdmin(test);
    const createdUser = await test.app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ name: "Owner", email: "owner@example.test", password: "password12345" }),
      },
      test.env,
    );
    expect(createdUser.status).toBe(200);
    const owner = test.raw.prepare(`select "id" from "user" where "email" = ?`).get("owner@example.test") as {
      readonly id: string;
    };
    test.raw.exec(
      `update "user" set "emailVerified" = 1 where "id" = '${owner.id}';
       insert into "organization" ("id", "name", "slug", "createdAt") values ('org_owner', 'Owner Org', 'owner-org', 1700000000000);
       insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_owner', 'org_owner', '${owner.id}', 'owner', 1700000000000);`,
    );
    const signIn = await test.app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.test", password: "password12345" }),
      },
      test.env,
    );
    expect(signIn.status).toBe(200);
    const ownerCookie = signIn.headers.get("set-cookie") ?? "";
    const setActive = await test.app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ organizationId: "org_owner" }),
      },
      test.env,
    );
    expect(setActive.status).toBe(200);

    const response = await test.app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          client_name: "Owner-org SA",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
        }),
      },
      test.env,
    );
    expect(response.status).toBe(200);
    const created = (await response.json()) as { readonly client_id: string };
    const row = test.raw
      .prepare(`select "referenceId" from "oauthClient" where "clientId" = ?`)
      .get(created.client_id) as { readonly referenceId: string | null };
    expect(row.referenceId).toBe("org_owner");
  });

  it("rejects reference_id changes on client_credentials clients (D5 immutability)", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);

    const response = await test.app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          client_name: "Immutable SA",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
        }),
      },
      test.env,
    );
    expect(response.status).toBe(200);
    const created = (await response.json()) as { readonly client_id: string };
    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_target', 'T', 't', 1700000000000);`);

    const update = await test.app.request(
      "/api/auth/oauth2/update-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ client_id: created.client_id, reference_id: "org_target" }),
      },
      test.env,
    );
    expect(update.status).toBe(409);
  });
});
