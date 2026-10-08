import { useMemo, useRef, useSyncExternalStore, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { damp, mixHex, clamp, easeInOutSine } from '@/sdk';
import { mountR3F, useGame, GameEffects, Motes, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { levelDef, makeLayout, makeSequence, scoreFor, assignKeys, keyLabel, KEY_ROWS, MAX_LANTERNS, MAX_LEVEL, FIELD_D } from './logic';
import { clay, puckGeometry, shade } from './soft';

const LANTERN_COLORS = ['#ffb35c', '#ff8fa3', '#7fe0b0'];
const HC_GLOW = '#fff1c9';
const RISE_DUR = 3.4;
const TRIALS = 10;
const MAX_MISSES = 3;

// ------------------------------------------------------------------ view-model

class View {
  count = 0;
  tx = new Float32Array(MAX_LANTERNS);
  tz = new Float32Array(MAX_LANTERNS);
  /** Target light of the lantern itself (0..1). */
  light = new Float32Array(MAX_LANTERNS);
  /** Target light of the reflection only (mirror trials). */
  mirror = new Float32Array(MAX_LANTERNS);
  hint = new Uint8Array(MAX_LANTERNS);
  flicker = new Float32Array(MAX_LANTERNS);
  /** 0 = floating, 1 = rising, 2 = gone. */
  state = new Uint8Array(MAX_LANTERNS).fill(2);
  /** Bumped when a lantern should (re)spawn at its target. */
  gen = new Uint16Array(MAX_LANTERNS);
  /** Screen-independent current positions (written by the scene, read by input helpers). */
  cx = new Float32Array(MAX_LANTERNS);
  cz = new Float32Array(MAX_LANTERNS);
  keys: string[] = [];
  focus = -1;
  showFocus = false;
  drift = 0;
  ripples: Array<{ x: number; z: number; t: number; s: number }> = [];
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

// ------------------------------------------------------------------ game

export default function create(ctx: GameContext): GameInstance {
  const view = new View();
  const rng = ctx.rng;
  const preview = ctx.mode === 'preview';
  const stair = ctx.staircase({ min: 1, max: MAX_LEVEL, up: 2, down: 1 });
  if (preview) stair.set(3);
  const note = ctx.audio.scale(57, 'majorPenta');
  const burstRef: { current: BurstHandle | null } = { current: null };

  let alive = true;
  let score = 0;
  let trials = 0;
  let misses = 0;
  let released = 0;
  let bestSpan = 0;
  let taps = 0;
  let goodTaps = 0;
  let firstTrial = true;
  let stopAmbient: (() => void) | null = null;
  const cancels: Array<() => void> = [];

  let accepting = false;
  let expected: number[] = [];
  let progress = 0;
  let resolveInput: ((ok: boolean) => void) | null = null;
  let mirrorTrial = false;

  function hud(span: number) {
    ctx.hud.set({
      score,
      level: stair.level,
      lives: MAX_MISSES - misses,
      maxLives: MAX_MISSES,
      progress: trials / TRIALS,
      label: mirrorTrial ? `✦ Mirror · span ${span}` : `Span ${span}`,
    });
  }

  function tok(step: number, gain = 1) {
    ctx.audio.tone(190, { type: 'triangle', dur: 0.07, gain: 0.12 * gain, attack: 0.002, release: 0.06 });
    ctx.audio.bell(note(step), { gain: 0.1 * gain, dur: 1.2 });
  }

  function ripple(i: number, s = 1) {
    view.ripples.push({ x: view.cx[i], z: view.cz[i], t: 0, s });
    if (view.ripples.length > 8) view.ripples.shift();
  }

  function tap(i: number) {
    if (!accepting || i < 0 || i >= view.count || view.state[i] !== 0) return;
    view.focus = i;
    taps++;
    ripple(i, 0.8);
    const want = expected[progress];
    if (i === want) {
      goodTaps++;
      view.light[i] = 1;
      view.hint[i] = 0;
      tok(progress);
      ctx.haptics.tick();
      progress++;
      if (progress >= expected.length) {
        accepting = false;
        resolveInput?.(true);
      }
    } else if (view.light[i] > 0.5) {
      // tapping an already relit lantern: gentle no-op feedback
      ctx.audio.tick();
    } else {
      accepting = false;
      view.flicker[i] = 1.1;
      ripple(i, 1.4);
      ctx.audio.pluck(1320, { gain: 0.08, dur: 0.15 });
      ctx.audio.tone(note(2), { type: 'sine', dur: 0.35, gain: 0.08, when: ctx.audio.now() + 0.12 });
      ctx.audio.tone(note(0), { type: 'sine', dur: 0.5, gain: 0.08, when: ctx.audio.now() + 0.34 });
      ctx.haptics.error();
      ctx.caption('Lantern flickers out — not that one');
      cancels.push(
        ctx.after(500, () => {
          view.hint[want] = 1;
          ctx.audio.chime(note(progress), { gain: 0.05 });
        }),
      );
      resolveInput?.(false);
    }
  }

  function arrange(count: number, irregular: number) {
    const pts = makeLayout(rng, count, irregular);
    const prev = view.count;
    for (let i = 0; i < MAX_LANTERNS; i++) {
      view.light[i] = 0;
      view.mirror[i] = 0;
      view.hint[i] = 0;
      if (i < count) {
        view.tx[i] = pts[i][0];
        view.tz[i] = pts[i][1];
        if (view.state[i] !== 0 || i >= prev) {
          view.state[i] = 0;
          view.gen[i]++;
        }
      } else if (view.state[i] === 0) {
        view.state[i] = 2;
      }
    }
    view.count = count;
    view.keys = assignKeys(pts);
    if (view.focus >= count) view.focus = 0;
    view.bump();
  }

  async function present(seq: number[], stepMs: number, mirror: boolean) {
    for (let k = 0; k < seq.length; k++) {
      if (!alive) return;
      const i = seq[k];
      if (mirror) view.mirror[i] = 1;
      else view.light[i] = 1;
      tok(k, 0.9);
      await ctx.wait(stepMs);
      view.mirror[i] = 0;
      view.light[i] = 0;
      await ctx.wait(Math.round(stepMs * 0.25));
    }
  }

  function waitForInput(exp: number[]): Promise<boolean> {
    expected = exp;
    progress = 0;
    accepting = true;
    return new Promise((res) => {
      resolveInput = (ok) => {
        resolveInput = null;
        res(ok);
      };
    });
  }

  async function ghost(exp: number[]) {
    await ctx.wait(500);
    for (let k = 0; k < exp.length; k++) {
      await ctx.wait(520 + rng.next() * 320);
      if (!accepting || !alive) return;
      let pick = exp[progress];
      if (rng.chance(0.07)) {
        // plausible slip: nearest other lantern
        let best = -1;
        let bd = 1e9;
        for (let j = 0; j < view.count; j++) {
          if (j === pick || view.light[j] > 0.5) continue;
          const d = Math.hypot(view.tx[j] - view.tx[pick], view.tz[j] - view.tz[pick]);
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
        if (best >= 0) pick = best;
      }
      view.focus = pick;
      tap(pick);
    }
  }

  async function releaseLit(seq: number[]) {
    ctx.audio.noise({ dur: 1.6, filter: 600, sweepTo: 2400, gain: 0.05, q: 0.7 });
    const now = ctx.audio.now();
    for (let k = 0; k < 7; k++) ctx.audio.chime(note(5 + k), { gain: 0.05, when: now + 0.15 + k * 0.11, dur: 1.4 });
    ctx.haptics.success();
    ctx.caption('Wind chimes — lanterns rise');
    for (const i of seq) {
      view.state[i] = 1;
      burstRef.current?.burst([view.cx[i], 0.5, view.cz[i]], 18, { color: '#ffe3a3', speed: 1.2, life: 1.6, gravity: -0.8 });
    }
    view.bump();
    await ctx.wait(RISE_DUR * 1000 * (ctx.settings.reducedMotion ? 0.6 : 0.85));
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([45, 52, 57, 64, 69], { gain: 0.045, brightness: 0.25 });
    ambientLife();
    while (alive) {
      const def = levelDef(stair.level);
      arrange(def.count, def.irregular);
      mirrorTrial = !firstTrial && rng.chance(def.mirrorChance);
      hud(def.span);
      await ctx.wait(firstTrial ? 900 : 1300);
      firstTrial = false;
      if (!alive) return;
      if (mirrorTrial) {
        ctx.caption('Mirror: watch the reflections');
        ctx.announce('Mirror trial: the reflections will glow');
        await ctx.wait(900);
      }
      const seq = makeSequence(rng, def.count, def.span);
      const step = def.stepMs * ctx.settings.timingMultiplier;
      await present(seq, step, mirrorTrial);
      if (!alive) return;
      await ctx.wait(250);
      ctx.announce(`Your turn: ${seq.length} lanterns`);
      if (def.drift && !ctx.settings.reducedMotion) view.drift = 1;
      const inputP = waitForInput(seq);
      if (preview) void ghost(seq);
      const ok = await inputP;
      view.drift = 0;
      if (!alive) return;
      trials++;
      ctx.trial({ correct: ok, level: stair.level });
      if (ok) {
        score += scoreFor(seq.length);
        released++;
        bestSpan = Math.max(bestSpan, seq.length);
        ctx.announce(`Released ${seq.length} lanterns`);
        hud(def.span);
        await releaseLit(seq);
      } else {
        misses++;
        hud(def.span);
        await ctx.wait(1600);
        for (let i = 0; i < MAX_LANTERNS; i++) view.hint[i] = 0;
      }
      const before = stair.level;
      stair.record(ok);
      // faster ramp at the very start so the first minute isn't too easy
      if (ok && trials <= 2 && stair.level === before && before < 3) stair.set(before + 1);
      if (preview && stair.level > 4) stair.set(3);
      if (preview && misses >= MAX_MISSES) misses = 0;
      if (!preview && misses >= MAX_MISSES && trials < TRIALS && (await ctx.revive())) {
        if (!alive) return;
        misses = MAX_MISSES - 1;
        hud(def.span);
        ctx.audio.success();
        ctx.haptics.success();
        ctx.caption('Second chance!');
        ctx.announce('Second chance! One lantern life restored');
        burstRef.current?.burst([0, 0.6, 0], 40, { color: '#ffe3a3', speed: 1.6, life: 1.6, gravity: -0.8 });
        await ctx.wait(700);
      }
      if (!alive) return;
      if (!preview && (misses >= MAX_MISSES || trials >= TRIALS)) {
        await ctx.wait(700);
        const acc = taps ? Math.round((goodTaps / taps) * 100) : 0;
        ctx.end({
          score,
          levelReached: bestSpan,
          stats: { bestSpan, perfect: released, accuracy: acc },
          message: bestSpan >= 6 ? 'A long trail of light across the lake.' : 'The lake remembers every lantern you set free.',
        });
        return;
      }
    }
  }

  /** Lapping water and the odd distant frog. */
  function ambientLife() {
    const lap = () => {
      if (!alive) return;
      ctx.audio.noise({ dur: 0.9 + rng.next() * 0.6, filter: 380 + rng.next() * 200, sweepTo: 220, gain: 0.025, q: 0.8 });
      if (rng.chance(0.25)) {
        const w = ctx.audio.now() + 0.4;
        ctx.audio.tone(410, { type: 'triangle', dur: 0.06, gain: 0.018, when: w });
        ctx.audio.tone(380, { type: 'triangle', dur: 0.07, gain: 0.018, when: w + 0.12 });
      }
      cancels.push(ctx.after(2600 + rng.next() * 2800, lap));
    };
    lap();
  }

  // ------------------------------------------------ keyboard
  function moveFocus(dx: number, dz: number) {
    view.showFocus = true;
    if (view.focus < 0 || view.focus >= view.count) {
      view.focus = 0;
      return;
    }
    const fx = view.tx[view.focus];
    const fz = view.tz[view.focus];
    let best = -1;
    let bs = 1e9;
    for (let j = 0; j < view.count; j++) {
      if (j === view.focus || view.state[j] !== 0) continue;
      const ox = view.tx[j] - fx;
      const oz = view.tz[j] - fz;
      const d = Math.hypot(ox, oz);
      const along = (ox * dx + oz * dz) / d;
      if (along < 0.35) continue;
      const s = d * (2 - along);
      if (s < bs) {
        bs = s;
        best = j;
      }
    }
    if (best >= 0) {
      view.focus = best;
      ctx.audio.tick();
    }
  }
  const keyMap: Record<string, () => void> = {
    ArrowLeft: () => moveFocus(-1, 0),
    ArrowRight: () => moveFocus(1, 0),
    ArrowUp: () => moveFocus(0, -1),
    ArrowDown: () => moveFocus(0, 1),
    KeyH: () => moveFocus(-1, 0),
    KeyL: () => moveFocus(1, 0),
    Space: () => {
      view.showFocus = true;
      if (view.focus >= 0) tap(view.focus);
    },
    Enter: () => {
      view.showFocus = true;
      if (view.focus >= 0) tap(view.focus);
    },
  };
  for (const row of KEY_ROWS) {
    for (const code of row) {
      const prevFn = keyMap[code];
      keyMap[code] = () => {
        const i = view.keys.indexOf(code);
        if (i >= 0) tap(i);
        else prevFn?.();
      };
    }
  }
  ctx.keys(keyMap);

  const unmount = mountR3F(ctx, <Scene view={view} onTap={tap} burstRef={burstRef} />, {
    camera: { position: [0, 7, 9], fov: 50, near: 0.1, far: 400 },
    background: ctx.manifest.palette.bg,
  });

  return {
    start() {
      void run();
    },
    destroy() {
      alive = false;
      accepting = false;
      cancels.forEach((c) => c());
      stopAmbient?.();
      unmount();
    },
    onSettings() {
      view.bump();
    },
  };
}

// ------------------------------------------------------------------ textures

function patternTexture(kind: number, color: string, hc: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const paper = hc ? '#ffffff' : mixHex(color, '#fff4e0', 0.5);
  const ink = hc ? '#101010' : mixHex(color, '#3a1206', 0.62);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, mixHex(paper, '#000000', hc ? 0 : 0.35));
  grd.addColorStop(0.5, paper);
  grd.addColorStop(1, mixHex(paper, '#000000', hc ? 0 : 0.35));
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const lw = hc ? 9 : 7;
  switch (kind) {
    case 0: // bands
      g.fillRect(0, 34, 256, 12);
      g.fillRect(0, 82, 256, 12);
      break;
    case 1: // dots
      for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) {
        g.beginPath();
        g.arc(k * 32 + (r % 2) * 16 + 8, 34 + r * 30, 7, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 2: // waves
      g.lineWidth = lw;
      for (const y0 of [46, 82]) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 4) g.lineTo(x, y0 + Math.sin((x / 256) * Math.PI * 2 * 6) * 9);
        g.stroke();
      }
      break;
    case 3: // vertical stripes
      for (let k = 0; k < 12; k++) g.fillRect(k * (256 / 12), 20, 8, 88);
      break;
    case 4: // zigzag
      g.lineWidth = lw;
      g.beginPath();
      for (let k = 0; k <= 16; k++) g.lineTo(k * 16, k % 2 ? 44 : 84);
      g.stroke();
      break;
    case 5: // diamonds
      for (let k = 0; k < 6; k++) {
        const x = k * (256 / 6) + 21;
        g.beginPath();
        g.moveTo(x, 40);
        g.lineTo(x + 14, 64);
        g.lineTo(x, 88);
        g.lineTo(x - 14, 64);
        g.closePath();
        g.fill();
      }
      break;
    case 6: // rings
      g.lineWidth = lw - 1;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(k * (256 / 6) + 21, 64, 13, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    default: // crosses
      for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
        const x = k * (256 / 6) + 21 + (r ? 21 : 0);
        const y = 46 + r * 36;
        g.fillRect(x - 11, y - 3.5, 22, 7);
        g.fillRect(x - 3.5, y - 11, 7, 22);
      }
  }
  // paper ribs
  g.globalAlpha = hc ? 0.25 : 0.22;
  g.fillStyle = '#000';
  for (let y = 6; y < 128; y += 11) g.fillRect(0, y, 256, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,24,0.78)';
  g.beginPath();
  g.arc(32, 32, 29, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,240,210,0.9)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 34px "Geist Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let streakTex: THREE.Texture | null = null;
/** Soft vertical streak for water reflections. */
function streakTexture(): THREE.Texture {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 32; x++) {
      const u = (x / 31) * 2 - 1;
      const v = y / 127;
      const a = Math.exp(-u * u * 5) * Math.pow(Math.sin(v * Math.PI), 1.2) * (0.75 + 0.25 * Math.sin(v * 40));
      const k = (y * 32 + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  streakTex = new THREE.CanvasTexture(c);
  return streakTex;
}

// ------------------------------------------------------------------ scene

function Scene({ view, onTap, burstRef }: { view: View; onTap: (i: number) => void; burstRef: { current: BurstHandle | null } }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  const backdrop = useRef<THREE.Group>(null);
  const moon = useRef<THREE.Group>(null);
  const soft = ctx.settings.soft;
  const geo = useMemo(() => lanternGeometry(soft), [soft]);
  return (
    <>
      <CameraRig backdrop={backdrop} moon={moon} />
      <ambientLight intensity={hc ? 0.7 : 0.4} color="#7d8fd6" />
      <hemisphereLight args={['#8ea4ff', '#0a0f22', soft ? 0.8 : 0.45]} />
      <directionalLight position={[-3, 6, -8]} intensity={0.9} color="#c8d6ff" />
      <directionalLight position={[2, 5, 6]} intensity={0.25} color="#ffd9a8" />
      <group ref={backdrop}>
        <Backdrop />
      </group>
      <group ref={moon}>
        <mesh renderOrder={-8}>
          <circleGeometry args={[0.42, 40]} />
          <meshBasicMaterial color="#fff5dc" toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
        <sprite scale={[4.4, 4.4, 1]}>
          <spriteMaterial map={softDotTexture()} color="#bfcaff" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <sprite scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={softDotTexture()} color="#fff1cf" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      <Water />
      {Array.from({ length: MAX_LANTERNS }, (_, i) => (
        <Lantern key={i} index={i} view={view} onTap={onTap} geo={geo} />
      ))}
      <Ripples view={view} />
      <FocusRing view={view} />
      {!hc && <Motes count={45} area={[9, 2.2, 8]} color="#ffd68a" size={0.07} speed={0.2} />}
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={260} size={0.12} />
      <GameEffects bloom={soft ? 0.9 : 1.2} threshold={soft ? 0.36 : 0.3} />
    </>
  );
}

const TARGET_Z = 0.1;

function CameraRig({ backdrop, moon }: { backdrop: RefObject<THREE.Group | null>; moon: RefObject<THREE.Group | null> }) {
  const { camera, size } = useThree();
  const ctx = useGame();
  const t = useRef(0);
  const target = useMemo(() => new THREE.Vector3(0, 0, TARGET_Z), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    t.current += dt;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const halfV = THREE.MathUtils.degToRad(cam.fov / 2);
    const pitch = THREE.MathUtils.degToRad(46);
    const fitW = 5.6;
    const nearOffset = (FIELD_D / 2) * Math.cos(pitch);
    const distW = fitW / 2 / (Math.tan(halfV) * aspect) + nearOffset;
    const dist = Math.max(10.5, distW);
    const reduced = ctx.settings.reducedMotion;
    const amp = reduced ? 0 : ctx.mode === 'preview' ? 0.16 : 0.05;
    const yaw = Math.sin(t.current * (ctx.mode === 'preview' ? 0.18 : 0.08)) * amp;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, TARGET_Z + Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
    const b = backdrop.current;
    if (b) {
      b.position.set(0, 0, TARGET_Z - 0.5 * dist);
      b.scale.setScalar(dist / 10);
    }
    const m = moon.current;
    if (m) {
      // pin the moon to the upper-left sky regardless of aspect
      cam.updateMatrixWorld();
      tmp.set(-0.45, 0.84, 0.5).unproject(cam).sub(cam.position).normalize();
      m.position.copy(cam.position).addScaledVector(tmp, dist * 1.9);
      m.scale.setScalar(dist / 10);
      m.quaternion.copy(cam.quaternion);
    }
  });
  return null;
}

// ---- backdrop: sky plane with stars, moon, layered mountains and their reflections

function ridge(seed: number, amp: number, base: number, width: number): THREE.ShapeGeometry {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -0.2);
  const n = 48;
  const peaks = Array.from({ length: 6 }, () => [r() * width - width / 2, 0.5 + r() * 0.8, 1.5 + r() * 3] as const);
  for (let k = 0; k <= n; k++) {
    const x = -width / 2 + (k / n) * width;
    let y = base;
    for (const [px, ph, pw] of peaks) y += amp * ph * Math.max(0, 1 - Math.abs(x - px) / pw);
    y += Math.sin(x * 2.3 + seed) * 0.05 * amp + (r() - 0.5) * 0.06 * amp;
    shape.lineTo(x, y);
  }
  shape.lineTo(width / 2, -0.2);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  // vertical gradient via vertex colors: dark base, lighter moonlit ridge
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, pos.getY(i) / (base + amp * 1.3)));
    const v = 0.35 + 0.65 * Math.pow(k, 0.8);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function Backdrop() {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uTop: { value: new THREE.Color('#050815') },
          uHor: { value: new THREE.Color(hc ? '#1a2240' : '#34497d') },
          uHC: { value: hc ? 1 : 0 },
        },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uTop; uniform vec3 uHor; uniform float uHC; varying vec2 vP;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          void main(){
            float k = smoothstep(-0.2, 4.2, vP.y);
            vec3 col = mix(uHor, uTop, pow(k, 0.7));
            vec2 g = floor(vP * 9.0); vec2 f = fract(vP * 9.0) - 0.5;
            float r = h(g);
            float star = step(0.93, r) * smoothstep(0.12, 0.0, length(f + (vec2(h(g+1.3), h(g+2.7)) - 0.5) * 0.6));
            float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 2.0) + r * 40.0);
            col += vec3(0.85, 0.9, 1.0) * star * tw * smoothstep(0.3, 1.6, vP.y) * (1.0 - uHC * 0.3);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [hc],
  );
  useFrame((_, dt) => {
    skyMat.uniforms.uTime.value += dt;
  });
  const ridges = useMemo(
    () => [
      { g: ridge(11, 1.15, 0.3, 34), z: -2.4, c: hc ? '#1b2344' : '#223158' },
      { g: ridge(29, 0.85, 0.12, 34), z: -1.6, c: hc ? '#10152b' : '#16213f' },
      { g: ridge(47, 0.5, 0.0, 34), z: -0.8, c: hc ? '#080b18' : '#0c1329' },
    ],
    [hc],
  );
  return (
    <>
      <mesh position={[0, 5, -3]} material={skyMat} renderOrder={-9}>
        <planeGeometry args={[60, 14]} />
      </mesh>
      {ridges.map((r, k) => (
        <group key={k}>
          <mesh geometry={r.g} position={[0, 0, r.z]}>
            <meshBasicMaterial color={r.c} vertexColors />
          </mesh>
          {/* reflection below the water line */}
          <mesh geometry={r.g} position={[0, 0, r.z]} scale={[1, -1, 1]}>
            <meshBasicMaterial color={mixHex(r.c, '#050815', 0.4)} vertexColors />
          </mesh>
        </group>
      ))}
      {!hc && <Mist />}
    </>
  );
}

function Mist() {
  const ctx = useGame();
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  const seeds = useMemo(() => Array.from({ length: 7 }, (_, k) => ({ x: -9 + k * 3, y: 0.35 + (k % 3) * 0.2, z: -0.4 - (k % 2) * 1.2, s: 5 + (k % 3) * 2, sp: 0.06 + (k % 4) * 0.02 })), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!ctx.settings.reducedMotion) t.current += dt;
    seeds.forEach((m, k) => {
      const sp = refs.current[k];
      if (!sp) return;
      sp.position.x = ((m.x + t.current * m.sp + 12) % 24) - 12;
    });
  });
  return (
    <>
      {seeds.map((m, k) => (
        <sprite key={k} ref={(el) => (refs.current[k] = el)} position={[m.x, m.y, m.z]} scale={[m.s, m.s * 0.28, 1]}>
          <spriteMaterial map={softDotTexture()} color="#9fb2e6" transparent opacity={0.13} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

function Water() {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const { camera } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uCam: { value: new THREE.Vector3() },
          uDeep: { value: new THREE.Color(hc ? '#03050c' : '#060b1c') },
          uFar: { value: new THREE.Color(hc ? '#10162c' : '#2a3d6e') },
          uMoonX: { value: -2.4 },
          uHC: { value: hc ? 1 : 0 },
        },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform float uTime; uniform vec3 uCam; uniform vec3 uDeep; uniform vec3 uFar; uniform float uMoonX; uniform float uHC; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
          void main(){
            vec3 V = normalize(uCam - vW);
            float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.2);
            vec2 p = vW.xz;
            float n = n2(p * vec2(1.4, 4.0) + vec2(0.0, uTime * 0.22)) * 0.6 + n2(p * vec2(3.5, 9.0) - vec2(uTime * 0.12, uTime * 0.35)) * 0.4;
            vec3 col = mix(uDeep, uFar, clamp(fres * 1.25, 0.0, 1.0));
            col += (n - 0.5) * 0.035 * (1.0 - uHC);
            // moon glitter path
            float depth = clamp((uCam.z - vW.z) / 22.0, 0.0, 1.0);
            float w = mix(0.35, 1.3, 1.0 - depth);
            float dx = (vW.x - uMoonX * depth * 1.3) / w;
            float glit = exp(-dx * dx) * smoothstep(0.55, 0.85, n) * smoothstep(0.25, 0.9, depth);
            col += vec3(0.75, 0.82, 1.0) * glit * 0.55 * (1.0 - uHC);
            // soft ripple lines
            float lines = smoothstep(0.96, 1.0, sin(vW.z * 7.0 + n * 3.0 + uTime * 0.5)) * 0.018 * (1.0 - uHC);
            col += lines;
            float a = mix(0.72, 0.93, fres);
            gl_FragColor = vec4(col, a);
          }`,
      }),
    [hc],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += ctx.settings.reducedMotion ? dt * 0.3 : dt;
    (mat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -10]} material={mat} renderOrder={-1}>
      <planeGeometry args={[140, 80]} />
    </mesh>
  );
}

// ---- lanterns

interface LanternGeo {
  paper: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  base: THREE.BufferGeometry;
  /** Soft look only: a matte clay float the lantern rests on. */
  float?: THREE.BufferGeometry;
}

function lanternGeometry(soft = false): LanternGeo {
  const prof: THREE.Vector2[] = [];
  const pts: Array<[number, number]> = [
    [0.13, 0.0],
    [0.22, 0.04],
    [0.29, 0.13],
    [0.325, 0.26],
    [0.33, 0.36],
    [0.315, 0.46],
    [0.27, 0.56],
    [0.2, 0.63],
    [0.13, 0.66],
  ];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const paper = new THREE.LatheGeometry(prof, 28);
  paper.translate(0, 0.09, 0);
  paper.scale(1.25, 1.45, 1.25);
  if (soft) {
    // Soft look: rounded clay cap and foot instead of hard-edged wood rings (centred like the originals).
    const cap = puckGeometry(0.18, 0.075, 0.035, 24).translate(0, -0.0375, 0);
    const base = puckGeometry(0.3, 0.1, 0.045, 28).translate(0, -0.05, 0);
    return { paper, cap, base, float: puckGeometry(0.5, 0.07, 0.035, 36) };
  }
  const cap = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 20);
  const base = new THREE.CylinderGeometry(0.26, 0.3, 0.08, 6);
  return { paper, cap, base };
}

function Lantern({ index, view, onTap, geo }: { index: number; view: View; onTap: (i: number) => void; geo: LanternGeo }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const color = LANTERN_COLORS[index % 3];
  const glow = hc ? HC_GLOW : color;
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const rbody = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const rhalo = useRef<THREE.Sprite>(null);
  const pool = useRef<THREE.Mesh>(null);
  const streak = useRef<THREE.Mesh>(null);
  const label = useRef<THREE.Sprite>(null);
  const hit = useRef<THREE.Mesh>(null);

  const tex = useMemo(() => patternTexture(index % 8, color, hc), [index, color, hc]);
  const mats = useMemo(() => {
    const paper = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color(glow),
      emissiveMap: tex,
      emissiveIntensity: 0.1,
      roughness: 0.85,
      transparent: true,
    });
    const rpaper = paper.clone();
    const wood = new THREE.MeshStandardMaterial({ color: hc ? '#e8e8e8' : '#6a4a3c', emissive: new THREE.Color(glow), emissiveIntensity: 0, roughness: 0.9, transparent: true });
    const floatM = clay(shade('#2a3045', 0.08), { transparent: true, opacity: 0, roughness: 0.95 });
    const haloM = new THREE.SpriteMaterial({ map: softDotTexture(), color: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const rhaloM = haloM.clone();
    const poolM = new THREE.MeshBasicMaterial({ map: softDotTexture(), color: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const streakM = new THREE.MeshBasicMaterial({ map: streakTexture(), color: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    return { paper, rpaper, wood, haloM, rhaloM, poolM, streakM, floatM };
  }, [tex, glow, hc]);
  const lab = useRef<{ code: string; tex: THREE.Texture | null }>({ code: '', tex: null });
  const labMat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthTest: false }), []);

  const st = useRef({ x: 0, z: 0, light: 0, mirror: 0, appear: 0, rise: 0, gen: -1, t: Math.random() * 10, hint: 0 });

  useFrame((_, dt) => {
    const s = st.current;
    const g = root.current;
    if (!g || !body.current || !rbody.current) return;
    const reduced = ctx.settings.reducedMotion;
    s.t += dt;
    const state = view.state[index];
    if (s.gen !== view.gen[index]) {
      s.gen = view.gen[index];
      s.x = view.tx[index];
      s.z = view.tz[index];
      s.appear = 0;
      s.rise = 0;
      s.light = 0;
      s.mirror = 0;
    }
    // position (glide + optional drift during recall)
    const dA = view.drift;
    const tx = view.tx[index] + (dA ? Math.sin(s.t * 0.35 + index * 1.7) * 0.28 * dA : 0);
    const tz = view.tz[index] + (dA ? Math.cos(s.t * 0.29 + index * 2.3) * 0.24 * dA : 0);
    const k = damp(dA ? 1.2 : 3, dt);
    s.x += (tx - s.x) * k;
    s.z += (tz - s.z) * k;
    view.cx[index] = s.x;
    view.cz[index] = s.z;
    g.position.set(s.x, 0, s.z);

    // appear / fade
    if (state === 0) s.appear = Math.min(1, s.appear + dt * 1.4);
    else if (state === 2) s.appear = Math.max(0, s.appear - dt * 1.5);
    if (state === 1) s.rise += dt;
    else s.rise = 0;
    const rp = Math.min(1, s.rise / RISE_DUR);
    const riseY = state === 1 ? (reduced ? rp * 0.8 : easeInOutSine(rp) * 7.5) : 0;
    const riseFade = state === 1 ? 1 - THREE.MathUtils.smoothstep(rp, reduced ? 0.2 : 0.55, 1) : 1;
    const alpha = s.appear * riseFade;
    g.visible = alpha > 0.01;
    if (!g.visible) return;

    // light
    const lt = state === 1 ? 1 : view.light[index];
    s.light += (lt - s.light) * damp(lt > s.light ? 18 : 6, dt);
    s.mirror += (view.mirror[index] - s.mirror) * damp(view.mirror[index] > s.mirror ? 18 : 6, dt);
    s.hint += ((view.hint[index] ? 1 : 0) - s.hint) * damp(4, dt);
    let fl = 0;
    if (view.flicker[index] > 0) {
      view.flicker[index] = Math.max(0, view.flicker[index] - dt);
      const f = view.flicker[index];
      // slow (<3 Hz) soft gutter, decaying
      fl = f * 0.6 * (0.5 + 0.5 * Math.cos(f * Math.PI * 4.5));
    }
    const hintGlow = s.hint * (0.35 + 0.25 * Math.sin(s.t * 4));
    const L = Math.max(s.light, fl, hintGlow);
    const RL = Math.max(L * 0.8, s.mirror);

    const bob = reduced ? 0 : Math.sin(s.t * 0.9 + index) * 0.025;
    const sway = reduced ? 0 : state === 1 ? Math.sin(s.t * 1.3 + index) * 0.25 * rp : 0;
    body.current.position.set(sway, bob + riseY, 0);
    body.current.rotation.z = reduced ? 0 : Math.sin(s.t * 0.7 + index * 2) * 0.03;
    rbody.current.position.copy(body.current.position);
    rbody.current.rotation.z = body.current.rotation.z;
    const pulse = 1 + (reduced ? 0 : s.light * 0.04);
    body.current.scale.setScalar(pulse);

    mats.paper.emissiveIntensity = 0.1 + L * 1.7;
    mats.paper.opacity = alpha;
    mats.rpaper.emissiveIntensity = 0.05 + RL * 1.5;
    mats.rpaper.opacity = alpha * 0.55;
    mats.wood.opacity = alpha;
    mats.haloM.opacity = alpha * (0.05 + L * 0.62);
    mats.wood.emissiveIntensity = L * 0.7;
    const hs = 1.5 + L * 1.05;
    halo.current?.scale.set(hs, hs, 1);
    mats.rhaloM.opacity = alpha * (0.03 + RL * 0.45);
    rhalo.current?.scale.set(hs * 0.9, hs * 0.9, 1);
    const onWater = state === 1 ? 1 - rp : 1;
    mats.poolM.opacity = alpha * onWater * (0.05 + Math.max(L, s.mirror) * 0.45);
    mats.floatM.opacity = s.appear * onWater;
    mats.streakM.opacity = alpha * onWater * Math.max(L * 0.35, s.mirror * 0.8);
    if (pool.current) pool.current.scale.setScalar(1.6 + L * 0.7);

    // key hint label
    if (label.current) {
      const code = view.keys[index] ?? '';
      const show = ctx.settings.showKeyHints && state === 0 && code !== '';
      label.current.visible = show;
      if (show && lab.current.code !== code) {
        lab.current.tex?.dispose();
        lab.current.tex = labelTexture(keyLabel(code));
        lab.current.code = code;
        labMat.map = lab.current.tex;
        labMat.needsUpdate = true;
      }
    }
    if (hit.current) hit.current.visible = state === 0;
  });

  const parts = (m: THREE.Material, ro = 0) => (
    <>
      <mesh geometry={geo.base} material={mats.wood} position={[0, 0.035, 0]} renderOrder={ro} />
      <mesh geometry={geo.paper} material={m} renderOrder={ro} />
      <mesh geometry={geo.cap} material={mats.wood} position={[0, 1.11, 0]} renderOrder={ro} />
    </>
  );

  return (
    <group ref={root} visible={false}>
      <group ref={body}>
        {parts(mats.paper)}
        <sprite ref={halo} position={[0, 0.62, 0.05]} material={mats.haloM} />
      </group>
      <group scale={[1, -1, 1]}>
        <group ref={rbody}>
          {parts(mats.rpaper, -3)}
          <sprite ref={rhalo} position={[0, 0.62, 0]} material={mats.rhaloM} renderOrder={-3} />
        </group>
      </group>
      {geo.float && <mesh geometry={geo.float} material={mats.floatM} position={[0, -0.035, 0]} />}
      <mesh ref={pool} rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} material={mats.poolM} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={streak} rotation-x={-Math.PI / 2} position={[0, 0.014, 0.95]} scale={[0.5, 2.0, 1]} material={mats.streakM} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <sprite ref={label} position={[0, 1.55, 0]} scale={[0.46, 0.46, 1]} material={labMat} renderOrder={5} />
      <mesh
        ref={hit}
        position={[0, 0.55, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onTap(index);
        }}
      >
        <sphereGeometry args={[0.72, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

function Ripples({ view }: { view: View }) {
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const mats = useMemo(
    () => Array.from({ length: 8 }, () => new THREE.MeshBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })),
    [],
  );
  useFrame((_, dt) => {
    for (const r of view.ripples) r.t += dt;
    while (view.ripples.length && view.ripples[0].t > 1.4) view.ripples.shift();
    for (let k = 0; k < 8; k++) {
      const m = refs.current[k];
      const r = view.ripples[k];
      if (!m) continue;
      if (!r) {
        mats[k].opacity = 0;
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(r.x, 0.02, r.z);
      const s = (0.35 + r.t * 1.3) * r.s;
      m.scale.set(s, s, s);
      mats[k].opacity = Math.max(0, 1 - r.t / 1.4) * 0.55;
    }
  });
  return (
    <>
      {mats.map((m, k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)} rotation-x={-Math.PI / 2} material={m} renderOrder={2} visible={false}>
          <ringGeometry args={[0.55, 0.6, 48]} />
        </mesh>
      ))}
    </>
  );
}

function FocusRing({ view }: { view: View }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    t.current += dt;
    const i = view.focus;
    m.visible = view.showFocus && i >= 0 && i < view.count && view.state[i] === 0;
    if (!m.visible) return;
    m.position.set(view.cx[i], 0.03, view.cz[i]);
    const s = 1 + Math.sin(t.current * 3) * 0.05;
    m.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} renderOrder={3} visible={false}>
      <ringGeometry args={[0.5, 0.58, 48]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}
