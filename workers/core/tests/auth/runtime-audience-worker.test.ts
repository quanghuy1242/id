import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/composition/create-app";
import type { CoreEnv } from "../../src/config/env";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";

function createKv(): KVNamespace {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  } as KVNamespace;
}

async function createEnv(): Promise<{ readonly env: CoreEnv; readonly raw: RawSqlite }> {
  const { db, raw } = await createMemoryD1();
  return {
    raw,
    env: {
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "https://id.example.test",
      ID_BOOTSTRAP_TOKEN: "bootstrap-token",
      DB: db,
      KV: createKv(),
    },
  };
}

async function bootstrap(app: ReturnType<typeof createApp>, env: CoreEnv): Promise<string> {
  const response = await app.request(
    "/api/bootstrap/admin",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer bootstrap-token" },
      body: JSON.stringify({
        email: "root@example.test",
        password: "password12345",
        name: "Root Admin",
        organization: { name: "Default", slug: "default" },
      }),
    },
    env,
  );
  expect(response.status).toBe(200);

  const signIn = await app.request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "root@example.test", password: "password12345" }),
    },
    env,
  );
  expect(signIn.status).toBe(200);
  return signIn.headers.get("set-cookie") ?? "";
}

describe("runtime resource audience integration", () => {
  it("loads resource-server audiences through createApp and rejects disabled audiences", async () => {
    const app = createApp();
    const { env, raw } = await createEnv();
    const cookie = await bootstrap(app, env);

    const organization = await app.request(
      "/api/auth/organization/create",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      },
      env,
    );
    expect(organization.status).toBe(200);
    const org = (await organization.json()) as { readonly id: string };

    const resource = await app.request(
      "/api/auth/admin/resource-servers",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          organizationId: org.id,
          slug: "content-api",
          name: "content-api",
          audience: "https://content-api.example.test",
        }),
      },
      env,
    );
    expect(resource.status).toBe(200);
    const resourceServer = (await resource.json()) as { readonly id: string };

    const scope = await app.request(
      "/api/auth/admin/oauth-scopes",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          resourceServerId: resourceServer.id,
          scope: "content:read",
        }),
      },
      env,
    );
    expect(scope.status).toBe(200);

    const client = await app.request(
      "/api/auth/oauth2/create-client",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          client_name: "content-api",
          redirect_uris: ["https://content.quanghuy.dev/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
          scope: "content:read",
        }),
      },
      env,
    );
    expect(client.status).toBe(200);
    const oauthClient = (await client.json()) as {
      readonly client_id: string;
      readonly client_secret: string;
    };
    raw.exec(`update "oauthClient" set "referenceId" = '${org.id}' where "clientId" = '${oauthClient.client_id}';`);

    const clientResourceScope = await app.request(
      "/api/auth/admin/oauth-client-resource-scopes",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          clientId: oauthClient.client_id,
          resourceServerId: resourceServer.id,
          allowedScopes: ["content:read"],
        }),
      },
      env,
    );
    expect(clientResourceScope.status).toBe(200);

    const token = await app.request(
      "/api/auth/oauth2/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: oauthClient.client_id,
          client_secret: oauthClient.client_secret,
          resource: "https://content-api.example.test",
          scope: "content:read",
        }),
      },
      env,
    );
    expect(token.status).toBe(200);
    const issued = (await token.json()) as { readonly access_token: string };
    const jwksResponse = await app.request("/api/auth/jwks", {}, env);
    const jwks = await jwksResponse.json();
    const decoded = decodeJwt(issued.access_token);
    await expect(
      jwtVerify(issued.access_token, createLocalJWKSet(jwks), {
        issuer: String(decoded.iss),
        audience: "https://content-api.example.test",
      }),
    ).resolves.toBeDefined();

    const disabled = await app.request(
      `/api/auth/admin/resource-servers/${resourceServer.id}/disable`,
      {
        method: "POST",
        headers: { cookie },
      },
      env,
    );
    expect(disabled.status).toBe(200);

    const rejected = await app.request(
      "/api/auth/oauth2/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: oauthClient.client_id,
          client_secret: oauthClient.client_secret,
          resource: "https://content-api.example.test",
          scope: "content:read",
        }),
      },
      env,
    );
    expect(rejected.status).toBe(400);
  });
});
