import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, easeOutCubic, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { createLangToggle } from '@/sdk/voiceui';
import { PACK } from './content';

const FONT = '"Geist Variable", "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const TRIALS = 24;
const SHAPE_COLORS = [0xffd76a, 0x7fe7d8, 0xb9a2ff, 0xff9f8a];
const ARROWS = ['↑', '↓', '←', '→'];
const SWIPE_VEC: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Action codes: 0–3 tap star/circle/square/triangle, 4–7 swipe up/down/left/right. */
type Action = number;
type Kind = 'go' | 'plain' | 'said' | 'dont' | 'compound';
interface Cmd {
  text: string;
  go: boolean;
  seq: Action[];
  kind: Kind;
}
type Outcome = 'hit' | 'withhold' | 'commission' | 'wrong' | 'miss';
type Face = 'idle' | 'happy' | 'oops' | 'wink';

interface Btn {
  c: Container;
  bg: Graphics;
  tile: Sprite;
  /** Soft look: which texture the tile shows now (0 raised, 1 pressed, 2 lit rim), to swap only on change. */
  tileState: number;
  shape: Graphics;
  label: Text;
  key: Text;
  w: number;
  h: number;
  press: number;
  glow: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 6, up: 2, down: 1, start: clamp(ctx.startLevel, 1, 3) });
  if (preview) stair.set(3);
  const note = ctx.audio.scale(67, 'majorPenta');

  // Soft (dark neumorphism) look: the night sky settles into one calm indigo the shape pads are extruded from.
  const soft = () => ctx.settings.soft;
  const SB = '#15133a';
  const sres = ctx.quality.maxDpr;
  const auroraBg = gradientTexture([
    [0, '#07061a'],
    [0.5, '#17143a'],
    [1, '#0c0a24'],
  ]);
  const softBg = gradientTexture([
    [0, '#07061a'],
    [0.42, SB],
    [1, SB],
  ]);
  function setSoft(s: Sprite, o: SoftTileOptions) {
    s.texture = softTileTexture(o);
    const p = softTilePad(o);
    s.width = o.width + p * 2;
    s.height = o.height + p * 2;
  }
  const softOpts = (b: { w: number; h: number }, i: number, st: number): SoftTileOptions => ({
    width: b.w,
    height: b.h,
    base: SB,
    radius: 26,
    pressed: st === 1,
    rim: st === 2 ? '#' + SHAPE_COLORS[i].toString(16).padStart(6, '0') : undefined,
    rimWidth: 3,
    depth: 8,
    resolution: sres,
  });

  // ---- scene
  const bg = new Sprite(auroraBg);
  const stars = new Graphics();
  const motes = new Container();
  const lunaLayer = new Container();
  const btnLayer = new Container();
  const textLayer = new Container();
  const fx = new Container();
  app.stage.addChild(bg, stars, motes, lunaLayer, btnLayer, textLayer, fx);
  const particles = createParticles(ctx, fx, 240);

  const halo = new Sprite(glowTexture(256, 0.22));
  halo.anchor.set(0.5);
  halo.tint = hex(pal.accent);
  const timerRing = new Graphics();
  const moon = new Graphics();
  const face = new Graphics();
  lunaLayer.addChild(halo, timerRing, moon, face);

  const bubble = new Container();
  const bubbleBg = new Graphics();
  const bubbleText = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 23, fontWeight: '800', fill: '#1a1540', align: 'center', wordWrap: true, wordWrapWidth: 300, lineHeight: 30 },
  });
  bubbleText.anchor.set(0.5);
  bubble.addChild(bubbleBg, bubbleText);
  bubble.alpha = 0;
  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const hint = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: 'rgba(255,255,255,0.7)', align: 'center', wordWrap: true, wordWrapWidth: 320 },
  });
  hint.anchor.set(0.5);
  const fb = new Text({ text: '', style: { fontFamily: FONT, fontSize: 22, fontWeight: '900', fill: pal.highlight, align: 'center' } });
  fb.anchor.set(0.5);
  textLayer.addChild(bubble, status, hint, fb);

  const finger = new Container();
  const fingerGlow = new Sprite(glowTexture(64, 0.3));
  fingerGlow.anchor.set(0.5);
  fingerGlow.scale.set(0.9);
  const fingerDot = new Graphics().circle(0, 0, 13).fill({ color: 0xffffff, alpha: 0.9 }).circle(0, 0, 19).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  finger.addChild(fingerGlow, fingerDot);
  finger.alpha = 0;
  fx.addChild(finger);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(30 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? hex(pal.accent2) : hex(pal.accent);
    s.alpha = 0.2 + rng.next() * 0.35;
    s.scale.set(0.15 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  // ---- buttons
  const btns: Btn[] = [0, 1, 2, 3].map((i) => {
    const c = new Container();
    const bgG = new Graphics();
    const tile = new Sprite();
    tile.anchor.set(0.5);
    const shape = new Graphics();
    const label = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '800', fill: '#ffffff' } });
    label.anchor.set(0.5);
    const key = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 13, fontWeight: '800', fill: 'rgba(255,255,255,0.55)' } });
    c.addChild(tile, bgG, shape, label, key);
    btnLayer.addChild(c);
    return { c, bg: bgG, tile, tileState: 0, shape, label, key, w: 0, h: 0, press: 0, glow: 0 };
  });

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let lx = 0;
  let ly = 0;
  let LR = 60;
  let bubbleY = 0;

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.texture = soft() ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    LR = Math.min(safe.w * 0.15, 64);
    lx = safe.x + safe.w / 2;
    ly = safe.y + safe.h * 0.2;
    lunaLayer.position.set(lx, ly);
    halo.scale.set((LR / 64) * 2.3);
    status.position.set(lx, safe.y + safe.h * 0.065);
    fb.position.set(lx, safe.y + safe.h * 0.065);
    bubbleY = ly + LR + 58;
    bubble.position.set(lx, bubbleY);
    bubbleText.style.wordWrapWidth = safe.w - 80;
    bubbleText.style.fontSize = Math.round(21 * ctx.settings.textScale);
    bubbleText.style.lineHeight = Math.round(28 * ctx.settings.textScale);
    hint.style.wordWrapWidth = safe.w - 40;
    hint.position.set(lx, safe.y + safe.h - 26);
    const gap = 14;
    const top = safe.y + safe.h * 0.46;
    const bottom = safe.y + safe.h - 56;
    const w = Math.min((safe.w - 32 - gap) / 2, 220);
    const h = Math.min(150, (bottom - top - gap) / 2);
    btns.forEach((b, i) => {
      b.w = w;
      b.h = h;
      const col = i % 2;
      const row = Math.floor(i / 2);
      b.c.position.set(lx + (col === 0 ? -1 : 1) * (w / 2 + gap / 2), top + h / 2 + row * (h + gap));
      b.key.position.set(-w / 2 + 12, -h / 2 + 8);
      b.key.visible = ctx.settings.showKeyHints && !preview;
      b.label.position.set(0, h * 0.3);
      b.label.style.fontSize = Math.round(Math.min(20 * ctx.settings.textScale, 26));
    });
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    drawStars();
    drawMoon();
    drawButtons();
  }

  function drawStars() {
    stars.clear();
    for (let i = 0; i < 60; i++) {
      const x = (((i * 7307) % 1000) / 1000) * W;
      const y = (((i * 2663) % 1000) / 1000) * H * 0.6;
      stars.circle(x, y, 0.8 + (i % 3) * 0.5).fill({ color: 0xffffff, alpha: 0.25 + (i % 4) * 0.12 });
    }
  }

  function drawMoon() {
    const hc = ctx.settings.highContrast;
    moon.clear();
    moon.circle(0, 0, LR).fill({ color: hc ? 0xffffff : 0xfff0c2 });
    if (!hc) {
      moon.circle(LR * 0.45, -LR * 0.45, LR * 0.16).fill({ color: 0xead592, alpha: 0.6 });
      moon.circle(-LR * 0.55, -LR * 0.2, LR * 0.1).fill({ color: 0xead592, alpha: 0.55 });
      moon.circle(LR * 0.6, LR * 0.3, LR * 0.09).fill({ color: 0xead592, alpha: 0.5 });
      moon.circle(-LR * 0.3, -LR * 0.62, LR * 0.07).fill({ color: 0xead592, alpha: 0.5 });
    }
    moon.circle(0, 0, LR).stroke({ width: hc ? 4 : 2, color: hc ? 0x000000 : 0xffffff, alpha: hc ? 1 : 0.6 });
  }

  function shapePath(g: Graphics, kind: number, r: number) {
    if (kind === 0) {
      const pts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r * 1.05;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.poly(pts);
    } else if (kind === 1) g.circle(0, 0, r * 0.85);
    else if (kind === 2) g.roundRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.14);
    else g.poly([0, -r * 0.95, r * 0.95, r * 0.72, -r * 0.95, r * 0.72]);
  }

  function drawButtons() {
    const hc = ctx.settings.highContrast;
    const L = PACK[lang];
    btns.forEach((b, i) => {
      const { w, h } = b;
      b.bg.clear();
      b.tile.visible = soft();
      if (soft()) {
        b.tileState = 0;
        setSoft(b.tile, softOpts(b, i, 0));
      } else {
        b.bg.roundRect(-w / 2, -h / 2, w, h, 26).fill({ color: hc ? 0x000000 : 0x1b1945, alpha: 0.85 });
        b.bg.roundRect(-w / 2, -h / 2, w, h, 26).stroke({ width: hc ? 3 : 1.5, color: 0xffffff, alpha: hc ? 1 : 0.25 });
      }
      const r = Math.min(h * 0.24, w * 0.22);
      b.shape.clear();
      shapePath(b.shape, i, r);
      b.shape.fill({ color: hc ? 0xffffff : SHAPE_COLORS[i], alpha: 0.95 });
      shapePath(b.shape, i, r);
      b.shape.stroke({ width: 3, color: 0xffffff, alpha: hc ? 1 : 0.7 });
      b.shape.position.set(0, -h * 0.1);
      b.label.text = L.labels[i];
    });
  }

  // ---- state
  let alive = true;
  let lang: VoiceLang = ctx.voice.lang();
  let pendingLang: VoiceLang = lang;
  let score = 0;
  let trials = 0;
  let correct = 0;
  let nogoN = 0;
  let nogoOk = 0;
  let rtSum = 0;
  let rtN = 0;
  let accepting = false;
  let cmd: Cmd | null = null;
  let progress = 0;
  let windowStart = 0;
  let windowMs = 1;
  let timerK = -1; // remaining 0..1 (−1 = hidden)
  let resolveOutcome: ((o: Outcome) => void) | null = null;
  let talking = false;
  let faceState: Face = 'idle';
  let faceUntil = 0;
  let stopAmbient: (() => void) | null = null;

  const showText = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';

  function setBubble(text: string, dark = true) {
    bubbleText.text = text;
    bubbleText.style.fill = dark ? '#1a1540' : '#ffffff';
    const w = Math.min(safe.w - 36, Math.max(120, bubbleText.width + 40));
    const h = Math.max(52, bubbleText.height + 24);
    bubbleBg.clear();
    const hc = ctx.settings.highContrast;
    const fill = dark ? (hc ? 0xffffff : 0xfff6dc) : 0x2a2560;
    bubbleBg.poly([-11, -h / 2 + 1, 11, -h / 2 + 1, 0, -h / 2 - 12]).fill({ color: fill, alpha: 0.97 });
    bubbleBg.roundRect(-w / 2, -h / 2, w, h, 24).fill({ color: fill, alpha: 0.97 });
    if (hc) bubbleBg.roundRect(-w / 2, -h / 2, w, h, 24).stroke({ width: 3, color: 0x000000 });
    bubble.position.set(lx, bubbleY + h / 2 - 26);
    if (bubble.alpha < 1) {
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 220, (k) => {
        bubble.alpha = k;
        bubble.scale.set(0.85 + 0.15 * k);
      }, easeOutBack);
    }
  }

  function hideBubble() {
    const from = bubble.alpha;
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 200, (k) => (bubble.alpha = from * (1 - k)));
  }

  function setFace(f: Face, ms = 900) {
    faceState = f;
    faceUntil = ctx.time() + ms;
  }

  function actionName(a: Action): string {
    const P = PACK[lang];
    return a < 4 ? P.tap(P.shapes[a]) : P.swipe[a - 4];
  }

  function makeCmd(L: number): Cmd {
    const P = PACK[lang];
    const nogoP = 0.2 + (L - 1) * 0.04;
    const randAction = (): Action => (rng.chance(L >= 2 ? 0.35 : 0.25) ? 4 + rng.int(0, 3) : rng.int(0, 3));
    if (rng.chance(nogoP)) {
      const a = randAction();
      const tricky = L >= 4 && rng.chance(0.5);
      if (tricky && rng.chance(0.5) && a < 4) return { text: `${P.says} ${P.dont(P.shapes[a])}`, go: false, seq: [], kind: 'dont' };
      if (tricky) return { text: `${P.said} ${actionName(a)}`, go: false, seq: [], kind: 'said' };
      const t = actionName(a);
      return { text: t.charAt(0).toUpperCase() + t.slice(1), go: false, seq: [], kind: 'plain' };
    }
    if (L >= 3 && rng.chance(0.3)) {
      const a = rng.int(0, 3);
      let b = rng.int(0, 3);
      if (b === a) b = (a + 1 + rng.int(0, 2)) % 4;
      return { text: `${P.says} ${P.then(P.shapes[a], P.shapes[b])}`, go: true, seq: [a, b], kind: 'compound' };
    }
    const a = randAction();
    return { text: `${P.says} ${actionName(a)}`, go: true, seq: [a], kind: 'go' };
  }

  // ---- input
  function pressFx(a: Action) {
    if (a < 4) {
      btns[a].press = 1;
      ctx.audio.tick();
    } else {
      const d = a - 4;
      const arrow = new Text({ text: ARROWS[d], style: { fontFamily: FONT, fontSize: 90, fontWeight: '900', fill: pal.highlight } });
      arrow.anchor.set(0.5);
      const cx = lx;
      const cy = safe.y + safe.h * 0.64;
      arrow.position.set(cx, cy);
      fx.addChild(arrow);
      ctx.audio.noise({ gain: 0.08, dur: 0.25, filter: 1400, sweepTo: 3200 });
      void tween(ctx, ctx.settings.reducedMotion ? 300 : 520, (k) => {
        arrow.alpha = 1 - k;
        arrow.position.set(cx + SWIPE_VEC[d][0] * 120 * k, cy + SWIPE_VEC[d][1] * 120 * k);
      }).then(() => arrow.destroy());
    }
  }

  function act(a: Action) {
    if (!alive) return;
    pressFx(a);
    if (!accepting || !cmd) return;
    const rt = ctx.time() - windowStart;
    if (!cmd.go) return finish('commission');
    if (a === cmd.seq[progress]) {
      progress++;
      const pos = a < 4 ? btns[a].c.position : { x: lx, y: safe.y + safe.h * 0.64 };
      particles.burst(pos.x, pos.y, 16, { color: a < 4 ? SHAPE_COLORS[a] : hex(pal.highlight), speed: 170, life: 0.6 });
      ctx.audio.pluck(note(progress + 1), { gain: 0.18 });
      if (a < 4) btns[a].glow = 1;
      if (progress >= cmd.seq.length) {
        rtSum += rt;
        rtN++;
        finish('hit');
      }
    } else finish('wrong');
  }

  function finish(o: Outcome) {
    if (!accepting) return;
    accepting = false;
    resolveOutcome?.(o);
  }

  const canvas = app.canvas as HTMLCanvasElement;
  let down: { x: number; y: number; id: number } | null = null;
  const toLocal = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const btnAt = (x: number, y: number) => btns.findIndex((b) => Math.abs(x - b.c.x) <= b.w / 2 && Math.abs(y - b.c.y) <= b.h / 2);
  if (!preview) {
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (ctx.isPaused()) return;
        const p = toLocal(e);
        down = { ...p, id: e.pointerId };
        const i = btnAt(p.x, p.y);
        if (i >= 0) btns[i].press = 0.6;
      },
      { signal: ctx.signal },
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        if (!down || down.id !== e.pointerId || ctx.isPaused()) return;
        const p = toLocal(e);
        const dx = p.x - down.x;
        const dy = p.y - down.y;
        const start = down;
        down = null;
        if (Math.hypot(dx, dy) > 42) {
          const a: Action = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 7 : 6) : dy > 0 ? 5 : 4;
          act(a);
          return;
        }
        const i = btnAt(start.x, start.y);
        if (i >= 0) act(i);
      },
      { signal: ctx.signal },
    );
    canvas.addEventListener('pointercancel', () => (down = null), { signal: ctx.signal });
  }

  ctx.keys({
    Digit1: () => act(0),
    Digit2: () => act(1),
    Digit3: () => act(2),
    Digit4: () => act(3),
    Numpad1: () => act(0),
    Numpad2: () => act(1),
    Numpad3: () => act(2),
    Numpad4: () => act(3),
    ArrowUp: () => act(4),
    ArrowDown: () => act(5),
    ArrowLeft: () => act(6),
    ArrowRight: () => act(7),
  });

  // ---- ghost (preview)
  async function ghostTap(a: Action) {
    finger.alpha = 0;
    if (a < 4) {
      const b = btns[a];
      finger.position.set(b.c.x + 40, b.c.y + 60);
      await tween(ctx, 320, (k) => {
        finger.alpha = k;
        finger.position.set(b.c.x + 40 * (1 - k), b.c.y + 60 * (1 - k));
      }, easeOutCubic);
      act(a);
      await tween(ctx, 260, (k) => (finger.alpha = 1 - k));
    } else {
      const [vx, vy] = SWIPE_VEC[a - 4];
      const cx = lx - vx * 70;
      const cy = safe.y + safe.h * 0.64 - vy * 70;
      await tween(ctx, 380, (k) => {
        finger.alpha = Math.min(1, k * 3);
        finger.position.set(cx + vx * 140 * k, cy + vy * 140 * k);
      }, easeOutCubic);
      act(a);
      await tween(ctx, 240, (k) => (finger.alpha = 1 - k));
    }
  }

  async function ghost(c: Cmd) {
    await ctx.wait(550 + rng.next() * 450);
    if (!accepting || !alive) return;
    if (!c.go) {
      if (rng.chance(0.12)) await ghostTap(rng.int(0, 3));
      return;
    }
    for (const a of c.seq) {
      if (!accepting || !alive) return;
      const slip = rng.chance(0.06);
      await ghostTap(slip ? (a < 4 ? (a + 1) % 4 : 4 + ((a - 3) % 4)) : a);
      await ctx.wait(120);
    }
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, progress: trials / TRIALS });
  }

  async function trial() {
    const L = stair.level;
    cmd = makeCmd(L);
    const c = cmd;
    progress = 0;
    status.text = PACK[lang].ui.listen;
    setBubble(showText() ? `“${c.text}”` : '• • •');
    talking = true;
    const t0 = ctx.time();
    await Promise.race([ctx.voice.speak(c.text, { lang }), ctx.wait(4500)]);
    // preview has no audio: let Luna "talk" long enough for the bubble to read in the feed
    if (preview) await ctx.wait(700 + [...c.text].length * 28);
    talking = false;
    if (!alive) return;
    const spent = ctx.time() - t0;
    const tm = ctx.settings.timingMultiplier;
    let base = ctx.settings.noTimePressure ? 5000 : Math.max(1500, 2600 - (L - 1) * 150);
    if (c.kind === 'compound') base += 1400;
    // no real audio played (captions only): give reading time inside the window
    if (spent < 350 && showText() && !preview) base += Math.min(1600, [...c.text].length * 32);
    windowMs = base * (preview ? 1 : tm);
    windowStart = ctx.time();
    status.text = PACK[lang].ui.go;
    timerK = 1;
    accepting = true;
    const out = new Promise<Outcome>((res) => {
      resolveOutcome = (o) => {
        resolveOutcome = null;
        res(o);
      };
    });
    const cancelTimer = ctx.after(windowMs, () => finish(c.go ? 'miss' : 'withhold'));
    if (preview) void ghost(c);
    const o = await out;
    cancelTimer();
    timerK = -1;
    if (!alive) return;
    const P = PACK[lang].ui;
    trials++;
    const ok = o === 'hit' || o === 'withhold';
    if (!c.go) {
      nogoN++;
      if (ok) nogoOk++;
    }
    ctx.trial({ correct: ok, rtMs: o === 'hit' ? ctx.time() - windowStart : undefined, level: L });
    if (ok) {
      correct++;
      const speed = o === 'hit' ? clamp(1 - (ctx.time() - windowStart) / windowMs, 0, 1) : 0;
      score += o === 'withhold' ? 15 : 10 + Math.round(speed * 5) + (c.kind === 'compound' ? 10 : 0);
      setFace(o === 'withhold' ? 'wink' : 'happy');
      showFb(`✓  ${o === 'withhold' ? P.held : P.nice}`);
      ctx.audio.success();
      ctx.haptics.success();
      if (o === 'withhold') particles.burst(lx, ly, 36, { color: hex(pal.accent), speed: 200, life: 0.9 });
    } else {
      setFace('oops', 1200);
      showFb(`✗  ${o === 'commission' ? P.oops : o === 'miss' ? P.late : P.wrong}`);
      if (!showText()) setBubble(`“${c.text}”`);
      ctx.audio.thunk({ gain: 0.2 });
      ctx.haptics.error();
      if (!showText()) ctx.caption(`Luna said: “${c.text}”`);
    }
    stair.record(ok);
    if (preview && stair.level > 4) stair.set(3);
    hud();
    await ctx.wait((ok ? 800 : 1400) * (preview ? 1.2 : tm));
    hideBubble();
    fb.text = '';
    await ctx.wait(350);
  }

  function showFb(text: string) {
    status.text = '';
    fb.text = text;
    fb.scale.set(0.7);
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 320, (k) => fb.scale.set(0.7 + 0.3 * k), easeOutBack);
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([55, 62, 67, 74], { gain: 0.028, brightness: 0.3 });
    hint.text = PACK[lang].ui.swipeHint;
    setBubble(PACK[lang].ui.first);
    status.text = '';
    await ctx.wait(preview ? 1000 : 2000);
    hideBubble();
    await ctx.wait(300);
    while (alive) {
      lang = pendingLang;
      hint.text = PACK[lang].ui.swipeHint;
      drawButtons();
      hud();
      const next = makeCmdPreview();
      ctx.voice.prefetch(next, { lang });
      await trial();
      if (!alive) return;
      if (!preview && trials >= TRIALS) {
        await ctx.wait(400);
        ctx.end({
          score,
          levelReached: stair.level,
          stats: {
            withholds: nogoN ? Math.round((nogoOk / nogoN) * 100) : 100,
            accuracy: trials ? Math.round((correct / trials) * 100) : 0,
            rt: rtN ? Math.round(rtSum / rtN) : 0,
          },
          message: nogoOk >= nogoN - 1 ? 'Steady as moonlight: you held when it mattered.' : 'Listening for “Luna says” gets easier every round.',
        });
        return;
      }
    }
  }

  /** A few likely phrases to warm the TTS cache. */
  function makeCmdPreview(): string[] {
    const P = PACK[lang];
    const a = rng.int(0, 3);
    return [`${P.says} ${P.tap(P.shapes[a])}`, `${P.says} ${P.swipe[rng.int(0, 3)]}`];
  }

  createLangToggle(ctx, (l) => {
    pendingLang = l;
    ctx.caption(l === 'hi-IN' ? 'Luna will speak Hindi from the next command' : 'Luna will speak English from the next command');
  });

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    const hc = ctx.settings.highContrast;
    if (faceState !== 'idle' && ctx.time() > faceUntil) faceState = 'idle';
    const bob = reduced ? 0 : Math.sin(t * 1.2) * 4;
    moon.y = face.y = bob;
    halo.y = bob;
    halo.alpha = 0.35 + (talking ? 0.25 + Math.sin(t * 9) * 0.1 : 0) + (faceState === 'happy' || faceState === 'wink' ? 0.25 : 0);
    // face
    face.clear();
    const ink = hc ? 0x000000 : 0x3b2f5c;
    const ex = LR * 0.32;
    const ey = -LR * 0.08;
    const blink = !reduced && t % 4 < 0.12;
    if (faceState === 'happy') {
      face.moveTo(-ex - LR * 0.1, ey + 4).arc(-ex, ey + 4, LR * 0.1, Math.PI, 0).stroke({ width: 4, color: ink, cap: 'round' });
      face.moveTo(ex - LR * 0.1, ey + 4).arc(ex, ey + 4, LR * 0.1, Math.PI, 0).stroke({ width: 4, color: ink, cap: 'round' });
    } else if (faceState === 'wink') {
      face.circle(-ex, ey, LR * 0.075).fill({ color: ink });
      face.moveTo(ex - LR * 0.1, ey).lineTo(ex + LR * 0.1, ey).stroke({ width: 4, color: ink, cap: 'round' });
    } else if (blink) {
      face.moveTo(-ex - LR * 0.08, ey).lineTo(-ex + LR * 0.08, ey).moveTo(ex - LR * 0.08, ey).lineTo(ex + LR * 0.08, ey).stroke({ width: 4, color: ink, cap: 'round' });
    } else {
      face.circle(-ex, ey, LR * 0.075).fill({ color: ink });
      face.circle(ex, ey, LR * 0.075).fill({ color: ink });
      face.circle(-ex + 2, ey - 3, LR * 0.025).fill({ color: 0xffffff });
      face.circle(ex + 2, ey - 3, LR * 0.025).fill({ color: 0xffffff });
    }
    if (!hc) {
      face.circle(-ex - LR * 0.12, ey + LR * 0.22, LR * 0.1).fill({ color: 0xff9fb0, alpha: 0.45 });
      face.circle(ex + LR * 0.12, ey + LR * 0.22, LR * 0.1).fill({ color: 0xff9fb0, alpha: 0.45 });
    }
    const my = LR * 0.3;
    if (talking) {
      const open = reduced ? 0.5 : 0.35 + 0.65 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3));
      face.ellipse(0, my, LR * 0.14, LR * 0.04 + LR * 0.12 * open).fill({ color: ink });
    } else if (faceState === 'oops') {
      face.circle(0, my + 2, LR * 0.07).stroke({ width: 4, color: ink });
    } else {
      const big = faceState === 'happy' || faceState === 'wink' ? 1.4 : 1;
      const r = LR * 0.16 * big;
      const cy = my - LR * 0.08 * big;
      face.moveTo(Math.cos(0.25 * Math.PI) * r, cy + Math.sin(0.25 * Math.PI) * r).arc(0, cy, r, 0.25 * Math.PI, 0.75 * Math.PI).stroke({ width: 4, color: ink, cap: 'round' });
    }
    // response window ring
    timerRing.clear();
    if (timerK >= 0 && accepting) {
      timerK = clamp(1 - (ctx.time() - windowStart) / windowMs, 0, 1);
      timerRing.circle(0, bob, LR + 12).stroke({ width: 5, color: 0xffffff, alpha: 0.12 });
      timerRing.moveTo(0, bob - LR - 12).arc(0, bob, LR + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timerK).stroke({ width: 5, color: hex(pal.accent), alpha: 0.9, cap: 'round' });
    }
    // buttons: press + glow
    btns.forEach((b, i) => {
      b.press = Math.max(0, b.press - dt / 220);
      b.glow = Math.max(0, b.glow - dt / 500);
      if (b.tile.visible) {
        // soft: the pad sinks while pressed and lights a rim in its shape's color on a correct tap (cached textures)
        const st = b.press > 0.2 ? 1 : b.glow > 0.15 ? 2 : 0;
        if (st !== b.tileState) {
          b.tileState = st;
          b.tile.texture = softTileTexture(softOpts(b, i, st));
        }
      }
      b.c.scale.set(1 - b.press * 0.06 + b.glow * 0.04);
      b.shape.rotation = reduced ? 0 : Math.sin(t * 1.5 + b.c.x) * 0.04;
    });
    if (!reduced) moteSprites.forEach((m, i) => (m.y -= (0.08 + (i % 5) * 0.035) * (dt / 16)) && m.y < -10 && (m.y = H + 10));
    status.alpha = clamp(0.75 + Math.sin(t * 2) * 0.25, 0, 1);
    const ls = /[ऀ-ॿ]/.test(status.text) ? 0 : 2;
    if (status.style.letterSpacing !== ls) status.style.letterSpacing = ls;
  });

  layout();
  ctx.onResize(layout);

  return {
    start() {
      void run();
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      ctx.voice.stop();
    },
  };
}
