import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

function adminRequest(path: string, cookie?: string) {
  return new NextRequest(`https://id.quanghuy.dev${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function mockedFetch() {
  return vi.mocked(globalThis.fetch);
}

describe("admin middleware", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches /admin and nested admin pages", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*"]);
    expect(config.matcher).not.toContain("/login");
  });

  it("redirects unauthenticated admin page requests to login with callbackURL", async () => {
    mockedFetch().mockResolvedValue(Response.json(null));

    const response = await proxy(adminRequest("/admin/identity/users?role=admin"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackURL")).toBe("/admin/identity/users?role=admin");
  });

  it("forwards the session cookie to the core session endpoint", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "admin" } }));

    await proxy(adminRequest("/admin", "id-auth.session_token=abc"));

    const [url, init] = mockedFetch().mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/auth/get-session");
    expect(url.searchParams.get("disableRefresh")).toBe("true");
    expect(url.searchParams.get("disableCookieCache")).toBe("true");
    expect((init.headers as Record<string, string>).cookie).toBe("id-auth.session_token=abc");
  });

  it("redirects authenticated non-admin users with an admin-required error", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "user" } }));

    const response = await proxy(adminRequest("/admin", "id-auth.session_token=user"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackURL")).toBe("/admin");
    expect(location.searchParams.get("error")).toBe("admin_required");

    const [, init] = mockedFetch().mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe("id-auth.session_token=user");
  });

  it("allows admin users through", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "admin" } }));

    const response = await proxy(adminRequest("/admin", "id-auth.session_token=admin"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed when the session endpoint is unavailable", async () => {
    mockedFetch().mockRejectedValue(new Error("core unavailable"));

    const response = await proxy(adminRequest("/admin"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });
});
