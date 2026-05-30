// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { Stack } from "@id/ui";
import { UserDetailProvider } from "@/app/admin/_components/identity/user-detail-context";
import { UserDetailHeaderContent } from "@/app/admin/_components/identity/user-detail-header-content";
import { UserDetailOverviewContent } from "@/app/admin/_components/identity/user-detail-overview-content";
import { mockUsers } from "@/app/admin/_mocks/users";
import type { User, CurrentSession } from "@/app/admin/_actions/users";

const baseUser = mockUsers[0];
const bannedUser = mockUsers[1];

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

async function clickUserAction(name: RegExp) {
  const directButton = screen.queryByRole("button", { name });
  if (directButton) {
    fireEvent.click(directButton);
    return;
  }

  pressTrigger(screen.getByRole("button", { name: "User actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

async function expectUserAction(name: RegExp) {
  const directButton = screen.queryByRole("button", { name });
  if (directButton) return;

  pressTrigger(screen.getByRole("button", { name: "User actions" }));
  expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
}

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

function renderUserDetail({
  user = baseUser,
  userId = "user_001",
  loading,
  error,
  isImpersonating,
  actions = makeActions(user, isImpersonating),
  onNavigateToUsers,
}: {
  user?: User;
  userId?: string;
  loading?: boolean;
  error?: string;
  isImpersonating?: boolean;
  actions?: ReturnType<typeof makeActions>;
  onNavigateToUsers?: () => void;
} = {}) {
  return render(
    <UserDetailProvider userId={userId} loading={loading} error={error} actions={actions}>
      <Stack gap="md">
        <UserDetailHeaderContent activeTab="overview" actions={actions} onNavigateToUsers={onNavigateToUsers} />
        <UserDetailOverviewContent />
      </Stack>
    </UserDetailProvider>,
  );
}

describe("User detail nested content", () => {
  it("renders loading skeleton when loading prop passed", () => {
    renderUserDetail({ loading: true });
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    renderUserDetail({ error: "User not found" });
    expect(screen.getByRole("alert")).toHaveTextContent("User not found");
  });

  it("fetches and renders user profile", async () => {
    const actions = makeActions(baseUser);
    renderUserDetail({ actions });
    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));
    expect(screen.getByText("john@acme.com")).toBeInTheDocument();
  });

  it("shows banned alert for banned users", async () => {
    const actions = makeActions(bannedUser);
    renderUserDetail({ user: bannedUser, userId: "user_002", actions });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/banned/i));
  });

  it("shows Stop Impersonating button when impersonating", async () => {
    const actions = makeActions(baseUser, true);
    renderUserDetail({ actions, isImpersonating: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "User actions" })).toBeInTheDocument());
    await expectUserAction(/stop impersonating/i);
  });

  it("shows Impersonate button when not impersonating", async () => {
    const actions = makeActions(baseUser, false);
    renderUserDetail({ actions, isImpersonating: false });
    await waitFor(() => expect(screen.getByRole("button", { name: "User actions" })).toBeInTheDocument());
    await expectUserAction(/^impersonate$/i);
  });

  it("opens Edit Profile dialog on button click", async () => {
    const actions = makeActions(baseUser);
    renderUserDetail({ actions });
    await waitFor(() => screen.getByRole("button", { name: "User actions" }));
    await clickUserAction(/edit profile/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("delete confirm button disabled until email typed", async () => {
    const actions = makeActions(baseUser);
    renderUserDetail({ actions });
    await waitFor(() => screen.getByRole("button", { name: "User actions" }));
    await clickUserAction(/delete user/i);
    await waitFor(() => screen.getByRole("dialog"));
    const allDeleteBtns = screen.getAllByRole("button", { name: /delete user/i });
    expect(allDeleteBtns.some((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("enables delete confirm after typing correct email", async () => {
    const actions = makeActions(baseUser);
    renderUserDetail({ actions });
    await waitFor(() => screen.getByRole("button", { name: "User actions" }));
    await clickUserAction(/delete user/i);
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
    renderUserDetail({ actions });
    await waitFor(() => screen.getByRole("button", { name: "User actions" }));
    await clickUserAction(/ban user/i);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^ban user$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Cannot ban the last admin");
    });
  });
});
