import type { BetterAuthKvStorage } from "../../adapters/secondary-storage";

/**
 * Composition options for {@link idAdminSignInGuard}.
 *
 * `sendEmail`, `kv`, and the HMAC secret are injected from `get-auth.ts` so the
 * plugin never reaches into the email sender, KV namespace, or env directly.
 * `kv` reuses the worker's `BetterAuthKvStorage` surface (the same value passed
 * to `secondaryStorage`) so OTP storage and rate-limit counters share one binding.
 */
export interface AdminSignInGuardOptions {
  /** Queues the admin OTP email (wired to `sendAuthEmail` in `get-auth.ts`). */
  readonly sendEmail: (params: {
    readonly to: string;
    readonly otp: string;
  }) => Promise<void>;
  /** KV namespace for OTP storage and rate-limit counters. */
  readonly kv: BetterAuthKvStorage;
  /** Secret used to HMAC low-entropy OTP codes before storing them in KV. */
  readonly otpHmacSecret: string;
  /** Returns true when the user role can enter the platform console scope. */
  readonly isPlatformAdmin?: (role: unknown) => boolean;
}

/**
 * Narrow view of the Better Auth middleware context the guard relies on.
 *
 * Better Auth does not export a precise type for `ctx.context` inside a
 * `hooks.before` matcher, so we capture only the `internalAdapter`/`password`
 * capabilities the guard uses, matching the shapes exercised by the stock
 * `signInEmail` handler.
 */
export interface AdminSignInGuardContext {
  readonly internalAdapter: {
    readonly findUserByEmail: (
      email: string,
      options?: { readonly includeAccounts?: boolean },
    ) => Promise<AdminSignInGuardUser | null>;
  };
  readonly password: {
    readonly hash: (password: string) => Promise<string>;
    readonly verify: (params: {
      readonly hash: string;
      readonly password: string;
    }) => Promise<boolean>;
  };
}

export interface AdminSignInGuardUser {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly emailVerified: boolean;
  };
  readonly accounts: readonly {
    readonly providerId: string;
    readonly password?: string | null;
  }[];
}
