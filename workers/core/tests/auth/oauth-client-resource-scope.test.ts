import { describe, expect, it } from "vitest";
import { authPluginConfig, systemResourceServerAudience } from "../../src/auth/config";
import {
  clientResourceKey,
  resourceScopeKey,
} from "../../src/auth/plugins/oauth-scope-catalog/operations";
import {
  attachClientResourceScope,
  bootstrapAdmin,
  createM2MClient,
  createOAuthScope,
  createResourceServer,
  createTestEnv,
} from "./m2m-helpers";

const SYSTEM_AUDIENCE = systemResourceServerAudience("https://id.example.test");

async function withOrg(test: Awaited<ReturnType<typeof createTestEnv>>, id: string, slug: string): Promise<void> {
  test.raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values ('${id}', '${id}', '${slug}', 1700000000000);`,
  );
}

describe("oauthClientResourceScope CRUD + invariants", () => {
  it("enforces same-organization binding between client.referenceId and resourceServer.organizationId", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_a", "org-a");
    await withOrg(test, "org_b", "org-b");

    const resourceServerA = await createResourceServer(test, cookie, {
      organizationId: "org_a",
      slug: "content-a",
      name: "Content A",
      audience: "https://content-a.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId: resourceServerA, scope: "content:read" });

    const clientB = await createM2MClient(test, cookie, { name: "B client", scope: "content:read", referenceId: "org_b" });
    const attach = await attachClientResourceScope(test, cookie, {
      clientId: clientB.clientId,
      resourceServerId: resourceServerA,
      allowedScopes: ["content:read"],
    });
    expect(attach.status).toBe(400);
  });

  it("rejects an allowed-scope subset that exceeds the resource server's declared scopes", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });

    const client = await createM2MClient(test, cookie, { name: "C", scope: "content:read", referenceId: "org_default" });
    const attach = await attachClientResourceScope(test, cookie, {
      clientId: client.clientId,
      resourceServerId,
      allowedScopes: ["content:read", "content:write-not-declared"],
    });
    expect([400, 403]).toContain(attach.status);
  });

  it("enforces unique scope names per resource server in the database", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    const createResponse = await test.app.request(
      "/api/auth/admin/oauth-scopes",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ resourceServerId, scope: "content:read" }),
      },
      test.env,
    );
    expect(createResponse.status).toBe(200);
    expect(await createResponse.json()).not.toHaveProperty("resourceScopeKey");
    const duplicateKey = resourceScopeKey(resourceServerId, "content:read").replaceAll("'", "''");

    expect(() => test.raw.exec(
      `insert into "oauthResourceScope" ("id", "resourceServerId", "scope", "resourceScopeKey", "enabled", "createdAt", "updatedAt") values ('scope_duplicate', '${resourceServerId}', 'content:read', '${duplicateKey}', 1, 1700000000000, 1700000000000);`,
    )).toThrow(/UNIQUE constraint failed/u);
  });

  it("updates the persisted natural key when a catalog scope is renamed", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    const createResponse = await test.app.request(
      "/api/auth/admin/oauth-scopes",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ resourceServerId, scope: "content:read" }),
      },
      test.env,
    );
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { readonly id: string };

    const updateResponse = await test.app.request(
      `/api/auth/admin/oauth-scopes/${created.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ scope: "content:write" }),
      },
      test.env,
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).not.toHaveProperty("resourceScopeKey");

    const renamedKey = resourceScopeKey(resourceServerId, "content:write").replaceAll("'", "''");
    expect(() => test.raw.exec(
      `insert into "oauthResourceScope" ("id", "resourceServerId", "scope", "resourceScopeKey", "enabled", "createdAt", "updatedAt") values ('scope_renamed_duplicate', '${resourceServerId}', 'content:write', '${renamedKey}', 1, 1700000000000, 1700000000000);`,
    )).toThrow(/UNIQUE constraint failed/u);
  });

  it("rejects duplicate (clientId, resourceServerId) on second create", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });

    const client = await createM2MClient(test, cookie, { name: "C", scope: "content:read", referenceId: "org_default" });
    const first = await attachClientResourceScope(test, cookie, {
      clientId: client.clientId,
      resourceServerId,
      allowedScopes: ["content:read"],
    });
    expect(first.status).toBe(200);
    const listResponse = await test.app.request(
      "/api/auth/admin/oauth-client-resource-scopes",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { readonly oauthClientResourceScopes: readonly Record<string, unknown>[] };
    expect(listBody.oauthClientResourceScopes[0]).not.toHaveProperty("clientResourceKey");
    const dup = await attachClientResourceScope(test, cookie, {
      clientId: client.clientId,
      resourceServerId,
      allowedScopes: ["content:read"],
    });
    expect(dup.status).toBe(400);

    const duplicateKey = clientResourceKey(client.clientId, resourceServerId).replaceAll("'", "''");
    expect(() => test.raw.exec(
      `insert into "oauthClientResourceScope" ("id", "clientId", "resourceServerId", "clientResourceKey", "allowedScopes", "enabled", "createdAt", "updatedAt") values ('crs_duplicate', '${client.clientId}', '${resourceServerId}', '${duplicateKey}', '["content:read"]', 1, 1700000000000, 1700000000000);`,
    )).toThrow(/UNIQUE constraint failed/u);
  });

  it("rejects attaching an infrastructure client to a tenant resource server", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });
    const infra = await createM2MClient(test, cookie, { name: "Infra", scope: "content:read", referenceId: null });

    const attach = await attachClientResourceScope(test, cookie, {
      clientId: infra.clientId,
      resourceServerId,
      allowedScopes: ["content:read"],
    });
    expect(attach.status).toBe(400);
  });

  it("allows a platform admin to attach an infrastructure client to the system resource server", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: null,
      slug: authPluginConfig.systemResourceServerSlug,
      name: "id system",
      audience: SYSTEM_AUDIENCE,
    });
    await createOAuthScope(test, cookie, {
      resourceServerId,
      scope: authPluginConfig.systemOAuthClientPickerScope,
    });
    const infra = await createM2MClient(test, cookie, {
      name: "Infra",
      scope: authPluginConfig.systemOAuthClientPickerScope,
      referenceId: null,
    });

    const attach = await attachClientResourceScope(test, cookie, {
      clientId: infra.clientId,
      resourceServerId,
      allowedScopes: [authPluginConfig.systemOAuthClientPickerScope],
    });
    expect(attach.status).toBe(200);
  });

  it("rejects attaching a tenant client to the system resource server", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_default", "org-default");
    const resourceServerId = await createResourceServer(test, cookie, {
      organizationId: null,
      slug: authPluginConfig.systemResourceServerSlug,
      name: "id system",
      audience: SYSTEM_AUDIENCE,
    });
    await createOAuthScope(test, cookie, {
      resourceServerId,
      scope: authPluginConfig.systemOAuthClientPickerScope,
    });
    const tenant = await createM2MClient(test, cookie, {
      name: "Tenant",
      scope: authPluginConfig.systemOAuthClientPickerScope,
      referenceId: "org_default",
    });

    const attach = await attachClientResourceScope(test, cookie, {
      clientId: tenant.clientId,
      resourceServerId,
      allowedScopes: [authPluginConfig.systemOAuthClientPickerScope],
    });
    expect(attach.status).toBe(400);
  });

  it("filters scope catalog and M2M binding lists by explicit organization id", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);
    await withOrg(test, "org_a", "org-a");
    await withOrg(test, "org_b", "org-b");

    const resourceA = await createResourceServer(test, cookie, {
      organizationId: "org_a",
      slug: "content-a",
      name: "Content A",
      audience: "https://content-a.example.test",
    });
    const resourceB = await createResourceServer(test, cookie, {
      organizationId: "org_b",
      slug: "content-b",
      name: "Content B",
      audience: "https://content-b.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId: resourceA, scope: "content:read" });
    await createOAuthScope(test, cookie, { resourceServerId: resourceB, scope: "content:read" });
    const scopeB = test.raw
      .prepare(`select "id" from "oauthResourceScope" where "resourceServerId" = ? and "scope" = ?`)
      .get(resourceB, "content:read") as { readonly id: string };
    const crossOrgScopeCreate = await test.app.request(
      "/api/auth/admin/oauth-scopes?organizationId=org_a",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ resourceServerId: resourceB, scope: "content:write" }),
      },
      test.env,
    );
    expect(crossOrgScopeCreate.status).toBe(404);
    const crossOrgScopeUpdate = await test.app.request(
      `/api/auth/admin/oauth-scopes/${scopeB.id}?organizationId=org_a`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ description: "cross-org update attempt" }),
      },
      test.env,
    );
    expect(crossOrgScopeUpdate.status).toBe(404);
    const clientA = await createM2MClient(test, cookie, { name: "A client", scope: "content:read", referenceId: "org_a" });
    const clientB = await createM2MClient(test, cookie, { name: "B client", scope: "content:read", referenceId: "org_b" });
    const bindingA = await attachClientResourceScope(test, cookie, {
      clientId: clientA.clientId,
      resourceServerId: resourceA,
      allowedScopes: ["content:read"],
    });
    expect(bindingA.status).toBe(200);
    const bindingB = await attachClientResourceScope(test, cookie, {
      clientId: clientB.clientId,
      resourceServerId: resourceB,
      allowedScopes: ["content:read"],
    });
    expect(bindingB.status).toBe(200);
    const crossOrgBindingDelete = await test.app.request(
      `/api/auth/admin/oauth-client-resource-scopes/${bindingB.id}?organizationId=org_a`,
      { method: "DELETE", headers: { cookie } },
      test.env,
    );
    expect(crossOrgBindingDelete.status).toBe(404);

    const scopes = await test.app.request(
      "/api/auth/admin/oauth-scopes?organizationId=org_a",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(scopes.status).toBe(200);
    const scopesBody = (await scopes.json()) as { readonly oauthScopes: readonly { readonly resourceServerId: string }[] };
    expect(scopesBody.oauthScopes).toEqual([expect.objectContaining({ resourceServerId: resourceA })]);

    const bindings = await test.app.request(
      "/api/auth/admin/oauth-client-resource-scopes?organizationId=org_a",
      { method: "GET", headers: { cookie } },
      test.env,
    );
    expect(bindings.status).toBe(200);
    const bindingsBody = (await bindings.json()) as {
      readonly oauthClientResourceScopes: readonly { readonly id: string; readonly clientId: string; readonly resourceServerId: string }[];
    };
    expect(bindingsBody.oauthClientResourceScopes).toEqual([
      expect.objectContaining({ id: bindingA.id, clientId: clientA.clientId, resourceServerId: resourceA }),
    ]);
  });
});
