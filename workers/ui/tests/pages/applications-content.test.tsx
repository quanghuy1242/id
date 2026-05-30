// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ApplicationsContent } from "@/app/admin/_components/oauth/applications-content";
import { mockClients } from "@/app/admin/_mocks/oauth";
import type { OAuthClient, CreateClientInput, UpdateClientInput } from "@/app/admin/_actions/oauth";

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(clients: OAuthClient[]) {
  let current = [...clients];
  return {
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockImplementation(async () => current),
    createClient: vi.fn<(d: CreateClientInput) => Promise<OAuthClient>>().mockImplementation(async (d) => {
      const created: OAuthClient = {
        client_id: "cli_created_1", client_secret: "sk-secret-shown-once", client_name: d.client_name ?? "App",
        redirect_uris: d.redirect_uris, grant_types: d.grant_types ?? [], response_types: d.response_types ?? [],
        token_endpoint_auth_method: d.token_endpoint_auth_method ?? "client_secret_post", scope: d.scope ?? "",
      };
      current = [created, ...current];
      return created;
    }),
    updateClient: vi.fn<(id: string, u: UpdateClientInput) => Promise<OAuthClient>>().mockImplementation(async (id) => current.find((c) => c.client_id === id)!),
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

  it("shows empty state when no clients", async () => {
    render(<ApplicationsContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no oauth applications/i)).toBeInTheDocument());
  });

  it("renders client cards with type badges", async () => {
    render(<ApplicationsContent actions={makeActions(mockClients)} />);
    await waitFor(() => expect(screen.getByText("Content API")).toBeInTheDocument());
    expect(screen.getAllByText("M2M").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Public").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Confidential").length).toBeGreaterThan(0);
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

  it("creates a client and reveals the one-time secret", async () => {
    const actions = makeActions([]);
    render(<ApplicationsContent actions={actions} defaultCreateOpen />);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "New App" } });
    fireEvent.change(screen.getByLabelText(/^redirect uris/i), { target: { value: "https://new.example.com/callback" } });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(actions.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ redirect_uris: ["https://new.example.com/callback"] }),
    ));
    await waitFor(() => expect(screen.getByText("sk-secret-shown-once")).toBeInTheDocument());
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
