import { describe, expect, it } from "vitest";
import { authPluginConfig, systemResourceServerAudience } from "../../src/auth/config";
import { clientResourceKey } from "../../src/auth/plugins/oauth-scope-catalog/operations";
import {
  attachClientResourceScope,
  bootstrapAdmin,
  createM2MClient,
  createOAuthScope,
  createResourceServer,
  createTestEnv,
  tokenRequest,
} from "./m2m-helpers";

const SYSTEM_AUDIENCE = systemResourceServerAudience("https://id.example.test");

describe("Infrastructure M2M client D7 invariants", () => {
  it("an infrastructure client (referenceId = NULL) can obtain system-scoped tokens at the id-system audience", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);

    const systemRsId = await createResourceServer(test, cookie, {
      organizationId: null,
      slug: authPluginConfig.systemResourceServerSlug,
      name: "id system",
      audience: SYSTEM_AUDIENCE,
    });
    await createOAuthScope(test, cookie, {
      resourceServerId: systemRsId,
      scope: authPluginConfig.systemOAuthClientPickerScope,
    });

    const infra = await createM2MClient(test, cookie, {
      name: "infra",
      scope: authPluginConfig.systemOAuthClientPickerScope,
      referenceId: null,
    });
    const attach = await attachClientResourceScope(test, cookie, {
      clientId: infra.clientId,
      resourceServerId: systemRsId,
      allowedScopes: [authPluginConfig.systemOAuthClientPickerScope],
    });
    expect(attach.status).toBe(200);

    const response = await tokenRequest(test, {
      clientId: infra.clientId,
      clientSecret: infra.clientSecret,
      resource: SYSTEM_AUDIENCE,
      scope: authPluginConfig.systemOAuthClientPickerScope,
    });
    expect(response.status).toBe(200);
  });

  it("an infra client cannot obtain tenant-resource scopes (D7 invariant 1)", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);

    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_default', 'Default Org', 'org-default', 1700000000000);`);
    const tenantRsId = await createResourceServer(test, cookie, {
      organizationId: "org_default",
      slug: "content",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId: tenantRsId, scope: "content:read" });

    const infra = await createM2MClient(test, cookie, { name: "infra", scope: "content:read", referenceId: null });
    const rejectedAttach = await attachClientResourceScope(test, cookie, {
      clientId: infra.clientId,
      resourceServerId: tenantRsId,
      allowedScopes: ["content:read"],
    });
    expect(rejectedAttach.status).toBe(400);
    // Bypass the structural guard to prove token issuance also rejects a
    // corrupted cross-layer row.
    const forgedKey = clientResourceKey(infra.clientId, tenantRsId).replaceAll("'", "''");
    test.raw.exec(
      `insert into "oauthClientResourceScope" ("id", "clientId", "resourceServerId", "clientResourceKey", "allowedScopes", "enabled", "createdAt", "updatedAt") values ('crs_forged_infra', '${infra.clientId}', '${tenantRsId}', '${forgedKey}', '["content:read"]', 1, 1700000000000, 1700000000000);`,
    );
    test.raw.exec(`update "oauthClient" set "metadata" = '{"id_client_id":"${infra.clientId}"}' where "clientId" = '${infra.clientId}';`);

    const response = await tokenRequest(test, {
      clientId: infra.clientId,
      clientSecret: infra.clientSecret,
      resource: "https://content.example.test",
      scope: "content:read",
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly error?: string };
    expect(body.error).toBe("invalid_scope");
  });

  it("a tenant client cannot obtain system scopes (D7 invariant 2)", async () => {
    const test = await createTestEnv();
    const cookie = await bootstrapAdmin(test);

    const systemRsId = await createResourceServer(test, cookie, {
      organizationId: null,
      slug: authPluginConfig.systemResourceServerSlug,
      name: "id system",
      audience: SYSTEM_AUDIENCE,
    });
    await createOAuthScope(test, cookie, {
      resourceServerId: systemRsId,
      scope: authPluginConfig.systemOAuthClientPickerScope,
    });

    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`);
    const tenant = await createM2MClient(test, cookie, {
      name: "tenant",
      scope: authPluginConfig.systemOAuthClientPickerScope,
      referenceId: "org_tenant",
    });
    const rejectedAttach = await attachClientResourceScope(test, cookie, {
      clientId: tenant.clientId,
      resourceServerId: systemRsId,
      allowedScopes: [authPluginConfig.systemOAuthClientPickerScope],
    });
    expect(rejectedAttach.status).toBe(400);
    // Splice in a resource-scope row pointing at the system RS — would normally be
    // blocked by the create endpoint, so we insert directly to model a forged
    // configuration. The runtime D7 check is the defense in depth.
    const forgedKey = clientResourceKey(tenant.clientId, systemRsId).replaceAll("'", "''");
    test.raw.exec(
      `insert into "oauthClientResourceScope" ("id", "clientId", "resourceServerId", "clientResourceKey", "allowedScopes", "enabled", "createdAt", "updatedAt") values ('crs_forged', '${tenant.clientId}', '${systemRsId}', '${forgedKey}', '["${authPluginConfig.systemOAuthClientPickerScope}"]', 1, 1700000000000, 1700000000000);`,
    );
    test.raw.exec(`update "oauthClient" set "metadata" = '{"id_client_id":"${tenant.clientId}"}' where "clientId" = '${tenant.clientId}';`);

    const response = await tokenRequest(test, {
      clientId: tenant.clientId,
      clientSecret: tenant.clientSecret,
      resource: SYSTEM_AUDIENCE,
      scope: authPluginConfig.systemOAuthClientPickerScope,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly error?: string };
    expect(body.error).toBe("invalid_scope");
  });
});
