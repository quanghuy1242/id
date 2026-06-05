import { describe, expect, it } from "vitest";
import {
  authPluginConfig,
  systemResourceServerAudience,
} from "../../src/auth/config";
import {
  attachClientResourceScope,
  bootstrapAdmin,
  createM2MClient,
  createOAuthScope,
  createResourceServer,
  createTestEnv,
  tokenRequest,
} from "./m2m-helpers";
import { parseScimFilter } from "../../src/auth/plugins/scim-directory/filters";

const SCIM_BASE = "/api/auth/scim/v2";
const SCIM_CONTENT_TYPE = "application/scim+json";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_TENANT_SCHEMA = "https://id/scim/schemas/tenant-membership";

// ─── filter parser unit tests ──────────────────────────────────────────────

describe("parseScimFilter", () => {
  it("parses single id eq clause", () => {
    const result = parseScimFilter('id eq "user_123"');
    expect(result).toEqual({
      kind: "single",
      clause: { field: "id", op: "eq", value: "user_123" },
    });
  });

  it("parses single userName eq clause", () => {
    const result = parseScimFilter('userName eq "user_abc"');
    expect(result).toEqual({
      kind: "single",
      clause: { field: "userName", op: "eq", value: "user_abc" },
    });
  });

  it("parses members.value eq clause", () => {
    const result = parseScimFilter('members.value eq "user_x"');
    expect(result).toEqual({
      kind: "single",
      clause: { field: "members.value", op: "eq", value: "user_x" },
    });
  });

  it("parses compound id and members.value clause", () => {
    const result = parseScimFilter(
      'id eq "org-admins" and members.value eq "user_y"',
    );
    expect(result).toEqual({
      kind: "and",
      left: { field: "id", op: "eq", value: "org-admins" },
      right: { field: "members.value", op: "eq", value: "user_y" },
    });
  });

  it("returns null for empty filter", () => {
    expect(parseScimFilter(undefined)).toBeNull();
    expect(parseScimFilter(null)).toBeNull();
    expect(parseScimFilter("")).toBeNull();
    expect(parseScimFilter("   ")).toBeNull();
  });

  it("throws for unsupported filter field", () => {
    expect(() => parseScimFilter('email eq "a@b.com"')).toThrow(
      "Unsupported SCIM filter",
    );
  });

  it("throws for malformed filter", () => {
    expect(() => parseScimFilter("id badop value")).toThrow(
      "Unsupported SCIM filter",
    );
  });
});

// ─── integration test helpers ──────────────────────────────────────────────

async function seedScimInfrastructure() {
  const test = await createTestEnv();
  const cookie = await bootstrapAdmin(test);

  const SCIM_AUDIENCE = systemResourceServerAudience("https://id.example.test");

  // Create a resource server + scope for SCIM audience.
  const scimRsId = await createResourceServer(test, cookie, {
    organizationId: null,
    slug: "scim-directory",
    name: "SCIM Directory",
    audience: SCIM_AUDIENCE,
  });
  await createOAuthScope(test, cookie, {
    resourceServerId: scimRsId,
    scope: authPluginConfig.scimDirectoryScope,
  });

  // Provision an infra M2M client for SCIM.
  const scimClient = await createM2MClient(test, cookie, {
    name: "content-api scim",
    scope: authPluginConfig.scimDirectoryScope,
    referenceId: null,
  });
  const attach = await attachClientResourceScope(test, cookie, {
    clientId: scimClient.clientId,
    resourceServerId: scimRsId,
    allowedScopes: [authPluginConfig.scimDirectoryScope],
  });
  expect(attach.status).toBe(200);

  return { test, cookie, scimRsId, scimClient, SCIM_AUDIENCE };
}

async function issueScimToken(
  test: Awaited<ReturnType<typeof seedScimInfrastructure>>["test"],
  scimClient: Awaited<ReturnType<typeof seedScimInfrastructure>>["scimClient"],
  SCIM_AUDIENCE: string,
): Promise<string> {
  const response = await tokenRequest(test, {
    clientId: scimClient.clientId,
    clientSecret: scimClient.clientSecret,
    resource: SCIM_AUDIENCE,
    scope: authPluginConfig.scimDirectoryScope,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly access_token: string };
  return body.access_token;
}

// ─── discovery endpoints ───────────────────────────────────────────────────

describe("SCIM discovery endpoints (no auth required)", () => {
  it("GET ServiceProviderConfig returns SCIM+JSON and advertises read-only support", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/ServiceProviderConfig`,
      {},
      test.env,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.schemas).toContain(
      "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
    );
    expect((body.patch as { supported: boolean }).supported).toBe(false);
    expect((body.bulk as { supported: boolean }).supported).toBe(false);
  });

  it("GET Schemas returns User, Group, and TenantMembership schemas", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(`${SCIM_BASE}/Schemas`, {}, test.env);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
    const schemas = (await resp.json()) as Array<{ id: string }>;
    const ids = schemas.map((s) => s.id);
    expect(ids).toContain(SCIM_USER_SCHEMA);
    expect(ids).toContain(SCIM_GROUP_SCHEMA);
    expect(ids).toContain(SCIM_TENANT_SCHEMA);
  });

  it("GET ResourceTypes returns User and Group resource types", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/ResourceTypes`,
      {},
      test.env,
    );
    expect(resp.status).toBe(200);
    const types = (await resp.json()) as Array<{ id: string }>;
    expect(types.map((t) => t.id)).toContain("User");
    expect(types.map((t) => t.id)).toContain("Group");
  });
});

// ─── global user lookup ────────────────────────────────────────────────────

describe("SCIM global user lookup", () => {
  it("returns active SCIM User for existing non-banned user", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_alice','Alice','alice@example.test',1,1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_alice`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.id).toBe("user_alice");
    expect(body.userName).toBe("user_alice");
    expect(body.active).toBe(true);
    expect(body.schemas).toContain(SCIM_USER_SCHEMA);
    expect((body.meta as { resourceType: string }).resourceType).toBe("User");
  });

  it("returns active:false for banned user (not 404)", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt","banned") values ('user_banned','Banned','banned@example.test',1,1700000000000,1700000000000,1);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_banned`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { active: boolean };
    expect(body.active).toBe(false);
  });

  it("returns 404 for non-existent user", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_missing`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(404);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
    const body = (await resp.json()) as { schemas: string[]; status: string };
    expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
    expect(body.status).toBe("404");
  });

  it("returns 401 without bearer token", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_any`,
      {},
      test.env,
    );
    expect(resp.status).toBe(401);
  });

  it("filtered GET /Users?filter=id eq returns matching user as ListResponse", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_bob','Bob','bob@example.test',1,1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/Users?filter=${encodeURIComponent('id eq "user_bob"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      schemas: string[];
      totalResults: number;
      Resources: Array<{ id: string }>;
    };
    expect(body.schemas).toContain(SCIM_LIST_SCHEMA);
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe("user_bob");
  });

  it("filtered GET /Users?filter=id eq returns empty list for missing user", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/Users?filter=${encodeURIComponent('id eq "user_nobody"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { totalResults: number };
    expect(body.totalResults).toBe(0);
  });

  it("filtered GET /Users?filter=userName eq returns matching user as ListResponse", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_charlie','Charlie','charlie@example.test',1,1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/Users?filter=${encodeURIComponent('userName eq "user_charlie"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      schemas: string[];
      totalResults: number;
      Resources: Array<{ id: string; userName: string }>;
    };
    expect(body.schemas).toContain(SCIM_LIST_SCHEMA);
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe("user_charlie");
    expect(body.Resources[0].userName).toBe("user_charlie");
  });

  it("GET /Users with unsupported filter returns 400", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/Users?filter=${encodeURIComponent('email eq "a@b.com"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { scimType: string };
    expect(body.scimType).toBe("invalidFilter");
  });
});

// ─── unsupported mutation methods on /Users ────────────────────────────────

describe("SCIM /Users mutation methods return 405", () => {
  it("POST /Users returns 405 even with scim+json content-type and body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Users`,
      {
        method: "POST",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ schemas: [SCIM_USER_SCHEMA], userName: "test" }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
    const body = (await resp.json()) as { schemas: string[]; status: string };
    expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
    expect(body.status).toBe("405");
  });

  it("PUT /Users/:id returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_any`,
      {
        method: "PUT",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ schemas: [SCIM_USER_SCHEMA], userName: "test" }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("PATCH /Users/:id returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_any`,
      {
        method: "PATCH",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ Operations: [] }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("DELETE /Users/:id returns 405", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_any`,
      { method: "DELETE" },
      test.env,
    );
    expect(resp.status).toBe(405);
  });
});

// ─── tenant-scoped user lookup ─────────────────────────────────────────────

describe("SCIM tenant-scoped user lookup", () => {
  it("returns org-scoped SCIM User with tenant-membership extension", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_member','Member','member@example.test',1,1700000000000,1700000000000);`,
    );
    test.raw.exec(
      `insert into "member" ("id","organizationId","userId","role","createdAt") values ('mem_1','org_content','user_member','admin',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_content/Users/user_member`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.id).toBe("user_member");
    expect(body.active).toBe(true);
    expect(body.schemas).toContain(SCIM_TENANT_SCHEMA);
    const membership = body[SCIM_TENANT_SCHEMA] as {
      tenantId: string;
      role: string;
    };
    expect(membership.tenantId).toBe("org_content");
    expect(membership.role).toBe("admin");
  });

  it("returns 404 when user exists globally but is not a member of the org", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_external','External','ext@example.test',1,1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_content/Users/user_external`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(404);
  });

  it("returns 404 for non-existent user in org lookup", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_content/Users/user_nobody`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(404);
  });
});

// ─── unsupported mutation methods on tenant Users ──────────────────────────

describe("SCIM tenant Users mutation methods return 405", () => {
  it("POST /tenants/:orgId/Users returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Users`,
      {
        method: "POST",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ schemas: [SCIM_USER_SCHEMA], userName: "test" }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
    const body = (await resp.json()) as { schemas: string[]; status: string };
    expect(body.schemas).toContain(SCIM_ERROR_SCHEMA);
    expect(body.status).toBe("405");
  });

  it("PUT /tenants/:orgId/Users/:userId returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Users/user_any`,
      {
        method: "PUT",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ schemas: [SCIM_USER_SCHEMA], userName: "test" }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("PATCH /tenants/:orgId/Users/:userId returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Users/user_any`,
      {
        method: "PATCH",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ Operations: [] }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("DELETE /tenants/:orgId/Users/:userId returns 405", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Users/user_any`,
      { method: "DELETE" },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("POST /Bulk returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Bulk`,
      {
        method: "POST",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:BulkRequest"],
          Operations: [],
        }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
    expect(resp.headers.get("content-type")).toContain(SCIM_CONTENT_TYPE);
  });
});

// ─── tenant-scoped group lookup ────────────────────────────────────────────

describe("SCIM tenant-scoped group lookup", () => {
  it("returns SCIM Group for an existing team in the correct org", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "team" ("id","name","organizationId","createdAt","updatedAt") values ('team_editorial','Editorial','org_content',1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_content/Groups/team_editorial`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.id).toBe("team_editorial");
    expect(body.displayName).toBe("Editorial");
    expect(body.schemas).toContain(SCIM_GROUP_SCHEMA);
    expect((body.meta as { resourceType: string }).resourceType).toBe("Group");
  });

  it("returns 404 when team belongs to a different org (cross-org isolation)", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_a','OrgA','org-a',1700000000000);`,
    );
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_b','OrgB','org-b',1700000000000);`,
    );
    test.raw.exec(
      `insert into "team" ("id","name","organizationId","createdAt","updatedAt") values ('team_other','Other','org_b',1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_a/Groups/team_other`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(404);
  });

  it("returns 404 for non-existent team", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_content/Groups/team_missing`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(404);
  });

  it("returns virtual org-admins Group with owner/admin members", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_owner','Owner','owner@example.test',1,1700000000000,1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_admin','Admin','admin@example.test',1,1700000000000,1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_plain','Plain','plain@example.test',1,1700000000000,1700000000000);`,
    );
    test.raw.exec(
      `insert into "member" ("id","organizationId","userId","role","createdAt") values ('mem_o','org_content','user_owner','owner',1700000000000);`,
    );
    test.raw.exec(
      `insert into "member" ("id","organizationId","userId","role","createdAt") values ('mem_a','org_content','user_admin','admin',1700000000000);`,
    );
    test.raw.exec(
      `insert into "member" ("id","organizationId","userId","role","createdAt") values ('mem_p','org_content','user_plain','member',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_content/Groups/org-admins`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      id: string;
      displayName: string;
      members: Array<{ value: string }>;
    };
    expect(body.id).toBe("org-admins");
    expect(body.displayName).toBe("Organization Administrators");
    const memberIds = body.members.map((m) => m.value);
    expect(memberIds).toContain("user_owner");
    expect(memberIds).toContain("user_admin");
    expect(memberIds).not.toContain("user_plain");
  });

  it("org-admins Group is empty when org has no owners/admins", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_empty','Empty','empty',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_empty/Groups/org-admins`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { members: unknown[] };
    expect(body.members).toHaveLength(0);
  });
});

// ─── tenant-scoped group filter ────────────────────────────────────────────

describe("SCIM tenant-scoped group filter", () => {
  it("filter id eq teamId returns team as ListResponse", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "team" ("id","name","organizationId","createdAt","updatedAt") values ('team_editorial','Editorial','org_content',1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/tenants/org_content/Groups?filter=${encodeURIComponent('id eq "team_editorial"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      totalResults: number;
      Resources: Array<{ id: string }>;
    };
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe("team_editorial");
  });

  it("filter id eq org-admins returns virtual group as ListResponse", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/tenants/org_content/Groups?filter=${encodeURIComponent('id eq "org-admins"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      totalResults: number;
      Resources: Array<{ id: string }>;
    };
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe("org-admins");
  });

  it("compound filter id eq org-admins and members.value eq returns group when user is admin", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_admin','Admin','admin@example.test',1,1700000000000,1700000000000);`,
    );
    test.raw.exec(
      `insert into "member" ("id","organizationId","userId","role","createdAt") values ('mem_a','org_content','user_admin','admin',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const filter = 'id eq "org-admins" and members.value eq "user_admin"';
    const url = `${SCIM_BASE}/tenants/org_content/Groups?filter=${encodeURIComponent(filter)}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      totalResults: number;
      Resources: Array<{ id: string }>;
    };
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].id).toBe("org-admins");
  });

  it("compound filter returns empty list when user is not an org admin", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_plain','Plain','plain@example.test',1,1700000000000,1700000000000);`,
    );
    test.raw.exec(
      `insert into "member" ("id","organizationId","userId","role","createdAt") values ('mem_p','org_content','user_plain','member',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const filter = 'id eq "org-admins" and members.value eq "user_plain"';
    const url = `${SCIM_BASE}/tenants/org_content/Groups?filter=${encodeURIComponent(filter)}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { totalResults: number };
    expect(body.totalResults).toBe(0);
  });

  it("compound filter returns empty list when user is not even a member of the org", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    test.raw.exec(
      `insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt") values ('user_external','Ext','ext@example.test',1,1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const filter = 'id eq "org-admins" and members.value eq "user_external"';
    const url = `${SCIM_BASE}/tenants/org_content/Groups?filter=${encodeURIComponent(filter)}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { totalResults: number };
    expect(body.totalResults).toBe(0);
  });

  it("filter id eq cross-org-team returns empty list", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_a','OrgA','org-a',1700000000000);`,
    );
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_b','OrgB','org-b',1700000000000);`,
    );
    test.raw.exec(
      `insert into "team" ("id","name","organizationId","createdAt","updatedAt") values ('team_b','Team B','org_b',1700000000000,1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    // Searching in org_a for a team that belongs to org_b → empty list.
    const url = `${SCIM_BASE}/tenants/org_a/Groups?filter=${encodeURIComponent('id eq "team_b"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { totalResults: number };
    expect(body.totalResults).toBe(0);
  });

  it("unsupported filter on Groups returns 400 with invalidFilter", async () => {
    const { test, scimClient, SCIM_AUDIENCE } = await seedScimInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id","name","slug","createdAt") values ('org_content','Content','content',1700000000000);`,
    );
    const token = await issueScimToken(test, scimClient, SCIM_AUDIENCE);

    const url = `${SCIM_BASE}/tenants/org_content/Groups?filter=${encodeURIComponent('displayName eq "foo"')}`;
    const resp = await test.app.request(
      url,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { scimType: string };
    expect(body.scimType).toBe("invalidFilter");
  });
});

// ─── unsupported mutation methods on Groups ────────────────────────────────

describe("SCIM Groups mutation methods return 405", () => {
  it("POST /tenants/:orgId/Groups returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Groups`,
      {
        method: "POST",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({
          schemas: [SCIM_GROUP_SCHEMA],
          displayName: "New Group",
        }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("PUT /tenants/:orgId/Groups/:groupId returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Groups/group_y`,
      {
        method: "PUT",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({
          schemas: [SCIM_GROUP_SCHEMA],
          displayName: "Updated",
        }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("PATCH /tenants/:orgId/Groups/:groupId returns 405 with scim+json body", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Groups/group_y`,
      {
        method: "PATCH",
        headers: { "content-type": SCIM_CONTENT_TYPE },
        body: JSON.stringify({ Operations: [] }),
      },
      test.env,
    );
    expect(resp.status).toBe(405);
  });

  it("DELETE /tenants/:orgId/Groups/:groupId returns 405", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/tenants/org_x/Groups/group_y`,
      { method: "DELETE" },
      test.env,
    );
    expect(resp.status).toBe(405);
  });
});

// ─── bearer token enforcement ──────────────────────────────────────────────

describe("SCIM bearer token enforcement", () => {
  it("resource endpoints return 401 without token", async () => {
    const { test } = await seedScimInfrastructure();
    const endpoints = [
      `${SCIM_BASE}/Users/user_x`,
      `${SCIM_BASE}/tenants/org_x/Users/user_x`,
      `${SCIM_BASE}/tenants/org_x/Groups/group_x`,
      `${SCIM_BASE}/tenants/org_x/Groups`,
    ];
    for (const endpoint of endpoints) {
      const resp = await test.app.request(endpoint, {}, test.env);
      expect(resp.status, `${endpoint} should return 401`).toBe(401);
    }
  });

  it("resource endpoints return 401 with a malformed token", async () => {
    const { test } = await seedScimInfrastructure();
    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_x`,
      { headers: { authorization: "Bearer not-a-valid-jwt" } },
      test.env,
    );
    expect(resp.status).toBe(401);
  });

  it("returns 401 when caller token has the wrong audience", async () => {
    const { test, cookie } = await seedScimInfrastructure();

    // Create a client with a different audience (principal-validation).
    const otherAudience = "https://id.example.test/principal-validation";
    const otherRsId = await createResourceServer(test, cookie, {
      organizationId: null,
      slug: "other",
      name: "Other",
      audience: otherAudience,
    });
    await createOAuthScope(test, cookie, {
      resourceServerId: otherRsId,
      scope: authPluginConfig.scimDirectoryScope,
    });
    const otherClient = await createM2MClient(test, cookie, {
      name: "other client",
      scope: authPluginConfig.scimDirectoryScope,
      referenceId: null,
    });
    await attachClientResourceScope(test, cookie, {
      clientId: otherClient.clientId,
      resourceServerId: otherRsId,
      allowedScopes: [authPluginConfig.scimDirectoryScope],
    });

    const tokenResp = await tokenRequest(test, {
      clientId: otherClient.clientId,
      clientSecret: otherClient.clientSecret,
      resource: otherAudience,
      scope: authPluginConfig.scimDirectoryScope,
    });
    expect(tokenResp.status).toBe(200);
    const wrongToken = ((await tokenResp.json()) as { access_token: string })
      .access_token;

    const resp = await test.app.request(
      `${SCIM_BASE}/Users/user_x`,
      { headers: { authorization: `Bearer ${wrongToken}` } },
      test.env,
    );
    expect(resp.status).toBe(401);
  });
});
