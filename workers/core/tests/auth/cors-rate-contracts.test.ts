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
    ID_BOOTSTRAP_TOKEN: "test-bootstrap-token-v1",
    DB: db,
    KV: createKv(),
  };
}

describe("OAuth endpoint transport contracts", () => {
  it("keeps OAuth endpoints same-origin by not emitting broad CORS headers", async () => {
    const app = createApp();
    const env = await createEnv();
    const response = await app.request(
      "/api/auth/oauth2/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://other.example.test",
        },
        body: new URLSearchParams({ grant_type: "password" }),
      },
      env,
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("does not emit Better Auth rate-limit headers when repo rate limiting is disabled", async () => {
    const app = createApp();
    const env = await createEnv();
    const response = await app.request("/api/auth/get-session", { method: "GET" }, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBeNull();
    expect(response.headers.get("x-ratelimit-remaining")).toBeNull();
    expect(response.headers.get("x-ratelimit-reset")).toBeNull();
  });
});
