// Pure rules for Night Harbor (no engine imports).
import type { Rng } from '@/sdk';

export type Lamp = 0 | 1 | 2; // 0 = ▲ triangle, 1 = ● circle, 2 = ■ square
export type Pattern = [Lamp, Lamp, Lamp];
export type ShipKind = 'target' | 'lure' | 'plain';

export const LAMP_NAMES = ['triangle', 'circle', 'square'] as const;
export const LAMP_GLYPH = ['▲', '●', '■'] as const;

export const patternText = (p: Pattern) => p.map((l) => LAMP_GLYPH[l]).join(' ');
export const patternWords = (p: Pattern) => p.map((l) => LAMP_NAMES[l]).join(', ');
const same = (a: Pattern, b: Pattern) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const hamming = (a: Pattern, b: Pattern) => (a[0] !== b[0] ? 1 : 0) + (a[1] !== b[1] ? 1 : 0) + (a[2] !== b[2] ? 1 : 0);
const sorted = (p: Pattern) => [...p].sort().join('');

/** A signal uses exactly two lamp shapes (e.g. ▲ ● ▲) so both lure types are always possible. */
export function makeSignal(rng: Rng): Pattern {
  const a = rng.int(0, 2) as Lamp;
  let b = rng.int(0, 2) as Lamp;
  while (b === a) b = rng.int(0, 2) as Lamp;
  const odd = rng.int(0, 2);
  const p: Pattern = [a, a, a];
  p[odd] = b;
  return p;
}

export interface LevelParams {
  targetRate: number;
  lureRate: number;
  orderLure: number; // probability a lure differs by order instead of by one lamp
  crossMs: number; // time to cross the harbor (before timingMultiplier)
  speedJitter: number; // ± fraction of crossMs
  gapMin: number;
  gapJitter: number;
  clear: number; // fraction of the lane outside the fog banks (1 = no fog)
}

export function levelParams(level: number): LevelParams {
  const t = Math.max(0, Math.min(1, (level - 1) / 11));
  return {
    targetRate: 0.2 - 0.12 * t,
    lureRate: 0.12 + 0.18 * t,
    orderLure: level < 5 ? 0 : level < 9 ? 0.5 : 0.75,
    crossMs: 7200 - 3200 * t,
    speedJitter: 0.05 + 0.2 * t,
    gapMin: 1500 - 600 * t,
    gapJitter: 1000 + 2400 * t,
    clear: level < 4 ? 1 : 1 - 0.5 * ((level - 4) / 8),
  };
}

export function lureOf(rng: Rng, signal: Pattern, byOrder: boolean): Pattern {
  if (byOrder) {
    const perms: Pattern[] = [];
    const idx = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (const [a, b, c] of idx) {
      const p: Pattern = [signal[a], signal[b], signal[c]];
      if (!same(p, signal) && !perms.some((q) => same(q, p))) perms.push(p);
    }
    if (perms.length) return rng.pick(perms);
  }
  const p: Pattern = [...signal] as Pattern;
  const i = rng.int(0, 2);
  let v = rng.int(0, 2) as Lamp;
  while (v === p[i]) v = rng.int(0, 2) as Lamp;
  p[i] = v;
  return p;
}

export function plainOf(rng: Rng, signal: Pattern): Pattern {
  for (let k = 0; k < 50; k++) {
    const p: Pattern = [rng.int(0, 2) as Lamp, rng.int(0, 2) as Lamp, rng.int(0, 2) as Lamp];
    if (hamming(p, signal) >= 2 && sorted(p) !== sorted(signal)) return p;
  }
  const p: Pattern = [((signal[0] + 1) % 3) as Lamp, ((signal[1] + 1) % 3) as Lamp, signal[2]];
  return p;
}

/** Inverse standard normal CDF (Acklam's approximation). */
function zInv(p: number) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** d′ with log-linear correction, mapped to a friendly 1–5 lamp "watch quality". */
export function watchQuality(hits: number, targets: number, fas: number, nonTargets: number) {
  const H = (hits + 0.5) / (targets + 1);
  const F = (fas + 0.5) / (nonTargets + 1);
  const d = zInv(H) - zInv(F);
  return { dprime: d, lamps: Math.max(1, Math.min(5, Math.round(1 + d / 0.8))) };
}
