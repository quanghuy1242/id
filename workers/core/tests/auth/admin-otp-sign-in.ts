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
 * Signs in with an admin callback. The historical helper name is kept so the
 * existing auth tests do not churn while admin OTP moves from login to
 * platform-scope step-up.
 */
export async function adminOtpSignIn(
  auth: AuthHandler,
  _sender: CapturedAuthEmailSender,
  creds: { readonly email: string; readonly password: string },
  options: { readonly headers?: Record<string, string>; readonly origin?: string } = {},
): Promise<Response> {
  const base = { email: creds.email, password: creds.password, callbackURL: "/admin" };
  const response = await auth.handler(signInRequest(base, options.headers, options.origin));
  expect(response.status).toBe(200);
  return response;
}
