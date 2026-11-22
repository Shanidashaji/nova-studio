import { cookies, headers } from 'next/headers';
import type { SessionUser } from '@nova/shared';

export const SESSION_COOKIE = 'nova_session';

/**
 * Server-side session check for server components. The API is the authority: the cookie is
 * forwarded to /auth/me and only a successful response counts as signed in.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const base = process.env.API_INTERNAL_URL?.trim() || (await ownOrigin());
  try {
    const res = await fetch(`${base}/api/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return ((await res.json()) as { user: SessionUser }).user;
  } catch {
    return null;
  }
}

/**
 * The API runs inside this app (ADR-0014), so by default the check goes to this app's own
 * origin, taken from the incoming request.
 */
async function ownOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto =
    h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
