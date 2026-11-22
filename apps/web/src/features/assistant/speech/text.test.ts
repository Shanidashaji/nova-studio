import { describe, expect, it } from 'vitest';
import { chunkForSpeech, pickVoice, toSpeakable } from './text';
import type { VoiceOption } from './types';

const v = (id: string, lang: string, natural = false, local = true): VoiceOption => ({
  id,
  name: id,
  lang,
  natural,
  local,
});

describe('toSpeakable', () => {
  it('drops markdown and reads list items as sentences', () => {
    expect(
      toSpeakable('Two productions are late:\n- **Woven Light** → Edit\n- _Campus Stories_'),
    ).toBe('Two productions are late: Woven Light, Edit. Campus Stories.');
  });

  it('removes a stray language tag', () => {
    expect(toSpeakable('[lang:ml]\nഇന്ന് രണ്ട് കാര്യങ്ങൾ.')).toBe('ഇന്ന് രണ്ട് കാര്യങ്ങൾ.');
  });

  it('keeps sentence ends in other scripts', () => {
    expect(toSpeakable('- आज दो काम हैं।')).toBe('आज दो काम हैं।');
  });
});

describe('chunkForSpeech', () => {
  it('splits at sentence boundaries, including the Devanagari danda', () => {
    const chunks = chunkForSpeech('पहला वाक्य। दूसरा वाक्य। तीसरा।', 14);
    expect(chunks).toEqual(['पहला वाक्य।', 'दूसरा वाक्य।', 'तीसरा।']);
  });

  it('falls back to word boundaries for very long sentences', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkForSpeech(long, 50);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
    expect(chunks.join(' ')).toBe(long);
  });
});

describe('pickVoice', () => {
  const voices = [
    v('en-us', 'en-US'),
    v('en-in-natural', 'en-IN', true, false),
    v('ml-basic', 'ml-IN'),
    v('ml-natural', 'ml-IN', true, false),
    v('hi', 'hi_IN'),
  ];

  it('prefers the exact locale and natural voices', () => {
    expect(pickVoice(voices, 'en-IN')?.id).toBe('en-in-natural');
    expect(pickVoice(voices, 'ml-IN')?.id).toBe('ml-natural');
  });

  it('honours a saved choice for the same language only', () => {
    expect(pickVoice(voices, 'ml-IN', 'ml-basic')?.id).toBe('ml-basic');
    expect(pickVoice(voices, 'ml-IN', 'en-us')?.id).toBe('ml-natural');
  });

  it('matches by language when the region differs, and handles underscores', () => {
    expect(pickVoice(voices, 'hi-IN')?.id).toBe('hi');
  });

  it('returns null instead of a voice for another language', () => {
    expect(pickVoice(voices, 'ta-IN')).toBeNull();
  });
});
