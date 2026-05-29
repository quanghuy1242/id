// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SelectAuthorizationContextPage from "@/app/select-authorization-context/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn<() => void>(),
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => "",
  useOauthRequestDescription: () => "An application is requesting access.",
}));

vi.mock("@id/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  authApiPost: vi.fn<(...args: unknown[]) => void>(),
  authApiGetOrThrow: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]),
}));

describe("SelectAuthorizationContextPage", () => {
  it("renders choose access context heading", () => {
    render(<SelectAuthorizationContextPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Choose access context");
  });

  it("renders description text", () => {
    render(<SelectAuthorizationContextPage />);
    expect(screen.getByText(/select how you want to access this application/i)).toBeInTheDocument();
  });

  it("renders within a Page component", () => {
    render(<SelectAuthorizationContextPage />);
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
  });

  it("renders within a Panel", () => {
    render(<SelectAuthorizationContextPage />);
    const panel = document.querySelector("section.card");
    expect(panel).toBeInTheDocument();
  });

  it("renders the SelectContextForm component", () => {
    render(<SelectAuthorizationContextPage />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });
});
