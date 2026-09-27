/** Pure breath-pacing rules for Still Water (engine-free). Times in seconds. */

export type PhaseKind = 'in' | 'holdIn' | 'out' | 'holdOut';
export interface Phase {
  kind: PhaseKind;
  dur: number;
}

export type PaceId = '4-4' | '4-6' | 'box';
export const PACES: Record<PaceId, { label: string; phases: Phase[] }> = {
  '4-4': {
    label: 'Even 4·4',
    phases: [
      { kind: 'in', dur: 4 },
      { kind: 'out', dur: 4 },
    ],
  },
  '4-6': {
    label: 'Long out 4·6',
    phases: [
      { kind: 'in', dur: 4 },
      { kind: 'out', dur: 6 },
    ],
  },
  box: {
    label: 'Box 4·4·4·4',
    phases: [
      { kind: 'in', dur: 4 },
      { kind: 'holdIn', dur: 4 },
      { kind: 'out', dur: 4 },
      { kind: 'holdOut', dur: 4 },
    ],
  },
};

export const PHASE_WORDS: Record<PhaseKind, string> = {
  in: 'Breathe in',
  holdIn: 'Hold',
  out: 'Breathe out',
  holdOut: 'Rest',
};

export const cycleLength = (phases: Phase[]) => phases.reduce((a, p) => a + p.dur, 0);

export interface BreathState {
  cycle: number;
  index: number;
  kind: PhaseKind;
  /** 0..1 progress through the current phase. */
  p: number;
  /** Seconds since the phase began. */
  since: number;
  /** Lotus openness 0..1. */
  open: number;
  /** Whether the player should be holding. */
  hold: boolean;
}

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function breathAt(phases: Phase[], t: number): BreathState {
  const len = cycleLength(phases);
  const tt = Math.max(0, t);
  const cycle = Math.floor(tt / len);
  let r = tt - cycle * len;
  let index = 0;
  while (index < phases.length - 1 && r >= phases[index].dur) {
    r -= phases[index].dur;
    index++;
  }
  const ph = phases[index];
  const p = Math.min(1, r / ph.dur);
  let open = 0;
  if (ph.kind === 'in') open = easeInOutSine(p);
  else if (ph.kind === 'holdIn') open = 1;
  else if (ph.kind === 'out') open = 1 - easeInOutSine(p);
  return { cycle, index, kind: ph.kind, p, since: r, open, hold: ph.kind === 'in' || ph.kind === 'holdIn' };
}

/** A breath counts as in sync when the input matched the guide for at least this share of evaluated time. */
export const SYNC_THRESHOLD = 0.7;
/** Seconds at the start of each phase that are not evaluated (people need time to react). */
export const GRACE = 0.8;

export const BLOOM_EVERY = 5;

/** Spots on the pond for new small lotuses (x, z, scale). */
export const BLOOM_SPOTS: Array<[number, number, number]> = [
  [-2.2, 1.4, 0.7],
  [2.3, 1.0, 0.66],
  [-1.5, -2.3, 0.6],
  [1.7, -2.6, 0.58],
  [-3.4, -0.6, 0.55],
  [3.4, -0.9, 0.55],
  [0.4, 2.9, 0.62],
  [-0.6, -4.0, 0.5],
  [3.6, 2.6, 0.55],
  [-3.7, 2.4, 0.55],
];
