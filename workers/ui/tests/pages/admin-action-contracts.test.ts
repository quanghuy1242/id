// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAdminConsents,
  listAdminJwks,
  listAdminSessions,
  listAdminTokens,
  listActivityLog,
  introspectToken,
  revokeAdminSession,
  revokeConsent,
  rotateAdminJwks,
} from "@/app/admin/_actions/audit";
import { listAdminsRoles } from "@/app/admin/_actions/access";
import {
  createBinding,
  createClient,
  createResourceServer,
  createScope,
  deleteBinding,
  deleteClient,
  deleteResourceServer,
  disableResourceServer,
  enableResourceServer,
  listBindings,
  listClients,
  listResourceServers,
  listScopes,
  rotateClientSecret,
  updateBinding,
  updateClient,
  updateResourceServer,
  updateScope,
} from "@/app/admin/_actions/oauth";
import { mockBindings, mockClients, mockResourceServers, mockScopes } from "@/app/admin/_mocks/oauth";
import { mockMembers, mockOrganizations } from "@/app/admin/_mocks/organizations";
import { mockUsers } from "@/app/admin/_mocks/users";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function emptyResponse(): Response {
  return new Response(null, { status: 200 });
}

function lastCall() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

function jsonBody(): unknown {
  return JSON.parse(String(lastCall().init.body));
}

describe("admin action contracts", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("matches Better Auth OAuth client runtime shapes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(null));
    await expect(listClients()).resolves.toEqual([]);
    expect(lastCall().url).toBe("/api/auth/oauth2/get-clients");

    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(mockClients[1]));
    await createClient({
      client_name: "Admin Client",
      token_endpoint_auth_method: "none",
      redirect_uris: ["https://admin.example.com/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    expect(lastCall().url).toBe("/api/auth/oauth2/create-client");
    expect(jsonBody()).toEqual({
      client_name: "Admin Client",
      token_endpoint_auth_method: "none",
      redirect_uris: ["https://admin.example.com/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(mockClients[1]));
    await updateClient("cli_admin", { redirect_uris: ["https://admin.example.com/callback"] });
    expect(lastCall().url).toBe("/api/auth/oauth2/update-client");
    expect(jsonBody()).toEqual({
      client_id: "cli_admin",
      update: { redirect_uris: ["https://admin.example.com/callback"] },
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse({ ...mockClients[2], client_secret: "sk-rotated" }));
    await expect(rotateClientSecret("cli_portal")).resolves.toMatchObject({ client_secret: "sk-rotated" });
    expect(jsonBody()).toEqual({ client_id: "cli_portal" });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(emptyResponse());
    await expect(deleteClient("cli_portal")).resolves.toBeUndefined();
    expect(lastCall().url).toBe("/api/auth/oauth2/delete-client");
    expect(jsonBody()).toEqual({ client_id: "cli_portal" });
  });

  it("syncs the active-organization bridge before OAuth client actions", async () => {
    const orgClients = [
      { ...mockClients[0], reference_id: "org_001" },
      { ...mockClients[1], reference_id: "org_002" },
    ];
    fetchMock
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(jsonResponse(orgClients));

    await expect(listClients({ kind: "organization", organizationId: "org_001" })).resolves.toEqual([orgClients[0]]);

    const [setActiveUrl, setActiveInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(setActiveUrl).toBe("/api/auth/organization/set-active");
    expect(JSON.parse(String(setActiveInit.body))).toEqual({ organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/oauth2/get-clients");
  });

  it("unwraps repo-owned OAuth admin plugin envelopes and preserves flat mutation bodies", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ resourceServers: mockResourceServers }));
    await expect(listResourceServers()).resolves.toEqual(mockResourceServers);
    expect(lastCall().url).toBe("/api/auth/admin/resource-servers");

    fetchMock.mockResolvedValueOnce(jsonResponse({ resourceServers: [mockResourceServers[0]] }));
    await expect(listResourceServers({ kind: "organization", organizationId: "org_001" })).resolves.toEqual([mockResourceServers[0]]);
    expect(lastCall().url).toBe("/api/auth/admin/resource-servers?organizationId=org_001");

    fetchMock.mockResolvedValueOnce(jsonResponse(mockResourceServers[0]));
    await createResourceServer({ name: "Content API", slug: "content-api", audience: "https://content.example.com", description: "Main content API", organizationId: "org_001" });
    expect(jsonBody()).toEqual({ name: "Content API", slug: "content-api", audience: "https://content.example.com", description: "Main content API", organizationId: "org_001" });

    fetchMock.mockResolvedValueOnce(jsonResponse(mockResourceServers[0]));
    await updateResourceServer("rs_001", { description: null });
    expect(lastCall().init.method).toBe("PATCH");
    expect(lastCall().url).toBe("/api/auth/admin/resource-servers/rs_001");
    expect(jsonBody()).toEqual({ description: null });

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...mockResourceServers[0], enabled: false }));
    await disableResourceServer("rs_001", { kind: "organization", organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/admin/resource-servers/rs_001/disable?organizationId=org_001");

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...mockResourceServers[0], enabled: true }));
    await enableResourceServer("rs_001", { kind: "organization", organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/admin/resource-servers/rs_001/enable?organizationId=org_001");

    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await deleteResourceServer("rs_001", { kind: "organization", organizationId: "org_001" });
    expect(lastCall().init.method).toBe("DELETE");
    expect(lastCall().url).toBe("/api/auth/admin/resource-servers/rs_001?organizationId=org_001");

    fetchMock.mockResolvedValueOnce(jsonResponse({ oauthScopes: mockScopes }));
    await expect(listScopes()).resolves.toEqual(mockScopes);

    fetchMock.mockResolvedValueOnce(jsonResponse({ oauthScopes: [mockScopes[0]] }));
    await expect(listScopes({ kind: "organization", organizationId: "org_001" })).resolves.toEqual([mockScopes[0]]);
    expect(lastCall().url).toBe("/api/auth/admin/oauth-scopes?organizationId=org_001");

    fetchMock.mockResolvedValueOnce(jsonResponse(mockScopes[0]));
    await createScope({ resourceServerId: "rs_001", scope: "content:read", description: "Read" }, { kind: "organization", organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/admin/oauth-scopes?organizationId=org_001");
    expect(jsonBody()).toEqual({ resourceServerId: "rs_001", scope: "content:read", description: "Read" });

    fetchMock.mockResolvedValueOnce(jsonResponse(mockScopes[0]));
    await updateScope("sc_001", { enabled: false }, { kind: "organization", organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/admin/oauth-scopes/sc_001?organizationId=org_001");
    expect(jsonBody()).toEqual({ enabled: false });

    fetchMock.mockResolvedValueOnce(jsonResponse({ oauthClientResourceScopes: mockBindings }));
    await expect(listBindings()).resolves.toEqual(mockBindings);

    fetchMock.mockResolvedValueOnce(jsonResponse({ oauthClientResourceScopes: [mockBindings[0]] }));
    await expect(listBindings({ kind: "organization", organizationId: "org_001" })).resolves.toEqual([mockBindings[0]]);
    expect(lastCall().url).toBe("/api/auth/admin/oauth-client-resource-scopes?organizationId=org_001");

    fetchMock.mockResolvedValueOnce(jsonResponse(mockBindings[0]));
    await createBinding({ clientId: "cli_content", resourceServerId: "rs_001", allowedScopes: ["content:read"] }, { kind: "organization", organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/admin/oauth-client-resource-scopes?organizationId=org_001");
    expect(jsonBody()).toEqual({ clientId: "cli_content", resourceServerId: "rs_001", allowedScopes: ["content:read"] });

    fetchMock.mockResolvedValueOnce(jsonResponse(mockBindings[0]));
    await updateBinding("bind_001", { allowedScopes: ["content:read", "content:write"] }, { kind: "organization", organizationId: "org_001" });
    expect(lastCall().url).toBe("/api/auth/admin/oauth-client-resource-scopes/bind_001?organizationId=org_001");
    expect(jsonBody()).toEqual({ allowedScopes: ["content:read", "content:write"] });

    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
    await deleteBinding("bind_001", { kind: "organization", organizationId: "org_001" });
    expect(lastCall().init.method).toBe("DELETE");
    expect(lastCall().url).toBe("/api/auth/admin/oauth-client-resource-scopes/bind_001?organizationId=org_001");
  });

  it("matches audit and introspection endpoint wire contracts", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sessions: [], total: 0, limit: 25, offset: 0 }));
    await expect(listAdminSessions({ limit: 25, offset: 0, userId: "user_001" })).resolves.toMatchObject({ sessions: [], total: 0 });
    expect(lastCall().url).toBe("/api/auth/admin/list-sessions?limit=25&offset=0&userId=user_001");

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    await revokeAdminSession("sess_001");
    expect(lastCall().url).toBe("/api/auth/admin/revoke-session");
    expect(jsonBody()).toEqual({ sessionId: "sess_001" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ tokens: [], total: 0, limit: 25, offset: 0 }));
    await expect(listAdminTokens({ limit: 25, offset: 0, type: "access" })).resolves.toMatchObject({ tokens: [], total: 0 });
    expect(lastCall().url).toBe("/api/auth/admin/list-tokens?limit=25&offset=0&type=access");

    fetchMock.mockResolvedValueOnce(jsonResponse({ consents: [], total: 0, limit: 25, offset: 0 }));
    await expect(listAdminConsents({ limit: 25, offset: 0, clientId: "cli_admin" })).resolves.toMatchObject({ consents: [], total: 0 });
    expect(lastCall().url).toBe("/api/auth/admin/list-consents?limit=25&offset=0&clientId=cli_admin");

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    await revokeConsent("cli_admin", "user_001");
    expect(jsonBody()).toEqual({ clientId: "cli_admin", userId: "user_001" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ keys: [] }));
    await expect(listAdminJwks()).resolves.toEqual([]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "kid_1", alg: "RS256", createdAt: 1, expiresAt: null, status: "active", publicJwk: {}, reason: "manual" }));
    await expect(rotateAdminJwks("manual")).resolves.toMatchObject({ id: "kid_1", reason: "manual" });
    expect(jsonBody()).toEqual({ reason: "manual" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [], total: 0, limit: 25, offset: 0 }));
    await listActivityLog({ limit: 25, offset: 0, targetType: "oauth_client", targetId: "cli_admin", action: "update" });
    expect(lastCall().url).toBe("/api/auth/admin/activity-log?limit=25&offset=0&targetType=oauth_client&targetId=cli_admin&action=update");

    fetchMock.mockResolvedValueOnce(jsonResponse({ active: true }));
    await introspectToken({ token: "tok_123", token_type_hint: "access_token", client_id: "cli_admin", client_secret: "secret", resource: "https://content.example.com" });
    expect(lastCall().url).toBe("/api/auth/oauth2/introspect");
    expect(lastCall().init.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded",
      authorization: "Basic Y2xpX2FkbWluOnNlY3JldA==",
    });
    const body = lastCall().init.body as URLSearchParams;
    expect(body.get("token")).toBe("tok_123");
    expect(body.get("token_type_hint")).toBe("access_token");
    expect(body.get("resource")).toBe("https://content.example.com");
    expect(body.has("client_id")).toBe(false);
  });

  it("composes the Admins & Roles derived view from existing Better Auth endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [mockUsers[0]], total: 1, limit: 100, offset: 0 }))
      .mockResolvedValueOnce(jsonResponse([mockOrganizations[0]]))
      .mockResolvedValueOnce(jsonResponse({ members: mockMembers, total: mockMembers.length }));

    await expect(listAdminsRoles()).resolves.toMatchObject({
      platformAdmins: [expect.objectContaining({ id: mockUsers[0].id, role: "admin" })],
      organizationAuthorities: [
        expect.objectContaining({ member: expect.objectContaining({ role: "owner" }) }),
        expect.objectContaining({ member: expect.objectContaining({ role: "admin" }) }),
      ],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/admin/list-users?limit=100&offset=0&filterField=role&filterValue=admin&filterOperator=eq");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/organization/list");
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/auth/organization/list-members?organizationId=${mockOrganizations[0].id}`);
  });
});
