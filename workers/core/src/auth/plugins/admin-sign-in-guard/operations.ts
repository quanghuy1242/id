import { randomInt, timingSafeEqual } from "node:crypto";
import { APIError } from "better-auth/api";
import {
  ADMIN_OTP_GENERATE_MAX_ATTEMPTS,
  ADMIN_OTP_GENERATE_WINDOW_SECONDS,
  ADMIN_OTP_MAX_EXCLUSIVE,
  ADMIN_OTP_MIN_INCLUSIVE,
  ADMIN_OTP_TTL_SECONDS,
  ADMIN_OTP_VERIFY_MAX_ATTEMPTS,
  authPluginConfig,
} from "../../config";
import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";

/** True when a sign-in `callbackURL` targets the admin surface. */
export function isAdminCallback(callbackURL: string | undefined): callbackURL is string {
  return typeof callbackURL === "string" && (callbackURL === "/admin" || callbackURL.startsWith("/admin/"));
}

/** Generates a 6-digit code using a CSPRNG. */
export function generateOtp(): string {
  return String(randomInt(ADMIN_OTP_MIN_INCLUSIVE, ADMIN_OTP_MAX_EXCLUSIVE));
}

/** Hex-encoded SHA-256 of `input` (WebCrypto, available globally in Workers). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Buffer.from(digest).toString("hex");
}

/** Constant-time comparison of two hex strings. Length mismatch is a non-match. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Masks an email for display in the OTP challenge, e.g. `a***@e***.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const maskedLocal = `${local[0]}***`;
  const dot = domain.indexOf(".");
  if (dot <= 0) return `${maskedLocal}@${domain[0]}***`;
  return `${maskedLocal}@${domain[0]}***${domain.slice(dot)}`;
}

export function otpCodeKey(userId: string): string {
  return `${authPluginConfig.adminOtpStoragePrefix}${userId}`;
}

/** Same status and timing posture as the stock `signInEmail` credential errors. */
export function invalidCredentialsError(): APIError {
  return new APIError("UNAUTHORIZED", {
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  });
}

function rateLimitError(): APIError {
  return new APIError("TOO_MANY_REQUESTS", {
    code: "too_many_requests",
    message: "Too many attempts. Try again later.",
  });
}

/**
 * Best-effort KV rate limiter: throws when `key` has reached `max`, otherwise
 * increments the counter with a sliding `ttlSeconds` window. KV read-modify-write
 * is not atomic, so concurrent requests can both pass — this is a backstop, not
 * the primary brute-force control (see doc 024 §4.1).
 */
async function assertWithinRateLimit(
  kv: BetterAuthKvStorage,
  key: string,
  max: number,
  ttlSeconds: number,
): Promise<void> {
  const raw = await kv.get(key);
  const parsed = raw ? Number(raw) : 0;
  const count = Number.isInteger(parsed) ? parsed : 0;
  if (count >= max) throw rateLimitError();
  await kv.put(key, String(count + 1), { expirationTtl: ttlSeconds });
}

/** Throttles OTP generation (email sends) per user. Checked before rotating the stored OTP. */
export function assertOtpGenerateLimit(kv: BetterAuthKvStorage, userId: string): Promise<void> {
  return assertWithinRateLimit(
    kv,
    `${authPluginConfig.adminOtpGenerateAttemptsPrefix}${userId}`,
    ADMIN_OTP_GENERATE_MAX_ATTEMPTS,
    ADMIN_OTP_GENERATE_WINDOW_SECONDS,
  );
}

/** Throttles OTP verification attempts per user within an OTP window. */
export function assertOtpVerifyLimit(kv: BetterAuthKvStorage, userId: string): Promise<void> {
  return assertWithinRateLimit(
    kv,
    `${authPluginConfig.adminOtpVerifyAttemptsPrefix}${userId}`,
    ADMIN_OTP_VERIFY_MAX_ATTEMPTS,
    ADMIN_OTP_TTL_SECONDS,
  );
}
