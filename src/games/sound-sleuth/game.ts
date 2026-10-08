import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeInOutSine, easeOutBack, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { createLangToggle } from '@/sdk/voiceui';
import { PAIRS, UI, type Pair } from './content';

const FONT = 'Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const TRIALS = 20;

interface Shell {
  c: Container;
  halo: Sprite;
  base: Graphics;
  pearl: Graphics;
  lid: Graphics;
  num: Text;
  word: Text;
  rings: Graphics;
  ripples: number[];
  pulse: number;
  open: number;
  odd: boolean;
}

interface Btn {
  c: Container;
  bg: Graphics;
  tile: Sprite;
  glyph: Text;
  label: Text;
  key: Text;
  w: number;
  h: number;
}

interface Trial {
  words: string[];
  kind: 'pair' | 'triplet';
  /** pair: true if the two words differ. */
  different: boolean;
  /** triplet: index of the odd word. */
  odd: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 6, up: 2, down: 1 });
  if (preview) stair.set(2);
  const note = ctx.audio.scale(62, 'majorPenta');
  const ACC = hex(pal.accent);
  const SHELL = hex(pal.accent2);
  // Soft (dark neumorphism) look: a calm, near-uniform sea floor that the buttons and the shell bed are extruded from.
  const soft = () => ctx.settings.soft;
  const SB = '#0e2434';
  const sres = ctx.quality.maxDpr;
  const auroraBg = gradientTexture([
    [0, '#050d18'],
    [0.55, '#0e2a3e'],
    [1, '#0a1c2a'],
  ]);
  const softBg = gradientTexture([
    [0, '#081622'],
    [0.4, SB],
    [1, SB],
  ]);
  function setSoft(s: Sprite, o: SoftTileOptions) {
    s.texture = softTileTexture(o);
    const p = softTilePad(o);
    s.width = o.width + p * 2;
    s.height = o.height + p * 2;
  }

  // ---- scene
  const bg = new Sprite(auroraBg);
  const sand = new Graphics();
  const bed = new Sprite();
  bed.anchor.set(0.5);
  const motes = new Container();
  const shellLayer = new Container();
  const ui = new Container();
  const fx = new Container();
  app.stage.addChild(bg, sand, bed, motes, shellLayer, ui, fx);
  const particles = createParticles(ctx, fx, 200);

  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const verdict = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: 'rgba(255,255,255,0.75)', align: 'center' } });
  verdict.anchor.set(0.5);
  ui.addChild(status, verdict);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(34 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? ACC : SHELL;
    s.alpha = 0.18 + rng.next() * 0.35;
    s.scale.set(0.16 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let shells: Shell[] = [];
  let shellR = 60;
  let shellY = 0;
  let btns: Btn[] = [];
  let lang: VoiceLang = ctx.voice.lang();

  // ---- shell drawing (a scallop lid over a shallow bowl, hinge at the origin)
  function drawShell(s: Shell) {
    const R = shellR;
    const hc = ctx.settings.highContrast;
    const edge = hc ? 0xffffff : 0xffe3d8;
    const lid = s.lid;
    lid.clear();
    const pts: number[] = [];
    const ribs = 9;
    const a0 = Math.PI * 1.08;
    const a1 = Math.PI * 1.92;
    for (let i = 0; i <= 72; i++) {
      const a = a0 + ((a1 - a0) * i) / 72;
      const u = ((a - a0) / (a1 - a0)) * ribs;
      const r = R * (0.93 + 0.07 * Math.abs(Math.sin(u * Math.PI)));
      pts.push(Math.cos(a) * r, Math.sin(a) * r * 0.92);
    }
    pts.push(R * 0.16, 0, -R * 0.16, 0);
    lid.poly(pts).fill({ color: SHELL, alpha: 1 });
    if (hc) lid.poly(pts).stroke({ width: 3, color: 0xffffff });
    for (let i = 1; i < ribs; i++) {
      const a = a0 + ((a1 - a0) * i) / ribs;
      lid.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.18).lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.83)
        .stroke({ width: Math.max(1.5, R * 0.035), color: 0xe08a7a, alpha: 0.75, cap: 'round' });
    }
    lid.ellipse(-R * 0.28, -R * 0.55, R * 0.16, R * 0.08).fill({ color: 0xffffff, alpha: hc ? 0 : 0.35 });
    // hinge "ears"
    lid.poly([-R * 0.3, 0, -R * 0.2, -R * 0.2, R * 0.2, -R * 0.2, R * 0.3, 0]).fill({ color: 0xf2a292 });
    const base = s.base;
    base.clear();
    const bp: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI;
      bp.push(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.34);
    }
    base.poly(bp).fill({ color: 0xe8958a });
    base.moveTo(-R * 0.94, 0).lineTo(R * 0.94, 0).stroke({ width: 2, color: edge, alpha: 0.7 });
    const pearl = s.pearl;
    pearl.clear();
    pearl.circle(0, -R * 0.14, R * 0.2).fill({ color: 0xfff6ec });
    pearl.circle(-R * 0.06, -R * 0.2, R * 0.07).fill({ color: 0xffffff });
    s.halo.scale.set((R * 3.4) / 128);
    s.num.position.set(0, R * 0.34 + 18);
    s.word.position.set(0, R * 0.34 + 50);
    applyOpen(s);
  }

  function applyOpen(s: Shell) {
    const k = s.open;
    s.lid.y = -k * shellR * 0.5;
    s.lid.scale.y = 1 - k * 0.45;
    s.pearl.alpha = k;
    s.pearl.scale.set(0.6 + 0.4 * k);
  }

  function makeShell(i: number): Shell {
    const c = new Container();
    const halo = new Sprite(glowTexture(128, 0.25));
    halo.anchor.set(0.5);
    halo.tint = ACC;
    halo.blendMode = 'add';
    halo.alpha = 0.15;
    const rings = new Graphics();
    const base = new Graphics();
    const pearl = new Graphics();
    const lid = new Graphics();
    const num = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 15, fontWeight: '900', fill: 'rgba(255,255,255,0.6)' } });
    num.anchor.set(0.5);
    const word = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fontWeight: '800', fill: '#ffffff', align: 'center' } });
    word.anchor.set(0.5);
    c.addChild(halo, rings, base, pearl, lid, num, word);
    c.eventMode = preview ? 'none' : 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      if (kind === 'triplet') answer(i);
    });
    shellLayer.addChild(c);
    return { c, halo, base, pearl, lid, num, word, rings, ripples: [], pulse: 0, open: 0, odd: false };
  }

  function setShells(n: number) {
    shells.forEach((s) => s.c.destroy({ children: true }));
    shells = [];
    for (let i = 0; i < n; i++) shells.push(makeShell(i));
    layoutShells();
    const reduced = ctx.settings.reducedMotion;
    shells.forEach((s, i) => {
      s.c.alpha = 0;
      ctx.after(reduced ? 0 : i * 70, () =>
        void tween(ctx, reduced ? 1 : 320, (k) => {
          s.c.alpha = k;
          s.c.scale.set(reduced ? 1 : 0.85 + 0.15 * k);
        }, easeOutBack),
      );
    });
  }

  function layoutShells() {
    const n = shells.length;
    if (!n) return;
    shellR = Math.min(n === 2 ? 72 : 54, (safe.w - 40) / (n * 2.3));
    const span = safe.w - 40;
    shells.forEach((s, i) => {
      s.c.position.set(safe.x + 20 + (span / n) * (i + 0.5), shellY);
      s.word.style.fontSize = Math.min(28, shellR * 0.46) * ctx.settings.textScale;
      drawShell(s);
    });
  }

  // ---- answer buttons
  function makeBtn(glyph: string, label: string, key: string, onTap: () => void): Btn {
    const c = new Container();
    const bgG = new Graphics();
    const tile = new Sprite();
    tile.anchor.set(0.5);
    const g = new Text({ text: glyph, style: { fontFamily: FONT, fontSize: 30, fontWeight: '900', fill: '#ffffff' } });
    g.anchor.set(0.5);
    const l = new Text({ text: label, style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: '#ffffff' } });
    l.anchor.set(0.5);
    const k = new Text({ text: key, style: { fontFamily: FONT, fontSize: 11, fontWeight: '800', fill: 'rgba(255,255,255,0.5)' } });
    k.anchor.set(0.5);
    c.addChild(tile, bgG, g, l, k);
    c.eventMode = preview ? 'none' : 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onTap);
    ui.addChild(c);
    return { c, bg: bgG, tile, glyph: g, label: l, key: k, w: 0, h: 0 };
  }

  function drawBtn(b: Btn, state: 'idle' | 'off' | 'ok' | 'wrong' | 'answer') {
    const hc = ctx.settings.highContrast;
    const g = b.bg;
    g.clear();
    b.tile.visible = soft();
    if (soft()) {
      // chosen answers sink in (pressed); the colored rim keeps the right / wrong meaning, the glyph stays on top
      const pressed = state === 'ok' || state === 'wrong';
      const rim = state === 'ok' || state === 'answer' ? pal.accent : state === 'wrong' ? '#ff9fb8' : undefined;
      setSoft(b.tile, { width: b.w, height: b.h, base: SB, radius: 24, pressed, rim, rimWidth: 3, depth: 7, resolution: sres });
      b.c.alpha = state === 'off' ? 0.6 : 1;
      return;
    }
    const fill = hc ? 0x000000 : state === 'ok' ? 0x1d4a48 : state === 'wrong' ? 0x3a2233 : 0x133148;
    g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 24).fill({ color: fill, alpha: hc ? 1 : 0.85 });
    if (!hc) g.moveTo(-b.w / 2 + 22, -b.h / 2 + 2.5).lineTo(b.w / 2 - 22, -b.h / 2 + 2.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.2 });
    const edge = state === 'ok' || state === 'answer' ? ACC : state === 'wrong' ? 0xff9fb8 : 0xffffff;
    g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 24).stroke({ width: hc ? 3 : state === 'idle' || state === 'off' ? 1.5 : 3, color: edge, alpha: hc || (state !== 'idle' && state !== 'off') ? 1 : 0.3 });
    b.c.alpha = state === 'off' ? 0.55 : 1;
  }

  function setButtons(k: 'pair' | 'triplet') {
    btns.forEach((b) => b.c.destroy({ children: true }));
    const t = UI[lang];
    if (k === 'pair') {
      btns = [makeBtn('=', t.same, '← S', () => answer(false)), makeBtn('≠', t.diff, 'D →', () => answer(true))];
    } else {
      btns = [0, 1, 2].map((i) => makeBtn(String(i + 1), t.odd, String(i + 1), () => answer(i)));
    }
    layoutButtons();
  }

  function layoutButtons() {
    const n = btns.length;
    if (!n) return;
    const gap = 14;
    const bw = Math.min(n === 2 ? 170 : 110, (safe.w - 36 - gap * (n - 1)) / n);
    const bh = 96;
    const y = Math.min(safe.y + safe.h * 0.8, H - 70 - bh / 2);
    const rowW = n * bw + (n - 1) * gap;
    btns.forEach((b, i) => {
      b.w = bw;
      b.h = bh;
      b.c.position.set(safe.x + safe.w / 2 - rowW / 2 + bw / 2 + i * (bw + gap), y);
      b.glyph.position.set(0, -8);
      b.label.position.set(0, 26);
      b.label.style.fontSize = 17 * ctx.settings.textScale;
      b.key.position.set(0, -bh / 2 + 12);
      b.key.visible = ctx.settings.showKeyHints && !preview;
      drawBtn(b, accepting ? 'idle' : 'off');
    });
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.texture = soft() ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    status.position.set(safe.x + safe.w / 2, Math.max(safe.y + safe.h * 0.13, 100));
    verdict.position.set(safe.x + safe.w / 2, status.y + 30);
    shellY = safe.y + safe.h * 0.42;
    sand.clear();
    const sy = shellY + 30;
    bed.visible = soft();
    if (soft()) {
      // an inset sand bed the shells rest in, instead of the layered sand ellipses
      const bw = safe.w - 24;
      const bh = 216;
      setSoft(bed, { width: bw, height: bh, base: SB, radius: 44, pressed: true, depth: 8, resolution: sres });
      bed.position.set(safe.x + safe.w / 2, shellY + 8);
    } else {
      sand.ellipse(W / 2, sy + H * 0.5, W * 0.9, H * 0.5).fill({ color: 0x14384c, alpha: 0.35 });
      sand.ellipse(W / 2, sy + H * 0.56, W * 0.8, H * 0.5).fill({ color: 0x0f2c3d, alpha: 0.5 });
    }
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    layoutShells();
    layoutButtons();
  }

  // ---- state
  let alive = true;
  let score = 0;
  let trials = 0;
  let correct = 0;
  let streak = 0;
  let bestStreak = 0;
  let hardest = 0;
  let accepting = false;
  let kind: 'pair' | 'triplet' = 'pair';
  let resolveAnswer: ((v: boolean | number) => void) | null = null;
  let stopAmbient: (() => void) | null = null;

  const showDuring = () => preview || ctx.voice.source() === 'none';

  function answer(v: boolean | number) {
    if (!accepting) return;
    if (kind === 'pair' && typeof v !== 'boolean') return;
    if (kind === 'triplet' && typeof v !== 'number') return;
    accepting = false;
    resolveAnswer?.(v);
  }

  function makeTrial(L: number): Trial {
    const bank = PAIRS[lang];
    const tierOf = (lv: number): Pair[] =>
      lv <= 1 ? bank.easy : lv === 2 ? (rng.chance(0.5) ? bank.easy : bank.close) : lv === 3 ? bank.close : lv === 4 ? (rng.chance(0.5) ? bank.close : bank.vowel) : lv === 5 ? bank.vowel : rng.chance(0.5) ? bank.close : bank.vowel;
    const pair = rng.pick(tierOf(L));
    const [a, b] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
    if (L >= 6) {
      const odd = rng.int(0, 2);
      return { words: [0, 1, 2].map((i) => (i === odd ? b : a)), kind: 'triplet', different: true, odd };
    }
    const different = !rng.chance(0.3);
    return { words: [a, different ? b : a], kind: 'pair', different, odd: -1 };
  }

  async function playWord(s: Shell, w: string, gapMs: number) {
    s.pulse = 1;
    s.ripples.push(0);
    ctx.audio.chime(note(rng.int(2, 5)), { gain: 0.025, dur: 0.4 });
    if (showDuring()) s.word.text = w;
    await Promise.race([ctx.voice.speak(w, { lang }), ctx.wait(preview ? 650 : 2200)]);
    await ctx.wait(gapMs);
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, progress: trials / TRIALS, label: streak >= 3 ? `Streak ${streak}` : undefined });
  }

  async function openShells(tr: Trial) {
    shells.forEach((s, i) => {
      s.word.text = tr.words[i];
      s.word.style.fill = tr.kind === 'triplet' && i === tr.odd ? pal.highlight : '#ffffff';
      s.odd = tr.kind === 'triplet' && i === tr.odd;
    });
    const reduced = ctx.settings.reducedMotion;
    await tween(ctx, reduced ? 1 : 520, (k) => shells.forEach((s) => {
      s.open = k;
      applyOpen(s);
      s.word.alpha = k;
    }), easeInOutSine);
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 62, 66], { gain: 0.03, brightness: 0.28 });
    await ctx.wait(400);
    let tr = makeTrial(stair.level);
    ctx.voice.prefetch(tr.words, { lang });
    while (alive) {
      const L = stair.level;
      const t = UI[lang];
      kind = tr.kind;
      setShells(tr.words.length);
      setButtons(tr.kind);
      verdict.text = '';
      status.text = t.listen;
      hud();
      await ctx.wait((ctx.voice.source() === 'sarvam' ? 800 : 550) * ctx.settings.timingMultiplier);
      const gap = ([650, 600, 520, 450, 380, 340][L - 1] ?? 340) * ctx.settings.timingMultiplier;
      for (let i = 0; i < tr.words.length; i++) {
        if (!alive) return;
        await playWord(shells[i], tr.words[i], i < tr.words.length - 1 ? gap : 120);
      }
      if (!alive) return;

      status.text = tr.kind === 'pair' ? t.ask2 : t.ask3;
      ctx.announce(status.text);
      accepting = true;
      btns.forEach((b) => drawBtn(b, 'idle'));
      const t0 = ctx.time();
      const res = await new Promise<boolean | number>((r) => {
        resolveAnswer = (v) => {
          resolveAnswer = null;
          r(v);
        };
        if (preview) {
          ctx.after(700 + rng.next() * 500, () => {
            const wrong = rng.chance(0.12);
            if (tr.kind === 'pair') answer(wrong ? !tr.different : tr.different);
            else answer(wrong ? (tr.odd + 1) % 3 : tr.odd);
          });
        }
      });
      if (!alive) return;
      const rt = ctx.time() - t0;
      const ok = tr.kind === 'pair' ? res === tr.different : res === tr.odd;
      trials++;
      ctx.trial({ correct: ok, rtMs: Math.round(rt), level: L });

      // feedback on buttons
      const chosen = tr.kind === 'pair' ? (res ? 1 : 0) : (res as number);
      const right = tr.kind === 'pair' ? (tr.different ? 1 : 0) : tr.odd;
      btns.forEach((b, i) => drawBtn(b, i === right ? (ok ? 'ok' : 'answer') : i === chosen ? 'wrong' : 'off'));
      if (ok) {
        correct++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        hardest = Math.max(hardest, L);
        score += 10 * L + Math.min(5, streak - 1) * 3;
        ctx.audio.success();
        ctx.haptics.success();
        const b = btns[right];
        particles.burst(b.c.x, b.c.y, 24, { color: ACC, speed: 200, life: 0.7 });
      } else {
        streak = 0;
        ctx.audio.thunk({ gain: 0.18 });
        ctx.haptics.error();
      }
      const isDiff = tr.different;
      status.text = ok ? (lang === 'hi-IN' ? 'सही!' : 'SHARP EARS') : lang === 'hi-IN' ? 'ध्यान से सुनो' : 'LISTEN CLOSER';
      verdict.text =
        tr.kind === 'triplet'
          ? `${lang === 'hi-IN' ? 'अलग वाला' : 'Odd one'}: ${tr.odd + 1}`
          : isDiff
            ? `${t.diff}: ${tr.words[0]} · ${tr.words[1]}`
            : `${t.same}: ${tr.words[0]} · ${tr.words[1]}`;
      ctx.caption(verdict.text);
      await openShells(tr);
      if (ok) shells.forEach((s) => particles.burst(s.c.x, s.c.y - shellR * 0.15, 8, { color: 0xfff6ec, speed: 90, life: 0.6 }));
      stair.record(ok);
      if (preview && stair.level > 4) stair.set(2);
      hud();

      if (!preview && trials >= TRIALS) {
        await ctx.wait(1200);
        ctx.end({
          score,
          levelReached: hardest,
          stats: { accuracy: Math.round((correct / trials) * 100), hardest, streak: bestStreak },
          message: hardest >= 5 ? 'Tiny sounds, clearly heard.' : 'Your ears get sharper with every pair.',
        });
        return;
      }
      tr = makeTrial(stair.level);
      ctx.voice.prefetch(tr.words, { lang });
      await ctx.wait((ok ? 1300 : 1900) * ctx.settings.timingMultiplier);
    }
  }

  createLangToggle(ctx, (l) => {
    lang = l;
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next pair' : 'English from the next pair');
  });

  ctx.keys({
    ArrowLeft: () => answer(false),
    KeyS: () => answer(false),
    ArrowRight: () => answer(true),
    KeyD: () => answer(true),
    Digit1: () => answer(0),
    Digit2: () => answer(1),
    Digit3: () => answer(2),
    Numpad1: () => answer(0),
    Numpad2: () => answer(1),
    Numpad3: () => answer(2),
  });

  // ---- animation
  let time = 0;
  ctx.loop((dt) => {
    time += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    for (let si = 0; si < shells.length; si++) {
      const s = shells[si];
      s.pulse = Math.max(0, s.pulse - dt / 900);
      const bob = reduced ? 0 : Math.sin(time * 1.1 + si * 1.3) * 2;
      s.base.y = bob * 0.3;
      s.halo.alpha = 0.12 + s.pulse * 0.65 + (s.odd ? 0.25 : 0);
      s.halo.tint = s.odd ? hex(pal.highlight) : ACC;
      s.c.pivot.y = -bob;
      s.rings.clear();
      for (let i = s.ripples.length - 1; i >= 0; i--) {
        s.ripples[i] += dt / 1000;
        const k = s.ripples[i];
        if (k >= 1) {
          s.ripples.splice(i, 1);
          continue;
        }
        s.rings.circle(0, -shellR * 0.2, shellR * (0.9 + k * 0.9)).stroke({ width: 3 * (1 - k), color: ACC, alpha: 0.55 * (1 - k) });
      }
    }
    if (!reduced) moteSprites.forEach((m, i) => (m.y -= (0.08 + (i % 5) * 0.035) * (dt / 16)) && m.y < -10 && (m.y = H + 10));
    status.alpha = clamp(0.8 + Math.sin(time * 2) * 0.2, 0, 1);
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
