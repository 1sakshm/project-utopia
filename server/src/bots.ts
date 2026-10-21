// Bots: stand-in opponents when nobody else is around. Versus is same-seed play with streamed scores, so a bot
// doesn't play the game; it streams a believable score curve. Bots are always shown as bots, never rated and never
// recorded as ghosts.
//
// Difficulty is "medium": a bot aims at what a player of this skill typically scores, so the human wins about half
// the time. Skill comes from, in order of preference:
//   1. the human's personal best on this game (sent with their first score): typical run ≈ 88% of best;
//   2. recorded ghost runs for this game, scaled by the human's rating;
//   3. nothing known: the bot paces itself on the human's live score.
// Each bot also gets its own luck (±~13%), so results vary from round to round.
import type { GhostRun } from '../../src/platform/versus/protocol';

const ADJ = ['Swift', 'Quiet', 'Bright', 'Lucky', 'Clever', 'Calm', 'Brave', 'Sunny', 'Keen', 'Nimble', 'Steady', 'Bold'];
const NOUN = ['Otter', 'Falcon', 'Fox', 'Heron', 'Lynx', 'Panda', 'Koi', 'Wren', 'Orca', 'Moth', 'Hare', 'Owl'];

export const BOT_PREFIX = 'bot-';
export const isBot = (pid: string) => pid.startsWith(BOT_PREFIX);

/** Quick match: a bot steps in after this long without a human opponent. */
export const BOT_QUEUE_MS = 5_000;
/** Parties: empty seats start filling with bots after FILL_START_MS and are all filled by FILL_END_MS. */
export const FILL_START_MS = 15_000;
export const FILL_END_MS = 20_000;

/** Typical run as a share of personal best: a medium bot aims here. */
export const MEDIUM_OF_BEST = 0.88;

export interface BotBrain {
  /** Final score the bot is heading for; null = pace on the humans' live scores. */
  target: number | null;
  /** Personal luck multiplier (also used in pacing mode). */
  luck: number;
  /** Normalised curve shape: [t 0..1, share of final 0..1], from a ghost run when available. */
  shape: Array<[number, number]> | null;
  /** Score granularity, so bots don't show odd numbers in games that score in tens. */
  step: number;
  /** Highest level the bot reports at the end of the round. */
  topLevel: number;
}

export type Rand = () => number;

export function botIdentity(rand: Rand = Math.random) {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const id = Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]).join('');
  return { pid: BOT_PREFIX + id, name: `${pick(ADJ)} ${pick(NOUN)}` };
}

/** Bot rating shown in the room: close to the humans it plays. */
export const botRating = (humanRating: number, rand: Rand = Math.random) => Math.max(100, Math.round(humanRating + (rand() * 2 - 1) * 40));

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Ghost runs come from all players; the average player is ~1000, and each 600 points of rating is ~±100% score. */
export const ratingScale = (rating: number) => Math.min(1.6, Math.max(0.6, 1 + (rating - 1000) / 600));

export function makeBrain(opts: { best?: number; rating: number; ghosts: GhostRun[]; rand?: Rand }): BotBrain {
  const rand = opts.rand ?? Math.random;
  const luck = 0.87 + rand() * 0.26; // 0.87–1.13
  const ghosts = opts.ghosts.filter((g) => g.score > 0 && g.timeline.length >= 3);
  let ref: number | null = null;
  if (opts.best && opts.best > 0) ref = opts.best * MEDIUM_OF_BEST;
  else if (ghosts.length) ref = median(ghosts.map((g) => g.score)) * ratingScale(opts.rating);
  const g = ghosts.length ? ghosts[Math.floor(rand() * ghosts.length)] : null;
  const shape = g ? normaliseShape(g) : null;
  const target = ref === null ? null : Math.max(1, ref * luck);
  const step = target !== null && target >= 400 ? 10 : 1;
  return { target, luck, shape, step, topLevel: 2 + Math.floor(rand() * 4) };
}

function normaliseShape(g: GhostRun): Array<[number, number]> {
  const T = Math.max(1, g.timeline[g.timeline.length - 1][0]);
  const S = Math.max(1, g.score);
  return g.timeline.map(([t, s]) => [Math.min(1, t / T), Math.min(1, s / S)]);
}

/** Share of the final score reached at progress x (0..1) of the round. */
export function shareAt(shape: BotBrain['shape'], x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (!shape || shape.length < 2) return x ** 1.08; // slightly back-loaded, like a staircase warming up
  let prev: [number, number] = [0, 0];
  for (const p of shape) {
    if (p[0] >= x) {
      const span = p[0] - prev[0] || 1;
      return prev[1] + ((x - prev[0]) / span) * (p[1] - prev[1]);
    }
    prev = p;
  }
  return prev[1] + (1 - prev[1]) * ((x - prev[0]) / (1 - prev[0] || 1));
}

/**
 * The bot's score at `elapsed` ms into a round of `roundMs`. Never goes down. In pacing mode it projects the
 * humans' current pace to the end of the round and follows that, so it stays competitive without knowing the game.
 */
export function botScore(b: BotBrain, elapsed: number, roundMs: number, prev: number, humanLive: number, rand: Rand = Math.random): number {
  const x = Math.min(1, Math.max(0, elapsed / roundMs));
  let want: number;
  if (b.target !== null) want = b.target * shareAt(b.shape, x);
  else {
    // Pacing: early on just shadow the human; later aim at their projected finish.
    const projected = x < 0.15 ? humanLive : humanLive / Math.max(x, 0.15);
    want = projected * b.luck * shareAt(null, x);
  }
  // Scores arrive in bursts in real games: sometimes hold, sometimes catch up.
  if (x < 1 && rand() < 0.3) return prev;
  const next = Math.max(prev, Math.round(want / b.step) * b.step);
  return next;
}

export const botLevel = (b: BotBrain, elapsed: number, roundMs: number) => 1 + Math.floor(Math.min(1, elapsed / roundMs) * (b.topLevel - 1) + 1e-9);
