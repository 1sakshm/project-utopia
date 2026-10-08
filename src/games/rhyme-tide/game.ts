import { Container, Graphics, Rectangle, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, easeOutBack, easeOutCubic, hex, lerp, tween, TAU } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { makePrompt, type Prompt, type Task } from './logic';

const PROMPTS_PER_ROUND = 10;
const ROUNDS = 2;

const SHELL_COLORS = [0xffd9cf, 0xd9f2ee, 0xffe8b8, 0xe6dcff, 0xffd6e6];
const SHELL_RIBS = [0xe9a597, 0x8fcfc4, 0xe0b765, 0xab9ae0, 0xe79ab7];

interface Shell {
  label: string;
  view: Container;
  body: Graphics;
  glow: Sprite;
  sheen: Sprite;
  text: Text;
  badge: Container;
  badgeText: Text;
  color: number;
  rib: number;
  r: number;
  hx: number; // home position
  hy: number;
  phase: number;
  state: 'arriving' | 'idle' | 'used' | 'dim';
  hint: number; // 0..1 glow pulse amount
  shake: number;
  lift: number;
}

function pearlTexture(size = 64): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grd = g.createRadialGradient(r * 0.7, r * 0.62, r * 0.05, r, r, r);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.35, '#fbf3ff');
  grd.addColorStop(0.75, '#e6d6f0');
  grd.addColorStop(0.95, '#b9a6cc');
  grd.addColorStop(1, 'rgba(185,166,204,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(r, r, r - 1, 0, TAU);
  g.fill();
  // iridescent rim
  const rim = g.createLinearGradient(0, size, size, 0);
  rim.addColorStop(0, 'rgba(255,190,220,0.35)');
  rim.addColorStop(0.5, 'rgba(170,240,230,0.25)');
  rim.addColorStop(1, 'rgba(255,240,200,0.3)');
  g.strokeStyle = rim;
  g.lineWidth = size * 0.06;
  g.beginPath();
  g.arc(r, r, r * 0.84, 0, TAU);
  g.stroke();
  return Texture.from(c);
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx, { background: '#1a1530' });
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const rng = ctx.rng;
  const S = ctx.settings;
  const stair = ctx.staircase({ min: 1, max: 10, up: 2, down: 1 });
  if (preview) stair.set(3);
  const note = ctx.audio.scale(64, 'majorPenta');
  const dpr = ctx.quality.maxDpr;

  const readingFont = () =>
    S.readingFont === 'atkinson' ? 'Atkinson Hyperlegible, "Geist Variable", system-ui, sans-serif' : 'Geist Variable, system-ui, sans-serif';

  // Soft (dark neumorphism) look: the dusk sky holds one calm violet behind the prompt card and slots (which are
  // extruded from it), and the sunset glow is gathered into a band just above the horizon.
  const soft = () => S.soft;
  const SB = '#2a1f46';
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }
  const auroraSky = gradientTexture([
    [0, '#1d1638'],
    [0.35, '#4a2f63'],
    [0.7, '#b8607a'],
    [0.92, '#f3a37f'],
    [1, '#ffd2a1'],
  ]);
  const softSky = gradientTexture([
    [0, '#1b1435'],
    [0.32, SB],
    [0.84, SB],
    [0.93, '#a8587a'],
    [0.98, '#f3a37f'],
    [1, '#ffd2a1'],
  ]);

  // ---------------------------------------------------------------- scene graph
  const sky = new Sprite(auroraSky);
  const stars = new Graphics();
  const sunGlow = new Sprite(glowTexture(256, 0.18));
  sunGlow.anchor.set(0.5);
  sunGlow.blendMode = 'add';
  sunGlow.tint = 0xffb07a;
  const sunDisc = new Graphics();
  const clouds = new Container();
  const sea = new Sprite(gradientTexture([
    [0, '#5cc9c0'],
    [0.25, '#2d93a0'],
    [0.7, '#185a78'],
    [1, '#123f5c'],
  ]));
  const reflect = new Container();
  const waveBack = new Graphics();
  const waveMid = new Graphics();
  const shellsLayer = new Container();
  const waveFront = new Graphics();
  const sand = new Graphics();
  const ui = new Container();
  const fx = new Container();
  app.stage.addChild(sky, stars, sunGlow, sunDisc, clouds, sea, reflect, waveBack, waveMid, shellsLayer, waveFront, sand, ui, fx);
  const particles = createParticles(ctx, fx, 220);

  // necklace
  const necklace = new Container();
  const neckString = new Graphics();
  const pearlsLayer = new Container();
  necklace.addChild(neckString, pearlsLayer);
  const pearlTex = pearlTexture(64);

  // prompt card
  const card = new Container();
  const cardBg = new Graphics();
  const cardTile = new Sprite();
  cardTile.anchor.set(0.5);
  const taskIcon = new Graphics();
  const taskLabel = new Text({ text: '', style: { fontFamily: 'Geist Variable, system-ui, sans-serif' }, resolution: dpr });
  const promptText = new Text({ text: '', style: { fontFamily: readingFont() }, resolution: dpr });
  const speaker = new Container();
  const speakerBg = new Graphics();
  const speakerIcon = new Graphics();
  const speakerGlow = new Sprite(glowTexture(128, 0.3));
  speakerGlow.anchor.set(0.5);
  speakerGlow.blendMode = 'add';
  speakerGlow.alpha = 0;
  const speakerKey = new Text({ text: 'R', style: { fontFamily: 'Geist Variable, system-ui, sans-serif', fontSize: 11, fontWeight: '800', fill: 0xfff1e0 }, resolution: dpr });
  speakerKey.anchor.set(0.5);
  speaker.addChild(speakerGlow, speakerBg, speakerIcon, speakerKey);
  card.addChild(cardTile, cardBg, taskIcon, taskLabel, promptText, speaker);

  // build slots
  const slots = new Container();
  ui.addChild(necklace, card, slots);

  // ---------------------------------------------------------------- state
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let horizonY = 0;
  let shellY = 0;
  let alive = true;
  let running = false;
  let score = 0;
  let pearls = 0;
  let firstTry = 0;
  let prompts = 0;
  let longest = 0;
  let round = 0;
  let inRound = 0;
  let roundMisses = 0;
  const necklaceState: Array<'pearl' | 'miss' | null> = [];
  const perTask: Record<Task, { ok: number; n: number }> = { build: { ok: 0, n: 0 }, rhyme: { ok: 0, n: 0 }, onset: { ok: 0, n: 0 } };
  const used = new Set<string>();

  let prompt: Prompt | null = null;
  let shells: Shell[] = [];
  let step = 0; // build progress
  let mistakes = 0;
  let accepting = false;
  let promptStart = 0;
  let resolvePrompt: (() => void) | null = null;
  let slotViews: Array<{ box: Container; text: Text; filled: boolean }> = [];
  let stopAmbient: (() => void) | null = null;
  let nextSwash = 0;
  let speakingPulse = 0;

  // ---------------------------------------------------------------- layout & static drawing
  function wavePath(g: Graphics, width: number, period: number, amp: number, depth: number, color: number, alpha: number, foam: number) {
    g.clear();
    const pts: number[] = [];
    const x0 = -period;
    const x1 = width + period;
    for (let x = x0; x <= x1; x += period / 16) pts.push(x, Math.sin((x / period) * TAU) * amp);
    const fillPts = [...pts, x1, depth, x0, depth];
    g.poly(fillPts).fill({ color, alpha });
    if (foam > 0) {
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ width: 2.5, color: 0xffffff, alpha: foam, cap: 'round', join: 'round' });
    }
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = S.highContrast;
    horizonY = safe.y + safe.h * 0.47;
    shellY = safe.y + safe.h * 0.685;

    sky.texture = soft() ? softSky : auroraSky;
    sky.width = W;
    sky.height = horizonY + 2;
    sky.visible = true;
    sky.tint = hc ? 0x555555 : 0xffffff;
    stars.clear();
    if (!hc) {
      for (let i = 0; i < 60; i++) {
        const x = (((i * 7919) % 1000) / 1000) * W;
        const y = (((i * 104729) % 1000) / 1000) * horizonY * 0.45;
        stars.circle(x, y, (i % 3) * 0.4 + 0.5).fill({ color: 0xffffff, alpha: 0.2 + (i % 4) * 0.1 });
      }
    }
    const sunX = safe.x + safe.w * 0.72;
    sunGlow.position.set(sunX, horizonY);
    sunGlow.scale.set((safe.w * 1.3) / 256);
    sunGlow.alpha = hc ? 0 : 0.55;
    sunDisc.clear();
    sunDisc.circle(sunX, horizonY, safe.w * 0.09).fill({ color: 0xffe3b0, alpha: hc ? 0.3 : 0.95 });

    clouds.removeChildren().forEach((c) => c.destroy());
    if (!hc) {
      for (let i = 0; i < 5; i++) {
        const c = new Graphics();
        const cw = safe.w * (0.25 + (i % 3) * 0.1);
        const cy = horizonY * (0.35 + (i % 4) * 0.13);
        c.ellipse(0, 0, cw, 7 + (i % 2) * 4).fill({ color: 0xffc2b0, alpha: 0.18 });
        c.ellipse(cw * 0.3, -5, cw * 0.55, 6).fill({ color: 0xffe0cf, alpha: 0.12 });
        c.position.set((((i * 3571) % 1000) / 1000) * W, cy);
        clouds.addChild(c);
      }
    }

    sea.position.set(0, horizonY);
    sea.width = W;
    sea.height = H - horizonY;
    sea.tint = hc ? 0x333333 : 0xffffff;

    reflect.removeChildren().forEach((c) => c.destroy());
    if (!hc) {
      for (let i = 0; i < 9; i++) {
        const s = new Graphics();
        const w = safe.w * (0.16 - i * 0.012);
        s.roundRect(-w / 2, -1.5, w, 3, 1.5).fill({ color: 0xffe0b5, alpha: 0.55 - i * 0.05 });
        s.position.set(sunX, horizonY + 6 + i * i * 2.2);
        reflect.addChild(s);
      }
    }

    const period = Math.max(160, safe.w * 0.55);
    wavePath(waveBack, W, period, 5, H, hc ? 0x1a1a1a : 0x2a8a98, hc ? 1 : 0.55, hc ? 0 : 0.25);
    wavePath(waveMid, W, period * 0.8, 7, H, hc ? 0x111111 : 0x1f6f88, hc ? 1 : 0.6, hc ? 0 : 0.35);
    wavePath(waveFront, W, period * 0.7, 6, H, hc ? 0x000000 : 0x1a5f7c, hc ? 0.9 : 0.5, hc ? 0.8 : 0.55);

    sand.clear();
    const sandY = safe.y + safe.h * 0.875;
    sand.moveTo(0, sandY + 10);
    for (let x = 0; x <= W + 20; x += 20) sand.lineTo(x, sandY + Math.sin(x * 0.02) * 5);
    sand.lineTo(W + 20, H).lineTo(0, H).closePath().fill({ color: hc ? 0x000000 : 0xe8b98f, alpha: 1 });
    if (!hc) {
      sand.moveTo(0, sandY + 3);
      for (let x = 0; x <= W + 20; x += 20) sand.lineTo(x, sandY - 3 + Math.sin(x * 0.02) * 5);
      sand.stroke({ width: 3, color: 0xffffff, alpha: 0.55 });
      for (let i = 0; i < 40; i++) {
        const x = (((i * 6151) % 1000) / 1000) * W;
        const y = sandY + 12 + (((i * 2713) % 1000) / 1000) * (H - sandY);
        sand.circle(x, y, 1 + (i % 3) * 0.5).fill({ color: 0xb98b66, alpha: 0.5 });
      }
    }

    // necklace across the top of the safe area
    necklace.position.set(0, 0);
    drawNecklace();

    // prompt card
    const cw = safe.w - 32;
    const ch = 118 * clamp(S.textScale, 1, 1.4);
    card.position.set(safe.x + 16, safe.y + safe.h * 0.19);
    cardBg.clear();
    cardTile.visible = soft();
    if (soft()) {
      setSoft(cardTile, { width: cw, height: ch, base: SB, radius: 22, depth: 9, resolution: dpr });
      cardTile.position.set(cw / 2, ch / 2);
    } else {
      cardBg.roundRect(0, 0, cw, ch, 22).fill({ color: hc ? 0x000000 : 0x1c1433, alpha: hc ? 1 : 0.62 });
      cardBg.roundRect(0, 0, cw, ch, 22).stroke({ width: hc ? 3 : 1.5, color: hc ? 0xffffff : 0xffd9c2, alpha: hc ? 1 : 0.35 });
    }
    const sr = 26;
    speaker.position.set(cw - sr - 14, ch / 2);
    speakerBg.clear();
    speakerBg.circle(0, 0, sr).fill({ color: hc ? 0xffffff : hex(pal.accent), alpha: 1 });
    speakerBg.circle(0, 0, sr).stroke({ width: 2, color: 0xffffff, alpha: hc ? 1 : 0.6 });
    speakerIcon.clear();
    const ic = hc ? 0x000000 : 0x10323a;
    speakerIcon.poly([-11, -5, -5, -5, 3, -12, 3, 12, -5, 5, -11, 5]).fill({ color: ic });
    speakerIcon.arc(4, 0, 7, -0.9, 0.9).stroke({ width: 2.5, color: ic, cap: 'round' });
    speakerIcon.arc(4, 0, 12, -0.9, 0.9).stroke({ width: 2.5, color: ic, cap: 'round' });
    speakerKey.position.set(0, sr + 11);
    speakerKey.visible = S.showKeyHints && !preview;
    speakerGlow.tint = hex(pal.accent);
    speakerGlow.scale.set(1.1);
    speaker.eventMode = preview ? 'none' : 'static';
    speaker.cursor = 'pointer';
    speaker.hitArea = new Rectangle(-34, -34, 68, 68);

    styleCard();
    if (prompt) {
      buildSlots();
      placeShells(false);
    }
  }

  function styleCard() {
    const hc = S.highContrast;
    const cw = safe.w - 32;
    const ch = 118 * clamp(S.textScale, 1, 1.4);
    const ts = S.textScale;
    taskLabel.style = {
      fontFamily: 'Geist Variable, system-ui, sans-serif',
      fontSize: Math.round(13 * ts),
      fontWeight: '800',
      letterSpacing: 1.6,
      fill: hc ? 0xffffff : 0xffd9c2,
    };
    taskLabel.position.set(52, 20);
    taskIcon.position.set(30, 20 + 8 * ts);
    const ps: TextStyleOptions = {
      fontFamily: readingFont(),
      fontSize: Math.round(40 * ts),
      fontWeight: '700',
      fill: hc ? 0xffffff : 0xfff6ec,
      dropShadow: hc ? undefined : { color: 0x000000, alpha: 0.35, blur: 6, distance: 2, angle: Math.PI / 2 },
    };
    promptText.style = ps;
    promptText.anchor.set(0, 0.5);
    promptText.position.set(24, ch * 0.62);
    promptText.scale.set(1);
    const maxW = cw - 24 - 80;
    if (promptText.width > maxW) promptText.scale.set(maxW / promptText.width);
  }

  function drawTaskIcon(task: Task) {
    const g = taskIcon;
    g.clear();
    const col = S.highContrast ? 0xffffff : 0xffd9c2;
    if (task === 'build') {
      // three linked blocks
      for (let i = 0; i < 3; i++) g.roundRect(-12 + i * 9, -4, 7, 8, 2).fill({ color: col });
    } else if (task === 'rhyme') {
      // two echoing waves
      g.moveTo(-13, -2).quadraticCurveTo(-8, -8, -3, -2).quadraticCurveTo(2, 4, 7, -2).stroke({ width: 2.2, color: col, cap: 'round' });
      g.moveTo(-13, 4).quadraticCurveTo(-8, -2, -3, 4).quadraticCurveTo(2, 10, 7, 4).stroke({ width: 2.2, color: col, cap: 'round', alpha: 0.6 });
    } else {
      // arrow into a start bar
      g.rect(-13, -7, 3, 14).fill({ color: col });
      g.poly([-7, -6, 3, 0, -7, 6]).fill({ color: col });
    }
  }

  function drawNecklace() {
    neckString.clear();
    pearlsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const x0 = safe.x + 26;
    const x1 = safe.x + safe.w - 26;
    const y0 = safe.y + safe.h * 0.105;
    const sag = 24;
    const pt = (t: number) => ({ x: lerp(x0, x1, t), y: y0 + Math.sin(t * Math.PI) * sag });
    const hc = S.highContrast;
    neckString.moveTo(x0, y0);
    for (let i = 1; i <= 30; i++) {
      const p = pt(i / 30);
      neckString.lineTo(p.x, p.y);
    }
    neckString.stroke({ width: hc ? 2.5 : 1.5, color: hc ? 0xffffff : 0xffe7c9, alpha: hc ? 1 : 0.7 });
    neckString.circle(x0, y0, 4).fill({ color: 0xe8c07a });
    neckString.circle(x1, y0, 4).fill({ color: 0xe8c07a });
    for (let i = 0; i < PROMPTS_PER_ROUND; i++) {
      const p = pt((i + 0.5) / PROMPTS_PER_ROUND);
      const st = necklaceState[i] ?? null;
      const slot = new Container();
      slot.position.set(p.x, p.y);
      if (st === 'pearl') {
        const glow = new Sprite(glowTexture(64, 0.3));
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        glow.tint = 0xfff0f6;
        glow.alpha = 0.55;
        glow.scale.set(0.75);
        const pearl = new Sprite(pearlTex);
        pearl.anchor.set(0.5);
        pearl.width = pearl.height = 19;
        slot.addChild(glow, pearl);
      } else if (st === 'miss') {
        // a small sand bead: hollow square, distinct in shape from a pearl
        const g = new Graphics().roundRect(-5, -5, 10, 10, 2).stroke({ width: 2, color: hc ? 0xffffff : 0xd9b48f, alpha: 0.9 });
        slot.addChild(g);
      } else {
        const g = new Graphics().circle(0, 0, 6).fill({ color: 0x1c1433, alpha: 0.5 }).circle(0, 0, 6).stroke({ width: 1.5, color: hc ? 0xffffff : 0xffe7c9, alpha: hc ? 0.9 : 0.55 });
        slot.addChild(g);
      }
      pearlsLayer.addChild(slot);
    }
  }

  function necklaceSlotPos(i: number) {
    const x0 = safe.x + 26;
    const x1 = safe.x + safe.w - 26;
    const y0 = safe.y + safe.h * 0.105;
    const t = (i + 0.5) / PROMPTS_PER_ROUND;
    return { x: lerp(x0, x1, t), y: y0 + Math.sin(t * Math.PI) * 24 };
  }

  // ---------------------------------------------------------------- build slots
  function slotRowY() {
    return safe.y + safe.h * 0.4;
  }

  function buildSlots() {
    slots.removeChildren().forEach((c) => c.destroy({ children: true }));
    slotViews = [];
    if (!prompt || prompt.task !== 'build') return;
    const n = prompt.sequence.length;
    const gap = 6;
    const sw = Math.min(84, (safe.w - 40 - gap * (n - 1)) / n);
    const sh = 40 * clamp(S.textScale, 1, 1.3);
    const total = n * sw + (n - 1) * gap;
    const x0 = safe.x + (safe.w - total) / 2;
    const y = slotRowY();
    const hc = S.highContrast;
    for (let i = 0; i < n; i++) {
      // a container (soft tile + drawn box + text), since Graphics should not hold children
      const box = new Container();
      const boxBg = new Graphics();
      boxBg.label = 'slotBg';
      box.addChild(boxBg);
      const filled = i < step;
      box.position.set(x0 + i * (sw + gap) + sw / 2, y);
      drawSlotBox(box, sw, sh, filled);
      const t = new Text({
        text: filled ? prompt.sequence[i] : '',
        style: { fontFamily: readingFont(), fontSize: Math.round(22 * S.textScale), fontWeight: '700', fill: hc ? 0xffffff : soft() ? 0xfff1e0 : 0x2a2140 },
        resolution: dpr,
      });
      t.anchor.set(0.5);
      fitText(t, sw - 8);
      box.addChild(t);
      slots.addChild(box);
      slotViews.push({ box, text: t, filled });
    }
  }

  function drawSlotBox(view: Container, sw: number, sh: number, filled: boolean) {
    const hc = S.highContrast;
    const box = view.children.find((c) => c.label === 'slotBg') as Graphics;
    box.clear();
    let tile = view.children.find((c) => c.label === 'softTile') as Sprite | undefined;
    if (soft()) {
      // empty slots are inset wells; a filled slot pops out with the accent rim
      if (!tile) {
        tile = new Sprite();
        tile.anchor.set(0.5);
        tile.label = 'softTile';
        view.addChildAt(tile, 0);
      }
      tile.visible = true;
      setSoft(tile, { width: Math.round(sw), height: Math.round(sh), base: SB, radius: 12, pressed: !filled, rim: filled ? pal.accent : undefined, rimWidth: 2, depth: filled ? 5 : 4, resolution: dpr });
      return;
    }
    if (tile) tile.visible = false;
    if (filled) {
      box.roundRect(-sw / 2, -sh / 2, sw, sh, 12).fill({ color: hc ? 0x000000 : 0xfff1e0, alpha: 1 });
      box.roundRect(-sw / 2, -sh / 2, sw, sh, 12).stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : hex(pal.accent) });
    } else {
      box.roundRect(-sw / 2, -sh / 2, sw, sh, 12).fill({ color: 0x000000, alpha: hc ? 0.9 : 0.22 });
      box.roundRect(-sw / 2, -sh / 2, sw, sh, 12).stroke({ width: 2, color: hc ? 0xffffff : 0xfff1e0, alpha: hc ? 1 : 0.5 });
      box.roundRect(-sw / 2 + 12, sh / 2 - 9, sw - 24, 2, 1).fill({ color: hc ? 0xffffff : 0xfff1e0, alpha: hc ? 1 : 0.45 });
    }
  }

  function fitText(t: Text, maxW: number) {
    t.scale.set(1);
    if (t.width > maxW) t.scale.set(maxW / t.width);
  }

  // ---------------------------------------------------------------- shells
  function shellRadius(n: number) {
    const perRow = n <= 4 ? n : 3;
    return Math.min(50, (safe.w * 0.94) / perRow / 2.55);
  }

  function drawShellBody(sh: Shell) {
    const g = sh.body;
    const r = sh.r;
    const hc = S.highContrast;
    g.clear();
    const cy = r * 0.55;
    const R = r * 1.3;
    const a0 = Math.PI + 0.36;
    const a1 = TAU - 0.36;
    const ribs = 9;
    const pts: number[] = [];
    pts.push(-r * 0.3, r * 0.52, -r * 0.4, r * 0.74, r * 0.4, r * 0.74, r * 0.3, r * 0.52);
    const M = ribs * 6;
    for (let i = M; i >= 0; i--) {
      const t = i / M;
      const a = lerp(a0, a1, t);
      const rr = R * (0.955 + 0.045 * Math.abs(Math.sin(t * ribs * Math.PI)));
      pts.push(Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    const fill = hc ? 0xffffff : sh.color;
    const dim = sh.state === 'dim';
    // shadow
    g.ellipse(0, r * 0.82, r * 1.05, r * 0.16).fill({ color: 0x0a2233, alpha: hc ? 0 : 0.35 });
    g.poly(pts).fill({ color: fill, alpha: 1 });
    if (!hc) {
      // pearly inner layer + darker lip give the fan some depth
      const inner: number[] = [];
      for (let i = 0; i < pts.length; i += 2) inner.push(pts[i] * 0.74, cy + (pts[i + 1] - cy) * 0.74);
      g.poly(inner).fill({ color: 0xffffff, alpha: 0.28 });
      g.ellipse(0, r * 0.5, r * 0.5, r * 0.14).fill({ color: sh.rib, alpha: 0.35 });
    }
    // ribs
    for (let i = 1; i < ribs; i++) {
      const a = lerp(a0, a1, i / ribs);
      g.moveTo(0, cy).lineTo(Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93);
    }
    g.stroke({ width: hc ? 1.5 : 1.6, color: hc ? 0x000000 : sh.rib, alpha: hc ? 0.35 : 0.45 });
    g.poly(pts).stroke({ width: hc ? 3.5 : 2, color: hc ? 0x000000 : sh.rib, alpha: 1, join: 'round' });
    // text plate for contrast
    const tw = r * 1.78;
    const th = r * 0.62 * clamp(S.textScale, 1, 1.4);
    g.roundRect(-tw / 2, -r * 0.18 - th / 2, tw, th, th / 2).fill({ color: 0xffffff, alpha: hc ? 1 : 0.72 });
    if (dim) g.poly(pts).fill({ color: 0x0b1a2a, alpha: 0.45 });
  }

  function makeShell(label: string, i: number, n: number): Shell {
    const r = shellRadius(n);
    const view = new Container();
    const glow = new Sprite(glowTexture(128, 0.3));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = hex(pal.accent);
    glow.alpha = 0;
    glow.scale.set((r * 3.4) / 128);
    glow.y = -r * 0.1;
    const body = new Graphics();
    const sheen = new Sprite(glowTexture(64, 0.2));
    sheen.anchor.set(0.5);
    sheen.blendMode = 'add';
    sheen.tint = 0xffe6f5;
    sheen.alpha = S.highContrast ? 0 : 0.45;
    sheen.scale.set((r * 1.1) / 64, (r * 0.55) / 64);
    sheen.position.set(-r * 0.45, -r * 0.5);
    const text = new Text({ text: label, style: {}, resolution: dpr });
    text.anchor.set(0.5);
    const badge = new Container();
    const badgeText = new Text({ text: String(i + 1), style: { fontFamily: 'Geist Variable, system-ui, sans-serif', fontSize: 12, fontWeight: '800', fill: 0xffffff }, resolution: dpr });
    badgeText.anchor.set(0.5);
    const badgeBg = new Graphics().circle(0, 0, 10).fill({ color: 0x1c1433, alpha: 0.85 }).circle(0, 0, 10).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
    badge.addChild(badgeBg, badgeText);
    view.addChild(glow, body, sheen, text, badge);
    const sh: Shell = {
      label,
      view,
      body,
      glow,
      sheen,
      text,
      badge,
      badgeText,
      color: SHELL_COLORS[i % SHELL_COLORS.length],
      rib: SHELL_RIBS[i % SHELL_RIBS.length],
      r,
      hx: 0,
      hy: 0,
      phase: rng.next() * TAU,
      state: 'arriving',
      hint: 0,
      shake: 0,
      lift: 0,
    };
    styleShell(sh);
    view.eventMode = preview ? 'none' : 'static';
    view.cursor = 'pointer';
    view.hitArea = new Rectangle(-r * 1.3, -r * 0.95, r * 2.6, Math.max(64, r * 1.9));
    view.on('pointerdown', () => {
      const idx = shells.indexOf(sh);
      if (idx >= 0) choose(idx);
    });
    return sh;
  }

  function styleShell(sh: Shell) {
    const r = sh.r;
    const hc = S.highContrast;
    drawShellBody(sh);
    sh.text.style = {
      fontFamily: readingFont(),
      fontSize: Math.round(Math.min(26, r * 0.56) * S.textScale),
      fontWeight: '700',
      fill: hc ? 0x000000 : 0x2a2140,
    };
    sh.text.position.set(0, -r * 0.18);
    fitText(sh.text, r * 1.68);
    sh.badge.position.set(0, r * 0.72);
    sh.badge.visible = S.showKeyHints && !preview;
    sh.sheen.alpha = hc ? 0 : 0.45;
  }

  function placeShells(fresh: boolean) {
    const n = shells.length;
    const rows = n <= 4 ? [n] : [3, n - 3];
    let k = 0;
    rows.forEach((count, ri) => {
      const spacing = (safe.w * 0.94) / (ri === 0 ? rows[0] : Math.max(count, rows[0]));
      const total = spacing * (count - 1);
      for (let j = 0; j < count; j++) {
        const sh = shells[k++];
        sh.r = shellRadius(n);
        sh.hx = safe.x + safe.w / 2 - total / 2 + j * spacing;
        sh.hy = shellY + ri * sh.r * 2.1 - (rows.length > 1 ? sh.r * 0.8 : 0) + (rows.length === 1 ? (j % 2 ? 10 : -4) : 0);
        if (!fresh) {
          styleShell(sh);
          sh.view.hitArea = new Rectangle(-sh.r * 1.3, -sh.r * 0.95, sh.r * 2.6, Math.max(64, sh.r * 1.9));
          sh.view.position.set(sh.hx, sh.hy);
        }
      }
    });
  }

  function clearShells() {
    for (const sh of shells) sh.view.destroy({ children: true });
    shells = [];
  }

  async function spawnShells(p: Prompt) {
    clearShells();
    shells = p.options.map((label, i) => makeShell(label, i, p.options.length));
    placeShells(true);
    const reduced = S.reducedMotion;
    ctx.audio.noise({ dur: 1.1, filter: 700, sweepTo: 1800, gain: 0.05, q: 0.6 });
    const arrivals: Promise<void>[] = [];
    shells.forEach((sh, i) => {
      shellsLayer.addChild(sh.view);
      if (reduced) {
        sh.view.position.set(sh.hx, sh.hy);
        sh.view.alpha = 0;
        arrivals.push(tween(ctx, 250, (t) => (sh.view.alpha = t)));
      } else {
        const sx = sh.hx + safe.w * 0.7 + i * 30;
        const sy = sh.hy + 40;
        sh.view.position.set(sx, sy);
        sh.view.rotation = 0.3;
        arrivals.push(
          ctx.wait(i * 110).then(() =>
            tween(ctx, 800, (t) => {
              sh.view.x = lerp(sx, sh.hx, easeOutBack(t));
              sh.view.y = lerp(sy, sh.hy, t) - Math.sin(t * Math.PI) * 28;
              sh.view.rotation = 0.3 * (1 - t);
            }, (t) => t),
          ),
        );
      }
    });
    await Promise.all(arrivals);
    for (const sh of shells) if (sh.state === 'arriving') sh.state = 'idle';
  }

  // ---------------------------------------------------------------- prompts & voice
  function spokenLine(p: Prompt) {
    if (p.task === 'build') return p.word.w;
    if (p.task === 'rhyme') return `Which word rhymes with ${p.word.w}?`;
    return `Which word starts like ${p.word.w}?`;
  }

  function sayPrompt() {
    if (!prompt) return;
    speakingPulse = 1;
    ctx.caption(`Voice: “${spokenLine(prompt)}”`);
    void ctx.audio.speak(spokenLine(prompt), { rate: 0.85 });
  }

  function showPrompt(p: Prompt) {
    const labels: Record<Task, string> = { build: 'BUILD THE WORD', rhyme: 'WHICH RHYMES WITH…', onset: 'WHICH STARTS LIKE…' };
    taskLabel.text = labels[p.task];
    drawTaskIcon(p.task);
    promptText.text = p.word.w;
    styleCard();
    card.alpha = 0;
    void tween(ctx, S.reducedMotion ? 1 : 350, (t) => {
      card.alpha = t;
      card.pivot.y = (1 - t) * -8;
    });
    ctx.announce(`${labels[p.task].replace('…', '')} ${p.word.w}`);
  }

  // ---------------------------------------------------------------- input
  function choose(i: number) {
    if (!accepting || !prompt) return;
    const sh = shells[i];
    if (!sh || sh.state !== 'idle') return;
    const p = prompt;
    if (p.task === 'build') {
      const want = p.sequence[step];
      if (sh.label === want) {
        sh.state = 'used';
        ctx.audio.pluck(note(step + 2), { gain: 0.14 });
        ctx.haptics.tick();
        for (const s of shells) s.hint = 0;
        const target = slotViews[step];
        step++;
        flyToSlot(sh, target, step - 1);
        if (step >= p.sequence.length) finishPrompt(true);
      } else {
        wrong(sh);
        const next = shells.find((s) => s.state === 'idle' && s.label === want);
        if (next) next.hint = 1;
      }
    } else {
      if (sh.label === p.sequence[0]) {
        sh.state = 'used';
        openShell(sh);
        finishPrompt(true);
      } else {
        wrong(sh);
        sh.state = 'dim';
        drawShellBody(sh);
        const right = shells.find((s) => s.label === p.sequence[0]);
        if (right) right.hint = 1;
      }
    }
  }

  function wrong(sh: Shell) {
    mistakes++;
    sh.hint = 0;
    ctx.audio.thunk({ gain: 0.16 });
    ctx.audio.noise({ dur: 0.18, filter: 500, gain: 0.05 });
    ctx.haptics.error();
    ctx.caption('Shell closes softly');
    if (S.reducedMotion) {
      sh.hint = 0;
      void tween(ctx, 400, (t) => (sh.glow.alpha = Math.sin(t * Math.PI) * 0.6));
    } else {
      sh.shake = 1;
      sh.lift = 1;
    }
  }

  function flyToSlot(sh: Shell, slot: { box: Container; text: Text; filled: boolean } | undefined, idx: number) {
    if (!slot || !prompt) return;
    const sx = sh.view.x;
    const sy = sh.view.y;
    const tx = slot.box.x;
    const ty = slot.box.y;
    particles.burst(sx, sy - sh.r * 0.2, 10, { color: 0xfff1e0, speed: 120, life: 0.5 });
    const done = () => {
      slot.filled = true;
      const n = prompt!.sequence.length;
      const sw = Math.min(84, (safe.w - 40 - 6 * (n - 1)) / n);
      const shh = 40 * clamp(S.textScale, 1, 1.3);
      drawSlotBox(slot.box, sw, shh, true);
      slot.text.text = prompt!.sequence[idx];
      fitText(slot.text, sw - 8);
      particles.burst(tx, ty, 8, { color: hex(pal.accent), speed: 90, life: 0.45 });
      sh.view.visible = false;
    };
    if (S.reducedMotion) {
      done();
      return;
    }
    void tween(ctx, 380, (t) => {
      sh.view.x = lerp(sx, tx, t);
      sh.view.y = lerp(sy, ty, t) - Math.sin(t * Math.PI) * 40;
      sh.view.scale.set(1 - t * 0.45);
      sh.view.alpha = 1 - t * 0.6;
    }, easeInOutSine).then(done);
  }

  function openShell(sh: Shell) {
    ctx.audio.chime(note(7), { gain: 0.1, dur: 1.2 });
    particles.burst(sh.view.x, sh.view.y - sh.r * 0.3, 18, { color: 0xfff1e0, speed: 160, life: 0.7 });
    if (!S.reducedMotion) {
      void tween(ctx, 300, (t) => sh.view.scale.set(1 + Math.sin(t * Math.PI) * 0.15));
    }
    sh.glow.tint = 0xfff1e0;
    sh.hint = 0.8;
  }

  function finishPrompt(_completed: boolean) {
    accepting = false;
    const p = prompt!;
    const perfect = mistakes === 0;
    prompts++;
    perTask[p.task].n++;
    if (perfect) {
      perTask[p.task].ok++;
      firstTry++;
    }
    const rt = ctx.time() - promptStart;
    ctx.trial({ correct: perfect, rtMs: rt, level: stair.level });
    stair.record(perfect);
    if (p.task === 'build' && perfect) longest = Math.max(longest, p.sequence.length);
    const slotIdx = inRound;
    inRound++;
    if (perfect) {
      pearls++;
      score += 10 + (p.task === 'build' ? (p.sequence.length - 2) * 2 : 0);
      necklaceState[slotIdx] = 'pearl';
    } else {
      roundMisses++;
      necklaceState[slotIdx] = 'miss';
    }
    // speak the whole word / pair, and celebrate
    const said = p.task === 'build' ? p.word.w : `${p.word.w}, ${p.target!.w}`;
    ctx.caption(`Voice: “${said}”`);
    void ctx.audio.speak(said, { rate: 0.9 });
    void celebrate(perfect, slotIdx);
    hud();
  }

  async function celebrate(perfect: boolean, slotIdx: number) {
    const p = prompt!;
    const from = p.task === 'build'
      ? { x: safe.x + safe.w / 2, y: slotRowY() }
      : (() => {
          const s = shells.find((x) => x.label === p.sequence[0]);
          return s ? { x: s.view.x, y: s.view.y - s.r * 0.3 } : { x: safe.x + safe.w / 2, y: shellY };
        })();
    if (p.task === 'build') {
      // slots snap together with a sparkle
      if (!S.reducedMotion) {
        await ctx.wait(S.reducedMotion ? 0 : 380);
        const xs = slotViews.map((s) => s.box.x);
        const cx = safe.x + safe.w / 2;
        await tween(ctx, 260, (t) => slotViews.forEach((s, i) => (s.box.x = lerp(xs[i], cx + (xs[i] - cx) * 0.86, t))));
      }
      particles.burst(from.x, from.y, 26, { color: hex(pal.accent), speed: 200, life: 0.8 });
      ctx.audio.chime(note(9), { gain: 0.09, dur: 1.4 });
    }
    if (perfect) {
      ctx.audio.bell(note(11), { gain: 0.1, dur: 1.2, when: ctx.audio.now() + 0.08 });
      ctx.haptics.success();
      const target = necklaceSlotPos(slotIdx);
      const pearl = new Sprite(pearlTex);
      pearl.anchor.set(0.5);
      pearl.width = pearl.height = 26;
      const halo = new Sprite(glowTexture(64, 0.3));
      halo.anchor.set(0.5);
      halo.blendMode = 'add';
      halo.tint = 0xfff0f6;
      halo.scale.set(1.2);
      const holder = new Container();
      holder.addChild(halo, pearl);
      holder.position.set(from.x, from.y);
      fx.addChild(holder);
      if (!S.reducedMotion) {
        await tween(ctx, 700, (t) => {
          holder.x = lerp(from.x, target.x, t);
          holder.y = lerp(from.y, target.y, t) - Math.sin(t * Math.PI) * 60;
          holder.scale.set(1 - t * 0.3);
        }, easeInOutSine);
      }
      holder.destroy({ children: true });
      ctx.audio.chime(note(12), { gain: 0.07, dur: 0.8 });
      particles.burst(target.x, target.y, 10, { color: 0xfff0f6, speed: 80, life: 0.5 });
    } else {
      ctx.audio.pluck(note(0), { gain: 0.08 });
    }
    drawNecklace();
    resolvePrompt?.();
  }

  // ---------------------------------------------------------------- ghost player
  async function ghost() {
    await ctx.wait(500 + rng.next() * 300);
    while (alive && accepting && prompt) {
      const p = prompt;
      const want = p.task === 'build' ? p.sequence[step] : p.sequence[0];
      const idle = shells.map((s, i) => ({ s, i })).filter((o) => o.s.state === 'idle');
      const right = idle.find((o) => o.s.label === want);
      const wrongs = idle.filter((o) => o.s.label !== want);
      const slip = prompts > 0 && rng.chance(0.09) && wrongs.length > 0;
      const pick = slip ? rng.pick(wrongs) : right;
      if (!pick) return;
      pick.s.hint = Math.max(pick.s.hint, 0.35);
      await ctx.wait(260);
      choose(pick.i);
      await ctx.wait(p.task === 'build' ? 520 + rng.next() * 260 : 900 + rng.next() * 400);
    }
  }

  // ---------------------------------------------------------------- flow
  async function runPrompt(forced?: { task: Task; word: string }) {
    prompt = makePrompt(rng, stair.level, used, forced);
    used.add(prompt.word.w);
    step = 0;
    mistakes = 0;
    buildSlots();
    showPrompt(prompt);
    const done = new Promise<void>((res) => (resolvePrompt = res));
    await spawnShells(prompt);
    if (!alive) return;
    sayPrompt();
    promptStart = ctx.time();
    accepting = true;
    if (preview) void ghost();
    await done;
    resolvePrompt = null;
    await ctx.wait(700 * S.timingMultiplier);
    // shells drift back out with the tide
    const outs = shells.map((sh) =>
      tween(ctx, S.reducedMotion ? 150 : 600, (t) => {
        if (!S.reducedMotion) sh.view.x += 3 + t * 6;
        sh.view.alpha = Math.min(sh.view.alpha, 1 - t);
      }),
    );
    void tween(ctx, 300, (t) => (slots.alpha = 1 - t));
    await Promise.all(outs);
    slots.alpha = 1;
  }

  async function runRound() {
    round++;
    inRound = 0;
    roundMisses = 0;
    necklaceState.length = 0;
    drawNecklace();
    hud();
    if (!preview) ctx.announce(`Round ${round}`);
    for (let i = 0; i < PROMPTS_PER_ROUND && alive; i++) {
      await runPrompt(preview && round === 1 && i === 0 ? { task: 'build', word: 'butterfly' } : undefined);
    }
    if (!alive) return;
    // necklace complete: sparkle along it
    for (let i = 0; i < PROMPTS_PER_ROUND; i++) {
      if (necklaceState[i] !== 'pearl') continue;
      const p = necklaceSlotPos(i);
      ctx.after(i * 60, () => particles.burst(p.x, p.y, 6, { color: 0xfff0f6, speed: 70, life: 0.6 }));
    }
    ctx.audio.chime(note(7), { gain: 0.08, dur: 1.6 });
    ctx.audio.chime(note(9), { gain: 0.07, dur: 1.6, when: ctx.audio.now() + 0.15 });
    ctx.audio.chime(note(11), { gain: 0.07, dur: 1.8, when: ctx.audio.now() + 0.3 });
    if (roundMisses === 0 && !preview) {
      score += 50;
      ctx.caption('Perfect necklace! +50');
      ctx.announce('Perfect necklace, fifty bonus points');
    }
    hud();
    await ctx.wait(1400);
  }

  async function session() {
    running = true;
    if (preview) {
      for (;;) {
        await runRound();
        if (!alive) return;
      }
    }
    for (let r = 0; r < ROUNDS && alive; r++) await runRound();
    if (!alive) return;
    running = false;
    const acc = prompts ? Math.round((firstTry / prompts) * 100) : 0;
    ctx.end({
      score,
      levelReached: stair.level,
      stats: { pearls, accuracy: acc, longest },
      message: pearls >= 18 ? 'A necklace fit for the tide queen.' : pearls >= 10 ? 'Your necklace shimmers in the dusk.' : 'Every pearl is a sound you caught.',
    });
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: (Math.max(0, round - 1) * PROMPTS_PER_ROUND + inRound) / (PROMPTS_PER_ROUND * ROUNDS),
      label: `Round ${Math.max(1, Math.min(round, ROUNDS))}/${ROUNDS} · ${pearls} pearls`,
    });
  }

  // ---------------------------------------------------------------- per-frame
  function update(dt: number, now: number) {
    const s = now / 1000;
    const reduced = S.reducedMotion;
    const period = Math.max(160, safe.w * 0.55);
    if (!reduced) {
      waveBack.x = -((s * 18) % period);
      waveMid.x = -((s * 26) % (period * 0.8)) ;
      waveFront.x = -((s * 34) % (period * 0.7));
      clouds.children.forEach((c, i) => {
        c.x += (dt / 1000) * (4 + i);
        if (c.x > W + 200) c.x = -200;
      });
      reflect.children.forEach((c, i) => (c.alpha = 0.6 + Math.sin(s * 2 + i * 1.3) * 0.35));
    }
    waveBack.y = horizonY + safe.h * 0.08 + (reduced ? 0 : Math.sin(s * 0.9) * 3);
    waveMid.y = horizonY + safe.h * 0.15 + (reduced ? 0 : Math.sin(s * 0.8 + 1) * 4);
    const bob = reduced ? 0 : Math.sin(s * 1.1 + 2) * 4;
    const rows = shells.length > 4 ? 2 : 1;
    const baseR = shells[0]?.r ?? 40;
    waveFront.y = shellY + (rows > 1 ? baseR * 1.9 : baseR * 0.55) + bob;

    for (const sh of shells) {
      if (sh.state === 'arriving' || !sh.view.visible) continue;
      if (sh.state === 'used' && prompt?.task === 'build') continue;
      sh.phase += dt / 1000;
      const b = reduced ? 0 : Math.sin(sh.phase * 1.4) * 3.5;
      let x = sh.hx;
      if (sh.shake > 0) {
        sh.shake = Math.max(0, sh.shake - dt / 450);
        x += Math.sin(sh.shake * 30) * 7 * sh.shake;
      }
      if (sh.lift > 0) sh.lift = Math.max(0, sh.lift - dt / 900);
      const drift = sh.state === 'dim' ? 10 : 0;
      sh.view.x = x;
      sh.view.y = sh.hy + b + drift + (reduced ? 0 : -Math.sin(sh.lift * Math.PI) * 6);
      sh.view.rotation = reduced ? 0 : Math.sin(sh.phase * 1.1) * 0.035;
      // hint glow pulses gently (well under 3 Hz)
      const pulse = sh.hint > 0 ? sh.hint * (0.55 + Math.sin(s * TAU * 0.9) * 0.3) : 0;
      sh.glow.alpha += (pulse - sh.glow.alpha) * Math.min(1, dt / 120);
    }

    speakingPulse = Math.max(0, speakingPulse - dt / 1600);
    speakerGlow.alpha = S.highContrast ? 0 : 0.2 + speakingPulse * 0.6;
    speakerBg.scale.set(1 + (reduced ? 0 : speakingPulse * 0.08 * Math.sin(s * 8)));

    if (!preview && running && now >= nextSwash) {
      nextSwash = now + 4200 + rng.next() * 2500;
      ctx.audio.noise({ dur: 1.6, filter: 500, sweepTo: 1200, gain: 0.025, q: 0.5 });
    }
    void easeOutCubic;
  }

  // ---------------------------------------------------------------- wiring
  speaker.on('pointerdown', () => {
    if (preview) return;
    ctx.audio.tick();
    sayPrompt();
  });
  const pick = (i: number) => () => choose(i);
  ctx.keys({
    Digit1: pick(0),
    Digit2: pick(1),
    Digit3: pick(2),
    Digit4: pick(3),
    Digit5: pick(4),
    Numpad1: pick(0),
    Numpad2: pick(1),
    Numpad3: pick(2),
    Numpad4: pick(3),
    Numpad5: pick(4),
    KeyR: () => sayPrompt(),
  });

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  return {
    start() {
      if (!preview) stopAmbient = ctx.audio.ambient([52, 59, 64, 68], { gain: 0.03, brightness: 0.3 });
      void session();
    },
    onSettings: () => {
      layout();
      for (const sh of shells) styleShell(sh);
      buildSlots();
    },
    destroy() {
      alive = false;
      running = false;
      accepting = false;
      stopAmbient?.();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
  };
}
