// Input checks for async "Beat my score" challenges (pure, unit-tested in challenges.test.ts).

const GAME_RE = /^[a-z0-9-]{2,40}$/;
const MAX_SCORE = 1e9;

export interface AsyncCreate {
  handle: string;
  gameId: string;
  seed: number;
  startLevel: number;
  score: number;
}

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** Validate the body of POST /me/async. Seeds are 32-bit unsigned; start levels 1–999; scores must be positive. */
export function parseAsyncCreate(b: Record<string, unknown>): AsyncCreate | { error: string } {
  const handle = typeof b.handle === 'string' ? b.handle.trim().replace(/^@/, '').slice(0, 30) : '';
  if (!handle) return { error: 'Pick a friend to challenge.' };
  if (typeof b.gameId !== 'string' || !GAME_RE.test(b.gameId)) return { error: 'Unknown game.' };
  const seed = int(b.seed);
  if (seed === null || seed < 0 || seed > 0xffffffff) return { error: 'Bad seed.' };
  const startLevel = int(b.startLevel ?? 1);
  if (startLevel === null || startLevel < 1 || startLevel > 999) return { error: 'Bad level.' };
  const score = int(b.score);
  if (score === null || score <= 0 || score > MAX_SCORE) return { error: 'Only a scored run can be a challenge.' };
  return { handle, gameId: b.gameId, seed, startLevel, score };
}

/** A reply score: a whole number from 0 up. */
export function parseReplyScore(v: unknown): number | null {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= MAX_SCORE ? n : null;
}
