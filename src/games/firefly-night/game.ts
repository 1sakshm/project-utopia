import { Container, Graphics, Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, hex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture } from '@/sdk/pixi';

type Kind = 'firefly' | 'moth';

interface Insect {
  kind: Kind;
  view: Container;
  glow?: Sprite;
  born: number;
  life: number;
  stop: boolean; // stop-signal trial
  stopAt: number; // game time when stop signal fires
  stopFired: boolean;
  done: boolean;
  phase: number;
}

const ROUNDS = 3;
const ROUND_MS = 40000;

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const preview = ctx.mode === 'preview';
  const pal = ctx.manifest.palette;
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 12, up: 3, down: 1 });
  if (preview) stair.set(3);
  const note = ctx.audio.scale(69, 'majorPenta');

  // ---- scene graph
  const bg = new Sprite(gradientTexture([
    [0, '#070b1c'],
    [0.45, '#1b1f4d'],
    [0.75, '#3a2c5e'],
    [1, '#0c1a1c'],
  ]));
  const stars = new Graphics();
  const moon = new Container();
  const grassBack = new Graphics();
  const grassMid = new Graphics();
  const field = new Container(); // insects
  const grassFront = new Graphics();
  const fx = new Container();
  const ringG = new Graphics();
  const jar = new Container();
  app.stage.addChild(bg, stars, moon, grassBack, grassMid, field, grassFront, fx, ringG, jar);
  const particles = createParticles(ctx, fx, 260);

  const moonGlow = new Sprite(glowTexture(256, 0.2));
  moonGlow.anchor.set(0.5);
  moonGlow.tint = 0xfff1c9;
  moonGlow.alpha = 0.35;
  const moonDisc = new Graphics().circle(0, 0, 26).fill({ color: 0xfff6dc });
  moon.addChild(moonGlow, moonDisc);

  const jarGlass = new Graphics();
  const jarFill = new Graphics();
  const jarGlow = new Sprite(glowTexture(128, 0.3));
  jarGlow.anchor.set(0.5);
  jarGlow.tint = hex(pal.accent);
  jar.addChild(jarGlow, jarFill, jarGlass);

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  const bladesSeed = rng.next() * 1000;

  function drawGrass(g: Graphics, baseY: number, height: number, count: number, color: number, alpha: number, seed: number) {
    g.clear();
    let s = seed;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < count; i++) {
      const x = (i / count) * W + r() * (W / count);
      const h = height * (0.5 + r() * 0.8);
      const lean = (r() - 0.5) * 40;
      g.moveTo(x - 4, baseY + 10)
        .quadraticCurveTo(x + lean * 0.3, baseY - h * 0.5, x + lean, baseY - h)
        .quadraticCurveTo(x + lean * 0.3 + 3, baseY - h * 0.5, x + 4, baseY + 10)
        .fill({ color, alpha });
    }
    g.rect(0, baseY + 8, W, H - baseY).fill({ color, alpha });
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.width = W;
    bg.height = H;
    stars.clear();
    for (let i = 0; i < 90; i++) {
      const x = ((i * 7919) % 1000) / 1000 * W;
      const y = ((i * 104729) % 1000) / 1000 * H * 0.5;
      stars.circle(x, y, (i % 3) * 0.5 + 0.6).fill({ color: 0xffffff, alpha: 0.25 + (i % 5) * 0.12 });
    }
    moon.position.set(safe.x + safe.w * 0.78, safe.y + safe.h * 0.12);
    const hc = ctx.settings.highContrast;
    drawGrass(grassBack, H * 0.6, H * 0.12, 70, hc ? 0x111111 : 0x1a2c3a, 1, bladesSeed);
    drawGrass(grassMid, H * 0.78, H * 0.14, 50, hc ? 0x0a0a0a : 0x10222a, 1, bladesSeed + 7);
    drawGrass(grassFront, H * 0.97, H * 0.1, 36, hc ? 0x000000 : 0x08161b, 1, bladesSeed + 13);
    const jx = safe.x + safe.w - 46;
    const jy = safe.y + safe.h - 70;
    jar.position.set(jx, jy);
    jarGlass.clear();
    jarGlass.roundRect(-22, -34, 44, 64, 10).stroke({ width: 2.5, color: 0xe8f4ff, alpha: 0.7 });
    jarGlass.roundRect(-14, -42, 28, 9, 3).fill({ color: 0xb7a07a, alpha: 0.9 });
    drawJar();
  }

  let jarLevel = 0;
  function drawJar() {
    jarFill.clear();
    const h = 58 * clamp(jarLevel, 0, 1);
    if (h > 1) jarFill.roundRect(-19, 27 - h, 38, h, 7).fill({ color: hex(pal.accent), alpha: 0.75 });
    jarGlow.alpha = 0.15 + jarLevel * 0.7;
    jarGlow.scale.set(1 + jarLevel * 0.8);
  }

  const fireflyTex = glowTexture(96, 0.18);

  function makeInsect(kind: Kind): Container {
    const c = new Container();
    const hc = ctx.settings.highContrast;
    if (kind === 'firefly') {
      const glow = new Sprite(fireflyTex);
      glow.anchor.set(0.5);
      glow.tint = hc ? 0xffffff : hex(pal.accent);
      glow.scale.set(1.1);
      const wings = new Graphics()
        .ellipse(-9, -6, 9, 5)
        .ellipse(9, -6, 9, 5)
        .fill({ color: 0xdfefff, alpha: 0.55 });
      const body = new Graphics().circle(0, 0, 9).fill({ color: hc ? 0xffffff : 0xfff6b0 }).circle(0, -9, 5).fill({ color: 0x2a2a3a });
      c.addChild(glow, wings, body);
    } else {
      const col = hc ? 0x9a9a9a : 0x8b7a6a;
      const wings = new Graphics()
        .poly([0, -2, -30, -18, -22, 16])
        .poly([0, -2, 30, -18, 22, 16])
        .fill({ color: col, alpha: 0.95 })
        .poly([0, -2, -30, -18, -22, 16])
        .poly([0, -2, 30, -18, 22, 16])
        .stroke({ width: hc ? 3 : 1.5, color: hc ? 0xffffff : 0x5a4c40 });
      const body = new Graphics().ellipse(0, 2, 5, 14).fill({ color: 0x4a3d33 });
      c.addChild(wings, body);
    }
    return c;
  }

  // ---- game state
  const insects: Insect[] = [];
  let alive = true;
  let running = false;
  let score = 0;
  let caught = 0;
  let catchTimes: number[] = [];
  let stopTrials = 0;
  let stopOk = 0;
  let round = 0;
  let roundEnd = 0;
  let nextSpawn = 0;
  let ssd = 250; // stop-signal delay (adaptive)
  let ringT = -1;
  let stopAmbient: (() => void) | null = null;

  const levelParams = () => {
    const L = stair.level;
    return {
      window: Math.max(450, 950 - (L - 1) * 45) * ctx.settings.timingMultiplier,
      gap: Math.max(380, 900 - L * 40) * ctx.settings.timingMultiplier,
      maxAlive: L >= 8 ? 3 : L >= 4 ? 2 : 1,
      mothChance: 0.25,
      stopChance: L >= 2 ? 0.25 : 0,
    };
  };

  function spawn() {
    const p = levelParams();
    if (insects.filter((i) => !i.done).length >= p.maxAlive) return;
    const kind: Kind = rng.chance(p.mothChance) ? 'moth' : 'firefly';
    const view = makeInsect(kind);
    // position inside the meadow part of the safe rect, away from edges and the jar
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = safe.x + 50 + rng.next() * (safe.w - 100);
      y = safe.y + safe.h * 0.28 + rng.next() * safe.h * 0.52;
      if (!insects.some((i) => !i.done && Math.hypot(i.view.x - x, i.view.y - y) < 90)) break;
    }
    view.position.set(x, y);
    view.scale.set(0);
    field.addChild(view);
    const now = ctx.time();
    const stop = kind === 'firefly' && rng.chance(p.stopChance);
    const ins: Insect = {
      kind,
      view,
      born: now,
      life: p.window + (stop ? 250 : 0),
      stop,
      stopAt: now + ssd,
      stopFired: false,
      done: false,
      phase: rng.next() * 6,
    };
    insects.push(ins);
    void tween(ctx, ctx.settings.reducedMotion ? 1 : 140, (t) => view.scale.set(t));
    if (preview) ghost(ins);
  }

  function ghost(ins: Insect) {
    if (ins.kind === 'moth') {
      if (rng.chance(0.08)) ctx.after(420, () => hit(ins));
      return;
    }
    const rt = 300 + rng.next() * 220;
    ctx.after(rt, () => {
      if (ins.done) return;
      if (ins.stopFired && rng.chance(0.7)) return; // resist
      hit(ins);
    });
  }

  function retire(ins: Insect, outcome: 'caught' | 'miss' | 'moth-hit' | 'spared' | 'stopped' | 'stop-fail') {
    ins.done = true;
    const v = ins.view;
    if (outcome === 'caught' || outcome === 'stop-fail') {
      void tween(ctx, 260, (t) => {
        v.scale.set(1 + t * 0.6);
        v.alpha = 1 - t;
      }).then(() => v.destroy({ children: true }));
    } else if (outcome === 'moth-hit') {
      void tween(ctx, 400, (t) => {
        v.y += 1.5;
        v.alpha = 1 - t;
        v.rotation = t * 0.8;
      }).then(() => v.destroy({ children: true }));
    } else {
      void tween(ctx, 300, (t) => {
        v.alpha = 1 - t;
        v.y -= 1.2;
      }).then(() => v.destroy({ children: true }));
    }
  }

  function hit(ins: Insect) {
    if (ins.done || !running) return;
    const now = ctx.time();
    const rt = now - ins.born;
    if (ins.kind === 'moth') {
      score = Math.max(0, score - 15);
      ctx.audio.noise({ dur: 0.25, filter: 900, gain: 0.08 });
      ctx.audio.thunk({ gain: 0.2 });
      ctx.haptics.error();
      ctx.caption('Oops — a moth');
      ctx.trial({ correct: false, rtMs: rt, level: stair.level });
      stair.record(false);
      retire(ins, 'moth-hit');
    } else if (ins.stop && ins.stopFired) {
      score = Math.max(0, score - 10);
      stopTrials++;
      ssd = Math.max(50, ssd - 50);
      ctx.audio.thunk({ gain: 0.18 });
      ctx.haptics.error();
      ctx.trial({ correct: false, rtMs: rt, level: stair.level });
      retire(ins, 'stop-fail');
    } else {
      caught++;
      catchTimes.push(rt);
      const bonus = Math.round(clamp((700 - rt) / 80, 0, 5));
      score += 10 + bonus;
      jarLevel = Math.min(1, jarLevel + 0.035);
      drawJar();
      ctx.audio.bell(note(Math.min(9, caught % 10)), { gain: 0.1, dur: 1 });
      ctx.haptics.tick();
      particles.burst(ins.view.x, ins.view.y, 22, { color: hex(pal.accent), speed: 180, life: 0.7 });
      ctx.trial({ correct: true, rtMs: rt, level: stair.level });
      stair.record(true);
      retire(ins, 'caught');
    }
    hud();
  }

  function fireStop(ins: Insect) {
    ins.stopFired = true;
    ringT = 0;
    ctx.audio.chime(ctx.audio.midi(88), { gain: 0.12, dur: 1.4 });
    ctx.audio.chime(ctx.audio.midi(95), { gain: 0.08, dur: 1.2, when: ctx.audio.now() + 0.05 });
    ctx.caption('Wind chime — freeze!');
    ctx.announce('Freeze');
  }

  function update(dt: number) {
    const now = ctx.time();
    const reduced = ctx.settings.reducedMotion;
    // grass sway (parallax)
    if (!reduced) {
      const s = now / 1000;
      grassBack.x = Math.sin(s * 0.6) * 3;
      grassMid.x = Math.sin(s * 0.8 + 1) * 5;
      grassFront.x = Math.sin(s * 1.0 + 2) * 7 + (ringT >= 0 ? Math.sin(ringT * 30) * 4 * (1 - ringT) : 0);
    }
    // stop-signal ring
    ringG.clear();
    if (ringT >= 0) {
      ringT += dt / 700;
      const r = Math.max(W, H) * (0.15 + ringT * 0.9);
      ringG.circle(W / 2, H * 0.55, r).stroke({ width: 10 * (1 - ringT) + 2, color: hex(pal.accent2), alpha: 0.9 * (1 - ringT) });
      if (ringT >= 1) ringT = -1;
    }
    // insects
    for (const ins of insects) {
      if (ins.done) continue;
      const age = now - ins.born;
      ins.phase += dt / 1000;
      if (ins.kind === 'firefly' && ins.glow === undefined) ins.glow = ins.view.children[0] as Sprite;
      if (ins.glow && ctx.settings.flashIntensity !== 'none') {
        const blinkHz = 1.4;
        const amp = ctx.settings.flashIntensity === 'reduced' ? 0.15 : 0.35;
        ins.glow.alpha = 0.65 + Math.sin(ins.phase * Math.PI * 2 * blinkHz) * amp;
      }
      if (!reduced) {
        ins.view.y += Math.sin(ins.phase * 3) * 0.25;
        if (ins.kind === 'moth') ins.view.children[0].scale.x = 0.8 + Math.abs(Math.sin(ins.phase * 9)) * 0.2;
      }
      if (ins.stop && !ins.stopFired && now >= ins.stopAt) fireStop(ins);
      if (age >= ins.life) {
        if (ins.kind === 'moth') {
          retire(ins, 'spared');
        } else if (ins.stop && ins.stopFired) {
          stopTrials++;
          stopOk++;
          score += 20;
          ssd = Math.min(ins.life - 150, ssd + 50);
          ctx.audio.chime(note(2), { gain: 0.08, dur: 1.6 });
          ctx.trial({ correct: true, level: stair.level });
          retire(ins, 'stopped');
        } else {
          ctx.trial({ correct: false, level: stair.level });
          stair.record(false);
          retire(ins, 'miss');
        }
        hud();
      }
    }
    for (let i = insects.length - 1; i >= 0; i--) if (insects[i].done && insects[i].view.destroyed) insects.splice(i, 1);

    if (!running) return;
    if (now >= nextSpawn) {
      spawn();
      nextSpawn = now + levelParams().gap + rng.next() * 500;
    }
    if (!preview && now >= roundEnd) void endRound();
    hud();
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      timer: Math.max(0, Math.ceil((roundEnd - ctx.time()) / 1000)),
      label: `Round ${Math.min(round, ROUNDS)}/${ROUNDS}`,
    });
  }

  async function startRound() {
    round++;
    roundEnd = ctx.time() + ROUND_MS;
    nextSpawn = ctx.time() + 800;
    running = true;
    hud();
  }

  async function endRound() {
    running = false;
    // moonrise between rounds
    const y0 = moon.y;
    await tween(ctx, 900, (t) => (moon.y = y0 - t * 20));
    if (round >= ROUNDS) {
      const avg = catchTimes.length ? Math.round(catchTimes.reduce((a, b) => a + b, 0) / catchTimes.length) : 0;
      ctx.end({
        score,
        levelReached: stair.level,
        stats: { caught, calm: stopTrials ? Math.round((stopOk / stopTrials) * 100) : 100, avgCatch: avg },
        message: jarLevel >= 0.9 ? 'A jar full of light.' : 'The meadow glows a little brighter.',
      });
      return;
    }
    ctx.announce(`Round ${round + 1}`);
    await ctx.wait(1200);
    if (alive) await startRound();
  }

  // ---- input: stage-level, nearest insect within a generous radius
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (preview || !running) return;
    let best: Insect | null = null;
    let bestD = 64; // ≥ 48px target radius
    for (const ins of insects) {
      if (ins.done) continue;
      const d = Math.hypot(ins.view.x - e.global.x, ins.view.y - e.global.y);
      if (d < bestD) {
        bestD = d;
        best = ins;
      }
    }
    if (best) hit(best);
  });
  ctx.keys({
    Space: () => {
      const live = insects.filter((i) => !i.done);
      if (live.length) hit(live[live.length - 1]);
    },
  });

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  return {
    start() {
      stopAmbient = ctx.audio.ambient([45, 52, 57, 64], { gain: 0.045, brightness: 0.25 });
      void startRound();
    },
    onSettings: () => layout(),
    destroy() {
      alive = false;
      running = false;
      stopAmbient?.();
    },
  };
}
