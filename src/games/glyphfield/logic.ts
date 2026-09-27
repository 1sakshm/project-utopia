// Pure glyph generator for Glyphfield. No engine imports.
// Glyphs live on a 3×3 lattice. Features are strokes between neighbouring lattice nodes (20 edges)
// plus small rings on nodes (9). Because every glyph is built from the same shared strokes, similarity
// between target and distractors is fully controllable.

import type { Rng } from '@/sdk';

export type Glyph = number[]; // sorted feature ids
export type SearchMode = 'feature' | 'conjunction' | 'rotated';

export const NODES: Array<[number, number]> = [];
for (let i = 0; i < 9; i++) NODES.push([(i % 3) - 1, Math.floor(i / 3) - 1]);

export const EDGES: Array<[number, number]> = [];
for (let a = 0; a < 9; a++) {
  for (let b = a + 1; b < 9; b++) {
    const dx = Math.abs(NODES[a][0] - NODES[b][0]);
    const dy = Math.abs(NODES[a][1] - NODES[b][1]);
    if (Math.max(dx, dy) === 1) EDGES.push([a, b]);
  }
}
export const RING0 = EDGES.length; // feature ids >= RING0 are rings on node (id - RING0)

const nodeAt = (x: number, y: number) => (y + 1) * 3 + (x + 1);
const edgeIndex = new Map<string, number>();
EDGES.forEach(([a, b], i) => edgeIndex.set(`${a}-${b}`, i));
const edgeId = (a: number, b: number) => edgeIndex.get(a < b ? `${a}-${b}` : `${b}-${a}`)!;

function mapNode(n: number, f: (x: number, y: number) => [number, number]) {
  const [x, y] = f(NODES[n][0], NODES[n][1]);
  return nodeAt(x, y);
}

function mapGlyph(g: Glyph, f: (x: number, y: number) => [number, number]): Glyph {
  const out = g.map((id) => {
    if (id >= RING0) return RING0 + mapNode(id - RING0, f);
    const [a, b] = EDGES[id];
    return edgeId(mapNode(a, f), mapNode(b, f));
  });
  return out.sort((p, q) => p - q);
}

export const rot90 = (g: Glyph) => mapGlyph(g, (x, y) => [-y, x]);
export const mirror = (g: Glyph) => mapGlyph(g, (x, y) => [-x, y]);
export const key = (g: Glyph) => g.join(',');

export function rotations(g: Glyph): Glyph[] {
  const r: Glyph[] = [g];
  for (let i = 0; i < 3; i++) r.push(rot90(r[r.length - 1]));
  return r;
}

/** Keys of every rotation of g. */
const rotKeys = (g: Glyph) => new Set(rotations(g).map(key));

/** A glyph is "chiral & asymmetric" when all 4 rotations differ and its mirror isn't one of them. */
function isAsymmetric(g: Glyph) {
  const ks = rotKeys(g);
  if (ks.size < 4) return false;
  return !ks.has(key(mirror(g)));
}

const nodesOf = (g: Glyph) => {
  const s = new Set<number>();
  for (const id of g) {
    if (id >= RING0) s.add(id - RING0);
    else {
      s.add(EDGES[id][0]);
      s.add(EDGES[id][1]);
    }
  }
  return s;
};

/** Random connected rune: a walk of `len` edges, optionally with a ring on one of its nodes. */
export function randomRune(rng: Rng, len: number, ring: boolean): Glyph {
  for (let attempt = 0; attempt < 200; attempt++) {
    const edges = new Set<number>();
    let n = rng.int(0, 8);
    let guard = 0;
    while (edges.size < len && guard++ < 40) {
      // continue from current node or jump to any node already on the rune (branching)
      if (edges.size > 0 && rng.chance(0.3)) n = rng.pick([...nodesOf([...edges])]);
      const options: number[] = [];
      for (let m = 0; m < 9; m++) {
        if (m === n) continue;
        const dx = Math.abs(NODES[m][0] - NODES[n][0]);
        const dy = Math.abs(NODES[m][1] - NODES[n][1]);
        if (Math.max(dx, dy) === 1 && !edges.has(edgeId(n, m))) options.push(m);
      }
      if (!options.length) break;
      const m = rng.pick(options);
      edges.add(edgeId(n, m));
      n = m;
    }
    if (edges.size < len) continue;
    const g = [...edges];
    if (ring) {
      // ring on a node the rune touches, preferring endpoints
      const nodes = [...nodesOf(g)];
      g.push(RING0 + rng.pick(nodes));
    }
    g.sort((a, b) => a - b);
    if (isAsymmetric(g)) return g;
  }
  // Fallback (practically unreachable): a fixed asymmetric rune
  return [edgeId(0, 1), edgeId(1, 4), edgeId(4, 8), RING0 + 0].sort((a, b) => a - b);
}

/** Replace `k` edges of g with other edges touching the remaining structure (keeps rings). */
export function mutate(rng: Rng, g: Glyph, k: number): Glyph {
  let cur = [...g];
  for (let step = 0; step < k; step++) {
    const edges = cur.filter((id) => id < RING0);
    if (edges.length <= 1) break;
    const drop = rng.pick(edges);
    const rest = cur.filter((id) => id !== drop);
    const touch = nodesOf(rest.filter((id) => id < RING0));
    const cands: number[] = [];
    for (let i = 0; i < EDGES.length; i++) {
      if (i === drop || rest.includes(i)) continue;
      const [a, b] = EDGES[i];
      if (touch.has(a) || touch.has(b)) cands.push(i);
    }
    if (!cands.length) break;
    cur = [...rest, rng.pick(cands)].sort((a, b) => a - b);
  }
  // Rings sometimes hop to another node the rune touches.
  if (k > 0 && rng.chance(0.25)) {
    const ringIdx = cur.findIndex((id) => id >= RING0);
    if (ringIdx >= 0) {
      const nodes = [...nodesOf(cur.filter((id) => id < RING0))];
      cur[ringIdx] = RING0 + rng.pick(nodes);
      cur = [...new Set(cur)].sort((a, b) => a - b);
    }
  }
  return cur;
}

export interface LevelSpec {
  count: number; // total glyphs on the field (including target when present)
  mode: SearchMode;
  drift: number; // px amplitude of gentle drift
  breathe: boolean;
  absentChance: number;
}

export function levelSpec(level: number): LevelSpec {
  const L = Math.max(1, Math.min(20, level));
  const count = Math.round(10 + ((L - 1) / 19) * 70);
  const mode: SearchMode = L <= 4 ? 'feature' : L <= 11 ? 'conjunction' : 'rotated';
  return {
    count,
    mode,
    drift: L >= 3 ? Math.min(6, 2 + (L - 3) * 0.4) : 0,
    breathe: L >= 8,
    absentChance: L >= 7 ? 0.2 : 0,
  };
}

export interface Trial {
  target: Glyph;
  present: boolean;
  /** Field glyphs. When present, index `targetIndex` is the target. */
  items: Array<{ glyph: Glyph; rot: number }>;
  targetIndex: number;
  mode: SearchMode;
}

/**
 * Build a search trial. Distractor similarity:
 *  - feature: target carries a ring; distractors are the ringless skeleton (+ a mild variant) → pop-out
 *  - conjunction: distractors are 1–2 stroke mutations of the target, sharing most of its strokes
 *  - rotated: every glyph is shown at a random quarter-turn; distractors include the mirror image
 */
export function makeTrial(rng: Rng, level: number, count: number, absent: boolean): Trial {
  const spec = levelSpec(level);
  const mode = spec.mode;
  const len = mode === 'feature' ? 3 : level >= 9 ? 4 : 3;
  const target = randomRune(rng, len, mode === 'feature' ? true : rng.chance(0.5));
  const forbidden = rotKeys(target); // never show a rotated copy of the target as a distractor

  const pool: Glyph[] = [];
  const addPool = (g: Glyph) => {
    const k = key(g);
    if (forbidden.has(k)) return;
    // in rotated mode a distractor must not equal any rotation of the target (all are displayed rotated)
    if (pool.some((p) => key(p) === k)) return;
    pool.push(g);
  };

  if (mode === 'feature') {
    const skeleton = target.filter((id) => id < RING0);
    addPool(skeleton);
    if (level >= 3) {
      for (let i = 0; i < 6 && pool.length < 3; i++) addPool(mutate(rng, skeleton, 1));
    }
  } else if (mode === 'conjunction') {
    const k = level <= 7 ? 2 : 1;
    const want = level <= 7 ? 4 : 6;
    for (let i = 0; i < 40 && pool.length < want; i++) addPool(mutate(rng, target, k));
  } else {
    const m = mirror(target);
    addPool(m);
    for (let i = 0; i < 40 && pool.length < 6; i++) addPool(mutate(rng, rng.chance(0.4) ? m : target, 1));
  }
  if (!pool.length) pool.push(randomRune(rng, len + 1, false));

  const items: Trial['items'] = [];
  const present = !absent;
  const nD = present ? count - 1 : count;
  // Ensure every pool entry appears at least once, then fill randomly.
  for (let i = 0; i < nD; i++) items.push({ glyph: i < pool.length ? pool[i] : rng.pick(pool), rot: 0 });
  let targetIndex = -1;
  if (present) {
    items.push({ glyph: target, rot: 0 });
  }
  rng.shuffle(items);
  if (present) targetIndex = items.findIndex((it) => it.glyph === target);
  if (mode === 'rotated') for (const it of items) it.rot = rng.int(0, 3);
  return { target, present, items, targetIndex, mode };
}
