// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { OrganizationMembersContent } from "@/app/admin/_components/identity/organization-members-content";
import { mockMembers } from "@/app/admin/_mocks/organizations";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { Member } from "@/app/admin/_actions/organizations";
import type { User } from "@/app/admin/_actions/users";

const userMap = new Map<string, User>(mockUsers.map((u) => [u.id, u]));

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(members: Member[]) {
  let current = [...members];
  return {
    listMembers: vi.fn<() => Promise<Member[]>>().mockImplementation(async () => current),
    updateMemberRole: vi.fn<(memberId: string, role: string) => Promise<void>>().mockImplementation(
      async (memberId, role) => { current = current.map((m) => m.id === memberId ? Object.assign({}, m, { role }) : m); },
    ),
    removeMember: vi.fn<(memberIdOrEmail: string, orgId: string) => Promise<void>>().mockImplementation(
      async (memberIdOrEmail) => { current = current.filter((m) => m.id !== memberIdOrEmail); },
    ),
    inviteMember: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getUser: vi.fn<(userId: string) => Promise<{ user: User }>>().mockImplementation(
      async (userId) => ({
        user: userMap.get(userId) ?? {
          id: userId, name: userId, email: `${userId}@example.com`,
          emailVerified: true, image: null, role: "user", banned: false,
          banReason: null, banExpires: null, createdAt: "", updatedAt: "",
        },
      }),
    ),
  };
}

describe("OrganizationMembersContent", () => {
  it("renders loading skeleton when loading prop passed", () => {
    render(<OrganizationMembersContent orgId="org_001" loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    render(<OrganizationMembersContent orgId="org_001" error="No access" />);
    expect(screen.getByRole("alert")).toHaveTextContent("No access");
  });

  it("shows empty state when no members", async () => {
    const actions = makeActions([]);
    render(<OrganizationMembersContent orgId="org_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText(/no members/i)).toBeInTheDocument());
  });

  it("renders member rows with enriched user names", async () => {
    const actions = makeActions(mockMembers);
    render(<OrganizationMembersContent orgId="org_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument());
    expect(screen.getByText("john@acme.com")).toBeInTheDocument();
  });

  it("disables Remove for last owner", async () => {
    const singleOwner = [mockMembers[0]];
    const actions = makeActions(singleOwner);
    render(<OrganizationMembersContent orgId="org_001" actions={actions} />);
    await waitFor(() => screen.getByText("John Doe"));
    const row = screen.getByText("John Doe").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    const removeItem = await screen.findByRole("menuitem", { name: /remove member/i });
    expect(removeItem).toHaveAttribute("aria-disabled", "true");
  });

  it("opens Change Role dialog on icon button click", async () => {
    const actions = makeActions(mockMembers);
    render(<OrganizationMembersContent orgId="org_001" actions={actions} />);
    await waitFor(() => screen.getByText("John Doe"));
    const row = screen.getByText("John Doe").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /change role/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("opens Invite Member dialog and calls inviteMember", async () => {
    const actions = makeActions(mockMembers);
    render(<OrganizationMembersContent orgId="org_001" actions={actions} />);
    await waitFor(() => screen.getByRole("button", { name: /invite member/i }));
    fireEvent.click(screen.getByRole("button", { name: /invite member/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "newmember@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    await waitFor(() => expect(actions.inviteMember).toHaveBeenCalledWith(
      "org_001",
      "newmember@example.com",
      expect.any(String),
    ));
  });
});
