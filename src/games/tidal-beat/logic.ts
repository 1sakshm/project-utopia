// Tidal Beat — pure timing rules (no engine imports).

export type Grade = 'perfect' | 'great' | 'good' | 'miss';

export interface Windows {
  perfect: number; // seconds (half-width)
  great: number;
  good: number;
}

export function windowsFor(level: number, timingMultiplier: number): Windows {
  const L = Math.max(1, Math.min(10, level));
  const p = (50 - ((L - 1) / 9) * 25) / 1000; // ±50 → ±25 ms
  const k = Math.max(1, timingMultiplier);
  return { perfect: p * k, great: p * 2 * k, good: Math.min(0.2, p * 3.6 * k) };
}

export function grade(errSec: number, w: Windows): Grade {
  const e = Math.abs(errSec);
  if (e <= w.perfect) return 'perfect';
  if (e <= w.great) return 'great';
  if (e <= w.good) return 'good';
  return 'miss';
}

export const GRADE_POINTS: Record<Grade, number> = { perfect: 100, great: 70, good: 40, miss: 0 };

export interface RoundSpec {
  bpm: number;
  syncBeats: number;
  contBeats: number;
  pattern: number[] | null; // 8 eighth-note slots, 1 = tap
  patternBeats: number;
}

const PATTERNS: number[][][] = [
  // quarter-note patterns with rests (tap-tap-rest-tap)
  [
    [1, 0, 1, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 1, 0, 1, 0],
  ],
  // eighths
  [
    [1, 0, 1, 1, 0, 0, 1, 0],
    [1, 1, 0, 0, 1, 0, 1, 0],
  ],
  // syncopation
  [
    [1, 0, 0, 1, 0, 0, 1, 0],
    [1, 0, 1, 0, 0, 1, 0, 1],
  ],
];

export function roundSpec(level: number, round: number, rand: () => number, preview = false): RoundSpec {
  const L = Math.max(1, Math.min(10, level));
  const base = 68 + (L - 1) * 5.5;
  const bpm = Math.round(Math.max(60, Math.min(140, base + [6, 26, 14][round % 3])));
  const beatSec = 60 / bpm;
  const round4 = (n: number) => Math.max(4, Math.round(n / 4) * 4);
  if (preview) return { bpm, syncBeats: 8, contBeats: 8, pattern: null, patternBeats: 0 };
  const syncBeats = round4(20 / beatSec);
  const contSec = 10 + ((L - 1) / 9) * 20; // 10 → 30 s
  const contBeats = round4(contSec / beatSec);
  let pattern: number[] | null = null;
  if (L >= 4) {
    const tier = L >= 8 ? 2 : L >= 6 ? 1 : 0;
    const set = PATTERNS[tier];
    pattern = set[Math.floor(rand() * set.length)];
  }
  const patternBeats = pattern ? round4(10 / beatSec) : 0;
  return { bpm, syncBeats, contBeats, pattern, patternBeats };
}

export interface ContinuationResult {
  taps: number;
  valid: boolean; // enough regular intervals to judge
  meanIti: number;
  cv: number; // coefficient of variation of inter-tap intervals
  steadiness: number; // 0..100
  drift: number; // signed % (negative = sped up)
}

/** Analyse continuation taps (seconds, sorted) against the target beat period. */
export function analyseContinuation(taps: number[], period: number): ContinuationResult {
  const itis: number[] = [];
  for (let i = 1; i < taps.length; i++) {
    const d = taps[i] - taps[i - 1];
    if (d > period * 0.5 && d < period * 1.8) itis.push(d);
  }
  if (itis.length < 3) return { taps: taps.length, valid: false, meanIti: period, cv: 1, steadiness: 0, drift: 0 };
  const mean = itis.reduce((a, b) => a + b, 0) / itis.length;
  const sd = Math.sqrt(itis.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (itis.length - 1));
  const cv = sd / mean;
  // lapses (missing/extra taps) reduce steadiness too
  const expected = Math.max(1, taps.length - 1);
  const lapse = 1 - itis.length / expected;
  const steadiness = Math.round(100 * Math.max(0, Math.min(1, 1 - (cv - 0.02) / 0.13)) * (1 - lapse * 0.6));
  const drift = ((mean - period) / period) * 100; // negative = sped up (shorter intervals), positive = slowed down
  return { taps: taps.length, valid: true, meanIti: mean, cv, steadiness: Math.max(0, Math.min(100, steadiness)), drift };
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Deterministic-ish gaussian from a uniform source. */
export function gauss(rand: () => number): number {
  const u = Math.max(1e-6, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
