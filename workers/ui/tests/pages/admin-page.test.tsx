// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminPage from "@/app/admin/page";

describe("AdminPage", () => {
  it("renders dashboard content without an in-page title row", () => {
    render(<AdminPage />);
    expect(screen.queryByRole("heading", { level: 2, name: /dashboard/i })).toBeNull();
  });

  it("renders scaffold content without shell chrome", () => {
    render(<AdminPage />);
    expect(document.querySelector("header")).toBeNull();
    expect(screen.getByText(/scaffold/i)).toBeInTheDocument();
  });

  it("does not render a page header", () => {
    render(<AdminPage />);
    expect(document.querySelector("header")).toBeNull();
  });

  it("renders a page body", () => {
    render(<AdminPage />);
    expect(screen.getByText(/scaffold/i)).toBeInTheDocument();
  });

  it("shows deferred message", () => {
    render(<AdminPage />);
    expect(screen.getByText(/full admin ui deferred to later batch/i)).toBeInTheDocument();
  });
});
