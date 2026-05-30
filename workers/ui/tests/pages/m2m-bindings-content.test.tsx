// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { M2mBindingsContent } from "@/app/admin/_components/oauth/m2m-bindings-content";
import { mockBindings, mockClients, mockResourceServers, mockScopes } from "@/app/admin/_mocks/oauth";
import type { ClientResourceScope, OAuthClient, ResourceServer, OAuthResourceScope, UpdateBindingInput } from "@/app/admin/_actions/oauth";

function makeActions(bindings: ClientResourceScope[]) {
  let current = [...bindings];
  return {
    listBindings: vi.fn<() => Promise<ClientResourceScope[]>>().mockImplementation(async () => current),
    createBinding: vi.fn<() => Promise<ClientResourceScope>>().mockImplementation(async () => current[0]),
    updateBinding: vi.fn<(id: string, d: UpdateBindingInput) => Promise<ClientResourceScope>>().mockImplementation(async (id) => current.find((b) => b.id === id)!),
    deleteBinding: vi.fn<(id: string) => Promise<void>>().mockImplementation(async (id) => { current = current.filter((b) => b.id !== id); }),
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
    listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers),
    listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue(mockScopes),
  };
}

describe("M2mBindingsContent", () => {
  it("renders loading skeleton", () => {
    render(<M2mBindingsContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<M2mBindingsContent error="Err" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Err");
  });

  it("shows empty state", async () => {
    render(<M2mBindingsContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no m2m client bindings/i)).toBeInTheDocument());
  });

  it("renders bindings joined to client and resource names with scope badges", async () => {
    render(<M2mBindingsContent actions={makeActions(mockBindings)} />);
    await waitFor(() => expect(screen.getAllByText("Content API").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getAllByText("content:read").length).toBeGreaterThan(0);
    expect(screen.getByText("Updated / By")).toBeInTheDocument();
  });

  it("calls onBindingClick for row navigation", async () => {
    const onBindingClick = vi.fn<(id: string) => void>();
    render(<M2mBindingsContent actions={makeActions(mockBindings)} onBindingClick={onBindingClick} />);
    await waitFor(() => screen.getAllByText("Content API"));
    fireEvent.click(screen.getAllByText("content:read")[0]);
    await waitFor(() => expect(onBindingClick).toHaveBeenCalledWith("bind_001"));
  });

  it("deletes a binding", async () => {
    const actions = makeActions(mockBindings);
    render(<M2mBindingsContent actions={actions} />);
    await waitFor(() => screen.getAllByText("Content API"));
    fireEvent.click(screen.getAllByRole("button", { name: /delete binding/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(actions.deleteBinding).toHaveBeenCalledWith("bind_001"));
  });

  it("edits a binding's scopes", async () => {
    const actions = makeActions(mockBindings);
    render(<M2mBindingsContent actions={actions} />);
    await waitFor(() => screen.getAllByText("Content API"));
    fireEvent.click(screen.getAllByRole("button", { name: /edit binding/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(actions.updateBinding).toHaveBeenCalledWith("bind_001", expect.objectContaining({ allowedScopes: expect.any(Array) })));
  });
});
