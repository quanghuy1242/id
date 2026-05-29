import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { getAuthOptions } from "../../src/auth/get-auth";
import type { BetterAuthKvStorage } from "../../src/auth/adapters/secondary-storage";
import { createCapturedAuthEmailSender } from "../helpers/test-email";
import { adminOtpSignIn } from "./admin-otp-sign-in";
import * as authSchema from "../../src/db/auth-schema";

type RawSqlite = {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => { readonly get: () => unknown };
};

type TokenResponse = {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly token_type: string;
};

type OAuthAdminApi = {
  readonly adminCreateOAuthClient: (params: {
    readonly headers: Headers;
    readonly body: Record<string, unknown>;
  }) => Promise<{ readonly client_id: string; readonly client_secret?: string }>;
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

async function createMemoryDatabase(): Promise<RawSqlite> {
  const sqliteModuleName = "better-sqlite3";
  const { default: Database } = (await import(sqliteModuleName)) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));
  raw.exec(readFileSync("migrations/0002_teams_oauth_scope_catalog.sql", "utf8"));
  return raw;
}

const capturedEmailSender = createCapturedAuthEmailSender();

async function createAuth(raw: RawSqlite) {
  return betterAuth(
    getAuthOptions(
      {
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://id.example.test",
        DB: drizzleAdapter(drizzle(raw), { provider: "sqlite", camelCase: true, schema: authSchema }),
        KV: createKv(),
      },
      {
        validAudiences: ["https://api.example.test"],
        scopes: ["content:read", "content:write", "content:share"],
        scopeRows: [
          { resourceServerId: "rs_content", audience: "https://api.example.test", scope: "content:read" },
          { resourceServerId: "rs_content", audience: "https://api.example.test", scope: "content:write" },
          { resourceServerId: "rs_content", audience: "https://api.example.test", scope: "content:share" },
        ],
      },
      { emailSender: capturedEmailSender },
    ),
  );
}

function codeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function createUser(auth: ReturnType<typeof betterAuth>): Promise<string> {
  const created = await auth.api.createUser({
    body: {
      name: "Alice",
      email: "alice@example.test",
      password: "password123",
      data: { emailVerified: true },
    },
  });
  return created.user.id;
}

async function signInAdmin(auth: ReturnType<typeof betterAuth>): Promise<string> {
  await auth.api.createUser({
    body: {
      name: "Admin",
      email: "admin@example.test",
      password: "password123",
      role: "admin",
      data: { emailVerified: true },
    },
  });
  const response = await adminOtpSignIn(auth, capturedEmailSender, {
    email: "admin@example.test",
    password: "password123",
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie") ?? "";
}

async function createTrustedClient(auth: ReturnType<typeof betterAuth>) {
  const cookie = await signInAdmin(auth);
  const api = auth.api as unknown as OAuthAdminApi;
  return api.adminCreateOAuthClient({
    headers: new Headers({ cookie }),
    body: {
      client_name: "content-ui",
      redirect_uris: ["https://content.quanghuy.dev/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid email profile offline_access content:read",
      type: "native",
      require_pkce: true,
      skip_consent: true,
    },
  });
}

async function authorizeAndSignIn(
  auth: ReturnType<typeof betterAuth>,
  clientId: string,
  verifier: string,
  context = "direct-share",
) {
  const authorize = new URL("https://id.example.test/api/auth/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", "https://content.quanghuy.dev/callback");
  authorize.searchParams.set("scope", "openid email profile offline_access content:read");
  authorize.searchParams.set("state", "state_1");
  authorize.searchParams.set("resource", "https://api.example.test");
  authorize.searchParams.set("code_challenge", codeChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");

  const loginRedirect = await auth.handler(new Request(authorize, { headers: { "x-id-oauth-context": context } }));
  expect(loginRedirect.status).toBe(302);
  const loginUrl = new URL(loginRedirect.headers.get("location") ?? "", "https://id.example.test");
  expect(loginUrl.pathname).toBe("/login");

  const signIn = await auth.handler(
    new Request("https://id.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-id-oauth-context": context },
      body: JSON.stringify({
        email: "alice@example.test",
        password: "password123",
        oauth_query: loginUrl.searchParams.toString(),
      }),
    }),
  );
  expect(signIn.status).toBe(200);
  const signInBody = (await signIn.json()) as { readonly url?: string };
  const callback = new URL(signInBody.url ?? "");
  expect(callback.origin).toBe("https://content.quanghuy.dev");
  expect(callback.searchParams.get("state")).toBe("state_1");
  const code = callback.searchParams.get("code");
  expect(code).toEqual(expect.any(String));
  return code ?? "";
}

async function exchangeCode(auth: ReturnType<typeof betterAuth>, clientId: string, code: string, verifier: string) {
  return auth.handler(
    new Request("https://id.example.test/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: "https://content.quanghuy.dev/callback",
        code,
        code_verifier: verifier,
        resource: "https://api.example.test",
      }),
    }),
  );
}

describe("OAuth authorization-code and refresh-token flows", () => {
  it("completes PKCE browser sign-in, issues a resource JWT, and rotates refresh tokens", async () => {
    const raw = await createMemoryDatabase();
    const auth = await createAuth(raw);
    await createUser(auth);
    const client = await createTrustedClient(auth);
    const verifier = codeVerifier();
    const code = await authorizeAndSignIn(auth, client.client_id, verifier);

    const badExchange = await exchangeCode(auth, client.client_id, code, "wrong-verifier");
    expect(badExchange.status).toBe(401);

    const secondVerifier = codeVerifier();
    const secondCode = await authorizeAndSignIn(auth, client.client_id, secondVerifier);
    const tokenResponse = await exchangeCode(auth, client.client_id, secondCode, secondVerifier);
    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()) as TokenResponse;
    expect(token.token_type).toBe("Bearer");
    expect(token.expires_in).toBe(900);
    expect(token.refresh_token).toEqual(expect.any(String));

    const jwksResponse = await auth.handler(new Request("https://id.example.test/api/auth/jwks"));
    const jwks = await jwksResponse.json();
    const decoded = decodeJwt(token.access_token);
    await expect(
      jwtVerify(token.access_token, createLocalJWKSet(jwks), {
        issuer: String(decoded.iss),
        audience: "https://api.example.test",
      }),
    ).resolves.toMatchObject({
      payload: expect.objectContaining({
        aud: expect.arrayContaining(["https://api.example.test"]),
        scope: "openid email profile offline_access content:read",
        team_ids: [],
      }),
    });

    const refresh = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token ?? "",
          resource: "https://api.example.test",
        }),
      }),
    );
    expect(refresh.status).toBe(200);
    const refreshed = (await refresh.json()) as TokenResponse;
    expect(refreshed.refresh_token).toEqual(expect.any(String));
    expect(refreshed.refresh_token).not.toBe(token.refresh_token);
    expect(decodeJwt(refreshed.access_token)).toEqual(expect.objectContaining({ team_ids: [] }));
    expect(decodeJwt(refreshed.access_token).org_id).toBeUndefined();

    const replay = await auth.handler(
      new Request("https://id.example.test/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token ?? "",
        }),
      }),
    );
    expect(replay.status).toBe(400);
  });

});
