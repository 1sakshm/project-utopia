import { Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, hex, lerp, tween, TAU } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { PSEUDO_WORDS, REAL_WORDS, mixFor } from './content';

const ROUNDS = 3;
const ROUND_MS = 60000;
const ROUND_WORDS = 30;

interface Leaf {
  word: string;
  real: boolean;
  view: Container;
  plate: Graphics;
  glow: Sprite;
  text: Text;
  born: number;
  dur: number;
  progress: number; // 0..1 of the drift
  state: 'drift' | 'sorted';
  offsetX: number;
  phase: number;
  rx: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx, { background: '#060c1c' });
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const rng = ctx.rng;
  const S = ctx.settings;
  const dpr = ctx.quality.maxDpr;
  const stair = ctx.staircase({ min: 1, max: 12, up: 3, down: 1 });
  if (preview) stair.set(4);
  const note = ctx.audio.scale(62, 'majorPenta');
  const readingFont = () =>
    S.readingFont === 'atkinson' ? 'Atkinson Hyperlegible, Manrope, system-ui, sans-serif' : 'Manrope, system-ui, sans-serif';

  // ---------------------------------------------------------------- scene
  const water = new Sprite(gradientTexture([
    [0, '#0a1836'],
    [0.5, '#0b1d40'],
    [1, '#060f24'],
  ]));
  const ribbon = new Sprite(glowTexture(128, 0.4));
  ribbon.anchor.set(0.5);
  ribbon.blendMode = 'add';
  ribbon.tint = hex(pal.accent2);
  const reflections = new Container();
  const streaks = new Container();
  const ripples = new Graphics();
  const leaves = new Container();
  const bankL = new Graphics();
  const bankR = new Graphics();
  const lanterns = new Container();
  const fog = new Container();
  const zones = new Container();
  const fx = new Container();
  const feedback = new Container();
  app.stage.addChild(water, ribbon, reflections, streaks, ripples, leaves, bankL, bankR, lanterns, fog, zones, fx, feedback);
  const particles = createParticles(ctx, fx, 240);

  const fbText = new Text({ text: '', style: { fontFamily: readingFont() }, resolution: dpr });
  fbText.anchor.set(0.5);
  const fbBg = new Graphics();
  feedback.addChild(fbBg, fbText);
  feedback.alpha = 0;

  // Soft (dark neumorphism) look: a calm dock across the bottom that the two sorting pads are extruded from.
  const soft = () => S.soft;
  const SB = '#0d1530';
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }
  const dock = new Graphics();
  const zoneLTile = new Sprite();
  const zoneRTile = new Sprite();
  zoneLTile.anchor.set(0.5);
  zoneRTile.anchor.set(0.5);

  // zone pills
  const zoneL = new Container();
  const zoneR = new Container();
  const zoneLBg = new Graphics();
  const zoneRBg = new Graphics();
  const zoneLText = new Text({ text: 'WORD', style: {}, resolution: dpr });
  const zoneRText = new Text({ text: 'NOT A WORD', style: {}, resolution: dpr });
  const zoneLKey = new Text({ text: '←', style: {}, resolution: dpr });
  const zoneRKey = new Text({ text: '→', style: {}, resolution: dpr });
  zoneL.addChild(zoneLTile, zoneLBg, zoneLText, zoneLKey);
  zoneR.addChild(zoneRTile, zoneRBg, zoneRText, zoneRKey);
  zones.addChild(dock, zoneL, zoneR);
  let zoneFlashL = 0;
  let zoneFlashR = 0;

  // ---------------------------------------------------------------- state
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let riverL = 0;
  let riverR = 0;
  let yTop = 0;
  let yBottom = 0;
  let alive = true;
  let running = false;
  let round = 0;
  let roundEnd = 0;
  let roundWords = 0;
  let score = 0;
  let correct = 0;
  let answered = 0;
  let streak = 0;
  let bestStreak = 0;
  let activeMs = 0;
  let current: Leaf | null = null;
  let lanternBoost = 0;
  let fogBoost = 0;
  let stopAmbient: (() => void) | null = null;
  const recent: string[] = [];
  const forcedPreview = [
    ['garden', true],
    ['flonk', false],
    ['bright', true],
  ] as const;
  let forcedIdx = 0;

  interface Streak {
    g: Graphics;
    x: number;
    y: number;
    v: number;
  }
  const streakPool: Streak[] = [];
  const stars: Array<{ g: Graphics; x: number; y: number; ph: number }> = [];
  const lanternList: Array<{ glow: Sprite; body: Graphics; ph: number }> = [];
  const fogList: Array<{ s: Sprite; x: number; y: number; ph: number; base: number }> = [];

  const edgeL = (y: number) => riverL + Math.sin(y * 0.012) * 8 + Math.sin(y * 0.031 + 1) * 4;
  const edgeR = (y: number) => riverR + Math.sin(y * 0.011 + 2) * 8 + Math.sin(y * 0.027) * 4;

  // ---------------------------------------------------------------- layout
  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = S.highContrast;
    riverL = safe.x + safe.w * 0.13;
    riverR = safe.x + safe.w * 0.87;
    yTop = safe.y + safe.h * 0.15;
    yBottom = safe.y + safe.h * 0.8;

    water.width = W;
    water.height = H;
    water.tint = hc ? 0x000000 : 0xffffff;
    ribbon.position.set((riverL + riverR) / 2, H * 0.5);
    ribbon.scale.set(((riverR - riverL) * 0.9) / 128, (H * 1.1) / 128);
    ribbon.alpha = hc ? 0 : 0.1;

    // banks
    const bankColL = hc ? 0x000000 : 0x1b140f;
    const bankColR = hc ? 0x000000 : 0x121829;
    bankL.clear();
    bankL.moveTo(-10, -10);
    for (let y = -10; y <= H + 20; y += 16) bankL.lineTo(edgeL(y), y);
    bankL.lineTo(-10, H + 20).closePath().fill({ color: bankColL });
    bankL.moveTo(edgeL(-10), -10);
    for (let y = -10; y <= H + 20; y += 16) bankL.lineTo(edgeL(y), y);
    bankL.stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : hex(pal.accent), alpha: hc ? 1 : 0.35 });
    if (!hc) {
      for (let i = 0; i < 26; i++) {
        const y = (i / 26) * H;
        const x = edgeL(y) - 4 - (i % 3) * 5;
        bankL.moveTo(x, y).quadraticCurveTo(x + 4, y - 8, x + 2 + (i % 2) * 5, y - 16 - (i % 4) * 3).stroke({ width: 1.5, color: 0x3a4a2a, alpha: 0.8 });
      }
    }
    bankR.clear();
    bankR.moveTo(W + 10, -10);
    for (let y = -10; y <= H + 20; y += 16) bankR.lineTo(edgeR(y), y);
    bankR.lineTo(W + 10, H + 20).closePath().fill({ color: bankColR });
    bankR.moveTo(edgeR(-10), -10);
    for (let y = -10; y <= H + 20; y += 16) bankR.lineTo(edgeR(y), y);
    bankR.stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : hex(pal.accent2), alpha: hc ? 1 : 0.35 });

    // lanterns on the left bank
    lanterns.removeChildren().forEach((c) => c.destroy({ children: true }));
    lanternList.length = 0;
    const nL = 5;
    for (let i = 0; i < nL; i++) {
      const y = safe.y + safe.h * (0.14 + i * 0.15);
      const x = Math.max(12, edgeL(y) - Math.min(26, (riverL - 0) * 0.45));
      const c = new Container();
      c.position.set(x, y);
      const glow = new Sprite(glowTexture(128, 0.25));
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = hex(pal.accent);
      glow.scale.set(1.3);
      glow.alpha = hc ? 0 : 0.6;
      const body = new Graphics();
      body.moveTo(0, 8).lineTo(0, 40).stroke({ width: 2, color: hc ? 0xffffff : 0x5a4a3a });
      body.roundRect(-7, -9, 14, 17, 4).fill({ color: hc ? 0xffffff : 0xffd79a });
      body.roundRect(-7, -9, 14, 17, 4).stroke({ width: 1.5, color: hc ? 0xffffff : 0x8a5a2a });
      body.rect(-5, -12, 10, 3).fill({ color: hc ? 0xffffff : 0x8a5a2a });
      c.addChild(glow, body);
      lanterns.addChild(c);
      lanternList.push({ glow, body, ph: i * 1.7 });
    }

    // fog on the right bank
    fog.removeChildren().forEach((c) => c.destroy());
    fogList.length = 0;
    if (!hc) {
      for (let i = 0; i < 14; i++) {
        const s = new Sprite(glowTexture(128, 0.5));
        s.anchor.set(0.5);
        s.tint = i % 2 ? 0xc9b8ff : hex(pal.accent2);
        const base = 0.16 + (i % 3) * 0.05;
        s.alpha = base;
        s.scale.set(1.2 + (i % 3) * 0.4, 0.7 + (i % 2) * 0.35);
        const x = riverR + (W - riverR) * 0.4 + ((i % 3) - 1) * 22;
        const y = safe.y + safe.h * (0.04 + i * 0.068);
        s.position.set(x, y);
        fog.addChild(s);
        fogList.push({ s, x, y, ph: i * 0.9, base });
      }
    }

    // flow streaks & star reflections
    streaks.removeChildren().forEach((c) => c.destroy());
    streakPool.length = 0;
    const nS = Math.round(34 * Math.max(0.5, ctx.quality.particleScale));
    for (let i = 0; i < nS; i++) {
      const g = new Graphics();
      const len = 14 + rng.next() * 40;
      g.roundRect(-0.75, -len / 2, 1.5, len, 0.75).fill({ color: hc ? 0x777777 : 0x9fc4ff, alpha: 0.06 + rng.next() * 0.12 });
      const st = { g, x: lerp(riverL + 12, riverR - 12, rng.next()), y: rng.next() * H, v: 0.6 + rng.next() * 0.8 };
      g.position.set(st.x, st.y);
      streaks.addChild(g);
      streakPool.push(st);
    }
    reflections.removeChildren().forEach((c) => c.destroy());
    stars.length = 0;
    if (!hc) {
      for (let i = 0; i < 40; i++) {
        const g = new Graphics().circle(0, 0, 0.8 + (i % 3) * 0.5).fill({ color: 0xffffff });
        const st = { g, x: lerp(riverL + 8, riverR - 8, rng.next()), y: rng.next() * H, ph: rng.next() * TAU };
        g.position.set(st.x, st.y);
        reflections.addChild(g);
        stars.push(st);
      }
    }

    drawZones();
    if (current) styleLeaf(current);
  }

  function drawZones() {
    const hc = S.highContrast;
    const zh = Math.round(54 * clamp(S.textScale, 1, 1.3));
    const zw = safe.w / 2 - 18;
    const y = safe.y + safe.h - zh - 14;
    zoneL.position.set(safe.x + 12, y);
    zoneR.position.set(safe.x + safe.w / 2 + 6, y);
    const sf = soft();
    dock.clear();
    zoneLTile.visible = zoneRTile.visible = sf;
    if (sf) {
      // the dock: a flat band over the river mouth, with a faint lit lip, so the pads have a uniform surface
      const dy = y - 16;
      dock.rect(0, dy, W, H - dy).fill({ color: hex(SB) });
      dock.moveTo(0, dy).lineTo(W, dy).stroke({ width: 1.5, color: 0xffffff, alpha: 0.07 });
      dock.rect(0, dy - 10, W, 10).fill({ color: hex(SB), alpha: 0.5 });
    }
    const drawPill = (g: Graphics, color: number, flash: number, icon: 'check' | 'x') => {
      g.clear();
      if (sf) {
        // pad sinks in and lights its side's color for a moment after a sort
        const tile = g === zoneLBg ? zoneLTile : zoneRTile;
        const lit = flash > 0.25;
        setSoft(tile, { width: Math.round(zw), height: zh, base: SB, radius: zh / 2, pressed: lit, rim: lit ? '#' + color.toString(16).padStart(6, '0') : undefined, rimWidth: 3, depth: 7, resolution: dpr });
        tile.position.set(zw / 2, zh / 2);
      } else {
        g.roundRect(0, 0, zw, zh, zh / 2).fill({ color: hc ? 0x000000 : 0x0a0f20, alpha: hc ? 1 : 0.72 + flash * 0.2 });
        g.roundRect(0, 0, zw, zh, zh / 2).stroke({ width: hc ? 3 : 2 + flash * 2, color: hc ? 0xffffff : color, alpha: hc ? 1 : 0.7 + flash * 0.3 });
      }
      const cx = zh / 2 + 4;
      const cy = zh / 2;
      g.circle(cx, cy, zh * 0.3).fill({ color: hc ? 0xffffff : color, alpha: 1 });
      const ic = hc ? 0x000000 : 0x0a0f20;
      const k = zh * 0.13;
      if (icon === 'check') g.moveTo(cx - k, cy).lineTo(cx - k * 0.2, cy + k * 0.8).lineTo(cx + k * 1.1, cy - k * 0.8).stroke({ width: 3, color: ic, cap: 'round', join: 'round' });
      else g.moveTo(cx - k, cy - k).lineTo(cx + k, cy + k).moveTo(cx + k, cy - k).lineTo(cx - k, cy + k).stroke({ width: 3, color: ic, cap: 'round' });
    };
    drawPill(zoneLBg, hex(pal.accent), zoneFlashL, 'check');
    drawPill(zoneRBg, hex(pal.accent2), zoneFlashR, 'x');
    const ts = S.textScale;
    const style = { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: Math.round(14 * ts), fontWeight: '800' as const, letterSpacing: 1.2, fill: 0xffffff };
    for (const [t, k] of [
      [zoneLText, zoneLKey],
      [zoneRText, zoneRKey],
    ] as const) {
      t.style = style;
      t.anchor.set(0, 0.5);
      t.position.set(zh + 8, zh / 2);
      t.scale.set(1);
      const maxW = zw - zh - 14 - (S.showKeyHints ? 16 : 0);
      if (t.width > maxW) t.scale.set(maxW / t.width);
      k.style = { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffffff };
      k.alpha = 0.55;
      k.anchor.set(1, 0.5);
      k.position.set(zw - 12, zh / 2);
      k.visible = S.showKeyHints && !preview;
    }
  }

  // ---------------------------------------------------------------- leaves
  function styleLeaf(leaf: Leaf) {
    const hc = S.highContrast;
    const t = leaf.text;
    t.style = {
      fontFamily: readingFont(),
      fontSize: Math.round(32 * S.textScale),
      fontWeight: '700',
      letterSpacing: 1,
      fill: 0xffffff,
    };
    t.scale.set(1);
    const maxRx = (riverR - riverL) / 2 - 6;
    const rx = Math.min(maxRx, Math.max(84, t.width / 2 + 34));
    const textMax = rx * 2 - 44;
    if (t.width > textMax) t.scale.set(textMax / t.width);
    leaf.rx = rx;
    const ry = Math.max(44, 30 + t.height * t.scale.y * 0.55);
    const g = leaf.plate;
    g.clear();
    // lily pad with a notch
    const pts: number[] = [];
    const notchA = -0.55;
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const a = notchA + 0.24 + (i / N) * (TAU - 0.48);
      pts.push(Math.cos(a) * rx, Math.sin(a) * ry);
    }
    pts.push(0, 0);
    g.ellipse(4, 7, rx, ry).fill({ color: 0x000000, alpha: hc ? 0 : 0.35 });
    g.poly(pts).fill({ color: hc ? 0x000000 : 0x1c4a3c });
    if (!hc) {
      for (let i = 0; i < 9; i++) {
        const a = notchA + 0.5 + (i / 8) * (TAU - 1);
        g.moveTo(0, 0).lineTo(Math.cos(a) * rx * 0.92, Math.sin(a) * ry * 0.92);
      }
      g.stroke({ width: 1.2, color: 0x2f6a55, alpha: 0.8 });
    }
    g.poly(pts).stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : 0x6fd3a8, alpha: hc ? 1 : 0.75, join: 'round' });
    // dark text plate for contrast
    const pw = t.width + 26;
    const ph = t.height * t.scale.y + 12;
    g.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2).fill({ color: 0x04100c, alpha: hc ? 1 : 0.62 });
    leaf.glow.scale.set((rx * 3) / 128, (ry * 3.2) / 128);
    leaf.glow.alpha = hc ? 0 : 0.35;
  }

  function nextWord(): { word: string; real: boolean } {
    if (preview && forcedIdx < forcedPreview.length) {
      const [w, r] = forcedPreview[forcedIdx++];
      return { word: w, real: r };
    }
    const mix = mixFor(stair.level);
    const real = rng.chance(0.5);
    const tiers = real ? mix.real : mix.pseudo;
    const total = tiers.reduce((a, [, w]) => a + w, 0);
    let x = rng.next() * total;
    let tier = tiers[0][0];
    for (const [t, w] of tiers) {
      x -= w;
      if (x <= 0) {
        tier = t;
        break;
      }
    }
    const pool = (real ? REAL_WORDS : PSEUDO_WORDS)[tier];
    let word = rng.pick(pool);
    for (let i = 0; i < 8 && recent.includes(word); i++) word = rng.pick(pool);
    recent.push(word);
    if (recent.length > 60) recent.shift();
    return { word, real };
  }

  function driftDuration() {
    const L = stair.level;
    const base = 6500 - (L - 1) * 330;
    const streakF = 1 - Math.min(streak, 20) * 0.012;
    return base * streakF * S.timingMultiplier;
  }

  function spawnLeaf() {
    const { word, real } = nextWord();
    const view = new Container();
    const glow = new Sprite(glowTexture(128, 0.3));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = 0x8fffd0;
    const plate = new Graphics();
    const text = new Text({ text: word, style: {}, resolution: dpr });
    text.anchor.set(0.5);
    view.addChild(glow, plate, text);
    const leaf: Leaf = { word, real, view, plate, glow, text, born: ctx.time(), dur: driftDuration(), progress: 0, state: 'drift', offsetX: 0, phase: rng.next() * TAU, rx: 90 };
    styleLeaf(leaf);
    view.position.set((riverL + riverR) / 2, yTop - 40);
    view.alpha = 0;
    leaves.addChild(view);
    current = leaf;
    ctx.audio.noise({ dur: 0.5, filter: 1400, gain: 0.02, sweepTo: 700 });
    if (preview) void ghost(leaf);
  }

  // ---------------------------------------------------------------- sorting
  function sort(side: 'left' | 'right') {
    const leaf = current;
    if (!leaf || leaf.state !== 'drift' || !running) return;
    leaf.state = 'sorted';
    current = null;
    const rt = ctx.time() - leaf.born;
    activeMs += rt;
    const saidReal = side === 'left';
    const ok = saidReal === leaf.real;
    answered++;
    roundWords++;
    ctx.trial({ correct: ok, rtMs: rt, level: stair.level });
    stair.record(ok);
    if (ok) {
      correct++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      const tier = 1 + Math.min(3, Math.floor(streak / 5));
      score += 10 * tier;
      glideToBank(leaf, side, true);
      if (leaf.real) {
        lanternBoost = 1;
        ctx.audio.noise({ dur: 0.35, filter: 380, gain: 0.07, sweepTo: 900 });
        ctx.audio.bell(note(Math.min(12, 3 + Math.floor(streak / 2))), { gain: 0.1, dur: 1.1, pan: -0.5 });
        zoneFlashL = 1;
      } else {
        fogBoost = 1;
        ctx.audio.noise({ dur: 0.6, filter: 2200, gain: 0.05, sweepTo: 600, q: 0.4 });
        ctx.audio.chime(note(Math.min(12, 4 + Math.floor(streak / 2))), { gain: 0.08, dur: 1.2, pan: 0.5 });
        zoneFlashR = 1;
      }
      if (streak >= 5) ctx.audio.pluck(note(Math.min(14, 7 + (streak % 5))), { gain: 0.06, when: ctx.audio.now() + 0.09 });
      ctx.haptics.tick();
      if (streak > 0 && streak % 10 === 0) {
        ctx.caption(`Streak ${streak}!`);
        ctx.announce(`Streak ${streak}`);
      }
    } else {
      streak = 0;
      sinkLeaf(leaf, side);
      ctx.audio.thunk({ gain: 0.18 });
      ctx.audio.noise({ dur: 0.3, filter: 300, gain: 0.06 });
      ctx.haptics.error();
      showFeedback(leaf.real ? `“${leaf.word}” is a real word ✓` : `“${leaf.word}” is not a word ✕`, leaf.real);
      ctx.caption('Plop — leaf sank');
    }
    hud();
    const gap = ok ? 260 : 1150;
    ctx.after(gap * (ok ? 1 : S.timingMultiplier), () => {
      if (alive && running) maybeNext();
    });
  }

  function floatedPast(leaf: Leaf) {
    leaf.state = 'sorted';
    current = null;
    activeMs += ctx.time() - leaf.born;
    answered++;
    roundWords++;
    streak = 0;
    ctx.trial({ correct: false, level: stair.level });
    stair.record(false);
    ctx.audio.thunk({ gain: 0.12 });
    showFeedback(leaf.real ? `“${leaf.word}” is a real word ✓` : `“${leaf.word}” is not a word ✕`, leaf.real);
    ctx.caption('The leaf floated past');
    void tween(ctx, 500, (t) => {
      leaf.view.alpha = 1 - t;
      leaf.view.y += 1.5;
    }).then(() => leaf.view.destroy({ children: true }));
    hud();
    ctx.after(1200 * S.timingMultiplier, () => {
      if (alive && running) maybeNext();
    });
  }

  function glideToBank(leaf: Leaf, side: 'left' | 'right', _ok: boolean) {
    const v = leaf.view;
    const sx = v.x;
    const sy = v.y;
    const tx = side === 'left' ? riverL - 20 : riverR + 20;
    const ty = sy + 30;
    const color = side === 'left' ? hex(pal.accent) : hex(pal.accent2);
    const reduced = S.reducedMotion;
    void tween(ctx, reduced ? 120 : 380, (t) => {
      v.x = lerp(sx, tx, t);
      v.y = lerp(sy, ty, t);
      v.scale.set(1 - t * 0.45);
      v.rotation = (side === 'left' ? -1 : 1) * t * (reduced ? 0 : 0.35);
      v.alpha = 1 - t * t;
    }, easeInOutSine).then(() => {
      particles.burst(tx, ty, 22, { color, speed: 170, life: 0.7 });
      v.destroy({ children: true });
    });
    // floating score
    const tier = 1 + Math.min(3, Math.floor(streak / 5));
    const pop = new Text({
      text: `+${10 * tier}`,
      style: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 20, fontWeight: '800', fill: color },
      resolution: dpr,
    });
    pop.anchor.set(0.5);
    pop.position.set(sx, sy - 50);
    fx.addChild(pop);
    void tween(ctx, 700, (t) => {
      pop.y = sy - 50 - t * 30;
      pop.alpha = 1 - t;
    }).then(() => pop.destroy());
  }

  const rippleList: Array<{ x: number; y: number; t: number }> = [];
  function sinkLeaf(leaf: Leaf, side: 'left' | 'right') {
    const v = leaf.view;
    const sx = v.x;
    const sy = v.y;
    const reduced = S.reducedMotion;
    rippleList.push({ x: sx, y: sy, t: 0 });
    void tween(ctx, reduced ? 200 : 650, (t) => {
      if (!reduced) v.x = sx + (side === 'left' ? -1 : 1) * Math.sin(t * Math.PI) * 30;
      v.scale.set(1 - t * 0.35);
      v.alpha = 1 - t;
      v.y = sy + t * 14;
    }).then(() => v.destroy({ children: true }));
  }

  function showFeedback(msg: string, real: boolean) {
    const hc = S.highContrast;
    fbText.text = msg;
    fbText.style = { fontFamily: readingFont(), fontSize: Math.round(19 * S.textScale), fontWeight: '700', fill: 0xffffff };
    fbText.scale.set(1);
    const maxW = safe.w - 60;
    if (fbText.width > maxW) fbText.scale.set(maxW / fbText.width);
    const w = fbText.width + 34;
    const h = fbText.height * fbText.scale.y + 18;
    fbBg.clear();
    fbBg.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: hc ? 0x000000 : 0x0a0f20, alpha: 0.9 });
    fbBg.roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ width: 2, color: hc ? 0xffffff : real ? hex(pal.accent) : hex(pal.accent2) });
    feedback.position.set(safe.x + safe.w / 2, safe.y + safe.h * 0.55);
    feedback.alpha = 1;
    void tween(ctx, 1100 * S.timingMultiplier, (t) => (feedback.alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25), (t) => t);
  }

  // ---------------------------------------------------------------- ghost player
  const finger = new Sprite(glowTexture(64, 0.3));
  finger.anchor.set(0.5);
  finger.blendMode = 'add';
  finger.tint = 0xffffff;
  finger.alpha = 0;
  finger.scale.set(0.6);
  fx.addChild(finger);

  async function ghost(leaf: Leaf) {
    const readMs = 520 + leaf.word.length * 45 + rng.next() * 300;
    await ctx.wait(readMs);
    if (!alive || leaf.state !== 'drift') return;
    const right = rng.chance(0.9) ? leaf.real : !leaf.real;
    const side = right ? 'left' : 'right';
    const sx = leaf.view.x;
    const sy = leaf.view.y;
    finger.position.set(sx, sy);
    finger.alpha = 0.9;
    await tween(ctx, 200, (t) => {
      finger.x = sx + (side === 'left' ? -1 : 1) * t * 90;
      leaf.offsetX = (side === 'left' ? -1 : 1) * t * 40;
    });
    sort(side);
    void tween(ctx, 250, (t) => (finger.alpha = 0.9 * (1 - t)));
  }

  // ---------------------------------------------------------------- input: swipe or tap halves
  let down: { x: number; y: number } | null = null;
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (preview) return;
    down = { x: e.global.x, y: e.global.y };
  });
  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    if (!down || !current || current.state !== 'drift') return;
    current.offsetX = clamp(e.global.x - down.x, -90, 90) * 0.7;
  });
  const release = (e: FederatedPointerEvent) => {
    if (!down) return;
    const dx = e.global.x - down.x;
    const dy = e.global.y - down.y;
    down = null;
    if (!current) return;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 0.8) sort(dx < 0 ? 'left' : 'right');
    else if (Math.abs(dx) < 16 && Math.abs(dy) < 16) sort(e.global.x < safe.x + safe.w / 2 ? 'left' : 'right');
    else current.offsetX = 0;
  };
  app.stage.on('pointerup', release);
  app.stage.on('pointerupoutside', release);

  const left = () => sort('left');
  const right = () => sort('right');
  ctx.keys({ ArrowLeft: left, KeyA: left, KeyF: left, ArrowRight: right, KeyD: right, KeyJ: right });

  // ---------------------------------------------------------------- flow
  function maybeNext() {
    if (!running || current) return;
    const timeUp = !S.noTimePressure && ctx.time() >= roundEnd;
    if (!preview && (roundWords >= ROUND_WORDS || timeUp)) {
      void endRound();
      return;
    }
    spawnLeaf();
  }

  function startRound() {
    round++;
    roundWords = 0;
    roundEnd = ctx.time() + ROUND_MS;
    running = true;
    hud();
    if (!preview) {
      ctx.announce(`Round ${round}`);
      showBanner(`Round ${round} of ${ROUNDS}`);
    }
    ctx.after(preview ? 300 : 900, () => maybeNext());
  }

  function showBanner(msg: string) {
    const t = new Text({
      text: msg,
      style: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: Math.round(26 * S.textScale), fontWeight: '800', fill: 0xfff3d6, letterSpacing: 1 },
      resolution: dpr,
    });
    t.anchor.set(0.5);
    t.position.set(safe.x + safe.w / 2, safe.y + safe.h * 0.42);
    fx.addChild(t);
    void tween(ctx, 1300, (k) => (t.alpha = k < 0.2 ? k / 0.2 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1), (k) => k).then(() => t.destroy());
  }

  async function endRound() {
    running = false;
    hud();
    if (round >= ROUNDS) {
      await ctx.wait(700);
      const minutes = Math.max(activeMs, 1000) / 60000;
      ctx.end({
        score,
        levelReached: stair.level,
        stats: {
          wpm: Math.round(correct / minutes),
          accuracy: answered ? Math.round((correct / answered) * 100) : 0,
          bestStreak,
        },
        message: bestStreak >= 20 ? 'The river sang with you.' : 'The lanterns glow a little brighter.',
      });
      return;
    }
    await ctx.wait(1200);
    if (alive) startRound();
  }

  function hud() {
    const tier = 1 + Math.min(3, Math.floor(streak / 5));
    const timed = !S.noTimePressure;
    ctx.hud.set({
      score,
      level: stair.level,
      timer: timed && !preview ? Math.max(0, Math.ceil((roundEnd - ctx.time()) / 1000)) : undefined,
      progress: Math.min(1, roundWords / ROUND_WORDS),
      label: `Round ${Math.max(1, round)}/${ROUNDS} · Streak ${streak}${tier > 1 ? ` ×${tier}` : ''}`,
    });
  }

  // ---------------------------------------------------------------- per-frame
  let hudAcc = 0;
  function update(dt: number, now: number) {
    const s = now / 1000;
    const k = dt / 1000;
    const reduced = S.reducedMotion;
    const flow = (40 + Math.min(streak, 20) * 3) * (reduced ? 0.5 : 1);
    for (const st of streakPool) {
      st.y += flow * st.v * k;
      if (st.y > H + 40) {
        st.y = -40;
        st.x = lerp(riverL + 12, riverR - 12, rng.next());
      }
      st.g.position.set(st.x + (reduced ? 0 : Math.sin(st.y * 0.02) * 3), st.y);
    }
    for (const st of stars) {
      st.y += flow * 0.25 * k;
      if (st.y > H + 10) st.y = -10;
      st.g.y = st.y;
      st.g.alpha = 0.25 + Math.sin(s * 1.3 + st.ph) * 0.2;
    }
    ribbon.alpha = S.highContrast ? 0 : 0.08 + Math.min(streak, 20) * 0.006;

    lanternBoost = Math.max(0, lanternBoost - k * 1.2);
    fogBoost = Math.max(0, fogBoost - k * 1.0);
    const streakGlow = Math.min(streak, 15) / 15;
    for (const l of lanternList) {
      l.glow.alpha = S.highContrast ? 0 : 0.35 + streakGlow * 0.2 + lanternBoost * 0.5 + (reduced ? 0 : Math.sin(s * 1.7 + l.ph) * 0.05);
      l.glow.scale.set(1.2 + lanternBoost * 0.7 + streakGlow * 0.3);
    }
    for (const f of fogList) {
      const sw = reduced ? 0 : Math.sin(s * 0.4 + f.ph);
      f.s.x = f.x + sw * 10 + fogBoost * Math.sin(f.ph + s * 6) * 12;
      f.s.alpha = f.base + fogBoost * 0.3 + (reduced ? 0 : Math.sin(s * 0.7 + f.ph) * 0.04);
    }
    if (zoneFlashL > 0 || zoneFlashR > 0) {
      zoneFlashL = Math.max(0, zoneFlashL - k * 2.5);
      zoneFlashR = Math.max(0, zoneFlashR - k * 2.5);
      drawZones();
    }

    // ripples
    ripples.clear();
    for (let i = rippleList.length - 1; i >= 0; i--) {
      const r = rippleList[i];
      r.t += k / 0.9;
      if (r.t >= 1) {
        rippleList.splice(i, 1);
        continue;
      }
      ripples.ellipse(r.x, r.y, 20 + r.t * 70, 8 + r.t * 26).stroke({ width: 2, color: 0xbcd4ff, alpha: 0.6 * (1 - r.t) });
      ripples.ellipse(r.x, r.y, 10 + r.t * 40, 4 + r.t * 14).stroke({ width: 1.5, color: 0xbcd4ff, alpha: 0.4 * (1 - r.t) });
    }

    // current leaf drift
    const leaf = current;
    if (leaf && leaf.state === 'drift') {
      const untimed = S.noTimePressure;
      const age = now - leaf.born;
      leaf.view.alpha = Math.min(1, age / 220);
      leaf.phase += k;
      let y: number;
      if (untimed) {
        const mid = safe.y + safe.h * 0.42;
        const t = Math.min(1, age / 1400);
        y = lerp(yTop, mid, easeInOutSine(t)) + (reduced ? 0 : Math.sin(leaf.phase * 1.3) * 4);
      } else {
        leaf.progress = age / leaf.dur;
        y = lerp(yTop, yBottom, leaf.progress);
      }
      if (!down && !preview) leaf.offsetX *= 1 - Math.min(1, k * 8);
      const meander = reduced ? 0 : Math.sin(leaf.phase * 0.9) * 10;
      leaf.view.position.set((riverL + riverR) / 2 + meander + leaf.offsetX, y);
      leaf.view.rotation = reduced ? 0 : Math.sin(leaf.phase * 0.7) * 0.04 + leaf.offsetX * 0.002;
      leaf.glow.alpha = S.highContrast ? 0 : 0.3 + Math.sin(leaf.phase * 2) * 0.06;
      if (!untimed && leaf.progress >= 1) floatedPast(leaf);
    }

    if (running) {
      hudAcc += dt;
      if (hudAcc > 250) {
        hudAcc = 0;
        hud();
      }
    }
  }

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  return {
    start() {
      if (!preview) stopAmbient = ctx.audio.ambient([50, 57, 62, 66], { gain: 0.035, brightness: 0.25 });
      startRound();
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      running = false;
      stopAmbient?.();
    },
  };
}
