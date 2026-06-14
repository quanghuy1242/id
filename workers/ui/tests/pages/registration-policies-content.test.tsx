// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithSwr as render } from "../_utils/swr-render";
import { RegistrationPoliciesContent } from "@/app/admin/_components/access/registration-policies-content";
import { mockRegistrationIntents, mockRegistrationPolicies } from "@/app/admin/_mocks/registration-policies";
import type { RegistrationPolicy, RegistrationPolicyFormInput } from "@/app/admin/_actions/registration-policies";
import type { ListPage, OAuthClient, OAuthResourceScope, ResourceServer } from "@/app/admin/_actions/oauth";
import type { Organization, Team } from "@/app/admin/_actions/organizations";

const mockClients: OAuthClient[] = [
  {
    client_id: "cli_content_web",
    client_name: "Content Web",
    redirect_uris: ["https://content.example.test/callback"],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
    scope: "openid profile email",
    type: "web",
  },
];
const mockResourceServers: ResourceServer[] = [
  {
    id: "rs_content",
    organizationId: null,
    slug: "content",
    name: "Content API",
    audience: "https://content.example.test",
    description: null,
    enabled: true,
    createdBy: "admin",
    updatedBy: "admin",
    disabledAt: null,
    disabledBy: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];
const mockScopes: OAuthResourceScope[] = [
  {
    id: "scope_content_read",
    resourceServerId: "rs_content",
    scope: "content:read",
    description: "Read content",
    enabled: true,
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

function page<T>(items: T[]): ListPage<T> {
  return { items, total: items.length, limit: 20, offset: 0 };
}

function pressTrigger(button: HTMLElement) {
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  fireEvent.click(button);
}

function makeActions(policies: RegistrationPolicy[]) {
  let current = [...policies];
  const setStatus = vi.fn<(id: string, status: RegistrationPolicy["status"]) => Promise<RegistrationPolicy>>()
    .mockImplementation(async (id, status) => {
      const policy = current.find((entry) => entry.id === id);
      if (!policy) throw new Error("Policy not found");
      const next = { ...policy, status, updatedAt: Date.now() };
      current = current.map((entry) => entry.id === id ? next : entry);
      return next;
    });
  return {
    listRegistrationPolicies: vi.fn<() => Promise<RegistrationPolicy[]>>().mockImplementation(async () => current),
    createRegistrationPolicy: vi.fn<(input: RegistrationPolicyFormInput) => Promise<RegistrationPolicy>>().mockImplementation(async (input) => {
      const next = {
        ...mockRegistrationPolicies[0]!,
        ...input,
        id: "regpol_created",
        status: "draft" as const,
        quota: {
          policyId: "regpol_created",
          quotaLimit: input.quotaLimit ?? null,
          quotaUsed: 0,
          quotaReserved: 0,
          quotaTarget: input.quotaTarget ?? "memberships",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      current = [next, ...current];
      return next;
    }),
    updateRegistrationPolicy: vi.fn<(id: string, input: Partial<RegistrationPolicyFormInput>) => Promise<RegistrationPolicy>>().mockImplementation(async (id, input) => {
      const policy = current.find((entry) => entry.id === id);
      if (!policy) throw new Error("Policy not found");
      const next = {
        ...policy,
        ...input,
        quota: {
          ...policy.quota,
          quotaLimit: input.quotaLimit === undefined ? policy.quota.quotaLimit : input.quotaLimit,
          quotaTarget: input.quotaTarget ?? policy.quota.quotaTarget,
        },
        updatedAt: Date.now(),
      };
      current = current.map((entry) => entry.id === id ? next : entry);
      return next;
    }),
    enableRegistrationPolicy: vi.fn<(id: string) => Promise<RegistrationPolicy>>().mockImplementation((id) => setStatus(id, "enabled")),
    pauseRegistrationPolicy: vi.fn<(id: string) => Promise<RegistrationPolicy>>().mockImplementation((id) => setStatus(id, "paused")),
    archiveRegistrationPolicy: vi.fn<(id: string) => Promise<RegistrationPolicy>>().mockImplementation((id) => setStatus(id, "archived")),
    listRegistrationPolicyIntents: vi.fn<() => Promise<typeof mockRegistrationIntents>>().mockResolvedValue(mockRegistrationIntents),
    listClients: vi.fn<() => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
    listClientsPage: vi.fn<() => Promise<ListPage<OAuthClient>>>().mockResolvedValue(page(mockClients)),
    listResourceServers: vi.fn<() => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers),
    listResourceServersPage: vi.fn<() => Promise<ListPage<ResourceServer>>>().mockResolvedValue(page(mockResourceServers)),
    listScopes: vi.fn<() => Promise<OAuthResourceScope[]>>().mockResolvedValue(mockScopes),
    listScopesPage: vi.fn<() => Promise<ListPage<OAuthResourceScope>>>().mockResolvedValue(page(mockScopes)),
    listOrganizations: vi.fn<() => Promise<Organization[]>>().mockResolvedValue([]),
    listTeams: vi.fn<() => Promise<Team[]>>().mockResolvedValue([]),
  };
}

describe("RegistrationPoliciesContent", () => {
  it("renders loading and error states", () => {
    const { rerender } = render(<RegistrationPoliciesContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
    rerender(<RegistrationPoliciesContent error="Policy load failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Policy load failed");
  });

  it("renders policy rows and selected intent detail", async () => {
    render(<RegistrationPoliciesContent actions={makeActions(mockRegistrationPolicies)} selectedId="regpol_content_beta" />);
    await waitFor(() => expect(screen.getAllByText("Content beta").length).toBeGreaterThan(0));
    expect(screen.getAllByText("enabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("231/1000 used · 4 reserved").length).toBeGreaterThan(0);
    expect(await screen.findByText("new@acme.com")).toBeInTheDocument();
    expect(screen.getByText("oauth_continuation_failed")).toBeInTheDocument();
  });

  it("filters policies client-side", async () => {
    render(<RegistrationPoliciesContent actions={makeActions(mockRegistrationPolicies)} />);
    await waitFor(() => expect(screen.getByText("Content beta")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "trial" } });
    expect(screen.getByText("Trial waitlist")).toBeInTheDocument();
    expect(screen.queryByText("Content beta")).not.toBeInTheDocument();
  });

  it("pauses a policy from the row actions", async () => {
    const actions = makeActions(mockRegistrationPolicies);
    render(<RegistrationPoliciesContent actions={actions} />);
    await waitFor(() => expect(screen.getByText("Content beta")).toBeInTheDocument());
    const row = screen.getByText("Content beta").closest("tr")!;
    pressTrigger(row.querySelector("button[aria-label='Actions']")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^pause$/i }));
    await waitFor(() => expect(actions.pauseRegistrationPolicy).toHaveBeenCalledWith("regpol_content_beta"));
  });

  it("creates a client registration policy by picking a client and building scopes", async () => {
    const actions = makeActions(mockRegistrationPolicies);
    render(<RegistrationPoliciesContent actions={actions} />);
    await waitFor(() => expect(screen.getByText("Content beta")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new policy/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Client launch" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "client-launch" } });

    // Pick the OAuth client from the picker instead of typing a raw id.
    const clientPicker = await screen.findByPlaceholderText("Select an OAuth client");
    pressTrigger(screen.getByRole("button", { name: /^toggle client$/i }));
    fireEvent.focus(clientPicker);
    fireEvent.change(clientPicker, { target: { value: "Content" } });
    await waitFor(() => expect(actions.listClientsPage).toHaveBeenCalledWith(
      expect.objectContaining({ q: "Content", limit: 20, offset: 0 }),
      expect.any(AbortSignal),
    ));
    fireEvent.click(await screen.findByRole("option", { name: /Content Web/ }));

    // Build an allowed scope via the catalog-aware scope builder.
    pressTrigger(screen.getByRole("button", { name: /allowed scopes/i }));
    const scopeSearch = await screen.findByRole("combobox", { name: /allowed scopes/i });
    fireEvent.change(scopeSearch, { target: { value: "content:read" } });
    fireEvent.keyDown(scopeSearch, { key: "Enter" });
    fireEvent.keyDown(scopeSearch, { key: "Escape" });
    fireEvent.blur(scopeSearch);

    // Set quota via the number field.
    const quota = screen.getByRole("textbox", { name: /quota limit/i });
    fireEvent.change(quota, { target: { value: "25" } });
    fireEvent.blur(quota);

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(actions.createRegistrationPolicy).toHaveBeenCalledWith(expect.objectContaining({
      slug: "client-launch",
      name: "Client launch",
      clientId: "cli_content_web",
      allowedScopes: expect.arrayContaining(["content:read"]),
      quotaLimit: 25,
    })));
  });

  it("updates an existing policy from the edit dialog", async () => {
    const actions = makeActions(mockRegistrationPolicies);
    render(<RegistrationPoliciesContent actions={actions} selectedId="regpol_content_beta" />);
    await waitFor(() => expect(screen.getAllByText("Content beta").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    await waitFor(() => expect(actions.listClientsPage).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["cli_content_web"], limit: 1, offset: 0 }),
    ));
    await waitFor(() => expect(screen.getByPlaceholderText("Select an OAuth client")).toHaveDisplayValue("Content Web"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Content launch" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(actions.updateRegistrationPolicy).toHaveBeenCalledWith("regpol_content_beta", expect.objectContaining({
      name: "Content launch",
    })));
  });

  it("does not fetch full OAuth catalogs when opening the policy dialog", async () => {
    const actions = makeActions(mockRegistrationPolicies);
    render(<RegistrationPoliciesContent actions={actions} />);
    await waitFor(() => expect(screen.getByText("Content beta")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new policy/i }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    await waitFor(() => expect(actions.listScopesPage).toHaveBeenCalled());
    expect(actions.listClients).not.toHaveBeenCalled();
    expect(actions.listResourceServers).not.toHaveBeenCalled();
    expect(actions.listScopes).not.toHaveBeenCalled();
    expect(actions.listClientsPage).not.toHaveBeenCalled();
    expect(actions.listResourceServersPage).not.toHaveBeenCalled();
  });
});
