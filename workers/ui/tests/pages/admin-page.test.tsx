// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlatformDashboardPage from "@/app/admin/platform/page";

describe("PlatformDashboardPage", () => {
  it("renders the dashboard title as a level-1 heading", () => {
    render(<PlatformDashboardPage />);
    expect(screen.getByRole("heading", { level: 1, name: /admin console/i })).toBeInTheDocument();
  });

  it("does not render shell chrome (header) — the layout owns that", () => {
    render(<PlatformDashboardPage />);
    expect(document.querySelector("header")).toBeNull();
  });

  it("renders quick-link section cards", () => {
    render(<PlatformDashboardPage />);
    expect(screen.getByRole("heading", { level: 3, name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "OAuth Applications" })).toBeInTheDocument();
  });

  it("links each section to its admin route", () => {
    render(<PlatformDashboardPage />);
    const links = screen.getAllByRole("link", { name: /open/i });
    expect(links.length).toBeGreaterThanOrEqual(6);
    expect(links.some((l) => l.getAttribute("href") === "/admin/platform/identity/users")).toBe(true);
  });
});
