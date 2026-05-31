// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { Stack } from "@id/ui";
import { OrgDetailProvider } from "@/app/admin/_components/identity/org-detail-context";
import { OrgDetailHeaderContent } from "@/app/admin/_components/identity/org-detail-header-content";
import { OrgDetailOverviewContent } from "@/app/admin/_components/identity/org-detail-overview-content";
import { mockOrganizations } from "@/app/admin/_mocks/organizations";
import type { Organization } from "@/app/admin/_actions/organizations";

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
}: {
  org?: Organization;
  orgId?: string;
  loading?: boolean;
  error?: string;
  actions?: ReturnType<typeof makeActions>;
  onNavigateToOrgs?: () => void;
  scopedRoute?: boolean;
} = {}) {
  return render(
    <OrgDetailProvider orgId={orgId} loading={loading} error={error} actions={actions}>
      <Stack gap="md">
        <OrgDetailHeaderContent activeTab="overview" actions={actions} onNavigateToOrgs={onNavigateToOrgs} scopedRoute={scopedRoute} />
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

  it("hides the back button in scoped organization context", async () => {
    renderOrgDetail({ scopedRoute: true });
    await waitFor(() => expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0));
    expect(screen.queryByRole("link", { name: /back to organizations/i })).toBeNull();
    expect(screen.queryByRole("tablist", { name: /organization detail tabs/i })).toBeNull();
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
