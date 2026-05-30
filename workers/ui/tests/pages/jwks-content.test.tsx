// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { JwksContent } from "@/app/admin/_components/security/jwks-content";
import { mockAdminJwks } from "@/app/admin/_mocks/security";
import type { AdminJwk } from "@/app/admin/_actions/audit";

function makeActions(keys: AdminJwk[]) {
  const fallback: AdminJwk = keys[0] ?? {
    id: "new-key",
    alg: "EdDSA",
    createdAt: Date.now(),
    expiresAt: null,
    status: "active",
    publicJwk: { kid: "new-key", kty: "OKP", crv: "Ed25519", x: "public", alg: "EdDSA" },
  };
  return {
    listJwks: vi.fn<() => Promise<AdminJwk[]>>().mockResolvedValue(keys),
    rotateJwks: vi.fn<(reason: string) => Promise<AdminJwk & { reason: string }>>()
      .mockImplementation(async (reason) => ({ ...fallback, reason })),
  };
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

  it("renders stats and table rows with status badges", async () => {
    render(<JwksContent actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => expect(screen.getByText("abc123def456")).toBeInTheDocument());
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rotated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: /key id/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /emergency rotate/i })).toBeInTheDocument();
  });

  it("never renders a private key field", async () => {
    render(<JwksContent actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => screen.getByText("abc123def456"));
    expect(screen.queryByText(/privateKey/i)).toBeNull();
  });

  it("navigates by selected key when row click is configured", async () => {
    const onKeyClick = vi.fn<(kid: string) => void>();
    render(<JwksContent actions={makeActions(mockAdminJwks)} onKeyClick={onKeyClick} />);
    await waitFor(() => screen.getByText("abc123def456"));
    fireEvent.click(screen.getByText("abc123def456"));
    await waitFor(() => expect(onKeyClick).toHaveBeenCalledWith("abc123def456"));
  });

  it("emergency-rotates with a required reason", async () => {
    const actions = makeActions(mockAdminJwks);
    render(<JwksContent actions={actions} />);
    await waitFor(() => screen.getByText("abc123def456"));
    fireEvent.click(screen.getByRole("button", { name: /emergency rotate/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "compromise drill" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /rotate key/i }));
    await waitFor(() => expect(actions.rotateJwks).toHaveBeenCalledWith("compromise drill"));
  });
});
