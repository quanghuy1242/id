// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminPage from "@/app/admin/page";

describe("AdminPage", () => {
  it("renders id admin heading", () => {
    render(<AdminPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("id admin");
  });

  it("renders in dashboard layout", () => {
    render(<AdminPage />);
    const main = document.querySelector("main");
    expect(main).toHaveClass("flex", "flex-col");
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
