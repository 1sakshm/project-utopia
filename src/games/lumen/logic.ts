import type { Rng } from '@/sdk';

/**
 * Pure rules for Lumen (engine-free): grid beam tracing + a reverse-generation puzzle generator.
 *
 * Directions: 0 = +x (east), 1 = +z (south), 2 = -x (west), 3 = -z (north).
 * A mirror is a one-sided wedge whose reflective face joins two adjacent sides r and r+1 (mod 4).
 * A beam entering through one of those sides leaves through the other; entering from the back it is blocked.
 * A prism (splitter) sends an incoming beam out to both perpendicular sides.
 * Crystals let the beam pass through (and wake up). Blocks stop the beam.
 */

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];

export type Cell =
  | { t: 'empty' }
  | { t: 'block' }
  | { t: 'mirror'; r: number; id: number }
  | { t: 'prism' }
  | { t: 'crystal'; id: number }
  | { t: 'source'; dir: number };

export interface Chamber {
  n: number;
  cells: Cell[]; // row-major: idx = z * n + x
  source: { x: number; z: number; dir: number };
  mirrors: Array<{ x: number; z: number }>; // index = mirror id
  crystals: Array<{ x: number; z: number }>;
  /** mirror rotations of the generated solution */
  solution: number[];
}

export interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  depth: number; // number of bounces before this segment (for animation delays)
}

export interface Trace {
  segments: Segment[];
  lit: boolean[];
  hitMirrors: Set<number>;
}

/** Exit direction when a beam traveling `d` enters wedge rotation `r`, or -1 if blocked. */
export function reflect(r: number, d: number): number {
  const side = (d + 2) % 4; // side we enter through
  if (side === r) return (r + 1) % 4;
  if (side === (r + 1) % 4) return r;
  return -1;
}

/** Wedge rotation that turns a beam traveling `din` into `dout` (perpendicular). */
export function wedgeFor(din: number, dout: number): number {
  const a = (din + 2) % 4;
  const b = dout;
  // {r, r+1} = {a, b}
  if ((a + 1) % 4 === b) return a;
  return b;
}

export function trace(ch: Chamber, rot: number[]): Trace {
  const { n, cells } = ch;
  const lit = ch.crystals.map(() => false);
  const hitMirrors = new Set<number>();
  const segments: Segment[] = [];
  const seen = new Set<number>();
  const stack: Array<{ x: number; z: number; d: number; depth: number }> = [{ x: ch.source.x, z: ch.source.z, d: ch.source.dir, depth: 0 }];
  let guard = 0;
  while (stack.length && guard++ < 64) {
    const b = stack.pop()!;
    let { x, z, d } = b;
    const sx = x;
    const sz = z;
    let endX = x;
    let endZ = z;
    let steps = 0;
    for (;;) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) {
        endX = x + DX[d] * 0.62;
        endZ = z + DZ[d] * 0.62;
        break;
      }
      x = nx;
      z = nz;
      steps++;
      const key = ((z * n + x) * 4 + d) | 0;
      if (seen.has(key)) {
        endX = x;
        endZ = z;
        break;
      }
      seen.add(key);
      const c = cells[z * n + x];
      if (c.t === 'block' || c.t === 'source') {
        endX = x - DX[d] * 0.5;
        endZ = z - DZ[d] * 0.5;
        break;
      }
      if (c.t === 'crystal') {
        lit[c.id] = true;
        continue;
      }
      if (c.t === 'mirror') {
        hitMirrors.add(c.id);
        const out = reflect(rot[c.id], d);
        if (out < 0) {
          endX = x - DX[d] * 0.28;
          endZ = z - DZ[d] * 0.28;
        } else {
          endX = x;
          endZ = z;
          stack.push({ x, z, d: out, depth: b.depth + 1 });
        }
        break;
      }
      if (c.t === 'prism') {
        endX = x;
        endZ = z;
        stack.push({ x, z, d: (d + 1) % 4, depth: b.depth + 1 });
        stack.push({ x, z, d: (d + 3) % 4, depth: b.depth + 1 });
        break;
      }
    }
    if (steps > 0 || endX !== sx || endZ !== sz) segments.push({ x0: sx, z0: sz, x1: endX, z1: endZ, depth: b.depth });
  }
  return { segments, lit, hitMirrors };
}

export const allLit = (t: Trace) => t.lit.every(Boolean);

export interface LevelDef {
  n: number;
  turns: number;
  prisms: number;
  decoys: number;
  blocks: number;
  extraCrystals: number;
}

export function levelDef(level: number): LevelDef {
  const L = Math.max(1, Math.min(12, level));
  return {
    n: Math.min(9, 5 + Math.floor((L - 1) / 2)),
    turns: Math.min(6, 2 + Math.floor((L - 1) / 2)),
    prisms: L >= 4 ? 1 : 0,
    decoys: Math.min(3, Math.floor(L / 3)),
    blocks: Math.min(6, 1 + Math.floor(L / 2)),
    extraCrystals: L >= 3 ? 1 : 0,
  };
}

/** Taps (clockwise only) to go from a to b. */
export const cwCost = (a: number, b: number) => (b - a + 4) % 4;

export interface Puzzle {
  chamber: Chamber;
  start: number[];
  /** Cheapest (clockwise taps) rotation set that lights every crystal. */
  best: number[];
  optimal: number;
}

function tryGenerate(rng: Rng, def: LevelDef): Chamber | null {
  const n = def.n;
  const cells: Cell[] = Array.from({ length: n * n }, () => ({ t: 'empty' }) as Cell);
  const used = new Uint8Array(n * n); // 0 free, 1 beam passes, 2 element
  const idx = (x: number, z: number) => z * n + x;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n;
  const mirrors: Array<{ x: number; z: number }> = [];
  const solution: number[] = [];
  const crystals: Array<{ x: number; z: number }> = [];
  const passCells: number[] = [];

  // source on an edge, pointing inward
  const side = rng.int(0, 3);
  const k = rng.int(1, n - 2);
  let sx = 0;
  let sz = 0;
  let sdir = 0;
  if (side === 0) [sx, sz, sdir] = [0, k, 0];
  else if (side === 1) [sx, sz, sdir] = [n - 1, k, 2];
  else if (side === 2) [sx, sz, sdir] = [k, 0, 1];
  else [sx, sz, sdir] = [k, n - 1, 3];
  cells[idx(sx, sz)] = { t: 'source', dir: sdir };
  used[idx(sx, sz)] = 2;

  let prismsLeft = def.prisms;

  // walk a beam; returns false if stuck
  const walk = (x: number, z: number, d: number, turns: number): boolean => {
    for (;;) {
      // go straight 1..3 cells (must be free or crossable)
      const maxRun: number[] = [];
      let cx = x;
      let cz = z;
      for (let s = 1; s <= n; s++) {
        cx += DX[d];
        cz += DZ[d];
        if (!inside(cx, cz) || used[idx(cx, cz)] === 2) break;
        maxRun.push(s);
      }
      if (!maxRun.length) return false;
      if (turns === 0) {
        // final run: crystal at the end of a run of >= 1
        const len = rng.pick(maxRun.slice(0, Math.min(maxRun.length, 4)));
        for (let s = 1; s < len; s++) {
          const i = idx(x + DX[d] * s, z + DZ[d] * s);
          if (!used[i]) {
            used[i] = 1;
            passCells.push(i);
          }
        }
        const ex = x + DX[d] * len;
        const ez = z + DZ[d] * len;
        const ei = idx(ex, ez);
        if (used[ei] === 1) return false; // don't put crystal on a crossing
        cells[ei] = { t: 'crystal', id: crystals.length };
        crystals.push({ x: ex, z: ez });
        used[ei] = 2;
        return true;
      }
      // choose a turning cell: prefer runs of 1..3, not on a crossing cell
      const options = maxRun.filter((s) => s <= 4 && used[idx(x + DX[d] * s, z + DZ[d] * s)] === 0);
      if (!options.length) return false;
      const len = rng.pick(options);
      for (let s = 1; s < len; s++) {
        const i = idx(x + DX[d] * s, z + DZ[d] * s);
        if (!used[i]) {
          used[i] = 1;
          passCells.push(i);
        }
      }
      const tx = x + DX[d] * len;
      const tz = z + DZ[d] * len;
      const ti = idx(tx, tz);
      const usePrism = prismsLeft > 0 && turns >= 2 && rng.chance(0.5);
      if (usePrism) {
        prismsLeft--;
        cells[ti] = { t: 'prism' };
        used[ti] = 2;
        const rest = turns - 1;
        const a = Math.ceil(rest / 2);
        const b = rest - a;
        return walk(tx, tz, (d + 1) % 4, a) && walk(tx, tz, (d + 3) % 4, b);
      }
      const out = rng.chance(0.5) ? (d + 1) % 4 : (d + 3) % 4;
      // make sure the turn has room
      const fx = tx + DX[out];
      const fz = tz + DZ[out];
      const alt = (out + 2) % 4;
      let dir = out;
      if (!inside(fx, fz) || used[idx(fx, fz)] === 2) {
        const ax = tx + DX[alt];
        const az = tz + DZ[alt];
        if (!inside(ax, az) || used[idx(ax, az)] === 2) return false;
        dir = alt;
      }
      const id = mirrors.length;
      cells[ti] = { t: 'mirror', r: wedgeFor(d, dir), id };
      mirrors.push({ x: tx, z: tz });
      solution.push(wedgeFor(d, dir));
      used[ti] = 2;
      x = tx;
      z = tz;
      d = dir;
      turns--;
    }
  };

  if (!walk(sx, sz, sdir, def.turns)) return null;
  if (prismsLeft > 0 && def.prisms > 0) return null;

  // extra crystal on a pass cell (beam passes through it in the solution)
  for (let e = 0; e < def.extraCrystals && passCells.length; e++) {
    const pick = rng.pick(passCells);
    if (cells[pick].t !== 'empty') continue;
    // skip crossings: only use cells crossed once (heuristic: neighbours check skipped, trace validates)
    cells[pick] = { t: 'crystal', id: crystals.length };
    crystals.push({ x: pick % n, z: Math.floor(pick / n) });
    used[pick] = 2;
  }

  const free: number[] = [];
  for (let i = 0; i < n * n; i++) if (!used[i]) free.push(i);
  rng.shuffle(free);
  for (let dcount = 0; dcount < def.decoys && free.length; dcount++) {
    const i = free.pop()!;
    const id = mirrors.length;
    const r = rng.int(0, 3);
    cells[i] = { t: 'mirror', r, id };
    mirrors.push({ x: i % n, z: Math.floor(i / n) });
    solution.push(r);
    used[i] = 2;
  }
  for (let b = 0; b < def.blocks && free.length; b++) {
    const i = free.pop()!;
    cells[i] = { t: 'block' };
    used[i] = 2;
  }
  const ch: Chamber = { n, cells, source: { x: sx, z: sz, dir: sdir }, mirrors, crystals, solution };
  if (!allLit(trace(ch, solution))) return null;
  return ch;
}

let scratchSeen = new Uint32Array(0);
let scratchLit = new Uint32Array(0);
let stamp = 0;
const bx: number[] = [];
const bz: number[] = [];
const bd: number[] = [];
/** Allocation-free check that every crystal is lit (used by the exhaustive solver). */
export function litAllFast(ch: Chamber, rot: number[]): boolean {
  const { n, cells } = ch;
  if (scratchSeen.length < n * n * 4) scratchSeen = new Uint32Array(n * n * 4);
  if (scratchLit.length < ch.crystals.length) scratchLit = new Uint32Array(Math.max(8, ch.crystals.length));
  stamp++;
  if (stamp > 0xfffffff0) {
    stamp = 1;
    scratchSeen.fill(0);
    scratchLit.fill(0);
  }
  let litCount = 0;
  let sp = 0;
  bx[0] = ch.source.x;
  bz[0] = ch.source.z;
  bd[0] = ch.source.dir;
  sp = 1;
  let guard = 0;
  while (sp > 0 && guard++ < 64) {
    sp--;
    let x = bx[sp];
    let z = bz[sp];
    let d = bd[sp];
    for (;;) {
      x += DX[d];
      z += DZ[d];
      if (x < 0 || z < 0 || x >= n || z >= n) break;
      const key = (z * n + x) * 4 + d;
      if (scratchSeen[key] === stamp) break;
      scratchSeen[key] = stamp;
      const c = cells[z * n + x];
      if (c.t === "empty") continue;
      if (c.t === "crystal") {
        if (scratchLit[c.id] !== stamp) {
          scratchLit[c.id] = stamp;
          litCount++;
        }
        continue;
      }
      if (c.t === "mirror") {
        const out = reflect(rot[c.id], d);
        if (out >= 0) {
          bx[sp] = x;
          bz[sp] = z;
          bd[sp] = out;
          sp++;
        }
        break;
      }
      if (c.t === "prism") {
        bx[sp] = x; bz[sp] = z; bd[sp] = (d + 1) % 4; sp++;
        bx[sp] = x; bz[sp] = z; bd[sp] = (d + 3) % 4; sp++;
        break;
      }
      break;
    }
  }
  return litCount === ch.crystals.length;
}

/** Exhaustive search (≤ 4^9 combos) for the cheapest clockwise-tap solution. */
export function solveBest(ch: Chamber, start: number[]): { best: number[]; cost: number } {
  const m = ch.mirrors.length;
  let bestCost = Infinity;
  let best = ch.solution.slice();
  if (m > 9) {
    return { best, cost: best.reduce((s, r, i) => s + cwCost(start[i], r), 0) };
  }
  const rot = start.slice();
  const total = 1 << (2 * m);
  for (let code = 0; code < total; code++) {
    let cost = 0;
    for (let i = 0; i < m; i++) {
      const add = (code >> (2 * i)) & 3;
      rot[i] = (start[i] + add) % 4;
      cost += add;
    }
    if (cost >= bestCost) continue;
    if (litAllFast(ch, rot)) {
      bestCost = cost;
      best = rot.slice();
    }
  }
  return { best, cost: bestCost };
}

export function makePuzzle(rng: Rng, level: number): Puzzle {
  const def = levelDef(level);
  for (let attempt = 0; attempt < 400; attempt++) {
    const d = attempt > 200 ? { ...def, prisms: 0, turns: Math.max(2, def.turns - 1) } : def;
    const ch = tryGenerate(rng, d);
    if (!ch) continue;
    // scramble: every mirror gets a random rotation, but path mirrors must start wrong often
    const start = ch.solution.map((r) => (rng.chance(0.8) ? (r + rng.int(1, 3)) % 4 : r));
    if (allLit(trace(ch, start))) continue;
    const naive = ch.solution.reduce((acc, r, i) => acc + cwCost(start[i], r), 0);
    const minOpt = Math.max(2, Math.min(6, Math.ceil(level / 2) + 1));
    const maxOpt = 3 + level;
    if (naive < minOpt) continue;
    const { best, cost } = solveBest(ch, start);
    if (cost < minOpt || cost > maxOpt) continue;
    for (let i = 0; i < ch.mirrors.length; i++) {
      const c = ch.cells[ch.mirrors[i].z * ch.n + ch.mirrors[i].x];
      if (c.t === 'mirror') c.r = start[i];
    }
    return { chamber: ch, start, best, optimal: cost };
  }
  // extremely unlikely fallback: simplest chamber
  const ch = tryGenerate(rng, levelDef(1))!;
  const start = ch.solution.map((r) => (r + 1) % 4);
  const { best, cost } = solveBest(ch, start);
  return { chamber: ch, start, best, optimal: cost };
}

export function starsFor(moves: number, optimal: number, hinted: boolean): number {
  let s = moves <= optimal ? 3 : moves <= Math.ceil(optimal * 1.5) + 1 ? 2 : 1;
  if (hinted) s = Math.max(1, s - 1);
  return s;
}
