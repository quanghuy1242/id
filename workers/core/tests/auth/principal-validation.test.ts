import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { authPluginConfig } from "../../src/auth/config";
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

async function createResourceScope(
  app: ReturnType<typeof createApp>,
  env: CoreEnv,
  cookie: string,
  organizationId: string,
  audience: string,
  scope: string,
): Promise<string> {
  const resource = await app.request(
    "/api/auth/admin/resource-servers",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        organizationId,
        slug: scope.replaceAll(":", "-"),
        name: scope,
        audience,
      }),
    },
    env,
  );
  expect(resource.status).toBe(200);
  const resourceServer = (await resource.json()) as { readonly id: string };

  const createdScope = await app.request(
    "/api/auth/admin/oauth-scopes",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ resourceServerId: resourceServer.id, scope }),
    },
    env,
  );
  expect(createdScope.status).toBe(200);
  return resourceServer.id;
}

async function createM2mClient(
  app: ReturnType<typeof createApp>,
  env: CoreEnv,
  cookie: string,
  scope: string,
  extraBody: Record<string, unknown> = {},
): Promise<{ readonly clientId: string; readonly clientSecret: string }> {
  const response = await app.request(
    "/api/auth/oauth2/create-client",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        client_name: scope,
        redirect_uris: ["https://client.example.test/callback"],
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["client_credentials"],
        response_types: ["code"],
        scope,
        ...extraBody,
      }),
    },
    env,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly client_id: string; readonly client_secret: string };
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

async function issueM2mToken(
  app: ReturnType<typeof createApp>,
  env: CoreEnv,
  client: { readonly clientId: string; readonly clientSecret: string },
  resource: string,
  scope: string,
): Promise<string> {
  const response = await app.request(
    "/api/auth/oauth2/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: client.clientId,
        client_secret: client.clientSecret,
        resource,
        scope,
      }),
    },
    env,
  );
  expect(response.status).toBe(200);
  const token = (await response.json()) as { readonly access_token: string };
  return token.access_token;
}

describe("principal validation API", () => {
  it("requires a dedicated M2M audience/scope and validates exact identity principals", async () => {
    const app = createApp();
    const { env, raw } = await createEnv();
    const cookie = await bootstrap(app, env);
    const validationAudience = "https://id.example.test/principal-validation";
    raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_content', 'Content', 'content', 1700000000000);`);
    raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_other', 'Other', 'other', 1700000000000);`);
    raw.exec(
      `insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") values ('user_external', 'External', 'external@example.test', 1, 1700000000000, 1700000000000);`,
    );
    raw.exec(
      `insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") values ('user_member', 'Member', 'member@example.test', 1, 1700000000000, 1700000000000);`,
    );
    raw.exec(
      `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_1', 'org_content', 'user_member', 'admin', 1700000000000);`,
    );
    raw.exec(
      `insert into "team" ("id", "name", "organizationId", "createdAt", "updatedAt") values ('team_editorial', 'Editorial', 'org_content', 1700000000000, 1700000000000);`,
    );
    raw.exec(
      `insert into "team" ("id", "name", "organizationId", "createdAt", "updatedAt") values ('team_other', 'Other', 'org_other', 1700000000000, 1700000000000);`,
    );

    const validationResourceServerId = await createResourceScope(
      app,
      env,
      cookie,
      "org_content",
      validationAudience,
      authPluginConfig.principalValidationScope,
    );
    const contentResourceServerId = await createResourceScope(
      app,
      env,
      cookie,
      "org_content",
      "https://content-api.example.test",
      "content:write",
    );

    const integrationClient = await createM2mClient(app, env, cookie, authPluginConfig.principalValidationScope);
    raw.exec(`update "oauthClient" set "referenceId" = 'org_content' where "clientId" = '${integrationClient.clientId}';`);
    const validationGrant = await app.request(
      "/api/auth/admin/oauth-client-resource-scopes",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          clientId: integrationClient.clientId,
          resourceServerId: validationResourceServerId,
          allowedScopes: [authPluginConfig.principalValidationScope],
        }),
      },
      env,
    );
    expect(validationGrant.status).toBe(200);
    const validationToken = await issueM2mToken(
      app,
      env,
      integrationClient,
      validationAudience,
      authPluginConfig.principalValidationScope,
    );

    const targetClient = await createM2mClient(app, env, cookie, "content:write");
    raw.exec(`update "oauthClient" set "referenceId" = 'org_content' where "clientId" = '${targetClient.clientId}';`);
    const grant = await app.request(
      "/api/auth/admin/oauth-client-resource-scopes",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          clientId: targetClient.clientId,
          resourceServerId: contentResourceServerId,
          allowedScopes: ["content:write"],
        }),
      },
      env,
    );
    expect(grant.status).toBe(200);

    const headers = { "content-type": "application/json", authorization: `Bearer ${validationToken}` };
    const externalUser = await app.request(
      "/api/auth/principal-validation/users/validate",
      { method: "POST", headers, body: JSON.stringify({ userId: "user_external" }) },
      env,
    );
    expect(externalUser.status).toBe(200);

    const sensitiveUser = await app.request(
      "/api/auth/principal-validation/users/validate-organization-member",
      { method: "POST", headers, body: JSON.stringify({ userId: "user_external", organizationId: "org_content" }) },
      env,
    );
    expect(sensitiveUser.status).toBe(404);

    const nonexistentUser = await app.request(
      "/api/auth/principal-validation/users/validate",
      { method: "POST", headers, body: JSON.stringify({ userId: "user_missing" }) },
      env,
    );
    expect(nonexistentUser.status).toBe(404);

    const memberUser = await app.request(
      "/api/auth/principal-validation/users/validate-organization-member",
      { method: "POST", headers, body: JSON.stringify({ userId: "user_member", organizationId: "org_content" }) },
      env,
    );
    expect(memberUser.status).toBe(200);

    const team = await app.request(
      "/api/auth/principal-validation/teams/validate-organization-team",
      { method: "POST", headers, body: JSON.stringify({ teamId: "team_editorial", organizationId: "org_content" }) },
      env,
    );
    expect(team.status).toBe(200);

    const crossOrgTeam = await app.request(
      "/api/auth/principal-validation/teams/validate-organization-team",
      { method: "POST", headers, body: JSON.stringify({ teamId: "team_other", organizationId: "org_content" }) },
      env,
    );
    expect(crossOrgTeam.status).toBe(404);

    const nonexistentTeam = await app.request(
      "/api/auth/principal-validation/teams/validate-organization-team",
      { method: "POST", headers, body: JSON.stringify({ teamId: "team_missing", organizationId: "org_content" }) },
      env,
    );
    expect(nonexistentTeam.status).toBe(404);

    const serviceAccount = await app.request(
      "/api/auth/principal-validation/service-accounts/validate-organization-grant",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          clientId: targetClient.clientId,
          organizationId: "org_content",
          resource: "https://content-api.example.test",
        }),
      },
      env,
    );
    expect(serviceAccount.status).toBe(200);

    const wrongAudienceToken = await issueM2mToken(
      app,
      env,
      targetClient,
      "https://content-api.example.test",
      "content:write",
    );
    const wrongAudience = await app.request(
      "/api/auth/principal-validation/users/validate",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${wrongAudienceToken}` },
        body: JSON.stringify({ userId: "user_external" }),
      },
      env,
    );
    expect(wrongAudience.status).toBe(401);

    const orgScopedClient = await createM2mClient(app, env, cookie, "content:write", {
      client_name: "Legacy Grant Client",
    });
    raw.exec(`update "oauthClient" set "referenceId" = 'org_content' where "clientId" = '${orgScopedClient.clientId}';`);
    const orgScopedGrant = await app.request(
      "/api/auth/admin/oauth-client-organization-grants",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          clientId: orgScopedClient.clientId,
          organizationId: "org_content",
          resourceServerId: contentResourceServerId,
          allowedScopes: ["content:write"],
        }),
      },
      env,
    );
    expect(orgScopedGrant.status).toBe(200);
    const orgScopedToken = await issueM2mToken(
      app,
      env,
      orgScopedClient,
      "https://content-api.example.test",
      "content:write",
    );
    expect(decodeJwt(orgScopedToken)).toEqual(
      expect.objectContaining({
        azp: orgScopedClient.clientId,
        client_id: orgScopedClient.clientId,
        org_id: "org_content",
      }),
    );

    const unauthenticated = await app.request(
      "/api/auth/principal-validation/users/validate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user_external" }),
      },
      env,
    );
    expect(unauthenticated.status).toBe(401);
  });
});
