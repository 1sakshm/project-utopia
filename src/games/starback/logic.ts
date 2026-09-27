import type { Rng } from '@/sdk';

/** Pure rules for Starback (engine-free). */
export const POSITIONS = 8;
export const ROUNDS = 3;
export const MAX_N = 6;

export interface RoundDef {
  n: number;
  length: number;
  intervalMs: number;
  lureRate: number;
  targetRate: number;
}

/** Sub-level 0..3 within an N: shorter interval and more lures. */
export function roundDef(n: number, sub: number): RoundDef {
  const s = Math.max(0, Math.min(3, sub));
  return {
    n,
    length: 20 + n,
    intervalMs: Math.round(2500 - s * 230),
    lureRate: 0.12 + s * 0.1,
    targetRate: 0.3,
  };
}

/** Composite level (1-based) ↔ (N, sub). */
export const levelOf = (n: number, sub: number) => (n - 1) * 4 + sub + 1;
export function fromLevel(level: number): { n: number; sub: number } {
  const l = Math.max(1, Math.min(MAX_N * 4, Math.round(level)));
  return { n: Math.floor((l - 1) / 4) + 1, sub: (l - 1) % 4 };
}

/**
 * Generate a position sequence with an exact number of targets (matches N back).
 * Non-targets are sometimes "lures" (match N−1 or N+1 back) to discourage familiarity-based guessing.
 */
export function makeSequence(rng: Rng, def: RoundDef, forcedTargets?: number[]): { seq: number[]; targets: boolean[] } {
  const { n, length } = def;
  const eligible = length - n;
  const nTargets = Math.max(1, Math.round(eligible * def.targetRate));
  const targetIdx = new Set<number>(forcedTargets ?? []);
  if (!forcedTargets) {
    const pool = rng.shuffle(Array.from({ length: eligible }, (_, i) => i + n));
    for (const i of pool) {
      if (targetIdx.size >= nTargets) break;
      targetIdx.add(i);
    }
  }
  const seq: number[] = [];
  const targets: boolean[] = [];
  for (let i = 0; i < length; i++) {
    if (i >= n && targetIdx.has(i)) {
      seq.push(seq[i - n]);
      targets.push(true);
      continue;
    }
    const forbid = i >= n ? seq[i - n] : -1;
    let p = -1;
    if (i > n && rng.chance(def.lureRate)) {
      const lureA = n > 1 ? seq[i - (n - 1)] : -1;
      const lureB = i - (n + 1) >= 0 ? seq[i - (n + 1)] : -1;
      const opts = [lureA, lureB].filter((v) => v >= 0 && v !== forbid);
      if (opts.length) p = rng.pick(opts);
    }
    if (p < 0) {
      do {
        p = rng.int(0, POSITIONS - 1);
      } while (p === forbid || (i > 0 && p === seq[i - 1] && rng.chance(0.7)));
    }
    seq.push(p);
    targets.push(false);
  }
  return { seq, targets };
}

export interface Tally {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
}

export const accuracyOf = (t: Tally) => {
  const total = t.hits + t.misses + t.falseAlarms + t.correctRejections;
  return total ? (t.hits + t.correctRejections) / total : 0;
};

/** Between-round N adjustment (PRD: ≥85% → N+1, <60% → N−1, otherwise faster rhythm within N). */
export function nextLevel(n: number, sub: number, acc: number): { n: number; sub: number } {
  if (acc >= 0.85) return n < MAX_N ? { n: n + 1, sub: 0 } : { n, sub: Math.min(3, sub + 1) };
  if (acc < 0.6) return n > 1 ? { n: n - 1, sub: 1 } : { n, sub: 0 };
  return { n, sub: Math.min(3, sub + 1) };
}

export interface Constellation {
  name: string;
  pts: Array<[number, number]>;
  edges: Array<[number, number]>;
}

/** 24 hand-plotted constellation artworks in a [-1, 1] box (y up). */
export const CONSTELLATIONS: Constellation[] = [
  { name: 'Whale', pts: [[-0.95, 0.05], [-0.55, 0.35], [0.05, 0.4], [0.5, 0.2], [0.78, 0.02], [1, 0.35], [1, -0.28], [0.4, -0.22], [-0.4, -0.25]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [4, 7], [7, 8], [8, 0]] },
  { name: 'Fox', pts: [[-1, 0.2], [-0.75, 0.75], [-0.5, 0.4], [0.2, 0.35], [0.55, 0.2], [1, 0.55], [0.85, 0], [0.45, -0.55], [-0.35, -0.55], [-0.55, 0]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 4], [4, 7], [2, 9], [9, 8], [9, 0]] },
  { name: 'Heron', pts: [[-1, 0.75], [-0.7, 0.7], [-0.5, 0.3], [-0.2, 0.1], [0.6, 0], [0.2, 0.3], [0, -0.4], [-0.05, -0.95], [0.25, -0.95]], edges: [[0, 1], [1, 2], [2, 3], [3, 5], [5, 4], [4, 3], [3, 6], [6, 7], [6, 8]] },
  { name: 'Deer', pts: [[-0.95, 0.35], [-0.6, 0.45], [-0.75, 0.95], [-0.4, 0.9], [0.5, 0.2], [0.8, 0.1], [0.75, -0.8], [-0.35, -0.8], [-0.45, 0]], edges: [[0, 1], [1, 2], [1, 3], [1, 8], [8, 4], [4, 5], [5, 6], [8, 7]] },
  { name: 'Owl', pts: [[-0.45, 0.9], [0.45, 0.9], [-0.55, 0.4], [0.55, 0.4], [0, 0.25], [-0.5, -0.4], [0.5, -0.4], [0, -0.85]], edges: [[0, 2], [1, 3], [0, 4], [1, 4], [2, 5], [3, 6], [5, 7], [6, 7]] },
  { name: 'Hare', pts: [[-0.55, 1], [-0.2, 0.95], [-0.45, 0.35], [-0.8, 0.25], [0.25, 0.25], [0.75, 0.05], [0.5, -0.55], [-0.3, -0.5]], edges: [[0, 2], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [6, 7], [7, 2]] },
  { name: 'Turtle', pts: [[-0.55, 0.1], [-0.15, 0.45], [0.4, 0.4], [0.7, 0], [0.3, -0.35], [-0.3, -0.3], [-0.95, 0.2], [0.6, -0.7], [-0.4, -0.7]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [4, 7], [5, 8]] },
  { name: 'Koi', pts: [[-1, 0], [-0.5, 0.3], [0.2, 0.25], [0.6, 0], [1, 0.4], [1, -0.35], [0.2, -0.25], [-0.5, -0.3], [-0.2, 0.7]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [3, 6], [6, 7], [7, 0], [1, 8]] },
  { name: 'Bear', pts: [[-1, 0.1], [-0.6, 0.55], [0, 0.5], [0.8, 0.35], [0.8, -0.6], [0.2, -0.2], [-0.5, -0.6], [-0.55, 0.15]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]] },
  { name: 'Swan', pts: [[-0.95, 0.55], [-0.7, 0.8], [-0.5, 0.4], [-0.5, 0], [-0.3, -0.3], [0.9, -0.1], [0.4, 0.45], [0.1, 0.2]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 3]] },
  { name: 'Cat', pts: [[-0.8, 0.9], [-0.35, 0.9], [-0.6, 0.35], [0.4, 0.3], [0.95, 0.9], [0.55, -0.6], [-0.4, -0.6], [-0.57, 0.62]], edges: [[0, 7], [1, 7], [0, 2], [1, 2], [2, 3], [3, 4], [3, 5], [2, 6]] },
  { name: 'Dragonfly', pts: [[0, 0.95], [0, 0.5], [0, -1], [-0.95, 0.75], [-0.9, 0.25], [0.95, 0.75], [0.9, 0.25], [0, -0.3]], edges: [[0, 1], [1, 7], [7, 2], [1, 3], [3, 4], [4, 1], [1, 5], [5, 6], [6, 1]] },
  { name: 'Lotus', pts: [[0, -0.6], [-0.9, 0.1], [-0.45, 0.55], [0, 0.9], [0.45, 0.55], [0.9, 0.1], [-0.5, -0.85], [0.5, -0.85]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [6, 7]] },
  { name: 'Crane', pts: [[-1, 0.5], [-0.5, 0.1], [0, 0], [0.5, 0.1], [1, 0.5], [0, 0.45], [0, 0.9], [0, -0.6]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [2, 7]] },
  { name: 'Serpent', pts: [[-1, 0.55], [-0.8, 0.3], [-0.5, 0.5], [-0.2, 0.1], [0.1, -0.3], [0.45, -0.1], [0.7, 0.35], [1, 0.1], [-0.8, 0.85]], edges: [[8, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
  { name: 'Butterfly', pts: [[0, 0.4], [0, -0.5], [-0.9, 0.8], [-0.7, -0.6], [0.9, 0.8], [0.7, -0.6], [-0.3, 0], [0.3, 0]], edges: [[0, 1], [0, 2], [2, 6], [6, 3], [3, 1], [0, 4], [4, 7], [7, 5], [5, 1]] },
  { name: 'Kite', pts: [[0, 1], [0.6, 0.3], [0, -0.3], [-0.6, 0.3], [0.2, -0.6], [-0.1, -0.85], [0.15, -1]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [2, 4], [4, 5], [5, 6]] },
  { name: 'Sailboat', pts: [[0, 1], [0, -0.4], [-0.7, -0.3], [0.6, -0.3], [-0.9, -0.5], [0.9, -0.5], [-0.6, -0.85], [0.6, -0.85]], edges: [[0, 1], [0, 2], [2, 1], [0, 3], [4, 5], [4, 6], [6, 7], [7, 5]] },
  { name: 'Hummingbird', pts: [[-1, 0.3], [-0.5, 0.25], [0, 0], [0.8, -0.5], [0.3, 0.9], [0.6, 0.5], [-0.1, -0.35]], edges: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 2], [1, 6], [6, 3]] },
  { name: 'Octopus', pts: [[0, 0.9], [-0.45, 0.4], [0.45, 0.4], [-0.9, -0.6], [-0.35, -0.95], [0.35, -0.95], [0.9, -0.6], [0, 0.1]], edges: [[0, 1], [0, 2], [1, 7], [2, 7], [1, 3], [7, 4], [7, 5], [2, 6]] },
  { name: 'Firebird', pts: [[0, 0.95], [0, 0.55], [-1, 0.6], [1, 0.6], [-0.55, 0.1], [0.55, 0.1], [0, 0], [-0.35, -0.95], [0.35, -0.95], [0, -0.8]], edges: [[0, 1], [1, 2], [2, 4], [4, 6], [1, 3], [3, 5], [5, 6], [1, 6], [6, 7], [6, 8], [6, 9]] },
  { name: 'Seahorse', pts: [[-0.6, 0.8], [-0.15, 0.85], [0.1, 0.6], [0.25, 0.1], [-0.2, -0.05], [0.15, -0.5], [-0.15, -0.8], [-0.35, -0.55]], edges: [[0, 1], [1, 2], [2, 3], [3, 5], [5, 6], [6, 7], [1, 4], [4, 5]] },
  { name: 'Wolf', pts: [[-0.4, 1], [-0.05, 0.75], [-0.55, 0.7], [0.1, 0.35], [-0.4, 0.1], [0.7, 0.1], [1, -0.2], [0.6, -0.8], [-0.35, -0.8]], edges: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [5, 6], [5, 7], [4, 8], [4, 3]] },
  { name: 'Hawk', pts: [[0, 0.8], [0, 0.2], [0, -0.6], [-0.3, -0.9], [0.3, -0.9], [-1, 0.35], [-0.55, -0.05], [1, 0.35], [0.55, -0.05]], edges: [[0, 1], [1, 2], [2, 3], [2, 4], [1, 5], [5, 6], [6, 1], [1, 7], [7, 8], [8, 1]] },
];

export function scoreHit(n: number) {
  return 10 * n;
}
export const FALSE_ALARM_PENALTY = 5;
