// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccountSummary,
  requestPasswordReset,
  revokeAccountSession,
  sendVerificationEmail,
  updateProfile,
} from "@/app/account/_actions/account";
import { mockAccountSummary } from "@/app/account/_mocks/account";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function lastCall() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

describe("account actions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads the current-user summary through the safe account endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockAccountSummary));

    await expect(getAccountSummary()).resolves.toEqual(mockAccountSummary);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/account/summary",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("updates only the supported profile fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: true }));

    await updateProfile({ name: "Huy", image: null });

    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/update-user");
    expect(JSON.parse(String(init.body))).toEqual({ name: "Huy" });
  });

  it("revokes sessions by id instead of exposing session tokens", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: true }));

    await revokeAccountSession("sess_123");

    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/account/sessions/revoke");
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: "sess_123" });
  });

  it("uses hosted account utility callback paths for recovery and verification", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: true }))
      .mockResolvedValueOnce(jsonResponse({ status: true }));

    await requestPasswordReset("person@example.test");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      email: "person@example.test",
      redirectTo: "/reset-password",
    });

    await sendVerificationEmail("person@example.test");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      email: "person@example.test",
      callbackURL: "/verify-email",
    });
  });
});
