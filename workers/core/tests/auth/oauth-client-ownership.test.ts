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

  it("rejects ordinary members from all client management actions", async () => {
    const test = await createTestEnv();
    const adminCookie = await bootstrapAdmin(test);

    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_plain', 'Plain Org', 'plain-org', 1700000000000);`,
    );

    // Create an ordinary member and add them to org_plain.
    const createdUser = await test.app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ name: "Member", email: "member@example.test", password: "password12345" }),
      },
      test.env,
    );
    expect(createdUser.status).toBe(200);
    const member = test.raw.prepare(`select "id" from "user" where "email" = ?`).get("member@example.test") as {
      readonly id: string;
    };
    test.raw.exec(
      `update "user" set "emailVerified" = 1 where "id" = '${member.id}';
       insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_plain', 'org_plain', '${member.id}', 'member', 1700000000000);`,
    );

    // Add the admin to org_plain so they can create a client there for within-org tests.
    // Must re-sign-in so the admin session picks up the new membership.
    const adminId = test.raw.prepare(`select "id" from "user" where "role" = 'admin' limit 1`).get() as { readonly id: string };
    test.raw.exec(
      `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_admin_plain', 'org_plain', '${adminId.id}', 'owner', 1700000000000);`,
    );
    const adminSignIn = await test.app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "root@example.test", password: "password12345" }),
      },
      test.env,
    );
    expect(adminSignIn.status).toBe(200);
    const adminCookie2 = adminSignIn.headers.get("set-cookie") ?? "";

    // Admin creates a client in org_plain for within-org rejection tests.
    const adminSetActive = await test.app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie2 },
        body: JSON.stringify({ organizationId: "org_plain" }),
      },
      test.env,
    );
    expect(adminSetActive.status).toBe(200);
    const ownOrgClientResp = await test.app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie2 },
        body: JSON.stringify({
          client_name: "plain-org-client",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
        }),
      },
      test.env,
    );
    expect(ownOrgClientResp.status).toBe(200);
    const ownOrgClient = (await ownOrgClientResp.json()) as { readonly client_id: string };

    // Admin creates a client in the default org for cross-org read test.
    const defaultOrg = test.raw.prepare(`select "id" from "organization" where "slug" = 'default'`).get() as { readonly id: string };
    const defaultSetActive = await test.app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie2 },
        body: JSON.stringify({ organizationId: defaultOrg.id }),
      },
      test.env,
    );
    expect(defaultSetActive.status).toBe(200);
    const crossOrgClientResp = await test.app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie2 },
        body: JSON.stringify({
          client_name: "cross-org-client",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
        }),
      },
      test.env,
    );
    expect(crossOrgClientResp.status).toBe(200);
    const crossOrgClient = (await crossOrgClientResp.json()) as { readonly client_id: string };

    // Sign in as ordinary member.
    const signIn = await test.app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "member@example.test", password: "password12345" }),
      },
      test.env,
    );
    expect(signIn.status).toBe(200);
    const memberCookie = signIn.headers.get("set-cookie") ?? "";
    const setActive = await test.app.request(
      "/api/auth/organization/set-active",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: memberCookie },
        body: JSON.stringify({ organizationId: "org_plain" }),
      },
      test.env,
    );
    expect(setActive.status).toBe(200);

    // All client management actions are rejected for ordinary members.
    // BA 1.6.11 returns different status codes per action (401, 404);
    // the invariant is that all are rejected (status >= 400).

    const createResp = await test.app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: memberCookie },
        body: JSON.stringify({
          client_name: "should-fail",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
        }),
      },
      test.env,
    );
    expect(createResp.status).toBeGreaterThanOrEqual(400);

    const listResp = await test.app.request(
      "/api/auth/oauth2/list-clients",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: memberCookie },
        body: JSON.stringify({}),
      },
      test.env,
    );
    expect(listResp.status).toBeGreaterThanOrEqual(400);

    // Within-org: read, update, delete, rotate are all rejected.
    for (const [label, path, body] of [
      ["read", "/api/auth/oauth2/get-client", { client_id: ownOrgClient.client_id }],
      ["update", "/api/auth/oauth2/update-client", { client_id: ownOrgClient.client_id, client_name: "hacked" }],
      ["delete", "/api/auth/oauth2/delete-client", { client_id: ownOrgClient.client_id }],
      ["rotate", "/api/auth/oauth2/rotate-client-secret", { client_id: ownOrgClient.client_id }],
    ] as const) {
      const resp = await test.app.request(
        path,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie: memberCookie },
          body: JSON.stringify(body),
        },
        test.env,
      );
      expect(resp.status, `${label} should be rejected`).toBeGreaterThanOrEqual(400);
    }

    // Cross-org read: member cannot read a client in the admin's default org.
    const crossOrgReadResp = await test.app.request(
      "/api/auth/oauth2/get-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: memberCookie },
        body: JSON.stringify({ client_id: crossOrgClient.client_id }),
      },
      test.env,
    );
    expect(crossOrgReadResp.status).toBeGreaterThanOrEqual(400);
  });
});
