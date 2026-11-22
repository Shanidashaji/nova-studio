'use client';

import { languageName } from '@nova/shared';
import { Mic, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@/components/ui/misc';
import { useStoredFlag } from '@/lib/use-stored-flag';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { useNovaSession } from './nova-session';
import { NovaRobot, ROBOT_LABEL } from './robot/nova-robot';
import { VOICE_STATE_LABEL, VoiceProblemCard } from './voice-status';

/**
 * NOVA minimised: a floating robot in the corner of the workspace. It mirrors the live session —
 * listening, thinking, speaking — so a voice conversation can continue with the panel closed,
 * previews replies that arrive meanwhile, and opens the full panel on click.
 */
export function NovaCompanion() {
  const nova = useNovaSession();
  const panelOpen = useWorkspace((s) => s.contextOpen && s.contextMode === 'nova');
  const showNova = useWorkspace((s) => s.showNova);
  const [hidden] = useStoredFlag('nova-companion-hidden');
  const preview = useReplyPreview(!panelOpen);
  // A greeting until the first interaction of the visit (or until dismissed).
  const [greet, setGreet] = useState(true);
  const interacted = nova.robot !== 'idle' || preview.text !== null;
  useEffect(() => {
    if (!interacted) return;
    const t = setTimeout(() => setGreet(false));
    return () => clearTimeout(t);
  }, [interacted]);

  if (!nova.enabled || panelOpen || hidden) return null;

  const active = nova.robot !== 'idle';
  const open = () => {
    showNova();
    requestAnimationFrame(() => document.getElementById('nova-input')?.focus());
  };

  return (
    <div
      className="fixed bottom-[4.5rem] right-3 z-30 flex items-end gap-2 md:bottom-5 md:right-5"
      aria-label="NOVA companion"
      role="region"
    >
      {greet && !preview.text && !active && !nova.voiceProblem ? (
        <div className="mb-3 flex items-center gap-1.5 rounded-[var(--radius-md)] rounded-br-sm border border-line bg-surface-2/95 py-2 pl-3 pr-2 text-sm shadow-[var(--shadow-float)] backdrop-blur">
          <button
            type="button"
            onClick={open}
            className="text-text hover:text-signal pointer-coarse:min-h-9"
          >
            How can I help you today?
          </button>
          {/* Padding with a matching negative margin: a 30px (36px on touch) target, same layout. */}
          <button
            type="button"
            onClick={() => setGreet(false)}
            aria-label="Dismiss greeting"
            className="-m-2 rounded-full p-2 text-text-3 hover:text-text pointer-coarse:-m-2.5 pointer-coarse:p-2.5"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {preview.text || active || nova.voiceProblem ? (
        <div className="mb-2 flex max-w-[min(300px,calc(100vw-110px))] flex-col gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2/95 p-2.5 text-xs shadow-[var(--shadow-float)] backdrop-blur">
          {active ? (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  nova.robot === 'error' ? 'bg-attention' : 'live-dot bg-signal',
                )}
                aria-hidden
              />
              <span className="flex-1 text-text" role="status">
                {nova.voiceState === 'checking' || nova.voiceState === 'permission'
                  ? VOICE_STATE_LABEL[nova.voiceState]
                  : nova.robot === 'speaking' && nova.speakingLanguage
                    ? `Speaking · ${languageName(nova.speakingLanguage)}`
                    : nova.robot === 'listening'
                      ? nova.interim || 'Listening…'
                      : ROBOT_LABEL[nova.robot]}
              </span>
              {nova.speaking || nova.listening ? (
                <button
                  type="button"
                  onClick={nova.speaking ? nova.stopSpeaking : nova.stopListening}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-text-2 hover:bg-surface-3 hover:text-text"
                  aria-label={nova.speaking ? 'Stop speaking' : 'Stop listening'}
                >
                  <Square className="size-3" /> Stop
                </button>
              ) : null}
            </div>
          ) : null}
          {nova.voiceProblem && !active ? (
            <VoiceProblemCard
              compact
              problem={nova.voiceProblem}
              onRetry={() => void nova.startListening()}
              onDismiss={nova.dismissVoiceProblem}
              className="border-0 bg-transparent p-0"
            />
          ) : null}
          {nova.voiceProblem?.steps?.length && !active ? (
            <button type="button" onClick={open} className="self-start text-signal hover:underline">
              How to fix this →
            </button>
          ) : null}
          {preview.text && !nova.listening ? (
            <div className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={open}
                dir="auto"
                className="line-clamp-3 flex-1 text-left text-text-2 hover:text-text"
              >
                {preview.text}
              </button>
              <button
                type="button"
                onClick={preview.dismiss}
                aria-label="Dismiss reply preview"
                className="text-text-3 hover:text-text"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-1.5">
        {nova.recognitionSupported ? (
          <Tooltip content={nova.listening ? 'Stop listening' : 'Talk to NOVA without opening it'}>
            <button
              type="button"
              onClick={nova.listening ? nova.stopListening : () => void nova.startListening()}
              disabled={
                nova.busy || nova.voiceState === 'checking' || nova.voiceState === 'permission'
              }
              aria-pressed={nova.listening}
              aria-label={nova.listening ? 'Stop voice input' : 'Speak to NOVA'}
              className={cn(
                'grid size-8 place-items-center rounded-full border shadow-[var(--shadow-float)] transition-colors disabled:opacity-50',
                nova.listening
                  ? 'border-signal-line bg-signal text-on-signal'
                  : 'border-line bg-surface-2 text-text-2 hover:text-signal',
              )}
            >
              <Mic className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content="Open NOVA (Ctrl J)" side="left">
          <button
            type="button"
            onClick={open}
            aria-label={`Talk to NOVA — ${ROBOT_LABEL[nova.robot]}`}
            className="group grid size-[68px] place-items-center rounded-full border border-line bg-[radial-gradient(circle_at_50%_35%,var(--surface-3),var(--surface-1))] shadow-[var(--shadow-float)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
          >
            <NovaRobot state={nova.robot} getLevel={nova.getLevel} size={54} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/** Shows the latest reply that arrived while the panel was closed, for a few seconds. */
function useReplyPreview(watching: boolean) {
  const nova = useNovaSession();
  const last = [...nova.messages].reverse().find((m) => m.role === 'ASSISTANT' && !m.pending);
  const seen = useRef<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const lastId = last?.id ?? null;
  const lastContent = last?.content ?? '';
  const historyPending = nova.historyPending;
  useEffect(() => {
    if (seen.current === null) {
      if (!historyPending) seen.current = lastId ?? ''; // history on load is not "new"
      return;
    }
    if (!lastId || lastId === seen.current) return;
    seen.current = lastId;
    if (!watching) return;
    const plain = lastContent
      .replace(/\*\*|__?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const show = setTimeout(() => setText(plain.length > 160 ? `${plain.slice(0, 157)}…` : plain));
    return () => clearTimeout(show);
  }, [historyPending, lastId, lastContent, watching]);

  useEffect(() => {
    if (!text) return;
    const hide = setTimeout(() => setText(null), 9000);
    return () => clearTimeout(hide);
  }, [text]);

  return { text: watching ? text : null, dismiss: () => setText(null) };
}
