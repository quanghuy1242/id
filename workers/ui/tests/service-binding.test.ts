import { describe, expect, it } from "vitest";
import app from "../src/main";
import type { UiEnv } from "../src/lib/env";

function createEnv(): { readonly env: UiEnv; readonly calls: readonly string[] } {
  const calls: string[] = [];
  const env = {
    CORE_ID: {
      fetch: async (input: RequestInfo | URL) => {
        calls.push(input instanceof Request ? input.url : String(input));
        return Response.json({ ok: true, service: "id-core" });
      },
    } as Fetcher,
  };
  return { env, calls };
}

describe("ui worker service binding", () => {
  it("routes admin health through CORE_ID", async () => {
    const { env, calls } = createEnv();
    const res = await app.request("/admin", {}, env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ admin: "id-ui", coreReachable: true });
    expect(calls).toEqual(["https://core-id.local/health"]);
  });

  it("proxies admin API requests through CORE_ID", async () => {
    const { env, calls } = createEnv();
    const res = await app.request("/admin/api/dashboard", {}, env);

    expect(res.status).toBe(200);
    expect(calls).toEqual(["https://core-id.local/api/admin/dashboard"]);
  });

  it("serves minimal login and consent pages", async () => {
    const { env } = createEnv();
    const login = await app.request("/admin/login?client_id=client_1&sig=sig_1", {}, env);
    const consent = await app.request("/admin/consent?client_id=client_1&scope=openid", {}, env);

    expect(login.status).toBe(200);
    expect(await login.text()).toContain("oauth_query");
    expect(consent.status).toBe(200);
    expect(await consent.text()).toContain("/api/auth/oauth2/consent");
  });

  it("proxies auth API requests through CORE_ID", async () => {
    const { env, calls } = createEnv();
    const res = await app.request("/api/auth/get-session", {}, env);

    expect(res.status).toBe(200);
    expect(calls).toEqual(["https://core-id.local/api/auth/get-session"]);
  });
});
