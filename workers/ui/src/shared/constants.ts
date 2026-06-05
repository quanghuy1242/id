import type { ActiveScope, ConsolePermission, ConsoleScope } from "@id/lib";

/** OAuth authorization context selection values passed to the PostLogin flow. */
export const DIRECT_SHARE_VALUE = "direct-share";
export const WORKSPACE_CONTEXT_PREFIX = "workspace:";

/** Minimum password length for sign-in form client-side validation (SEC-018). */
export const MIN_PASSWORD_LENGTH = 12;

/** Login target after an admin-initiated logout. */
export const ADMIN_LOGIN_REDIRECT_URL = "/login?callbackURL=%2Fadmin";

/** Page size for the server-paginated admin-audit list screens (sessions/tokens/consents). */
export const ADMIN_AUDIT_PAGE_SIZE = 25;
export const DAY_MS = 86_400_000;
export const ADMIN_RECENT_WINDOW_DAYS = 7;
export const ADMIN_RECENT_WINDOW_MS = ADMIN_RECENT_WINDOW_DAYS * DAY_MS;

export type NavApplicability = "platform" | "organization" | "both";

type ScopeSpecificLabel = {
  readonly platform: string;
  readonly organization: string;
};

type ScopeSpecificPermission = {
  readonly platform: ConsolePermission;
  readonly organization: ConsolePermission;
};

export type ConsoleNavItem = {
  readonly id: string;
  readonly label: string | ScopeSpecificLabel;
  readonly section: string;
  readonly appliesTo: NavApplicability;
  readonly requiredPermission: ConsolePermission | ScopeSpecificPermission;
  readonly href: (scope: ActiveScope) => string;
  readonly icon: string;
  readonly exact?: boolean;
  readonly mobile?: boolean;
};

export type VisibleConsoleNavItem = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly section: string;
  readonly exact?: boolean;
  readonly icon: string;
  readonly mobile: boolean;
};

export type VisibleConsoleNavSection = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly VisibleConsoleNavItem[];
};

type NavTuple = readonly [
  id: string,
  label: string,
  section: string,
  requiredPermission: ConsolePermission,
  path: string,
  icon: string,
  options?: {
    readonly exact?: boolean;
    readonly mobile?: boolean;
  },
];

/** Console navigation section order and labels shared by desktop, mobile, and tests. */
export const CONSOLE_NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "identity", label: "Identity" },
  { id: "applications", label: "Applications" },
  { id: "access", label: "Access" },
  { id: "security", label: "Security" },
  { id: "audit", label: "Audit" },
] as const;

function scopedHref(path: string): ConsoleNavItem["href"] {
  return (scope) =>
    scope.kind === "platform"
      ? `/admin/platform${path}`
      : `/admin/orgs/${scope.organizationId}${path}`;
}

function platformHref(path: string): ConsoleNavItem["href"] {
  return () => `/admin/platform${path}`;
}

function organizationHref(path: string): ConsoleNavItem["href"] {
  return (scope) =>
    scope.kind === "organization"
      ? `/admin/orgs/${scope.organizationId}${path}`
      : "/admin/platform";
}

function navItems(
  appliesTo: NavApplicability,
  hrefForPath: (path: string) => ConsoleNavItem["href"],
  configs: readonly NavTuple[],
): readonly ConsoleNavItem[] {
  return configs.map(
    ([id, label, section, requiredPermission, path, icon, options]) => ({
      id,
      label,
      section,
      appliesTo,
      requiredPermission,
      href: hrefForPath(path),
      icon,
      ...options,
    }),
  );
}

const dashboardNavItem: ConsoleNavItem = {
  id: "dashboard",
  label: { platform: "Dashboard", organization: "Overview" },
  section: "overview",
  appliesTo: "both",
  requiredPermission: {
    platform: "platform:read",
    organization: "members:read",
  },
  href: scopedHref(""),
  icon: "LayoutDashboard",
  exact: true,
  mobile: true,
};

const identityUsersNavItem: ConsoleNavItem = {
  id: "identity-users",
  label: { platform: "Users", organization: "Members" },
  section: "identity",
  appliesTo: "both",
  requiredPermission: {
    platform: "platform:read",
    organization: "members:read",
  },
  href: (scope) =>
    scope.kind === "platform"
      ? "/admin/platform/identity/users"
      : `/admin/orgs/${scope.organizationId}/identity/members`,
  icon: "Users",
  mobile: true,
};

const registrationPoliciesNavItem: ConsoleNavItem = {
  id: "identity-registration-policies",
  label: "Registration Policies",
  section: "identity",
  appliesTo: "both",
  requiredPermission: {
    platform: "platform:read",
    organization: "members:write",
  },
  href: (scope) =>
    scope.kind === "platform"
      ? "/admin/platform/identity/registration-policies"
      : `/admin/orgs/${scope.organizationId}/identity/registration-policies`,
  icon: "ListChecks",
};

/** One declarative console nav definition rendered through platform and organization lenses. */
export const CONSOLE_NAV_ITEMS: readonly ConsoleNavItem[] = [
  dashboardNavItem,
  identityUsersNavItem,
  registrationPoliciesNavItem,
  ...navItems("platform", platformHref, [
    [
      "identity-organizations",
      "Organizations",
      "identity",
      "organizations:read",
      "/identity/organizations",
      "Building2",
    ],
  ] satisfies readonly NavTuple[]),
  ...navItems("organization", organizationHref, [
    [
      "identity-teams",
      "Teams",
      "identity",
      "members:read",
      "/identity/teams",
      "UsersRound",
    ],
    [
      "identity-invitations",
      "Invitations",
      "identity",
      "members:write",
      "/identity/invitations",
      "UserPlus",
    ],
  ] satisfies readonly NavTuple[]),
  ...navItems("both", scopedHref, [
    [
      "applications",
      "Applications",
      "applications",
      "oauth-clients:read",
      "/oauth/applications",
      "KeyRound",
      { mobile: true },
    ],
  ] satisfies readonly NavTuple[]),
  ...navItems("platform", platformHref, [
    [
      "access-admins-roles",
      "Admins & Roles",
      "access",
      "platform:read",
      "/access/admins-roles",
      "UserCog",
    ],
  ] satisfies readonly NavTuple[]),
  ...navItems("both", scopedHref, [
    [
      "access-service-accounts",
      "Service Accounts",
      "access",
      "oauth-clients:read",
      "/access/service-accounts",
      "Bot",
      { mobile: true },
    ],
    [
      "access-resource-apis",
      "Resource APIs",
      "access",
      "resource-servers:read",
      "/access/resource-apis",
      "Server",
    ],
    [
      "access-scope-catalog",
      "Scope Catalog",
      "access",
      "resource-servers:read",
      "/access/scope-catalog",
      "Tags",
    ],
    [
      "access-m2m-bindings",
      "M2M Bindings",
      "access",
      "resource-servers:read",
      "/access/m2m-bindings",
      "Network",
    ],
  ] satisfies readonly NavTuple[]),
  ...navItems("platform", platformHref, [
    [
      "security-sessions",
      "Sessions",
      "security",
      "security-audit:read",
      "/security/sessions",
      "ShieldCheck",
      { mobile: true },
    ],
    [
      "security-tokens",
      "Tokens",
      "security",
      "security-audit:read",
      "/security/tokens?type=access",
      "Fingerprint",
    ],
    [
      "security-consents",
      "Consents",
      "security",
      "security-audit:read",
      "/security/consents",
      "FileCheck2",
    ],
    [
      "security-introspection",
      "Introspection",
      "security",
      "security-audit:read",
      "/security/introspect",
      "CircleHelp",
    ],
    [
      "security-jwks",
      "JWKS",
      "security",
      "jwks:read",
      "/security/jwks",
      "KeyRound",
    ],
  ] satisfies readonly NavTuple[]),
  ...navItems("organization", organizationHref, [
    ["audit", "Audit", "audit", "security-audit:read", "/audit", "History"],
  ] satisfies readonly NavTuple[]),
];

function activeScope(scope: ConsoleScope): ActiveScope {
  return scope.kind === "platform"
    ? { kind: "platform" }
    : {
        kind: "organization",
        organizationId:
          scope.organizationId ?? scope.id.replace("organization:", ""),
      };
}

function permissionForScope(
  item: ConsoleNavItem,
  scope: ConsoleScope,
): ConsolePermission {
  return typeof item.requiredPermission === "string"
    ? item.requiredPermission
    : item.requiredPermission[scope.kind];
}

function appliesToScope(item: ConsoleNavItem, scope: ConsoleScope): boolean {
  return item.appliesTo === "both" || item.appliesTo === scope.kind;
}

function labelForScope(item: ConsoleNavItem, scope: ConsoleScope): string {
  return typeof item.label === "string" ? item.label : item.label[scope.kind];
}

/** Pure console-nav lens filter; server-side authorization remains independent. */
export function visibleNavItems(
  items: readonly ConsoleNavItem[],
  scope: ConsoleScope,
): readonly VisibleConsoleNavItem[] {
  const currentScope = activeScope(scope);
  return items
    .filter(
      (item) =>
        appliesToScope(item, scope) &&
        scope.permissions.includes(permissionForScope(item, scope)),
    )
    .map((item) => ({
      id: item.id,
      label: labelForScope(item, scope),
      href: item.href(currentScope),
      section: item.section,
      exact: item.exact,
      icon: item.icon,
      mobile: item.mobile ?? false,
    }));
}

/** Groups visible items and omits empty headers. */
export function visibleNavSections(
  scope: ConsoleScope,
): readonly VisibleConsoleNavSection[] {
  const items = visibleNavItems(CONSOLE_NAV_ITEMS, scope);
  return CONSOLE_NAV_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    items: items.filter((item) => item.section === section.id),
  })).filter((section) => section.items.length > 0);
}
