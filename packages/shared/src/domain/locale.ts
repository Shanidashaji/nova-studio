/**
 * Spoken / written language support for NOVA (ADR-0013).
 *
 * The language model (Claude) is the multilingual system: it understands mixed-language input and
 * chooses the reply language itself. This module only does the deterministic parts around it:
 *
 * - a registry of well-known languages with their speech locales (for recognition and voices),
 * - a script-based language *hint* for typed or transcribed text (demo mode, voice fallback),
 * - parsing of the reply-language tag the model is asked to emit.
 *
 * Nothing here restricts NOVA to the listed languages: any BCP-47 tag the model returns is accepted
 * and named through `Intl.DisplayNames` where the registry has no entry.
 */

export interface LanguageInfo {
  /** BCP-47 primary language subtag, lower case (`ml`, `hi`, `en`). */
  code: string;
  /** English name. */
  name: string;
  /** Name in the language itself, for pickers. */
  native: string;
  /** Default locale for speech recognition and voice selection. */
  speech: string;
  rtl?: boolean;
}

/** Languages NOVA's interface knows by name. The list is a convenience, not a limit. */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', name: 'English', native: 'English', speech: 'en-IN' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', speech: 'ml-IN' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', speech: 'te-IN' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', speech: 'kn-IN' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', speech: 'mr-IN' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', speech: 'gu-IN' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', speech: 'pa-IN' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', speech: 'or-IN' },
  { code: 'ur', name: 'Urdu', native: 'اردو', speech: 'ur-IN', rtl: true },
  { code: 'ar', name: 'Arabic', native: 'العربية', speech: 'ar-SA', rtl: true },
  { code: 'fa', name: 'Persian', native: 'فارسی', speech: 'fa-IR', rtl: true },
  { code: 'he', name: 'Hebrew', native: 'עברית', speech: 'he-IL', rtl: true },
  { code: 'fr', name: 'French', native: 'Français', speech: 'fr-FR' },
  { code: 'de', name: 'German', native: 'Deutsch', speech: 'de-DE' },
  { code: 'es', name: 'Spanish', native: 'Español', speech: 'es-ES' },
  { code: 'pt', name: 'Portuguese', native: 'Português', speech: 'pt-BR' },
  { code: 'it', name: 'Italian', native: 'Italiano', speech: 'it-IT' },
  { code: 'ru', name: 'Russian', native: 'Русский', speech: 'ru-RU' },
  { code: 'zh', name: 'Chinese', native: '中文', speech: 'zh-CN' },
  { code: 'ja', name: 'Japanese', native: '日本語', speech: 'ja-JP' },
  { code: 'ko', name: 'Korean', native: '한국어', speech: 'ko-KR' },
  { code: 'th', name: 'Thai', native: 'ไทย', speech: 'th-TH' },
  { code: 'si', name: 'Sinhala', native: 'සිංහල', speech: 'si-LK' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', speech: 'el-GR' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
const TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

/** `ml-IN` → `ml`; returns null for anything that is not a plausible BCP-47 tag. */
export function baseLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const t = tag.trim().replace(/_/g, '-');
  if (!TAG.test(t)) return null;
  return t.split('-')[0]!.toLowerCase();
}

export function languageInfo(tag: string | null | undefined): LanguageInfo | null {
  const code = baseLanguage(tag);
  if (!code) return null;
  const known = BY_CODE.get(code);
  if (known) return known;
  // Not in the registry: still a valid language, named by the runtime's CLDR data.
  let name = code;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    /* older runtime without DisplayNames */
  }
  let native = name;
  try {
    native = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? name;
  } catch {
    /* unknown locale data */
  }
  return { code, name, native, speech: tag!.trim(), rtl: RTL.has(code) };
}

const RTL = new Set(['ar', 'ur', 'fa', 'he', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);

export const languageName = (tag: string | null | undefined) => languageInfo(tag)?.name ?? null;
export const isRtl = (tag: string | null | undefined) => {
  const code = baseLanguage(tag);
  return code ? RTL.has(code) : false;
};

/** Speech locale for a language: a full tag is kept (`en-GB`), a bare code gets its default. */
export function speechLocale(tag: string): string {
  const t = tag.trim().replace(/_/g, '-');
  if (t.includes('-')) return t;
  return BY_CODE.get(t.toLowerCase())?.speech ?? t;
}

// ── Detection (a hint, not the multilingual system) ─────────────────────────

export interface DetectedLanguage {
  /** Dominant language code. */
  code: string;
  /** 0–1: share of the text's letters that support the guess. */
  confidence: number;
  /** Other languages present in meaningful amounts (code-switching), dominant first. */
  mixed: string[];
  /** True when the language was recognised in Latin transliteration (e.g. "Manglish"). */
  romanized?: boolean;
}

/** Unicode script ranges that identify one language (or a language family's usual default). */
const SCRIPTS: { code: string; re: RegExp }[] = [
  { code: 'ml', re: /\p{Script=Malayalam}/u },
  { code: 'ta', re: /\p{Script=Tamil}/u },
  { code: 'te', re: /\p{Script=Telugu}/u },
  { code: 'kn', re: /\p{Script=Kannada}/u },
  { code: 'bn', re: /\p{Script=Bengali}/u },
  { code: 'hi', re: /\p{Script=Devanagari}/u }, // Hindi by default (also Marathi, Nepali)
  { code: 'pa', re: /\p{Script=Gurmukhi}/u },
  { code: 'gu', re: /\p{Script=Gujarati}/u },
  { code: 'or', re: /\p{Script=Oriya}/u },
  { code: 'si', re: /\p{Script=Sinhala}/u },
  { code: 'ar', re: /\p{Script=Arabic}/u }, // refined to Urdu / Persian below
  { code: 'he', re: /\p{Script=Hebrew}/u },
  { code: 'ru', re: /\p{Script=Cyrillic}/u },
  { code: 'el', re: /\p{Script=Greek}/u },
  { code: 'th', re: /\p{Script=Thai}/u },
  { code: 'ko', re: /\p{Script=Hangul}/u },
  { code: 'ja', re: /\p{Script=Hiragana}|\p{Script=Katakana}/u },
  { code: 'zh', re: /\p{Script=Han}/u },
];

/** Letters only Urdu uses within the Arabic script; Persian has its own markers. */
const URDU = /[ٹڈڑںےھہ]/; // ٹ ڈ ڑ ں ے ھ ہ
const PERSIAN = /[پچژگیک]/; // پ چ ژ گ ی ک

/** Frequent function words for Latin-script languages, including common transliterations. */
const LATIN_WORDS: Record<string, { words: string[]; romanized?: true }> = {
  en: {
    words:
      'the a an is are was what which who how show me my of to and in on for with this that it do does need today please can'.split(
        ' ',
      ),
  },
  fr: {
    words:
      'le la les un une des est sont quel quelle quels qui comment montre moi mon de et dans pour avec ce cette aujourd hui besoin'.split(
        ' ',
      ),
  },
  de: {
    words:
      'der die das ein eine ist sind was welche wer wie zeig mir mein von und in für mit dieser heute brauche bitte nicht'.split(
        ' ',
      ),
  },
  es: {
    words:
      'el la los las un una es son qué cuál cuáles quién cómo muestra muéstrame mi de y en para con este esta hoy necesito por favor'.split(
        ' ',
      ),
  },
  pt: {
    words:
      'o a os as um uma é são qual quais quem como mostre meu de e em para com este hoje'.split(
        ' ',
      ),
  },
  it: {
    words:
      'il lo la gli le un una è sono quale chi come mostra mio di e in per con questo oggi'.split(
        ' ',
      ),
  },
  hi: {
    romanized: true,
    words:
      'hai hain kya kaun kaise kitne mujhe mera meri aap hum nahi nahin karo kar raha rahi wala wali aaj kal batao dikhao kaam abhi'.split(
        ' ',
      ),
  },
  ml: {
    romanized: true,
    words:
      'aanu aano ano enthu entha enthanu evide ethra illa ille undo undu cheyyu cheyyanam venam ningal njan ente ninte alle parayu nokku innu ippo'.split(
        ' ',
      ),
  },
  ta: {
    romanized: true,
    words:
      'enna yenna irukku illai illa romba panna pannunga naan enakku unga sollu paaru inniki ippo vendum eppadi'.split(
        ' ',
      ),
  },
};

/** Marks count too: Indic vowel signs and viramas are \p{M}, not \p{L}. */
const LETTER = /[\p{L}\p{M}]/u;
const LATIN = /\p{Script=Latin}/u;

/**
 * Guesses the language of a message from its script (reliable for Indic, Arabic, CJK…) and, for
 * Latin text, from function words. Returns null when there is too little text to tell.
 */
export function detectLanguage(text: string): DetectedLanguage | null {
  const counts = new Map<string, number>();
  let letters = 0;
  let latin = 0;
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    letters++;
    if (LATIN.test(ch)) {
      latin++;
      continue;
    }
    const s = SCRIPTS.find((x) => x.re.test(ch));
    if (s) counts.set(s.code, (counts.get(s.code) ?? 0) + 1);
  }
  if (letters < 2) return null;

  if (counts.has('ar')) {
    const code = URDU.test(text) ? 'ur' : PERSIAN.test(text) ? 'fa' : 'ar';
    if (code !== 'ar') {
      counts.set(code, counts.get('ar')!);
      counts.delete('ar');
    }
  }
  // Kanji-only text is Chinese unless kana appears anywhere.
  if (counts.has('ja') && counts.has('zh')) {
    counts.set('ja', counts.get('ja')! + counts.get('zh')!);
    counts.delete('zh');
  }

  const scripts = [...counts.entries()]
    .map(([code, n]) => ({ code, share: n / letters }))
    .sort((a, b) => b.share - a.share);
  const latinGuess = latin > 0 ? guessLatin(text) : null;
  const latinEntry = latinGuess ? { code: latinGuess.code, share: latin / letters } : null;

  // A non-Latin script carries the language even when English technical words dominate by count:
  // "ഈ project-ന്റെ deadline എപ്പോഴാണ്?" is Malayalam with English vocabulary.
  const top = scripts[0];
  const scriptWins = top !== undefined && (top.share >= 0.2 || latinEntry === null);
  const primary = scriptWins ? top : latinEntry!;

  const mixed = [...scripts, ...(latinEntry ? [latinEntry] : [])]
    .filter((s) => s.code !== primary.code && s.share >= 0.12)
    .sort((a, b) => b.share - a.share)
    .map((s) => s.code);
  return {
    code: primary.code,
    confidence: round(scriptWins ? primary.share : Math.min(primary.share, latinGuess!.confidence)),
    mixed,
    ...(!scriptWins && latinGuess!.romanized ? { romanized: true } : {}),
  };
}

function guessLatin(text: string): { code: string; confidence: number; romanized?: boolean } {
  const words = text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
  if (words.length === 0) return { code: 'en', confidence: 0.3 };
  let best = { code: 'en', hits: 0 };
  for (const [code, { words: list }] of Object.entries(LATIN_WORDS)) {
    const set = new Set(list);
    const hits = words.filter((w) => set.has(w)).length;
    if (hits > best.hits) best = { code, hits };
  }
  // With no function words at all (a bare name, "ZenPods v2"), fall back to English quietly.
  const confidence = best.hits === 0 ? 0.3 : Math.min(1, 0.4 + best.hits / words.length);
  return {
    code: best.code,
    confidence,
    ...(LATIN_WORDS[best.code]?.romanized ? { romanized: true } : {}),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ── Reply-language tag ──────────────────────────────────────────────────────

/** Matches the tag the model is asked to put on the first line: `[lang:ml]` or `[lang:pt-BR]`. */
const REPLY_TAG = /^\s*\[lang:\s*([a-z]{2,3}(?:-[a-z0-9]{2,8})*)\s*\]\s*/i;

/**
 * Splits the model's declared reply language from its text. When the tag is missing, the
 * language is detected from the reply itself (`source: 'detected'`).
 */
export function extractReplyLanguage(text: string): {
  content: string;
  language: string | null;
  source: 'model' | 'detected' | null;
} {
  const m = REPLY_TAG.exec(text);
  if (m) return { content: text.slice(m[0].length), language: m[1]!, source: 'model' };
  const guess = detectLanguage(text);
  return { content: text, language: guess?.code ?? null, source: guess ? 'detected' : null };
}
