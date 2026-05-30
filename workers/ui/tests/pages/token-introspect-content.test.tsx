// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithSwr as render } from "../_utils/swr-render";
import { describe, expect, it, vi } from "vitest";
import { TokenIntrospectContent } from "@/app/admin/_components/security/token-introspect-content";
import type { TokenIntrospectionInput, TokenIntrospectionResult } from "@/app/admin/_actions/audit";

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

const jwt = `${base64Url({ alg: "EdDSA", kid: "kid_123" })}.${base64Url({ aud: "content-api", exp: 1_800_000_000, scope: "content:read" })}.signature`;

describe("TokenIntrospectContent", () => {
  it("decodes JWT header and claims locally", () => {
    render(<TokenIntrospectContent actions={{ introspectToken: vi.fn<(input: TokenIntrospectionInput) => Promise<TokenIntrospectionResult>>() }} />);
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: jwt } });
    expect(screen.getByText("Decoded Header")).toBeInTheDocument();
    expect(screen.getAllByText(/kid_123/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/content-api/).length).toBeGreaterThan(0);
  });

  it("calls RFC 7662 introspection with the pasted token", async () => {
    const introspectToken = vi.fn<(input: TokenIntrospectionInput) => Promise<TokenIntrospectionResult>>()
      .mockResolvedValue({ active: true, client_id: "cli_content", token_type: "Bearer", scope: "content:read", exp: 1_800_000_000 });
    render(<TokenIntrospectContent actions={{ introspectToken }} />);
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: jwt } });
    fireEvent.click(screen.getByRole("button", { name: /introspect/i }));
    await waitFor(() => expect(introspectToken).toHaveBeenCalledWith(expect.objectContaining({ token: jwt, token_type_hint: "access_token" })));
    expect(await screen.findByText("Introspection Response")).toBeInTheDocument();
    expect(screen.getByText("cli_content")).toBeInTheDocument();
  });
});
