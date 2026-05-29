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
    navigationMock.pathname = "/admin/oauth/sessions-tokens";

    render(<AdminSidebarNav />);

    expect(screen.getByRole("link", { name: "OAuth" })).not.toHaveClass("menu-active");
    expect(screen.getByRole("link", { name: "Sessions & Tokens" })).toHaveClass("menu-active");
  });

  it("keeps the OAuth section item active for nested configuration routes", () => {
    navigationMock.pathname = "/admin/oauth/resource-apis";

    render(<AdminSidebarNav />);

    expect(screen.getByRole("link", { name: "OAuth" })).toHaveClass("menu-active");
    expect(screen.getByRole("link", { name: "Sessions & Tokens" })).not.toHaveClass("menu-active");
  });
});

describe("Admin mobile navigation", () => {
  it("links dock section entries to primary routes", () => {
    navigationMock.pathname = "/admin";

    render(<AdminMobileNav />);

    expect(screen.getByRole("link", { name: "Identity" })).toHaveAttribute(
      "href",
      "/admin/identity/users",
    );
    expect(screen.getByRole("link", { name: "OAuth" })).toHaveAttribute(
      "href",
      "/admin/oauth/applications",
    );
  });

  it("keeps the section dock item active across sibling mobile routes", () => {
    navigationMock.pathname = "/admin/identity/organizations";

    render(<AdminMobileNav />);

    const identityLink = screen.getByRole("link", { name: "Identity" });
    expect(identityLink).toHaveClass("dock-active");
    expect(identityLink).toHaveAttribute("aria-current", "page");
  });

  it("renders mobile section tabs for the active section", () => {
    navigationMock.pathname = "/admin/identity/organizations";

    render(<AdminMobileRouteTabs />);

    expect(screen.getByRole("tablist", { name: "Identity section navigation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Users" })).toHaveAttribute("href", "/admin/identity/users");
    expect(screen.getByRole("tab", { name: "Organizations" })).toHaveClass("tab-active");
  });

  it("selects the most specific mobile section tab", () => {
    navigationMock.pathname = "/admin/oauth/sessions-tokens";

    render(<AdminMobileRouteTabs />);

    expect(screen.getByRole("tab", { name: "OAuth" })).not.toHaveClass("tab-active");
    expect(screen.getByRole("tab", { name: "Sessions & Tokens" })).toHaveClass("tab-active");
  });

  it("does not render mobile section tabs on dashboard", () => {
    navigationMock.pathname = "/admin";

    render(<AdminMobileRouteTabs />);

    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("OAuth layout", () => {
  it("renders configuration tabs on OAuth configuration routes", () => {
    navigationMock.pathname = "/admin/oauth/resource-apis";

    render(<OAuthLayout><div>Resource API content</div></OAuthLayout>);

    expect(screen.getByRole("tablist", { name: "OAuth configuration" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resource APIs" })).toHaveClass("tab-active");
  });

  it("does not stack configuration tabs above the sessions and tokens tabs", () => {
    navigationMock.pathname = "/admin/oauth/sessions-tokens";

    render(<OAuthLayout><div>Sessions and tokens content</div></OAuthLayout>);

    expect(screen.queryByRole("tablist", { name: "OAuth configuration" })).toBeNull();
    expect(screen.getByText("Sessions and tokens content")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });
});
