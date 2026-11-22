'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ActivityView } from '@nova/shared';

export type LiveStatus = 'connecting' | 'live' | 'offline';

/** How long to wait before reopening a stream the browser has given up on. */
const RECONNECT_MS = [2_000, 5_000, 15_000, 30_000];

/**
 * Subscribes to the API's Server-Sent Events stream. Each event refreshes the active queries
 * (debounced, so a burst of changes triggers one refetch). An `activity` event carries the audit
 * row and is handed to `onActivity`; a `refresh` event is the same signal without the row, sent
 * when the change concerns records this user may not read.
 *
 * The browser retries a dropped stream by itself, but stops for good after some failures (for
 * example an error response while the session is being renewed). When that happens the stream is
 * reopened here with a growing delay, so the workspace does not stay "Offline" until a reload.
 */
export function useLiveEvents(
  onActivity?: (a: Pick<ActivityView, 'id' | 'summary' | 'createdAt' | 'projectId'>) => void,
) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const handler = useRef(onActivity);

  useEffect(() => {
    handler.current = onActivity;
  }, [onActivity]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | null = null;
    let attempt = 0;
    let closed = false;

    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void qc.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== 'search' && q.queryKey[0] !== 'assistant',
        });
      }, 300);
    };

    const connect = () => {
      if (closed) return;
      const es = new EventSource('/api/v1/events');
      source = es;
      es.addEventListener('ready', () => {
        // Anything may have changed while the stream was down.
        if (attempt > 0) refresh();
        attempt = 0;
        setStatus('live');
      });
      es.addEventListener('activity', (e) => {
        try {
          handler.current?.(JSON.parse((e as MessageEvent<string>).data));
        } catch {
          /* ignore malformed payloads */
        }
        refresh();
      });
      es.addEventListener('refresh', refresh);
      es.onopen = () => setStatus('live');
      es.onerror = () => {
        if (es.readyState !== EventSource.CLOSED) {
          setStatus('connecting');
          return;
        }
        setStatus('offline');
        es.close();
        const delay = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)]!;
        attempt += 1;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(refreshTimer);
      clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [qc]);

  return status;
}
