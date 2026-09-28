import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, easeOutCubic, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture } from '@/sdk/pixi';
import { similarity, words } from '@/sdk/speech';
import { createAnswerBar, createLangToggle } from '@/sdk/voiceui';
import { LEVEL_NAMES, PROMPTS } from './content';

const FONT = 'Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const PROMPT_COUNT = 10;
const PERFECT = 0.85;
const CLOSE = 0.6;
const RIBBON_N = 140;

interface Chip {
  c: Container;
  bg: Graphics;
  label: Text;
  w: number;
  h: number;
}

/** Word-level alignment: which target words were heard and which heard words matched something (greedy, in order). */
function diffWords(target: string[], heard: string[]) {
  const tMatch = target.map(() => false);
  const hMatch = heard.map(() => false);
  let from = 0;
  target.forEach((tw, i) => {
    let found = -1;
    for (let j = from; j < heard.length; j++) {
      if (!hMatch[j] && similarity(tw, heard[j]) >= 0.75) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      for (let j = 0; j < from; j++) {
        if (!hMatch[j] && similarity(tw, heard[j]) >= 0.75) {
          found = j;
          break;
        }
      }
    }
    if (found >= 0) {
      tMatch[i] = true;
      hMatch[found] = true;
      from = Math.max(from, found + 1);
    }
  });
  return { tMatch, hMatch };
}

/** Amplitude envelope derived from the phrase's letters (vowels loud, spaces quiet), smoothed. */
function envelopeOf(text: string): number[] {
  const chars = [...text.toLowerCase()];
  const raw: number[] = chars.map((ch) => {
    if (ch === ' ') return 0.12;
    if (/[aeiouyअआइईउऊएऐओऔािीुूेैोौ]/.test(ch)) return 1;
    if (/[ऀ-ॿ]/.test(ch)) return 0.75;
    return 0.6;
  });
  if (!raw.length) raw.push(0.5);
  const out: number[] = [];
  for (let i = 0; i < RIBBON_N; i++) {
    const x = (i / (RIBBON_N - 1)) * (raw.length - 1);
    let s = 0;
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      const idx = clamp(Math.round(x) + k, 0, raw.length - 1);
      s += raw[idx];
      n++;
    }
    const edge = Math.sin((i / (RIBBON_N - 1)) * Math.PI);
    out.push((s / n) * (0.25 + 0.75 * Math.pow(edge, 0.6)));
  }
  return out;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 4, up: 2, down: 1 });
  if (preview) stair.set(2);
  const note = ctx.audio.scale(64, 'majorPenta');

  // ---- scene
  const bg = new Sprite(gradientTexture([
    [0, '#040915'],
    [0.5, '#121838'],
    [1, '#07101f'],
  ]));
  const skyGlow = new Sprite(glowTexture(256, 0.2));
  skyGlow.anchor.set(0.5);
  skyGlow.tint = hex(pal.accent2);
  skyGlow.alpha = 0.14;
  const motes = new Container();
  const ribbonGlow = new Graphics();
  ribbonGlow.blendMode = 'add';
  const ribbon = new Graphics();
  const pen = new Sprite(glowTexture(128, 0.25));
  pen.anchor.set(0.5);
  pen.blendMode = 'add';
  pen.tint = hex(pal.highlight);
  pen.visible = false;
  const chipLayer = new Container();
  const heardLayer = new Container();
  const ui = new Container();
  const fx = new Container();
  app.stage.addChild(bg, skyGlow, motes, ribbonGlow, ribbon, pen, chipLayer, heardLayer, ui, fx);
  const particles = createParticles(ctx, fx, 220);

  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const levelTag = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.55)', letterSpacing: 2 } });
  levelTag.anchor.set(0.5);
  const phrase = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 300 } });
  phrase.anchor.set(0.5);
  const pct = new Text({ text: '', style: { fontFamily: FONT, fontSize: 44, fontWeight: '900', fill: '#ffffff', align: 'center' } });
  pct.anchor.set(0.5);
  const verdict = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 3 } });
  verdict.anchor.set(0.5);
  const heardLabel = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.55)', letterSpacing: 2 } });
  heardLabel.anchor.set(0.5);
  const bubble = new Container();
  const bubbleBg = new Graphics();
  const bubbleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 280 } });
  bubbleText.anchor.set(0.5);
  const bubbleLabel = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.6)', letterSpacing: 2 } });
  bubbleLabel.anchor.set(0.5);
  bubble.addChild(bubbleBg, bubbleLabel, bubbleText);
  bubble.visible = false;
  ui.addChild(status, levelTag, phrase, pct, verdict, heardLabel, bubble);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(40 * ctx.quality.particleScale) + 10; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? hex(pal.accent) : hex(pal.accent2);
    s.alpha = 0.18 + rng.next() * 0.35;
    s.scale.set(0.15 + rng.next() * 0.35);
    motes.addChild(s);
    moteSprites.push(s);
  }

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let cx = 0;
  let ribY = 0;
  let ribX0 = 0;
  let ribW = 300;
  let ribA = 40;
  let chipsTop = 0;
  let heardTop = 0;
  let env: number[] = envelopeOf('');
  let drawP = 0; // 0..1 how much of the ribbon is drawn
  let energy = 0.4; // amplitude multiplier (animates while "speaking")
  let ribbonTint = hex(pal.accent);
  let chips: Chip[] = [];
  let heardChips: Chip[] = [];

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    cx = safe.x + safe.w / 2;
    skyGlow.position.set(cx, safe.y + safe.h * 0.34);
    skyGlow.scale.set(Math.max(W, H) / 180);
    status.position.set(cx, safe.y + Math.max(92, safe.h * 0.12));
    levelTag.position.set(cx, status.y + 24);
    phrase.position.set(cx, safe.y + safe.h * 0.235);
    phrase.style.wordWrapWidth = safe.w - 48;
    phrase.style.fontSize = Math.round(26 * Math.min(1.3, ctx.settings.textScale));
    ribY = safe.y + safe.h * 0.36;
    ribX0 = safe.x + 20;
    ribW = safe.w - 40;
    ribA = Math.min(safe.h * 0.065, 52);
    pct.position.set(cx, safe.y + safe.h * 0.47);
    verdict.position.set(cx, pct.y + 34);
    chipsTop = safe.y + safe.h * 0.55;
    bubble.position.set(cx, safe.y + safe.h * 0.86);
    bubbleText.style.wordWrapWidth = safe.w - 90;
    drawBubble();
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    layoutChips();
    positionReplay();
  }

  function drawBubble() {
    const bw = Math.min(safe.w - 36, Math.max(210, bubbleText.width + 60));
    const bh = Math.max(64, bubbleText.height + 40);
    const hc = ctx.settings.highContrast;
    bubbleBg.clear();
    bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 22).fill({ color: hc ? 0x000000 : 0x161a3c, alpha: 0.84 });
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

  // ---- word chips (target words, then what was heard)
  function makeChip(parent: Container, text: string, size: number): Chip {
    const c = new Container();
    const b = new Graphics();
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '800', fill: '#ffffff' } });
    label.anchor.set(0.5);
    c.addChild(b, label);
    parent.addChild(c);
    return { c, bg: b, label, w: label.width + size * 1.1, h: size * 2 };
  }

  function drawChip(ch: Chip, state: 'idle' | 'match' | 'miss' | 'heardOk' | 'heardNo') {
    const hc = ctx.settings.highContrast;
    const b = ch.bg;
    b.clear();
    const r = ch.h / 2;
    if (state === 'match') {
      b.roundRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h, r).fill({ color: hex(pal.accent), alpha: 0.95 });
      ch.label.style.fill = '#06201c';
    } else if (state === 'miss') {
      b.roundRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h, r).fill({ color: hc ? 0x000000 : 0x241c3c, alpha: 0.85 });
      b.roundRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h, r).stroke({ width: hc ? 3 : 2, color: 0xff9fc0, alpha: hc ? 1 : 0.8 });
      ch.label.style.fill = hc ? '#ffffff' : '#ffc4d8';
    } else if (state === 'heardOk') {
      ch.label.style.fill = hc ? '#ffffff' : pal.accent;
      b.roundRect(-ch.w / 2, ch.h / 2 - 4, ch.w, 3, 1.5).fill({ color: hex(pal.accent), alpha: 0.9 });
    } else if (state === 'heardNo') {
      ch.label.style.fill = hc ? '#dddddd' : 'rgba(255,255,255,0.45)';
    } else {
      b.roundRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h, r).fill({ color: hc ? 0x000000 : 0x1a2446, alpha: 0.8 });
      b.roundRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h, r).stroke({ width: hc ? 3 : 1.5, color: 0xffffff, alpha: hc ? 1 : 0.3 });
      ch.label.style.fill = '#ffffff';
    }
  }

  /** Flow chips into centered rows starting at `top`; returns the bottom y. */
  function flow(list: Chip[], top: number, gap: number): number {
    const maxW = safe.w - 32;
    const rows: Chip[][] = [];
    let row: Chip[] = [];
    let rw = 0;
    for (const ch of list) {
      if (row.length && rw + gap + ch.w > maxW) {
        rows.push(row);
        row = [];
        rw = 0;
      }
      rw += (row.length ? gap : 0) + ch.w;
      row.push(ch);
    }
    if (row.length) rows.push(row);
    let y = top;
    for (const r of rows) {
      const total = r.reduce((s, c) => s + c.w, 0) + gap * (r.length - 1);
      let x = cx - total / 2;
      const h = Math.max(...r.map((c) => c.h));
      for (const c of r) {
        c.c.position.set(x + c.w / 2, y + h / 2);
        x += c.w + gap;
      }
      y += h + gap;
    }
    return y;
  }

  function layoutChips() {
    const end = chips.length ? flow(chips, chipsTop, 8) : chipsTop;
    heardTop = end + 26;
    heardLabel.position.set(cx, heardTop - 8);
    if (heardChips.length) flow(heardChips, heardTop + 6, 4);
  }

  function clearChips() {
    chips.forEach((c) => c.c.destroy({ children: true }));
    heardChips.forEach((c) => c.c.destroy({ children: true }));
    chips = [];
    heardChips = [];
    heardLabel.text = '';
  }

  // ---- state
  let alive = true;
  let score = 0;
  let asked = 0;
  let perfect = 0;
  let matchSum = 0;
  let longest = 0;
  let replayed = false;
  let canReplay = false;
  let current = '';
  let lang: VoiceLang = ctx.voice.lang();
  let stopAmbient: (() => void) | null = null;
  const used = new Set<string>();

  const bar = createAnswerBar(ctx, { placeholder: 'Type what you heard', submitLabel: 'Enter' });
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
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next phrase' : 'English from the next phrase');
  });

  const replayBtn = document.createElement('button');
  replayBtn.className = 'u-game-btn';
  replayBtn.type = 'button';
  replayBtn.textContent = '↻ Hear again';
  replayBtn.style.cssText = 'position:absolute;left:50%;transform:translate(-50%,-50%);display:none;z-index:5;';
  replayBtn.onclick = () => void replay();
  if (!preview) ctx.container.appendChild(replayBtn);
  function positionReplay() {
    replayBtn.style.top = `${safe.y + safe.h * 0.47}px`;
  }
  function setReplay(v: boolean) {
    canReplay = v;
    replayBtn.style.display = v ? 'block' : 'none';
  }

  const showText = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';

  function pickPrompt(level: number): string {
    const bank = PROMPTS[lang][level - 1];
    const fresh = bank.filter((p) => !used.has(p));
    const p = rng.pick(fresh.length ? fresh : bank);
    used.add(p);
    return p;
  }

  async function speakPhrase(text: string) {
    env = envelopeOf(text);
    ribbonTint = hex(pal.accent);
    phrase.text = showText() ? `“${text}”` : '';
    phrase.alpha = 1;
    pen.visible = true;
    const est = (900 + [...text].length * 75) * (preview ? 1 : ctx.settings.timingMultiplier);
    const t0 = ctx.time();
    let speaking = true;
    const draw = (async () => {
      drawP = 0;
      while (alive && (drawP < 1 || speaking)) {
        await ctx.wait(16);
        const k = (ctx.time() - t0) / est;
        drawP = Math.min(1, Math.max(drawP, k));
        energy = speaking ? 1 : Math.max(0.45, energy - 0.03);
        if (!speaking && drawP >= 1) break;
      }
    })();
    ctx.audio.chime(note(2), { gain: 0.03, dur: 0.7 });
    await Promise.race([ctx.voice.speak(text, { lang, pace: stair.level >= 4 ? 0.9 : 1 }), ctx.wait(2500 + [...text].length * 110)]);
    const spent = ctx.time() - t0;
    if (spent < est) await ctx.wait(est - spent);
    speaking = false;
    await draw;
    drawP = 1;
    energy = 0.45;
    pen.visible = false;
  }

  async function replay() {
    if (!canReplay || replayed) return;
    replayed = true;
    setReplay(false);
    await speakPhrase(current);
    if (!alive || preview) return;
    phrase.text = '';
    if (bar.mode() === 'typing') barEl?.querySelector<HTMLInputElement>('.u-answer-input')?.focus();
  }

  function ghostTranscript(target: string): string {
    const ws = target.split(' ');
    if (rng.chance(0.3) && ws.length) {
      const i = rng.int(0, ws.length - 1);
      const w = [...ws[i]];
      if (w.length > 2) w.splice(rng.int(1, w.length - 1), 1);
      ws[i] = w.join('');
    }
    if (rng.chance(0.12) && ws.length > 2) ws.pop();
    return ws.join(' ');
  }

  async function getAnswer(target: string): Promise<string> {
    status.text = 'YOUR TURN: SAY IT BACK';
    ctx.announce('Your turn. Say it back.');
    if (preview) {
      const said = ghostTranscript(target);
      setBubble('SPEAKING…', '');
      await ctx.wait(450);
      const cps = [...said];
      for (let i = 0; i < cps.length; i += 2) {
        bubbleText.text = cps.slice(0, i + 2).join('');
        drawBubble();
        await ctx.wait(70);
      }
      await ctx.wait(400);
      return said;
    }
    showBar(true);
    setReplay(!replayed);
    const n = words(target).length;
    const text = await bar.ask({ prompt: 'Say it back, just as you heard it', maxMs: 3500 + n * 900 });
    setReplay(false);
    showBar(false);
    return text;
  }

  function showResult(target: string, heard: string, sim: number) {
    clearChips();
    const tw = target.split(' ').filter(Boolean);
    const hwRaw = heard.split(/\s+/).filter(Boolean);
    const { tMatch, hMatch } = diffWords(tw.map((w) => words(w).join(' ')), hwRaw.map((w) => words(w).join(' ')));
    const size = Math.round((tw.length > 6 ? 17 : 20) * Math.min(1.25, ctx.settings.textScale));
    chips = tw.map((w, i) => {
      const ch = makeChip(chipLayer, w, size);
      drawChip(ch, tMatch[i] ? 'match' : 'miss');
      return ch;
    });
    heardLabel.text = heard ? 'YOU SAID' : 'NOTHING HEARD';
    heardChips = hwRaw.map((w, i) => {
      const ch = makeChip(heardLayer, w, Math.round(16 * Math.min(1.25, ctx.settings.textScale)));
      ch.w = ch.label.width + 8;
      ch.h = 30;
      drawChip(ch, hMatch[i] ? 'heardOk' : 'heardNo');
      return ch;
    });
    layoutChips();
    chips.forEach((ch, i) => {
      ch.c.alpha = 0;
      const y = ch.c.y;
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 300 + i * 60, (k) => {
        ch.c.alpha = k;
        ch.c.y = y + (1 - k) * 14;
      }, easeOutCubic);
      if (tMatch[i]) ctx.after(200 + i * 70, () => particles.burst(ch.c.x, ch.c.y, 6, { color: hex(pal.accent), speed: 90, life: 0.5 }));
    });
    const p = Math.round(sim * 100);
    pct.text = `${p}%`;
    pct.style.fill = sim >= PERFECT ? pal.accent : sim >= CLOSE ? pal.highlight : '#ffc4d8';
    verdict.text = sim >= PERFECT ? '★ PERFECT ★' : sim >= CLOSE ? 'CLOSE' : heard ? 'KEEP LISTENING' : 'NO ANSWER';
    pct.scale.set(0.6);
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 420, (k) => pct.scale.set(0.6 + 0.4 * k), easeOutBack);
    phrase.text = `“${target}”`;
    ribbonTint = sim >= PERFECT ? hex(pal.accent) : sim >= CLOSE ? hex(pal.highlight) : 0xff9fc0;
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, progress: asked / PROMPT_COUNT, label: LEVEL_NAMES[stair.level - 1] });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([55, 62, 67, 74], { gain: 0.03, brightness: 0.3 });
    let next = pickPrompt(stair.level);
    await ctx.wait(400);
    while (alive) {
      const level = stair.level;
      current = next;
      replayed = false;
      clearChips();
      setBubble('', '');
      pct.text = '';
      verdict.text = '';
      phrase.text = '';
      drawP = 0;
      levelTag.text = LEVEL_NAMES[level - 1].toUpperCase();
      status.text = 'LISTEN';
      hud();
      ctx.voice.prefetch([current], { lang, pace: level >= 4 ? 0.9 : 1 });
      await ctx.wait(ctx.voice.source() === 'sarvam' ? 800 : 500);
      if (!alive) return;
      await speakPhrase(current);
      if (!alive) return;
      if (!preview) phrase.text = ''; // hide the text while answering (it would give the answer away)
      const heard = await getAnswer(current);
      if (!alive) return;
      status.text = '';
      const sim = heard ? similarity(heard, current) : 0;
      setBubble('', '');
      showResult(current, heard, sim);
      asked++;
      matchSum += sim;
      const n = words(current).length;
      ctx.trial({ correct: sim >= PERFECT, level });
      const mult = replayed ? 0.5 : 1;
      if (sim >= PERFECT) {
        perfect++;
        longest = Math.max(longest, n);
        score += Math.round(20 * level * mult);
        ctx.audio.success();
        ctx.haptics.success();
        particles.burst(cx, ribY, 50, { color: hex(pal.highlight), speed: 260, life: 1 });
        stair.record(true);
        ctx.announce(`Perfect! ${Math.round(sim * 100)} percent match.`);
      } else if (sim >= CLOSE) {
        longest = Math.max(longest, n);
        score += Math.round(10 * level * mult);
        ctx.audio.bell(note(4), { gain: 0.08 });
        ctx.haptics.tick();
        ctx.announce(`Close: ${Math.round(sim * 100)} percent match. It was: ${current}`);
      } else {
        ctx.audio.thunk({ gain: 0.18 });
        ctx.haptics.error();
        stair.record(false);
        ctx.announce(`${Math.round(sim * 100)} percent match. It was: ${current}`);
      }
      if (preview && stair.level > 3) stair.set(2);
      hud();
      if (!preview && asked >= PROMPT_COUNT) {
        await ctx.wait(2000);
        ctx.end({
          score,
          levelReached: stair.level,
          stats: { perfect, match: Math.round((matchSum / Math.max(1, asked)) * 100), longest },
          message: perfect >= 7 ? 'Crystal-clear echoes, one after another.' : 'Every repeat tunes your ear a little more.',
        });
        return;
      }
      next = pickPrompt(stair.level);
      ctx.voice.prefetch([next], { lang, pace: stair.level >= 4 ? 0.9 : 1 });
      await ctx.wait((sim >= PERFECT ? 2600 : 3400) * (preview ? 1 : ctx.settings.timingMultiplier));
    }
  }

  ctx.keys({ KeyR: () => void replay() });

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    const hc = ctx.settings.highContrast;
    ribbon.clear();
    ribbonGlow.clear();
    // baseline
    ribbon.moveTo(ribX0, ribY).lineTo(ribX0 + ribW, ribY).stroke({ width: 1, color: 0xffffff, alpha: hc ? 0.5 : 0.12 });
    const upto = Math.max(1, Math.floor(drawP * (RIBBON_N - 1)));
    if (drawP > 0) {
      const phase = reduced ? 0 : t * 2.2;
      const layers = [
        { f: 0.32, ph: 0, amp: 1, col: ribbonTint, w: hc ? 4 : 3, a: 0.95 },
        { f: 0.21, ph: 1.7, amp: 0.7, col: hex(pal.accent2), w: 2, a: hc ? 0 : 0.7 },
        { f: 0.45, ph: 3.1, amp: 0.45, col: hex(pal.highlight), w: 1.5, a: hc ? 0 : 0.55 },
      ];
      let tipX = ribX0;
      let tipY = ribY;
      for (const L of layers) {
        if (L.a <= 0) continue;
        for (let i = 0; i <= upto; i++) {
          const x = ribX0 + (i / (RIBBON_N - 1)) * ribW;
          const y = ribY + Math.sin(i * L.f + phase + L.ph) * env[i] * ribA * L.amp * energy;
          if (i === 0) {
            ribbon.moveTo(x, y);
            ribbonGlow.moveTo(x, y);
          } else {
            ribbon.lineTo(x, y);
            ribbonGlow.lineTo(x, y);
          }
          if (L === layers[0]) {
            tipX = x;
            tipY = y;
          }
        }
        ribbon.stroke({ width: L.w, color: L.col, alpha: L.a });
        if (!hc) ribbonGlow.stroke({ width: L.w * 5, color: L.col, alpha: 0.12 });
      }
      pen.position.set(tipX, tipY);
      pen.scale.set(0.35 + energy * 0.15);
    }
    if (!reduced) {
      moteSprites.forEach((m, i) => {
        m.y -= (0.08 + (i % 5) * 0.035) * (dt / 16);
        if (m.y < -10) m.y = H + 10;
      });
    }
    status.alpha = clamp(0.78 + Math.sin(t * 2) * 0.22, 0, 1);
  });

  layout();
  ctx.onResize(layout);

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
      replayBtn.remove();
    },
  };
}
