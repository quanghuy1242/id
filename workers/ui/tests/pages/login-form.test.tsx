// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LoginForm } from "@/app/login/login-form";

const mockPush = vi.fn<() => void>();
const mockPostAuthApi = vi.fn<(...args: unknown[]) => void>();
let mockOauthQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => mockOauthQuery,
}));

vi.mock("@id/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  postAuthApi: (...args: unknown[]) => mockPostAuthApi(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockOauthQuery = "";
});

describe("LoginForm", () => {
  it("renders email and password inputs", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders a sign in button", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows email required error when email is empty", async () => {
    render(<LoginForm />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });
  });

  it("shows invalid email error for malformed email", async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "invalid" } });
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    });
  });

  it("shows password required error when password is empty", async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });
  });

  it("shows password length error for short password", async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    });
  });

  it("submits the form with valid credentials", async () => {
    mockPostAuthApi.mockResolvedValue({ redirect: true, url: "/dashboard" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPostAuthApi).toHaveBeenCalledWith("/sign-in/email", {
        email: "test@example.com",
        password: "password123",
        oauth_query: "",
      });
    });
  });

  it("redirects on successful login with redirect flag", async () => {
    mockPostAuthApi.mockResolvedValue({ redirect: true, url: "/dashboard" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error message on failed login", async () => {
    mockPostAuthApi.mockResolvedValue({ message: "Invalid credentials" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });
  });

  it("shows network error on fetch failure", async () => {
    mockPostAuthApi.mockRejectedValue(new Error("Network error"));

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error. Please try again.");
    });
  });

  it("shows loading state while submitting", async () => {
    mockPostAuthApi.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ redirect: true, url: "/" }), 100))
    );

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
    });
  });

  it("includes oauth query parameter in submission", async () => {
    mockPostAuthApi.mockResolvedValue({ redirect: true, url: "/" });
    mockOauthQuery = "client_id=test&scope=openid";

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPostAuthApi).toHaveBeenCalledWith("/sign-in/email", {
        email: "test@example.com",
        password: "password123",
        oauth_query: "client_id=test&scope=openid",
      });
    });
  });
});
