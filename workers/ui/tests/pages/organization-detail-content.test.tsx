// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { Stack } from "@idco/ui";
import { OrgDetailProvider } from "@/app/admin/_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "@/app/admin/_components/identity/org-detail-header-content";
import { OrgDetailOverviewContent } from "@/app/admin/_components/identity/org-detail-overview-content";
import {
  mockInvitations,
  mockMembers,
  mockOrganizations,
  mockTeams,
} from "@/app/admin/_mocks/organizations";
import { mockActivities } from "@/app/admin/_mocks/audit";
import { mockBindings, mockClients, mockResourceServers, mockScopes } from "@/app/admin/_mocks/oauth";
import { mockConsents } from "@/app/admin/_mocks/security";
import type { AdminActivity, AdminConsent, Paginated } from "@/app/admin/_actions/audit";
import type { ActiveScope } from "@idco/lib";
import type { Organization } from "@/app/admin/_actions/organizations";
import type { ClientResourceScope, OAuthClient, OAuthResourceScope, ResourceServer } from "@/app/admin/_actions/oauth";

const baseOrg = mockOrganizations[0];

function makeActions(org: Organization) {
  let current = { ...org };
  return {
    getFullOrganization: vi.fn<() => Promise<Organization>>().mockImplementation(async () => current),
    updateOrganization: vi.fn<(id: string, data: Partial<Organization>) => Promise<Organization>>().mockImplementation(
      async (_id, data) => {
        current = Object.assign({}, current, data);
        return current;
      }),
    deleteOrganization: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    listMembers: vi.fn<() => Promise<typeof mockMembers>>().mockResolvedValue(mockMembers),
    listTeams: vi.fn<() => Promise<typeof mockTeams>>().mockResolvedValue(mockTeams),
    listInvitations: vi.fn<() => Promise<typeof mockInvitations>>().mockResolvedValue(mockInvitations),
    listClients: vi.fn<(scope?: ActiveScope) => Promise<OAuthClient[]>>().mockResolvedValue(mockClients),
    listResourceServers: vi.fn<(scope?: ActiveScope) => Promise<ResourceServer[]>>().mockResolvedValue(mockResourceServers.filter((server) => server.organizationId === "org_001")),
    listScopes: vi.fn<(scope?: ActiveScope) => Promise<OAuthResourceScope[]>>().mockResolvedValue(mockScopes),
    listBindings: vi.fn<(scope?: ActiveScope) => Promise<ClientResourceScope[]>>().mockResolvedValue(mockBindings),
    listAdminConsents: vi.fn<(params: { limit: number; offset: number; organizationId?: string }) => Promise<Paginated<"consents", AdminConsent>>>().mockResolvedValue({
      consents: mockConsents.slice(0, 1),
      total: mockConsents.length,
      limit: 1,
      offset: 0,
    }),
    listActivityLog: vi.fn<(params: { limit: number; offset: number; organizationId?: string }) => Promise<Paginated<"entries", AdminActivity>>>().mockResolvedValue({
      entries: mockActivities.slice(0, 1),
      total: mockActivities.length,
      limit: 1,
      offset: 0,
    }),
  };
}

function renderOrgDetail({
  org = baseOrg,
  orgId = "org_001",
  loading,
  error,
  actions = makeActions(org),
  onNavigateToOrgs,
  scopedRoute,
  routeBasePath,
  backHref,
}: {
  org?: Organization;
  orgId?: string;
  loading?: boolean;
  error?: string;
  actions?: ReturnType<typeof makeActions>;
  onNavigateToOrgs?: () => void;
  scopedRoute?: boolean;
  routeBasePath?: string;
  backHref?: string;
} = {}) {
  return render(
    <OrgDetailProvider orgId={orgId} loading={loading} error={error} actions={actions}>
      <Stack gap="md">
        <OrgDetailHeaderContent
          activeTab="overview"
          actions={actions}
          routeBasePath={routeBasePath}
          backHref={backHref}
          onNavigateToOrgs={onNavigateToOrgs}
          scopedRoute={scopedRoute}
        />
        <OrgDetailOverviewContent actions={actions} />
      </Stack>
    </OrgDetailProvider>,
  );
}

describe("Organization detail nested content", () => {
  it("renders loading skeleton when loading prop passed", () => {
    renderOrgDetail({ loading: true });
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    renderOrgDetail({ error: "Not found" });
    expect(screen.getByRole("alert")).toHaveTextContent("Not found");
  });

  it("renders org name and slug badge", async () => {
    const actions = makeActions(baseOrg);
    renderOrgDetail({ actions });
    await waitFor(() => expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0));
    expect(screen.getByText("#acme")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText(/"plan":/)).toBeInTheDocument();
  });

  it("renders organization overview counts and scoped workflow links", async () => {
    const actions = makeActions(baseOrg);
    renderOrgDetail({ actions, scopedRoute: true });

    await waitFor(() => expect(screen.getByText("collaboration groups")).toBeInTheDocument());
    expect(screen.getByText(/pending invites/)).toBeInTheDocument();
    expect(screen.getByText("org-owned client grants")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /open/i }).some((link) =>
        link.getAttribute("href") === "/admin/orgs/org_001/security/consents",
      ),
    ).toBe(true);
    await waitFor(() =>
      expect(actions.listAdminConsents).toHaveBeenCalledWith({
        limit: 1,
        offset: 0,
        organizationId: "org_001",
      }),
    );
    expect(actions.listClients).toHaveBeenCalledWith({
      kind: "organization",
      organizationId: "org_001",
    });
    expect(actions.listActivityLog).toHaveBeenCalledWith({
      limit: 1,
      offset: 0,
      organizationId: "org_001",
    });
  });

  it("hides the back button in scoped organization context", async () => {
    renderOrgDetail({ scopedRoute: true });
    await waitFor(() => expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0));
    expect(screen.queryByRole("link", { name: /back to organizations/i })).toBeNull();
    expect(screen.queryByRole("tablist", { name: /organization detail tabs/i })).toBeNull();
  });

  it("renders platform drilldown tabs without switching to the scoped org lens", async () => {
    renderOrgDetail({
      routeBasePath: "/admin/platform/identity/organizations/org_001",
      backHref: "/admin/platform/identity/organizations",
    });

    await waitFor(() => expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0));
    expect(screen.getByRole("link", { name: /back to organizations/i })).toHaveAttribute("href", "/admin/platform/identity/organizations");
    expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("href", "/admin/platform/identity/organizations/org_001/members");
    expect(screen.getByRole("tab", { name: "Teams" })).toHaveAttribute("href", "/admin/platform/identity/organizations/org_001/teams");
  });

  it("opens Edit Organization dialog", async () => {
    const actions = makeActions(baseOrg);
    renderOrgDetail({ actions });
    await waitFor(() => screen.getByRole("button", { name: /edit organization/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit organization/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /metadata/i })).toHaveValue(baseOrg.metadata);
  });

  it("delete confirm button disabled until correct slug typed", async () => {
    const actions = makeActions(baseOrg);
    renderOrgDetail({ actions });
    await waitFor(() => screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    const confirmBtn = screen.getByRole("button", { name: /delete org/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type.*confirm/i), { target: { value: "acme" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /delete org/i })).not.toBeDisabled());
  });

  it("calls deleteOrganization and fires navigation callback", async () => {
    const onNavigate = vi.fn<() => void>();
    const actions = makeActions(baseOrg);
    renderOrgDetail({ actions, onNavigateToOrgs: onNavigate });
    await waitFor(() => screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/type.*confirm/i), { target: { value: "acme" } });
    await waitFor(() => screen.getByRole("button", { name: /delete org/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete org/i }));
    await waitFor(() => {
      expect(actions.deleteOrganization).toHaveBeenCalledWith("org_001");
      expect(onNavigate).toHaveBeenCalled();
    });
  });
});
