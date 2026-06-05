import type {
  AccountActions,
  AccountConsent,
  AccountOrganization,
  AccountSession,
  AccountSummary,
} from "../_actions/account";

export const mockAccountSummary: AccountSummary = {
  user: {
    id: "usr_account",
    email: "quanghuy1242@gmail.com",
    emailVerified: true,
    name: "Huy Quang Nguyen",
    image: null,
  },
  security: {
    passwordEnabled: true,
    mfaEnabled: false,
    emailVerificationRequired: true,
  },
  counts: {
    organizations: 2,
    activeSessions: 2,
    connectedApplications: 2,
  },
};

export const mockAccountSessions: readonly AccountSession[] = [
  {
    id: "sess_current",
    current: true,
    createdAt: Date.UTC(2026, 4, 31, 8, 0, 0),
    updatedAt: Date.UTC(2026, 4, 31, 11, 30, 0),
    expiresAt: Date.UTC(2026, 5, 7, 8, 0, 0),
    ipAddress: "203.0.113.10",
    userAgent: "Chrome on macOS",
  },
  {
    id: "sess_phone",
    current: false,
    createdAt: Date.UTC(2026, 4, 29, 9, 0, 0),
    updatedAt: Date.UTC(2026, 4, 30, 14, 15, 0),
    expiresAt: Date.UTC(2026, 5, 5, 9, 0, 0),
    ipAddress: "198.51.100.42",
    userAgent: "Safari on iPhone",
  },
];

export const mockAccountConsents: readonly AccountConsent[] = [
  {
    id: "consent_books",
    clientId: "client_books",
    clientName: "Books App",
    clientUri: "https://books.example.test",
    clientIcon: null,
    scopes: ["openid", "profile", "email"],
    createdAt: Date.UTC(2026, 4, 21, 8, 0, 0),
    updatedAt: Date.UTC(2026, 4, 30, 12, 0, 0),
  },
  {
    id: "consent_content",
    clientId: "client_content",
    clientName: "Content API",
    clientUri: "https://content.example.test",
    clientIcon: null,
    scopes: ["openid", "profile", "content:read"],
    createdAt: Date.UTC(2026, 4, 20, 8, 0, 0),
    updatedAt: Date.UTC(2026, 4, 25, 9, 30, 0),
  },
];

export const mockAccountOrganizations: readonly AccountOrganization[] = [
  {
    id: "org_default",
    name: "Default",
    slug: "default",
    role: "owner",
    teams: [{ id: "team_editors", name: "Editors" }],
    canOpenConsole: true,
    consoleHref: "/admin/orgs/org_default",
  },
  {
    id: "org_member",
    name: "Member Workspace",
    slug: "member-workspace",
    role: "member",
    teams: [{ id: "team_review", name: "Review" }],
    canOpenConsole: false,
    consoleHref: null,
  },
];

export function createMockAccountActions(
  overrides: Partial<AccountActions> = {},
): AccountActions {
  return {
    getAccountSummary: async () => mockAccountSummary,
    updateProfile: async () => undefined,
    changePassword: async () => undefined,
    sendVerificationEmail: async () => undefined,
    listAccountSessions: async () => ({ sessions: mockAccountSessions }),
    revokeAccountSession: async () => undefined,
    revokeOtherSessions: async () => ({ revoked: 1 }),
    revokeAllSessions: async () => undefined,
    listAccountConsents: async () => ({ consents: mockAccountConsents }),
    revokeAccountConsent: async () => undefined,
    listAccountOrganizations: async () => ({
      organizations: mockAccountOrganizations,
    }),
    ...overrides,
  };
}
