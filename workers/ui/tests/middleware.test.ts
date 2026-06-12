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

const platformEnvelope = {
  actor: {
    userId: "usr_admin",
    email: "admin@example.test",
    canEnterConsole: true,
  },
  scopes: [
    {
      kind: "platform",
      id: "platform",
      label: "Platform",
      role: "platform-admin",
      permissions: ["platform:read"],
      requiresStepUp: true,
      stepUpSatisfied: true,
    },
    {
      kind: "organization",
      id: "organization:org_123",
      organizationId: "org_123",
      label: "Acme",
      role: "platform-admin",
      permissions: ["members:read"],
      requiresStepUp: false,
    },
  ],
  memberships: [],
  defaultScopeId: "platform",
};

const orgEnvelope = {
  actor: {
    userId: "usr_org",
    email: "owner@example.test",
    canEnterConsole: true,
  },
  scopes: [
    {
      kind: "organization",
      id: "organization:org_123",
      organizationId: "org_123",
      label: "Acme",
      role: "admin",
      permissions: ["members:read"],
      requiresStepUp: false,
    },
  ],
  memberships: [],
  defaultScopeId: "organization:org_123",
};

const memberEnvelope = {
  actor: {
    userId: "usr_member",
    email: "member@example.test",
    canEnterConsole: false,
  },
  scopes: [],
  memberships: [{ organizationId: "org_123", label: "Acme", role: "member" }],
  defaultScopeId: null,
};

describe("admin middleware", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches /admin, nested admin pages, and the login page", () => {
    expect(config.matcher).toEqual([
      "/admin",
      "/admin/:path*",
      "/account",
      "/account/:path*",
      "/login",
    ]);
  });

  it("redirects unauthenticated admin page requests to login with callbackURL", async () => {
    mockedFetch().mockResolvedValue(Response.json(null));

    const response = await proxy(
      adminRequest("/admin/identity/users?role=admin"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackURL")).toBe(
      "/admin/identity/users?role=admin",
    );
  });

  it("redirects unauthenticated account page requests to login with callbackURL", async () => {
    mockedFetch().mockResolvedValue(Response.json(null));

    const response = await proxy(
      adminRequest("/account/sessions?filter=active"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackURL")).toBe(
      "/account/sessions?filter=active",
    );
  });

  it("forwards the session cookie to the core session endpoint", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    await proxy(adminRequest("/admin/platform", "id-auth.session_token=abc"));

    const [url, init] = mockedFetch().mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/auth/admin/console-scopes");
    expect((init.headers as Record<string, string>).cookie).toBe(
      "id-auth.session_token=abc",
    );
  });

  it("redirects signed-in users without an operable console scope to account", async () => {
    mockedFetch().mockResolvedValue(Response.json(memberEnvelope));

    const response = await proxy(
      adminRequest("/admin", "id-auth.session_token=user"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/account");

    const [, init] = mockedFetch().mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe(
      "id-auth.session_token=user",
    );
  });

  it("redirects /admin to the default operable scope", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      adminRequest("/admin", "id-auth.session_token=admin"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/platform");
  });

  it("allows scoped console routes through when the envelope marks step-up satisfied", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      adminRequest("/admin/platform", "id-auth.session_token=admin"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    // Step-up rides on the console-scopes envelope; there is no second status request.
    expect(mockedFetch().mock.calls).toHaveLength(1);
  });

  it("requires step-up before rendering platform console routes", async () => {
    const stepUpPending = {
      ...platformEnvelope,
      scopes: platformEnvelope.scopes.map((scope) =>
        scope.kind === "platform"
          ? { ...scope, stepUpSatisfied: false }
          : scope,
      ),
    };
    mockedFetch().mockResolvedValue(Response.json(stepUpPending));

    const response = await proxy(
      adminRequest(
        "/admin/platform/identity/users",
        "id-auth.session_token=admin",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackURL")).toBe(
      "/admin/platform/identity/users",
    );
    expect(location.searchParams.get("stepUp")).toBe("platform");
    expect(mockedFetch().mock.calls).toHaveLength(1);
  });

  it("allows platform admins to enter organization scopes from the scope envelope", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      adminRequest(
        "/admin/orgs/org_123/identity/members",
        "id-auth.session_token=admin",
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects legacy platform routes to the canonical platform prefix", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      adminRequest(
        "/admin/identity/users?role=admin",
        "id-auth.session_token=admin",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/platform/identity/users");
    expect(location.searchParams.get("role")).toBe("admin");
  });

  it("redirects moved legacy admin routes to their canonical platform or org homes", async () => {
    mockedFetch().mockImplementation(() =>
      Promise.resolve(Response.json(platformEnvelope)),
    );

    const cases = [
      ["/admin/oauth", "/admin/platform/oauth/applications", ""],
      ["/admin/oauth/sessions-tokens", "/admin/platform/security/sessions", ""],
      [
        "/admin/oauth/resource-apis/rs_001/audit",
        "/admin/platform/access/resource-apis/rs_001/audit",
        "",
      ],
      [
        "/admin/oauth/scope-catalog?q=content",
        "/admin/platform/access/scope-catalog",
        "?q=content",
      ],
      [
        "/admin/oauth/m2m-bindings/bind_001",
        "/admin/platform/access/m2m-bindings/bind_001",
        "",
      ],
      ["/admin/security", "/admin/platform/security/sessions", ""],
      [
        "/admin/identity/organizations/org_123/teams",
        "/admin/platform/identity/organizations/org_123/teams",
        "",
      ],
      [
        "/admin/identity/registration-policies?selected=regpol_123",
        "/admin/platform/access/registration-policies",
        "?selected=regpol_123",
      ],
      [
        "/admin/platform/identity/registration-policies?status=enabled",
        "/admin/platform/access/registration-policies",
        "?status=enabled",
      ],
      [
        "/admin/orgs/org_123/identity/registration-policies?q=beta",
        "/admin/orgs/org_123/access/registration-policies",
        "?q=beta",
      ],
    ] as const;

    for (const [source, expectedPath, expectedSearch] of cases) {
      const response = await proxy(
        adminRequest(source, "id-auth.session_token=admin"),
      );
      const location = new URL(response.headers.get("location") ?? "");

      expect(response.status).toBe(307);
      expect(location.pathname).toBe(expectedPath);
      expect(location.search).toBe(expectedSearch);
    }
  });

  it("redirects org-only admins from legacy routes to their default org scope", async () => {
    mockedFetch().mockResolvedValue(Response.json(orgEnvelope));

    const response = await proxy(
      adminRequest("/admin/identity/users", "id-auth.session_token=org"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/orgs/org_123");
  });

  it("preserves legacy organization detail routes for org-only admins when authorized", async () => {
    mockedFetch().mockResolvedValue(Response.json(orgEnvelope));

    const response = await proxy(
      adminRequest(
        "/admin/identity/organizations/org_123/teams",
        "id-auth.session_token=org",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/orgs/org_123/identity/teams");
  });

  it("prevents opening an organization route outside the actor's operable scopes", async () => {
    mockedFetch().mockResolvedValue(Response.json(orgEnvelope));

    const response = await proxy(
      adminRequest(
        "/admin/orgs/org_other/identity/members",
        "id-auth.session_token=org",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/orgs/org_123");
  });

  it("fails closed when the session endpoint is unavailable", async () => {
    mockedFetch().mockRejectedValue(new Error("core unavailable"));

    const response = await proxy(adminRequest("/admin"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
  });

  it("sends an already-authenticated admin from /login to the admin callback", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      loginRequest(
        "?callbackURL=%2Fadmin%2Fidentity%2Fusers",
        "id-auth.session_token=admin",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/admin/platform/identity/users");
  });

  it("canonicalizes legacy organization callbacks to the actor's matching lens", async () => {
    mockedFetch().mockResolvedValueOnce(Response.json(platformEnvelope));

    const platformResponse = await proxy(
      loginRequest(
        "?callbackURL=%2Fadmin%2Fidentity%2Forganizations%2Forg_123%2Fteams",
        "id-auth.session_token=admin",
      ),
    );
    expect(
      new URL(platformResponse.headers.get("location") ?? "").pathname,
    ).toBe("/admin/platform/identity/organizations/org_123/teams");

    mockedFetch().mockResolvedValueOnce(Response.json(orgEnvelope));

    const orgResponse = await proxy(
      loginRequest(
        "?callbackURL=%2Fadmin%2Fidentity%2Forganizations%2Forg_123%2Fteams",
        "id-auth.session_token=org",
      ),
    );
    expect(new URL(orgResponse.headers.get("location") ?? "").pathname).toBe(
      "/admin/orgs/org_123/identity/teams",
    );
  });

  it("defaults an authenticated user on /login without a callback to account", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      loginRequest("", "id-auth.session_token=admin"),
    );

    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/account",
    );
  });

  it("ignores off-origin or non-app callbacks when leaving /login", async () => {
    mockedFetch().mockResolvedValue(Response.json(platformEnvelope));

    const response = await proxy(
      loginRequest(
        "?callbackURL=https%3A%2F%2Fevil.example%2Fadmin",
        "id-auth.session_token=admin",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.origin).toBe("https://id.quanghuy.dev");
    expect(location.pathname).toBe("/account");
  });

  it("allows signed-in users to view the platform step-up login screen", async () => {
    const response = await proxy(
      loginRequest(
        "?callbackURL=%2Fadmin%2Fplatform&stepUp=platform",
        "id-auth.session_token=admin",
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockedFetch()).not.toHaveBeenCalled();
  });

  it("shows the login form to unauthenticated visitors", async () => {
    mockedFetch().mockResolvedValue(Response.json(null));

    const response = await proxy(loginRequest("?callbackURL=%2Fadmin"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects authenticated users without console scope away from the login form", async () => {
    mockedFetch().mockResolvedValue(Response.json(memberEnvelope));

    const response = await proxy(
      loginRequest(
        "?callbackURL=%2Fadmin&error=admin_required",
        "id-auth.session_token=user",
      ),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/account");
  });

  it("never intercepts an OAuth authorize request on /login", async () => {
    const response = await proxy(
      loginRequest(
        "?client_id=app&redirect_uri=https%3A%2F%2Fapp%2Fcb",
        "id-auth.session_token=admin",
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockedFetch()).not.toHaveBeenCalled();
  });
});
