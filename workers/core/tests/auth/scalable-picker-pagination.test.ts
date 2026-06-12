import { describe, expect, it } from "vitest";
import {
  bootstrapAdmin,
  createM2MClient,
  createOAuthScope,
  createResourceServer,
  createTestEnv,
  signInViaAdminOtp,
} from "./m2m-helpers";

async function seedOrganizations(raw: {
  readonly exec: (sql: string) => void;
}) {
  raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values
      ('org_a', 'Org A', 'org-a', 1700000000000),
      ('org_b', 'Org B', 'org-b', 1700000000000);`,
  );
}

describe("scalable picker pagination endpoints", () => {
  it("paginates resource servers after applying organization scope", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await seedOrganizations(test.raw);
    const content = await createResourceServer(test, cookie, {
      organizationId: "org_a",
      slug: "content",
      name: "Content API",
      audience: "https://content.example.test",
    });
    const other = await createResourceServer(test, cookie, {
      organizationId: "org_b",
      slug: "other",
      name: "Other API",
      audience: "https://other.example.test",
    });

    const page = await test.app.request(
      "/api/auth/admin/resource-servers?organizationId=org_a&q=Content&limit=1&offset=0",
      { headers: { cookie } },
      test.env,
    );
    expect(page.status).toBe(200);
    const pageBody = (await page.json()) as {
      readonly resourceServers: readonly { readonly id: string }[];
      readonly items: readonly { readonly id: string }[];
      readonly total: number;
      readonly limit: number;
      readonly offset: number;
    };
    expect(pageBody.resourceServers).toEqual([
      expect.objectContaining({ id: content }),
    ]);
    expect(pageBody.items).toEqual([expect.objectContaining({ id: content })]);
    expect(pageBody.total).toBe(1);
    expect(pageBody.limit).toBe(1);
    expect(pageBody.offset).toBe(0);

    const hydrated = await test.app.request(
      `/api/auth/admin/resource-servers?organizationId=org_a&ids=${content},${other}&q=Nope&limit=1`,
      { headers: { cookie } },
      test.env,
    );
    expect(hydrated.status).toBe(200);
    const body = (await hydrated.json()) as {
      readonly items: readonly { readonly id: string }[];
    };
    expect(body.items.map((row) => row.id)).toEqual([content]);
  });

  it("paginates OAuth scopes through resource-server ownership", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await seedOrganizations(test.raw);
    const content = await createResourceServer(test, cookie, {
      organizationId: "org_a",
      slug: "content",
      name: "Content API",
      audience: "https://content.example.test",
    });
    const other = await createResourceServer(test, cookie, {
      organizationId: "org_b",
      slug: "other",
      name: "Other API",
      audience: "https://other.example.test",
    });
    await createOAuthScope(test, cookie, {
      resourceServerId: content,
      scope: "content:read",
    });
    await createOAuthScope(test, cookie, {
      resourceServerId: other,
      scope: "other:read",
    });

    const page = await test.app.request(
      "/api/auth/admin/oauth-scopes?organizationId=org_a&q=content&limit=20&offset=0",
      { headers: { cookie } },
      test.env,
    );
    expect(page.status).toBe(200);
    const pageBody = (await page.json()) as {
      readonly oauthScopes: readonly {
        readonly resourceServerId: string;
        readonly scope: string;
      }[];
      readonly items: readonly {
        readonly resourceServerId: string;
        readonly scope: string;
      }[];
      readonly total: number;
      readonly limit: number;
      readonly offset: number;
    };
    expect(pageBody.oauthScopes).toEqual([
      expect.objectContaining({
        resourceServerId: content,
        scope: "content:read",
      }),
    ]);
    expect(pageBody.items).toEqual([
      expect.objectContaining({
        resourceServerId: content,
        scope: "content:read",
      }),
    ]);
    expect(pageBody.total).toBe(1);
    expect(pageBody.limit).toBe(20);
    expect(pageBody.offset).toBe(0);
  });

  it("lists OAuth clients for admin UI without leaking client secrets", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await seedOrganizations(test.raw);
    const content = await createM2MClient(test, cookie, {
      name: "Content Worker",
      scope: "openid",
      referenceId: "org_a",
    });
    await createM2MClient(test, cookie, {
      name: "Other Worker",
      scope: "openid",
      referenceId: "org_b",
    });

    const page = await test.app.request(
      "/api/auth/admin/oauth-clients?organizationId=org_a&q=Content&limit=20&offset=0",
      { headers: { cookie } },
      test.env,
    );
    expect(page.status).toBe(200);
    const body = (await page.json()) as {
      readonly items: readonly Record<string, unknown>[];
      readonly total: number;
      readonly limit: number;
      readonly offset: number;
    };
    expect(body).toEqual({
      items: [
        expect.objectContaining({
          client_id: content.clientId,
          client_name: "Content Worker",
          reference_id: "org_a",
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    expect(body.items[0]).not.toHaveProperty("client_secret");

    const hydrated = await test.app.request(
      `/api/auth/admin/oauth-clients?organizationId=org_a&ids=${content.clientId}`,
      { headers: { cookie } },
      test.env,
    );
    expect(hydrated.status).toBe(200);
    await expect(hydrated.json()).resolves.toEqual({
      items: [expect.objectContaining({ client_id: content.clientId })],
    });
  });

  it("rejects unauthenticated and non-member org-scoped OAuth client reads", async () => {
    const test = await createTestEnv();
    const adminCookie = await bootstrapAdmin(test);
    await seedOrganizations(test.raw);
    const unauthenticated = await test.app.request(
      "/api/auth/admin/oauth-clients?organizationId=org_a",
      {},
      test.env,
    );
    expect(unauthenticated.status).toBe(401);

    const createdUser = await test.app.request(
      "/api/auth/admin/create-user",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          name: "Org B Member",
          email: "org-b-member@example.test",
          password: "password12345",
        }),
      },
      test.env,
    );
    expect(createdUser.status).toBe(200);
    const member = test.raw
      .prepare(`select "id" from "user" where "email" = ?`)
      .get("org-b-member@example.test") as { readonly id: string };
    test.raw.exec(
      `update "user" set "emailVerified" = 1 where "id" = '${member.id}';
       insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_org_b', 'org_b', '${member.id}', 'member', 1700000000000);`,
    );
    const memberCookie = await signInViaAdminOtp(test.env, {
      email: "org-b-member@example.test",
      password: "password12345",
    });
    const forbidden = await test.app.request(
      "/api/auth/admin/oauth-clients?organizationId=org_a",
      { headers: { cookie: memberCookie } },
      test.env,
    );
    expect(forbidden.status).toBe(403);
  });
});
