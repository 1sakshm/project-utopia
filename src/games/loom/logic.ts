// Loom puzzle grammar + solver (pure; no engine imports).
//
// A tile has five visual attributes. A puzzle assigns one rule to some attributes (row-wise, Raven-style) and
// keeps the rest constant. The solver enumerates every simple hypothesis (constant, row/col constant,
// row/col progression, row/col distribution, row/col XOR) that fits the visible tiles and requires that all
// fitting hypotheses predict the same missing value for every attribute — so the answer is unique and
// inferable. Distractors differ from the answer in exactly one attribute (violating exactly one rule).
import type { Rng } from '@/sdk';

export interface Tile {
  shape: number; // 0 triangle, 1 square, 2 pentagon, 3 hexagon, 4 circle, 5 star
  count: number; // 0..3 → 1..4 motifs
  stripe: number; // 0..3 → weave band angle 0°, 45°, 90°, 135°
  fill: number; // 0 solid, 1 outline, 2 double (outline + inner)
  marks: number; // 4-bit edge stitches: 1 top, 2 right, 4 bottom, 8 left
}

export type Attr = keyof Tile;
export const ATTRS: Attr[] = ['shape', 'count', 'stripe', 'fill', 'marks'];
export const DOMAIN: Record<Attr, number> = { shape: 6, count: 4, stripe: 4, fill: 3, marks: 16 };
const WRAP: Record<Attr, boolean> = { shape: false, count: false, stripe: true, fill: false, marks: false };
const PROG_MAX: Record<Attr, number> = { shape: 3, count: 3, stripe: 3, fill: 2, marks: 15 };

export type RuleKind = 'const' | 'prog' | 'dist' | 'xor';
export interface Rule {
  attr: Attr;
  kind: RuleKind;
  step?: number;
}

export interface Puzzle {
  n: number;
  grid: Tile[][];
  missing: [number, number];
  answer: Tile;
  candidates: Tile[];
  answerIndex: number;
  rules: Rule[]; // active (non-constant) rules
  level: number;
}

export const SHAPE_NAMES = ['triangle', 'square', 'pentagon', 'hexagon', 'circle', 'star'];

export function describeRule(r: Rule, n: number): string {
  const all = n === 3 ? 'all three' : 'all four';
  switch (r.attr) {
    case 'shape':
      return r.kind === 'prog' ? (r.step! > 0 ? 'Each step adds a side' : 'Each step loses a side') : `Each row uses ${all} shapes`;
    case 'count':
      return r.kind === 'prog' ? (r.step! > 0 ? 'One more motif each step' : 'One fewer motif each step') : `Each row uses ${all} counts`;
    case 'stripe':
      return r.kind === 'prog' ? `The weave turns ${45 * Math.abs(r.step!)}° each step` : `Each row uses ${all} weave angles`;
    case 'fill':
      return `Each row uses ${all} stitch fills`;
    case 'marks':
      return r.kind === 'xor' ? 'Edge stitches: matching stitches cancel, the rest carry across' : `Each row uses ${all} edge stitch sets`;
  }
}

/** Rule difficulty rank used for "hardest rule solved". */
export function ruleRank(r: Rule): number {
  if (r.kind === 'dist') return 5;
  if (r.kind === 'xor') return 4;
  if (r.attr === 'count') return 3;
  if (r.attr === 'stripe') return 2;
  return 1;
}

interface Plan {
  n: number;
  rules: Array<[Attr, RuleKind]>;
  k: number;
  randomMissing: boolean;
}

function planFor(level: number, rng: Rng): Plan {
  const L = Math.max(1, Math.min(10, level));
  const progPool: Array<[Attr, RuleKind]> = [
    ['shape', 'prog'],
    ['stripe', 'prog'],
    ['count', 'prog'],
  ];
  const pickN = (pool: Array<[Attr, RuleKind]>, count: number, forced: Array<[Attr, RuleKind]> = []) => {
    const out: Array<[Attr, RuleKind]> = [...forced];
    for (const r of rng.shuffle([...pool])) {
      if (out.length >= count) break;
      if (out.some(([a]) => a === r[0])) continue;
      out.push(r);
    }
    return out;
  };
  const distAttr = (n: number, taken: Attr[]): Attr => {
    const opts = (n === 3 ? (['fill', 'shape', 'count'] as Attr[]) : (['shape', 'count', 'stripe'] as Attr[])).filter((a) => !taken.includes(a));
    return rng.pick(opts.length ? opts : ['shape']);
  };
  switch (L) {
    case 1:
      return { n: 3, rules: [['shape', 'prog']], k: 4, randomMissing: false };
    case 2:
      return { n: 3, rules: pickN(progPool.slice(0, 2), 1), k: 4, randomMissing: false };
    case 3:
      return { n: 3, rules: pickN(progPool, 1), k: 4, randomMissing: false };
    case 4:
      return { n: 3, rules: pickN(progPool, 2), k: 4, randomMissing: false };
    case 5: {
      const forced: Array<[Attr, RuleKind]> = rng.chance(0.6) ? [['marks', 'xor']] : [];
      return { n: 3, rules: pickN(progPool, 2, forced), k: 5, randomMissing: false };
    }
    case 6: {
      const base = pickN([...progPool, ['marks', 'xor']], 1);
      const d = distAttr(3, base.map(([a]) => a));
      return { n: 3, rules: [...base, [d, 'dist']], k: 5, randomMissing: rng.chance(0.4) };
    }
    case 7: {
      const base = pickN([...progPool, ['marks', 'xor']], 2);
      if (rng.chance(0.5)) {
        const d = distAttr(3, base.map(([a]) => a));
        base.push([d, 'dist']);
      } else base.push(...pickN(progPool, 3, base).slice(base.length));
      return { n: 3, rules: base.slice(0, 3), k: 5, randomMissing: true };
    }
    case 8: {
      const base = pickN(progPool, 1);
      const d = distAttr(4, base.map(([a]) => a));
      return { n: 4, rules: rng.chance(0.5) ? [...base, [d, 'dist']] : pickN(progPool, 2), k: 5, randomMissing: false };
    }
    case 9: {
      const base = pickN(progPool, 2);
      base.push(rng.chance(0.5) ? ['marks', 'xor'] : [distAttr(4, base.map(([a]) => a)), 'dist']);
      return { n: 4, rules: base, k: 6, randomMissing: rng.chance(0.5) };
    }
    default: {
      const base = pickN(progPool, 1);
      base.push(['marks', 'xor']);
      base.push([distAttr(4, base.map(([a]) => a)), 'dist']);
      return { n: 4, rules: base, k: 6, randomMissing: true };
    }
  }
}

type Grid = number[][];

function genAttr(rng: Rng, attr: Attr, kind: RuleKind, n: number, level: number): { grid: Grid; step?: number } {
  const D = DOMAIN[attr];
  const g: Grid = [];
  if (kind === 'const') {
    let v: number;
    if (attr === 'marks') v = level <= 4 ? 0 : rng.pick([0, 0, 5, 10, 15]);
    else if (attr === 'fill') v = level <= 3 ? 0 : rng.pick([0, 0, 1, 2]);
    else if (attr === 'count') v = rng.int(0, n === 4 ? 1 : 2);
    else v = rng.int(0, D - 1);
    for (let r = 0; r < n; r++) g.push(new Array(n).fill(v));
    return { grid: g };
  }
  if (kind === 'prog') {
    const step = attr === 'stripe' ? rng.pick(level >= 6 ? [1, -1, 1] : [1]) : level >= 6 && rng.chance(0.3) ? -1 : 1;
    const max = PROG_MAX[attr];
    for (let r = 0; r < n; r++) {
      let base: number;
      if (WRAP[attr]) base = rng.int(0, D - 1);
      else {
        const span = (n - 1) * Math.abs(step);
        const lo = step > 0 ? 0 : span;
        const hi = step > 0 ? max - span : max;
        base = rng.int(lo, Math.max(lo, hi));
      }
      const row: number[] = [];
      for (let c = 0; c < n; c++) {
        let v = base + c * step;
        if (WRAP[attr]) v = ((v % D) + D) % D;
        row.push(v);
      }
      g.push(row);
    }
    return { grid: g, step };
  }
  if (kind === 'dist') {
    const pool = attr === 'shape' ? [0, 1, 2, 3, 4, 5] : Array.from({ length: D }, (_, i) => i);
    const vals = rng.shuffle([...pool]).slice(0, n);
    const sh = rng.pick([1, n - 1]);
    for (let r = 0; r < n; r++) {
      const row: number[] = [];
      for (let c = 0; c < n; c++) row.push(vals[(c + r * sh) % n]);
      g.push(row);
    }
    return { grid: g };
  }
  // xor on marks
  for (let r = 0; r < n; r++) {
    let row: number[] = [];
    for (let tries = 0; tries < 50; tries++) {
      row = [];
      let acc = 0;
      for (let c = 0; c < n - 1; c++) {
        const v = rng.int(1, 15);
        row.push(v);
        acc ^= v;
      }
      row.push(acc);
      if (acc !== 0 && new Set(row).size === n) break;
    }
    g.push(row);
  }
  return { grid: g };
}

// ---------------------------------------------------------------- solver
function predictions(attr: Attr, g: Grid, n: number, mr: number, mc: number): Set<number> {
  const D = DOMAIN[attr];
  const wrap = WRAP[attr];
  const out = new Set<number>();
  const at = (r: number, c: number) => g[r][c];
  const vis = (r: number, c: number) => !(r === mr && c === mc);
  const line = (i: number, rows: boolean) => Array.from({ length: n }, (_, j) => (rows ? [i, j] : [j, i]) as [number, number]);

  // global constant
  {
    const vals = new Set<number>();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (vis(r, c)) vals.add(at(r, c));
    if (vals.size === 1) out.add([...vals][0]);
  }
  for (const rows of [true, false]) {
    const mLine = rows ? mr : mc;
    // line constant
    {
      let ok = true;
      let pred = -1;
      for (let i = 0; i < n && ok; i++) {
        const vals = new Set(line(i, rows).filter(([r, c]) => vis(r, c)).map(([r, c]) => at(r, c)));
        if (vals.size !== 1) ok = false;
        else if (i === mLine) pred = [...vals][0];
      }
      if (ok) out.add(pred);
    }
    // line progression (same step everywhere, step != 0)
    if (attr !== 'marks' && attr !== 'fill') {
      let step: number | null = null;
      let ok = true;
      const diff = (a: number, b: number) => {
        let d = b - a;
        if (wrap) d = ((d % D) + D) % D;
        return d;
      };
      for (let i = 0; i < n && ok; i++) {
        const cells = line(i, rows);
        for (let j = 0; j + 1 < n; j++) {
          const [r1, c1] = cells[j];
          const [r2, c2] = cells[j + 1];
          if (!vis(r1, c1) || !vis(r2, c2)) continue;
          const d = diff(at(r1, c1), at(r2, c2));
          if (step === null) step = d;
          else if (d !== step) ok = false;
        }
      }
      if (ok && step !== null && step !== 0) {
        const cells = line(mLine, rows);
        const mi = rows ? mc : mr;
        const refJ = mi === 0 ? 1 : mi - 1;
        const [rr, rc] = cells[refJ];
        let v = at(rr, rc) + (mi - refJ) * step;
        if (wrap) v = ((v % D) + D) % D;
        if (v >= 0 && v < D) out.add(v);
      }
    }
    // line distribution: every complete line is a permutation of the same n-value set
    {
      let set: string | null = null;
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        if (i === mLine) continue;
        const vals = line(i, rows).map(([r, c]) => at(r, c));
        if (new Set(vals).size !== n) ok = false;
        const key = [...vals].sort((a, b) => a - b).join(',');
        if (set === null) set = key;
        else if (key !== set) ok = false;
      }
      if (ok && set !== null) {
        const full = set.split(',').map(Number);
        const have = line(mLine, rows).filter(([r, c]) => vis(r, c)).map(([r, c]) => at(r, c));
        const rest = full.filter((v) => !have.includes(v));
        if (rest.length === 1 && new Set(have).size === have.length && have.every((v) => full.includes(v))) out.add(rest[0]);
      }
    }
    // line xor (bitwise; only meaningful for marks)
    if (attr === 'marks') {
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        if (i === mLine) continue;
        let acc = 0;
        for (const [r, c] of line(i, rows)) acc ^= at(r, c);
        if (acc !== 0) ok = false;
      }
      if (ok) {
        let acc = 0;
        for (const [r, c] of line(mLine, rows)) if (vis(r, c)) acc ^= at(r, c);
        out.add(acc);
      }
    }
  }
  return out;
}

export function isUnique(p: { n: number; grid: Tile[][]; missing: [number, number]; answer: Tile }): boolean {
  const [mr, mc] = p.missing;
  for (const a of ATTRS) {
    const g = p.grid.map((row) => row.map((t) => t[a]));
    const pred = predictions(a, g, p.n, mr, mc);
    if (pred.size !== 1 || !pred.has(p.answer[a])) return false;
  }
  return true;
}

const same = (a: Tile, b: Tile) => ATTRS.every((k) => a[k] === b[k]);

function perturb(rng: Rng, t: Tile, attr: Attr, rule: RuleKind | undefined, usedVals: number[]): Tile | null {
  const v = t[attr];
  const D = DOMAIN[attr];
  let opts: number[];
  if (attr === 'marks') opts = [1, 2, 4, 8].map((b) => v ^ b);
  else if (rule === 'prog' || attr === 'count' || attr === 'stripe') opts = [v - 1, v + 1, v + 2].map((x) => (WRAP[attr] ? ((x % D) + D) % D : x)).filter((x) => x >= 0 && x < D && (attr !== 'shape' || x <= 5));
  else if (rule === 'dist') opts = usedVals.filter((x) => x !== v);
  else opts = Array.from({ length: D }, (_, i) => i).filter((x) => x !== v);
  opts = opts.filter((x) => x !== v);
  if (!opts.length) return null;
  return { ...t, [attr]: rng.pick(opts) };
}

export function generate(rng: Rng, level: number): Puzzle {
  for (let attempt = 0; attempt < 400; attempt++) {
    const plan = planFor(level, rng);
    const n = plan.n;
    const ruleMap = new Map<Attr, RuleKind>(plan.rules);
    const grids: Partial<Record<Attr, Grid>> = {};
    const rules: Rule[] = [];
    for (const a of ATTRS) {
      const kind = ruleMap.get(a) ?? 'const';
      const { grid, step } = genAttr(rng, a, kind, n, level);
      grids[a] = grid;
      if (kind !== 'const') rules.push({ attr: a, kind, step });
    }
    const grid: Tile[][] = [];
    for (let r = 0; r < n; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < n; c++) row.push({ shape: grids.shape![r][c], count: grids.count![r][c], stripe: grids.stripe![r][c], fill: grids.fill![r][c], marks: grids.marks![r][c] });
      grid.push(row);
    }
    const missing: [number, number] = plan.randomMissing ? [rng.int(0, n - 1), rng.int(0, n - 1)] : [n - 1, n - 1];
    const answer = grid[missing[0]][missing[1]];
    if (!isUnique({ n, grid, missing, answer })) continue;

    // distractors: each changes exactly one attribute, preferring the active rules
    const weights: Array<[Attr, number]> = ATTRS.map((a) => [a, ruleMap.has(a) ? 3 : a === 'marks' && answer.marks === 0 && level < 5 ? 0.3 : 1]);
    const cands: Tile[] = [answer];
    for (let tries = 0; cands.length < plan.k && tries < 200; tries++) {
      const total = weights.reduce((s, [, w]) => s + w, 0);
      let x = rng.next() * total;
      let attr: Attr = 'shape';
      for (const [a, w] of weights) {
        x -= w;
        if (x <= 0) {
          attr = a;
          break;
        }
      }
      const usedVals = [...new Set(grid.flat().map((t) => t[attr]))];
      const d = perturb(rng, answer, attr, ruleMap.get(attr), usedVals);
      if (!d || cands.some((c) => same(c, d))) continue;
      // limit to 2 distractors per attribute for variety
      if (cands.filter((c) => c !== answer && c[attr] !== answer[attr]).length >= 2 && tries < 150) continue;
      cands.push(d);
    }
    if (cands.length < plan.k) continue;
    const shuffled = rng.shuffle([...cands]);
    return { n, grid, missing, answer, candidates: shuffled, answerIndex: shuffled.indexOf(answer), rules, level };
  }
  // Fallback (should be unreachable): a trivial shape progression.
  return generate(rng, 1);
}
