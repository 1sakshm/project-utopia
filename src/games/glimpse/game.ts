import { Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, easeOutBack, hex, lerp, mixHex, tween, TAU } from '@/sdk';
import { createParticles, createPixiApp, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { CREATURES, CREATURE_NAME, drawCreature, starPoints, type Creature } from './creatures';

const ROUNDS = 2;
const TRIALS = 16;
const MAX_LEVEL = 15;
const BASE_MS = 250;
const STEP_MS = 1000 / 60; // one 60 Hz frame per level

const DIR_NAMES = ['top', 'upper right', 'right', 'lower right', 'bottom', 'lower left', 'left', 'upper left'];
const DIR_KEYS: Record<string, number> = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
  ArrowUp: 0, ArrowRight: 2, ArrowDown: 4, ArrowLeft: 6,
  KeyW: 0, KeyE: 1, KeyD: 2, KeyC: 3, KeyX: 4, KeyZ: 5, KeyA: 6, KeyQ: 7,
};
const DIR_HINT = ['8', '9', '6', '3', '2', '1', '4', '7'];
const dirAngle = (i: number) => -Math.PI / 2 + (i * Math.PI) / 4;

interface Theme {
  name: string;
  sky: Array<[number, string]>;
  lensBg: number;
  housing: number;
  creature: number;
  detail: number;
  dark: number;
  star: number;
  decoy: number;
  mask: string[];
  bokeh: number;
}

const THEMES: Theme[] = [
  {
    name: 'Forest',
    sky: [[0, '#0b1411'], [0.5, '#15271f'], [1, '#080d0b']],
    lensBg: 0x13231d, housing: 0x2c4a3d, creature: 0xe6c38e, detail: 0xf5e0bb, dark: 0x1a2620,
    star: 0xffd257, decoy: 0xd7c07a, mask: ['#1c342b', '#27453a', '#2f4f40', '#223b31', '#35573f'], bokeh: 0xb7e39a,
  },
  {
    name: 'Desert',
    sky: [[0, '#140c09'], [0.5, '#2e1c14'], [1, '#0d0806']],
    lensBg: 0x24160f, housing: 0x5a3b28, creature: 0xefcb96, detail: 0xfae5c2, dark: 0x2a1a12,
    star: 0xffdc6a, decoy: 0xdcb982, mask: ['#382418', '#4a3020', '#553a28', '#3e2a1c', '#5d4230'], bokeh: 0xffc27a,
  },
  {
    name: 'Snow',
    sky: [[0, '#0b1019'], [0.5, '#192438'], [1, '#080b12']],
    lensBg: 0x141d2c, housing: 0x3a4d6c, creature: 0xd4dde9, detail: 0xeef2f7, dark: 0x18202e,
    star: 0xffd766, decoy: 0xc9c9a8, mask: ['#1e2a3e', '#28374f', '#30405a', '#233048', '#374863'], bokeh: 0xa9c8ff,
  },
];

type Phase = 'idle' | 'iris' | 'fix' | 'expose' | 'mask' | 'creature' | 'where' | 'feedback';

interface Card {
  c: Container;
  bg: Graphics;
  tile: Sprite;
  icon: Graphics;
  label: Text;
  key: Text;
  mark: Graphics;
  kind: Creature;
}

interface Petal {
  c: Container;
  g: Graphics;
  hint: Text;
  mark: Graphics;
}

function maskTexture(t: Theme, seed: number): Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let s = seed || 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, TAU);
  g.clip();
  g.fillStyle = t.mask[0];
  g.fillRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  const folds = 12;
  const shapes: Array<{ x: number; y: number; w: number; h: number; rot: number; col: string; kind: number }> = [];
  for (let i = 0; i < 26; i++) {
    shapes.push({
      x: r() * size * 0.5,
      y: r() * size * 0.18,
      w: 10 + r() * 60,
      h: 6 + r() * 30,
      rot: r() * TAU,
      col: t.mask[1 + Math.floor(r() * (t.mask.length - 1))],
      kind: Math.floor(r() * 3),
    });
  }
  g.filter = 'blur(1.5px)';
  for (let f = 0; f < folds; f++) {
    g.save();
    g.rotate((f / folds) * TAU);
    if (f % 2) g.scale(1, -1);
    for (const sh of shapes) {
      g.save();
      g.translate(sh.x, sh.y);
      g.rotate(sh.rot);
      g.fillStyle = sh.col;
      g.globalAlpha = 0.85;
      g.beginPath();
      if (sh.kind === 0) g.ellipse(0, 0, sh.w / 2, sh.h / 2, 0, 0, TAU);
      else if (sh.kind === 1) {
        g.moveTo(-sh.w / 2, sh.h / 2);
        g.lineTo(0, -sh.h / 2);
        g.lineTo(sh.w / 2, sh.h / 2);
      } else g.rect(-sh.w / 2, -sh.h / 4, sh.w, sh.h / 2);
      g.fill();
      g.restore();
    }
    g.restore();
  }
  g.restore();
  // soft vignette edge
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, TAU);
  g.fill();
  return Texture.from(c);
}

function grainTexture(): Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v * 0.92;
    img.data[i * 4 + 2] = v * 0.8;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: MAX_LEVEL, up: 3, down: 1 });
  if (preview) stair.set(4);
  const FONT = 'Geist Variable, system-ui, sans-serif';
  let theme = THEMES[Math.floor(rng.next() * THEMES.length)];
  let themeIndex = THEMES.indexOf(theme);
  const maskTexCache = new Map<number, Texture>();
  const skyCache = new Map<number, Texture>();
  const getMask = () => {
    let t = maskTexCache.get(themeIndex);
    if (!t) {
      t = maskTexture(theme, 1234 + themeIndex * 999);
      maskTexCache.set(themeIndex, t);
    }
    return t;
  };

  // Soft (dark neumorphism) look: the lens housing becomes a raised soft bezel with the lens sunk into it, and the
  // answer cards become raised tiles (picked = pressed in, coloured rim + mark keep right/wrong). The scene stays.
  const soft = () => ctx.settings.soft;
  const sres = ctx.quality.maxDpr;
  const softBase = () => mixHex(theme.sky[1][1], '#000000', 0.12);
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }

  // ---------------- scene graph
  const bg = new Sprite(Texture.WHITE);
  const bokehLayer = new Container();
  const lensTile = new Sprite();
  lensTile.anchor.set(0.5);
  const lensBack = new Graphics();
  const lensGlow = new Sprite(glowTexture(256, 0.3));
  lensGlow.anchor.set(0.5);
  lensGlow.blendMode = 'add';
  const scene = new Container(); // flashed content
  const creatureG = new Graphics();
  const decoyG = new Graphics();
  const starC = new Container();
  const starGlow = new Sprite(glowTexture(96, 0.25));
  starGlow.anchor.set(0.5);
  starGlow.blendMode = 'add';
  const starG = new Graphics();
  starC.addChild(starGlow, starG);
  scene.addChild(decoyG, creatureG, starC);
  scene.visible = false;
  const mask = new Sprite(Texture.EMPTY);
  mask.anchor.set(0.5);
  mask.visible = false;
  const fixation = new Graphics();
  const irisG = new Graphics();
  const housing = new Graphics();
  const petalLayer = new Container();
  const engrave = new Text({ text: 'GLIMPSE  ·  ƒ/1.4  ·  50 mm', style: { fontFamily: 'Geist Variable, system-ui, sans-serif', fontSize: 10, fontWeight: '700', fill: 0xffffff, letterSpacing: 3 } });
  engrave.anchor.set(0.5);
  const cardLayer = new Container();
  const fx = new Container();
  const ghost = new Container();
  const grainTex = grainTexture();
  const grain = new TilingSprite({ texture: grainTex, width: 10, height: 10 });
  grain.alpha = 0.05;
  grain.blendMode = 'add';
  const vignette = new Sprite(Texture.EMPTY);
  app.stage.addChild(bg, bokehLayer, lensGlow, lensTile, lensBack, petalLayer, scene, mask, fixation, irisG, housing, engrave, cardLayer, fx, grain, vignette, ghost);
  const particles = createParticles(ctx, fx, 160);

  const prompt = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '700', fill: 0xf6ead2, align: 'center' } });
  prompt.anchor.set(0.5);
  const sub = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '500', fill: 0xcbbfa8, align: 'center' } });
  sub.anchor.set(0.5);
  const banner = new Text({ text: '', style: { fontFamily: FONT, fontSize: 30, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 1 } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  fx.addChild(prompt, sub, banner);

  const ghostDot = new Sprite(glowTexture(64, 0.3));
  ghostDot.anchor.set(0.5);
  ghostDot.scale.set(0.9);
  ghostDot.tint = 0xfff1d0;
  ghostDot.blendMode = 'add';
  const ghostRing = new Graphics().circle(0, 0, 16).stroke({ width: 2.5, color: 0xfff1d0, alpha: 0.9 });
  ghost.addChild(ghostDot, ghostRing);
  ghost.visible = false;

  // bokeh lights (ambient)
  const bokeh: Array<{ s: Sprite; x: number; y: number; p: number; sp: number }> = [];
  const bokehCount = Math.round(14 * Math.max(0.5, ctx.quality.particleScale));
  for (let i = 0; i < bokehCount; i++) {
    const s = new Sprite(glowTexture(128, 0.55));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    bokehLayer.addChild(s);
    bokeh.push({ s, x: rng.next(), y: rng.next(), p: rng.next() * TAU, sp: 0.2 + rng.next() * 0.5 });
  }

  // ---------------- geometry
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let cx = 0;
  let cy = 0;
  let R = 100;
  const ts = () => ctx.settings.textScale || 1;

  const petals: Petal[] = [];
  for (let i = 0; i < 8; i++) {
    const c = new Container();
    const g = new Graphics();
    const hint = new Text({ text: DIR_HINT[i], style: { fontFamily: FONT, fontSize: 12, fontWeight: '700', fill: 0x1a1410 } });
    hint.anchor.set(0.5);
    const mark = new Graphics();
    c.addChild(g, hint, mark);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const idx = i;
    c.on('pointerdown', () => {
      if (!preview && phase === 'where') choose(idx);
    });
    c.visible = false;
    petalLayer.addChild(c);
    petals.push({ c, g, hint, mark });
  }

  function drawPetal(p: Petal, i: number, state: 'idle' | 'correct' | 'wrong' | 'dim') {
    const hc = ctx.settings.highContrast;
    const a = dirAngle(i);
    const pr = Math.max(26, R * 0.14);
    p.c.position.set(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
    p.c.rotation = a + Math.PI / 2;
    p.c.hitArea = { contains: (x: number, y: number) => x * x + y * y < (pr + 10) * (pr + 10) };
    const g = p.g;
    g.clear();
    // petal/teardrop pointing outward (local -y is outward)
    const fillA = state === 'dim' ? 0.06 : 0.2;
    const shape = () =>
      g.moveTo(0, -pr * 1.2)
        .bezierCurveTo(pr * 0.95, -pr * 0.5, pr * 0.75, pr * 0.8, 0, pr * 0.8)
        .bezierCurveTo(-pr * 0.75, pr * 0.8, -pr * 0.95, -pr * 0.5, 0, -pr * 1.2);
    shape().fill({ color: state === 'correct' ? hex(pal.accent2) : hc ? 0xffffff : hex(pal.accent), alpha: state === 'correct' ? 0.85 : hc ? 0.3 : fillA });
    shape().stroke({ width: hc ? 3 : 2, color: state === 'correct' ? hex(pal.accent2) : hc ? 0xffffff : 0xffe2a8, alpha: state === 'dim' ? 0.25 : 0.95 });
    if (state === 'idle') g.circle(0, -pr * 0.1, pr * 0.14).fill({ color: hc ? 0xffffff : 0xffe2a8, alpha: 0.9 });
    p.hint.visible = ctx.settings.showKeyHints && state !== 'dim';
    p.hint.rotation = -p.c.rotation;
    p.hint.style.fill = hc ? 0xffffff : 0xffe9c4;
    p.hint.position.set(0, pr * 0.35);
    p.mark.clear();
    if (state === 'wrong') {
      const k = pr * 0.38;
      p.mark.moveTo(-k, -k).lineTo(k, k).moveTo(k, -k).lineTo(-k, k).stroke({ width: 3.5, color: hc ? 0xffffff : 0xffe2a8, cap: 'round' });
    } else if (state === 'correct') {
      p.mark.circle(0, 0, pr * 0.42).stroke({ width: 3.5, color: 0x10261f });
    }
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = ctx.settings.highContrast;
    R = Math.min(safe.w * 0.43, safe.h * 0.27);
    cx = safe.x + safe.w / 2;
    cy = safe.y + Math.max(80 + R * 1.12, safe.h * 0.4);
    let sky = skyCache.get(themeIndex);
    if (!sky) {
      sky = gradientTexture(theme.sky);
      skyCache.set(themeIndex, sky);
    }
    bg.texture = hc ? Texture.WHITE : sky;
    bg.tint = hc ? 0x000000 : 0xffffff;
    bg.width = W;
    bg.height = H;
    bokehLayer.visible = !hc;
    for (const b of bokeh) b.s.tint = theme.bokeh;
    lensGlow.position.set(cx, cy);
    lensGlow.width = lensGlow.height = R * 3.2;
    lensGlow.tint = theme.bokeh;
    lensGlow.alpha = hc ? 0 : 0.12;
    lensBack.clear();
    lensTile.visible = soft();
    if (soft()) {
      const d = Math.round(R * 2.42);
      setSoft(lensTile, { width: d, height: d, base: softBase(), radius: d / 2, depth: 10, resolution: sres });
      lensTile.position.set(cx, cy);
    }
    lensBack.circle(cx, cy, R * 1.08).fill({ color: hc ? 0x050505 : theme.lensBg });
    if (soft()) {
      // inset edge: dark top-left lip and a faint light bottom-right lip around the sunk lens
      lensBack.circle(cx + 1.5, cy + 1.5, R * 1.08 - 2).stroke({ width: 7, color: 0x000000, alpha: 0.28 });
      lensBack.circle(cx - 1, cy - 1, R * 1.08 + 1).stroke({ width: 1.5, color: 0xffffff, alpha: 0.07 });
    }
    if (!hc) {
      for (let i = 1; i <= 3; i++) lensBack.circle(cx, cy, R * (0.28 + i * 0.22)).stroke({ width: 1, color: 0xffffff, alpha: 0.035 });
    }
    housing.clear();
    if (soft()) {
      housing.circle(cx, cy, R * 1.08).stroke({ width: 1.5, color: 0xfff2d8, alpha: 0.18 });
    } else {
      housing.circle(cx, cy, R * 1.13).stroke({ width: R * 0.1, color: hc ? 0x222222 : theme.housing, alpha: 1 });
      housing.circle(cx, cy, R * 1.08).stroke({ width: 2, color: hc ? 0xffffff : 0xfff2d8, alpha: hc ? 0.9 : 0.25 });
      housing.circle(cx, cy, R * 1.185).stroke({ width: 1.5, color: 0xffffff, alpha: hc ? 0.6 : 0.12 });
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const r0 = R * 1.1;
      const r1 = R * (i % 6 === 0 ? 1.17 : 1.14);
      housing.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0).lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    housing.stroke({ width: 1.5, color: 0xffffff, alpha: hc ? 0.7 : soft() ? 0.16 : 0.22 });
    if (!hc && !soft()) {
      // moveTo first so each glint arc starts a fresh sub-path (otherwise Pixi joins it to the last tick mark)
      const a1 = -Math.PI * 0.92;
      const a2 = -Math.PI * 0.86;
      housing
        .moveTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R)
        .arc(cx, cy, R * 1.0, a1, -Math.PI * 0.62)
        .stroke({ width: 3, color: 0xffffff, alpha: 0.07, cap: 'round' });
      housing
        .moveTo(cx + Math.cos(a2) * R * 0.94, cy + Math.sin(a2) * R * 0.94)
        .arc(cx, cy, R * 0.94, a2, -Math.PI * 0.72)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.05, cap: 'round' });
    }
    engrave.position.set(cx, cy + R * 1.135);
    engrave.style.fontSize = Math.max(8, R * 0.05);
    engrave.alpha = hc ? 0.8 : 0.35;
    mask.position.set(cx, cy);
    mask.width = mask.height = R * 2.16;
    drawFixation();
    grain.width = W;
    grain.height = H;
    grain.visible = !hc;
    vignette.texture = vignetteTex();
    vignette.width = W;
    vignette.height = H;
    vignette.visible = !hc;
    prompt.style.fontSize = 21 * ts();
    sub.style.fontSize = 14 * ts();
    banner.style.fontSize = 30 * ts();
    prompt.position.set(cx, cy + R * 1.25 + 26);
    sub.position.set(cx, prompt.y + 24 * ts());
    banner.position.set(cx, cy);
    petals.forEach((p, i) => drawPetal(p, i, petalState[i]));
    positionCards();
    drawIris(irisR);
  }

  let vigTex: Texture | null = null;
  function vignetteTex() {
    if (vigTex) return vigTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    vigTex = Texture.from(c);
    return vigTex;
  }

  function drawFixation() {
    const hc = ctx.settings.highContrast;
    fixation.clear();
    const r = Math.max(10, R * 0.07);
    fixation.circle(cx, cy, r).stroke({ width: 2, color: hc ? 0xffffff : 0xf6e3bd, alpha: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = cx + Math.cos(a) * r * 0.45;
      const py = cy + Math.sin(a) * r * 0.45;
      const tx = Math.cos(a + Math.PI / 2);
      const ty = Math.sin(a + Math.PI / 2);
      fixation.moveTo(px, py).lineTo(px + tx * r * 0.85, py + ty * r * 0.85);
    }
    fixation.stroke({ width: 1.5, color: hc ? 0xffffff : 0xf6e3bd, alpha: 0.8 });
    fixation.circle(cx, cy, 2).fill({ color: hc ? 0xffffff : 0xf6e3bd });
  }

  let irisR = 0; // hole radius as fraction of lens radius (0 closed, 1 open)
  function drawIris(f: number) {
    irisR = f;
    const g = irisG;
    g.clear();
    if (f >= 0.999) return;
    const hc = ctx.settings.highContrast;
    const Rl = R * 1.085;
    const reduced = ctx.settings.reducedMotion;
    if (reduced) {
      // reduced motion: the aperture simply fades
      g.alpha = 1 - f;
      f = 0;
    } else g.alpha = 1;
    const blades = 7;
    const d = TAU / blades;
    const r = f * Rl * 0.93;
    const rot = (1 - f) * 1.1 + 0.3;
    const qd = r / Math.cos(d / 2);
    const endA = Math.acos(clamp(r / Rl, 0, 1));
    const toneA = hc ? 0x0c0c0c : 0x191317;
    const toneB = hc ? 0x161616 : 0x231b1f;
    for (let i = 0; i < blades; i++) {
      const a = i * d + rot;
      const qa = a + d / 2;
      const pts: number[] = [cx + Math.cos(qa) * qd, cy + Math.sin(qa) * qd];
      const e0 = a + endA;
      for (let k = 0; k <= 8; k++) {
        const aa = e0 + (k / 8) * d;
        pts.push(cx + Math.cos(aa) * Rl, cy + Math.sin(aa) * Rl);
      }
      g.poly(pts).fill({ color: i % 2 ? toneA : toneB });
    }
    // blade edges with a warm metallic glint
    for (let i = 0; i < blades; i++) {
      const a = i * d + rot;
      const qa = a + d / 2;
      const qx = cx + Math.cos(qa) * qd;
      const qy = cy + Math.sin(qa) * qd;
      const ex = cx + Math.cos(a + endA) * Rl;
      const ey = cy + Math.sin(a + endA) * Rl;
      g.moveTo(qx, qy).lineTo(ex, ey);
    }
    g.stroke({ width: 1.5, color: hc ? 0x9a9a9a : 0x8a7560, alpha: 0.75 });
    if (r > 2) {
      const hp: number[] = [];
      for (let i = 0; i < blades; i++) {
        const qa = i * d + rot + d / 2;
        hp.push(cx + Math.cos(qa) * qd, cy + Math.sin(qa) * qd);
      }
      g.poly(hp).stroke({ width: 2, color: hc ? 0xffffff : 0xd8b98a, alpha: 0.35 });
    }
  }

  // ---------------- cards
  let cards: Card[] = [];
  function buildCards(options: Creature[]) {
    for (const cd of cards) cd.c.destroy({ children: true });
    cards = options.map((kind, i) => {
      const c = new Container();
      const bgG = new Graphics();
      const tile = new Sprite();
      tile.anchor.set(0.5);
      const icon = new Graphics();
      const label = new Text({ text: CREATURE_NAME[kind], style: { fontFamily: FONT, fontSize: 15 * ts(), fontWeight: '700', fill: 0xf6ead2 } });
      label.anchor.set(0.5);
      const key = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 12 * ts(), fontWeight: '800', fill: 0xcbbfa8 } });
      key.anchor.set(0.5);
      const mark = new Graphics();
      c.addChild(tile, bgG, icon, label, key, mark);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointerdown', () => {
        if (!preview && phase === 'creature') choose(i);
      });
      c.visible = false;
      cardLayer.addChild(c);
      return { c, bg: bgG, tile, icon, label, key, mark, kind };
    });
    positionCards();
  }

  let cardW = 90;
  let cardH = 100;
  function positionCards() {
    const n = cards.length;
    if (!n) return;
    const gap = 10;
    cardW = Math.min(118, (safe.w - 28 - (n - 1) * gap) / n);
    const top = sub.y + 22;
    cardH = clamp(safe.y + safe.h - top - 18, 78, 118);
    const total = n * cardW + (n - 1) * gap;
    cards.forEach((cd, i) => {
      cd.c.position.set(cx - total / 2 + i * (cardW + gap) + cardW / 2, top + cardH / 2);
      drawCard(cd, cardState[i] ?? 'idle');
    });
  }

  const cardState: Array<'idle' | 'correct' | 'wrong' | 'dim'> = [];
  function drawCard(cd: Card, state: 'idle' | 'correct' | 'wrong' | 'dim') {
    const hc = ctx.settings.highContrast;
    const w = cardW;
    const h = cardH;
    cd.bg.clear();
    const border = state === 'correct' ? hex(pal.accent2) : hc ? 0xffffff : 0xf2d9a8;
    cd.tile.visible = soft();
    if (soft()) {
      // picked cards sink in; the rim (sea-green = right, warm = your wrong pick) plus the mark carry the meaning
      const picked = state === 'correct' || state === 'wrong';
      const rim = state === 'correct' ? pal.accent2 : state === 'wrong' ? '#f2d9a8' : undefined;
      setSoft(cd.tile, { width: Math.round(w), height: Math.round(h), base: softBase(), radius: 18, depth: picked ? 2.5 : 6, rim, rimWidth: state === 'correct' ? 3 : 2, resolution: sres });
      cd.tile.alpha = state === 'dim' ? 0.45 : 1;
    } else {
      cd.bg.roundRect(-w / 2, -h / 2, w, h, 16).fill({ color: hc ? 0x000000 : 0x1c1614, alpha: state === 'dim' ? 0.4 : 0.82 });
      cd.bg.roundRect(-w / 2, -h / 2, w, h, 16).stroke({ width: state === 'correct' ? 3.5 : hc ? 2.5 : 1.5, color: border, alpha: state === 'dim' ? 0.25 : state === 'idle' ? 0.55 : 1 });
    }
    cd.icon.clear();
    const s = Math.min(w, h) * 0.24;
    drawCreature(cd.icon, cd.kind, s, {
      fill: theme.creature,
      detail: theme.detail,
      dark: theme.dark,
      outline: hc ? 0xffffff : null,
    });
    cd.icon.position.set(0, -h * 0.1);
    cd.icon.alpha = state === 'dim' ? 0.35 : 1;
    cd.label.position.set(0, h / 2 - 16 * ts());
    cd.label.alpha = state === 'dim' ? 0.4 : 1;
    cd.key.position.set(-w / 2 + 13, -h / 2 + 13);
    cd.key.visible = ctx.settings.showKeyHints;
    cd.c.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= Math.max(w, 52) / 2 && Math.abs(y) <= Math.max(h, 52) / 2 };
    cd.mark.clear();
    if (state === 'correct') {
      cd.mark.moveTo(w / 2 - 26, -h / 2 + 14).lineTo(w / 2 - 19, -h / 2 + 21).lineTo(w / 2 - 9, -h / 2 + 9).stroke({ width: 3.5, color: hex(pal.accent2), cap: 'round', join: 'round' });
    } else if (state === 'wrong') {
      cd.mark.moveTo(w / 2 - 22, -h / 2 + 10).lineTo(w / 2 - 12, -h / 2 + 20).moveTo(w / 2 - 12, -h / 2 + 10).lineTo(w / 2 - 22, -h / 2 + 20).stroke({ width: 3, color: 0xf2d9a8, cap: 'round' });
    }
  }

  const petalState: Array<'idle' | 'correct' | 'wrong' | 'dim'> = new Array(8).fill('idle');

  // ---------------- state
  let alive = true;
  let phase: Phase = 'idle';
  let score = 0;
  let trialNo = 0;
  let round = 1;
  let firstErrorSeen = false;
  let exposeFrames = 15;
  let exposeCount = 0;
  let exposeDone: (() => void) | null = null;
  let pick: ((v: number) => void) | null = null;
  const log: Array<{ ms: number; center: boolean; periph: boolean }> = [];
  let centerOk = 0;
  let periphOk = 0;

  // refresh-rate detection (median of recent frame intervals)
  const dts: number[] = [];
  let frameMs = 1000 / 60;
  function sampleDt(dt: number) {
    if (dt <= 0 || dt > 60) return;
    dts.push(dt);
    if (dts.length > 90) dts.shift();
    if (dts.length >= 15) {
      const s = [...dts].sort((a, b) => a - b);
      frameMs = clamp(s[Math.floor(s.length / 2)], 1000 / 240, 1000 / 24);
    }
  }

  const levelMs = (L: number) => Math.max(STEP_MS, BASE_MS - (L - 1) * STEP_MS);
  const framesFor = (L: number) => Math.max(1, Math.round((levelMs(L) * ctx.settings.timingMultiplier) / frameMs));

  function choose(v: number) {
    const p = pick;
    if (!p) return;
    pick = null;
    p(v);
  }
  const awaitPick = () => new Promise<number>((r) => (pick = r));

  // exposure frame counter — runs just before the renderer (priority -100)
  ctx.loop(() => {
    if (phase !== 'expose') return;
    if (exposeCount === 0) {
      scene.visible = true;
      fixation.visible = false;
    }
    exposeCount++;
    if (exposeCount > exposeFrames) {
      scene.visible = false;
      mask.visible = true;
      mask.alpha = 1;
      mask.rotation = rng.next() * TAU;
      phase = 'mask';
      const d = exposeDone;
      exposeDone = null;
      d?.();
    }
  }, -50);

  // ambient
  let t = 0;
  ctx.loop((dt) => {
    sampleDt(dt);
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    for (const b of bokeh) {
      const x = b.x * W + (reduced ? 0 : Math.sin(t * 0.05 * b.sp + b.p) * 30);
      const y = b.y * H + (reduced ? 0 : Math.cos(t * 0.04 * b.sp + b.p) * 20);
      b.s.position.set(x, y);
      b.s.alpha = 0.05 + 0.04 * Math.sin(t * b.sp * 0.5 + b.p);
      b.s.scale.set(0.8 + b.sp * 1.6);
    }
    if (grain.visible) {
      if (reduced) grain.alpha = 0.035;
      else {
        grain.tilePosition.set((Math.random() * 128) | 0, (Math.random() * 128) | 0);
        grain.alpha = 0.045;
      }
    }
    if (phase === 'fix' && fixation.visible && !reduced) fixation.alpha = 0.75 + 0.25 * Math.sin(t * 5);
    else fixation.alpha = 1;
    if (ghost.visible) ghostRing.scale.set(1 + 0.08 * Math.sin(t * 6));
  });

  // ---------------- trial
  function buildScene(creature: Creature, dir: number, ringIdx: number, decoys: number) {
    const hc = ctx.settings.highContrast;
    creatureG.clear();
    drawCreature(creatureG, creature, R * 0.27, {
      fill: theme.creature,
      detail: theme.detail,
      dark: theme.dark,
      outline: hc ? 0xffffff : null,
    });
    creatureG.position.set(cx, cy);
    const rings = [0.5, 0.7, 0.9];
    const a = dirAngle(dir);
    const tr = R * rings[ringIdx];
    starC.position.set(cx + Math.cos(a) * tr, cy + Math.sin(a) * tr);
    const sr = Math.max(9, R * 0.075);
    starG.clear();
    starG.poly(starPoints(sr, 0.45)).fill({ color: theme.star });
    if (hc) starG.poly(starPoints(sr, 0.45)).stroke({ width: 2, color: 0xffffff });
    starGlow.tint = theme.star;
    starGlow.width = starGlow.height = sr * 5;
    starGlow.alpha = hc ? 0 : 0.55 * (1 - (stair.level - 1) / (MAX_LEVEL + 2));
    decoyG.clear();
    if (decoys > 0) {
      const slots: Array<[number, number]> = [];
      for (let ri = 0; ri < 3; ri++) for (let d = 0; d < 8; d++) if (!(ri === ringIdx && d === dir)) slots.push([ri, d]);
      rng.shuffle(slots);
      const dr = sr * 0.95;
      for (let i = 0; i < Math.min(decoys, slots.length); i++) {
        const [ri, d] = slots[i];
        const aa = dirAngle(d) + (ri === 1 ? Math.PI / 8 : 0);
        const rr = R * rings[ri];
        const x = cx + Math.cos(aa) * rr;
        const y = cy + Math.sin(aa) * rr;
        const pts = starPoints(dr, 0.55, 4, rng.next() * 0.6 - 0.3);
        for (let k = 0; k < pts.length; k += 2) {
          pts[k] += x;
          pts[k + 1] += y;
        }
        decoyG.poly(pts);
      }
      decoyG.fill({ color: theme.decoy, alpha: 0.9 });
    }
  }

  function setPetals(state: 'idle' | 'hidden') {
    petals.forEach((p, i) => {
      petalState[i] = 'idle';
      p.c.visible = state !== 'hidden';
      drawPetal(p, i, 'idle');
    });
  }

  async function moveGhost(x: number, y: number) {
    if (!preview) return;
    if (!ghost.visible) {
      ghost.position.set(cx + R * 0.2, cy + R * 1.6);
      ghost.visible = true;
      ghost.alpha = 0;
    }
    const x0 = ghost.x;
    const y0 = ghost.y;
    await tween(ctx, 520, (k) => {
      ghost.position.set(lerp(x0, x, k), lerp(y0, y, k));
      ghost.alpha = Math.min(1, ghost.alpha + 0.1);
    }, easeInOutSine);
    await tween(ctx, 160, (k) => ghost.scale.set(1 - 0.25 * Math.sin(k * Math.PI)));
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: trialNo / (TRIALS * ROUNDS),
      label: `Round ${round}/${ROUNDS} · ${Math.round(exposeFrames * frameMs)} ms`,
    });
  }

  function floatText(txt: string, x: number, y: number, color: number) {
    const tx = new Text({ text: txt, style: { fontFamily: FONT, fontSize: 24 * ts(), fontWeight: '800', fill: color } });
    tx.anchor.set(0.5);
    tx.position.set(x, y);
    fx.addChild(tx);
    void tween(ctx, 900, (k) => {
      tx.y = y - k * 40;
      tx.alpha = 1 - k * k;
    }).then(() => tx.destroy());
  }

  async function showBanner(text: string, ms: number) {
    banner.text = text;
    await tween(ctx, 300, (k) => (banner.alpha = k));
    await ctx.wait(ms);
    await tween(ctx, 300, (k) => (banner.alpha = 1 - k));
  }

  async function runTrial() {
    const L = stair.level;
    const nOpts = L < 4 ? 2 : L < 8 ? 3 : 4;
    const options = rng.shuffle([...CREATURES]).slice(0, nOpts);
    const creature = rng.pick(options);
    const dir = rng.int(0, 7);
    const ringIdx = clamp(L < 4 ? rng.int(0, 1) : L < 9 ? rng.int(1, 2) : 2, 0, 2);
    const decoys = L < 3 ? 0 : Math.min(23, (L - 2) * 3);
    exposeFrames = framesFor(L);
    const ms = Math.round(exposeFrames * frameMs);
    hud();

    buildScene(creature, dir, ringIdx, decoys);
    buildCards(options);
    setPetals('hidden');
    cardState.length = 0;
    prompt.text = '';
    sub.text = '';

    // aperture opens
    phase = 'iris';
    fixation.visible = true;
    await tween(ctx, ctx.settings.reducedMotion ? 300 : 520, (k) => drawIris(k), easeInOutSine);
    if (!alive) return;
    phase = 'fix';
    prompt.text = 'Eyes on the centre';
    await ctx.wait((preview ? 450 : 650) + rng.next() * 450);
    if (!alive) return;
    prompt.text = '';

    // exposure
    ctx.audio.noise({ dur: 0.045, filter: 5200, q: 0.9, gain: 0.1 });
    ctx.audio.tone(2400, { dur: 0.02, gain: 0.04, attack: 0.001, release: 0.02 });
    exposeCount = 0;
    await new Promise<void>((r) => {
      exposeDone = r;
      phase = 'expose';
    });
    if (!alive) return;
    // mask holds, then fades softly
    await ctx.wait(420);
    await tween(ctx, 320, (k) => (mask.alpha = 1 - k));
    mask.visible = false;
    if (!alive) return;

    // response 1: creature
    phase = 'creature';
    prompt.text = 'Which creature?';
    sub.text = ctx.settings.showKeyHints && !preview ? `Keys 1–${nOpts}` : '';
    ctx.announce('Which creature did you see?');
    cards.forEach((cd, i) => {
      cd.c.visible = true;
      cd.c.alpha = 0;
      cd.c.scale.set(0.9);
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 220 + i * 40, (k) => {
        cd.c.alpha = k;
        cd.c.scale.set(0.9 + 0.1 * k);
      }, easeOutBack);
    });
    const correctIdx = options.indexOf(creature);
    if (preview) {
      const g = rng.chance(0.88) ? correctIdx : (correctIdx + 1) % nOpts;
      ctx.after(700, () => void moveGhost(cards[g].c.x, cards[g].c.y).then(() => choose(g)));
    }
    const ci = await awaitPick();
    if (!alive) return;
    const centerCorrect = ci === correctIdx;
    ctx.audio.tick();
    ctx.haptics.tick();
    cards.forEach((cd, i) => {
      cardState[i] = i === ci ? (centerCorrect ? 'correct' : 'wrong') : i === correctIdx ? 'idle' : 'dim';
      drawCard(cd, cardState[i]);
    });

    // response 2: where
    phase = 'where';
    prompt.text = 'Where was the star?';
    sub.text = ctx.settings.showKeyHints && !preview ? 'Tap a petal · numpad / arrows' : 'Tap a petal';
    ctx.announce('Where was the star-shaped firefly?');
    setPetals('idle');
    if (preview) {
      const g = rng.chance(0.82) ? dir : (dir + (rng.chance(0.5) ? 1 : 7)) % 8;
      const a = dirAngle(g);
      ctx.after(600, () => void moveGhost(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86).then(() => choose(g)));
    }
    const pi = await awaitPick();
    if (!alive) return;
    const periphCorrect = pi === dir;
    phase = 'feedback';

    // grade
    trialNo++;
    const both = centerCorrect && periphCorrect;
    log.push({ ms, center: centerCorrect, periph: periphCorrect });
    if (centerCorrect) centerOk++;
    if (periphCorrect) periphOk++;
    const speed = Math.max(1, 1 + (BASE_MS - ms) / 120);
    const gained = both ? Math.round(100 * speed) : centerCorrect || periphCorrect ? 30 : 0;
    score += gained;
    ctx.trial({ correct: both, rtMs: ms, level: L });
    if (!preview) {
      if (!firstErrorSeen && both) stair.set(Math.min(MAX_LEVEL, stair.level + 1));
      else {
        if (!both) firstErrorSeen = true;
        stair.record(both);
      }
    } else stair.set(clamp(stair.level + (both ? 1 : -1), 3, 6));

    petals.forEach((p, i) => {
      petalState[i] = i === dir ? 'correct' : i === pi ? 'wrong' : 'dim';
      drawPetal(p, i, petalState[i]);
    });
    const a = dirAngle(dir);
    if (both) {
      const tnow = ctx.audio.now();
      ctx.audio.chime(ctx.audio.midi(84), { gain: 0.1, when: tnow });
      ctx.audio.chime(ctx.audio.midi(91), { gain: 0.09, when: tnow + 0.08 });
      ctx.audio.bell(ctx.audio.midi(96), { gain: 0.05, when: tnow + 0.12, dur: 1 });
      ctx.haptics.success();
      particles.burst(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86, 22, { color: theme.star, speed: 160, life: 0.8 });
      ctx.caption(`Correct — ${CREATURE_NAME[creature]}, ${DIR_NAMES[dir]}`);
    } else if (gained > 0) {
      ctx.audio.pluck(ctx.audio.midi(72), { gain: 0.12 });
      ctx.caption(`Half right — it was the ${CREATURE_NAME[creature]}, star at ${DIR_NAMES[dir]}`);
    } else {
      ctx.audio.thunk({ gain: 0.16 });
      ctx.haptics.error();
      ctx.caption(`Missed — it was the ${CREATURE_NAME[creature]}, star at ${DIR_NAMES[dir]}`);
    }
    ctx.audio.noise({ dur: 0.5, filter: 300, sweepTo: 1400, q: 1.5, gain: 0.025, when: ctx.audio.now() + 0.15 });
    if (gained) floatText(`+${gained}`, cx, cy - R * 0.45, both ? hex(pal.highlight) : 0xe6d6b8);
    prompt.text = both ? 'Sharp eyes!' : centerCorrect ? `Star was ${DIR_NAMES[dir]}` : periphCorrect ? `It was the ${CREATURE_NAME[creature]}` : `${CREATURE_NAME[creature]} · star ${DIR_NAMES[dir]}`;
    sub.text = `Glimpse: ${ms} ms`;
    hud();

    // reveal (slow-motion replay in preview)
    decoyG.visible = preview;
    scene.visible = true;
    scene.alpha = 0;
    const revealIn = preview ? 700 : 260;
    await tween(ctx, revealIn, (k) => (scene.alpha = 0.9 * k));
    if (preview) sub.text = 'Replay';
    await ctx.wait(preview ? 1300 : 750);
    await tween(ctx, 260, (k) => (scene.alpha = 0.9 * (1 - k)));
    scene.visible = false;
    scene.alpha = 1;
    decoyG.visible = true;
    ghost.visible = false;
    if (!alive) return;

    // aperture closes
    for (const cd of cards) cd.c.visible = false;
    setPetals('hidden');
    prompt.text = '';
    sub.text = '';
    await tween(ctx, ctx.settings.reducedMotion ? 250 : 380, (k) => drawIris(1 - k), easeInOutSine);
  }

  function glimpseStat() {
    const buckets = new Map<number, { n: number; ok: number }>();
    for (const e of log) {
      const b = buckets.get(e.ms) ?? { n: 0, ok: 0 };
      b.n++;
      if (e.center && e.periph) b.ok++;
      buckets.set(e.ms, b);
    }
    let best = Infinity;
    for (const [ms, b] of buckets) if (b.n >= 2 && b.ok / b.n >= 0.75 && ms < best) best = ms;
    if (best === Infinity) {
      const tail = log.slice(-10);
      best = tail.length ? Math.round(tail.reduce((s, e) => s + e.ms, 0) / tail.length) : BASE_MS;
    }
    return best;
  }

  async function session() {
    drawIris(0);
    if (!preview) {
      await ctx.wait(300);
      await showBanner(`${theme.name} · Round 1`, 700);
    }
    for (;;) {
      if (!alive) return;
      await runTrial();
      if (!alive) return;
      if (preview) continue;
      if (trialNo >= TRIALS * round) {
        if (round >= ROUNDS) break;
        round++;
        themeIndex = (themeIndex + 1) % THEMES.length;
        theme = THEMES[themeIndex];
        mask.texture = getMask();
        layout();
        drawIris(0);
        ctx.announce(`Round ${round}`);
        await showBanner(`${theme.name} · Round ${round}`, 900);
      }
    }
    const n = Math.max(1, log.length);
    const g = glimpseStat();
    await showBanner(`Glimpse speed ${g} ms`, 900);
    ctx.end({
      score,
      levelReached: stair.level,
      stats: { glimpseMs: g, peripheral: Math.round((periphOk / n) * 100), center: Math.round((centerOk / n) * 100) },
      message: g <= 120 ? 'Lightning-quick eyes.' : 'Your glimpse is getting sharper.',
    });
  }

  // ---------------- keyboard
  const keyMap: Record<string, (e: KeyboardEvent) => void> = {};
  for (const code of Object.keys(DIR_KEYS)) keyMap[code] = () => phase === 'where' && choose(DIR_KEYS[code]);
  for (let i = 1; i <= 4; i++) {
    keyMap[`Digit${i}`] = () => {
      if (phase === 'creature' && i <= cards.length) choose(i - 1);
    };
  }
  ctx.keys(keyMap);

  mask.texture = getMask();
  layout();
  drawIris(0);
  ctx.onResize(layout);

  return {
    start() {
      void session();
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      pick = null;
      exposeDone = null;
      for (const tx of maskTexCache.values()) if (tx !== mask.texture) tx.destroy(true);
      for (const tx of skyCache.values()) if (tx !== bg.texture) tx.destroy(true);
    },
  };
}
