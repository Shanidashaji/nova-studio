import { baseLanguage } from '@nova/shared';
import type { VoiceOption } from './types';

/** Turns NOVA's light markdown into text that sounds right when read aloud. */
export function toSpeakable(markdown: string): string {
  return (
    markdown
      .replace(/^\s*\[lang:[^\]]*\]\s*/i, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|\s)_([^_]+)_(?=\s|[.,;:!?]|$)/g, '$1$2')
      .replace(/[#`*]/g, '')
      .replace(/\s*→\s*/g, ', ')
      .replace(/\s+·\s+/g, ', ')
      .split('\n')
      .map((line) => line.replace(/^\s*(?:-|\d+\.)\s+/, '').trim())
      .filter(Boolean)
      // List items read as separate sentences.
      .map((line) => (/[.!?।॥۔؟。！？:]$/.test(line) ? line : `${line}.`))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** Sentence terminators across scripts: Latin, Devanagari danda, Urdu/Arabic, CJK. */
const SENTENCE = /[^.!?।॥۔؟。！？]+[.!?।॥۔؟。！？]*\s*/g;

/**
 * Splits text into utterances of at most `max` characters at sentence (then word) boundaries.
 * Long single utterances are cut off silently by some browsers, and short ones let the user
 * pause and stop promptly.
 */
export function chunkForSpeech(text: string, max = 220): string[] {
  const sentences = text.match(SENTENCE) ?? [text];
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const s of sentences) {
    if ((current + s).length <= max) {
      current += s;
      continue;
    }
    push();
    if (s.length <= max) {
      current = s;
      continue;
    }
    for (const word of s.split(/(\s+)/)) {
      if ((current + word).length > max) push();
      current += word;
    }
  }
  push();
  return chunks;
}

const NATURAL = /natural|neural|online|premium|enhanced|wavenet|google/i;

/**
 * Chooses the best installed voice for a language: the user's saved choice if it fits, then the
 * exact locale, then any voice of the same language, preferring natural / neural voices.
 * Returns null when the device has no voice for the language — the caller must say so rather
 * than read the text with a voice for another language.
 */
export function pickVoice(
  voices: VoiceOption[],
  lang: string,
  preferredId?: string | null,
): VoiceOption | null {
  const base = baseLanguage(lang);
  if (!base) return null;
  const same = voices.filter((v) => baseLanguage(v.lang) === base);
  if (same.length === 0) return null;
  const preferred = preferredId ? same.find((v) => v.id === preferredId) : undefined;
  if (preferred) return preferred;
  const want = lang.toLowerCase().replace(/_/g, '-');
  const score = (v: VoiceOption) =>
    (v.lang.toLowerCase().replace(/_/g, '-') === want ? 4 : 0) + (v.natural ? 2 : 0);
  return [...same].sort((a, b) => score(b) - score(a))[0]!;
}

export const isNaturalVoiceName = (name: string) => NATURAL.test(name);
