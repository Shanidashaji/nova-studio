import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'signal' | 'attention' | 'critical' | 'info' | 'ai';

const tones: Record<Tone, string> = {
  neutral: 'border-line-strong bg-surface-2 text-text-2',
  signal: 'border-signal-line bg-signal-soft text-signal',
  attention: 'border-attention-line bg-attention-soft text-attention',
  critical: 'border-critical-line bg-critical-soft text-critical',
  info: 'border-info-line bg-info-soft text-info',
  ai: 'border-ai-line bg-ai-soft text-ai',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-text-3',
  signal: 'bg-signal',
  attention: 'bg-attention',
  critical: 'bg-critical',
  info: 'bg-info',
  ai: 'bg-ai',
};

/** Status badge: a dot plus a text label — status is never conveyed by colour alone. */
export function Badge({
  tone = 'neutral',
  dot = true,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-2xs font-medium',
        tones[tone],
        className,
      )}
    >
      {dot ? <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}
