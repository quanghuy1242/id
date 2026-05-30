// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { SessionsContent } from "@/app/admin/_components/security/sessions-content";
import { mockSessions } from "@/app/admin/_mocks/audit";
import type { AdminSession, Paginated } from "@/app/admin/_actions/audit";

function makeActions(sessions: AdminSession[]) {
  return {
    listAdminSessions: vi.fn<(p: { limit: number; offset: number }) => Promise<Paginated<"sessions", AdminSession>>>()
      .mockImplementation(async (p) => ({ sessions, total: sessions.length, limit: p.limit, offset: p.offset })),
    revokeUserSession: vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe("SessionsContent", () => {
  it("renders loading skeleton", () => {
    render(<SessionsContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<SessionsContent error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("lists sessions with enriched email and a stats header", async () => {
    render(<SessionsContent actions={makeActions(mockSessions)} />);
    await waitFor(() => expect(screen.getByText("john@acme.com")).toBeInTheDocument());
    expect(screen.getByText("192.168.1.10")).toBeInTheDocument();
    expect(screen.getAllByText("Impersonated").length).toBeGreaterThan(0);
    expect(screen.getByText("Total sessions")).toBeInTheDocument();
  });

  it("revokes a session via the confirm dialog", async () => {
    const actions = makeActions(mockSessions);
    render(<SessionsContent actions={actions} />);
    await waitFor(() => screen.getByText("john@acme.com"));
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke$/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
    await waitFor(() => expect(actions.revokeUserSession).toHaveBeenCalledWith("tok_session_001_secret"));
  });

  it("shows empty state when no sessions", async () => {
    render(<SessionsContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no active browser sessions/i)).toBeInTheDocument());
  });
});
