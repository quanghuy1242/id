// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { UserSessionsContent } from "@/app/admin/_components/identity/user-sessions-content";
import { mockUsers, mockSessions } from "@/app/admin/_mocks/users";
import type { Session, User } from "@/app/admin/_actions/users";

function makeActions(user: User, sessions: Session[]) {
  return {
    getUser: vi.fn<() => Promise<{ user: User }>>().mockResolvedValue({ user }),
    listUserSessions: vi.fn<() => Promise<{ sessions: Session[] }>>().mockResolvedValue({ sessions }),
    revokeUserSession: vi.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    revokeUserSessions: vi.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
  };
}

describe("UserSessionsContent", () => {
  it("renders loading skeleton when loading prop passed", () => {
    render(<UserSessionsContent userId="user_001" loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    render(<UserSessionsContent userId="user_001" error="Sessions unavailable" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sessions unavailable");
  });

  it("shows empty state when no sessions returned", async () => {
    const actions = makeActions(mockUsers[0], []);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText(/no active sessions/i)).toBeInTheDocument());
  });

  it("renders sessions table with rows", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText("192.168.1.1")).toBeInTheDocument());
  });

  it("shows Impersonation badge for impersonated sessions", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText("Impersonation")).toBeInTheDocument());
  });

  it("shows Revoke button only for non-expired sessions", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /^revoke$/i }));
    // mockSessions has 2 non-expired (sess_001, sess_002) and 1 expired (sess_003)
    const revokeButtons = screen.getAllByRole("button", { name: /^revoke$/i });
    expect(revokeButtons.length).toBe(2);
  });

  it("opens revoke dialog on Revoke click", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /^revoke$/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke$/i })[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("calls revokeUserSession with session token", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /^revoke$/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke$/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^revoke$/i, hidden: false }));
    await waitFor(() => expect(actions.revokeUserSession).toHaveBeenCalledWith(mockSessions[0].token));
  });

  it("shows Revoke All button when sessions exist", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /revoke all sessions/i })).toBeInTheDocument());
  });

  it("opens Revoke All confirm dialog", async () => {
    const actions = makeActions(mockUsers[0], mockSessions);
    render(<UserSessionsContent userId="user_001" actions={actions} />);
    await waitFor(() => screen.getByRole("button", { name: /revoke all sessions/i }));
    fireEvent.click(screen.getByRole("button", { name: /revoke all sessions/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });
});
