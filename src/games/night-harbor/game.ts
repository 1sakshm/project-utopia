import { Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, lerp, mixHex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softShades, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import {
  levelParams,
  lureOf,
  makeSignal,
  patternText,
  patternWords,
  plainOf,
  watchQuality,
  type Lamp,
  type Pattern,
  type ShipKind,
} from './logic';
import { beamTexture, fogTexture, streakTexture } from './art';

const ROUNDS = 2;
const ROUND_MS = 100000;
const FONT = 'Manrope, system-ui, sans-serif';
const LAMP_COLORS = [0xffc861, 0xfff1d6, 0x8ff5d8]; // ▲ amber, ● warm white, ■ sea-green (shape is the code)
const WINDOWS = 14;

interface Ship {
  view: Container;
  hull: Container;
  lamps: Graphics[];
  glows: Sprite[];
  refl: Sprite[];
  pattern: Pattern;
  kind: ShipKind;
  lane: 0 | 1;
  dir: 1 | -1;
  born: number;
  dur: number;
  u: number;
  vis: number;
  seenAt: number; // time lamps became readable
  responded: boolean;
  fa: boolean;
  done: boolean;
  bob: number;
  ghostAt: number;
  flare: number;
}

const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const app = await createPixiApp(ctx, { background: pal.bg });
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 12, up: 3, down: 1 });
  if (preview) stair.set(3);
  const low = ctx.quality.tier === 'low';
  // Soft (dark neumorphism) look: only the signal panel and the bell become extruded surfaces; the scene stays painted.
  const soft = () => ctx.settings.soft;
  const SOFT_BASE = '#0d1532'; // night-sky navy the panel is pressed out of
  const sres = ctx.quality.maxDpr;
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }
  // Inset well drawn with plain Graphics from softShades (cheap, redrawn only on layout/state changes):
  // a dark rim on the top-left fading to the face colour, with a faint light lip on the bottom-right.
  function softWell(g: Graphics, x: number, y: number, w: number, h: number, r: number, base: string, d = 3) {
    const sh = softShades(base);
    g.roundRect(x, y, w, h, r).fill({ color: mixHex(base, '#000000', 0.42) });
    g.roundRect(x + d * 0.35, y + d * 0.35, w - d * 0.35, h - d * 0.35, Math.max(0, r - d * 0.2)).fill({ color: mixHex(base, '#000000', 0.22) });
    g.roundRect(x + d * 0.75, y + d * 0.75, w - d * 0.75, h - d * 0.75, Math.max(0, r - d * 0.4)).fill({ color: mixHex(base, '#000000', 0.08) });
    g.roundRect(x, y, w, h, r).stroke({ width: 1, color: sh.light, alpha: 0.45 });
  }

  // ---------------------------------------------------------------- layers
  const skyNight = new Sprite(gradientTexture([[0, '#03060f'], [0.55, '#0b1433'], [1, '#1b2450']]));
  const skyPre = new Sprite(gradientTexture([[0, '#0a1030'], [0.55, '#2a2d62'], [1, '#6b4a7a']]));
  const skyDawn = new Sprite(gradientTexture([[0, '#2a4680'], [0.5, '#b87489'], [0.8, '#f2ab7a'], [1, '#ffd9a0']]));
  const stars = new Graphics();
  const twinkles = new Container();
  const moon = new Container();
  const sun = new Sprite(glowTexture(256, 0.18));
  sun.anchor.set(0.5);
  sun.blendMode = 'add';
  sun.tint = 0xffc98a;
  const hills = new Graphics();
  const town = new Graphics();
  const windowsLayer = new Container();
  const seaNight = new Sprite(gradientTexture([[0, '#0c1836'], [1, '#02040b']]));
  const seaDawn = new Sprite(gradientTexture([[0, '#5a5a86'], [0.4, '#2d3561'], [1, '#0e1430']]));
  const moonPath = new Graphics();
  const waves = new Graphics();
  const islet = new Container();
  const beam = new Sprite(beamTexture());
  beam.anchor.set(0, 0.5);
  beam.blendMode = 'add';
  const farLane = new Container();
  const fogFar = new Container();
  const nearLane = new Container();
  const fogNear = new Container();
  const fx = new Container();
  const ui = new Container();
  app.stage.addChild(
    skyNight, skyPre, skyDawn, stars, twinkles, moon, sun, hills, town, windowsLayer,
    seaNight, seaDawn, moonPath, waves, islet, farLane, fogFar, beam, nearLane, fogNear, fx, ui,
  );
  const particles = createParticles(ctx, fx, 200);

  const moonGlow = new Sprite(glowTexture(256, 0.2));
  moonGlow.anchor.set(0.5);
  moonGlow.tint = 0xdfe8ff;
  moonGlow.alpha = 0.4;
  moonGlow.blendMode = 'add';
  const moonDisc = new Graphics().circle(0, 0, 18).fill({ color: 0xf4f1e4 }).circle(-5, -4, 3).fill({ color: 0xd9d4c2 }).circle(6, 5, 4).fill({ color: 0xdcd7c6 });
  moon.addChild(moonGlow, moonDisc);

  const twinkleSprites: Array<{ s: Sprite; ph: number; x: number; y: number }> = [];
  for (let i = 0; i < 14; i++) {
    const s = new Sprite(glowTexture(32, 0.15));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.scale.set(0.35 + rng.next() * 0.3);
    twinkles.addChild(s);
    twinkleSprites.push({ s, ph: rng.next() * 10, x: rng.next(), y: rng.next() });
  }

  // lighthouse
  const tower = new Graphics();
  const lampGlow = new Sprite(glowTexture(128, 0.2));
  lampGlow.anchor.set(0.5);
  lampGlow.blendMode = 'add';
  lampGlow.tint = 0xfff0c0;
  islet.addChild(tower, lampGlow);

  // fog banks
  const fadeTex = fogTexture();
  const fogSprites: Sprite[] = [];
  for (const layer of [fogFar, fogNear]) {
    for (let side = 0; side < 2; side++) {
      const s = new Sprite(fadeTex);
      s.tint = 0x9fb3d6;
      layer.addChild(s);
      fogSprites.push(s);
    }
  }

  // signal panel
  const panel = new Container();
  const panelBg = new Graphics();
  const panelTile = new Sprite();
  panelTile.anchor.set(0.5);
  const panelWells = new Graphics();
  const panelLabel = new Text({ text: 'SIGNAL', style: { fontFamily: FONT, fontSize: 11, fontWeight: '800', fill: 0xffe7b0, letterSpacing: 3 } });
  panelLabel.anchor.set(0.5);
  const panelLamps: Graphics[] = [];
  const panelGlows: Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const gl = new Sprite(glowTexture(64, 0.25));
    gl.anchor.set(0.5);
    gl.blendMode = 'add';
    panelGlows.push(gl);
    const g = new Graphics();
    panelLamps.push(g);
  }
  panel.addChild(panelTile, panelBg, panelWells, panelLabel, ...panelGlows, ...panelLamps);

  // bell button + hint
  const bell = new Container();
  const bellBg = new Graphics();
  const bellTile = new Sprite();
  bellTile.anchor.set(0.5);
  const bellIcon = new Graphics();
  bell.addChild(bellTile, bellBg, bellIcon);
  const hint = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fontWeight: '700', fill: 0xdfe6ff, align: 'center' } });
  hint.anchor.set(0.5);
  const banner = new Text({ text: '', style: { fontFamily: FONT, fontSize: 24, fontWeight: '800', fill: 0xffffff, align: 'center', wordWrap: true, wordWrapWidth: 320, lineHeight: 32 } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  ui.addChild(panel, bell, hint, banner);

  // town windows
  interface Win { x: number; y: number; g: Graphics; glow: Sprite; lit: boolean }
  const wins: Win[] = [];
  for (let i = 0; i < WINDOWS; i++) {
    const glow = new Sprite(glowTexture(64, 0.3));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = 0xffc46b;
    glow.alpha = 0;
    const g = new Graphics();
    windowsLayer.addChild(glow, g);
    wins.push({ x: 0, y: 0, g, glow, lit: false });
  }

  const glowTex = glowTexture(64, 0.25);
  const streakTex = streakTexture();

  // ---------------------------------------------------------------- layout
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let horizon = 0;
  let laneY: [number, number] = [0, 0];
  let laneScale: [number, number] = [0.7, 1];
  let lampPos = { x: 0, y: 0 };
  let unit = 1;
  const x0 = () => safe.x - 80 * unit;
  const x1 = () => safe.x + safe.w + 80 * unit;

  function drawLampShape(g: Graphics, shape: Lamp, x: number, y: number, r: number, color: number, hc: boolean) {
    if (shape === 0) g.poly([x, y - r * 1.1, x + r * 1.05, y + r * 0.75, x - r * 1.05, y + r * 0.75]);
    else if (shape === 1) g.circle(x, y, r * 0.9);
    else g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    g.fill({ color: hc ? 0xffffff : color });
    if (hc) {
      if (shape === 0) g.poly([x, y - r * 1.1, x + r * 1.05, y + r * 0.75, x - r * 1.05, y + r * 0.75]);
      else if (shape === 1) g.circle(x, y, r * 0.9);
      else g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      g.stroke({ width: 2, color: 0x000000 });
    }
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    unit = clamp(safe.w / 390, 0.8, 1.6);
    const hc = ctx.settings.highContrast;
    horizon = safe.y + safe.h * 0.46;
    for (const s of [skyNight, skyPre, skyDawn]) {
      s.width = W;
      s.height = horizon + 2;
    }
    for (const s of [seaNight, seaDawn]) {
      s.y = horizon;
      s.width = W;
      s.height = H - horizon;
    }
    const seaH = safe.y + safe.h - horizon;
    laneY = [horizon + seaH * 0.24, horizon + seaH * 0.56];
    laneScale = [0.8 * unit, 1.05 * unit];

    stars.clear();
    for (let i = 0; i < 130; i++) {
      const x = (((i * 7919) % 1000) / 1000) * W;
      const y = (((i * 104729) % 1000) / 1000) * horizon * 0.95;
      stars.circle(x, y, (i % 3) * 0.45 + 0.5).fill({ color: 0xffffff, alpha: 0.2 + (i % 5) * 0.1 });
    }
    for (const t of twinkleSprites) t.s.position.set(t.x * W, t.y * horizon * 0.85);

    // hills + town on the right
    hills.clear();
    const hx = safe.x + safe.w * 0.52;
    hills.moveTo(hx - 40 * unit, horizon + 1);
    hills.bezierCurveTo(hx + 20 * unit, horizon - 30 * unit, hx + 80 * unit, horizon - 58 * unit, W, horizon - 70 * unit);
    hills.lineTo(W, horizon + 1).closePath().fill({ color: hc ? 0x000000 : 0x070b18 });
    hills.moveTo(0, horizon + 1).lineTo(0, horizon - 10 * unit).bezierCurveTo(safe.x + 40 * unit, horizon - 14 * unit, safe.x + 90 * unit, horizon - 4 * unit, safe.x + 140 * unit, horizon + 1).closePath().fill({ color: hc ? 0x000000 : 0x0a1024 });
    town.clear();
    let wi = 0;
    for (let i = 0; i < 7; i++) {
      const u = i / 6;
      const bx = hx + 14 * unit + u * (safe.x + safe.w - hx - 20 * unit);
      const hillY = horizon - (8 + Math.pow(u, 0.8) * 54) * unit;
      const bw = (20 + (i % 3) * 5) * unit;
      const bh = (18 + ((i * 7) % 4) * 5) * unit;
      const top = hillY - bh;
      town.rect(bx - bw / 2, top, bw, bh + 12 * unit).fill({ color: hc ? 0x111111 : 0x0c1122 });
      town.poly([bx - bw / 2 - 3 * unit, top, bx, top - 11 * unit, bx + bw / 2 + 3 * unit, top]).fill({ color: hc ? 0x111111 : 0x0c1122 });
      if (hc) {
        town.rect(bx - bw / 2, top, bw, bh + 12 * unit).stroke({ width: 1.5, color: 0xffffff });
      }
      for (let k = 0; k < 2 && wi < WINDOWS; k++, wi++) {
        const w = wins[wi];
        w.x = bx + (k === 0 ? -bw * 0.22 : bw * 0.22);
        w.y = top + bh * 0.45;
      }
    }
    drawWindows();

    // islet + lighthouse (left)
    const ix = safe.x + safe.w * 0.13;
    const baseY = horizon + seaH * 0.1;
    const th = safe.h * 0.2;
    tower.clear();
    const rock = hc ? 0x000000 : 0x080c19;
    tower.moveTo(ix - 58 * unit, baseY + 10 * unit).bezierCurveTo(ix - 40 * unit, baseY - 16 * unit, ix + 30 * unit, baseY - 22 * unit, ix + 62 * unit, baseY + 10 * unit).closePath().fill({ color: rock });
    const bw = 13 * unit;
    const tw = 8 * unit;
    tower.poly([ix - bw, baseY - 6 * unit, ix + bw, baseY - 6 * unit, ix + tw, baseY - th, ix - tw, baseY - th]).fill({ color: hc ? 0xffffff : 0xa9a8a6 });
    // stripes
    for (let s = 1; s < 4; s += 2) {
      const ya = baseY - 6 * unit - ((th - 6 * unit) * s) / 4;
      const yb = baseY - 6 * unit - ((th - 6 * unit) * (s + 1)) / 4;
      const wa = lerp(bw, tw, s / 4);
      const wb = lerp(bw, tw, (s + 1) / 4);
      tower.poly([ix - wa, ya, ix + wa, ya, ix + wb, yb, ix - wb, yb]).fill({ color: hc ? 0x000000 : 0x6e2e33, alpha: hc ? 0.9 : 0.95 });
    }
    if (!hc) tower.poly([ix, baseY - 6 * unit, ix + bw, baseY - 6 * unit, ix + tw, baseY - th, ix, baseY - th]).fill({ color: 0x000000, alpha: 0.35 });
    if (hc) tower.poly([ix - bw, baseY - 6 * unit, ix + bw, baseY - 6 * unit, ix + tw, baseY - th, ix - tw, baseY - th]).stroke({ width: 2, color: 0xffffff });
    const roomY = baseY - th;
    tower.rect(ix - 10 * unit, roomY - 4 * unit, 20 * unit, 4 * unit).fill({ color: 0x1b1f2e });
    tower.rect(ix - 7 * unit, roomY - 16 * unit, 14 * unit, 12 * unit).fill({ color: 0xfff2c4 });
    tower.poly([ix - 10 * unit, roomY - 16 * unit, ix, roomY - 26 * unit, ix + 10 * unit, roomY - 16 * unit]).fill({ color: 0x1b1f2e });
    lampPos = { x: ix, y: roomY - 10 * unit };
    lampGlow.position.set(lampPos.x, lampPos.y);
    lampGlow.scale.set(1.3 * unit);
    beam.position.set(lampPos.x, lampPos.y);
    beam.width = Math.max(W, safe.w) * 1.15;
    beam.height = beam.width * 0.42;

    // fog banks
    for (let i = 0; i < 4; i++) {
      const s = fogSprites[i];
      const lane = i < 2 ? 0 : 1;
      s.y = laneY[lane] - 125 * laneScale[lane];
      s.height = 170 * laneScale[lane];
    }
    // panel
    const top = Math.max(safe.y, 0) + 72;
    const pw = Math.min(safe.w - 40, 250);
    const ph = 62;
    panel.position.set(safe.x + safe.w / 2, top + ph / 2);
    panelBg.clear();
    panelTile.visible = soft();
    if (soft()) {
      // raised navy plate with a faint brass rim; each lamp sits in its own inset well
      setSoft(panelTile, { width: pw, height: ph, base: SOFT_BASE, radius: 20, depth: 6, rim: 'rgba(255,210,122,0.28)', rimWidth: 1.5, resolution: sres });
    } else {
      panelBg.roundRect(-pw / 2, -ph / 2, pw, ph, 16).fill({ color: hc ? 0x000000 : 0x0a1024, alpha: hc ? 1 : 0.72 });
      panelBg.roundRect(-pw / 2, -ph / 2, pw, ph, 16).stroke({ width: hc ? 3 : 1.5, color: hc ? 0xffffff : 0xffd27a, alpha: hc ? 1 : 0.6 });
    }
    panelLabel.position.set(-pw / 2 + 44, 0);
    drawPanel();
    // bell
    const br = 34;
    bell.position.set(safe.x + safe.w / 2, safe.y + safe.h - 62);
    bellBg.clear();
    bellTile.visible = soft();
    if (soft()) {
      setBellTile(false);
    } else {
      bellBg.circle(0, 0, br).fill({ color: hc ? 0x000000 : 0x0d1430, alpha: hc ? 1 : 0.75 });
      bellBg.circle(0, 0, br).stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : 0xffd27a, alpha: hc ? 1 : 0.8 });
    }
    bellIcon.clear();
    bellIcon.moveTo(-13, 9).quadraticCurveTo(-12, -14, 0, -15).quadraticCurveTo(12, -14, 13, 9).lineTo(-13, 9).fill({ color: hc ? 0xffffff : 0xffd27a });
    bellIcon.circle(0, 13, 3.5).fill({ color: hc ? 0xffffff : 0xffd27a });
    bellIcon.rect(-2, -19, 4, 4).fill({ color: hc ? 0xffffff : 0xffd27a });
    hint.position.set(bell.x, bell.y + br + 16);
    hint.style.fontSize = 13 * ctx.settings.textScale;
    banner.position.set(safe.x + safe.w / 2, horizon - safe.h * 0.13);
    banner.style.wordWrapWidth = safe.w - 40;
    const hcFog = hc;
    fogFar.visible = fogNear.visible = !hcFog;
    moonPath.visible = !hc;
  }

  let signal: Pattern = makeSignal(rng);

  // Soft bell: a raised round button that sinks in for a moment when rung.
  function setBellTile(pressed: boolean) {
    setSoft(bellTile, { width: 68, height: 68, base: SOFT_BASE, radius: 34, depth: pressed ? 2 : 7, rim: 'rgba(255,210,122,0.45)', rimWidth: 1.5, resolution: sres });
  }
  function bellPulse() {
    void tween(ctx, 220, (t) => bell.scale.set(1 + Math.sin(t * Math.PI) * 0.12));
    if (!soft()) return;
    setBellTile(true);
    ctx.after(200, () => {
      if (soft()) setBellTile(false);
    });
  }

  function drawPanel() {
    const hc = ctx.settings.highContrast;
    const pwHalf = Math.min(safe.w - 40, 250) / 2;
    panelWells.clear();
    for (let i = 0; i < 3; i++) {
      const x = -pwHalf + 108 + i * 44;
      if (soft()) softWell(panelWells, x - 19, -18, 38, 38, 19, SOFT_BASE, 4);
      const g = panelLamps[i];
      g.clear();
      drawLampShape(g, signal[i], x, 0, 12, LAMP_COLORS[signal[i]], hc);
      panelGlows[i].position.set(x, 0);
      panelGlows[i].tint = LAMP_COLORS[signal[i]];
      panelGlows[i].scale.set(soft() ? 0.8 : 1.1);
      panelGlows[i].alpha = soft() ? 0.55 : 1;

      panelGlows[i].visible = !hc;
    }
  }

  function drawWindows() {
    const hc = ctx.settings.highContrast;
    for (const w of wins) {
      w.g.clear();
      const s = 3.6 * unit;
      w.g.rect(w.x - s, w.y - s, s * 2, s * 2);
      if (w.lit) w.g.fill({ color: hc ? 0xffffff : 0xffd98a });
      else w.g.stroke({ width: 1, color: hc ? 0xffffff : 0x3a4466, alpha: 0.9 });
      w.glow.position.set(w.x, w.y);
      w.glow.scale.set(0.9 * unit);
      w.glow.alpha = w.lit && !hc ? 0.8 : 0;
    }
  }

  // ---------------------------------------------------------------- ships
  const ships: Ship[] = [];

  function makeShip(pattern: Pattern, lane: 0 | 1, dir: 1 | -1): Ship {
    const hc = ctx.settings.highContrast;
    const view = new Container();
    const hull = new Container();
    const g = new Graphics();
    const dark = hc ? 0x000000 : 0x05070f;
    const edge = hc ? 0xffffff : 0x2a3558;
    const variant = rng.int(0, 2);
    // hull
    g.poly([-52, 0, 50, 0, 64, -15, -60, -15]).fill({ color: dark });
    g.poly([-52, 0, 50, 0, 64, -15, -60, -15]).stroke({ width: hc ? 2.5 : 1.2, color: edge, alpha: hc ? 1 : 0.9 });
    if (variant === 0) {
      g.rect(-6, -30, 26, 15).fill({ color: dark }).rect(-6, -30, 26, 15).stroke({ width: hc ? 2 : 1, color: edge });
      g.rect(0, -26, 5, 5).fill({ color: 0xffd98a, alpha: hc ? 0 : 0.7 });
      g.moveTo(-24, -15).lineTo(-24, -76).stroke({ width: 2.5, color: hc ? 0xffffff : 0x1a2138 });
    } else if (variant === 1) {
      g.moveTo(-12, -15).lineTo(-12, -80).stroke({ width: 2.5, color: hc ? 0xffffff : 0x1a2138 });
      g.poly([-9, -74, -9, -20, 34, -20]).fill({ color: hc ? 0x222222 : 0x151c33, alpha: 0.95 });
      g.poly([-15, -60, -15, -20, -46, -20]).fill({ color: hc ? 0x222222 : 0x121a30, alpha: 0.95 });
      if (hc) g.poly([-9, -74, -9, -20, 34, -20]).stroke({ width: 1.5, color: 0xffffff });
    } else {
      g.rect(-30, -32, 50, 17).fill({ color: dark }).rect(-30, -32, 50, 17).stroke({ width: hc ? 2 : 1, color: edge });
      g.rect(24, -46, 11, 31).fill({ color: hc ? 0x333333 : 0x2a1a1f });
      for (let k = 0; k < 4; k++) g.circle(-22 + k * 12, -24, 2.2).fill({ color: 0xffd98a, alpha: hc ? 0 : 0.55 });
      g.moveTo(-8, -32).lineTo(-8, -78).stroke({ width: 2.5, color: hc ? 0xffffff : 0x1a2138 });
    }
    hull.addChild(g);
    hull.scale.x = dir;
    view.addChild(hull);
    // signal yard with three lamps (always read left → right)
    const yard = new Graphics();
    yard.moveTo(-38, -84).lineTo(38, -84).stroke({ width: 2.5, color: hc ? 0xffffff : 0x2a3558 });
    for (let i = 0; i < 3; i++) yard.moveTo(-28 + i * 28, -84).lineTo(-28 + i * 28, -78).stroke({ width: 1.2, color: hc ? 0xffffff : 0x2a3558 });
    view.addChild(yard);
    const lamps: Graphics[] = [];
    const glows: Sprite[] = [];
    const refl: Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const x = -28 + i * 28;
      const col = LAMP_COLORS[pattern[i]];
      const gl = new Sprite(glowTex);
      gl.anchor.set(0.5);
      gl.blendMode = 'add';
      gl.tint = col;
      gl.position.set(x, -70);
      gl.scale.set(0.6);
      gl.visible = !hc;
      const r = new Sprite(streakTex);
      r.anchor.set(0.5, 0);
      r.blendMode = 'add';
      r.tint = col;
      r.position.set(x, 4);
      r.scale.set(0.7, 0.8);
      r.alpha = 0.3;
      r.visible = !hc;
      const lg = new Graphics();
      drawLampShape(lg, pattern[i], x, -70, 10, col, hc);
      view.addChild(gl, lg);
      view.addChildAt(r, 0);
      lamps.push(lg);
      glows.push(gl);
      refl.push(r);
    }
    view.scale.set(laneScale[lane]);
    return {
      view, hull, lamps, glows, refl, pattern, kind: 'plain', lane, dir, born: 0, dur: 1, u: 0, vis: 0, seenAt: -1,
      responded: false, fa: false, done: false, bob: rng.next() * 10, ghostAt: -1, flare: 0,
    };
  }

  // ---------------------------------------------------------------- state
  let alive = true;
  let running = false;
  let round = 0;
  let roundStart = 0;
  let roundEnd = 0;
  let nextSpawn = 0;
  let sinceTarget = 0;
  let shipsThisRound = 0;
  let score = 0;
  let hits = 0;
  let misses = 0;
  let fas = 0;
  let targets = 0;
  let nonTargets = 0;
  let streak = 0;
  let bestStreak = 0;
  let crRun = 0;
  let litCount = 0;
  let maxLevel = stair.level;
  let dawn = 0;
  let clock = 0;
  let stopAmbient: (() => void) | null = null;
  const laneBusyUntil = [0, 0];

  function spawn(now: number) {
    const P = levelParams(stair.level);
    const tm = ctx.settings.timingMultiplier;
    const free = ([0, 1] as const).filter((l) => now >= laneBusyUntil[l]);
    if (!free.length) return false;
    const lane = free.length === 2 ? (rng.chance(0.5) ? 0 : 1) : free[0];
    let kind: ShipKind;
    const forced = sinceTarget >= 12 || (shipsThisRound === 2 && round === 1) || (preview && shipsThisRound === 0);
    if (forced || rng.chance(preview ? 0.3 : P.targetRate)) kind = 'target';
    else if (rng.chance(P.lureRate)) kind = 'lure';
    else kind = 'plain';
    const pattern: Pattern = kind === 'target' ? ([...signal] as Pattern) : kind === 'lure' ? lureOf(rng, signal, rng.chance(P.orderLure)) : plainOf(rng, signal);
    const dir: 1 | -1 = lane === 1 ? -1 : 1;
    const ship = makeShip(pattern, lane, dir);
    ship.kind = kind;
    ship.born = now;
    ship.dur = P.crossMs * tm * (1 + (rng.next() * 2 - 1) * P.speedJitter) * (preview ? 0.8 : 1);
    if (preview && shipsThisRound === 0) ship.born = now - ship.dur * 0.2; // start partly in view
    (lane === 0 ? farLane : nearLane).addChild(ship.view);
    ships.push(ship);
    laneBusyUntil[lane] = now + ship.dur * 0.72;
    shipsThisRound++;
    sinceTarget = kind === 'target' ? 0 : sinceTarget + 1;
    positionShip(ship, now);
    return true;
  }

  function positionShip(s: Ship, now: number) {
    s.u = clamp((now - s.born) / s.dur, 0, 1);
    const a = x0();
    const b = x1();
    const x = s.dir === 1 ? lerp(a, b, s.u) : lerp(b, a, s.u);
    const bob = ctx.settings.reducedMotion ? 0 : Math.sin(clock / 700 + s.bob) * 1.5;
    s.view.position.set(x, laneY[s.lane] + bob);
    s.view.rotation = ctx.settings.reducedMotion ? 0 : Math.sin(clock / 900 + s.bob) * 0.012;
    // fog visibility
    const P = levelParams(stair.level);
    const clear = ctx.settings.highContrast ? 1 : P.clear;
    const xs = (x - safe.x) / safe.w; // 0..1 across the safe area
    const e0 = (1 - clear) / 2;
    let vis = smooth(-0.02, 0.08, xs) * (1 - smooth(0.92, 1.02, xs));
    if (clear < 1) vis *= smooth(e0 - 0.05, e0 + 0.05, xs) * (1 - smooth(1 - e0 - 0.05, 1 - e0 + 0.05, xs));
    s.vis = vis;
    if (s.seenAt < 0 && vis > 0.85) s.seenAt = now;
  }

  function lampAlpha(s: Ship) {
    return 0.18 + 0.82 * s.vis;
  }

  function inView(s: Ship) {
    return !s.done && s.view.x > safe.x - 6 && s.view.x < safe.x + safe.w + 6;
  }

  // ---------------------------------------------------------------- responses
  function ring() {
    if (!running) return;
    const now = ctx.time();
    bellPulse();
    const visible = ships.filter((s) => inView(s) && !s.responded);
    const target = visible.find((s) => s.kind === 'target');
    if (target) {
      hit(target, now);
      return;
    }
    if (!visible.length) {
      if (ships.some((s) => inView(s) && s.responded)) return; // double tap on an answered ship: ignore
      ctx.audio.tick();
      ctx.caption('Quiet water — no ship in view');
      return;
    }
    // false alarm: attribute to the most central visible ship
    const cx = safe.x + safe.w / 2;
    visible.sort((a, b) => Math.abs(a.view.x - cx) - Math.abs(b.view.x - cx));
    falseAlarm(visible[0], now);
  }

  function hit(s: Ship, now: number) {
    s.responded = true;
    hits++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    const bonus = Math.min(25, Math.floor(streak / 3) * 5);
    score += 50 + bonus;
    const rt = s.seenAt >= 0 ? now - s.seenAt : now - s.born;
    ctx.trial({ correct: true, rtMs: rt, level: stair.level });
    stair.record(true);
    maxLevel = Math.max(maxLevel, stair.level);
    s.flare = 1;
    // warm brass bell
    ctx.audio.bell(ctx.audio.midi(55), { gain: 0.16, dur: 2.6 });
    ctx.audio.bell(ctx.audio.midi(67), { gain: 0.07, dur: 2.0, when: ctx.audio.now() + 0.01 });
    ctx.audio.chime(ctx.audio.midi(79), { gain: 0.03, dur: 1.4, when: ctx.audio.now() + 0.05 });
    ctx.haptics.success();
    ctx.caption('Harbor bell — signal ship!');
    const p = s.view.toGlobal({ x: 0, y: -70 });
    particles.burst(p.x, p.y, 24, { color: 0xffd98a, speed: 160, life: 0.9, size: 18 });
    sendSpark(p.x, p.y);
    hud();
  }

  function falseAlarm(s: Ship, now: number) {
    s.responded = true;
    s.fa = true;
    fas++;
    streak = 0;
    crRun = 0;
    score = Math.max(0, score - 25);
    ctx.trial({ correct: false, rtMs: now - s.born, level: stair.level });
    stair.record(false);
    // muted buoy clank
    ctx.audio.thunk({ gain: 0.16 });
    ctx.audio.noise({ dur: 0.18, filter: 700, q: 6, gain: 0.05 });
    ctx.audio.pluck(ctx.audio.midi(45), { gain: 0.06, dur: 0.3 });
    ctx.haptics.error();
    ctx.caption(s.kind === 'lure' ? 'Buoy clank — close, but not the signal' : 'Buoy clank — not the signal');
    const p = s.view.toGlobal({ x: 0, y: -70 });
    floatText(p.x, p.y - 30, 'not the signal', 0xc9d2ee);
    hud();
  }

  function shipLeft(s: Ship) {
    s.done = true;
    if (s.kind === 'target') {
      targets++;
      if (!s.responded) {
        misses++;
        streak = 0;
        crRun = 0;
        score = Math.max(0, score - 10);
        ctx.trial({ correct: false, level: stair.level });
        stair.record(false);
        ctx.audio.tone(ctx.audio.midi(64), { dur: 0.35, type: 'sine', gain: 0.06 });
        ctx.audio.tone(ctx.audio.midi(59), { dur: 0.6, type: 'sine', gain: 0.05, when: ctx.audio.now() + 0.22 });
        ctx.caption('A signal ship slipped by');
      }
    } else {
      nonTargets++;
      if (!s.fa) {
        streak++;
        crRun++;
        bestStreak = Math.max(bestStreak, streak);
        score += 5 + Math.min(20, Math.floor(streak / 5) * 5);
        ctx.trial({ correct: true, level: stair.level });
        if (crRun >= 5) {
          crRun = 0;
          stair.record(true);
          maxLevel = Math.max(maxLevel, stair.level);
        }
      }
    }
    const v = s.view;
    void tween(ctx, 400, (t) => (v.alpha = 1 - t)).then(() => v.destroy({ children: true }));
    hud();
  }

  const spark = new Sprite(glowTexture(64, 0.2));
  spark.anchor.set(0.5);
  spark.blendMode = 'add';
  spark.tint = 0xffd98a;
  spark.visible = false;
  fx.addChild(spark);
  function sendSpark(x: number, y: number) {
    const w = wins.find((q) => !q.lit);
    if (!w) {
      lampGlow.scale.set(2.2 * unit);
      return;
    }
    w.lit = true; // reserve
    litCount++;
    const s = new Sprite(spark.texture);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = 0xffd98a;
    s.scale.set(0.8);
    fx.addChild(s);
    const cx = (x + w.x) / 2;
    const cy = Math.min(y, w.y) - 80 * unit;
    const ms = ctx.settings.reducedMotion ? 200 : 850;
    void tween(
      ctx,
      ms,
      (t) => {
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        s.position.set(a * x + b * cx + c * w.x, a * y + b * cy + c * w.y);
      },
      easeInOutSine,
    ).then(() => {
      s.destroy();
      drawWindows();
      particles.burst(w.x, w.y, 12, { color: 0xffc46b, speed: 70, life: 0.7, size: 14 });
      ctx.audio.chime(ctx.audio.midi(84), { gain: 0.03, dur: 1.2 });
    });
  }

  const floatPool: Text[] = [];
  function floatText(x: number, y: number, str: string, color: number) {
    let t = floatPool.find((q) => !q.visible);
    if (!t) {
      t = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: 0xffffff } });
      t.anchor.set(0.5);
      fx.addChild(t);
      floatPool.push(t);
    }
    const txt = t;
    txt.text = str;
    txt.style.fill = color;
    txt.visible = true;
    txt.alpha = 1;
    void tween(ctx, 1100, (k) => {
      txt.position.set(x, y - k * 22);
      txt.alpha = 1 - k * k;
    }).then(() => (txt.visible = false));
  }

  // ---------------------------------------------------------------- ghost (preview)
  function ghostThink(s: Ship, now: number) {
    if (!preview || s.done || s.responded) return;
    if (s.ghostAt < 0 && s.seenAt >= 0) {
      const willRing = s.kind === 'target' ? rng.chance(0.9) : s.kind === 'lure' ? rng.chance(0.1) : rng.chance(0.02);
      s.ghostAt = willRing ? s.seenAt + 500 + rng.next() * 600 : Infinity;
    }
    if (s.ghostAt >= 0 && now >= s.ghostAt && inView(s)) {
      s.ghostAt = Infinity;
      if (s.kind === 'target') hit(s, now);
      else falseAlarm(s, now);
      bellPulse();
    }
  }

  // ---------------------------------------------------------------- rounds + HUD
  function hud() {
    const label = `Watch ${Math.max(1, round)}/${ROUNDS} · streak ${streak}`;
    if (preview) ctx.hud.set({ score, level: stair.level, label: `streak ${streak}` });
    else ctx.hud.set({ score, level: stair.level, timer: Math.max(0, Math.ceil((roundEnd - ctx.time()) / 1000)), label });
  }

  async function showBanner(text: string, ms: number) {
    banner.text = text;
    await tween(ctx, 400, (t) => (banner.alpha = t));
    await ctx.wait(ms);
    await tween(ctx, 400, (t) => (banner.alpha = 1 - t));
  }

  function setSignal(p: Pattern) {
    signal = p;
    drawPanel();
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 500, (t) => panel.scale.set(1 + Math.sin(t * Math.PI) * 0.08));
    ctx.announce(`Signal: ${patternWords(p)}`);
  }

  async function startRound() {
    round++;
    shipsThisRound = 0;
    sinceTarget = 0;
    if (round > 1) setSignal(makeSignal(rng));
    else setSignal(signal);
    if (!preview) {
      void showBanner(round === 1 ? `First watch\nRing for ${patternText(signal)}` : `Second watch\nNew signal ${patternText(signal)}`, 1600);
      ctx.caption(`Signal: ${patternWords(signal)}`);
    }
    roundStart = ctx.time();
    roundEnd = roundStart + ROUND_MS;
    nextSpawn = roundStart + (preview ? 0 : 1800);
    running = true;
    if (round === 2 && !preview) {
      stopAmbient?.();
      stopAmbient = ctx.audio.ambient([48, 55, 60, 64, 67], { gain: 0.04, brightness: 0.4 });
    }
    hud();
  }

  async function endRound() {
    running = false;
    // let ships clear out
    // ships still crossing when the watch ends sail off unscored (no unfair misses)
    for (const s of ships) {
      if (s.done) continue;
      s.done = true;
      const v = s.view;
      void tween(ctx, 600, (t) => (v.alpha = 1 - t)).then(() => v.destroy({ children: true }));
    }
    if (round >= ROUNDS) {
      const hr = targets ? Math.round((hits / targets) * 100) : 0;
      const fr = nonTargets ? Math.round((fas / nonTargets) * 100) : 0;
      const wq = watchQuality(hits, targets, fas, nonTargets);
      await showBanner(`Dawn\nWatch quality ${'◆'.repeat(wq.lamps)}${'◇'.repeat(5 - wq.lamps)}`, 1400);
      ctx.end({
        score,
        levelReached: maxLevel,
        stats: { hitRate: hr, faRate: fr, watch: wq.lamps },
        message: `Longest attentive streak: ${bestStreak}. ${litCount >= 8 ? 'The town wakes to your bell.' : 'The harbor slept safely.'}`,
      });
      return;
    }
    await ctx.wait(800);
    if (alive) await startRound();
  }

  // ---------------------------------------------------------------- input
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (_e: FederatedPointerEvent) => {
    if (preview) return;
    ring();
  });
  ctx.keys({ Space: () => ring(), Enter: () => ring() });

  // ---------------------------------------------------------------- per frame
  let lastSec = -1;
  function update(dt: number) {
    clock += dt;
    const now = ctx.time();
    const reduced = ctx.settings.reducedMotion;
    const hc = ctx.settings.highContrast;
    const s = clock / 1000;

    // dawn progress: across the whole session (sped-up loop in preview)
    if (preview) dawn = Math.min(1, ((now / 1000) % 44) / 38);
    else if (round > 0) dawn = clamp(((round - 1) * ROUND_MS + clamp(now - roundStart, 0, ROUND_MS)) / (ROUNDS * ROUND_MS), 0, 1);
    const pre = smooth(0.3, 0.75, dawn);
    const day = smooth(0.7, 1, dawn);
    skyPre.alpha = hc ? 0 : pre;
    skyDawn.alpha = hc ? 0 : day;
    seaDawn.alpha = hc ? 0 : day * 0.85;
    const starA = 1 - smooth(0.55, 0.95, dawn);
    stars.alpha = starA;
    for (const t of twinkleSprites) {
      t.s.alpha = starA * (0.35 + (reduced ? 0.2 : 0.3 * Math.sin(s * 1.3 + t.ph)));
    }
    moon.position.set(safe.x + safe.w * 0.84, lerp(panel.y + 78, horizon - 10, smooth(0.2, 1, dawn)));
    moon.alpha = 1 - smooth(0.75, 1, dawn) * 0.7;
    sun.position.set(safe.x + safe.w * 0.62, horizon + 4);
    sun.scale.set((safe.w * 1.6) / 256);
    sun.alpha = hc ? 0 : day * 0.9;
    for (const sp of [skyPre, skyDawn, seaDawn, sun]) sp.visible = sp.alpha > 0.004;
    const sunDisc = day;
    lampGlow.alpha = 0.9 - day * 0.4 + (reduced ? 0 : Math.sin(s * 0.9) * 0.05);
    if (lampGlow.scale.x > 1.3 * unit) lampGlow.scale.set(Math.max(1.3 * unit, lampGlow.scale.x - dt / 800));
    hills.tint = hc ? 0xffffff : lerpColor(0xffffff, 0x9a86a8, sunDisc * 0.6);

    // beam
    if (reduced) {
      beam.rotation = 0.22;
      beam.alpha = hc ? 0.14 : 0.24 - day * 0.1;
    } else {
      beam.rotation = 0.2 + Math.sin(s * ((Math.PI * 2) / 10)) * 0.42; // one sweep every 10 s
      beam.alpha = (hc ? 0.14 : 0.3) - day * 0.14;
    }
    beam.tint = 0xfff3d0;

    // moon reflection + waves
    waves.clear();
    moonPath.clear();
    if (!hc) {
      const mx = moon.x;
      for (let i = 0; i < 16; i++) {
        const y = horizon + 6 + i * i * 1.6 * unit;
        if (y > H) break;
        const w = (6 + i * 3.2) * unit * (0.6 + 0.4 * Math.sin(s * (reduced ? 0 : 1.4) + i * 1.9));
        moonPath.moveTo(mx - w, y).lineTo(mx + w, y);
      }
      moonPath.stroke({ width: 2, color: 0xe8ecff, alpha: 0.28 * moon.alpha });
    }
    const seaTop = horizon;
    const rows = low ? 9 : 14;
    for (let r = 0; r < rows; r++) {
      const k = r / rows;
      const y = seaTop + 8 + Math.pow(k, 1.5) * (H - seaTop);
      const amp = (1 + k * 4) * unit;
      const phase = reduced ? r : s * (0.6 + k) + r * 1.7;
      const seg = 12;
      for (let i = 0; i <= seg; i++) {
        const x = (i / seg) * W;
        const yy = y + Math.sin(phase + i * 0.9) * amp;
        if (i === 0) waves.moveTo(x, yy);
        else waves.lineTo(x, yy);
      }
    }
    waves.stroke({ width: 1.2, color: hc ? 0x666666 : lerpColor(0x3a5189, 0xffc9a0, day * 0.6), alpha: hc ? 0.5 : 0.22 });

    // fog banks
    const P = levelParams(stair.level);
    const e0 = (1 - P.clear) / 2;
    const fogA = P.clear < 1 ? 0.5 : 0;
    for (let i = 0; i < 4; i++) {
      const f = fogSprites[i];
      const left = i % 2 === 0;
      const width = (e0 + 0.12) * safe.w;
      f.alpha = fogA * (1 - day * 0.3) * (reduced ? 1 : 0.9 + 0.1 * Math.sin(s * 0.3 + i));
      f.visible = f.alpha > 0.004;
      if (left) {
        f.x = 0;
        f.scale.x = (safe.x + width) / 256;
      } else {
        f.x = W; // mirrored: opaque edge at the right screen border
        f.scale.x = -(W - (safe.x + safe.w - width)) / 256;
      }
    }

    // ships
    for (const sh of ships) {
      if (sh.done) continue;
      positionShip(sh, now);
      const a = lampAlpha(sh);
      for (let i = 0; i < 3; i++) {
        const flare = sh.flare;
        sh.lamps[i].alpha = sh.fa ? a * 0.6 : a;
        sh.glows[i].alpha = (sh.fa ? 0.35 : 0.8) * a + flare * 0.6;
        sh.glows[i].scale.set(0.6 + flare * 0.5);
        sh.refl[i].alpha = 0.3 * a;
      }
      if (sh.flare > 0) sh.flare = Math.max(0, sh.flare - dt / 900);
      ghostThink(sh, now);
      if (sh.u >= 1) shipLeft(sh);
    }
    for (let i = ships.length - 1; i >= 0; i--) if (ships[i].done && ships[i].view.destroyed) ships.splice(i, 1);

    if (!running) return;
    if (now >= nextSpawn && (preview || roundEnd - now > levelParams(stair.level).crossMs * ctx.settings.timingMultiplier * 0.9)) {
      if (spawn(now)) {
        const P2 = levelParams(stair.level);
        const tm = ctx.settings.timingMultiplier;
        nextSpawn = now + (P2.gapMin + rng.next() * P2.gapJitter) * tm;
      } else nextSpawn = now + 300;
    }
    if (!preview && now >= roundEnd) {
      void endRound();
      return;
    }
    const sec = Math.ceil((roundEnd - now) / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      hud();
    }
    hint.text = preview ? '' : ctx.settings.showKeyHints ? 'Tap anywhere or Space when the signal passes' : 'Tap anywhere when the signal passes';
    hint.alpha = shipsThisRound < 6 || ctx.settings.showKeyHints ? 0.85 : 0.35;
  }

  function lerpColor(a: number, b: number, t: number) {
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return (r << 16) | (g << 8) | bl;
  }

  // gentle waves on the shore
  function surf() {
    if (!alive) return;
    ctx.audio.noise({ dur: 2.4, filter: 420, sweepTo: 900, gain: 0.025, attack: 0.9, release: 1.2, bus: 'music' });
    ctx.after(4500 + rng.next() * 4000, surf);
  }

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  return {
    start() {
      stopAmbient = ctx.audio.ambient([45, 52, 57, 64], { gain: 0.04, brightness: 0.22 });
      ctx.after(1500, surf);
      void startRound();
    },
    onSettings: () => {
      layout();
    },
    destroy() {
      alive = false;
      running = false;
      stopAmbient?.();
    },
  };
}
