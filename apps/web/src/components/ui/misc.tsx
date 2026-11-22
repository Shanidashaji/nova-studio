'use client';

import { Tooltip as T } from 'radix-ui';
import { cn, hashString, initials } from '@/lib/utils';

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <T.Provider delayDuration={250}>{children}</T.Provider>;
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-[var(--radius-sm)] border border-line bg-surface-2 px-2 py-1 text-xs text-text shadow-[var(--shadow-float)]"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-mono text-2xs text-text-3',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-[var(--radius-sm)] bg-surface-3/70', className)}
      aria-hidden
    />
  );
}

const AVATAR_TONES = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
];

/** Initials avatar with a stable colour per person. */
export function Avatar({
  name,
  size = 24,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const tone = AVATAR_TONES[hashString(name) % AVATAR_TONES.length];
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-[var(--bg)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        // `--avatar-depth` deepens the colour in the light theme so the initials keep 4.5:1.
        background: `color-mix(in srgb, ${tone} var(--avatar-depth, 100%), #141110)`,
        fontSize: Math.max(9, size * 0.4),
      }}
    >
      {initials(name)}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function AvatarStack({
  names,
  max = 4,
  size = 22,
}: {
  names: string[];
  max?: number;
  size?: number;
}) {
  const shown = names.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((n, i) => (
        <Avatar
          key={n}
          name={n}
          size={size}
          className={cn('ring-2 ring-[var(--surface-1)]', i > 0 && '-ml-1.5')}
        />
      ))}
      {names.length > max ? (
        <span className="ml-1 font-mono text-2xs text-text-3">+{names.length - max}</span>
      ) : null}
    </span>
  );
}

/** Thin progress meter. */
export function Meter({
  value,
  tone = 'signal',
  className,
  label,
}: {
  value: number;
  tone?: 'signal' | 'attention' | 'critical' | 'info' | 'ai';
  className?: string;
  label?: string;
}) {
  const color = {
    signal: 'bg-signal',
    attention: 'bg-attention',
    critical: 'bg-critical',
    info: 'bg-info',
    ai: 'bg-ai',
  }[tone];
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-[var(--m-slow)]', color)}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  );
}

/** Segmented control for small option sets (filters, ranges). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-[var(--radius-sm)] border border-line bg-surface-2 p-0.5 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 rounded-[4px] px-2 text-xs text-text-3 transition-colors hover:text-text pointer-coarse:h-8 pointer-coarse:px-3',
            value === o.value && 'bg-surface-3 text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
