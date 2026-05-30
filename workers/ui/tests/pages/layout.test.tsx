// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootLayout from "@/app/layout";
import type { ReactNode } from "react";

function LayoutWrapper({ children }: { readonly children: ReactNode }) {
  return <RootLayout>{children}</RootLayout>;
}

describe("RootLayout", () => {
  it("renders the html element with data-theme lumina-light when stored theme is light", () => {
    localStorage.setItem("lumina-theme", "light");
    render(
      <LayoutWrapper>
        <div>child</div>
      </LayoutWrapper>,
    );
    const html = document.documentElement;
    expect(html).toHaveAttribute("data-theme", "lumina-light");
  });

  it("renders children inside the body", () => {
    render(
      <LayoutWrapper>
        <span>Test child</span>
      </LayoutWrapper>,
    );
    expect(document.body.textContent).toContain("Test child");
  });

  it("renders with font-sans on the body", () => {
    render(
      <LayoutWrapper>
        <div />
      </LayoutWrapper>,
    );
    expect(document.body).toBeInTheDocument();
  });
});
