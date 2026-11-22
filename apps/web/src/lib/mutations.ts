'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiRequestError } from './api';

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A mutation against the API that refreshes the workspace on success and reports the outcome.
 * The SSE stream refreshes other open sessions; this refreshes the current one immediately.
 */
export function useApiMutation<TBody = unknown, TResult = unknown>(
  method: Method,
  path: string | ((body: TBody) => string),
  options: {
    success?: string | ((result: TResult, body: TBody) => string | null);
    onSuccess?: (result: TResult, body: TBody) => void;
    /** Return true when the error was handled by the caller (e.g. shown inline). */
    onError?: (error: ApiRequestError) => boolean | void;
    /** Request body sent instead of the variables (e.g. strip client-only fields). */
    transform?: (body: TBody) => unknown;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation<TResult, ApiRequestError, TBody>({
    mutationFn: (body) =>
      api<TResult>(typeof path === 'function' ? path(body) : path, {
        method,
        body: method === 'DELETE' ? undefined : options.transform ? options.transform(body) : body,
      }),
    onSuccess: (result, body) => {
      const message =
        typeof options.success === 'function' ? options.success(result, body) : options.success;
      if (message) toast.success(message);
      // The caller reacts first (close the dialog, leave a deleted record's inspector), then the
      // workspace refreshes in the background. Waiting for every open query to refetch kept each
      // dialog spinning after the change had already been saved, and refetched records that the
      // caller was about to navigate away from (a deleted task answered 404).
      options.onSuccess?.(result, body);
      // After the next render: a panel the caller has just closed must be unmounted first, or
      // its query (say, the task that was deleted) would still count as active and be refetched.
      setTimeout(() => {
        void qc.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== 'search' && q.queryKey[0] !== 'assistant',
        });
      }, 0);
    },
    onError: (error) => {
      if (options.onError?.(error)) return;
      toast.error(error.message, {
        description: error.requestId ? `Reference ${error.requestId.slice(0, 8)}` : undefined,
      });
    },
  });
}
