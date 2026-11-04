import { NextResponse, type NextRequest } from "next/server";

// Logged-out visitors to the home page are sent to the coming-soon page. Anyone
// with a session cookie continues to the app, which still checks the session
// itself and sends expired sessions to /login.
//
// This is a redirect with a relative Location, not a rewrite: behind nginx the
// absolute URL a rewrite needs carries the forwarded https scheme and a host
// that differs from the one `next start` binds, so Next would treat it as an
// external proxy and fail.
export function proxy(request: NextRequest) {
  const session = request.cookies.get("wm_session")?.value;
  if (session && /^[a-f0-9]{64}$/.test(session)) return NextResponse.next();
  return new NextResponse(null, { status: 307, headers: { Location: "/coming-soon", "Cache-Control": "no-store" } });
}

export const config = { matcher: "/" };
