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

describe("JWKS routes", () => {
  it("lets Better Auth serve JWKS at /api/auth/jwks", async () => {
    const response = await createApp().request("/api/auth/jwks", {}, await createEnv());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { readonly keys?: readonly { readonly kid?: string }[] };
    expect(body.keys?.length).toBeGreaterThan(0);
    expect(body.keys?.[0]?.kid).toBeTypeOf("string");
  });

  it("does not serve the well-known JWKS alias", async () => {
    const response = await createApp().request("/.well-known/jwks.json", {}, await createEnv());

    expect(response.status).toBe(404);
  });
});
