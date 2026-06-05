import {
  createLocalJWKSet,
  decodeJwt,
  jwtVerify,
  type JSONWebKeySet,
} from "jose";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";

const capturedEmailSender = createCapturedAuthEmailSender();

type TestDatabase = {
  readonly db: D1Database;
  readonly raw: RawSqlite;
};

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

async function createAuth(
  db: D1Database,
  validAudiences: readonly string[] = [],
) {
  return betterAuth(
    getAuthOptions(
      {
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: db,
        KV: createKv(),
      },
      {
        validAudiences,
        scopes: ["content:write"],
        scopeRows: [
          {
            resourceServerId: "rs_content",
            audience: "https://api.example.test",
            scope: "content:write",
            system: false,
          },
        ],
      },
      { emailSender: capturedEmailSender },
    ),
  );
}

type TestAuth = Awaited<ReturnType<typeof createAuth>>;

async function signInSuperadmin(
  auth: TestAuth,
  raw: RawSqlite,
): Promise<{ readonly cookie: string; readonly userId: string }> {
  const created = await auth.api.createUser({
    body: {
      name: "Root Admin",
      email: "root@example.test",
      password: "password123",
      role: "admin",
      data: { emailVerified: true },
    },
  });

  const response = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "root@example.test",
    password: "password123",
  });

  raw.exec(
    `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_root', 'org_1', '${created.user.id}', 'owner', 1700000000000);`,
  );

  const cookie = response.headers.get("set-cookie");
  expect(cookie).toEqual(expect.any(String));
  raw.exec(
    `update "session" set "activeOrganizationId" = 'org_1' where "userId" = '${created.user.id}';`,
  );
  return { cookie: cookie ?? "", userId: created.user.id };
}

async function createMemoryDatabase(): Promise<TestDatabase> {
  const { db, raw } = await createMemoryD1();
  raw.exec(
    `insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`,
  );
  return { db, raw };
}

describe("OAuth Provider flows", () => {
  it("creates a confidential client through the admin endpoint and issues a resource-bound M2M JWT", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, ["https://api.example.test"]);
    const { cookie } = await signInSuperadmin(auth, raw);

    const resourceResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/resource-servers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: "https://id.example.test",
        },
        body: JSON.stringify({
          organizationId: "org_1",
          slug: "content-api",
          name: "Content API",
          audience: "https://api.example.test",
        }),
      }),
    );
    expect(resourceResponse.status).toBe(200);
    const resourceServer = (await resourceResponse.json()) as {
      readonly id: string;
    };

    const scopeResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/admin/oauth-scopes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: "https://id.example.test",
        },
        body: JSON.stringify({
          resourceServerId: resourceServer.id,
          scope: "content:write",
        }),
      }),
    );
    expect(scopeResponse.status).toBe(200);

    const clientResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/create-client", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: "https://id.example.test",
        },
        body: JSON.stringify({
          client_name: "Worker API",
          redirect_uris: ["https://app.example.test/callback"],
          token_endpoint_auth_method: "client_secret_post",
          grant_types: ["client_credentials"],
          response_types: ["code"],
          scope: "content:write",
        }),
      }),
    );

    expect(clientResponse.status).toBe(200);
    const client = (await clientResponse.json()) as {
      readonly client_id: string;
      readonly client_secret: string;
    };
    raw.exec(
      `update "oauthClient" set "referenceId" = 'org_1' where "clientId" = '${client.client_id}';`,
    );

    const clientResourceScopeResponse = await auth.handler(
      new Request(
        "https://id.example.test/api/auth/admin/oauth-client-resource-scopes",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
            origin: "https://id.example.test",
          },
          body: JSON.stringify({
            clientId: client.client_id,
            resourceServerId: resourceServer.id,
            allowedScopes: ["content:write"],
          }),
        },
      ),
    );
    expect(clientResourceScopeResponse.status).toBe(200);

    const tokenResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: client.client_id,
          client_secret: client.client_secret,
          resource: "https://api.example.test",
          scope: "content:write",
        }),
      }),
    );

    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()) as {
      readonly access_token: string;
      readonly expires_in: number;
      readonly grant_type: string;
      readonly token_type: string;
    };
    expect(token.grant_type).toBe("client_credentials");
    expect(token.token_type).toBe("Bearer");
    expect(token).toEqual(expect.objectContaining({ expires_in: 10_800 }));

    const jwksResponse = await auth.handler(
      new Request("https://id.example.test/api/auth/jwks"),
    );
    const jwks = (await jwksResponse.json()) as JSONWebKeySet;
    const decoded = decodeJwt(token.access_token);
    expect(decoded.iss).toBe("https://id.example.test/api/auth");
    const { payload } = await jwtVerify(
      token.access_token,
      createLocalJWKSet(jwks),
      {
        issuer: String(decoded.iss),
        audience: "https://api.example.test",
      },
    );
    expect(payload.aud).toBe("https://api.example.test");
    expect(payload.scope).toBe("content:write");
    expect(payload.sub).toBeUndefined();
    expect(payload.azp).toBe(client.client_id);
    expect(payload.client_id).toBe(client.client_id);
    expect(payload.org_id).toBe("org_1");
  });
});
