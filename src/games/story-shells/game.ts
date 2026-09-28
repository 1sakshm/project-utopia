import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, easeOutCubic, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture } from '@/sdk/pixi';
import { createLangToggle } from '@/sdk/voiceui';
import { STORIES, UI, type Story } from './content';

const FONT = 'Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const STORY_COUNT = 6;

interface Card {
  c: Container;
  bg: Graphics;
  icon: Text;
  label: Text;
  key: Text;
  mark: Text;
  correct: boolean;
  w: number;
  h: number;
  baseY: number;
}

interface Drift {
  t: Text;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 3, up: 1, down: 1, start: clamp(ctx.startLevel, 1, 2) });
  const note = ctx.audio.scale(62, 'majorPenta');

  // ---- scene
  const bg = new Sprite(gradientTexture([
    [0, '#040c18'],
    [0.45, '#0b2436'],
    [0.75, '#123a4a'],
    [1, '#1b2f38'],
  ]));
  const rays = new Graphics();
  const motes = new Container();
  const sand = new Graphics();
  const shellLayer = new Container();
  const driftLayer = new Container();
  const textLayer = new Container();
  const cardLayer = new Container();
  const fx = new Container();
  app.stage.addChild(bg, rays, motes, sand, driftLayer, shellLayer, textLayer, cardLayer, fx);
  const particles = createParticles(ctx, fx, 200);

  const halo = new Sprite(glowTexture(256, 0.22));
  halo.anchor.set(0.5);
  halo.tint = hex(pal.accent);
  const shell = new Container();
  const cup = new Graphics();
  const pearlGlow = new Sprite(glowTexture(128, 0.3));
  pearlGlow.anchor.set(0.5);
  pearlGlow.tint = hex(pal.highlight);
  const pearl = new Graphics();
  const lid = new Graphics();
  const rings = new Graphics();
  shell.addChild(cup, pearlGlow, pearl, lid);
  shellLayer.addChild(halo, rings, shell);

  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const caption = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 22, fontWeight: '700', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 320, lineHeight: 32 },
  });
  caption.anchor.set(0.5, 0);
  const question = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 24, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 320, lineHeight: 32 },
  });
  question.anchor.set(0.5, 1);
  const dots = new Graphics();
  textLayer.addChild(status, caption, question, dots);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(30 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? hex(pal.accent) : hex(pal.accent2);
    s.alpha = 0.2 + rng.next() * 0.35;
    s.scale.set(0.15 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let shellX = 0;
  let shellY = 0;
  let R = 80;
  let sandY = 0;
  let pulse = 0;
  let openK = 0; // 0 closed … 1 open
  const ripples: number[] = [];
  const drifts: Drift[] = [];
  let cards: Card[] = [];

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    R = Math.min(safe.w * 0.2, 88);
    shellX = safe.x + safe.w / 2;
    shellY = safe.y + safe.h * 0.25;
    shell.position.set(shellX, shellY);
    halo.position.set(shellX, shellY);
    rings.position.set(shellX, shellY);
    status.position.set(shellX, safe.y + safe.h * 0.1);
    const wrap = safe.w - 48;
    caption.style.wordWrapWidth = wrap;
    question.style.wordWrapWidth = wrap;
    caption.style.fontSize = Math.round(21 * ctx.settings.textScale);
    caption.style.lineHeight = Math.round(30 * ctx.settings.textScale);
    question.style.fontSize = Math.round(22 * ctx.settings.textScale);
    question.style.lineHeight = Math.round(30 * ctx.settings.textScale);
    caption.position.set(shellX, shellY + R * 0.75 + 34);
    question.position.set(shellX, safe.y + safe.h * 0.53);
    sandY = safe.y + safe.h * 0.6;
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    drawShell();
    drawSand();
    drawRays();
    layoutCards();
  }

  // ---- drawing
  function fan(g: Graphics, r: number, fill: number, ridge: number, hc: boolean) {
    // scallop pointing up from a hinge at (0,0)
    const ridges = 9;
    const a0 = Math.PI + 0.42;
    const a1 = Math.PI * 2 - 0.42;
    const pts: number[] = [-r * 0.2, 0];
    const steps = ridges * 8;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const a = a0 + (a1 - a0) * k;
      const bump = 1 + 0.06 * Math.abs(Math.sin(k * ridges * Math.PI));
      pts.push(Math.cos(a) * r * bump, Math.sin(a) * r * bump * 0.95 + r * 0.05);
    }
    pts.push(r * 0.2, 0);
    g.poly(pts).fill({ color: fill });
    if (!hc) g.poly(pts.map((v) => v * 0.7)).fill({ color: 0xffffff, alpha: 0.13 });
    for (let i = 0; i <= ridges; i++) {
      const a = a0 + ((a1 - a0) * i) / ridges;
      g.moveTo(0, 0).lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.92 + r * 0.05);
    }
    g.stroke({ width: hc ? 2.5 : 2, color: ridge, alpha: hc ? 1 : 0.45 });
    g.poly(pts).stroke({ width: hc ? 3 : 1.5, color: 0xffffff, alpha: hc ? 1 : 0.55 });
    // hinge ears
    g.roundRect(-r * 0.3, -r * 0.1, r * 0.6, r * 0.16, 5).fill({ color: fill }).stroke({ width: 1.5, color: 0xffffff, alpha: hc ? 1 : 0.5 });
  }

  function drawShell() {
    const hc = ctx.settings.highContrast;
    lid.clear();
    cup.clear();
    pearl.clear();
    fan(lid, R, hc ? 0x000000 : hex(pal.accent2), hc ? 0xffffff : 0xffffff, hc);
    lid.circle(-R * 0.3, -R * 0.55, R * 0.16).fill({ color: 0xffffff, alpha: hc ? 0 : 0.35 });
    fan(cup, R, hc ? 0x000000 : 0xd98fae, 0xffffff, hc);
    cup.scale.y = -0.5;
    pearl.circle(0, R * 0.2, R * 0.16).fill({ color: hc ? 0xffffff : 0xfff6e6 });
    pearl.circle(-R * 0.05, R * 0.15, R * 0.05).fill({ color: 0xffffff, alpha: 0.9 });
    pearlGlow.position.set(0, R * 0.2);
    pearlGlow.scale.set((R / 64) * 0.9);
    halo.scale.set((R / 64) * 2);
  }

  function drawSand() {
    sand.clear();
    const hc = ctx.settings.highContrast;
    const pts: number[] = [0, H, 0, sandY];
    for (let x = 0; x <= W; x += 16) pts.push(x, sandY + Math.sin(x / 70) * 8 + Math.sin(x / 23) * 3);
    pts.push(W, sandY, W, H);
    sand.poly(pts).fill({ color: hc ? 0x000000 : 0x6a5a4a, alpha: hc ? 1 : 0.28 });
    const pts2: number[] = [0, H, 0, sandY + 40];
    for (let x = 0; x <= W; x += 16) pts2.push(x, sandY + 40 + Math.sin(x / 55 + 1) * 6);
    pts2.push(W, sandY + 40, W, H);
    sand.poly(pts2).fill({ color: hc ? 0x000000 : 0x8a7358, alpha: hc ? 1 : 0.2 });
    if (!hc) {
      for (let i = 0; i < 70; i++) {
        const x = (((i * 7919) % 1000) / 1000) * W;
        const y = sandY + 14 + (((i * 3571) % 1000) / 1000) * (H - sandY - 14);
        sand.circle(x, y, 0.8 + (i % 3) * 0.6).fill({ color: i % 4 ? 0xfff1c9 : 0x8ff0e0, alpha: 0.12 + (i % 5) * 0.05 });
      }
    }
  }

  function drawRays() {
    rays.clear();
    if (ctx.settings.highContrast) return;
    for (let i = 0; i < 5; i++) {
      const x = safe.x + safe.w * (0.1 + i * 0.2);
      rays.poly([x - 14, 0, x + 26, 0, x + 110 - i * 30, H * 0.7, x + 20 - i * 30, H * 0.7]).fill({ color: hex(pal.accent), alpha: 0.025 });
    }
  }

  // ---- drifting words (decorative)
  function spawnWords(sentence: string) {
    if (ctx.settings.reducedMotion) return;
    const ws = sentence.split(/\s+/).filter(Boolean);
    ws.forEach((w, i) => {
      ctx.after(i * 140, () => {
        if (!alive) return;
        const t = new Text({ text: w.replace(/[.,!?'"“”।]/g, ''), style: { fontFamily: FONT, fontSize: 13 + rng.int(0, 5), fontWeight: '700', fill: rng.chance(0.5) ? pal.accent : pal.highlight } });
        t.anchor.set(0.5);
        t.position.set(shellX + (rng.next() - 0.5) * R * 0.6, shellY + R * 0.1);
        t.alpha = 0;
        driftLayer.addChild(t);
        const max = 2.6 + rng.next();
        drifts.push({ t, vx: (rng.next() - 0.5) * 70, vy: -30 - rng.next() * 40, life: max, max });
      });
    });
  }

  // ---- cards
  function makeCard(icon: string, text: string, i: number, correct: boolean): Card {
    const c = new Container();
    const bgG = new Graphics();
    const iconT = new Text({ text: icon, style: { fontFamily: EMOJI_FONT, fontSize: 30 } });
    iconT.anchor.set(0.5);
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 21, fontWeight: '800', fill: '#ffffff', wordWrap: true, wordWrapWidth: 200 } });
    label.anchor.set(0, 0.5);
    const key = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 13, fontWeight: '800', fill: 'rgba(255,255,255,0.55)' } });
    key.anchor.set(1, 0);
    const mark = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fontWeight: '900', fill: '#0b0d14' } });
    mark.anchor.set(0.5);
    c.addChild(bgG, iconT, label, key, mark);
    c.eventMode = preview ? 'none' : 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => choose(i));
    cardLayer.addChild(c);
    return { c, bg: bgG, icon: iconT, label, key, mark, correct, w: 0, h: 0, baseY: 0 };
  }

  function drawCard(cd: Card, state: 'idle' | 'right' | 'wrong' | 'reveal') {
    const hc = ctx.settings.highContrast;
    const { w, h } = cd;
    cd.bg.clear();
    const fill = state === 'right' ? hex(pal.accent) : state === 'wrong' ? 0x4a2638 : hc ? 0x000000 : 0x123047;
    cd.bg.roundRect(-w / 2, -h / 2, w, h, 22).fill({ color: fill, alpha: state === 'idle' ? 0.84 : 0.96 });
    cd.bg.roundRect(-w / 2, -h / 2, w, h, 22).stroke({
      width: state === 'reveal' ? 4 : hc ? 3 : 1.5,
      color: state === 'wrong' ? 0xff9fb8 : state === 'reveal' ? hex(pal.accent) : 0xffffff,
      alpha: state === 'reveal' || hc ? 1 : 0.28,
    });
    cd.bg.circle(-w / 2 + h / 2, 0, h * 0.36).fill({ color: 0xffffff, alpha: state === 'right' ? 0.5 : 0.1 });
    cd.label.style.fill = state === 'right' ? '#0b0d14' : '#ffffff';
    cd.mark.text = state === 'right' ? '✓' : state === 'wrong' ? '✗' : state === 'reveal' ? '✓' : '';
    cd.mark.style.fill = state === 'right' ? '#0b0d14' : state === 'wrong' ? '#ffb8c8' : pal.accent;
  }

  function layoutCards() {
    if (!cards.length) return;
    const gap = 12;
    const top = safe.y + safe.h * 0.575;
    const bottom = safe.y + safe.h - (preview ? 30 : 86);
    const h = Math.max(56, Math.min(80, (bottom - top - gap * (cards.length - 1)) / cards.length));
    const w = Math.min(safe.w - 36, 460);
    cards.forEach((cd, i) => {
      cd.w = w;
      cd.h = h;
      cd.baseY = top + h / 2 + i * (h + gap);
      cd.c.x = shellX;
      cd.c.y = cd.baseY;
      cd.icon.position.set(-w / 2 + h / 2, 0);
      cd.icon.style.fontSize = Math.round(h * 0.42);
      cd.label.position.set(-w / 2 + h + 8, 0);
      cd.label.style.fontSize = Math.round(Math.min(21 * ctx.settings.textScale, 26));
      cd.label.style.wordWrapWidth = w - h - 60;
      cd.key.position.set(w / 2 - 12, -h / 2 + 7);
      cd.key.visible = ctx.settings.showKeyHints && !preview;
      cd.mark.position.set(w / 2 - 28, 4);
      drawCard(cd, 'idle');
    });
  }

  function setCards(items: Array<{ icon: string; text: string; correct: boolean }>) {
    clearCards();
    cards = items.map((it, i) => makeCard(it.icon, it.text, i, it.correct));
    layoutCards();
    cards.forEach((cd, i) => {
      cd.c.alpha = 0;
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 420 + i * 90, (k) => {
        cd.c.alpha = k;
        cd.c.y = cd.baseY + (1 - k) * 60;
      }, easeOutBack);
    });
  }

  function clearCards() {
    cards.forEach((cd) => cd.c.destroy({ children: true }));
    cards = [];
  }

  // ---- state
  let alive = true;
  let score = 0;
  let asked = 0;
  let right = 0;
  let storiesDone = 0;
  let longest = 0;
  let lang: VoiceLang = ctx.voice.lang();
  let pendingLang: VoiceLang = lang;
  let accepting = false;
  let replayed = false;
  let resolveAnswer: ((i: number) => void) | null = null;
  let story: Story | null = null;
  let stopAmbient: (() => void) | null = null;
  const used = new Set<number>();

  const showText = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';

  function setOpen(target: number, ms = 700) {
    const from = openK;
    return tween(ctx, ctx.settings.reducedMotion ? 1 : ms, (k) => (openK = from + (target - from) * k), easeOutCubic);
  }

  async function tell(st: Story) {
    const text = st[lang === 'hi-IN' ? 'hi' : 'en'].text;
    status.text = UI[lang].listen;
    await setOpen(1);
    for (const [si, s] of text.entries()) {
      if (!alive) return;
      drawDots(text.length, si);
      pulse = 1;
      ripples.push(0);
      ctx.audio.chime(note(rng.int(0, 5)), { gain: 0.03, dur: 0.8 });
      caption.text = showText() ? s : '';
      spawnWords(s);
      const t0 = ctx.time();
      await Promise.race([ctx.voice.speak(s, { lang }), ctx.wait(2500 + [...s].length * 110)]);
      const spent = ctx.time() - t0;
      const readMs = showText() ? (preview ? 500 + [...s].length * 38 : 900 + [...s].length * 55) * ctx.settings.timingMultiplier : 0;
      await ctx.wait(Math.max(260 * ctx.settings.timingMultiplier, readMs - spent));
    }
    caption.text = '';
    dots.clear();
  }

  function drawDots(n: number, cur: number) {
    dots.clear();
    if (showText()) return;
    const gap = 26;
    const y = shellY + R * 0.75 + 52;
    for (let i = 0; i < n; i++) {
      const x = shellX + (i - (n - 1) / 2) * gap;
      if (i <= cur) dots.circle(x, y, 7).fill({ color: i === cur ? hex(pal.highlight) : hex(pal.accent), alpha: i === cur ? 1 : 0.7 });
      else dots.circle(x, y, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
    }
  }

  function choose(i: number) {
    if (!accepting || i >= cards.length) return;
    accepting = false;
    ctx.voice.stop();
    resolveAnswer?.(i);
  }

  function askQuestion(qi: number): Promise<number> {
    const st = story!;
    const t = st[lang === 'hi-IN' ? 'hi' : 'en'];
    const q = t.qs[qi];
    const items = q.c.map((c, i) => ({ icon: st.icons[qi][i], text: c, correct: i === 0 }));
    rng.shuffle(items);
    status.text = `${UI[lang].question} ${qi + 1} / 2`;
    question.text = q.q;
    question.alpha = 0;
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 300, (k) => (question.alpha = k));
    setCards(items);
    ctx.announce(`${q.q} ${items.map((it, i) => `${i + 1}: ${it.text}`).join(', ')}`);
    void Promise.race([ctx.voice.speak(q.q, { lang }), ctx.wait(5000)]);
    accepting = true;
    setReplay(!preview && !replayed);
    return new Promise((res) => {
      resolveAnswer = (i) => {
        resolveAnswer = null;
        setReplay(false);
        res(i);
      };
    });
  }

  async function ghost() {
    await ctx.wait(1300 + rng.next() * 900);
    if (!accepting || !alive) return;
    const correctIdx = cards.findIndex((c) => c.correct);
    const pick = rng.chance(0.85) ? correctIdx : (correctIdx + 1 + rng.int(0, 1)) % cards.length;
    const cd = cards[pick];
    // little "press" so the choice reads in the feed
    await tween(ctx, 180, (k) => cd.c.scale.set(1 - 0.05 * Math.sin(k * Math.PI)));
    choose(pick);
  }

  async function replay() {
    if (!accepting || replayed || !story) return;
    replayed = true;
    accepting = false;
    setReplay(false);
    ctx.voice.stop();
    const saveQ = question.text;
    const saveStatus = status.text;
    question.text = '';
    cardLayer.alpha = 0.25;
    await tell(story);
    if (!alive) return;
    cardLayer.alpha = 1;
    question.text = saveQ;
    status.text = saveStatus;
    accepting = true;
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, progress: storiesDone / STORY_COUNT, label: replayed ? '½ points' : undefined });
  }

  function pickStory(): Story {
    const L = stair.level;
    let pool = STORIES.map((s, i) => ({ s, i })).filter((x) => !used.has(x.i) && x.s.level === L);
    if (!pool.length) pool = STORIES.map((s, i) => ({ s, i })).filter((x) => !used.has(x.i));
    if (!pool.length) {
      used.clear();
      pool = STORIES.map((s, i) => ({ s, i })).filter((x) => x.s.level === L);
    }
    const p = rng.pick(pool);
    used.add(p.i);
    return p.s;
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 62, 69], { gain: 0.03, brightness: 0.25 });
    await ctx.wait(500);
    while (alive) {
      lang = pendingLang;
      story = pickStory();
      replayed = false;
      const t = story[lang === 'hi-IN' ? 'hi' : 'en'];
      ctx.voice.prefetch([...t.text, t.qs[0].q, t.qs[1].q], { lang });
      hud();
      await ctx.wait(ctx.voice.source() === 'sarvam' ? 700 : 300);
      await tell(story);
      if (!alive) return;
      let bothRight = true;
      for (let qi = 0; qi < 2; qi++) {
        const p = askQuestion(qi);
        if (preview) void ghost();
        const pick = await p;
        if (!alive) return;
        const cd = cards[pick];
        asked++;
        ctx.trial({ correct: cd.correct, level: story.level });
        if (cd.correct) {
          right++;
          score += Math.round((5 + story.level * 5) * (replayed ? 0.5 : 1));
          drawCard(cd, 'right');
          ctx.audio.pluck(note(4 + qi), { gain: 0.18 });
          ctx.haptics.tick();
          particles.burst(cd.c.x + cd.w / 2 - 28, cd.c.y, 18, { color: hex(pal.accent), speed: 160, life: 0.6 });
          pulse = 1;
        } else {
          bothRight = false;
          drawCard(cd, 'wrong');
          const good = cards.find((c) => c.correct);
          if (good) drawCard(good, 'reveal');
          ctx.audio.thunk({ gain: 0.2 });
          ctx.haptics.error();
          ctx.caption('Not quite. The right card is marked ✓');
        }
        hud();
        await ctx.wait((cd.correct ? 900 : 1600) * (preview ? 1 : ctx.settings.timingMultiplier));
        question.text = '';
        clearCards();
      }
      storiesDone++;
      longest = Math.max(longest, story.level + 1);
      stair.record(bothRight);
      if (preview && storiesDone >= 2) stair.set(1);
      if (bothRight) {
        ctx.audio.success();
        particles.burst(shellX, shellY + R * 0.2, 46, { color: hex(pal.highlight), speed: 240, life: 1 });
        status.text = lang === 'hi-IN' ? 'बहुत बढ़िया' : 'LOVELY LISTENING';
      } else {
        status.text = lang === 'hi-IN' ? 'अगली कहानी' : 'NEXT STORY';
      }
      hud();
      await setOpen(0, 500);
      if (!preview && storiesDone >= STORY_COUNT) {
        await ctx.wait(700);
        ctx.end({
          score,
          levelReached: longest,
          stats: { accuracy: asked ? Math.round((right / asked) * 100) : 0, stories: storiesDone, longest },
          message: right >= asked - 1 ? 'Every little story, heard and held.' : 'A calm ear catches more each time.',
        });
        return;
      }
      await ctx.wait(600);
    }
  }

  // ---- DOM "hear again"
  const replayBtn = document.createElement('button');
  replayBtn.className = 'u-game-btn';
  replayBtn.style.cssText = 'position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;white-space:nowrap;';
  replayBtn.onclick = () => void replay();
  if (!preview) ctx.container.appendChild(replayBtn);
  function setReplay(v: boolean) {
    replayBtn.textContent = UI[lang].again;
    replayBtn.style.display = v ? 'block' : 'none';
  }
  createLangToggle(ctx, (l) => {
    pendingLang = l;
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next story' : 'English from the next story');
  });

  const keyMap: Record<string, () => void> = { KeyR: () => void replay() };
  for (let i = 0; i < 3; i++) {
    keyMap[`Digit${i + 1}`] = () => choose(i);
    keyMap[`Numpad${i + 1}`] = () => choose(i);
  }
  ctx.keys(keyMap);

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    pulse = Math.max(0, pulse - dt / 900);
    const breathe = reduced ? 0 : Math.sin(t * 1.3) * 0.02;
    // lid flips around the hinge: -0.5 (closed, covering the cup) → 1 (open, fan up)
    lid.scale.y = -0.5 + 1.5 * openK;
    lid.scale.x = 1 + breathe;
    cup.scale.x = 1 + breathe;
    pearl.alpha = pearlGlow.alpha = clamp(openK * 1.4 - 0.2, 0, 1);
    pearlGlow.scale.set((R / 64) * (0.9 + pulse * 0.6 + breathe * 4));
    halo.alpha = 0.18 + openK * 0.2 + pulse * 0.3;
    shell.y = shellY + (reduced ? 0 : Math.sin(t * 0.9) * 3);
    rings.clear();
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i] += dt / 1300;
      const k = ripples[i];
      if (k >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      rings.circle(0, R * 0.2, R * (0.4 + k * 1.5)).stroke({ width: 3 * (1 - k), color: hex(pal.accent), alpha: 0.5 * (1 - k) });
    }
    const k = dt / 1000;
    for (let i = drifts.length - 1; i >= 0; i--) {
      const d = drifts[i];
      d.life -= k;
      d.t.x += d.vx * k + Math.sin(t * 2 + i) * 0.3;
      d.t.y += d.vy * k;
      const f = d.life / d.max;
      d.t.alpha = Math.min(1, (1 - f) * 5) * f * 0.3;
      if (d.life <= 0) {
        d.t.destroy();
        drifts.splice(i, 1);
      }
    }
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
      replayBtn.remove();
    },
  };
}
