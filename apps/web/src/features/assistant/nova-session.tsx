'use client';

import {
  baseLanguage,
  detectLanguage,
  languageName,
  speechLocale,
  type AssistantHistoryItem,
  type AssistantProposal,
  type AssistantReference,
  type AssistantReply,
} from '@nova/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useCan } from '@/features/shell/user-context';
import { api, ApiRequestError } from '@/lib/api';
import { useAssistantHistory } from '@/lib/queries';
import { useStoredFlag, useStoredString } from '@/lib/use-stored-flag';
import { useWorkspace } from '@/store/workspace';
import { useNovaComposer } from './composer-store';
import type { RobotState } from './robot/nova-robot';
import { deriveRobotState } from './robot/state';
import {
  audioInputs,
  checkMicrophone,
  chunkForSpeech,
  describeVoiceProblem,
  MicCheckError,
  micEnvironmentIssue,
  micPermission,
  openMicMeter,
  pickVoice,
  speech,
  toSpeakable,
  watchDevices,
  watchMicPermission,
  type ListenSession,
  type MicMeter,
  type MicPermission,
  type Playback,
  type RecognitionErrorCode,
  type VoiceOption,
  type VoiceProblem,
  type VoiceProblemCode,
} from './speech';

export interface NovaMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  references: AssistantReference[];
  proposals: AssistantProposal[];
  suggestions?: string[];
  /** BCP-47 language of the content, when known. */
  language?: string | null;
  channel?: 'text' | 'voice';
  pending?: boolean;
  error?: boolean;
}

type SpeakOutcome = 'finished' | 'interrupted' | 'unavailable';

/** `always`: read every reply aloud. `voice`: only replies to spoken messages. */
export type SpeakMode = 'always' | 'voice';

/** What NOVA's voice interaction is doing right now, for the UI. */
export type VoiceState =
  | 'idle'
  | 'checking' // checking the microphone (permission, device) before listening
  | 'permission' // waiting for the user to answer the browser's microphone prompt
  | 'listening'
  | 'processing' // NOVA is answering
  | 'speaking'
  | 'error'; // a voice problem needs the user's attention (see `voiceProblem`)

interface NovaSession {
  enabled: boolean;
  messages: NovaMessage[];
  historyPending: boolean;
  busy: boolean;
  send: (text: string, channel?: 'text' | 'voice') => Promise<void>;
  updateProposal: (p: AssistantProposal) => void;

  robot: RobotState;
  /** Real signal for the robot: microphone level while listening, speech progress while speaking. */
  getLevel: () => number;
  flash: (kind: 'success' | 'error') => void;

  recognitionSupported: boolean;
  voiceState: VoiceState;
  listening: boolean;
  interim: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  /** Why voice input stopped or cannot start, with steps to fix it; null when all is well. */
  voiceProblem: VoiceProblem | null;
  dismissVoiceProblem: () => void;
  /** Checks microphone permission and device without listening; reports the result. */
  checkMic: () => Promise<void>;
  micPermission: MicPermission;
  /** Label of the microphone in use, once permission reveals it. */
  micDevice: string | null;
  /** Recognised text waiting for the user to review and send (when auto-send is off). */
  voiceDraft: { id: number; text: string } | null;
  clearVoiceDraft: () => void;
  /** Send recognised speech straight away (on) or put it in the box to review (off). */
  autoSendVoice: boolean;
  setAutoSendVoice: (v: boolean) => void;
  /** Locale the next voice session listens in. */
  listenLocale: string;

  synthesisSupported: boolean;
  speaking: boolean;
  paused: boolean;
  speakingLanguage: string | null;
  pause: () => void;
  resume: () => void;
  stopSpeaking: () => void;
  speakMessage: (m: NovaMessage) => void;
  voiceNotice: string | null;
  dismissVoiceNotice: () => void;

  /** Language of the conversation so far (latest known), e.g. `ml`. */
  conversationLanguage: string | null;
  speakMode: SpeakMode;
  setSpeakMode: (m: SpeakMode) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
  /** `auto` (follow the conversation) or an explicit BCP-47 locale. */
  speechLang: string;
  setSpeechLang: (tag: string) => void;
  voices: VoiceOption[];
  voiceFor: (lang: string) => VoiceOption | null;
  setPreferredVoice: (lang: string, voiceId: string | null) => void;
}

const Ctx = createContext<NovaSession | null>(null);

export function useNovaSession(): NovaSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNovaSession must be used inside <NovaSessionProvider>');
  return ctx;
}

const noopSubscribe = () => () => {};

/** Short pause before retrying a recognition whose audio capture failed. */
const CAPTURE_RETRY_MS = 300;

/**
 * One NOVA conversation for the whole workspace: messages, the request lifecycle, voice input and
 * output, hands-free mode and the robot's state. Mounted once, so the floating companion and the
 * panel show the same live state and a conversation survives the panel being minimised.
 */
export function NovaSessionProvider({ children }: { children: React.ReactNode }) {
  const enabled = useCan('assistant:use');
  const history = useAssistantHistory(enabled);
  const lens = useWorkspace((s) => s.lens);
  const focus = useWorkspace((s) => s.focus);
  const top = useWorkspace((s) => s.stack.at(-1));
  const showNova = useWorkspace((s) => s.showNova);

  // ── Conversation ──────────────────────────────────────────────────────────
  const [local, setLocal] = useState<NovaMessage[]>([]);
  const [overrides, setOverrides] = useState<Record<string, AssistantProposal>>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const messages = useMemo<NovaMessage[]>(
    () =>
      [
        ...(history.data ?? []).map((h: AssistantHistoryItem) => ({
          ...h,
          language: h.language?.code ?? null,
        })),
        ...local,
      ].map((m) => ({ ...m, proposals: m.proposals.map((p) => overrides[p.id] ?? p) })),
    [history.data, local, overrides],
  );

  const latestWithLanguage = messages.findLast((m) => !m.pending && !m.error && m.language);
  const conversationLanguage = baseLanguage(latestWithLanguage?.language);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [speakModeRaw, setSpeakModeRaw] = useStoredString('nova-speak-mode', 'voice');
  const speakMode: SpeakMode = speakModeRaw === 'always' ? 'always' : 'voice';
  const [muted, setMuted] = useStoredFlag('nova-muted');
  const [handsFree, setHandsFreeStored] = useStoredFlag('nova-hands-free');
  const [speechLang, setSpeechLang] = useStoredString('nova-speech-lang', 'auto');
  const [voicePrefsRaw, setVoicePrefsRaw] = useStoredString('nova-voices', '{}');
  const voicePrefs = useMemo<Record<string, string>>(() => {
    try {
      return JSON.parse(voicePrefsRaw) as Record<string, string>;
    } catch {
      return {};
    }
  }, [voicePrefsRaw]);

  const browserLocale = useSyncExternalStore(
    noopSubscribe,
    () => navigator.language || 'en-IN',
    () => 'en-IN',
  );
  const listenLocale =
    speechLang !== 'auto'
      ? speechLang
      : conversationLanguage
        ? speechLocale(conversationLanguage)
        : browserLocale;

  // ── Robot flash (success / error) ─────────────────────────────────────────
  const [flashKind, setFlashKind] = useState<'success' | 'error' | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((kind: 'success' | 'error') => {
    clearTimeout(flashTimer.current);
    setFlashKind(kind);
    flashTimer.current = setTimeout(() => setFlashKind(null), kind === 'error' ? 3200 : 1400);
  }, []);

  // ── Voice output ──────────────────────────────────────────────────────────
  const synthesisSupported = useSyncExternalStore(
    noopSubscribe,
    () => speech.synthesizer.isSupported(),
    () => false,
  );
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  useEffect(() => {
    if (!synthesisSupported) return;
    const load = () => setVoices(speech.synthesizer.voices());
    load();
    return speech.synthesizer.onVoicesChanged(load);
  }, [synthesisSupported]);

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speakingLanguage, setSpeakingLanguage] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const playback = useRef<Playback | null>(null);
  const speakingRef = useRef(false);
  const pausedRef = useRef(false);
  const lastBoundary = useRef(0);
  const sawBoundary = useRef(false);

  const voiceFor = useCallback(
    (lang: string) => pickVoice(voices, speechLocale(lang), voicePrefs[baseLanguage(lang) ?? '']),
    [voices, voicePrefs],
  );

  const setPreferredVoice = useCallback(
    (lang: string, voiceId: string | null) => {
      const key = baseLanguage(lang);
      if (!key) return;
      const next = { ...voicePrefs };
      if (voiceId) next[key] = voiceId;
      else delete next[key];
      setVoicePrefsRaw(JSON.stringify(next));
    },
    [setVoicePrefsRaw, voicePrefs],
  );

  const stopSpeaking = useCallback(() => {
    playback.current?.stop();
    playback.current = null;
  }, []);

  /** Speaks text in `lang`; resolves with how playback ended. */
  const speakText = useCallback(
    (text: string, lang: string): Promise<SpeakOutcome> =>
      new Promise((resolve) => {
        if (!synthesisSupported) return resolve('unavailable');
        const voice = voiceFor(lang);
        if (!voice) {
          setVoiceNotice(
            `No ${languageName(lang) ?? lang} voice is installed on this device, so this reply is shown as text only. Voices come from your browser and operating system (Edge includes many natural Indian-language voices).`,
          );
          return resolve('unavailable');
        }
        const chunks = chunkForSpeech(toSpeakable(text));
        if (chunks.length === 0) return resolve('unavailable');
        playback.current?.stop();
        setVoiceNotice(null);
        sawBoundary.current = false;
        let settled = false;
        const done = (outcome: SpeakOutcome) => {
          if (settled) return;
          settled = true;
          speakingRef.current = false;
          pausedRef.current = false;
          setSpeaking(false);
          setPaused(false);
          setSpeakingLanguage(null);
          resolve(outcome);
        };
        let interrupted = false;
        const pb = speech.synthesizer.speak(chunks, {
          voice,
          lang: speechLocale(lang),
          onStart: () => {
            speakingRef.current = true;
            setSpeaking(true);
            setSpeakingLanguage(baseLanguage(voice.lang));
          },
          onBoundary: () => {
            sawBoundary.current = true;
            lastBoundary.current = performance.now();
          },
          onEnd: () => done(interrupted ? 'interrupted' : 'finished'),
          onError: (message) => {
            setVoiceNotice(message);
            flash('error');
            done('unavailable');
          },
        });
        playback.current = {
          pause: pb.pause,
          resume: pb.resume,
          stop: () => {
            interrupted = true;
            pb.stop();
          },
        };
      }),
    [flash, synthesisSupported, voiceFor],
  );

  const pause = useCallback(() => {
    playback.current?.pause();
    pausedRef.current = true;
    setPaused(true);
  }, []);
  const resume = useCallback(() => {
    playback.current?.resume();
    pausedRef.current = false;
    setPaused(false);
  }, []);

  // ── Voice input ───────────────────────────────────────────────────────────
  const recognitionSupported = useSyncExternalStore(
    noopSubscribe,
    () => speech.recognizer.isSupported(),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  /** Microphone preflight: `checking` the device, or waiting on the browser's `permission` prompt. */
  const [micPhase, setMicPhase] = useState<'idle' | 'checking' | 'permission'>('idle');
  const [voiceProblem, setVoiceProblem] = useState<VoiceProblem | null>(null);
  const [micPerm, setMicPerm] = useState<MicPermission>('unknown');
  const [micDevice, setMicDevice] = useState<string | null>(null);
  const [voiceDraft, setVoiceDraft] = useState<{ id: number; text: string } | null>(null);
  const [autoSendVoice, setAutoSendVoice] = useStoredString('nova-voice-auto-send', '1');
  const autoSend = autoSendVoice !== '0';

  const listenSession = useRef<ListenSession | null>(null);
  const meter = useRef<MicMeter | null>(null);
  /** Hearing sound right now, per the recogniser — activity signal when no meter is open. */
  const hearing = useRef(false);
  /** Set when the meter and recognition could not share the microphone; later sessions skip it. */
  const meterConflict = useRef(false);
  /** A start is in progress (permission prompt, device check); `cancelStart` aborts it. */
  const starting = useRef(false);
  const cancelStart = useRef(false);
  /** Why the current session is being ended by NOVA, when it is not the recogniser's own end. */
  const endReason = useRef<'hidden' | 'disconnected' | null>(null);
  const handsFreeRef = useRef(handsFree);
  const listenLocaleRef = useRef(listenLocale);
  const autoSendRef = useRef(autoSend);
  const micDeviceRef = useRef(micDevice);
  useEffect(() => {
    handsFreeRef.current = handsFree;
    listenLocaleRef.current = listenLocale;
    autoSendRef.current = autoSend;
    micDeviceRef.current = micDevice;
  });

  const sendRef = useRef<(text: string, channel?: 'text' | 'voice') => Promise<void>>(
    async () => {},
  );

  const report = useCallback(
    (code: VoiceProblemCode) => {
      const problem = describeVoiceProblem(code, {
        userAgent: navigator.userAgent,
        host: location.host,
        device: micDeviceRef.current,
      });
      setVoiceProblem(problem);
      if (problem.tone === 'error') flash('error');
    },
    [flash],
  );

  const closeMeter = () => {
    meter.current?.close();
    meter.current = null;
  };

  /** Recognised text: send it, or hand it to the composer for review. */
  const deliver = useCallback(
    (text: string) => {
      if (autoSendRef.current || handsFreeRef.current) void sendRef.current(text, 'voice');
      else {
        setVoiceDraft({ id: Date.now(), text });
        showNova();
      }
    },
    [showNova],
  );

  const diagnoseRef = useRef<
    (
      failure: 'audio-capture' | 'no-audio',
      attempt: number,
      gotAudio: boolean,
      meterWasOpen: boolean,
    ) => Promise<void>
  >(async () => {});

  /** Runs one recognition session. `attempt` > 0 is the automatic retry after a capture failure. */
  const beginRecognition = useCallback(
    (attempt: number) => {
      const locale = listenLocaleRef.current;
      let heardFinal = false;
      let gotAudio = false;
      let failure: RecognitionErrorCode | null = null;
      let meterOpenAtFailure = false;
      endReason.current = null;
      setListening(true);
      setInterim('');
      const session = speech.recognizer.listen({
        lang: locale,
        onAudioStart: () => {
          gotAudio = true;
          if (meterConflict.current) return;
          // The level meter opens only once recognition owns the microphone, so it can never
          // stand in the recogniser's way; if it cannot open, the animation uses sound events.
          void openMicMeter(() => {
            endReason.current = 'disconnected';
            listenSession.current?.abort();
          })
            .then((m) => {
              if (listenSession.current === session) meter.current = m;
              else m.close();
            })
            .catch(() => {});
        },
        onSound: (on) => {
          hearing.current = on;
        },
        onInterim: setInterim,
        onFinal: (text) => {
          heardFinal = true;
          setInterim(text);
          deliver(text);
        },
        onError: (code) => {
          failure = code;
          meterOpenAtFailure = meter.current !== null;
        },
        onEnd: () => {
          if (listenSession.current === session) listenSession.current = null;
          closeMeter();
          hearing.current = false;
          setListening(false);
          setInterim('');
          if (heardFinal) return;
          const reason = endReason.current;
          endReason.current = null;
          if (reason) return report(reason);
          if (failure === 'audio-capture' || failure === 'no-audio') {
            void diagnoseRef.current(failure, attempt, gotAudio, meterOpenAtFailure);
            return;
          }
          if (failure === 'denied') {
            void micPermission().then((p) => {
              setMicPerm(p);
              report(p === 'denied' ? 'blocked' : p === 'prompt' ? 'dismissed' : 'service');
            });
            return;
          }
          if (failure && failure !== 'no-speech') report(failure);
          // Silence ends a hands-free conversation rather than listening forever.
          else if (handsFreeRef.current) report('hands-free-paused');
          else if (failure === 'no-speech') report('no-speech');
        },
      });
      listenSession.current = session;
    },
    [deliver, report],
  );

  /**
   * Recognition reported a capture failure. Find out whether the microphone itself works: if it
   * does, retry once (without the level meter if it was open); if not, report the real cause.
   */
  const diagnose = useCallback(
    async (
      failure: 'audio-capture' | 'no-audio',
      attempt: number,
      gotAudio: boolean,
      meterWasOpen: boolean,
    ) => {
      setMicPhase('checking');
      try {
        const { label } = await checkMicrophone();
        if (label) setMicDevice(label);
        if (attempt === 0 && failure === 'audio-capture') {
          if (meterWasOpen) meterConflict.current = true;
          await new Promise((r) => setTimeout(r, CAPTURE_RETRY_MS));
          setMicPhase('idle');
          if (!cancelStart.current && !listenSession.current) beginRecognition(attempt + 1);
          return;
        }
        report(failure === 'no-audio' ? 'no-audio' : 'capture-failed');
      } catch (e) {
        const issue = e instanceof MicCheckError ? e.issue : 'failed';
        report(issue === 'no-device' && gotAudio ? 'disconnected' : issue);
      } finally {
        setMicPhase('idle');
      }
    },
    [beginRecognition, report],
  );
  useEffect(() => {
    diagnoseRef.current = diagnose;
  }, [diagnose]);

  const startListening = useCallback(async () => {
    if (listenSession.current || starting.current || busyRef.current) return;
    stopSpeaking(); // pressing the microphone interrupts NOVA
    setVoiceNotice(null);
    setVoiceProblem(null);
    if (!recognitionSupported) return report('recognition-unsupported');
    const env = micEnvironmentIssue();
    if (env) return report(env);
    starting.current = true;
    cancelStart.current = false;
    setMicPhase('checking');
    try {
      const perm = await micPermission();
      setMicPerm(perm);
      if (perm === 'denied') return report('blocked');
      if (perm !== 'granted') {
        // Ask with getUserMedia rather than letting recognition prompt: its rejection says
        // whether the user blocked, dismissed or has no device, which recognition cannot.
        setMicPhase('permission');
        const { label } = await checkMicrophone();
        if (label) setMicDevice(label);
        setMicPerm(await micPermission());
      }
    } catch (e) {
      return report(e instanceof MicCheckError ? e.issue : 'failed');
    } finally {
      starting.current = false;
      setMicPhase('idle');
    }
    if (cancelStart.current || busyRef.current) return;
    beginRecognition(0);
  }, [beginRecognition, recognitionSupported, report, stopSpeaking]);

  const stopListening = useCallback(() => {
    if (starting.current) cancelStart.current = true;
    listenSession.current?.stop();
  }, []);

  const abortListening = useCallback(() => {
    if (starting.current) cancelStart.current = true;
    listenSession.current?.abort();
  }, []);

  /** Refreshes what NOVA knows about the microphone (permission, device) without listening. */
  const refreshMic = useCallback(async () => {
    const [perm, inputs] = await Promise.all([micPermission(), audioInputs()]);
    setMicPerm(perm);
    if (inputs.known) setMicDevice(inputs.defaultLabel);
    return { perm, inputs };
  }, []);

  const checkMic = useCallback(async () => {
    if (listenSession.current || starting.current) return;
    setVoiceProblem(null);
    setVoiceNotice(null);
    const env = micEnvironmentIssue();
    if (env) return report(env);
    starting.current = true;
    setMicPhase((await micPermission()) === 'granted' ? 'checking' : 'permission');
    try {
      const { label } = await checkMicrophone();
      if (label) setMicDevice(label);
      await refreshMic();
      setVoiceNotice(
        `Microphone ready${label ? `: ${label}` : ''}.${recognitionSupported ? ' Press the microphone to talk.' : ''}`,
      );
    } catch (e) {
      report(e instanceof MicCheckError ? e.issue : 'failed');
    } finally {
      starting.current = false;
      setMicPhase('idle');
    }
  }, [recognitionSupported, refreshMic, report]);

  // Permission changes made in the browser UI (address-bar menu, settings page) apply live.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;
    const initial = setTimeout(() => void refreshMic());
    const unwatch = watchMicPermission((state) => {
      setMicPerm(state);
      if (state === 'denied' && listenSession.current) {
        listenSession.current.abort();
        report('blocked');
      }
      if (state === 'granted') {
        void refreshMic();
        setVoiceProblem((p) => (p && (p.code === 'blocked' || p.code === 'dismissed') ? null : p));
      }
    });
    return () => {
      clearTimeout(initial);
      unwatch();
    };
  }, [refreshMic, report]);

  // Devices connected or disconnected: notice a new microphone, and stop if the one in use left.
  useEffect(
    () =>
      watchDevices(() => {
        void refreshMic().then(({ inputs }) => {
          if (!inputs.known) return;
          if (inputs.count === 0 && listenSession.current) {
            endReason.current = 'disconnected';
            listenSession.current.abort();
            return;
          }
          if (inputs.count > 0) {
            setVoiceProblem((p) => {
              if (p && (p.code === 'no-device' || p.code === 'disconnected')) {
                setVoiceNotice(
                  `Microphone connected${inputs.defaultLabel ? `: ${inputs.defaultLabel}` : ''}. Press the microphone to talk.`,
                );
                return null;
              }
              return p;
            });
          }
        });
      }),
    [refreshMic],
  );

  // A hidden tab stops listening, so the microphone is never left open in the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && listenSession.current) {
        endReason.current = 'hidden';
        listenSession.current.abort();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ── Sending ───────────────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string, channel: 'text' | 'voice' = 'text') => {
      const message = text.trim();
      if (!message || busyRef.current) return;
      stopSpeaking();
      busyRef.current = true;
      setBusy(true);
      setVoiceProblem(null);
      setVoiceDraft(null);
      const tempId = `local-${Date.now()}`;
      setLocal((m) => [
        ...m,
        {
          id: `${tempId}-u`,
          role: 'USER',
          content: message,
          references: [],
          proposals: [],
          channel,
          language: detectLanguage(message)?.code ?? null,
        },
        {
          id: tempId,
          role: 'ASSISTANT',
          content: '',
          references: [],
          proposals: [],
          pending: true,
        },
      ]);
      let reply: AssistantReply | null = null;
      try {
        reply = await api<AssistantReply>('/assistant/messages', {
          method: 'POST',
          body: {
            message,
            channel,
            ...(channel === 'voice' ? { speechLanguage: listenLocaleRef.current } : {}),
            context: {
              lens,
              focus: focus ? { type: focus.type, id: focus.id } : null,
              inspect: top && top.type !== 'workflows' ? { type: top.type, id: top.id } : null,
            },
          },
        });
        const r = reply;
        setLocal((m) =>
          m.map((x) =>
            x.id === tempId
              ? { ...r, role: 'ASSISTANT', language: r.language?.code ?? null }
              : x.id === `${tempId}-u` && r.userLanguage
                ? { ...x, language: r.userLanguage.code }
                : x,
          ),
        );
      } catch (e) {
        const msg =
          e instanceof ApiRequestError && e.code === 'RATE_LIMITED'
            ? 'Too many questions in a minute — wait a moment.'
            : e instanceof Error
              ? e.message
              : 'NOVA could not answer.';
        setLocal((m) =>
          m.map((x) => (x.id === tempId ? { ...x, content: msg, pending: false, error: true } : x)),
        );
        flash('error');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      if (!reply) return;

      const continueHandsFree = channel === 'voice' && handsFreeRef.current;
      const wantsVoice = !muted && (speakMode === 'always' || channel === 'voice');
      const lang =
        reply.language?.code ?? detectLanguage(reply.content)?.code ?? conversationLanguage ?? 'en';
      let outcome: SpeakOutcome = 'unavailable';
      if (wantsVoice) outcome = await speakText(reply.content, lang);
      else flash('success');
      // Hands-free: listen for the next turn once NOVA has finished (an interruption by the user
      // — Stop, Esc, the microphone — ends the loop instead).
      if (continueHandsFree && outcome !== 'interrupted')
        setTimeout(() => void startListening(), 350);
    },
    [
      conversationLanguage,
      flash,
      focus,
      lens,
      muted,
      speakMode,
      speakText,
      startListening,
      stopSpeaking,
      top,
    ],
  );
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const speakMessage = useCallback(
    (m: NovaMessage) => {
      abortListening();
      void speakText(m.content, m.language ?? detectLanguage(m.content)?.code ?? 'en');
    },
    [abortListening, speakText],
  );

  const setHandsFree = useCallback(
    (v: boolean) => {
      setHandsFreeStored(v);
      if (!v) abortListening();
    },
    [abortListening, setHandsFreeStored],
  );

  const updateProposal = useCallback(
    (p: AssistantProposal) => {
      setOverrides((o) => ({ ...o, [p.id]: p }));
      if (p.status === 'CONFIRMED') flash('success');
      if (p.status === 'FAILED') flash('error');
    },
    [flash],
  );

  // Questions handed over from the command palette (or anywhere else in the workspace).
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (!useNovaComposer.getState().pending) return;
      const text = useNovaComposer.getState().take();
      if (text) void send(text);
    };
    const unsubscribe = useNovaComposer.subscribe(run);
    const timer = setTimeout(run, 0);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [enabled, send]);

  // Esc interrupts NOVA (speech first, then listening) unless a dialog wants it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      if (speakingRef.current) {
        e.stopPropagation();
        stopSpeaking();
      } else if (listenSession.current) {
        e.stopPropagation();
        abortListening();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [abortListening, stopSpeaking]);

  // Leaving the workspace stops the microphone and any speech.
  useEffect(
    () => () => {
      listenSession.current?.abort();
      meter.current?.close();
      playback.current?.stop();
      clearTimeout(flashTimer.current);
    },
    [],
  );

  const getLevel = useCallback(() => {
    if (meter.current) return meter.current.level();
    if (listenSession.current) {
      // No level meter (it could not share the microphone): follow the recogniser's own
      // sound-detection events, so the animation still reflects real input.
      if (!hearing.current) return 0.05;
      const t = performance.now();
      return 0.35 + 0.25 * Math.abs(Math.sin(t / 110) * Math.sin(t / 270));
    }
    if (!speakingRef.current || pausedRef.current) return 0;
    const now = performance.now();
    // With word-boundary events (most local voices) the mouth follows the words; network voices
    // send none, so the mouth moves generically — but only while audio is actually playing.
    if (sawBoundary.current) return Math.max(0.12, Math.exp(-(now - lastBoundary.current) / 170));
    return 0.4 + 0.35 * Math.sin(now / 85) * Math.sin(now / 230);
  }, []);

  const checking = micPhase !== 'idle';
  const robot = deriveRobotState({ flash: flashKind, listening, checking, busy, speaking });
  const voiceState: VoiceState =
    micPhase === 'checking'
      ? 'checking'
      : micPhase === 'permission'
        ? 'permission'
        : listening
          ? 'listening'
          : busy
            ? 'processing'
            : speaking
              ? 'speaking'
              : voiceProblem?.tone === 'error'
                ? 'error'
                : 'idle';

  const value: NovaSession = {
    enabled,
    messages,
    historyPending: history.isPending,
    busy,
    send,
    updateProposal,
    robot,
    getLevel,
    flash,
    recognitionSupported,
    voiceState,
    listening,
    interim,
    startListening,
    stopListening,
    voiceProblem,
    dismissVoiceProblem: () => setVoiceProblem(null),
    checkMic,
    micPermission: micPerm,
    micDevice,
    voiceDraft,
    clearVoiceDraft: () => setVoiceDraft(null),
    autoSendVoice: autoSend,
    setAutoSendVoice: (v) => setAutoSendVoice(v ? '1' : '0'),
    listenLocale,
    synthesisSupported,
    speaking,
    paused,
    speakingLanguage,
    pause,
    resume,
    stopSpeaking,
    speakMessage,
    voiceNotice,
    dismissVoiceNotice: () => setVoiceNotice(null),
    conversationLanguage,
    speakMode,
    setSpeakMode: setSpeakModeRaw,
    muted,
    setMuted: (m) => {
      if (m) stopSpeaking();
      setMuted(m);
    },
    handsFree,
    setHandsFree,
    speechLang,
    setSpeechLang,
    voices,
    voiceFor,
    setPreferredVoice,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
