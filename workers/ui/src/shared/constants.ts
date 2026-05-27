/** OAuth authorization context selection values passed to the PostLogin flow. */
export const DIRECT_SHARE_VALUE = "direct-share";
export const WORKSPACE_CONTEXT_PREFIX = "workspace:";

/** Minimum password length for sign-in form client-side validation (SEC-018). */
export const MIN_PASSWORD_LENGTH = 12;

export type AdminNavEntry =
  | { readonly type: "item"; readonly label: string; readonly href: string; readonly exact?: boolean }
  | { readonly type: "section"; readonly label: string };

/** Admin sidebar navigation — section headers and links in render order. */
export const SIDEBAR_NAV: readonly AdminNavEntry[] = [
  { type: "item", label: "Dashboard", href: "/admin", exact: true },
  { type: "section", label: "Identity" },
  { type: "item", label: "Users", href: "/admin/identity/users" },
  { type: "item", label: "Organizations", href: "/admin/identity/organizations" },
  { type: "section", label: "OAuth" },
  { type: "item", label: "Applications", href: "/admin/oauth/applications" },
  { type: "item", label: "Resource APIs", href: "/admin/oauth/resource-apis" },
  { type: "item", label: "Scope Catalog", href: "/admin/oauth/scope-catalog" },
  { type: "item", label: "M2M Bindings", href: "/admin/oauth/m2m-bindings" },
  { type: "item", label: "Sessions & Tokens", href: "/admin/oauth/sessions-tokens" },
  { type: "section", label: "Security" },
  { type: "item", label: "JWKS", href: "/admin/security/jwks" },
  { type: "item", label: "Consents", href: "/admin/security/consents" },
  { type: "section", label: "System" },
  { type: "item", label: "Service Accounts", href: "/admin/system/service-accounts" },
  { type: "item", label: "Issuer Metadata", href: "/admin/system/issuer-metadata" },
  { type: "item", label: "SCIM Status", href: "/admin/system/scim-status" },
  { type: "item", label: "Health", href: "/admin/system/health" },
  { type: "item", label: "Settings", href: "/admin/system/settings" },
];

export type AdminMobileNavItem = { readonly label: string; readonly href: string; readonly exact?: boolean };

/** Admin mobile dock — top-level section entries only. */
export const MOBILE_NAV: readonly AdminMobileNavItem[] = [
  { label: "Dash", href: "/admin", exact: true },
  { label: "Identity", href: "/admin/identity" },
  { label: "OAuth", href: "/admin/oauth" },
  { label: "Security", href: "/admin/security" },
  { label: "System", href: "/admin/system" },
];
