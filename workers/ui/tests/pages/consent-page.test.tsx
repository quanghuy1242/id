// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ConsentPage from "@/app/consent/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn<() => void>(),
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => "",
}));

vi.mock("@id/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  postAuthApi: vi.fn<(...args: unknown[]) => void>(),
}));

describe("ConsentPage", () => {
  it("renders authorize application heading", () => {
    render(<ConsentPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Authorize application");
  });

  it("renders within a Page component", () => {
    render(<ConsentPage />);
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
  });

  it("renders within a Panel", () => {
    render(<ConsentPage />);
    const panel = document.querySelector("section.card");
    expect(panel).toBeInTheDocument();
  });

  it("renders the ConsentForm component", () => {
    render(<ConsentPage />);
    expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });
});
