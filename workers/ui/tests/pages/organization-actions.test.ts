// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrganization,
  getFullOrganization,
  listInvitations,
  listMembers,
  listOrganizations,
  listTeamMembers,
  listTeams,
  removeTeam,
  updateTeam,
  updateOrganization,
} from "@/app/admin/_actions/organizations";
import {
  mockInvitations,
  mockListMembersResponse,
  mockOrganizationWireWithObjectMetadata,
  mockOrganizations,
  mockTeamMembers,
  mockTeams,
} from "@/app/admin/_mocks/organizations";

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

describe("organization actions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("unwraps Better Auth list-members envelopes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockListMembersResponse));

    await expect(listMembers("org_001")).resolves.toEqual(
      mockListMembersResponse.members,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/organization/list-members?organizationId=org_001",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("normalizes organization metadata returned as an object", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([mockOrganizationWireWithObjectMetadata]),
    );

    await expect(listOrganizations()).resolves.toEqual([
      { ...mockOrganizations[0], metadata: '{\n  "plan": "enterprise"\n}' },
    ]);
  });

  it("sends organization metadata as a Better Auth JSON object on create", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(mockOrganizationWireWithObjectMetadata),
    );

    await expect(
      createOrganization({
        name: "Acme Corp",
        slug: "acme",
        metadata: '{"plan":"enterprise"}',
      }),
    ).resolves.toMatchObject({ metadata: '{\n  "plan": "enterprise"\n}' });

    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/organization/create");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Acme Corp",
      slug: "acme",
      metadata: { plan: "enterprise" },
    });
  });

  it("sends organization metadata as a Better Auth JSON object on update", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(mockOrganizationWireWithObjectMetadata),
    );

    await updateOrganization("org_001", { metadata: '{"plan":"enterprise"}' });

    const { url, init } = lastCall();
    expect(url).toBe("/api/auth/organization/update");
    expect(JSON.parse(String(init.body))).toEqual({
      organizationId: "org_001",
      data: { metadata: { plan: "enterprise" } },
    });
  });

  it("passes through null get-full-organization responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));

    await expect(getFullOrganization("missing_org")).resolves.toBeNull();
  });

  it("derives expired invitations and preserves Better Auth canceled spelling", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          ...mockInvitations[0],
          status: "pending",
          expiresAt: "2000-01-01T00:00:00.000Z",
        },
        { ...mockInvitations[0], id: "inv_canceled", status: "canceled" },
      ]),
    );

    await expect(listInvitations("org_001")).resolves.toEqual([
      expect.objectContaining({ status: "expired" }),
      expect.objectContaining({ status: "canceled" }),
    ]);
  });

  it("keeps array-returning team endpoints as arrays", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse(mockTeamMembers.team_001));

    await expect(listTeams("org_001")).resolves.toEqual(mockTeams);
    await expect(listTeamMembers("team_001")).resolves.toEqual(
      mockTeamMembers.team_001,
    );
  });

  it("sends route-bound organization id for team mutations", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(mockTeams[0]))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    await updateTeam("team_001", "Editors", "org_001");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      teamId: "team_001",
      data: { name: "Editors", organizationId: "org_001" },
    });

    await removeTeam("team_001", "org_001");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      teamId: "team_001",
      organizationId: "org_001",
    });
  });
});
