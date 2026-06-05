import { describe, expect, it } from "vitest";
import { createApp } from "../../src/composition/create-app";
import type { CoreEnv } from "../../src/config/env";
import { createMemoryD1 } from "./d1-test-helper";

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

async function createEnv(): Promise<CoreEnv> {
  const { db } = await createMemoryD1();
  return {
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "https://id.example.test",
    DB: db,
    KV: createKv(),
  };
}

const METADATA_CACHE_CONTROL =
  "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400";
const BASE_URL = "https://id.example.test/api/auth";

const oauthMetadataPaths = [
  "/api/auth/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/api/auth",
] as const;

const oidcMetadataPaths = [
  "/api/auth/.well-known/openid-configuration",
  "/.well-known/openid-configuration",
  "/.well-known/openid-configuration/api/auth",
] as const;

function expectOAuthMetadata(body: Record<string, unknown>) {
  expect(body.issuer).toBe(BASE_URL);
  expect(body.authorization_endpoint).toBe(`${BASE_URL}/oauth2/authorize`);
  expect(body.token_endpoint).toBe(`${BASE_URL}/oauth2/token`);
  expect(body.jwks_uri).toBe(`${BASE_URL}/jwks`);
  expect(body.registration_endpoint).toBe(`${BASE_URL}/oauth2/register`);
  expect(body.introspection_endpoint).toBe(`${BASE_URL}/oauth2/introspect`);
  expect(body.revocation_endpoint).toBe(`${BASE_URL}/oauth2/revoke`);
  expect(body.response_types_supported).toEqual(["code"]);
  expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  expect(body.authorization_response_iss_parameter_supported).toBe(true);

  expect(body.grant_types_supported).toEqual([
    "authorization_code",
    "client_credentials",
    "refresh_token",
  ]);

  expect(body.token_endpoint_auth_methods_supported).toEqual([
    "client_secret_basic",
    "client_secret_post",
  ]);
}

function expectOidcMetadata(body: Record<string, unknown>) {
  expectOAuthMetadata(body);
  expect(body.userinfo_endpoint).toBe(`${BASE_URL}/oauth2/userinfo`);
  expect(body.end_session_endpoint).toBe(`${BASE_URL}/oauth2/end-session`);
  expect(body.subject_types_supported).toEqual(["public"]);
}

describe("well-known endpoints", () => {
  it.each(oauthMetadataPaths)(
    "serves OAuth authorization server metadata at %s",
    async (path) => {
      const app = createApp();
      const env = await createEnv();

      const response = await app.request(path, {}, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe(
        METADATA_CACHE_CONTROL,
      );

      const body = (await response.json()) as Record<string, unknown>;
      expectOAuthMetadata(body);
    },
  );

  it.each(oidcMetadataPaths)("serves OIDC discovery at %s", async (path) => {
    const app = createApp();
    const env = await createEnv();

    const response = await app.request(path, {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe(METADATA_CACHE_CONTROL);

    const body = (await response.json()) as Record<string, unknown>;
    expectOidcMetadata(body);
  });

  it("does not serve well-known metadata for non-GET requests", async () => {
    const app = createApp();
    const env = await createEnv();

    for (const path of [...oauthMetadataPaths, ...oidcMetadataPaths]) {
      const response = await app.request(path, { method: "POST" }, env);
      expect(response.status).toBe(404);
    }
  });
});
