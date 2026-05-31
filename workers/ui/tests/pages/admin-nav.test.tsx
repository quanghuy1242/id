// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSidebarNav,
  AdminMobileNav,
  AdminMobileRouteTabs,
  AdminTopbar,
} from "@/app/admin/_components/admin-nav";
import OAuthLayout from "@/app/admin/oauth/layout";
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

describe("OAuth layout", () => {
  it("renders configuration tabs on OAuth listing routes only", () => {
    const cases = [
      ["/admin/oauth/applications", "Applications"],
      ["/admin/oauth/resource-apis", "Resource APIs"],
      ["/admin/oauth/scope-catalog", "Scope Catalog"],
      ["/admin/oauth/m2m-bindings", "M2M Bindings"],
    ] as const;

    for (const [pathname, activeLabel] of cases) {
      navigationMock.pathname = pathname;

      const { unmount } = render(<OAuthLayout><div>{activeLabel} content</div></OAuthLayout>);

      expect(screen.getByRole("tablist", { name: "OAuth configuration" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: activeLabel })).toHaveClass("tab-active");

      unmount();
    }
  });

  it("does not render configuration tabs outside OAuth configuration routes", () => {
    navigationMock.pathname = "/admin/security/sessions";

    render(<OAuthLayout><div>Some other content</div></OAuthLayout>);

    expect(screen.queryByRole("tablist", { name: "OAuth configuration" })).toBeNull();
    expect(screen.getByText("Some other content")).toBeInTheDocument();
  });

  it("hides configuration tabs on OAuth detail and create routes", () => {
    const hiddenCases = [
      ["/admin/oauth", "OAuth redirect"],
      ["/admin/oauth/applications/new", "Application create"],
      ["/admin/oauth/applications/cli_123", "Application detail"],
      ["/admin/oauth/resource-apis/rs_001", "Resource API detail"],
      ["/admin/oauth/m2m-bindings/bind_001", "M2M binding detail"],
    ] as const;

    for (const [pathname, label] of hiddenCases) {
      navigationMock.pathname = pathname;

      const { unmount } = render(<OAuthLayout><div>{label}</div></OAuthLayout>);

      expect(screen.queryByRole("tablist", { name: "OAuth configuration" })).toBeNull();
      expect(screen.getByText(label)).toBeInTheDocument();

      unmount();
    }
  });
});

describe("Admin topbar", () => {
  it("routes successful admin logout back to the admin login callback", () => {
    expect(ADMIN_LOGIN_REDIRECT_URL).toBe("/login?callbackURL=%2Fadmin");
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
