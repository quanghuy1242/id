"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import type { ConsolePermission, ConsoleScope, ConsoleScopeEnvelope } from "@id/lib";
import { getConsoleScopes as getConsoleScopesAction } from "../_actions/console-scopes";
import { consoleScopesKey } from "../_data/swr-keys";

type AdminScopeActions = {
  readonly getConsoleScopes: () => Promise<ConsoleScopeEnvelope>;
};

type AdminScopeProviderProps = {
  readonly children: ReactNode;
  readonly initialEnvelope?: ConsoleScopeEnvelope;
  readonly actions?: AdminScopeActions;
};

type AdminScopeContextValue = {
  readonly envelope: ConsoleScopeEnvelope;
  readonly activeScope: ConsoleScope;
  readonly loading: boolean;
  readonly error?: string;
  readonly switchHref: (scope: ConsoleScope) => string;
};

const fallbackPlatformPermissions = [
  "platform:read",
  "platform:write",
  "organizations:read",
  "organizations:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
  "jwks:read",
  "jwks:rotate",
  "system:read",
  "system:write",
] as const satisfies readonly ConsolePermission[];

const fallbackPlatformScope: ConsoleScope = {
  kind: "platform",
  id: "platform",
  label: "Platform",
  role: "platform-admin",
  permissions: fallbackPlatformPermissions,
  requiresStepUp: true,
};

const routeOrganizationPermissions = [
  "members:read",
  "members:write",
  "oauth-clients:read",
  "oauth-clients:write",
  "resource-servers:read",
  "resource-servers:write",
  "security-audit:read",
] as const satisfies readonly ConsolePermission[];

export const fallbackConsoleScopeEnvelope: ConsoleScopeEnvelope = {
  actor: { userId: "unknown", canEnterConsole: true },
  scopes: [fallbackPlatformScope],
  memberships: [],
  defaultScopeId: "platform",
};

const AdminScopeContext = createContext<AdminScopeContextValue>({
  envelope: fallbackConsoleScopeEnvelope,
  activeScope: fallbackPlatformScope,
  loading: false,
  switchHref: (scope) => scope.kind === "platform" ? "/admin/platform" : `/admin/orgs/${scope.organizationId}`,
});

function routeOrganizationId(pathname: string): string | undefined {
  const match = /^\/admin\/orgs\/([^/]+)/u.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function scopeBase(scope: ConsoleScope): string {
  return scope.kind === "platform" ? "/admin/platform" : `/admin/orgs/${scope.organizationId}`;
}

function routeTail(pathname: string): string {
  if (pathname === "/admin" || pathname === "/admin/") return "";
  if (pathname === "/admin/platform") return "";
  if (pathname.startsWith("/admin/platform/")) return pathname.slice("/admin/platform/".length);
  const orgMatch = /^\/admin\/orgs\/[^/]+\/?(.*)$/u.exec(pathname);
  if (orgMatch) return orgMatch[1] ?? "";
  if (pathname.startsWith("/admin/")) return pathname.slice("/admin/".length);
  return "";
}

function equivalentTail(tail: string, target: ConsoleScope, currentOrgId: string | undefined): string {
  if (!tail) return "";
  if (tail.startsWith("oauth/applications")) return "oauth/applications";
  if (tail.startsWith("access/service-accounts")) return "access/service-accounts";
  if (tail.startsWith("access/resource-apis")) return "access/resource-apis";
  if (tail.startsWith("access/scope-catalog")) return "access/scope-catalog";
  if (tail.startsWith("access/m2m-bindings")) return "access/m2m-bindings";
  if (tail.startsWith("security/consents")) return "security/consents";
  if (tail.startsWith("security/") || tail.startsWith("system/")) return target.kind === "platform" ? tail : "";
  if (tail.startsWith("identity/users")) return target.kind === "platform" ? "identity/users" : "identity/members";
  if (tail.startsWith("identity/organizations")) return target.kind === "platform" ? tail : "";
  if (tail.startsWith("identity/registration-policies")) return "identity/registration-policies";
  if (tail.startsWith("identity/members")) return target.kind === "platform" && currentOrgId ? "identity/organizations" : "identity/members";
  if (tail.startsWith("identity/teams")) return target.kind === "platform" && currentOrgId ? "identity/organizations" : "identity/teams";
  if (tail.startsWith("identity/invitations")) return target.kind === "platform" && currentOrgId ? "identity/organizations" : "identity/invitations";
  if (tail.startsWith("audit")) return target.kind === "platform" ? "" : "audit";
  return "";
}

function scopeHrefForPath(pathname: string, target: ConsoleScope): string {
  const base = scopeBase(target);
  const nextTail = equivalentTail(routeTail(pathname), target, routeOrganizationId(pathname));
  return nextTail ? `${base}/${nextTail}` : base;
}

function activeScopeFromPath(pathname: string, envelope: ConsoleScopeEnvelope): ConsoleScope {
  const orgId = routeOrganizationId(pathname);
  if (orgId) {
    const orgScope = envelope.scopes.find((scope) => scope.kind === "organization" && scope.organizationId === orgId);
    if (orgScope) return orgScope;
    return {
      kind: "organization",
      id: `organization:${orgId}`,
      organizationId: orgId,
      label: "Organization",
      role: "admin",
      permissions: routeOrganizationPermissions,
      requiresStepUp: false,
    };
  }

  if (pathname === "/admin" || pathname === "/admin/" || pathname.startsWith("/admin/platform") || pathname.startsWith("/admin/")) {
    const platformScope = envelope.scopes.find((scope) => scope.kind === "platform");
    if (platformScope) return platformScope;
  }

  const defaultScope = envelope.scopes.find((scope) => scope.id === envelope.defaultScopeId);
  return defaultScope ?? envelope.scopes[0] ?? fallbackPlatformScope;
}

export function AdminScopeProvider({
  children,
  initialEnvelope,
  actions = { getConsoleScopes: getConsoleScopesAction },
}: AdminScopeProviderProps) {
  const pathname = usePathname() ?? "/admin";
  const { data, isLoading, error } = useSWR(
    consoleScopesKey(),
    () => actions.getConsoleScopes(),
    { fallbackData: initialEnvelope },
  );
  const envelope = data ?? initialEnvelope ?? fallbackConsoleScopeEnvelope;
  const activeScope = activeScopeFromPath(pathname, envelope);
  const value = useMemo<AdminScopeContextValue>(() => ({
    envelope,
    activeScope,
    loading: !initialEnvelope && isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
    switchHref: (scope) => scopeHrefForPath(pathname, scope),
  }), [activeScope, envelope, error, initialEnvelope, isLoading, pathname]);

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>;
}

export function useAdminScope() {
  return useContext(AdminScopeContext);
}
