// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { SessionsTokensContent } from "@/app/admin/_components/oauth/sessions-tokens-content";
import { mockSessions, mockTokens, mockRefreshTokens } from "@/app/admin/_mocks/audit";
import type { AdminSession, AdminToken, Paginated } from "@/app/admin/_actions/audit";

function makeActions(sessions: AdminSession[], access: AdminToken[], refresh: AdminToken[]) {
  return {
    listAdminSessions: vi.fn<(p: { limit: number; offset: number }) => Promise<Paginated<"sessions", AdminSession>>>()
      .mockImplementation(async (p) => ({ sessions, total: sessions.length, limit: p.limit, offset: p.offset })),
    listAdminTokens: vi.fn<(p: { limit: number; offset: number; type: "access" | "refresh" }) => Promise<Paginated<"tokens", AdminToken>>>()
      .mockImplementation(async (p) => {
        const tokens = p.type === "refresh" ? refresh : access;
        return { tokens, total: tokens.length, limit: p.limit, offset: p.offset };
      }),
    revokeUserSession: vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe("SessionsTokensContent", () => {
  it("renders loading skeleton", () => {
    render(<SessionsTokensContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<SessionsTokensContent error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("lists sessions with enriched email on the default tab", async () => {
    render(<SessionsTokensContent actions={makeActions(mockSessions, mockTokens, mockRefreshTokens)} />);
    await waitFor(() => expect(screen.getByText("john@acme.com")).toBeInTheDocument());
    expect(screen.getByText("192.168.1.10")).toBeInTheDocument();
    expect(screen.getByText("Impersonated")).toBeInTheDocument();
  });

  it("revokes a session via the confirm dialog", async () => {
    const actions = makeActions(mockSessions, mockTokens, mockRefreshTokens);
    render(<SessionsTokensContent actions={actions} />);
    await waitFor(() => screen.getByText("john@acme.com"));
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke$/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
    await waitFor(() => expect(actions.revokeUserSession).toHaveBeenCalledWith("tok_session_001_secret"));
  });

  it("shows empty state when no sessions", async () => {
    render(<SessionsTokensContent actions={makeActions([], [], [])} />);
    await waitFor(() => expect(screen.getByText(/no active browser sessions/i)).toBeInTheDocument());
  });

  it("switches to the tokens tab and shows prefixes, never token values", async () => {
    render(<SessionsTokensContent actions={makeActions(mockSessions, mockTokens, mockRefreshTokens)} />);
    await waitFor(() => screen.getByText("john@acme.com"));
    fireEvent.click(screen.getByRole("tab", { name: /oauth tokens/i }));
    await waitFor(() => expect(screen.getByText("a1b2c3d4…")).toBeInTheDocument());
    expect(screen.getByText(/token values are never exposed/i)).toBeInTheDocument();
  });
});
