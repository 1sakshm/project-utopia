import type { Rng } from '@/sdk';

/**
 * Pure rules for Silhouette (engine-free).
 * A sculpture is a polycube: a list of integer voxels. The shadow is the orthographic projection along z
 * onto the wall (x, y), compared as a normalized 2D bitset key (never pixels).
 * Rotations are 90° about world axes, matching three.js conventions (right-handed, +angle = counter-clockwise
 * looking down the axis toward the origin).
 */

export type V3 = [number, number, number];
export type Axis = 'Y' | 'X' | 'Z';
export type Move = 'Y+' | 'Y-' | 'X+' | 'X-' | 'Z+' | 'Z-';

export const MOVES_FOR: Record<number, Move[]> = {
  1: ['Y+', 'Y-'],
  2: ['Y+', 'Y-', 'X+', 'X-'],
  3: ['Y+', 'Y-', 'X+', 'X-', 'Z+', 'Z-'],
};

export function rot(v: V3, m: Move): V3 {
  const [x, y, z] = v;
  switch (m) {
    case 'Y+':
      return [z, y, -x];
    case 'Y-':
      return [-z, y, x];
    case 'X+':
      return [x, -z, y];
    case 'X-':
      return [x, z, -y];
    case 'Z+':
      return [-y, x, z];
    case 'Z-':
      return [y, -x, z];
  }
}

export const rotAll = (vs: V3[], m: Move): V3[] => vs.map((v) => rot(v, m));

export function normalize(vs: V3[]): V3[] {
  let mx = Infinity;
  let my = Infinity;
  let mz = Infinity;
  for (const [x, y, z] of vs) {
    mx = Math.min(mx, x);
    my = Math.min(my, y);
    mz = Math.min(mz, z);
  }
  return vs.map(([x, y, z]) => [x - mx, y - my, z - mz] as V3).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

export const shapeKey = (vs: V3[]) => normalize(vs).map((v) => v.join(',')).join(';');

/** Shadow cells (x, y), normalized, deduped, sorted. */
export function projection(vs: V3[]): Array<[number, number]> {
  let mx = Infinity;
  let my = Infinity;
  for (const [x, y] of vs) {
    mx = Math.min(mx, x);
    my = Math.min(my, y);
  }
  const set = new Set<string>();
  const out: Array<[number, number]> = [];
  for (const [x, y] of vs) {
    const k = `${x - mx},${y - my}`;
    if (!set.has(k)) {
      set.add(k);
      out.push([x - mx, y - my]);
    }
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export const projKey = (vs: V3[]) => projection(vs).map((c) => c.join(',')).join(';');

export function randomPolycube(rng: Rng, n: number, flat = false): V3[] {
  const vs: V3[] = [[0, 0, 0]];
  const has = new Set(['0,0,0']);
  const dirs: V3[] = flat
    ? [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
      ]
    : [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
  let guard = 0;
  while (vs.length < n && guard++ < 500) {
    const b = rng.pick(vs);
    const d = rng.pick(dirs);
    const v: V3 = [b[0] + d[0], b[1] + d[1], b[2] + d[2]];
    const k = v.join(',');
    if (has.has(k)) continue;
    has.add(k);
    vs.push(v);
  }
  return vs;
}

export interface Node {
  vs: V3[];
  d: number;
  parent: string | null;
  move: Move | null;
}

/** BFS over orientations reachable with the given moves. */
export function bfs(start: V3[], moves: Move[]): Map<string, Node> {
  const map = new Map<string, Node>();
  const k0 = shapeKey(start);
  map.set(k0, { vs: start, d: 0, parent: null, move: null });
  const q = [k0];
  for (let i = 0; i < q.length; i++) {
    const cur = map.get(q[i])!;
    for (const m of moves) {
      const nv = rotAll(cur.vs, m);
      const k = shapeKey(nv);
      if (!map.has(k)) {
        map.set(k, { vs: nv, d: cur.d + 1, parent: q[i], move: m });
        q.push(k);
      }
    }
  }
  return map;
}

/** Shortest move sequence from `vs` to any orientation whose shadow equals `target`. */
export function solve(vs: V3[], target: string, moves: Move[]): Move[] | null {
  const map = bfs(vs, moves);
  let best: string | null = null;
  let bd = Infinity;
  for (const [k, n] of map) if (n.d < bd && projKey(n.vs) === target) {
    bd = n.d;
    best = k;
  }
  if (best === null) return null;
  const path: Move[] = [];
  let k: string | null = best;
  while (k) {
    const n: Node = map.get(k)!;
    if (n.move) path.push(n.move);
    k = n.parent;
  }
  return path.reverse();
}

export interface LevelDef {
  blocks: number;
  axes: 1 | 2 | 3;
  dist: number;
  chiral: boolean;
}

export function levelDef(level: number): LevelDef {
  const L = Math.max(1, Math.min(12, level));
  return {
    blocks: Math.min(8, 3 + Math.floor(L / 2)),
    axes: L <= 2 ? 1 : L <= 6 ? 2 : 3,
    dist: Math.min(3, 1 + Math.floor((L + 1) / 3)),
    chiral: L >= 5,
  };
}

export interface RotatePuzzle {
  shape: V3[]; // starting orientation (original coordinates)
  target: string; // projection key
  targetCells: Array<[number, number]>;
  optimal: number;
  moves: Move[];
}

export function makeRotatePuzzle(rng: Rng, def: LevelDef): RotatePuzzle {
  const moves = MOVES_FOR[def.axes];
  let fallback: RotatePuzzle | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const shape = randomPolycube(rng, def.blocks);
    // start from a random full orientation so shapes don't always look "flat"
    let s = shape;
    for (let k = rng.int(0, 5); k > 0; k--) s = rotAll(s, rng.pick(MOVES_FOR[3]));
    const map = bfs(s, moves);
    const startProj = projKey(s);
    // minimal distance for each distinct projection
    const projDist = new Map<string, number>();
    for (const n of map.values()) {
      const pk = projKey(n.vs);
      projDist.set(pk, Math.min(projDist.get(pk) ?? Infinity, n.d));
    }
    if (projDist.size < 3) continue;
    const cands: string[] = [];
    let maxD = 0;
    for (const [pk, d] of projDist) if (pk !== startProj) maxD = Math.max(maxD, d);
    const want = Math.min(def.dist, maxD);
    for (const [pk, d] of projDist) if (pk !== startProj && d === want && pk.split(';').length >= 3) cands.push(pk);
    if (!cands.length) continue;
    const target = rng.pick(cands);
    const p: RotatePuzzle = {
      shape: s,
      target,
      targetCells: target.split(';').map((c) => c.split(',').map(Number) as [number, number]),
      optimal: want,
      moves,
    };
    if (want === def.dist) return p;
    if (!fallback || p.optimal > fallback.optimal) fallback = p;
  }
  return fallback!;
}

export function allOrientations(vs: V3[]): V3[][] {
  return [...bfs(vs, MOVES_FOR[3]).values()].map((n) => n.vs);
}

export function canCast(vs: V3[], target: string): boolean {
  return allOrientations(vs).some((o) => projKey(o) === target);
}

export interface ChoicePuzzle {
  options: V3[][]; // shown orientations
  correct: number;
  target: string;
  targetCells: Array<[number, number]>;
}

export function makeChoicePuzzle(rng: Rng, def: LevelDef): ChoicePuzzle {
  const n = Math.max(4, Math.min(7, def.blocks));
  for (let attempt = 0; attempt < 300; attempt++) {
    const shape = randomPolycube(rng, n);
    const ors = allOrientations(shape);
    const t = rng.pick(ors);
    const target = projKey(t);
    if (target.split(';').length < 3) continue;
    // show the correct one in an orientation whose own shadow is different
    const shownCands = ors.filter((o) => projKey(o) !== target);
    if (!shownCands.length) continue;
    const correctShown = rng.pick(shownCands);
    const distractors: V3[][] = [];
    let tries = 0;
    while (distractors.length < 2 && tries++ < 60) {
      let d: V3[];
      if (def.chiral && distractors.length === 0 && rng.chance(0.7)) d = shape.map(([x, y, z]) => [-x, y, z] as V3);
      else d = randomPolycube(rng, n);
      if (canCast(d, target)) continue;
      if (shapeKey(d) === shapeKey(shape)) continue;
      const dors = allOrientations(d);
      distractors.push(rng.pick(dors));
    }
    if (distractors.length < 2) continue;
    const options = [correctShown, ...distractors];
    const order = rng.shuffle([0, 1, 2]);
    return {
      options: order.map((i) => options[i]),
      correct: order.indexOf(0),
      target,
      targetCells: target.split(';').map((c) => c.split(',').map(Number) as [number, number]),
    };
  }
  throw new Error('choice generation failed');
}
