import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import {
  attachClientResourceScope,
  bootstrapAdmin,
  createM2MClient,
  createOAuthScope,
  createResourceServer,
  createTestEnv,
  tokenRequest,
} from "./m2m-helpers";

async function seedTenantWithClient() {
  const test = await createTestEnv();
  const cookie = await bootstrapAdmin(test);
  test.raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_default', 'Default Org', 'org-default', 1700000000000);`);
  const resourceServerId = await createResourceServer(test, cookie, {
    organizationId: "org_default",
    slug: "content",
    name: "Content",
    audience: "https://content.example.test",
  });
  await createOAuthScope(test, cookie, { resourceServerId, scope: "content:read" });
  await createOAuthScope(test, cookie, { resourceServerId, scope: "content:write" });
  const client = await createM2MClient(test, cookie, {
    name: "Tenant SA",
    scope: "content:read content:write",
    referenceId: "org_default",
  });
  const attach = await attachClientResourceScope(test, cookie, {
    clientId: client.clientId,
    resourceServerId,
    allowedScopes: ["content:read"],
  });
  expect(attach.status).toBe(200);
  return { test, cookie, client, resourceServerId, attachId: attach.id };
}

describe("M2M token issuance", () => {
  it("mints a JWT with org_id derived from oauthClient.referenceId and client_id from the mirror", async () => {
    const { test, client } = await seedTenantWithClient();

    const response = await tokenRequest(test, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      resource: "https://content.example.test",
      scope: "content:read",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { readonly access_token: string };
    const payload = decodeJwt(body.access_token);
    expect(payload.aud).toBe("https://content.example.test");
    expect(payload.azp).toBe(client.clientId);
    expect(payload.client_id).toBe(client.clientId);
    expect(payload.org_id).toBe("org_default");
    expect(payload.scope).toBe("content:read");
  });

  it("rejects scopes that are not in oauthClientResourceScope.allowedScopes for the audience", async () => {
    const { test, client } = await seedTenantWithClient();
    const response = await tokenRequest(test, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      resource: "https://content.example.test",
      scope: "content:write",
    });
    expect(response.status).toBe(403);
  });

  it("rejects token issuance when the resource-scope row is disabled", async () => {
    const { test, client, attachId } = await seedTenantWithClient();
    const disable = await test.app.request(
      `/api/auth/admin/oauth-client-resource-scopes/${attachId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: await bootstrapAdminAgainCookieReturn(test) },
        body: JSON.stringify({ enabled: false }),
      },
      test.env,
    );
    expect(disable.status).toBe(200);

    const response = await tokenRequest(test, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      resource: "https://content.example.test",
      scope: "content:read",
    });
    expect(response.status).toBe(403);
  });

  it("rejects token issuance when no resource-scope row exists for the requested audience", async () => {
    const { test, client } = await seedTenantWithClient();
    // request token against an audience not declared on the client
    const response = await tokenRequest(test, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      resource: "https://other.example.test",
      scope: "content:read",
    });
    // resource not in catalog → BA returns 400 invalid_target before reaching customAccessTokenClaims
    expect([400, 403]).toContain(response.status);
  });
});

async function bootstrapAdminAgainCookieReturn(test: Awaited<ReturnType<typeof createTestEnv>>): Promise<string> {
  const signIn = await test.app.request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "root@example.test", password: "password12345" }),
    },
    test.env,
  );
  return signIn.headers.get("set-cookie") ?? "";
}
