import { describe, expect, it } from 'vitest';
import {
  baseLanguage,
  detectLanguage,
  extractReplyLanguage,
  isRtl,
  languageInfo,
  languageName,
  speechLocale,
} from './locale';

describe('detectLanguage', () => {
  it.each([
    ['ഇന്ന് എന്താണ് ശ്രദ്ധിക്കേണ്ടത്?', 'ml'],
    ['आज मुझे किस पर ध्यान देना चाहिए?', 'hi'],
    ['இன்று என்ன கவனிக்க வேண்டும்?', 'ta'],
    ['ఈ రోజు ఏమి చూడాలి?', 'te'],
    ['ಇಂದು ಏನು ಗಮನಿಸಬೇಕು?', 'kn'],
    ['আজ কী দেখতে হবে?', 'bn'],
    ['ما الذي يحتاج انتباهي اليوم؟', 'ar'],
    ['آج مجھے کس چیز پر توجہ دینی چاہیے؟', 'ur'],
    ['What needs my attention today?', 'en'],
    ['Quels projets sont en retard aujourd’hui ?', 'fr'],
    ['Welche Projekte sind heute verspätet?', 'de'],
    ['¿Qué proyectos necesito revisar hoy?', 'es'],
  ])('%s → %s', (text, code) => {
    expect(detectLanguage(text)?.code).toBe(code);
  });

  it('keeps the native language when English technical words are mixed in', () => {
    const d = detectLanguage('ഈ project-ന്റെ deadline എപ്പോഴാണ്?');
    expect(d?.code).toBe('ml');
    expect(d?.mixed).toContain('en');
  });

  it('recognises common transliterations as low-confidence hints', () => {
    const d = detectLanguage('ee project nte deadline enthanu, ningal parayu');
    expect(d?.code).toBe('ml');
    expect(d?.romanized).toBe(true);
    expect(detectLanguage('aaj kya kaam baaki hai?')?.code).toBe('hi');
  });

  it('returns null when there is nothing to judge', () => {
    expect(detectLanguage('42 ?')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });

  it('falls back to English with low confidence for bare names', () => {
    const d = detectLanguage('ZenPods v2');
    expect(d?.code).toBe('en');
    expect(d!.confidence).toBeLessThan(0.5);
  });
});

describe('language registry', () => {
  it('normalises tags', () => {
    expect(baseLanguage('ml-IN')).toBe('ml');
    expect(baseLanguage('pt_BR')).toBe('pt');
    expect(baseLanguage('not a tag')).toBeNull();
  });

  it('names languages outside the registry instead of rejecting them', () => {
    expect(languageName('ml')).toBe('Malayalam');
    expect(languageName('sw')).toBe('Swahili');
    expect(languageInfo('sw')?.code).toBe('sw');
  });

  it('knows script direction and speech locales', () => {
    expect(isRtl('ur')).toBe(true);
    expect(isRtl('ar-SA')).toBe(true);
    expect(isRtl('ml')).toBe(false);
    expect(speechLocale('ml')).toBe('ml-IN');
    expect(speechLocale('en-GB')).toBe('en-GB');
    expect(speechLocale('sw')).toBe('sw');
  });
});

describe('extractReplyLanguage', () => {
  it('strips the model’s language tag', () => {
    expect(extractReplyLanguage('[lang:ml]\nഇന്ന് രണ്ട് കാര്യങ്ങൾ.')).toEqual({
      content: 'ഇന്ന് രണ്ട് കാര്യങ്ങൾ.',
      language: 'ml',
      source: 'model',
    });
    expect(extractReplyLanguage('[lang: pt-BR] Olá').language).toBe('pt-BR');
  });

  it('detects the language when the tag is missing', () => {
    const r = extractReplyLanguage('आज दो प्रोडक्शन देर से चल रहे हैं।');
    expect(r).toMatchObject({ language: 'hi', source: 'detected' });
    expect(r.content).toContain('प्रोडक्शन');
  });
});
