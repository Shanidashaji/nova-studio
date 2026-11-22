import type { RobotState } from './nova-robot';

/**
 * The robot shows what NOVA is really doing, most important first: a fresh error or listening
 * outranks thinking, thinking outranks speech, and a brief success flash outranks rest.
 */
export function deriveRobotState(s: {
  flash: 'success' | 'error' | null;
  listening: boolean;
  /** Checking the microphone or waiting on the permission prompt before listening. */
  checking?: boolean;
  busy: boolean;
  speaking: boolean;
}): RobotState {
  if (s.flash === 'error') return 'error';
  if (s.listening) return 'listening';
  if (s.checking || s.busy) return 'processing';
  if (s.speaking) return 'speaking';
  if (s.flash === 'success') return 'success';
  return 'idle';
}
