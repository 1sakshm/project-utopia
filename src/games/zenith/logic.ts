import type { Rng } from '@/sdk';

/** Pure rules for Zenith (engine-free). Angles in radians, times in ms unless noted. */

export const RING_R = [1.75, 2.4, 3.05];
export const MAX_WAVES = 10;
export const BASE_WIN = { perfect: 30, great: 70, good: 120 };
export const POINTS = [100, 60, 30];
export const GRADE_NAMES = ['Perfect', 'Great', 'Good'];

export interface LevelDef {
  rings: number;
  /** Angular speed near the gate, rad/s. */
  omega: number;
  gapMs: number;
  /** Width of the arc hidden by the moon (0 = no moon). */
  occlusion: number;
  /** Seconds between the comet leaving the moon and reaching the gate. */
  reappearSec: number;
  accel: boolean;
  reverse: boolean;
}

export function levelDef(level: number, timingMult = 1): LevelDef {
  const L = Math.max(1, Math.min(10, level));
  const slow = 1 + (timingMult - 1) * 0.5;
  return {
    rings: L >= 6 ? 3 : L >= 3 ? 2 : 1,
    omega: (1.7 + (L - 1) * 0.17) / slow,
    gapMs: (1450 - (L - 1) * 60) * slow,
    occlusion: L >= 4 ? Math.min(0.72, 0.45 + (L - 4) * 0.05) : 0,
    reappearSec: L >= 4 ? Math.max(0.2, 0.42 - (L - 4) * 0.035) : 0,
    accel: L >= 5,
    reverse: L >= 7,
  };
}

export interface Comet {
  id: number;
  ring: number;
  dir: 1 | -1;
  tGate: number;
  /** Far speed / near speed (rad/s) and switch time (s before gate). */
  w1: number;
  w2: number;
  ts: number;
  spawnTau: number;
  /** 0 pending, 1 flying, 2 hit, 3 missed */
  state: 0 | 1 | 2 | 3;
  tRes: number;
  mx: number;
  my: number;
  vx: number;
  vy: number;
  ticks: number;
}

/** Angular distance before the gate at tau seconds before the gate crossing (negative after). */
export function offAt(c: Comet, tau: number): number {
  if (tau <= c.ts) return c.w2 * tau;
  return c.w2 * c.ts + c.w1 * (tau - c.ts);
}

/** Orbit angle (0 = +x, PI/2 = top gate). */
export function angleAt(c: Comet, tau: number): number {
  return Math.PI / 2 + c.dir * offAt(c, tau);
}

function spawnTauFor(w1: number, w2: number, ts: number, travel: number): number {
  if (travel <= w2 * ts) return travel / w2;
  return ts + (travel - w2 * ts) / w1;
}

let nextId = 1;

export function makeWave(rng: Rng, def: LevelDef, count: number, startMs: number, ringDirs: Array<1 | -1>): Comet[] {
  const out: Comet[] = [];
  const lastGate = [-1e9, -1e9, -1e9];
  const sameRingGap = Math.max(1050, def.gapMs * 0.95);
  let t = startMs;
  for (let i = 0; i < count; i++) {
    t += i === 0 ? 0 : def.gapMs * (0.78 + rng.next() * 0.44);
    let ring = rng.int(0, def.rings - 1);
    if (t - lastGate[ring] < sameRingGap) {
      const free: number[] = [];
      for (let r = 0; r < def.rings; r++) if (t - lastGate[r] >= sameRingGap) free.push(r);
      if (free.length) ring = rng.pick(free);
      else {
        let best = 0;
        for (let r = 1; r < def.rings; r++) if (lastGate[r] < lastGate[best]) best = r;
        ring = best;
        t = lastGate[best] + sameRingGap;
      }
    }
    lastGate[ring] = t;
    // Inner rings spin a little faster in angle so linear speeds stay comparable.
    const w = def.omega * (RING_R[1] / RING_R[ring]) ** 0.5;
    let w1 = w;
    let w2 = w;
    let ts = 0;
    if (def.accel && rng.chance(0.4)) {
      ts = 0.55;
      if (rng.chance(0.6)) {
        w1 = w * 0.62;
        w2 = w * 1.2;
      } else {
        w1 = w * 1.35;
        w2 = w * 0.82;
      }
    }
    const travel = Math.PI * (1.25 + rng.next() * 0.2);
    out.push({
      id: nextId++,
      ring,
      dir: ringDirs[ring],
      tGate: t,
      w1,
      w2,
      ts,
      spawnTau: spawnTauFor(w1, w2, ts, travel),
      state: 0,
      tRes: 0,
      mx: 0,
      my: 0,
      vx: 0,
      vy: 0,
      ticks: 0,
    });
  }
  return out;
}

export interface Windows {
  perfect: number;
  great: number;
  good: number;
  /** Beyond good but inside this: counts as an early/late miss for that comet. */
  miss: number;
}

export function windows(timingMult: number): Windows {
  const m = Math.max(1, timingMult);
  return { perfect: BASE_WIN.perfect * m, great: BASE_WIN.great * m, good: BASE_WIN.good * m, miss: BASE_WIN.good * m + 150 };
}

/** 0 perfect, 1 great, 2 good, 3 miss */
export function gradeFor(absMs: number, w: Windows): 0 | 1 | 2 | 3 {
  if (absMs <= w.perfect) return 0;
  if (absMs <= w.great) return 1;
  if (absMs <= w.good) return 2;
  return 3;
}

export const comboMult = (combo: number) => 1 + Math.min(4, Math.floor(combo / 5)) * 0.5;

export function cometsInWave(wave: number) {
  return 5 + Math.floor(wave / 2);
}

/** Histogram of signed errors: 8 bins of 30 ms from -120 to +120. */
export function histogram(errors: number[], bins = 8, range = 120): number[] {
  const h = new Array<number>(bins).fill(0);
  for (const e of errors) {
    const k = Math.floor(((Math.max(-range, Math.min(range - 0.001, e)) + range) / (2 * range)) * bins);
    h[k]++;
  }
  return h;
}
