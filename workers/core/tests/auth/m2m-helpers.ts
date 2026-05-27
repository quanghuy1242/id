import { expect } from "vitest";
import { createApp } from "../../src/composition/create-app";
import type { CoreEnv } from "../../src/config/env";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";

export type TestEnv = {
  readonly env: CoreEnv;
  readonly raw: RawSqlite;
  readonly app: ReturnType<typeof createApp>;
};

export function createTestKv(): KVNamespace {
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

export async function createTestEnv(): Promise<TestEnv> {
  const { db, raw } = await createMemoryD1();
  return {
    raw,
    app: createApp(),
    env: {
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "https://id.example.test",
      ID_BOOTSTRAP_TOKEN: "test-bootstrap-token-v1",
      DB: db,
      KV: createTestKv(),
    },
  };
}

export async function bootstrapAdmin(test: TestEnv): Promise<string> {
  const response = await test.app.request(
    "/api/bootstrap/admin",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-bootstrap-token-v1" },
      body: JSON.stringify({
        email: "root@example.test",
        password: "password12345",
        name: "Root Admin",
        organization: { name: "Default", slug: "default" },
      }),
    },
    test.env,
  );
  expect(response.status).toBe(200);
  const signIn = await test.app.request(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "root@example.test", password: "password12345" }),
    },
    test.env,
  );
  expect(signIn.status).toBe(200);
  return signIn.headers.get("set-cookie") ?? "";
}

export async function createResourceServer(
  test: TestEnv,
  cookie: string,
  args: { readonly organizationId: string | null; readonly slug: string; readonly name: string; readonly audience: string },
): Promise<string> {
  const response = await test.app.request(
    "/api/auth/admin/resource-servers",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(args.organizationId === null ? { slug: args.slug, name: args.name, audience: args.audience } : args),
    },
    test.env,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly id: string };
  return body.id;
}

export async function createOAuthScope(
  test: TestEnv,
  cookie: string,
  args: { readonly resourceServerId: string; readonly scope: string },
): Promise<void> {
  const response = await test.app.request(
    "/api/auth/admin/oauth-scopes",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(args),
    },
    test.env,
  );
  expect(response.status).toBe(200);
}

export type CreatedClient = {
  readonly clientId: string;
  readonly clientSecret: string;
};

export async function createM2MClient(
  test: TestEnv,
  cookie: string,
  args: { readonly name: string; readonly scope: string; readonly referenceId?: string | null },
): Promise<CreatedClient> {
  const response = await test.app.request(
    "/api/auth/oauth2/create-client",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        client_name: args.name,
        redirect_uris: ["https://app.example.test/callback"],
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["client_credentials"],
        response_types: ["code"],
        scope: args.scope,
      }),
    },
    test.env,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly client_id: string; readonly client_secret: string };
  if (args.referenceId === null) {
    test.raw.exec(`update "oauthClient" set "referenceId" = NULL where "clientId" = '${body.client_id}';`);
  } else if (args.referenceId) {
    test.raw.exec(`update "oauthClient" set "referenceId" = '${args.referenceId}' where "clientId" = '${body.client_id}';`);
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

export async function attachClientResourceScope(
  test: TestEnv,
  cookie: string,
  args: { readonly clientId: string; readonly resourceServerId: string; readonly allowedScopes: readonly string[] },
): Promise<{ readonly id: string; readonly status: number }> {
  const response = await test.app.request(
    "/api/auth/admin/oauth-client-resource-scopes",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(args),
    },
    test.env,
  );
  if (response.status === 200) {
    const body = (await response.json()) as { readonly id: string };
    return { id: body.id, status: 200 };
  }
  return { id: "", status: response.status };
}

export async function tokenRequest(
  test: TestEnv,
  args: { readonly clientId: string; readonly clientSecret: string; readonly resource: string; readonly scope: string },
): Promise<Response> {
  return test.app.request(
    "/api/auth/oauth2/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: args.clientId,
        client_secret: args.clientSecret,
        resource: args.resource,
        scope: args.scope,
      }),
    },
    test.env,
  );
}
