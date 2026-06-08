// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { VerifyEmailStatus } from "@/app/verify-email/verify-email-status";
import { renderWithSwr as render } from "../_utils/swr-render";

const mockPush = vi.fn<() => void>();
const mockRequestPasswordReset = vi.fn<(...args: unknown[]) => Promise<void>>();
const mockResetPassword = vi.fn<(...args: unknown[]) => Promise<void>>();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/app/account/_actions/account", () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

describe("account utility pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    mockRequestPasswordReset.mockResolvedValue(undefined);
    mockResetPassword.mockResolvedValue(undefined);
  });

  it("requests a password reset and shows neutral success copy", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "person@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith("person@example.test");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("If that account exists");
  });

  it("resets a password with the token from the URL", async () => {
    searchParams = new URLSearchParams("token=reset_token");
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith("new-password-123", "reset_token");
    });
    expect(mockPush).toHaveBeenCalledWith("/login?callbackURL=/account/security");
  });

  it("shows an error state when reset token is missing", () => {
    render(<ResetPasswordForm />);

    expect(screen.getByRole("alert")).toHaveTextContent("missing a token");
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("renders success when Better Auth redirects back without an error", () => {
    render(<VerifyEmailStatus />);

    expect(screen.getByRole("alert")).toHaveTextContent("Email verified.");
  });

  it("renders an error state when Better Auth redirects back with an error param", () => {
    searchParams = new URLSearchParams("error=undefined");
    render(<VerifyEmailStatus />);

    expect(screen.getByRole("alert")).toHaveTextContent("invalid or has expired");
  });
});
