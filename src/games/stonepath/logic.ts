import type { Rng } from '@/sdk';

/** Pure Tower-of-London rules for Stonepath (engine-free). */

/** A state is an array of pillars, each a list of stone ids from bottom to top. */
export type State = number[][];

export interface LevelDef {
  stones: number;
  caps: number[];
  minMoves: number;
  hidden: boolean;
}

export function levelDef(level: number): LevelDef {
  const L = Math.max(1, Math.min(12, level));
  const table: LevelDef[] = [
    { stones: 3, caps: [3, 2, 1], minMoves: 2, hidden: false },
    { stones: 3, caps: [3, 2, 1], minMoves: 3, hidden: false },
    { stones: 3, caps: [3, 2, 1], minMoves: 4, hidden: false },
    { stones: 3, caps: [3, 2, 1], minMoves: 5, hidden: false },
    { stones: 4, caps: [3, 2, 2], minMoves: 5, hidden: false },
    { stones: 4, caps: [3, 2, 2], minMoves: 6, hidden: false },
    { stones: 4, caps: [3, 2, 2], minMoves: 6, hidden: true },
    { stones: 4, caps: [3, 2, 2, 1], minMoves: 7, hidden: false },
    { stones: 5, caps: [4, 3, 2], minMoves: 7, hidden: false },
    { stones: 5, caps: [4, 3, 2], minMoves: 8, hidden: true },
    { stones: 5, caps: [3, 3, 2, 1], minMoves: 8, hidden: false },
    { stones: 5, caps: [4, 3, 2], minMoves: 9, hidden: true },
  ];
  return table[L - 1];
}

export const keyOf = (s: State) => s.map((p) => p.join(',')).join('|');

export const clone = (s: State): State => s.map((p) => p.slice());

export function canMove(s: State, caps: number[], from: number, to: number): boolean {
  return from !== to && s[from].length > 0 && s[to].length < caps[to];
}

export function applyMove(s: State, from: number, to: number): State {
  const n = clone(s);
  n[to].push(n[from].pop()!);
  return n;
}

export function neighbors(s: State, caps: number[]): Array<{ from: number; to: number; state: State }> {
  const out: Array<{ from: number; to: number; state: State }> = [];
  for (let a = 0; a < s.length; a++)
    for (let b = 0; b < s.length; b++) if (canMove(s, caps, a, b)) out.push({ from: a, to: b, state: applyMove(s, a, b) });
  return out;
}

/** BFS distances from `root` to every reachable state (moves are reversible, so this is also distance-to-root). */
export function distances(root: State, caps: number[]): Map<string, { d: number; s: State }> {
  const map = new Map<string, { d: number; s: State }>();
  map.set(keyOf(root), { d: 0, s: root });
  const q: State[] = [root];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const d = map.get(keyOf(cur))!.d;
    for (const n of neighbors(cur, caps)) {
      const k = keyOf(n.state);
      if (!map.has(k)) {
        map.set(k, { d: d + 1, s: n.state });
        q.push(n.state);
      }
    }
  }
  return map;
}

/** Minimum number of moves between two states. */
export function minMoves(a: State, b: State, caps: number[]): number {
  return distances(b, caps).get(keyOf(a))?.d ?? -1;
}

export function randomState(rng: Rng, stones: number, caps: number[]): State {
  const s: State = caps.map(() => []);
  const ids = rng.shuffle(Array.from({ length: stones }, (_, i) => i));
  for (const id of ids) {
    const open = caps.map((c, i) => (s[i].length < c ? i : -1)).filter((i) => i >= 0);
    s[rng.pick(open)].push(id);
  }
  return s;
}

export interface Puzzle {
  start: State;
  goal: State;
  caps: number[];
  min: number;
  /** distance-to-goal for every state (used by the ghost and hints). */
  dist: Map<string, { d: number; s: State }>;
}

export function makePuzzle(rng: Rng, def: LevelDef): Puzzle {
  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const goal = randomState(rng, def.stones, def.caps);
    const dist = distances(goal, def.caps);
    const exact: State[] = [];
    let maxD = 0;
    for (const v of dist.values()) maxD = Math.max(maxD, v.d);
    const want = Math.min(def.minMoves, maxD);
    for (const v of dist.values()) if (v.d === want) exact.push(v.s);
    if (!exact.length) continue;
    const p: Puzzle = { start: rng.pick(exact), goal, caps: def.caps, min: want, dist };
    if (want === def.minMoves) return p;
    if (!best || p.min > best.min) best = p;
  }
  return best!;
}

/** One optimal move from `s` toward the goal (or null if solved). */
export function bestMove(p: Puzzle, s: State): { from: number; to: number } | null {
  const d = p.dist.get(keyOf(s))?.d ?? 0;
  if (d === 0) return null;
  for (const n of neighbors(s, p.caps)) if ((p.dist.get(keyOf(n.state))?.d ?? 99) === d - 1) return { from: n.from, to: n.to };
  return null;
}

export function scoreFor(extra: number, golden: boolean): number {
  return Math.max(20, 100 - extra * 10) + (golden ? 50 : 0);
}
