// Quick-match pairing rules (pure, so they can be unit-tested without a Durable Object).
//
// Players prefer opponents with a close rating. The accepted rating gap starts at ±100 and doubles every 5 s
// of waiting (100 → 200 → 400 → 800), and after 20 s anyone is fine: nobody waits forever for a perfect match.
// A pair is allowed when the gap fits the window of the player who has waited longer, and among allowed
// opponents the closest rating wins (ties: whoever has waited longest).

export interface Seeker {
  pid: string;
  rating: number;
  /** epoch ms when this player started searching */
  since: number;
  /** null = any game */
  gameId: string | null;
}

export const GAP_START = 100;
export const GAP_DOUBLE_MS = 5_000;
export const GAP_OPEN_MS = 20_000;

/** The rating gap accepted after waiting `waitMs`. Infinity once the window is fully open. */
export function ratingWindow(waitMs: number): number {
  const w = Math.max(0, waitMs);
  if (w >= GAP_OPEN_MS) return Infinity;
  return Math.round(GAP_START * 2 ** (w / GAP_DOUBLE_MS));
}

export const gamesCompatible = (a: Seeker, b: Seeker) => !a.gameId || !b.gameId || a.gameId === b.gameId;

export function canPair(a: Seeker, b: Seeker, now: number): boolean {
  if (a.pid === b.pid || !gamesCompatible(a, b)) return false;
  const window = ratingWindow(now - Math.min(a.since, b.since));
  return Math.abs(a.rating - b.rating) <= window;
}

/** The best allowed opponent for `me` among `others`, or null if nobody fits yet. */
export function pickOpponent<T extends Seeker>(me: Seeker, others: T[], now: number): T | null {
  let best: T | null = null;
  for (const o of others) {
    if (!canPair(me, o, now)) continue;
    if (!best) {
      best = o;
      continue;
    }
    const d = Math.abs(o.rating - me.rating);
    const bd = Math.abs(best.rating - me.rating);
    if (d < bd || (d === bd && o.since < best.since)) best = o;
  }
  return best;
}

/**
 * Pair up a whole queue: longest waiters pick first. Returns the pairs; everyone not listed keeps waiting.
 * Used by the periodic sweep, so windows that widened since someone queued get a chance to match.
 */
export function pairQueue<T extends Seeker>(queue: T[], now: number): Array<[T, T]> {
  const left = [...queue].sort((a, b) => a.since - b.since);
  const pairs: Array<[T, T]> = [];
  while (left.length > 1) {
    const me = left.shift()!;
    const o = pickOpponent(me, left, now);
    if (!o) continue;
    left.splice(left.indexOf(o), 1);
    pairs.push([me, o]);
  }
  return pairs;
}
