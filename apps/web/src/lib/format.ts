/** Formatting helpers. The studio operates in India: INR, en-IN, Asia/Kolkata. */

const TZ = 'Asia/Kolkata';
const DAY = 24 * 60 * 60 * 1000;

/** ₹6.5L, ₹1.2Cr, ₹45K — compact rupee amounts in the Indian numbering system. */
export function money(amount: number, { exact = false } = {}): string {
  if (exact) return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}
const trim = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));

export const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function date(
  iso: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
) {
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, ...opts });
}

export function dateTime(iso: string | Date) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function time(iso: string | Date) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function weekday(iso: string | Date) {
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'short' });
}

/** "in 3 days", "2 days ago", "today", "tomorrow". */
export function relativeDay(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.toLocaleDateString('en-CA', { timeZone: TZ })).getTime();
  const diff = Math.round((start(d) - start(now)) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** "just now", "4m ago", "3h ago", "2d ago". */
export function ago(iso: string | Date, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** 24-hour timecode-style clock for the workspace header: 09:45:12. */
export function clock(d: Date) {
  return d.toLocaleTimeString('en-IN', { timeZone: TZ, hour12: false });
}

export function duration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
