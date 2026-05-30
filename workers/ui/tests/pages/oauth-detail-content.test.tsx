// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ApplicationDetailContent } from "@/app/admin/_components/oauth/application-detail-content";
import { ResourceApiDetailContent } from "@/app/admin/_components/oauth/resource-api-detail-content";
import { M2mBindingDetailContent } from "@/app/admin/_components/oauth/m2m-binding-detail-content";
import { mockBindings, mockClients, mockResourceServers } from "@/app/admin/_mocks/oauth";
import type { ClientResourceScope, OAuthClient, ResourceServer } from "@/app/admin/_actions/oauth";

function makeOauthActions() {
  return {
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
    listBindings: vi.fn<() => Promise<ClientResourceScope[]>>().mockResolvedValue(mockBindings),
    listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers),
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
    render(<ResourceApiDetailContent resourceServerId="rs_001" actions={{ listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers) }} />);
    await waitFor(() => expect(screen.getAllByText("Content API").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/user_001/).length).toBeGreaterThan(0);
  });

  it("renders M2M binding overview with scopes", async () => {
    render(<M2mBindingDetailContent bindingId="bind_001" actions={makeOauthActions()} />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Resource Access Binding" })).toBeInTheDocument());
    expect(screen.getAllByText("Content API").length).toBeGreaterThan(1);
    expect(screen.queryByText(/Content API -> Content API/)).toBeNull();
    expect(screen.getAllByText("content:read").length).toBeGreaterThan(0);
  });
});
