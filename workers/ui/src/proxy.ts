import { NextResponse, type NextRequest } from "next/server";
import type { ConsoleScopeEnvelope } from "@id/lib";

const matcher = ["/admin", "/admin/:path*", "/login"] as const;

// Query params the login page consumes locally. Anything else means the login
// form is mid-OAuth-authorize and must never be intercepted.
const localLoginParams = new Set(["callbackURL", "error"]);

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isCanonicalAdminPath(pathname: string): boolean {
  return pathname === "/admin/platform" || pathname.startsWith("/admin/platform/") || pathname.startsWith("/admin/orgs/");
}

function adminCallbackPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function loginRedirect(request: NextRequest, error?: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("callbackURL", adminCallbackPath(request.nextUrl));
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

function isOauthAuthorizeRequest(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (!localLoginParams.has(key)) return true;
  }
  return false;
}

function adminLoginTarget(request: NextRequest): string {
  const callback = request.nextUrl.searchParams.get("callbackURL");
  if (!callback) return "/admin";
  try {
    const url = new URL(callback, request.url);
    if (url.origin !== request.nextUrl.origin || !isAdminPath(url.pathname)) return "/admin";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/admin";
  }
}

async function readConsoleScopes(request: NextRequest): Promise<ConsoleScopeEnvelope | null> {
  const url = new URL("/api/auth/admin/console-scopes", request.url);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    redirect: "manual",
  }).catch(() => null);

  if (!response) return null;
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as ConsoleScopeEnvelope | null;
}

function defaultAdminTarget(envelope: ConsoleScopeEnvelope): string {
  if (envelope.defaultScopeId === "platform") return "/admin/platform";
  if (envelope.defaultScopeId?.startsWith("organization:")) {
    return `/admin/orgs/${encodeURIComponent(envelope.defaultScopeId.slice("organization:".length))}`;
  }
  return "/account";
}

function hasPlatformScope(envelope: ConsoleScopeEnvelope): boolean {
  return envelope.scopes.some((scope) => scope.kind === "platform");
}

function hasOrganizationScope(envelope: ConsoleScopeEnvelope, organizationId: string): boolean {
  return envelope.scopes.some((scope) => scope.kind === "organization" && scope.organizationId === organizationId);
}

function routeOrganizationId(pathname: string): string | undefined {
  const match = /^\/admin\/orgs\/([^/]+)/u.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function legacyOrganizationDetailTarget(pathname: string): string | null {
  const match = /^\/admin\/identity\/organizations\/([^/]+)\/?(.*)$/u.exec(pathname);
  if (!match?.[1]) return null;
  const organizationId = match[1];
  const tail = match[2] ?? "";
  if (!tail) return `/admin/orgs/${organizationId}`;
  if (tail === "members" || tail === "teams" || tail === "invitations") return `/admin/orgs/${organizationId}/identity/${tail}`;
  if (tail === "audit") return `/admin/orgs/${organizationId}/audit`;
  return `/admin/orgs/${organizationId}`;
}

function legacyPlatformTarget(pathname: string): string {
  const organizationTarget = legacyOrganizationDetailTarget(pathname);
  if (organizationTarget) return organizationTarget;
  if (pathname === "/admin/oauth" || pathname === "/admin/oauth/") return "/admin/platform/oauth/applications";
  if (pathname.startsWith("/admin/oauth/sessions-tokens")) return "/admin/platform/security/sessions";
  if (pathname.startsWith("/admin/oauth/resource-apis")) return `/admin/platform/access/resource-apis${pathname.slice("/admin/oauth/resource-apis".length)}`;
  if (pathname.startsWith("/admin/oauth/scope-catalog")) return `/admin/platform/access/scope-catalog${pathname.slice("/admin/oauth/scope-catalog".length)}`;
  if (pathname.startsWith("/admin/oauth/m2m-bindings")) return `/admin/platform/access/m2m-bindings${pathname.slice("/admin/oauth/m2m-bindings".length)}`;
  if (pathname === "/admin/security" || pathname === "/admin/security/") return "/admin/platform/security/sessions";
  return `/admin/platform/${pathname.slice("/admin/".length)}`;
}

function legacyPlatformRedirect(request: NextRequest, envelope: ConsoleScopeEnvelope): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (isCanonicalAdminPath(pathname)) return null;
  if (pathname === "/admin") {
    return NextResponse.redirect(new URL(defaultAdminTarget(envelope), request.url));
  }
  if (!hasPlatformScope(envelope)) {
    return NextResponse.redirect(new URL(defaultAdminTarget(envelope), request.url));
  }
  const target = legacyPlatformTarget(pathname);
  if (!canOpenScopedRoute(target, envelope)) {
    return NextResponse.redirect(new URL(defaultAdminTarget(envelope), request.url));
  }
  const next = new URL(target, request.url);
  next.search = request.nextUrl.search;
  return NextResponse.redirect(next);
}

function canOpenScopedRoute(pathname: string, envelope: ConsoleScopeEnvelope): boolean {
  if (pathname === "/admin/platform" || pathname.startsWith("/admin/platform/")) return hasPlatformScope(envelope);
  const orgId = routeOrganizationId(pathname);
  if (orgId) return hasOrganizationScope(envelope, orgId);
  return envelope.actor.canEnterConsole;
}

function canonicalLoginTarget(target: string, request: NextRequest, envelope: ConsoleScopeEnvelope): string {
  const url = new URL(target, request.url);
  if (url.pathname === "/admin") return defaultAdminTarget(envelope);
  if (isCanonicalAdminPath(url.pathname)) {
    return canOpenScopedRoute(url.pathname, envelope) ? `${url.pathname}${url.search}` : defaultAdminTarget(envelope);
  }
  if (!hasPlatformScope(envelope)) return defaultAdminTarget(envelope);
  const legacyTarget = legacyPlatformTarget(url.pathname);
  return canOpenScopedRoute(legacyTarget, envelope) ? `${legacyTarget}${url.search}` : defaultAdminTarget(envelope);
}

async function guardAdmin(request: NextRequest) {
  const envelope = await readConsoleScopes(request);

  if (!envelope) return loginRedirect(request);
  if (!envelope.actor.canEnterConsole) return NextResponse.redirect(new URL("/account", request.url));

  const legacyRedirect = legacyPlatformRedirect(request, envelope);
  if (legacyRedirect) return legacyRedirect;
  if (!canOpenScopedRoute(request.nextUrl.pathname, envelope)) {
    return NextResponse.redirect(new URL(defaultAdminTarget(envelope), request.url));
  }
  return NextResponse.next();
}

async function guardLogin(request: NextRequest) {
  // OAuth authorize flows reuse the login form even for signed-in users, so the
  // session-aware skip only applies to the plain admin sign-in page.
  if (isOauthAuthorizeRequest(request.nextUrl)) return NextResponse.next();

  const envelope = await readConsoleScopes(request);
  if (envelope?.actor.canEnterConsole) {
    const target = adminLoginTarget(request);
    return NextResponse.redirect(new URL(canonicalLoginTarget(target, request, envelope), request.url));
  }
  if (envelope && !envelope.actor.canEnterConsole) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") return guardLogin(request);
  return guardAdmin(request);
}

export const config = {
  matcher,
};
