import { Container, Graphics, Point, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, damp, lerp, tween, TAU } from '@/sdk';
import { createParticles, createPixiApp, glowTexture, gradientTexture } from '@/sdk/pixi';
import {
  HARMONY_STEP,
  MAX_HARMONY,
  MOON_R,
  PLANET_R,
  R_MAX,
  R_MIN,
  STEP,
  heavyAt,
  itemRadius,
  nextSegment,
  paramsFor,
  stepMoon,
  type CourseItem,
  type HeavyZone,
  type Moon,
} from './logic';

const CYCLE_S = 90;
const HARMONY_COLORS = [0x8fe9ff, 0x9fb4ff, 0xd7a2ff, 0xff9fd0, 0xffd68a];
const LAYER_NAMES = ['BASS', 'PADS', 'ARP', 'LEAD'];
const TRAIL_N = 56;

interface Item extends CourseItem {
  view: Container;
  g: Graphics;
  glow: Sprite;
  state: 'live' | 'passed' | 'missed' | 'hit' | 'safe';
  minD: number;
  spin: number;
}

function lerpColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}
const harmonyColor = (h: number) => {
  const i = clamp(Math.floor(h), 0, HARMONY_COLORS.length - 1);
  const j = Math.min(HARMONY_COLORS.length - 1, i + 1);
  return lerpColor(HARMONY_COLORS[i], HARMONY_COLORS[j], clamp(h - i, 0, 1));
};

function planetTexture(): Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.save();
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 1, 0, TAU);
  g.clip();
  const base = g.createRadialGradient(s * 0.36, s * 0.32, s * 0.05, s * 0.5, s * 0.5, s * 0.55);
  base.addColorStop(0, '#ffe3c8');
  base.addColorStop(0.35, '#ff9fc4');
  base.addColorStop(0.7, '#9a5fd6');
  base.addColorStop(1, '#3a1f78');
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  // soft bands
  for (let i = 0; i < 9; i++) {
    const y = s * (0.12 + i * 0.1) + Math.sin(i * 1.7) * 6;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(60,20,110,0.10)';
    g.beginPath();
    g.ellipse(s / 2, y, s * 0.7, 5 + (i % 3) * 3, -0.18, 0, TAU);
    g.fill();
  }
  // terminator shade
  const sh = g.createLinearGradient(s * 0.2, s * 0.2, s, s);
  sh.addColorStop(0, 'rgba(10,0,30,0)');
  sh.addColorStop(0.55, 'rgba(10,0,30,0.12)');
  sh.addColorStop(1, 'rgba(10,0,30,0.65)');
  g.fillStyle = sh;
  g.fillRect(0, 0, s, s);
  g.restore();
  // rim light
  g.strokeStyle = 'rgba(255,230,250,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 2.5, Math.PI * 0.95, Math.PI * 1.65);
  g.stroke();
  return Texture.from(c);
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 10, up: 3, down: 1 });
  if (preview) stair.set(3);
  const FONT = 'Manrope, system-ui, sans-serif';
  const ts = () => ctx.settings.textScale || 1;
  const rand = () => rng.next();

  // ---------------- scene graph
  const bg = new Sprite(gradientTexture([
    [0, '#0c0722'],
    [0.45, '#1d1045'],
    [0.8, '#3a1850'],
    [1, '#51204f'],
  ]));
  const nebulaLayer = new Container();
  const stars = new Graphics();
  const grid = new Graphics();
  const band = new Graphics();
  const zonesG = new Graphics();
  const tether = new Graphics();
  const atmo = new Sprite(glowTexture(256, 0.42));
  atmo.anchor.set(0.5);
  atmo.blendMode = 'add';
  const planetTex = planetTexture();
  const planet = new Sprite(planetTex);
  planet.anchor.set(0.5);
  const itemLayer = new Container();
  const trailPts: Point[] = [];
  for (let i = 0; i < TRAIL_N; i++) trailPts.push(new Point(0, 0));
  // ribbon trail: tapered Graphics strokes (glow pass + core pass)
  const trailGlow = new Graphics();
  trailGlow.blendMode = 'add';
  const trailCore = new Graphics();
  trailCore.blendMode = 'add';
  const moon = new Container();
  const moonGlow = new Sprite(glowTexture(128, 0.3));
  moonGlow.anchor.set(0.5);
  moonGlow.blendMode = 'add';
  const moonDisc = new Graphics();
  const shieldG = new Graphics();
  moon.addChild(moonGlow, shieldG, moonDisc);
  const fx = new Container();
  const ui = new Container();
  app.stage.addChild(bg, nebulaLayer, stars, grid, band, zonesG, atmo, tether, planet, itemLayer, trailGlow, trailCore, moon, fx, ui);
  const particles = createParticles(ctx, fx, 260);

  const nebulae: Array<{ s: Sprite; x: number; y: number; k: number; base: number }> = [];
  const nebTints = [0x6b3fd0, 0xd04fa0, 0x3f7fd0, 0x9a4fd8];
  for (let i = 0; i < 4; i++) {
    const s = new Sprite(glowTexture(256, 0.5));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = nebTints[i];
    nebulaLayer.addChild(s);
    nebulae.push({ s, x: [0.2, 0.85, 0.3, 0.75][i], y: [0.2, 0.35, 0.8, 0.7][i], k: rand() * TAU, base: nebTints[i] });
  }

  const meter = new Graphics();
  const meterLabels = LAYER_NAMES.map((n) => {
    const t = new Text({ text: n, style: { fontFamily: FONT, fontSize: 10, fontWeight: '800', fill: 0xffffff, letterSpacing: 1.5 } });
    t.anchor.set(0.5);
    ui.addChild(t);
    return t;
  });
  const meterTitle = new Text({ text: 'HARMONY', style: { fontFamily: FONT, fontSize: 11, fontWeight: '800', fill: 0xe8dcff, letterSpacing: 3 } });
  meterTitle.anchor.set(0.5);
  const hint = new Text({ text: '', style: { fontFamily: FONT, fontSize: 17, fontWeight: '700', fill: 0xf4ecff, align: 'center' } });
  hint.anchor.set(0.5);
  const holdBadge = new Container();
  const holdRing = new Graphics();
  const holdText = new Text({ text: 'HOLD', style: { fontFamily: FONT, fontSize: 10, fontWeight: '800', fill: 0xffffff, letterSpacing: 1.5 } });
  holdText.anchor.set(0.5);
  holdBadge.addChild(holdRing, holdText);
  const banner = new Text({ text: '', style: { fontFamily: FONT, fontSize: 28, fontWeight: '800', fill: pal.highlight, align: 'center' } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  ui.addChild(meter, meterTitle, hint, holdBadge, banner);

  // ---------------- geometry
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let cx = 0;
  let cy = 0;
  let unit = 60;
  const sx = (theta: number, r: number) => cx + Math.cos(theta) * r * unit;
  const sy = (theta: number, r: number) => cy + Math.sin(theta) * r * unit;

  // ---------------- state
  let alive = true;
  let running = false;
  let ended = false;
  const m: Moon = { theta: -Math.PI / 2, r: (R_MIN + R_MAX) / 2, vr: 0 };
  let omega = paramsFor(stair.level, ctx.settings.timingMultiplier).omega;
  let simTime = 0;
  let acc = 0;
  let score = 0;
  let shields = 3;
  let rings = 0;
  let streak = 0;
  let harmony = 0;
  let maxHarmony = 0;
  let harmonyShow = 0;
  let invuln = 0;
  let shake = 0;
  let pointerHeld = false;
  let keyHeld = false;
  let toggled = false;
  let ghostHold = false;
  let lastPhi = m.theta + 0.9;
  let lastRho = m.r;
  const items: Item[] = [];
  const recent: boolean[] = [];
  let zones: HeavyZone[] = [];
  let hintUntil = 0;
  let holdVis = 0;
  let trailTimer = 0;
  let trailReady = false;

  const holding = () => (preview ? ghostHold : pointerHeld || keyHeld || toggled);

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = ctx.settings.highContrast;
    unit = Math.min(safe.w * 0.465, safe.h * 0.32) / R_MAX;
    cx = safe.x + safe.w / 2;
    cy = safe.y + safe.h * 0.47;
    bg.width = W;
    bg.height = H;
    bg.tint = hc ? 0x000000 : 0xffffff;
    nebulaLayer.visible = !hc;
    stars.clear();
    for (let i = 0; i < 140; i++) {
      const x = (((i * 7919) % 1000) / 1000) * W;
      const y = (((i * 104729) % 1000) / 1000) * H;
      stars.circle(x, y, (i % 4) * 0.4 + 0.5).fill({ color: i % 7 === 0 ? 0xffd9f0 : 0xffffff, alpha: 0.2 + (i % 5) * 0.12 });
    }
    // synthwave horizon grid (decorative)
    grid.clear();
    if (!hc) {
      const gy = H * 0.84;
      for (let i = 0; i < 7; i++) {
        const y = gy + Math.pow(i / 6, 1.8) * (H - gy);
        grid.moveTo(0, y).lineTo(W, y);
      }
      for (let i = -10; i <= 10; i++) {
        const x0 = W / 2 + i * W * 0.03;
        grid.moveTo(x0, gy).lineTo(W / 2 + i * W * 0.16, H);
      }
      grid.stroke({ width: 1, color: 0xff9fd0, alpha: 0.1 });
    }
    // orbit band
    band.clear();
    band.circle(cx, cy, R_MAX * unit).fill({ color: hc ? 0x151515 : 0xffffff, alpha: hc ? 1 : 0.03 });
    band.circle(cx, cy, R_MIN * unit).cut();
    const dashes = 72;
    for (const rr of [R_MIN, R_MAX]) {
      for (let i = 0; i < dashes; i++) {
        const a0 = (i / dashes) * TAU;
        band.moveTo(sx(a0, rr), sy(a0, rr)).arc(cx, cy, rr * unit, a0, a0 + (TAU / dashes) * 0.5);
      }
    }
    band.stroke({ width: hc ? 2 : 1.2, color: hc ? 0xffffff : 0xd8c8ff, alpha: hc ? 0.7 : 0.28 });
    drawZones();
    atmo.position.set(cx, cy);
    planet.position.set(cx, cy);
    planet.width = planet.height = PLANET_R * 2 * unit;
    atmo.width = atmo.height = PLANET_R * 5.2 * unit;
    atmo.tint = hc ? 0x000000 : 0xff9fd0;
    atmo.visible = !hc;
    drawMoon();
    // UI
    const my = safe.y + safe.h - 44;
    meterTitle.position.set(cx, my - 22);
    meterTitle.style.fontSize = 11 * ts();
    meterLabels.forEach((t) => (t.style.fontSize = 10 * ts()));
    hint.position.set(cx, safe.y + 96);
    hint.style.fontSize = 17 * ts();
    holdBadge.position.set(safe.x + safe.w - 42, my - 16);
    banner.position.set(cx, safe.y + safe.h * 0.2);
    banner.style.fontSize = 28 * ts();
    drawMeter();
    for (const it of items) drawItem(it);
    if (trailReady) resetTrail();
  }

  function drawZones() {
    zonesG.clear();
    const hc = ctx.settings.highContrast;
    for (const z of zones) {
      const a0 = z.start;
      const a1 = z.start + z.width;
      zonesG.moveTo(sx(a0, R_MIN), sy(a0, R_MIN)).arc(cx, cy, R_MAX * unit, a0, a1, false);
      zonesG.arc(cx, cy, R_MIN * unit, a1, a0, true).closePath();
      zonesG.fill({ color: hc ? 0x333333 : 0x7a4fe0, alpha: hc ? 0.6 : 0.13 });
      // inward chevrons: "heavy" gravity pattern
      for (let a = a0 + 0.12; a < a1 - 0.05; a += 0.22) {
        for (let rr = R_MIN + 0.3; rr < R_MAX - 0.1; rr += 0.45) {
          const px = sx(a, rr);
          const py = sy(a, rr);
          const ix = -Math.cos(a) * 6;
          const iy = -Math.sin(a) * 6;
          const tx = -Math.sin(a) * 6;
          const ty = Math.cos(a) * 6;
          zonesG.moveTo(px - ix + tx, py - iy + ty).lineTo(px, py).lineTo(px - ix - tx, py - iy - ty);
        }
      }
      zonesG.stroke({ width: 1.5, color: hc ? 0xffffff : 0xc8b0ff, alpha: hc ? 0.7 : 0.35, cap: 'round' });
    }
  }

  function drawMoon() {
    const hc = ctx.settings.highContrast;
    const r = Math.max(7, MOON_R * unit);
    moonDisc.clear();
    moonDisc.circle(0, 0, r).fill({ color: 0xf6f2ff });
    moonDisc.circle(-r * 0.3, -r * 0.2, r * 0.25).circle(r * 0.35, r * 0.25, r * 0.18).circle(r * 0.1, -r * 0.5, r * 0.12).fill({ color: 0xc9bfe6, alpha: 0.8 });
    if (hc) moonDisc.circle(0, 0, r).stroke({ width: 2, color: 0x000000 });
    moonGlow.width = moonGlow.height = r * 7;
    drawShields();
  }

  function drawShields() {
    const r = Math.max(7, MOON_R * unit) + 6;
    shieldG.clear();
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI / 2 + (i * TAU) / 3 + 0.18;
      const a1 = a0 + TAU / 3 - 0.36;
      shieldG.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1);
      shieldG.stroke({ width: i < shields ? 2.5 : 1, color: 0xffffff, alpha: i < shields ? 0.75 : 0.15, cap: 'round' });
    }
  }

  function drawMeter() {
    const hc = ctx.settings.highContrast;
    const my = safe.y + safe.h - 44;
    const segW = Math.min(64, (safe.w - 120) / 4);
    const gap = 8;
    const total = segW * 4 + gap * 3;
    const x0 = cx - total / 2;
    meter.clear();
    const col = harmonyColor(harmonyShow);
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (segW + gap);
      const on = harmony > i;
      meter.roundRect(x, my - 9, segW, 18, 9).fill({ color: on ? (hc ? 0xffffff : col) : 0xffffff, alpha: on ? 0.9 : 0.07 });
      meter.roundRect(x, my - 9, segW, 18, 9).stroke({ width: hc ? 2 : 1, color: 0xffffff, alpha: on ? 0.9 : 0.3 });
      meterLabels[i].position.set(x + segW / 2, my);
      meterLabels[i].style.fill = on ? 0x1a0f33 : 0xffffff;
      meterLabels[i].alpha = on ? 1 : 0.55;
    }
    // progress toward next layer
    const prog = harmony >= MAX_HARMONY ? 1 : (streak % HARMONY_STEP) / HARMONY_STEP;
    meter.roundRect(x0, my + 14, total, 4, 2).fill({ color: 0xffffff, alpha: 0.1 });
    if (prog > 0) meter.roundRect(x0, my + 14, total * prog, 4, 2).fill({ color: hc ? 0xffffff : col, alpha: 0.9 });
  }

  // ---------------- items
  function drawItem(it: Item) {
    const hc = ctx.settings.highContrast;
    const g = it.g;
    g.clear();
    if (it.kind === 'ring') {
      const a = it.size * unit;
      const b = a * 0.36;
      const col = hc ? 0xffffff : harmonyColor(harmonyShow);
      g.ellipse(0, 0, a, b).stroke({ width: hc ? 5 : 4.5, color: col, alpha: 0.95 });
      g.ellipse(0, 0, a - 3, b - 2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });
      g.circle(a, 0, 3).circle(-a, 0, 3).fill({ color: 0xffffff, alpha: 0.9 });
      it.glow.tint = col;
      it.glow.width = a * 2.6;
      it.glow.height = a * 1.5;
      it.glow.alpha = hc ? 0 : 0.35;
    } else {
      const r = it.size * unit;
      let s = it.seed * 1000 + 1;
      const rr = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const pts: number[] = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const k = 0.78 + rr() * 0.34;
        pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
      g.poly(pts).fill({ color: hc ? 0x151515 : 0x5a4a80 });
      g.circle(-r * 0.25, -r * 0.2, r * 0.22).circle(r * 0.28, r * 0.25, r * 0.14).fill({ color: hc ? 0x333333 : 0x3f3260, alpha: 0.9 });
      g.poly(pts).stroke({ width: hc ? 3 : 2.5, color: hc ? 0xffffff : 0xd9ccff, alpha: hc ? 1 : 0.9, join: 'round' });
      // highlight crescent
      g.arc(0, 0, r * 0.62, Math.PI * 1.05, Math.PI * 1.55).stroke({ width: 2, color: 0xffffff, alpha: hc ? 0 : 0.35, cap: 'round' });
      it.glow.tint = 0xff8fb8;
      it.glow.width = it.glow.height = r * 3.6;
      it.glow.alpha = hc ? 0 : 0.18;
    }
  }

  function spawnItems() {
    if (lastPhi >= m.theta + Math.PI * 1.45) return;
    const p = paramsFor(stair.level, ctx.settings.timingMultiplier);
    let densityK = 1;
    if (recent.length >= 6) {
      let hits = 0;
      for (const r of recent) if (r) hits++;
      const ratio = hits / recent.length;
      densityK = ratio > 0.85 ? 1.1 : ratio < 0.5 ? 0.85 : 1;
    }
    while (lastPhi < m.theta + Math.PI * 1.45) {
      const seg = nextSegment(lastPhi, lastRho, p, Math.max(omega, p.omega), rand, densityK);
      for (const c of seg) {
        const view = new Container();
        const glow = new Sprite(glowTexture(128, 0.35));
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        const g = new Graphics();
        view.addChild(glow, g);
        view.alpha = 0;
        itemLayer.addChild(view);
        const it: Item = { ...c, view, g, glow, state: 'live', minD: 99, spin: (rand() - 0.5) * 1.2 };
        drawItem(it);
        items.push(it);
        if (c.kind === 'ring') {
          lastPhi = c.phi;
          lastRho = c.rho;
        }
      }
    }
    if (p.heavy && zones.length === 0) {
      zones = [{ start: ((m.theta + Math.PI) % TAU + TAU) % TAU, width: 0.9 }];
      drawZones();
      ctx.caption('A heavy zone appears — gravity pulls harder there');
    }
  }

  // ---------------- audio: adaptive layered music (lookahead scheduler on the audio clock)
  const BPM = 100;
  const S16 = 60 / BPM / 4;
  const CHORDS = [
    [50, 54, 57, 61],
    [47, 50, 54, 57],
    [43, 47, 50, 54],
    [45, 49, 52, 57],
  ];
  const LEAD = [74, -1, 78, -1, 81, -1, 78, 76, -1, -1, 74, -1, 73, -1, 69, -1];
  let nextT = 0;
  let stepN = 0;
  let musicLevel = 0;
  let stopBed: (() => void) | null = null;
  const mid = ctx.audio.midi;
  function playStep(n: number, t: number) {
    const bar = Math.floor(n / 16) % 4;
    const s = n % 16;
    const ch = CHORDS[bar];
    const L = musicLevel;
    if (s % 4 === 0) ctx.audio.tone(52, { dur: 0.22, type: 'sine', gain: 0.07, attack: 0.004, release: 0.2, when: t, bus: 'music' });
    if (L >= 1 && (s === 0 || s === 6 || s === 8 || s === 14)) ctx.audio.pluck(mid(ch[0] - 12), { gain: 0.16, dur: 0.45, when: t, bus: 'music' });
    if (L >= 2) {
      if (s === 0) for (let i = 1; i < 4; i++) ctx.audio.tone(mid(ch[i]), { type: 'triangle', dur: 2.3, attack: 0.35, release: 1.9, gain: 0.028, when: t, bus: 'music' });
      if (s % 4 === 2) ctx.audio.noise({ dur: 0.05, filter: 7500, q: 0.8, gain: 0.018, when: t, bus: 'music' });
    }
    if (L >= 3 && s % 2 === 0) ctx.audio.pluck(mid(ch[(s / 2) % 4] + 12), { gain: 0.045, dur: 0.3, when: t, bus: 'music', pan: s % 4 === 0 ? -0.3 : 0.3 });
    if (L >= 4 && LEAD[s] > 0 && bar % 2 === 0) ctx.audio.chime(mid(LEAD[s]), { gain: 0.045, dur: 0.6, when: t, bus: 'music' });
  }
  function scheduleMusic() {
    const ac = ctx.audio.raw;
    if (!ac || ac.state !== 'running' || !running) return;
    const now = ac.currentTime;
    if (nextT < now - 0.05) nextT = now + 0.05;
    while (nextT < now + 0.18) {
      playStep(stepN, nextT);
      nextT += S16;
      stepN++;
    }
  }
  const ringScale = ctx.audio.scale(62, 'majorPenta');

  // ---------------- gameplay events
  function setHarmony(h: number) {
    const prev = harmony;
    harmony = clamp(h, 0, MAX_HARMONY);
    maxHarmony = Math.max(maxHarmony, harmony);
    musicLevel = harmony;
    if (harmony > prev) {
      ctx.caption(`Harmony ${harmony} — ${LAYER_NAMES[harmony - 1].toLowerCase()} join the music`);
      ctx.announce(`Harmony ${harmony}`);
    }
    drawMeter();
  }

  function ringPassed(it: Item) {
    it.state = 'passed';
    rings++;
    streak++;
    recent.push(true);
    if (recent.length > 8) recent.shift();
    if (streak % HARMONY_STEP === 0) setHarmony(harmony + 1);
    const gain = 10 * Math.max(1, harmony);
    score += gain;
    stair.record(true);
    ctx.trial({ correct: true, level: stair.level });
    ctx.audio.pluck(ringScale(4 + (streak % 8)), { gain: 0.15, dur: 0.7 });
    if (harmony >= 3) ctx.audio.chime(ringScale(9 + (streak % 5)), { gain: 0.05, dur: 0.8, when: ctx.audio.now() + 0.06 });
    ctx.haptics.tick();
    const x = it.view.x;
    const y = it.view.y;
    particles.burst(x, y, 16 + harmony * 4, { color: harmonyColor(harmonyShow), speed: 150 + harmony * 20, life: 0.7, size: 16 });
    floatText(`+${gain}`, x, y - 18, 0xffffff);
    const v = it.view;
    void tween(ctx, 420, (k) => {
      v.scale.set(1 + k * 0.6);
      v.alpha = 1 - k;
    }).then(() => (it.state = 'safe'));
    drawMeter();
    hud();
  }

  function ringMissed(it: Item) {
    it.state = 'missed';
    streak = 0;
    recent.push(false);
    if (recent.length > 8) recent.shift();
    setHarmony(harmony - 1);
    stair.record(false);
    ctx.trial({ correct: false, level: stair.level });
    ctx.audio.tone(ringScale(1), { dur: 0.25, type: 'triangle', gain: 0.05 });
    const v = it.view;
    void tween(ctx, 400, (k) => {
      v.alpha = (1 - k) * 0.6;
      v.scale.set(1 - k * 0.3);
    }).then(() => (it.state = 'safe'));
    hud();
  }

  function rockHit(it: Item) {
    it.state = 'hit';
    shields--;
    streak = 0;
    setHarmony(harmony - 1);
    invuln = 1.6;
    shake = ctx.settings.reducedMotion ? 0 : 1;
    ctx.audio.noise({ dur: 0.55, filter: 1800, sweepTo: 180, q: 0.9, gain: 0.14 });
    ctx.audio.thunk({ gain: 0.18 });
    ctx.haptics.error();
    ctx.caption('Shield hit — soft shoom');
    particles.burst(it.view.x, it.view.y, 26, { color: 0xb9a6ea, speed: 200, life: 0.8, size: 14 });
    const v = it.view;
    void tween(ctx, 350, (k) => {
      v.alpha = 1 - k;
      v.scale.set(1 + k * 0.5);
    }).then(() => (it.state = 'safe'));
    if (preview && shields <= 0) shields = 3;
    drawShields();
    hud();
    if (!preview && shields <= 0) void finish(false);
  }

  function nearMiss(it: Item) {
    const gain = 5 * Math.max(1, harmony);
    score += gain;
    ctx.audio.noise({ dur: 0.2, filter: 1200, sweepTo: 3000, q: 1.2, gain: 0.05 });
    floatText(`close! +${gain}`, it.view.x, it.view.y - 16, 0xffe7a8);
    hud();
  }

  function floatText(txt: string, x: number, y: number, color: number) {
    const t = new Text({ text: txt, style: { fontFamily: FONT, fontSize: 15 * ts(), fontWeight: '800', fill: color } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    fx.addChild(t);
    void tween(ctx, 800, (k) => {
      t.y = y - k * 30;
      t.alpha = 1 - k * k;
    }).then(() => t.destroy());
  }

  // ---------------- ghost (preview)
  let ghostTarget = m.r;
  let ghostTargetRing: Item | null = null;
  let ghostErr = 0;
  function ghostThink() {
    let ring: Item | null = null;
    for (const it of items) if (it.kind === 'ring' && it.state === 'live' && it.phi > m.theta) {
      if (!ring || it.phi < ring.phi) ring = it;
    }
    if (ring !== ghostTargetRing) {
      ghostTargetRing = ring;
      ghostErr = rand() < 0.1 ? (rand() < 0.5 ? -1 : 1) * (ring ? ring.size * 1.6 : 0) : (rand() - 0.5) * 0.08;
    }
    let desired = ring ? ring.rho + ghostErr : (R_MIN + R_MAX) / 2;
    // swerve around rocks between here and the ring
    for (const it of items) {
      if (it.kind !== 'rock' || it.state !== 'live') continue;
      const dphi = it.phi - m.theta;
      if (dphi < -0.05 || dphi > 0.7) continue;
      const rr = itemRadius(it, simTime);
      const clear = it.size + MOON_R + 0.1;
      if (Math.abs(desired - rr) < clear) desired = rr + (desired >= rr ? clear : -clear);
    }
    ghostTarget = clamp(desired, R_MIN, R_MAX);
    const predicted = m.r + m.vr * 0.28;
    if (predicted > ghostTarget + 0.03) ghostHold = true;
    else if (predicted < ghostTarget - 0.03) ghostHold = false;
  }

  // ---------------- simulation
  let pCache = paramsFor(stair.level, ctx.settings.timingMultiplier);
  let pLevel = -1;
  let pTm = -1;
  const params = () => {
    if (stair.level !== pLevel || ctx.settings.timingMultiplier !== pTm) {
      pLevel = stair.level;
      pTm = ctx.settings.timingMultiplier;
      pCache = paramsFor(pLevel, pTm);
    }
    return pCache;
  };
  function physicsStep() {
    simTime += STEP;
    const p = params();
    omega += (p.omega - omega) * 0.002;
    if (preview) ghostThink();
    const heavy = zones.length > 0 && heavyAt(zones, m.theta);
    stepMoon(m, holding(), omega, heavy);
    if (invuln > 0) invuln -= STEP;
    const mx = Math.cos(m.theta) * m.r;
    const my = Math.sin(m.theta) * m.r;
    for (const it of items) {
      if (it.state !== 'live') continue;
      if (it.kind === 'ring') {
        if (m.theta >= it.phi) {
          if (Math.abs(m.r - it.rho) <= it.size) ringPassed(it);
          else ringMissed(it);
        }
      } else {
        const dphi = it.phi - m.theta;
        if (dphi < 0.6 && dphi > -0.4) {
          const rr = itemRadius(it, simTime);
          const dx = Math.cos(it.phi) * rr - mx;
          const dy = Math.sin(it.phi) * rr - my;
          const d = Math.sqrt(dx * dx + dy * dy);
          it.minD = Math.min(it.minD, d);
          if (d < it.size + MOON_R * 0.85 && invuln <= 0) {
            rockHit(it);
            if (ended) return;
          }
        } else if (dphi <= -0.4) {
          it.state = 'safe';
          if (it.minD < it.size + MOON_R + 0.16) nearMiss(it);
          const v = it.view;
          void tween(ctx, 400, (k) => (v.alpha = 1 - k));
        }
      }
    }
    // trail sampling (time-based)
    trailTimer += STEP;
    if (trailTimer >= 1 / 60) {
      trailTimer = 0;
      for (let i = 0; i < TRAIL_N - 1; i++) trailPts[i].copyFrom(trailPts[i + 1]);
      trailPts[TRAIL_N - 1].set(sx(m.theta, m.r), sy(m.theta, m.r));
    }
    if (running) spawnItems();
    if (!preview && running && simTime >= CYCLE_S) void finish(true);
  }

  let tAmb = 0;
  function frame(dt: number) {
    const k = Math.min(dt, 100) / 1000;
    tAmb += k;
    if (running) {
      acc += k;
      let guard = 0;
      while (acc >= STEP && guard++ < 30) {
        acc -= STEP;
        physicsStep();
        if (ended) break;
      }
      scheduleMusic();
    }
    const reduced = ctx.settings.reducedMotion;
    const hc = ctx.settings.highContrast;
    harmonyShow += (harmony - harmonyShow) * damp(3, k);
    const col = harmonyColor(harmonyShow);

    // ambient
    for (const n of nebulae) {
      const drift = reduced ? 0 : Math.sin(tAmb * 0.05 + n.k) * 20;
      n.s.position.set(n.x * W + drift, n.y * H + (reduced ? 0 : Math.cos(tAmb * 0.04 + n.k) * 14));
      n.s.width = n.s.height = Math.max(W, H) * 0.75;
      n.s.alpha = 0.16 + harmonyShow * 0.03;
      n.s.tint = lerpColor(n.base, col, 0.25 + harmonyShow * 0.08);
    }
    if (!reduced) stars.alpha = 0.8 + Math.sin(tAmb * 0.7) * 0.15;
    grid.y = reduced ? 0 : ((tAmb * 6) % 12) - 6;
    planet.rotation = 0;
    const hold = holding() && running;
    holdVis += ((hold ? 1 : 0) - holdVis) * damp(10, k);
    atmo.alpha = 0.3 + holdVis * 0.25 + (reduced ? 0 : Math.sin(tAmb * 1.3) * 0.04);

    // shake
    let ox = 0;
    let oy = 0;
    if (shake > 0) {
      shake = Math.max(0, shake - k * 2.5);
      ox = Math.sin(tAmb * 70) * 6 * shake;
      oy = Math.cos(tAmb * 55) * 4 * shake;
    }
    app.stage.position.set(ox, oy);

    // moon
    const mxs = sx(m.theta, m.r);
    const mys = sy(m.theta, m.r);
    moon.position.set(mxs, mys);
    moonGlow.tint = col;
    moonGlow.alpha = 0.55 + holdVis * 0.25;
    moon.alpha = invuln > 0 ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(invuln * TAU * 2)) : 1; // 2 Hz, gentle
    trailGlow.visible = trailCore.visible = running || ended;
    drawTrail(mxs, mys, col, hc);

    // tether (hold feedback: gravity beam toward the planet)
    tether.clear();
    if (holdVis > 0.02) {
      const pr = PLANET_R * unit;
      const px = cx + Math.cos(m.theta) * pr;
      const py = cy + Math.sin(m.theta) * pr;
      tether.moveTo(px, py).lineTo(mxs, mys).stroke({ width: 3, color: hc ? 0xffffff : col, alpha: 0.35 * holdVis });
      tether.moveTo(px, py).lineTo(mxs, mys).stroke({ width: 10, color: hc ? 0xffffff : col, alpha: 0.08 * holdVis });
    }

    // items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const rr = itemRadius(it, simTime);
      it.view.position.set(sx(it.phi, rr), sy(it.phi, rr));
      if (it.kind === 'ring') {
        it.view.rotation = it.phi;
        if (it.state === 'live') {
          const ahead = it.phi - m.theta;
          it.view.alpha = clamp((Math.PI * 1.45 - ahead) / 0.7, 0, 1);
          if (!reduced) it.g.scale.set(1, 1 + Math.sin(tAmb * 3 + it.seed * 6) * 0.05);
        }
      } else {
        if (!reduced) it.g.rotation += it.spin * k;
        if (it.state === 'live') it.view.alpha = clamp((Math.PI * 1.45 - (it.phi - m.theta)) / 0.7, 0, 1);
      }
      if (it.state === 'safe' && it.phi < m.theta - 0.3) {
        it.view.destroy({ children: true });
        items.splice(i, 1);
      }
    }
    // re-tint live rings when harmony colour drifts
    if (Math.abs(harmonyShow - harmony) > 0.01) for (const it of items) if (it.kind === 'ring' && it.state === 'live') drawItem(it);

    // hold badge
    holdRing.clear();
    holdRing.circle(0, 0, 20).fill({ color: hc ? 0x000000 : 0x1a1036, alpha: 0.7 });
    holdRing.circle(0, 0, 20).stroke({ width: 2 + holdVis * 2, color: hc ? 0xffffff : col, alpha: 0.35 + holdVis * 0.65 });
    if (holdVis > 0.05) holdRing.circle(0, 0, 20 * holdVis * 0.8).fill({ color: hc ? 0xffffff : col, alpha: 0.25 * holdVis });
    holdText.text = toggled ? 'ON' : 'HOLD';
    holdBadge.alpha = running ? 1 : 0.4;

    // hint
    if (preview) hint.text = hold ? 'Holding — pulling in' : 'Released — drifting out';
    else if (ctx.time() < hintUntil) hint.text = 'Hold to pull in · Let go to drift out';
    else hint.text = '';
    hint.alpha = preview ? 0.85 : clamp((hintUntil - ctx.time()) / 600, 0, 1);

    if (running && !preview) {
      hudTick += k;
      if (hudTick > 0.25) {
        hudTick = 0;
        hud();
      }
    }
    if (Math.abs(harmonyShow - harmony) > 0.01) drawMeter();
  }
  let hudTick = 0;

  function drawTrail(hx: number, hy: number, col: number, hc: boolean) {
    trailGlow.clear();
    trailCore.clear();
    const glowA = 0.18 + harmonyShow * 0.06;
    const coreCol = hc ? 0xffffff : lerpColor(col, 0xffffff, 0.45);
    const wK = 1 + harmonyShow * 0.12;
    // chunked polylines: each chunk shares one width/alpha (keeps the per-frame stroke count low)
    const CH = 4;
    for (let c = 0; c < TRAIL_N - 1; c += CH) {
      const f = Math.min(1, (c + CH) / (TRAIL_N - 1));
      const end = Math.min(TRAIL_N - 1, c + CH);
      trailGlow.moveTo(trailPts[c].x, trailPts[c].y);
      trailCore.moveTo(trailPts[c].x, trailPts[c].y);
      for (let i = c + 1; i <= end; i++) {
        const x = i === TRAIL_N - 1 ? hx : trailPts[i].x;
        const y = i === TRAIL_N - 1 ? hy : trailPts[i].y;
        trailGlow.lineTo(x, y);
        trailCore.lineTo(x, y);
      }
      if (!hc) trailGlow.stroke({ width: (6 + 22 * f) * wK, color: col, alpha: glowA * f * f, cap: 'round', join: 'round' });
      trailCore.stroke({ width: (1 + 6 * f) * wK, color: coreCol, alpha: 0.9 * Math.pow(f, 1.4), cap: 'round', join: 'round' });
    }
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      lives: shields,
      maxLives: 3,
      timer: Math.max(0, Math.ceil(CYCLE_S - simTime)),
      label: `Harmony ${harmony}`,
    });
  }

  async function finish(completed: boolean) {
    if (ended) return;
    ended = true;
    running = false;
    musicLevel = 0;
    if (completed) ctx.storage.set('cycleComplete', true);
    banner.text = completed ? 'Orbit cycle complete' : 'Shields spent';
    ctx.announce(banner.text);
    if (completed) ctx.audio.success();
    await tween(ctx, 400, (k) => (banner.alpha = k));
    await ctx.wait(1300);
    if (!alive) return;
    stopBed?.();
    ctx.end({
      score,
      levelReached: stair.level,
      stats: { rings, maxHarmony, survival: Math.round(Math.min(CYCLE_S, simTime)) },
      message: completed ? (maxHarmony >= 4 ? 'Full harmony — the cosmos sang along.' : 'A graceful orbit.') : 'The moon rests. Try another orbit.',
    });
  }

  // ---------------- input
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  const canInput = () => !preview && running && !ctx.isPaused();
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (!canInput()) return;
    e.preventDefault?.();
    pointerHeld = true;
  });
  const release = () => {
    pointerHeld = false;
  };
  app.stage.on('pointerup', release);
  app.stage.on('pointerupoutside', release);
  window.addEventListener('pointerup', release, { signal: ctx.signal });
  window.addEventListener('pointercancel', release, { signal: ctx.signal });
  window.addEventListener('blur', () => {
    pointerHeld = false;
    keyHeld = false;
  }, { signal: ctx.signal });
  window.addEventListener('keydown', (e) => {
    if (preview || ctx.isPaused()) return;
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (running) keyHeld = true;
    } else if (e.code === 'Enter' && !e.repeat && running) {
      e.preventDefault();
      toggled = !toggled;
      ctx.audio.tick();
      ctx.announce(toggled ? 'Pull on' : 'Pull off');
    }
  }, { signal: ctx.signal });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowDown') keyHeld = false;
  }, { signal: ctx.signal });

  layout();
  ctx.onResize(layout);
  ctx.loop(frame);
  function resetTrail() {
    // lay the trail along the orbit behind the moon (distinct points avoid degenerate rope normals)
    for (let i = 0; i < TRAIL_N; i++) {
      const back = (TRAIL_N - 1 - i) * omega * (1 / 60);
      trailPts[i].set(sx(m.theta - back, m.r), sy(m.theta - back, m.r));
    }
  }
  resetTrail();
  trailReady = true;

  return {
    start() {
      running = true;
      hintUntil = ctx.time() + 6000;
      stopBed = ctx.audio.ambient([38, 45, 50, 57], { gain: 0.04, brightness: 0.35 });
      spawnItems();
      hud();
      ctx.announce('Hold to pull the moon in, let go to drift out');
    },
    onPause() {
      pointerHeld = false;
      keyHeld = false;
    },
    onResume() {
      // audio clock resumes where it stopped; restart the scheduler cleanly from "now"
      nextT = 0;
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      running = false;
      stopBed?.();
    },
  };
}
