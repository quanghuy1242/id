// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("user.update")).toBeInTheDocument();
    expect(screen.getByText("/admin/update-user")).toBeInTheDocument();
    expect(screen.getAllByText(/admin@example.test/).length).toBeGreaterThan(0);
    expect(actions.listActivityLog).toHaveBeenCalledWith(expect.objectContaining({ targetType: "user", targetId: "user_001" }));
  });
});
