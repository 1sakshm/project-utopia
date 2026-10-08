import {
  BlurFilter,
  Container,
  Graphics,
  GraphicsContext,
  Sprite,
  Text,
  TilingSprite,
  type FederatedPointerEvent,
} from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, easeOutBack, hex, lerp, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { EDGES, NODES, RING0, key, levelSpec, makeTrial, randomRune, type Glyph, type Trial } from './logic';
import { causticTexture, rayTexture, vignetteTexture } from './art';

const ROUNDS_TIMED = 3;
const ROUND_MS = 60000;
const ROUNDS_UNTIMED = 2;
const TRIALS_UNTIMED = 15;
const WINDOW_MS = 6000; // staircase success window (× timingMultiplier)
const HINT_MS = 9000; // gentle hint pulse after this long (× timingMultiplier)
const PENALTY_MS = 2000;
const MAX_ITEMS = 90;
const FONT = 'Geist Variable, system-ui, sans-serif';
const S = 12; // lattice spacing inside a glyph context (glyph spans ~30 units)

interface Item {
  c: Container;
  g: Graphics;
  halo: Sprite;
  u: number;
  v: number;
  x: number;
  y: number;
  ph: number;
  rot: number;
  isTarget: boolean;
  live: boolean;
  shake: number;
  pulse: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const app = await createPixiApp(ctx, { background: pal.bg });
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 20, up: 3, down: 1 });
  if (preview) stair.set(5);
  const untimed = !preview && ctx.settings.noTimePressure;
  const ROUNDS = untimed ? ROUNDS_UNTIMED : ROUNDS_TIMED;
  const ping = ctx.audio.scale(76, 'majorPenta');
  const ACCENT = hex(pal.accent);
  const ACCENT2 = hex(pal.accent2);
  const HI = hex(pal.highlight);

  // Soft (dark neumorphism) look: a calmer deep-water gradient (rays off, caustics dimmer) with the seal and the
  // "Not here" button as extruded surfaces. The glyph field itself stays free-floating: cards behind up to 90 drifting
  // glyphs would turn the search field into a grid and change the task.
  const soft = () => ctx.settings.soft;
  const SB = '#072436';
  const SB2 = '#05182a';
  const sres = ctx.quality.maxDpr;
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }
  const auroraBg = gradientTexture([
    [0, '#0a3346'],
    [0.35, '#072338'],
    [0.75, '#041426'],
    [1, '#02070f'],
  ]);
  const softBg = gradientTexture([
    [0, '#082a3d'],
    [0.2, SB],
    [0.4, SB],
    [0.85, SB2],
    [1, SB2],
  ]);
  const bg = new Sprite(auroraBg);
  const blobs = new Container();
  const rays = new Container();
  const causticA = new TilingSprite({ texture: causticTexture(), width: 10, height: 10 });
  const causticB = new TilingSprite({ texture: causticTexture(), width: 10, height: 10 });
  for (const cs of [causticA, causticB]) {
    cs.blendMode = 'add';
    cs.tint = ACCENT;
  }
  const bokeh = new Container();
  const plankton = new Container();
  const field = new Container();
  const fx = new Container();
  const seal = new Container();
  const ui = new Container();
  const vignette = new Sprite(vignetteTexture());
  // Low tier: one plain drifting sprite instead of two full-screen tiling shaders.
  const causticLow = new Sprite(causticTexture());
  causticLow.anchor.set(0.5);
  causticLow.blendMode = 'add';
  causticLow.tint = ACCENT;
  app.stage.addChild(bg, blobs, rays, causticA, causticB, causticLow, bokeh, plankton, vignette, field, fx, seal, ui);
  const particles = createParticles(ctx, fx, 260);

  if (ctx.quality.tier !== 'low') bokeh.filters = [new BlurFilter({ strength: 6, quality: 2 })];

  // ---------------------------------------------------------------- glyph drawing (shared contexts)
  const ctxCache = new Map<string, GraphicsContext>();
  function glyphContext(g: Glyph): GraphicsContext {
    const hc = ctx.settings.highContrast;
    const k = (hc ? 'h' : 'n') + key(g);
    const hit = ctxCache.get(k);
    if (hit) return hit;
    const c = new GraphicsContext();
    const passes: Array<[number, number, number]> = hc
      ? [
          [6.5, 0x000000, 1],
          [3, 0xffffff, 1],
        ]
      : [
          [8, ACCENT, 0.13],
          [4.5, ACCENT, 0.22],
          [2.3, HI, 1],
        ];
    const rings = g.filter((id) => id >= RING0);
    for (const [w, color, alpha] of passes) {
      for (const id of g) {
        if (id >= RING0) continue;
        const [a, b] = EDGES[id];
        c.moveTo(NODES[a][0] * S, NODES[a][1] * S).lineTo(NODES[b][0] * S, NODES[b][1] * S);
      }
      c.stroke({ width: w, color, alpha, cap: 'round', join: 'round' });
      if (rings.length) {
        for (const id of rings) {
          const n = NODES[id - RING0];
          c.circle(n[0] * S, n[1] * S, S * 0.38);
        }
        c.stroke({ width: w, color, alpha });
      }
    }
    ctxCache.set(k, c);
    return c;
  }

  // ---------------------------------------------------------------- item pool
  const haloTex = glowTexture(96, 0.22);
  const items: Item[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const c = new Container();
    const halo = new Sprite(haloTex);
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    const g = new Graphics();
    c.addChild(halo, g);
    c.visible = false;
    field.addChild(c);
    items.push({ c, g, halo, u: 0, v: 0, x: 0, y: 0, ph: 0, rot: 0, isTarget: false, live: false, shake: 0, pulse: 0 });
  }
  let used = 0; // items[0..used) belong to the current trial

  // ---------------------------------------------------------------- seal (target display)
  const sealGlow = new Sprite(glowTexture(256, 0.25));
  sealGlow.anchor.set(0.5);
  sealGlow.blendMode = 'add';
  sealGlow.tint = ACCENT2;
  const sealDisc = new Graphics();
  const sealTile = new Sprite();
  sealTile.anchor.set(0.5);
  const sealWell = new Sprite();
  sealWell.anchor.set(0.5);
  const sealTicks = new Graphics();
  const sealGlyph = new Graphics();
  const sealFlash = new Sprite(glowTexture(128, 0.3));
  sealFlash.anchor.set(0.5);
  sealFlash.blendMode = 'add';
  sealFlash.alpha = 0;
  const sealLabel = new Text({ text: 'FIND', style: { fontFamily: FONT, fontSize: 11, fontWeight: '800', fill: 0xcfeff0, letterSpacing: 3 } });
  sealLabel.anchor.set(0.5);
  const multText = new Text({ text: '×1', style: { fontFamily: FONT, fontSize: 20, fontWeight: '800', fill: HI } });
  multText.anchor.set(0, 0.5);
  const pips = new Graphics();
  seal.addChild(sealGlow, sealTile, sealWell, sealDisc, sealTicks, sealFlash, sealGlyph, sealLabel, multText, pips);
  let sealR = 46;

  // ---------------------------------------------------------------- UI: "Not here" button, hint text, focus ring, ghost ripple
  const btn = new Container();
  const btnBg = new Graphics();
  const btnTile = new Sprite();
  btnTile.anchor.set(0.5);
  const btnIcon = new Graphics();
  const btnText = new Text({ text: 'Not here', style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: 0xffffff } });
  btnText.anchor.set(0, 0.5);
  btn.addChild(btnTile, btnBg, btnIcon, btnText);
  const hintText = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: 0xbfe9ea, align: 'center' },
  });
  hintText.anchor.set(0.5);
  const focusRing = new Graphics();
  focusRing.visible = false;
  const ripple = new Container();
  const rippleRing = new Graphics().circle(0, 0, 50).stroke({ width: 3, color: ACCENT, alpha: 0.6 });
  const ripplePulse = new Graphics().circle(0, 0, 50).stroke({ width: 4, color: HI });
  let focusCell = -1;
  let focusHc = false;
  const rippleGlow = new Sprite(glowTexture(128, 0.4));
  rippleGlow.anchor.set(0.5);
  rippleGlow.blendMode = 'add';
  rippleGlow.tint = ACCENT;
  rippleGlow.alpha = 0.35;
  ripple.addChild(rippleGlow, rippleRing, ripplePulse);
  ripple.visible = false;
  const banner = new Text({ text: '', style: { fontFamily: FONT, fontSize: 30, fontWeight: '800', fill: 0xffffff, align: 'center' } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  ui.addChild(btn, hintText, focusRing, ripple, banner);

  // pooled find rings
  const rings: Array<{ g: Graphics; t: number; x: number; y: number; r: number; color: number }> = [];
  for (let i = 0; i < 6; i++) {
    const g = new Graphics().circle(0, 0, 50).stroke({ width: 3, color: 0xffffff });
    g.visible = false;
    fx.addChild(g);
    rings.push({ g, t: -1, x: 0, y: 0, r: 40, color: ACCENT });
  }
  function ringAt(x: number, y: number, r: number, color: number) {
    const slot = rings.find((q) => q.t < 0) ?? rings[0];
    slot.t = 0;
    slot.x = x;
    slot.y = y;
    slot.r = r;
    slot.color = color;
  }

  // ---------------------------------------------------------------- ambient decor
  const blobSprites: Sprite[] = [];
  const low = ctx.quality.tier === 'low';
  for (let i = 0; i < (low ? 1 : 4); i++) {
    const s = new Sprite(glowTexture(256, 0.1));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = i % 2 ? ACCENT2 : ACCENT;
    s.alpha = 0.08;
    blobs.addChild(s);
    blobSprites.push(s);
  }
  const rayTex = rayTexture();
  const raySprites: Sprite[] = [];
  for (let i = 0; i < (low ? 2 : 4); i++) {
    const s = new Sprite(rayTex);
    s.anchor.set(0.5, 0);
    s.blendMode = 'add';
    s.tint = 0xbff8ff;
    s.alpha = 0.05;
    rays.addChild(s);
    raySprites.push(s);
  }
  const bokehGlyphs: Array<{ g: Graphics; ph: number; sp: number; bx: number; by: number }> = [];
  for (let i = 0; i < 9; i++) {
    const g = new Graphics(glyphContext(randomRune(rng, 3 + (i % 2), i % 3 === 0)));
    g.alpha = (ctx.quality.tier === 'low' ? 0.04 : 0.09) + (i % 3) * 0.02;
    bokeh.addChild(g);
    bokehGlyphs.push({ g, ph: rng.next() * 10, sp: 0.5 + rng.next(), bx: rng.next(), by: rng.next() });
  }
  const dotTex = glowTexture(32, 0.3);
  const motes: Array<{ s: Sprite; x: number; y: number; sp: number; ph: number }> = [];
  const moteCount = Math.round(46 * ctx.quality.particleScale) + 10;
  for (let i = 0; i < moteCount; i++) {
    const s = new Sprite(dotTex);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = i % 3 === 0 ? ACCENT2 : 0xc9fff6;
    s.scale.set(0.12 + rng.next() * 0.22);
    s.alpha = 0.25 + rng.next() * 0.4;
    plankton.addChild(s);
    motes.push({ s, x: rng.next(), y: rng.next(), sp: 0.004 + rng.next() * 0.012, ph: rng.next() * 10 });
  }

  // ---------------------------------------------------------------- layout
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  const rect = { x: 0, y: 0, w: 0, h: 0 };
  let cell = 60;
  let glyphScale = 1.4;
  let btnRect = { x: 0, y: 0, w: 0, h: 0 };

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = ctx.settings.highContrast;
    bg.texture = soft() ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    bg.tint = hc ? 0x222222 : 0xffffff;
    vignette.width = W;
    vignette.height = H;
    vignette.visible = !hc;
    vignette.alpha = soft() ? 0.55 : 1;
    for (const cs of [causticA, causticB]) {
      cs.width = W;
      cs.height = H;
      cs.visible = !hc;
    }
    if (low) causticA.visible = causticB.visible = false;
    causticLow.visible = low && !hc;
    causticLow.scale.set((Math.max(W, H) * 1.25) / 256);
    causticLow.alpha = 0.08;
    causticLow.position.set(W / 2, H / 2);
    causticA.tileScale.set(2.4);
    causticB.tileScale.set(3.4);
    causticA.alpha = soft() ? 0.035 : 0.07;
    causticB.alpha = soft() ? 0.025 : 0.05;
    rays.visible = !hc && !low && !soft();
    blobs.visible = !hc;
    raySprites.forEach((s, i) => {
      s.x = W * (0.15 + i * (low ? 0.5 : 0.25));
      s.y = -20;
      s.height = H * 0.95;
      s.width = W * (0.12 + (i % 2) * 0.08);
      s.rotation = -0.25 + i * 0.05;
    });
    blobSprites.forEach((s, i) => {
      s.scale.set((Math.max(W, H) / 256) * (0.45 + (i % 3) * 0.15));
    });
    bokeh.visible = !hc && !low;
    bokehGlyphs.forEach((b, i) => b.g.scale.set(3.5 + (i % 3) * 1.5));

    const top = Math.max(safe.y, 0) + 70;
    sealR = clamp(safe.w * 0.12, 40, 58);
    seal.position.set(safe.x + safe.w / 2, top + sealR + 8);
    const bottomPad = 86;
    rect.x = safe.x + 12;
    rect.w = safe.w - 24;
    rect.y = seal.y + sealR + 26;
    rect.h = safe.y + safe.h - bottomPad - rect.y;
    drawSeal();
    // button
    const bw = 164;
    const bh = 50;
    btn.position.set(safe.x + safe.w / 2, safe.y + safe.h - 46);
    btnRect = { x: btn.x - bw / 2, y: btn.y - bh / 2, w: bw, h: bh };
    btnBg.clear();
    btnTile.visible = soft();
    if (soft()) setSoft(btnTile, { width: bw, height: bh, base: SB2, radius: bh / 2, depth: 6, resolution: sres });
    else {
      btnBg.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2).fill({ color: hc ? 0x000000 : 0x06202e, alpha: hc ? 1 : 0.7 });
      btnBg.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2).stroke({ width: hc ? 3 : 1.5, color: hc ? 0xffffff : ACCENT, alpha: hc ? 1 : 0.7 });
    }
    btnIcon.clear();
    btnIcon.circle(-bw / 2 + 30, 0, 9).stroke({ width: 2.4, color: 0xffffff });
    btnIcon.moveTo(-bw / 2 + 23, 7).lineTo(-bw / 2 + 37, -7).stroke({ width: 2.4, color: 0xffffff, cap: 'round' });
    btnText.position.set(-bw / 2 + 48, 0);
    hintText.position.set(btn.x, btn.y);
    hintText.style.fontSize = 14 * ctx.settings.textScale;
    banner.position.set(safe.x + safe.w / 2, rect.y + rect.h / 2);
    placeItems();
    refreshGlyphContexts();
  }

  function drawSeal() {
    const hc = ctx.settings.highContrast;
    sealGlow.scale.set((sealR * 4) / 256);
    sealGlow.alpha = hc ? 0 : 0.55;
    sealDisc.clear();
    sealTile.visible = sealWell.visible = soft();
    if (soft()) {
      // a raised seal (violet rim) with the target glyph sitting in an inset well
      const d = Math.round(sealR * 2);
      setSoft(sealTile, { width: d, height: d, base: SB, radius: d / 2, rim: pal.accent2, rimWidth: 2, depth: 7, resolution: sres });
      const dw = d - 16;
      setSoft(sealWell, { width: dw, height: dw, base: SB, radius: dw / 2, pressed: true, depth: 5, resolution: sres });
    } else {
      sealDisc.circle(0, 0, sealR).fill({ color: hc ? 0x000000 : 0x061a2a, alpha: hc ? 1 : 0.92 });
      sealDisc.circle(0, 0, sealR).stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : ACCENT2, alpha: hc ? 1 : 0.85 });
      sealDisc.circle(0, 0, sealR - 6).stroke({ width: 1, color: hc ? 0xffffff : ACCENT, alpha: hc ? 0.8 : 0.35 });
    }
    sealTicks.clear();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = sealR + 5;
      const r1 = sealR + (i % 3 === 0 ? 12 : 8);
      sealTicks.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    sealTicks.stroke({ width: 1.5, color: hc ? 0xffffff : ACCENT2, alpha: hc ? 1 : 0.6, cap: 'round' });
    sealGlyph.scale.set((sealR * 1.25) / 30);
    sealFlash.scale.set((sealR * 3) / 128);
    sealLabel.position.set(0, -sealR - 20);
    sealLabel.visible = true;
    multText.position.set(sealR + 22, -6);
    drawPips();
  }

  // ---------------------------------------------------------------- state
  let alive = true;
  let running = false;
  let phase: 'idle' | 'intro' | 'search' | 'resolve' = 'idle';
  let trial: Trial | null = null;
  let trialId = 0;
  let t0 = 0;
  let errors = 0;
  let hinted = false;
  let score = 0;
  let finds = 0;
  let streak = 0;
  let bestStreak = 0;
  let mult = 1;
  let rts: number[] = [];
  let round = 0;
  let roundEnd = 0;
  let roundTrials = 0;
  let maxLevel = stair.level;
  let focus = -1;
  let kbActive = false;
  let absentEnabled = false;
  let stopAmbient: (() => void) | null = null;
  let btnShake = 0;

  const multFor = (s: number) => Math.min(5, 1 + Math.floor(s / 3));

  function drawPips() {
    pips.clear();
    const filled = mult >= 5 ? 3 : streak % 3;
    for (let i = 0; i < 3; i++) {
      const x = sealR + 22 + i * 13 + 5;
      const y = 14;
      // diamonds: filled vs hollow (shape-coded, not color only)
      pips.poly([x, y - 5, x + 5, y, x, y + 5, x - 5, y]);
      if (i < filled) pips.fill({ color: HI });
      else pips.stroke({ width: 1.5, color: 0xcfeff0, alpha: 0.7 });
    }
    multText.text = `×${mult}`;
  }

  function cellFor(count: number) {
    const minCell = 50 * clamp(ctx.settings.textScale, 1, 1.6);
    const area = rect.w * rect.h;
    const c = Math.sqrt((area * 0.78) / Math.max(1, count));
    return clamp(c, minCell, 104);
  }

  function capacity(count: number) {
    const c = cellFor(count);
    const cols = Math.max(1, Math.floor(rect.w / c));
    const rows = Math.max(1, Math.floor(rect.h / c));
    return Math.floor(cols * rows * 0.86);
  }

  function assignPositions() {
    cell = cellFor(used);
    const cols = Math.max(1, Math.floor(rect.w / cell));
    const rows = Math.max(1, Math.floor(rect.h / cell));
    const slots: number[] = [];
    for (let i = 0; i < cols * rows; i++) slots.push(i);
    rng.shuffle(slots);
    for (let i = 0; i < used; i++) {
      const s = slots[i % slots.length];
      const col = s % cols;
      const row = Math.floor(s / cols);
      const it = items[i];
      it.u = (col + 0.5 + (rng.next() - 0.5) * 0.36) / cols;
      it.v = (row + 0.5 + (rng.next() - 0.5) * 0.36) / rows;
    }
  }

  function placeItems() {
    if (!used) return;
    cell = cellFor(used);
    glyphScale = (cell * 0.64) / 30;
    for (let i = 0; i < used; i++) {
      const it = items[i];
      it.x = rect.x + it.u * rect.w;
      it.y = rect.y + it.v * rect.h;
      it.c.position.set(it.x, it.y);
      it.c.scale.set(glyphScale);
      it.halo.scale.set((cell * 1.15) / 96 / glyphScale);
    }
  }

  function refreshGlyphContexts() {
    if (!trial) return;
    for (let i = 0; i < used; i++) items[i].g.context = glyphContext(trial.items[i].glyph);
    sealGlyph.context = glyphContext(trial.target);
    const hc = ctx.settings.highContrast;
    for (let i = 0; i < used; i++) items[i].halo.visible = !hc;
  }

  // ---------------------------------------------------------------- trial flow
  function startTrial() {
    if (!alive || !running) return;
    const id = ++trialId;
    if (preview && stair.level > 8) stair.set(5); // ghost loops at an early-mid difficulty
    const level = stair.level;
    maxLevel = Math.max(maxLevel, level);
    const spec = levelSpec(level);
    absentEnabled = spec.absentChance > 0;
    const count = Math.min(spec.count, capacity(spec.count), MAX_ITEMS);
    const absent = rng.chance(spec.absentChance);
    trial = makeTrial(rng, level, count, absent);
    used = trial.items.length;
    errors = 0;
    hinted = false;
    focus = -1;
    assignPositions();
    placeItems();
    const hc = ctx.settings.highContrast;
    for (let i = 0; i < MAX_ITEMS; i++) {
      const it = items[i];
      if (i >= used) {
        it.c.visible = false;
        it.live = false;
        continue;
      }
      const ti = trial.items[i];
      it.g.context = glyphContext(ti.glyph);
      it.isTarget = trial.present && i === trial.targetIndex;
      it.rot = ti.rot * (Math.PI / 2) + (trial.mode === 'rotated' ? (rng.next() - 0.5) * 0.24 : 0);
      it.c.rotation = it.rot;
      it.ph = rng.next() * 100;
      it.shake = 0;
      it.pulse = 0;
      it.live = true;
      it.c.visible = true;
      it.c.alpha = 0;
      it.halo.tint = rng.chance(0.5) ? ACCENT : ACCENT2;
      it.halo.alpha = 0.16;
      it.halo.visible = !hc;
    }
    // seal
    sealGlyph.context = glyphContext(trial.target);
    const sealScale = (sealR * 1.25) / 30;
    phase = 'intro';
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 380, (t) => sealGlyph.scale.set(sealScale * (0.3 + 0.7 * t)), easeOutBack);
    sealFlash.alpha = 0.7;
    // reveal the field as a ripple from the seal outward
    const reveal = ctx.settings.reducedMotion ? 120 : 420;
    const cx = seal.x;
    const cy = seal.y;
    let maxD = 1;
    for (let i = 0; i < used; i++) maxD = Math.max(maxD, Math.hypot(items[i].x - cx, items[i].y - cy));
    void tween(
      ctx,
      reveal + 160,
      (t) => {
        const front = t * (reveal + 160);
        for (let i = 0; i < used; i++) {
          const it = items[i];
          if (!it.live) continue;
          const d = (Math.hypot(it.x - cx, it.y - cy) / maxD) * reveal;
          it.c.alpha = clamp((front - d) / 160, 0, 1);
        }
      },
      (t) => t,
    ).then(() => {
      if (id !== trialId || !running) return;
      phase = 'search';
      t0 = ctx.time();
      updateHint();
      if (preview) runGhost(id);
    });
    btn.visible = absentEnabled;
    updateHint();
    hud();
  }

  function updateHint() {
    let t = '';
    if (!absentEnabled) {
      if (preview || finds < 2) t = 'Tap the seal’s twin';
      else if (ctx.settings.showKeyHints) t = 'Arrows move · Space selects';
    }
    hintText.text = t;
    hintText.visible = !!t;
  }

  function select(i: number) {
    if (phase !== 'search' || !trial) return;
    const it = items[i];
    if (!it || !it.live) return;
    if (it.isTarget) success(it.x, it.y);
    else wrong(it);
  }

  function notHere() {
    if (phase !== 'search' || !trial || !absentEnabled) return;
    if (!trial.present) success(btn.x, btn.y);
    else wrong(null);
  }

  function success(x: number, y: number) {
    if (!trial) return;
    phase = 'resolve';
    const rt = ctx.time() - t0;
    const tm = ctx.settings.timingMultiplier;
    const clean = errors === 0;
    stair.record(clean && rt <= WINDOW_MS * tm);
    ctx.trial({ correct: clean, rtMs: rt, level: stair.level });
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    mult = multFor(streak);
    const gained = 100 * mult;
    score += gained;
    finds++;
    rts.push(rt);
    roundTrials++;
    drawPips();
    // feedback
    const hc = ctx.settings.highContrast;
    particles.burst(x, y, 26, { color: hc ? 0xffffff : ACCENT, speed: 200, life: 0.8, size: 20 });
    particles.burst(x, y, 10, { color: hc ? 0xffffff : ACCENT2, speed: 90, life: 1.1, size: 30 });
    ringAt(x, y, cell * 1.1, hc ? 0xffffff : ACCENT);
    if (!ctx.settings.reducedMotion) ringAt(x, y, cell * 1.9, hc ? 0xffffff : ACCENT2);
    sealFlash.alpha = 1;
    const deg = Math.min(streak - 1, 9);
    ctx.audio.chime(ping(deg), { gain: 0.09, dur: 1.4 });
    ctx.audio.bell(ping(deg + 2), { gain: 0.05, dur: 1.1, when: ctx.audio.now() + 0.06 });
    ctx.haptics.tick();
    ctx.caption(trial.present ? `Found it · ×${mult}` : `Right — not here · ×${mult}`);
    floatText(x, y - 26, `+${gained}`, HI);
    if (!trial.present) {
      void tween(ctx, 260, (t) => btn.scale.set(1 + Math.sin(t * Math.PI) * 0.12));
    }
    // dissolve the field
    const id = trialId;
    const targetItem = items.find((q, i) => i < used && q.isTarget);
    void tween(ctx, ctx.settings.reducedMotion ? 150 : 380, (t) => {
      for (let i = 0; i < used; i++) {
        const q = items[i];
        if (q === targetItem) {
          q.c.alpha = 1 - t;
          q.c.scale.set(glyphScale * (1 + t * 0.9));
        } else q.c.alpha = Math.min(q.c.alpha, 1 - t);
      }
    }).then(() => {
      for (let i = 0; i < used; i++) items[i].live = false;
      if (id !== trialId) return;
      afterTrial();
    });
    hud();
  }

  function afterTrial() {
    if (!running) return;
    if (untimed && roundTrials >= TRIALS_UNTIMED) {
      void endRound();
      return;
    }
    ctx.after(preview ? 380 : 180, startTrial);
  }

  function wrong(it: Item | null) {
    errors++;
    streak = 0;
    mult = 1;
    drawPips();
    if (!untimed && !preview) {
      roundEnd -= PENALTY_MS;
      floatText(it ? it.x : btn.x, (it ? it.y : btn.y) - 24, '−2 s', 0xffd9a8);
    }
    if (it) {
      it.shake = 1;
      it.halo.alpha = 0.05;
      it.c.alpha = 0.45;
    } else btnShake = 1;
    ctx.audio.pluck(ctx.audio.midi(50), { gain: 0.1, dur: 0.35 });
    ctx.audio.thunk({ gain: 0.1 });
    ctx.haptics.error();
    ctx.caption(it ? 'Not that one' : 'It is here — keep looking');
    hud();
  }

  const floatPool: Text[] = [];
  function floatText(x: number, y: number, s: string, color: number) {
    let t = floatPool.find((q) => !q.visible);
    if (!t) {
      t = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: 0xffffff } });
      t.anchor.set(0.5);
      fx.addChild(t);
      floatPool.push(t);
    }
    const txt = t;
    txt.text = s;
    txt.style.fill = color;
    txt.visible = true;
    txt.position.set(x, y);
    txt.alpha = 1;
    void tween(ctx, 800, (k) => {
      txt.y = y - k * 28;
      txt.alpha = 1 - k * k;
    }).then(() => (txt.visible = false));
  }

  // ---------------------------------------------------------------- ghost player (preview)
  function runGhost(id: number) {
    if (!trial) return;
    const hops = 2 + rng.int(0, 2);
    const visits: Array<[number, number]> = [];
    for (let i = 0; i < hops; i++) {
      const it = items[rng.int(0, used - 1)];
      visits.push([it.x, it.y]);
    }
    const mistake = rng.chance(0.12);
    let step = 0;
    ripple.visible = true;
    const next = () => {
      if (id !== trialId || phase !== 'search' || !trial) return;
      if (step < visits.length) {
        const [x, y] = visits[step++];
        moveRipple(x, y, 360).then(() => ctx.after(120, next));
        return;
      }
      const decoyIdx = items.findIndex((q, i) => i < used && !q.isTarget && q.live);
      if (mistake && decoyIdx >= 0 && step === visits.length) {
        step++;
        const d = items[decoyIdx];
        moveRipple(d.x, d.y, 360).then(() => {
          if (id !== trialId) return;
          select(decoyIdx);
          ctx.after(500, next);
        });
        return;
      }
      if (trial.present) {
        const ti = trial.targetIndex;
        const t = items[ti];
        moveRipple(t.x, t.y, 420).then(() => {
          if (id !== trialId) return;
          ripple.visible = false;
          select(ti);
        });
      } else {
        moveRipple(btn.x, btn.y, 420).then(() => {
          if (id !== trialId) return;
          ripple.visible = false;
          notHere();
        });
      }
    };
    ctx.after(250, next);
  }

  function moveRipple(x: number, y: number, ms: number) {
    const x0 = ripple.visible && ripple.x ? ripple.x : seal.x;
    const y0 = ripple.visible && ripple.y ? ripple.y : seal.y;
    return tween(ctx, ms, (t) => ripple.position.set(lerp(x0, x, t), lerp(y0, y, t)), easeInOutSine);
  }

  // ---------------------------------------------------------------- rounds
  function hud() {
    const label = `Round ${Math.max(1, Math.min(round, ROUNDS))}/${ROUNDS} · ×${mult}`;
    if (untimed) {
      ctx.hud.set({ score, level: stair.level, progress: roundTrials / TRIALS_UNTIMED, label });
    } else if (preview) {
      ctx.hud.set({ score, level: stair.level, label: `×${mult} streak` });
    } else {
      ctx.hud.set({ score, level: stair.level, timer: Math.max(0, Math.ceil((roundEnd - ctx.time()) / 1000)), label });
    }
  }

  async function showBanner(text: string, ms: number) {
    banner.text = text;
    await tween(ctx, 300, (t) => (banner.alpha = t));
    await ctx.wait(ms);
    await tween(ctx, 300, (t) => (banner.alpha = 1 - t));
  }

  async function startRound() {
    round++;
    roundTrials = 0;
    ctx.announce(`Round ${round} of ${ROUNDS}`);
    if (round > 1) await showBanner(`Round ${round}`, 700);
    if (!alive) return;
    roundEnd = ctx.time() + ROUND_MS;
    running = true;
    startTrial();
    hud();
  }

  async function endRound() {
    running = false;
    phase = 'idle';
    trialId++;
    ripple.visible = false;
    focusRing.visible = false;
    await tween(ctx, 350, (t) => {
      for (let i = 0; i < used; i++) items[i].c.alpha = Math.min(items[i].c.alpha, 1 - t);
    });
    for (let i = 0; i < used; i++) {
      items[i].live = false;
      items[i].c.visible = false;
    }
    if (round >= ROUNDS) {
      const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
      ctx.end({
        score,
        levelReached: maxLevel,
        stats: { finds, avgSearch: avg, bestStreak },
        message: bestStreak >= 9 ? 'Your eye cut through the drift like light.' : 'The runes are starting to speak to you.',
      });
      return;
    }
    await showBanner(`${finds} finds so far`, 600);
    if (alive) await startRound();
  }

  // ---------------------------------------------------------------- input
  function nearestItem(x: number, y: number, maxD: number) {
    let best = -1;
    let bestD = maxD;
    for (let i = 0; i < used; i++) {
      const it = items[i];
      if (!it.live) continue;
      const d = Math.hypot(it.c.x - x, it.c.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (preview || phase !== 'search') return;
    const { x, y } = e.global;
    kbActive = false;
    focusRing.visible = false;
    if (absentEnabled && x >= btnRect.x - 6 && x <= btnRect.x + btnRect.w + 6 && y >= btnRect.y - 6 && y <= btnRect.y + btnRect.h + 6) {
      notHere();
      return;
    }
    const i = nearestItem(x, y, Math.max(28, cell * 0.62));
    if (i >= 0) select(i);
  });

  function ensureFocus() {
    kbActive = true;
    if (focus < 0 || !items[focus]?.live) focus = nearestItem(rect.x + rect.w / 2, rect.y + rect.h / 2, 1e9);
  }
  function moveFocus(dx: number, dy: number) {
    if (phase !== 'search') return;
    const had = focus >= 0 && kbActive;
    ensureFocus();
    if (!had || focus < 0) return;
    const from = items[focus];
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < used; i++) {
      if (i === focus || !items[i].live) continue;
      const vx = items[i].c.x - from.c.x;
      const vy = items[i].c.y - from.c.y;
      const d = Math.hypot(vx, vy) || 1;
      const along = (vx * dx + vy * dy) / d;
      if (along < 0.45) continue;
      const sc = d * (2.2 - along * 1.2);
      if (sc < bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    if (best >= 0) {
      focus = best;
      ctx.audio.tick();
    }
  }
  function sector(idx: number) {
    if (phase !== 'search') return;
    kbActive = true;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = rect.x + ((col + 0.5) / 3) * rect.w;
    const y = rect.y + ((row + 0.5) / 3) * rect.h;
    focus = nearestItem(x, y, 1e9);
    ctx.audio.tick();
  }
  function choose() {
    if (phase !== 'search') return;
    if (!kbActive || focus < 0) {
      ensureFocus();
      return;
    }
    select(focus);
  }
  const keyMap: Record<string, (e: KeyboardEvent) => void> = {
    ArrowLeft: () => moveFocus(-1, 0),
    ArrowRight: () => moveFocus(1, 0),
    ArrowUp: () => moveFocus(0, -1),
    ArrowDown: () => moveFocus(0, 1),
    KeyA: () => moveFocus(-1, 0),
    KeyD: () => moveFocus(1, 0),
    KeyW: () => moveFocus(0, -1),
    KeyS: () => moveFocus(0, 1),
    Space: () => choose(),
    Enter: () => choose(),
    KeyN: () => notHere(),
  };
  const numpad = [7, 8, 9, 4, 5, 6, 1, 2, 3];
  for (let i = 0; i < 9; i++) {
    keyMap[`Digit${i + 1}`] = () => sector(i);
    keyMap[`Numpad${numpad[i]}`] = () => sector(i);
  }
  ctx.keys(keyMap);

  // ---------------------------------------------------------------- per-frame
  let clock = 0;
  function update(dt: number) {
    clock += dt;
    const now = ctx.time();
    const reduced = ctx.settings.reducedMotion;
    const s = clock / 1000;
    const hc = ctx.settings.highContrast;
    // ambient
    if (!reduced) {
      causticA.tilePosition.set(s * 9, s * 5);
      causticB.tilePosition.set(-s * 6, s * 8);
      causticLow.position.set(W / 2 + Math.sin(s * 0.05) * 40, H / 2 + Math.cos(s * 0.04) * 40);
      raySprites.forEach((r, i) => {
        r.alpha = 0.035 + 0.025 * Math.sin(s * 0.4 + i * 1.7);
        r.rotation = -0.25 + i * 0.05 + Math.sin(s * 0.15 + i) * 0.04;
      });
    }
    blobSprites.forEach((b, i) => {
      const k = reduced ? 0 : s * 0.05;
      b.x = W * (0.5 + 0.42 * Math.sin(k * (1 + i * 0.3) + i * 2.1));
      b.y = H * (0.5 + 0.42 * Math.cos(k * (0.8 + i * 0.2) + i * 1.3));
    });
    for (const b of bokehGlyphs) {
      const k = reduced ? 0 : s;
      b.g.x = W * b.bx + Math.sin(k * 0.08 * b.sp + b.ph) * 30;
      b.g.y = ((H * b.by - k * 6 * b.sp) % (H + 200) + H + 200) % (H + 200) - 100;
      b.g.rotation = Math.sin(k * 0.05 + b.ph) * 0.4;
    }
    for (const m of motes) {
      if (!reduced) {
        m.y -= m.sp * (dt / 1000);
        if (m.y < -0.02) m.y += 1.04;
      }
      m.s.x = W * m.x + (reduced ? 0 : Math.sin(s * 0.7 + m.ph) * 8);
      m.s.y = H * m.y;
    }
    plankton.visible = !hc;
    sealTicks.rotation = reduced ? 0 : s * 0.08;
    sealFlash.alpha = Math.max(0, sealFlash.alpha - dt / 500);
    sealGlow.alpha = hc ? 0 : (0.45 + Math.sin(s * 1.2) * 0.08) * (sealTile.visible ? 0.5 : 1);

    // field
    const spec = trial ? levelSpec(stair.level) : null;
    const amp = !reduced && spec ? spec.drift : 0;
    const breathe = !reduced && spec?.breathe;
    const tm = ctx.settings.timingMultiplier;
    if (phase === 'search' && !preview && !hinted && now - t0 > HINT_MS * tm) hinted = true;
    for (let i = 0; i < used; i++) {
      const it = items[i];
      if (!it.c.visible) continue;
      let x = it.x;
      let y = it.y;
      if (amp) {
        x += Math.sin(s * 0.55 + it.ph) * amp;
        y += Math.cos(s * 0.45 + it.ph * 1.3) * amp * 0.8;
      }
      if (it.shake > 0) {
        it.shake = Math.max(0, it.shake - dt / 420);
        if (!reduced) x += Math.sin(it.shake * 28) * 6 * it.shake;
        if (it.shake === 0 && it.live) {
          it.c.alpha = 1;
          it.halo.alpha = 0.16;
        }
      }
      it.c.position.set(x, y);
      if (phase !== 'resolve') {
        let sc = glyphScale;
        if (breathe) sc *= 1 + Math.sin(s * 1.6 + it.ph) * 0.05;
        if (hinted && it.isTarget && it.live) {
          const p = 0.5 + 0.5 * Math.sin(s * Math.PI * 2 * 0.8); // 0.8 Hz, well under 3 Hz
          sc *= 1 + p * 0.12;
          it.halo.alpha = 0.16 + p * 0.3;
        }
        it.c.scale.set(sc);
      }
    }
    // "Not here" hint pulse on absent trials
    if (btnShake > 0) {
      btnShake = Math.max(0, btnShake - dt / 420);
      btn.x = safe.x + safe.w / 2 + (reduced ? 0 : Math.sin(btnShake * 28) * 6 * btnShake);
    }
    if (hinted && trial && !trial.present && phase === 'search') {
      btn.scale.set(1 + (0.5 + 0.5 * Math.sin(s * Math.PI * 2 * 0.8)) * 0.06);
    } else if (phase === 'search') btn.scale.set(1);

    // rings (static geometry; animate transform + alpha only, so nothing is rebuilt per frame)
    for (const r of rings) {
      if (r.t < 0) continue;
      r.t += dt / 650;
      if (r.t >= 1) {
        r.t = -1;
        r.g.visible = false;
        continue;
      }
      const k = 1 - Math.pow(1 - r.t, 3);
      r.g.visible = true;
      r.g.position.set(r.x, r.y);
      r.g.scale.set((r.r * (0.3 + 0.7 * k)) / 50);
      r.g.tint = r.color;
      r.g.alpha = 0.9 * (1 - r.t);
    }
    // focus ring
    if (kbActive && focus >= 0 && phase === 'search' && items[focus]?.live) {
      const it = items[focus];
      if (focusCell !== cell || focusHc !== hc) {
        focusCell = cell;
        focusHc = hc;
        const r = cell * 0.5;
        focusRing.clear();
        focusRing.circle(0, 0, r).stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
        focusRing.circle(0, 0, r + 4).stroke({ width: 1.5, color: hc ? 0xffffff : ACCENT, alpha: 0.7 });
      }
      focusRing.visible = true;
      focusRing.position.set(it.c.x, it.c.y);
    } else focusRing.visible = false;
    // ghost ripple
    if (ripple.visible) {
      const p = (clock % 900) / 900;
      rippleRing.scale.set((cell * 0.36) / 50);
      ripplePulse.scale.set((cell * (0.35 + p * 0.35)) / 50);
      ripplePulse.alpha = 0.8 * (1 - p);
      rippleGlow.scale.set((cell * 1.4) / 128);
    }

    if (running && !preview && !untimed && now >= roundEnd) {
      void endRound();
      return;
    }
    if (running && (phase === 'search' || phase === 'intro')) hudTick(now);
  }

  let lastHudSec = -1;
  function hudTick(now: number) {
    const sec = Math.ceil((roundEnd - now) / 1000);
    if (sec !== lastHudSec) {
      lastHudSec = sec;
      hud();
    }
  }

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  // underwater whale-like pads
  function whale() {
    if (!alive) return;
    const base = rng.pick([38, 41, 43, 45]);
    ctx.audio.tone(ctx.audio.midi(base), { dur: 4.5, attack: 1.6, release: 2.4, type: 'sine', gain: 0.03, bus: 'music' });
    ctx.audio.tone(ctx.audio.midi(base + 7), { dur: 3.5, attack: 1.8, release: 2, type: 'triangle', gain: 0.012, bus: 'music', when: ctx.audio.now() + 0.8 });
    ctx.after(14000 + rng.next() * 9000, whale);
  }

  return {
    start() {
      stopAmbient = ctx.audio.ambient([38, 45, 50, 57, 64], { gain: 0.04, brightness: 0.2 });
      ctx.after(5000, whale);
      void startRound();
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      running = false;
      stopAmbient?.();
      ctxCache.clear(); // contexts are freed with the renderer on abort
    },
  };
}
