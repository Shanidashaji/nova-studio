/**
 * Speech provider contracts (ADR-0013). The NOVA session talks to these interfaces only, so the
 * browser's Web Speech API can be swapped for a server-side recogniser or a neural TTS service
 * without touching the dashboard.
 */

export type RecognitionErrorCode =
  | 'denied' // microphone permission refused for the page
  | 'service' // the speech service itself is not allowed (browser setting or policy)
  | 'no-speech'
  /**
   * The recogniser could not capture audio. Browsers use this one code for a missing device, a
   * device in use, a driver failure and an OS block, so it does not mean "no microphone" by
   * itself — the session diagnoses it with `checkMicrophone()`.
   */
  | 'audio-capture'
  | 'no-audio' // recognition started but no audio ever arrived from the microphone
  | 'network' // the browser's recognition service could not be reached
  | 'language' // the recogniser does not support the requested language
  | 'unknown';

export interface ListenOptions {
  /** BCP-47 locale to recognise, e.g. `ml-IN`. */
  lang: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Fired once audio capture has really begun. */
  onAudioStart?: () => void;
  /** Sound (any, not only speech) started (`true`) or stopped (`false`) being detected. */
  onSound?: (on: boolean) => void;
  /** Fired when the recogniser hears speech (not just noise). */
  onSpeech?: () => void;
  /** Always fired once when the session is over, after any error. */
  onEnd: () => void;
  onError: (code: RecognitionErrorCode) => void;
}

export interface ListenSession {
  /** Stop listening and deliver what was heard. */
  stop: () => void;
  /** Stop listening and discard. */
  abort: () => void;
}

export interface SpeechRecognizer {
  readonly id: string;
  isSupported: () => boolean;
  listen: (options: ListenOptions) => ListenSession;
}

export interface VoiceOption {
  id: string;
  name: string;
  /** BCP-47 locale of the voice. */
  lang: string;
  /** Installed on the device (works offline) rather than streamed from a service. */
  local: boolean;
  /** A higher-quality neural / "natural" voice, judged from the platform's naming. */
  natural: boolean;
}

export interface SpeakOptions {
  voice: VoiceOption;
  lang: string;
  rate?: number;
  onStart: () => void;
  /** Word or sentence boundary reached — real progress events, used for mouth movement. */
  onBoundary?: () => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface Playback {
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export interface SpeechSynthesizer {
  readonly id: string;
  isSupported: () => boolean;
  voices: () => VoiceOption[];
  onVoicesChanged: (cb: () => void) => () => void;
  /** Speaks the utterances in order as one playback. */
  speak: (chunks: string[], options: SpeakOptions) => Playback;
}
