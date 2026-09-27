// Orbit Keeper — pure, deterministic fixed-step kinematics and course generation (no engine imports).

export const STEP = 1 / 120; // seconds per physics step
export const PLANET_R = 0.72;
export const R_MIN = 1.12;
export const R_MAX = 2.62;
export const MOON_R = 0.085;

export interface Params {
  omega: number; // rad/s
  ringHW: number; // ring half-width (radial)
  spacing: number; // rad between rings
  variance: number; // max radial change between rings
  asteroidChance: number;
  moving: boolean;
  heavy: boolean;
}

export function paramsFor(level: number, timingMultiplier: number): Params {
  const L = Math.max(1, Math.min(10, level));
  const tm = Math.max(1, timingMultiplier);
  return {
    omega: (0.72 + 0.055 * (L - 1)) / tm,
    ringHW: (0.34 - 0.017 * (L - 1)) * (1 + (tm - 1) * 0.5),
    spacing: Math.max(0.55, 0.95 - 0.042 * (L - 1)),
    variance: 0.32 + 0.085 * (L - 1),
    asteroidChance: Math.min(0.65, 0.2 + 0.05 * L),
    moving: L >= 4,
    heavy: L >= 6,
  };
}

export interface Moon {
  theta: number; // unwrapped angle
  r: number;
  vr: number;
}

export interface HeavyZone {
  start: number; // angle mod 2π
  width: number;
}

const V_IN = 1.15;
const V_OUT = 0.95;
const ACCEL = 7.5;

export function heavyAt(zones: HeavyZone[], theta: number): boolean {
  const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  for (const z of zones) {
    const d = (((t - z.start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (d < z.width) return true;
  }
  return false;
}

/** Advance the moon by one fixed step. */
export function stepMoon(m: Moon, holding: boolean, omega: number, heavy: boolean) {
  const pullK = heavy ? 1.45 : 1;
  const driftK = heavy ? 0.6 : 1;
  const target = holding ? -V_IN * pullK : V_OUT * driftK;
  const a = ACCEL * (holding ? pullK : 1);
  const dv = target - m.vr;
  const maxDv = a * STEP;
  m.vr += Math.max(-maxDv, Math.min(maxDv, dv));
  m.r += m.vr * STEP;
  if (m.r < R_MIN) {
    m.r = R_MIN;
    if (m.vr < 0) m.vr = 0;
  } else if (m.r > R_MAX) {
    m.r = R_MAX;
    if (m.vr > 0) m.vr = 0;
  }
  m.theta += omega * STEP;
}

export interface CourseItem {
  kind: 'ring' | 'rock';
  phi: number; // unwrapped angle
  rho: number; // base radius
  size: number; // ring half-width or rock radius
  wobble: number; // radial oscillation amplitude (moving rocks)
  wobbleRate: number;
  seed: number;
}

/** Radius of an item at time t (moving rocks oscillate). */
export const itemRadius = (it: CourseItem, t: number) => it.rho + (it.wobble ? Math.sin(t * it.wobbleRate + it.seed * 6.283) * it.wobble : 0);

/**
 * Generate the next ring (and possibly rocks in the gap before it) after `lastPhi`/`lastRho`.
 * `rand` is a seeded [0,1) function so the course is reproducible.
 */
export function nextSegment(lastPhi: number, lastRho: number, p: Params, omega: number, rand: () => number, densityK = 1): CourseItem[] {
  const out: CourseItem[] = [];
  const spacing = p.spacing * (0.85 + rand() * 0.3) / densityK;
  const phi = lastPhi + spacing;
  const dt = spacing / Math.max(0.2, omega);
  const reach = 0.75 * Math.min(V_IN, V_OUT) * dt;
  const maxStep = Math.min(p.variance, reach);
  const lo = R_MIN + p.ringHW * 0.6;
  const hi = R_MAX - p.ringHW * 0.6;
  let rho = lastRho + (rand() * 2 - 1) * maxStep;
  if (rho < lo) rho = lo + (lo - rho) * 0.5;
  if (rho > hi) rho = hi - (rho - hi) * 0.5;
  rho = Math.max(lo, Math.min(hi, rho));
  // rocks in the gap: off the straight path, so overshooting is what gets punished
  if (rand() < p.asteroidChance) {
    const n = rand() < 0.3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const f = 0.35 + rand() * 0.3;
      const pathR = lastRho + (rho - lastRho) * f;
      const side = (pathR - R_MIN) / (R_MAX - R_MIN) > 0.5 ? -1 : rand() < 0.5 ? -1 : 1;
      const size = 0.13 + rand() * 0.07;
      const off = p.ringHW + size + MOON_R + 0.05 + rand() * 0.3 + i * 0.28;
      let rr = pathR + side * off;
      if (rr < R_MIN - 0.02 || rr > R_MAX + 0.02) rr = pathR - side * off;
      if (rr < R_MIN - 0.02 || rr > R_MAX + 0.02) continue;
      const moving = p.moving && rand() < 0.4;
      out.push({
        kind: 'rock',
        phi: lastPhi + spacing * f + (i ? 0.08 : 0),
        rho: rr,
        size,
        wobble: moving ? 0.12 + rand() * 0.08 : 0,
        wobbleRate: 1.2 + rand() * 1.2,
        seed: rand(),
      });
    }
  }
  out.push({ kind: 'ring', phi, rho, size: p.ringHW, wobble: 0, wobbleRate: 0, seed: rand() });
  return out;
}

/** Harmony level from the streak of consecutive rings. */
export const HARMONY_STEP = 3;
export const MAX_HARMONY = 4;
