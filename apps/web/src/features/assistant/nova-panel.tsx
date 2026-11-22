'use client';

import { isRtl, languageInfo, languageName, type AssistantProposal } from '@nova/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  Check,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useAssistantStatus } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace, type InspectType } from '@/store/workspace';
import { useNovaSession, type NovaMessage } from './nova-session';
import { NovaRobot, ROBOT_LABEL } from './robot/nova-robot';
import { VoiceSettings } from './voice-settings';
import { VOICE_STATE_LABEL, VoiceProblemCard } from './voice-status';

const STARTERS = [
  'What needs my attention today?',
  'Which projects are delayed?',
  'Which workflows are blocked?',
  'Show the workload of the team',
  'Summarize the activity from this week',
];

/**
 * NOVA, the workspace assistant. Knows the current lens, focus and inspected entity; answers
 * from live data in the user's language; listens and speaks; turns requested changes into
 * proposals that run only after confirmation. State lives in `NovaSessionProvider`.
 */
export function NovaPanel() {
  const nova = useNovaSession();
  const status = useAssistantStatus();
  const [input, setInput] = useState('');
  /** `voice` while the box holds recognised speech the user is reviewing. */
  const [inputChannel, setInputChannel] = useState<'text' | 'voice'>('text');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lens = useWorkspace((s) => s.lens);
  const focus = useWorkspace((s) => s.focus);
  const top = useWorkspace((s) => s.stack.at(-1));

  const count = nova.messages.length;
  const lastContent = nova.messages.at(-1)?.content;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [count, lastContent]);

  // Recognised speech held for review (auto-send off) lands in the box, ready to edit and send.
  const draft = nova.voiceDraft;
  const [takenDraft, setTakenDraft] = useState<number | null>(null);
  if (draft && draft.id !== takenDraft) {
    setTakenDraft(draft.id);
    setInput(draft.text);
    setInputChannel('voice');
  }
  useEffect(() => {
    if (takenDraft !== null) inputRef.current?.focus();
  }, [takenDraft]);

  const submit = (text: string, channel: 'text' | 'voice' = 'text') => {
    if (!text.trim() || nova.busy) return;
    setInput('');
    setInputChannel('text');
    void nova.send(text, channel);
  };

  const lastSuggestions = [...nova.messages]
    .reverse()
    .find((m) => m.role === 'ASSISTANT' && !m.pending)?.suggestions;
  const contextLabel =
    top && top.type !== 'workflows'
      ? `Looking at this ${top.type}`
      : focus
        ? `Focused on ${focus.label}`
        : `Viewing ${lens}`;

  if (!nova.enabled)
    return (
      <p className="p-4 text-sm text-text-2">Your role does not include the NOVA assistant.</p>
    );

  const listenName = languageInfo(nova.listenLocale)?.name ?? nova.listenLocale;
  const preparing = nova.voiceState === 'checking' || nova.voiceState === 'permission';
  const stateLine = preparing
    ? VOICE_STATE_LABEL[nova.voiceState]
    : nova.robot === 'listening'
      ? `Listening · ${listenName}`
      : nova.robot === 'speaking'
        ? `${nova.paused ? 'Paused' : 'Speaking'}${nova.speakingLanguage ? ` · ${languageName(nova.speakingLanguage)}` : ''}`
        : nova.robot === 'idle'
          ? contextLabel
          : ROBOT_LABEL[nova.robot];

  return (
    <div className="flex h-full flex-col">
      {/* Stage: NOVA's figure, live state and voice controls. */}
      <div className="relative flex items-center gap-3 overflow-hidden border-b border-line px-4 py-2.5">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-16 size-48 rounded-full bg-signal opacity-[0.06] blur-3xl"
        />
        <NovaRobot
          state={nova.robot}
          getLevel={nova.getLevel}
          size={60}
          title={`NOVA — ${ROBOT_LABEL[nova.robot]}`}
          className="-my-1 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold leading-4">
            NOVA
            {status.data ? (
              <Tooltip
                content={
                  status.data.provider === 'claude'
                    ? `Answers by Claude (${status.data.model}) using live studio tools, in the language you use.`
                    : 'Deterministic local intelligence over live data, English only. Set ANTHROPIC_API_KEY to use Claude with multilingual replies.'
                }
              >
                <span>
                  <Badge tone={status.data.provider === 'claude' ? 'ai' : 'neutral'}>
                    {status.data.provider === 'claude' ? 'Claude' : 'Demo mode'}
                  </Badge>
                </span>
              </Tooltip>
            ) : null}
          </p>
          <p className="mt-1 truncate text-2xs text-text-3" role="status" aria-live="polite">
            {stateLine}
          </p>
        </div>
        <div className="flex items-center">
          {nova.synthesisSupported ? (
            <Tooltip content={nova.muted ? 'Turn voice replies on' : 'Mute voice replies'}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => nova.setMuted(!nova.muted)}
                aria-pressed={!nova.muted}
                aria-label={nova.muted ? 'Turn voice replies on' : 'Mute voice replies'}
              >
                {nova.muted ? <VolumeX /> : <Volume2 />}
              </Button>
            </Tooltip>
          ) : null}
          <VoiceSettings provider={status.data?.provider} />
        </div>
      </div>

      {nova.speaking ? (
        <div className="flex items-center gap-1.5 border-b border-line bg-signal-soft/40 px-4 py-1.5">
          <span className="live-dot size-1.5 rounded-full bg-signal" aria-hidden />
          <span className="flex-1 text-xs text-text-2">
            {nova.paused ? 'Paused' : 'NOVA is speaking'}
          </span>
          {nova.paused ? (
            <Button size="sm" variant="ghost" onClick={nova.resume}>
              <Play /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={nova.pause}>
              <Pause /> Pause
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={nova.stopSpeaking}>
            <Square /> Stop
          </Button>
        </div>
      ) : null}

      {nova.voiceProblem ? (
        <div className="border-b border-line px-4 py-2">
          <VoiceProblemCard
            problem={nova.voiceProblem}
            onRetry={() => void nova.startListening()}
            onDismiss={nova.dismissVoiceProblem}
          />
        </div>
      ) : null}

      {nova.voiceNotice ? (
        <Notice tone="attention" onDismiss={nova.dismissVoiceNotice}>
          {nova.voiceNotice}
        </Notice>
      ) : null}

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {nova.messages.length === 0 && !nova.historyPending ? (
          <div className="py-4">
            <p className="font-display text-2xl italic leading-7 text-text">
              What do you need to know?
            </p>
            <p className="mt-1 text-sm text-text-2">
              Ask — or press the microphone and talk — about productions, schedules, people or
              approvals, in your own language. Changes I suggest wait for your confirmation.
            </p>
          </div>
        ) : null}
        <ol className="flex flex-col gap-3">
          {nova.messages.map((m) => (
            <li key={m.id} className={cn('flex gap-2', m.role === 'USER' && 'justify-end')}>
              {m.role === 'ASSISTANT' ? (
                <NovaRobot state="idle" still size={22} className="mt-0.5 shrink-0" />
              ) : null}
              <div
                className={cn(
                  'min-w-0 max-w-[88%]',
                  m.role === 'USER' &&
                    'rounded-[var(--radius-md)] rounded-br-sm bg-surface-3 px-3 py-2 text-sm',
                )}
              >
                {m.role === 'USER' ? (
                  <UserBody m={m} />
                ) : m.pending ? (
                  <Thinking />
                ) : (
                  <AssistantBody m={m} />
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-line p-3">
        <div className="scrollbar-none mb-2 flex gap-1.5 overflow-x-auto">
          {(lastSuggestions?.length ? lastSuggestions : STARTERS).map((s) => (
            <button
              key={s}
              type="button"
              disabled={nova.busy}
              onClick={() => submit(s)}
              className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-text-2 hover:border-ai-line hover:text-ai disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input, inputChannel);
          }}
          className={cn(
            'flex items-end gap-1.5 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-1.5 focus-within:border-ai',
            nova.listening && 'border-signal-line',
          )}
        >
          <textarea
            ref={inputRef}
            id="nova-input"
            dir="auto"
            value={nova.listening ? nova.interim || input : input}
            onChange={(e) => {
              setInput(e.target.value);
              if (nova.voiceDraft) nova.clearVoiceDraft();
              if (!e.target.value) setInputChannel('text');
              if (nova.speaking) nova.stopSpeaking(); // typing interrupts NOVA
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(input, inputChannel);
              }
            }}
            readOnly={nova.listening}
            rows={1}
            placeholder={
              nova.listening
                ? `Listening in ${listenName}… speak now`
                : preparing
                  ? VOICE_STATE_LABEL[nova.voiceState]
                  : 'Ask NOVA or request a change…'
            }
            aria-label="Message NOVA"
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm text-text outline-none placeholder:text-text-3"
          />
          <Tooltip
            content={
              nova.recognitionSupported
                ? nova.listening
                  ? 'Stop listening and use what was heard'
                  : preparing
                    ? VOICE_STATE_LABEL[nova.voiceState]
                    : `Speak to NOVA (listening in ${listenName})`
                : 'Voice input needs a browser with speech recognition (Chrome, Edge or Safari). Typing works here.'
            }
          >
            <span>
              <Button
                variant={nova.listening ? 'primary' : 'ghost'}
                size="icon"
                disabled={nova.busy || preparing}
                loading={preparing}
                onClick={nova.listening ? nova.stopListening : () => void nova.startListening()}
                aria-label={
                  nova.listening
                    ? 'Stop voice input'
                    : preparing
                      ? VOICE_STATE_LABEL[nova.voiceState]
                      : 'Start voice input'
                }
                aria-pressed={nova.listening}
                data-voice-state={nova.voiceState}
              >
                {preparing ? null : nova.recognitionSupported ? (
                  <Mic className={cn(nova.listening && 'live-dot')} />
                ) : (
                  <MicOff />
                )}
              </Button>
            </span>
          </Tooltip>
          <Button
            type="submit"
            variant="ai"
            size="icon"
            disabled={!input.trim() || nova.busy || nova.listening}
            loading={nova.busy}
            aria-label="Send"
          >
            {nova.busy ? null : <ArrowUp />}
          </Button>
        </form>
        {nova.voiceState === 'permission' ? (
          <p className="mt-1 text-2xs text-text-2" role="status">
            Choose <strong className="text-text">Allow</strong> in the browser’s microphone prompt
            so NOVA can hear you.
          </p>
        ) : nova.listening ? (
          <p className="mt-1 text-2xs text-text-3" role="status">
            {nova.autoSendVoice
              ? 'Speak now. Press the microphone again to finish, or Esc to cancel.'
              : 'Speak now. Press the microphone again to finish and review, or Esc to cancel.'}
          </p>
        ) : inputChannel === 'voice' && input ? (
          <p className="mt-1 text-2xs text-text-3">
            Recognised speech — edit it if needed, then press Enter to send.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'attention';
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 border-b px-4 py-2 text-xs',
        tone === 'attention' && 'border-attention-line bg-attention-soft text-text-2',
      )}
    >
      <p className="flex-1">{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-text-3 hover:text-text"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5 text-xs text-text-3" role="status">
      <span className="live-dot size-1.5 rounded-full bg-ai" />
      Reading the studio…
    </span>
  );
}

function LanguageTag({ code }: { code: string | null | undefined }) {
  if (!code || code === 'en') return null;
  return (
    <span className="rounded border border-line px-1 font-mono text-[10px] uppercase leading-4 text-text-3">
      {languageName(code) ?? code}
    </span>
  );
}

function UserBody({ m }: { m: NovaMessage }) {
  return (
    <>
      <p dir="auto" lang={m.language ?? undefined}>
        {m.content}
      </p>
      {m.channel === 'voice' || (m.language && m.language !== 'en') ? (
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-text-3">
          {m.channel === 'voice' ? (
            <>
              <Mic className="size-3" aria-hidden /> spoken
            </>
          ) : null}
          <LanguageTag code={m.language} />
        </p>
      ) : null}
    </>
  );
}

function AssistantBody({ m }: { m: NovaMessage }) {
  const nova = useNovaSession();
  const inspect = useWorkspace((s) => s.inspect);
  return (
    <div className="flex flex-col gap-2">
      <RichText
        text={m.content}
        lang={m.language ?? undefined}
        className={m.error ? 'text-critical' : undefined}
      />
      {m.proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} onChange={nova.updateProposal} />
      ))}
      {m.references.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {dedupe(m.references).map((r) => (
            <button
              key={`${r.type}:${r.id}`}
              type="button"
              onClick={() => inspect({ type: r.type as InspectType, id: r.id })}
              className="rounded border border-line px-1.5 py-0.5 text-2xs text-text-2 hover:border-line-strong hover:text-text"
            >
              {r.label} →
            </button>
          ))}
        </div>
      ) : null}
      {!m.error && nova.synthesisSupported ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => nova.speakMessage(m)}
            disabled={nova.listening}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-text-3 hover:text-signal disabled:opacity-50"
            aria-label="Read this reply aloud"
          >
            <Volume2 className="size-3" aria-hidden /> Listen
          </button>
          <LanguageTag code={m.language} />
        </div>
      ) : null}
    </div>
  );
}

/** Proposed change with a before/after table. Nothing happens until Confirm. */
function ProposalCard({
  proposal: p,
  onChange,
}: {
  proposal: AssistantProposal;
  onChange: (p: AssistantProposal) => void;
}) {
  const qc = useQueryClient();
  const inspect = useWorkspace((s) => s.inspect);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: 'confirm' | 'cancel') => {
    setBusy(kind);
    setError(null);
    try {
      const next = await api<AssistantProposal>(`/assistant/actions/${p.id}/${kind}`, {
        method: 'POST',
      });
      onChange(next);
      if (next.status === 'CONFIRMED') {
        await qc.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== 'search' && q.queryKey[0] !== 'assistant',
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the action.');
    } finally {
      setBusy(null);
    }
  };

  const state = {
    PROPOSED: { tone: 'ai' as const, label: 'Awaiting your confirmation' },
    CONFIRMED: { tone: 'signal' as const, label: 'Applied · recorded in activity' },
    CANCELLED: { tone: 'neutral' as const, label: 'Cancelled' },
    FAILED: { tone: 'critical' as const, label: 'Not applied' },
    STALE: { tone: 'attention' as const, label: 'Out of date' },
  }[p.status];

  return (
    <div className="rounded-[var(--radius-md)] border border-ai-line bg-surface-2 p-2.5">
      <p className="eyebrow !text-ai">Proposed action</p>
      <p className="mt-0.5 text-sm font-medium text-text">{p.title}</p>
      <table className="mt-2 w-full text-xs">
        <tbody>
          {p.changes.map((c) => (
            <tr key={c.field} className="border-t border-line/60">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-text-3">
                {c.field}
              </th>
              <td className="py-1 text-text-3 line-through decoration-text-3/50">{c.from ?? ''}</td>
              <td className="py-1 pl-2 text-text">{c.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={state.tone}>{state.label}</Badge>
        {p.status === 'PROPOSED' ? (
          <>
            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              loading={busy === 'confirm'}
              disabled={busy !== null}
              onClick={() => act('confirm')}
            >
              <Check /> Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'cancel'}
              disabled={busy !== null}
              onClick={() => act('cancel')}
            >
              <X /> Cancel
            </Button>
          </>
        ) : null}
        {p.status === 'CONFIRMED' && p.resultEntity ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() =>
              inspect({ type: p.resultEntity!.type as InspectType, id: p.resultEntity!.id })
            }
          >
            Open →
          </Button>
        ) : null}
      </div>
      {p.error ? <p className="mt-1.5 text-xs text-critical">{p.error}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-critical">{error}</p> : null}
    </div>
  );
}

/**
 * Renders the assistant's light markdown: paragraphs, bullet / numbered lists, **bold**, _italic_.
 * Direction follows the text (`dir="auto"`), so Arabic and Urdu replies read right to left.
 */
function RichText({ text, lang, className }: { text: string; lang?: string; className?: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="flex flex-col gap-1 ps-1">
          {list.map((l, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-text-3" aria-hidden />
              <span>{inline(l)}</span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of lines) {
    const m = /^\s*(?:-|\d+\.)\s+(.*)$/.exec(line);
    if (m) list.push(m[1]!);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return (
    <div
      dir={lang && isRtl(lang) ? 'rtl' : 'auto'}
      lang={lang}
      className={cn('flex flex-col gap-1.5 text-sm leading-5 text-text-2', className)}
    >
      {blocks}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) =>
    part.startsWith('**') ? (
      <strong key={i} className="font-semibold text-text">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith('_') && part.endsWith('_') && part.length > 2 ? (
      <em key={i} className="text-text-3">
        {part.slice(1, -1)}
      </em>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const dedupe = (refs: NovaMessage['references']) => [
  ...new Map(refs.map((r) => [`${r.type}:${r.id}`, r])).values(),
];
