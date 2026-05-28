// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserDetailContent } from "@/app/admin/_components/identity/user-detail-content";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { User, CurrentSession } from "@/app/admin/_actions/users";

const baseUser = mockUsers[0];
const bannedUser = mockUsers[1];

function makeActions(user: User, isImpersonating = false) {
  return {
    getUser: vi.fn<() => Promise<{ user: User }>>().mockResolvedValue({ user }),
    getCurrentSession: vi.fn<() => Promise<CurrentSession>>().mockResolvedValue({
      user: { id: "admin", impersonatedBy: isImpersonating ? "admin" : null },
    }),
    updateUser: vi.fn<() => Promise<{ user: User }>>().mockResolvedValue({ user }),
    setRole: vi.fn<() => Promise<{ user: User }>>().mockResolvedValue({ user }),
    setUserPassword: vi.fn<() => Promise<{ status: boolean }>>().mockResolvedValue({ status: true }),
    banUser: vi.fn<() => Promise<{ user: User }>>().mockResolvedValue({ user: { ...user, banned: true } }),
    unbanUser: vi.fn<() => Promise<{ user: User }>>().mockResolvedValue({ user: { ...user, banned: false } }),
    impersonateUser: vi.fn<() => Promise<{ session: unknown; user: User }>>().mockResolvedValue({ session: {}, user }),
    stopImpersonating: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    removeUser: vi.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
  };
}

describe("UserDetailContent", () => {
  it("renders loading skeleton when loading prop passed", () => {
    render(<UserDetailContent userId="user_001" loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    render(<UserDetailContent userId="user_001" error="User not found" />);
    expect(screen.getByRole("alert")).toHaveTextContent("User not found");
  });

  it("fetches and renders user profile", async () => {
    const actions = makeActions(baseUser);
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));
    expect(screen.getByText("john@acme.com")).toBeInTheDocument();
  });

  it("shows banned alert for banned users", async () => {
    const actions = makeActions(bannedUser);
    render(<UserDetailContent userId="user_002" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/banned/i));
  });

  it("shows Stop Impersonating button when impersonating", async () => {
    const actions = makeActions(baseUser, true);
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /stop impersonating/i })).toBeInTheDocument());
  });

  it("shows Impersonate button when not impersonating", async () => {
    const actions = makeActions(baseUser, false);
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^impersonate$/i })).toBeInTheDocument());
  });

  it("opens Edit Profile dialog on button click", async () => {
    const actions = makeActions(baseUser);
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getByRole("button", { name: /edit profile/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("delete confirm button disabled until email typed", async () => {
    const actions = makeActions(baseUser);
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /delete user/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /delete user/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const allDeleteBtns = screen.getAllByRole("button", { name: /delete user/i });
    expect(allDeleteBtns.some((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("enables delete confirm after typing correct email", async () => {
    const actions = makeActions(baseUser);
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getByRole("button", { name: /delete user/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /delete user/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/type the user's email/i), { target: { value: "john@acme.com" } });
    await waitFor(() => {
      const btns = screen.getAllByRole("button", { name: /delete user/i });
      expect(btns.some((b) => !b.hasAttribute("disabled"))).toBe(true);
    });
  });

  it("shows API error inside ban dialog", async () => {
    const actions = makeActions(baseUser);
    actions.banUser.mockRejectedValueOnce(new Error("Cannot ban the last admin"));
    render(<UserDetailContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getByRole("button", { name: /ban user/i }));
    fireEvent.click(screen.getByRole("button", { name: /ban user/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^ban user$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Cannot ban the last admin");
    });
  });
});
