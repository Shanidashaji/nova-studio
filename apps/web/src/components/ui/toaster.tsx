'use client';

import { Toaster } from 'sonner';

/** The one toast outlet, styled with the theme tokens. Used by the workspace and the login page. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--surface-2)',
          border: '1px solid var(--line-strong)',
          color: 'var(--text)',
          fontSize: 13,
        },
      }}
    />
  );
}
