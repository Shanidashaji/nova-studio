'use client';

import { useEffect } from 'react';
import { LENSES, useWorkspace } from '@/store/workspace';
import { visibleLenses } from './lenses';
import { useUser } from './user-context';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Global shortcuts: Ctrl/⌘K command palette · Ctrl/⌘J NOVA assistant · 1–9 visible lenses ·
 * Esc closes the inspector (dialogs handle their own Esc first).
 */
export function useWorkspaceHotkeys() {
  const { permissions } = useUser();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ws = useWorkspace.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ws.setPaletteOpen(!ws.paletteOpen);
        return;
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        ws.showNova();
        requestAnimationFrame(() => document.getElementById('nova-input')?.focus());
        return;
      }
      if (isTyping(e.target) || mod || e.altKey || ws.paletteOpen) return;
      // A modal dialog owns the keyboard: no lens switching behind it.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (/^[1-9]$/.test(e.key)) {
        const target = visibleLenses(LENSES, permissions)[Number(e.key) - 1];
        if (target) ws.setLens(target);
        return;
      }
      if (e.key === 'Escape' && ws.contextMode === 'inspector' && ws.stack.length > 0) {
        // Step back through the inspector history; from the last record close the panel rather
        // than swapping it for the assistant. (In the assistant, Esc belongs to voice input.)
        if (ws.stack.length > 1) ws.back();
        else ws.closeInspector();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [permissions]);
}
