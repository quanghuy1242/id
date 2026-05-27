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

  it("uses client_id in description", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_id=abc123&scope=openid")
    );
    expect(result.current).toBe("Client abc123 is requesting access. Scopes: openid");
  });

  it("falls back to default when client_id is not available", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("scope=openid")
    );
    expect(result.current).toBe("Client this application is requesting access. Scopes: openid");
  });

  it("includes scopes when present", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_id=abc123&scope=openid profile email")
    );
    expect(result.current).toContain("Scopes: openid profile email");
  });

  it("does not include scopes when empty", () => {
    const { result } = renderHook(() =>
      useOauthRequestDescription("client_id=abc123")
    );
    expect(result.current).not.toContain("Scopes:");
  });
});
