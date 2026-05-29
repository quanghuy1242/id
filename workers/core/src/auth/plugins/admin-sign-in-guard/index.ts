import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { ADMIN_OTP_TTL_SECONDS } from "../../config";
import {
  assertOtpGenerateLimit,
  assertOtpVerifyLimit,
  generateOtp,
  invalidCredentialsError,
  isAdminCallback,
  maskEmail,
  otpCodeKey,
  otpHmacHex,
  timingSafeEqualHex,
} from "./operations";
import type { AdminSignInGuardContext, AdminSignInGuardOptions } from "./types";

function readBody(ctx: { readonly body?: unknown }): Record<string, unknown> {
  return ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, unknown>) : {};
}

function readString(body: Record<string, unknown>, key: string): string | undefined {
  return typeof body[key] === "string" ? (body[key] as string) : undefined;
}

/**
 * Companion guard for `POST /sign-in/email` enforcing doc 024.
 *
 * 1. Context gate — a sign-in must carry either a valid `oauth_query` (the
 *    OAuth provider's own before-hook validates the signature) or an `/admin`
 *    `callbackURL`. Anything else is rejected before any session is minted.
 * 2. Admin MFA gate — admin-context logins require an email OTP. The first
 *    submit verifies the password and emails a code; the second submit proves
 *    possession of the code and then lets the stock `signInEmail` handler run
 *    (it re-verifies the password and creates the session).
 *
 * The guard never creates a session itself; throwing an `APIError` here runs
 * before the endpoint body, so an invalid context or a missing/incorrect OTP
 * can never leave a session cookie behind.
 */
export const idAdminSignInGuard = (opts: AdminSignInGuardOptions): BetterAuthPlugin => ({
  id: "id-admin-sign-in-guard",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/sign-in/email",
        handler: createAuthMiddleware(async (ctx) => {
          const body = readBody(ctx);
          const callbackURL = readString(body, "callbackURL");
          const oauthQuery = readString(body, "oauth_query");

          // Context gate: OAuth flows are validated by the provider's own before-hook;
          // everything else must be an admin-context login or it is rejected.
          if (oauthQuery) return;
          if (!isAdminCallback(callbackURL)) {
            throw new APIError("BAD_REQUEST", { code: "missing_login_context", message: "Missing login context" });
          }

          const email = readString(body, "email");
          const password = readString(body, "password");
          const otp = readString(body, "otp");
          if (!email || !password) return; // Let signInEmail produce its own validation error.

          const context = ctx.context as unknown as AdminSignInGuardContext;
          const found = await context.internalAdapter.findUserByEmail(email, { includeAccounts: true });

          if (!otp) {
            // First submit: verify credentials with the same branches and timing as
            // signInEmail (user-enumeration resistance), then email a fresh OTP.
            const credential = found?.accounts.find((account) => account.providerId === "credential");
            if (!found || !credential?.password) {
              await context.password.hash(password); // equalize timing on the no-user / no-credential path
              throw invalidCredentialsError();
            }
            if (!(await context.password.verify({ hash: credential.password, password }))) {
              throw invalidCredentialsError();
            }

            // Don't send an OTP the handler would reject for an unverified email.
            if (!found.user.emailVerified) {
              throw new APIError("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED", message: "Email is not verified" });
            }

            await assertOtpGenerateLimit(opts.kv, found.user.id); // check before rotating the stored OTP
            const code = generateOtp();
            await opts.kv.put(
              otpCodeKey(found.user.id),
              otpHmacHex(opts.otpHmacSecret, found.user.id, code),
              { expirationTtl: ADMIN_OTP_TTL_SECONDS },
            );
            await opts.sendEmail({ to: email, otp: code });

            throw new APIError("UNAUTHORIZED", {
              code: "admin_otp_required",
              message: "Enter the verification code sent to your email",
              maskedEmail: maskEmail(email),
            });
          }

          // Second submit: prove OTP possession, then fall through so signInEmail
          // re-verifies the password and creates the session.
          if (!found) throw invalidCredentialsError();
          await assertOtpVerifyLimit(opts.kv, found.user.id);
          const stored = await opts.kv.get(otpCodeKey(found.user.id));
          const submitted = otpHmacHex(opts.otpHmacSecret, found.user.id, otp);
          if (!stored || !timingSafeEqualHex(stored, submitted)) {
            throw new APIError("UNAUTHORIZED", { code: "invalid_otp", message: "Invalid or expired code" });
          }
          await opts.kv.delete(otpCodeKey(found.user.id));
        }),
      },
    ],
  },
});
