import type { MicIssue } from './mic';
import type { RecognitionErrorCode } from './types';

/** Everything that can stop or interrupt voice input, from the microphone or the recogniser. */
export type VoiceProblemCode =
  | MicIssue
  | Exclude<RecognitionErrorCode, 'denied' | 'audio-capture'>
  | 'recognition-unsupported'
  | 'capture-failed' // the microphone works, but the recogniser could not capture from it
  | 'hidden' // listening stopped because the tab was hidden
  | 'hands-free-paused';

export interface VoiceProblem {
  code: VoiceProblemCode;
  title: string;
  message: string;
  /** Concrete steps to fix it, shown as a numbered list. */
  steps?: string[];
  /** Whether trying again can help (shows a Retry button). */
  retry: boolean;
  /** `info` is an expected outcome (silence, tab hidden), not a fault. */
  tone: 'error' | 'info';
}

type Platform = 'windows' | 'mac' | 'other';

export function detectPlatform(userAgent: string): Platform {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return 'other';
}

/** Which browser family the instructions should describe. */
export function detectBrowser(
  userAgent: string,
): 'chrome' | 'edge' | 'safari' | 'firefox' | 'other' {
  if (/Edg\//.test(userAgent)) return 'edge';
  if (/Firefox\//.test(userAgent)) return 'firefox';
  if (/Chrome\//.test(userAgent)) return 'chrome';
  if (/Safari\//.test(userAgent)) return 'safari';
  return 'other';
}

/**
 * The text NOVA shows for a voice problem. `host` is the site as the browser lists it in its
 * permission settings (e.g. `localhost:3100`).
 */
export function describeVoiceProblem(
  code: VoiceProblemCode,
  env: { userAgent: string; host: string; device?: string | null },
): VoiceProblem {
  const platform = detectPlatform(env.userAgent);
  const browser = detectBrowser(env.userAgent);
  const settings =
    browser === 'edge'
      ? 'edge://settings/content/microphone'
      : 'chrome://settings/content/microphone';
  const browserName = browser === 'edge' ? 'Edge' : browser === 'chrome' ? 'Chrome' : 'the browser';
  const device = env.device ? ` (${env.device})` : '';
  const osSteps =
    platform === 'windows'
      ? [
          'Open Windows Settings › Privacy & security › Microphone.',
          'Turn on “Microphone access” and “Let desktop apps access your microphone”.',
          'Press Retry.',
        ]
      : platform === 'mac'
        ? [
            'Open System Settings › Privacy & Security › Microphone.',
            `Turn on access for ${browserName === 'the browser' ? 'your browser' : browserName}, then restart it if asked.`,
            'Press Retry.',
          ]
        : [
            'Allow your browser to use the microphone in the system privacy settings.',
            'Press Retry.',
          ];

  switch (code) {
    case 'recognition-unsupported':
      return {
        code,
        title: 'Voice input isn’t available in this browser',
        message:
          'This browser has no speech recognition. Voice input works in Chrome, Edge and Safari — typing works everywhere.',
        retry: false,
        tone: 'error',
      };
    case 'insecure':
      return {
        code,
        title: 'Voice input needs a secure page',
        message:
          'Browsers only allow the microphone on https:// pages or on localhost. Open NOVA through https or http://localhost, or type your question.',
        retry: false,
        tone: 'error',
      };
    case 'unsupported':
      return {
        code,
        title: 'This browser can’t use the microphone',
        message: 'It does not let web pages capture audio. Use Chrome, Edge or Safari, or type.',
        retry: false,
        tone: 'error',
      };
    case 'blocked':
      return {
        code,
        title: 'Microphone is blocked for this site',
        message: `${browserName === 'the browser' ? 'The browser' : browserName} has the microphone set to “Block” for ${env.host}.`,
        steps:
          browser === 'safari'
            ? [
                'Open Safari › Settings › Websites › Microphone.',
                `Set ${env.host} to Allow.`,
                'Press Retry.',
              ]
            : browser === 'firefox'
              ? [
                  'Click the microphone icon in the address bar.',
                  'Remove the block.',
                  'Press Retry.',
                ]
              : [
                  'Click the site controls icon at the left of the address bar.',
                  'Switch Microphone on (or set it to Allow).',
                  `Or open ${settings} and move ${env.host} from “Not allowed” to “Allowed”.`,
                  'Press Retry — reload the page if the browser asks you to.',
                ],
        retry: true,
        tone: 'error',
      };
    case 'dismissed':
      return {
        code,
        title: 'Microphone permission needed',
        message:
          'The permission prompt was closed without a choice. Press Retry and choose Allow to talk to NOVA.',
        retry: true,
        tone: 'error',
      };
    case 'system-blocked':
      return {
        code,
        title: `Your computer is blocking the microphone for ${browserName}`,
        message: `This site is allowed, but the operating system denies ${browserName} access to the microphone.`,
        steps: osSteps,
        retry: true,
        tone: 'error',
      };
    case 'policy':
      return {
        code,
        title: 'This page isn’t allowed to use the microphone',
        message:
          'The page’s permissions policy (or the frame it is embedded in) forbids microphone access. Open NOVA directly, or type.',
        retry: false,
        tone: 'error',
      };
    case 'no-device':
      return {
        code,
        title: 'No microphone detected',
        message:
          'The browser found no audio input device. NOVA will notice as soon as one is connected.',
        steps: [
          'Connect a microphone or headset, or turn on the built-in one.',
          platform === 'windows'
            ? 'Check Windows Settings › System › Sound › Input shows the device and it isn’t disabled.'
            : 'Check the system sound settings list it as an input device.',
          'Press Retry.',
        ],
        retry: true,
        tone: 'error',
      };
    case 'busy':
      return {
        code,
        title: 'The microphone couldn’t be started',
        message: `A microphone${device} exists, but it did not start — another app may be using it exclusively, or its driver stopped responding.`,
        steps: [
          'Close apps that may be using it (calls, recorders, other browser tabs).',
          'Unplug and reconnect it if it is external.',
          'Press Retry.',
        ],
        retry: true,
        tone: 'error',
      };
    case 'disconnected':
      return {
        code,
        title: 'Microphone disconnected',
        message:
          'The microphone stopped delivering audio while NOVA was listening. Reconnect it, then press Retry.',
        retry: true,
        tone: 'error',
      };
    case 'capture-failed':
    case 'no-audio':
      return {
        code,
        title: 'Speech recognition couldn’t hear the microphone',
        message: `Your microphone${device} works, but ${browserName}’s speech recognition ${code === 'no-audio' ? 'received no audio from it' : 'could not capture audio from it'}.`,
        steps: [
          browser === 'chrome' || browser === 'edge'
            ? `In ${settings}, choose the microphone you want to use.`
            : 'Make sure the browser uses the microphone you want.',
          platform === 'windows'
            ? 'In Windows Settings › System › Sound › Input, set that microphone as the default device.'
            : 'Set that microphone as the system’s default input.',
          'Close other apps using the microphone, then press Retry.',
        ],
        retry: true,
        tone: 'error',
      };
    case 'service':
      return {
        code,
        title: 'Speech recognition is turned off in this browser',
        message:
          'The browser does not allow its speech recognition service on this page (a browser setting or policy). Type your question instead.',
        retry: true,
        tone: 'error',
      };
    case 'network':
      return {
        code,
        title: 'Speech service unreachable',
        message: `${browserName === 'the browser' ? 'The browser' : browserName} sends audio to its online speech service, which could not be reached. Check the connection, or type.`,
        retry: true,
        tone: 'error',
      };
    case 'language':
      return {
        code,
        title: 'Language not supported for speech',
        message:
          'This browser cannot recognise speech in the selected language. Pick another in Voice & language settings, or type.',
        retry: false,
        tone: 'error',
      };
    case 'no-speech':
      return {
        code,
        title: 'I didn’t hear anything',
        message: 'Press the microphone and speak while NOVA is listening.',
        retry: true,
        tone: 'info',
      };
    case 'hands-free-paused':
      return {
        code,
        title: 'Hands-free paused',
        message: 'I didn’t hear anything. Press the microphone to continue.',
        retry: true,
        tone: 'info',
      };
    case 'hidden':
      return {
        code,
        title: 'Listening stopped',
        message: 'NOVA stops listening when the tab is hidden. Press the microphone to continue.',
        retry: true,
        tone: 'info',
      };
    case 'failed':
    case 'unknown':
      return {
        code,
        title: 'Voice input stopped unexpectedly',
        message: 'Try again, or type your question.',
        retry: true,
        tone: 'error',
      };
  }
}
