// Procedural sumi-e art for Upstream: paper texture, koi, enso ring, brush strokes.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { glowTexture } from '@/sdk/pixi';

let paperCache: Texture | null = null;

/** Warm rice paper with fibres and faint blotches (tileable enough at 256 px with soft noise). */
export function paperTexture(): Texture {
  if (paperCache && !paperCache.destroyed) return paperCache;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  // fibres (drawn wrapped so the tile repeats cleanly)
  for (let i = 0; i < 90; i++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI * 2;
    const len = 6 + r() * 22;
    const light = r() < 0.5;
    g.strokeStyle = light ? 'rgba(255,252,240,0.35)' : 'rgba(120,100,70,0.10)';
    g.lineWidth = 0.6 + r() * 0.6;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a + 0.4) * len * 0.5, y + oy + Math.sin(a + 0.4) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
  }
  paperCache = Texture.from(c);
  return paperCache;
}

export interface Koi {
  c: Container;
  bleed: Sprite;
  body: Graphics;
  tail: Container;
  crown?: Graphics;
  ph: number;
}

const INK = 0x1c1a18;

/**
 * Top-down koi facing +x (~64 px long at scale 1). Brush-ink body with translucent fins,
 * optional vermilion patches. The lead koi gets a golden crown crest that also points forward.
 */
export function makeKoi(opts: { lead: boolean; patches: number; seed: number; hc: boolean }): Koi {
  const { lead, hc } = opts;
  const c = new Container();
  const bleed = new Sprite(glowTexture(128, 0.35));
  bleed.anchor.set(0.5);
  bleed.tint = INK;
  bleed.alpha = hc ? 0 : 0.16;
  bleed.scale.set(0.62, 0.26);
  bleed.x = 2;
  const fins = new Graphics();
  const finA = hc ? 1 : 0.42;
  const finColor = hc ? 0x000000 : 0x3a3632;
  // pectoral fins
  fins.moveTo(14, -7).quadraticCurveTo(9, -19, -1, -22).quadraticCurveTo(5, -13, 5, -7).fill({ color: finColor, alpha: finA });
  fins.moveTo(14, 7).quadraticCurveTo(9, 19, -1, 22).quadraticCurveTo(5, 13, 5, 7).fill({ color: finColor, alpha: finA });
  const tail = new Container();
  tail.x = -7;
  const tg = new Graphics();
  tg.moveTo(0, -6).quadraticCurveTo(-10, -4, -18, -2).lineTo(-18, 2).quadraticCurveTo(-10, 4, 0, 6).closePath().fill({ color: hc ? 0x000000 : INK, alpha: hc ? 1 : 0.92 });
  // caudal fin: two brushy lobes
  tg.moveTo(-15, -1.5).quadraticCurveTo(-22, -6, -35, -14).quadraticCurveTo(-28, -5, -31, 0).quadraticCurveTo(-28, 5, -35, 14).quadraticCurveTo(-22, 6, -15, 1.5).closePath().fill({ color: finColor, alpha: hc ? 1 : 0.55 });
  if (!hc) {
    tg.moveTo(-17, 0).quadraticCurveTo(-25, -4, -33, -11).stroke({ width: 0.8, color: INK, alpha: 0.5 });
    tg.moveTo(-17, 0).quadraticCurveTo(-25, 4, -33, 11).stroke({ width: 0.8, color: INK, alpha: 0.5 });
  }
  tail.addChild(tg);
  const body = new Graphics();
  body.moveTo(31, 0).quadraticCurveTo(29, -8, 18, -10).quadraticCurveTo(4, -11.5, -8, -6).lineTo(-8, 6).quadraticCurveTo(4, 11.5, 18, 10).quadraticCurveTo(29, 8, 31, 0).closePath();
  body.fill({ color: hc ? 0x000000 : INK, alpha: hc ? 1 : 0.94 });
  // dry-brush highlight along the back
  if (!hc) body.moveTo(24, -2).quadraticCurveTo(10, -5, -6, -2).stroke({ width: 1.4, color: 0x5a544c, alpha: 0.55 });
  let s = opts.seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < opts.patches && !hc; i++) {
    const px = 18 - r() * 22;
    const py = (r() - 0.5) * 8;
    body.ellipse(px, py, 4 + r() * 3.5, 2.6 + r() * 2.2).fill({ color: 0xc8452d, alpha: 0.88 });
  }
  body.circle(25, -4.6, 1.3).fill({ color: 0xf3ead8 });
  body.circle(25, 4.6, 1.3).fill({ color: 0xf3ead8 });
  c.addChild(bleed, fins, tail, body);
  const koi: Koi = { c, bleed, body, tail, ph: opts.seed * 1.7 };
  if (lead) {
    const crown = new Graphics();
    const pts = [-3, -9, 16, -12, 7, -4.5, 19, 0, 7, 4.5, 16, 12, -3, 9];
    crown.poly(pts).fill({ color: 0xd9a441 });
    crown.poly(pts).stroke({ width: hc ? 2.4 : 1.4, color: hc ? 0x000000 : 0x6b4a12, join: 'round' });
    crown.circle(16, -12, 2.2).circle(19, 0, 2.2).circle(16, 12, 2.2).fill({ color: 0xffe9a8 });
    crown.moveTo(0, -7).lineTo(0, 7).stroke({ width: 1.2, color: 0x6b4a12, alpha: 0.8 });
    crown.x = -4;
    c.addChild(crown);
    koi.crown = crown;
  }
  return koi;
}

/** Enso: an open brush circle with varying stroke width. */
export function drawEnso(g: Graphics, radius: number, color: number, alpha: number, width: number) {
  g.clear();
  const start = -0.9;
  const end = start + Math.PI * 2 * 0.9;
  const steps = 64;
  const outer: number[] = [];
  const inner: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + (end - start) * t;
    const w = width * (0.35 + 0.65 * Math.sin(Math.PI * Math.pow(t, 0.7))) * (0.85 + 0.15 * Math.sin(t * 17));
    outer.push(Math.cos(a) * (radius + w / 2), Math.sin(a) * (radius + w / 2));
    inner.push(Math.cos(a) * (radius - w / 2), Math.sin(a) * (radius - w / 2));
  }
  const pts = [...outer];
  for (let i = inner.length - 2; i >= 0; i -= 2) pts.push(inner[i], inner[i + 1]);
  g.poly(pts).fill({ color, alpha });
}

/** Tapered brush stroke from (x0,y0) to (x1,y1). */
export function brushStroke(g: Graphics, x0: number, y0: number, x1: number, y1: number, width: number, color: number, alpha: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = 14;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = width * Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 - t * 0.3);
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    left.push(x + nx * w, y + ny * w);
    right.push(x - nx * w, y - ny * w);
  }
  const pts = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) pts.push(right[i], right[i + 1]);
  g.poly(pts).fill({ color, alpha });
}

/** A lily pad (non-directional neutral flanker in 4-direction mode). */
export function makeLilyPad(hc: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const r = 17;
  const notch = 0.32;
  const pts: number[] = [0, 0];
  for (let i = 0; i <= 28; i++) {
    const a = notch / 2 + (i / 28) * (Math.PI * 2 - notch);
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.poly(pts).fill({ color: hc ? 0xffffff : 0x6d7a5a, alpha: hc ? 1 : 0.42 });
  g.poly(pts).stroke({ width: hc ? 2.5 : 1.2, color: hc ? 0x000000 : INK, alpha: hc ? 1 : 0.6 });
  for (let i = 0; i < 5; i++) {
    const a = notch / 2 + 0.5 + i * 1.1;
    g.moveTo(0, 0).lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
  }
  g.stroke({ width: 0.8, color: INK, alpha: hc ? 0.8 : 0.35 });
  c.addChild(g);
  return c;
}
