// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ApplicationsContent } from "@/app/admin/_components/oauth/applications-content";
import { mockClients } from "@/app/admin/_mocks/oauth";
import type { OAuthClient } from "@/app/admin/_actions/oauth";

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(clients: OAuthClient[]) {
  let current = [...clients];
  return {
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockImplementation(async () => current),
    rotateClientSecret: vi.fn<(id: string) => Promise<{ client_secret: string }>>().mockResolvedValue({ client_secret: "sk-rotated" }),
    deleteClient: vi.fn<(id: string) => Promise<void>>().mockImplementation(async (id) => { current = current.filter((c) => c.client_id !== id); }),
  };
}

describe("ApplicationsContent", () => {
  it("renders loading skeleton with loading prop", () => {
    render(<ApplicationsContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert with error prop", () => {
    render(<ApplicationsContent error="Boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("routes empty-state creation to the dedicated create page", async () => {
    render(<ApplicationsContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no oauth applications/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /create application/i })).toHaveAttribute("href", "/admin/oauth/applications/new");
    expect(screen.queryByRole("dialog", { name: /create oauth application/i })).not.toBeInTheDocument();
  });

  it("calls onClientClick for row navigation", async () => {
    const onClientClick = vi.fn<(clientId: string) => void>();
    render(<ApplicationsContent actions={makeActions(mockClients)} onClientClick={onClientClick} />);
    await waitFor(() => screen.getByText("Content API"));
    fireEvent.click(screen.getByText("cli_contentapi_a1b2c3d4e5f6"));
    await waitFor(() => expect(onClientClick).toHaveBeenCalledWith("cli_contentapi_a1b2c3d4e5f6"));
  });

  it("filters clients via search prop", async () => {
    render(<ApplicationsContent actions={makeActions(mockClients)} search="vendor" />);
    await waitFor(() => expect(screen.getByText("Vendor Portal")).toBeInTheDocument());
    expect(screen.queryByText("Content API")).toBeNull();
  });

  it("renders toolbar creation as a link to the dedicated create page", async () => {
    render(<ApplicationsContent actions={makeActions(mockClients)} />);
    await waitFor(() => screen.getByText("Content API"));
    expect(screen.getByRole("link", { name: /new app/i })).toHaveAttribute("href", "/admin/oauth/applications/new");
  });

  it("deletes a client", async () => {
    const actions = makeActions(mockClients);
    render(<ApplicationsContent actions={actions} />);
    await waitFor(() => screen.getByText("Content API"));
    const row = screen.getByText("Content API").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^delete$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /delete application/i }));
    await waitFor(() => expect(actions.deleteClient).toHaveBeenCalledWith("cli_contentapi_a1b2c3d4e5f6"));
  });
});
