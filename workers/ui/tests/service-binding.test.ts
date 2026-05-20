import { describe, expect, it } from "vitest";
import { proxyToCore } from "../src/lib/proxy";

function mockCoreResponse() {
  return new Response(JSON.stringify({ ok: true, service: "id-core" }), {
    headers: { "content-type": "application/json" },
  });
}

describe("UI auth proxy", () => {
  it("proxies GET through CORE_ID service binding", async () => {
    const env = {
      CORE_ID: { fetch: async () => mockCoreResponse() } as unknown as Fetcher,
    };
    const request = new Request("https://id-ui.local/api/auth/get-session");
    const res = await proxyToCore(request, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, service: "id-core" });
  });

  it("proxies POST through CORE_ID service binding", async () => {
    const env = {
      CORE_ID: { fetch: async () => mockCoreResponse() } as unknown as Fetcher,
    };
    const request = new Request("https://id-ui.local/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "test" }),
    });
    const res = await proxyToCore(request, env);
    expect(res.status).toBe(200);
  });
});
