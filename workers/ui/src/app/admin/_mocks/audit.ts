import type { AdminSession, AdminToken } from "../_actions/audit";

const seedTime = Date.UTC(2025, 0, 15);
const day = 86_400_000;

export const mockSessions: AdminSession[] = [
  { id: "sess_001", token: "tok_session_001_secret", userId: "user_001", userEmail: "john@acme.com", ipAddress: "192.168.1.10", userAgent: "Mozilla/5.0 (Macintosh)", impersonatedBy: null, createdAt: seedTime, expiresAt: seedTime + 7 * day },
  { id: "sess_002", token: "tok_session_002_secret", userId: "user_002", userEmail: "jane@beta.com", ipAddress: "10.0.0.5", userAgent: "Mozilla/5.0 (Windows)", impersonatedBy: null, createdAt: seedTime - 2 * day, expiresAt: seedTime + 5 * day },
  { id: "sess_003", token: "tok_session_003_secret", userId: "user_003", userEmail: "bob@corp.com", ipAddress: "172.16.0.3", userAgent: "Mozilla/5.0 (Linux)", impersonatedBy: "user_001", createdAt: seedTime - 30 * day, expiresAt: seedTime - day },
];

export const mockTokens: AdminToken[] = [
  { id: "at_001", tokenPrefix: "a1b2c3d4…", type: "access", clientId: "cli_contentapi_a1b2c3d4e5f6", clientName: "Content API", userId: "user_001", userEmail: "john@acme.com", scopes: ["content:read"], expiresAt: seedTime + 900_000, createdAt: seedTime },
  { id: "at_002", tokenPrefix: "e5f6g7h8…", type: "access", clientId: "cli_portal_5t4s3r2q1p0o", clientName: "Vendor Portal", userId: "user_002", userEmail: "jane@beta.com", scopes: ["vendor:read"], expiresAt: seedTime + 900_000, createdAt: seedTime - day },
];

export const mockRefreshTokens: AdminToken[] = [
  { id: "rt_001", tokenPrefix: "r1r2r3r4…", type: "refresh", clientId: "cli_portal_5t4s3r2q1p0o", clientName: "Vendor Portal", userId: "user_002", userEmail: "jane@beta.com", scopes: ["vendor:read"], expiresAt: seedTime + 30 * day, createdAt: seedTime - day },
];
