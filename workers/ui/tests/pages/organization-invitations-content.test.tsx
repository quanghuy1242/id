// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { OrganizationInvitationsContent } from "@/app/admin/_components/identity/organization-invitations-content";
import { mockInvitations } from "@/app/admin/_mocks/organizations";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { Invitation } from "@/app/admin/_actions/organizations";
import type { User } from "@/app/admin/_actions/users";

const userMap = new Map<string, User>(mockUsers.map((u) => [u.id, u]));

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(invs: Invitation[]) {
  let current = [...invs];
  return {
    listInvitations: vi.fn<() => Promise<Invitation[]>>().mockImplementation(async () => current),
    inviteMember: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    cancelInvitation: vi.fn<(id: string) => Promise<void>>().mockImplementation(
      async (id) => { current = current.filter((i) => i.id !== id); },
    ),
    getUser: vi.fn<(userId: string) => Promise<{ user: User }>>().mockImplementation(
      async (userId) => ({
        user: userMap.get(userId) ?? {
          id: userId, name: "Admin", email: `${userId}@example.com`,
          emailVerified: true, image: null, role: "admin", banned: false,
          banReason: null, banExpires: null, createdAt: "", updatedAt: "",
        },
      }),
    ),
  };
}

describe("OrganizationInvitationsContent", () => {
  it("renders loading skeleton when loading prop passed", () => {
    render(<OrganizationInvitationsContent orgId="org_001" loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    render(<OrganizationInvitationsContent orgId="org_001" error="Cannot fetch invitations" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot fetch invitations");
  });

  it("shows empty state when no invitations", async () => {
    const actions = makeActions([]);
    render(<OrganizationInvitationsContent orgId="org_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText(/no invitations yet/i)).toBeInTheDocument());
  });

  it("renders invitation rows", async () => {
    const actions = makeActions(mockInvitations);
    render(<OrganizationInvitationsContent orgId="org_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText("bob@corp.com")).toBeInTheDocument());
    expect(screen.getByText("alice@venture.com")).toBeInTheDocument();
  });

  it("folds pending invitation actions into menus", async () => {
    const actions = makeActions(mockInvitations);
    render(<OrganizationInvitationsContent orgId="org_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText("bob@corp.com")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Actions" })).toHaveLength(2);
    const row = screen.getByText("bob@corp.com").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    expect(await screen.findByRole("menuitem", { name: /resend/i })).toBeInTheDocument();
  });

  it("opens cancel dialog and calls cancelInvitation", async () => {
    const actions = makeActions(mockInvitations);
    render(<OrganizationInvitationsContent orgId="org_001" actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /^cancel$/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^cancel$/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /yes, cancel/i }));
    await waitFor(() => expect(actions.cancelInvitation).toHaveBeenCalled());
  });

  it("opens Invite dialog and calls inviteMember", async () => {
    const actions = makeActions([]);
    render(<OrganizationInvitationsContent orgId="org_001" actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /invite member/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /invite member/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    await waitFor(() => expect(actions.inviteMember).toHaveBeenCalledWith("org_001", "new@example.com", expect.any(String)));
  });
});
