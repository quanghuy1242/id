// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn<() => void>(),
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => "",
}));

vi.mock("@idco/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  authApiPost: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

describe("LoginPage", () => {
  it("renders sign in heading", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in");
  });

  it("renders within a Page component", () => {
    render(<LoginPage />);
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
  });

  it("renders within a Panel", () => {
    render(<LoginPage />);
    const panel = document.querySelector("section.card");
    expect(panel).toBeInTheDocument();
  });

  it("renders the LoginForm component", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders a submit button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
