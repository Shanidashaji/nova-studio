'use client';

import { isNaturalVoiceName } from './text';
import type {
  ListenOptions,
  ListenSession,
  Playback,
  RecognitionErrorCode,
  SpeakOptions,
  SpeechRecognizer,
  SpeechSynthesizer,
  VoiceOption,
} from './types';

// ── Recognition: Web Speech API (Chrome, Edge, Safari) ──────────────────────

/** Minimal typing for the Web Speech API recognition object (not in TypeScript's DOM lib). */
interface Recognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, RecognitionErrorCode> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'service',
  'no-speech': 'no-speech',
  // A generic capture failure — not proof that no microphone exists (see RecognitionErrorCode).
  'audio-capture': 'audio-capture',
  network: 'network',
  'language-not-supported': 'language',
};

/**
 * Chrome normally reports `audiostart` well under a second after `start()`. If no audio arrives in
 * this time the capture silently failed, and the session would otherwise sit in "Listening" forever.
 */
export const AUDIO_START_TIMEOUT_MS = 8000;

/**
 * Browser speech recognition. The Web Speech API listens in one language per session (it has no
 * automatic language identification), so the session picks the locale — see `useNovaSession`.
 * Note: Chrome and Edge send the audio to their vendor's speech service.
 */
export const browserRecognizer: SpeechRecognizer = {
  id: 'web-speech',
  isSupported: () => recognitionCtor() !== null,
  listen(o: ListenOptions): ListenSession {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      queueMicrotask(() => {
        o.onError('unknown');
        o.onEnd();
      });
      return { stop() {}, abort() {} };
    }
    const r = new Ctor();
    r.lang = o.lang;
    r.interimResults = true;
    r.continuous = false; // one utterance per session; hands-free mode starts the next one
    r.maxAlternatives = 1;
    let delivered = false;
    let failed = false;
    let ended = false;
    let latest = '';
    const fail = (code: RecognitionErrorCode) => {
      if (failed) return;
      failed = true;
      o.onError(code);
    };
    const watchdog = setTimeout(() => {
      fail('no-audio');
      r.abort();
    }, AUDIO_START_TIMEOUT_MS);
    r.onaudiostart = () => {
      clearTimeout(watchdog);
      o.onAudioStart?.();
    };
    r.onsoundstart = () => o.onSound?.(true);
    r.onsoundend = () => o.onSound?.(false);
    r.onspeechstart = () => o.onSpeech?.();
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i]![0]!.transcript;
        if (e.results[i]!.isFinal) final = true;
      }
      latest = text;
      if (final && text.trim() && !delivered) {
        delivered = true;
        o.onFinal(text.trim());
      } else if (!final) o.onInterim(text);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      fail(ERRORS[e.error] ?? 'unknown');
    };
    r.onend = () => {
      if (ended) return;
      ended = true;
      clearTimeout(watchdog);
      // Stopped mid-utterance: deliver what was recognised rather than dropping it.
      if (!delivered && !failed && latest.trim()) {
        delivered = true;
        o.onFinal(latest.trim());
      }
      o.onEnd();
    };
    try {
      r.start();
    } catch {
      // InvalidStateError: another recognition is still running in this page.
      clearTimeout(watchdog);
      queueMicrotask(() => {
        fail('unknown');
        r.onend?.();
      });
    }
    return {
      stop: () => r.stop(),
      abort: () => {
        latest = ''; // an abort discards the utterance
        r.abort();
      },
    };
  },
};

// ── Synthesis: speechSynthesis ──────────────────────────────────────────────

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

const toOption = (v: SpeechSynthesisVoice): VoiceOption => ({
  id: v.voiceURI,
  name: v.name,
  lang: v.lang,
  local: v.localService,
  natural: isNaturalVoiceName(v.name),
});

/**
 * Browser text-to-speech. Voices are whatever the OS and browser provide (Edge ships neural
 * "Natural" voices for many Indian languages; Chrome adds Google voices; Windows/macOS add their
 * own). The session reports a missing voice instead of using one for another language.
 */
export const browserSynthesizer: SpeechSynthesizer = {
  id: 'speech-synthesis',
  isSupported: () => synth() !== null,
  voices: () => synth()?.getVoices().map(toOption) ?? [],
  onVoicesChanged(cb) {
    const s = synth();
    if (!s) return () => {};
    s.addEventListener('voiceschanged', cb);
    return () => s.removeEventListener('voiceschanged', cb);
  },
  speak(chunks, o: SpeakOptions): Playback {
    const s = synth();
    const native = s?.getVoices().find((v) => v.voiceURI === o.voice.id);
    if (!s || !native) {
      queueMicrotask(() => o.onError('Voice output is not available.'));
      return { pause() {}, resume() {}, stop() {} };
    }
    s.cancel();
    const parts = chunks.filter(Boolean);
    let started = false;
    let finished = false;
    let stopped = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      o.onEnd();
    };
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.voice = native;
      u.lang = native.lang || o.lang;
      u.rate = o.rate ?? 1;
      u.onstart = () => {
        if (!started) {
          started = true;
          o.onStart();
        }
        o.onBoundary?.();
      };
      u.onboundary = () => o.onBoundary?.();
      u.onend = () => {
        if (i === parts.length - 1) finish();
      };
      u.onerror = (e) => {
        // cancel() raises "interrupted"/"canceled" on queued utterances: that is a stop, not a fault.
        if (stopped || e.error === 'interrupted' || e.error === 'canceled') return finish();
        finished = true;
        o.onError(`Voice output failed (${e.error}).`);
      };
      s.speak(u);
    });
    return {
      pause: () => s.pause(),
      resume: () => s.resume(),
      stop: () => {
        stopped = true;
        s.cancel();
        finish();
      },
    };
  },
};
