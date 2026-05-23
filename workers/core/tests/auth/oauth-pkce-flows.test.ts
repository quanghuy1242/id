import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import { createMemoryD1, type RawSqlite } from "./d1-test-helper";

type TestAuth = ReturnType<typeof betterAuth>;
type TokenResponse = { readonly access_token: string; readonly expires_in: number; readonly refresh_token?: string; readonly token_type: string };

function createKv(): BetterAuthKvStorage {
  const values = new Map<string, string>();
  return { get: async (key) => values.get(key) ?? null, put: async (key, value) => { values.set(key, value); }, delete: async (key) => { values.delete(key); } };
}

function codeVerifier(): string { return randomBytes(48).toString("base64url"); }
function codeChallenge(verifier: string): string { return createHash("sha256").update(verifier).digest("base64url"); }

async function createMemoryDatabase(): Promise<{ readonly db: D1Database; readonly raw: RawSqlite }> {
  return createMemoryD1();
}

async function createAuth(db: D1Database) {
  return betterAuth(getAuthOptions({
    BETTER_AUTH_SECRET: "test-secret", BETTER_AUTH_URL: "https://id.example.test",
    DB: db, KV: createKv(),
  }, {
    validAudiences: ["https://api.example.test"],
    scopes: ["content:read", "content:write", "content:share"],
    scopeRows: [
      { resourceServerId: "rs_content", audience: "https://api.example.test", scope: "content:read" },
      { resourceServerId: "rs_content", audience: "https://api.example.test", scope: "content:write" },
      { resourceServerId: "rs_content", audience: "https://api.example.test", scope: "content:share" },
    ],
  }));
}

async function createUserAndOrgAndTeam(auth: TestAuth, raw: RawSqlite) {
  await auth.api.createUser({
    body: { name: "Alice", email: "alice@example.test", password: "password123", data: { emailVerified: true } },
  });

  const adminR = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "alice@example.test", password: "password123" }),
  }));
  const cookie = adminR.headers.get("set-cookie") ?? "";

  const orgR = await auth.handler(new Request("https://id.example.test/api/auth/organization/create", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  }));
  const org = await orgR.json<{ readonly id: string }>();

  const teamR = await auth.handler(new Request("https://id.example.test/api/auth/organization/create-team", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ organizationId: org.id, name: "Engineering" }),
  }));
  const team = await teamR.json<{ readonly id: string }>();

  const user = raw.prepare(`select "id" from "user" where "email" = ?`).get("alice@example.test") as { readonly id?: string } | undefined;
  const userId = user?.id ?? "";
  expect(userId).toEqual(expect.any(String));
  raw.exec(
    `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") select 'member_alice', '${org.id}', '${userId}', 'owner', 1700000000000 where not exists (select 1 from "member" where "organizationId" = '${org.id}' and "userId" = '${userId}');`,
  );

  await auth.handler(new Request("https://id.example.test/api/auth/organization/add-team-member", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ organizationId: org.id, teamId: team.id, userId }),
  }));
  raw.exec(
    `insert into "teamMember" ("id", "teamId", "userId", "createdAt") select 'team_member_alice', '${team.id}', '${userId}', 1700000000000 where not exists (select 1 from "teamMember" where "teamId" = '${team.id}' and "userId" = '${userId}');`,
  );

  return { org, team, userId, cookie };
}

async function createNativeClient(auth: TestAuth) {
  await auth.api.createUser({
    body: { name: "Admin", email: "admin@example.test", password: "password123", role: "admin", data: { emailVerified: true } },
  });

  const signInR = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "password123" }),
  }));
  const adminCookie = signInR.headers.get("set-cookie") ?? "";

  const clientR = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/create-client", {
    method: "POST", headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      client_name: "Native PKCE Client", redirect_uris: ["https://app.example.test/callback"],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"], scope: "openid offline_access content:read", type: "native",
      require_pkce: true, skip_consent: true,
    }),
  }));
  return clientR.json<{ readonly client_id: string }>();
}

async function authorizeAndLogin(
  auth: TestAuth,
  clientId: string,
  verifier: string,
  context: string,
  scope = "openid offline_access content:read",
) {
  const authorize = new URL("https://id.example.test/api/auth/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", "https://app.example.test/callback");
  authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("state", "state_1");
  authorize.searchParams.set("resource", "https://api.example.test");
  authorize.searchParams.set("code_challenge", codeChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");

  const redirect = await auth.handler(new Request(authorize, { headers: { "x-id-oauth-context": context } }));
  expect(redirect.status).toBe(302);
  const loginUrl = new URL(redirect.headers.get("location") ?? "", "https://id.example.test");
  expect(loginUrl.pathname).toBe("/login");

  const signInR = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
    method: "POST", headers: { "content-type": "application/json", "x-id-oauth-context": context },
    body: JSON.stringify({ email: "alice@example.test", password: "password123", oauth_query: loginUrl.searchParams.toString() }),
  }));
  expect(signInR.status).toBe(200);
  const body = await signInR.json<{ readonly redirectURL?: string; readonly url?: string }>();
  const redirectUrl = new URL(body.url ?? body.redirectURL ?? "", "https://id.example.test");
  let callbackUrl = redirectUrl;

  if (redirectUrl.pathname === "/consent") {
    const consentR = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: signInR.headers.get("set-cookie") ?? "" },
      body: JSON.stringify({ accept: true, oauth_query: redirectUrl.searchParams.toString() }),
    }));
    if (consentR.status !== 200) throw new Error(`Consent failed with status ${consentR.status}`);
    const consentBody = await consentR.json<{ readonly redirectURL?: string; readonly url?: string }>();
    callbackUrl = new URL(consentBody.url ?? consentBody.redirectURL ?? "", "https://id.example.test");
  }

  expect(callbackUrl.searchParams.get("state")).toBe("state_1");
  const code = callbackUrl.searchParams.get("code");
  expect(code).toEqual(expect.any(String));
  return code ?? "";
}

async function exchangeCode(auth: TestAuth, clientId: string, code: string, verifier: string) {
  return auth.handler(new Request("https://id.example.test/api/auth/oauth2/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: "https://app.example.test/callback", code, code_verifier: verifier, resource: "https://api.example.test" }),
  }));
}

describe("OAuth PKCE direct-share flow", () => {
  it("issues a JWT with team_ids: [] and no org_id for direct-share context", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db);
    await createUserAndOrgAndTeam(auth, raw);
    const client = await createNativeClient(auth);
    const verifier = codeVerifier();
    const code = await authorizeAndLogin(auth, client.client_id, verifier, "direct-share");

    const tokenR = await exchangeCode(auth, client.client_id, code, verifier);
    expect(tokenR.status).toBe(200);
    const token = await tokenR.json<TokenResponse>();
    expect(token.token_type).toBe("Bearer");
    expect(token.expires_in).toBe(900);
    expect(token.refresh_token).toEqual(expect.any(String));

    const jwksR = await auth.handler(new Request("https://id.example.test/api/auth/jwks"));
    const jwks = await jwksR.json();
    const decoded = decodeJwt(token.access_token);
    const { payload } = await jwtVerify(token.access_token, createLocalJWKSet(jwks), { issuer: String(decoded.iss), audience: "https://api.example.test" });
    expect(payload.team_ids).toEqual([]);
    expect(payload.org_id).toBeUndefined();
    expect(payload.sub).toEqual(expect.any(String));
  });

  it("rejects content:share scope in direct-share context", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db);
    await createUserAndOrgAndTeam(auth, raw);

    await auth.api.createUser({
      body: { name: "Admin2", email: "admin2@example.test", password: "password123", role: "admin", data: { emailVerified: true } },
    });
    const adminSignIn = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin2@example.test", password: "password123" }),
    }));
    const ac = adminSignIn.headers.get("set-cookie") ?? "";
    const clientR = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/create-client", {
      method: "POST", headers: { "content-type": "application/json", cookie: ac },
      body: JSON.stringify({
        client_name: "Share Client", redirect_uris: ["https://app.example.test/callback"],
        token_endpoint_auth_method: "none", grant_types: ["authorization_code"],
        response_types: ["code"],       scope: "openid content:read content:share", type: "native",
        require_pkce: true, skip_consent: true,
      }),
    }));
    const client = await clientR.json<{ readonly client_id: string }>();

    const verifier = codeVerifier();
    const code = await authorizeAndLogin(auth, client.client_id, verifier, "direct-share", "openid content:share");
    const tokenR = await exchangeCode(auth, client.client_id, code, verifier);
    expect(tokenR.status).toBeGreaterThanOrEqual(400);
  });
});

describe("OAuth PKCE workspace flow", () => {
  it("issues a JWT with org_id and team_ids for workspace context", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db);
    const { org, team } = await createUserAndOrgAndTeam(auth, raw);
    const client = await createNativeClient(auth);
    const verifier = codeVerifier();
    const code = await authorizeAndLogin(auth, client.client_id, verifier, `workspace:${org.id}`);
    const tokenR = await exchangeCode(auth, client.client_id, code, verifier);
    expect(tokenR.status).toBe(200);
    const token = await tokenR.json<TokenResponse>();
    expect(token.token_type).toBe("Bearer");

    const jwksR = await auth.handler(new Request("https://id.example.test/api/auth/jwks"));
    const jwks = await jwksR.json();
    const decoded = decodeJwt(token.access_token);
    const { payload } = await jwtVerify(token.access_token, createLocalJWKSet(jwks), { issuer: String(decoded.iss), audience: "https://api.example.test" });
    expect(payload.org_id).toBe(org.id);
    expect(payload.team_ids).toEqual(expect.arrayContaining([team.id]));
    expect(payload.sub).toEqual(expect.any(String));
  });
});

describe("OAuth consent redirect flow", () => {
  it("redirects a non-trusted client to consent and accepts before token exchange", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db);
    await createUserAndOrgAndTeam(auth, raw);
    const client = await createNativeClient(auth);
    const verifier = codeVerifier();
    const authorize = new URL("https://id.example.test/api/auth/oauth2/authorize");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", client.client_id);
    authorize.searchParams.set("redirect_uri", "https://app.example.test/callback");
    authorize.searchParams.set("scope", "openid content:read");
    authorize.searchParams.set("state", "state_1");
    authorize.searchParams.set("resource", "https://api.example.test");
    authorize.searchParams.set("code_challenge", codeChallenge(verifier));
    authorize.searchParams.set("code_challenge_method", "S256");

    const loginRedirect = await auth.handler(new Request(authorize, { headers: { "x-id-oauth-context": "direct-share" } }));
    expect(loginRedirect.status).toBe(302);
    const loginUrl = new URL(loginRedirect.headers.get("location") ?? "", "https://id.example.test");
    expect(loginUrl.pathname).toBe("/login");

    const signIn = await auth.handler(new Request("https://id.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-id-oauth-context": "direct-share" },
      body: JSON.stringify({ email: "alice@example.test", password: "password123", oauth_query: loginUrl.searchParams.toString() }),
    }));
    expect(signIn.status).toBe(200);
    const signInBody = await signIn.json<{ readonly url?: string }>();
    const consentUrl = new URL(signInBody.url ?? "", "https://id.example.test");
    expect(consentUrl.pathname).toBe("/consent");

    const consent = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: signIn.headers.get("set-cookie") ?? "" },
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.searchParams.toString() }),
    }));
    expect(consent.status).toBe(200);
    const consentBody = await consent.json<{ readonly url?: string }>();
    const callback = new URL(consentBody.url ?? "", "https://id.example.test");
    expect(callback.origin).toBe("https://app.example.test");
    expect(callback.searchParams.get("state")).toBe("state_1");
    const code = callback.searchParams.get("code") ?? "";
    expect(code).toEqual(expect.any(String));

    const tokenR = await exchangeCode(auth, client.client_id, code, verifier);
    expect(tokenR.status).toBe(200);
  });
});

describe("OAuth refresh token replay prevention", () => {
  it("rejects a replayed refresh token after first use", async () => {
    const { db, raw } = await createMemoryDatabase();
    const auth = await createAuth(db);
    await createUserAndOrgAndTeam(auth, raw);
    const client = await createNativeClient(auth);
    const verifier = codeVerifier();
    const code = await authorizeAndLogin(auth, client.client_id, verifier, "direct-share");

    const tokenR = await exchangeCode(auth, client.client_id, code, verifier);
    const token = await tokenR.json<TokenResponse>();
    expect(token.refresh_token).toEqual(expect.any(String));

    const firstR = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: token.refresh_token ?? "", resource: "https://api.example.test" }),
    }));
    expect(firstR.status).toBe(200);
    const first = await firstR.json<TokenResponse>();
    expect(first.refresh_token).not.toBe(token.refresh_token);

    const replayR = await auth.handler(new Request("https://id.example.test/api/auth/oauth2/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: token.refresh_token ?? "" }),
    }));
    expect(replayR.status).toBeGreaterThanOrEqual(400);
  });
});
