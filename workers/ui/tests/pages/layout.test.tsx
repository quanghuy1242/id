// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import RootLayout from "@/app/layout";

type CookieStore = Awaited<ReturnType<typeof import("next/headers").cookies>>;
type Cookies = () => Promise<CookieStore>;

vi.mock("next/headers", () => ({
  cookies: vi.fn<Cookies>(),
}));

import { cookies } from "next/headers";
const mockCookies = vi.mocked(cookies);

function createCookieStore(value?: string): CookieStore {
  return {
    get: (name: string) => (name === "lumina-theme" ? { name, value } : undefined),
  } as CookieStore;
}

function withThemeCookie(value: string) {
  mockCookies.mockResolvedValue(createCookieStore(value));
}

async function renderLayout(children: ReactNode) {
  const element = await RootLayout({ children });
  render(element);
}

describe("RootLayout", () => {
  beforeEach(() => {
    mockCookies.mockResolvedValue(createCookieStore());
  });

  it("sets data-theme lumina-light when cookie is light", async () => {
    withThemeCookie("light");
    await renderLayout(<div>child</div>);
    expect(document.documentElement).toHaveAttribute("data-theme", "lumina-light");
  });

  it("sets data-theme lumina-dark when cookie is dark", async () => {
    withThemeCookie("dark");
    await renderLayout(<div>child</div>);
    expect(document.documentElement).toHaveAttribute("data-theme", "lumina-dark");
  });

  it("omits data-theme when cookie is system", async () => {
    withThemeCookie("system");
    await renderLayout(<div>child</div>);
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("omits data-theme when no cookie is set", async () => {
    await renderLayout(<div>child</div>);
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("renders children inside the body", async () => {
    await renderLayout(<span>Test child</span>);
    expect(document.body.textContent).toContain("Test child");
  });
});
