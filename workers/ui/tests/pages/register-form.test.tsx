// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/app/register/register-form";

const mockPush = vi.fn<() => void>();
const mockAuthApiPost = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAuthApiPostOrThrow = vi.fn<(...args: unknown[]) => Promise<unknown>>();
let mockOauthQuery = "client_id=acme-web&scope=openid%20profile%20email";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => mockOauthQuery,
}));

vi.mock("@id/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  authApiPost: (...args: unknown[]) => mockAuthApiPost(...args),
  authApiPostOrThrow: (...args: unknown[]) => mockAuthApiPostOrThrow(...args),
}));

function allowedDecision() {
  return {
    decision: "allowed",
    intentId: "regint_test",
    client: { clientId: "acme-web", clientName: "Acme Web" },
    organization: { id: "org_acme", name: "Acme Corp" },
    invitation: null,
    requestedScopes: ["openid", "profile", "email", "content:write"],
    allowedScopes: ["openid", "profile", "email"],
    expiresAt: Date.now() + 900000,
    continueOAuth: true,
  };
}

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOauthQuery = "client_id=acme-web&scope=openid%20profile%20email";
    mockAuthApiPostOrThrow.mockResolvedValue(allowedDecision());
    mockAuthApiPost.mockImplementation((path: unknown) =>
      path === "/oauth2/continue"
        ? Promise.resolve({ code: "UNAUTHORIZED", message: "Verification required" })
        : Promise.resolve({ status: true }),
    );
  });

  it("evaluates registration policy and renders trusted client/org context", async () => {
    render(<RegisterForm />);
    await waitFor(() => {
      expect(mockAuthApiPostOrThrow).toHaveBeenCalledWith("/registration/evaluate", { oauthQuery: mockOauthQuery });
    });
    expect(await screen.findByText(/Acme Web is requesting account creation/i)).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp workspace/i)).toBeInTheDocument();
    expect(screen.getByText("openid")).toBeInTheDocument();
    expect(screen.queryByText("content:write")).not.toBeInTheDocument();
  });

  it("renders denied registration state", async () => {
    mockAuthApiPostOrThrow.mockResolvedValue({
      decision: "denied",
      reason: "quota_full",
      message: "The beta is full for this application.",
    });
    render(<RegisterForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The beta is full");
    fireEvent.click(screen.getByRole("button", { name: /sign in instead/i }));
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("preflights submit, passes the intent header to sign-up, and shows verification-required state", async () => {
    render(<RegisterForm />);
    await screen.findByLabelText(/name/i);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.test" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockAuthApiPostOrThrow).toHaveBeenCalledWith("/registration/submit", {
        intentId: "regint_test",
        name: "Test User",
        email: "test@example.test",
        password: "password12345",
      });
    });
    expect(mockAuthApiPost).toHaveBeenCalledWith(
      "/sign-up/email",
      {
        name: "Test User",
        email: "test@example.test",
        password: "password12345",
        oauth_query: mockOauthQuery,
      },
      { headers: { "x-id-registration-intent": "regint_test" } },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your email");
  });

  it("supports invite-only registration without OAuth continuation", async () => {
    mockOauthQuery = "";
    mockAuthApiPostOrThrow.mockImplementation((path: unknown) => {
      if (path === "/registration/evaluate") {
        return Promise.resolve({
          decision: "allowed",
          intentId: "regint_invite",
          client: null,
          organization: { id: "org_acme", name: "Acme Corp" },
          invitation: { id: "inv_001", email: "invitee@example.test", role: "member" },
          requestedScopes: [],
          allowedScopes: [],
          expiresAt: Date.now() + 900000,
          continueOAuth: false,
        });
      }
      return Promise.resolve({ status: "ready" });
    });
    render(<RegisterForm invitationId="inv_001" />);
    await waitFor(() => {
      expect(mockAuthApiPostOrThrow).toHaveBeenCalledWith("/registration/evaluate", { invitationId: "inv_001" });
    });
    expect(await screen.findByText(/Create an account to accept this invitation/i)).toBeInTheDocument();
    expect(screen.getByText(/invitee@example.test/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Invitee" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "invitee@example.test" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith(
        "/sign-up/email",
        {
          name: "Invitee",
          email: "invitee@example.test",
          password: "password12345",
        },
        { headers: { "x-id-registration-intent": "regint_invite" } },
      );
    });
    expect(mockAuthApiPost).not.toHaveBeenCalledWith("/oauth2/continue", expect.anything());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/account/organizations"));
  });
});
