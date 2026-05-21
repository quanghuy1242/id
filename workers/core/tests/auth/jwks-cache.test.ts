import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/composition/create-app";
import type { CoreEnv } from "../../src/config/env";
import { JWKS_CACHE_MAX_AGE_SECONDS } from "../../src/shared/constants";
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

describe("JWKS edge cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves cached JWKS without touching Better Auth storage", async () => {
    const match = vi.fn<(request: Request) => Promise<Response | undefined>>(
      async () => Response.json({ keys: [{ kid: "cached" }] }),
    );
    const put = vi.fn<(request: Request, response: Response) => Promise<void>>(async () => undefined);
    vi.stubGlobal("caches", { default: { match, put } });

    const app = createApp();
    const db = {
      prepare: () => {
        throw new Error("D1 should not be touched on JWKS cache hit");
      },
    } as D1Database;
    const env = {
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "https://id.example.test",
      DB: db,
      KV: createKv(),
    } satisfies CoreEnv;

    const response = await app.request("/api/auth/jwks", {}, env);

    await expect(response.json()).resolves.toEqual({ keys: [{ kid: "cached" }] });
    expect(match).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  it("stores successful JWKS responses with a short public cache TTL", async () => {
    const match = vi.fn<(request: Request) => Promise<Response | undefined>>(async () => undefined);
    const put = vi.fn<(request: Request, response: Response) => Promise<void>>(async () => undefined);
    vi.stubGlobal("caches", { default: { match, put } });

    const response = await createApp().request("/api/auth/jwks", {}, await createEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(`public, max-age=${JWKS_CACHE_MAX_AGE_SECONDS}`);
    expect(put).toHaveBeenCalledOnce();
    const stored = put.mock.calls[0]?.[1] as Response;
    expect(stored.headers.get("cache-control")).toBe(`public, max-age=${JWKS_CACHE_MAX_AGE_SECONDS}`);
  });
});
