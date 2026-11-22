'use client';

import { CircleCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const VISIBLE_MS = 5000;

/**
 * Confirms a completed sign-out on the login page. Rendered on the server (from `signed_out=1`),
 * so it appears with the page rather than after hydration; it then fades out, and the flag is
 * dropped from the URL so a refresh or bookmark does not repeat it.
 */
export function SignedOutNotice() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('signed_out');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    const t = setTimeout(() => setOpen(false), VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-40px)] items-start gap-3 rounded-[var(--radius-md)] border border-line-strong bg-surface-1 py-3 pl-3.5 pr-2 text-sm text-text shadow-[var(--shadow-float)]"
    >
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
      <div>
        <p className="font-medium">Signed out</p>
        <p className="text-xs text-text-2">You have been signed out of NOVA.</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="rounded-full p-1 text-text-3 hover:bg-surface-3 hover:text-text"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
