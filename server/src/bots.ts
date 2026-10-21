// Stand-in opponents. Versus is same-seed play with streamed scores, so a stand-in doesn't run the game: it plays a
// simulated session of that game, trial by trial, using the game's real scoring (points per correct answer, how long a
// trial takes, how accurate a player at that level is; see gameProfiles.ts). Its score therefore moves the way a
// person's does: in the game's own increments, at the game's own pace, with misses and pauses.
//
// Difficulty is "medium": the stand-in aims at what this player typically scores, so the human wins about half the
// time. The aim comes from, in order: the human's personal best on the game (a typical run is ~88% of best); recorded
// runs of that game scaled by rating; or the game's own average-player profile scaled by rating.
import type { GhostRun } from '../../src/platform/versus/protocol';
import { slugHandle } from '../../src/platform/versus/handles';
import { profileFor, type GameProfile } from './gameProfiles';

const ADJ = ['Swift', 'Quiet', 'Bright', 'Lucky', 'Clever', 'Calm', 'Brave', 'Sunny', 'Keen', 'Nimble', 'Steady', 'Bold'];
const NOUN = ['Otter', 'Falcon', 'Fox', 'Heron', 'Lynx', 'Panda', 'Koi', 'Wren', 'Orca', 'Moth', 'Hare', 'Owl'];
/** Free and common orb skins, weighted toward the defaults most players keep. */
const SKINS = ['skin-aurora', 'skin-aurora', 'skin-aurora', 'skin-classic', 'skin-classic', 'skin-sunrise', 'skin-lagoon', 'skin-ember', 'skin-frost', 'skin-nebula'];

/** Quick match: a stand-in steps in after this long without a human opponent. */
export const BOT_QUEUE_MS = 5_000;
/** Parties: empty seats start filling after FILL_START_MS and are all filled by FILL_END_MS. */
export const FILL_START_MS = 15_000;
export const FILL_END_MS = 20_000;
/** Typical run as a share of personal best: a medium opponent aims here. */
export const MEDIUM_OF_BEST = 0.88;

export type Rand = () => number;

export function botIdentity(rand: Rand = Math.random) {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  // Same shapes as real players: 20-char id, a two-word name, a slug handle that sometimes has digits.
  const pid = Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]).join('');
  const name = `${pick(ADJ)} ${pick(NOUN)}`;
  const base = slugHandle(name);
  const handle = rand() < 0.65 ? `${base.slice(0, 15)}${Math.floor(10 + rand() * 990)}` : base;
  return { pid, name, handle, skin: pick(SKINS) };
}

/** Rating shown for a stand-in: close to the humans it plays. */
export const botRating = (humanRating: number, rand: Rand = Math.random) => Math.max(100, Math.round(humanRating + (rand() * 2 - 1) * 45));

/** Each 600 rating points is about ±100% score, clamped. */
export const ratingScale = (rating: number) => Math.min(1.6, Math.max(0.6, 1 + (rating - 1000) / 600));

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** One scored moment in the stand-in's session: at `t` ms the score becomes `s` and the level `l`. */
export type BotEvent = [t: number, s: number, l: number];

export interface BotPlan {
  events: BotEvent[];
  final: number;
  /** The run ended before the minute was up (out of lives / session finished), at this time. */
  endedAt?: number;
}

/** Small seeded PRNG so a plan can be re-simulated with different skill and the same luck. */
export function mulberry(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Play one session of a game. `skill` scales speed and accuracy around the average player (1 = average).
 * The staircase is simulated too: levels go up after a run of correct answers and down after misses, which changes
 * the points per answer and the trial length the way the real game does.
 */
export function simulate(p: GameProfile, roundMs: number, skill: number, seed: number): BotPlan {
  const rand = mulberry(seed);
  const raw: BotEvent[] = [];
  const speed = Math.min(1.6, Math.max(0.55, skill)); // faster players fit more trials into the minute
  const accBoost = (skill - 1) * 0.35;
  const pick = (opts: Array<[number, number]>) => {
    let x = rand() * opts.reduce((n, o) => n + o[1], 0);
    for (const [v, w] of opts) if ((x -= w) <= 0) return v;
    return opts[opts.length - 1][0];
  };
  const quietUntil = (t: number) => {
    for (const [a, b] of p.quiet ?? []) if (t >= a && t < b) return b;
    return t;
  };
  const roundTo = (x: number) => Math.round(x / p.step) * p.step;
  let t = p.firstScoreMs * (1 + rand() * 0.2); // never sooner than the game allows
  let score = 0;
  let level = 1;
  let streak = 0;
  let missed = 0;
  let trials = 0;
  let endedAt: number | undefined;
  const bonuses = [...(p.bonusAt ?? [])];
  const [cMin, cMean, cMax] = p.cadenceMs;
  for (let guard = 0; guard < 600; guard++) {
    if (guard > 0) {
      // Trial length: skewed around the mean, a little longer at higher levels, shorter for quicker players.
      const u = (rand() + rand()) / 2;
      const base = u < 0.5 ? cMin + (cMean - cMin) * (u * 2) : cMean + (cMax - cMean) * ((u - 0.5) * 2);
      t += (base * (1 + (level - 1) * (p.levelSlowdown ?? 0.03))) / speed;
    }
    t = quietUntil(t);
    while (bonuses.length && bonuses[0][0] <= t) {
      const [bt, lo, hi] = bonuses.shift()!;
      score += roundTo(lo + (hi - lo) * Math.min(1, Math.max(0, 0.5 + (skill - 1) + (rand() - 0.5) * 0.6)));
      raw.push([bt, score, level]);
    }
    if (t > roundMs) break;
    trials++;
    const acc = Math.min(0.97, Math.max(0.15, p.accuracy + accBoost - (level - 1) * (p.levelAccuracyDrop ?? 0.012)));
    if (rand() < acc) {
      streak++;
      let pts = p.quadratic ? p.quadratic * (level + 1) ** 2 : p.outcomes ? pick(p.outcomes) : p.points;
      pts += p.perLevel * (level - 1);
      if (p.jitter) pts += Math.round((rand() * 2 - 1) * p.jitter);
      if (p.streakBonus) pts += Math.min(streak - 1, p.streakCap ?? 5) * p.streakBonus;
      if (p.streakMult) pts *= Math.min(p.streakMult.cap, 1 + Math.floor(streak / p.streakMult.every) * p.streakMult.step);
      score += Math.max(p.step, roundTo(pts));
      if (Number.isFinite(p.levelEveryCorrect) && streak % Math.max(1, Math.round(p.levelEveryCorrect)) === 0) level++;
    } else {
      streak = 0;
      missed++;
      if (level > 1 && Number.isFinite(p.levelEveryCorrect)) level--;
      if (p.missOutcomes) score += roundTo(pick(p.missOutcomes) * (p.perLevel && p.points ? 1 + (p.perLevel * (level - 1)) / p.points : 1));
      if (p.missPenalty) score = Math.max(0, score - p.missPenalty);
    }
    raw.push([Math.round(t + (p.reportLagMs ?? 0)), score, level]);
    if ((p.lives && missed >= p.lives) || (p.sessionTrials && trials >= p.sessionTrials)) {
      endedAt = Math.round(t + 1500); // the game's own wrap-up before it ends
      break;
    }
  }
  // Only moments where something visible changed are sent, like the real HUD.
  const events: BotEvent[] = [];
  for (const e of raw.sort((a, b) => a[0] - b[0])) {
    const last = events[events.length - 1];
    if (e[0] > roundMs) break;
    if (!last || last[1] !== e[1] || last[2] !== e[2]) events.push(e);
  }
  return { events, final: events.length ? events[events.length - 1][1] : 0, endedAt: endedAt !== undefined && endedAt < roundMs ? endedAt : undefined };
}

export interface BrainInput {
  gameId: string;
  roundMs: number;
  /** Human personal best on this game (0/undefined = unknown). */
  best?: number;
  rating: number;
  ghosts: GhostRun[];
  rand?: Rand;
}

/**
 * Choose a skill that makes this session land near a medium target, keeping the luck (seed) fixed so the
 * outcome isn't a foregone conclusion.
 */
export function planFor(o: BrainInput): BotPlan {
  const rand = o.rand ?? Math.random;
  const p = profileFor(o.gameId);
  const seed = Math.floor(rand() * 2 ** 31);
  const luck = 0.88 + rand() * 0.24; // 0.88–1.12
  let target: number | null = null;
  if (o.best && o.best > 0) target = o.best * MEDIUM_OF_BEST;
  else {
    const g = o.ghosts.filter((x) => x.score > 0);
    if (g.length >= 3) target = median(g.map((x) => x.score)) * ratingScale(o.rating);
  }
  if (target === null) return simulate(p, o.roundMs, ratingScale(o.rating) ** 0.5 * luck, seed);
  target *= luck;
  // Expected final for a skill level (averaged over a few seeds), then bisect for the target.
  const expected = (k: number) => {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += simulate(p, o.roundMs, k, seed + i * 7919).final;
    return sum / 6;
  };
  let lo = 0.5;
  let hi = 1.7;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (expected(mid) < target) lo = mid;
    else hi = mid;
  }
  return simulate(p, o.roundMs, (lo + hi) / 2, seed);
}

/** Score and level at `elapsed` ms: the last event that has happened. */
export function stateAt(plan: BotPlan, elapsed: number): { s: number; l: number } {
  let s = 0;
  let l = 1;
  for (const [t, ss, ll] of plan.events) {
    if (t > elapsed) break;
    s = ss;
    l = ll;
  }
  return { s, l };
}
