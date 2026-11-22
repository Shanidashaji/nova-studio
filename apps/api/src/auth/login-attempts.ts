import { Injectable } from '@nestjs/common';

/** Failed sign-ins tolerated for one email address before it is locked. */
export const MAX_FAILED_SIGN_INS = 5;
/** Failures older than this are forgotten, and a lock lasts this long. */
export const SIGN_IN_LOCK_MS = 15 * 60 * 1000;
/** Upper bound on remembered addresses, so made-up emails cannot grow the map without limit. */
const MAX_TRACKED = 10_000;

interface Entry {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

/**
 * Per-account sign-in lockout. The login route is also limited per client address, but that
 * alone lets one account be guessed from many addresses; this counts failures per email instead.
 *
 * - Five failures within fifteen minutes lock the address for fifteen minutes.
 * - The same rule applies to addresses that have no account, so a lock reveals nothing.
 * - A successful sign-in, or an administrator resetting the password, clears the count.
 *
 * Kept in memory: the API runs as a single instance (ADR-0006), and a restart forgetting the
 * counts is acceptable. Signed-in sessions are not affected by a lock.
 */
@Injectable()
export class LoginAttempts {
  private readonly entries = new Map<string, Entry>();

  /** Milliseconds until `email` may try again; 0 when it is not locked. */
  lockedFor(email: string, now = Date.now()): number {
    const entry = this.entries.get(email);
    if (!entry) return 0;
    if (entry.lockedUntil > now) return entry.lockedUntil - now;
    if (this.expired(entry, now)) this.entries.delete(email);
    return 0;
  }

  /** Counts a failed sign-in. Returns true when this failure locked the address. */
  recordFailure(email: string, now = Date.now()): boolean {
    let entry = this.entries.get(email);
    if (!entry || this.expired(entry, now)) {
      this.prune(now);
      entry = { failures: 0, firstFailureAt: now, lockedUntil: 0 };
      // Re-inserting keeps the map ordered by first failure, which `prune` relies on.
      this.entries.delete(email);
      this.entries.set(email, entry);
    }
    entry.failures += 1;
    if (entry.failures < MAX_FAILED_SIGN_INS) return false;
    entry.lockedUntil = now + SIGN_IN_LOCK_MS;
    return true;
  }

  /** Forgets the failures for `email` (successful sign-in, or an administrator's reset). */
  clear(email: string) {
    this.entries.delete(email);
  }

  private expired(entry: Entry, now: number) {
    return entry.lockedUntil <= now && now - entry.firstFailureAt >= SIGN_IN_LOCK_MS;
  }

  private prune(now: number) {
    if (this.entries.size < MAX_TRACKED) return;
    for (const [email, entry] of this.entries) {
      if (this.expired(entry, now)) this.entries.delete(email);
    }
    // Still full of live entries: drop the oldest to make room.
    for (const email of this.entries.keys()) {
      if (this.entries.size < MAX_TRACKED) break;
      this.entries.delete(email);
    }
  }
}
