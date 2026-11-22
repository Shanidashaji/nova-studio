'use client';

/**
 * Microphone access for NOVA's voice input: permission state, device presence and the live input
 * meter, with every browser failure mapped to a specific, actionable cause.
 *
 * Two browser behaviours shape this module:
 * - Before permission is granted, `enumerateDevices()` hides devices (Chrome returns one entry with
 *   an empty id and label, other browsers may return none). An empty or anonymous list therefore
 *   never means "no microphone"; only a `getUserMedia` failure, or a labelled list after permission,
 *   can say that.
 * - Speech recognition opens the microphone itself and reports any capture failure as a generic
 *   `audio-capture` error. The session uses `checkMicrophone()` to find out what actually happened.
 */

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export type MicIssue =
  | 'insecure' // page is not a secure context, so the browser hides media devices
  | 'unsupported' // the browser has no getUserMedia
  | 'blocked' // the user (or a setting) blocked the microphone for this site
  | 'dismissed' // the permission prompt was closed without a choice
  | 'system-blocked' // the operating system denied the browser access to the microphone
  | 'policy' // a Permissions-Policy or embedding frame forbids the microphone
  | 'no-device' // the browser found no audio input device
  | 'busy' // a device exists but could not be started (in use, driver error)
  | 'disconnected' // the device went away while in use
  | 'failed'; // anything else

export class MicCheckError extends Error {
  constructor(
    readonly issue: MicIssue,
    readonly detail: string,
  ) {
    super(`${issue}: ${detail}`);
    this.name = 'MicCheckError';
  }
}

const hasMediaDevices = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Why the microphone cannot be used at all in this page, before asking for it; null if it can. */
export function micEnvironmentIssue(): MicIssue | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (window.isSecureContext === false) return 'insecure';
  if (!hasMediaDevices()) return 'unsupported';
  return null;
}

/** Current microphone permission, without prompting (Permissions API; not in every browser). */
export async function micPermission(): Promise<MicPermission> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/** Calls `cb` whenever the site's microphone permission changes (e.g. in the address-bar menu). */
export function watchMicPermission(cb: (state: MicPermission) => void): () => void {
  let status: PermissionStatus | null = null;
  let cancelled = false;
  const onChange = () => status && cb(status.state);
  navigator.permissions
    ?.query({ name: 'microphone' as PermissionName })
    .then((s) => {
      if (cancelled) return;
      status = s;
      s.addEventListener('change', onChange);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    status?.removeEventListener('change', onChange);
  };
}

export interface AudioInputs {
  /** Number of real input devices (Chrome's "default"/"communications" aliases excluded). */
  count: number;
  /**
   * Whether the list is trustworthy: labels are only exposed after permission is granted. When
   * false, `count` says nothing about whether a microphone exists.
   */
  known: boolean;
  /** Label of the default input, when known. */
  defaultLabel: string | null;
}

/** Lists audio inputs. See `AudioInputs.known` before concluding anything from the count. */
export async function audioInputs(): Promise<AudioInputs> {
  if (!navigator.mediaDevices?.enumerateDevices)
    return { count: 0, known: false, defaultLabel: null };
  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audioinput',
    );
    const known = inputs.some((d) => d.label !== '');
    const real = inputs.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
    const def = inputs.find((d) => d.deviceId === 'default') ?? real[0];
    return {
      count: real.length,
      known,
      defaultLabel: known && def ? def.label.replace(/^Default - /, '') : null,
    };
  } catch {
    return { count: 0, known: false, defaultLabel: null };
  }
}

/** Calls `cb` when audio devices are connected or disconnected. */
export function watchDevices(cb: () => void): () => void {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md?.addEventListener) return () => {};
  md.addEventListener('devicechange', cb);
  return () => md.removeEventListener('devicechange', cb);
}

/** Maps a getUserMedia rejection to its cause. Needs the permission state read after the failure. */
export function classifyMediaError(e: unknown, permissionAfter: MicPermission): MicIssue {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  const message = e instanceof Error ? e.message.toLowerCase() : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      // Chrome: "Permission denied" (site), "Permission dismissed" (prompt closed),
      // "Permission denied by system" (Windows / macOS privacy settings).
      if (message.includes('system')) return 'system-blocked';
      if (message.includes('dismiss')) return 'dismissed';
      if (permissionAfter === 'denied') return 'blocked';
      if (permissionAfter === 'prompt') return 'dismissed';
      // Granted for the site yet refused: the OS (or a browser policy) is blocking the device.
      if (permissionAfter === 'granted') return 'system-blocked';
      return 'blocked';
    case 'SecurityError':
      return window.isSecureContext === false ? 'insecure' : 'policy';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'no-device';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'busy';
    case 'TypeError':
      return window.isSecureContext === false ? 'insecure' : 'failed';
    default:
      return 'failed';
  }
}

async function getAudioStream(constraints: MediaTrackConstraints | true): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    // Processing constraints are hints, but some drivers reject them: retry with a plain request.
    if (constraints !== true && e instanceof DOMException && e.name === 'OverconstrainedError')
      return navigator.mediaDevices.getUserMedia({ audio: true });
    throw e;
  }
}

/**
 * Asks for the microphone (showing the browser's prompt when needed), confirms a device actually
 * starts, then releases it. Resolves with the device label; rejects with a `MicCheckError`.
 */
export async function checkMicrophone(): Promise<{ label: string }> {
  const env = micEnvironmentIssue();
  if (env) throw new MicCheckError(env, 'environment');
  let stream: MediaStream;
  try {
    stream = await getAudioStream(true);
  } catch (e) {
    const issue = classifyMediaError(e, await micPermission());
    throw new MicCheckError(issue, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
  const track = stream.getAudioTracks()[0];
  const label = track?.label ?? '';
  const live = track?.readyState === 'live';
  stream.getTracks().forEach((t) => t.stop());
  if (!live) throw new MicCheckError('busy', 'track ended immediately');
  return { label };
}

export interface MicMeter {
  /** Smoothed input level, 0–1, measured from the actual microphone signal. */
  level: () => number;
  close: () => void;
}

/**
 * Opens the microphone to measure the real input level for NOVA's listening animation.
 * `onEnded` fires if the device stops delivering audio (unplugged, disabled, taken over).
 */
export async function openMicMeter(onEnded?: () => void): Promise<MicMeter> {
  const env = micEnvironmentIssue();
  if (env) throw new MicCheckError(env, 'environment');
  let stream: MediaStream;
  try {
    stream = await getAudioStream({ echoCancellation: true, noiseSuppression: true });
  } catch (e) {
    throw new MicCheckError(classifyMediaError(e, await micPermission()), String(e));
  }
  let closed = false;
  const track = stream.getAudioTracks()[0];
  track?.addEventListener('ended', () => {
    if (!closed) onEnded?.();
  });
  const stop = () => {
    closed = true;
    stream.getTracks().forEach((t) => t.stop());
  };
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return { level: () => 0, close: stop };
  const ctx = new Ctx();
  void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let smoothed = 0;
  return {
    level() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / data.length);
      // Speech RMS sits roughly in 0.02–0.3; map to 0–1 with a soft knee and smooth it.
      const target = Math.min(1, Math.max(0, (rms - 0.015) * 5));
      smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.15);
      return smoothed;
    },
    close() {
      source.disconnect();
      stop();
      void ctx.close().catch(() => {});
    },
  };
}
