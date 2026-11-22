'use client';

import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'nova-storage';
/** Fallback when localStorage throws (private mode, blocked storage). */
const memory = new Map<string, string>();

/**
 * A boolean preference in localStorage, read without effects and kept in sync across components.
 * Renders `false` on the server; storage failures (private mode) fall back to in-memory only.
 */
export function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const [raw, setRaw] = useStoredString(key, '0');
  const set = useCallback((next: boolean) => setRaw(next ? '1' : '0'), [setRaw]);
  return [raw === '1', set];
}

/** A string preference in localStorage, with the same guarantees as `useStoredFlag`. */
export function useStoredString(key: string, fallback: string): [string, (value: string) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('storage', cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener('storage', cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return memory.get(key) ?? fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        memory.set(key, next); // storage unavailable: preference lasts for this page only
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
