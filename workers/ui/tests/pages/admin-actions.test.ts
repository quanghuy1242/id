// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSession, signOut } from "@/app/admin/_actions/users";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("admin auth actions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the current session without cache or cookie-cache reuse", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));

    await expect(getCurrentSession()).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/get-session?disableRefresh=true&disableCookieCache=true",
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
  });

  it("clears the session with a single credentialed sign-out POST", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await expect(signOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    });
  });

  it("rejects on a failed sign-out response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "bad" }, { status: 500 }));

    await expect(signOut()).rejects.toThrow("Sign-out failed with status 500");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
