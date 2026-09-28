import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, easeOutCubic, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture } from '@/sdk/pixi';
import { CONCEPTS, type Concept } from './content';
import { drawIcon } from './icons';

const FONT = 'Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const TRIALS = 24;
const say = (c: Concept, l: VoiceLang) => (l === 'en-IN' ? c.en : c.hi);

interface Card {
  c: Container;
  float: Container;
  glow: Sprite;
  glass: Graphics;
  icon: Graphics;
  label: Text;
  key: Text;
  concept: Concept;
  w: number;
  h: number;
  lit: number;
  glowNow: number;
  phase: number;
}

interface Speaker {
  c: Container;
  halo: Sprite;
  body: Graphics;
  badge: Text;
  pulse: number;
  color: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 6, up: 2, down: 1 });
  if (preview) stair.set(2);
  const note = ctx.audio.scale(64, 'majorPenta');
  const EN = hex(pal.accent);
  const HI = hex(pal.accent2);

  // ---- scene
  const bg = new Sprite(gradientTexture([
    [0, '#070a1a'],
    [0.5, '#171a3c'],
    [1, '#0b1022'],
  ]));
  const motes = new Container();
  const top = new Container();
  const cardLayer = new Container();
  const fx = new Container();
  app.stage.addChild(bg, motes, top, cardLayer, fx);
  const particles = createParticles(ctx, fx, 200);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(34 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 2 ? EN : HI;
    s.alpha = 0.18 + rng.next() * 0.35;
    s.scale.set(0.18 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  function makeSpeaker(label: string, color: number): Speaker {
    const c = new Container();
    const halo = new Sprite(glowTexture(128, 0.25));
    halo.anchor.set(0.5);
    halo.tint = color;
    halo.blendMode = 'add';
    const body = new Graphics();
    const badge = new Text({ text: label, style: { fontFamily: FONT, fontSize: 17, fontWeight: '900', fill: '#0b0d18' } });
    badge.anchor.set(0.5);
    c.addChild(halo, body, badge);
    top.addChild(c);
    return { c, halo, body, badge, pulse: 0, color };
  }
  const spEn = makeSpeaker('EN', EN);
  const spHi = makeSpeaker('हि', HI);

  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const bubble = new Container();
  const bubbleBg = new Graphics();
  const bubbleWave = new Graphics();
  const bubbleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 34, fontWeight: '800', fill: '#ffffff', align: 'center' } });
  bubbleText.anchor.set(0.5);
  const bubbleTag = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '900', fill: '#0b0d18', letterSpacing: 1 } });
  bubbleTag.anchor.set(0.5);
  bubble.addChild(bubbleBg, bubbleWave, bubbleText, bubbleTag);
  bubble.alpha = 0;
  top.addChild(status, bubble);

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let cards: Card[] = [];
  let bubbleW = 220;
  const bubbleH = 78;
  let bubbleLang: VoiceLang = 'en-IN';
  let speaking = false;

  function drawSpeaker(sp: Speaker, r: number) {
    const hc = ctx.settings.highContrast;
    sp.body.clear();
    sp.body.circle(0, 0, r).fill({ color: sp.color, alpha: 0.95 });
    if (!hc) sp.body.circle(-r * 0.3, -r * 0.32, r * 0.3).fill({ color: 0xffffff, alpha: 0.45 });
    else sp.body.circle(0, 0, r).stroke({ width: 3, color: 0xffffff });
    sp.halo.scale.set((r * 3.2) / 128);
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    const r = Math.min(30, safe.w * 0.075);
    const sy = Math.max(safe.y + safe.h * 0.2, 150);
    spEn.c.position.set(safe.x + 22 + r, sy);
    spHi.c.position.set(safe.x + safe.w - 22 - r, sy);
    drawSpeaker(spEn, r);
    drawSpeaker(spHi, r);
    status.position.set(safe.x + safe.w / 2, Math.max(safe.y + safe.h * 0.12, 100));
    bubbleW = Math.min(safe.w - 60, 260);
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    layoutCards();
  }

  const bubbleY = () => spEn.c.y + 74;
  function drawBubble() {
    const hc = ctx.settings.highContrast;
    const col = bubbleLang === 'en-IN' ? EN : HI;
    const left = bubbleLang === 'en-IN';
    const w = bubbleW;
    const h = bubbleH;
    const g = bubbleBg;
    g.clear();
    g.roundRect(-w / 2, -h / 2, w, h, 26).fill({ color: hc ? 0x000000 : 0x121633, alpha: hc ? 1 : 0.9 });
    g.roundRect(-w / 2, -h / 2, w, h, 26).stroke({ width: hc ? 3 : 2, color: col, alpha: 0.95 });
    // tail pointing at its speaker
    const tx = left ? -w / 2 + 34 : w / 2 - 34;
    g.poly([tx - 10, -h / 2 + 1, tx + 10, -h / 2 + 1, tx + (left ? -12 : 12), -h / 2 - 16]).fill({ color: col, alpha: 0.95 });
    // language tag pill (never colour alone)
    const tagX = left ? -w / 2 + 30 : w / 2 - 30;
    g.roundRect(tagX - 20, h / 2 - 13, 40, 22, 11).fill({ color: col });
    bubbleTag.text = left ? 'EN' : 'हि';
    bubbleTag.position.set(tagX, h / 2 - 2);
  }

  function drawWave(time: number) {
    const g = bubbleWave;
    g.clear();
    if (bubbleText.text) return;
    const col = bubbleLang === 'en-IN' ? EN : HI;
    const n = 11;
    const reduced = ctx.settings.reducedMotion;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 11;
      const amp = speaking && !reduced ? 0.35 + 0.65 * Math.abs(Math.sin(time * 9 + i * 1.7)) : 0.3;
      const h = 8 + 26 * amp * (1 - Math.abs(i - (n - 1) / 2) / n);
      g.roundRect(x - 2.5, -h / 2 - 4, 5, h, 2.5).fill({ color: col, alpha: 0.9 });
    }
  }

  function showBubble(l: VoiceLang, text: string) {
    bubbleLang = l;
    bubbleText.text = text;
    bubbleText.position.set(0, -4);
    bubbleText.style.fill = '#ffffff';
    bubbleText.style.fontSize = Math.min(34, (bubbleW - 30) / Math.max(3, [...text].length) * 1.7) * ctx.settings.textScale;
    drawBubble();
    const left = l === 'en-IN';
    const endX = safe.x + safe.w / 2 + (left ? -18 : 18);
    const startX = endX + (left ? -60 : 60);
    const y = bubbleY();
    if (ctx.settings.reducedMotion) {
      bubble.position.set(endX, y);
      bubble.alpha = 1;
      return;
    }
    void tween(ctx, 280, (k) => {
      bubble.position.set(startX + (endX - startX) * k, y);
      bubble.alpha = k;
    }, easeOutCubic);
  }

  // ---- cards
  function makeCard(concept: Concept, i: number): Card {
    const c = new Container();
    const float = new Container();
    const glow = new Sprite(glowTexture(128, 0.3));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.alpha = 0;
    const glass = new Graphics();
    const icon = new Graphics();
    const label = new Text({ text: '', style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: 'rgba(255,255,255,0.85)', align: 'center' } });
    label.anchor.set(0.5);
    const key = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.5)' } });
    float.addChild(glow, glass, icon, label, key);
    c.addChild(float);
    c.eventMode = preview ? 'none' : 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => pick(i));
    cardLayer.addChild(c);
    return { c, float, glow, glass, icon, label, key, concept, w: 0, h: 0, lit: 0, glowNow: 0, phase: rng.next() * 6 };
  }

  function drawCard(k: Card, state: 'idle' | 'ok' | 'wrong' | 'answer') {
    const hc = ctx.settings.highContrast;
    const g = k.glass;
    g.clear();
    const fill = hc ? 0x000000 : state === 'ok' ? 0x1f3a3e : state === 'wrong' ? 0x3a2233 : 0x1a1f45;
    g.roundRect(-k.w / 2, -k.h / 2, k.w, k.h, 22).fill({ color: fill, alpha: hc ? 1 : 0.8 });
    if (!hc) g.moveTo(-k.w / 2 + 20, -k.h / 2 + 2.5).lineTo(k.w / 2 - 20, -k.h / 2 + 2.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.18 });
    const edge = state === 'ok' ? hex(pal.highlight) : state === 'wrong' ? 0xff9fb8 : state === 'answer' ? hex(pal.highlight) : 0xffffff;
    g.roundRect(-k.w / 2, -k.h / 2, k.w, k.h, 22).stroke({ width: hc ? 3 : state === 'idle' ? 1.5 : 3, color: edge, alpha: hc || state !== 'idle' ? 1 : 0.25 });
    if (state === 'answer') g.roundRect(-k.w / 2 - 5, -k.h / 2 - 5, k.w + 10, k.h + 10, 26).stroke({ width: 2, color: edge, alpha: 0.6 });
  }

  let labelLang: VoiceLang = 'hi-IN';
  function layoutCards() {
    if (!cards.length) return;
    const n = cards.length;
    const cols = n === 3 ? 3 : 2;
    const rows = Math.ceil(n / cols);
    const gap = 12;
    const areaTop = bubbleY() + bubbleH / 2 + 34;
    const areaBottom = Math.min(safe.y + safe.h - 34, H - 40);
    const cw = Math.min(n === 3 ? 124 : 168, (safe.w - 24 - gap * (cols - 1)) / cols);
    const ch = Math.min(cw * (n === 3 ? 1.5 : 1.05), (areaBottom - areaTop - gap * (rows - 1)) / rows);
    const totalH = rows * ch + (rows - 1) * gap;
    const y0 = areaTop + Math.max(0, (areaBottom - areaTop - totalH) / 3);
    const hc = ctx.settings.highContrast;
    cards.forEach((k, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      k.w = cw;
      k.h = ch;
      const rowW = cols * cw + (cols - 1) * gap;
      k.c.position.set(safe.x + safe.w / 2 - rowW / 2 + cw / 2 + col * (cw + gap), y0 + ch / 2 + row * (ch + gap));
      k.glow.scale.set((Math.max(cw, ch) * 1.7) / 128);
      k.glow.tint = hex(pal.highlight);
      k.icon.clear();
      const s = Math.min(cw, ch) * 0.3;
      k.icon.position.set(0, -ch * 0.1);
      drawIcon(k.icon, k.concept.id, s, hc);
      k.label.text = say(k.concept, labelLang);
      k.label.style.fontSize = Math.max(13, Math.min(18 * ctx.settings.textScale, (cw / Math.max(4, [...k.label.text].length)) * 1.7));
      k.label.position.set(0, ch / 2 - 22);
      k.key.position.set(-cw / 2 + 11, -ch / 2 + 8);
      k.key.visible = ctx.settings.showKeyHints || !preview;
      drawCard(k, 'idle');
    });
  }

  function setCards(list: Concept[], lblLang: VoiceLang) {
    cards.forEach((k) => k.c.destroy({ children: true }));
    labelLang = lblLang;
    cards = list.map((c, i) => makeCard(c, i));
    layoutCards();
    const reduced = ctx.settings.reducedMotion;
    cards.forEach((k, i) => {
      k.c.alpha = 0;
      k.c.scale.set(reduced ? 1 : 0.88);
      ctx.after(reduced ? 0 : i * 45, () =>
        void tween(ctx, reduced ? 1 : 280, (e) => {
          k.c.alpha = e;
          if (!reduced) k.c.scale.set(0.88 + 0.12 * e);
        }, easeOutBack),
      );
    });
  }

  // ---- state
  let alive = true;
  let score = 0;
  let trials = 0;
  let correct = 0;
  let streak = 0;
  let bestStreak = 0;
  let accepting = false;
  let answerIdx = -1;
  let trialToken = 0;
  let resolvePick: ((i: number) => void) | null = null;
  const rtSwitch: number[] = [];
  const rtRepeat: number[] = [];
  let stopAmbient: (() => void) | null = null;

  const showWord = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';

  function pick(i: number) {
    if (!accepting || i >= cards.length) return;
    accepting = false;
    resolvePick?.(i);
  }

  function makeTrial(L: number, prev: { c: Concept; l: VoiceLang } | null) {
    const pSwitch = Math.min(0.6, 0.3 + 0.06 * (L - 1));
    const l: VoiceLang = prev ? (rng.chance(pSwitch) ? (prev.l === 'en-IN' ? 'hi-IN' : 'en-IN') : prev.l) : rng.chance(0.5) ? 'en-IN' : 'hi-IN';
    let target = rng.pick(CONCEPTS);
    while (prev && target.id === prev.c.id) target = rng.pick(CONCEPTS);
    const n = L <= 2 ? 3 : 4;
    const others = CONCEPTS.filter((c) => c.id !== target.id);
    let distract: Concept[];
    if (L >= 4) {
      const same = rng.shuffle(others.filter((c) => c.cat === target.cat));
      const rest = rng.shuffle(others.filter((c) => c.cat !== target.cat));
      distract = [...same, ...rest].slice(0, n - 1);
    } else {
      distract = rng.shuffle(others.filter((c) => c.cat !== target.cat)).slice(0, n - 1);
    }
    const list = rng.shuffle([target, ...distract]);
    return { target, l, list, answer: list.indexOf(target), isSwitch: !!prev && prev.l !== l };
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, progress: trials / TRIALS, label: streak >= 3 ? `Streak ${streak}` : undefined });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([52, 59, 66, 71], { gain: 0.03, brightness: 0.3 });
    ctx.voice.prefetch(CONCEPTS.map((c) => c.en), { lang: 'en-IN' });
    ctx.voice.prefetch(CONCEPTS.map((c) => c.hi), { lang: 'hi-IN' });
    await ctx.wait(500);
    let prev: { c: Concept; l: VoiceLang } | null = null;
    while (alive) {
      const L = stair.level;
      const tr = makeTrial(L, prev);
      const other: VoiceLang = tr.l === 'en-IN' ? 'hi-IN' : 'en-IN';
      answerIdx = tr.answer;
      bubble.alpha = 0;
      bubbleText.text = '';
      setCards(tr.list, other);
      status.text = 'LISTEN';
      hud();
      await ctx.wait((ctx.settings.reducedMotion ? 350 : 550) * ctx.settings.timingMultiplier);
      if (!alive) return;

      // speak
      const sp = tr.l === 'en-IN' ? spEn : spHi;
      const word = say(tr.target, tr.l);
      showBubble(tr.l, showWord() ? word : '');
      sp.pulse = 1;
      speaking = true;
      ctx.caption(tr.l === 'en-IN' ? 'English word' : 'Hindi word');
      await Promise.race([ctx.voice.speak(word, { lang: tr.l }), ctx.wait(preview ? 700 : 2400)]);
      speaking = false;
      if (!alive) return;

      // respond
      status.text = 'TAP THE PICTURE';
      accepting = true;
      const t0 = ctx.time();
      const windowMs = ctx.settings.noTimePressure ? 0 : Math.max(2600, 5200 - 400 * L) * ctx.settings.timingMultiplier;
      const choice = await new Promise<number>((res) => {
        resolvePick = (i) => {
          resolvePick = null;
          res(i);
        };
        const token = ++trialToken;
        if (windowMs > 0)
          ctx.after(windowMs, () => {
            if (token !== trialToken || !accepting) return;
            accepting = false;
            resolvePick?.(-1);
          });
        if (preview) {
          ctx.after(650 + rng.next() * 550 + (tr.isSwitch ? 200 : 0), () => {
            if (token !== trialToken) return;
            const wrong = rng.chance(0.1);
            pick(wrong ? (answerIdx + 1) % cards.length : answerIdx);
          });
        }
      });
      if (!alive) return;
      const rt = ctx.time() - t0;
      const ok = choice === answerIdx;
      trials++;
      ctx.trial({ correct: ok, rtMs: choice >= 0 ? Math.round(rt) : undefined, level: L });

      // feedback
      bubbleText.text = word;
      bubbleText.style.fontSize = Math.min(34, ((bubbleW - 30) / Math.max(3, [...word].length)) * 1.7) * ctx.settings.textScale;
      const right = cards[answerIdx];
      if (ok) {
        correct++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        if (prev) (tr.isSwitch ? rtSwitch : rtRepeat).push(rt);
        const speed = ctx.settings.noTimePressure ? 0 : Math.round(clamp((2600 - rt) / 2600, 0, 1) * 10);
        score += 10 + speed + Math.min(10, streak - 1) * 2;
        drawCard(right, 'ok');
        right.lit = 1;
        ctx.audio.chime(note(3 + (streak % 4)), { gain: 0.08, dur: 0.6 });
        ctx.haptics.success();
        particles.burst(right.c.x, right.c.y, 22, { color: tr.l === 'en-IN' ? EN : HI, speed: 200, life: 0.7 });
        status.text = tr.isSwitch ? 'SWITCHED!' : 'YES';
      } else {
        streak = 0;
        if (choice >= 0) drawCard(cards[choice], 'wrong');
        drawCard(right, 'answer');
        right.lit = 0.6;
        ctx.audio.thunk({ gain: 0.18 });
        ctx.haptics.error();
        status.text = choice < 0 ? 'TOO SLOW' : 'THIS ONE';
        ctx.caption(`It was ${word} (${say(tr.target, other)})`);
      }
      stair.record(ok);
      if (preview && stair.level > 3) stair.set(2);
      hud();
      prev = { c: tr.target, l: tr.l };

      if (!preview && trials >= TRIALS) {
        await ctx.wait(1100);
        const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
        const cost = rtSwitch.length && rtRepeat.length ? Math.max(0, Math.round(mean(rtSwitch) - mean(rtRepeat))) : 0;
        ctx.end({
          score,
          levelReached: stair.level,
          stats: { accuracy: Math.round((correct / trials) * 100), switchCost: cost, streak: bestStreak },
          message: cost < 150 ? 'Smooth switching between both languages.' : 'Both languages, one quick mind.',
        });
        return;
      }
      await ctx.wait((ok ? 800 : 1500) * ctx.settings.timingMultiplier);
    }
  }

  const keyMap: Record<string, () => void> = {};
  for (let i = 0; i < 4; i++) {
    keyMap[`Digit${i + 1}`] = () => pick(i);
    keyMap[`Numpad${i + 1}`] = () => pick(i);
  }
  ctx.keys(keyMap);

  // ---- animation
  let time = 0;
  ctx.loop((dt) => {
    time += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    for (const sp of [spEn, spHi]) {
      if (!speaking) sp.pulse = Math.max(0, sp.pulse - dt / 500);
      const b = reduced ? 0 : Math.sin(time * 1.6 + (sp === spEn ? 0 : 1.5)) * 0.03;
      sp.body.scale.set(1 + b + sp.pulse * 0.12);
      sp.halo.alpha = 0.3 + sp.pulse * 0.55;
    }
    for (const k of cards) {
      k.float.y = reduced ? 0 : Math.sin(time * 1.2 + k.phase) * 2.5;
      k.glowNow += (k.lit - k.glowNow) * Math.min(1, dt / 120);
      k.glow.alpha = k.glowNow * (ctx.settings.highContrast ? 0.4 : 0.55);
    }
    drawWave(time);
    if (!reduced) moteSprites.forEach((m, i) => (m.y -= (0.1 + (i % 5) * 0.04) * (dt / 16)) && m.y < -10 && (m.y = H + 10));
    status.alpha = clamp(0.8 + Math.sin(time * 2) * 0.2, 0, 1);
  });

  layout();
  ctx.onResize(layout);

  return {
    start() {
      void run();
    },
    onSettings: () => {
      layout();
      if (bubble.alpha > 0) drawBubble();
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      ctx.voice.stop();
    },
  };
}
