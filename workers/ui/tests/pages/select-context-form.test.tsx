// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SelectContextForm } from "@/app/select-authorization-context/select-context-form";

const mockPush = vi.fn<() => void>();
const mockAuthApiPost = vi.fn<(...args: unknown[]) => void>();
const mockFetch = vi.fn<typeof globalThis.fetch>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => "",
  useOauthRequestDescription: () => "An application is requesting access.",
}));

vi.mock("@id/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  authApiPost: (...args: unknown[]) => mockAuthApiPost(...args),
  authApiGetOrThrow: (path: string, params?: Record<string, string | number | undefined>) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString() : "";
    return fetch(`/api/auth${path}${qs ? `?${qs}` : ""}`).then((r: Response) => r.json());
  },
}));

describe("SelectContextForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it("renders request description", () => {
    render(<SelectContextForm />);
    expect(screen.getByText(/an application is requesting access/i)).toBeInTheDocument();
  });

  it("renders continue button", () => {
    render(<SelectContextForm />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("renders individual access radio group", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByText(/individual access/i)).toBeInTheDocument();
    });
  });

  it("renders workspace access when organizations exist", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([{ id: "org1", name: "Acme Corp" }]),
    });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByText(/workspace access/i)).toBeInTheDocument();
      expect(screen.getByText(/acme corp/i)).toBeInTheDocument();
    });
  });

  it("shows no organizations message when no orgs", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByText(/no organizations available/i)).toBeInTheDocument();
    });
  });

  it("submits with direct-share selection by default", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    mockAuthApiPost.mockResolvedValue({ redirect_uri: "https://app.example.com/callback" });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith(
        "/oauth2/continue",
        { postLogin: true, oauth_query: "" },
        { headers: { "x-id-oauth-context": "direct-share" } },
      );
    });
  });

  it("submits with workspace context when selected", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([{ id: "org1", name: "Acme Corp" }]),
    });
    mockAuthApiPost.mockResolvedValue({ redirect_uri: "https://app.example.com/callback" });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith(
        "/oauth2/continue",
        { postLogin: true, oauth_query: "" },
        { headers: { "x-id-oauth-context": "workspace:org1" } }
      );
    });
  });

  it("redirects on successful selection", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    mockAuthApiPost.mockResolvedValue({ redirect_uri: "https://app.example.com/callback" });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("https://app.example.com/callback");
    });
  });

  it("redirects when Better Auth continue returns a url field", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "https://app.example.com/callback?code=abc" });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("https://app.example.com/callback?code=abc");
    });
  });

  it("shows error message on failure", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    mockAuthApiPost.mockResolvedValue({ message: "Selection failed" });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Selection failed");
    });
  });

  it("shows network error on fetch failure", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    mockAuthApiPost.mockRejectedValue(new Error("Network error"));

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error. Please try again.");
    });
  });

  it("disables continue button while loading", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve([]),
    });
    let resolvePromise: (value: unknown) => void;
    mockAuthApiPost.mockImplementation(
      () => new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /continue/i }).click();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /processing/i })).toBeDisabled();
    });

    resolvePromise!({ redirect_uri: "/" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
    });
  });

  it("handles organization fetch failure gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Fetch failed"));

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByText(/no organizations available/i)).toBeInTheDocument();
    });
  });

  it("handles malformed organization API responses as zero organizations", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ error: "unavailable" }),
    });

    render(<SelectContextForm />);
    await waitFor(() => {
      expect(screen.getByText(/no organizations available/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("radio", { name: /direct share/i })).toBeChecked();
  });
});
