import { NextResponse, type NextRequest } from "next/server";

// Logged-out visitors to the home page see the coming-soon page. Anyone with a
// session cookie continues to the app, which still checks the session itself
// and sends expired sessions to /login.
export function proxy(request: NextRequest) {
  const session = request.cookies.get("wm_session")?.value;
  if (session && /^[a-f0-9]{64}$/.test(session)) return NextResponse.next();
  // Clone nextUrl rather than building from request.url: behind nginx the
  // forwarded https scheme would otherwise turn this into an external proxy.
  const target = request.nextUrl.clone();
  target.pathname = "/coming-soon";
  return NextResponse.rewrite(target);
}

export const config = { matcher: "/" };
