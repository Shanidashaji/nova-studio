'use client';

import type { SessionUser } from '@nova/shared';
import { useEffect, useRef } from 'react';
import { NovaCompanion } from '@/features/assistant/nova-companion';
import { NovaSessionProvider } from '@/features/assistant/nova-session';
import { useAuthGuards } from '@/features/auth/sign-out';
import { ContextColumn } from '@/features/inspector/context-column';
import { CommandPalette } from '@/features/command/command-palette';
import { PipelineSpine } from '@/features/spine/pipeline-spine';
import { useLiveEvents } from '@/lib/live-events';
import { LENSES, readUrlState, useWorkspace, writeUrlState } from '@/store/workspace';
import { FocusBar } from './focus-bar';
import { Masthead } from './hero';
import { LensCanvas } from './lens-canvas';
import { visibleLenses } from './lenses';
import { Providers } from './providers';
import { Rail } from './rail';
import { UserProvider, useUser } from './user-context';
import { useWorkspaceHotkeys } from './use-hotkeys';

export function Workspace({ user }: { user: SessionUser }) {
  return (
    <Providers>
      <UserProvider user={user}>
        <NovaSessionProvider>
          <WorkspaceFrame />
        </NovaSessionProvider>
      </UserProvider>
    </Providers>
  );
}

/**
 * Layout of the single workspace:
 *   sidebar | masthead (top bar + heading) · pipeline spine · focus bar · lens canvas | context column
 *   (inspector / NOVA, docked when open) · floating NOVA companion while the panel is closed
 */
function WorkspaceFrame() {
  const status = useLiveEvents();
  useAuthGuards();
  useUrlSync();
  useWorkspaceHotkeys();

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col pb-14 md:pb-0">
        <main id="workspace" className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <Masthead live={status} />
            <PipelineSpine />
            <FocusBar />
            <LensCanvas />
          </div>
          <ContextColumn />
        </main>
      </div>
      <NovaCompanion />
      <CommandPalette />
    </div>
  );
}

/** Keeps lens, focus and the inspected entity in the URL so every view can be linked. */
function useUrlSync() {
  const hydrated = useRef(false);
  const lens = useWorkspace((s) => s.lens);
  const focus = useWorkspace((s) => s.focus);
  const stack = useWorkspace((s) => s.stack);
  const { permissions } = useUser();

  useEffect(() => {
    // A link (or a stale bookmark) may name a lens this role cannot open. The sidebar would not
    // offer it, so the URL must not either: fall back to Home instead of a page of 403 panels.
    const allowed = new Set(visibleLenses(LENSES, permissions));
    const read = () => {
      const state = readUrlState(window.location.search);
      if (state.lens && !allowed.has(state.lens)) state.lens = 'pulse';
      return state;
    };
    useWorkspace.getState().hydrate(read());
    hydrated.current = true;
    const onPop = () =>
      useWorkspace.getState().hydrate({ stack: [], focus: null, lens: 'pulse', ...read() });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [permissions]);

  useEffect(() => {
    if (!hydrated.current) return;
    const next = `${window.location.pathname}${writeUrlState({ lens, focus, stack })}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [lens, focus, stack]);
}
