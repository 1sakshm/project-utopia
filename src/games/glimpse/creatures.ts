// Geometric animal-face silhouettes for Glimpse. Pure Graphics drawing, unit coordinates scaled by `s`.
import type { Graphics } from 'pixi.js';

export type Creature = 'fox' | 'owl' | 'hare' | 'deer' | 'cat' | 'bear';
export const CREATURES: Creature[] = ['fox', 'owl', 'hare', 'deer', 'cat', 'bear'];
export const CREATURE_NAME: Record<Creature, string> = {
  fox: 'Fox',
  owl: 'Owl',
  hare: 'Hare',
  deer: 'Deer',
  cat: 'Cat',
  bear: 'Bear',
};

export interface CreatureStyle {
  fill: number;
  detail: number;
  dark: number;
  outline?: number | null;
  outlineWidth?: number;
}

type P = number[];
const sc = (pts: P, s: number) => pts.map((v) => v * s);
const mirror = (pts: P) => {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(-pts[i], pts[i + 1]);
  return out;
};

/** Draw the silhouette (base shapes) — used for both fill and outline passes. */
function base(g: Graphics, k: Creature, s: number) {
  switch (k) {
    case 'fox': {
      const ear: P = [-0.92, -0.32, -0.66, -1.0, -0.2, -0.5];
      g.poly(sc(ear, s)).poly(sc(mirror(ear), s));
      g.poly(sc([-1.0, -0.46, 1.0, -0.46, 0.18, 0.78, 0, 0.95, -0.18, 0.78], s));
      break;
    }
    case 'owl': {
      const tuft: P = [-0.72, -0.4, -0.58, -1.0, -0.22, -0.66];
      g.poly(sc(tuft, s)).poly(sc(mirror(tuft), s));
      g.ellipse(0, 0.12 * s, 0.74 * s, 0.86 * s);
      break;
    }
    case 'hare': {
      g.ellipse(-0.25 * s, -0.5 * s, 0.15 * s, 0.5 * s);
      g.ellipse(0.25 * s, -0.5 * s, 0.15 * s, 0.5 * s);
      g.ellipse(0, 0.4 * s, 0.56 * s, 0.5 * s);
      break;
    }
    case 'deer': {
      g.ellipse(-0.56 * s, -0.22 * s, 0.3 * s, 0.12 * s);
      g.ellipse(0.56 * s, -0.22 * s, 0.3 * s, 0.12 * s);
      g.poly(sc([-0.36, -0.42, 0.36, -0.42, 0.24, 0.78, 0, 0.9, -0.24, 0.78], s));
      break;
    }
    case 'cat': {
      const ear: P = [-0.78, -0.3, -0.62, -0.92, -0.22, -0.58];
      g.poly(sc(ear, s)).poly(sc(mirror(ear), s));
      g.ellipse(0, 0.1 * s, 0.8 * s, 0.68 * s);
      break;
    }
    case 'bear': {
      g.circle(-0.6 * s, -0.6 * s, 0.26 * s);
      g.circle(0.6 * s, -0.6 * s, 0.26 * s);
      g.circle(0, 0.06 * s, 0.8 * s);
      break;
    }
  }
}

export function drawCreature(g: Graphics, k: Creature, s: number, st: CreatureStyle) {
  // deer antlers (strokes behind the head)
  if (k === 'deer') {
    const w = Math.max(2, 0.1 * s);
    for (const m of [-1, 1]) {
      g.moveTo(m * 0.18 * s, -0.4 * s)
        .lineTo(m * 0.46 * s, -0.98 * s)
        .moveTo(m * 0.32 * s, -0.7 * s)
        .lineTo(m * 0.72 * s, -0.78 * s)
        .moveTo(m * 0.42 * s, -0.9 * s)
        .lineTo(m * 0.22 * s, -1.08 * s);
    }
    g.stroke({ width: w, color: st.fill, cap: 'round', join: 'round' });
  }
  base(g, k, s);
  g.fill({ color: st.fill });
  // details
  switch (k) {
    case 'fox':
      g.poly(sc([-0.5, 0.08, 0.5, 0.08, 0, 0.9], s)).fill({ color: st.detail });
      g.poly(sc([-0.78, -0.4, -0.64, -0.82, -0.36, -0.5], s)).poly(sc([0.78, -0.4, 0.64, -0.82, 0.36, -0.5], s)).fill({ color: st.dark, alpha: 0.55 });
      g.ellipse(-0.36 * s, -0.14 * s, 0.1 * s, 0.06 * s).ellipse(0.36 * s, -0.14 * s, 0.1 * s, 0.06 * s).fill({ color: st.dark });
      g.circle(0, 0.84 * s, 0.1 * s).fill({ color: st.dark });
      break;
    case 'owl':
      g.circle(-0.32 * s, -0.16 * s, 0.27 * s).circle(0.32 * s, -0.16 * s, 0.27 * s).fill({ color: st.detail });
      g.circle(-0.32 * s, -0.16 * s, 0.12 * s).circle(0.32 * s, -0.16 * s, 0.12 * s).fill({ color: st.dark });
      g.poly(sc([-0.1, 0.1, 0.1, 0.1, 0, 0.34], s)).fill({ color: st.dark, alpha: 0.8 });
      for (let i = 0; i < 3; i++) {
        const y = (0.48 + i * 0.14) * s;
        g.moveTo(-0.2 * s, y).lineTo(0, y + 0.08 * s).lineTo(0.2 * s, y);
      }
      g.stroke({ width: Math.max(1.5, 0.05 * s), color: st.dark, alpha: 0.45, cap: 'round' });
      break;
    case 'hare':
      g.ellipse(-0.25 * s, -0.5 * s, 0.07 * s, 0.36 * s).ellipse(0.25 * s, -0.5 * s, 0.07 * s, 0.36 * s).fill({ color: st.detail });
      g.circle(-0.22 * s, 0.3 * s, 0.07 * s).circle(0.22 * s, 0.3 * s, 0.07 * s).fill({ color: st.dark });
      g.ellipse(0, 0.56 * s, 0.08 * s, 0.06 * s).fill({ color: st.dark });
      break;
    case 'deer':
      g.ellipse(-0.56 * s, -0.22 * s, 0.18 * s, 0.05 * s).ellipse(0.56 * s, -0.22 * s, 0.18 * s, 0.05 * s).fill({ color: st.detail });
      g.ellipse(-0.17 * s, -0.08 * s, 0.07 * s, 0.09 * s).ellipse(0.17 * s, -0.08 * s, 0.07 * s, 0.09 * s).fill({ color: st.dark });
      g.ellipse(0, 0.74 * s, 0.14 * s, 0.1 * s).fill({ color: st.dark });
      g.circle(-0.1 * s, 0.25 * s, 0.04 * s).circle(0.12 * s, 0.4 * s, 0.035 * s).circle(-0.08 * s, 0.5 * s, 0.03 * s).fill({ color: st.detail });
      break;
    case 'cat':
      g.ellipse(-0.3 * s, 0.0, 0.07 * s, 0.14 * s).ellipse(0.3 * s, 0.0, 0.07 * s, 0.14 * s).fill({ color: st.dark });
      g.poly(sc([-0.08, 0.24, 0.08, 0.24, 0, 0.34], s)).fill({ color: st.dark });
      for (const m of [-1, 1]) {
        g.moveTo(m * 0.2 * s, 0.34 * s).lineTo(m * 0.95 * s, 0.24 * s);
        g.moveTo(m * 0.2 * s, 0.4 * s).lineTo(m * 0.95 * s, 0.46 * s);
      }
      g.stroke({ width: Math.max(1.2, 0.035 * s), color: st.dark, alpha: 0.6, cap: 'round' });
      break;
    case 'bear':
      g.circle(-0.6 * s, -0.6 * s, 0.13 * s).circle(0.6 * s, -0.6 * s, 0.13 * s).fill({ color: st.detail });
      g.ellipse(0, 0.34 * s, 0.36 * s, 0.27 * s).fill({ color: st.detail });
      g.ellipse(0, 0.24 * s, 0.13 * s, 0.09 * s).fill({ color: st.dark });
      g.circle(-0.3 * s, -0.12 * s, 0.08 * s).circle(0.3 * s, -0.12 * s, 0.08 * s).fill({ color: st.dark });
      break;
  }
  if (st.outline != null) {
    base(g, k, s);
    g.stroke({ width: st.outlineWidth ?? Math.max(2, s * 0.06), color: st.outline, alpha: 1, join: 'round' });
  }
}

/** 5-point star (the peripheral firefly). */
export function starPoints(r: number, inner = 0.45, points = 5, rot = -Math.PI / 2): number[] {
  const out: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / points;
    out.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return out;
}
