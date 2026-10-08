import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, damp } from '@/sdk';
import { mountR3F, useGame, GameEffects, GradientSky, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { clay, shade } from './soft';
import {
  RING_R,
  MAX_WAVES,
  POINTS,
  levelDef,
  makeWave,
  angleAt,
  windows,
  gradeFor,
  comboMult,
  cometsInWave,
  histogram,
  type Comet,
} from './logic';

const RING_COLORS = ['#7af0ff', '#ffd98a', '#ff9ad5'];
const RING_MIDI = [79, 74, 69];
const TILT = -0.28;
const MAXC = 12;
const TAIL = 26;
const MAXD = 180;
const RING_KEYS = ['J', 'K', 'L'];

/** Mutable view-model shared between game logic and the scene. */
class View {
  comets: Comet[] = [];
  rings = 1;
  ringVis = [1, 0, 0];
  ringDirs: Array<1 | -1> = [1, 1, 1];
  pulse = [0, 0, 0];
  miss = [0, 0, 0];
  moon = { on: false, x: 0, y: 0, r: 0.8 };
  aurora = 0;
  auroraFlash = 0;
  combo = 0;
  // stardust flying from gate to planet
  dx0 = new Float32Array(MAXD);
  dy0 = new Float32Array(MAXD);
  dcx = new Float32Array(MAXD);
  dcy = new Float32Array(MAXD);
  dtx = new Float32Array(MAXD);
  dty = new Float32Array(MAXD);
  dtz = new Float32Array(MAXD);
  dt0 = new Float32Array(MAXD).fill(-1e9);
  ddur = new Float32Array(MAXD).fill(1);
  dring = new Uint8Array(MAXD);
  dNext = 0;
  popups: Array<{ t0: number; ring: number; grade: number; err: number; seq: number }> = [];
  popSeq = 0;
  version = 0;
  private subs = new Set<() => void>();
  subscribe = (cb: () => void) => {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  };
  getVersion = () => this.version;
  bump() {
    this.version++;
    this.subs.forEach((s) => s());
  }
}

export default function create(ctx: GameContext): GameInstance {
  const view = new View();
  const rng = ctx.rng;
  const preview = ctx.mode === 'preview';
  const stair = ctx.staircase({ min: 1, max: 10, up: 3, down: 1 });
  if (preview) stair.set(3);
  const burstRef: { current: BurstHandle | null } = { current: null };

  let alive = true;
  let over = false;
  let score = 0;
  let lives = 3;
  let wave = 0;
  let combo = 0;
  let bestCombo = 0;
  let judged = 0;
  let perfects = 0;
  let hits = 0;
  let maxLevel = stair.level;
  const errors: number[] = [];
  const hitErrors: number[] = [];
  let stopAmbient: (() => void) | null = null;
  let stopComboPad: (() => void) | null = null;
  let endOverlay: HTMLDivElement | null = null;
  // Second chance: set while the revive offer is pending; misses inside the grace window after a revive are free.
  let reviving = false;
  let graceUntil = 0;

  const gatePos = (ring: number): [number, number, number] => [0, RING_R[ring], 0.05];
  const ringFreq = (ring: number) => ctx.audio.midi(RING_MIDI[ring]);

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      lives,
      maxLives: 3,
      progress: preview ? undefined : clamp((wave - 1) / MAX_WAVES, 0, 1),
      label: combo >= 5 ? `Combo ${combo} · ×${comboMult(combo)}` : `Wave ${Math.max(1, wave)}`,
    });
  }

  function spawnDust(ring: number, n: number) {
    const [gx, gy] = gatePos(ring);
    const count = Math.max(4, Math.round(n * ctx.quality.particleScale));
    const now = ctx.time();
    for (let k = 0; k < count; k++) {
      const i = view.dNext;
      view.dNext = (view.dNext + 1) % MAXD;
      const a = rng.next() * Math.PI * 2;
      const r = 0.25 + rng.next() * 0.7;
      view.dx0[i] = gx + (rng.next() - 0.5) * 0.3;
      view.dy0[i] = gy + (rng.next() - 0.5) * 0.3;
      view.dtx[i] = Math.cos(a) * r * 0.95;
      view.dty[i] = Math.sin(a) * r * 0.95;
      view.dtz[i] = Math.sqrt(Math.max(0, 1 - r * r)) * 0.95;
      const side = rng.next() < 0.5 ? -1 : 1;
      view.dcx[i] = gx + side * (1.2 + rng.next() * 1.6);
      view.dcy[i] = gy * 0.55 + rng.next() * 1.2;
      view.dt0[i] = now + k * 18;
      view.ddur[i] = 850 + rng.next() * 500;
      view.dring[i] = ring;
    }
  }

  function popup(ring: number, grade: number, err: number) {
    view.popups.push({ t0: ctx.time(), ring, grade, err, seq: view.popSeq++ });
    if (view.popups.length > 3) view.popups.shift();
  }

  function hit(c: Comet, grade: 0 | 1 | 2, err: number) {
    c.state = 2;
    c.tRes = ctx.time();
    judged++;
    hits++;
    if (grade === 0) perfects++;
    errors.push(err);
    hitErrors.push(err);
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    view.combo = combo;
    score += Math.round(POINTS[grade] * comboMult(combo));
    view.pulse[c.ring] = grade === 0 ? 1 : grade === 1 ? 0.75 : 0.5;
    view.aurora = Math.min(1, view.aurora + ((grade === 0 ? 1.4 : grade === 1 ? 1 : 0.7) / 45) * (preview ? 3 : 1));
    const f = ringFreq(c.ring);
    if (grade === 0) {
      ctx.audio.chime(f, { gain: 0.16, dur: 1.2 });
      ctx.audio.bell(f * 2, { gain: 0.05, dur: 1.4 });
      ctx.haptics.success();
    } else if (grade === 1) {
      ctx.audio.chime(f, { gain: 0.11, dur: 0.9 });
      ctx.haptics.tick();
    } else {
      ctx.audio.pluck(f, { gain: 0.1 });
      ctx.haptics.tick();
    }
    const [gx, gy, gz] = gatePos(c.ring);
    burstRef.current?.burst([gx, gy, gz], grade === 0 ? 46 : grade === 1 ? 28 : 16, {
      color: grade === 0 ? '#fff1c4' : RING_COLORS[c.ring],
      speed: grade === 0 ? 2.6 : 1.8,
      life: 1.1,
    });
    spawnDust(c.ring, grade === 0 ? 18 : grade === 1 ? 11 : 6);
    popup(c.ring, grade, err);
    ctx.trial({ correct: true, rtMs: Math.abs(err), level: stair.level });
    stair.record(true);
    if (combo === 8 && !stopComboPad) stopComboPad = ctx.audio.ambient([69, 76, 81, 86], { gain: 0.022, brightness: 0.55 });
    hud();
  }

  function miss(c: Comet, err: number | null) {
    const now = ctx.time();
    const tau = (c.tGate - now) / 1000;
    const a = angleAt(c, tau);
    const R = RING_R[c.ring];
    const w = tau <= c.ts ? c.w2 : c.w1;
    c.state = 3;
    c.tRes = now;
    c.mx = Math.cos(a) * R;
    c.my = Math.sin(a) * R;
    // Fly off along the tangent (direction of travel), drifting outward.
    const sp = w * R;
    const tx = Math.sin(a) * c.dir;
    const ty = -Math.cos(a) * c.dir;
    c.vx = (tx + Math.cos(a) * 0.45) * sp;
    c.vy = (ty + Math.sin(a) * 0.45) * sp;
    judged++;
    if (err !== null) errors.push(clamp(err, -300, 300));
    combo = 0;
    view.combo = 0;
    view.miss[c.ring] = 1;
    stopComboPad?.();
    stopComboPad = null;
    if (!preview && now >= graceUntil) lives = Math.max(0, lives - 1);
    if (!preview && lives <= 0 && !reviving) void tryRevive();
    ctx.audio.noise({ dur: 0.8, filter: 1800, sweepTo: 260, gain: 0.07, pan: clamp(c.mx / 3, -1, 1) });
    ctx.haptics.error();
    const label = err === null ? 'Missed' : err < 0 ? 'Early' : 'Late';
    ctx.caption(`${label}: comet flies away`);
    popup(c.ring, 3, err ?? 999);
    ctx.trial({ correct: false, level: stair.level });
    stair.record(false);
    hud();
  }

  /** Out of lives: ask the platform for a second chance (pauses the game while the offer is shown). */
  async function tryRevive() {
    reviving = true;
    const granted = await ctx.revive();
    if (alive && !over && granted) {
      lives = 1;
      graceUntil = ctx.time() + 1500;
      view.auroraFlash = 1;
      burstRef.current?.burst([0, 0, 0.05], 60, { color: '#fff1c4', speed: 2.4, life: 1.2 });
      ctx.audio.success();
      ctx.haptics.success();
      ctx.caption('Second chance!');
      ctx.announce('Second chance! One life restored');
      hud();
    }
    reviving = false;
  }

  /** Player (or ghost) tap. ring = specific ring or null for "nearest". */
  function press(ring: number | null, fallback = false) {
    if (!alive || over) return;
    const now = ctx.time();
    const w = windows(ctx.settings.timingMultiplier);
    let best: Comet | null = null;
    let bestAbs = Infinity;
    for (const c of view.comets) {
      if (c.state !== 1) continue;
      if (ring !== null && c.ring !== ring) continue;
      const d = Math.abs(now - c.tGate);
      if (d < bestAbs) {
        bestAbs = d;
        best = c;
      }
    }
    if (!best || bestAbs > w.miss) {
      if (fallback && ring !== null) return press(null, false);
      // Empty tap: gentle, no penalty.
      const r = ring ?? 0;
      view.pulse[r] = Math.max(view.pulse[r], 0.15);
      ctx.audio.tick();
      return;
    }
    const err = now - best.tGate;
    const g = gradeFor(Math.abs(err), w);
    if (g === 3) miss(best, err);
    else hit(best, g, err);
  }

  /** Per-frame game logic: spawning, misses, approach ticks, cleanup. */
  ctx.loop(() => {
    const now = ctx.time();
    const w = windows(ctx.settings.timingMultiplier);
    for (let i = view.comets.length - 1; i >= 0; i--) {
      const c = view.comets[i];
      const tau = (c.tGate - now) / 1000;
      if (c.state === 0 && tau <= c.spawnTau) {
        c.state = 1;
        if (preview) scheduleGhost(c);
      }
      if (c.state === 1) {
        // Soft approach ticks (two beats before the gate) — supports anticipation and low vision.
        const beat = 0.32;
        if (c.ticks === 0 && tau <= beat * 2 && tau > beat) {
          c.ticks = 1;
          ctx.audio.tone(ringFreq(c.ring) * 2, { dur: 0.05, gain: 0.025, type: 'sine' });
        } else if (c.ticks === 1 && tau <= beat && tau > 0) {
          c.ticks = 2;
          ctx.audio.tone(ringFreq(c.ring) * 2, { dur: 0.05, gain: 0.035, type: 'sine' });
        }
        if (now - c.tGate > w.miss) miss(c, null);
      }
      if ((c.state === 2 || c.state === 3) && now - c.tRes > 1400) view.comets.splice(i, 1);
    }
  }, 5);

  function scheduleGhost(c: Comet) {
    const r = rng.next();
    let err: number;
    if (r < 0.06) err = (rng.chance(0.5) ? -1 : 1) * (190 + rng.next() * 60);
    else if (r < 0.26) err = (rng.chance(0.5) ? -1 : 1) * (38 + rng.next() * 45);
    else err = (rng.next() - 0.5) * 36;
    const delay = c.tGate + err - ctx.time();
    ctx.after(Math.max(0, delay), () => {
      if (c.state === 1) press(c.ring);
    });
  }

  function setupWave(def: ReturnType<typeof levelDef>) {
    view.rings = def.rings;
    for (let r = 0; r < 3; r++) {
      view.ringDirs[r] = def.reverse ? (rng.chance(0.5) ? 1 : -1) : r % 2 === 0 ? 1 : -1;
    }
    if (def.occlusion > 0) {
      const ring = def.rings - 1;
      const R = RING_R[ring];
      const wRing = def.omega * (RING_R[1] / R) ** 0.5;
      const occEnd = wRing * def.reappearSec;
      const center = Math.PI / 2 + view.ringDirs[ring] * (occEnd + def.occlusion / 2);
      const mr = R + 0.25;
      view.moon = { on: true, x: Math.cos(center) * mr, y: Math.sin(center) * mr, r: R * Math.sin(def.occlusion / 2) + 0.12 };
    } else view.moon = { ...view.moon, on: false };
    view.bump();
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([45, 52, 57, 64], { gain: 0.045, brightness: 0.25 });
    await ctx.wait(preview ? 200 : 600);
    while (alive) {
      wave++;
      if (preview && wave > 4) {
        wave = 1;
        view.aurora = Math.min(view.aurora, 0.35);
      }
      if (preview) stair.set(wave <= 2 ? 1 : 3 + (wave % 2));
      const level = stair.level;
      maxLevel = Math.max(maxLevel, level);
      const def = levelDef(level, ctx.settings.timingMultiplier);
      setupWave(def);
      hud();
      const n = preview ? 5 : cometsInWave(wave);
      ctx.announce(`Wave ${wave}${def.rings > 1 ? `, ${def.rings} rings` : ''}${def.occlusion > 0 ? ', moon hides the outer ring' : ''}`);
      if (!preview && wave > 1) ctx.caption(`Wave ${wave}`);
      // First gate lands ~2 s after the wave starts so the mechanic is visible immediately.
      const first = ctx.time() + Math.max(1900, 1300 + def.gapMs * 0.4);
      const list = makeWave(rng, def, n, first, view.ringDirs);
      view.comets.push(...list);
      while (alive && list.some((c) => c.state < 2)) {
        await ctx.wait(80);
        if (!preview && lives <= 0 && !reviving) break;
      }
      while (alive && reviving) await ctx.wait(80);
      if (!alive) return;
      if (!preview && lives <= 0) break;
      // wave cleared
      const clean = list.every((c) => c.state === 2);
      if (clean) {
        score += 50 * wave;
        view.auroraFlash = 1;
        ctx.audio.success();
        hud();
      }
      if (!preview && wave >= MAX_WAVES) break;
      await ctx.wait(1100);
    }
    if (!alive || preview) return;
    await finish();
  }

  async function finish() {
    over = true;
    view.comets = view.comets.filter((c) => c.state >= 2);
    const hitErrs = hitErrors;
    const signed = hitErrs.length ? hitErrs.reduce((a, b) => a + b, 0) / hitErrs.length : 0;
    const meanAbs = hitErrs.length ? Math.round(hitErrs.reduce((a, b) => a + Math.abs(b), 0) / hitErrs.length) : 0;
    const perfectPct = judged ? Math.round((perfects / judged) * 100) : 0;
    const tendency =
      hitErrs.length < 3
        ? 'Watch the comet glide in, then tap as it enters the gate.'
        : Math.abs(signed) < 8
        ? 'Your timing is beautifully centred.'
        : `You tend to tap about ${Math.round(Math.abs(signed))} ms ${signed < 0 ? 'early' : 'late'}.`;
    showHistogram(histogram(hitErrs, 8, windows(ctx.settings.timingMultiplier).good), tendency);
    ctx.announce(tendency);
    await ctx.wait(3200);
    endOverlay?.remove();
    ctx.end({
      score,
      levelReached: maxLevel,
      stats: { perfectPct, meanError: meanAbs, bestCombo },
      message: tendency,
    });
  }

  function showHistogram(h: number[], text: string) {
    const max = Math.max(1, ...h);
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:50%;bottom:calc(64px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(300px,80%);padding:14px 16px 12px;border-radius:18px;background:rgba(8,10,30,0.72);border:1px solid rgba(255,255,255,0.14);color:#fff;font:600 13px "Geist Variable",system-ui,sans-serif;text-align:center;pointer-events:none;';
    const title = document.createElement('div');
    title.textContent = 'Your timing';
    title.style.cssText = 'font-weight:800;font-size:15px;margin-bottom:8px;';
    const bars = document.createElement('div');
    bars.style.cssText = 'display:flex;align-items:flex-end;gap:4px;height:64px;margin:0 4px;';
    h.forEach((v, i) => {
      const b = document.createElement('div');
      const centre = i === 3 || i === 4;
      b.style.cssText = `flex:1;border-radius:4px 4px 1px 1px;height:${Math.max(4, (v / max) * 64)}px;background:${centre ? '#ffe29a' : i < 4 ? '#7af0ff' : '#ff9ad5'};opacity:${v ? 1 : 0.3};`;
      bars.appendChild(b);
    });
    const axis = document.createElement('div');
    axis.style.cssText = 'display:flex;justify-content:space-between;margin-top:6px;opacity:0.8;font-size:12px;';
    axis.innerHTML = '<span>◀ early</span><span>●</span><span>late ▶</span>';
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = 'margin-top:8px;font-size:13px;opacity:0.95;';
    el.append(title, bars, axis, msg);
    ctx.container.appendChild(el);
    endOverlay = el;
  }

  ctx.keys({
    Space: () => press(null),
    Enter: () => press(null),
    KeyJ: () => (view.rings >= 1 ? press(0, true) : undefined),
    KeyK: () => (view.rings >= 2 ? press(1, true) : press(null)),
    KeyL: () => (view.rings >= 3 ? press(2, true) : press(null)),
    Digit1: () => press(0, true),
    Digit2: () => (view.rings >= 2 ? press(1, true) : press(null)),
    Digit3: () => (view.rings >= 3 ? press(2, true) : press(null)),
  });

  function onPlaneDown(localX: number, localY: number) {
    if (preview || ctx.isPaused()) return;
    const r = Math.hypot(localX, localY);
    let ring: number | null = null;
    let bestD = 0.36;
    for (let i = 0; i < view.rings; i++) {
      const d = Math.abs(r - RING_R[i]);
      if (d < bestD) {
        bestD = d;
        ring = i;
      }
    }
    press(ring, true);
  }

  const unmount = mountR3F(ctx, <Scene view={view} burstRef={burstRef} onPlaneDown={onPlaneDown} />, {
    camera: { position: [0, 0, 20], fov: 40 },
    background: ctx.manifest.palette.bg,
  });

  return {
    start() {
      hud();
      void run();
    },
    destroy() {
      alive = false;
      stopAmbient?.();
      stopComboPad?.();
      endOverlay?.remove();
      unmount();
    },
  };
}

// ---------------------------------------------------------------- Scene

function Scene({ view, burstRef, onPlaneDown }: { view: View; burstRef: { current: BurstHandle | null }; onPlaneDown: (x: number, y: number) => void }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const group = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  return (
    <>
      <CameraRig view={view} />
      <GradientSky top="#04051a" bottom="#1d1450" />
      <Stars />
      <Nebula />
      <ambientLight intensity={0.45} color="#8c9cff" />
      <directionalLight position={[-5, 6, 6]} intensity={1.5} color="#fff0dc" />
      <directionalLight position={[6, -3, 2]} intensity={0.8} color="#ff8ad0" />
      <group ref={group} rotation-x={TILT}>
        <group scale={0.74}>
          <Planet />
        </group>
        <Aurora view={view} />
        {[0, 1, 2].map((i) => (
          <Ring key={i} index={i} view={view} />
        ))}
        <Moon view={view} />
        <CometField view={view} />
        <Popups view={view} />
        <RingLabels view={view} />
        <ParticleBurst
          ref={(h) => {
            burstRef.current = h;
          }}
          max={260}
          size={0.14}
        />
        <mesh
          position={[0, 0, 0.02]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            const g = group.current;
            if (!g) return;
            tmp.copy(e.point);
            g.worldToLocal(tmp);
            onPlaneDown(tmp.x, tmp.y);
          }}
        >
          <planeGeometry args={[60, 60]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
      <GameEffects bloom={ctx.settings.highContrast ? 0.6 : ctx.settings.soft ? 0.95 : 1.2} threshold={ctx.settings.soft ? 0.36 : 0.3} />
    </>
  );
}

function CameraRig({ view }: { view: View }) {
  const { camera, size } = useThree();
  const ctx = useGame();
  const t = useRef(0);
  const fitR = useRef(RING_R[0]);
  useFrame((_, dt) => {
    t.current += dt;
    fitR.current += (RING_R[view.rings - 1] - fitR.current) * damp(1.5, dt);
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const halfV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const needHalfW = fitR.current + 0.7;
    const needHalfH = fitR.current + 1.5;
    const dist = Math.max(needHalfW / (halfV * aspect), needHalfH / halfV);
    const rm = ctx.settings.reducedMotion;
    const sx = rm ? 0 : Math.sin(t.current * 0.09) * 0.5;
    const sy = rm ? 0 : Math.sin(t.current * 0.07 + 1) * 0.3;
    cam.position.set(sx, 0.2 + sy, dist);
    cam.lookAt(0, 0.25, 0);
  });
  return null;
}

// ------------------------------------------------ shared glow-points shader

const glowVert = /* glsl */ `
  attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vColor = aColor; vAlpha = aAlpha;
  }`;
const glowFrag = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.35, 0.0, d);
    float halo = pow(1.0 - d, 2.2);
    float a = (halo * 0.7 + core * 0.6) * vAlpha;
    gl_FragColor = vec4(vColor + core * 0.5, a);
  }`;

function useGlowMaterial() {
  const { size, viewport, camera } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } },
        vertexShader: glowVert,
        fragmentShader: glowFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    mat.uniforms.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  });
  return mat;
}

function Stars() {
  const ctx = useGame();
  const n = Math.floor(520 * Math.max(0.5, ctx.quality.particleScale));
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    const sz = new Float32Array(n);
    const col = new Float32Array(n * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const tints = [new THREE.Color('#ffffff'), new THREE.Color('#bfe9ff'), new THREE.Color('#ffe2c4'), new THREE.Color('#e3c9ff')];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 70;
      pos[i * 3 + 1] = (r() - 0.5) * 90;
      pos[i * 3 + 2] = -12 - r() * 25;
      ph[i] = r() * 100;
      sz[i] = 0.16 + Math.pow(r(), 5) * 0.6;
      const c = tints[Math.floor(r() * tints.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uTw: { value: 1 } },
      vertexShader: `attribute float aPhase; attribute float aSize; attribute vec3 aColor; uniform float uTime; uniform float uScale; uniform float uTw;
        varying float vA; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uScale / -mv.z); vA = mix(1.0, 0.55 + 0.45 * sin(uTime * (0.6 + fract(aPhase) * 1.2) + aPhase), uTw); vC = aColor; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        float a = pow(1.0 - d, 2.0) * vA; gl_FragColor = vec4(vC, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo, mat };
  }, [n]);
  const { size, viewport } = useThree();
  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uTw.value = ctx.settings.reducedMotion ? 0 : 1;
    mat.uniforms.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(20)));
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-5} />;
}

function Nebula() {
  const ctx = useGame();
  const tex = softDotTexture();
  if (ctx.settings.highContrast) return null;
  const blobs: Array<[number, number, number, number, string, number]> = [
    [-6, 7, -20, 26, '#5b3bd6', 0.38],
    [7, -6, -22, 24, '#1f8fbf', 0.3],
    [4, 9, -24, 18, '#d05aa8', 0.16],
    [-5, -10, -20, 20, '#3b3bb8', 0.2],
  ];
  return (
    <>
      {blobs.map(([x, y, z, s, c, o], i) => (
        <sprite key={i} position={[x, y, z]} scale={[s, s, 1]} renderOrder={-6}>
          <spriteMaterial map={tex} color={c} transparent opacity={o} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- planet

function Planet() {
  const ctx = useGame();
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.95, 3).toNonIndexed();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const deep = new THREE.Color('#27307a');
    const sea = new THREE.Color('#3563b8');
    const land = new THREE.Color('#58c9a6');
    const high = new THREE.Color('#f4e2b8');
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let f = 0; f < pos.count; f += 3) {
      v.set(0, 0, 0);
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, f + k));
      v.normalize();
      const n = Math.sin(v.x * 4.1 + 1.3) * Math.sin(v.y * 3.7 - 0.4) + Math.sin(v.z * 5.3 + v.x * 2.1) * 0.6 + Math.sin(v.y * 9 + v.z * 7) * 0.18;
      if (n < -0.25) c.copy(deep);
      else if (n < 0.25) c.copy(sea).lerp(deep, 0.2 - n * 0.4);
      else if (n < 0.75) c.copy(land);
      else c.copy(high);
      if (Math.abs(v.y) > 0.86) c.set('#eef4ff');
      for (let k = 0; k < 3; k++) {
        col[(f + k) * 3] = c.r;
        col[(f + k) * 3 + 1] = c.g;
        col[(f + k) * 3 + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#7fd8ff') } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - max(0.0, dot(vN, vV)); float a = pow(f, 2.4) * 1.1; gl_FragColor = vec4(uColor, a); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame((_, dt) => {
    if (ref.current && !ctx.settings.reducedMotion) ref.current.rotation.y += dt * 0.12;
  });
  return (
    <group>
      <sprite scale={[5.2, 5.2, 1]} position={[0, 0, -0.6]}>
        <spriteMaterial map={softDotTexture()} color="#4f7dff" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={ref} geometry={geo} rotation={[0.3, 0, 0.2]}>
        <meshStandardMaterial vertexColors flatShading roughness={0.75} metalness={0.05} emissive="#2a3280" emissiveIntensity={0.7} />
      </mesh>
      <mesh material={atmo} scale={1.13}>
        <sphereGeometry args={[0.95, 48, 32]} />
      </mesh>
    </group>
  );
}

function Aurora({ view }: { view: View }) {
  const ctx = useGame();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uAmt: { value: 0 },
          uTime: { value: 0 },
          uFlash: { value: 0 },
          uA: { value: new THREE.Color('#5dffb0') },
          uB: { value: new THREE.Color('#6fd6ff') },
          uC: { value: new THREE.Color('#c58bff') },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uAmt; uniform float uTime; uniform float uFlash; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; varying vec2 vUv;
          const float TAU = 6.2831853;
          void main(){
            float x = vUv.x; float y = vUv.y;
            float dist = abs(fract(x - 0.25 + 0.5) - 0.5) * 2.0;
            float fill = smoothstep(uAmt + 0.04, uAmt - 0.03, dist);
            float n = sin(x * TAU * 7.0 + sin(x * TAU * 3.0 + uTime * 0.35) * 1.6 + uTime * 0.25) * 0.5 + 0.5;
            float n2 = sin(x * TAU * 23.0 - uTime * 0.6 + n * 2.0) * 0.5 + 0.5;
            float curtain = pow(n, 1.6) * 0.65 + n2 * 0.35;
            float v = smoothstep(0.0, 0.1, y) * pow(1.0 - y, 1.3);
            vec3 col = mix(uA, uB, smoothstep(0.1, 0.6, y));
            col = mix(col, uC, smoothstep(0.55, 1.0, y));
            float a = fill * v * (0.3 + 0.7 * curtain) * (0.55 + 0.6 * uAmt) + uFlash * v * 0.5 * fill;
            float ghost = v * 0.1 * (0.5 + 0.5 * n2);
            gl_FragColor = vec4(col, a + ghost);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const shown = useRef(0);
  useFrame((state, dt) => {
    shown.current += (view.aurora - shown.current) * damp(2.2, dt);
    view.auroraFlash = Math.max(0, view.auroraFlash - dt * 0.8);
    mat.uniforms.uAmt.value = shown.current;
    mat.uniforms.uFlash.value = view.auroraFlash;
    mat.uniforms.uTime.value = ctx.settings.reducedMotion ? 0 : state.clock.elapsedTime;
  });
  return (
    <group rotation={[1.2, 0, 0.28]}>
      <mesh material={mat} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.12, 0.98, 0.55, 128, 1, true]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- rings

const ringFrag = /* glsl */ `
  varying vec2 vP;
  uniform float uR; uniform float uGateHalf; uniform float uGlow; uniform float uPulse; uniform float uMiss;
  uniform float uStyle; uniform float uHC; uniform float uAlpha; uniform vec3 uColor;
  void main(){
    float r = length(vP);
    float d = abs(r - uR);
    float ang = atan(vP.x, vP.y);
    float aa = abs(ang);
    float px = fwidth(r) * 1.2;
    float w = mix(0.022, 0.04, uHC);
    float core = 1.0 - smoothstep(w - px, w + px, d);
    float s = ang * uR;
    if (uStyle > 0.5 && uStyle < 1.5) core *= smoothstep(0.35, 0.45, fract(s * 1.4)) * (1.0 - smoothstep(0.85, 0.95, fract(s * 1.4)));
    if (uStyle > 1.5) { float q = (fract(s * 3.2) - 0.5) / 3.2; core = 1.0 - smoothstep(w * 1.4 - px, w * 1.4 + px, length(vec2(q, d))); }
    float glow = exp(-d * d / 0.01) * mix(0.28, 0.12, uHC);
    float g = 1.0 - smoothstep(uGateHalf - 0.01, uGateHalf + 0.01, aa);
    float gw = mix(0.06, 0.085, uHC);
    float gate = g * (1.0 - smoothstep(gw - px, gw + px, d));
    float gateFill = g * exp(-d * d / 0.02);
    float post = (1.0 - smoothstep(0.0, 0.028 + px, abs(aa - uGateHalf) * r)) * (1.0 - smoothstep(0.2, 0.24, d));
    float notch = (1.0 - smoothstep(0.0, 0.016 + px, aa * r)) * (1.0 - smoothstep(0.13, 0.16, d));
    vec3 base = mix(uColor, vec3(1.0), uHC * 0.85);
    float act = 0.65 + uGlow * 0.7 + uPulse * 1.2;
    vec3 col = base * (core * 0.95 + glow) + mix(base, vec3(1.0), 0.6) * (gate * 0.9 + gateFill * 0.4 * (0.4 + uGlow + uPulse)) * act + vec3(1.0) * (post + notch * 0.9) * (0.8 + uGlow * 0.5);
    col += base * exp(-d * d / 0.05) * uPulse * 0.8;
    col = mix(col, col * vec3(0.7, 0.75, 1.0), uMiss * 0.5);
    float a = clamp(max(max(core, gate), max(post, notch)) + glow + gateFill * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(col, a * uAlpha);
  }`;

function Ring({ index, view }: { index: number; view: View }) {
  const ctx = useGame();
  const R = RING_R[index];
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uR: { value: R },
          uGateHalf: { value: 0.2 },
          uGlow: { value: 0 },
          uPulse: { value: 0 },
          uMiss: { value: 0 },
          uStyle: { value: index },
          uHC: { value: 0 },
          uAlpha: { value: index === 0 ? 1 : 0 },
          uColor: { value: new THREE.Color(RING_COLORS[index]) },
        },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: ringFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [R, index],
  );
  const soft = ctx.settings.soft;
  // Soft look: each orbit rides in a matte clay groove (a rounded torus under the glowing track).
  const softTrack = useMemo(
    () => (soft ? { geo: new THREE.TorusGeometry(R, 0.12, 14, 160), mat: clay(shade(ctx.manifest.palette.bg2, 0.16), { transparent: true, opacity: 0, roughness: 0.9 }) } : null),
    [soft, R, ctx.manifest.palette.bg2],
  );
  const gateHalf = useRef(0.2);
  const beacon = useRef<THREE.Sprite>(null);
  const chevron = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const now = ctx.time();
    const u = mat.uniforms;
    const target = index < view.rings ? 1 : 0;
    view.ringVis[index] += (target - view.ringVis[index]) * damp(3, dt);
    u.uAlpha.value = view.ringVis[index];
    u.uHC.value = ctx.settings.highContrast ? 1 : 0;
    view.pulse[index] = Math.max(0, view.pulse[index] - dt * 1.8);
    view.miss[index] = Math.max(0, view.miss[index] - dt * 1.5);
    u.uPulse.value = view.pulse[index];
    u.uMiss.value = view.miss[index];
    // Gate width follows the Good window at the approaching comet's speed.
    const good = windows(ctx.settings.timingMultiplier).good / 1000;
    let nearTau = Infinity;
    let w = 0;
    for (const c of view.comets) {
      if (c.ring !== index || c.state !== 1) continue;
      const tau = (c.tGate - now) / 1000;
      if (tau > -0.2 && tau < nearTau) {
        nearTau = tau;
        w = c.w2;
      }
    }
    if (w > 0) gateHalf.current += (Math.max(0.07, (w * good * RING_R[index]) / R) - gateHalf.current) * damp(6, dt);
    u.uGateHalf.value = gateHalf.current;
    const glow = nearTau < 0.7 ? clamp(1 - Math.abs(nearTau) / 0.7, 0, 1) : 0;
    u.uGlow.value += (glow - u.uGlow.value) * damp(12, dt);
    const vis = view.ringVis[index];
    if (softTrack) {
      softTrack.mat.opacity = vis;
      softTrack.mat.visible = vis > 0.01;
    }
    if (beacon.current) {
      const bm = beacon.current.material as THREE.SpriteMaterial;
      bm.opacity = vis * (0.22 + u.uGlow.value * 0.45 + u.uPulse.value * 0.8);
      const bs = 1.1 + u.uGlow.value * 0.5 + u.uPulse.value * 1.4;
      beacon.current.scale.set(bs, bs, 1);
    }
    if (chevron.current) (chevron.current.material as THREE.MeshBasicMaterial).opacity = vis * (0.55 + u.uGlow.value * 0.45);
  });
  return (
    <group>
      {softTrack && <mesh geometry={softTrack.geo} material={softTrack.mat} position={[0, 0, -0.14]} renderOrder={0} />}
      <mesh material={mat} renderOrder={1}>
        <ringGeometry args={[R - 0.42, R + 0.42, 220, 1]} />
      </mesh>
      <sprite ref={beacon} position={[0, R, 0.05]} scale={[1.2, 1.2, 1]} renderOrder={2}>
        <spriteMaterial map={softDotTexture()} color={RING_COLORS[index]} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={chevron} position={[0, R + 0.34, 0.05]} rotation-z={Math.PI} renderOrder={2}>
        <circleGeometry args={[0.09, 3]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function makeLabelTexture(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,30,0.75)';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '800 32px "Geist Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function RingLabels({ view }: { view: View }) {
  const ctx = useGame();
  const texs = useMemo(() => RING_KEYS.map((k, i) => makeLabelTexture(k, RING_COLORS[i])), []);
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  useFrame(() => {
    for (let i = 0; i < 3; i++) {
      const s = refs.current[i];
      if (!s) continue;
      s.visible = ctx.settings.showKeyHints && i < view.rings && view.rings > 1;
    }
  });
  return (
    <>
      {texs.map((t, i) => {
        const a = -0.35 - i * 0.12;
        return (
          <sprite key={i} ref={(el) => (refs.current[i] = el)} position={[Math.cos(a) * RING_R[i], Math.sin(a) * RING_R[i], 0.3]} scale={[0.42, 0.42, 1]} renderOrder={5}>
            <spriteMaterial map={t} transparent depthTest={false} />
          </sprite>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- moon (occluder)

function Moon({ view }: { view: View }) {
  const ctx = useGame();
  const grp = useRef<THREE.Group>(null);
  const shown = useRef(0);
  const pos = useRef(new THREE.Vector3(3, 3, 0.7));
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + Math.sin(v.x * 7.1) * Math.sin(v.y * 6.3) * Math.sin(v.z * 5.7) * 0.06;
      v.multiplyScalar(n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame((_, dt) => {
    const g = grp.current;
    if (!g) return;
    const target = view.moon.on ? 1 : 0;
    shown.current += (target - shown.current) * damp(3, dt);
    if (view.moon.on) pos.current.set(view.moon.x, view.moon.y, 0.75 + view.moon.r * 0.3);
    g.position.copy(pos.current);
    g.scale.setScalar(Math.max(0.0001, shown.current * view.moon.r));
    g.visible = shown.current > 0.01;
    if (!ctx.settings.reducedMotion) g.rotation.z += dt * 0.05;
  });
  return (
    <group ref={grp}>
      <sprite scale={[3.4, 3.4, 1]} position={[0, 0, -0.6]}>
        <spriteMaterial map={softDotTexture()} color="#b8b0ff" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh geometry={geo} renderOrder={2}>
        <meshStandardMaterial color="#c9c3f0" emissive="#3a3470" emissiveIntensity={0.6} roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- comets + stardust

function CometField({ view }: { view: View }) {
  const ctx = useGame();
  const mat = useGlowMaterial();
  const cap = MAXC * (TAIL + 2) + MAXD;
  const { geo, pos, col, size, alpha } = useMemo(() => {
    const pos = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 3);
    const size = new Float32Array(cap);
    const alpha = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    return { geo, pos, col, size, alpha };
  }, [cap]);
  const colors = useMemo(() => RING_COLORS.map((c) => new THREE.Color(c)), []);
  const white = useMemo(() => new THREE.Color('#ffffff'), []);
  const tmpC = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const now = ctx.time();
    const hc = ctx.settings.highContrast;
    const tailScale = ctx.settings.reducedMotion ? 0.5 : 1;
    const tt = state.clock.elapsedTime;
    let n = 0;
    const put = (x: number, y: number, z: number, c: THREE.Color, s: number, a: number) => {
      pos[n * 3] = x;
      pos[n * 3 + 1] = y;
      pos[n * 3 + 2] = z;
      col[n * 3] = c.r;
      col[n * 3 + 1] = c.g;
      col[n * 3 + 2] = c.b;
      size[n] = s;
      alpha[n] = a;
      n++;
    };
    let used = 0;
    for (const c of view.comets) {
      if (used >= MAXC) break;
      if (c.state === 0 || c.state === 2) continue;
      used++;
      const R = RING_R[c.ring];
      const base = hc ? white : colors[c.ring];
      if (c.state === 1) {
        const tau = (c.tGate - now) / 1000;
        const fade = clamp((c.spawnTau - tau) / 0.35, 0, 1);
        const w = tau <= c.ts ? c.w2 : c.w1;
        const tailAng = Math.min(1.7, w * 0.5) * tailScale;
        for (let k = TAIL - 1; k >= 0; k--) {
          const s = k / (TAIL - 1);
          const a = angleAt(c, tau + (s * tailAng) / Math.max(0.1, w));
          const rr = R + Math.sin(k * 1.7 + tt * 5) * 0.025 * s;
          tmpC.copy(base).lerp(white, (1 - s) * 0.35);
          put(Math.cos(a) * rr, Math.sin(a) * rr, 0, tmpC, 0.5 - s * 0.4, Math.pow(1 - s, 1.3) * 0.8 * fade);
        }
        const a = angleAt(c, tau);
        const x = Math.cos(a) * R;
        const y = Math.sin(a) * R;
        put(x, y, 0.01, base, 1.9, 0.45 * fade);
        put(x, y, 0.02, white, 0.45, 1 * fade);
      } else {
        const t = (now - c.tRes) / 1000;
        const fade = clamp(1 - t / 1.0, 0, 1);
        const x = c.mx + c.vx * t;
        const y = c.my + c.vy * t;
        const sp = Math.hypot(c.vx, c.vy) || 1;
        const ux = c.vx / sp;
        const uy = c.vy / sp;
        for (let k = TAIL - 1; k >= 0; k--) {
          const s = k / (TAIL - 1);
          const back = s * 1.1 * tailScale;
          put(x - ux * back, y - uy * back, 0, base, 0.3 - s * 0.25, Math.pow(1 - s, 1.6) * 0.5 * fade);
        }
        put(x, y, 0.01, base, 1.0, 0.25 * fade);
        put(x, y, 0.02, white, 0.24, 0.8 * fade);
      }
    }
    // stardust
    for (let i = 0; i < MAXD; i++) {
      const t = (now - view.dt0[i]) / view.ddur[i];
      if (t < 0 || t > 1) continue;
      const e = t * t * (3 - 2 * t);
      const u = 1 - e;
      const x = u * u * view.dx0[i] + 2 * u * e * view.dcx[i] + e * e * view.dtx[i];
      const y = u * u * view.dy0[i] + 2 * u * e * view.dcy[i] + e * e * view.dty[i];
      const z = e * e * view.dtz[i] + 2 * u * e * 0.6;
      tmpC.copy(hc ? white : colors[view.dring[i]]).lerp(white, 0.3);
      put(x, y, z, tmpC, 0.2 * (1 - t * 0.5), Math.sin(t * Math.PI) * 0.95);
      if (t > 0.97) view.auroraFlash = Math.min(1, view.auroraFlash + 0.02);
    }
    for (let i = n; i < cap; i++) {
      if (alpha[i] === 0 && size[i] === 0) break;
      alpha[i] = 0;
      size[i] = 0;
    }
    geo.setDrawRange(0, cap);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

// ---------------------------------------------------------------- grade popups

const GRADE_STYLE = [
  { label: 'PERFECT', glyph: '✦', color: '#ffe29a' },
  { label: 'GREAT', glyph: '◆', color: '#9ff4ff' },
  { label: 'GOOD', glyph: '●', color: '#e9e4ff' },
];

function drawPopup(g: CanvasRenderingContext2D, grade: number, err: number) {
  g.clearRect(0, 0, 256, 128);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let main: string;
  let color: string;
  if (grade < 3) {
    const st = GRADE_STYLE[grade];
    main = `${st.glyph} ${st.label}`;
    color = st.color;
  } else {
    main = err === 999 ? '○ MISS' : err < 0 ? '◀ EARLY' : 'LATE ▶';
    color = '#b9b4e8';
  }
  g.font = '800 40px "Geist Variable", system-ui, sans-serif';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(5,7,26,0.85)';
  g.strokeText(main, 128, 48);
  g.fillStyle = color;
  g.fillText(main, 128, 48);
  if (err !== 999 && Math.abs(err) >= 1) {
    const sub = `${err < 0 ? '−' : '+'}${Math.round(Math.abs(err))} ms`;
    g.font = '700 26px "Geist Variable", system-ui, sans-serif';
    g.lineWidth = 6;
    g.strokeText(sub, 128, 94);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(sub, 128, 94);
  }
}

function Popups({ view }: { view: View }) {
  const ctx = useGame();
  const slots = useMemo(
    () =>
      Array.from({ length: 3 }, () => {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 128;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return { c, g: c.getContext('2d')!, tex, seq: -1 };
      }),
    [],
  );
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  useFrame(() => {
    const now = ctx.time();
    for (let k = 0; k < 3; k++) {
      const s = refs.current[k];
      if (!s) continue;
      const p = view.popups[k];
      if (!p) {
        s.visible = false;
        continue;
      }
      const slot = slots[k];
      if (slot.seq !== p.seq) {
        slot.seq = p.seq;
        drawPopup(slot.g, p.grade, p.err);
        slot.tex.needsUpdate = true;
      }
      const t = (now - p.t0) / 1000;
      if (t > 1.1) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      const rm = ctx.settings.reducedMotion;
      const R = RING_R[p.ring];
      const rise = rm ? 0 : Math.min(1, t * 3) * 0.3;
      s.position.set(0, R + 0.8 + rise, 0.4);
      const pop = rm ? 1 : Math.min(1, 0.7 + t * 4);
      s.scale.set(2.3 * pop, 1.15 * pop, 1);
      (s.material as THREE.SpriteMaterial).opacity = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.35;
    }
  });
  return (
    <>
      {slots.map((s, k) => (
        <sprite key={k} ref={(el) => (refs.current[k] = el)} visible={false} renderOrder={10}>
          <spriteMaterial map={s.tex} transparent depthTest={false} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

