// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ConsentsContent } from "@/app/admin/_components/security/consents-content";
import { mockConsents } from "@/app/admin/_mocks/security";
import { mockClients } from "@/app/admin/_mocks/oauth";
import type { AdminConsent, Paginated } from "@/app/admin/_actions/audit";
import type { OAuthClient } from "@/app/admin/_actions/oauth";

function makeActions(consents: AdminConsent[]) {
  let current = [...consents];
  return {
    listAdminConsents: vi.fn<(p: { limit: number; offset: number; clientId?: string }) => Promise<Paginated<"consents", AdminConsent>>>()
      .mockImplementation(async (p) => {
        const filtered = p.clientId ? current.filter((c) => c.clientId === p.clientId) : current;
        return { consents: filtered, total: filtered.length, limit: p.limit, offset: p.offset };
      }),
    revokeConsent: vi.fn<(clientId: string, userId: string) => Promise<void>>()
      .mockImplementation(async (clientId, userId) => { current = current.filter((c) => !(c.clientId === clientId && c.userId === userId)); }),
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
  };
}

describe("ConsentsContent", () => {
  it("renders loading skeleton", () => {
    render(<ConsentsContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<ConsentsContent error="Nope" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });

  it("renders consent rows with enriched email and client", async () => {
    render(<ConsentsContent actions={makeActions(mockConsents)} />);
    await waitFor(() => expect(screen.getByText("john@acme.com")).toBeInTheDocument());
    expect(screen.getAllByText("Content API").length).toBeGreaterThan(0);
  });

  it("shows empty state when no consents", async () => {
    render(<ConsentsContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no oauth consent records/i)).toBeInTheDocument());
  });

  it("revokes a consent grant", async () => {
    const actions = makeActions(mockConsents);
    render(<ConsentsContent actions={actions} />);
    await waitFor(() => screen.getByText("john@acme.com"));
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke$/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
    await waitFor(() => expect(actions.revokeConsent).toHaveBeenCalledWith("cli_contentapi_a1b2c3d4e5f6", "user_001"));
  });
});
