/**
 * Small, deterministic language helpers for NOVA's demo assistant: entity matching, due-date
 * phrases and status words. No model involved — predictable and unit-tested.
 */
import type { TaskStatus } from '../constants/enums';
import { DAY_MS } from './time';

const STOP = new Set([
  'the',
  'a',
  'an',
  'for',
  'to',
  'of',
  'and',
  'on',
  'in',
  'with',
  'by',
  'at',
  'project',
  'film',
  'video',
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokens = (text: string) =>
  normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));

export interface MatchCandidate {
  id: string;
  /** Names the entity may be referred to by: title, code, first name, role... */
  names: string[];
}

/**
 * Finds the candidate the text most plausibly refers to. A full name appearing in the text wins;
 * otherwise the share of a name's meaningful words present in the text is used. Below
 * `threshold` nothing is returned rather than guessing.
 */
export function findBestMatch<T extends MatchCandidate>(
  text: string,
  candidates: readonly T[],
  threshold = 0.6,
): T | null {
  const haystack = ` ${normalize(text)} `;
  const words = new Set(tokens(text));
  let best: { c: T; score: number } | null = null;
  for (const c of candidates) {
    for (const name of c.names) {
      const n = normalize(name);
      if (!n) continue;
      let score: number;
      if (haystack.includes(` ${n} `)) {
        score = 1 + n.length / 100;
      } else {
        const nameTokens = tokens(name);
        if (nameTokens.length === 0) continue;
        score = nameTokens.filter((t) => words.has(t)).length / nameTokens.length;
      }
      if (score >= threshold && (!best || score > best.score)) best = { c, score };
    }
  }
  return best?.c ?? null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** End-of-working-day (18:00 local) for phrases like "today", "by Friday", "in 3 days", "25 Nov". */
export function parseDueDate(text: string, now = new Date()): Date | null {
  const t = normalize(text);
  const at18 = (d: Date) => {
    const x = new Date(d);
    x.setHours(18, 0, 0, 0);
    return x;
  };
  if (/\bday after tomorrow\b/.test(t)) return at18(new Date(now.getTime() + 2 * DAY_MS));
  if (/\btomorrow\b/.test(t)) return at18(new Date(now.getTime() + DAY_MS));
  if (/\b(today|tonight|eod|end of day)\b/.test(t)) return at18(now);
  const inDays = /\bin (\d{1,2}) days?\b/.exec(t);
  if (inDays) return at18(new Date(now.getTime() + Number(inDays[1]) * DAY_MS));
  if (/\bnext week\b/.test(t)) return at18(new Date(now.getTime() + 7 * DAY_MS));
  for (const [i, day] of WEEKDAYS.entries()) {
    if (new RegExp(`\\b${day}\\b`).test(t)) {
      const diff = (i - now.getDay() + 7) % 7 || 7;
      return at18(new Date(now.getTime() + diff * DAY_MS));
    }
  }
  const dm =
    /\b(\d{1,2})(?:st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t);
  const md =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  const parts = dm
    ? { d: Number(dm[1]), m: MONTHS.indexOf(dm[2]!) }
    : md
      ? { d: Number(md[2]), m: MONTHS.indexOf(md[1]!) }
      : null;
  if (parts && parts.d >= 1 && parts.d <= 31) {
    const candidate = new Date(now.getFullYear(), parts.m, parts.d, 18);
    if (candidate.getTime() < now.getTime() - DAY_MS) candidate.setFullYear(now.getFullYear() + 1);
    return candidate;
  }
  return null;
}

/** Maps everyday status words to task statuses. */
export function parseTaskStatus(text: string): TaskStatus | null {
  const t = normalize(text);
  if (/\b(done|complete|completed|finished|finish|wrapped)\b/.test(t)) return 'DONE';
  if (/\b(in progress|start|started|begin|working on)\b/.test(t)) return 'IN_PROGRESS';
  if (/\b(block|blocked|stuck)\b/.test(t)) return 'BLOCKED';
  if (/\b(in review|for review|review)\b/.test(t)) return 'IN_REVIEW';
  if (/\b(to do|todo|reopen|reopened|not started)\b/.test(t)) return 'TODO';
  return null;
}

/** Extracts the task title from requests like `create a task to "grade the hero film" for ...`. */
export function extractTaskTitle(text: string): string | null {
  const quoted = /["“”']([^"“”']{3,120})["“”']/.exec(text);
  if (quoted) return quoted[1]!.trim();
  const m =
    /(?:create|add|make|new)\s+(?:a\s+)?(?:new\s+)?task\s+(?:to\s+|for\s+|called\s+|named\s+|:\s*)?(.+?)(?=\s+(?:for|on|in)\s+(?:the\s+)?(?:project|production)\b|\s+(?:assigned|assign|due|by|before|until)\b|\s+for\s+[A-Z]|\s*[,.;]|$)/i.exec(
      text,
    );
  const title = m?.[1]?.trim();
  if (!title || title.length < 3) return null;
  return title.charAt(0).toUpperCase() + title.slice(1);
}
