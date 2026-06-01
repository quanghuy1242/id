// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSidebarNav,
  AdminMobileNav,
  AdminMobileRouteTabs,
  AdminTopbar,
} from "@/app/admin/_components/admin-nav";
import { AdminScopeProvider } from "@/app/admin/_components/admin-scope-provider";
import { ADMIN_LOGIN_REDIRECT_URL } from "@/shared/constants";
import type { ConsoleScopeEnvelope } from "@id/lib";

const navigationMock = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

const orgScopeEnvelope: ConsoleScopeEnvelope = {
  actor: { userId: "user_001", email: "quanghuy1242@gmail.com", canEnterConsole: true },
  defaultScopeId: "organization:org_001",
  memberships: [],
  scopes: [
    {
      kind: "platform",
      id: "platform",
      label: "Platform",
      role: "platform-admin",
      permissions: ["platform:read"],
      requiresStepUp: true,
    },
    {
      kind: "organization",
      id: "organization:org_001",
      organizationId: "org_001",
      label: "Default",
      role: "owner",
      permissions: ["members:read", "members:write", "oauth-clients:read", "resource-servers:read", "security-audit:read"],
      requiresStepUp: false,
    },
  ],
};

const platformOnlyEnvelope: ConsoleScopeEnvelope = {
  actor: { userId: "user_001", email: "quanghuy1242@gmail.com", canEnterConsole: true },
  defaultScopeId: "platform",
  memberships: [],
  scopes: [
    {
      kind: "platform",
      id: "platform",
      label: "Platform",
      role: "platform-admin",
      permissions: ["platform:read", "organizations:read", "oauth-clients:read", "resource-servers:read", "security-audit:read", "jwks:read"],
      requiresStepUp: true,
    },
  ],
};

describe("Admin sidebar navigation", () => {
  it("flattens single-item nav groups", () => {
    navigationMock.pathname = "/admin/platform";

    const { container } = render(<AdminSidebarNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("menu-active");
    expect(container.querySelectorAll("details")).toHaveLength(3);
    expect(screen.queryByText("Overview")).toBeNull();
  });

  it("activates only the most specific sidebar item", () => {
    navigationMock.pathname = "/admin/platform/security/sessions";

    render(<AdminSidebarNav />);

    expect(screen.getByRole("link", { name: "Applications" })).not.toHaveClass("menu-active");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveClass("menu-active");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute(
      "href",
      "/admin/platform/security/sessions",
    );
  });

  it("keeps the security section item active across grants sub-routes", () => {
    navigationMock.pathname = "/admin/platform/security/jwks";

    render(<AdminSidebarNav />);

    expect(screen.getByRole("link", { name: "JWKS" })).toHaveClass("menu-active");
  });

  it("keeps the OAuth section item active for nested configuration routes", () => {
    navigationMock.pathname = "/admin/platform/oauth/applications";

    render(<AdminSidebarNav />);

    expect(screen.getByRole("link", { name: "Applications" })).toHaveClass("menu-active");
    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "href",
      "/admin/platform/oauth/applications",
    );
    expect(screen.getByRole("link", { name: "Sessions" })).not.toHaveClass("menu-active");
  });

  it("labels the scoped organization landing route as overview", () => {
    navigationMock.pathname = "/admin/orgs/org_001";

    render(
      <AdminScopeProvider
        initialEnvelope={orgScopeEnvelope}
        actions={{ getConsoleScopes: vi.fn<() => Promise<ConsoleScopeEnvelope>>().mockResolvedValue(orgScopeEnvelope) }}
      >
        <AdminSidebarNav />
      </AdminScopeProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveClass("menu-active");
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });
});

describe("Admin mobile navigation", () => {
  it("links dock section entries to primary routes", () => {
    navigationMock.pathname = "/admin/platform";

    render(<AdminMobileNav />);

    expect(screen.getByRole("link", { name: "Identity" })).toHaveAttribute(
      "href",
      "/admin/platform/identity/users",
    );
    expect(screen.getByRole("link", { name: "Apps" })).toHaveAttribute(
      "href",
      "/admin/platform/oauth/applications",
    );
  });

  it("does not link the platform dock to an unimplemented audit route", () => {
    navigationMock.pathname = "/admin/platform";

    render(<AdminMobileNav />);

    expect(screen.queryByRole("link", { name: "Audit" })).toBeNull();
  });

  it("keeps the section dock item active across sibling mobile routes", () => {
    navigationMock.pathname = "/admin/platform/identity/organizations";

    render(<AdminMobileNav />);

    const identityLink = screen.getByRole("link", { name: "Identity" });
    expect(identityLink).toHaveClass("dock-active");
    expect(identityLink).toHaveAttribute("aria-current", "page");
  });

  it("renders mobile section tabs for the active section", () => {
    navigationMock.pathname = "/admin/platform/identity/organizations";

    render(<AdminMobileRouteTabs />);

    expect(screen.getByRole("tablist", { name: "Identity section navigation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Users" })).toHaveAttribute("href", "/admin/platform/identity/users");
    expect(screen.getByRole("tab", { name: "Organizations" })).toHaveClass("tab-active");
  });

  it("selects the most specific mobile section tab", () => {
    navigationMock.pathname = "/admin/platform/identity/organizations";

    render(<AdminMobileRouteTabs />);

    expect(screen.getByRole("tab", { name: "Users" })).not.toHaveClass("tab-active");
    expect(screen.getByRole("tab", { name: "Organizations" })).toHaveClass("tab-active");
  });

  it("does not render mobile section tabs on dashboard", () => {
    navigationMock.pathname = "/admin/platform";

    render(<AdminMobileRouteTabs />);

    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders mobile section tabs in scoped organization context", () => {
    navigationMock.pathname = "/admin/orgs/org_001/identity/invitations";

    render(
      <AdminScopeProvider
        initialEnvelope={orgScopeEnvelope}
        actions={{ getConsoleScopes: vi.fn<() => Promise<ConsoleScopeEnvelope>>().mockResolvedValue(orgScopeEnvelope) }}
      >
        <AdminMobileRouteTabs />
      </AdminScopeProvider>,
    );

    expect(screen.getByRole("tablist", { name: "Identity section navigation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("href", "/admin/orgs/org_001/identity/members");
    expect(screen.getByRole("tab", { name: "Invitations" })).toHaveClass("tab-active");
  });

  it("labels the scoped organization dock entry as overview", () => {
    navigationMock.pathname = "/admin/orgs/org_001";

    render(
      <AdminScopeProvider
        initialEnvelope={orgScopeEnvelope}
        actions={{ getConsoleScopes: vi.fn<() => Promise<ConsoleScopeEnvelope>>().mockResolvedValue(orgScopeEnvelope) }}
      >
        <AdminMobileNav />
      </AdminScopeProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveClass("dock-active");
    expect(screen.queryByRole("link", { name: "Dash" })).toBeNull();
  });

  it("uses the organization route lens for dock links before the scope envelope includes that org", () => {
    navigationMock.pathname = "/admin/orgs/org_404";

    render(
      <AdminScopeProvider
        initialEnvelope={platformOnlyEnvelope}
        actions={{ getConsoleScopes: vi.fn<() => Promise<ConsoleScopeEnvelope>>().mockResolvedValue(platformOnlyEnvelope) }}
      >
        <AdminMobileNav />
      </AdminScopeProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/admin/orgs/org_404");
    expect(screen.getByRole("link", { name: "Identity" })).toHaveAttribute("href", "/admin/orgs/org_404/identity/members");
    expect(screen.queryByRole("link", { name: "Dash" })).toBeNull();
  });
});

describe("Admin topbar", () => {
  it("routes successful admin logout back to the admin login callback", () => {
    expect(ADMIN_LOGIN_REDIRECT_URL).toBe("/login?callbackURL=%2Fadmin");
  });

  it("renders the scope picker as the first breadcrumb item", () => {
    navigationMock.pathname = "/admin/platform/access/resource-apis";

    render(<AdminTopbar />);

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("button", { name: /select console scope/i })).toHaveTextContent("Platform");
    expect(breadcrumb).toHaveTextContent("Resource APIs");
  });

  it("highlights the selected scope badge in the dropdown", async () => {
    navigationMock.pathname = "/admin/platform/access/admins-roles";
    const envelope: ConsoleScopeEnvelope = {
      actor: { userId: "user_001", email: "quanghuy1242@gmail.com", canEnterConsole: true },
      defaultScopeId: "platform",
      memberships: [],
      scopes: [
        {
          kind: "platform",
          id: "platform",
          label: "Platform",
          role: "platform-admin",
          permissions: ["platform:read"],
          requiresStepUp: true,
        },
        {
          kind: "organization",
          id: "organization:org_001",
          organizationId: "org_001",
          label: "Default",
          role: "platform-admin",
          permissions: ["members:read"],
          requiresStepUp: false,
        },
      ],
    };

    render(
      <AdminScopeProvider
        initialEnvelope={envelope}
        actions={{ getConsoleScopes: vi.fn<() => Promise<ConsoleScopeEnvelope>>().mockResolvedValue(envelope) }}
      >
        <AdminTopbar />
      </AdminScopeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /select console scope/i }));
    const menu = await screen.findByRole("menu");
    const selectedBadge = within(menu).getAllByText("Platform").find((element) => element.classList.contains("badge"));
    expect(selectedBadge).toBeDefined();
    expect(selectedBadge!).toHaveClass("badge-accent");
    expect(within(menu).getByText("platform-admin")).toHaveClass("badge-neutral");
  });

  it("maps org identity scope switching back to the implemented platform organization list", async () => {
    navigationMock.pathname = "/admin/orgs/org_001/identity/members";

    render(
      <AdminScopeProvider
        initialEnvelope={orgScopeEnvelope}
        actions={{ getConsoleScopes: vi.fn<() => Promise<ConsoleScopeEnvelope>>().mockResolvedValue(orgScopeEnvelope) }}
      >
        <AdminTopbar />
      </AdminScopeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /select console scope/i }));
    const menu = await screen.findByRole("menu");
    const platformItem = within(menu).getAllByRole("menuitem").find((item) => item.textContent?.includes("Platform"));

    expect(platformItem).toHaveAttribute("href", "/admin/platform/identity/organizations");
  });

  it("wires the avatar menu logout action", async () => {
    const onLogout = vi.fn<() => void>();
    render(<AdminTopbar onLogout={onLogout} />);

    fireEvent.click(screen.getByRole("button", { name: /open account menu/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /logout/i }));
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/complete mfa/i);
    fireEvent.click(screen.getByRole("button", { name: /^log out$/i }));

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });
});
