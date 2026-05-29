// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConsentForm } from "@/app/consent/consent-form";

const mockPush = vi.fn<() => void>();
const mockAuthApiPost = vi.fn<(...args: unknown[]) => void>();
let mockOauthQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => mockOauthQuery,
  useOauthRequestDescription: (q: string) => {
    if (!q) return "An application is requesting access.";
    const search = new URLSearchParams(q);
    const clientId = search.get("client_id") ?? "this application";
    return `Client ${clientId} is requesting access.`;
  },
}));

vi.mock("@id/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  authApiPost: (...args: unknown[]) => mockAuthApiPost(...args),
}));

describe("ConsentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOauthQuery = "";
  });

  it("renders allow and deny buttons", () => {
    render(<ConsentForm />);
    expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("shows default application name when no oauth query", () => {
    render(<ConsentForm />);
    expect(screen.getByText(/an application/i, { exact: false })).toBeInTheDocument();
  });

  it("shows client id from oauth query", () => {
    mockOauthQuery = "client_id=test-app&scope=openid profile";

    render(<ConsentForm />);
    expect(screen.getByText(/Client test-app/i)).toBeInTheDocument();
  });

  it("shows scopes as badges when present", () => {
    mockOauthQuery = "client_id=test-app&scope=openid profile email";

    render(<ConsentForm />);
    expect(screen.getByText(/openid/i)).toBeInTheDocument();
    expect(screen.getByText(/profile/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
  });

  it("submits accept when allow is clicked", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect_uri: "https://app.example.com/callback" });

    render(<ConsentForm />);
    screen.getByRole("button", { name: /allow/i }).click();

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/oauth2/consent", {
        accept: true,
        oauth_query: "",
      });
    });
  });

  it("submits deny when deny is clicked", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect_uri: "https://app.example.com/callback" });
    mockOauthQuery = "client_id=client_1&scope=openid";

    render(<ConsentForm />);
    screen.getByRole("button", { name: /deny/i }).click();

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/oauth2/consent", {
        accept: false,
        oauth_query: "client_id=client_1&scope=openid",
      });
    });
  });

  it("redirects on successful consent", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect_uri: "https://app.example.com/callback" });

    render(<ConsentForm />);
    screen.getByRole("button", { name: /allow/i }).click();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("https://app.example.com/callback");
    });
  });

  it("redirects when Better Auth returns a url field", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "https://app.example.com/callback?code=abc" });

    render(<ConsentForm />);
    screen.getByRole("button", { name: /allow/i }).click();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("https://app.example.com/callback?code=abc");
    });
  });

  it("shows error message on consent failure", async () => {
    mockAuthApiPost.mockResolvedValue({ message: "Consent denied" });

    render(<ConsentForm />);
    screen.getByRole("button", { name: /allow/i }).click();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Consent denied");
    });
  });

  it("shows network error on fetch failure", async () => {
    mockAuthApiPost.mockRejectedValue(new Error("Network error"));

    render(<ConsentForm />);
    screen.getByRole("button", { name: /allow/i }).click();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error. Please try again.");
    });
  });

  it("disables buttons while loading", async () => {
    let resolvePromise: (value: unknown) => void;
    mockAuthApiPost.mockImplementation(
      () => new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    render(<ConsentForm />);
    screen.getByRole("button", { name: /allow/i }).click();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /allow/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /deny/i })).toBeDisabled();
    });

    resolvePromise!({ redirect_uri: "/" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /allow/i })).not.toBeDisabled();
    });
  });
});
