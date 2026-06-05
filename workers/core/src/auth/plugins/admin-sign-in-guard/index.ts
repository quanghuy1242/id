import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import * as z from "zod";
import {
  ADMIN_OTP_TTL_SECONDS,
  ADMIN_STEP_UP_TTL_SECONDS,
  isPlatformStepUpFresh,
} from "../../config";
import { readBody, readString } from "../../../shared/request";
import {
  assertOtpGenerateLimit,
  assertOtpVerifyLimit,
  generateOtp,
  isFirstPartyAppCallback,
  maskEmail,
  otpCodeKey,
  otpHmacHex,
  timingSafeEqualHex,
} from "./operations";
import type { AdminSignInGuardOptions } from "./types";

type StepUpSession = {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly emailVerified?: boolean;
    readonly role?: unknown;
  };
  readonly session: {
    readonly token?: string | null;
    readonly platformStepUpAt?: number | null;
  };
};

type SessionWriter = {
  readonly updateSession: (
    token: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
};

function requireSession(session: unknown): StepUpSession {
  if (
    !session ||
    typeof session !== "object" ||
    !("user" in session) ||
    !("session" in session)
  ) {
    throw new APIError("UNAUTHORIZED");
  }
  return session as StepUpSession;
}

function requireSessionToken(session: StepUpSession): string {
  if (!session.session.token) throw new APIError("UNAUTHORIZED");
  return session.session.token;
}

function assertPlatformAdmin(
  session: StepUpSession,
  opts: AdminSignInGuardOptions,
): void {
  if (!(opts.isPlatformAdmin ?? (() => false))(session.user.role)) {
    throw new APIError("FORBIDDEN", {
      code: "platform_step_up_required",
      message: "Platform access requires an eligible account",
    });
  }
}

const verifyStepUpBody = z.object({
  otp: z.string().min(1),
});

/**
 * Companion guard for `POST /sign-in/email` plus platform-console step-up.
 *
 * The sign-in hook keeps the long-lived context invariant: a credential sign-in
 * must carry either an OAuth continuation or a safe first-party app callback.
 * The OTP branch is now a signed-in platform-console step-up endpoint, so
 * account and organization-console sign-ins do not inherit an admin-persona
 * login assumption.
 *
 * The guard never creates a session itself; throwing an `APIError` here runs
 * before the endpoint body, so an invalid context cannot leave a session cookie
 * behind.
 */
export const idAdminSignInGuard = (
  opts: AdminSignInGuardOptions,
): BetterAuthPlugin => ({
  id: "id-admin-sign-in-guard",
  schema: {
    session: {
      fields: {
        // Session-owned platform step-up proof (epoch ms); `input: false` keeps it server-written.
        platformStepUpAt: {
          type: "number",
          required: false,
          input: false,
        },
      },
    },
  },
  endpoints: {
    getAdminStepUpStatus: createAuthEndpoint(
      "/admin/step-up/status",
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => {
        const session = requireSession(ctx.context.session);
        if (!(opts.isPlatformAdmin ?? (() => false))(session.user.role)) {
          return ctx.json({ steppedUp: false });
        }
        // Read the proof off the session record (no KV); freshness is computed at read time.
        return ctx.json({
          steppedUp: isPlatformStepUpFresh(
            session.session.platformStepUpAt ?? null,
          ),
        });
      },
    ),
    requestAdminStepUp: createAuthEndpoint(
      "/admin/step-up/request",
      { method: "POST", use: [sessionMiddleware] },
      async (ctx) => {
        const session = requireSession(ctx.context.session);
        assertPlatformAdmin(session, opts);
        if (session.user.emailVerified === false) {
          throw new APIError("FORBIDDEN", {
            code: "EMAIL_NOT_VERIFIED",
            message: "Email is not verified",
          });
        }

        await assertOtpGenerateLimit(opts.kv, session.user.id);
        const code = generateOtp();
        await opts.kv.put(
          otpCodeKey(session.user.id),
          otpHmacHex(opts.otpHmacSecret, session.user.id, code),
          { expirationTtl: ADMIN_OTP_TTL_SECONDS },
        );
        await opts.sendEmail({ to: session.user.email, otp: code });

        return ctx.json({
          status: true,
          maskedEmail: maskEmail(session.user.email),
        });
      },
    ),
    verifyAdminStepUp: createAuthEndpoint(
      "/admin/step-up/verify",
      { method: "POST", use: [sessionMiddleware], body: verifyStepUpBody },
      async (ctx) => {
        const session = requireSession(ctx.context.session);
        assertPlatformAdmin(session, opts);
        await assertOtpVerifyLimit(opts.kv, session.user.id);
        const stored = await opts.kv.get(otpCodeKey(session.user.id));
        const submitted = otpHmacHex(
          opts.otpHmacSecret,
          session.user.id,
          ctx.body.otp,
        );
        if (!stored || !timingSafeEqualHex(stored, submitted)) {
          throw new APIError("UNAUTHORIZED", {
            code: "invalid_otp",
            message: "Invalid or expired code",
          });
        }
        await opts.kv.delete(otpCodeKey(session.user.id));
        // Record the proof on the session (write-through to D1 + KV secondary storage).
        const internalAdapter = ctx.context.internalAdapter as SessionWriter;
        await internalAdapter.updateSession(requireSessionToken(session), {
          platformStepUpAt: Date.now(),
        });
        return ctx.json({
          steppedUp: true,
          expiresIn: ADMIN_STEP_UP_TTL_SECONDS,
        });
      },
    ),
  },
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/sign-in/email",
        handler: createAuthMiddleware(async (ctx) => {
          const body = readBody(ctx);
          const callbackURL = readString(body, "callbackURL");
          const oauthQuery = readString(body, "oauth_query");

          // Context gate: OAuth flows are validated by the provider's own before-hook;
          // everything else must target a first-party app shell or it is rejected.
          if (oauthQuery) return;
          if (!isFirstPartyAppCallback(callbackURL)) {
            throw new APIError("BAD_REQUEST", {
              code: "missing_login_context",
              message: "Missing login context",
            });
          }
        }),
      },
    ],
  },
});
