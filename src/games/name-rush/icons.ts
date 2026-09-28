// Procedural picture icons drawn with Pixi Graphics (no assets). Each icon fits in a box of half-size `s`
// centred on (0, 0). Flat, luminous style: a solid body, a soft highlight and a few crisp details.
import type { Graphics } from 'pixi.js';

export type IconId =
  | 'sun' | 'moon' | 'star' | 'fish' | 'tree' | 'house' | 'ball' | 'cup' | 'key' | 'bird' | 'apple' | 'flower'
  | 'heart' | 'cloud' | 'boat' | 'leaf' | 'bell' | 'hat' | 'book' | 'umbrella' | 'drop' | 'egg' | 'clock' | 'car'
  | 'circle' | 'square' | 'triangle' | 'red' | 'blue' | 'green' | 'yellow';

type Pt = number[];

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Pt {
  const out: Pt = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

function starPts(points: number, outer: number, inner: number, rot = -Math.PI / 2): Pt {
  const out: Pt = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

function rotPts(p: Pt, a: number, dx = 0, dy = 0): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: Pt = [];
  for (let i = 0; i < p.length; i += 2) out.push(p[i] * c - p[i + 1] * s + dx, p[i] * s + p[i + 1] * c + dy);
  return out;
}

/** Pointed leaf (lens) of half-length h and half-width w, pointing up. */
function leafPts(h: number, w: number, n = 14): Pt {
  const right: Pt = [];
  for (let i = 0; i <= n; i++) {
    const y = -h + (2 * h * i) / n;
    right.push(w * (1 - (y / h) ** 2), y);
  }
  const l: Pt = [];
  for (let i = n; i >= 0; i--) {
    const y = -h + (2 * h * i) / n;
    l.push(-w * (1 - (y / h) ** 2), y);
  }
  return [...right, ...l];
}

const WHITE = 0xffffff;
const INK = 0x0b1a2c;

export const COLOR_SWATCH: Record<'red' | 'blue' | 'green' | 'yellow', number> = {
  red: 0xff5a5f,
  blue: 0x3d8bff,
  green: 0x3ccf6e,
  yellow: 0xffd23f,
};

/** Draw icon `id` into `g` (does not clear). `hc` = high contrast (adds bright outlines). */
export function drawIcon(g: Graphics, id: IconId, s: number, hc = false): void {
  const line = (w: number) => ({ width: w, color: WHITE, alpha: hc ? 1 : 0.9, cap: 'round' as const, join: 'round' as const });
  const outline = hc ? { width: Math.max(2, s * 0.05), color: WHITE, alpha: 1 } : null;
  const fill = (color: number, alpha = 1) => {
    g.fill({ color, alpha });
    if (outline) g.stroke(outline);
  };
  switch (id) {
    case 'sun': {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.moveTo(Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62)
          .lineTo(Math.cos(a) * s * 0.92, Math.sin(a) * s * 0.92)
          .stroke({ width: s * 0.13, color: 0xffb347, cap: 'round' });
      }
      g.circle(0, 0, s * 0.46);
      fill(0xffd35a);
      g.circle(-s * 0.14, -s * 0.14, s * 0.16).fill({ color: WHITE, alpha: 0.45 });
      break;
    }
    case 'moon': {
      const R = s * 0.8;
      const d = s * 0.5;
      const R2 = s * 0.68;
      const x = (R * R - R2 * R2 + d * d) / (2 * d);
      const y = Math.sqrt(Math.max(0, R * R - x * x));
      const tO = Math.atan2(-y, x);
      const bO = Math.atan2(y, x);
      const tI = Math.atan2(-y, x - d);
      const bI = Math.atan2(y, x - d);
      // outer arc: top intersection → (through the left) → bottom intersection; inner arc back up
      const o2 = arcPts(0, 0, R, tO, bO - Math.PI * 2, 30);
      const inner = arcPts(d, 0, R2, bI, tI + Math.PI * 2, 30);
      g.poly(rotPts([...o2, ...inner], -0.35));
      fill(0xfff1c9);
      g.circle(-s * 0.45, -s * 0.05, s * 0.09).fill({ color: 0xe8d9a8, alpha: 0.9 });
      g.circle(-s * 0.3, s * 0.35, s * 0.06).fill({ color: 0xe8d9a8, alpha: 0.9 });
      break;
    }
    case 'star': {
      g.poly(starPts(5, s * 0.95, s * 0.42));
      fill(0xffe27a);
      g.poly(starPts(5, s * 0.4, s * 0.18)).fill({ color: WHITE, alpha: 0.4 });
      break;
    }
    case 'fish': {
      g.poly([s * 0.35, 0, s * 0.95, -s * 0.45, s * 0.85, 0, s * 0.95, s * 0.45]);
      fill(0xff8a4c);
      g.ellipse(-s * 0.1, 0, s * 0.62, s * 0.42);
      fill(0xffa45c);
      g.moveTo(s * 0.12, -s * 0.3).quadraticCurveTo(s * 0.26, 0, s * 0.12, s * 0.3).stroke({ width: s * 0.07, color: 0xd9652e, cap: 'round' });
      g.circle(-s * 0.38, -s * 0.08, s * 0.1).fill(WHITE);
      g.circle(-s * 0.4, -s * 0.08, s * 0.05).fill(INK);
      break;
    }
    case 'tree': {
      g.roundRect(-s * 0.12, s * 0.1, s * 0.24, s * 0.85, s * 0.06);
      fill(0x9a6a44);
      g.circle(0, -s * 0.38, s * 0.46);
      fill(0x3ccf6e);
      g.circle(-s * 0.38, -s * 0.02, s * 0.34);
      fill(0x2fb85d);
      g.circle(s * 0.38, -s * 0.02, s * 0.34);
      fill(0x34c265);
      g.circle(-s * 0.14, -s * 0.52, s * 0.14).fill({ color: WHITE, alpha: 0.3 });
      break;
    }
    case 'house': {
      g.roundRect(-s * 0.62, -s * 0.12, s * 1.24, s * 0.98, s * 0.06);
      fill(0xffe6b0);
      g.poly([-s * 0.85, -s * 0.05, 0, -s * 0.85, s * 0.85, -s * 0.05]);
      fill(0xff6b6b);
      g.roundRect(-s * 0.16, s * 0.36, s * 0.32, s * 0.5, s * 0.05).fill(0x9a6a44);
      g.roundRect(s * 0.28, s * 0.08, s * 0.24, s * 0.24, s * 0.03).fill(0x7fd3ff);
      g.roundRect(-s * 0.52, s * 0.08, s * 0.24, s * 0.24, s * 0.03).fill(0x7fd3ff);
      break;
    }
    case 'ball': {
      g.circle(0, 0, s * 0.82);
      fill(0x3d8bff);
      g.moveTo(-s * 0.82, 0).quadraticCurveTo(0, -s * 0.4, s * 0.82, 0).stroke({ width: s * 0.09, color: WHITE });
      g.moveTo(-s * 0.82, 0).quadraticCurveTo(0, s * 0.4, s * 0.82, 0).stroke({ width: s * 0.09, color: WHITE });
      g.moveTo(0, -s * 0.82).quadraticCurveTo(-s * 0.35, 0, 0, s * 0.82).stroke({ width: s * 0.09, color: 0xffd23f });
      g.circle(-s * 0.3, -s * 0.38, s * 0.14).fill({ color: WHITE, alpha: 0.45 });
      break;
    }
    case 'cup': {
      g.circle(s * 0.5, s * 0.12, s * 0.28).stroke({ width: s * 0.13, color: 0xff9fb8 });
      g.poly([-s * 0.62, -s * 0.28, s * 0.52, -s * 0.28, s * 0.4, s * 0.72, -s * 0.5, s * 0.72]);
      fill(0xff9fb8);
      g.roundRect(-s * 0.7, -s * 0.36, s * 1.3, s * 0.16, s * 0.08).fill(0xffc6d4);
      for (const x of [-s * 0.3, 0, s * 0.3]) {
        g.moveTo(x, -s * 0.52).quadraticCurveTo(x + s * 0.12, -s * 0.66, x, -s * 0.8).stroke({ width: s * 0.06, color: WHITE, alpha: 0.7, cap: 'round' });
      }
      break;
    }
    case 'key': {
      g.circle(-s * 0.45, 0, s * 0.36).stroke({ width: s * 0.18, color: 0xffd35a });
      g.roundRect(-s * 0.14, -s * 0.09, s * 1.02, s * 0.18, s * 0.06).fill(0xffd35a);
      g.rect(s * 0.5, s * 0.05, s * 0.14, s * 0.28).fill(0xffd35a);
      g.rect(s * 0.72, s * 0.05, s * 0.14, s * 0.2).fill(0xffd35a);
      if (hc) g.circle(-s * 0.45, 0, s * 0.47).stroke({ width: 2, color: WHITE });
      break;
    }
    case 'bird': {
      g.poly([s * 0.35, -s * 0.05, s * 0.95, -s * 0.35, s * 0.85, s * 0.15]);
      fill(0x3aa0e8);
      g.ellipse(0, s * 0.1, s * 0.58, s * 0.46);
      fill(0x5ab8ff);
      g.circle(-s * 0.42, -s * 0.28, s * 0.3);
      fill(0x5ab8ff);
      g.poly([-s * 0.7, -s * 0.34, -s * 0.98, -s * 0.24, -s * 0.7, -s * 0.16]).fill(0xffb347);
      g.poly([-s * 0.05, 0, s * 0.45, -s * 0.05, s * 0.2, s * 0.35]).fill({ color: 0x2d82c4 });
      g.circle(-s * 0.46, -s * 0.34, s * 0.07).fill(INK);
      g.moveTo(-s * 0.1, s * 0.55).lineTo(-s * 0.15, s * 0.82).stroke({ width: s * 0.06, color: 0xffb347, cap: 'round' });
      g.moveTo(s * 0.12, s * 0.55).lineTo(s * 0.1, s * 0.82).stroke({ width: s * 0.06, color: 0xffb347, cap: 'round' });
      break;
    }
    case 'apple': {
      g.moveTo(0, -s * 0.5).quadraticCurveTo(s * 0.05, -s * 0.8, s * 0.18, -s * 0.9).stroke({ width: s * 0.09, color: 0x8a5a3a, cap: 'round' });
      g.poly(rotPts(leafPts(s * 0.22, s * 0.11), 1.0, s * 0.3, -s * 0.72)).fill(0x3ccf6e);
      g.circle(-s * 0.26, s * 0.05, s * 0.55);
      fill(0xff5a5f);
      g.circle(s * 0.26, s * 0.05, s * 0.55);
      fill(0xff5a5f);
      g.circle(0, s * 0.2, s * 0.5).fill(0xff5a5f);
      g.ellipse(-s * 0.35, -s * 0.12, s * 0.12, s * 0.2).fill({ color: WHITE, alpha: 0.45 });
      break;
    }
    case 'flower': {
      g.moveTo(0, s * 0.3).lineTo(0, s * 0.95).stroke({ width: s * 0.1, color: 0x3ccf6e, cap: 'round' });
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g.circle(Math.cos(a) * s * 0.34, -s * 0.2 + Math.sin(a) * s * 0.34, s * 0.26);
        fill(0xff8fc7);
      }
      g.circle(0, -s * 0.2, s * 0.22).fill(0xffd35a);
      break;
    }
    case 'heart': {
      const p: Pt = [];
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        p.push((x / 17) * s * 0.95, (-y / 17) * s * 0.95 - s * 0.05);
      }
      g.poly(p);
      fill(0xff5a7a);
      g.ellipse(-s * 0.4, -s * 0.35, s * 0.14, s * 0.1).fill({ color: WHITE, alpha: 0.45 });
      break;
    }
    case 'cloud': {
      g.roundRect(-s * 0.85, 0, s * 1.7, s * 0.5, s * 0.25);
      fill(0xe8f4ff);
      g.circle(-s * 0.35, s * 0.02, s * 0.36);
      fill(0xe8f4ff);
      g.circle(s * 0.2, -s * 0.12, s * 0.46);
      fill(0xe8f4ff);
      g.roundRect(-s * 0.8, s * 0.05, s * 1.6, s * 0.42, s * 0.21).fill(0xe8f4ff);
      g.circle(s * 0.08, -s * 0.28, s * 0.14).fill({ color: WHITE, alpha: 0.9 });
      break;
    }
    case 'boat': {
      g.moveTo(0, -s * 0.85).lineTo(0, s * 0.3).stroke({ width: s * 0.07, color: 0xc9a27a });
      g.poly([s * 0.08, -s * 0.8, s * 0.7, s * 0.2, s * 0.08, s * 0.2]);
      fill(0xfff1c9);
      g.poly([-s * 0.08, -s * 0.5, -s * 0.08, s * 0.2, -s * 0.55, s * 0.2]);
      fill(0xffe0a0);
      g.poly([-s * 0.9, s * 0.32, s * 0.9, s * 0.32, s * 0.6, s * 0.72, -s * 0.6, s * 0.72]);
      fill(0xff7a59);
      g.moveTo(-s * 0.95, s * 0.88).quadraticCurveTo(-s * 0.5, s * 0.76, 0, s * 0.88).quadraticCurveTo(s * 0.5, s * 1.0, s * 0.95, s * 0.88)
        .stroke({ width: s * 0.07, color: 0x7fd3ff, cap: 'round' });
      break;
    }
    case 'leaf': {
      g.poly(rotPts(leafPts(s * 0.85, s * 0.45), 0.6));
      fill(0x3ccf6e);
      const a = 0.6;
      g.moveTo(-Math.sin(a) * -s * 0.8, Math.cos(a) * s * 0.8)
        .lineTo(-Math.sin(a) * s * 0.7, -Math.cos(a) * s * 0.7)
        .stroke({ width: s * 0.06, color: 0x1f8f4a, cap: 'round' });
      g.moveTo(Math.sin(a) * s * 0.8, Math.cos(a) * s * 0.8)
        .lineTo(Math.sin(a) * s * 1.0, Math.cos(a) * s * 1.0)
        .stroke({ width: s * 0.07, color: 0x2fb85d, cap: 'round' });
      break;
    }
    case 'bell': {
      const prof = [0, -0.72, 0.22, -0.7, 0.4, -0.52, 0.46, -0.2, 0.5, 0.2, 0.62, 0.42, 0.82, 0.56];
      const p: Pt = [];
      for (let i = 0; i < prof.length; i += 2) p.push(prof[i] * s, prof[i + 1] * s);
      for (let i = prof.length - 2; i >= 0; i -= 2) p.push(-prof[i] * s, prof[i + 1] * s);
      g.circle(0, -s * 0.8, s * 0.1).fill(0xffb347);
      g.circle(0, s * 0.68, s * 0.14).fill(0xffb347);
      g.poly(p);
      fill(0xffd35a);
      g.ellipse(-s * 0.2, -s * 0.3, s * 0.08, s * 0.22).fill({ color: WHITE, alpha: 0.45 });
      break;
    }
    case 'hat': {
      g.ellipse(0, s * 0.42, s * 0.95, s * 0.22);
      fill(0x8f7bff);
      g.roundRect(-s * 0.5, -s * 0.5, s * 1.0, s * 0.95, s * 0.22);
      fill(0x8f7bff);
      g.rect(-s * 0.5, s * 0.1, s * 1.0, s * 0.17).fill(0xffd35a);
      g.ellipse(-s * 0.25, -s * 0.28, s * 0.08, s * 0.14).fill({ color: WHITE, alpha: 0.35 });
      break;
    }
    case 'book': {
      g.poly([0, -s * 0.5, -s * 0.9, -s * 0.66, -s * 0.9, s * 0.6, 0, s * 0.76]);
      fill(0x7fd3ff);
      g.poly([0, -s * 0.5, s * 0.9, -s * 0.66, s * 0.9, s * 0.6, 0, s * 0.76]);
      fill(0x5ab8ff);
      for (const k of [-0.25, 0.02, 0.29]) {
        g.moveTo(-s * 0.72, s * (k - 0.1)).lineTo(-s * 0.18, s * k).stroke({ width: s * 0.05, color: WHITE, alpha: 0.7 });
        g.moveTo(s * 0.72, s * (k - 0.1)).lineTo(s * 0.18, s * k).stroke({ width: s * 0.05, color: WHITE, alpha: 0.7 });
      }
      break;
    }
    case 'umbrella': {
      g.moveTo(0, -s * 0.2).lineTo(0, s * 0.62).arc(-s * 0.18, s * 0.62, s * 0.18, 0, Math.PI, false).stroke({ width: s * 0.09, color: 0xc9a27a, cap: 'round' });
      const p = arcPts(0, 0, s * 0.9, Math.PI, Math.PI * 2, 24);
      for (let i = 0; i < 4; i++) {
        const x1 = s * 0.9 - (i * s * 1.8) / 4;
        const x2 = s * 0.9 - ((i + 1) * s * 1.8) / 4;
        p.push((x1 + x2) / 2, -s * 0.1, x2, 0);
      }
      g.poly(p);
      fill(0xb99cff);
      g.moveTo(0, -s * 0.9).lineTo(0, -s * 1.0).stroke({ width: s * 0.08, color: 0xc9a27a, cap: 'round' });
      g.moveTo(-s * 0.2, -s * 0.85).quadraticCurveTo(-s * 0.35, -s * 0.4, -s * 0.45, 0).stroke({ width: s * 0.05, color: WHITE, alpha: 0.5 });
      g.moveTo(s * 0.2, -s * 0.85).quadraticCurveTo(s * 0.35, -s * 0.4, s * 0.45, 0).stroke({ width: s * 0.05, color: WHITE, alpha: 0.5 });
      break;
    }
    case 'drop': {
      const p: Pt = [];
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        p.push(Math.sin(t) * Math.sin(t / 2) * s * 0.85, -Math.cos(t) * s * 0.9);
      }
      g.poly(p);
      fill(0x5ab8ff);
      g.ellipse(-s * 0.22, s * 0.25, s * 0.1, s * 0.2).fill({ color: WHITE, alpha: 0.5 });
      break;
    }
    case 'egg': {
      const p: Pt = [];
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const sy = Math.sin(t);
        p.push(Math.cos(t) * s * 0.62 * (1 + 0.14 * sy), sy * s * 0.85 + s * 0.05);
      }
      g.poly(p);
      fill(0xfff4de);
      g.ellipse(-s * 0.22, -s * 0.28, s * 0.1, s * 0.18).fill({ color: WHITE, alpha: 0.9 });
      break;
    }
    case 'clock': {
      g.circle(0, 0, s * 0.85);
      fill(0xfff1c9);
      g.circle(0, 0, s * 0.85).stroke({ width: s * 0.12, color: 0xff9f6b });
      for (let i = 0; i < 12; i += 3) {
        const a = (i * Math.PI) / 6;
        g.circle(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, s * 0.05).fill(INK);
      }
      g.moveTo(0, 0).lineTo(0, -s * 0.5).stroke({ width: s * 0.08, color: INK, cap: 'round' });
      g.moveTo(0, 0).lineTo(s * 0.36, s * 0.12).stroke({ width: s * 0.08, color: INK, cap: 'round' });
      g.circle(0, 0, s * 0.08).fill(INK);
      break;
    }
    case 'car': {
      g.roundRect(-s * 0.9, -s * 0.1, s * 1.8, s * 0.55, s * 0.18);
      fill(0xff6b6b);
      g.poly([-s * 0.5, -s * 0.1, -s * 0.3, -s * 0.52, s * 0.3, -s * 0.52, s * 0.55, -s * 0.1]);
      fill(0xff6b6b);
      g.poly([-s * 0.4, -s * 0.14, -s * 0.25, -s * 0.44, -s * 0.03, -s * 0.44, -s * 0.03, -s * 0.14]).fill(0x7fd3ff);
      g.poly([s * 0.05, -s * 0.14, s * 0.05, -s * 0.44, s * 0.26, -s * 0.44, s * 0.44, -s * 0.14]).fill(0x7fd3ff);
      for (const x of [-s * 0.48, s * 0.48]) {
        g.circle(x, s * 0.45, s * 0.22).fill(0x2a2f45);
        g.circle(x, s * 0.45, s * 0.09).fill(0xd8dcef);
      }
      break;
    }
    case 'circle': {
      g.circle(0, 0, s * 0.78).stroke({ width: s * 0.2, color: WHITE });
      break;
    }
    case 'square': {
      g.roundRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4, s * 0.08).stroke({ ...line(s * 0.2), join: 'miter' });
      break;
    }
    case 'triangle': {
      g.poly([0, -s * 0.8, s * 0.85, s * 0.66, -s * 0.85, s * 0.66]).stroke({ ...line(s * 0.2), join: 'round' });
      break;
    }
    case 'red':
    case 'blue':
    case 'green':
    case 'yellow': {
      const c = COLOR_SWATCH[id];
      const p: Pt = [];
      for (let i = 0; i < 36; i++) {
        const t = (i / 36) * Math.PI * 2;
        const r = s * (0.78 + 0.08 * Math.sin(t * 3 + 0.6) + 0.04 * Math.sin(t * 5));
        p.push(Math.cos(t) * r, Math.sin(t) * r);
      }
      g.poly(p);
      fill(c);
      g.ellipse(-s * 0.3, -s * 0.32, s * 0.16, s * 0.1).fill({ color: WHITE, alpha: 0.4 });
      break;
    }
  }
}
