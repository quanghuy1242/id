import { NextResponse, type NextRequest } from "next/server";

type SessionBody = {
  readonly user?: {
    readonly role?: unknown;
  };
} | null;

const matcher = ["/admin", "/admin/:path*", "/login"] as const;

// Query params the login page consumes locally. Anything else means the login
// form is mid-OAuth-authorize and must never be intercepted.
const localLoginParams = new Set(["callbackURL", "error"]);

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
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

async function readSession(request: NextRequest): Promise<SessionBody> {
  const url = new URL("/api/auth/get-session", request.url);
  url.searchParams.set("disableRefresh", "true");
  url.searchParams.set("disableCookieCache", "true");

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
  return (await response.json().catch(() => null)) as SessionBody;
}

async function guardAdmin(request: NextRequest) {
  const session = await readSession(request);

  if (!session?.user) return loginRedirect(request);
  if (session.user.role !== "admin") return loginRedirect(request, "admin_required");

  return NextResponse.next();
}

async function guardLogin(request: NextRequest) {
  // OAuth authorize flows reuse the login form even for signed-in users, so the
  // session-aware skip only applies to the plain admin sign-in page.
  if (isOauthAuthorizeRequest(request.nextUrl)) return NextResponse.next();

  const session = await readSession(request);
  if (session?.user?.role === "admin") {
    return NextResponse.redirect(new URL(adminLoginTarget(request), request.url));
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
