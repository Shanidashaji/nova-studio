import { browserRecognizer, browserSynthesizer } from './browser';
import type { SpeechRecognizer, SpeechSynthesizer } from './types';

/**
 * The speech providers NOVA uses. Swap either for another implementation of the same interface
 * (a server-side recogniser such as Whisper, a neural TTS service) without changing the session
 * or the UI — see ADR-0013.
 */
export const speech: { recognizer: SpeechRecognizer; synthesizer: SpeechSynthesizer } = {
  recognizer: browserRecognizer,
  synthesizer: browserSynthesizer,
};

export type * from './types';
export { chunkForSpeech, pickVoice, toSpeakable } from './text';
export {
  MicCheckError,
  audioInputs,
  checkMicrophone,
  micEnvironmentIssue,
  micPermission,
  openMicMeter,
  watchDevices,
  watchMicPermission,
  type MicIssue,
  type MicMeter,
  type MicPermission,
} from './mic';
export { describeVoiceProblem, type VoiceProblem, type VoiceProblemCode } from './problems';
