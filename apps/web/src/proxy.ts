import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fast path for protected routes: without a session cookie, go straight to /login.
 * The workspace layout still verifies the session with the API (the cookie may be stale).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has('nova_session')) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/studio/:path*'],
};
