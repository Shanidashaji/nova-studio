/**
 * Workspace UI state: the active lens, the workspace focus that every panel obeys, the inspector
 * stack and the context-column mode. Server data lives in TanStack Query, not here.
 */
'use client';

import { create } from 'zustand';
import type { StageKey } from '@nova/shared';

/** Lens order is the sidebar order (grouped in features/shell/lenses.ts). */
export const LENSES = [
  'pulse',
  'productions',
  'tasks',
  'people',
  'clients',
  'comms',
  'schedule',
  'shootday',
  'scripts',
  'talent',
  'post',
  'finance',
  'procurement',
  'inventory',
  'approvals',
  'documents',
  'reports',
  'business',
  'activity',
  'settings',
] as const;
export type Lens = (typeof LENSES)[number];

export type FocusType = 'stage' | 'project' | 'client' | 'member';
export interface Focus {
  type: FocusType;
  id: string;
  label: string;
}

export const INSPECT_TYPES = [
  'project',
  'task',
  'member',
  'client',
  'shoot',
  'asset',
  'lead',
  'workflows',
  'talent',
  'script',
] as const;
export type InspectType = (typeof INSPECT_TYPES)[number];
export interface InspectRef {
  type: InspectType;
  id: string;
  /** Optional tab or section to open (e.g. project "deliverables"). */
  section?: string;
}

export type ContextMode = 'inspector' | 'nova';

interface WorkspaceState {
  lens: Lens;
  focus: Focus | null;
  stack: InspectRef[];
  contextMode: ContextMode;
  /** Narrow screens show the context column as an overlay sheet. */
  contextOpen: boolean;
  paletteOpen: boolean;
  /** Shoot shown on the shoot-day lens (null = today's first shoot). */
  shootDayId: string | null;

  setLens: (lens: Lens) => void;
  setFocus: (focus: Focus | null) => void;
  focusStage: (key: StageKey, label: string) => void;
  inspect: (ref: InspectRef, opts?: { replace?: boolean }) => void;
  back: () => void;
  closeInspector: () => void;
  showNova: () => void;
  setContextOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  /** Opens the shoot-day workspace on a shoot. */
  openShootDay: (shootId: string | null) => void;
  hydrate: (state: Partial<Pick<WorkspaceState, 'lens' | 'focus' | 'stack'>>) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  lens: 'pulse',
  focus: null,
  stack: [],
  contextMode: 'nova',
  contextOpen: false,
  paletteOpen: false,
  shootDayId: null,

  setLens: (lens) => set({ lens }),
  setFocus: (focus) => set({ focus }),
  focusStage: (key, label) =>
    set((s) => ({
      focus:
        s.focus?.type === 'stage' && s.focus.id === key ? null : { type: 'stage', id: key, label },
    })),
  inspect: (ref, opts) =>
    set((s) => {
      const top = s.stack.at(-1);
      if (top && top.type === ref.type && top.id === ref.id) {
        return {
          stack: [...s.stack.slice(0, -1), ref],
          contextMode: 'inspector',
          contextOpen: true,
        };
      }
      const stack = opts?.replace ? [ref] : [...s.stack, ref].slice(-6);
      return { stack, contextMode: 'inspector', contextOpen: true };
    }),
  back: () =>
    set((s) => {
      const stack = s.stack.slice(0, -1);
      return stack.length ? { stack } : { stack, contextMode: 'nova' };
    }),
  closeInspector: () => set({ stack: [], contextMode: 'nova', contextOpen: false }),
  showNova: () => set({ contextMode: 'nova', contextOpen: true }),
  setContextOpen: (contextOpen) => set({ contextOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openShootDay: (shootDayId) => set({ lens: 'shootday', shootDayId }),
  hydrate: (state) =>
    set({
      ...state,
      ...(state.stack && state.stack.length
        ? { contextMode: 'inspector' as const, contextOpen: true }
        : {}),
    }),
}));

// ── URL synchronisation ───────────────────────────────────────────────────────
// ?lens=schedule&focus=stage:EDIT:Edit&inspect=project:abc
// Every view is linkable; the store remains the single source of truth.

const isLens = (v: string | null): v is Lens => !!v && (LENSES as readonly string[]).includes(v);

export function readUrlState(
  search: string,
): Partial<Pick<WorkspaceState, 'lens' | 'focus' | 'stack'>> {
  const p = new URLSearchParams(search);
  const lens = p.get('lens');
  const focusRaw = p.get('focus');
  const inspectRaw = p.get('inspect');
  const result: Partial<Pick<WorkspaceState, 'lens' | 'focus' | 'stack'>> = {};
  if (isLens(lens)) result.lens = lens;
  if (focusRaw) {
    const [type, id, ...label] = focusRaw.split(':');
    if (type && id && ['stage', 'project', 'client', 'member'].includes(type)) {
      result.focus = {
        type: type as FocusType,
        id,
        label: decodeURIComponent(label.join(':')) || id,
      };
    }
  }
  if (inspectRaw) {
    const [type, id, section] = inspectRaw.split(':');
    // Only known inspectors: an unknown type would open an empty panel.
    if (type && id && (INSPECT_TYPES as readonly string[]).includes(type)) {
      result.stack = [{ type: type as InspectType, id, section }];
    }
  }
  return result;
}

export function writeUrlState(state: Pick<WorkspaceState, 'lens' | 'focus' | 'stack'>): string {
  const p = new URLSearchParams();
  if (state.lens !== 'pulse') p.set('lens', state.lens);
  if (state.focus)
    p.set(
      'focus',
      `${state.focus.type}:${state.focus.id}:${encodeURIComponent(state.focus.label)}`,
    );
  const top = state.stack.at(-1);
  if (top) p.set('inspect', [top.type, top.id, top.section].filter(Boolean).join(':'));
  const s = p.toString();
  return s ? `?${s}` : '';
}
