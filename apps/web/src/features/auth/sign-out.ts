'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNovaComposer } from '@/features/assistant/composer-store';
import { api, setSigningOut } from '@/lib/api';
import { useWorkspace } from '@/store/workspace';

/** Where a completed sign-out lands; the login page shows the confirmation toast. */
export const SIGNED_OUT_URL = '/login?signed_out=1';

/** Tells every other open NOVA tab that this browser signed out. */
const AUTH_CHANNEL = 'nova-auth';
type AuthMessage = { type: 'signed-out' };

/**
 * True once this tab has started leaving after its own sign-out. Other BroadcastChannel
 * instances in the same tab also receive the broadcast, and must not redirect over it.
 */
let leaving = false;

/**
 * Drops every piece of signed-in data the page holds in memory: React Query's cache (all API
 * responses), the workspace and composer stores (open entities, pending NOVA questions) and any
 * speech still playing. The HttpOnly session cookie itself is expired by the API.
 */
function clearClientState(qc: QueryClient) {
  qc.clear();
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useNovaComposer.setState(useNovaComposer.getInitialState(), true);
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* speech unavailable */
  }
}

/**
 * A full, history-replacing navigation: it discards the JavaScript heap (and with it the Next.js
 * router cache) and removes the workspace entry from history, so Back cannot return to it from
 * memory. Any other workspace entry left in history is server-rendered `no-store` and re-checks
 * the session; bfcache restores are caught by `useAuthGuards`.
 */
function leaveToLogin(url: string) {
  if (leaving) return;
  leaving = true;
  window.location.replace(url);
}

function broadcastSignedOut() {
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({ type: 'signed-out' } satisfies AuthMessage);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable: other tabs find out on their next request (401) */
  }
}

/**
 * The sign-out action used by every sign-out control. The session is revoked on the server
 * first; only when that succeeds is local state cleared and the user sent to the login page.
 * On failure the user stays signed in (the cookie is HttpOnly, so the browser alone cannot end
 * the session) and gets an error toast with a retry.
 */
export function useSignOut() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const signOut = async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setSigningOut(true);
    const toastId = toast.loading('Signing out…');
    try {
      await qc.cancelQueries();
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      setSigningOut(false);
      inFlight.current = false;
      setPending(false);
      toast.error('Could not sign out', {
        id: toastId,
        description:
          error instanceof Error ? error.message : 'Something went wrong. You are still signed in.',
        action: { label: 'Retry', onClick: () => void signOut() },
      });
      return;
    }
    toast.dismiss(toastId);
    // Clear as the page is hidden, so the workspace does not visibly empty before it unloads.
    window.addEventListener('pagehide', () => clearClientState(qc), { once: true });
    leaveToLogin(SIGNED_OUT_URL);
    broadcastSignedOut();
  };

  return { signOut, pending };
}

/**
 * Keeps a signed-out browser out of the workspace:
 *  - another tab signed out → leave this one too;
 *  - the page came back from the back/forward cache → hide it and reload, so the server
 *    re-checks the session before anything is shown again.
 */
export function useAuthGuards() {
  useEffect(() => {
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (e: MessageEvent<AuthMessage>) => {
        if (e.data?.type === 'signed-out') {
          setSigningOut(true);
          leaveToLogin('/login');
        }
      };
    } catch {
      /* unavailable */
    }

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      document.documentElement.style.visibility = 'hidden';
      window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      channel?.close();
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}
