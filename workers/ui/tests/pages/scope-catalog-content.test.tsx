// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ScopeCatalogContent } from "@/app/admin/_components/oauth/scope-catalog-content";
import { mockScopes, mockResourceServers } from "@/app/admin/_mocks/oauth";
import type { OAuthResourceScope, ResourceServer, UpdateScopeInput } from "@/app/admin/_actions/oauth";

function makeActions(scopes: OAuthResourceScope[]) {
  let current = [...scopes];
  return {
    listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockImplementation(async () => current),
    createScope: vi.fn<() => Promise<OAuthResourceScope>>().mockImplementation(async () => current[0]),
    updateScope: vi.fn<(id: string, d: UpdateScopeInput) => Promise<OAuthResourceScope>>().mockImplementation(async (id) => current.find((s) => s.id === id)!),
    listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers),
  };
}

describe("ScopeCatalogContent", () => {
  it("renders loading skeleton", () => {
    render(<ScopeCatalogContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<ScopeCatalogContent error="Bad" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad");
  });

  it("shows empty state", async () => {
    render(<ScopeCatalogContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no oauth scopes defined/i)).toBeInTheDocument());
  });

  it("renders scope rows joined to resource server names", async () => {
    render(<ScopeCatalogContent actions={makeActions(mockScopes)} />);
    await waitFor(() => expect(screen.getByText("content:read")).toBeInTheDocument());
    expect(screen.getAllByText("Content API").length).toBeGreaterThan(0);
  });

  it("omits unsupported delete actions", async () => {
    render(<ScopeCatalogContent actions={makeActions(mockScopes)} />);
    await waitFor(() => screen.getByText("content:read"));
    expect(screen.queryByRole("button", { name: /scope deletion via api pending/i })).toBeNull();
  });

  it("rejects an invalid scope string", async () => {
    const actions = makeActions(mockScopes);
    render(<ScopeCatalogContent actions={actions} defaultCreateOpen />);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    // Pick a resource API so validation reaches the scope-format check.
    fireEvent.click(within(dialog).getByRole("button", { name: /resource api/i }));
    fireEvent.click(await screen.findByRole("option", { name: /content api/i }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Scope" }), { target: { value: "BAD SCOPE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(within(dialog).getByText(/must be lowercase/i)).toBeInTheDocument());
    expect(actions.createScope).not.toHaveBeenCalled();
  });

  it("updates a scope (description + enabled) via edit", async () => {
    const actions = makeActions(mockScopes);
    render(<ScopeCatalogContent actions={actions} />);
    await waitFor(() => screen.getByText("content:read"));
    fireEvent.click(screen.getAllByRole("button", { name: /edit content:read/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(actions.updateScope).toHaveBeenCalledWith("sc_001", expect.objectContaining({ enabled: true })));
  });
});
