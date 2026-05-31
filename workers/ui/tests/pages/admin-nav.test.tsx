// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSidebarNav,
  AdminMobileNav,
  AdminMobileRouteTabs,
  AdminTopbar,
} from "@/app/admin/_components/admin-nav";
import { ADMIN_LOGIN_REDIRECT_URL } from "@/shared/constants";

const navigationMock = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

describe("Admin sidebar navigation", () => {
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
