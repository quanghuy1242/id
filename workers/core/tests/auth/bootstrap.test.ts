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

describe("bootstrap admin route", () => {
  it("creates one native admin and refuses to run again", async () => {
    const app = createApp();
    const env = await createEnv();

    const unauthorized = await app.request(
      "/api/bootstrap/admin",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer wrong" },
        body: JSON.stringify({
          email: "root@example.test",
          password: "password12345",
          name: "Root Admin",
        }),
      },
      env,
    );
    expect(unauthorized.status).toBe(401);

    const bootstrapped = await app.request(
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
      env,
    );
    expect(bootstrapped.status).toBe(200);
    await expect(bootstrapped.json()).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          email: "root@example.test",
          role: "admin",
        }),
        bootstrap: "completed",
      }),
    );

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

    const secondRun = await app.request(
      "/api/bootstrap/admin",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-bootstrap-token-v1" },
        body: JSON.stringify({
          email: "other@example.test",
          password: "password12345",
          name: "Other Admin",
        }),
      },
      env,
    );
    expect(secondRun.status).toBe(403);
  });
});
