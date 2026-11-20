import { NextResponse, type NextRequest } from "next/server";

// Logged-out visitors to the home page are sent to the marketing page. Anyone
// with a session cookie continues to the app, which still checks the session
// itself and sends expired sessions to /login.
//
// This is a redirect, not a rewrite: behind nginx a rewrite's absolute URL
// carries the forwarded https scheme and a host that differs from the one
// `next start` binds, so Next treats it as an external proxy and fails. Proxy
// redirects need an absolute Location, so build it from the public host and
// scheme that nginx forwards rather than the internal URL.
export function proxy(request: NextRequest) {
  const session = request.cookies.get("wm_session")?.value;
  if (session && /^[a-f0-9]{64}$/.test(session)) return NextResponse.next();
  const host = request.headers.get("host");
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme = forwarded === "https" || forwarded === "http" ? forwarded : request.nextUrl.protocol.replace(":", "");
  const target = new URL("/welcome", host ? `${scheme}://${host}` : request.nextUrl.origin);
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: "/" };
