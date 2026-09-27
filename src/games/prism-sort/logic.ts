import type { Rng } from '@/sdk';

/** Pure rules for Prism Sort (engine-free). */

/** Dimensions: 0 shape (tetra/cube/octa), 1 count (1–3), 2 pattern (smooth/striped/dotted), 3 orientation (upright/tilted). */
export type Spec = [number, number, number, number];
export const DIM_NAMES = ['shape', 'count', 'pattern', 'tilt'];
export const DIM_VALUES = [3, 3, 3, 2];
export const TRIALS = 40;

export interface LevelDef {
  dims: number[];
  /** Consecutive correct sorts before the hidden rule switches. */
  switchMin: number;
  switchMax: number;
  cued: boolean;
  cuedChance: number;
}

export function levelDef(level: number): LevelDef {
  const L = Math.max(1, Math.min(8, level));
  const dims = L >= 7 ? [0, 1, 2, 3] : L >= 3 ? [0, 1, 2] : [0, 2];
  const hi = Math.max(5, 8 - Math.floor((L - 1) / 2));
  return {
    dims,
    switchMin: Math.max(5, hi - 1),
    switchMax: hi,
    cued: L >= 5,
    cuedChance: L >= 8 ? 0.35 : L >= 6 ? 0.28 : 0.2,
  };
}

const DEFAULTS: Spec = [0, 0, 0, 0];

/** Two example crystals that differ on every active dimension. */
export function makeExamples(rng: Rng, dims: number[]): [Spec, Spec] {
  const a: Spec = [...DEFAULTS];
  const b: Spec = [...DEFAULTS];
  for (let d = 0; d < 4; d++) {
    if (!dims.includes(d)) continue;
    const vals = rng.shuffle(Array.from({ length: DIM_VALUES[d] }, (_, i) => i));
    a[d] = vals[0];
    b[d] = vals[1];
  }
  return [a, b];
}

/** Stimulus crystal whose rule-dimension value matches `target`'s example; other dims mostly conflict. */
export function makeCrystal(rng: Rng, ex: [Spec, Spec], dims: number[], rule: number, target: 0 | 1): Spec {
  const s: Spec = [...ex[0]];
  s[rule] = ex[target][rule];
  const others = dims.filter((d) => d !== rule);
  const conflictDim = others.length && rng.chance(0.85) ? rng.pick(others) : -1;
  for (const d of others) {
    const side = d === conflictDim ? 1 - target : rng.chance(0.5) ? target : 1 - target;
    s[d] = ex[side][d];
  }
  return s;
}

/** Which portal a crystal belongs to under a rule (-1 if neither example matches). */
export function portalFor(s: Spec, ex: [Spec, Spec], rule: number): -1 | 0 | 1 {
  if (s[rule] === ex[0][rule]) return 0;
  if (s[rule] === ex[1][rule]) return 1;
  return -1;
}

export function pickNewRule(rng: Rng, dims: number[], current: number): number {
  const opts = dims.filter((d) => d !== current);
  return opts.length ? rng.pick(opts) : current;
}

export const streakMult = (streak: number) => 1 + Math.min(4, Math.floor(streak / 4)) * 0.5;
