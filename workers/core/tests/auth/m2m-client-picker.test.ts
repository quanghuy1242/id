import { describe, expect, it } from "vitest";
import { authPluginConfig, systemResourceServerAudience } from "../../src/auth/config";
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

async function seedInfraInfrastructure() {
  const test = await createTestEnv();
  const cookie = await bootstrapAdmin(test);
  // Declare the id-system resource server with organizationId = NULL.
  const systemRsId = await createResourceServer(test, cookie, {
    organizationId: null,
    slug: authPluginConfig.systemResourceServerSlug,
    name: "id system",
    audience: SYSTEM_AUDIENCE,
  });
  await createOAuthScope(test, cookie, { resourceServerId: systemRsId, scope: authPluginConfig.systemOAuthClientPickerScope });

  // Provision the content-api infrastructure M2M client on the system layer.
  const infra = await createM2MClient(test, cookie, {
    name: "content-api infra",
    scope: authPluginConfig.systemOAuthClientPickerScope,
    referenceId: null,
  });
  const attach = await attachClientResourceScope(test, cookie, {
    clientId: infra.clientId,
    resourceServerId: systemRsId,
    allowedScopes: [authPluginConfig.systemOAuthClientPickerScope],
  });
  expect(attach.status).toBe(200);
  return { test, cookie, systemRsId, infra };
}

async function issueInfraToken(
  test: Awaited<ReturnType<typeof seedInfraInfrastructure>>["test"],
  infra: Awaited<ReturnType<typeof seedInfraInfrastructure>>["infra"],
): Promise<string> {
  const response = await tokenRequest(test, {
    clientId: infra.clientId,
    clientSecret: infra.clientSecret,
    resource: SYSTEM_AUDIENCE,
    scope: authPluginConfig.systemOAuthClientPickerScope,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly access_token: string };
  return body.access_token;
}

describe("OAuth client picker endpoint", () => {
  it("returns non-secret client metadata when the caller token has oauth:clients:read and the right audience", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();

    // Create a tenant client to look up.
    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`);
    const tenant = await createM2MClient(test, cookie, { name: "Tenant SA", scope: "openid", referenceId: "org_tenant" });

    const token = await issueInfraToken(test, infra);
    const lookup = await test.app.request(
      `/api/auth/admin/oauth-clients/lookup?client_id=${tenant.clientId}&org_id=org_tenant`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(lookup.status).toBe(200);
    const body = (await lookup.json()) as Record<string, unknown>;
    expect(body.client_id).toBe(tenant.clientId);
    expect(body.reference_id).toBe("org_tenant");
    expect(body).not.toHaveProperty("client_secret");
  });

  it("returns 404 when the caller asks for a client owned by a different organization (cross-org isolation)", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`);
    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_other', 'Other', 'other', 1700000000000);`);
    const tenant = await createM2MClient(test, cookie, { name: "Tenant SA", scope: "openid", referenceId: "org_tenant" });
    const token = await issueInfraToken(test, infra);

    const lookup = await test.app.request(
      `/api/auth/admin/oauth-clients/lookup?client_id=${tenant.clientId}&org_id=org_other`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(lookup.status).toBe(404);
  });

  it("requires an organization context for every client lookup", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`);
    const tenant = await createM2MClient(test, cookie, { name: "Tenant SA", scope: "openid", referenceId: "org_tenant" });
    const token = await issueInfraToken(test, infra);

    const lookup = await test.app.request(
      `/api/auth/admin/oauth-clients/lookup?client_id=${tenant.clientId}`,
      { headers: { authorization: `Bearer ${token}` } },
      test.env,
    );
    expect(lookup.status).toBe(400);
  });

  it("rejects callers without the oauth:clients:read scope", async () => {
    const { test, cookie } = await seedInfraInfrastructure();
    // Create a tenant client + grant unrelated scope.
    test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`);
    const rsId = await createResourceServer(test, cookie, {
      organizationId: "org_tenant",
      slug: "content-picker",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, { resourceServerId: rsId, scope: "content:read" });
    const tenant = await createM2MClient(test, cookie, { name: "Tenant SA", scope: "content:read", referenceId: "org_tenant" });
    const attached = await attachClientResourceScope(test, cookie, { clientId: tenant.clientId, resourceServerId: rsId, allowedScopes: ["content:read"] });
    expect(attached.status).toBe(200);
    const token = await tokenRequest(test, {
      clientId: tenant.clientId,
      clientSecret: tenant.clientSecret,
      resource: "https://content.example.test",
      scope: "content:read",
    });
    const tokenBody = (await token.json()) as { readonly access_token: string };

    const lookup = await test.app.request(
      `/api/auth/admin/oauth-clients/lookup?client_id=${tenant.clientId}`,
      { headers: { authorization: `Bearer ${tokenBody.access_token}` } },
      test.env,
    );
    // 401 (audience mismatch on the wrong-audience token) or 403 (scope missing on
    // the right-audience token) both satisfy "reject callers without the picker scope".
    expect([401, 403]).toContain(lookup.status);
  });
});
