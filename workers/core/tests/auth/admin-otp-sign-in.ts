import { expect } from "vitest";
import type { CapturedAuthEmailSender } from "../helpers/test-email";

const DEFAULT_ORIGIN = "https://id.example.test";

type AuthHandler = { readonly handler: (request: Request) => Promise<Response> };

export function signInRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  origin: string = DEFAULT_ORIGIN,
): Request {
  return new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function latestAdminOtp(sender: CapturedAuthEmailSender): string {
  const message = sender.messages.findLast((m) => m.kind === "admin-otp");
  if (!message || message.kind !== "admin-otp") throw new Error("no admin-otp email captured");
  return message.otp;
}

/**
 * Completes the admin-login email-OTP flow against `auth` (doc 024): submit
 * credentials with `callbackURL: "/admin"`, read the captured OTP, then resubmit
 * with the code. Returns the final sign-in `Response` (200 with a session cookie
 * on success). `auth` must have been built with the captured `sender` so the OTP
 * email is observable.
 */
export async function adminOtpSignIn(
  auth: AuthHandler,
  sender: CapturedAuthEmailSender,
  creds: { readonly email: string; readonly password: string },
  options: { readonly headers?: Record<string, string>; readonly origin?: string } = {},
): Promise<Response> {
  const base = { email: creds.email, password: creds.password, callbackURL: "/admin" };
  const first = await auth.handler(signInRequest(base, options.headers, options.origin));
  expect(first.status).toBe(401);
  const otp = latestAdminOtp(sender);
  return auth.handler(signInRequest({ ...base, otp }, options.headers, options.origin));
}
