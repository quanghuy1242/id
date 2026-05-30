// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ResourceApisContent } from "@/app/admin/_components/oauth/resource-apis-content";
import { mockResourceServers } from "@/app/admin/_mocks/oauth";
import { mockOrganizations } from "@/app/admin/_mocks/organizations";
import type { ResourceServer, CreateResourceServerInput, UpdateResourceServerInput } from "@/app/admin/_actions/oauth";
import type { Organization } from "@/app/admin/_actions/organizations";

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(servers: ResourceServer[]) {
  let current = [...servers];
  return {
    listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockImplementation(async () => current),
    createResourceServer: vi.fn<(d: CreateResourceServerInput) => Promise<ResourceServer>>().mockImplementation(async (d) => {
      const created: ResourceServer = {
        id: "rs_created", organizationId: d.organizationId ?? null, slug: d.slug, name: d.name, audience: d.audience,
        description: d.description ?? null, enabled: true, createdBy: "u", updatedBy: "u", disabledAt: null, disabledBy: null,
        createdAt: 0, updatedAt: 0,
      };
      current = [created, ...current];
      return created;
    }),
    updateResourceServer: vi.fn<(id: string, d: UpdateResourceServerInput) => Promise<ResourceServer>>().mockImplementation(async (id) => current.find((r) => r.id === id)!),
    disableResourceServer: vi.fn<(id: string) => Promise<ResourceServer>>().mockImplementation(async (id) => { current = current.map((r) => r.id === id ? { ...r, enabled: false } : r); return current.find((r) => r.id === id)!; }),
    enableResourceServer: vi.fn<(id: string) => Promise<ResourceServer>>().mockImplementation(async (id) => { current = current.map((r) => r.id === id ? { ...r, enabled: true, disabledAt: null, disabledBy: null } : r); return current.find((r) => r.id === id)!; }),
    deleteResourceServer: vi.fn<(id: string) => Promise<void>>().mockImplementation(async (id) => { current = current.filter((r) => r.id !== id); }),
    listOrganizations: vi.fn<() => Promise<Organization[]>>().mockResolvedValue(mockOrganizations),
  };
}

describe("ResourceApisContent", () => {
  it("renders loading skeleton", () => {
    render(<ResourceApisContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<ResourceApisContent error="Nope" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });

  it("shows empty state", async () => {
    render(<ResourceApisContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no resource apis registered/i)).toBeInTheDocument());
  });

  it("renders rows with status and system badges", async () => {
    render(<ResourceApisContent actions={makeActions(mockResourceServers)} />);
    await waitFor(() => expect(screen.getByText("Content API")).toBeInTheDocument());
    expect(screen.getAllByText("System").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(screen.getByText("Updated / By")).toBeInTheDocument();
  });

  it("calls onResourceClick for row navigation", async () => {
    const onResourceClick = vi.fn<(id: string) => void>();
    render(<ResourceApisContent actions={makeActions(mockResourceServers)} onResourceClick={onResourceClick} />);
    await waitFor(() => screen.getByText("Content API"));
    fireEvent.click(screen.getByText("content-api"));
    await waitFor(() => expect(onResourceClick).toHaveBeenCalledWith("rs_001"));
  });

  it("shows reversible status actions", async () => {
    render(<ResourceApisContent actions={makeActions(mockResourceServers)} />);
    await waitFor(() => screen.getByText("Content API"));
    expect(screen.getAllByRole("button", { name: "Actions" })).toHaveLength(4);
    const row = screen.getByText("Analytics API").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    expect(await screen.findByRole("menuitem", { name: /^activate$/i })).toBeInTheDocument();
  });

  it("activates a disabled resource API", async () => {
    const actions = makeActions(mockResourceServers);
    render(<ResourceApisContent actions={actions} />);
    await waitFor(() => screen.getByText("Analytics API"));
    const row = screen.getByText("Analytics API").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^activate$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^activate$/i }));
    await waitFor(() => expect(actions.enableResourceServer).toHaveBeenCalledWith("rs_003"));
  });

  it("registers a new resource API", async () => {
    const actions = makeActions([]);
    render(<ResourceApisContent actions={actions} defaultCreateOpen />);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Billing API" } });
    fireEvent.change(screen.getByLabelText(/^slug/i), { target: { value: "billing-api" } });
    fireEvent.change(screen.getByLabelText(/^audience/i), { target: { value: "https://billing.example.com" } });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^register$/i }));
    await waitFor(() => expect(actions.createResourceServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Billing API", slug: "billing-api", audience: "https://billing.example.com" }),
    ));
  });

  it("deletes a resource API", async () => {
    const actions = makeActions(mockResourceServers);
    render(<ResourceApisContent actions={actions} />);
    await waitFor(() => screen.getByText("Content API"));
    const row = screen.getByText("Content API").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^delete$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(actions.deleteResourceServer).toHaveBeenCalledWith("rs_001"));
  });
});
