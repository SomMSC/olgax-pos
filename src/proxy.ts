import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/setup",
  "/api/setup",
  "/api/ping",
  "/store",
  "/api/store",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals and static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/uploads") ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|webmanifest)$/i.test(
      pathname
    )
  ) {
    return NextResponse.next();
  }

  // PUBLIC ROUTES MUST COME BEFORE THE SETUP BARRIER.
  if (
    PUBLIC_PATHS.some(
      (path) =>
        pathname === path || pathname.startsWith(`${path}/`)
    )
  ) {
    return NextResponse.next();
  }

  const setupDone =
    request.cookies.get("olgax-setup-complete")?.value === "1";

  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasAuthSecret = !!process.env.BETTER_AUTH_SECRET;

  const isSetupPath =
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname === "/api/setup" ||
    pathname.startsWith("/api/setup/");

  if (setupDone && isSetupPath) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  if (
    (!setupDone || !hasDbUrl || !hasAuthSecret) &&
    !isSetupPath
  ) {
    return NextResponse.redirect(
      new URL("/setup", request.url)
    );
  }

  const hasSession =
    !!request.cookies.get("better-auth.session_token")?.value ||
    !!request.cookies.get(
      "__Secure-better-auth.session_token"
    )?.value;

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(
      new URL("/pos", request.url)
    );
  }

  if (!hasSession) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|webmanifest)).*)",
  ],
};
