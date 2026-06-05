// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { DashboardContent } from "@/app/admin/_components/dashboard-content";
import { mockSessions, mockTokens, mockRefreshTokens } from "@/app/admin/_mocks/audit";
import { mockClients } from "@/app/admin/_mocks/oauth";
import { mockOrganizations } from "@/app/admin/_mocks/organizations";
import { mockConsents, mockAdminJwks } from "@/app/admin/_mocks/security";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { AdminConsent, AdminJwk, AdminSession, AdminToken, ConsentListParams, PageParams, Paginated } from "@/app/admin/_actions/audit";
import type { OAuthClient } from "@/app/admin/_actions/oauth";
import type { Organization } from "@/app/admin/_actions/organizations";
import type { ListUsersParams, ListUsersResponse } from "@/app/admin/_actions/users";

function makeActions() {
  return {
    listUsers: vi.fn<(params: ListUsersParams) => Promise<ListUsersResponse>>().mockResolvedValue({ users: mockUsers.slice(0, 1), total: mockUsers.length, limit: 1, offset: 0 }),
    listOrganizations: vi.fn<() => Promise<Organization[]>>().mockResolvedValue(mockOrganizations),
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
    listAdminSessions: vi.fn<(params: PageParams) => Promise<Paginated<"sessions", AdminSession>>>().mockImplementation((params) => Promise.resolve({ sessions: mockSessions.slice(0, params.limit), total: mockSessions.length, limit: params.limit, offset: params.offset })),
    listAdminTokens: vi.fn<(params: PageParams & { type: "access" | "refresh" }) => Promise<Paginated<"tokens", AdminToken>>>().mockImplementation((params) => {
      const rows = params.type === "refresh" ? mockRefreshTokens : mockTokens;
      return Promise.resolve({ tokens: rows.slice(0, params.limit), total: rows.length, limit: params.limit, offset: params.offset });
    }),
    listAdminConsents: vi.fn<(params: ConsentListParams) => Promise<Paginated<"consents", AdminConsent>>>().mockImplementation((params) => Promise.resolve({ consents: mockConsents.slice(0, params.limit), total: mockConsents.length, limit: params.limit, offset: params.offset })),
    listAdminJwks: vi.fn<() => Promise<AdminJwk[]>>().mockResolvedValue(mockAdminJwks),
  };
}

describe("DashboardContent", () => {
  it("renders live admin stats and route shortcuts", async () => {
    const { container } = render(<DashboardContent actions={makeActions()} />);
    expect(screen.getByRole("heading", { level: 1, name: /admin console/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("registered accounts")).toBeInTheDocument());
    expect(screen.getByText("Active Sessions")).toBeInTheDocument();
    expect(container.querySelectorAll(".grid.grid-cols-2.lg\\:grid-cols-4")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 3, name: "Token Decoder" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open/i }).some((link) => link.getAttribute("href") === "/admin/platform/security/introspect")).toBe(true);
  });
});
