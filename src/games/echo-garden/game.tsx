import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { damp } from '@/sdk';
import { mountR3F, useGame, GameEffects, Motes, GradientSky, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { levelDef, makeSequence, scoreFor, SLOTS, SLOT_ORDER } from './logic';
import { clay, puckGeometry, shade } from './soft';

const FLOWER_COLORS = ['#b99cff', '#6fe3ff', '#ffb3d1', '#ffe08a', '#8dffc4', '#ff9f7a', '#9fb4ff', '#f7a8ff', '#a8fff0'];
const HC_COLOR = '#ffffff';

/** Mutable view-model shared between game logic and the R3F scene. */
class View {
  flowers = 0;
  slots: number[] = [...SLOT_ORDER];
  pulse = new Float32Array(9);
  wilt = new Float32Array(9);
  ripples: Array<{ i: number; t: number }> = [];
  sprouts: Array<{ x: number; z: number; c: string; born: number }> = [];
  reverse = false;
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
  const stair = ctx.staircase({ min: 1, max: 12, up: 1, down: 1 });
  if (preview) stair.set(2);
  const note = ctx.audio.scale(60, 'majorPenta');
  const burstRef: { current: BurstHandle | null } = { current: null };

  let alive = true;
  let score = 0;
  let trials = 0;
  let lives = 3;
  let taps = 0;
  let correctTaps = 0;
  let longest = 0;
  let longestReverse = 0;
  let stopAmbient: (() => void) | null = null;

  // Input phase state
  let accepting = false;
  let expected: number[] = [];
  let progress = 0;
  let resolveInput: ((ok: boolean) => void) | null = null;
  let replayed = false;
  let currentSeq: number[] = [];
  let currentStep = 600;

  const flowerPos = (i: number) => {
    const [x, z] = SLOTS[view.slots[i]];
    return new THREE.Vector3(x, 0.95, z);
  };

  function bloom(i: number, strong = 1) {
    view.pulse[i] = strong;
    const f = note(i);
    ctx.audio.pluck(f, { gain: 0.2, pan: SLOTS[view.slots[i]][0] / 3 });
    ctx.audio.chime(f * 2, { gain: 0.05, dur: 0.8 });
  }

  function tap(i: number) {
    if (!accepting || i >= view.flowers) return;
    view.ripples.push({ i, t: 0 });
    taps++;
    const want = expected[progress];
    if (i === want) {
      correctTaps++;
      bloom(i);
      ctx.haptics.tick();
      progress++;
      if (progress >= expected.length) {
        accepting = false;
        resolveInput?.(true);
      }
    } else {
      accepting = false;
      view.wilt[i] = 1;
      ctx.audio.thunk({ gain: 0.25 });
      ctx.haptics.error();
      ctx.caption('Wrong flower');
      ctx.after(450, () => {
        view.pulse[want] = 0.8;
        ctx.audio.chime(note(want), { gain: 0.08 });
      });
      resolveInput?.(false);
    }
  }

  async function playSequence(seq: number[], stepMs: number) {
    accepting = false;
    setReplayVisible(false);
    for (const i of seq) {
      if (!alive) return;
      bloom(i, 1);
      await ctx.wait(stepMs);
    }
  }

  function waitForInput(exp: number[]): Promise<boolean> {
    expected = exp;
    progress = 0;
    accepting = true;
    setReplayVisible(!preview && !replayed);
    return new Promise((res) => {
      resolveInput = (ok) => {
        resolveInput = null;
        setReplayVisible(false);
        res(ok);
      };
    });
  }

  async function ghost(exp: number[]) {
    for (let k = 0; k < exp.length; k++) {
      await ctx.wait(380 + rng.next() * 260);
      if (!accepting) return;
      const wrong = rng.chance(0.06);
      tap(wrong ? (exp[progress] + 1) % view.flowers : exp[progress]);
    }
  }

  async function replay() {
    if (!accepting || replayed || preview) return;
    replayed = true;
    accepting = false;
    await playSequence(currentSeq, currentStep);
    progress = 0;
    accepting = true;
  }

  function setFlowers(n: number) {
    if (n === view.flowers) return;
    view.flowers = n;
    view.bump();
  }

  function addSprout() {
    const a = rng.next() * Math.PI * 2;
    const r = 3.2 + rng.next() * 1.6;
    view.sprouts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r - 0.5, c: rng.pick(FLOWER_COLORS), born: ctx.time() });
    if (view.sprouts.length > 40) view.sprouts.shift();
    view.bump();
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      lives,
      maxLives: 3,
      progress: trials / 12,
      label: view.reverse ? '↺ Reverse' : undefined,
    });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([48, 55, 62, 67], { gain: 0.05, brightness: 0.3 });
    await ctx.wait(500);
    while (alive) {
      const def = levelDef(stair.level);
      setFlowers(def.flowers);
      if (def.wind && trials > 0) {
        rng.shuffle(view.slots);
        view.bump();
        ctx.audio.noise({ dur: 0.8, filter: 500, sweepTo: 1500, gain: 0.06 });
        await ctx.wait(900);
      }
      const reverse = rng.chance(def.reverseChance);
      view.reverse = reverse;
      replayed = false;
      hud();
      const seq = makeSequence(rng, def.length, def.flowers);
      currentSeq = seq;
      currentStep = def.stepMs * ctx.settings.timingMultiplier;
      if (reverse) ctx.caption('Reverse: sing it backwards');
      await ctx.wait(reverse ? 1100 : 700);
      await playSequence(seq, currentStep);
      if (!alive) return;
      const exp = reverse ? [...seq].reverse() : seq;
      ctx.announce(`Your turn: ${seq.length} notes${reverse ? ', backwards' : ''}`);
      const inputP = waitForInput(exp);
      if (preview) void ghost(exp);
      const ok = await inputP;
      if (!alive) return;
      trials++;
      ctx.trial({ correct: ok, level: stair.level });
      if (ok) {
        score += scoreFor(seq.length, reverse, replayed);
        longest = Math.max(longest, seq.length);
        if (reverse) longestReverse = Math.max(longestReverse, seq.length);
        ctx.audio.success();
        ctx.haptics.success();
        for (let i = 0; i < view.flowers; i++) view.pulse[i] = Math.max(view.pulse[i], 0.6);
        burstRef.current?.burst([0, 1.2, 0], 60, { color: '#ffe8a8', speed: 3, life: 1.4, gravity: -0.4 });
        addSprout();
      } else {
        lives--;
      }
      stair.record(ok);
      if (preview && stair.level > 4) stair.set(2);
      hud();
      if (!preview && lives <= 0 && trials < 12 && (await ctx.revive())) {
        if (!alive) return;
        lives = 1;
        hud();
        ctx.audio.success();
        ctx.haptics.success();
        ctx.caption('Second chance!');
        ctx.announce('Second chance! One life restored');
        for (let i = 0; i < view.flowers; i++) view.pulse[i] = Math.max(view.pulse[i], 0.8);
        burstRef.current?.burst([0, 1.2, 0], 50, { color: '#ffe8a8', speed: 2.5, life: 1.2, gravity: -0.4 });
      }
      if (!alive) return;
      if (!preview && (lives <= 0 || trials >= 12)) {
        await ctx.wait(900);
        const acc = taps ? Math.round((correctTaps / taps) * 100) : 0;
        ctx.end({
          score,
          levelReached: longest,
          stats: { longest, longestReverse, accuracy: acc },
          message: longest >= 7 ? 'A beautiful long song.' : 'The garden grows with every song.',
        });
        return;
      }
      await ctx.wait(ok ? 900 : 1300);
    }
  }

  // DOM "hear again" button (play mode only)
  const replayBtn = document.createElement('button');
  replayBtn.className = 'u-game-btn';
  replayBtn.textContent = '↻ Hear again';
  replayBtn.style.cssText = 'position:absolute;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;';
  replayBtn.onclick = () => void replay();
  if (!preview) ctx.container.appendChild(replayBtn);
  function setReplayVisible(v: boolean) {
    replayBtn.style.display = v ? 'block' : 'none';
  }

  const keyMap: Record<string, () => void> = { KeyR: () => void replay() };
  for (let i = 0; i < 9; i++) {
    keyMap[`Digit${i + 1}`] = () => tap(i);
    keyMap[`Numpad${i + 1}`] = () => tap(i);
  }
  ctx.keys(keyMap);

  const unmount = mountR3F(ctx, <Scene view={view} onTap={tap} burstRef={burstRef} flowerPos={flowerPos} />, {
    camera: { position: [0, 6.5, 8.5], fov: 45 },
    background: ctx.manifest.palette.bg,
  });

  return {
    start() {
      void run();
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      unmount();
      replayBtn.remove();
    },
  };
}

// ---------------------------------------------------------------- Scene

function Scene({
  view,
  onTap,
  burstRef,
}: {
  view: View;
  onTap: (i: number) => void;
  burstRef: { current: BurstHandle | null };
  flowerPos: (i: number) => THREE.Vector3;
}) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const pal = ctx.manifest.palette;
  const soft = ctx.settings.soft;
  return (
    <>
      <CameraRig />
      <fog attach="fog" args={['#1c1646', soft ? 16 : 11, soft ? 34 : 26]} />
      <GradientSky top={pal.bg} bottom="#3b2a74" />
      {soft ? (
        <>
          {/* Soft clay: even sky fill + one gentle key from the top-left, no harsh rim. */}
          <ambientLight intensity={0.3} color="#9a9cff" />
          <hemisphereLight args={['#b4b2f2', '#0b0d1f', 1.1]} />
          <directionalLight position={[-5, 7, 3]} intensity={1.3} color="#e6e8ff" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.25} color="#8a8cff" />
          <hemisphereLight args={['#6b6bd6', '#0b0d1f', 0.5]} />
          <directionalLight position={[-4, 8, 3]} intensity={0.9} color="#c9d4ff" />
        </>
      )}
      <Moon view={view} />
      <Ground />
      <Grass />
      {Array.from({ length: view.flowers }, (_, i) => (
        <Flower key={i} index={i} view={view} onTap={onTap} />
      ))}
      <Ripples view={view} />
      {view.sprouts.map((s, k) => (
        <Sprout key={k} {...s} />
      ))}
      <Motes count={90} area={[12, 4, 10]} color={pal.highlight} size={0.07} />
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={300} size={0.1} />
      <GameEffects bloom={soft ? 0.75 : 1.1} threshold={soft ? 0.35 : 0.25} />
    </>
  );
}

function CameraRig() {
  const { camera, size } = useThree();
  const ctx = useGame();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const aspect = size.width / size.height;
    const cam = camera as THREE.PerspectiveCamera;
    const halfV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitW = 5.6; // world units that must fit horizontally
    const dist = Math.max(9.5, fitW / 2 / (halfV * aspect));
    const sway = ctx.settings.reducedMotion ? 0 : Math.sin(t.current * 0.15) * 0.12;
    const dir = new THREE.Vector3(Math.sin(sway), 1.05, Math.cos(sway) * 0.75).normalize();
    cam.position.copy(dir.multiplyScalar(dist));
    cam.lookAt(0, 0.4, 0.5);
  });
  return null;
}

function Moon({ view }: { view: View }) {
  const ctx = useGame();
  const mat = useRef<THREE.SpriteMaterial>(null);
  const tex = softDotTexture();
  useFrame((_, dt) => {
    if (!mat.current) return;
    const target = new THREE.Color(view.reverse ? ctx.manifest.palette.accent2 : ctx.manifest.palette.highlight);
    mat.current.color.lerp(target, damp(3, dt));
  });
  return (
    <group position={[-3.5, 6, -12]}>
      <mesh>
        <sphereGeometry args={[0.9, 32, 16]} />
        <meshBasicMaterial color="#fff6dc" />
      </mesh>
      <sprite scale={[7, 7, 1]}>
        <spriteMaterial ref={mat} map={tex} color={ctx.manifest.palette.highlight} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

function Ground() {
  const ctx = useGame();
  if (ctx.settings.soft) return <SoftGround />;
  return <ShaderGround />;
}

/** Soft look: the garden is a matte clay plate pressed out of the night, with a rounded rim. */
function SoftGround() {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg;
  const geo = useMemo(() => puckGeometry(7.2, 0.35, 0.3, 72), []);
  const mat = useMemo(() => clay(shade(bg, 0.2), { roughness: 0.95 }), [bg]);
  return <mesh geometry={geo} material={mat} position={[0, -0.34, 0]} />;
}

function ShaderGround() {
  const ctx = useGame();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { c1: { value: new THREE.Color('#2c2468') }, c2: { value: new THREE.Color(ctx.manifest.palette.bg) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 c1; uniform vec3 c2; varying vec2 vUv;
          void main(){ float d = distance(vUv, vec2(0.5)) * 2.0; vec3 col = mix(c1, c2, smoothstep(0.0, 1.0, d));
          gl_FragColor = vec4(col, 1.0 - smoothstep(0.85, 1.0, d)); }`,
      }),
    [ctx.manifest.palette.bg],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} material={mat}>
      <circleGeometry args={[9, 64]} />
    </mesh>
  );
}

function Grass() {
  const ctx = useGame();
  const count = Math.floor(170 * ctx.quality.particleScale) + 40;
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.05, 0.3, 4);
    g.translate(0, 0.15, 0);
    return g;
  }, []);
  const setRef = (m: THREE.InstancedMesh | null) => {
    (ref as { current: THREE.InstancedMesh | null }).current = m;
    if (!m) return;
    const o = new THREE.Object3D();
    let s = 1234;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = 1 + r() * 6.5;
      o.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      o.rotation.set((r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4);
      const sc = 0.5 + r() * 1.1;
      o.scale.set(sc, sc, sc);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  };
  return (
    <instancedMesh ref={setRef} args={[geo, undefined, count]}>
      {ctx.settings.soft ? (
        <meshStandardMaterial color="#3b4a68" roughness={1} />
      ) : (
        <meshStandardMaterial color="#1c3f47" emissive="#12303a" emissiveIntensity={0.5} roughness={1} />
      )}
    </instancedMesh>
  );
}

function headGeometry(type: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry) => parts.push(g);
  switch (type) {
    case 0: // lotus
      for (let k = 0; k < 8; k++) {
        const g = new THREE.SphereGeometry(0.2, 12, 8);
        g.scale(0.55, 0.18, 1.3);
        g.translate(0, 0, 0.2);
        g.rotateX(-0.5);
        g.rotateY((k / 8) * Math.PI * 2);
        add(g);
      }
      break;
    case 1: // star
      for (let k = 0; k < 5; k++) {
        const g = new THREE.ConeGeometry(0.1, 0.38, 6);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0, 0.22);
        g.rotateY((k / 5) * Math.PI * 2);
        add(g);
      }
      break;
    case 2: {
      // bell
      const g = new THREE.ConeGeometry(0.3, 0.42, 20, 1, true);
      g.rotateX(Math.PI);
      add(g);
      add(new THREE.SphereGeometry(0.08, 10, 8).translate(0, -0.2, 0));
      break;
    }
    case 3:
      add(new THREE.IcosahedronGeometry(0.28, 0));
      break;
    case 4: // daisy
      for (let k = 0; k < 12; k++) {
        const g = new THREE.BoxGeometry(0.07, 0.025, 0.34);
        g.translate(0, 0, 0.22);
        g.rotateY((k / 12) * Math.PI * 2);
        add(g);
      }
      add(new THREE.SphereGeometry(0.1, 12, 8));
      break;
    case 5: {
      const g = new THREE.OctahedronGeometry(0.26, 0);
      g.scale(1, 1.5, 1);
      add(g);
      break;
    }
    case 6: // tulip
      for (let k = 0; k < 3; k++) {
        const g = new THREE.SphereGeometry(0.18, 12, 10);
        g.scale(0.8, 1.7, 0.45);
        g.translate(0, 0.12, 0.08);
        g.rotateX(0.25);
        g.rotateY((k / 3) * Math.PI * 2);
        add(g);
      }
      break;
    case 7:
      add(new THREE.TorusGeometry(0.22, 0.07, 10, 28));
      break;
    default: {
      const g = new THREE.ConeGeometry(0.17, 0.62, 16);
      g.translate(0, 0.15, 0);
      add(g);
      add(new THREE.TorusGeometry(0.2, 0.03, 8, 24).rotateX(Math.PI / 2));
    }
  }
  return parts;
}

function numberTexture(n: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,10,30,0.7)';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 38px "Geist Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 34);
  return new THREE.CanvasTexture(c);
}

function Flower({ index, view, onTap }: { index: number; view: View; onTap: (i: number) => void }) {
  const ctx = useGame();
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const hint = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const color = ctx.settings.highContrast ? HC_COLOR : FLOWER_COLORS[index];
  const parts = useMemo(() => headGeometry(index), [index]);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.1, flatShading: index === 3 || index === 5 }),
    [color, index],
  );
  const numTex = useMemo(() => numberTexture(index + 1), [index]);
  const bg = ctx.manifest.palette.bg;
  const plinthGeo = useMemo(() => puckGeometry(0.52, 0.2, 0.1, 36), []);
  const plinthMat = useMemo(() => clay(shade(bg, 0.3)), [bg]);
  const pos = useRef(new THREE.Vector3(...slotPos(view, index)));
  const t = useRef(Math.random() * 10);
  const grow = useRef(0);

  useFrame((_, dt) => {
    const g = group.current;
    const h = head.current;
    if (!g || !h) return;
    t.current += dt;
    grow.current = Math.min(1, grow.current + dt * 1.6);
    const target = new THREE.Vector3(...slotPos(view, index));
    pos.current.lerp(target, damp(4, dt));
    g.position.copy(pos.current);
    view.pulse[index] = Math.max(0, view.pulse[index] - dt * 1.6);
    view.wilt[index] = Math.max(0, view.wilt[index] - dt * 1.2);
    const p = view.pulse[index];
    const w = view.wilt[index];
    const reduced = ctx.settings.reducedMotion;
    mat.emissiveIntensity = 0.28 + p * 2.6 - w * 0.25;
    const s = grow.current * (1 + (reduced ? 0 : p * 0.28));
    h.scale.setScalar(s * 1.45);
    if (halo.current) {
      const hm = halo.current.material as THREE.SpriteMaterial;
      hm.opacity = 0.22 + p * 0.85;
      const hs = 1.5 + p * 1.2;
      halo.current.scale.set(hs, hs, 1);
    }
    h.rotation.x = w * 0.9;
    h.rotation.y += dt * (0.2 + p * 2);
    if (!reduced) g.rotation.z = Math.sin(t.current * 0.9 + index) * 0.04;
    if (hint.current) hint.current.visible = ctx.settings.showKeyHints;
  });

  return (
    <group ref={group}>
      {ctx.settings.soft && <mesh geometry={plinthGeo} material={plinthMat} />}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.9, 6]} />
        <meshStandardMaterial color="#2b6b5a" emissive="#12352c" roughness={0.9} />
      </mesh>
      <sprite ref={halo} position={[0, 0.98, 0]} scale={[1.5, 1.5, 1]}>
        <spriteMaterial map={softDotTexture()} color={color} transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group ref={head} position={[0, 0.95, 0]}>
        {parts.map((g, k) => (
          <mesh key={k} geometry={g} material={mat} />
        ))}
      </group>
      <sprite ref={hint} position={[0, 1.55, 0]} scale={[0.36, 0.36, 1]}>
        <spriteMaterial map={numTex} transparent depthTest={false} />
      </sprite>
      {/* generous invisible hit target (≥ 56px on phones) */}
      <mesh
        position={[0, 0.8, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onTap(index);
        }}
      >
        <sphereGeometry args={[0.62, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function slotPos(view: View, index: number): [number, number, number] {
  const [x, z] = SLOTS[view.slots[index]];
  return [x, 0, z];
}

function Ripples({ view }: { view: View }) {
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const mats = useMemo(
    () => Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })),
    [],
  );
  useFrame((_, dt) => {
    view.ripples = view.ripples.filter((r) => (r.t += dt) < 0.7).slice(-6);
    for (let k = 0; k < 6; k++) {
      const m = refs.current[k];
      const r = view.ripples[k];
      if (!m) continue;
      if (!r) {
        mats[k].opacity = 0;
        continue;
      }
      const [x, , z] = slotPos(view, r.i);
      m.position.set(x, 0.03, z);
      const s = 0.3 + r.t * 1.8;
      m.scale.set(s, s, s);
      mats[k].opacity = (1 - r.t / 0.7) * 0.8;
    }
  });
  return (
    <>
      {mats.map((m, k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)} rotation-x={-Math.PI / 2} material={m}>
          <ringGeometry args={[0.8, 0.9, 40]} />
        </mesh>
      ))}
    </>
  );
}

function Sprout({ x, z, c }: { x: number; z: number; c: string; born: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const g = useRef(0);
  useFrame((_, dt) => {
    g.current = Math.min(1, g.current + dt * 0.8);
    ref.current?.scale.setScalar(g.current);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.012, 0.02, 0.4, 5]} />
        <meshStandardMaterial color="#2b6b5a" />
      </mesh>
      <mesh ref={ref} position={[0, 0.42, 0]}>
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}
