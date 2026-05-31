// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ApplicationDetailContent } from "@/app/admin/_components/oauth/application-detail-content";
import { ResourceApiDetailContent } from "@/app/admin/_components/oauth/resource-api-detail-content";
import { M2mBindingDetailContent } from "@/app/admin/_components/oauth/m2m-binding-detail-content";
import { mockBindings, mockClients, mockResourceServers, mockScopes } from "@/app/admin/_mocks/oauth";
import type { ClientResourceScope, OAuthClient, OAuthResourceScope, ResourceServer, UpdateBindingInput, UpdateClientInput, UpdateResourceServerInput } from "@/app/admin/_actions/oauth";

function makeOauthActions() {
  return {
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
    listBindings: vi.fn<() => Promise<ClientResourceScope[]>>().mockResolvedValue(mockBindings),
    listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers),
    listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue(mockScopes),
    updateClient: vi.fn<(clientId: string, update: UpdateClientInput) => Promise<OAuthClient>>().mockImplementation(async (clientId, update) => ({ ...mockClients.find((client) => client.client_id === clientId)!, ...update })),
    rotateClientSecret: vi.fn<(clientId: string) => Promise<{ client_secret: string }>>().mockResolvedValue({ client_secret: "sk-rotated-secret" }),
    deleteClient: vi.fn<(clientId: string) => Promise<void>>().mockResolvedValue(undefined),
    updateResourceServer: vi.fn<(id: string, update: UpdateResourceServerInput) => Promise<ResourceServer>>().mockImplementation(async (id, update) => ({ ...mockResourceServers.find((resource) => resource.id === id)!, ...update })),
    disableResourceServer: vi.fn<(id: string) => Promise<ResourceServer>>().mockImplementation(async (id) => ({ ...mockResourceServers.find((resource) => resource.id === id)!, enabled: false })),
    enableResourceServer: vi.fn<(id: string) => Promise<ResourceServer>>().mockImplementation(async (id) => ({ ...mockResourceServers.find((resource) => resource.id === id)!, enabled: true })),
    deleteResourceServer: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    updateBinding: vi.fn<(id: string, update: UpdateBindingInput) => Promise<ClientResourceScope>>().mockImplementation(async (id, update) => ({ ...mockBindings.find((binding) => binding.id === id)!, ...update })),
    deleteBinding: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe("OAuth detail content", () => {
  it("renders application overview and quickstart data", async () => {
    render(<ApplicationDetailContent clientId="cli_contentapi_a1b2c3d4e5f6" actions={makeOauthActions()} />);
    await waitFor(() => expect(screen.getAllByText("Content API").length).toBeGreaterThan(0));
    expect(screen.getByText("client_secret_post")).toBeInTheDocument();
    expect(screen.queryByText(/client_secret.*sk-/i)).toBeNull();
  });

  it("renders resource API overview with actor metadata", async () => {
    render(<ResourceApiDetailContent resourceServerId="rs_001" actions={makeOauthActions()} />);
    await waitFor(() => expect(screen.getAllByText("Content API").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/user_001/).length).toBeGreaterThan(0);
  });

  it("rotates an application secret from the detail header", async () => {
    const actions = makeOauthActions();
    render(<ApplicationDetailContent clientId="cli_contentapi_a1b2c3d4e5f6" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /rotate secret/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /rotate secret/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^rotate$/i }));
    await waitFor(() => expect(actions.rotateClientSecret).toHaveBeenCalledWith("cli_contentapi_a1b2c3d4e5f6", { kind: "platform" }));
    expect(await screen.findByText("sk-rotated-secret")).toBeInTheDocument();
  });

  it("omits empty optional arrays from update-client payloads", async () => {
    const actions = makeOauthActions();
    render(<ApplicationDetailContent clientId="cli_adminapp_9z8y7x6w5v4u" actions={actions} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /edit application/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit application/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Post-Logout Redirect URIs"), { target: { value: "https://admin.example.com/signed-out" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(actions.updateClient).toHaveBeenCalledWith(
      "cli_adminapp_9z8y7x6w5v4u",
      expect.objectContaining({
        redirect_uris: ["https://admin.example.com/callback"],
        post_logout_redirect_uris: ["https://admin.example.com/signed-out"],
      }),
      { kind: "platform" },
    ));
    expect(actions.updateClient.mock.calls[0]?.[1]).not.toHaveProperty("contacts");
    expect(actions.updateClient.mock.calls[0]?.[1]).not.toHaveProperty("token_endpoint_auth_method");
  });

  it("does not send hidden empty redirect URIs when editing M2M clients", async () => {
    const actions = makeOauthActions();
    render(<ApplicationDetailContent clientId="cli_contentapi_a1b2c3d4e5f6" actions={actions} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /edit application/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit application/i }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(actions.updateClient).toHaveBeenCalledWith(
      "cli_contentapi_a1b2c3d4e5f6",
      expect.not.objectContaining({ redirect_uris: expect.any(Array) }),
      { kind: "platform" },
    ));
  });

  it("disables a resource API from the detail header", async () => {
    const actions = makeOauthActions();
    render(<ResourceApiDetailContent resourceServerId="rs_001" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^disable$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^disable$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^disable$/i }));
    await waitFor(() => expect(actions.disableResourceServer).toHaveBeenCalledWith("rs_001", { kind: "platform" }));
  });

  it("renders M2M binding overview with scopes", async () => {
    render(<M2mBindingDetailContent bindingId="bind_001" actions={makeOauthActions()} />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Resource Access Binding" })).toBeInTheDocument());
    expect(screen.getAllByText("Content API").length).toBeGreaterThan(1);
    expect(screen.queryByText(/Content API -> Content API/)).toBeNull();
    expect(screen.getAllByText("content:read").length).toBeGreaterThan(0);
  });

  it("edits an M2M binding from the detail header", async () => {
    const actions = makeOauthActions();
    render(<M2mBindingDetailContent bindingId="bind_001" actions={actions} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /edit binding/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /edit binding/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(actions.updateBinding).toHaveBeenCalledWith("bind_001", expect.objectContaining({ allowedScopes: expect.any(Array) }), { kind: "platform" }));
  });

  it("deletes an M2M binding from the detail header", async () => {
    const actions = makeOauthActions();
    const onDeleted = vi.fn<() => void>();
    render(<M2mBindingDetailContent bindingId="bind_001" actions={actions} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(actions.deleteBinding).toHaveBeenCalledWith("bind_001", { kind: "platform" }));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
