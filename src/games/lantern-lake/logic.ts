import type { Rng } from '@/sdk';

/** Pure rules for Lantern Lake (engine-free). */
export const MAX_LANTERNS = 16;
export const MAX_LEVEL = 8;

export interface LevelDef {
  span: number;
  count: number;
  /** 0 = tidy grid, 1 = organic scatter. */
  irregular: number;
  /** Slow drift of positions during recall. */
  drift: boolean;
  mirrorChance: number;
  stepMs: number;
}

const COUNTS = [9, 9, 10, 11, 12, 13, 14, 16];

export function levelDef(level: number): LevelDef {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  return {
    span: l + 1,
    count: COUNTS[l - 1],
    irregular: Math.min(1, (l - 1) / 4),
    drift: l >= 6,
    mirrorChance: l >= 5 ? 0.25 : 0,
    stepMs: 600,
  };
}

/** Lake field bounds (x across, z depth). */
export const FIELD_W = 4.3;
export const FIELD_D = 6.4;

/** Generate lantern positions [x, z] for a level. Grid early, organic scatter later. */
export function makeLayout(rng: Rng, count: number, irregular: number): Array<[number, number]> {
  const cols = count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const sx = FIELD_W / (cols - 1);
  const sz = FIELD_D / (rows - 1);
  const slots: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // stagger alternate rows slightly for a softer look
      const off = (r % 2 ? 0.18 : -0.18) * irregular * sx;
      slots.push([-FIELD_W / 2 + c * sx + off, -FIELD_D / 2 + r * sz]);
    }
  }
  rng.shuffle(slots);
  const pts = slots.slice(0, count).map(([x, z]) => {
    const j = irregular * 0.42;
    return [x + (rng.next() - 0.5) * 2 * j * sx, z + (rng.next() - 0.5) * 2 * j * sz] as [number, number];
  });
  // relax to keep a minimum distance and stay within bounds
  const minD = 1.05;
  for (let it = 0; it < 30; it++) {
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const dx = pts[b][0] - pts[a][0];
        const dz = pts[b][1] - pts[a][1];
        const d = Math.hypot(dx, dz) || 0.001;
        if (d < minD) {
          const push = (minD - d) / 2;
          pts[a][0] -= (dx / d) * push;
          pts[a][1] -= (dz / d) * push;
          pts[b][0] += (dx / d) * push;
          pts[b][1] += (dz / d) * push;
        }
      }
    }
    for (const p of pts) {
      p[0] = Math.max(-FIELD_W / 2 - 0.1, Math.min(FIELD_W / 2 + 0.1, p[0]));
      p[1] = Math.max(-FIELD_D / 2 - 0.1, Math.min(FIELD_D / 2 + 0.1, p[1]));
    }
  }
  return pts;
}

/** Pick `span` distinct lanterns, avoiding immediate neighbours in space when possible (keeps sequences legible). */
export function makeSequence(rng: Rng, count: number, span: number): number[] {
  const idx = rng.shuffle(Array.from({ length: count }, (_, i) => i));
  return idx.slice(0, Math.min(span, count));
}

export function scoreFor(span: number): number {
  return span * span * 5;
}

/** Keyboard grid (4×4) — rows from far (top of screen) to near. */
export const KEY_ROWS = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
];
export const keyLabel = (code: string) => code.replace('Digit', '').replace('Key', '');

/** Assign each lantern a unique grid key by nearest free cell (greedy over all pairs). */
export function assignKeys(pts: Array<[number, number]>): string[] {
  const cells: Array<{ code: string; x: number; z: number }> = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      cells.push({ code: KEY_ROWS[r][c], x: -FIELD_W / 2 + (c * FIELD_W) / 3, z: -FIELD_D / 2 + (r * FIELD_D) / 3 });
    }
  }
  const pairs: Array<[number, number, number]> = [];
  pts.forEach((p, i) => cells.forEach((c, k) => pairs.push([Math.hypot(p[0] - c.x, p[1] - c.z), i, k])));
  pairs.sort((a, b) => a[0] - b[0]);
  const out: string[] = new Array(pts.length).fill('');
  const used = new Set<number>();
  for (const [, i, k] of pairs) {
    if (out[i] || used.has(k)) continue;
    out[i] = cells[k].code;
    used.add(k);
  }
  return out;
}
