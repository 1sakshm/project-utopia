import { Container, Graphics, Sprite, Text, type TextStyleOptions } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, hex, mixHex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { createLangToggle } from '@/sdk/voiceui';
import { WORDS } from './content';

const FONT = '"Geist Variable", "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const TRIALS = 10;

interface Tile {
  c: Container;
  bg: Graphics;
  face: Sprite;
  label: Text;
  key: Text;
  badge: Text;
  word: string;
  w: number;
  h: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 7, up: 1, down: 1 });
  if (preview) stair.set(2);
  const note = ctx.audio.scale(64, 'majorPenta');

  // ---- scene
  // Soft (neumorphism): tiles are extruded from one calm surface color; the background settles onto it.
  const surf = mixHex(pal.bg, pal.bg2, 0.55);
  const res = ctx.quality.maxDpr;
  const auroraBg = gradientTexture([
    [0, '#050b18'],
    [0.5, '#0d2238'],
    [1, '#0a1628'],
  ]);
  const softBg = gradientTexture([
    [0, mixHex(surf, '#000000', 0.3)],
    [0.42, surf],
    [1, surf],
  ]);
  const bg = new Sprite(ctx.settings.soft ? softBg : auroraBg);
  /** Inset well the orb sits in (soft only). */
  const well = new Sprite();
  well.anchor.set(0.5);
  function setSoftSprite(sp: Sprite, o: SoftTileOptions) {
    const pad = softTilePad(o);
    sp.texture = softTileTexture({ ...o, resolution: res });
    sp.width = o.width + pad * 2;
    sp.height = o.height + pad * 2;
  }
  const motes = new Container();
  const orbLayer = new Container();
  const tileLayer = new Container();
  const fx = new Container();
  app.stage.addChild(bg, motes, orbLayer, tileLayer, fx);
  const particles = createParticles(ctx, fx, 220);

  const halo = new Sprite(glowTexture(256, 0.22));
  halo.anchor.set(0.5);
  halo.tint = hex(pal.accent);
  const core = new Graphics();
  const rings = new Graphics();
  const caption = new Text({ text: '', style: { fontFamily: FONT, fontSize: 30, fontWeight: '800', fill: '#ffffff', align: 'center' } });
  caption.anchor.set(0.5);
  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  orbLayer.addChild(well, halo, rings, core, caption, status);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(36 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? hex(pal.accent) : hex(pal.accent2);
    s.alpha = 0.25 + rng.next() * 0.4;
    s.scale.set(0.2 + rng.next() * 0.35);
    motes.addChild(s);
    moteSprites.push(s);
  }

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let orbX = 0;
  let orbY = 0;
  let orbR = 60;
  let pulse = 0;
  const ripples: number[] = [];
  let tiles: Tile[] = [];

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    orbR = Math.min(safe.w * 0.16, 80);
    orbX = safe.x + safe.w / 2;
    orbY = safe.y + safe.h * 0.27;
    halo.position.set(orbX, orbY);
    well.position.set(orbX, orbY);
    applyLook();
    core.position.set(orbX, orbY);
    rings.position.set(orbX, orbY);
    caption.position.set(orbX, orbY + orbR + 38);
    status.position.set(orbX, orbY - orbR - 46);
    moteSprites.forEach((m, i) => m.position.set(((i * 7919) % 1000) / 1000 * W, ((i * 104729) % 1000) / 1000 * H));
    layoutTiles();
  }

  function applyLook() {
    const soft = ctx.settings.soft;
    bg.texture = soft ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    well.visible = soft;
    if (soft) {
      const d = Math.round(orbR * 2 + 56);
      setSoftSprite(well, { width: d, height: d, radius: d / 2, base: surf, pressed: true, depth: 7 });
    }
    moteSprites.forEach((m) => (m.visible = true));
    // calmer field in soft: every other mote
    if (soft) moteSprites.forEach((m, i) => (m.visible = i % 2 === 0));
  }

  function drawCore() {
    core.clear();
    const hc = ctx.settings.highContrast;
    core.circle(0, 0, orbR).fill({ color: hc ? 0xffffff : hex(pal.accent), alpha: hc ? 1 : 0.9 });
    core.circle(-orbR * 0.28, -orbR * 0.3, orbR * 0.32).fill({ color: 0xffffff, alpha: hc ? 0 : 0.55 });
  }

  // ---- tiles
  function makeTile(word: string, i: number): Tile {
    const c = new Container();
    const bgG = new Graphics();
    const face = new Sprite();
    face.anchor.set(0.5);
    const style: TextStyleOptions = { fontFamily: FONT, fontSize: 22, fontWeight: '800', fill: '#ffffff', align: 'center' };
    const label = new Text({ text: word, style });
    label.anchor.set(0.5);
    const key = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 13, fontWeight: '800', fill: 'rgba(255,255,255,0.55)' } });
    const badge = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fontWeight: '900', fill: '#0b0d14' } });
    badge.anchor.set(0.5);
    c.addChild(face, bgG, label, key, badge);
    c.eventMode = preview ? 'none' : 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => tap(i));
    tileLayer.addChild(c);
    return { c, bg: bgG, face, label, key, badge, word, w: 0, h: 0 };
  }

  function drawTile(t: Tile, state: 'idle' | 'on' | 'wrong' | 'hint') {
    const hc = ctx.settings.highContrast;
    t.bg.clear();
    t.face.visible = ctx.settings.soft;
    if (ctx.settings.soft) {
      // Raised when idle, pressed in once tapped; the rim + numbered badge carry correct / wrong / hint.
      const rim = state === 'on' ? pal.accent : state === 'wrong' ? '#ff9fb8' : state === 'hint' ? pal.accent2 : undefined;
      setSoftSprite(t.face, { width: Math.round(t.w), height: Math.round(t.h), radius: 20, base: surf, pressed: state === 'on' || state === 'wrong', rim, rimWidth: 2.5, depth: 6 });
      t.label.style.fill = state === 'on' ? pal.accent : state === 'hint' ? pal.accent2 : state === 'wrong' ? '#ffc2d2' : '#ffffff';
      t.badge.style.fill = state === 'hint' ? pal.accent2 : state === 'wrong' ? '#ffc2d2' : pal.accent;
      return;
    }
    t.badge.style.fill = '#0b0d14';
    const fill = state === 'on' ? hex(pal.accent) : state === 'wrong' ? 0x3a2233 : state === 'hint' ? hex(pal.accent2) : hc ? 0x000000 : 0x14304a;
    t.bg.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, 20).fill({ color: fill, alpha: state === 'idle' ? 0.82 : 0.95 });
    t.bg.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, 20).stroke({ width: hc ? 3 : 1.5, color: state === 'wrong' ? 0xff9fb8 : 0xffffff, alpha: hc ? 1 : 0.28 });
    t.label.style.fill = state === 'on' || state === 'hint' ? '#0b0d14' : '#ffffff';
  }

  function layoutTiles() {
    if (!tiles.length) return;
    const cols = 3;
    const rows = Math.ceil(tiles.length / cols);
    const gap = 12;
    const areaTop = safe.y + safe.h * 0.47;
    const areaH = safe.h * 0.36;
    const tw = (safe.w - 36 - gap * (cols - 1)) / cols;
    const th = Math.min(92, (areaH - gap * (rows - 1)) / rows);
    tiles.forEach((t, i) => {
      t.w = tw;
      t.h = th;
      const col = i % cols;
      const row = Math.floor(i / cols);
      t.c.position.set(safe.x + 18 + tw / 2 + col * (tw + gap), areaTop + th / 2 + row * (th + gap));
      t.label.style.fontSize = Math.max(15, Math.min(22 * ctx.settings.textScale, tw / Math.max(4, [...t.word].length) * 1.5));
      t.key.position.set(-tw / 2 + 10, -th / 2 + 6);
      t.key.visible = ctx.settings.showKeyHints;
      t.badge.position.set(tw / 2 - 16, -th / 2 + 16);
      drawTile(t, 'idle');
    });
  }

  function setTiles(words: string[]) {
    tiles.forEach((t) => t.c.destroy({ children: true }));
    tiles = words.map((w, i) => makeTile(w, i));
    layoutTiles();
    tiles.forEach((t, i) => {
      t.c.alpha = 0;
      t.c.scale.set(0.85);
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 260 + i * 40, (k) => {
        t.c.alpha = k;
        t.c.scale.set(0.85 + 0.15 * k);
      }, easeOutBack);
    });
  }

  // ---- state
  let alive = true;
  let score = 0;
  let trials = 0;
  let lives = 3;
  let taps = 0;
  let correct = 0;
  let longest = 0;
  let longestRev = 0;
  let accepting = false;
  let expected: number[] = [];
  let progress = 0;
  let resolveInput: ((ok: boolean) => void) | null = null;
  let seqWords: string[] = [];
  let replayed = false;
  let reverse = false;
  let lang: VoiceLang = ctx.voice.lang();
  let stopAmbient: (() => void) | null = null;

  const showWords = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';

  async function sayWord(word: string, stepMs: number) {
    pulse = 1;
    ripples.push(0);
    ctx.audio.chime(note(rng.int(0, 4)), { gain: 0.035, dur: 0.6 });
    caption.text = showWords() ? word : '';
    const t0 = ctx.time();
    await Promise.race([ctx.voice.speak(word, { lang }), ctx.wait(2600)]);
    const spent = ctx.time() - t0;
    await ctx.wait(Math.max(160, stepMs - spent) * ctx.settings.timingMultiplier);
    caption.text = '';
  }

  async function present() {
    accepting = false;
    setReplay(false);
    status.text = reverse ? '↺  LISTEN, THEN TAP BACKWARDS' : 'LISTEN';
    for (const w of seqWords) {
      if (!alive) return;
      await sayWord(w, 900 - stair.level * 30);
    }
  }

  function tap(i: number) {
    if (!accepting || i >= tiles.length) return;
    const want = expected[progress];
    const t = tiles[i];
    taps++;
    ripples.push(0);
    if (i === want) {
      correct++;
      progress++;
      t.badge.text = String(progress);
      drawTile(t, 'on');
      ctx.audio.pluck(note(progress), { gain: 0.18 });
      ctx.haptics.tick();
      particles.burst(t.c.x, t.c.y, 10, { color: hex(pal.accent), speed: 140, life: 0.5 });
      if (progress >= expected.length) {
        accepting = false;
        resolveInput?.(true);
      }
    } else {
      accepting = false;
      drawTile(t, 'wrong');
      ctx.audio.thunk({ gain: 0.22 });
      ctx.haptics.error();
      ctx.caption('Not that one');
      // show the correct remaining order
      expected.slice(progress).forEach((idx, k) => {
        ctx.after(250 + k * 220, () => {
          drawTile(tiles[idx], 'hint');
          tiles[idx].badge.text = String(progress + k + 1);
        });
      });
      resolveInput?.(false);
    }
  }

  function waitInput(): Promise<boolean> {
    progress = 0;
    accepting = true;
    status.text = reverse ? '↺  TAP THEM BACKWARDS' : 'YOUR TURN';
    ctx.announce(`Your turn: ${expected.length} words${reverse ? ', backwards' : ''}`);
    setReplay(!preview && !replayed);
    return new Promise((res) => {
      resolveInput = (ok) => {
        resolveInput = null;
        setReplay(false);
        res(ok);
      };
    });
  }

  async function ghost() {
    for (let k = 0; k < expected.length; k++) {
      await ctx.wait(420 + rng.next() * 300);
      if (!accepting) return;
      tap(rng.chance(0.07) ? (expected[progress] + 1) % tiles.length : expected[progress]);
    }
  }

  async function replay() {
    if (!accepting || replayed) return;
    replayed = true;
    accepting = false;
    tiles.forEach((t) => {
      t.badge.text = '';
      drawTile(t, 'idle');
    });
    await present();
    progress = 0;
    accepting = true;
    status.text = reverse ? '↺  TAP THEM BACKWARDS' : 'YOUR TURN';
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, lives, maxLives: 3, progress: trials / TRIALS, label: reverse ? '↺ Backwards' : undefined });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([52, 59, 64, 71], { gain: 0.035, brightness: 0.3 });
    await ctx.wait(400);
    while (alive) {
      const L = stair.level;
      const len = Math.min(8, L + 2);
      const tileCount = L < 4 ? 6 : 9;
      reverse = L >= 5 && rng.chance(0.35);
      replayed = false;
      const bank = WORDS[lang];
      const pool = rng.shuffle([...bank.keys()]).slice(0, tileCount);
      const words = pool.map((i) => bank[i]);
      const seqIdx = rng.shuffle([...Array(tileCount).keys()]).slice(0, len);
      seqWords = seqIdx.map((i) => words[i]);
      expected = reverse ? [...seqIdx].reverse() : seqIdx;
      ctx.voice.prefetch(seqWords, { lang });
      setTiles(words);
      hud();
      if (reverse) ctx.caption('Backwards round');
      await ctx.wait(ctx.voice.source() === 'sarvam' ? 900 : 600);
      await present();
      if (!alive) return;
      const p = waitInput();
      if (preview) void ghost();
      const ok = await p;
      if (!alive) return;
      trials++;
      ctx.trial({ correct: ok, level: L });
      if (ok) {
        score += Math.round(len * 10 * (reverse ? 1.5 : 1) * (replayed ? 0.5 : 1));
        longest = Math.max(longest, len);
        if (reverse) longestRev = Math.max(longestRev, len);
        ctx.audio.success();
        ctx.haptics.success();
        particles.burst(orbX, orbY, 50, { color: hex(pal.highlight), speed: 260, life: 1 });
        status.text = 'BEAUTIFUL';
      } else {
        lives--;
        status.text = 'ALMOST';
      }
      stair.record(ok);
      if (preview && stair.level > 3) stair.set(2);
      hud();
      if (!preview && (lives <= 0 || trials >= TRIALS)) {
        await ctx.wait(1000);
        if (!alive) return;
        if (lives <= 0 && trials < TRIALS && (await ctx.revive())) {
          if (!alive) return;
          lives = 1;
          hud();
          status.text = 'SECOND CHANCE';
          ctx.audio.success();
          ctx.haptics.success();
          ctx.caption('Second chance!');
          ctx.announce('Second chance! One life restored');
          particles.burst(orbX, orbY, 40, { color: hex(pal.highlight), speed: 220, life: 0.9 });
          await ctx.wait(1000);
          continue;
        }
        ctx.end({
          score,
          levelReached: longest,
          stats: { longest, reverse: longestRev, accuracy: taps ? Math.round((correct / taps) * 100) : 0 },
          message: longest >= 6 ? 'A long echo, held perfectly.' : 'Your echo grows with every list.',
        });
        return;
      }
      await ctx.wait(ok ? 1000 : 1700);
    }
  }

  // ---- DOM "hear again"
  const replayBtn = document.createElement('button');
  replayBtn.className = 'u-game-btn';
  replayBtn.textContent = '↻ Hear again';
  replayBtn.style.cssText = 'position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;';
  replayBtn.onclick = () => void replay();
  if (!preview) ctx.container.appendChild(replayBtn);
  function setReplay(v: boolean) {
    replayBtn.style.display = v ? 'block' : 'none';
  }
  createLangToggle(ctx, (l) => {
    lang = l;
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next list' : 'English from the next list');
  });

  const keyMap: Record<string, () => void> = { KeyR: () => void replay() };
  for (let i = 0; i < 9; i++) {
    keyMap[`Digit${i + 1}`] = () => tap(i);
    keyMap[`Numpad${i + 1}`] = () => tap(i);
  }
  ctx.keys(keyMap);

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    pulse = Math.max(0, pulse - dt / 700);
    const breathe = reduced ? 0 : Math.sin(t * 1.4) * 0.03;
    core.scale.set(1 + breathe + pulse * 0.12);
    halo.scale.set((orbR / 64) * (1.6 + pulse * 0.8 + breathe * 3));
    halo.alpha = 0.35 + pulse * 0.45;
    rings.clear();
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i] += dt / 1100;
      const k = ripples[i];
      if (k >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      rings.circle(0, 0, orbR * (1 + k * 1.6)).stroke({ width: 3 * (1 - k), color: hex(pal.accent), alpha: 0.6 * (1 - k) });
    }
    if (!reduced) moteSprites.forEach((m, i) => (m.y -= (0.1 + (i % 5) * 0.04) * (dt / 16)) && m.y < -10 && (m.y = H + 10));
    status.alpha = clamp(0.75 + Math.sin(t * 2) * 0.25, 0, 1);
  });

  drawCore();
  layout();
  ctx.onResize(layout);

  return {
    start() {
      void run();
    },
    onSettings: () => {
      applyLook();
      drawCore();
      layoutTiles();
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      ctx.voice.stop();
      replayBtn.remove();
    },
  };
}
