import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture } from '@/sdk/pixi';
import { normalizeText, similarity, words } from '@/sdk/speech';
import { createAnswerBar, createLangToggle } from '@/sdk/voiceui';
import { CATEGORIES, FILLER, type Category } from './content';

const FONT = 'Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const ROUNDS = 3;
const ROUND_MS = 40000;
const UNTIMED_GOAL = 12;
const PREVIEW_MS = 22000;
const DEVANAGARI = /[ऀ-ॿ]/;

/** Fold spelling variation: nukta, chandrabindu vs anusvara, hyphens. */
const fold = (s: string) => normalizeText(s).replace(/़/g, '').replace(/ँ/g, 'ं');

interface Concept {
  en: string;
  hi: string;
  singles: Map<string, 'en' | 'hi'>;
  multis: Array<{ toks: string[]; script: 'en' | 'hi' }>;
}

function compile(cat: Category): Concept[] {
  return cat.items.map((line) => {
    const [enPart, hiPart = ''] = line.split(' / ');
    const en = enPart.split('|').map((s) => s.trim()).filter(Boolean);
    const hi = hiPart.split('|').map((s) => s.trim()).filter(Boolean);
    const singles = new Map<string, 'en' | 'hi'>();
    const multis: Concept['multis'] = [];
    const add = (v: string, from: 'en' | 'hi') => {
      const script: 'en' | 'hi' = from === 'hi' && DEVANAGARI.test(v) ? 'hi' : from === 'hi' ? 'hi' : 'en';
      const f = fold(v);
      if (!f) return;
      if (f.includes(' ')) multis.push({ toks: f.split(' '), script });
      else if (!singles.has(f)) singles.set(f, script);
    };
    en.forEach((v) => add(v, 'en'));
    hi.forEach((v) => add(v, 'hi'));
    // Hindi label: first Devanagari variant.
    const hiLabel = hi.find((v) => DEVANAGARI.test(v)) ?? hi[0] ?? en[0];
    return { en: en[0], hi: hiLabel, singles, multis };
  });
}

interface Match {
  concept: number;
  script: 'en' | 'hi';
}

/** Match a transcript against a category. Returns matched concepts (in spoken order) and leftover, non-filler words. */
function matchTranscript(text: string, concepts: Concept[]): { hits: Match[]; rejected: string[] } {
  const toks = words(text.replace(/[,،।]/g, ' ')).map(fold);
  const used = toks.map(() => false);
  const hits: Array<Match & { at: number }> = [];
  // multi-word items first (e.g. "polar bear", "पत्ता गोभी")
  concepts.forEach((c, ci) => {
    for (const m of c.multis) {
      for (let i = 0; i + m.toks.length <= toks.length; i++) {
        let ok = true;
        for (let k = 0; k < m.toks.length; k++) if (used[i + k] || toks[i + k] !== m.toks[k]) ok = false;
        if (ok) {
          for (let k = 0; k < m.toks.length; k++) used[i + k] = true;
          hits.push({ concept: ci, script: m.script, at: i });
        }
      }
    }
  });
  toks.forEach((tk, i) => {
    if (used[i]) return;
    let best = -1;
    let script: 'en' | 'hi' = 'en';
    // exact, then simple English plurals, then a near-match for longer words (STT spelling drift)
    const tries = [tk];
    if (/^[a-z]+s$/.test(tk)) tries.push(tk.slice(0, -1), tk.endsWith('es') ? tk.slice(0, -2) : tk, tk.endsWith('ies') ? tk.slice(0, -3) + 'y' : tk);
    for (const w of tries) {
      for (let ci = 0; ci < concepts.length && best < 0; ci++) {
        const s = concepts[ci].singles.get(w);
        if (s) {
          best = ci;
          script = s;
        }
      }
      if (best >= 0) break;
    }
    if (best < 0 && [...tk].length >= 5) {
      let bestSim = 0.8;
      concepts.forEach((c, ci) => {
        c.singles.forEach((s, v) => {
          if ([...v].length < 5) return;
          const sim = similarity(tk, v);
          if (sim >= bestSim) {
            bestSim = sim;
            best = ci;
            script = s;
          }
        });
      });
    }
    if (best >= 0) {
      used[i] = true;
      hits.push({ concept: best, script, at: i });
    }
  });
  hits.sort((a, b) => a.at - b.at);
  const rawToks = words(text.replace(/[,،।]/g, ' '));
  const rejected = rawToks.filter((w, i) => !used[i] && !FILLER.has(w) && !FILLER.has(toks[i]));
  return { hits, rejected };
}

interface Star {
  c: Container;
  glow: Sprite;
  pill: Graphics;
  label: Text;
  x: number;
  y: number;
  w: number;
  h: number;
  born: number;
  /** index of the star this one hangs from (-1 = the orb) */
  parent: number;
}

interface Floater {
  t: Text;
  vy: number;
  life: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const note = ctx.audio.scale(65, 'majorPenta');

  // ---- scene
  const bg = new Sprite(gradientTexture([
    [0, '#04050f'],
    [0.5, '#171036'],
    [1, '#080a1c'],
  ]));
  const skyGlow = new Sprite(glowTexture(256, 0.2));
  skyGlow.anchor.set(0.5);
  skyGlow.tint = hex(pal.accent2);
  skyGlow.alpha = 0.12;
  const motes = new Container();
  const lines = new Graphics();
  const orbLayer = new Container();
  const starLayer = new Container();
  const floatLayer = new Container();
  const ui = new Container();
  const fx = new Container();
  app.stage.addChild(bg, skyGlow, motes, lines, orbLayer, starLayer, floatLayer, ui, fx);
  const particles = createParticles(ctx, fx, 260);

  const halo = new Sprite(glowTexture(256, 0.22));
  halo.anchor.set(0.5);
  halo.tint = hex(pal.accent);
  halo.blendMode = 'add';
  const ring = new Graphics();
  const core = new Graphics();
  const count = new Text({ text: '0', style: { fontFamily: FONT, fontSize: 40, fontWeight: '900', fill: '#1b1206', align: 'center' } });
  count.anchor.set(0.5);
  orbLayer.addChild(halo, ring, core, count);

  const kicker = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.6)', letterSpacing: 2, align: 'center' } });
  kicker.anchor.set(0.5);
  const title = new Text({ text: '', style: { fontFamily: FONT, fontSize: 30, fontWeight: '900', fill: pal.highlight, align: 'center' } });
  title.anchor.set(0.5);
  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fontWeight: '800', fill: pal.accent, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const bubble = new Container();
  const bubbleBg = new Graphics();
  const bubbleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '800', fill: '#ffffff', align: 'center' } });
  bubbleText.anchor.set(0.5);
  const bubbleLabel = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.6)', letterSpacing: 2 } });
  bubbleLabel.anchor.set(0.5);
  bubble.addChild(bubbleBg, bubbleLabel, bubbleText);
  bubble.visible = false;
  ui.addChild(kicker, title, status, bubble);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(46 * ctx.quality.particleScale) + 12; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? hex(pal.accent2) : hex(pal.accent);
    s.alpha = 0.15 + rng.next() * 0.35;
    s.scale.set(0.12 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let cx = 0;
  let orbX = 0;
  let orbY = 0;
  let orbR = 44;
  let areaTop = 0;
  let areaBot = 0;
  let stars: Star[] = [];
  const floaters: Floater[] = [];
  let pulse = 0;
  let timeFrac = 1; // remaining fraction of the round (1 = full)
  let untimed = false;

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    cx = safe.x + safe.w / 2;
    skyGlow.position.set(cx, safe.y + safe.h * 0.45);
    skyGlow.scale.set(Math.max(W, H) / 180);
    kicker.position.set(cx, safe.y + Math.max(88, safe.h * 0.11));
    title.position.set(cx, kicker.y + 28);
    title.style.fontSize = Math.round(Math.min(30, safe.w / 12) * Math.min(1.25, ctx.settings.textScale));
    title.style.wordWrap = true;
    title.style.wordWrapWidth = safe.w - 40;
    orbR = Math.min(safe.w * 0.11, 48);
    orbX = cx;
    orbY = safe.y + safe.h * 0.46;
    halo.position.set(orbX, orbY);
    ring.position.set(orbX, orbY);
    core.position.set(orbX, orbY);
    count.position.set(orbX, orbY);
    count.style.fontSize = Math.round(orbR * 0.85);
    status.position.set(cx, orbY + orbR + 30);
    areaTop = title.y + 34;
    areaBot = safe.y + safe.h * 0.75;
    bubble.position.set(cx, safe.y + safe.h * 0.86);
    drawBubble();
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    drawCore();
  }

  function drawCore() {
    const hc = ctx.settings.highContrast;
    core.clear();
    core.circle(0, 0, orbR).fill({ color: hc ? 0xffffff : hex(pal.accent), alpha: 0.95 });
    if (!hc) core.circle(-orbR * 0.3, -orbR * 0.32, orbR * 0.28).fill({ color: 0xffffff, alpha: 0.45 });
  }

  function drawBubble() {
    const bw = Math.min(safe.w - 36, Math.max(210, bubbleText.width + 60));
    const bh = 64;
    const hc = ctx.settings.highContrast;
    bubbleBg.clear();
    bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 22).fill({ color: hc ? 0x000000 : 0x18143a, alpha: 0.84 });
    bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 22).stroke({ width: hc ? 3 : 1.5, color: 0xffffff, alpha: hc ? 1 : 0.3 });
    bubbleLabel.position.set(0, -bh / 2 + 13);
    bubbleText.position.set(0, 8);
  }
  function setBubble(label: string, text: string) {
    bubbleLabel.text = label;
    bubbleText.text = text;
    bubble.visible = !!(label || text);
    drawBubble();
  }

  // ---- constellation stars
  function place(w: number, h: number): { x: number; y: number } {
    const x0 = safe.x + 12 + w / 2;
    const x1 = safe.x + safe.w - 12 - w / 2;
    const y0 = areaTop + h / 2;
    const y1 = areaBot - h / 2;
    let best = { x: cx, y: y0, score: -Infinity };
    for (let k = 0; k < 60; k++) {
      const x = x0 + rng.next() * Math.max(1, x1 - x0);
      const y = y0 + rng.next() * Math.max(1, y1 - y0);
      // keep clear of the orb + status line
      const dxo = Math.abs(x - orbX) - (w / 2 + orbR + 16);
      const dyo = Math.abs(y - (orbY + 12)) - (h / 2 + orbR + 30);
      let gap = Math.max(dxo, dyo);
      for (const s of stars) {
        const dx = Math.abs(x - s.x) - (w + s.w) / 2 - 6;
        const dy = Math.abs(y - s.y) - (h + s.h) / 2 - 6;
        gap = Math.min(gap, Math.max(dx, dy));
      }
      // prefer spots that don't overlap, then closer to the orb (a cluster that grows outwards)
      const dist = Math.hypot(x - orbX, (y - orbY) * 1.2);
      const score = (gap >= 0 ? 1000 : gap * 10) - dist * 0.6;
      if (score > best.score) best = { x, y, score };
    }
    return best;
  }

  function addStar(text: string) {
    const c = new Container();
    const glow = new Sprite(glowTexture(64, 0.3));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = hex(pal.accent);
    const pill = new Graphics();
    const size = Math.round((stars.length > 16 ? 15 : 17) * Math.min(1.25, ctx.settings.textScale));
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '800', fill: '#ffffff' } });
    label.anchor.set(0.5);
    const w = label.width + 26;
    const h = size + 16;
    const hc = ctx.settings.highContrast;
    pill.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: hc ? 0x000000 : 0x241a48, alpha: 0.88 });
    pill.roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ width: hc ? 2.5 : 1.5, color: hex(pal.accent), alpha: hc ? 1 : 0.75 });
    pill.circle(-w / 2 + 9, 0, 3).fill({ color: hex(pal.accent) });
    label.x = 4;
    glow.scale.set((w / 64) * 1.3, (h / 64) * 2.2);
    glow.alpha = 0.35;
    c.addChild(glow, pill, label);
    const p = place(w, h);
    let parent = -1;
    let pd = Math.hypot(p.x - orbX, p.y - orbY);
    stars.forEach((o, i) => {
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < pd) {
        pd = d;
        parent = i;
      }
    });
    c.position.set(orbX, orbY);
    starLayer.addChild(c);
    const s: Star = { c, glow, pill, label, x: p.x, y: p.y, w, h, born: ctx.time(), parent };
    stars.push(s);
    const reduced = ctx.settings.reducedMotion;
    c.scale.set(reduced ? 1 : 0.3);
    void tween(ctx, reduced ? 1 : 520, (k) => {
      c.position.set(orbX + (p.x - orbX) * k, orbY + (p.y - orbY) * k);
      c.scale.set(reduced ? 1 : 0.3 + 0.7 * k);
    }, easeOutBack).then(() => particles.burst(p.x, p.y, 10, { color: hex(pal.accent), speed: 120, life: 0.6 }));
  }

  function clearStars() {
    stars.forEach((s) => s.c.destroy({ children: true }));
    stars = [];
  }

  function floatWord(text: string, dup: boolean) {
    const t = new Text({
      text: dup ? `${text} (again)` : text,
      style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: dup ? 'rgba(255,230,170,0.8)' : 'rgba(200,200,215,0.75)' },
    });
    t.anchor.set(0.5);
    t.position.set(cx + (rng.next() - 0.5) * safe.w * 0.5, areaBot - 6);
    floatLayer.addChild(t);
    floaters.push({ t, vy: 18 + rng.next() * 10, life: 1.6 });
  }

  // ---- state
  let alive = true;
  let score = 0;
  let round = 0;
  let best = 0;
  let total = 0;
  let lang: VoiceLang = ctx.voice.lang();
  let stopAmbient: (() => void) | null = null;
  let concepts: Concept[] = [];
  let found = new Set<number>();
  let roundOver = false;
  let roundEndsAt = 0;
  let roundMs = ROUND_MS;
  let micBursts = 0;
  const catOrder = rng.shuffle(CATEGORIES.map((_, i) => i));

  const bar = createAnswerBar(ctx, { placeholder: 'Type words, e.g. dog cat cow', submitLabel: 'Add' });
  // SDK workaround: `.u-answer { display:flex }` overrides the [hidden] attribute bar.hide() sets, so toggle display too.
  const barEls = ctx.container.querySelectorAll<HTMLElement>('.u-answer');
  const barEl = barEls[barEls.length - 1] as HTMLElement | undefined;
  const showBar = (v: boolean) => {
    if (v) bar.show();
    else bar.hide();
    if (barEl) barEl.style.display = v ? '' : 'none';
  };
  showBar(false);
  createLangToggle(ctx, (l) => {
    lang = l;
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next round' : 'English from the next round');
  });

  const doneBtn = document.createElement('button');
  doneBtn.className = 'u-game-btn';
  doneBtn.type = 'button';
  doneBtn.textContent = 'Done ✓';
  doneBtn.style.cssText = 'position:absolute;left:16px;top:78px;display:none;z-index:6;';
  doneBtn.onclick = () => finishRound();
  if (!preview) ctx.container.appendChild(doneBtn);

  function finishRound() {
    if (roundOver) return;
    roundOver = true;
    bar.cancel();
  }

  function hud() {
    ctx.hud.set({
      score,
      level: round + 1,
      progress: (round + (untimed ? Math.min(1, found.size / UNTIMED_GOAL) : 1 - timeFrac)) / ROUNDS,
      timer: untimed ? undefined : Math.max(0, Math.ceil((roundEndsAt - ctx.time()) / 1000)),
      label: untimed ? `${found.size} / ${UNTIMED_GOAL}` : undefined,
    });
  }

  function labelFor(ci: number, script: 'en' | 'hi') {
    return script === 'hi' ? concepts[ci].hi : concepts[ci].en;
  }

  /** Apply one burst of speech/typing. */
  function processBurst(text: string) {
    if (!text.trim()) return;
    const { hits, rejected } = matchTranscript(text, concepts);
    let added = 0;
    hits.forEach((h, k) => {
      if (found.has(h.concept)) {
        ctx.after(k * 120, () => floatWord(labelFor(h.concept, h.script), true));
        return;
      }
      found.add(h.concept);
      added++;
      const label = labelFor(h.concept, h.script);
      ctx.after(k * 140, () => {
        if (!alive) return;
        addStar(label);
        pulse = 1;
        count.text = String(found.size);
        ctx.audio.pluck(note(found.size % 8), { gain: 0.16 });
        ctx.haptics.tick();
      });
    });
    rejected.forEach((w, k) => ctx.after(120 + k * 140, () => floatWord(w, false)));
    if (added) {
      score += added * 10;
      ctx.announce(`${found.size} so far`);
    } else if (!hits.length && rejected.length) {
      ctx.audio.thunk({ gain: 0.1 });
    }
    ctx.trial({ correct: added > 0, level: round + 1 });
    hud();
    if (untimed && found.size >= UNTIMED_GOAL) finishRound();
  }

  function ghostBurst(): string {
    const n = rng.chance(0.35) ? 2 : 1;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = rng.next();
      if (r < 0.1) {
        const other = CATEGORIES[(catOrder[round % CATEGORIES.length] + 1) % CATEGORIES.length];
        out.push(other.items[rng.int(0, other.items.length - 1)].split(' / ')[0].split('|')[0]);
      } else if (r < 0.16 && found.size) {
        const f = [...found][rng.int(0, found.size - 1)];
        out.push(lang === 'hi-IN' ? concepts[f].hi : concepts[f].en);
      } else {
        const c = concepts[rng.int(0, Math.min(concepts.length, 30) - 1)];
        out.push(lang === 'hi-IN' ? c.hi : c.en);
      }
    }
    return out.join(', ');
  }

  async function playRound(cat: Category) {
    concepts = compile(cat);
    found = new Set();
    clearStars();
    count.text = '0';
    roundOver = false;
    untimed = !preview && ctx.settings.noTimePressure;
    roundMs = preview ? PREVIEW_MS : ROUND_MS * ctx.settings.timingMultiplier;
    timeFrac = 1;
    kicker.text = `ROUND ${round + 1} OF ${ROUNDS}`;
    title.text = cat.name[lang];
    title.alpha = 0;
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 500, (k) => (title.alpha = k));
    status.text = 'GET READY';
    ctx.caption(`Category: ${cat.name[lang]}`);
    ctx.announce(`Round ${round + 1}. ${cat.name[lang]}`);
    pulse = 1;
    await Promise.race([ctx.voice.speak(cat.prompt[lang], { lang }), ctx.wait(3500)]);
    if (!alive) return;
    await ctx.wait(400);
    status.text = untimed ? `NAME ${UNTIMED_GOAL}` : 'GO!';
    ctx.audio.bell(note(4), { gain: 0.1 });
    roundEndsAt = ctx.time() + roundMs;
    hud();

    if (preview) {
      while (alive && ctx.time() < roundEndsAt) {
        await ctx.wait(700 + rng.next() * 700);
        if (!alive || ctx.time() >= roundEndsAt) break;
        const said = ghostBurst();
        setBubble('SAYING…', said);
        processBurst(said);
        if (found.size >= 14) break;
      }
      setBubble('', '');
      return;
    }

    showBar(true);
    doneBtn.style.display = untimed ? 'block' : 'none';
    const stopTimer = untimed ? () => {} : ctx.after(roundMs, finishRound);
    const what = cat.name['en-IN'].toLowerCase();
    ctx.after(1500, () => {
      if (!roundOver) status.text = untimed ? `GOAL: ${UNTIMED_GOAL}` : 'KEEP GOING';
    });
    while (alive && !roundOver) {
      const prompt = bar.mode() === 'mic' ? `Name ${what}! Tap the mic for each burst` : `Type ${what}, press Enter, keep going`;
      const p = bar.ask({ prompt, maxMs: 6000 });
      // Keep the mic flowing: after the player has started a burst themselves, open the next one automatically.
      if (bar.mode() === 'mic' && micBursts > 0) barEl?.querySelector<HTMLButtonElement>('.u-mic')?.click();
      const text = await p;
      if (!alive || roundOver) {
        if (text) processBurst(text);
        break;
      }
      if (text && bar.mode() === 'mic') micBursts++;
      processBurst(text);
      await ctx.wait(30);
    }
    stopTimer();
    doneBtn.style.display = 'none';
    showBar(false);
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([53, 60, 65, 72], { gain: 0.03, brightness: 0.35 });
    ctx.voice.prefetch(CATEGORIES.map((c) => c.prompt[lang]), { lang });
    await ctx.wait(400);
    while (alive) {
      const cat = CATEGORIES[catOrder[round % CATEGORIES.length]];
      await playRound(cat);
      if (!alive) return;
      const n = found.size;
      best = Math.max(best, n);
      total += n;
      timeFrac = 0;
      status.text = n ? `${n} WORD${n === 1 ? '' : 'S'}!` : 'TIME!';
      ctx.audio.success();
      ctx.haptics.success();
      stars.forEach((s, i) => ctx.after(i * 50, () => particles.burst(s.x, s.y, 8, { color: hex(pal.highlight), speed: 140, life: 0.8 })));
      // a few examples they didn't say (gentle learning moment)
      const missed = rng.shuffle(concepts.map((_, i) => i).filter((i) => !found.has(i))).slice(0, 3).map((i) => (lang === 'hi-IN' ? concepts[i].hi : concepts[i].en));
      setBubble('ALSO', missed.join(' · '));
      ctx.announce(`${n} words. Others: ${missed.join(', ')}`);
      round++;
      hud();
      if (!preview && round >= ROUNDS) {
        await ctx.wait(2600);
        ctx.end({
          score,
          levelReached: best,
          stats: { best, total, categories: round },
          message: best >= 15 ? 'A sky full of words.' : 'Every round, your constellation grows.',
        });
        return;
      }
      if (preview && round >= ROUNDS) round = 0;
      await ctx.wait(preview ? 2600 : 3200);
      setBubble('', '');
    }
  }

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    const hc = ctx.settings.highContrast;
    pulse = Math.max(0, pulse - dt / 600);
    if (!roundOver && roundEndsAt && !untimed && ctx.time() < roundEndsAt + 50) {
      timeFrac = clamp((roundEndsAt - ctx.time()) / roundMs, 0, 1);
    }
    const breathe = reduced ? 0 : Math.sin(t * 1.5) * 0.03;
    core.scale.set(1 + breathe + pulse * 0.14);
    count.scale.set(1 + pulse * 0.2);
    halo.scale.set((orbR / 64) * (2 + pulse * 0.9 + breathe * 3));
    halo.alpha = 0.35 + pulse * 0.4;
    // timer ring
    ring.clear();
    const rr = orbR + 12;
    ring.circle(0, 0, rr).stroke({ width: 5, color: 0xffffff, alpha: hc ? 0.4 : 0.1 });
    if (untimed) {
      const f = Math.min(1, found.size / UNTIMED_GOAL);
      if (f > 0) ring.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2).stroke({ width: 5, color: hex(pal.accent2), alpha: 0.95, cap: 'round' });
    } else if (timeFrac > 0.001) {
      const low = timeFrac < 0.25;
      ring.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + timeFrac * Math.PI * 2).stroke({
        width: 5,
        color: low ? 0xff9fb8 : hex(pal.accent2),
        alpha: 0.95,
        cap: 'round',
      });
    }
    // constellation lines (in the order words were found)
    lines.clear();
    if (stars.length) {
      for (const s of stars) {
        const from = s.parent >= 0 ? stars[s.parent].c : null;
        lines.moveTo(from ? from.x : orbX, from ? from.y : orbY).lineTo(s.c.x, s.c.y);
      }
      lines.stroke({ width: 1.2, color: hex(pal.accent), alpha: hc ? 0.6 : 0.28 });
    }
    const now = ctx.time();
    for (const s of stars) {
      const age = (now - s.born) / 1000;
      s.glow.alpha = 0.25 + Math.max(0, 0.6 - age) + (reduced ? 0 : Math.sin(t * 2 + s.x) * 0.06);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt / 1000;
      f.t.y -= (reduced ? 0 : f.vy) * (dt / 1000);
      f.t.alpha = clamp(f.life / 1.2, 0, 1) * 0.9;
      if (f.life <= 0) {
        f.t.destroy();
        floaters.splice(i, 1);
      }
    }
    if (!reduced) {
      moteSprites.forEach((m, i) => {
        m.y -= (0.08 + (i % 5) * 0.035) * (dt / 16);
        if (m.y < -10) m.y = H + 10;
      });
    }
    status.alpha = clamp(0.8 + Math.sin(t * 2.4) * 0.2, 0, 1);
  });
  // HUD timer tick (once per second is enough)
  let lastSec = -1;
  ctx.loop(() => {
    if (preview || untimed || roundOver || !roundEndsAt) return;
    const s = Math.ceil((roundEndsAt - ctx.time()) / 1000);
    if (s !== lastSec && s >= 0) {
      lastSec = s;
      hud();
      if (s <= 5 && s > 0) ctx.audio.tick();
    }
  });

  layout();
  ctx.onResize((l) => {
    layout();
    // re-seat stars inside the new safe area
    const old = stars.map((s) => s.label.text);
    clearStars();
    old.forEach((txt) => addStar(txt));
    void l;
  });

  return {
    start() {
      void run();
    },
    onSettings: () => {
      layout();
    },
    destroy() {
      alive = false;
      stopAmbient?.();
      ctx.voice.stop();
      bar.destroy();
      doneBtn.remove();
    },
  };
}
