import type { Rng } from '@/sdk';

/** Pure rules for Shoal (engine-free). All positions are in a normalized unit disk; the scene maps to an ellipse. */
export const MAX_FISH = 16;
export const MAX_LEVEL = 12;
export const TRIALS = 8;
/** Soft boundary radius for swimming fish. */
export const BOUND = 0.9;

export interface LevelDef {
  fish: number;
  tagged: number;
  trackMs: number;
  /** Total swirl rotation in radians over the tracking phase. */
  swirl: number;
  wander: number;
  freq: number;
  flashOuts: boolean;
  occluders: number;
}

export function levelDef(level: number): LevelDef {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  const speed = 1 + (l - 1) * 0.09;
  return {
    fish: Math.min(MAX_FISH, 8 + (l - 1)),
    tagged: Math.min(5, 2 + Math.floor((l - 1) / 3)),
    trackMs: Math.min(10000, 5000 + (l - 1) * 450),
    swirl: Math.PI * 1.1 * speed,
    wander: 0.26 + l * 0.012,
    freq: 0.9 + l * 0.1,
    flashOuts: l >= 9,
    occluders: l >= 7 ? 2 : 0,
  };
}

export interface Wave {
  ax: number;
  fx: number;
  px: number;
  ay: number;
  fy: number;
  py: number;
}
export interface FishPath {
  sx: number;
  sy: number;
  /** End position pre-rotated by −swirl, so that after the swirl the fish lands exactly on its end point. */
  ex: number;
  ey: number;
  waves: Wave[];
}
export interface Occluder {
  x: number;
  y: number;
  r: number;
}
export interface Trial {
  count: number;
  paths: FishPath[];
  theta: number;
  tagged: number[];
  occluders: Occluder[];
  /** Final (freeze) positions, for convenience. */
  end: Array<[number, number]>;
}

function scatter(rng: Rng, n: number, minD: number, occ: Occluder[]): Array<[number, number]> {
  let best: Array<[number, number]> = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const pts: Array<[number, number]> = [];
    let tries = 0;
    while (pts.length < n && tries < 4000) {
      tries++;
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * 0.84;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (occ.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + 0.12)) continue;
      if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < minD)) continue;
      pts.push([x, y]);
    }
    if (pts.length === n) return pts;
    if (pts.length > best.length) best = pts;
    minD *= 0.93;
  }
  // fallback (should not happen): fill remaining anywhere
  while (best.length < n) best.push([(rng.next() - 0.5) * 1.2, (rng.next() - 0.5) * 1.2]);
  return best;
}

/** Deterministic trial from the seeded RNG: start/end points well separated, crossing swirl paths in between. */
export function makeTrial(rng: Rng, def: LevelDef, reduced = false): Trial {
  const n = def.fish;
  const occluders: Occluder[] = [];
  for (let k = 0; k < def.occluders; k++) {
    const a = rng.next() * Math.PI * 2 + k * Math.PI;
    const r = 0.35 + rng.next() * 0.3;
    occluders.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.2 });
  }
  const minD = Math.max(0.26, Math.min(0.36, 0.95 / Math.sqrt(n)));
  const starts = scatter(rng, n, minD, occluders);
  const ends = scatter(rng, n, minD, occluders);
  const theta = def.swirl * (rng.chance(0.5) ? 1 : -1) * (reduced ? 0.75 : 1);
  const c = Math.cos(-theta);
  const s = Math.sin(-theta);
  const paths: FishPath[] = starts.map(([sx, sy], i) => {
    const [ex0, ey0] = ends[i];
    const waves: Wave[] = [];
    for (let k = 0; k < 2; k++) {
      const amp = def.wander * (0.5 + rng.next() * 0.5) * (k ? 0.55 : 1) * (reduced ? 0.7 : 1);
      const f = def.freq * (0.6 + rng.next() * 0.8) * (k ? 1.9 : 1) * (reduced ? 0.7 : 1);
      waves.push({ ax: amp, fx: f, px: rng.next() * Math.PI * 2, ay: amp, fy: f * (0.8 + rng.next() * 0.4), py: rng.next() * Math.PI * 2 });
    }
    return { sx, sy, ex: ex0 * c - ey0 * s, ey: ex0 * s + ey0 * c, waves };
  });
  const tagged = rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, def.tagged);
  return { count: n, paths, theta, tagged, occluders, end: ends };
}

const TAU = Math.PI * 2;

/** Position of fish i at tracking progress u ∈ [0, 1]. Writes into out[0], out[1]. */
export function fishPos(tr: Trial, i: number, u: number, out: [number, number]): [number, number] {
  const p = tr.paths[i];
  const uu = Math.max(0, Math.min(1, u));
  const sm = uu * uu * (3 - 2 * uu);
  let x = p.sx + (p.ex - p.sx) * sm;
  let y = p.sy + (p.ey - p.sy) * sm;
  const env = Math.sin(Math.PI * uu);
  for (const w of p.waves) {
    x += env * w.ax * Math.sin(TAU * w.fx * uu + w.px);
    y += env * w.ay * Math.cos(TAU * w.fy * uu + w.py);
  }
  // swirl eases in and out, landing exactly on theta at u = 1
  const ang = tr.theta * (uu - Math.sin(TAU * uu) / TAU);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let rx = x * c - y * s;
  let ry = x * s + y * c;
  const r = Math.hypot(rx, ry);
  if (r > BOUND - 0.06) {
    const k = BOUND - 0.06 + 0.06 * Math.tanh((r - (BOUND - 0.06)) / 0.06);
    rx *= k / r;
    ry *= k / r;
  }
  out[0] = rx;
  out[1] = ry;
  return out;
}

export function trialScore(hits: number, tagged: number): number {
  const base = hits * 25;
  return hits === tagged ? base * 2 : base;
}

/** Keyboard labels for up to 16 fish. */
export const FISH_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'];
export const keyText = (code: string) => code.replace('Digit', '').replace('Key', '');
