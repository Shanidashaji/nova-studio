'use client';

import { AlertTriangle, Info, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceState } from './nova-session';
import type { VoiceProblem } from './speech';

export const VOICE_STATE_LABEL: Record<VoiceState, string> = {
  idle: 'Ready',
  checking: 'Checking microphone…',
  permission: 'Waiting for microphone permission…',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
  error: 'Voice input needs attention',
};

/**
 * A voice problem with its fix: what happened, numbered steps, and Retry when retrying can help.
 * `compact` drops the steps (the floating companion), keeping the message and Retry.
 */
export function VoiceProblemCard({
  problem,
  onRetry,
  onDismiss,
  compact,
  className,
}: {
  problem: VoiceProblem;
  onRetry: () => void;
  onDismiss: () => void;
  compact?: boolean;
  className?: string;
}) {
  const error = problem.tone === 'error';
  const Icon = error ? AlertTriangle : Info;
  return (
    <div
      role={error ? 'alert' : 'status'}
      data-voice-problem={problem.code}
      className={cn(
        'rounded-[var(--radius-md)] border px-2.5 py-2 text-xs',
        error
          ? 'border-attention-line bg-attention-soft text-text-2'
          : 'border-line bg-surface-2 text-text-2',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn('mt-0.5 size-3.5 shrink-0', error ? 'text-attention' : 'text-text-3')}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">{problem.title}</p>
          <p className="mt-0.5 leading-4">{problem.message}</p>
          {!compact && problem.steps?.length ? (
            <ol className="mt-1.5 list-decimal space-y-0.5 ps-4 leading-4">
              {problem.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          ) : null}
          {problem.retry ? (
            <Button size="sm" variant="ghost" className="-ms-2 mt-1" onClick={onRetry}>
              <RotateCcw /> Retry
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-text-3 hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
