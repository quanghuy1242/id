// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { OrganizationsListContent } from "@/app/admin/_components/identity/organizations-list-content";
import { mockOrganizations } from "@/app/admin/_mocks/organizations";
import type { Organization } from "@/app/admin/_actions/organizations";

function makeActions(orgs: Organization[]) {
  let current = [...orgs];
  return {
    listOrganizations: vi.fn<() => Promise<Organization[]>>().mockImplementation(async () => current),
    createOrganization: vi.fn<(data: { name: string; slug: string; logo?: string; metadata?: string }) => Promise<Organization>>().mockImplementation(
      async (data) => {
        const org: Organization = {
          id: `org_${Date.now()}`,
          name: data.name,
          slug: data.slug,
          logo: null,
          metadata: null,
          createdAt: new Date().toISOString(),
        };
        current = [org, ...current];
        return org;
      }),
  };
}

describe("OrganizationsListContent", () => {
  it("renders loading skeleton when loading prop passed", () => {
    render(<OrganizationsListContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    render(<OrganizationsListContent error="Failed to load" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
  });

  it("shows empty state when no orgs returned", async () => {
    const actions = makeActions([]);
    render(<OrganizationsListContent actions={actions} />);
    await waitFor(() => expect(screen.getByText(/no organizations/i)).toBeInTheDocument());
  });

  it("renders org table with rows", async () => {
    const actions = makeActions(mockOrganizations);
    render(<OrganizationsListContent actions={actions} />);
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument());
    expect(screen.getByText("acme")).toBeInTheDocument();
  });

  it("calls onRowClick with org id when row clicked", async () => {
    const onRowClick = vi.fn<(id: string) => void>();
    const actions = makeActions(mockOrganizations);
    render(<OrganizationsListContent actions={actions} onRowClick={onRowClick} />);
    await waitFor(() => screen.getByText("Acme Corp"));
    fireEvent.click(screen.getByText("Acme Corp"));
    expect(onRowClick).toHaveBeenCalledWith(mockOrganizations[0].id);
  });

  it("opens create dialog and calls createOrganization", async () => {
    const actions = makeActions([]);
    render(<OrganizationsListContent actions={actions} />);
    await waitFor(() => screen.getAllByRole("button", { name: /create organization/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /create organization/i })[0]);
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Test Corp" } });
    fireEvent.change(screen.getByLabelText(/^slug/i), { target: { value: "test-corp" } });
    expect(screen.getByRole("textbox", { name: /metadata/i })).toHaveAttribute("name", "metadata");
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(actions.createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test Corp", slug: "test-corp" }),
    ));
  });

  it("filters orgs client-side via search prop", async () => {
    const actions = makeActions(mockOrganizations);
    render(<OrganizationsListContent actions={actions} search="beta" />);
    await waitFor(() => expect(screen.queryByText("Acme Corp")).toBeNull());
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
  });
});
