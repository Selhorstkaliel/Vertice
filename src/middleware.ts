import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PREFIXES, SESSION_COOKIE } from "@/modules/auth/constants";

/**
 * Optimistic gate only: redirects visitors without a session cookie away from
 * app routes. Real validation (DB lookup, expiry, ownership) happens on the
 * server in `requireUser` — never rely on this for authorization.
 */
export function middleware(request: NextRequest) {
  // Personal plan credentials are for this local installation, never a public backend.
  if (process.env.CHATGPT_PERSONAL_MODE === "on" && !["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname)) {
    return new NextResponse("O modo pessoal do ChatGPT está disponível apenas nesta máquina.", { status: 403 });
  }
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
