// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminPage from "@/app/admin/page";

describe("AdminPage", () => {
  it("renders dashboard heading", () => {
    render(<AdminPage />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Dashboard");
  });

  it("renders in dashboard layout", () => {
    render(<AdminPage />);
    expect(document.querySelector("header")).toBeInTheDocument();
    expect(screen.getByText(/scaffold/i)).toBeInTheDocument();
  });

  it("renders a page header", () => {
    render(<AdminPage />);
    expect(document.querySelector("header")).toBeInTheDocument();
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
