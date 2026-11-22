import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useId } from 'react';
import type { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Skeleton } from './misc';

/** Standard panel: surface, eyebrow, title and one optional action. */
export function Panel({
  eyebrow,
  icon,
  title,
  action,
  className,
  bodyClassName,
  children,
  id,
}: {
  eyebrow?: string;
  /** Small leading icon shown before the title. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const generated = useId();
  const headingId = title ? (id ?? generated) : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col rounded-[var(--radius-xl)] border border-line shadow-[var(--shadow-card)] [background:var(--card)]',
        className,
      )}
    >
      {title || eyebrow || action ? (
        <header className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span className="flex shrink-0 text-brand [&_svg]:size-4" aria-hidden>
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              {title ? (
                <h2 id={headingId} className="truncate text-sm font-semibold text-text">
                  {title}
                </h2>
              ) : null}
            </div>
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1 px-4 pb-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Loading / empty / error states for any data panel, so every panel handles all three the same way.
 */
export function PanelState({
  query,
  empty,
  isEmpty,
  skeleton = 'list',
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  isEmpty?: boolean;
  empty?: { title: string; body?: string; action?: React.ReactNode };
  skeleton?: 'list' | 'cards' | 'chart' | 'block';
  children: React.ReactNode;
}) {
  if (query.isPending) {
    if (skeleton === 'cards')
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      );
    if (skeleton === 'chart') return <Skeleton className="h-56 w-full" />;
    if (skeleton === 'block') return <Skeleton className="h-32 w-full" />;
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    const err = query.error as ApiRequestError | undefined;
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 rounded-[var(--radius-sm)] border border-critical-line bg-critical-soft p-3"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-critical">
          <AlertTriangle className="size-4" /> {err?.message ?? 'This panel could not load.'}
        </p>
        {err?.requestId ? (
          <p className="font-mono text-2xs text-text-3">Reference {err.requestId}</p>
        ) : null}
        <Button size="sm" onClick={() => query.refetch()}>
          <RotateCcw /> Retry
        </Button>
      </div>
    );
  }
  if (isEmpty && empty) {
    return (
      <div className="flex flex-col items-start gap-1 py-6">
        <p className="font-display text-xl italic text-text">{empty.title}</p>
        {empty.body ? <p className="max-w-sm text-sm text-text-2">{empty.body}</p> : null}
        {empty.action ? <div className="mt-2">{empty.action}</div> : null}
      </div>
    );
  }
  return <>{children}</>;
}
