// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminMobileNav, AdminMobileRouteTabs } from "@/app/admin/_components/admin-nav";

const navigationMock = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

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

  it("does not render mobile section tabs on dashboard", () => {
    navigationMock.pathname = "/admin";

    render(<AdminMobileRouteTabs />);

    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
