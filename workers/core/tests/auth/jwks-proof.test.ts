import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authPluginConfig } from "../../src/auth/config";
import { getAuth } from "../../src/auth/get-auth";
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
    BETTER_AUTH_SECRET: "test-secret-with-enough-entropy-for-jwks-rotation",
    BETTER_AUTH_URL: "https://id.example.test",
    DB: db,
    KV: createKv(),
  };
}

async function signToken(
  auth: ReturnType<typeof getAuth>,
  issuer: string,
  audience: string,
  expiresAtSeconds: number,
): Promise<string> {
  const signed = await auth.api.signJWT({
    body: {
      payload: {
        aud: audience,
        exp: expiresAtSeconds,
        iss: issuer,
        scope: "api:read",
        sub: "user_1",
      },
    },
  });

  return signed.token;
}

async function fetchJwks(
  auth: ReturnType<typeof getAuth>,
): Promise<JSONWebKeySet> {
  const response = await auth.handler(
    new Request("https://id.example.test/api/auth/jwks"),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as JSONWebKeySet;
}

async function verifyToken(
  token: string,
  jwks: JSONWebKeySet,
  issuer: string,
  audience: string,
): Promise<string | undefined> {
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
    audience,
    issuer,
  });
  return payload.sub;
}

function tokenKid(token: string): string | undefined {
  return decodeProtectedHeader(token).kid;
}

describe("Better Auth JWKS signing and rotation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs with a new key after rotation interval and keeps the old key published during grace", async () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);

    const issuer = "https://id.example.test/api/auth";
    const audience = "https://api.example.test";
    const tokenExpiresAt = Math.floor(
      (start.getTime() +
        2 * authPluginConfig.jwksRotationIntervalSeconds * 1000) /
        1000,
    );
    const auth = getAuth(await createEnv());

    const oldToken = await signToken(auth, issuer, audience, tokenExpiresAt);
    const oldKid = tokenKid(oldToken);
    const oldJwks = await fetchJwks(auth);

    expect(oldKid).toBeTypeOf("string");
    expect(oldJwks.keys.map((key) => key.kid)).toContain(oldKid);
    await expect(
      verifyToken(oldToken, oldJwks, issuer, audience),
    ).resolves.toBe("user_1");

    vi.setSystemTime(
      new Date(
        start.getTime() +
          authPluginConfig.jwksRotationIntervalSeconds * 1000 +
          1,
      ),
    );

    const newToken = await signToken(auth, issuer, audience, tokenExpiresAt);
    const newKid = tokenKid(newToken);
    const rotatedJwks = await fetchJwks(auth);
    const publishedKids = rotatedJwks.keys.map((key) => key.kid);

    expect(newKid).toBeTypeOf("string");
    expect(newKid).not.toBe(oldKid);
    expect(publishedKids).toContain(newKid);
    expect(publishedKids).toContain(oldKid);
    await expect(
      verifyToken(newToken, rotatedJwks, issuer, audience),
    ).resolves.toBe("user_1");
    await expect(
      verifyToken(oldToken, rotatedJwks, issuer, audience),
    ).resolves.toBe("user_1");
  });
});
