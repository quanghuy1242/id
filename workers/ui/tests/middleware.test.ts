import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

function adminRequest(path: string, cookie?: string) {
  return new NextRequest(`https://id.quanghuy.dev${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function loginRequest(query: string, cookie?: string) {
  return new NextRequest(`https://id.quanghuy.dev/login${query}`, {
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

  it("matches /admin, nested admin pages, and the login page", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*", "/login"]);
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

  it("sends an already-authenticated admin from /login to the admin callback", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "admin" } }));

    const response = await proxy(
      loginRequest("?callbackURL=%2Fadmin%2Fidentity%2Fusers", "id-auth.session_token=admin"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/identity/users");
  });

  it("defaults an authenticated admin on /login without a callback to /admin", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "admin" } }));

    const response = await proxy(loginRequest("", "id-auth.session_token=admin"));

    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/admin");
  });

  it("ignores off-origin or non-admin callbacks when leaving /login", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "admin" } }));

    const response = await proxy(
      loginRequest("?callbackURL=https%3A%2F%2Fevil.example%2Fadmin", "id-auth.session_token=admin"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.origin).toBe("https://id.quanghuy.dev");
    expect(location.pathname).toBe("/admin");
  });

  it("shows the login form to unauthenticated visitors", async () => {
    mockedFetch().mockResolvedValue(Response.json(null));

    const response = await proxy(loginRequest("?callbackURL=%2Fadmin"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("shows the login form to authenticated non-admins so the error renders", async () => {
    mockedFetch().mockResolvedValue(Response.json({ user: { role: "user" } }));

    const response = await proxy(
      loginRequest("?callbackURL=%2Fadmin&error=admin_required", "id-auth.session_token=user"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("never intercepts an OAuth authorize request on /login", async () => {
    const response = await proxy(
      loginRequest("?client_id=app&redirect_uri=https%3A%2F%2Fapp%2Fcb", "id-auth.session_token=admin"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockedFetch()).not.toHaveBeenCalled();
  });
});
