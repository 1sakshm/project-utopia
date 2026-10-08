import { Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeOutCubic, hex, mixHex, tween, TAU } from '@/sdk';
import { createParticles, createPixiApp, glowTexture, gradientTexture, softShades, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { analyseContinuation, gauss, grade, GRADE_POINTS, median, roundSpec, windowsFor, type Grade, type RoundSpec } from './logic';

const ROUNDS = 3;
const LOOKAHEAD = 0.25; // seconds of audio scheduled ahead

type Seg = 'count' | 'sync' | 'cont' | 'count2' | 'pattern' | 'calib' | 'done';

interface Target {
  t: number;
  judged: boolean;
  grade: Grade | null;
  ghosted: boolean;
}

interface Plan {
  kind: 'round' | 'calib';
  origin: number; // song time of beat 0
  T: number;
  spec: RoundSpec;
  bSync: number;
  bCont: number;
  bCount2: number;
  bPattern: number;
  bEnd: number;
  targets: Target[];
  crests: number[]; // visual crest times (song time)
  contStart: number;
  contEnd: number;
}

const CHORDS = [
  [45, 57, 60, 64],
  [41, 57, 60, 65],
  [48, 55, 60, 64],
  [43, 55, 59, 62],
];
const MELODY = [76, -1, 72, -1, 74, -1, -1, 69, 72, -1, 76, -1, 79, -1, 76, -1];

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const rng = ctx.rng;
  const rand = () => rng.next();
  const stair = ctx.staircase({ min: 1, max: 10, up: 3, down: 1 });
  if (preview) stair.set(3);
  const FONT = 'Geist Variable, system-ui, sans-serif';
  const ts = () => ctx.settings.textScale || 1;
  const CYAN = hex(pal.accent);

  // ---------------- scene
  const sky = new Sprite(gradientTexture([
    [0, '#03060f'],
    [0.5, '#0a1530'],
    [1, '#16284a'],
  ]));
  const sea = new Sprite(gradientTexture([
    [0, '#0d2340'],
    [0.6, '#08182e'],
    [1, '#051222'],
  ]));
  const sand = new Sprite(gradientTexture([
    [0, '#1b2236'],
    [1, '#0b0f1c'],
  ]));
  const stars = new Graphics();
  const headland = new Graphics();
  const stars2 = new Graphics();
  const moonHalo = new Sprite(glowTexture(256, 0.3));
  moonHalo.anchor.set(0.5);
  moonHalo.blendMode = 'add';
  const moonDisc = new Graphics();
  const moonRing = new Graphics();
  const reflect = new Graphics();
  const horizonGlow = new Sprite(glowTexture(256, 0.4));
  horizonGlow.anchor.set(0.5);
  horizonGlow.blendMode = 'add';
  const seaGlow = new Sprite(glowTexture(256, 0.35));
  seaGlow.anchor.set(0.5);
  seaGlow.blendMode = 'add';
  const wavesG = new Graphics();
  const crestLine = new Graphics();
  const swashG = new Graphics();
  const beachG = new Graphics();
  const wetSand = new Sprite(gradientTexture([
    [0, 'rgba(95,245,230,0.22)'],
    [0.35, 'rgba(95,245,230,0.06)'],
    [1, 'rgba(95,245,230,0)'],
  ]));
  const rippleLayer = new Container();
  const fx = new Container();
  const ui = new Container();
  app.stage.addChild(sky, stars, stars2, moonHalo, moonDisc, moonRing, headland, sea, horizonGlow, reflect, seaGlow, wavesG, sand, wetSand, beachG, swashG, crestLine, rippleLayer, fx, ui);
  const particles = createParticles(ctx, fx, 260);

  const ripples: Array<{ s: Sprite; t: number; x: number; color: number }> = [];
  for (let i = 0; i < 6; i++) {
    const s = new Sprite(glowTexture(128, 0.3));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.visible = false;
    rippleLayer.addChild(s);
    ripples.push({ s, t: 99, x: 0, color: CYAN });
  }
  let rippleNext = 0;

  const ratingPool: Array<{ t: Text; life: number; y0: number }> = [];
  for (let i = 0; i < 5; i++) {
    const t = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fontWeight: '800', fill: 0xffffff, align: 'center' } });
    t.anchor.set(0.5);
    t.visible = false;
    fx.addChild(t);
    ratingPool.push({ t, life: 0, y0: 0 });
  }
  let ratingNext = 0;

  const phaseText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '800', fill: 0xeaf6ff, align: 'center' } });
  phaseText.anchor.set(0.5);
  const subText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '600', fill: 0xa9c2dc, align: 'center' } });
  subText.anchor.set(0.5);
  const countText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 40, fontWeight: '800', fill: pal.highlight, align: 'center' } });
  countText.anchor.set(0.5);
  countText.alpha = 0;
  const patternG = new Graphics();
  const result = new Container();
  const resultG = new Graphics();
  const resultBig = new Text({ text: '', style: { fontFamily: FONT, fontSize: 30, fontWeight: '800', fill: pal.highlight, align: 'center' } });
  resultBig.anchor.set(0.5);
  const resultSmall = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fontWeight: '600', fill: 0xd6e6f5, align: 'center' } });
  resultSmall.anchor.set(0.5);
  // Soft (dark neumorphism) look: the steadiness dial becomes a raised disc with an inset track, the pattern strip a
  // raised pill with inset beat wells, and the phase caption sits on a soft plate on the sand. The seascape stays.
  const soft = () => ctx.settings.soft;
  const SEA_BASE = '#0b1d35';
  const SAND_BASE = '#141a2c';
  const sres = ctx.quality.maxDpr;
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    sp.texture = softTileTexture(o);
    const p = softTilePad(o);
    sp.width = o.width + p * 2;
    sp.height = o.height + p * 2;
  }
  // Inset well drawn with plain Graphics from softShades (cheap, redrawn only on layout/state changes):
  // a dark rim on the top-left fading to the face colour, with a faint light lip on the bottom-right.
  function softWell(g: Graphics, x: number, y: number, w: number, h: number, r: number, base: string, d = 3) {
    const sh = softShades(base);
    g.roundRect(x, y, w, h, r).fill({ color: mixHex(base, '#000000', 0.42) });
    g.roundRect(x + d * 0.35, y + d * 0.35, w - d * 0.35, h - d * 0.35, Math.max(0, r - d * 0.2)).fill({ color: mixHex(base, '#000000', 0.22) });
    g.roundRect(x + d * 0.75, y + d * 0.75, w - d * 0.75, h - d * 0.75, Math.max(0, r - d * 0.4)).fill({ color: mixHex(base, '#000000', 0.08) });
    g.roundRect(x, y, w, h, r).stroke({ width: 1, color: sh.light, alpha: 0.45 });
  }
  const newTile = () => {
    const t = new Sprite();
    t.anchor.set(0.5);
    t.visible = false;
    return t;
  };
  const resultTile = newTile();
  const patternTile = newTile();
  const phasePlate = newTile();
  result.addChild(resultTile, resultG, resultBig, resultSmall);
  result.alpha = 0;
  ui.addChild(phasePlate, phaseText, subText, countText, patternTile, patternG, result);

  // ---------------- layout
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let cx = 0;
  let horizonY = 0;
  let crestY = 0;
  let shoreY = 0;
  let moonX = 0;
  let moonY = 0;
  let moonR = 20;

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    const hc = ctx.settings.highContrast;
    cx = safe.x + safe.w / 2;
    horizonY = safe.y + safe.h * 0.4;
    crestY = safe.y + safe.h * 0.7;
    shoreY = safe.y + safe.h * 0.79;
    moonX = cx + safe.w * 0.0;
    moonY = safe.y + safe.h * 0.2;
    moonR = Math.max(16, safe.w * 0.075);
    sky.position.set(0, 0);
    sky.width = W;
    sky.height = horizonY + 2;
    sea.position.set(0, horizonY);
    sea.width = W;
    sea.height = crestY - horizonY + 30;
    sand.position.set(0, crestY + 8);
    sand.width = W;
    sand.height = H - crestY;
    for (const s of [sky, sea, sand]) s.tint = hc ? 0x000000 : 0xffffff;
    wetSand.position.set(0, crestY + 6);
    wetSand.width = W;
    wetSand.height = (shoreY - crestY) * 1.6;
    wetSand.visible = !hc;
    // distant headland silhouettes on the horizon (decorative)
    headland.clear();
    if (!hc) {
      headland.moveTo(-10, horizonY + 1)
        .bezierCurveTo(W * 0.05, horizonY - safe.h * 0.05, W * 0.14, horizonY - safe.h * 0.035, W * 0.22, horizonY - safe.h * 0.012)
        .lineTo(W * 0.3, horizonY + 1).closePath().fill({ color: 0x0a1428 });
      headland.moveTo(W + 10, horizonY + 1)
        .bezierCurveTo(W * 0.93, horizonY - safe.h * 0.028, W * 0.86, horizonY - safe.h * 0.02, W * 0.8, horizonY + 1)
        .closePath().fill({ color: 0x0b162c });
    }
    // sand speckles, pebbles and a scatter of glowing plankton left by the tide
    beachG.clear();
    if (!hc) {
      for (let i = 0; i < 90; i++) {
        const x = (((i * 7919 + 13) % 997) / 997) * W;
        const y = crestY + 14 + (((i * 3571) % 991) / 991) * (H - crestY - 14);
        beachG.circle(x, y, 0.6 + (i % 3) * 0.5).fill({ color: 0x8c93b8, alpha: 0.12 + (i % 4) * 0.05 });
      }
      for (let i = 0; i < 16; i++) {
        const x = (((i * 4447 + 7) % 983) / 983) * W;
        const y = shoreY - 6 + (((i * 2141) % 977) / 977) * (shoreY - crestY) * 0.8;
        beachG.circle(x, y, 1.2).fill({ color: CYAN, alpha: 0.55 });
      }
      const rx = safe.x + safe.w * 0.9;
      const ry = H - safe.h * 0.07;
      beachG.ellipse(rx, ry, safe.w * 0.09, safe.h * 0.028).fill({ color: 0x0c1122 });
      beachG.ellipse(rx - safe.w * 0.1, ry + safe.h * 0.012, safe.w * 0.05, safe.h * 0.016).fill({ color: 0x0e1426 });
      beachG.ellipse(safe.x + safe.w * 0.08, H - safe.h * 0.04, safe.w * 0.07, safe.h * 0.02).fill({ color: 0x0c1122 });
    }
    stars.clear();
    stars2.clear();
    for (let i = 0; i < 120; i++) {
      const x = (((i * 7919) % 1000) / 1000) * W;
      const y = (((i * 104729) % 1000) / 1000) * (horizonY - 8);
      (i % 2 ? stars : stars2).circle(x, y, (i % 3) * 0.45 + 0.5).fill({ color: 0xffffff, alpha: 0.25 + (i % 5) * 0.13 });
    }
    moonHalo.position.set(moonX, moonY);
    moonHalo.width = moonHalo.height = moonR * 8;
    moonHalo.tint = 0xcfe6ff;
    moonHalo.visible = !hc;
    moonDisc.clear();
    moonDisc.circle(moonX, moonY, moonR).fill({ color: hc ? 0xffffff : 0xf3f1e6 });
    if (!hc) {
      moonDisc.circle(moonX - moonR * 0.3, moonY - moonR * 0.15, moonR * 0.22).circle(moonX + moonR * 0.35, moonY + moonR * 0.3, moonR * 0.15).circle(moonX + moonR * 0.1, moonY - moonR * 0.5, moonR * 0.1).fill({ color: 0xd8d5c6, alpha: 0.8 });
    }
    horizonGlow.position.set(cx, horizonY);
    horizonGlow.width = W * 1.2;
    horizonGlow.height = safe.h * 0.12;
    horizonGlow.tint = 0x6f9fe0;
    horizonGlow.alpha = hc ? 0 : 0.25;
    seaGlow.position.set(cx, crestY);
    seaGlow.width = W * 1.3;
    seaGlow.height = safe.h * 0.22;
    seaGlow.tint = CYAN;
    seaGlow.visible = !hc;
    phaseText.position.set(cx, safe.y + safe.h - 78);
    phaseText.style.fontSize = 20 * ts();
    subText.position.set(cx, safe.y + safe.h - 52);
    subText.style.fontSize = 14 * ts();
    countText.position.set(cx, horizonY + (crestY - horizonY) * 0.35);
    countText.style.fontSize = 40 * ts();
    result.position.set(cx, horizonY + (crestY - horizonY) * 0.42);
    resultBig.style.fontSize = 30 * ts();
    resultSmall.style.fontSize = 15 * ts();
    for (const r of ratingPool) r.t.style.fontSize = 26 * ts();
    phasePlate.visible = soft();
    if (soft()) {
      const pw = Math.round(Math.min(safe.w - 40, 320));
      setSoft(phasePlate, { width: pw, height: 66, base: SAND_BASE, radius: 22, depth: 7, resolution: sres });
      phasePlate.position.set(cx, safe.y + safe.h - 66);
      const n = 8;
      const gap = Math.min(34, (safe.w - 60) / n);
      setSoft(patternTile, { width: Math.round(gap * (n - 1) + 36), height: 34, base: SAND_BASE, radius: 17, depth: 5, resolution: sres });
      patternTile.position.set(cx, safe.y + safe.h - 78 - 44 + 4);
    }
  }

  // ---------------- audio (own synthesis, lookahead-scheduled on the AudioContext clock)
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  const scheduled: Array<{ n: AudioScheduledSourceNode; t: number }> = [];
  function audio(): AudioContext | null {
    const a = ctx.audio.raw;
    if (!a) return null;
    if (!musicBus) {
      const mo = ctx.audio.musicOut;
      const so = ctx.audio.sfxOut;
      if (!mo || !so) return null;
      musicBus = a.createGain();
      musicBus.gain.value = 0.9;
      musicBus.connect(mo);
      sfxBus = a.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(so);
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return a;
  }
  function track(n: AudioScheduledSourceNode, t: number) {
    scheduled.push({ n, t });
  }
  function cancelFuture() {
    const a = ctx.audio.raw;
    const now = a ? a.currentTime : 0;
    for (const s of scheduled) {
      if (s.t > now - 0.01) {
        try {
          s.n.stop(0);
        } catch {
          /* not started */
        }
      }
    }
    scheduled.length = 0;
  }
  function prune(now: number) {
    let j = 0;
    for (let i = 0; i < scheduled.length; i++) if (scheduled[i].t > now - 2) scheduled[j++] = scheduled[i];
    scheduled.length = j;
  }
  function osc(a: AudioContext, dest: AudioNode, type: OscillatorType, f0: number, t: number, dur: number, gain: number, attack = 0.004, f1?: number) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    track(o, t);
  }
  function noise(a: AudioContext, dest: AudioNode, t: number, dur: number, gain: number, freq: number, type: BiquadFilterType = 'bandpass', q = 1) {
    if (!noiseBuf) return;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    track(src, t);
  }
  const mf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
  function kick(a: AudioContext, t: number, g: number) {
    osc(a, musicBus!, 'sine', 120, t, 0.32, 0.55 * g, 0.003, 42);
  }
  function click(a: AudioContext, t: number, accent: boolean) {
    osc(a, musicBus!, 'sine', accent ? 1760 : 1320, t, 0.06, 0.22, 0.001);
    noise(a, musicBus!, t, 0.03, 0.08, 3000, 'highpass', 0.7);
  }
  function marimba(a: AudioContext, dest: AudioNode, note: number, t: number, g: number) {
    osc(a, dest, 'sine', mf(note), t, 0.5, 0.3 * g, 0.002);
    osc(a, dest, 'sine', mf(note) * 4, t, 0.09, 0.08 * g, 0.001);
  }

  // ---------------- clock (song time follows the audio clock when running, the game clock otherwise)
  let songTime = 0;
  let offset = 0;
  let synced = false;
  let frameWall = performance.now();
  let schedStep = 0;
  const audioRunning = () => {
    const a = ctx.audio.raw;
    return !!a && a.state === 'running';
  };
  const outLat = () => {
    const a = ctx.audio.raw as (AudioContext & { outputLatency?: number }) | null;
    return a ? a.outputLatency || a.baseLatency || 0 : 0;
  };
  let calibMs = preview ? 0 : ctx.storage.get<number | null>('calibrationMs', null) ?? 0;
  const needCalib = !preview && ctx.storage.get<number | null>('calibrationMs', null) === null;

  function updateClock(dt: number) {
    if (audioRunning()) {
      const now = ctx.audio.raw!.currentTime;
      if (!synced) {
        offset = now - songTime;
        synced = true;
        cancelFuture();
        resetScheduler();
      }
      songTime = now - offset;
    } else {
      synced = false;
      songTime += dt / 1000;
    }
    frameWall = performance.now();
  }
  const visualTime = () => songTime - (synced ? outLat() : 0);

  function tapTime(evStamp?: number): number {
    const lag = evStamp != null && evStamp > 0 ? clamp((performance.now() - evStamp) / 1000, 0, 0.1) : 0;
    if (synced && audioRunning()) return ctx.audio.now() - lag - ctx.audio.latency() - offset - calibMs / 1000;
    return songTime + (performance.now() - frameWall) / 1000 - lag - calibMs / 1000;
  }

  // ---------------- plans
  let plan: Plan | null = null;
  function makePlan(kind: 'round' | 'calib', spec: RoundSpec, startIn: number): Plan {
    const T = 60 / spec.bpm;
    const origin = songTime + startIn;
    let bSync = 4;
    let bCont: number;
    let bCount2: number;
    let bPattern: number;
    let bEnd: number;
    if (kind === 'calib') {
      bCont = bCount2 = bPattern = bEnd = 12;
    } else {
      bCont = bSync + spec.syncBeats;
      bCount2 = bCont + spec.contBeats;
      if (spec.pattern) {
        bPattern = bCount2 + 4;
        bEnd = bPattern + spec.patternBeats;
      } else {
        bPattern = bEnd = bCount2;
      }
    }
    if (preview) bSync = 2;
    const targets: Target[] = [];
    const crests: number[] = [];
    const add = (t: number, graded: boolean) => {
      crests.push(t);
      if (graded) targets.push({ t, judged: false, grade: null, ghosted: false });
    };
    for (let b = preview ? 2 : 0; b < bCont; b++) add(origin + b * T, b >= bSync);
    if (kind === 'round' && spec.pattern) {
      for (let b = bCount2; b < bPattern; b++) add(origin + b * T, false);
      for (let b = bPattern; b < bEnd; b++) {
        for (let j = 0; j < 2; j++) {
          const idx = (b - bPattern) * 2 + j;
          if (spec.pattern[idx % 8]) add(origin + (b + j / 2) * T, true);
        }
      }
    }
    return {
      kind, origin, T, spec, bSync, bCont, bCount2, bPattern, bEnd, targets, crests,
      contStart: origin + bCont * T,
      contEnd: origin + bCount2 * T,
    };
  }
  function segAt(p: Plan, b: number): Seg {
    if (b < p.bSync) return 'count';
    if (p.kind === 'calib') return b < p.bCont ? 'calib' : 'done';
    if (b < p.bCont) return 'sync';
    if (b < p.bCount2) return 'cont';
    if (b < p.bPattern) return 'count2';
    if (b < p.bEnd) return 'pattern';
    return 'done';
  }

  function resetScheduler() {
    if (!plan) return;
    schedStep = Math.max(0, Math.ceil(((songTime - plan.origin) / plan.T) * 2));
  }

  function playStep(a: AudioContext, p: Plan, i: number, at: number) {
    const b = Math.floor(i / 2);
    const half = i % 2;
    const seg = segAt(p, b);
    if (seg === 'done' || seg === 'cont') return;
    if (seg === 'count' || seg === 'count2' || seg === 'calib') {
      if (half === 0) click(a, at, (b - (seg === 'count2' ? p.bCount2 : 0)) % 4 === 0 || seg === 'calib');
      if (seg === 'count2' && half === 0) kick(a, at, 0.5);
      return;
    }
    const segStart = seg === 'sync' ? p.bSync : p.bPattern;
    const bb = (b - segStart) % 4;
    const bar = Math.floor((b - segStart) / 4) % 4;
    const ch = CHORDS[bar];
    // musical fade over the last 4 sync beats — the music "drops"
    const fade = seg === 'sync' && b >= p.bCont - 4 ? clamp((p.bCont - b - 0.5 * half) / 4.5, 0, 1) : 1;
    if (fade <= 0.02) return;
    const mb = musicBus!;
    if (seg === 'sync') {
      if (half === 0) kick(a, at, (bb === 0 ? 1 : 0.7) * fade);
      if (half === 0 && (bb === 1 || bb === 3)) noise(a, mb, at, 0.16, 0.16 * fade, 1800, 'bandpass', 0.8);
      if (half === 1) noise(a, mb, at, 0.04, 0.06 * fade, 8000, 'highpass', 0.7);
      if (half === 0 && (bb === 0 || bb === 2)) osc(a, mb, 'triangle', mf(ch[0] - 12), at, p.T * 1.6, 0.2 * fade, 0.01);
      if (half === 0 && bb === 0) for (let k = 1; k < 4; k++) osc(a, mb, 'sine', mf(ch[k]), at, p.T * 4, 0.035 * fade, 0.3);
      const mel = MELODY[(i - segStart * 2) % 16];
      if (mel > 0 && bar % 2 === 1) marimba(a, mb, mel, at, 0.45 * fade);
    } else {
      // pattern phase: soft groove + a clear woodblock cue on every pattern note
      if (half === 0 && bb === 0) kick(a, at, 0.6);
      if (half === 1) noise(a, mb, at, 0.035, 0.04, 8000, 'highpass', 0.7);
      if (half === 0 && bb === 0) for (let k = 1; k < 4; k++) osc(a, mb, 'sine', mf(ch[k]), at, p.T * 4, 0.03, 0.3);
      const idx = (b - p.bPattern) * 2 + half;
      if (p.spec.pattern && p.spec.pattern[idx % 8]) {
        osc(a, mb, 'sine', 980, at, 0.08, 0.2, 0.001);
        osc(a, mb, 'triangle', 490, at, 0.1, 0.12, 0.001);
      }
    }
  }

  function scheduleAudio() {
    if (!plan || !synced) return;
    const a = audio();
    if (!a || a.state !== 'running') return;
    const now = a.currentTime;
    const p = plan;
    for (let guard = 0; guard < 64; guard++) {
      const st = p.origin + (schedStep * p.T) / 2;
      const at = st + offset;
      if (at > now + LOOKAHEAD) break;
      if (at >= now - 0.005) playStep(a, p, schedStep, Math.max(at, now));
      schedStep++;
    }
    if (scheduled.length > 400) prune(now);
  }

  // ---------------- state
  let alive = true;
  let score = 0;
  let round = 0;
  let totalPts = 0;
  let totalTargets = 0;
  const steadies: number[] = [];
  const drifts: number[] = [];
  let contTaps: number[] = [];
  let contDone = false;
  let calibErrs: number[] = [];
  let lastCrest = -99;
  let lastTapVis = -99;
  let chop = 0;
  let predictedNext = -1;
  let estIti = 0.6;
  let phaseLabel = '';
  let resultShown = false;
  let lastCount = -1;
  let tAmb = 0;
  let streak = 0;
  let ghostContNext = -1;
  let ghostDriftK = 1;
  const contBreaks: number[] = [];

  const gradeWord: Record<Grade, string> = { perfect: 'Perfect', great: 'Great', good: 'Good', miss: 'Miss' };
  const gradeColor = (g: Grade) => (g === 'perfect' ? hex(pal.highlight) : g === 'great' ? CYAN : g === 'good' ? hex(pal.accent2) : 0x8899aa);

  function showRating(text: string, color: number, x: number) {
    const r = ratingPool[ratingNext];
    ratingNext = (ratingNext + 1) % ratingPool.length;
    r.t.text = text;
    r.t.style.fill = ctx.settings.highContrast ? 0xffffff : color;
    r.t.position.set(clamp(x, safe.x + 70, safe.x + safe.w - 70), crestY - 44);
    r.y0 = crestY - 44;
    r.life = 1;
    r.t.visible = true;
  }

  function ripple(x: number, color: number, strength: number) {
    const r = ripples[rippleNext];
    rippleNext = (rippleNext + 1) % ripples.length;
    r.t = 0;
    r.x = x;
    r.color = color;
    r.s.visible = true;
    r.s.alpha = strength;
  }

  // ---------------- taps
  function registerTap(t: number, x: number, ghostTap = false) {
    const p = plan;
    const a = audio();
    lastTapVis = visualTime();
    const hc = ctx.settings.highContrast;
    void ghostTap;
    if (!p) {
      ripple(x, CYAN, 0.6);
      return;
    }
    const b = (t - p.origin) / p.T;
    const seg = segAt(p, Math.floor(b + 0.5));
    // calibration: record raw offset (before calibration is applied)
    if (p.kind === 'calib') {
      const raw = t + calibMs / 1000;
      let best = 99;
      for (const tg of p.targets) if (Math.abs(raw - tg.t) < Math.abs(best)) best = raw - tg.t;
      if (Math.abs(best) < 0.3) calibErrs.push(best);
      if (a && sfxBus) marimba(a, sfxBus, 72, a.currentTime, 0.6);
      ripple(x, CYAN, 0.7);
      particles.burst(x, crestY, 8, { color: CYAN, speed: 90, life: 0.6, size: 12 });
      return;
    }
    // graded target nearby?
    const w = windowsFor(stair.level, ctx.settings.timingMultiplier);
    let best: Target | null = null;
    let bestErr = 99;
    for (const tg of p.targets) {
      if (tg.judged) continue;
      const e = t - tg.t;
      if (Math.abs(e) < Math.abs(bestErr)) {
        bestErr = e;
        best = tg;
      }
    }
    if (best && Math.abs(bestErr) <= w.good) {
      const g = grade(bestErr, w);
      best.judged = true;
      best.grade = g;
      totalPts += GRADE_POINTS[g];
      totalTargets++;
      const mult = 1 + Math.min(streak, 20) * 0.05;
      score += Math.round(GRADE_POINTS[g] * mult);
      const correct = g === 'perfect' || g === 'great';
      streak = correct ? streak + 1 : 0;
      if (!preview) {
        stair.record(correct);
        ctx.trial({ correct, rtMs: Math.round(bestErr * 1000), level: stair.level });
      }
      const ms = Math.round(bestErr * 1000);
      showRating(g === 'perfect' ? 'Perfect' : `${gradeWord[g]} ${ms < 0 ? '· early' : '· late'}`, gradeColor(g), x);
      const col = gradeColor(g);
      ripple(x, hc ? 0xffffff : col, g === 'perfect' ? 1 : 0.75);
      particles.burst(x, crestY, g === 'perfect' ? 22 : 12, { color: col, speed: g === 'perfect' ? 170 : 110, life: 0.8, size: 14, gravity: -40 });
      if (a && sfxBus) {
        const scale = [69, 72, 74, 76, 79, 81];
        marimba(a, sfxBus, scale[Math.floor(Math.abs(b)) % scale.length], a.currentTime, 0.7);
        if (g === 'perfect') osc(a, sfxBus, 'sine', mf(96), a.currentTime + 0.03, 0.25, 0.05, 0.002);
      }
      ctx.haptics.tick();
      hud();
      return;
    }
    if (seg === 'cont' || (t >= p.contStart - p.T * 0.5 && t <= p.contEnd + p.T * 0.3)) {
      if (!contDone) {
        // continuation: the waves follow the player's taps
        const prev = contTaps.length ? contTaps[contTaps.length - 1] : -1;
        contTaps.push(t);
        if (prev > 0) {
          const iti = t - prev;
          if (iti > p.T * 0.4 && iti < p.T * 2) {
            chop = clamp(chop * 0.5 + (Math.abs(iti - estIti) / estIti) * 5, 0, 1);
            estIti = estIti * 0.6 + iti * 0.4;
          }
        }
        predictedNext = t + estIti;
        contBreaks.push(visualTime());
        if (contBreaks.length > 8) contBreaks.shift();
        ripple(x, hc ? 0xffffff : CYAN, 0.8);
        particles.burst(x, crestY, 10, { color: CYAN, speed: 110, life: 0.7, size: 13, gravity: -30 });
        if (a && sfxBus) marimba(a, sfxBus, [69, 72, 76, 74][contTaps.length % 4], a.currentTime, 0.6);
        ctx.haptics.tick();
        return;
      }
    }
    // stray tap
    ripple(x, 0x8fa6c0, 0.4);
    if (best && Math.abs(bestErr) < p.T * 0.5) showRating(bestErr < 0 ? 'Early' : 'Late', 0x9fb2c8, x);
    if (a && sfxBus) marimba(a, sfxBus, 64, a.currentTime, 0.35);
  }

  // ---------------- input
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (preview || ctx.isPaused() || !started) return;
    const stamp = (e.nativeEvent as PointerEvent | undefined)?.timeStamp;
    registerTap(tapTime(stamp), e.global.x);
  });
  const IGNORE_KEYS = /^(Escape|Tab|Shift|Control|Alt|Meta|F\d+|CapsLock|ContextMenu)/;
  window.addEventListener('keydown', (e) => {
    if (preview || ctx.isPaused() || !started || e.repeat) return;
    if (IGNORE_KEYS.test(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    registerTap(tapTime(e.timeStamp), cx);
  }, { signal: ctx.signal });

  // ---------------- per-frame
  function hud() {
    if (!plan) return;
    if (plan.kind === 'calib') {
      ctx.hud.set({ score, label: 'Sync check' });
      return;
    }
    const p = plan;
    const total = p.bEnd * p.T;
    ctx.hud.set({
      score,
      level: stair.level,
      progress: clamp((round - 1 + clamp((songTime - p.origin) / total, 0, 1)) / ROUNDS, 0, 1),
      label: `Round ${round}/${ROUNDS} · ${p.spec.bpm} BPM`,
    });
  }

  function setPhase(label: string, sub = '') {
    const key = label + '|' + sub;
    if (key === phaseLabel) return;
    phaseLabel = key;
    phaseText.text = label;
    subText.text = sub;
  }

  function nextCrestAfter(vt: number): number {
    const p = plan;
    if (!p) return -1;
    const seg = segAt(p, Math.floor((vt - p.origin) / p.T + 0.5));
    if (seg === 'cont' && !contDone) return predictedNext;
    for (const c of p.crests) if (c >= vt - 0.02) return c;
    return -1;
  }

  function drawWave(g: Graphics, u: number, alphaK: number, hc: boolean, phase: number) {
    const y = horizonY + (crestY - horizonY) * Math.pow(u, 1.7);
    const amp = (1.5 + 9 * u) * (1 + chop * 1.4);
    const steps = 28;
    const body = 6 + 26 * u;
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const yy = y + Math.sin(x * 0.018 + phase) * amp * 0.5 + Math.sin(x * 0.047 - phase * 1.3) * amp * 0.25 + (chop > 0.05 ? Math.sin(x * 0.13 + phase * 3) * chop * 3 : 0);
      pts.push(x, yy);
    }
    const fill = pts.slice();
    for (let i = steps; i >= 0; i--) fill.push(pts[i * 2], pts[i * 2 + 1] + body);
    const a = alphaK * (0.15 + 0.85 * u);
    if (!hc) g.poly(fill).fill({ color: CYAN, alpha: 0.07 * a });
    if (!hc) g.poly(pts, false).stroke({ width: 4 + 10 * u, color: CYAN, alpha: 0.12 * a });
    g.poly(pts, false).stroke({ width: hc ? 2 + 2 * u : 1.2 + 2.2 * u, color: hc ? 0xffffff : 0xc8fff8, alpha: Math.min(1, a) });
  }

  function frame(dt: number) {
    const k = Math.min(dt, 100) / 1000;
    tAmb += k;
    updateClock(dt);
    scheduleAudio();
    const vt = visualTime();
    const hc = ctx.settings.highContrast;
    const reduced = ctx.settings.reducedMotion;
    const p = plan;

    // judge misses
    if (p && p.kind === 'round') {
      const w = windowsFor(stair.level, ctx.settings.timingMultiplier);
      for (const tg of p.targets) {
        if (!tg.judged && songTime > tg.t + w.good + 0.02) {
          tg.judged = true;
          tg.grade = 'miss';
          totalTargets++;
          streak = 0;
          if (!preview) {
            stair.record(false);
            ctx.trial({ correct: false, level: stair.level });
          }
        }
      }
    }

    // ghost player (preview)
    if (preview && p) ghost(p);

    // phase labels + count-in
    if (p) {
      const bf = (vt - p.origin) / p.T;
      const b = Math.floor(bf + 0.02);
      const seg = segAt(p, b);
      if (seg === 'count' || seg === 'count2') {
        const n = (seg === 'count' ? p.bSync : p.bPattern) - b;
        if (n !== lastCount && n > 0 && n <= 4 && b >= 0) {
          lastCount = n;
          countText.text = String(n);
          countText.alpha = 1;
        }
        if (p.kind === 'calib') setPhase('Sync check', 'Tap along with the 8 clicks after the count');
        else if (seg === 'count') setPhase('Get ready', `${p.spec.bpm} BPM`);
        else setPhase('Pattern', 'Tap only on the lit dots');
      } else if (seg === 'calib') setPhase('Tap with each click', `${Math.max(0, p.bCont - b)} to go`);
      else if (seg === 'sync') {
        if (b >= p.bCont - 4) setPhase('The music fades…', 'Keep tapping the same beat');
        else setPhase('Tap as each wave crests', preview ? 'Waves break on the beat' : 'Tap anywhere · Space');
      } else if (seg === 'cont') {
        setPhase('Now keep the beat…', 'The waves follow you');
        if (!contCaptioned) {
          contCaptioned = true;
          ctx.caption('Music fades out — keep the beat yourself');
          ctx.announce('Now keep the beat');
        }
      } else if (seg === 'pattern') setPhase('Pattern', 'Tap only on the lit dots');
      else if (seg === 'done' && p.kind === 'round') setPhase('The tide settles', preview ? '' : round < ROUNDS ? 'Next tempo coming up' : '');
      if (seg !== 'count' && seg !== 'count2') lastCount = -1;
    }
    countText.alpha = Math.max(0, countText.alpha - k * 2.2);
    countText.scale.set(1 + (1 - countText.alpha) * 0.2);

    // crest tracking for moon pulse
    if (p) {
      for (const c of p.crests) if (c <= vt && c > lastCrest) lastCrest = c;
    }
    const lastBreak = Math.max(lastCrest, contBreaks.length ? contBreaks[contBreaks.length - 1] : -99);
    const pulse = Math.exp(-Math.max(0, vt - lastBreak) * 7);
    const tapGlow = Math.exp(-Math.max(0, vt - lastTapVis) * 5);
    chop = Math.max(0, chop - k * 0.25);

    // moon + approach ring (visual beat for sound-off play)
    moonHalo.alpha = 0.3 + pulse * 0.25;
    moonHalo.scale.set((moonR * 8) / 256 * (1 + pulse * 0.08));
    moonRing.clear();
    const nc = nextCrestAfter(vt);
    if (p && nc > 0) {
      const T = p.T;
      const f = clamp((nc - vt) / T, 0, 1.2);
      if (f <= 1.05) {
        const rr = moonR * (1.25 + 1.8 * f);
        moonRing.circle(moonX, moonY, rr).stroke({ width: hc ? 3 : 2.5, color: hc ? 0xffffff : 0xdff3ff, alpha: (1 - f * 0.7) * 0.9 });
      }
    }
    moonRing.circle(moonX, moonY, moonR * 1.25).stroke({ width: 1.5 + pulse * 3, color: hc ? 0xffffff : CYAN, alpha: 0.35 + pulse * 0.6 });

    // stars twinkle
    if (!reduced) {
      stars.alpha = 0.75 + Math.sin(tAmb * 0.9) * 0.2;
      stars2.alpha = 0.75 + Math.sin(tAmb * 1.3 + 2) * 0.2;
    }

    // moon reflection column
    reflect.clear();
    if (!hc) {
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        const y = horizonY + 6 + f * (crestY - horizonY - 30);
        const wob = reduced ? 0 : Math.sin(tAmb * 1.4 + i * 1.7) * (4 + f * 10);
        const w = (moonR * 0.7 + f * moonR * 1.6) * (0.7 + 0.3 * Math.sin(tAmb * 0.8 + i));
        reflect.roundRect(moonX - w / 2 + wob, y, w, 2 + f * 2, 2).fill({ color: 0xe8f0ff, alpha: (0.22 - f * 0.12) * (0.8 + pulse * 0.4) });
      }
    }

    // waves
    wavesG.clear();
    swashG.clear();
    crestLine.clear();
    const approach = p ? clamp(2.2 * p.T, 1.1, 2.4) : 1.6;
    const breakDur = 0.7;
    const phaseBase = reduced ? 0 : tAmb * 0.6;
    // ambient far swell lines
    if (!reduced) for (let i = 0; i < 3; i++) drawWave(wavesG, 0.08 + i * 0.06 + ((tAmb * 0.03) % 0.06), 0.35, hc, phaseBase + i * 2);
    const breaks: number[] = [];
    if (p && !reduced) {
      for (const c of p.crests) {
        const dtc = c - vt;
        if (dtc > approach) break;
        if (dtc >= 0) drawWave(wavesG, 1 - dtc / approach, 1, hc, phaseBase + c * 3.1);
        else if (dtc > -breakDur) breaks.push(-dtc);
      }
      // continuation: an approaching wave at the player's predicted beat
      if (!contDone && predictedNext > 0 && segAt(p, Math.floor((vt - p.origin) / p.T)) === 'cont') {
        const dtc = predictedNext - vt;
        if (dtc >= 0 && dtc < approach) drawWave(wavesG, 1 - dtc / approach, 0.8, hc, phaseBase + predictedNext * 3.1);
      }
      for (const cb of contBreaks) if (vt - cb < breakDur && vt >= cb) breaks.push(vt - cb);
    }
    for (const e of breaks) {
      const f = e / breakDur;
      const y = crestY + (shoreY - crestY) * easeOutCubic(f) * 0.9;
      const pts: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24) * W;
        pts.push(x, y + Math.sin(x * 0.03 + e * 5) * 3 * (1 - f) + Math.sin(x * 0.011) * 5);
      }
      if (!hc) swashG.poly(pts, false).stroke({ width: 10 * (1 - f) + 2, color: CYAN, alpha: 0.18 * (1 - f) });
      swashG.poly(pts, false).stroke({ width: 2, color: hc ? 0xffffff : 0xdffffb, alpha: 0.8 * (1 - f) });
    }
    // crest (hit) line
    const lineA = reduced ? 0.25 + pulse * 0.75 : 0.25 + pulse * 0.4;
    const dash = 14;
    for (let x = safe.x + 8; x < safe.x + safe.w - 8; x += dash * 2) crestLine.moveTo(x, crestY).lineTo(x + dash, crestY);
    crestLine.stroke({ width: hc ? 3 : 2, color: hc ? 0xffffff : 0xbaf7ff, alpha: hc ? 0.5 + pulse * 0.5 : lineA });
    if (reduced) crestLine.rect(0, horizonY - 1, W, 2 + pulse * 3).fill({ color: hc ? 0xffffff : CYAN, alpha: 0.3 + pulse * 0.6 });
    seaGlow.alpha = 0.12 + pulse * 0.12 + tapGlow * 0.3;
    wetSand.alpha = 0.6 + pulse * 0.4;

    // ripples along the shoreline
    for (const r of ripples) {
      if (!r.s.visible) continue;
      r.t += k;
      const f = r.t / 0.9;
      if (f >= 1) {
        r.s.visible = false;
        continue;
      }
      r.s.tint = r.color;
      r.s.position.set(r.x, crestY + 4);
      r.s.width = safe.w * (0.2 + f * 1.3);
      r.s.height = 26 + f * 18;
      r.s.alpha = (1 - f) * (1 - f);
    }
    // rating texts
    for (const r of ratingPool) {
      if (!r.t.visible) continue;
      r.life -= k * 1.3;
      if (r.life <= 0) {
        r.t.visible = false;
        continue;
      }
      r.t.alpha = Math.min(1, r.life * 2);
      r.t.y = r.y0 - (1 - r.life) * 26;
    }

    // pattern strip
    patternG.clear();
    patternTile.visible = false;
    if (p && p.kind === 'round' && p.spec.pattern) {
      const b = (vt - p.origin) / p.T;
      const seg = segAt(p, Math.floor(b));
      if (seg === 'count2' || seg === 'pattern') {
        const n = 8;
        const gap = Math.min(34, (safe.w - 60) / n);
        const x0 = cx - (gap * (n - 1)) / 2;
        const y = phaseText.y - 44;
        const slot = seg === 'pattern' ? Math.floor((b - p.bPattern) * 2) % 8 : -1;
        patternTile.visible = soft();
        for (let i = 0; i < n; i++) {
          const on = p.spec.pattern[i] === 1;
          const x = x0 + i * gap;
          const active = i === slot;
          if (soft()) {
            // every beat is an inset well; taps light up inside it (filled = tap, empty = rest), the playhead gets a ring
            softWell(patternG, x - 9, y - 9, 18, 18, 9, SAND_BASE, 3);
            if (on) patternG.circle(x, y, active ? 7 : 5.5).fill({ color: CYAN, alpha: active ? 1 : 0.8 });
            if (active) patternG.circle(x, y, 11).stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 });
            continue;
          }
          if (on) patternG.circle(x, y, active ? 9 : 7).fill({ color: hc ? 0xffffff : CYAN, alpha: active ? 1 : 0.7 });
          else patternG.circle(x, y, 5).stroke({ width: 1.5, color: 0xffffff, alpha: active ? 0.9 : 0.35 });
          if (i % 2 === 0) patternG.rect(x - 1, y + 14, 2, 5).fill({ color: 0xffffff, alpha: 0.35 });
        }
      }
    }

    // round flow
    if (p) flow(p);
    hudTimer += k;
    if (hudTimer > 0.3) {
      hudTimer = 0;
      if (!preview) hud();
    }
  }
  let hudTimer = 0;
  let contCaptioned = false;
  let started = false;

  // ---------------- ghost (preview)
  function ghost(p: Plan) {
    for (const tg of p.targets) {
      if (tg.ghosted) continue;
      if (songTime >= tg.t - 0.05) {
        tg.ghosted = true;
        if (rand() < 0.05) continue; // occasional miss
        const err = gauss(rand) * 0.02;
        const when = tg.t + err;
        ctx.after(Math.max(0, (when - songTime) * 1000), () => registerTap(when, cx + (rand() - 0.5) * safe.w * 0.5, true));
      }
    }
    if (!contDone && songTime >= p.contStart - 0.05 && songTime < p.contEnd) {
      if (ghostContNext < 0) {
        ghostContNext = p.contStart;
        ghostDriftK = 1 - 0.012 - rand() * 0.02;
      }
      if (songTime >= ghostContNext) {
        const when = ghostContNext + gauss(rand) * 0.02;
        registerTap(when, cx + (rand() - 0.5) * safe.w * 0.4, true);
        ghostContNext += p.T * ghostDriftK;
      }
    }
  }

  // ---------------- flow control
  function flow(p: Plan) {
    if (p.kind === 'calib') {
      if (songTime > p.origin + p.bCont * p.T + 0.4) finishCalib();
      return;
    }
    if (!contDone && songTime > p.contEnd + p.T * 0.3) {
      contDone = true;
      const r = analyseContinuation(contTaps, p.T);
      steadies.push(r.steadiness);
      if (r.valid) drifts.push(Math.abs(r.drift));
      const pts = r.valid ? Math.round(r.steadiness * 8 + Math.max(0, 1 - Math.abs(r.drift) / 10) * 400) : 0;
      score += pts;
      if (!preview) {
        const good = r.steadiness >= 70 && Math.abs(r.drift) < 6;
        stair.record(good);
        ctx.trial({ correct: good, level: stair.level });
      }
      showResult(r.steadiness, r.drift, r.valid);
      hud();
    }
    if (songTime > p.origin + p.bEnd * p.T + (p.spec.pattern ? 0.8 : 2.6) && !transitioning) void nextRound();
  }

  function showResult(steady: number, drift: number, valid: boolean) {
    resultShown = true;
    const hc = ctx.settings.highContrast;
    resultG.clear();
    const R = Math.min(60, safe.w * 0.15);
    resultTile.visible = soft();
    if (soft()) {
      const d = Math.round(R * 2 + 26);
      setSoft(resultTile, { width: d, height: d, base: SEA_BASE, radius: d / 2, depth: 8, resolution: sres });
      // inset groove for the steadiness arc
      const sh = softShades(SEA_BASE);
      resultG.circle(0, 0, R).stroke({ width: 9, color: mixHex(SEA_BASE, '#000000', 0.4) });
      resultG.circle(0.8, 0.8, R + 4.5).stroke({ width: 1, color: sh.light, alpha: 0.5 });
    } else {
      resultG.circle(0, 0, R).fill({ color: 0x051222, alpha: 0.55 });
      resultG.circle(0, 0, R).stroke({ width: 6, color: 0xffffff, alpha: 0.12 });
    }
    if (steady > 0) resultG.moveTo(0, -R).arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + (TAU * steady) / 100).stroke({ width: 6, color: hc ? 0xffffff : CYAN, alpha: 0.95, cap: 'round' });
    resultBig.text = valid ? `${steady}%` : '—';
    resultBig.position.set(0, -4);
    resultSmall.text = valid ? `Steady · drift ${drift > 0 ? '+' : ''}${drift.toFixed(1)}%${Math.abs(drift) >= 2 ? (drift < 0 ? ' (sped up)' : ' (slowed)') : ''}` : 'Keep tapping when the music fades';
    resultSmall.position.set(0, R + (soft() ? 34 : 18));
    ctx.caption(valid ? `Steady ${steady}%` : 'No steady beat detected');
    ctx.announce(valid ? `Steadiness ${steady} percent` : 'Keep tapping when the music fades');
    if (valid && steady >= 75) {
      const a = audio();
      if (a && sfxBus) [72, 76, 79, 84].forEach((n, i) => marimba(a, sfxBus!, n, a.currentTime + i * 0.08, 0.5));
    }
    void tween(ctx, 350, (t) => {
      result.alpha = t;
      result.scale.set(0.85 + 0.15 * t);
    }).then(() => ctx.wait(2300)).then(() => tween(ctx, 400, (t) => (result.alpha = 1 - t)));
  }

  function finishCalib() {
    const p = plan;
    plan = null;
    if (!p) return;
    let ms = 0;
    if (calibErrs.length >= 4) ms = clamp(Math.round(median(calibErrs) * 1000), -150, 300);
    calibMs = ms;
    ctx.storage.set('calibrationMs', ms);
    setPhase('Synced', calibErrs.length >= 4 ? `Timing offset ${ms} ms applied` : 'Using default timing');
    ctx.caption('Sync check done');
    void ctx.wait(1400).then(() => {
      if (alive) void nextRound();
    });
  }

  let transitioning = false;
  async function nextRound() {
    transitioning = true;
    if (!preview && round >= ROUNDS) {
      plan = null;
      await finish();
      return;
    }
    round = preview ? 1 : round + 1;
    const spec = roundSpec(stair.level, preview ? Math.floor(rand() * 3) : round - 1, rand, preview);
    contTaps = [];
    contDone = false;
    contCaptioned = false;
    predictedNext = -1;
    estIti = 60 / spec.bpm;
    ghostContNext = -1;
    contBreaks.length = 0;
    resultShown = false;
    lastCount = -1;
    phaseLabel = '';
    cancelFuture();
    plan = makePlan('round', spec, preview ? 0.3 : 1.2);
    resetScheduler();
    if (!preview) {
      ctx.announce(`Round ${round}, ${spec.bpm} beats per minute`);
      ctx.caption(`Music: soft beat at ${spec.bpm} BPM`);
    }
    hud();
    transitioning = false;
  }

  async function finish() {
    const accuracy = totalTargets ? Math.round(totalPts / totalTargets) : 0;
    const steadiness = steadies.length ? Math.round(steadies.reduce((a, b) => a + b, 0) / steadies.length) : 0;
    // no measurable continuation → report the capped worst case rather than a misleading 0%
    const drift = drifts.length ? Math.min(25, Math.round((drifts.reduce((a, b) => a + b, 0) / drifts.length) * 10) / 10) : 25;
    setPhase('The tide rests', `Accuracy ${accuracy}% · Steady ${steadiness}%`);
    await ctx.wait(1500);
    if (!alive) return;
    stopBed?.();
    ctx.end({
      score,
      levelReached: stair.level,
      stats: { accuracy, steadiness, drift },
      message: steadiness >= 80 ? 'Steady as the tide.' : 'The sea is learning your rhythm.',
    });
  }

  let stopBed: (() => void) | null = null;
  layout();
  ctx.onResize(layout);
  ctx.loop(frame);
  void resultShown;

  return {
    start() {
      started = true;
      stopBed = ctx.audio.ambient([45, 52, 57, 64], { gain: 0.03, brightness: 0.25 });
      if (needCalib) {
        calibErrs = [];
        plan = makePlan('calib', { bpm: 90, syncBeats: 8, contBeats: 0, pattern: null, patternBeats: 0 }, 1.0);
        resetScheduler();
        ctx.announce('Quick sync check: tap along with the clicks');
        ctx.caption('Sync check — tap with each click');
        hud();
      } else void nextRound();
    },
    onPause() {
      cancelFuture();
    },
    onResume() {
      // The AudioContext was suspended while paused; drop anything queued and reschedule from the current audio time.
      cancelFuture();
      synced = false;
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      cancelFuture();
      stopBed?.();
      try {
        musicBus?.disconnect();
        sfxBus?.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
