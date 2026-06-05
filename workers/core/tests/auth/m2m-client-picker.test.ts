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

const SYSTEM_AUDIENCE = systemResourceServerAudience("https://id.example.test");
const CONTENT_AUDIENCE = "https://content.example.test";

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
  await createOAuthScope(test, cookie, {
    resourceServerId: systemRsId,
    scope: authPluginConfig.systemOAuthClientPickerScope,
  });

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

async function seedTenantResource(
  test: Awaited<ReturnType<typeof seedInfraInfrastructure>>["test"],
  cookie: string,
  attach = true,
) {
  test.raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`,
  );
  const resourceServerId = await createResourceServer(test, cookie, {
    organizationId: "org_tenant",
    slug: "content",
    name: "Content",
    audience: CONTENT_AUDIENCE,
  });
  await createOAuthScope(test, cookie, {
    resourceServerId,
    scope: "content:read",
  });
  const tenant = await createM2MClient(test, cookie, {
    name: "Tenant SA",
    scope: "content:read",
    referenceId: "org_tenant",
  });
  const attachment = attach
    ? await attachClientResourceScope(test, cookie, {
        clientId: tenant.clientId,
        resourceServerId,
        allowedScopes: ["content:read"],
      })
    : undefined;
  return { attachment, resourceServerId, tenant };
}

async function lookupTenantClient(
  test: Awaited<ReturnType<typeof seedInfraInfrastructure>>["test"],
  token: string,
  clientId: string,
  resource: string,
) {
  return test.app.request(
    `/api/auth/admin/oauth-clients/lookup?client_id=${clientId}&org_id=org_tenant&resource=${encodeURIComponent(resource)}`,
    { headers: { authorization: `Bearer ${token}` } },
    test.env,
  );
}

describe("OAuth client picker endpoint", () => {
  it("returns non-secret client metadata when the caller token has oauth:clients:read and the right audience", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();

    // Create a tenant client to look up.
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`,
    );
    const tenant = await createM2MClient(test, cookie, {
      name: "Tenant SA",
      scope: "openid",
      referenceId: "org_tenant",
    });

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

  it("reports enabled resource eligibility for a tenant client attachment", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    const { tenant } = await seedTenantResource(test, cookie);
    const token = await issueInfraToken(test, infra);

    const lookup = await lookupTenantClient(
      test,
      token,
      tenant.clientId,
      CONTENT_AUDIENCE,
    );
    expect(lookup.status).toBe(200);
    const body = (await lookup.json()) as Record<string, unknown>;
    expect(body.resource_access).toEqual({
      resource: CONTENT_AUDIENCE,
      status: "enabled",
    });
  });

  it("reports disabled resource eligibility for disabled attachments and resource servers", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    const { attachment, resourceServerId, tenant } = await seedTenantResource(
      test,
      cookie,
    );
    const token = await issueInfraToken(test, infra);
    if (!attachment) throw new Error("expected tenant resource attachment");
    const disableAttachment = await test.app.request(
      `/api/auth/admin/oauth-client-resource-scopes/${attachment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ enabled: false }),
      },
      test.env,
    );
    expect(disableAttachment.status).toBe(200);

    const disabledAttachmentLookup = await lookupTenantClient(
      test,
      token,
      tenant.clientId,
      CONTENT_AUDIENCE,
    );
    expect(disabledAttachmentLookup.status).toBe(200);
    expect(await disabledAttachmentLookup.json()).toEqual(
      expect.objectContaining({
        resource_access: { resource: CONTENT_AUDIENCE, status: "disabled" },
      }),
    );

    const reenableAttachment = await test.app.request(
      `/api/auth/admin/oauth-client-resource-scopes/${attachment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ enabled: true }),
      },
      test.env,
    );
    expect(reenableAttachment.status).toBe(200);
    const disableResource = await test.app.request(
      `/api/auth/admin/resource-servers/${resourceServerId}/disable`,
      { method: "POST", headers: { cookie } },
      test.env,
    );
    expect(disableResource.status).toBe(200);

    const disabledResourceLookup = await lookupTenantClient(
      test,
      token,
      tenant.clientId,
      CONTENT_AUDIENCE,
    );
    expect(disabledResourceLookup.status).toBe(200);
    expect(await disabledResourceLookup.json()).toEqual(
      expect.objectContaining({
        resource_access: { resource: CONTENT_AUDIENCE, status: "disabled" },
      }),
    );
  });

  it("returns missing resource eligibility for absent or wrong-layer attachments", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    const { tenant } = await seedTenantResource(test, cookie, false);
    const token = await issueInfraToken(test, infra);

    const missingLookup = await lookupTenantClient(
      test,
      token,
      tenant.clientId,
      CONTENT_AUDIENCE,
    );
    expect(missingLookup.status).toBe(200);
    expect(await missingLookup.json()).toEqual(
      expect.objectContaining({
        resource_access: { resource: CONTENT_AUDIENCE, status: "missing" },
      }),
    );

    const systemLookup = await lookupTenantClient(
      test,
      token,
      tenant.clientId,
      SYSTEM_AUDIENCE,
    );
    expect(systemLookup.status).toBe(200);
    expect(await systemLookup.json()).toEqual(
      expect.objectContaining({
        resource_access: { resource: SYSTEM_AUDIENCE, status: "missing" },
      }),
    );
  });

  it("does not expose resource registration from a different tenant", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`,
    );
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_other', 'Other', 'other', 1700000000000);`,
    );
    await createResourceServer(test, cookie, {
      organizationId: "org_other",
      slug: "content",
      name: "Other Content",
      audience: CONTENT_AUDIENCE,
    });
    const tenant = await createM2MClient(test, cookie, {
      name: "Tenant SA",
      scope: "openid",
      referenceId: "org_tenant",
    });
    const token = await issueInfraToken(test, infra);

    const lookup = await lookupTenantClient(
      test,
      token,
      tenant.clientId,
      CONTENT_AUDIENCE,
    );
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toEqual(
      expect.objectContaining({
        resource_access: { resource: CONTENT_AUDIENCE, status: "missing" },
      }),
    );
  });

  it("returns 404 when the caller asks for a client owned by a different organization (cross-org isolation)", async () => {
    const { test, cookie, infra } = await seedInfraInfrastructure();
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`,
    );
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_other', 'Other', 'other', 1700000000000);`,
    );
    const tenant = await createM2MClient(test, cookie, {
      name: "Tenant SA",
      scope: "openid",
      referenceId: "org_tenant",
    });
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
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`,
    );
    const tenant = await createM2MClient(test, cookie, {
      name: "Tenant SA",
      scope: "openid",
      referenceId: "org_tenant",
    });
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
    test.raw.exec(
      `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_tenant', 'Tenant', 'tenant', 1700000000000);`,
    );
    const rsId = await createResourceServer(test, cookie, {
      organizationId: "org_tenant",
      slug: "content-picker",
      name: "Content",
      audience: "https://content.example.test",
    });
    await createOAuthScope(test, cookie, {
      resourceServerId: rsId,
      scope: "content:read",
    });
    const tenant = await createM2MClient(test, cookie, {
      name: "Tenant SA",
      scope: "content:read",
      referenceId: "org_tenant",
    });
    const attached = await attachClientResourceScope(test, cookie, {
      clientId: tenant.clientId,
      resourceServerId: rsId,
      allowedScopes: ["content:read"],
    });
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
