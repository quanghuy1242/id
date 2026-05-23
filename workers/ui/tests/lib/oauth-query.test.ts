// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOauthQuery, useOauthRequestDescription } from "@/lib/oauth-query";

describe("useOauthQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty string initially", () => {
    const { result } = renderHook(() => useOauthQuery());
    expect(result.current).toBe("");
  });

  it("parses query string from window location", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      href: "http://localhost?client_id=test&scope=openid",
    } as Location);

    const { result } = renderHook(() => useOauthQuery());

    expect(result.current).toBe("client_id=test&scope=openid");
  });
});

describe("useOauthRequestDescription", () => {
  it("returns default message when no oauth query", () => {
    const { result } = renderHook(() => useOauthRequestDescription(""));
    expect(result.current).toBe("An application is requesting access.");
  });

  it("uses client_name when available", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_name=TestApp&scope=openid")
    );
    expect(result.current).toContain("TestApp");
  });

  it("falls back to client_id when client_name is not available", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_id=abc123&scope=openid")
    );
    expect(result.current).toContain("abc123");
  });

  it("includes scopes when present", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_name=TestApp&scope=openid profile email")
    );
    expect(result.current).toContain("Scopes: openid profile email");
  });

  it("does not include scopes when empty", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_name=TestApp")
    );
    expect(result.current).not.toContain("Scopes:");
  });

  it("uses fallback name when neither client_name nor client_id is present", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("scope=openid")
    );
    expect(result.current).toContain("this application");
  });
});
