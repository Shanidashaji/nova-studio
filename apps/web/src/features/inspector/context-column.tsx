'use client';

import { ChevronLeft, PanelRight, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NovaPanel } from '@/features/assistant/nova-panel';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { InspectorRouter } from './inspector-router';

/**
 * The right-hand context column: one place for details (Inspector) and for NOVA. Opens on demand
 * (an inspected entity, Ctrl J, the NOVA card); docked on wide screens, an overlay sheet below 1280px.
 */
export function ContextColumn() {
  const mode = useWorkspace((s) => s.contextMode);
  const stack = useWorkspace((s) => s.stack);
  const open = useWorkspace((s) => s.contextOpen);
  const setOpen = useWorkspace((s) => s.setContextOpen);
  const back = useWorkspace((s) => s.back);
  const close = useWorkspace((s) => s.closeInspector);
  const showNova = useWorkspace((s) => s.showNova);
  const wide = useWide();
  const top = stack.at(-1);

  if (!open) return null;

  return (
    <>
      {!wide ? (
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 z-30 bg-[var(--scrim)]"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        aria-label={mode === 'nova' ? 'NOVA assistant' : 'Inspector'}
        className={cn(
          'flex flex-col border-l border-line bg-surface-1',
          wide
            ? 'w-[420px] shrink-0 2xl:w-[460px]'
            : 'fixed inset-y-0 right-0 z-40 w-full max-w-[460px] shadow-[var(--shadow-float)]',
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
          {mode === 'inspector' && stack.length > 1 ? (
            <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back">
              <ChevronLeft />
            </Button>
          ) : null}
          <div role="tablist" aria-label="Context" className="flex gap-0.5">
            <button
              role="tab"
              type="button"
              aria-selected={mode === 'inspector'}
              disabled={!top}
              onClick={() => top && useWorkspace.setState({ contextMode: 'inspector' })}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs disabled:opacity-40',
                mode === 'inspector' ? 'bg-surface-3 text-text' : 'text-text-3 hover:text-text',
              )}
            >
              <PanelRight className="size-3.5" /> Inspector
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={mode === 'nova'}
              onClick={showNova}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs',
                mode === 'nova' ? 'bg-ai-soft text-ai' : 'text-text-3 hover:text-ai',
              )}
            >
              <Sparkles className="size-3.5" /> NOVA
            </button>
          </div>
          {mode === 'inspector' && stack.length > 1 ? (
            <span className="ml-1 truncate font-mono text-[10px] text-text-3">
              {stack.map((s) => s.type).join(' › ')}
            </span>
          ) : null}
          <div className="ml-auto flex items-center">
            {mode === 'inspector' ? (
              <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close inspector">
                <X />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Close NOVA"
              >
                <X />
              </Button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {/* NOVA stays mounted so the conversation and voice state survive inspector visits. */}
          <div className={cn('h-full', mode === 'nova' ? 'block' : 'hidden')}>
            <NovaPanel />
          </div>
          {mode === 'inspector' && top ? (
            <div
              className="h-full overflow-y-auto"
              key={`${top.type}:${top.id}:${top.section ?? ''}`}
            >
              <InspectorRouter target={top} />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}
