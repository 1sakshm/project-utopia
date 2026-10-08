import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, hex, mixHex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { createLangToggle } from '@/sdk/voiceui';
import { UI, WORDS } from './content';

const FONT = '"Geist Variable", "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const TRIALS = 16;

type Side = 0 | 1; // 0 = left / female, 1 = right / male
type Mode = 'cued' | 'uncued' | 'both';

interface Ear {
  c: Container;
  well: Sprite;
  halo: Sprite;
  orb: Graphics;
  icon: Text;
  side: Text;
  voice: Text;
  bubble: Container;
  bubbleBg: Graphics;
  bubbleText: Text;
  pulse: number;
  ripples: number[];
  rings: Graphics;
  focus: number; // 0 dim … 1 highlighted
  focusTarget: number;
}

interface Card {
  c: Container;
  bg: Graphics;
  face: Sprite;
  label: Text;
  key: Text;
  mark: Text;
  word: string;
  selected: boolean;
  w: number;
  h: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 6, up: 2, down: 1, start: clamp(ctx.startLevel, 1, 3) });
  if (preview) stair.set(1);
  const note = ctx.audio.scale(60, 'majorPenta');
  const earColor = [hex(pal.accent), hex(pal.accent2)];

  // ---- scene
  // Soft (neumorphism): answer cards are extruded from one calm surface; each ear orb sits in an inset well.
  const surf = mixHex(pal.bg, pal.bg2, 0.5);
  const auroraBg = gradientTexture([
    [0, '#060816'],
    [0.5, '#141a3c'],
    [1, '#0b0f24'],
  ]);
  const softBg = gradientTexture([
    [0, mixHex(surf, '#000000', 0.35)],
    [0.2, surf],
    [1, surf],
  ]);
  const bg = new Sprite(ctx.settings.soft ? softBg : auroraBg);
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    const pad = softTilePad(o);
    sp.texture = softTileTexture({ ...o, resolution: ctx.quality.maxDpr });
    sp.width = o.width + pad * 2;
    sp.height = o.height + pad * 2;
  }
  const motes = new Container();
  const center = new Graphics();
  const earLayer = new Container();
  const textLayer = new Container();
  const cardLayer = new Container();
  const fx = new Container();
  app.stage.addChild(bg, motes, center, earLayer, textLayer, cardLayer, fx);
  const particles = createParticles(ctx, fx, 200);

  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const cueArrow = new Text({ text: '', style: { fontFamily: FONT, fontSize: 54, fontWeight: '900', fill: '#ffffff', align: 'center' } });
  cueArrow.anchor.set(0.5);
  const cueText = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 21, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 320, lineHeight: 29 },
  });
  cueText.anchor.set(0.5, 0);
  const note2 = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: 'rgba(255,255,255,0.75)', align: 'center', wordWrap: true, wordWrapWidth: 320, lineHeight: 20 },
  });
  note2.anchor.set(0.5, 1);
  const tip = new Text({ text: '', style: { fontFamily: FONT, fontSize: 19, fontWeight: '800', fill: pal.highlight, align: 'center' } });
  tip.anchor.set(0.5);
  textLayer.addChild(status, cueArrow, cueText, note2, tip);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(34 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 2 ? hex(pal.accent) : hex(pal.accent2);
    s.alpha = 0.2 + rng.next() * 0.35;
    s.scale.set(0.15 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  function makeEar(side: Side): Ear {
    const c = new Container();
    const well = new Sprite();
    well.anchor.set(0.5);
    const halo = new Sprite(glowTexture(256, 0.22));
    halo.anchor.set(0.5);
    halo.tint = earColor[side];
    const rings = new Graphics();
    const orb = new Graphics();
    const icon = new Text({ text: '👂', style: { fontFamily: EMOJI_FONT, fontSize: 40 } });
    icon.anchor.set(0.5);
    if (side === 0) icon.scale.x = -1;
    const sideT = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '900', fill: '#ffffff', letterSpacing: 2 } });
    sideT.anchor.set(0.5, 0);
    const voice = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: 'rgba(255,255,255,0.8)' } });
    voice.anchor.set(0.5, 0);
    const bubble = new Container();
    const bubbleBg = new Graphics();
    const bubbleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 24, fontWeight: '800', fill: '#0b0d14' } });
    bubbleText.anchor.set(0.5);
    bubble.addChild(bubbleBg, bubbleText);
    bubble.alpha = 0;
    c.addChild(well, halo, rings, orb, icon, sideT, voice, bubble);
    earLayer.addChild(c);
    return { c, well, halo, orb, icon, side: sideT, voice, bubble, bubbleBg, bubbleText, pulse: 0, ripples: [], rings, focus: 0.6, focusTarget: 0.6 };
  }
  const ears: [Ear, Ear] = [makeEar(0), makeEar(1)];

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let orbR = 48;
  let earY = 0;
  let cards: Card[] = [];

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.texture = ctx.settings.soft ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    moteSprites.forEach((m, i) => (m.visible = !ctx.settings.soft || i % 2 === 0));
    orbR = Math.min(safe.w * 0.13, 56);
    earY = safe.y + safe.h * 0.28;
    const cx = safe.x + safe.w / 2;
    ears.forEach((e, i) => {
      e.c.position.set(safe.x + safe.w * (i === 0 ? 0.2 : 0.8), earY);
      e.icon.style.fontSize = Math.round(orbR * 0.85);
      e.side.position.set(0, orbR + 14);
      e.voice.position.set(0, orbR + 38);
      e.bubble.position.set(0, -orbR - 44);
      e.halo.scale.set((orbR / 64) * 2.2);
    });
    status.position.set(cx, safe.y + safe.h * 0.075);
    cueArrow.position.set(cx, earY);
    cueText.style.wordWrapWidth = safe.w - 48;
    cueText.style.fontSize = Math.round(20 * ctx.settings.textScale);
    cueText.style.lineHeight = Math.round(28 * ctx.settings.textScale);
    cueText.position.set(cx, earY + orbR + 68);
    note2.style.wordWrapWidth = safe.w - 40;
    note2.position.set(cx, safe.y + safe.h - 18);
    tip.position.set(cx, safe.y + safe.h * 0.14);
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    drawEars();
    layoutCards();
  }

  function drawEars() {
    const hc = ctx.settings.highContrast;
    ears.forEach((e, i) => {
      e.orb.clear();
      e.well.visible = ctx.settings.soft;
      if (ctx.settings.soft) {
        const d = Math.round(orbR * 2 + 24);
        setSoft(e.well, { width: d, height: d, radius: d / 2, base: surf, pressed: true, depth: 6 });
      }
      e.orb.circle(0, 0, orbR).fill({ color: hc ? 0x000000 : earColor[i], alpha: hc ? 1 : 0.28 });
      e.orb.circle(0, 0, orbR).stroke({ width: hc ? 4 : 2.5, color: hc ? 0xffffff : earColor[i], alpha: 0.95 });
      e.orb.circle(-orbR * 0.35, -orbR * 0.4, orbR * 0.22).fill({ color: 0xffffff, alpha: hc ? 0 : 0.25 });
      e.side.text = UI[lang][i === 0 ? 'left' : 'right'];
      e.voice.text = UI[lang][i === 0 ? 'her' : 'his'];
    });
  }

  function showBubble(e: Ear, word: string, on: boolean) {
    e.bubbleText.text = word;
    const w = Math.max(90, e.bubbleText.width + 30);
    const h = 46;
    e.bubbleBg.clear();
    e.bubbleBg.roundRect(-w / 2, -h / 2, w, h, 23).fill({ color: ctx.settings.highContrast ? 0xffffff : 0xfdf6ff, alpha: 0.96 });
    e.bubbleBg.poly([-9, h / 2 - 1, 9, h / 2 - 1, 0, h / 2 + 11]).fill({ color: 0xfdf6ff, alpha: 0.96 });
    const from = e.bubble.alpha;
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 220, (k) => {
      e.bubble.alpha = from + ((on ? 1 : 0) - from) * k;
      e.bubble.scale.set(on ? 0.8 + 0.2 * k : 1);
    }, on ? easeOutBack : undefined);
  }

  // ---- cards
  function makeCard(word: string, i: number): Card {
    const c = new Container();
    const bgG = new Graphics();
    const face = new Sprite();
    face.anchor.set(0.5);
    const label = new Text({ text: word, style: { fontFamily: FONT, fontSize: 24, fontWeight: '800', fill: '#ffffff', align: 'center' } });
    label.anchor.set(0.5);
    const key = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 13, fontWeight: '800', fill: 'rgba(255,255,255,0.55)' } });
    const mark = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '900', fill: '#0b0d14' } });
    mark.anchor.set(0.5);
    c.addChild(face, bgG, label, key, mark);
    c.eventMode = preview ? 'none' : 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => choose(i));
    cardLayer.addChild(c);
    return { c, bg: bgG, face, label, key, mark, word, selected: false, w: 0, h: 0 };
  }

  function drawCard(cd: Card, state: 'idle' | 'sel' | 'right' | 'wrong' | 'reveal', tag = '') {
    const hc = ctx.settings.highContrast;
    const { w, h } = cd;
    cd.bg.clear();
    cd.face.visible = ctx.settings.soft;
    if (ctx.settings.soft) {
      // Raised card; a picked card sinks in. Rim + mark keep the meaning (highlight = picked / right, pink = wrong).
      const rim = state === 'wrong' ? '#ff9fb8' : state === 'idle' ? undefined : pal.highlight;
      setSoft(cd.face, { width: Math.round(w), height: Math.round(h), radius: 22, base: surf, pressed: state === 'sel' || state === 'wrong' || state === 'right', rim, rimWidth: state === 'sel' ? 2.5 : 3, depth: 7 });
      cd.label.style.fill = state === 'right' ? pal.highlight : state === 'wrong' ? '#ffc2d2' : '#ffffff';
      cd.mark.text = state === 'right' || state === 'reveal' ? `✓ ${tag}`.trim() : state === 'wrong' ? '✗' : state === 'sel' ? '●' : '';
      cd.mark.style.fill = state === 'wrong' ? '#ffb8c8' : pal.highlight;
      return;
    }
    const fill = state === 'right' ? hex(pal.highlight) : state === 'sel' ? 0x2c3a78 : state === 'wrong' ? 0x4a2638 : hc ? 0x000000 : 0x1a2050;
    cd.bg.roundRect(-w / 2, -h / 2, w, h, 22).fill({ color: fill, alpha: state === 'idle' ? 0.82 : 0.96 });
    cd.bg.roundRect(-w / 2, -h / 2, w, h, 22).stroke({
      width: state === 'reveal' || state === 'sel' ? 4 : hc ? 3 : 1.5,
      color: state === 'wrong' ? 0xff9fb8 : state === 'reveal' ? hex(pal.highlight) : 0xffffff,
      alpha: state === 'reveal' || state === 'sel' || hc ? 1 : 0.28,
    });
    cd.label.style.fill = state === 'right' ? '#0b0d14' : '#ffffff';
    cd.mark.text = state === 'right' || state === 'reveal' ? `✓ ${tag}`.trim() : state === 'wrong' ? '✗' : state === 'sel' ? '●' : '';
    cd.mark.style.fill = state === 'right' ? '#0b0d14' : state === 'wrong' ? '#ffb8c8' : pal.highlight;
  }

  function layoutCards() {
    if (!cards.length) return;
    const gap = 14;
    const top = safe.y + safe.h * 0.6;
    const w = Math.min((safe.w - 36 - gap) / 2, 230);
    const h = Math.min(92, Math.max(64, safe.h * 0.11));
    const cx = safe.x + safe.w / 2;
    cards.forEach((cd, i) => {
      cd.w = w;
      cd.h = h;
      const col = i % 2;
      const row = Math.floor(i / 2);
      cd.c.position.set(cx + (col === 0 ? -1 : 1) * (w / 2 + gap / 2), top + h / 2 + row * (h + gap));
      cd.label.style.fontSize = Math.round(Math.min(24 * ctx.settings.textScale, (w / Math.max(4, [...cd.word].length)) * 1.6));
      cd.key.position.set(-w / 2 + 12, -h / 2 + 7);
      cd.key.visible = ctx.settings.showKeyHints && !preview;
      cd.mark.position.set(0, h / 2 - 15);
      drawCard(cd, cd.selected ? 'sel' : 'idle');
    });
  }

  function setCards(words: string[]) {
    clearCards();
    cards = words.map((w, i) => makeCard(w, i));
    layoutCards();
    cards.forEach((cd, i) => {
      const y = cd.c.y;
      cd.c.alpha = 0;
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 320 + i * 60, (k) => {
        cd.c.alpha = k;
        cd.c.y = y + (1 - k) * 30;
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
  let trials = 0;
  let correct = 0;
  let cuedN = 0;
  let cuedOk = 0;
  let uncuedN = 0;
  let uncuedOk = 0;
  let lang: VoiceLang = ctx.voice.lang();
  let pendingLang: VoiceLang = lang;
  let accepting = false;
  let need = 1;
  let picks: number[] = [];
  let resolvePick: ((p: number[]) => void) | null = null;
  let stopAmbient: (() => void) | null = null;
  let cueSide: Side | -1 = -1;

  const showWords = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';
  const dual = () => preview || ctx.voice.source() === 'sarvam';

  function setCue(mode: Mode | 'listen', target: Side) {
    cueSide = mode === 'cued' || mode === 'uncued' ? target : -1;
    const u = UI[lang];
    if (mode === 'listen') {
      cueArrow.text = '◀ ▶';
      cueArrow.style.fontSize = Math.round(orbR * 0.6);
      cueText.text = u.listenBoth;
      ears.forEach((e) => (e.focusTarget = 0.8));
    } else if (mode === 'both') {
      cueArrow.text = '◀ ▶';
      cueArrow.style.fontSize = Math.round(orbR * 0.6);
      cueText.text = u.reportBoth;
      ears.forEach((e) => (e.focusTarget = 1));
    } else {
      cueArrow.text = target === 0 ? '◀' : '▶';
      cueArrow.style.fontSize = Math.round(orbR * 1.1);
      cueText.text = target === 0 ? u.reportLeft : u.reportRight;
      ears.forEach((e, i) => (e.focusTarget = i === target ? 1 : 0.25));
    }
    cueArrow.alpha = cueText.alpha = 0;
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 260, (k) => (cueArrow.alpha = cueText.alpha = k));
  }

  function clearCue() {
    cueArrow.text = '';
    cueText.text = '';
    cueSide = -1;
    ears.forEach((e) => (e.focusTarget = 0.6));
  }

  function voiceOn(e: Ear) {
    e.pulse = 1;
    e.ripples.push(0);
    ctx.audio.chime(note(e === ears[0] ? 2 : 4), { gain: 0.025, dur: 0.5, pan: e === ears[0] ? -0.7 : 0.7 });
  }

  async function playWords(a: string, b: string, level: number) {
    status.text = UI[lang].listen;
    const pace = level >= 4 ? 1.1 : 1;
    const words = [a, b];
    if (dual()) {
      ears.forEach(voiceOn);
      if (showWords()) ears.forEach((e, i) => showBubble(e, words[i], true));
      const t0 = ctx.time();
      await Promise.race([
        Promise.all([
          ctx.voice.speak(a, { lang, voice: 'female', pan: -1, pace }),
          ctx.voice.speak(b, { lang, voice: 'male', pan: 1, pace }),
        ]),
        ctx.wait(3200),
      ]);
      const minShow = showWords() ? 1300 * (preview ? 1 : ctx.settings.timingMultiplier) : 0;
      await ctx.wait(Math.max(150, minShow - (ctx.time() - t0)));
    } else {
      for (const i of [0, 1] as const) {
        const e = ears[i];
        voiceOn(e);
        if (showWords()) showBubble(e, words[i], true);
        const t0 = ctx.time();
        await Promise.race([ctx.voice.speak(words[i], { lang, voice: i === 0 ? 'female' : 'male', pan: i === 0 ? -1 : 1 }), ctx.wait(2600)]);
        const minShow = showWords() ? 900 * ctx.settings.timingMultiplier : 0;
        await ctx.wait(Math.max(200, minShow - (ctx.time() - t0)));
        if (showWords()) showBubble(e, words[i], false);
      }
    }
    ears.forEach((e) => e.bubble.alpha > 0 && showBubble(e, e.bubbleText.text, false));
  }

  function choose(i: number) {
    if (!accepting || i >= cards.length) return;
    const cd = cards[i];
    if (need === 1) {
      accepting = false;
      resolvePick?.([i]);
      return;
    }
    cd.selected = !cd.selected;
    drawCard(cd, cd.selected ? 'sel' : 'idle');
    ctx.audio.tick();
    picks = cards.map((c, k) => (c.selected ? k : -1)).filter((k) => k >= 0);
    if (picks.length >= need) {
      accepting = false;
      resolvePick?.(picks);
    }
  }

  function waitPick(n: number): Promise<number[]> {
    need = n;
    picks = [];
    accepting = true;
    status.text = n === 2 ? UI[lang].pickTwo : UI[lang].pick;
    return new Promise((res) => {
      resolvePick = (p) => {
        resolvePick = null;
        res(p);
      };
    });
  }

  async function ghost(answers: string[]) {
    for (let k = 0; k < answers.length; k++) {
      await ctx.wait(900 + rng.next() * 600);
      if (!accepting || !alive) return;
      let idx = cards.findIndex((c) => c.word === answers[k]);
      if (rng.chance(0.15)) idx = cards.findIndex((c) => !answers.includes(c.word));
      const cd = cards[idx];
      await tween(ctx, 180, (t) => cd.c.scale.set(1 - 0.06 * Math.sin(t * Math.PI)));
      choose(idx);
    }
  }

  function hud(mode?: Mode) {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: trials / TRIALS,
      label: mode === 'both' ? 'Both ears' : mode === 'uncued' ? 'Cue after' : mode === 'cued' ? 'Cue first' : undefined,
    });
  }

  function modeFor(L: number): Mode {
    if (L >= 5) return rng.chance(0.6) ? 'both' : 'uncued';
    if (L >= 3) return rng.chance(0.75) ? 'uncued' : 'cued';
    return 'cued';
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([48, 55, 60, 67], { gain: 0.028, brightness: 0.25 });
    await ctx.wait(400);
    let first = true;
    while (alive) {
      lang = pendingLang;
      const L = stair.level;
      let mode = modeFor(L);
      const seqMode = !dual();
      if (seqMode && mode === 'cued') mode = 'uncued'; // sequential fallback: cue always after
      note2.text = seqMode && !preview ? UI[lang].seq : '';
      drawEars();
      const bank = WORDS[lang];
      const four = rng.shuffle([...bank]).slice(0, 4);
      const [a, b] = four;
      const target: Side = rng.chance(0.5) ? 0 : 1;
      ctx.voice.prefetch([a], { lang, voice: 'female' });
      ctx.voice.prefetch([b], { lang, voice: 'male' });
      hud(mode);

      if (first) {
        first = false;
        tip.text = UI[lang].tip;
        tip.alpha = 1;
        if (seqMode && !preview) ctx.caption(UI[lang].seq);
        await ctx.wait(preview ? 900 : 2000);
        void tween(ctx, 600, (k) => (tip.alpha = 1 - k));
      } else {
        await ctx.wait(ctx.voice.source() === 'sarvam' ? 600 : 350);
      }

      if (mode === 'cued') {
        setCue('cued', target);
        ctx.announce(target === 0 ? 'Listen to the left ear, her voice' : 'Listen to the right ear, his voice');
        await ctx.wait(1300 * (preview ? 1 : ctx.settings.timingMultiplier));
      } else {
        setCue('listen', target);
        await ctx.wait(700 * (preview ? 1 : ctx.settings.timingMultiplier));
      }
      await playWords(a, b, L);
      if (!alive) return;
      if (mode !== 'cued') setCue(mode, target);
      setCards(rng.shuffle([...four]));
      const answers = mode === 'both' ? [a, b] : [four[target]];
      ctx.announce(`${cueText.text} ${cards.map((c, i) => `${i + 1}: ${c.word}`).join(', ')}`);
      const p = waitPick(answers.length);
      if (preview) void ghost(answers);
      const chosen = await p;
      if (!alive) return;
      const ok = chosen.length === answers.length && chosen.every((i) => answers.includes(cards[i].word));
      trials++;
      if (mode === 'cued') {
        cuedN++;
        if (ok) cuedOk++;
      } else {
        uncuedN++;
        if (ok) uncuedOk++;
      }
      ctx.trial({ correct: ok, level: L });

      // feedback: mark picks, reveal the true words by each ear
      const tagFor = (w: string) => (w === a ? UI[lang].left : w === b ? UI[lang].right : '');
      cards.forEach((cd, i) => {
        const isAns = answers.includes(cd.word);
        const picked = chosen.includes(i);
        if (picked && isAns) drawCard(cd, 'right', tagFor(cd.word));
        else if (picked) drawCard(cd, 'wrong');
        else if (isAns) drawCard(cd, 'reveal', tagFor(cd.word));
      });
      ears.forEach((e, i) => showBubble(e, i === 0 ? a : b, true));
      if (ok) {
        correct++;
        score += mode === 'both' ? 25 : mode === 'uncued' ? 15 : 10;
        ctx.audio.success();
        ctx.haptics.success();
        chosen.forEach((i) => particles.burst(cards[i].c.x, cards[i].c.y, 18, { color: hex(pal.highlight), speed: 180, life: 0.7 }));
        status.text = lang === 'hi-IN' ? 'बढ़िया' : 'NICELY CAUGHT';
      } else {
        ctx.audio.thunk({ gain: 0.2 });
        ctx.haptics.error();
        ctx.caption(`Left said “${a}”, right said “${b}”`);
        status.text = lang === 'hi-IN' ? 'लगभग' : 'ALMOST';
      }
      stair.record(ok);
      if (preview && stair.level > 3) stair.set(1);
      hud(mode);
      await ctx.wait((ok ? 1300 : 2000) * (preview ? 1.3 : ctx.settings.timingMultiplier));
      ears.forEach((e) => showBubble(e, e.bubbleText.text, false));
      clearCards();
      clearCue();
      if (!preview && trials >= TRIALS) {
        await ctx.wait(500);
        const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
        ctx.end({
          score,
          levelReached: stair.level,
          stats: { accuracy: pct(correct, trials), cued: pct(cuedOk, cuedN), uncued: pct(uncuedOk, uncuedN) },
          message: correct / trials >= 0.75 ? 'Two voices, one calm listener.' : 'Splitting your ears gets easier with practice.',
        });
        return;
      }
      await ctx.wait(300);
    }
  }

  createLangToggle(ctx, (l) => {
    pendingLang = l;
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next round' : 'English from the next round');
  });

  const keyMap: Record<string, () => void> = {};
  for (let i = 0; i < 4; i++) {
    keyMap[`Digit${i + 1}`] = () => choose(i);
    keyMap[`Numpad${i + 1}`] = () => choose(i);
  }
  ctx.keys(keyMap);

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    ears.forEach((e, i) => {
      e.pulse = Math.max(0, e.pulse - dt / 800);
      e.focus += (e.focusTarget - e.focus) * Math.min(1, dt / 120);
      const breathe = reduced ? 0 : Math.sin(t * 1.4 + i * 1.7) * 0.03;
      const s = 1 + breathe + e.pulse * 0.15 + (e.focus - 0.6) * 0.15;
      e.orb.scale.set(s);
      e.icon.scale.set(i === 0 ? -s : s, s);
      e.halo.alpha = 0.15 + e.focus * 0.3 + e.pulse * 0.4;
      e.orb.alpha = e.icon.alpha = 0.45 + e.focus * 0.55;
      e.side.alpha = e.voice.alpha = 0.5 + e.focus * 0.5;
      e.rings.clear();
      for (let k = e.ripples.length - 1; k >= 0; k--) {
        e.ripples[k] += dt / 1100;
        const r = e.ripples[k];
        if (r >= 1) {
          e.ripples.splice(k, 1);
          continue;
        }
        // ripples travel toward the center (into the head)
        const dir = i === 0 ? 1 : -1;
        const rr = orbR * (1.1 + r * 1.6);
        const a0 = dir > 0 ? -0.9 : Math.PI - 0.9;
        e.rings.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
        e.rings.arc(0, 0, orbR * (1.1 + r * 1.6), dir > 0 ? -0.9 : Math.PI - 0.9, dir > 0 ? 0.9 : Math.PI + 0.9).stroke({
          width: 4 * (1 - r),
          color: earColor[i],
          alpha: 0.7 * (1 - r),
        });
      }
    });
    // soft center "head" glow linking both ears
    center.clear();
    const cx = safe.x + safe.w / 2;
    const span = safe.w * 0.6 - orbR * 2.4;
    if (!ctx.settings.highContrast) {
      for (let k = 0; k < 14; k++) {
        const x = cx - span / 2 + (span * k) / 13;
        const a = 0.12 + 0.1 * Math.sin(t * 3 - k * 0.5) * (reduced ? 0 : 1);
        const side = k < 7 ? 0 : 1;
        const lit = cueSide === -1 || cueSide === side ? 1 : 0.3;
        center.circle(x, earY, 2.5).fill({ color: earColor[side], alpha: a * lit * (cueArrow.text ? 0.5 : 1) });
      }
    }
    if (cueArrow.text && !reduced) cueArrow.x = cx + (cueSide === 0 ? -1 : cueSide === 1 ? 1 : 0) * Math.sin(t * 5) * 5;
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
