// @vitest-environment jsdom
//
// Imports the helpers from the real source (relative path) rather than the
// `@id/lib` alias, because other barrel tests `vi.mock("@id/lib", …)` with a
// partial factory — the alias is globally mocked for the whole run, so a direct
// source import is the only way to exercise the real PATCH/DELETE helpers here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authApiGetOrThrow,
  authApiPostOrThrow,
  authApiPatchOrThrow,
  authApiDeleteOrThrow,
} from "../../../../packages/lib/src/auth-fetch";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function lastCall() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

describe("auth-fetch helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("GET serialises query params and prefixes /api/auth", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await authApiGetOrThrow("/admin/resource-servers", { limit: 25, skip: "" });
    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/admin/resource-servers?limit=25");
    expect(init.headers).toMatchObject({ accept: "application/json" });
  });

  it("POST sends a JSON body with content-type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "x" }));
    await authApiPostOrThrow("/oauth2/create-client", { client_name: "App" });
    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/oauth2/create-client");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ client_name: "App" });
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
  });

  it("PATCH sends a flat JSON body with the PATCH method", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "rs1" }));
    await authApiPatchOrThrow("/admin/resource-servers/rs1", { name: "X", description: null });
    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/admin/resource-servers/rs1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ name: "X", description: null });
  });

  it("DELETE uses the DELETE method and no body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await authApiDeleteOrThrow("/admin/oauth-client-resource-scopes/b1");
    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/admin/oauth-client-resource-scopes/b1");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("PATCH throws on a non-2xx response with the body text", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "bad" }, { status: 400 }));
    await expect(authApiPatchOrThrow("/admin/oauth-scopes/sc1", { enabled: false })).rejects.toThrow(/bad/);
  });

  it("DELETE throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "nope" }, { status: 404 }));
    await expect(authApiDeleteOrThrow("/admin/resource-servers/rs1")).rejects.toThrow(/nope/);
  });
});
