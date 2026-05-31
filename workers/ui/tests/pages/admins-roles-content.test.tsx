// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { AdminsRolesContent } from "@/app/admin/_components/access/admins-roles-content";
import type { AdminsRolesSnapshot } from "@/app/admin/_actions/access";
import { mockMembers, mockOrganizations } from "@/app/admin/_mocks/organizations";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { User } from "@/app/admin/_actions/users";

function snapshot(platformAdmins = mockUsers.filter((user) => user.role === "admin")): AdminsRolesSnapshot {
  return {
    platformAdmins,
    organizationAuthorities: mockMembers
      .filter((member) => member.role === "owner" || member.role === "admin")
      .map((member) => ({
        member,
        organization: mockOrganizations.find((organization) => organization.id === member.organizationId) ?? mockOrganizations[0],
      })),
  };
}

function actions(data: AdminsRolesSnapshot) {
  return {
    listAdminsRoles: vi.fn<() => Promise<AdminsRolesSnapshot>>().mockResolvedValue(data),
    getUser: vi.fn<(userId: string) => Promise<{ user: User }>>().mockImplementation(async (userId) => ({
      user: mockUsers.find((user) => user.id === userId) ?? mockUsers[0]!,
    })),
  };
}

describe("AdminsRolesContent", () => {
  it("renders platform admins and organization authority rows", async () => {
    render(<AdminsRolesContent actions={actions(snapshot())} />);

    await waitFor(() => expect(screen.getByText("Platform Admin")).toBeInTheDocument());
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Org Admin")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0);
  });

  it("filters the derived rows by search", async () => {
    render(<AdminsRolesContent actions={actions(snapshot())} />);

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "jane" } });

    expect(screen.getByText("Jane Adams")).toBeInTheDocument();
    expect(screen.queryByText("Platform Admin")).toBeNull();
  });

  it("renders loading and error overrides without fetching", () => {
    const testActions = actions(snapshot());

    render(<AdminsRolesContent loading actions={testActions} />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
    expect(testActions.listAdminsRoles).not.toHaveBeenCalled();
  });

  it("renders the error override", () => {
    render(<AdminsRolesContent error="Failed to load admins" actions={actions(snapshot())} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load admins");
  });
});
