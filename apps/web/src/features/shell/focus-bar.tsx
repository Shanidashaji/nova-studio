'use client';

import { Crosshair, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/store/workspace';

const TYPE_LABEL = {
  stage: 'Stage',
  project: 'Project',
  client: 'Client',
  member: 'Person',
} as const;

/**
 * Shows the active workspace focus. Every lens narrows to it; clearing it restores the full view.
 */
export function FocusBar() {
  const focus = useWorkspace((s) => s.focus);
  const setFocus = useWorkspace((s) => s.setFocus);
  return (
    <AnimatePresence initial={false}>
      {focus ? (
        <motion.div
          key="focus"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          // `shrink-0`: this is a flex child of the scrolling column, and an overflow-hidden
          // flex child may shrink to nothing — which hid the bar and its Clear button.
          className="shrink-0 overflow-hidden"
        >
          <div
            className="mx-4 mt-3 flex lg:mx-8 items-center gap-2 rounded-[var(--radius-md)] border border-signal-line bg-signal-soft px-3 py-1.5 text-sm"
            role="status"
          >
            <Crosshair className="size-4 text-signal" />
            <span className="text-text-2">Focused on</span>
            <span className="text-text-3">{TYPE_LABEL[focus.type]}</span>
            <span className="font-medium text-text">{focus.label}</span>
            <span className="hidden text-xs text-text-3 sm:inline">
              — every lens is narrowed to this
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setFocus(null)}
              aria-label="Clear focus"
            >
              <X /> Clear
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
