// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { JwksDetailContent } from "@/app/admin/_components/security/jwks-detail-content";
import { mockAdminJwks } from "@/app/admin/_mocks/security";
import type { AdminJwk } from "@/app/admin/_actions/audit";

function makeActions(keys: AdminJwk[]) {
  return { listJwks: vi.fn<() => Promise<AdminJwk[]>>().mockResolvedValue(keys) };
}

describe("JwksDetailContent", () => {
  it("renders overview metadata for a selected public key", async () => {
    render(<JwksDetailContent kid="abc123def456" actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => expect(screen.getByText("abc123def456")).toBeInTheDocument());
    expect(screen.getByText("Algorithm")).toBeInTheDocument();
    expect(screen.getByText("EdDSA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download public jwk/i })).toBeInTheDocument();
  });

  it("renders the public JWK tab without private material", async () => {
    render(<JwksDetailContent kid="abc123def456" activeTab="public-jwk" actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => expect(screen.getByText("Public JWK")).toBeInTheDocument());
    expect(screen.getByText(/EdDSA/)).toBeInTheDocument();
    expect(screen.queryByText(/privateKey/i)).toBeNull();
    expect(screen.queryByText(/"d"/i)).toBeNull();
  });

  it("renders metrics as a visible stub", async () => {
    render(<JwksDetailContent kid="abc123def456" activeTab="metrics" actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => expect(screen.getByText(/per-key usage metrics are not yet collected/i)).toBeInTheDocument());
  });

  it("shows not-found state for an unknown key id", async () => {
    render(<JwksDetailContent kid="missing-key" actions={makeActions(mockAdminJwks)} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/signing key not found/i));
  });
});
