import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, easeOutCubic, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture } from '@/sdk/pixi';
import { parseDigits } from '@/sdk/speech';
import { createAnswerBar, createLangToggle } from '@/sdk/voiceui';
import { BACKWARDS_CUE, DIGIT_WORDS } from './content';

const FONT = 'Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const TRIALS = 12;
const MAX_MISSES = 3;
const GOOD = 0x7dffb0;
const BAD = 0xff8fb1;

type LState = 'dark' | 'lit' | 'held' | 'right' | 'wrong';

interface Lantern {
  c: Container;
  glow: Sprite;
  body: Graphics;
  digit: Text;
  mark: Text;
  you: Text;
  state: LState;
  x: number;
  y: number;
  light: number;
  target: number;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 3, max: 9, up: 2, down: 1 });
  if (preview) stair.set(4);
  const note = ctx.audio.scale(62, 'majorPenta');

  // ---- scene
  const bg = new Sprite(gradientTexture([
    [0, '#05060f'],
    [0.45, '#161234'],
    [1, '#0a0c1f'],
  ]));
  const skyGlow = new Sprite(glowTexture(256, 0.2));
  skyGlow.anchor.set(0.5);
  skyGlow.tint = hex(pal.accent2);
  skyGlow.alpha = 0.12;
  const motes = new Container();
  const ropeG = new Graphics();
  const lanternLayer = new Container();
  const ui = new Container();
  const fx = new Container();
  app.stage.addChild(bg, skyGlow, motes, ropeG, lanternLayer, ui, fx);
  const particles = createParticles(ctx, fx, 220);

  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const revIcon = new Text({ text: '↺', style: { fontFamily: FONT, fontSize: 64, fontWeight: '800', fill: pal.accent2 } });
  revIcon.anchor.set(0.5);
  revIcon.visible = false;
  const bubble = new Container();
  const bubbleBg = new Graphics();
  const bubbleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 24, fontWeight: '800', fill: '#ffffff', align: 'center', letterSpacing: 4 } });
  bubbleText.anchor.set(0.5);
  const bubbleLabel = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.6)', letterSpacing: 2 } });
  bubbleLabel.anchor.set(0.5);
  bubble.addChild(bubbleBg, bubbleText, bubbleLabel);
  bubble.visible = false;
  ui.addChild(status, revIcon, bubble);

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
  let ropeTop = 0;
  let lh = 50;
  let lw = 40;
  let lanterns: Lantern[] = [];

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    cx = safe.x + safe.w / 2;
    skyGlow.position.set(cx, safe.y + safe.h * 0.4);
    skyGlow.scale.set(Math.max(W, H) / 180);
    status.position.set(cx, safe.y + Math.max(92, safe.h * 0.12));
    ropeTop = status.y + 26;
    revIcon.position.set(cx - safe.w * 0.3, safe.y + safe.h * 0.42);
    bubble.position.set(cx, safe.y + safe.h * 0.86);
    drawBubble();
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    layoutLanterns();
  }

  function drawBubble() {
    const bw = Math.min(safe.w - 48, Math.max(200, bubbleText.width + 70));
    const bh = 64;
    bubbleBg.clear();
    const hc = ctx.settings.highContrast;
    bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 22).fill({ color: hc ? 0x000000 : 0x1a1838, alpha: 0.82 });
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

  // ---- lanterns
  function stateColor(s: LState): number {
    if (s === 'right') return GOOD;
    if (s === 'wrong') return BAD;
    return hex(pal.accent);
  }

  function drawLantern(L: Lantern) {
    const hc = ctx.settings.highContrast;
    const g = L.body;
    g.clear();
    const lit = L.state !== 'dark';
    const col = stateColor(L.state);
    const bodyCol = L.state === 'dark' ? (hc ? 0x000000 : 0x2a2446) : L.state === 'held' ? 0x6b4a2a : col;
    // hanger cap + tassel
    g.rect(-lw * 0.22, -lh / 2 - 6, lw * 0.44, 7).fill({ color: hc ? 0xffffff : 0x3a2e24 });
    g.moveTo(0, lh / 2).lineTo(0, lh / 2 + 9).stroke({ width: 2, color: lit ? col : 0x6b6390, alpha: 0.8 });
    g.circle(0, lh / 2 + 11, 3).fill({ color: lit ? col : 0x6b6390 });
    // body
    g.roundRect(-lw / 2, -lh / 2, lw, lh, lw * 0.42).fill({ color: bodyCol, alpha: L.state === 'dark' ? 0.9 : 0.96 });
    // ribs
    g.ellipse(0, 0, lw * 0.22, lh / 2 - 1).stroke({ width: 1.2, color: lit && L.state !== 'held' ? 0x3a2410 : 0xffffff, alpha: lit && L.state !== 'held' ? 0.25 : 0.14 });
    g.roundRect(-lw / 2, -lh / 2, lw, lh, lw * 0.42).stroke({
      width: hc ? 3 : 1.5,
      color: L.state === 'wrong' ? BAD : L.state === 'right' ? GOOD : 0xffffff,
      alpha: hc ? 1 : lit ? 0.6 : 0.25,
    });
    // highlight
    if (!hc) g.ellipse(-lw * 0.18, -lh * 0.18, lw * 0.1, lh * 0.18).fill({ color: 0xffffff, alpha: lit && L.state !== 'held' ? 0.35 : 0.08 });
    L.digit.style.fill = L.state === 'held' || L.state === 'dark' ? '#fff3d6' : '#1a1206';
    L.glow.tint = col;
    L.target = L.state === 'dark' ? 0 : L.state === 'held' ? 0.25 : L.state === 'lit' ? 1 : 0.7;
  }

  function makeLantern(): Lantern {
    const c = new Container();
    const glow = new Sprite(glowTexture(128, 0.28));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.alpha = 0;
    const body = new Graphics();
    const digit = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fontWeight: '900', fill: '#1a1206', align: 'center' } });
    digit.anchor.set(0.5);
    const mark = new Text({ text: '', style: { fontFamily: FONT, fontSize: 22, fontWeight: '900', fill: '#ffffff' } });
    mark.anchor.set(0, 0.5);
    const you = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: 'rgba(255,255,255,0.75)' } });
    you.anchor.set(1, 0.5);
    c.addChild(glow, body, digit, mark, you);
    lanternLayer.addChild(c);
    return { c, glow, body, digit, mark, you, state: 'dark', x: 0, y: 0, light: 0, target: 0 };
  }

  function layoutLanterns() {
    const n = lanterns.length;
    if (!n) return;
    const yTop = ropeTop + 26;
    const yEnd = safe.y + safe.h * 0.72;
    const step = Math.min(84, (yEnd - yTop) / n);
    lh = clamp(step * 0.8, 34, 62);
    lw = lh * 0.82;
    const total = step * (n - 1);
    const y0 = yTop + (yEnd - yTop - total) / 2;
    const zig = Math.min(safe.w * 0.07, 30);
    lanterns.forEach((L, i) => {
      L.x = cx + (i % 2 ? zig : -zig);
      L.y = y0 + i * step;
      L.c.position.set(L.x, L.y);
      L.glow.scale.set((lh / 64) * 1.6);
      L.digit.style.fontSize = Math.round(lh * 0.5 * Math.min(1.25, ctx.settings.textScale));
      L.mark.style.fontSize = Math.round(lh * 0.42);
      L.you.style.fontSize = Math.round(lh * 0.36 * Math.min(1.25, ctx.settings.textScale));
      L.mark.position.set(lw / 2 + 12, 0);
      L.you.position.set(-lw / 2 - 14, 0);
      drawLantern(L);
    });
  }

  function setLanterns(n: number) {
    lanterns.forEach((L) => L.c.destroy({ children: true }));
    lanterns = Array.from({ length: n }, () => makeLantern());
    layoutLanterns();
    lanterns.forEach((L, i) => {
      L.c.alpha = 0;
      const ty = L.y;
      void tween(ctx, ctx.settings.reducedMotion ? 1 : 360 + i * 50, (k) => {
        L.c.alpha = k;
        L.c.y = ty - (1 - k) * 30;
      }, easeOutCubic);
    });
  }

  function setState(L: Lantern, s: LState) {
    L.state = s;
    drawLantern(L);
  }

  // ---- state
  let alive = true;
  let score = 0;
  let trials = 0;
  let misses = 0;
  let digitsRight = 0;
  let digitsTotal = 0;
  let longest = 0;
  let longestBack = 0;
  let reverse = false;
  let lang: VoiceLang = ctx.voice.lang();
  let stopAmbient: (() => void) | null = null;
  let swayT = 0;

  const bar = createAnswerBar(ctx, { placeholder: 'Type the digits, e.g. 7 2 9', submitLabel: 'Enter' });
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
    ctx.voice.prefetch(DIGIT_WORDS[l], { lang: l });
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next string' : 'English from the next string');
  });
  const showDigits = () => preview || ctx.settings.captions || ctx.voice.source() === 'none';

  async function speakCapped(text: string, cap: number) {
    await Promise.race([ctx.voice.speak(text, { lang }), ctx.wait(cap)]);
  }

  async function present(seq: number[]) {
    status.text = reverse ? '↺  LISTEN, THEN SAY THEM BACKWARDS' : 'LISTEN';
    const step = 900 * ctx.settings.timingMultiplier;
    for (let i = 0; i < seq.length; i++) {
      if (!alive) return;
      const L = lanterns[i];
      L.digit.text = showDigits() ? String(seq[i]) : '';
      setState(L, 'lit');
      ctx.audio.chime(note(seq[i] % 5), { gain: 0.03, dur: 0.5 });
      particles.burst(L.x, L.y, 6, { color: hex(pal.accent), speed: 60, life: 0.6 });
      const t0 = ctx.time();
      await speakCapped(DIGIT_WORDS[lang][seq[i]], 1800);
      const spent = ctx.time() - t0;
      await ctx.wait(Math.max(120, step - spent - 180));
      if (!alive) return;
      L.digit.text = '';
      setState(L, 'held');
      await ctx.wait(180);
    }
  }

  function ghostAnswer(expected: number[]): string {
    const out = [...expected];
    if (rng.chance(0.2)) {
      const i = rng.int(0, out.length - 1);
      out[i] = (out[i] + rng.int(1, 8)) % 10;
    }
    return out.join(' ');
  }

  async function getAnswer(expected: number[]): Promise<number[]> {
    status.text = reverse ? '↺  SAY THEM BACKWARDS' : 'YOUR TURN';
    ctx.announce(`Your turn: say ${expected.length} digits${reverse ? ' backwards' : ''}`);
    if (preview) {
      // Ghost: "speaks" the digits into the bubble one by one so the mechanic reads silently.
      const said = parseDigits(ghostAnswer(expected));
      setBubble('SPEAKING…', '');
      await ctx.wait(500);
      for (let i = 0; i < said.length; i++) {
        bubbleText.text = said.slice(0, i + 1).join(' ');
        drawBubble();
        const li = reverse ? lanterns.length - 1 - i : i;
        lanterns[li].you.text = String(said[i]);
        await ctx.wait(360);
      }
      await ctx.wait(350);
      return said;
    }
    const prompt = reverse ? `↺ Say the ${expected.length} digits backwards` : `Say the ${expected.length} digits in order`;
    showBar(true);
    let said: number[] = [];
    for (let attempt = 0; attempt < 2 && alive; attempt++) {
      const text = await bar.ask({ prompt: attempt ? 'No digits heard. Please try once more.' : prompt, maxMs: 3500 + expected.length * 900 });
      said = parseDigits(text);
      if (said.length) break;
    }
    showBar(false);
    return said;
  }

  async function reveal(seq: number[], said: number[]): Promise<number> {
    const n = seq.length;
    const answerFor = (i: number) => (reverse ? said[n - 1 - i] : said[i]);
    setBubble('YOU SAID', said.length ? said.join(' ') : '(nothing)');
    let right = 0;
    for (let k = 0; k < n; k++) {
      if (!alive) return right;
      // reveal in answer order so the backwards mapping is visible
      const i = reverse ? n - 1 - k : k;
      const L = lanterns[i];
      const a = answerFor(i);
      L.digit.text = String(seq[i]);
      L.you.text = a === undefined ? '–' : String(a);
      if (a === seq[i]) {
        right++;
        setState(L, 'right');
        L.mark.text = '✓';
        L.mark.style.fill = '#7dffb0';
        L.you.style.fill = 'rgba(255,255,255,0.75)';
        ctx.audio.pluck(note(k + 1), { gain: 0.14 });
        particles.burst(L.x, L.y, 8, { color: GOOD, speed: 110, life: 0.5 });
      } else {
        setState(L, 'wrong');
        L.mark.text = '✕';
        L.mark.style.fill = '#ff8fb1';
        L.you.style.fill = '#ff8fb1';
        ctx.audio.thunk({ gain: 0.12 });
      }
      if (!ctx.settings.reducedMotion) {
        void tween(ctx, 260, (t) => L.c.scale.set(1 + 0.18 * (1 - t)), easeOutBack);
      }
      await ctx.wait(ctx.settings.reducedMotion ? 90 : 170);
    }
    return right;
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      lives: MAX_MISSES - misses,
      maxLives: MAX_MISSES,
      progress: trials / TRIALS,
      label: reverse ? '↺ Backwards' : undefined,
    });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 62, 69], { gain: 0.03, brightness: 0.25 });
    ctx.voice.prefetch([...DIGIT_WORDS[lang], BACKWARDS_CUE[lang]], { lang });
    await ctx.wait(400);
    while (alive) {
      const span = stair.level;
      reverse = preview ? rng.chance(0.3) : trials >= 3 && span >= 4 && rng.chance(0.4);
      const n = reverse ? Math.max(3, span - 1) : span;
      const seq: number[] = [];
      while (seq.length < n) {
        const d = rng.int(0, 9);
        if (seq.length && seq[seq.length - 1] === d) continue; // no immediate repeats (clearer to hear)
        seq.push(d);
      }
      setBubble('', '');
      revIcon.visible = reverse;
      setLanterns(n);
      hud();
      await ctx.wait(700);
      if (reverse) {
        status.text = '↺  BACKWARDS ROUND';
        ctx.caption('Backwards round');
        await speakCapped(BACKWARDS_CUE[lang], 1600);
        await ctx.wait(500);
      }
      await present(seq);
      if (!alive) return;
      const said = await getAnswer(reverse ? [...seq].reverse() : seq);
      if (!alive) return;
      status.text = '';
      const right = await reveal(seq, said);
      if (!alive) return;
      const ok = right === n && said.length === n;
      trials++;
      digitsRight += right;
      digitsTotal += n;
      ctx.trial({ correct: ok, level: span });
      if (ok) {
        score += Math.round(n * 10 * (reverse ? 1.5 : 1));
        if (reverse) longestBack = Math.max(longestBack, n);
        else longest = Math.max(longest, n);
        ctx.audio.success();
        ctx.haptics.success();
        lanterns.forEach((L, i) => ctx.after(i * 60, () => particles.burst(L.x, L.y, 14, { color: hex(pal.highlight), speed: 180, life: 0.9 })));
        status.text = 'PERFECT ECHO';
        ctx.announce('All digits right');
      } else {
        score += right * 2;
        misses++;
        ctx.haptics.error();
        status.text = right ? `${right} OF ${n} RIGHT` : 'NOT QUITE';
        ctx.announce(`${right} of ${n} digits right. The digits were ${seq.join(' ')}`);
      }
      stair.record(ok);
      if (preview && (stair.level > 5 || stair.level < 3)) stair.set(4);
      hud();
      if (!preview && (misses >= MAX_MISSES || trials >= TRIALS)) {
        await ctx.wait(1600);
        if (!alive) return;
        if (misses >= MAX_MISSES && trials < TRIALS && (await ctx.revive())) {
          if (!alive) return;
          misses = MAX_MISSES - 1;
          hud();
          status.text = 'SECOND CHANCE';
          ctx.audio.success();
          ctx.haptics.success();
          ctx.caption('Second chance!');
          ctx.announce('Second chance! One life restored');
          lanterns.forEach((L, i) => ctx.after(i * 60, () => particles.burst(L.x, L.y, 10, { color: hex(pal.highlight), speed: 160, life: 0.8 })));
          await ctx.wait(1200);
          continue;
        }
        ctx.end({
          score,
          levelReached: Math.max(longest, 3),
          stats: { longest, backward: longestBack, accuracy: digitsTotal ? Math.round((digitsRight / digitsTotal) * 100) : 0 },
          message: longest >= 7 ? 'A long string of lanterns, held perfectly.' : 'Your lantern string grows with every round.',
        });
        return;
      }
      await ctx.wait((ok ? 1500 : 2600) * (preview ? 1 : ctx.settings.timingMultiplier));
    }
  }

  // ---- animation
  let t = 0;
  ctx.loop((dt) => {
    t += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    if (!reduced) swayT += dt / 1000;
    // rope + lantern sway
    ropeG.clear();
    const hc = ctx.settings.highContrast;
    if (lanterns.length) {
      let px = cx;
      let py = ropeTop;
      ropeG.circle(cx, ropeTop, 4).fill({ color: hex(pal.highlight), alpha: 0.7 });
      lanterns.forEach((L, i) => {
        const sway = reduced ? 0 : Math.sin(swayT * 1.1 + i * 0.7) * (2 + i * 0.4);
        const x = L.x + sway;
        L.c.x = x;
        L.c.rotation = reduced ? 0 : Math.sin(swayT * 1.1 + i * 0.7 + 0.5) * 0.035;
        const topY = L.c.y - lh / 2 - 6;
        const midX = (px + x) / 2;
        ropeG.moveTo(px, py).quadraticCurveTo(midX, (py + topY) / 2 + 8, x, topY);
        px = x;
        py = L.c.y + lh / 2 + 14;
        L.light += (L.target - L.light) * Math.min(1, dt / 90);
        L.glow.alpha = L.light * (hc ? 0.5 : 0.85);
      });
      ropeG.stroke({ width: hc ? 2.5 : 1.5, color: hc ? 0xffffff : 0xcbb89a, alpha: hc ? 0.9 : 0.45 });
    }
    if (!reduced) {
      moteSprites.forEach((m, i) => {
        m.y -= (0.08 + (i % 5) * 0.035) * (dt / 16);
        if (m.y < -10) m.y = H + 10;
      });
      revIcon.rotation = -Math.sin(t * 1.5) * 0.25;
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
      layoutLanterns();
      drawBubble();
    },
    destroy() {
      alive = false;
      stopAmbient?.();
      ctx.voice.stop();
      bar.destroy();
    },
  };
}
