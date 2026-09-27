import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { tween, clamp, easeOutCubic, easeInOutSine } from '@/sdk';
import { mountR3F, useGame, GameEffects, Motes, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { makePuzzle, trace, allLit, starsFor, cwCost, type Puzzle, type Trace, type Segment } from './logic';

const SESSION = 5;
const BEAM_Y = 0.42;
const CRYSTAL_COLORS = ['#ffb3d1', '#ffe08a', '#a8ffd8', '#c3b0ff', '#8fe9ff'];

// ---------------------------------------------------------------- view-model

class View {
  puzzle: Puzzle | null = null;
  rot: number[] = [];
  /** visual angle per mirror (radians), tweened toward -rot*PI/2 */
  angle: number[] = [];
  trace: Trace | null = null;
  /** per segment: time it started growing (-1 = already full) */
  segBorn: number[] = [];
  beamClock = 0;
  litT: number[] = []; // seconds since crystal woke (-1 = sleeping)
  selected = -1;
  showSelect = false;
  hintPulse = -1;
  mirrorPulse: number[] = [];
  phase: 'in' | 'idle' | 'out' = 'idle';
  phaseT = 0;
  solvedGlow = 0;
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

const cellWorld = (n: number, x: number, z: number, out: THREE.Vector3, y = 0) => out.set(x - (n - 1) / 2, y, z - (n - 1) / 2);

/** Unfold factor for a tile (0 hidden … 1 in place). */
function tileK(view: View, x: number, z: number, reduced: boolean): number {
  if (reduced || view.phase === 'idle' || !view.puzzle) return 1;
  const src = view.puzzle.chamber.source;
  const d = Math.abs(x - src.x) + Math.abs(z - src.z);
  const delay = d * 0.05;
  const k = clamp((view.phaseT - delay) / 0.45, 0, 1);
  return view.phase === 'in' ? easeOutCubic(k) : 1 - easeInOutSine(k);
}

// ---------------------------------------------------------------- game

export default function create(ctx: GameContext): GameInstance {
  const view = new View();
  const rng = ctx.rng;
  const preview = ctx.mode === 'preview';
  const stair = ctx.staircase({ min: 1, max: 12, up: 1, down: 1 });
  if (preview) stair.set(3);
  const burstRef: { current: BurstHandle | null } = { current: null };
  const notes = ctx.audio.scale(62, 'lydian');

  let alive = true;
  let stopAmbient: (() => void) | null = null;
  let accepting = false;
  let moves = 0;
  let hinted = false;
  let solvedResolve: (() => void) | null = null;
  let score = 0;
  let totalStars = 0;
  let chambers = 0;
  let perfect = 0;
  let maxLevel = stair.level;
  const humming: Array<() => void> = [];

  const reduced = () => ctx.settings.reducedMotion;

  function hud() {
    const p = view.puzzle;
    ctx.hud.set({
      score,
      level: stair.level,
      progress: chambers / SESSION,
      label: p ? `Turns ${moves} · best ${p.optimal}${hinted ? ' · hint' : ''}` : undefined,
    });
  }

  function retrace(animate: boolean) {
    const p = view.puzzle;
    if (!p) return;
    const old = view.trace;
    const t = trace(p.chamber, view.rot);
    const same = (a: Segment, b: Segment) => a.x0 === b.x0 && a.z0 === b.z0 && a.x1 === b.x1 && a.z1 === b.z1;
    let firstNewDepth = Infinity;
    for (const s of t.segments) if (!old || !old.segments.some((o) => same(o, s))) firstNewDepth = Math.min(firstNewDepth, s.depth);
    view.segBorn = t.segments.map((s) => {
      const isOld = old && old.segments.some((o) => same(o, s));
      if (!animate || isOld || reduced()) return -1;
      return view.beamClock + Math.max(0, s.depth - firstNewDepth) * 0.09;
    });
    // crystal wake / sleep
    t.lit.forEach((on, i) => {
      const was = view.litT[i] >= 0;
      if (on && !was) {
        view.litT[i] = 0;
        ctx.audio.chime(notes(i * 2), { gain: 0.09, dur: 2.2 });
        ctx.audio.tone(notes(i * 2) / 2, { gain: 0.03, dur: 1.8, type: 'sine', attack: 0.15 });
        ctx.haptics.tick();
        ctx.caption(`Crystal ${i + 1} awake`);
      } else if (!on && was) {
        view.litT[i] = -1;
        ctx.audio.tone(notes(i * 2) / 2, { gain: 0.03, dur: 0.4, type: 'sine' });
      }
    });
    view.trace = t;
    if (allLit(t) && accepting) {
      accepting = false;
      solvedResolve?.();
    }
  }

  async function rotate(i: number, dir: 1 | -1, counted = true) {
    const p = view.puzzle;
    if (!p || !accepting || i < 0 || i >= view.rot.length) return;
    view.rot[i] = (view.rot[i] + dir + 4) % 4;
    view.mirrorPulse[i] = 1;
    if (counted) moves++;
    hud();
    // stone slide + click
    ctx.audio.noise({ dur: 0.16, filter: 700, sweepTo: 1400, q: 1.2, gain: 0.05 });
    ctx.after(130, () => ctx.audio.tone(ctx.audio.midi(dir > 0 ? 79 : 76), { gain: 0.05, dur: 0.07, type: 'triangle' }));
    ctx.haptics.tick();
    const from = view.angle[i];
    const to = from - dir * (Math.PI / 2);
    if (reduced()) view.angle[i] = to;
    else {
      await tween(ctx, 200, (t) => (view.angle[i] = from + (to - from) * t), easeOutCubic);
    }
    view.angle[i] = to;
    retrace(true);
  }

  function tap(i: number) {
    if (!accepting) return;
    view.selected = i;
    void rotate(i, 1);
  }

  function hint() {
    const p = view.puzzle;
    if (!p || !accepting || preview) return;
    const i = view.rot.findIndex((r, k) => r !== p.best[k]);
    if (i < 0) return;
    hinted = true;
    view.selected = i;
    view.hintPulse = i;
    ctx.caption('Hint: this mirror turns into place');
    ctx.audio.bell(notes(6), { gain: 0.06 });
    const steps = cwCost(view.rot[i], p.best[i]);
    void (async () => {
      for (let s = 0; s < steps && accepting; s++) {
        await rotate(i, 1, false);
        await ctx.wait(120);
      }
    })();
  }

  function moveSelection(dx: number, dy: number) {
    const p = view.puzzle;
    if (!p || !p.chamber.mirrors.length) return;
    view.showSelect = true;
    const ms = p.chamber.mirrors;
    if (view.selected < 0) {
      view.selected = 0;
      return;
    }
    const cur = ms[view.selected];
    // iso screen axes: right ≈ (x - z), down ≈ (x + z)
    const sx = (m: { x: number; z: number }) => m.x - m.z;
    const sy = (m: { x: number; z: number }) => m.x + m.z;
    let best = -1;
    let bestScore = Infinity;
    ms.forEach((m, k) => {
      if (k === view.selected) return;
      const vx = sx(m) - sx(cur);
      const vy = sy(m) - sy(cur);
      const along = vx * dx + vy * dy;
      if (along <= 0) return;
      const across = Math.abs(vx * dy - vy * dx);
      const s = along + across * 2;
      if (s < bestScore) {
        bestScore = s;
        best = k;
      }
    });
    if (best >= 0) {
      view.selected = best;
      ctx.audio.tick();
    }
  }

  async function ghost() {
    await ctx.wait(1100);
    const p = view.puzzle;
    if (!p) return;
    view.showSelect = true;
    let mistakes = 0;
    while (alive && accepting && view.puzzle === p) {
      const todo = view.rot.map((r, k) => (r !== p.best[k] ? k : -1)).filter((k) => k >= 0);
      if (!todo.length) return;
      let i = todo[0];
      if (mistakes === 0 && rng.chance(0.12) && view.rot.length > todo.length) {
        const ok = view.rot.map((_, k) => k).filter((k) => !todo.includes(k));
        i = rng.pick(ok);
        mistakes++;
      }
      view.selected = i;
      await ctx.wait(420 + rng.next() * 240);
      if (!accepting) return;
      await rotate(i, 1);
      await ctx.wait(240);
    }
  }

  async function runPhase(phase: 'in' | 'out', ms: number) {
    view.phase = phase;
    view.phaseT = 0;
    if (reduced()) {
      await fade(phase === 'out' ? 1 : 0, 350);
      view.phase = 'idle';
      return;
    }
    await tween(ctx, ms, (t) => (view.phaseT = (t * ms) / 1000), (t) => t);
    view.phase = phase === 'out' ? 'out' : 'idle';
    view.phaseT = 99;
  }

  async function playChamber() {
    const level = stair.level;
    const p = makePuzzle(rng, level);
    view.puzzle = p;
    view.rot = p.start.slice();
    view.angle = p.start.map((r) => (-r * Math.PI) / 2);
    view.mirrorPulse = p.start.map(() => 0);
    view.litT = p.chamber.crystals.map(() => -1);
    view.trace = null;
    view.selected = view.showSelect && p.chamber.mirrors.length ? 0 : -1;
    view.hintPulse = -1;
    view.solvedGlow = 0;
    moves = 0;
    hinted = false;
    view.bump();
    hud();
    retrace(false);
    view.segBorn = view.segBorn.map(() => -1);
    ctx.audio.noise({ dur: 1.2, filter: 300, sweepTo: 1600, gain: 0.04 });
    await runPhase('in', 1300);
    if (!alive) return;
    ctx.announce(`Chamber ${chambers + 1} of ${SESSION}. ${p.chamber.crystals.length} crystals, ${p.chamber.mirrors.length} mirrors.`);
    accepting = true;
    const solved = new Promise<void>((res) => (solvedResolve = res));
    if (allLit(view.trace!)) {
      accepting = false;
      solvedResolve?.();
    }
    if (preview) void ghost();
    await solved;
    solvedResolve = null;
    if (!alive) return;
    const stars = starsFor(moves, p.optimal, hinted);
    const isPerfect = stars === 3 && !hinted;
    chambers++;
    totalStars += stars;
    if (isPerfect) perfect++;
    score += 60 + stars * 40 + p.optimal * 5;
    ctx.trial({ correct: isPerfect, level });
    if (stars === 3 && !hinted) stair.record(true);
    else if (stars === 1) stair.record(false);
    maxLevel = Math.max(maxLevel, stair.level);
    if (preview) stair.set(3 + (chambers % 2));
    hud();
    // celebration: chord + swell
    await ctx.wait(350);
    view.solvedGlow = 1;
    p.chamber.crystals.forEach((_, i) => ctx.audio.bell(notes(i * 2), { gain: 0.06, dur: 3 }));
    ctx.audio.tone(notes(-7), { gain: 0.05, dur: 3.2, type: 'sine', attack: 0.6 });
    ctx.audio.tone(notes(-3), { gain: 0.04, dur: 3.2, type: 'sine', attack: 0.8 });
    ctx.haptics.success();
    const tmp = new THREE.Vector3();
    p.chamber.crystals.forEach((c, i) => {
      cellWorld(p.chamber.n, c.x, c.z, tmp, 0.8);
      burstRef.current?.burst([tmp.x, tmp.y, tmp.z], 36, { color: CRYSTAL_COLORS[i % CRYSTAL_COLORS.length], speed: 2.4, life: 1.3, gravity: -0.5 });
    });
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    ctx.caption(`Chamber awake ${starStr}`);
    ctx.announce(`All crystals awake. ${stars} of 3 stars.`);
    ctx.hud.set({ label: `${starStr}  ${moves} turns` });
    await ctx.wait(1600);
    if (!alive) return;
    ctx.audio.noise({ dur: 1.4, filter: 1500, sweepTo: 300, gain: 0.05 });
    await runPhase('out', 1100);
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 64, 66, 71], { gain: 0.045, brightness: 0.35 });
    await ctx.wait(200);
    while (alive) {
      await playChamber();
      if (!alive) return;
      if (!preview && chambers >= SESSION) {
        ctx.end({
          score,
          levelReached: maxLevel,
          stats: { stars: totalStars, chambers, perfect },
          message: perfect >= 3 ? 'The temple sings with light.' : 'Every chamber awake. Beautifully done.',
        });
        return;
      }
    }
  }

  function windChime() {
    if (!alive) return;
    ctx.audio.chime(notes(7 + rng.int(0, 5)), { gain: 0.018, dur: 2.5, pan: rng.next() * 2 - 1 });
    ctx.after(3500 + rng.next() * 5000, windChime);
  }

  // DOM: fade overlay (reduced-motion transitions) + hint button
  const fadeEl = document.createElement('div');
  fadeEl.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;background:${ctx.manifest.palette.bg};`;
  ctx.container.appendChild(fadeEl);
  async function fade(to: number, ms: number) {
    const from = Number(fadeEl.style.opacity) || 0;
    await tween(ctx, ms, (t) => (fadeEl.style.opacity = String(from + (to - from) * t)));
  }
  const btns: HTMLButtonElement[] = [];
  if (!preview) {
    const mk = (label: string, aria: string, css: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'u-game-btn';
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.style.cssText = `position:absolute;bottom:calc(22px + env(safe-area-inset-bottom));min-height:48px;min-width:56px;${css}`;
      b.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      b.onpointerdown = (e) => e.stopPropagation();
      ctx.container.appendChild(b);
      btns.push(b);
    };
    const left = ctx.settings.leftHanded;
    mk('✦ Hint', 'Hint: turn one mirror into place (costs a star)', left ? 'right:18px;' : 'left:18px;', hint);
    mk('↺', 'Rotate selected mirror counter-clockwise', left ? 'left:86px;' : 'right:86px;', () => {
      if (view.selected >= 0) void rotate(view.selected, -1);
    });
    mk('↻', 'Rotate selected mirror clockwise', left ? 'left:18px;' : 'right:18px;', () => {
      if (view.selected >= 0) void rotate(view.selected, 1);
    });
  }

  ctx.keys({
    ArrowLeft: () => moveSelection(-1, 0),
    ArrowRight: () => moveSelection(1, 0),
    ArrowUp: () => moveSelection(0, -1),
    ArrowDown: () => moveSelection(0, 1),
    KeyA: () => moveSelection(-1, 0),
    KeyD: () => moveSelection(1, 0),
    KeyW: () => moveSelection(0, -1),
    KeyS: () => moveSelection(0, 1),
    Space: () => {
      view.showSelect = true;
      if (view.selected >= 0) void rotate(view.selected, 1);
      else moveSelection(1, 0);
    },
    Enter: () => {
      view.showSelect = true;
      if (view.selected >= 0) void rotate(view.selected, 1);
      else moveSelection(1, 0);
    },
    KeyE: () => view.selected >= 0 && void rotate(view.selected, 1),
    KeyQ: () => view.selected >= 0 && void rotate(view.selected, -1),
    KeyH: hint,
  });

  const unmount = mountR3F(ctx, <Scene view={view} onTap={(i) => !preview && tap(i)} burstRef={burstRef} />, {
    orthographic: true,
    camera: { position: [20, 22, 20], zoom: 40, near: 0.1, far: 200 },
    background: '#2a2552',
  });

  return {
    start() {
      void run();
      ctx.after(4000, windChime);
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      humming.forEach((h) => h());
      unmount();
      fadeEl.remove();
      btns.forEach((b) => b.remove());
    },
    onSettings() {
      view.bump();
    },
  };
}

// ---------------------------------------------------------------- scene

function Scene({ view, onTap, burstRef }: { view: View; onTap: (i: number) => void; burstRef: { current: BurstHandle | null } }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  const p = view.puzzle;
  return (
    <>
      <CameraRig view={view} />
      <ScreenGradient top={hc ? '#000000' : '#3b3478'} mid={hc ? '#050505' : '#c98bb0'} bottom={hc ? '#0a0a0a' : '#ffc4a0'} />
      <ambientLight intensity={0.45} color="#ffe6f0" />
      <hemisphereLight args={['#ffe2c8', '#6b4f8a', 0.7]} />
      <directionalLight position={[-6, 12, 4]} intensity={1.35} color="#ffe0c0" />
      <directionalLight position={[8, 5, -6]} intensity={0.35} color="#9fb8ff" />
      <SunDisc />
      <Clouds />
      {p && <Chamber key={view.version} view={view} onTap={onTap} />}
      <Beam view={view} />
      <Motes count={60} area={[16, 10, 16]} color="#ffe6c0" size={0.12} />
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={260} size={0.22} />
      <GameEffects bloom={1} threshold={0.55} />
    </>
  );
}

/** Screen-space vertical gradient backdrop (works with the orthographic camera). */
function ScreenGradient({ top, mid, bottom }: { top: string; mid: string; bottom: string }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec2 vUv;
          void main(){ float y = vUv.y; vec3 c = y > 0.45 ? mix(mid, top, smoothstep(0.45, 1.0, y)) : mix(bottom, mid, smoothstep(0.0, 0.45, y));
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    [top, mid, bottom],
  );
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-100}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

function CameraRig({ view }: { view: View }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const n = view.puzzle?.chamber.n ?? 6;
    const cam = camera as THREE.OrthographicCamera;
    // board diamond width on screen ≈ n·√2 world units; leave margins
    const fitW = n * 1.414 + 0.9;
    const fitH = n * 1.414 * 0.62 + 5.5;
    const zoom = Math.min(size.width / fitW, size.height / fitH);
    if (Math.abs(cam.zoom - zoom) > 0.01) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    cam.position.set(20, 20 * 1.02, 20);
    cam.lookAt(0, -0.9, 0);
  });
  return null;
}

function SunDisc() {
  const ctx = useGame();
  if (ctx.settings.highContrast) return null;
  return (
    <group position={[-30, 6, -40]}>
      <sprite scale={[40, 40, 1]}>
        <spriteMaterial map={softDotTexture()} color="#ffc49a" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh>
        <circleGeometry args={[3.5, 48]} />
        <meshBasicMaterial color="#fff0dc" />
      </mesh>
    </group>
  );
}

function Clouds() {
  const ctx = useGame();
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  const data = useMemo(
    () => [
      { x: -12, y: -8, z: 6, s: 14 },
      { x: 8, y: -10, z: -12, s: 18 },
      { x: 14, y: -6, z: 4, s: 10 },
      { x: -6, y: -12, z: -6, s: 20 },
      { x: 2, y: 4, z: -20, s: 12 },
    ],
    [],
  );
  useFrame((s) => {
    if (ctx.settings.reducedMotion) return;
    refs.current.forEach((r, i) => {
      if (r) r.position.x = data[i].x + Math.sin(s.clock.elapsedTime * 0.05 + i) * 2;
    });
  });
  if (ctx.settings.highContrast) return null;
  return (
    <>
      {data.map((c, i) => (
        <sprite key={i} ref={(r) => { refs.current[i] = r; }} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.45, 1]}>
          <spriteMaterial map={softDotTexture()} color="#ffd9e6" transparent opacity={0.35} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

// --- geometry helpers
function wedgeGeometry(): THREE.BufferGeometry {
  const s = 0.4;
  const shape = new THREE.Shape();
  // world (x, z) → shape (x, -z); solid corner at NW, reflective hypotenuse faces +x+z
  shape.moveTo(-s, s);
  shape.lineTo(s, s);
  shape.lineTo(-s, -s);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.62, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  return g;
}

let engraveTex: THREE.Texture | null = null;
function tileTexture(): THREE.Texture {
  if (engraveTex) return engraveTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(150,100,110,0.25)';
  g.lineWidth = 3;
  g.strokeRect(10, 10, 108, 108);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 2;
  g.strokeRect(14, 14, 100, 100);
  g.fillStyle = 'rgba(150,100,110,0.18)';
  g.beginPath();
  g.arc(64, 64, 6, 0, Math.PI * 2);
  g.fill();
  engraveTex = new THREE.CanvasTexture(c);
  engraveTex.colorSpace = THREE.SRGBColorSpace;
  return engraveTex;
}

// --- the chamber (tiles, pillar body, elements)
function Chamber({ view, onTap }: { view: View; onTap: (i: number) => void }) {
  const ctx = useGame();
  const p = view.puzzle!;
  const ch = p.chamber;
  const n = ch.n;
  const hc = ctx.settings.highContrast;
  const tiles = useRef<THREE.InstancedMesh>(null);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const tileGeo = useMemo(() => new THREE.BoxGeometry(0.94, 0.3, 0.94), []);
  const colors = useMemo(() => {
    const a = new THREE.Color(hc ? '#3a3a3a' : '#f7dcc6');
    const b = new THREE.Color(hc ? '#2a2a2a' : '#eec6b4');
    const arr = new Float32Array(n * n * 3);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const c = (x + z) % 2 ? b : a;
        const i = (z * n + x) * 3;
        arr[i] = c.r;
        arr[i + 1] = c.g;
        arr[i + 2] = c.b;
      }
    return arr;
  }, [n, hc]);

  useFrame(() => {
    const m = tiles.current;
    const red = ctx.settings.reducedMotion;
    if (m) {
      for (let z = 0; z < n; z++)
        for (let x = 0; x < n; x++) {
          const k = tileK(view, x, z, red);
          o.position.set(x - (n - 1) / 2, -0.15 - (1 - k) * 4, z - (n - 1) / 2);
          o.rotation.set((1 - k) * (x % 2 ? 1.4 : -1.4), 0, (1 - k) * (z % 2 ? 1.2 : -1.2));
          o.scale.setScalar(0.2 + 0.8 * k);
          o.updateMatrix();
          m.setMatrixAt(z * n + x, o.matrix);
        }
      m.instanceMatrix.needsUpdate = true;
    }
    if (body.current) {
      const k = tileK(view, Math.floor(n / 2), Math.floor(n / 2), red);
      body.current.scale.set(1, Math.max(0.001, k), 1);
      body.current.visible = k > 0.01;
    }
    if (root.current) {
      const k = view.phase === 'idle' || red ? 1 : tileK(view, ch.source.x, ch.source.z, red);
      root.current.rotation.y = view.phase === 'in' && !red ? (1 - k) * -0.6 : view.phase === 'out' && !red ? (1 - k) * 0.6 : 0;
    }
  });

  const setTiles = (m: THREE.InstancedMesh | null) => {
    (tiles as { current: THREE.InstancedMesh | null }).current = m;
    if (m) {
      m.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    }
  };

  const tex = tileTexture();
  const tmp = new THREE.Vector3();

  return (
    <group ref={root}>
      <instancedMesh ref={setTiles} args={[tileGeo, undefined, n * n]} frustumCulled={false}>
        <meshStandardMaterial map={hc ? null : tex} roughness={0.85} />
      </instancedMesh>
      <group ref={body}>
        <TempleBody n={n} hc={hc} />
      </group>
      {/* elements */}
      {ch.cells.map((c, i) => {
        const x = i % n;
        const z = Math.floor(i / n);
        cellWorld(n, x, z, tmp);
        const pos: [number, number, number] = [tmp.x, 0, tmp.z];
        if (c.t === 'block') return <Block key={i} pos={pos} view={view} x={x} z={z} hc={hc} />;
        if (c.t === 'source') return <Source key={i} pos={pos} dir={c.dir} view={view} x={x} z={z} hc={hc} />;
        if (c.t === 'prism') return <Prism key={i} pos={pos} view={view} x={x} z={z} hc={hc} />;
        if (c.t === 'crystal') return <Crystal key={i} pos={pos} id={c.id} view={view} x={x} z={z} hc={hc} />;
        if (c.t === 'mirror') return <Mirror key={i} pos={pos} id={c.id} view={view} x={x} z={z} hc={hc} onTap={onTap} />;
        return null;
      })}
    </group>
  );
}

function TempleBody({ n, hc }: { n: number; hc: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { top: { value: new THREE.Color(hc ? '#444444' : '#e9b9a8') }, bottom: { value: new THREE.Color(hc ? '#000000' : '#6d4f8f') } },
        vertexShader: `varying float vY; varying vec3 vN; void main(){ vY = position.y; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying float vY; varying vec3 vN;
          void main(){ float h = clamp((vY + 2.5) / 5.0, 0.0, 1.0); vec3 c = mix(bottom, top, h);
          float side = vN.x > 0.5 ? 0.82 : (vN.z > 0.5 ? 1.0 : 0.9);
          float a = smoothstep(0.05, 0.85, h);
          gl_FragColor = vec4(c * side, a); }`,
      }),
    [hc],
  );
  const W = n + 0.5;
  const water = n + 0.2;
  return (
    <>
      {/* water channel glowing between the tiles */}
      <mesh position={[0, -0.26, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[water, water]} />
        <meshBasicMaterial color={hc ? '#111111' : '#5fe0d6'} />
      </mesh>
      {/* rim */}
      {[0, 1, 2, 3].map((k) => {
        const horiz = k < 2;
        const s = k % 2 ? 1 : -1;
        return (
          <mesh key={k} position={horiz ? [0, -0.2, s * (W / 2)] : [s * (W / 2), -0.2, 0]}>
            <boxGeometry args={horiz ? [W + 0.3, 0.42, 0.3] : [0.3, 0.42, W + 0.3]} />
            <meshStandardMaterial color={hc ? '#777777' : '#f3cdb8'} roughness={0.9} />
          </mesh>
        );
      })}
      {/* tall floating temple body fading into the clouds */}
      <mesh position={[0, -0.4 - 2.5, 0]} material={mat}>
        <boxGeometry args={[W + 0.3, 5, W + 0.3]} />
      </mesh>
      {/* arches carved in the body */}
      {!hc &&
        Array.from({ length: Math.max(2, Math.floor(n / 2)) }, (_, k) => {
          const cnt = Math.max(2, Math.floor(n / 2));
          const off = (k - (cnt - 1) / 2) * ((W - 0.6) / cnt);
          return (
            <group key={k}>
              <mesh position={[off, -1.5, W / 2 + 0.16]}>
                <planeGeometry args={[0.5, 1.2]} />
                <meshBasicMaterial color="#8a5f8c" transparent opacity={0.55} />
              </mesh>
              <mesh position={[off, -0.9, W / 2 + 0.161]}>
                <circleGeometry args={[0.25, 16, 0, Math.PI]} />
                <meshBasicMaterial color="#8a5f8c" transparent opacity={0.55} />
              </mesh>
              <mesh position={[W / 2 + 0.16, -1.5, off]} rotation-y={Math.PI / 2}>
                <planeGeometry args={[0.5, 1.2]} />
                <meshBasicMaterial color="#7a5080" transparent opacity={0.55} />
              </mesh>
              <mesh position={[W / 2 + 0.161, -0.9, off]} rotation-y={Math.PI / 2}>
                <circleGeometry args={[0.25, 16, 0, Math.PI]} />
                <meshBasicMaterial color="#7a5080" transparent opacity={0.55} />
              </mesh>
            </group>
          );
        })}
    </>
  );
}

function useUnfold(view: View, x: number, z: number, ref: React.RefObject<THREE.Group | null>) {
  const ctx = useGame();
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = tileK(view, x, z, ctx.settings.reducedMotion);
    g.scale.setScalar(Math.max(0.001, k));
    g.position.y = -(1 - k) * 3;
    g.visible = k > 0.01;
  });
}

function Block({ pos, view, x, z, hc }: { pos: [number, number, number]; view: View; x: number; z: number; hc: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useUnfold(view, x, z, ref);
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.3, 0.34, 0.9, 16]} />
          <meshStandardMaterial color={hc ? '#888888' : '#e7b6a6'} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[0.78, 0.12, 0.78]} />
          <meshStandardMaterial color={hc ? '#aaaaaa' : '#f6d2bf'} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.12, 0]}>
          <sphereGeometry args={[0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={hc ? '#aaaaaa' : '#d99a93'} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function Source({ pos, dir, view, x, z, hc }: { pos: [number, number, number]; dir: number; view: View; x: number; z: number; hc: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const orb = useRef<THREE.Sprite>(null);
  const ctx = useGame();
  useUnfold(view, x, z, ref);
  useFrame((s) => {
    if (!orb.current) return;
    const k = ctx.settings.reducedMotion ? 0 : Math.sin(s.clock.elapsedTime * 2) * 0.1;
    orb.current.scale.setScalar(1.5 + k);
  });
  // arch opening faces the beam direction
  const rotY = -dir * (Math.PI / 2);
  return (
    <group position={pos}>
      <group ref={ref}>
        <group rotation-y={rotY}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.5, s * 0.36]}>
              <boxGeometry args={[0.5, 1.0, 0.18]} />
              <meshStandardMaterial color={hc ? '#bbbbbb' : '#f6d2bf'} roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[0, 1.05, 0]}>
            <boxGeometry args={[0.56, 0.16, 0.92]} />
            <meshStandardMaterial color={hc ? '#bbbbbb' : '#e7a79a'} roughness={0.85} />
          </mesh>
        </group>
        <mesh position={[0, BEAM_Y, 0]}>
          <sphereGeometry args={[0.2, 20, 14]} />
          <meshBasicMaterial color="#fffaf0" />
        </mesh>
        <sprite ref={orb} position={[0, BEAM_Y, 0]} scale={[1.5, 1.5, 1]}>
          <spriteMaterial map={softDotTexture()} color={hc ? '#ffffff' : '#bff8ff'} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
    </group>
  );
}

function Prism({ pos, view, x, z, hc }: { pos: [number, number, number]; view: View; x: number; z: number; hc: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Mesh>(null);
  const ctx = useGame();
  useUnfold(view, x, z, ref);
  useFrame((_, dt) => {
    if (gem.current && !ctx.settings.reducedMotion) gem.current.rotation.y += dt * 0.6;
  });
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 0.2, 6]} />
          <meshStandardMaterial color={hc ? '#999999' : '#f3cdb8'} roughness={0.8} />
        </mesh>
        <mesh ref={gem} position={[0, BEAM_Y + 0.05, 0]} scale={[0.28, 0.36, 0.28]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#ffffff" emissive={hc ? '#ffffff' : '#bfefff'} emissiveIntensity={0.6} roughness={0.05} metalness={0.2} transparent opacity={0.85} flatShading />
        </mesh>
        <sprite position={[0, BEAM_Y, 0]} scale={[1.2, 1.2, 1]}>
          <spriteMaterial map={softDotTexture()} color="#e6fbff" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
    </group>
  );
}

function Crystal({ pos, id, view, x, z, hc }: { pos: [number, number, number]; id: number; view: View; x: number; z: number; hc: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ctx = useGame();
  const color = hc ? '#ffffff' : CRYSTAL_COLORS[id % CRYSTAL_COLORS.length];
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8f86b8', emissive: color, emissiveIntensity: 0.05, roughness: 0.15, metalness: 0.1, flatShading: true }),
    [color],
  );
  const awakeColor = useMemo(() => new THREE.Color(color), [color]);
  const sleepColor = useMemo(() => new THREE.Color(hc ? '#555555' : '#7d6fb8'), [hc]);
  const wake = useRef(0);
  useUnfold(view, x, z, ref);
  useFrame((s, dt) => {
    const lit = view.litT[id] >= 0;
    if (lit) view.litT[id] += dt;
    wake.current += ((lit ? 1 : 0) - wake.current) * Math.min(1, dt * 5);
    const w = wake.current;
    const red = ctx.settings.reducedMotion;
    const t = s.clock.elapsedTime;
    mat.color.copy(sleepColor).lerp(awakeColor, w);
    mat.emissiveIntensity = 0.22 + w * (0.75 + (red ? 0 : Math.sin(t * 3 + id) * 0.15)) + view.solvedGlow * 0.4;
    if (gem.current) {
      gem.current.position.y = 0.42 + w * (0.22 + (red ? 0 : Math.sin(t * 1.6 + id) * 0.05));
      gem.current.rotation.z = (1 - w) * 0.55;
      if (!red) gem.current.rotation.y += dt * (0.2 + w * 0.8);
    }
    if (halo.current) {
      const hm = halo.current.material as THREE.SpriteMaterial;
      hm.opacity = w * 0.85;
      halo.current.scale.setScalar(1.4 + w * 0.6 + view.solvedGlow * 0.6);
      halo.current.position.y = gem.current?.position.y ?? 0.6;
    }
    if (ring.current) {
      (ring.current.material as THREE.MeshBasicMaterial).opacity = w * 0.9;
      const rs = 1 + (red ? 0 : ((t * 0.6 + id * 0.3) % 1) * 0.35 * w);
      ring.current.scale.set(rs, rs, rs);
    }
  });
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.3, 0.34, 0.12, 8]} />
          <meshStandardMaterial color={hc ? '#999999' : '#e5b7a8'} roughness={0.8} />
        </mesh>
        <mesh ref={ring} position={[0, 0.14, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.36, 0.44, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
        </mesh>
        <sprite ref={halo} scale={[1.6, 1.6, 1]}>
          <spriteMaterial map={softDotTexture()} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <group ref={gem} position={[0, 0.42, 0]}>
          <mesh material={mat} scale={[0.26, 0.46, 0.26]}>
            <octahedronGeometry args={[1, 0]} />
          </mesh>
          <mesh material={mat} scale={[0.1, 0.2, 0.1]} position={[0.16, -0.12, 0.04]} rotation-z={-0.5}>
            <octahedronGeometry args={[1, 0]} />
          </mesh>
          <mesh material={mat} scale={[0.09, 0.18, 0.09]} position={[-0.14, -0.14, -0.05]} rotation-z={0.6}>
            <octahedronGeometry args={[1, 0]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

const wedgeGeo = { g: null as THREE.BufferGeometry | null };
function Mirror({ pos, id, view, x, z, hc, onTap }: { pos: [number, number, number]; id: number; view: View; x: number; z: number; hc: boolean; onTap: (i: number) => void }) {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const sel = useRef<THREE.Mesh>(null);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const ctx = useGame();
  if (!wedgeGeo.g) wedgeGeo.g = wedgeGeometry();
  useUnfold(view, x, z, ref);
  useFrame((s, dt) => {
    if (spin.current) spin.current.rotation.y = view.angle[id] ?? 0;
    view.mirrorPulse[id] = Math.max(0, (view.mirrorPulse[id] ?? 0) - dt * 2.5);
    const hit = view.trace?.hitMirrors.has(id) ?? false;
    if (face.current) face.current.emissiveIntensity = (hit ? 1.0 : 0.45) + view.mirrorPulse[id] * 0.8;
    if (sel.current) {
      const on = view.showSelect && view.selected === id;
      const hintOn = view.hintPulse === id;
      sel.current.visible = on || hintOn;
      const m = sel.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.75 + (ctx.settings.reducedMotion ? 0 : Math.sin(s.clock.elapsedTime * 4) * 0.2);
    }
  });
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh ref={sel} position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} visible={false}>
          <ringGeometry args={[0.5, 0.6, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={hc ? '#ffff55' : '#fff4c8'} transparent opacity={0.8} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.44, 0.46, 0.08, 24]} />
          <meshStandardMaterial color={hc ? '#bbbbbb' : '#f9e4d4'} roughness={0.6} />
        </mesh>
        <group ref={spin}>
          <mesh geometry={wedgeGeo.g} position={[0, 0.06, 0]}>
            <meshStandardMaterial color={hc ? '#dddddd' : '#d8877a'} roughness={0.75} />
          </mesh>
          {/* reflective face on the hypotenuse, facing +x+z */}
          <mesh position={[0.02, 0.4, 0.02]} rotation-y={Math.PI / 4}>
            <planeGeometry args={[1.08, 0.58]} />
            <meshStandardMaterial ref={face} color={hc ? '#ffffff' : '#e9f8ff'} emissive={hc ? '#ffffff' : '#8fe4ff'} emissiveIntensity={0.5} roughness={0.2} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          {/* glowing lip along the top of the reflective edge: shows orientation from any angle */}
          <mesh position={[0.03, 0.71, 0.03]} rotation-y={Math.PI / 4}>
            <boxGeometry args={[1.12, 0.07, 0.12]} />
            <meshBasicMaterial color={hc ? '#ffff66' : '#c8f6ff'} />
          </mesh>
          {/* small dot on top of the solid corner */}
          <mesh position={[-0.13, 0.7, -0.13]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.07, 12]} />
            <meshBasicMaterial color={hc ? '#000000' : '#fff4ea'} />
          </mesh>
        </group>
        {/* generous hit target */}
        <mesh
          position={[0, 0.45, 0]}
          onPointerDown={(e) => {
            e.stopPropagation();
            onTap(id);
          }}
        >
          <boxGeometry args={[1, 1.1, 1]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// --- the light beam: pooled ribbons with a flowing shader
const MAX_SEG = 48;
function Beam({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const cores = useRef<Array<THREE.Mesh | null>>([]);
  const glowsH = useRef<Array<THREE.Mesh | null>>([]);
  const glowsV = useRef<Array<THREE.Mesh | null>>([]);
  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { t: { value: 0 }, color: { value: new THREE.Color(hc ? '#ffffff' : '#38d9f5') }, amp: { value: 1 } },
        vertexShader: `varying vec2 vUv; varying float vLen; void main(){ vUv = uv; vLen = length(modelMatrix[0].xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float t; uniform vec3 color; uniform float amp; varying vec2 vUv; varying float vLen;
          void main(){ float w = 1.0 - abs(vUv.y * 2.0 - 1.0); float core = pow(w, 2.2);
          float flow = 0.75 + 0.25 * sin(vUv.x * vLen * 5.0 - t * 7.0) * amp;
          gl_FragColor = vec4(mix(color, vec3(1.0), pow(w, 6.0)), core * flow * 0.85); }`,
      }),
    [hc],
  );
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const plane = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0.5, 0, 0);
    return g;
  }, []);
  const box = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 0.1, 0.1);
    g.translate(0.5, 0, 0);
    return g;
  }, []);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    view.beamClock += dt;
    const red = ctx.settings.reducedMotion;
    glowMat.uniforms.t.value = s.clock.elapsedTime;
    glowMat.uniforms.amp.value = red ? 0 : 1;
    const p = view.puzzle;
    const tr = view.trace;
    const segs = tr?.segments ?? [];
    const n = p?.chamber.n ?? 5;
    const visibleAll = view.phase === 'idle' || (view.phase === 'in' && view.phaseT > 1.1);
    for (let i = 0; i < MAX_SEG; i++) {
      const c = cores.current[i];
      const gh = glowsH.current[i];
      const gv = glowsV.current[i];
      if (!c || !gh || !gv) continue;
      const sg = segs[i];
      if (!sg || !p || !visibleAll) {
        c.visible = gh.visible = gv.visible = false;
        continue;
      }
      cellWorld(n, sg.x0, sg.z0, a, BEAM_Y);
      cellWorld(n, sg.x1, sg.z1, b, BEAM_Y);
      const full = a.distanceTo(b);
      const born = view.segBorn[i] ?? -1;
      const grow = born < 0 ? 1 : clamp((view.beamClock - born) / 0.09, 0, 1);
      const len = Math.max(0.001, full * grow);
      const ang = Math.atan2(-(b.z - a.z), b.x - a.x);
      c.visible = gh.visible = gv.visible = grow > 0;
      const th = 1 + view.solvedGlow * 0.6;
      c.position.copy(a);
      c.rotation.set(0, ang, 0);
      c.scale.set(len, 1, 1);
      gh.position.copy(a);
      gh.rotation.set(0, ang, 0);
      gh.rotateX(-Math.PI / 2);
      gh.scale.set(len, 0.6 * th, 1);
      gv.position.copy(a);
      gv.rotation.set(0, ang, 0);
      gv.scale.set(len, 0.6 * th, 1);
    }
  });

  return (
    <>
      {Array.from({ length: MAX_SEG }, (_, i) => (
        <group key={i}>
          <mesh ref={(m) => { cores.current[i] = m; }} geometry={box} material={coreMat} visible={false} frustumCulled={false} />
          <mesh ref={(m) => { glowsH.current[i] = m; }} geometry={plane} material={glowMat} visible={false} frustumCulled={false} renderOrder={5} />
          <mesh ref={(m) => { glowsV.current[i] = m; }} geometry={plane} material={glowMat} visible={false} frustumCulled={false} renderOrder={5} />
        </group>
      ))}
    </>
  );
}
