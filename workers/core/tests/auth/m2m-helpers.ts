import { expect } from "vitest";
import { createApp } from "../../src/composition/create-app";
import { getAuth } from "../../src/auth/get-auth";
import { systemResourceServerAudience } from "../../src/auth/config";
import type { CoreEnv } from "../../src/config/env";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import { createCapturedAuthEmailSender } from "../helpers/test-email";

export type TestEnv = {
  readonly env: CoreEnv;
  readonly raw: RawSqlite;
  readonly app: ReturnType<typeof createApp>;
};

export type TestKvOperation = {
  readonly kind: "get" | "put" | "delete";
  readonly key: string;
};

export type InspectableTestKv = KVNamespace & {
  readonly values: Map<string, string>;
  readonly operations: TestKvOperation[];
};

export function createTestKv(): InspectableTestKv {
  const values = new Map<string, string>();
  const operations: TestKvOperation[] = [];
  return {
    values,
    operations,
    get: async (key: string) => {
      operations.push({ kind: "get", key });
      return values.get(key) ?? null;
    },
    put: async (key: string, value: string) => {
      operations.push({ kind: "put", key });
      values.set(key, value);
    },
    delete: async (key: string) => {
      operations.push({ kind: "delete", key });
      values.delete(key);
    },
  } as InspectableTestKv;
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
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-bootstrap-token-v1",
      },
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
  return signInViaAdminOtp(test.env, {
    email: "root@example.test",
    password: "password12345",
  });
}

/**
 * Completes the admin email-OTP sign-in (doc 024) for a createApp-based test.
 * Drives it through a side `getAuth` built with a captured email sender; it
 * shares `env`'s DB + KV, so the session cookie it mints is valid for subsequent
 * `app.request` calls against the same env.
 */
export async function signInViaAdminOtp(
  env: CoreEnv,
  creds: { readonly email: string; readonly password: string },
): Promise<string> {
  const sender = createCapturedAuthEmailSender();
  const auth = getAuth(env, undefined, { emailSender: sender });
  const signIn = await adminOtpSignIn(auth, sender, creds);
  expect(signIn.status).toBe(200);
  return signIn.headers.get("set-cookie") ?? "";
}

export async function createResourceServer(
  test: TestEnv,
  cookie: string,
  args: {
    readonly organizationId: string | null;
    readonly slug: string;
    readonly name: string;
    readonly audience: string;
  },
): Promise<string> {
  const response = await test.app.request(
    "/api/auth/admin/resource-servers",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(
        args.organizationId === null
          ? { slug: args.slug, name: args.name, audience: args.audience }
          : args,
      ),
    },
    test.env,
  );
  if (
    response.status !== 200 &&
    args.organizationId === null &&
    args.audience === systemResourceServerAudience(test.env.BETTER_AUTH_URL)
  ) {
    const existing = test.raw
      .prepare(`select "id" from "resourceServer" where "audience" = ?`)
      .get(args.audience) as { readonly id: string } | undefined;
    if (existing) return existing.id;
  }
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
  if (response.status !== 200) {
    const existing = test.raw
      .prepare(
        `select "id" from "oauthResourceScope" where "resourceServerId" = ? and "scope" = ?`,
      )
      .get(args.resourceServerId, args.scope) as
      | { readonly id: string }
      | undefined;
    if (existing) return;
  }
  expect(response.status).toBe(200);
}

export type CreatedClient = {
  readonly clientId: string;
  readonly clientSecret: string;
};

export async function createM2MClient(
  test: TestEnv,
  cookie: string,
  args: {
    readonly name: string;
    readonly scope: string;
    readonly referenceId?: string | null;
  },
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
  const body = (await response.json()) as {
    readonly client_id: string;
    readonly client_secret: string;
  };
  if (args.referenceId === null) {
    test.raw.exec(
      `update "oauthClient" set "referenceId" = NULL where "clientId" = '${body.client_id}';`,
    );
  } else if (args.referenceId) {
    test.raw.exec(
      `update "oauthClient" set "referenceId" = '${args.referenceId}' where "clientId" = '${body.client_id}';`,
    );
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

export async function attachClientResourceScope(
  test: TestEnv,
  cookie: string,
  args: {
    readonly clientId: string;
    readonly resourceServerId: string;
    readonly allowedScopes: readonly string[];
  },
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
  args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly resource: string;
    readonly scope: string;
  },
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
