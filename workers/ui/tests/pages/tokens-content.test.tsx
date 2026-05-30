// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { TokensContent } from "@/app/admin/_components/security/tokens-content";
import { mockTokens, mockRefreshTokens } from "@/app/admin/_mocks/audit";
import type { AdminToken, Paginated } from "@/app/admin/_actions/audit";

function makeActions(access: AdminToken[], refresh: AdminToken[]) {
  return {
    listAdminTokens: vi.fn<(p: { limit: number; offset: number; type: "access" | "refresh" }) => Promise<Paginated<"tokens", AdminToken>>>()
      .mockImplementation(async (p) => {
        const tokens = p.type === "refresh" ? refresh : access;
        return { tokens, total: tokens.length, limit: p.limit, offset: p.offset };
      }),
  };
}

describe("TokensContent", () => {
  it("renders loading skeleton", () => {
    render(<TokensContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<TokensContent error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows access-token prefixes, never token values", async () => {
    render(<TokensContent actions={makeActions(mockTokens, mockRefreshTokens)} />);
    await waitFor(() => expect(screen.getByText("a1b2c3d4…")).toBeInTheDocument());
    expect(screen.getByText(/token values are never exposed/i)).toBeInTheDocument();
  });

  it("calls onTypeChange when the controlled type filter changes", async () => {
    const onTypeChange = vi.fn<(t: "access" | "refresh") => void>();
    render(<TokensContent type="access" onTypeChange={onTypeChange} actions={makeActions(mockTokens, mockRefreshTokens)} />);
    await waitFor(() => screen.getByText("a1b2c3d4…"));
    fireEvent.click(screen.getByRole("button", { name: /type/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Refresh" }));
    await waitFor(() => expect(onTypeChange).toHaveBeenCalledWith("refresh"));
  });

  it("renders refresh tokens when type=refresh", async () => {
    render(<TokensContent type="refresh" actions={makeActions(mockTokens, mockRefreshTokens)} />);
    await waitFor(() => expect(screen.getByText("r1r2r3r4…")).toBeInTheDocument());
  });

  it("shows empty state when no tokens", async () => {
    render(<TokensContent actions={makeActions([], [])} />);
    await waitFor(() => expect(screen.getByText(/no active access tokens/i)).toBeInTheDocument());
  });
});
