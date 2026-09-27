// Pure rules for Upstream (Eriksen flanker task). No engine imports.
import type { Rng } from '@/sdk';

export type Dir = 'R' | 'L' | 'U' | 'D';
export type Cond = 'congruent' | 'incongruent' | 'neutral';

export const ANGLE: Record<Dir, number> = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
export const VEC: Record<Dir, [number, number]> = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
export const OPP: Record<Dir, Dir> = { R: 'L', L: 'R', U: 'D', D: 'U' };
export const DIR_WORD: Record<Dir, string> = { R: 'right', L: 'left', U: 'up', D: 'down' };

export interface LevelParams {
  count: 5 | 7 | 9;
  fourDir: boolean;
  incongruent: number;
  neutral: number;
  windowMs: number; // before timingMultiplier
  offCenterLead: number; // probability the crowned lead is not in the centre
  current: number; // 0..1 drift strength
}

export function levelParams(level: number): LevelParams {
  const L = Math.max(1, Math.min(14, level));
  const t = (L - 1) / 13;
  return {
    count: L <= 4 ? 5 : L <= 9 ? 7 : 9,
    fourDir: L >= 6,
    incongruent: 0.3 + 0.3 * t,
    neutral: 0.2,
    windowMs: 2000 - 1200 * t,
    offCenterLead: L >= 8 ? 0.35 : 0,
    current: L >= 10 ? (L - 9) / 5 : 0,
  };
}

/** Formation slots in grid units; index 0 is the centre. */
export const FORMATIONS: Record<5 | 7 | 9, Array<Array<[number, number]>>> = {
  5: [
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
    [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]],
  ],
  7: [
    [[0, 0], [-1, 0], [1, 0], [-0.5, -1], [0.5, -1], [-0.5, 1], [0.5, 1]],
    [[0, 0], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]],
  ],
  9: [
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]],
  ],
};

export interface Trial {
  cond: Cond;
  lead: Dir;
  flank: Dir | 'still'; // 'still' = lily pads (neutral in 4-direction mode)
  perpendicular: boolean; // neutral in 2-direction mode: flankers face up/down
  slots: Array<[number, number]>;
  leadSlot: number;
}

export function makeTrial(rng: Rng, level: number): Trial {
  const P = levelParams(level);
  const dirs: Dir[] = P.fourDir ? ['R', 'L', 'U', 'D'] : ['R', 'L'];
  const lead = rng.pick(dirs);
  const r = rng.next();
  const cond: Cond = r < P.incongruent ? 'incongruent' : r < P.incongruent + P.neutral ? 'neutral' : 'congruent';
  let flank: Trial['flank'] = lead;
  let perpendicular = false;
  if (cond === 'incongruent') flank = OPP[lead];
  else if (cond === 'neutral') {
    if (P.fourDir) flank = 'still';
    else {
      flank = 'U';
      perpendicular = true;
    }
  }
  const slots = rng.pick(FORMATIONS[P.count]);
  const leadSlot = rng.chance(P.offCenterLead) ? rng.int(1, slots.length - 1) : 0;
  return { cond, lead, flank, perpendicular, slots, leadSlot };
}
