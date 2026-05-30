// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSession, signOut, updateUser } from "@/app/admin/_actions/users";
import { mockUsers } from "@/app/admin/_mocks/users";

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

    await expect(signOut()).rejects.toThrow("bad");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("updates a user with object data and normalizes raw Better Auth responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockUsers[0]));

    await expect(updateUser("user_001", { name: "John Edited" })).resolves.toEqual({ user: mockUsers[0] });

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/admin/update-user", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ userId: "user_001", data: { name: "John Edited" } }),
    });
  });

  it("keeps update-user envelope responses compatible", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: mockUsers[1] }));

    await expect(updateUser("user_002", { email: "jane.edited@beta.com" })).resolves.toEqual({ user: mockUsers[1] });
  });
});
