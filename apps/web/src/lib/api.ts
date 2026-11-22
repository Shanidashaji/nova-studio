/**
 * Browser API client. Requests go to /api/v1 on the same origin; Next.js forwards them to NestJS.
 * Errors are thrown as ApiRequestError carrying the API's error envelope.
 */
import type { ApiError } from '@nova/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Set while a deliberate sign-out is in progress, so requests that were still in flight and now
 * fail with 401 do not race the sign-out redirect with a "session expired" one.
 */
let signingOut = false;
export function setSigningOut(value: boolean) {
  signingOut = value;
}

export async function api<T>(
  path: string,
  options: { method?: Method; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiRequestError(
      0,
      'NETWORK',
      'NOVA could not reach the server. Check that the API is running.',
    );
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const envelope = data as ApiError | null;
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !signingOut &&
      !path.startsWith('/auth/login') &&
      !path.startsWith('/auth/logout')
    ) {
      // A full navigation on purpose: it discards every cached query from the expired session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/login?expired=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    }
    throw new ApiRequestError(
      res.status,
      envelope?.error.code ?? 'HTTP_ERROR',
      envelope?.error.message ??
        (res.status >= 500
          ? 'NOVA’s server is unavailable right now. Try again in a moment.'
          : `Request failed (${res.status}).`),
      envelope?.error.details,
      envelope?.error.requestId,
    );
  }
  return data as T;
}

/** Builds a query string from defined values only. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries.length
    ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`
    : '';
}
