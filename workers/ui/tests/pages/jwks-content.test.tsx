// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { JwksContent } from "@/app/admin/_components/security/jwks-content";
import { mockAdminJwks } from "@/app/admin/_mocks/security";
import type { AdminJwk } from "@/app/admin/_actions/audit";

function makeActions(keys: AdminJwk[]) {
  return { listJwks: vi.fn<() => Promise<AdminJwk[]>>().mockResolvedValue(keys) };
}

describe("JwksContent", () => {
  it("renders loading skeleton", () => {
    render(<JwksContent loading />);
    expect(document.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("renders error alert", () => {
    render(<JwksContent error="Failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
  });

  it("renders empty state", async () => {
    render(<JwksContent actions={makeActions([])} />);
    await waitFor(() => expect(screen.getByText(/no jwks keys available/i)).toBeInTheDocument());
  });

  it("renders one panel per key with status badges and counts", async () => {
    render(<JwksContent actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => expect(screen.getByText("abc123def456")).toBeInTheDocument());
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Rotated")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText(/1 active, 1 rotated, 1 expired/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /copy/i })).toHaveLength(3);
    expect(screen.getAllByText("Public JWK")).toHaveLength(3);
  });

  it("never renders a private key field", async () => {
    render(<JwksContent actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => screen.getByText("abc123def456"));
    expect(screen.queryByText(/privateKey/i)).toBeNull();
  });
});
