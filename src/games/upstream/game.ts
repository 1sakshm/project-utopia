import { Container, Graphics, Sprite, Text, TilingSprite, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, tween } from '@/sdk';
import { createPixiApp, glowTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { ANGLE, DIR_WORD, VEC, levelParams, makeTrial, type Dir, type Trial } from './logic';
import { brushStroke, drawEnso, makeKoi, makeLilyPad, paperTexture, type Koi } from './art';

const ROUNDS = 2;
const TRIALS = 40;
const FONT = 'Manrope, system-ui, sans-serif';
const INK = 0x1c1a18;
const VERMILION = 0xc8452d;
const MAX_FLANK = 8;

interface Fish {
  koi: Koi;
  lily: Container | null;
  gx: number;
  gy: number;
  angle: number;
  x: number;
  y: number;
  active: boolean;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const preview = ctx.mode === 'preview';
  const app = await createPixiApp(ctx, { background: ctx.settings.highContrast ? 0xffffff : 0xefe6d2 });
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 14, up: 3, down: 1 });
  if (preview) stair.set(4);
  const untimed = !preview && ctx.settings.noTimePressure;
  const koto = ctx.audio.scale(62, 'minorPenta');
  const low = ctx.quality.tier === 'low';

  // ---------------------------------------------------------------- layers
  const paper = new TilingSprite({ texture: paperTexture(), width: 10, height: 10 });
  const wash = new Container();
  const decor = new Graphics();
  const pads = new Container();
  const ripplesLayer = new Container();
  const strokes = new Container();
  const school = new Container();
  const petals = new Container();
  const ui = new Container();
  app.stage.addChild(paper, wash, decor, pads, ripplesLayer, strokes, school, petals, ui);

  // ink wash clouds drifting in the water
  const washSprites: Array<{ s: Sprite; ph: number; bx: number; by: number }> = [];
  for (let i = 0; i < (low ? 3 : 5); i++) {
    const s = new Sprite(glowTexture(256, 0.12));
    s.anchor.set(0.5);
    s.tint = i % 2 ? 0x3b4a44 : 0x2a2622;
    s.alpha = 0.07;
    wash.addChild(s);
    washSprites.push({ s, ph: rng.next() * 10, bx: rng.next(), by: rng.next() });
  }
  // decorative lily pads near the edges
  const decoPads: Array<{ c: Container; bx: number; by: number; ph: number }> = [];
  for (let i = 0; i < 4; i++) {
    const c = makeLilyPad(false);
    c.alpha = 0.55;
    pads.addChild(c);
    decoPads.push({ c, bx: i % 2 ? 0.92 : 0.06, by: [0.2, 0.34, 0.8, 0.66][i], ph: rng.next() * 10 });
  }

  // ---------------------------------------------------------------- fish pool
  const fish: Fish[] = [];
  for (let i = 0; i < MAX_FLANK; i++) {
    const koi = makeKoi({ lead: false, patches: rng.int(0, 2), seed: i + 3, hc: ctx.settings.highContrast });
    koi.c.visible = false;
    school.addChild(koi.c);
    const lily = makeLilyPad(ctx.settings.highContrast);
    lily.visible = false;
    school.addChild(lily);
    fish.push({ koi, lily, gx: 0, gy: 0, angle: 0, x: 0, y: 0, active: false });
  }
  const leadKoi = makeKoi({ lead: true, patches: 1, seed: 1, hc: ctx.settings.highContrast });
  const enso = new Graphics();
  const leadWrap = new Container();
  leadWrap.addChild(enso, leadKoi.c);
  leadWrap.visible = false;
  school.addChild(leadWrap);
  const lead: Fish = { koi: leadKoi, lily: null, gx: 0, gy: 0, angle: 0, x: 0, y: 0, active: false };

  function rebuildKoi() {
    // High contrast swaps the whole ink set (black koi on white paper).
    const hc = ctx.settings.highContrast;
    for (let i = 0; i < MAX_FLANK; i++) {
      const f = fish[i];
      const k = makeKoi({ lead: false, patches: rng.int(0, 2), seed: i + 3, hc });
      const idx = school.getChildIndex(f.koi.c);
      k.c.visible = f.koi.c.visible;
      k.c.position.copyFrom(f.koi.c.position);
      k.c.rotation = f.koi.c.rotation;
      k.c.scale.copyFrom(f.koi.c.scale);
      k.c.alpha = f.koi.c.alpha;
      school.addChildAt(k.c, idx);
      f.koi.c.destroy({ children: true });
      f.koi = k;
      const lily = makeLilyPad(hc);
      const li = school.getChildIndex(f.lily!);
      lily.visible = f.lily!.visible;
      lily.position.copyFrom(f.lily!.position);
      lily.alpha = f.lily!.alpha;
      school.addChildAt(lily, li);
      f.lily!.destroy({ children: true });
      f.lily = lily;
    }
    const nk = makeKoi({ lead: true, patches: 1, seed: 1, hc });
    nk.c.rotation = lead.koi.c.rotation;
    leadWrap.addChild(nk.c);
    lead.koi.c.destroy({ children: true });
    lead.koi = nk;
  }

  // ---------------------------------------------------------------- ripples / ink blooms / strokes / petals
  const ripples: Array<{ g: Graphics; t: number; dur: number; r: number }> = [];
  for (let i = 0; i < 10; i++) {
    const g = new Graphics().circle(0, 0, 50).stroke({ width: 2.2, color: INK });
    g.visible = false;
    ripplesLayer.addChild(g);
    ripples.push({ g, t: -1, dur: 1, r: 60 });
  }
  function ripple(x: number, y: number, r: number, dur: number, delay = 0) {
    const go = () => {
      const q = ripples.find((p) => p.t < 0) ?? ripples[0];
      q.t = 0;
      q.dur = dur;
      q.r = r;
      q.g.position.set(x, y);
      q.g.visible = true;
    };
    if (delay > 0) ctx.after(delay, go);
    else go();
  }
  const blooms: Array<{ s: Sprite; t: number; r: number; a: number }> = [];
  for (let i = 0; i < 4; i++) {
    const s = new Sprite(glowTexture(128, 0.3));
    s.anchor.set(0.5);
    s.tint = INK;
    s.visible = false;
    ripplesLayer.addChildAt(s, 0);
    blooms.push({ s, t: -1, r: 1, a: 0.2 });
  }
  function bloom(x: number, y: number, r: number, a: number, tint = INK) {
    const b = blooms.find((p) => p.t < 0) ?? blooms[0];
    b.t = 0;
    b.r = r;
    b.a = a;
    b.s.tint = tint;
    b.s.position.set(x, y);
    b.s.visible = true;
  }
  const strokePool: Array<{ g: Graphics; t: number }> = [];
  for (let i = 0; i < 3; i++) {
    const g = new Graphics();
    g.visible = false;
    strokes.addChild(g);
    strokePool.push({ g, t: -1 });
  }
  function inkStroke(x0: number, y0: number, x1: number, y1: number) {
    const st = strokePool.find((p) => p.t < 0) ?? strokePool[0];
    st.g.clear();
    brushStroke(st.g, x0, y0, x1, y1, 7 * unit, ctx.settings.highContrast ? 0x000000 : INK, 0.3);
    st.g.visible = true;
    st.g.alpha = 1;
    st.t = 0;
  }
  const petalList: Array<{ g: Graphics; x: number; y: number; vx: number; vy: number; rot: number; vr: number; ph: number }> = [];
  for (let i = 0; i < (low ? 7 : 12); i++) {
    const g = new Graphics();
    g.moveTo(0, -6).quadraticCurveTo(5, -2, 0, 6).quadraticCurveTo(-5, -2, 0, -6).fill({ color: i % 3 === 0 ? 0xe9a8a0 : 0xf2c4bb, alpha: 0.9 });
    g.moveTo(0, -4).lineTo(0, 3).stroke({ width: 0.6, color: VERMILION, alpha: 0.4 });
    petals.addChild(g);
    petalList.push({ g, x: rng.next(), y: rng.next(), vx: 0.004 + rng.next() * 0.006, vy: 0.008 + rng.next() * 0.01, rot: rng.next() * 6, vr: (rng.next() - 0.5) * 0.8, ph: rng.next() * 10 });
  }

  // ---------------------------------------------------------------- UI: chevrons (tap zones), banner, hints
  const chevrons = new Graphics();
  const hint = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: 0x3a342c, align: 'center' } });
  hint.anchor.set(0.5);
  const banner = new Text({ text: '', style: { fontFamily: FONT, fontSize: 28, fontWeight: '800', fill: INK, align: 'center' } });
  banner.anchor.set(0.5);
  banner.alpha = 0;
  const feedback = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: INK, align: 'center' } });
  feedback.anchor.set(0.5);
  feedback.alpha = 0;
  // Soft look: the ink-wash paper is the game's identity, so it stays light; only the tap-zone chevrons sit on small
  // raised paper buttons (light-on-paper neumorphism) so they read as the controls they are.
  const soft = () => ctx.settings.soft;
  const PAPER = '#ebe1cb';
  const sres = ctx.quality.maxDpr;
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }
  const chevTiles = [0, 1, 2, 3].map(() => {
    const t = new Sprite();
    t.anchor.set(0.5);
    t.alpha = 0.9;
    return t;
  });
  // below the school so the buttons never cover a fish (the flanker display must stay fully visible)
  const chevTileLayer = new Container();
  chevTileLayer.addChild(...chevTiles);
  app.stage.addChildAt(chevTileLayer, app.stage.getChildIndex(school));
  ui.addChild(chevrons, hint, banner, feedback);

  // ---------------------------------------------------------------- layout
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let unit = 1;
  let cx = 0;
  let cy = 0;
  let spacing = { x: 84, y: 54 };
  let fourDirShown = false;

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = ctx.settings.highContrast;
    unit = clamp(safe.w / 390, 0.8, 1.5);
    paper.width = W;
    paper.height = H;
    paper.tint = hc ? 0xffffff : 0xffffff;
    paper.visible = !hc;
    app.renderer.background.color = hc ? 0xffffff : 0xefe6d2;
    cx = safe.x + safe.w / 2;
    cy = safe.y + safe.h * 0.52;
    washSprites.forEach((w, i) => w.s.scale.set((Math.max(W, H) / 256) * (0.5 + (i % 3) * 0.2)));
    wash.visible = !hc;
    petals.visible = !hc && !ctx.settings.reducedMotion;
    pads.visible = !hc;
    for (const p of decoPads) p.c.scale.set(unit * 1.2);
    drawDecor();
    drawChevrons();
    drawEnso(enso, 50, hc ? 0x000000 : INK, hc ? 0.9 : 0.5, hc ? 7 : 6);
    hint.position.set(cx, safe.y + safe.h - 84);
    hint.style.fontSize = 14 * ctx.settings.textScale;
    hint.style.fill = hc ? 0x000000 : 0x3a342c;
    banner.position.set(cx, safe.y + safe.h * 0.24);
    feedback.position.set(cx, safe.y + safe.h * 0.78);
    placeFormation();
  }

  function drawDecor() {
    decor.clear();
    const hc = ctx.settings.highContrast;
    if (hc) return;
    // reeds from the bottom-left and top-right corners (brush leaves)
    const leaf = (x: number, y: number, a: number, len: number, w: number, alpha: number) => {
      brushStroke(decor, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, w, INK, alpha);
    };
    const bx = Math.min(safe.x, W * 0.02) + 4;
    for (let i = 0; i < 6; i++) leaf(bx - 10, H + 10, -1.25 + i * 0.12, (110 + i * 22) * unit, (4 + (i % 2) * 2) * unit, 0.18 + (i % 3) * 0.06);
    const tx = Math.max(safe.x + safe.w, W * 0.98) - 4;
    for (let i = 0; i < 4; i++) leaf(tx + 10, -10, 1.9 + i * 0.14, (90 + i * 26) * unit, (3.5 + (i % 2) * 2) * unit, 0.14 + (i % 2) * 0.06);
    // hanko seal stamp in the lower-right corner
    const sx = safe.x + safe.w - 34 * unit;
    const sy = safe.y + safe.h - 34 * unit;
    const s = 18 * unit;
    decor.roundRect(sx - s / 2, sy - s / 2, s, s, 2).fill({ color: VERMILION, alpha: 0.8 });
    decor.moveTo(sx - s * 0.25, sy - s * 0.25).lineTo(sx + s * 0.25, sy - s * 0.25).moveTo(sx, sy - s * 0.3).lineTo(sx, sy + s * 0.3).moveTo(sx - s * 0.25, sy + s * 0.1).lineTo(sx + s * 0.25, sy + s * 0.1).stroke({ width: 1.6 * unit, color: 0xf3ead8, alpha: 0.9 });
  }

  function drawChevrons() {
    chevrons.clear();
    const hc = ctx.settings.highContrast;
    const col = hc ? 0x000000 : INK;
    const a = hc ? 0.8 : 0.22;
    const s = 12 * unit;
    const chev = (x: number, y: number, dx: number, dy: number) => {
      const nx = -dy;
      const ny = dx;
      chevrons.moveTo(x - dx * s + nx * s, y - dy * s + ny * s).lineTo(x, y).lineTo(x - dx * s - nx * s, y - dy * s - ny * s);
    };
    const sf = soft();
    const inset = sf ? 36 * unit : 22;
    const spots: Array<[number, number, number, number]> = [
      [safe.x + inset, cy, -1, 0],
      [safe.x + safe.w - inset, cy, 1, 0],
      [cx, Math.max(safe.y, 0) + 92, 0, -1],
      [cx, safe.y + safe.h - 70, 0, 1],
    ];
    spots.forEach(([x, y, dx, dy], i) => {
      const show = i < 2 || fourDirShown;
      const t = chevTiles[i];
      t.visible = sf && show;
      if (t.visible) {
        const d = Math.round(50 * unit);
        setSoft(t, { width: d, height: d, base: PAPER, radius: d / 2, depth: 4, resolution: sres });
        // the chevron tip points outward; centre the button on the chevron's body
        t.position.set(x - dx * s * 0.5, y - dy * s * 0.5);
      }
      if (show) chev(x + (sf ? dx * s * 0.15 : 0), y + (sf ? dy * s * 0.15 : 0), dx, dy);
    });
    chevrons.stroke({ width: (sf ? 2.6 : 3) * unit, color: col, alpha: sf ? 0.5 : a, cap: 'round', join: 'round' });
  }

  // ---------------------------------------------------------------- state
  let alive = true;
  let running = false;
  let phase: 'idle' | 'intro' | 'respond' | 'resolve' = 'idle';
  let trial: Trial | null = null;
  let trialId = 0;
  let t0 = 0;
  let deadline = Infinity;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let mult = 1;
  let round = 0;
  let roundTrials = 0;
  let maxLevel = stair.level;
  let incTotal = 0;
  let incOk = 0;
  let conTotal = 0;
  let conOk = 0;
  let rts: number[] = [];
  let drift = { x: 0, y: 0, vx: 0, vy: 0 };
  let stopAmbient: (() => void) | null = null;
  let clock = 0;
  let koiScale = 1;

  const multFor = (s: number) => Math.min(4, 1 + Math.floor(s / 5));

  function placeFormation() {
    if (!trial) return;
    const P = levelParams(stair.level);
    const vertical = P.fourDir;
    spacing = vertical ? { x: 96 * unit, y: 96 * unit } : { x: 104 * unit, y: 66 * unit };
    koiScale = (vertical ? 1.18 : 1.3) * unit;
    const all = [lead, ...fish.filter((f) => f.active)];
    for (const f of all) {
      f.x = cx + drift.x + f.gx * spacing.x;
      f.y = cy + drift.y + f.gy * spacing.y;
    }
  }

  function setupTrial(t: Trial) {
    const P = levelParams(stair.level);
    if (P.fourDir !== fourDirShown) {
      fourDirShown = P.fourDir;
      drawChevrons();
      if (!preview && fourDirShown) {
        void showBanner('Now four ways', 900);
        ctx.announce('Koi can now face up and down too');
      }
    }
    // drift ("current")
    if (P.current > 0) {
      drift = {
        x: (rng.next() - 0.5) * safe.w * 0.12 * P.current,
        y: (rng.next() - 0.5) * safe.h * 0.12 * P.current,
        vx: (rng.next() - 0.5) * 30 * P.current,
        vy: (rng.next() - 0.5) * 18 * P.current,
      };
    } else drift = { x: 0, y: 0, vx: 0, vy: 0 };
    // assign slots
    const [lx, ly] = t.slots[t.leadSlot];
    lead.gx = lx;
    lead.gy = ly;
    lead.angle = ANGLE[t.lead];
    lead.active = true;
    let k = 0;
    for (let i = 0; i < t.slots.length; i++) {
      if (i === t.leadSlot) continue;
      const f = fish[k++];
      f.gx = t.slots[i][0];
      f.gy = t.slots[i][1];
      f.active = true;
      if (t.flank === 'still') {
        f.angle = 0;
      } else if (t.perpendicular) {
        f.angle = rng.chance(0.5) ? ANGLE.U : ANGLE.D;
      } else f.angle = ANGLE[t.flank];
    }
    for (; k < MAX_FLANK; k++) {
      fish[k].active = false;
      fish[k].koi.c.visible = false;
      fish[k].lily!.visible = false;
    }
    placeFormation();
    for (const f of fish) {
      if (!f.active) continue;
      const still = t.flank === 'still';
      f.koi.c.visible = !still;
      f.lily!.visible = still;
      f.koi.c.rotation = f.angle;
      f.koi.c.scale.set(koiScale);
      f.lily!.scale.set(koiScale);
      f.lily!.rotation = rng.next() * Math.PI * 2;
    }
    leadWrap.visible = true;
    lead.koi.c.rotation = lead.angle;
    leadKoiScale();
  }

  function leadKoiScale() {
    lead.koi.c.scale.set(koiScale * 1.32);
    enso.scale.set(koiScale * 1.02);
  }

  function setAlpha(a: number) {
    leadWrap.alpha = a;
    for (const f of fish) {
      if (!f.active) continue;
      f.koi.c.alpha = a;
      f.lily!.alpha = a;
    }
  }

  function syncPositions(offX = 0, offY = 0) {
    leadWrap.position.set(lead.x + offX, lead.y + offY);
    for (const f of fish) {
      if (!f.active) continue;
      f.koi.c.position.set(f.x + offX, f.y + offY);
      f.lily!.position.set(f.x + offX, f.y + offY);
    }
  }

  function startTrial() {
    if (!alive || !running) return;
    const id = ++trialId;
    if (preview && stair.level > 7) stair.set(4);
    const level = stair.level;
    maxLevel = Math.max(maxLevel, level);
    trial = makeTrial(rng, level);
    setupTrial(trial);
    phase = 'intro';
    const P = levelParams(level);
    const tm = ctx.settings.timingMultiplier;
    // glide in from downstream (below), fading up
    const glide = ctx.settings.reducedMotion ? 0 : 26 * unit;
    const ms = ctx.settings.reducedMotion ? 120 : 260;
    setAlpha(0);
    syncPositions(0, glide);
    void tween(ctx, ms, (t) => {
      setAlpha(t);
      syncPositions(0, glide * (1 - t));
    }).then(() => {
      if (id !== trialId) return;
    });
    ctx.after(Math.min(ms, 140), () => {
      if (id !== trialId || !running) return;
      phase = 'respond';
      t0 = ctx.time();
      deadline = untimed ? Infinity : t0 + P.windowMs * tm;
      if (preview) ghost(id);
    });
    hud();
  }

  function respond(d: Dir, fromX?: number, fromY?: number, toX?: number, toY?: number) {
    if (phase !== 'respond' || !trial) return;
    const P = levelParams(stair.level);
    if (!P.fourDir && (d === 'U' || d === 'D')) {
      showFeedback('Left or right for now');
      return;
    }
    const rt = ctx.time() - t0;
    phase = 'resolve';
    // visible brush stroke of the swipe
    const [vx, vy] = VEC[d];
    if (fromX !== undefined && toX !== undefined && fromY !== undefined && toY !== undefined) inkStroke(fromX, fromY, toX, toY);
    else inkStroke(lead.x - vx * 40 * unit, lead.y - vy * 40 * unit, lead.x + vx * 110 * unit, lead.y + vy * 110 * unit);
    resolve(d === trial.lead, rt, d);
  }

  function resolve(correct: boolean, rt: number, d: Dir | null) {
    if (!trial) return;
    const t = trial;
    const P = levelParams(stair.level);
    stair.record(correct);
    ctx.trial({ correct, rtMs: d ? rt : undefined, level: stair.level });
    roundTrials++;
    if (t.cond === 'incongruent') {
      incTotal++;
      if (correct) incOk++;
    } else if (t.cond === 'congruent') {
      conTotal++;
      if (correct) conOk++;
    }
    const id = trialId;
    if (correct) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      mult = multFor(streak);
      rts.push(rt);
      const win = P.windowMs * ctx.settings.timingMultiplier;
      const bonus = untimed ? 0 : Math.round(10 * clamp((win - rt) / win, 0, 1));
      score += (10 + bonus) * mult;
      ctx.audio.pluck(koto(Math.min(streak - 1, 9)), { gain: 0.14, dur: 1.2 });
      ctx.audio.noise({ dur: 0.35, filter: 1800, sweepTo: 600, gain: 0.03 });
      ctx.haptics.tick();
      ctx.caption(`Koto pluck — ${DIR_WORD[t.lead]}`);
      ripple(lead.x, lead.y, 70 * unit, 900);
      ripple(lead.x, lead.y, 110 * unit, 1300, 120);
      bloom(lead.x, lead.y, 150 * unit, 0.18);
      dart(t.lead).then(() => next(id));
    } else {
      streak = 0;
      mult = 1;
      if (d) {
        ctx.audio.noise({ dur: 0.5, filter: 1200, q: 0.8, gain: 0.07 });
        ctx.audio.thunk({ gain: 0.1 });
        ctx.haptics.error();
        ctx.caption(`Splash — the crowned koi faced ${DIR_WORD[t.lead]}`);
        showFeedback(`The crowned koi faced ${DIR_WORD[t.lead]}`);
      } else {
        ctx.audio.tone(ctx.audio.midi(57), { dur: 0.5, type: 'sine', gain: 0.05 });
        ctx.caption('Too slow — the school drifts on');
        showFeedback('Too slow — the school drifts on');
      }
      ripple(lead.x, lead.y, 60 * unit, 700);
      bloom(lead.x, lead.y, 90 * unit, 0.12, VERMILION);
      scatter(!d).then(() => next(id));
    }
    hud();
  }

  function next(id: number) {
    if (id !== trialId || !running) return;
    for (const f of fish) f.active = false;
    leadWrap.visible = false;
    for (const f of fish) {
      f.koi.c.visible = false;
      f.lily!.visible = false;
    }
    if (roundTrials >= TRIALS && !preview) {
      void endRound();
      return;
    }
    const iti = (preview ? 520 : 380 + rng.next() * 260) * (untimed ? 1.2 : 1);
    ctx.after(iti, startTrial);
  }

  function dart(d: Dir) {
    const [vx, vy] = VEC[d];
    const reduced = ctx.settings.reducedMotion;
    const dist = (reduced ? 70 : 260) * unit;
    const target = ANGLE[d];
    // the whole school turns to follow the crowned lead, then darts that way
    const all: Array<{ c: Container; x: number; y: number; koi: Container | null; a0: number; lag: number }> = [];
    all.push({ c: leadWrap, x: lead.x, y: lead.y, koi: null, a0: 0, lag: 0 });
    for (const f of fish) {
      if (!f.active) continue;
      const swims = f.koi.c.visible;
      all.push({ c: t2c(f), x: f.x, y: f.y, koi: swims ? f.koi.c : null, a0: f.koi.c.rotation, lag: 0.05 + rng.next() * 0.12 });
    }
    return tween(
      ctx,
      reduced ? 260 : 520,
      (t) => {
        for (const o of all) {
          const k = clamp((t - o.lag) / (1 - o.lag), 0, 1);
          const e = k * k;
          o.c.position.set(o.x + vx * dist * e, o.y + vy * dist * e);
          if (o.koi) o.koi.rotation = lerpAngle(o.a0, target, clamp(k * 3, 0, 1));
          o.c.alpha = 1 - clamp((k - 0.55) / 0.45, 0, 1);
        }
      },
      (t) => t,
    );
  }

  function t2c(f: Fish): Container {
    return f.koi.c.visible ? f.koi.c : f.lily!;
  }

  function scatter(slow: boolean) {
    const reduced = ctx.settings.reducedMotion;
    const all: Array<{ c: Container; x: number; y: number; a: number; r0: number; dist: number }> = [];
    const pushF = (c: Container, x: number, y: number, rotates: boolean) => {
      const a = slow ? -Math.PI / 2 + (rng.next() - 0.5) * 0.4 : rng.next() * Math.PI * 2;
      all.push({ c, x, y, a, r0: rotates ? c.rotation : NaN, dist: (slow ? 40 : 70 + rng.next() * 60) * unit * (reduced ? 0.4 : 1) });
    };
    pushF(leadWrap, lead.x, lead.y, false);
    for (const f of fish) if (f.active) pushF(t2c(f), f.x, f.y, f.koi.c.visible);
    return tween(
      ctx,
      slow ? 700 : 560,
      (t) => {
        for (const o of all) {
          o.c.position.set(o.x + Math.cos(o.a) * o.dist * t, o.y + Math.sin(o.a) * o.dist * t);
          if (!Number.isNaN(o.r0) && !reduced) o.c.rotation = lerpAngle(o.r0, o.a, clamp(t * 2.5, 0, 1));
          o.c.alpha = 1 - t;
        }
      },
      easeInOutSine,
    );
  }

  function lerpAngle(a: number, b: number, t: number) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  let feedbackTween: { cancel(): void } | null = null;
  function showFeedback(s: string) {
    feedback.text = s;
    feedback.style.fill = ctx.settings.highContrast ? 0x000000 : 0x5a2418;
    feedbackTween?.cancel();
    feedback.alpha = 1;
    feedbackTween = tween(ctx, 1500, (t) => (feedback.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4), (t) => t);
  }

  async function showBanner(text: string, ms: number) {
    banner.text = text;
    banner.style.fill = ctx.settings.highContrast ? 0x000000 : INK;
    await tween(ctx, 300, (t) => (banner.alpha = t));
    await ctx.wait(ms);
    await tween(ctx, 300, (t) => (banner.alpha = 1 - t));
  }

  // ---------------------------------------------------------------- ghost (preview)
  function ghost(id: number) {
    if (!trial) return;
    const t = trial;
    const P = levelParams(stair.level);
    const errP = t.cond === 'incongruent' ? 0.15 : 0.06;
    const wrongDir: Dir = t.flank !== 'still' && !t.perpendicular && t.flank !== t.lead ? t.flank : (['R', 'L', 'U', 'D'] as Dir[]).filter((q) => q !== t.lead && (P.fourDir || q === 'R' || q === 'L'))[0];
    const d = rng.chance(errP) ? wrongDir : t.lead;
    const rt = 480 + rng.next() * 380 + (t.cond === 'incongruent' ? 120 : 0);
    ctx.after(rt, () => {
      if (id !== trialId) return;
      respond(d);
    });
  }

  // ---------------------------------------------------------------- rounds + HUD
  function hud() {
    const label = `Round ${Math.max(1, round)}/${ROUNDS} · ×${mult}`;
    if (preview) ctx.hud.set({ score, level: stair.level, label: `×${mult}` });
    else ctx.hud.set({ score, level: stair.level, progress: roundTrials / TRIALS, label });
  }

  async function startRound() {
    round++;
    roundTrials = 0;
    ctx.announce(`Round ${round} of ${ROUNDS}`);
    if (round > 1) await showBanner('Round 2', 700);
    if (!alive) return;
    running = true;
    startTrial();
  }

  async function endRound() {
    running = false;
    phase = 'idle';
    if (round >= ROUNDS) {
      const incAcc = incTotal ? Math.round((incOk / incTotal) * 100) : 0;
      const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
      await showBanner(`Focus under pressure\n${incAcc}%`, 900);
      ctx.end({
        score,
        levelReached: maxLevel,
        stats: { incAcc, avgRt: avg, bestStreak },
        message:
          conTotal && incTotal && incOk / incTotal >= conOk / conTotal - 0.05
            ? 'The school pulled every way — you held your line.'
            : 'The crowned koi is getting easier to follow.',
      });
      return;
    }
    await ctx.wait(400);
    if (alive) await startRound();
  }

  // ---------------------------------------------------------------- input: swipe + tap zones + keys
  let down: { x: number; y: number; id: number } | null = null;
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (preview) return;
    down = { x: e.global.x, y: e.global.y, id: e.pointerId };
  });
  const onUp = (e: FederatedPointerEvent) => {
    if (preview || !down || e.pointerId !== down.id) return;
    const dx = e.global.x - down.x;
    const dy = e.global.y - down.y;
    const start = down;
    down = null;
    const fourDir = levelParams(stair.level).fourDir;
    const dist = Math.hypot(dx, dy);
    if (dist >= 28) {
      let d: Dir;
      if (Math.abs(dx) >= Math.abs(dy) || !fourDir) {
        if (!fourDir && Math.abs(dx) < 18) return; // vertical swipe in 2-way mode: ignore
        d = dx > 0 ? 'R' : 'L';
      } else d = dy > 0 ? 'D' : 'U';
      respond(d, start.x, start.y, e.global.x, e.global.y);
      return;
    }
    // tap fallback: halves (2-way) or diagonal quadrants around the pond centre (4-way)
    const tx = e.global.x - cx;
    const ty = e.global.y - cy;
    let d: Dir;
    if (!fourDir) d = tx >= 0 ? 'R' : 'L';
    else if (Math.abs(tx) * (safe.h / safe.w) * 0.6 >= Math.abs(ty)) d = tx >= 0 ? 'R' : 'L';
    else d = ty >= 0 ? 'D' : 'U';
    respond(d);
  };
  app.stage.on('pointerup', onUp);
  app.stage.on('pointerupoutside', onUp);
  ctx.keys({
    ArrowLeft: () => respond('L'),
    ArrowRight: () => respond('R'),
    ArrowUp: () => respond('U'),
    ArrowDown: () => respond('D'),
    KeyA: () => respond('L'),
    KeyD: () => respond('R'),
    KeyW: () => respond('U'),
    KeyS: () => respond('D'),
  });

  // ---------------------------------------------------------------- per frame
  function update(dt: number) {
    clock += dt;
    const now = ctx.time();
    const s = clock / 1000;
    const reduced = ctx.settings.reducedMotion;
    const k = dt / 1000;
    // ambient wash + pads + petals
    for (const w of washSprites) {
      const m = reduced ? 0 : s;
      w.s.position.set(W * (w.bx + 0.08 * Math.sin(m * 0.04 + w.ph)), H * (w.by + 0.06 * Math.cos(m * 0.05 + w.ph)));
    }
    for (const p of decoPads) {
      p.c.position.set(W * p.bx + (reduced ? 0 : Math.sin(s * 0.3 + p.ph) * 3), H * p.by + (reduced ? 0 : Math.cos(s * 0.25 + p.ph) * 2));
      p.c.rotation = reduced ? p.ph : p.ph + Math.sin(s * 0.1 + p.ph) * 0.1;
    }
    if (petals.visible) {
      for (const p of petalList) {
        p.x += p.vx * k;
        p.y += p.vy * k;
        if (p.y > 1.05) {
          p.y = -0.05;
          p.x = Math.random();
        }
        if (p.x > 1.05) p.x = -0.05;
        p.rot += p.vr * k;
        p.g.position.set(p.x * W + Math.sin(s * 0.6 + p.ph) * 10, p.y * H);
        p.g.rotation = p.rot;
        p.g.scale.set(unit * (0.8 + 0.2 * Math.sin(s * 1.5 + p.ph)), unit);
      }
    }
    // ripples / blooms / strokes
    for (const r of ripples) {
      if (r.t < 0) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) {
        r.t = -1;
        r.g.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - r.t, 2);
      r.g.scale.set((r.r * (0.2 + 0.8 * e)) / 50);
      r.g.alpha = 0.5 * (1 - r.t);
    }
    for (const b of blooms) {
      if (b.t < 0) continue;
      b.t += dt / 1400;
      if (b.t >= 1) {
        b.t = -1;
        b.s.visible = false;
        continue;
      }
      b.s.scale.set((b.r * (0.3 + 0.7 * Math.sqrt(b.t))) / 64);
      b.s.alpha = b.a * (1 - b.t);
    }
    for (const st of strokePool) {
      if (st.t < 0) continue;
      st.t += dt / 700;
      if (st.t >= 1) {
        st.t = -1;
        st.g.visible = false;
        continue;
      }
      st.g.alpha = 1 - st.t * st.t;
    }
    // school idle motion
    const swim = reduced ? 0.07 : 0.22;
    if (phase === 'respond' || phase === 'intro') {
      if (drift.vx || drift.vy) {
        drift.x += drift.vx * k;
        drift.y += drift.vy * k;
        placeFormation();
      }
      if (phase === 'respond') syncPositions();
    }
    const allKoi = [lead.koi, ...fish.map((f) => f.koi)];
    for (const kk of allKoi) {
      if (!kk.c.visible) continue;
      kk.tail.rotation = Math.sin(s * 6 + kk.ph) * swim;
    }
    enso.rotation = reduced ? 0 : s * 0.15;
    // response window
    if (phase === 'respond' && now >= deadline) {
      phase = 'resolve';
      resolve(false, 0, null);
    }
    // hint
    if (!preview) {
      const four = levelParams(stair.level).fourDir;
      const t = ctx.settings.showKeyHints
        ? four
          ? 'Swipe or arrows: where the crowned koi faces'
          : 'Swipe or ← → : where the crowned koi faces'
        : four
          ? 'Swipe where the crowned koi faces'
          : 'Swipe (or tap a side) where the crowned koi faces';
      if (hint.text !== t) hint.text = t;
      hint.alpha = round === 1 && roundTrials < 6 ? 0.9 : ctx.settings.showKeyHints ? 0.7 : 0.35;
    } else hint.text = '';
  }

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  return {
    start() {
      stopAmbient = ctx.audio.ambient([50, 57, 62, 64, 69], { gain: 0.035, brightness: 0.3 });
      void startRound();
    },
    onSettings: () => {
      rebuildKoi();
      if (trial) setupTrial(trial);
      layout();
      syncPositions();
    },
    destroy() {
      alive = false;
      running = false;
      stopAmbient?.();
    },
  };
}
