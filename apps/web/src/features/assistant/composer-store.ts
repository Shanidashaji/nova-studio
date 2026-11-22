'use client';

import { create } from 'zustand';

/** Lets other parts of the workspace (palette, buttons) hand a question to NOVA. */
export const useNovaComposer = create<{
  pending: string | null;
  ask: (text: string) => void;
  take: () => string | null;
}>((set, get) => ({
  pending: null,
  ask: (text) => set({ pending: text }),
  take: () => {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  },
}));
