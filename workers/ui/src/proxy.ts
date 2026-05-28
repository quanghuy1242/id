import { NextResponse, type NextRequest } from "next/server";

type SessionBody = {
  readonly user?: {
    readonly role?: unknown;
  };
} | null;

const adminMatcher = ["/admin", "/admin/:path*"] as const;

function adminCallbackPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function loginRedirect(request: NextRequest, error?: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("callbackURL", adminCallbackPath(request.nextUrl));
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
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

export async function proxy(request: NextRequest) {
  const session = await readSession(request);

  if (!session?.user) return loginRedirect(request);
  if (session.user.role !== "admin") return loginRedirect(request, "admin_required");

  return NextResponse.next();
}

export const config = {
  matcher: adminMatcher,
};
