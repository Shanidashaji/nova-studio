'use client';

import { LANGUAGES, baseLanguage, languageInfo, languageName } from '@nova/shared';
import { Popover as P } from 'radix-ui';
import { Settings2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/misc';
import { useStoredFlag } from '@/lib/use-stored-flag';
import { cn } from '@/lib/utils';
import { useNovaSession } from './nova-session';

/** Voice and language preferences for NOVA, kept per browser. */
export function VoiceSettings({ provider }: { provider: 'demo' | 'claude' | undefined }) {
  const nova = useNovaSession();
  const [companionHidden, setCompanionHidden] = useStoredFlag('nova-companion-hidden');
  const ids = { lang: useId(), voice: useId() };
  const replyLang = nova.conversationLanguage ?? baseLanguage(nova.listenLocale) ?? 'en';
  const replyVoices = nova.voices.filter((v) => baseLanguage(v.lang) === replyLang);
  const chosen = nova.voiceFor(replyLang);

  return (
    <P.Root>
      <P.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Voice and language settings">
          <Settings2 />
        </Button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(340px,calc(100vw-32px))] rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-sm shadow-[var(--shadow-float)]"
        >
          <p className="font-semibold">Voice &amp; language</p>

          <div className="mt-3 flex flex-col gap-3">
            <Row label="Read replies aloud">
              <Segmented
                label="Read replies aloud"
                value={nova.muted ? 'off' : nova.speakMode}
                onChange={(v) => {
                  if (v === 'off') nova.setMuted(true);
                  else {
                    nova.setMuted(false);
                    nova.setSpeakMode(v);
                  }
                }}
                options={[
                  { value: 'voice', label: 'Spoken turns' },
                  { value: 'always', label: 'Always' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </Row>

            <MicrophoneStatus />

            <Toggle
              label="Send speech automatically"
              hint="Off: what you say appears in the message box so you can check and edit it before sending."
              checked={nova.autoSendVoice}
              onChange={nova.setAutoSendVoice}
              disabled={!nova.recognitionSupported || nova.handsFree}
            />

            <Toggle
              label="Hands-free conversation"
              hint="After NOVA answers a spoken question it listens again. Silence, Stop or Esc ends it."
              checked={nova.handsFree}
              onChange={nova.setHandsFree}
              disabled={!nova.recognitionSupported}
            />

            <div>
              <label htmlFor={ids.lang} className="text-xs font-medium text-text-2">
                I’m speaking
              </label>
              <select
                id={ids.lang}
                value={nova.speechLang}
                onChange={(e) => nova.setSpeechLang(e.target.value)}
                className={selectClass}
              >
                <option value="auto">
                  {`Auto — follow the conversation (${languageInfo(nova.listenLocale)?.name ?? nova.listenLocale})`}
                </option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.speech}>
                    {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-text-3">
                Browser speech recognition listens in one language at a time and can’t detect it by
                itself, so choose it here when you switch. Typed messages need no setting.
              </p>
            </div>

            <div>
              <label htmlFor={ids.voice} className="text-xs font-medium text-text-2">
                {languageName(replyLang)} voice
              </label>
              {replyVoices.length ? (
                <select
                  id={ids.voice}
                  value={chosen?.id ?? ''}
                  onChange={(e) => nova.setPreferredVoice(replyLang, e.target.value || null)}
                  className={selectClass}
                >
                  {replyVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.natural ? ' · natural' : ''}
                      {v.local ? '' : ' · online'}
                    </option>
                  ))}
                </select>
              ) : (
                <p id={ids.voice} className="mt-1 text-xs text-attention">
                  {nova.synthesisSupported
                    ? `No ${languageName(replyLang)} voice is installed in this browser. Replies stay as text.`
                    : 'This browser has no speech output.'}
                </p>
              )}
            </div>

            <Toggle
              label="Floating companion"
              hint="Show NOVA in the corner while the panel is closed."
              checked={!companionHidden}
              onChange={(v) => setCompanionHidden(!v)}
            />

            <p className="border-t border-line pt-2 text-2xs leading-4 text-text-3">
              {provider === 'demo'
                ? 'Demo mode answers in English only. With an AI provider configured, NOVA understands and replies in your language. '
                : 'NOVA replies in the language you use, including mixed-language messages. '}
              Voice input uses your browser’s speech service (Chrome and Edge send audio to Google /
              Microsoft); voices come from the browser and operating system.
            </p>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/** Microphone permission and device as the browser reports them, with a check button. */
function MicrophoneStatus() {
  const nova = useNovaSession();
  const checking = nova.voiceState === 'checking' || nova.voiceState === 'permission';
  const perm =
    nova.micPermission === 'granted'
      ? 'Allowed'
      : nova.micPermission === 'denied'
        ? 'Blocked for this site'
        : nova.micPermission === 'prompt'
          ? 'Not asked yet'
          : 'Unknown';
  return (
    <div className="rounded-[var(--radius-sm)] border border-line px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-text-2">Microphone</span>
        <Button
          size="sm"
          variant="ghost"
          loading={checking}
          disabled={nova.listening}
          onClick={() => void nova.checkMic()}
        >
          Check microphone
        </Button>
      </div>
      <p className="text-2xs leading-4 text-text-3" data-testid="mic-status">
        Permission: {perm}
        {nova.micDevice ? ` · ${nova.micDevice}` : ''}
        {nova.recognitionSupported ? '' : ' · speech recognition not supported in this browser'}
      </p>
    </div>
  );
}

const selectClass =
  'mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-1 px-2 text-sm text-text outline-none focus:border-ai';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-2">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-2.5 text-left disabled:opacity-45"
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full border p-0.5 transition-colors',
          checked ? 'border-signal-line bg-signal-soft' : 'border-line-strong bg-surface-3',
        )}
      >
        <span
          className={cn(
            'size-2.5 rounded-full transition-transform',
            checked ? 'translate-x-3 bg-signal' : 'bg-text-3',
          )}
        />
      </span>
      <span>
        <span className="block text-xs font-medium text-text">{label}</span>
        {hint ? <span className="block text-2xs leading-4 text-text-3">{hint}</span> : null}
      </span>
    </button>
  );
}
