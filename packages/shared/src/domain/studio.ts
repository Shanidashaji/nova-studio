/**
 * Pure rules of the production-studio layer, shared by the API and the web app:
 * the rule-based script breakdown, casting/crew recommendation scoring, shoot readiness,
 * message templating, budget grouping and shoot-day arithmetic.
 *
 * None of this is machine learning. Every result carries the rule that produced it so the UI
 * can explain it ("rule-based", "NOVA estimate").
 */
import type { FinanceCategory } from '../constants/enums';
import type { BudgetGroup, SceneSetting, SceneTime, TalentKind } from '../constants/studio-enums';
import { DAY_MS } from './time';

// ── Days (studio time is India Standard Time) ─────────────────────────────────

const IST_OFFSET_MS = 330 * 60 * 1000;

/** `YYYY-MM-DD` of the IST calendar day `d` falls on. */
export function istDayKey(d: Date | string): string {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of IST midnight that starts day `key` (`YYYY-MM-DD`). */
export function istDayStart(key: string): Date {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
}

/** Every IST calendar day a shoot touches, in order (a 3-day shoot gives 3 keys). */
export function shootDayKeys(startsAt: Date | string, endsAt: Date | string): string[] {
  const keys: string[] = [];
  const last = istDayKey(new Date(new Date(endsAt).getTime() - 1));
  let key = istDayKey(startsAt);
  // Bounded: a shoot never spans more than 60 days.
  for (let i = 0; i < 60; i++) {
    keys.push(key);
    if (key >= last) break;
    key = istDayKey(new Date(istDayStart(key).getTime() + DAY_MS + 60_000));
  }
  return keys;
}

/** 1-based shoot day number of `day` within the shoot, or null when the shoot is not on it. */
export function shootDayNumber(
  shoot: { startsAt: Date | string; endsAt: Date | string },
  day: Date | string,
): { day: number; of: number } | null {
  const keys = shootDayKeys(shoot.startsAt, shoot.endsAt);
  const index = keys.indexOf(typeof day === 'string' && day.length === 10 ? day : istDayKey(day));
  return index === -1 ? null : { day: index + 1, of: keys.length };
}

// ── Message templates ─────────────────────────────────────────────────────────

export const TEMPLATE_VARIABLES = [
  ['client', 'Client company name'],
  ['contact', 'Client contact name'],
  ['project', 'Project title'],
  ['projectCode', 'Project code'],
  ['studio', 'Studio name'],
  ['shoot', 'Shoot title'],
  ['shootDate', 'Shoot date (and end date for multi-day shoots)'],
  ['callTime', 'Call time'],
  ['location', 'Shoot location'],
  ['oldDate', 'Previous shoot date (schedule changes)'],
  ['script', 'Script title'],
  ['deliverable', 'Deliverable name and version'],
  ['reviewLink', 'Review link (or a note that it will follow)'],
  ['dueDate', 'Project delivery date'],
  ['sender', 'Name of the person at the studio'],
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number][0];

/**
 * Fills `{{variable}}` placeholders. Unknown or empty variables are left visible as
 * `[variable]` and reported, so a draft never silently goes out with a hole in it.
 */
export function renderTemplate(
  template: string,
  values: Partial<Record<TemplateVariable, string | null | undefined>>,
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, name: string) => {
    const value = values[name as TemplateVariable];
    if (value === undefined || value === null || value === '') {
      missing.add(name);
      return `[${name}]`;
    }
    return value;
  });
  return { text, missing: [...missing] };
}

// ── Budget ────────────────────────────────────────────────────────────────────

/** Which budget-plan group an expense category is charged to. */
export function budgetGroupOf(category: FinanceCategory): BudgetGroup {
  switch (category) {
    case 'CREW':
      return 'CREW';
    case 'TALENT':
      return 'ARTIST';
    case 'EQUIPMENT_RENTAL':
    case 'MAINTENANCE':
      return 'EQUIPMENT';
    case 'LOCATION':
    case 'TRAVEL':
    case 'CONSUMABLES':
      return 'PRODUCTION';
    case 'POST_PRODUCTION':
    case 'SOFTWARE':
      return 'POST_PRODUCTION';
    default:
      return 'OTHER';
  }
}

/** Variance of actual against estimate: positive = over budget. */
export function budgetVariance(estimated: number, actual: number) {
  const variance = actual - estimated;
  return {
    variance,
    utilisation: estimated > 0 ? actual / estimated : actual > 0 ? Infinity : 0,
    band:
      estimated === 0 && actual === 0
        ? ('NONE' as const)
        : actual > estimated
          ? ('OVER' as const)
          : actual > estimated * 0.9
            ? ('NEAR' as const)
            : ('UNDER' as const),
  };
}

// ── Rule-based script breakdown ───────────────────────────────────────────────

export interface BreakdownScene {
  number: string;
  heading: string;
  setting: SceneSetting;
  timeOfDay: SceneTime;
  location: string | null;
  description: string | null;
  characters: string[];
  props: string[];
  equipment: string[];
  requirements: string | null;
  estimatedMinutes: number;
}

export interface BreakdownResult {
  method: 'RULE_BASED';
  scenes: BreakdownScene[];
  warnings: string[];
  limitations: string;
}

export const BREAKDOWN_LIMITATIONS =
  'Rule-based breakdown, not AI: scenes are found from headings (INT./EXT. or “Scene N”), ' +
  'characters from capitalised speaker lines, props from capitalised words and a keyword list, ' +
  'equipment from a fixed set of cues (night, aerial, slow motion, macro, rain, car, music). ' +
  'Shooting time is estimated at 4 minutes per script line (minimum 30). Review every scene.';

const HEADING =
  /^\s*(?:(?:scene\s+)?(\d+[a-z]?)[.):\s-]+)?(int\.?\s*\/\s*ext\.?|ext\.?\s*\/\s*int\.?|i\/e\.?|int\.?|ext\.?)\s+(.+?)\s*$/i;
const SCENE_LABEL = /^\s*scene\s+(\d+[a-z]?)\s*[:.\-–—]?\s*(.*)$/i;
const TIME_SUFFIX =
  /\s*[-–—,]+\s*(day|night|dawn|dusk|morning|evening|afternoon|sunset|sunrise|continuous|later)\s*$/i;
const TRANSITION =
  /^(cut to|fade (in|out)|dissolve to|smash cut|match cut|title|super|end|the end)\b/i;
const NOT_PROPS = new Set([
  'INT',
  'EXT',
  'DAY',
  'NIGHT',
  'CUT',
  'FADE',
  'V.O',
  'O.S',
  'CONT',
  'CONTINUOUS',
  'POV',
  'CU',
  'ECU',
  'MCU',
  'WS',
  'OK',
  'TV',
  'I',
  'A',
]);
const PROP_WORDS = [
  'phone',
  'smartphone',
  'laptop',
  'car',
  'bike',
  'scooter',
  'bottle',
  'cup',
  'coffee',
  'tea',
  'glass',
  'saree',
  'umbrella',
  'book',
  'bag',
  'watch',
  'earbuds',
  'headphones',
  'camera',
  'key',
  'keys',
  'letter',
  'gift',
  'box',
  'loom',
  'thread',
  'plate',
  'food',
  'flowers',
  'mirror',
  'chair',
  'table',
  'tablet',
  'card',
];
const EQUIPMENT_CUES: [RegExp, string, string | null][] = [
  [/\b(aerial|drone|bird'?s.eye|top shot)\b/i, 'Drone', 'Drone permission and licensed operator'],
  [/\b(slow.?mo(tion)?|high.?speed|120 ?fps)\b/i, 'High-frame-rate camera', null],
  [/\b(macro|extreme close|ecu|detail shot)\b/i, 'Macro lens', null],
  [/\b(rain|storm|wet)\b/i, 'Rain machine / weather cover', 'Weather contingency'],
  [/\b(car|driving|vehicle|road)\b/i, 'Car mount / tracking vehicle', 'Road permission'],
  [/\b(music|song|dance|sings?|plays? the)\b/i, 'Playback speaker', 'Music licence / playback'],
  [/\b(tracking|follows|walks with|dolly)\b/i, 'Gimbal / dolly', null],
  [/\b(interview|talks to camera|speaks to camera|piece to camera)\b/i, 'Lavalier mics', null],
  [/\b(green ?screen|chroma)\b/i, 'Green screen', 'Studio floor booking'],
  [/\b(underwater|pool|swim)\b/i, 'Underwater housing', 'Water safety'],
];

const cleanName = (line: string) =>
  line
    .replace(/\((v\.?o\.?|o\.?s\.?|o\.?c\.?|cont'?d|contd|continuing)\)/gi, '')
    .replace(/[:.]+$/, '')
    .trim();

function parseHeading(raw: string, fallbackNumber: number) {
  const m = HEADING.exec(raw);
  if (!m) return null;
  const prefix = m[2]!.toLowerCase().replace(/\s|\./g, '');
  const setting: SceneSetting =
    prefix.includes('/') || prefix === 'i/e' ? 'INT_EXT' : prefix.startsWith('ext') ? 'EXT' : 'INT';
  let rest = m[3]!;
  let timeOfDay: SceneTime = 'DAY';
  const t = TIME_SUFFIX.exec(rest);
  if (t) {
    rest = rest.slice(0, t.index);
    const w = t[1]!.toLowerCase();
    timeOfDay =
      w === 'night' || w === 'evening'
        ? 'NIGHT'
        : w === 'dawn' || w === 'sunrise'
          ? 'DAWN'
          : w === 'dusk' || w === 'sunset'
            ? 'DUSK'
            : 'DAY';
  }
  return {
    number: m[1]?.toUpperCase() ?? String(fallbackNumber),
    heading: raw.trim().replace(/^\d+[a-z]?[.):\s-]+/i, ''),
    setting,
    timeOfDay,
    location: rest.replace(/[.\s]+$/, '').trim() || null,
  };
}

/** True for a screenplay character cue: a short, fully capitalised line. */
function isCharacterCue(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (TRANSITION.test(t) || HEADING.test(t)) return false;
  const name = cleanName(t);
  if (!/[A-Z]/.test(name) || name !== name.toUpperCase()) return false;
  if (!/^[A-Z][A-Z .'-]*\d?$/.test(name)) return false;
  return name.split(/\s+/).length <= 4;
}

/**
 * Splits a script into scenes and lists what each needs. Works on screenplay format
 * (INT./EXT. headings and capitalised character cues) and on simple "Scene 1: …" outlines.
 */
export function breakdownScript(text: string): BreakdownResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const warnings: string[] = [];
  type Block = {
    head: ReturnType<typeof parseHeading> | null;
    label: string | null;
    body: string[];
  };
  const blocks: Block[] = [];
  let current: Block | null = null;
  let count = 0;
  for (const line of lines) {
    const heading = parseHeading(line, count + 1);
    const label = !heading ? SCENE_LABEL.exec(line) : null;
    if (heading || label) {
      count++;
      current = {
        head: heading ?? null,
        label: label ? `${label[1]}|${label[2] ?? ''}` : null,
        body: [],
      };
      blocks.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else if (line.trim()) {
      // Text before the first heading becomes an untitled opening scene.
      current = { head: null, label: null, body: [line] };
      blocks.push(current);
    }
  }
  if (blocks.length === 0) {
    return {
      method: 'RULE_BASED',
      scenes: [],
      warnings: ['The script is empty — nothing to break down.'],
      limitations: BREAKDOWN_LIMITATIONS,
    };
  }
  if (!blocks.some((b) => b.head || b.label)) {
    warnings.push(
      'No scene headings were found (INT./EXT. or “Scene 1:”), so the whole script was treated as one scene. Add headings for a scene-by-scene breakdown.',
    );
  }

  const scenes = blocks.map((b, i): BreakdownScene => {
    const body = b.body.filter((l) => l.trim());
    const characters = new Set<string>();
    const props = new Set<string>();
    const action: string[] = [];
    for (let j = 0; j < b.body.length; j++) {
      const line = b.body[j]!;
      if (!line.trim()) continue;
      const next = b.body.slice(j + 1).find((l) => l.trim());
      if (isCharacterCue(line) && next && !isCharacterCue(next)) {
        characters.add(titleCaseName(cleanName(line)));
        continue;
      }
      // "RIYA (30s) walks in" — a capitalised name introduced in action.
      for (const m of line.matchAll(
        /\b([A-Z][A-Z]{2,}(?:\s[A-Z]{2,})?)\s*\((\d{1,2}s?|[a-z ]+)\)/g,
      )) {
        characters.add(titleCaseName(m[1]!));
      }
      action.push(line.trim());
    }
    for (const line of action) {
      for (const m of line.matchAll(/\b([A-Z][A-Z-]{2,}(?:\s[A-Z][A-Z-]{2,})?)\b/g)) {
        const word = m[1]!;
        if (NOT_PROPS.has(word) || characters.has(titleCaseName(word))) continue;
        props.add(word.toLowerCase());
      }
      const lower = line.toLowerCase();
      for (const w of PROP_WORDS) if (new RegExp(`\\b${w}\\b`).test(lower)) props.add(w);
    }
    const all = body.join(' ');
    const equipment = new Set<string>();
    const requirements = new Set<string>();
    for (const [re, item, need] of EQUIPMENT_CUES) {
      if (re.test(all) || re.test(b.head?.heading ?? '')) {
        equipment.add(item);
        if (need) requirements.add(need);
      }
    }
    const head = b.head;
    const [labelNo, labelText] = b.label?.split('|') ?? [];
    if (head?.timeOfDay === 'NIGHT') {
      equipment.add('Night lighting package');
      requirements.add('Night shoot — crew turnaround and permissions');
    }
    if (head?.setting === 'EXT') requirements.add('Exterior — check weather and location permit');
    const firstAction = action.find((l) => !TRANSITION.test(l));
    return {
      number: head?.number ?? labelNo?.toUpperCase() ?? String(i + 1),
      heading:
        head?.heading ?? (labelText?.trim() ? labelText.trim() : `Scene ${labelNo ?? i + 1}`),
      setting: head?.setting ?? 'INT',
      timeOfDay: head?.timeOfDay ?? 'DAY',
      location: head?.location ?? null,
      description: firstAction ? firstAction.slice(0, 280) : null,
      characters: [...characters].slice(0, 12),
      props: [...props].slice(0, 15),
      equipment: [...equipment],
      requirements: requirements.size ? [...requirements].join('; ') : null,
      estimatedMinutes: Math.min(480, Math.max(30, body.length * 4)),
    };
  });
  return { method: 'RULE_BASED', scenes, warnings, limitations: BREAKDOWN_LIMITATIONS };
}

function titleCaseName(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Recommendation scoring (rule-based) ───────────────────────────────────────

export interface RecommendationReason {
  label: string;
  points: number;
}

export interface ScoredCandidate {
  score: number;
  reasons: RecommendationReason[];
  /** Hard blockers: the person cannot be booked for this need. */
  blockers: string[];
}

const tokens = (s: string) =>
  normalizeWords(s)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
const normalizeWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'who',
  'her',
  'his',
  'their',
  'from',
  'into',
  'that',
  'this',
  'role',
  'part',
  'character',
]);

/** Talent kinds that can play a need described as `role` (default: actor-like kinds). */
export function kindsForRole(role: string): TalentKind[] {
  const r = role.toLowerCase();
  if (/\b(voice|vo|narrat|dub)/.test(r)) return ['VOICE_ARTIST', 'ACTOR', 'ANCHOR'];
  if (/\b(anchor|host|presenter|emcee)/.test(r)) return ['ANCHOR', 'ACTOR', 'INFLUENCER'];
  if (/\b(dance|dancer|choreo)/.test(r)) return ['DANCER', 'ACTOR', 'MODEL'];
  if (/\b(model|hand model|hands|fashion|walk)/.test(r)) return ['MODEL', 'ACTOR'];
  if (/\b(child|kid|boy|girl|daughter|son)\b/.test(r)) return ['CHILD_ARTIST'];
  if (/\b(influencer|creator|ugc)/.test(r)) return ['INFLUENCER', 'MODEL', 'ACTOR'];
  return ['ACTOR', 'MODEL', 'ANCHOR', 'OTHER'];
}

export interface TalentNeed {
  role: string;
  /** Free-text requirement (character description from the scene breakdown, brief notes). */
  description?: string | null;
  city?: string | null;
  age?: number | null;
  language?: string | null;
  projectType?: string | null;
  budgetPerDay?: number | null;
}

export interface TalentCandidate {
  kind: TalentKind;
  skills: string[];
  languages: string[];
  experienceYears: number;
  baseCity: string;
  willTravel: boolean;
  dayRate: number;
  playingAgeMin: number | null;
  playingAgeMax: number | null;
  isActive: boolean;
  /** Overlapping bookings or unavailability in the shoot window, described in words. */
  clashes: string[];
  /** Past bookings on projects of the same type, and with the same client. */
  sameTypeBookings: number;
  sameClientBookings: number;
}

/** Explainable score for an artist against a casting need (0–100). */
export function scoreTalent(c: TalentCandidate, need: TalentNeed): ScoredCandidate {
  const reasons: RecommendationReason[] = [];
  const blockers: string[] = [];
  if (!c.isActive) blockers.push('Inactive in the roster');
  blockers.push(...c.clashes);

  const kinds = kindsForRole(need.role);
  const kindRank = kinds.indexOf(c.kind);
  if (kindRank === 0) reasons.push({ label: 'Profile type matches the part', points: 25 });
  else if (kindRank > 0) reasons.push({ label: 'Profile type can play the part', points: 12 });

  const wanted = new Set(tokens(`${need.role} ${need.description ?? ''}`));
  const matched = c.skills.filter((s) => tokens(s).some((t) => wanted.has(t)));
  if (matched.length) {
    reasons.push({
      label: `Skills match: ${matched.slice(0, 3).join(', ')}`,
      points: Math.min(25, matched.length * 10),
    });
  }
  if (need.language) {
    if (c.languages.some((l) => l.toLowerCase() === need.language!.toLowerCase()))
      reasons.push({ label: `Speaks ${need.language}`, points: 10 });
    else reasons.push({ label: `Does not list ${need.language}`, points: -10 });
  }
  if (need.age != null && c.playingAgeMin != null && c.playingAgeMax != null) {
    if (need.age >= c.playingAgeMin && need.age <= c.playingAgeMax)
      reasons.push({ label: `Playing age ${c.playingAgeMin}–${c.playingAgeMax} fits`, points: 10 });
    else
      blockers.push(`Playing age ${c.playingAgeMin}–${c.playingAgeMax} does not fit ${need.age}`);
  }
  if (c.experienceYears >= 5)
    reasons.push({ label: `${c.experienceYears} years’ experience`, points: 10 });
  else if (c.experienceYears >= 2)
    reasons.push({ label: `${c.experienceYears} years’ experience`, points: 5 });
  if (need.city) {
    if (c.baseCity.toLowerCase() === need.city.toLowerCase())
      reasons.push({ label: `Based in ${c.baseCity} — no travel`, points: 10 });
    else if (c.willTravel) reasons.push({ label: `Travels from ${c.baseCity}`, points: 2 });
    else blockers.push(`Based in ${c.baseCity} and does not travel`);
  }
  if (c.sameClientBookings > 0)
    reasons.push({ label: `Worked with this client ${c.sameClientBookings}×`, points: 8 });
  if (c.sameTypeBookings > 0)
    reasons.push({ label: `Done ${c.sameTypeBookings} similar production(s)`, points: 6 });
  if (need.budgetPerDay != null && c.dayRate > need.budgetPerDay)
    reasons.push({ label: 'Day rate above the remaining artist budget', points: -15 });

  const score = Math.max(
    0,
    Math.min(
      100,
      reasons.reduce((a, r) => a + r.points, 0),
    ),
  );
  return { score, reasons, blockers };
}

export interface CrewNeed {
  role: string;
  city?: string | null;
  projectType?: string | null;
}

export interface CrewCandidate {
  title: string;
  skills: string[];
  baseLocation: string;
  isActive: boolean;
  /** Utilisation of the next 7 days, as a ratio of capacity. */
  utilisation: number;
  clashes: string[];
  sameTypeProjects: number;
}

/** Explainable score for a team member against a crew role on a shoot (0–100). */
export function scoreCrew(c: CrewCandidate, need: CrewNeed): ScoredCandidate {
  const reasons: RecommendationReason[] = [];
  const blockers: string[] = [];
  if (!c.isActive) blockers.push('No longer on the team');
  blockers.push(...c.clashes);
  const wanted = new Set(tokens(need.role));
  const titleHit = tokens(c.title).some((t) => wanted.has(t)) || roleAlias(need.role, c.title);
  if (titleHit) reasons.push({ label: `${c.title} — the role’s own discipline`, points: 40 });
  const skillHits = c.skills.filter(
    (s) => tokens(s).some((t) => wanted.has(t)) || roleAlias(need.role, s),
  );
  if (skillHits.length)
    reasons.push({
      label: `Skills: ${skillHits.slice(0, 3).join(', ')}`,
      points: Math.min(20, skillHits.length * 10),
    });
  if (need.city && c.baseLocation.toLowerCase() === need.city.toLowerCase())
    reasons.push({ label: 'Based at the shoot’s studio', points: 10 });
  if (c.utilisation < 0.4) reasons.push({ label: 'Light workload this week', points: 15 });
  else if (c.utilisation <= 0.85) reasons.push({ label: 'Balanced workload this week', points: 8 });
  else if (c.utilisation > 1) reasons.push({ label: 'Over capacity this week', points: -15 });
  if (c.sameTypeProjects > 0)
    reasons.push({ label: `On ${c.sameTypeProjects} production(s) of this type`, points: 8 });
  const score = Math.max(
    0,
    Math.min(
      100,
      reasons.reduce((a, r) => a + r.points, 0),
    ),
  );
  return { score, reasons, blockers };
}

const ROLE_ALIASES: [RegExp, RegExp][] = [
  [
    /\b(dop|cinematograph\w*|camera operator|dp)\b/i,
    /\b(dop|cinematograph\w*|photography|camera|lighting)\b/i,
  ],
  [/\bdirector\b(?! of photography)/i, /\b(director\b(?! of photography)|direction)\b/i],
  [/\b(editor|edit)\b/i, /\b(editor|editing|edit)\b/i],
  [/\b(sound|audio|boom|recordist)\b/i, /\b(sound|audio|mix)\b/i],
  [/\b(drone|aerial)\b/i, /\b(drone|aerial|fpv)\b/i],
  [/\b(producer|production manager|line producer)\b/i, /\b(producer|production|scheduling)\b/i],
  [/\b(colou?r|grade|grading)\b/i, /\b(colou?r|grading|davinci)\b/i],
  [/\b(gaffer|light)\b/i, /\b(gaffer|lighting|light)\b/i],
  [/\b(camera assistant|ac|focus puller)\b/i, /\b(camera|assistant|focus)\b/i],
];
function roleAlias(role: string, title: string): boolean {
  return ROLE_ALIASES.some(([r, t]) => r.test(role) && t.test(title));
}

// ── Shoot readiness ───────────────────────────────────────────────────────────

export type ReadinessStatus = 'done' | 'missing' | 'warning' | 'na';

export interface ReadinessItem {
  key: string;
  label: string;
  status: ReadinessStatus;
  /** A missing blocking item stops the shoot from being confirmed. */
  blocking: boolean;
  detail: string;
}

export interface ShootReadinessInput {
  location: string;
  crewCount: number;
  hasDirector: boolean;
  hasCamera: boolean;
  equipmentCount: number;
  conflictCount: number;
  productionManager: boolean;
  /** Scripts of the project: none, or how many are approved. */
  scripts: { total: number; approved: number };
  scenesPlanned: number;
  /** Characters named in this shoot's scenes that no confirmed artist plays. */
  uncastCharacters: string[];
  talentOnHold: number;
  callSheetPublished: boolean;
  checklistOpen: number;
}

/** What must be in place before a shoot can be confirmed and started. */
export function shootReadiness(i: ShootReadinessInput): {
  items: ReadinessItem[];
  canConfirm: boolean;
  canStart: boolean;
  score: number;
} {
  const items: ReadinessItem[] = [
    {
      key: 'script',
      label: 'Script approved',
      blocking: i.scripts.total > 0,
      status: i.scripts.total === 0 ? 'warning' : i.scripts.approved > 0 ? 'done' : 'missing',
      detail:
        i.scripts.total === 0
          ? 'No script on file for this project — fine for product shoots, otherwise add one.'
          : i.scripts.approved > 0
            ? `${i.scripts.approved} of ${i.scripts.total} script(s) approved.`
            : 'The script is not approved yet. Shooting an unapproved script risks a reshoot.',
    },
    {
      key: 'scenes',
      label: 'Scenes planned for this shoot',
      blocking: false,
      status: i.scenesPlanned > 0 ? 'done' : 'warning',
      detail:
        i.scenesPlanned > 0
          ? `${i.scenesPlanned} scene(s) on the schedule.`
          : 'No scenes are planned for this shoot yet.',
    },
    {
      key: 'location',
      label: 'Location confirmed',
      blocking: true,
      status: i.location.trim() && !/\btbc|tbd\b/i.test(i.location) ? 'done' : 'missing',
      detail: i.location.trim() ? i.location : 'Add the shoot location.',
    },
    {
      key: 'crew',
      label: 'Crew called',
      blocking: true,
      status: i.crewCount === 0 ? 'missing' : i.hasDirector && i.hasCamera ? 'done' : 'warning',
      detail:
        i.crewCount === 0
          ? 'Nobody is called to this shoot.'
          : `${i.crewCount} crew${i.hasDirector ? '' : ' · no director called'}${i.hasCamera ? '' : ' · no camera operator called'}.`,
    },
    {
      key: 'casting',
      label: 'Artists confirmed',
      blocking: i.talentOnHold > 0 || i.uncastCharacters.length > 0,
      status: i.talentOnHold > 0 || i.uncastCharacters.length > 0 ? 'missing' : 'done',
      detail:
        i.uncastCharacters.length > 0
          ? `Not cast yet: ${i.uncastCharacters.slice(0, 4).join(', ')}${i.uncastCharacters.length > 4 ? '…' : ''}.`
          : i.talentOnHold > 0
            ? `${i.talentOnHold} artist booking(s) still on hold.`
            : 'Every artist booking is confirmed.',
    },
    {
      key: 'equipment',
      label: 'Equipment booked',
      blocking: true,
      status: i.equipmentCount > 0 ? 'done' : 'missing',
      detail: i.equipmentCount > 0 ? `${i.equipmentCount} item(s) booked.` : 'No equipment booked.',
    },
    {
      key: 'conflicts',
      label: 'No double bookings',
      blocking: true,
      status: i.conflictCount === 0 ? 'done' : 'missing',
      detail:
        i.conflictCount === 0
          ? 'Crew, artists and equipment are free.'
          : `${i.conflictCount} double booking(s) to resolve.`,
    },
    {
      key: 'manager',
      label: 'Production manager assigned',
      blocking: false,
      status: i.productionManager ? 'done' : 'warning',
      detail: i.productionManager ? 'Assigned.' : 'Nobody owns the shoot day.',
    },
    {
      key: 'callsheet',
      label: 'Call sheet published',
      blocking: false,
      status: i.callSheetPublished ? 'done' : 'missing',
      detail: i.callSheetPublished
        ? 'Published to the crew.'
        : 'Publish the call sheet before the shoot starts.',
    },
    {
      key: 'checklist',
      label: 'Pre-shoot checklist',
      blocking: false,
      status: i.checklistOpen === 0 ? 'done' : 'warning',
      detail: i.checklistOpen === 0 ? 'All items ticked.' : `${i.checklistOpen} item(s) open.`,
    },
  ];
  const blockingMissing = items.some((x) => x.blocking && x.status === 'missing');
  const scored = items.filter((x) => x.status !== 'na');
  const score = Math.round(
    (scored.reduce((a, x) => a + (x.status === 'done' ? 1 : x.status === 'warning' ? 0.5 : 0), 0) /
      Math.max(1, scored.length)) *
      100,
  );
  return {
    items,
    canConfirm: !blockingMissing,
    canStart: !blockingMissing && i.callSheetPublished,
    score,
  };
}

/** Default pre-shoot checklist created with every shoot (editable on the shoot day screen). */
export const DEFAULT_SHOOT_CHECKLIST = [
  'Batteries charged and counted',
  'Memory cards formatted and labelled',
  'Location permission letter on hand',
  'First-aid kit and fire extinguisher checked',
  'Client contact confirmed for the day',
  'Catering and water arranged',
  'Release forms printed for artists',
] as const;
