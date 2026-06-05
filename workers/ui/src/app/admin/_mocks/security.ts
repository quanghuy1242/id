import type { AdminConsent, AdminJwk } from "../_actions/audit";

const seedTime = Date.UTC(2025, 0, 15);
const day = 86_400_000;

export const mockAdminJwks: AdminJwk[] = [
  {
    id: "abc123def456",
    alg: "EdDSA",
    createdAt: seedTime,
    expiresAt: seedTime + 365 * day,
    status: "active",
    publicJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
      kid: "abc123def456",
      use: "sig",
      alg: "EdDSA",
    },
  },
  {
    id: "xyz789ghi012",
    alg: "EdDSA",
    createdAt: seedTime - 30 * day,
    expiresAt: seedTime - day,
    status: "rotated",
    publicJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "9bL5dGq3qkLpQ2hY8sV1cN0wRtZ7mPx4uK6yJ3aB2c",
      kid: "xyz789ghi012",
      use: "sig",
      alg: "EdDSA",
    },
  },
  {
    id: "old123key456",
    alg: "EdDSA",
    createdAt: seedTime - 400 * day,
    expiresAt: seedTime - 380 * day,
    status: "expired",
    publicJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "Z3VhcmRpYW5fa2V5X29sZF9leHBpcmVkX2tleV94eHg",
      kid: "old123key456",
      use: "sig",
      alg: "EdDSA",
    },
  },
];

export const mockConsents: AdminConsent[] = [
  {
    id: "cons_001",
    clientId: "cli_contentapi_a1b2c3d4e5f6",
    clientName: "Content API",
    userId: "user_001",
    userEmail: "john@acme.com",
    scopes: ["content:read"],
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: "cons_002",
    clientId: "cli_portal_5t4s3r2q1p0o",
    clientName: "Vendor Portal",
    userId: "user_002",
    userEmail: "jane@beta.com",
    scopes: ["openid", "profile", "vendor:read"],
    createdAt: seedTime - 5 * day,
    updatedAt: seedTime - 5 * day,
  },
  {
    id: "cons_003",
    clientId: "cli_adminapp_9z8y7x6w5v4u",
    clientName: "Admin Client",
    userId: "user_003",
    userEmail: "bob@corp.com",
    scopes: ["openid"],
    createdAt: seedTime - 10 * day,
    updatedAt: seedTime - 10 * day,
  },
];
