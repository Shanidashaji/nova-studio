'use client';

import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Accessible modal dialog (focus trap, Esc, focus restore via Radix). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-[6dvh] z-50 flex max-h-[88dvh] w-[calc(100vw-32px)] sm:top-[12dvh] sm:max-h-[80dvh] max-w-lg -translate-x-1/2 flex-col rounded-[var(--radius-lg)] border border-line bg-surface-1 shadow-[var(--shadow-float)] focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold text-text">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-sm text-text-2">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="rounded p-1 text-text-3 hover:bg-surface-3 hover:text-text"
              aria-label="Close"
            >
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
