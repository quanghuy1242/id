// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { ActivityLogContent } from "@/app/admin/_components/activity-log-content";
import { mockActivities } from "@/app/admin/_mocks/audit";
import type { ActivityLogParams, AdminActivity, Paginated } from "@/app/admin/_actions/audit";

function makeActions(entries = mockActivities) {
  return {
    listActivityLog: vi.fn<(params: ActivityLogParams) => Promise<Paginated<"entries", AdminActivity>>>().mockResolvedValue({
      entries,
      total: entries.length,
      limit: 25,
      offset: 0,
    }),
  };
}

describe("ActivityLogContent", () => {
  it("renders loading skeleton when loading prop passed", () => {
    render(<ActivityLogContent targetType="user" targetId="user_001" loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert when error prop passed", () => {
    render(<ActivityLogContent targetType="user" targetId="user_001" error="Failed to load activity" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load activity");
  });

  it("renders empty state", async () => {
    const actions = makeActions([]);
    render(<ActivityLogContent targetType="user" targetId="user_001" actions={actions} />);
    await waitFor(() => expect(screen.getByText("No activity recorded for this resource")).toBeInTheDocument());
  });

  it("renders audit table entries and calls the activity endpoint with target params", async () => {
    const actions = makeActions();
    render(<ActivityLogContent targetType="user" targetId="user_001" actions={actions} />);

    await waitFor(() => expect(screen.getByText("User Update")).toBeInTheDocument());
    expect(screen.getByRole("grid")).toHaveClass("table-fixed", "min-w-[72rem]");
    expect(screen.getByRole("grid").parentElement).toHaveClass("overflow-x-auto", "min-w-0", "max-w-full");
    expect(screen.getByText("user.update")).toBeInTheDocument();
    expect(screen.getByText("Updated user user_001: name")).toBeInTheDocument();
    expect(screen.getByText("user:user_001")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Payload" })[0]!);
    expect(screen.getAllByText(/admin\/update-user/u).length).toBeGreaterThan(0);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getAllByText("No fresh step-up").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/admin@example.test/).length).toBeGreaterThan(0);
    expect(actions.listActivityLog).toHaveBeenCalledWith(expect.objectContaining({ targetType: "user", targetId: "user_001" }));
  });

  it("passes organizationId for org-scoped audit reads", async () => {
    const orgEntries = mockActivities.filter((entry) => entry.organizationId === "org_001" || (entry.targetType === "organization" && entry.targetId === "org_001"));
    const actions = makeActions(orgEntries);
    render(
      <ActivityLogContent
        organizationId="org_001"
        actions={actions}
      />,
    );

    await waitFor(() => expect(screen.getByText("Organization Update")).toBeInTheDocument());
    expect(screen.getByText("Updated organization org_001: name, slug")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Team Add Member")).toBeInTheDocument());
    expect(screen.getByText("Added user user_003 to team team_001")).toBeInTheDocument();
    expect(screen.getByText("team:team_001")).toBeInTheDocument();
    expect(screen.getAllByText("Organization").length).toBeGreaterThan(0);
    expect(screen.getAllByText("org_001").length).toBeGreaterThan(0);
    const call = actions.listActivityLog.mock.calls[0]?.[0];
    expect(call).toEqual(expect.objectContaining({ organizationId: "org_001", limit: 25, offset: 0 }));
    expect(call?.targetType).toBeUndefined();
    expect(call?.targetId).toBeUndefined();
  });
});
