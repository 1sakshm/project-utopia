import type { Rng } from '@/sdk';

/** Pure game rules for Echo Garden (engine-free). */
export interface LevelDef {
  length: number;
  flowers: number;
  stepMs: number;
  reverseChance: number;
  wind: boolean;
}

export function levelDef(level: number): LevelDef {
  return {
    length: level + 2,
    flowers: Math.min(9, 4 + Math.floor((level - 1) / 2)),
    stepMs: Math.max(450, 800 - (level - 1) * 35),
    reverseChance: level >= 6 ? 0.3 : 0,
    wind: level >= 10,
  };
}

export function makeSequence(rng: Rng, length: number, flowers: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    let f = rng.int(0, flowers - 1);
    // avoid triple repeats, which feel unfair
    if (i >= 2 && seq[i - 1] === f && seq[i - 2] === f) f = (f + 1) % flowers;
    seq.push(f);
  }
  return seq;
}

export function scoreFor(length: number, reverse: boolean, replayed: boolean): number {
  return Math.round(length * 10 * (reverse ? 1.5 : 1) * (replayed ? 0.5 : 1));
}

/** Nine organic slots on the ground plane (x, z). */
export const SLOTS: Array<[number, number]> = [
  [-1.6, -1.6],
  [0.1, -2.0],
  [1.7, -1.4],
  [-1.9, 0.1],
  [0.0, 0.0],
  [1.8, 0.2],
  [-1.4, 1.8],
  [0.2, 1.9],
  [1.6, 1.7],
];

/** Order in which slots are filled as the flower count grows (keeps early layouts spacious). */
export const SLOT_ORDER = [0, 2, 6, 8, 4, 1, 7, 3, 5];
