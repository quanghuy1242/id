/** OAuth authorization context selection values passed to the PostLogin flow. */
export const DIRECT_SHARE_VALUE = "direct-share";
export const WORKSPACE_CONTEXT_PREFIX = "workspace:";

/** Minimum password length for sign-in form client-side validation (SEC-018). */
export const MIN_PASSWORD_LENGTH = 12;

/** Login target after an admin-initiated logout. */
export const ADMIN_LOGIN_REDIRECT_URL = "/login?callbackURL=%2Fadmin";

/** Page size for the server-paginated admin-audit list screens (sessions/tokens/consents). */
export const ADMIN_AUDIT_PAGE_SIZE = 25;

export type AdminNavEntry =
  | { readonly type: "item"; readonly label: string; readonly href: string; readonly exact?: boolean; readonly icon?: string }
  | { readonly type: "section"; readonly label: string };

export type AdminMobileNavItem = {
  readonly label: string;
  readonly href: string;
  readonly activeHref?: string;
  readonly exact?: boolean;
  readonly icon?: string;
};

/** Admin sidebar navigation — section headers and links in render order. */
export const SIDEBAR_NAV: readonly AdminNavEntry[] = [
  { type: "item", label: "Dashboard", href: "/admin", exact: true, icon: "LayoutDashboard" },
  { type: "section", label: "Identity" },
  { type: "item", label: "Users", href: "/admin/identity/users", icon: "Users" },
  { type: "item", label: "Organizations", href: "/admin/identity/organizations", icon: "Building2" },
  { type: "section", label: "OAuth" },
  { type: "item", label: "Applications", href: "/admin/oauth/applications", icon: "AppWindow" },
  { type: "item", label: "Resource APIs", href: "/admin/oauth/resource-apis", icon: "Server" },
  { type: "item", label: "Scope Catalog", href: "/admin/oauth/scope-catalog", icon: "Tags" },
  { type: "item", label: "M2M Bindings", href: "/admin/oauth/m2m-bindings", icon: "Link2" },
  { type: "item", label: "Sessions & Tokens", href: "/admin/oauth/sessions-tokens", icon: "KeyRound" },
  { type: "section", label: "Security" },
  { type: "item", label: "JWKS", href: "/admin/security/jwks", icon: "Fingerprint" },
  { type: "item", label: "Consents", href: "/admin/security/consents", icon: "FileCheck2" },
  { type: "section", label: "System" },
  { type: "item", label: "Service Accounts", href: "/admin/system/service-accounts", icon: "Bot" },
  { type: "item", label: "Issuer Metadata", href: "/admin/system/issuer-metadata", icon: "Globe" },
  { type: "item", label: "SCIM Status", href: "/admin/system/scim-status", icon: "Activity" },
  { type: "item", label: "Health", href: "/admin/system/health", icon: "HeartPulse" },
  { type: "item", label: "Settings", href: "/admin/system/settings", icon: "Settings" },
];

/** Admin mobile dock — top-level section entries only. */
export const MOBILE_NAV: readonly AdminMobileNavItem[] = [
  { label: "Dash", href: "/admin", exact: true, icon: "LayoutDashboard" },
  { label: "Identity", href: "/admin/identity/users", activeHref: "/admin/identity", icon: "Users" },
  { label: "OAuth", href: "/admin/oauth/applications", activeHref: "/admin/oauth", icon: "KeyRound" },
  { label: "Security", href: "/admin/security/jwks", activeHref: "/admin/security", icon: "Fingerprint" },
  { label: "System", href: "/admin/system/service-accounts", activeHref: "/admin/system", icon: "Settings" },
];
