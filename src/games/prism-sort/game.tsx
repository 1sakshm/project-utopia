import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, damp, easeOutCubic } from '@/sdk';
import { mountR3F, useGame, GameEffects, GradientSky, Motes, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { DIM_NAMES, TRIALS, levelDef, makeExamples, makeCrystal, portalFor, pickNewRule, streakMult, type Spec } from './logic';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clay, puckGeometry, shade } from './soft';

const PATTERN_COLORS = ['#7fe8ff', '#ff9ad8', '#ffd68a'];
const PORTAL_COLORS = ['#a58bff', '#5ff2d6'];
const PORTAL_X = 1.42;
const PORTAL_Y = 1.45;
const PORTAL_R = 0.7;
const REST: [number, number, number] = [0, -0.2, 0.7];
const FLOOR_Y = -1.0;

type AnimKind = 'none' | 'drop' | 'fly' | 'bounce';

class View {
  crystal: Spec | null = null;
  crystalKey = 0;
  anim: { kind: AnimKind; t0: number; dur: number; side: number } = { kind: 'none', t0: 0, dur: 1, side: 0 };
  examples: [Spec, Spec] = [
    [0, 0, 0, 0],
    [1, 0, 1, 0],
  ];
  exKey = 0;
  flash = [0, 0];
  dim = [0, 0];
  beamT0 = [-1e9, -1e9];
  mark: { side: number; ok: boolean; t0: number } = { side: 0, ok: true, t0: -1e9 };
  cue = -1;
  shiftT0 = -1e9;
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
  const stair = ctx.staircase({ min: 1, max: 8, up: 4, down: 2 });
  if (preview) stair.set(3);
  const burstRef: { current: BurstHandle | null } = { current: null };
  const note = ctx.audio.scale(67, 'majorPenta');

  let alive = true;
  let score = 0;
  let trial = 0;
  let correctCount = 0;
  let streak = 0;
  let ruleStreak = 0;
  let switchAt = 6;
  let rule = 0;
  let prevRule = -1;
  let postSwitch = false;
  let postSwitchRun = 0;
  let shifts = 0;
  let persev = 0;
  let maxLevel = stair.level;
  let dimsKey = '';
  let cuedLeft = 0;
  let cueRule = -1;
  let stopAmbient: (() => void) | null = null;

  let accepting = false;
  let resolveChoice: ((side: 0 | 1) => void) | null = null;

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: preview ? undefined : trial / TRIALS,
      label: view.cue >= 0 ? `Rule: ${DIM_NAMES[view.cue]}` : streak >= 3 ? `Streak ${streak}` : undefined,
    });
  }

  function choose(side: 0 | 1) {
    if (!accepting || !resolveChoice) return;
    accepting = false;
    const r = resolveChoice;
    resolveChoice = null;
    r(side);
  }

  function waitChoice(): Promise<0 | 1> {
    accepting = true;
    return new Promise((res) => {
      resolveChoice = res;
    });
  }

  function sparkleShift() {
    view.shiftT0 = ctx.time();
    shifts++;
    const n = [4, 6, 8, 11];
    n.forEach((d, i) => ctx.after(i * 90, () => ctx.audio.chime(note(d), { gain: 0.09, dur: 1.2 })));
    ctx.haptics.success();
    ctx.caption('Shift spotted!');
    ctx.announce('Shift spotted');
    burstRef.current?.burst([0, 2.5, 0.5], 50, { color: '#ffe3a3', speed: 2.4, life: 1.3 });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 62, 69, 74], { gain: 0.04, brightness: 0.35 });
    const def0 = levelDef(stair.level);
    rule = rng.pick(def0.dims);
    switchAt = rng.int(def0.switchMin, def0.switchMax);
    await ctx.wait(300);
    while (alive) {
      const level = stair.level;
      maxLevel = Math.max(maxLevel, level);
      const def = levelDef(level);
      const key = def.dims.join(',');
      if (key !== dimsKey || (trial > 0 && trial % 12 === 0)) {
        dimsKey = key;
        view.examples = makeExamples(rng, def.dims);
        view.exKey++;
        if (!def.dims.includes(rule)) {
          prevRule = rule;
          rule = pickNewRule(rng, def.dims, rule);
        }
      }
      // cued block?
      if (cuedLeft <= 0 && def.cued && !postSwitch && trial > 3 && rng.chance(def.cuedChance)) {
        cuedLeft = rng.int(3, 5);
        cueRule = rng.pick(def.dims);
      }
      const cued = cuedLeft > 0;
      if (cued) {
        if (rng.chance(0.5)) cueRule = pickNewRule(rng, def.dims, cueRule);
        cuedLeft--;
      }
      view.cue = cued ? cueRule : -1;
      const activeRule = cued ? cueRule : rule;
      const target: 0 | 1 = rng.chance(0.5) ? 0 : 1;
      view.crystal = makeCrystal(rng, view.examples, def.dims, activeRule, target);
      view.crystalKey++;
      view.anim = { kind: 'drop', t0: ctx.time(), dur: ctx.settings.reducedMotion ? 250 : 520, side: 0 };
      view.bump();
      hud();
      if (cued) ctx.caption(`Glyph: sort by ${DIM_NAMES[cueRule]}`);
      ctx.audio.tone(note(0) / 2, { dur: 0.25, gain: 0.04, type: 'sine' });
      await ctx.wait(view.anim.dur);
      if (!alive) return;
      const choiceP = waitChoice();
      if (preview) void ghost(activeRule, cued);
      const side = await choiceP;
      if (!alive) return;
      const correctSide = portalFor(view.crystal, view.examples, activeRule);
      const ok = side === correctSide;
      trial++;
      ctx.trial({ correct: ok, level });
      stair.record(ok);
      await feedback(side, ok);
      if (!alive) return;

      if (ok) {
        correctCount++;
        streak++;
        score += Math.round(10 * streakMult(streak));
      } else {
        streak = 0;
      }
      if (!cued) {
        if (ok) {
          ruleStreak++;
          if (postSwitch) {
            postSwitchRun++;
            if (postSwitchRun >= 3) {
              postSwitch = false;
              sparkleShift();
            }
          }
        } else {
          ruleStreak = 0;
          if (postSwitch) {
            postSwitchRun = 0;
            if (prevRule >= 0 && portalFor(view.crystal, view.examples, prevRule) === side) persev++;
          }
        }
        if (ruleStreak >= switchAt) {
          // Silent switch.
          prevRule = rule;
          rule = pickNewRule(rng, def.dims, rule);
          ruleStreak = 0;
          switchAt = rng.int(def.switchMin, def.switchMax);
          postSwitch = true;
          postSwitchRun = 0;
        }
      }
      hud();
      if (!preview && trial >= TRIALS) break;
      if (preview && trial >= TRIALS) {
        trial = 0;
        stair.set(3);
      }
      await ctx.wait(ok ? 250 : 450);
    }
    if (!alive || preview) return;
    view.crystal = null;
    view.cue = -1;
    view.bump();
    await ctx.wait(700);
    const accuracy = trial ? Math.round((correctCount / trial) * 100) : 0;
    ctx.end({
      score,
      levelReached: maxLevel,
      stats: { shifts, perseverative: persev, accuracy },
      message: shifts >= 3 ? 'A true rule detective — you adapt fast.' : shifts >= 1 ? 'You spotted the change. That is the whole skill.' : 'Every sort teaches you the rule. Try again!',
    });
  }

  async function feedback(side: 0 | 1, ok: boolean) {
    const rm = ctx.settings.reducedMotion;
    view.anim = { kind: ok ? 'fly' : 'bounce', t0: ctx.time(), dur: rm ? 260 : ok ? 480 : 900, side };
    ctx.audio.noise({ dur: 0.3, filter: 2500, sweepTo: 5000, gain: 0.025, pan: side ? 0.5 : -0.5 });
    await ctx.wait(rm ? 200 : ok ? 420 : 380);
    if (!alive) return;
    view.mark = { side, ok, t0: ctx.time() };
    if (ok) {
      view.flash[side] = 1;
      view.beamT0[side] = ctx.time();
      const f = note(Math.min(12, streak + 1));
      ctx.audio.chime(f, { gain: 0.14, dur: 1.4, pan: side ? 0.5 : -0.5 });
      ctx.audio.bell(f * 2, { gain: 0.04, dur: 1.6 });
      ctx.haptics.tick();
      burstRef.current?.burst([side ? PORTAL_X : -PORTAL_X, PORTAL_Y, 0.2], 36, { color: PORTAL_COLORS[side], speed: 2, life: 1 });
    } else {
      view.dim[side] = 1;
      ctx.audio.tone(2300, { dur: 0.09, gain: 0.05, type: 'sine', pan: side ? 0.5 : -0.5 });
      ctx.after(140, () => ctx.audio.tone(1500, { dur: 0.12, gain: 0.035, type: 'triangle' }));
      ctx.audio.thunk({ gain: 0.12 });
      ctx.haptics.error();
      ctx.caption('Glassy tink: not this portal');
    }
    await ctx.wait(ok ? 200 : rm ? 150 : 540);
  }

  async function ghost(activeRule: number, cued: boolean) {
    await ctx.wait(750 + rng.next() * 500);
    if (!accepting || !view.crystal) return;
    let useRule = activeRule;
    // The ghost perseveres once after a silent switch, then adapts.
    if (!cued && postSwitch && postSwitchRun === 0 && prevRule >= 0 && ghostErrs === 0) {
      useRule = prevRule;
      ghostErrs++;
    } else if (!postSwitch) ghostErrs = 0;
    let side = portalFor(view.crystal, view.examples, useRule);
    if (side < 0) side = portalFor(view.crystal, view.examples, activeRule);
    if (rng.chance(0.04)) side = side === 0 ? 1 : 0;
    choose(side === 1 ? 1 : 0);
  }
  let ghostErrs = 0;

  // Input: keys, swipe, portal taps.
  ctx.keys({
    ArrowLeft: () => choose(0),
    KeyA: () => choose(0),
    ArrowRight: () => choose(1),
    KeyD: () => choose(1),
  });
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!down || preview || ctx.isPaused()) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) choose(dx < 0 ? 0 : 1);
  };
  ctx.container.addEventListener('pointerdown', onDown, { signal: ctx.signal });
  ctx.container.addEventListener('pointerup', onUp, { signal: ctx.signal });
  const onPortal = (side: 0 | 1) => {
    if (preview || ctx.isPaused()) return;
    choose(side);
  };

  const unmount = mountR3F(ctx, <Scene view={view} burstRef={burstRef} onPortal={onPortal} />, {
    camera: { position: [0, 1.2, 12], fov: 42 },
    background: ctx.manifest.palette.bg,
  });

  return {
    start() {
      hud();
      void run();
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      unmount();
    },
  };
}

// ---------------------------------------------------------------- materials

const crystalVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vO; varying vec3 vON;
  void main(){
    vO = position; vON = normal;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const crystalFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uPattern; uniform float uTime; uniform float uHC;
  varying vec3 vN; varying vec3 vV; varying vec3 vO; varying vec3 vON;
  vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    if (dot(n, v) < 0.0) n = -n;
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.2);
    vec3 r = refract(-v, n, 0.67);
    float env = 0.5 + 0.5 * sin(r.y * 7.0 + r.x * 5.0 + uTime * 0.5);
    vec3 disp = hue(fract(r.x * 0.7 + r.y * 0.5 + ndv * 0.9 + uTime * 0.04));
    vec3 base = mix(uColor, vec3(1.0), uHC * 0.9);
    vec3 col = base * (0.32 + 0.55 * env);
    col = mix(col, disp * (0.6 + 0.6 * base), 0.28 * (1.0 - uHC));
    // surface pattern (object space, triplanar-ish)
    float pat = 0.0;
    if (uPattern > 0.5 && uPattern < 1.5) {
      float s = fract(dot(vO, vec3(0.55, 1.0, 0.3)) * 6.5);
      pat = smoothstep(0.42, 0.48, s) * (1.0 - smoothstep(0.9, 0.96, s));
    } else if (uPattern > 1.5) {
      vec3 an = abs(vON);
      vec2 p = (an.x > an.y && an.x > an.z) ? vO.yz : (an.y > an.z ? vO.xz : vO.xy);
      vec2 q = fract(p * 5.5) - 0.5;
      pat = 1.0 - smoothstep(0.17, 0.23, length(q));
    }
    float markDark = mix(0.72, 0.9, uHC);
    col *= 1.0 - pat * markDark;
    vec3 L = normalize(vec3(-0.4, 0.9, 0.6));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 28.0);
    col += base * diff * 0.35 * (1.0 - pat * 0.8);
    col += fres * mix(base, vec3(1.0), 0.5) * 1.1 + spec * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }`;

const sharedTime = { value: 0 };
const matCache = new Map<string, THREE.ShaderMaterial>();
function crystalMaterial(pattern: number, hc: boolean) {
  const key = `${pattern}-${hc ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(PATTERN_COLORS[pattern]) }, uPattern: { value: pattern }, uTime: sharedTime, uHC: { value: hc ? 1 : 0 } },
      vertexShader: crystalVert,
      fragmentShader: crystalFrag,
      side: THREE.DoubleSide,
    });
    matCache.set(key, m);
  }
  return m;
}

let geoCache: THREE.BufferGeometry[] | null = null;
function shapeGeos() {
  if (geoCache) return geoCache;
  // orient tetra point-up
  const t2 = new THREE.TetrahedronGeometry(0.52, 0);
  t2.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0)));
  t2.translate(0, -0.1, 0);
  const cube = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const octa = new THREE.OctahedronGeometry(0.44, 0);
  octa.scale(1, 1.35, 1);
  geoCache = [t2, cube.toNonIndexed(), octa];
  geoCache.forEach((g) => g.computeVertexNormals());
  return geoCache;
}

const CLUSTER: Array<Array<[number, number, number]>> = [
  [[0, 0, 0]],
  [
    [-0.3, -0.02, 0],
    [0.3, 0.06, 0.05],
  ],
  [
    [-0.34, -0.1, 0.05],
    [0.34, -0.06, 0.02],
    [0, 0.3, -0.06],
  ],
];

function Crystal({ spec, scale = 1, spin = 0.5 }: { spec: Spec; scale?: number; spin?: number }) {
  const ctx = useGame();
  const grp = useRef<THREE.Group>(null);
  const geos = shapeGeos();
  const [shape, count, pattern, orient] = spec;
  const mat = crystalMaterial(pattern, ctx.settings.highContrast);
  const pts = CLUSTER[count];
  const s = count === 0 ? 1 : count === 1 ? 0.62 : 0.55;
  const tilt = orient ? (shape === 0 ? Math.PI : Math.PI / 4) : 0;
  const t = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    if (!grp.current) return;
    if (!ctx.settings.reducedMotion) t.current += dt * spin;
    grp.current.rotation.y = t.current;
  });
  return (
    <group scale={scale}>
      <group ref={grp}>
        {pts.map((p, i) => (
          <group key={i} position={p} rotation={[0, i * 0.7, 0]}>
            <mesh geometry={geos[shape]} material={mat} scale={s} rotation={[0, 0, tilt]} />
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- scene

function Scene({ view, burstRef, onPortal }: { view: View; burstRef: { current: BurstHandle | null }; onPortal: (s: 0 | 1) => void }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  const soft = ctx.settings.soft;
  useFrame((state) => {
    sharedTime.value = ctx.settings.reducedMotion ? 0 : state.clock.elapsedTime;
  });
  return (
    <>
      <CameraRig />
      {!hc && <fog attach="fog" args={['#140f2c', 12, 30]} />}
      <GradientSky top="#07061a" bottom="#2a1b52" />
      <ambientLight intensity={0.3} color="#9a8cff" />
      {soft && <hemisphereLight args={['#b9adff', '#0a0818', 0.75]} />}
      <directionalLight position={[-3, 6, 5]} intensity={0.9} color="#ffe9d0" />
      <Temple />
      <Floor view={view} />
      <Pedestal />
      <Portal side={0} view={view} onPortal={onPortal} />
      <Portal side={1} view={view} onPortal={onPortal} />
      <CrystalActor view={view} />
      <CueGlyph view={view} />
      <ShiftBanner view={view} />
      {!hc && <Motes count={70} area={[9, 6, 6]} color="#ffe3a3" size={0.06} speed={0.12} />}
      <ParticleBurst
        ref={(h) => {
          burstRef.current = h;
        }}
        max={260}
        size={0.1}
      />
      <GameEffects bloom={soft ? 0.85 : 1.1} threshold={soft ? 0.42 : 0.35} />
    </>
  );
}

function CameraRig() {
  const { camera, size } = useThree();
  const ctx = useGame();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const halfV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(9, 2.45 / (halfV * aspect), 3.2 / halfV);
    const sway = ctx.settings.reducedMotion ? 0 : Math.sin(t.current * 0.12) * 0.35;
    cam.position.set(sway, 1.6, dist);
    cam.lookAt(0, 0.9, 0);
  });
  return null;
}

function Temple() {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const soft = ctx.settings.soft;
  const pillars = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (const x of [-3.6, -2.2, 2.2, 3.6]) out.push([x, -4.5]);
    for (const x of [-4.4, 4.4]) out.push([x, -1.5]);
    return out;
  }, []);
  const shaft = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: sharedTime },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float a = edge * smoothstep(0.0, 1.0, vUv.y) * 0.16 * (0.8 + 0.2 * sin(uTime * 0.4 + vUv.x * 6.0));
          gl_FragColor = vec4(vec3(0.85, 0.8, 1.0), a); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const windowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec3 vW; void main(){
          float h = clamp((vW.y + 1.8) / 6.5, 0.0, 1.0);
          vec3 col = mix(vec3(0.16, 0.1, 0.34), vec3(0.55, 0.42, 0.85), h);
          col += vec3(1.0, 0.85, 0.7) * pow(h, 5.0) * 0.35;
          gl_FragColor = vec4(col * 0.55, 1.0); }`,
      }),
    [],
  );
  return (
    <group>
      {/* back wall */}
      <mesh position={[0, 3, -6]}>
        <planeGeometry args={[30, 16]} />
        <meshStandardMaterial color="#1a1433" emissive="#0d0a22" roughness={0.9} />
      </mesh>
      {/* arched window */}
      <group position={[0, 0, -5.9]}>
        <mesh position={[0, 3.2, 0]} material={windowMat}>
          <circleGeometry args={[1.5, 48, 0, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.7, 0]} material={windowMat}>
          <planeGeometry args={[3, 5]} />
        </mesh>
        <mesh position={[0, 3.2, 0.01]}>
          <torusGeometry args={[1.5, 0.03, 6, 48, Math.PI]} />
          <meshBasicMaterial color={hc ? '#ffffff' : '#c7b2ff'} transparent opacity={0.8} />
        </mesh>
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 0.7, 0.01]}>
            <boxGeometry args={[0.06, 5, 0.02]} />
            <meshBasicMaterial color={hc ? '#ffffff' : '#c7b2ff'} transparent opacity={0.8} />
          </mesh>
        ))}
      </group>
      <sprite position={[0, 3, -5.7]} scale={[8, 8, 1]}>
        <spriteMaterial map={softDotTexture()} color="#b79cff" transparent opacity={hc ? 0.15 : 0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {!hc &&
        [-0.9, 0.2, 1.1].map((x, i) => (
          <mesh key={i} position={[x * 0.9, 2.6, -3.2]} rotation={[0.35, 0, 0.18 - i * 0.14]} material={shaft}>
            <planeGeometry args={[1.3, 9]} />
          </mesh>
        ))}
      {pillars.map(([x, z], i) =>
        soft ? (
          <SoftPillar key={i} x={x} z={z} />
        ) : (
        <group key={i} position={[x, 1.5, z]}>
          <mesh>
            <cylinderGeometry args={[0.32, 0.36, 7, 8]} />
            <meshStandardMaterial color="#2a2250" emissive="#140f30" roughness={0.6} metalness={0.2} flatShading />
          </mesh>
          <mesh position={[0, -3.35, 0]}>
            <boxGeometry args={[0.95, 0.3, 0.95]} />
            <meshStandardMaterial color="#332a60" roughness={0.6} flatShading />
          </mesh>
          <mesh position={[0.33, 0, 0.12]}>
            <boxGeometry args={[0.025, 6.6, 0.025]} />
            <meshBasicMaterial color={hc ? '#ffffff' : '#9f86ff'} transparent opacity={0.6} />
          </mesh>
        </group>
        ),
      )}
      {/* hanging crystal lamps */}
      {[-2.1, 2.1].map((x, i) => (
        <group key={i} position={[x, 4.1, -3]}>
          <mesh>
            <octahedronGeometry args={[0.2, 0]} />
            <meshBasicMaterial color="#fff1c8" />
          </mesh>
          <sprite scale={[1.4, 1.4, 1]}>
            <spriteMaterial map={softDotTexture()} color="#ffd68a" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
    </group>
  );
}

function Floor({ view }: { view: View }) {
  const ctx = useGame();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: sharedTime,
          uFlare: { value: new THREE.Vector2() },
          uPX: { value: PORTAL_X },
          uHC: { value: 0 },
        },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform float uTime; uniform vec2 uFlare; uniform float uPX; uniform float uHC; varying vec3 vW;
          vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
          float vein(vec2 p){ float v = sin(p.x * 1.7 + sin(p.y * 2.3) * 1.4 + sin(p.x * 0.7 + p.y * 3.1) * 0.8); return pow(1.0 - abs(v), 14.0); }
          void main(){
            vec2 p = vW.xz;
            vec3 base = vec3(0.07, 0.055, 0.14);
            base += vec3(0.25, 0.2, 0.45) * vein(p * 1.3) * 0.18;
            base += vec3(0.2, 0.18, 0.35) * vein(p.yx * 2.1 + 3.0) * 0.08;
            // tiles
            vec2 g = abs(fract(p * 0.5) - 0.5);
            base += vec3(0.25, 0.2, 0.5) * (1.0 - smoothstep(0.0, 0.015, min(g.x, g.y))) * 0.35;
            float d = length(p - vec2(0.0, 0.7));
            base += vec3(0.45, 0.35, 0.8) * exp(-d * d * 0.5) * 0.35;
            // reflections of portals
            for (int i = 0; i < 2; i++) {
              float sx = i == 0 ? -uPX : uPX;
              vec3 pc = i == 0 ? vec3(0.65, 0.55, 1.0) : vec3(0.37, 0.95, 0.84);
              float dd = length((p - vec2(sx, 0.2)) * vec2(1.4, 0.8));
              float fl = i == 0 ? uFlare.x : uFlare.y;
              base += pc * exp(-dd * dd * 1.6) * (0.22 + fl * 0.5);
              // rainbow caustics
              float c = sin(p.x * 9.0 + uTime * 1.3) * sin(p.y * 11.0 - uTime * 1.1) + sin((p.x + p.y) * 7.0 + uTime);
              base += hue(fract(p.x * 0.4 + p.y * 0.3 + uTime * 0.05)) * smoothstep(0.9, 1.6, c) * exp(-dd * dd * 0.8) * fl * 0.9;
            }
            float fade = smoothstep(14.0, 4.0, length(p));
            gl_FragColor = vec4(mix(base, base * 0.6, uHC) * fade, 1.0);
          }`,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.uFlare.value.set(view.flash[0], view.flash[1]);
    mat.uniforms.uHC.value = ctx.settings.highContrast ? 1 : 0;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]} material={mat}>
      <planeGeometry args={[30, 30]} />
    </mesh>
  );
}

/** Soft look: matte clay column on a rounded plinth, carved from the temple's own violet. */
function SoftPillar({ x, z }: { x: number; z: number }) {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg2;
  const parts = useMemo(
    () => ({
      shaft: new THREE.CylinderGeometry(0.32, 0.36, 7, 24),
      plinth: new RoundedBoxGeometry(0.95, 0.3, 0.95, 3, 0.1),
      mat: clay(shade(bg, 0.16), { roughness: 0.92 }),
      plinthMat: clay(shade(bg, 0.24), { roughness: 0.92 }),
    }),
    [bg],
  );
  return (
    <group position={[x, 1.5, z]}>
      <mesh geometry={parts.shaft} material={parts.mat} />
      <mesh position={[0, -3.35, 0]} geometry={parts.plinth} material={parts.plinthMat} />
    </group>
  );
}

/** Soft look: the crystal rests on a two-tier rounded clay plinth. */
function SoftPedestal() {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg2;
  const parts = useMemo(
    () => ({
      low: puckGeometry(0.72, 0.4, 0.14, 48),
      top: puckGeometry(0.56, 0.08, 0.04, 48),
      lowMat: clay(shade(bg, 0.4)),
      topMat: clay(shade(bg, 0.5)),
    }),
    [bg],
  );
  return (
    <group position={[REST[0], FLOOR_Y, REST[2]]}>
      <mesh geometry={parts.low} material={parts.lowMat} />
      <mesh position={[0, 0.39, 0]} geometry={parts.top} material={parts.topMat} />
      <mesh position={[0, 0.475, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.36, 0.42, 48]} />
        <meshBasicMaterial color="#ffe3a3" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Pedestal() {
  const ctx = useGame();
  if (ctx.settings.soft) return <SoftPedestal />;
  return (
    <group position={[REST[0], FLOOR_Y, REST[2]]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.62, 0.72, 0.4, 8]} />
        <meshStandardMaterial color="#3a2f6e" emissive="#16103a" roughness={0.45} metalness={0.3} flatShading />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.06, 8]} />
        <meshStandardMaterial color="#5a4a9e" emissive="#2a1f66" roughness={0.3} metalness={0.4} flatShading />
      </mesh>
      <mesh position={[0, 0.455, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.36, 0.42, 48]} />
        <meshBasicMaterial color="#ffe3a3" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Portal({ side, view, onPortal }: { side: 0 | 1; view: View; onPortal: (s: 0 | 1) => void }) {
  const ctx = useGame();
  const x = side ? PORTAL_X : -PORTAL_X;
  const color = PORTAL_COLORS[side];
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const exGrp = useRef<THREE.Group>(null);
  const markRef = useRef<THREE.Sprite>(null);
  const hintRef = useRef<THREE.Sprite>(null);
  const disc = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: sharedTime, uColor: { value: new THREE.Color(color) }, uFlash: { value: 0 }, uDim: { value: 0 }, uDir: { value: side ? -1 : 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uFlash; uniform float uDim; uniform float uDir; varying vec2 vUv;
          void main(){
            vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
            float a = atan(p.y, p.x);
            float sw = sin(a * 3.0 + uDir * (r * 7.0 - uTime * 1.2)) * 0.5 + 0.5;
            float core = exp(-r * r * 3.0);
            vec3 col = uColor * (0.18 + sw * 0.22 * r) + vec3(1.0) * core * 0.12;
            col += mix(uColor, vec3(1.0), 0.5) * uFlash * (0.6 * core + 0.4 * sw);
            col *= 1.0 - uDim * 0.7;
            float alpha = smoothstep(1.0, 0.8, r);
            gl_FragColor = vec4(col * alpha, alpha);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color, side],
  );
  const markTexOk = useMemo(() => glyphTexture('✓', '#ffffff'), []);
  const markTexNo = useMemo(() => glyphTexture('↺', '#d9d2ff'), []);
  const hintTex = useMemo(() => glyphTexture(side ? '▶' : '◀', '#ffffff'), [side]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    view.flash[side] = Math.max(0, view.flash[side] - dt * 1.3);
    view.dim[side] = Math.max(0, view.dim[side] - dt * 1.4);
    const f = view.flash[side];
    const d = view.dim[side];
    disc.uniforms.uFlash.value = f;
    disc.uniforms.uDim.value = d;
    const hc = ctx.settings.highContrast;
    if (ringMat.current) {
      ringMat.current.color.set(hc ? '#ffffff' : color);
      ringMat.current.opacity = (0.85 + f * 0.15) * (1 - d * 0.6);
    }
    if (halo.current) {
      (halo.current.material as THREE.SpriteMaterial).opacity = (0.28 + f * 0.7) * (1 - d * 0.7);
      const s = 2.6 + f * 1.4;
      halo.current.scale.set(s, s, 1);
    }
    if (exGrp.current && !ctx.settings.reducedMotion) exGrp.current.position.y = Math.sin(t.current * 1.2 + side * 2) * 0.05;
    const m = markRef.current;
    if (m) {
      const mt = (ctx.time() - view.mark.t0) / 1000;
      const on = view.mark.side === side && mt < 0.9;
      m.visible = on;
      if (on) {
        const sm = m.material as THREE.SpriteMaterial;
        sm.map = view.mark.ok ? markTexOk : markTexNo;
        sm.opacity = mt < 0.6 ? 1 : 1 - (mt - 0.6) / 0.3;
        m.position.y = PORTAL_Y + PORTAL_R + 0.3 + (ctx.settings.reducedMotion ? 0 : mt * 0.2);
      }
    }
    if (hintRef.current) hintRef.current.visible = ctx.settings.showKeyHints;
  });
  return (
    <group>
      <group position={[x, PORTAL_Y, 0]}>
        <sprite ref={halo} scale={[2.6, 2.6, 1]} position={[0, 0, -0.1]}>
          <spriteMaterial map={softDotTexture()} color={color} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <mesh material={disc}>
          <circleGeometry args={[PORTAL_R, 48]} />
        </mesh>
        {ctx.settings.soft && <SoftPortalFrame />}
        <mesh>
          <torusGeometry args={[PORTAL_R, 0.045, 10, 72]} />
          <meshBasicMaterial ref={ringMat} color={color} transparent />
        </mesh>
        <mesh rotation-z={Math.PI / 4}>
          <torusGeometry args={[PORTAL_R + 0.13, 0.012, 6, 4]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <group ref={exGrp} position={[0, 0, 0.25]}>
          <Crystal key={view.exKey} spec={view.examples[side]} scale={0.74} spin={0.35} />
        </group>
        <Beams side={side} view={view} />
        <sprite ref={hintRef} position={[0, -PORTAL_R - 0.32, 0.2]} scale={[0.36, 0.36, 1]}>
          <spriteMaterial map={hintTex} transparent depthTest={false} opacity={0.8} />
        </sprite>
        <mesh
          onPointerDown={(e) => {
            e.stopPropagation();
            onPortal(side);
          }}
        >
          <circleGeometry args={[PORTAL_R + 0.3, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
      <sprite ref={markRef} position={[x, PORTAL_Y + PORTAL_R + 0.3, 0.3]} scale={[0.45, 0.45, 1]} visible={false}>
        <spriteMaterial map={markTexOk} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

/** Soft look: a thick matte clay rim the portal is set into (the coloured ring stays on top of it). */
function SoftPortalFrame() {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg2;
  const parts = useMemo(() => ({ geo: new THREE.TorusGeometry(PORTAL_R + 0.16, 0.12, 16, 72), mat: clay(shade(bg, 0.46)) }), [bg]);
  return <mesh geometry={parts.geo} material={parts.mat} position={[0, 0, -0.1]} />;
}

function Beams({ side, view }: { side: number; view: View }) {
  const ctx = useGame();
  const n = 7;
  const mats = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const c = new THREE.Color().setHSL(i / n, 0.9, 0.65);
        return new THREE.ShaderMaterial({
          uniforms: { uColor: { value: c }, uA: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){
            float e = 1.0 - abs(vUv.x - 0.5) * 2.0; float a = pow(e, 2.0) * (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y) * uA;
            gl_FragColor = vec4(uColor, a); }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
      }),
    [],
  );
  const grp = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = (ctx.time() - view.beamT0[side]) / 1000;
    const on = t >= 0 && t < 1.2 && ctx.settings.flashIntensity !== 'none';
    if (grp.current) {
      grp.current.visible = on;
      const len = ctx.settings.reducedMotion ? 1 : easeOutCubic(clamp(t / 0.35, 0, 1));
      grp.current.scale.set(1, len, 1);
    }
    const a = on ? (1 - t / 1.2) * (ctx.settings.flashIntensity === 'reduced' ? 0.4 : 0.8) : 0;
    for (const m of mats) m.uniforms.uA.value = a;
  });
  const dir = side ? 1 : -1;
  const beamGeo = useMemo(() => new THREE.PlaneGeometry(0.3, 3.2).translate(0, 1.6, 0), []);
  return (
    <group ref={grp} visible={false}>
      {mats.map((m, i) => (
        <mesh key={i} material={m} geometry={beamGeo} rotation-z={-dir * (0.25 + (i / (n - 1)) * 1.7)} position={[0, 0, -0.05]} />
      ))}
    </group>
  );
}

function CrystalActor({ view }: { view: View }) {
  const ctx = useGame();
  const grp = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const refl = useRef<THREE.Sprite>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const a = view.anim;
    const t = clamp((ctx.time() - a.t0) / a.dur, 0, 1);
    const rm = ctx.settings.reducedMotion;
    let s = 1;
    v.set(REST[0], REST[1], REST[2]);
    let rz = 0;
    const px = a.side ? PORTAL_X : -PORTAL_X;
    if (a.kind === 'drop') {
      if (rm) s = t;
      else {
        const e = 1 - Math.pow(1 - t, 3);
        v.y = REST[1] + (1 - e) * 2.4;
        s = 0.4 + 0.6 * Math.min(1, t * 2);
      }
    } else if (a.kind === 'fly') {
      if (rm) s = 1 - t;
      else {
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        const cx = px * 0.4;
        const cy = PORTAL_Y + 1.1;
        v.x = u * u * REST[0] + 2 * u * e * cx + e * e * px;
        v.y = u * u * REST[1] + 2 * u * e * cy + e * e * PORTAL_Y;
        v.z = u * u * REST[2] + 2 * u * e * 0.9 + e * e * 0.2;
        s = 1 - e * 0.8;
        if (t >= 1) s = 0;
      }
    } else if (a.kind === 'bounce') {
      if (rm) {
        s = 1 - t;
        v.x = REST[0] + (a.side ? 0.15 : -0.15) * Math.sin(t * 20) * (1 - t);
      } else if (t < 0.42) {
        const e = t / 0.42;
        const k = e * e * (3 - 2 * e) * 0.8;
        const u = 1 - k;
        v.x = u * REST[0] + k * px;
        v.y = u * REST[1] + k * PORTAL_Y + Math.sin(e * Math.PI) * 0.6;
        v.z = u * REST[2] + k * 0.3;
      } else {
        const e = (t - 0.42) / 0.58;
        const sx = px * 0.8;
        const sy = REST[1] + (PORTAL_Y - REST[1]) * 0.8 + 0.0;
        v.x = sx - (a.side ? 1 : -1) * e * 0.9;
        v.y = sy + e * 0.9 - e * e * (sy - FLOOR_Y + 1.2);
        v.z = 0.3 + e * 0.5;
        rz = e * 4 * (a.side ? 1 : -1);
        s = e > 0.7 ? 1 - (e - 0.7) / 0.3 : 1;
      }
    }
    g.position.copy(v);
    g.rotation.z = rz;
    g.scale.setScalar(Math.max(0.0001, s));
    g.visible = !!view.crystal && s > 0.001;
    if (halo.current) {
      halo.current.position.copy(v);
      halo.current.position.z -= 0.3;
      halo.current.visible = g.visible;
      halo.current.scale.setScalar(2.2 * s);
    }
    if (refl.current) {
      refl.current.visible = g.visible;
      refl.current.position.set(v.x, FLOOR_Y + 0.02, v.z);
      (refl.current.material as THREE.SpriteMaterial).opacity = 0.35 * s * clamp(1 - (v.y - REST[1]) * 0.4, 0, 1);
    }
  });
  const color = view.crystal ? PATTERN_COLORS[view.crystal[2]] : '#ffffff';
  return (
    <>
      <sprite ref={halo} scale={[2.2, 2.2, 1]}>
        <spriteMaterial map={softDotTexture()} color={color} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={refl} scale={[1.6, 0.5, 1]}>
        <spriteMaterial map={softDotTexture()} color={color} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group ref={grp}>{view.crystal && <Crystal key={view.crystalKey} spec={view.crystal} scale={1.05} spin={0.6} />}</group>
    </>
  );
}

function glyphTexture(ch: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 88px "Geist Variable", system-ui, sans-serif';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(10,8,24,0.8)';
  g.strokeText(ch, 64, 68);
  g.fillStyle = color;
  g.fillText(ch, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rule glyph: icon + word for shape / count / pattern / tilt. */
function cueTexture(dim: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(14,10,36,0.82)';
  g.strokeStyle = '#ffe3a3';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 8);
  g.lineTo(248, 128);
  g.lineTo(128, 248);
  g.lineTo(8, 128);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = 7;
  const cy = 108;
  if (dim === 0) {
    g.beginPath();
    g.moveTo(62, cy + 22);
    g.lineTo(86, cy - 22);
    g.lineTo(110, cy + 22);
    g.closePath();
    g.stroke();
    g.strokeRect(118, cy - 20, 38, 40);
    g.beginPath();
    g.moveTo(186, cy - 26);
    g.lineTo(206, cy);
    g.lineTo(186, cy + 26);
    g.lineTo(166, cy);
    g.closePath();
    g.stroke();
  } else if (dim === 1) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(88 + i * 40, cy, 13, 0, Math.PI * 2);
      g.fill();
    }
  } else if (dim === 2) {
    g.save();
    g.beginPath();
    g.arc(128, cy, 34, 0, Math.PI * 2);
    g.stroke();
    g.clip();
    g.lineWidth = 8;
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(90 + i * 18, cy + 40);
      g.lineTo(130 + i * 18, cy - 40);
      g.stroke();
    }
    g.restore();
  } else {
    g.beginPath();
    g.moveTo(96, cy + 26);
    g.lineTo(96, cy - 26);
    g.stroke();
    g.beginPath();
    g.moveTo(144, cy + 24);
    g.lineTo(176, cy - 24);
    g.stroke();
    g.beginPath();
    g.arc(128, cy + 30, 22, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  g.font = '800 30px "Geist Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(DIM_NAMES[dim].toUpperCase(), 128, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function CueGlyph({ view }: { view: View }) {
  const ctx = useGame();
  const texs = useMemo(() => [0, 1, 2, 3].map(cueTexture), []);
  const ref = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const shown = useRef(0);
  useFrame((state, dt) => {
    const s = ref.current;
    if (!s) return;
    const on = view.cue >= 0;
    shown.current += ((on ? 1 : 0) - shown.current) * damp(8, dt);
    if (on) (s.material as THREE.SpriteMaterial).map = texs[view.cue];
    const k = shown.current;
    s.visible = k > 0.02;
    const bob = ctx.settings.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.5) * 0.04;
    s.position.y = 1.55 + bob;
    s.scale.set(1.05 * k, 1.05 * k, 1);
    (s.material as THREE.SpriteMaterial).opacity = k;
    if (halo.current) {
      halo.current.visible = s.visible;
      (halo.current.material as THREE.SpriteMaterial).opacity = 0.45 * k;
    }
  });
  return (
    <>
      <sprite ref={halo} position={[0, 1.55, 0.2]} scale={[2, 2, 1]}>
        <spriteMaterial map={softDotTexture()} color="#ffe3a3" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={ref} position={[0, 1.55, 0.4]} visible={false} renderOrder={5}>
        <spriteMaterial map={texs[0]} transparent depthTest={false} />
      </sprite>
    </>
  );
}

function ShiftBanner({ view }: { view: View }) {
  const ctx = useGame();
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 58px "Geist Variable", system-ui, sans-serif';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(12,8,30,0.85)';
    g.strokeText('✦ Shift spotted! ✦', 256, 66);
    const grd = g.createLinearGradient(40, 0, 470, 0);
    grd.addColorStop(0, '#9ff4ff');
    grd.addColorStop(0.5, '#ffe3a3');
    grd.addColorStop(1, '#ffadd9');
    g.fillStyle = grd;
    g.fillText('✦ Shift spotted! ✦', 256, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    const s = ref.current;
    if (!s) return;
    const t = (ctx.time() - view.shiftT0) / 1000;
    const on = t >= 0 && t < 2;
    s.visible = on;
    if (!on) return;
    const pop = ctx.settings.reducedMotion ? 1 : Math.min(1, 0.6 + t * 3);
    s.scale.set(3.4 * pop, 0.85 * pop, 1);
    s.position.y = 2.75 + (ctx.settings.reducedMotion ? 0 : t * 0.1);
    (s.material as THREE.SpriteMaterial).opacity = t < 1.5 ? 1 : 1 - (t - 1.5) / 0.5;
  });
  return (
    <sprite ref={ref} position={[0, 2.75, 0.8]} visible={false} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  );
}
