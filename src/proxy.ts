import { NextResponse, type NextRequest } from "next/server";

// Kitchen is a local operator console whose data can change outside Next.js (CLI actions,
// config edits, gateway restarts). We should never serve cached HTML/data for app routes.
//
// NOTE: In Next.js 16, middleware has been renamed to `proxy`.
export function proxy(req: NextRequest) {
  const res = NextResponse.next();

  // Prevent browser/proxy caching of HTML and route responses.
  // (Static assets under /_next/static remain cacheable and are excluded by matcher below.)
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");

  // Some proxies/CDNs respect this.
  res.headers.set("Surrogate-Control", "no-store");

  // Vary on auth-related headers to avoid cross-user cache confusion if a proxy exists.
  res.headers.set("Vary", "Authorization, Cookie");

  return res;
}

export const config = {
  // Exclude Next static assets and favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
