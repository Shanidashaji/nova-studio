import { ArrowRight } from 'lucide-react';

/** The small "View all →" link in a panel header. */
export function PanelLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 text-xs text-text-3 transition-colors hover:text-signal pointer-coarse:min-h-9 pointer-coarse:px-1"
    >
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </button>
  );
}
