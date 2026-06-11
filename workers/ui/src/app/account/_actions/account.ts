"use client";

import { authApiGetOrThrow, authApiPost, authApiPostOrThrow } from "@idco/lib";

export type AccountUser = {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly image: string | null;
};

export type AccountSummary = {
  readonly user: AccountUser;
  readonly security: {
    readonly passwordEnabled: boolean;
    readonly mfaEnabled: boolean;
    readonly emailVerificationRequired: boolean;
  };
  readonly counts: {
    readonly organizations: number;
    readonly activeSessions: number;
    readonly connectedApplications: number;
  };
};

export type AccountSession = {
  readonly id: string;
  readonly current: boolean;
  readonly createdAt: number | null;
  readonly updatedAt: number | null;
  readonly expiresAt: number | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

export type AccountConsent = {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string | null;
  readonly clientUri: string | null;
  readonly clientIcon: string | null;
  readonly scopes: readonly string[];
  readonly createdAt: number | null;
  readonly updatedAt: number | null;
};

export type AccountOrganization = {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly role: "platform-admin" | "owner" | "admin" | "member";
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  readonly canOpenConsole: boolean;
  readonly consoleHref: string | null;
};

export type AccountActions = {
  readonly getAccountSummary: () => Promise<AccountSummary>;
  readonly updateProfile: (input: {
    readonly name: string;
    readonly image?: string | null;
  }) => Promise<void>;
  readonly changePassword: (input: {
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly revokeOtherSessions: boolean;
  }) => Promise<void>;
  readonly sendVerificationEmail: (email: string) => Promise<void>;
  readonly listAccountSessions: () => Promise<{
    readonly sessions: readonly AccountSession[];
  }>;
  readonly revokeAccountSession: (sessionId: string) => Promise<void>;
  readonly revokeOtherSessions: () => Promise<{ readonly revoked: number }>;
  readonly revokeAllSessions: () => Promise<void>;
  readonly listAccountConsents: () => Promise<{
    readonly consents: readonly AccountConsent[];
  }>;
  readonly revokeAccountConsent: (clientId: string) => Promise<void>;
  readonly listAccountOrganizations: () => Promise<{
    readonly organizations: readonly AccountOrganization[];
  }>;
};

export async function getAccountSummary(): Promise<AccountSummary> {
  return authApiGetOrThrow<AccountSummary>("/account/summary");
}

export async function updateProfile(input: {
  readonly name: string;
  readonly image?: string | null;
}): Promise<void> {
  await authApiPostOrThrow("/update-user", {
    name: input.name,
    image: input.image || undefined,
  });
}

export async function changePassword(input: {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly revokeOtherSessions: boolean;
}): Promise<void> {
  await authApiPostOrThrow("/change-password", input);
}

export async function sendVerificationEmail(email: string): Promise<void> {
  await authApiPostOrThrow("/send-verification-email", {
    email,
    callbackURL: "/verify-email",
  });
}

export async function listAccountSessions(): Promise<{
  readonly sessions: readonly AccountSession[];
}> {
  return authApiGetOrThrow<{ sessions: AccountSession[] }>("/account/sessions");
}

export async function revokeAccountSession(sessionId: string): Promise<void> {
  await authApiPostOrThrow("/account/sessions/revoke", { sessionId });
}

export async function revokeOtherSessions(): Promise<{
  readonly revoked: number;
}> {
  return authApiPostOrThrow<{ status: boolean; revoked: number }>(
    "/account/sessions/revoke-others",
  );
}

export async function revokeAllSessions(): Promise<void> {
  await authApiPostOrThrow("/account/sessions/revoke-all");
}

export async function listAccountConsents(): Promise<{
  readonly consents: readonly AccountConsent[];
}> {
  return authApiGetOrThrow<{ consents: AccountConsent[] }>("/account/consents");
}

export async function revokeAccountConsent(clientId: string): Promise<void> {
  await authApiPostOrThrow("/account/consents/revoke", { clientId });
}

export async function listAccountOrganizations(): Promise<{
  readonly organizations: readonly AccountOrganization[];
}> {
  return authApiGetOrThrow<{ organizations: AccountOrganization[] }>(
    "/account/organizations",
  );
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authApiPost("/request-password-reset", {
    email,
    redirectTo: "/reset-password",
  });
}

export async function resetPassword(
  newPassword: string,
  token: string,
): Promise<void> {
  await authApiPostOrThrow("/reset-password", { newPassword, token });
}

export async function signOut(): Promise<void> {
  await authApiPostOrThrow("/sign-out");
}

export const defaultAccountActions: AccountActions = {
  getAccountSummary,
  updateProfile,
  changePassword,
  sendVerificationEmail,
  listAccountSessions,
  revokeAccountSession,
  revokeOtherSessions,
  revokeAllSessions,
  listAccountConsents,
  revokeAccountConsent,
  listAccountOrganizations,
};
