// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LoginForm } from "@/app/login/login-form";

const mockPush = vi.fn<() => void>();
const mockAuthApiPost = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAuthApiPostOrThrow = vi.fn<(...args: unknown[]) => Promise<unknown>>();
let mockOauthQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/oauth-query", () => ({
  useOauthQuery: () => mockOauthQuery,
}));

vi.mock("@idco/lib", () => ({
  OAUTH_QUERY_PARAM: "oauth_query",
  authApiPost: (...args: unknown[]) => mockAuthApiPost(...args),
  authApiPostOrThrow: (...args: unknown[]) => mockAuthApiPostOrThrow(...args),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOauthQuery = "";
    window.history.replaceState({}, "", "/login");
  });

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

  it("submits the form with valid credentials and defaults the account callbackURL", async () => {
    mockAuthApiPost.mockResolvedValue({});

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "test@example.com",
        password: "password12345",
        oauth_query: "",
        callbackURL: "/account",
      });
    });
  });

  it("redirects on successful login with redirect flag", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/dashboard" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error message on failed login", async () => {
    mockAuthApiPost.mockResolvedValue({ message: "Invalid credentials" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });
  });

  it("shows network error on fetch failure", async () => {
    mockAuthApiPost.mockRejectedValue(new Error("Network error"));

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error. Please try again.");
    });
  });

  it("shows loading state while submitting", async () => {
    mockAuthApiPost.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ redirect: true, url: "/" }), 100))
    );

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
    });
  });

  it("includes oauth query parameter in submission", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/" });
    mockOauthQuery = "client_id=test&scope=openid";

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "test@example.com",
        password: "password12345",
        oauth_query: "client_id=test&scope=openid",
      });
    });
  });

  it("keeps OAuth PKCE sign-in independent from account callbacks", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/consent" });
    mockOauthQuery = "client_id=test&scope=openid&code_challenge=abc&code_challenge_method=S256";
    window.history.replaceState({}, "", "/login?callbackURL=%2Faccount");

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "test@example.com",
        password: "password12345",
        oauth_query: "client_id=test&scope=openid&code_challenge=abc&code_challenge_method=S256",
      });
    });
  });

  it("passes a safe admin callback URL to Better Auth sign-in", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/admin/identity/users" });
    window.history.replaceState({}, "", "/login?callbackURL=%2Fadmin%2Fidentity%2Fusers%3Frole%3Dadmin");

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "admin@example.com",
        password: "password12345",
        oauth_query: "",
        callbackURL: "/admin/identity/users?role=admin",
      });
    });
  });

  it("passes a safe account callback URL to Better Auth sign-in", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/account/security" });
    window.history.replaceState({}, "", "/login?callbackURL=%2Faccount%2Fsecurity");

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "user@example.com",
        password: "password12345",
        oauth_query: "",
        callbackURL: "/account/security",
      });
    });
  });


  it("drops unsafe callback URLs and falls back to the default account callbackURL", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/" });
    window.history.replaceState({}, "", "/login?callbackURL=https%3A%2F%2Fevil.example%2Fadmin");

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "admin@example.com",
        password: "password12345",
        oauth_query: "",
        callbackURL: "/account",
      });
    });
  });

  it("does not default a callbackURL during the OAuth flow", async () => {
    mockAuthApiPost.mockResolvedValue({ redirect: true, url: "/" });
    mockOauthQuery = "client_id=test&scope=openid";

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenCalledWith("/sign-in/email", {
        email: "user@example.com",
        password: "password12345",
        oauth_query: "client_id=test&scope=openid",
      });
    });
  });

  it("reveals the OTP input on an admin_otp_required response and resubmits with the code", async () => {
    mockAuthApiPost.mockResolvedValueOnce({ code: "admin_otp_required", maskedEmail: "a***@e***.com" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("We sent a verification code to a***@e***.com");
    });
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use a different email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verify and sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();

    mockAuthApiPost.mockResolvedValueOnce({ redirect: true, url: "/admin" });
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenLastCalledWith("/sign-in/email", {
        email: "admin@example.com",
        password: "password12345",
        oauth_query: "",
        callbackURL: "/account",
        otp: "123456",
      });
    });
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  it("starts over explicitly when changing email during an OTP challenge", async () => {
    mockAuthApiPost.mockResolvedValueOnce({ code: "admin_otp_required", maskedEmail: "a***@e***.com" });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password12345" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /use a different email/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "new-password123" } });

    mockAuthApiPost.mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAuthApiPost).toHaveBeenLastCalledWith("/sign-in/email", {
        email: "owner@example.com",
        password: "new-password123",
        oauth_query: "",
        callbackURL: "/account",
      });
    });
  });

  it("runs signed-in platform step-up without credential fields", async () => {
    mockAuthApiPostOrThrow
      .mockResolvedValueOnce({ status: true, maskedEmail: "a***@e***.test" })
      .mockResolvedValueOnce({ steppedUp: true });
    window.history.replaceState({}, "", "/login?callbackURL=%2Fadmin%2Fplatform&stepUp=platform");

    render(<LoginForm />);

    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockAuthApiPostOrThrow).toHaveBeenCalledWith("/admin/step-up/request", {});
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("We sent a verification code to a***@e***.test");
    });

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

    await waitFor(() => {
      expect(mockAuthApiPostOrThrow).toHaveBeenLastCalledWith("/admin/step-up/verify", { otp: "123456" });
    });
    expect(mockPush).toHaveBeenCalledWith("/admin/platform");
  });

  it("shows an error instead of a sent notice when platform step-up email request fails", async () => {
    mockAuthApiPostOrThrow.mockRejectedValueOnce(new Error("Too many attempts. Try again later."));
    window.history.replaceState({}, "", "/login?callbackURL=%2Fadmin%2Fplatform&stepUp=platform");

    render(<LoginForm />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again later.");
    });
    expect(screen.queryByText(/we sent a verification code/i)).toBeNull();
  });

  it("does not show a generic sent notice when platform step-up response lacks masked email", async () => {
    mockAuthApiPostOrThrow.mockResolvedValueOnce({ status: true });
    window.history.replaceState({}, "", "/login?callbackURL=%2Fadmin%2Fplatform&stepUp=platform");

    render(<LoginForm />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Verification email response was missing the recipient.");
    });
    expect(screen.queryByText(/we sent a verification code to your email/i)).toBeNull();
  });

  it("starts the platform step-up request once under StrictMode effect replay", async () => {
    mockAuthApiPostOrThrow.mockResolvedValue({ status: true, maskedEmail: "a***@e***.test" });
    window.history.replaceState({}, "", "/login?callbackURL=%2Fadmin%2Fplatform&stepUp=platform");

    render(<StrictMode><LoginForm /></StrictMode>);

    await waitFor(() => {
      expect(mockAuthApiPostOrThrow).toHaveBeenCalledWith("/admin/step-up/request", {});
    });
    expect(mockAuthApiPostOrThrow).toHaveBeenCalledTimes(1);
  });

  it("shows admin-required redirects as login errors", async () => {
    window.history.replaceState({}, "", "/login?error=admin_required&callbackURL=%2Fadmin");

    render(<LoginForm />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Admin access is required.");
    });
  });
});
