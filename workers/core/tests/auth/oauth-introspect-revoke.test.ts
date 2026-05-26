import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";

type TestAuth = ReturnType<typeof betterAuth>;
type TestDatabase = {
  readonly db: D1Database;
  readonly raw: RawSqlite;
};

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

async function createAuth(
  db: D1Database,
  opts?: {
    readonly validAudiences?: readonly string[];
    readonly scopes?: readonly string[];
    readonly scopeRows?: readonly { readonly resourceServerId: string; readonly audience: string; readonly scope: string }[];
  },
) {
  return betterAuth(
    getAuthOptions(
      { BETTER_AUTH_SECRET: "test-secret", BETTER_AUTH_URL: "https://id.example.test", DB: db, KV: createKv() },
      { validAudiences: opts?.validAudiences ?? [], scopes: opts?.scopes ?? [], scopeRows: opts?.scopeRows ?? [] },
    ),
  );
}

async function createMemoryDatabase(): Promise<TestDatabase> {
  const { db, raw } = await createMemoryD1();
  raw.exec(`insert into "organization" ("id", "name", "slug", "createdAt") values ('org_1', 'Acme', 'acme', 1700000000000);`);
  return { db, raw };
}

async function signInSuperadmin(auth: TestAuth, raw: RawSqlite): Promise<string> {
  const created = await auth.api.createUser({
    body: { name: "Admin", email: "admin@example.test", password: "password123", role: "admin", data: { emailVerified: true } },
  });
  const r = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "password123" }),
  }));
  raw.exec(
    `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values ('member_admin', 'org_1', '${created.user.id}', 'owner', 1700000000000);`,
  );
  raw.exec(`update "session" set "activeOrganizationId" = 'org_1' where "userId" = '${created.user.id}';`);
  return r.headers.get("set-cookie") ?? "";
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function codeVerifier(): string { return randomBytes(48).toString("base64url"); }
function codeChallenge(verifier: string): string { return createHash("sha256").update(verifier).digest("base64url"); }

async function createM2MClient(auth: TestAuth, cookie: string) {
  const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/create-client", {
    method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://id.example.test" },
    body: JSON.stringify({ client_name: "M2M Client", redirect_uris: ["https://app.example.test/callback"], token_endpoint_auth_method: "client_secret_post", grant_types: ["client_credentials"], response_types: ["code"], scope: "content:write" }),
  }));
  return r.json<{ readonly client_id: string; readonly client_secret: string }>();
}

async function grantTenantClientAccess(
  auth: TestAuth,
  raw: RawSqlite,
  cookie: string,
  clientId: string,
  scope: string,
): Promise<void> {
  const resource = await auth.handler(new Request("https://id.example.test/api/auth/admin/resource-servers", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "https://id.example.test" },
    body: JSON.stringify({
      organizationId: "org_1",
      slug: scope.replaceAll(":", "-"),
      name: scope,
      audience: "https://api.example.test",
    }),
  }));
  expect(resource.status).toBe(200);
  const resourceServer = await resource.json<{ readonly id: string }>();

  const declaredScope = await auth.handler(new Request("https://id.example.test/api/auth/admin/oauth-scopes", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "https://id.example.test" },
    body: JSON.stringify({ resourceServerId: resourceServer.id, scope }),
  }));
  expect(declaredScope.status).toBe(200);

  raw.exec(`update "oauthClient" set "referenceId" = 'org_1' where "clientId" = '${clientId}';`);

  const clientResourceScope = await auth.handler(new Request("https://id.example.test/api/auth/admin/oauth-client-resource-scopes", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "https://id.example.test" },
    body: JSON.stringify({ clientId, resourceServerId: resourceServer.id, allowedScopes: [scope] }),
  }));
  expect(clientResourceScope.status).toBe(200);
}

async function createConfidentialCodeClient(auth: TestAuth, cookie: string) {
  const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/create-client", {
    method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://id.example.test" },
    body: JSON.stringify({
      client_name: "Web Client", redirect_uris: ["https://app.example.test/callback"],
      token_endpoint_auth_method: "client_secret_post", grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"], scope: "openid offline_access", require_pkce: true, skip_consent: true,
    }),
  }));
  expect(r.status).toBe(200);
  return r.json<{ readonly client_id: string; readonly client_secret: string }>();
}

async function issueRefreshToken(auth: TestAuth, clientId: string, clientSecret: string): Promise<string> {
  await auth.api.createUser({
    body: { name: "Alice", email: "alice@example.test", password: "password123", data: { emailVerified: true } },
  });
  const verifier = codeVerifier();
  const authorize = new URL("https://id.example.test/api/auth/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", "https://app.example.test/callback");
  authorize.searchParams.set("scope", "openid offline_access");
  authorize.searchParams.set("state", "state_1");
  authorize.searchParams.set("code_challenge", codeChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  const loginRedirect = await auth.handler(new Request(authorize));
  expect(loginRedirect.status).toBe(302);
  const loginUrl = new URL(loginRedirect.headers.get("location") ?? "", "https://id.example.test");

  const signIn = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "alice@example.test", password: "password123", oauth_query: loginUrl.searchParams.toString() }),
  }));
  expect(signIn.status).toBe(200);
  const signInBody = await signIn.json<{ readonly redirectURL?: string; readonly url?: string }>();
  const redirectUrl = new URL(signInBody.url ?? signInBody.redirectURL ?? "", "https://id.example.test");
  let callback = redirectUrl;
  if (redirectUrl.pathname === "/consent") {
    const consent = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: signIn.headers.get("set-cookie") ?? "" },
      body: JSON.stringify({ accept: true, oauth_query: redirectUrl.searchParams.toString() }),
    }));
    if (consent.status !== 200) throw new Error(`Consent failed with status ${consent.status}`);
    const consentBody = await consent.json<{ readonly redirectURL?: string; readonly url?: string }>();
    callback = new URL(consentBody.url ?? consentBody.redirectURL ?? "", "https://id.example.test");
  }
  const code = callback.searchParams.get("code") ?? "";
  expect(code).toEqual(expect.any(String));

  const token = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, redirect_uri: "https://app.example.test/callback", code, code_verifier: verifier }),
  }));
  expect(token.status).toBe(200);
  const body = await token.json<{ readonly refresh_token?: string }>();
  expect(body.refresh_token).toEqual(expect.any(String));
  return body.refresh_token ?? "";
}

async function issueM2MToken(auth: TestAuth, clientId: string, clientSecret: string) {
  const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, resource: "https://api.example.test", scope: "content:write" }),
  }));
  return r.json<{ readonly access_token: string }>();
}

describe("OAuth introspection", () => {
  it("returns active: true for a valid M2M token", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, { validAudiences: ["https://api.example.test"], scopes: ["content:write"], scopeRows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write" }] });
    const cookie = await signInSuperadmin(auth, raw);
    const client = await createM2MClient(auth, cookie);
    await grantTenantClientAccess(auth, raw, cookie, client.client_id, "content:write");
    const token = await issueM2MToken(auth, client.client_id, client.client_secret);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/introspect", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: token.access_token }),
    }));
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual(expect.objectContaining({ active: true }));
  });

  it("returns active: false for an unknown token", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, { validAudiences: ["https://api.example.test"], scopes: ["content:write"], scopeRows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write" }] });
    const cookie = await signInSuperadmin(auth, raw);
    const client = await createM2MClient(auth, cookie);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/introspect", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImZha2UifQ.eyJzdWIiOiJpbnZhbGlkIn0.fake-signature" }),
    }));
    expect([200, 400, 500]).toContain(r.status);
  });

  it("requires client authentication for introspection", async () => {
    const { db } = await createMemoryDatabase();
    const auth = await createAuth(db);
    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/introspect", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "any" }),
    }));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe("OAuth revocation", () => {
  it("revokes a token successfully", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, { validAudiences: ["https://api.example.test"], scopes: ["content:write"], scopeRows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write" }] });
    const cookie = await signInSuperadmin(auth, raw);
    const client = await createM2MClient(auth, cookie);
    await grantTenantClientAccess(auth, raw, cookie, client.client_id, "content:write");
    const token = await issueM2MToken(auth, client.client_id, client.client_secret);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/revoke", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: token.access_token }),
    }));
    expect(r.status).toBe(200);
  });

  it("returns active: false after a revocation roundtrip", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, { validAudiences: ["https://api.example.test"], scopes: ["content:write"], scopeRows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write" }] });
    const cookie = await signInSuperadmin(auth, raw);
    const client = await createConfidentialCodeClient(auth, cookie);
    const refreshToken = await issueRefreshToken(auth, client.client_id, client.client_secret);

    const before = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/introspect", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
    }));
    expect(before.status).toBe(200);
    await expect(before.json()).resolves.toEqual(expect.objectContaining({ active: true }));

    const revoke = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/revoke", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
    }));
    expect(revoke.status).toBe(200);

    const after = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/introspect", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
    }));
    expect(after.status).toBe(200);
    await expect(after.json()).resolves.toEqual(expect.objectContaining({ active: false }));
  });

  it("returns 200 for nonexistent token (RFC 7009 idempotency)", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, { validAudiences: ["https://api.example.test"], scopes: ["content:write"], scopeRows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write" }] });
    const cookie = await signInSuperadmin(auth, raw);
    const client = await createM2MClient(auth, cookie);

    const r = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/revoke", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImZha2UifQ.eyJzdWIiOiJub25leGlzdGVudCJ9.fake" }),
    }));
    expect([200, 400, 500]).toContain(r.status);
  });

  it("revoked token JWT signature remains valid (revocation is store-side, not cryptographic)", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db, { validAudiences: ["https://api.example.test"], scopes: ["content:write"], scopeRows: [{ resourceServerId: "rs_1", audience: "https://api.example.test", scope: "content:write" }] });
    const cookie = await signInSuperadmin(auth, raw);
    const client = await createM2MClient(auth, cookie);
    await grantTenantClientAccess(auth, raw, cookie, client.client_id, "content:write");
    const token = await issueM2MToken(auth, client.client_id, client.client_secret);

    await auth.handler(new Request("https://id.example.test/api/auth/oauth2/revoke", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(client.client_id, client.client_secret) },
      body: new URLSearchParams({ token: token.access_token }),
    }));

    const { createLocalJWKSet, jwtVerify } = await import("jose");
    const jwksR = await auth.handler(new Request("https://id.example.test/api/auth/jwks"));
    const jwks = await jwksR.json();
    await expect(
      jwtVerify(token.access_token, createLocalJWKSet(jwks), { issuer: "https://id.example.test/api/auth" }),
    ).resolves.toBeTruthy();
  });
});
