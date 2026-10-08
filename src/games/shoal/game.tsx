import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { damp, easeInOutSine } from '@/sdk';
import { mountR3F, useGame, GameEffects, Motes, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { levelDef, makeTrial, fishPos, trialScore, FISH_KEYS, keyText, MAX_FISH, MAX_LEVEL, TRIALS, type Trial } from './logic';
import { clay, shade } from './soft';

/** Pool ellipse radii in world units (portrait). */
const RX = 2.2;
const RY = 3.0;
const GOLD = '#ffd36b';
const FISH_CORE = '#9ffcf0';
const FISH_EDGE = '#1a8ea0';

type Phase = 'idle' | 'tag' | 'fade' | 'track' | 'freeze' | 'reveal';

// ------------------------------------------------------------------ view-model

class View {
  trial: Trial | null = null;
  phase: Phase = 'idle';
  phaseStart = 0; // ctx.time() ms
  trackStart = 0;
  trackMs = 6000;
  /** Flash-out: 1 = normal, lower = dimmed. */
  dim = 1;
  selected = new Uint8Array(MAX_FISH);
  /** 0 none, 1 correct pick, 2 wrong pick, 3 missed target. */
  result = new Uint8Array(MAX_FISH);
  resultAt = new Float32Array(MAX_FISH);
  /** Normalized current positions (written by the scene). */
  nx = new Float32Array(MAX_FISH);
  ny = new Float32Array(MAX_FISH);
  fromX = new Float32Array(MAX_FISH);
  fromY = new Float32Array(MAX_FISH);
  hitR = 0.45;
  labels: string[] = [];
  keyboardUsed = false;
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
  const stair = ctx.staircase({ min: 1, max: MAX_LEVEL, up: 1, down: 1 });
  if (preview) stair.set(4);
  const note = ctx.audio.scale(64, 'majorPenta');
  const burstRef: { current: BurstHandle | null } = { current: null };

  let alive = true;
  let stopAmbient: (() => void) | null = null;
  const cancels: Array<() => void> = [];
  let score = 0;
  let trials = 0;
  let streak = 0;
  let bestStreak = 0;
  let maxTracked = 0;
  let totalHits = 0;
  let totalTagged = 0;

  let accepting = false;
  let need = 0;
  let picks: number[] = [];
  let resolvePicks: (() => void) | null = null;

  // ---------------- DOM prompt
  const prompt = document.createElement('div');
  prompt.className = 'u-game-text';
  prompt.style.cssText = 'bottom:calc(26px + env(safe-area-inset-bottom));font-size:1rem;opacity:0;transition:opacity .4s;padding:0 24px;';
  ctx.container.appendChild(prompt);
  function say(html: string, ms = 0) {
    prompt.innerHTML = html;
    prompt.style.opacity = '1';
    if (ms) cancels.push(ctx.after(ms, () => (prompt.style.opacity = '0')));
  }
  const hush = () => (prompt.style.opacity = '0');

  function setPhase(p: Phase) {
    view.phase = p;
    view.phaseStart = ctx.time();
  }

  function hud(k: number) {
    ctx.hud.set({ score, level: stair.level, progress: trials / TRIALS, label: `Track ${k}` });
  }

  // ---------------- input
  function selectFish(i: number) {
    const tr = view.trial;
    if (!accepting || !tr || i < 0 || i >= tr.count) return;
    if (view.selected[i]) {
      view.selected[i] = 0;
      picks = picks.filter((p) => p !== i);
      ctx.audio.tick();
      ctx.haptics.tick();
      view.bump();
      return;
    }
    view.selected[i] = 1;
    picks.push(i);
    ctx.audio.pluck(note(picks.length + 1), { gain: 0.12, dur: 0.4 });
    ctx.haptics.tick();
    view.bump();
    if (picks.length >= need) {
      accepting = false;
      cancels.push(ctx.after(380, () => resolvePicks?.()));
    }
  }

  function tapAt(wx: number, wy: number) {
    const tr = view.trial;
    if (!accepting || !tr) return;
    let best = -1;
    let bd = view.hitR;
    for (let i = 0; i < tr.count; i++) {
      const d = Math.hypot(view.nx[i] * RX - wx, view.ny[i] * RY - wy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) selectFish(best);
  }

  function assignLabels(tr: Trial) {
    // number fish top-to-bottom, left-to-right so keys are easy to find
    const order = Array.from({ length: tr.count }, (_, i) => i).sort((a, b) => {
      const ra = Math.round(-tr.end[a][1] * RY * 2);
      const rb = Math.round(-tr.end[b][1] * RY * 2);
      return ra !== rb ? ra - rb : tr.end[a][0] - tr.end[b][0];
    });
    view.labels = new Array(tr.count).fill('');
    order.forEach((fish, k) => (view.labels[fish] = FISH_KEYS[k]));
  }

  const keyMap: Record<string, () => void> = {};
  for (const code of FISH_KEYS) {
    keyMap[code] = () => {
      view.keyboardUsed = true;
      const i = view.labels.indexOf(code);
      if (i >= 0) selectFish(i);
      view.bump();
    };
  }
  ctx.keys(keyMap);

  // ---------------- flow
  async function ghost(tr: Trial) {
    await ctx.wait(800);
    const order = rng.shuffle([...tr.tagged]);
    for (const t of order) {
      if (!alive || !accepting) return;
      await ctx.wait(450 + rng.next() * 350);
      let pick = t;
      if (rng.chance(0.1)) {
        // plausible confusion: nearest untagged fish
        let bd = 1e9;
        for (let j = 0; j < tr.count; j++) {
          if (tr.tagged.includes(j) || view.selected[j]) continue;
          const d = Math.hypot(tr.end[j][0] - tr.end[t][0], tr.end[j][1] - tr.end[t][1]);
          if (d < bd) {
            bd = d;
            pick = j;
          }
        }
      }
      selectFish(pick);
    }
  }

  async function runTrial() {
    const def = levelDef(stair.level);
    const reduced = ctx.settings.reducedMotion;
    const tr = makeTrial(rng, def, reduced);
    // remember where fish are now so they can glide to their new start
    for (let i = 0; i < MAX_FISH; i++) {
      view.fromX[i] = view.nx[i];
      view.fromY[i] = view.ny[i];
    }
    view.trial = tr;
    view.selected.fill(0);
    view.result.fill(0);
    picks = [];
    need = def.tagged;
    assignLabels(tr);
    hud(def.tagged);
    view.bump();
    const tm = ctx.settings.timingMultiplier;

    setPhase('idle');
    await ctx.wait(1000);
    if (!alive) return;
    setPhase('tag');
    say(`Watch the <b style="color:${GOLD}">${def.tagged}</b> golden fish`);
    ctx.announce(`Watch the ${def.tagged} golden fish`);
    const now = ctx.audio.now();
    tr.tagged.forEach((_, k) => ctx.audio.chime(note(k + 3), { gain: 0.07, when: now + k * 0.12, dur: 1.2 }));
    ctx.caption('Chimes — fish tagged');
    await ctx.wait(2000 * tm);
    if (!alive) return;
    setPhase('fade');
    await ctx.wait(500);
    if (!alive) return;
    hush();
    const trackMs = (preview ? 5200 : def.trackMs) * tm * (reduced ? 1.3 : 1);
    view.trackMs = trackMs;
    view.trackStart = ctx.time();
    setPhase('track');
    ctx.audio.noise({ dur: 1.2, filter: 700, sweepTo: 1400, gain: 0.035, q: 0.6 });
    if (def.flashOuts) {
      const fi = ctx.settings.flashIntensity;
      const depth = fi === 'none' ? 0.55 : fi === 'reduced' ? 0.35 : 0.12;
      for (const at of [0.38, 0.7]) {
        cancels.push(ctx.after(trackMs * at, () => (view.dim = depth)));
        cancels.push(ctx.after(trackMs * at + 380, () => (view.dim = 1)));
      }
    }
    await ctx.wait(trackMs);
    if (!alive) return;
    view.dim = 1;
    setPhase('freeze');
    ctx.audio.tone(note(0) / 2, { type: 'sine', dur: 0.5, gain: 0.06 });
    say(`Tap the <b style="color:${GOLD}">${def.tagged}</b> tagged fish`);
    ctx.announce(`The school stopped. Find the ${def.tagged} tagged fish.`);
    const done = new Promise<void>((res) => {
      resolvePicks = () => {
        resolvePicks = null;
        res();
      };
    });
    accepting = true;
    view.bump();
    if (preview) void ghost(tr);
    await done;
    if (!alive) return;
    hush();

    // reveal
    setPhase('reveal');
    let hits = 0;
    for (let k = 0; k < picks.length; k++) {
      const i = picks[k];
      const ok = tr.tagged.includes(i);
      view.result[i] = ok ? 1 : 2;
      view.resultAt[i] = ctx.time() / 1000;
      const wx = view.nx[i] * RX;
      const wy = view.ny[i] * RY;
      if (ok) {
        hits++;
        ctx.audio.pluck(note(4 + hits), { gain: 0.14, dur: 0.6 });
        ctx.audio.chime(note(9 + hits), { gain: 0.05, dur: 0.9 });
        burstRef.current?.burst([wx, wy, 0.4], 22, { color: GOLD, speed: 1.4, life: 0.9 });
      } else {
        ctx.audio.noise({ dur: 0.25, filter: 500, sweepTo: 250, gain: 0.07, q: 2 });
        ctx.audio.thunk({ gain: 0.08 });
        burstRef.current?.burst([wx, wy, 0.4], 10, { color: '#bfefff', speed: 0.6, life: 1.1, gravity: -0.8 });
      }
      view.bump();
      await ctx.wait(260);
    }
    for (const t of tr.tagged) {
      if (!view.selected[t]) {
        view.result[t] = 3;
        view.resultAt[t] = ctx.time() / 1000;
      }
    }
    view.bump();
    const perfect = hits === def.tagged;
    const pts = trialScore(hits, def.tagged);
    score += pts;
    totalHits += hits;
    totalTagged += def.tagged;
    maxTracked = Math.max(maxTracked, hits);
    trials++;
    ctx.trial({ correct: perfect, level: stair.level });
    if (perfect) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      const n0 = ctx.audio.now() + 0.1;
      for (let k = 0; k < 6; k++) ctx.audio.chime(note(7 + k), { gain: 0.05, when: n0 + k * 0.07, dur: 1.4 });
      ctx.haptics.success();
      ctx.caption('Shimmering flourish — perfect!');
      say(`<span style="color:${GOLD}">✦ Perfect</span> &nbsp;+${pts}`, 1800);
    } else {
      streak = 0;
      if (hits === 0) ctx.haptics.error();
      ctx.caption(`${hits} of ${def.tagged} found`);
      say(`${hits} of ${def.tagged} found &nbsp;+${pts}`, 1800);
    }
    ctx.announce(perfect ? 'Perfect!' : `${hits} of ${def.tagged} found`);
    if (perfect) stair.record(true);
    else if (hits <= def.tagged - 2) stair.record(false);
    if (preview && stair.level > 5) stair.set(4);
    hud(def.tagged);
    await ctx.wait(2000);
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([48, 55, 60, 64, 67], { gain: 0.04, brightness: 0.3 });
    bubbles();
    while (alive) {
      await runTrial();
      if (!alive) return;
      if (!preview && trials >= TRIALS) {
        const acc = totalTagged ? Math.round((totalHits / totalTagged) * 100) : 0;
        ctx.end({
          score,
          levelReached: stair.level,
          stats: { bestStreak, maxTracked, accuracy: acc },
          message: bestStreak >= 3 ? 'Eyes like a heron.' : 'The school is never quite the same twice.',
        });
        return;
      }
    }
  }

  function bubbles() {
    const tick = () => {
      if (!alive) return;
      ctx.audio.pluck(1200 + rng.next() * 900, { gain: 0.012, dur: 0.08 });
      cancels.push(ctx.after(900 + rng.next() * 2200, tick));
    };
    tick();
  }

  const unmount = mountR3F(ctx, <Scene view={view} onTapAt={tapAt} burstRef={burstRef} />, {
    orthographic: true,
    camera: { position: [0, 0, 20], zoom: 80, near: 0.1, far: 100 },
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
      prompt.remove();
    },
    onSettings() {
      view.bump();
    },
  };
}

// ------------------------------------------------------------------ textures & geometry

function ringTexture(kind: 'tag' | 'select' | 'miss'): THREE.Texture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  if (kind === 'tag') {
    g.shadowColor = '#fff';
    g.shadowBlur = 12;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(0, 0, 48, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'select') {
    g.lineWidth = 8;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      g.beginPath();
      g.arc(0, 0, 50, a - 0.45, a + 0.45);
      g.stroke();
    }
  } else {
    g.lineWidth = 5;
    g.setLineDash([9, 9]);
    g.beginPath();
    g.arc(0, 0, 48, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(text: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(3,20,28,0.8)';
  g.beginPath();
  g.arc(32, 32, 27, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 32px Manrope, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Top-down fish (head at +x) as a tessellated strip so the tail can wiggle in the vertex shader. */
function fishGeometry(): THREE.BufferGeometry {
  const SEG = 28;
  const ACROSS = 4;
  const x0 = -0.37;
  const x1 = 0.3;
  const half = (x: number) => {
    if (x < -0.2) {
      const s = (-0.2 - x) / 0.17;
      return 0.022 + Math.pow(s, 1.25) * 0.12;
    }
    const t = (x + 0.2) / 0.5;
    return t < 0.62 ? 0.118 * (0.18 + 0.82 * Math.sin(((t / 0.62) * Math.PI) / 2)) : 0.118 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.62) / 0.38, 2)));
  };
  const pos: number[] = [];
  const w: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const x = x0 + ((x1 - x0) * i) / SEG;
    const h = Math.max(0.002, half(x));
    for (let j = 0; j <= ACROSS; j++) {
      const v = (j / ACROSS) * 2 - 1;
      pos.push(x, v * h, 0);
      w.push(v);
    }
  }
  const row = ACROSS + 1;
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < ACROSS; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
  g.setIndex(idx);
  return g;
}

const FISH_VS = `uniform float uTime; uniform float uAmp; uniform float uPhase; uniform float uFreq;
attribute float aW; varying vec2 vP; varying float vW;
void main(){
  vec3 p = position; vP = p.xy; vW = aW;
  float tailK = smoothstep(0.18, -0.37, p.x);
  p.y += sin(uTime * uFreq + uPhase + p.x * 9.0) * uAmp * tailK;
  p.x += cos(uTime * uFreq + uPhase + p.x * 9.0) * uAmp * 0.15 * tailK;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FISH_FS = `uniform vec3 uCore; uniform vec3 uEdge; uniform vec3 uGold; uniform float uGoldK; uniform float uAlpha; uniform float uTime; uniform float uDimmed;
varying vec2 vP; varying float vW;
void main(){
  float e = abs(vW);
  float tail = step(vP.x, -0.2);
  vec3 base = mix(uCore, uEdge, smoothstep(0.15, 1.0, e));
  base += uCore * (1.0 - smoothstep(0.0, 0.4, e)) * 0.35 * (1.0 - tail);
  // fin rays on the tail
  base += uCore * tail * 0.25 * smoothstep(0.6, 1.0, sin(vW * 18.0));
  float sc = 0.5 + 0.5 * sin(vP.x * 140.0 + abs(vP.y) * 90.0 + uTime * 3.0);
  vec3 gold = mix(uGold, vec3(1.0, 0.97, 0.85), (1.0 - smoothstep(0.0, 0.5, e)) * 0.45) * (0.95 + 0.1 * sc);
  vec3 col = mix(base, gold, uGoldK);
  col = mix(col, col * 0.45, uDimmed);
  // eyes
  float eye = 1.0 - smoothstep(0.011, 0.018, length(vec2(vP.x - 0.2, abs(vP.y) - 0.052)));
  col = mix(col, vec3(0.02, 0.06, 0.09), eye * 0.85);
  float a = uAlpha * mix(1.0, 0.6, tail) * (1.0 - smoothstep(0.7, 1.0, e) * 0.55);
  float notch = step(vP.x, -0.29) * step(abs(vP.y), (-0.29 - vP.x) * 1.25);
  a *= 1.0 - notch;
  gl_FragColor = vec4(col, a);
}`;

// ------------------------------------------------------------------ scene

function Scene({ view, onTapAt, burstRef }: { view: View; onTapAt: (x: number, y: number) => void; burstRef: { current: BurstHandle | null } }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  const soft = ctx.settings.soft;
  const geo = useMemo(() => fishGeometry(), []);
  const count = view.trial?.count ?? 0;
  return (
    <>
      <CameraRig view={view} />
      {soft && (
        <>
          {/* Soft look: lights only touch the clay rim and pebbles (everything else is unlit). */}
          <hemisphereLight args={['#d8fff9', '#03141c', 0.9]} />
          <directionalLight position={[-3, 4, 6]} intensity={1.1} color="#e8fffb" />
        </>
      )}
      <Floor />
      {!hc && <Coral />}
      {soft ? <SoftRim /> : <PoolRim />}
      <Occluders view={view} />
      <Trails view={view} />
      {Array.from({ length: MAX_FISH }, (_, i) => (
        <Fish key={i} index={i} view={view} geo={geo} active={i < count} />
      ))}
      {!hc && <LightShafts />}
      {!hc && <Motes count={50} area={[7, 9, 1]} color="#bff8ff" size={0.05} speed={0.12} />}
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={240} size={0.1} />
      <mesh
        position={[0, 0, 5]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onTapAt(e.point.x, e.point.y);
        }}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <GameEffects bloom={0.9} threshold={0.35} />
    </>
  );
}

function CameraRig({ view }: { view: View }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;
    const top = 84;
    const bottom = 70;
    const usableH = Math.max(100, size.height - top - bottom);
    const zoom = Math.min(size.width / (2 * RX + 0.8), usableH / (2 * RY + 0.7));
    if (Math.abs(cam.zoom - zoom) > 0.01) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    cam.position.set(0, (top - bottom) / 2 / zoom, 20);
    // generous hit radius: ≥ 30px, and never less than ~a fish length
    view.hitR = Math.max(0.42, 30 / zoom);
  });
  return null;
}

function Floor() {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(hc ? '#01080c' : '#03151d') },
          uSand: { value: new THREE.Color(hc ? '#06141a' : '#0d4a55') },
          uLight: { value: new THREE.Color(hc ? '#000000' : '#7ff0e4') },
          uRX: { value: RX },
          uRY: { value: RY },
          uHC: { value: hc ? 1 : 0 },
        },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uDeep; uniform vec3 uSand; uniform vec3 uLight; uniform float uRX; uniform float uRY; uniform float uHC; varying vec2 vP;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
          float caustic(vec2 p, float t){
            vec2 q = p;
            float c = 0.0;
            for (int k = 0; k < 3; k++){
              q += vec2(sin(q.y * 1.7 + t * 0.9), cos(q.x * 1.5 - t * 0.7)) * 0.45;
              c += abs(sin(q.x * 2.1 + t) * sin(q.y * 1.9 - t * 0.8));
            }
            return pow(clamp(1.0 - c / 1.6, 0.0, 1.0), 3.0);
          }
          void main(){
            vec2 e = vP / vec2(uRX + 0.35, uRY + 0.35);
            float r = length(e);
            float pool = 1.0 - smoothstep(0.85, 1.25, r);
            float grain = n2(vP * 18.0) * 0.5 + n2(vP * 5.0) * 0.5;
            vec3 col = mix(uDeep, uSand, pool * (0.75 + 0.25 * grain));
            float c = caustic(vP * 1.3, uTime * 0.55);
            col += uLight * c * 0.28 * pool * (1.0 - uHC);
            // sandy ripples
            col += uSand * 0.12 * smoothstep(0.6, 1.0, sin(vP.y * 9.0 + n2(vP * 2.0) * 5.0)) * pool * (1.0 - uHC);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [hc],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += ctx.settings.reducedMotion ? dt * 0.3 : dt;
  });
  return (
    <mesh position={[0, 0, -2]} material={mat}>
      <planeGeometry args={[40, 40]} />
    </mesh>
  );
}

/** Thin luminous rim marking the pool edge (helps orientation, esp. high contrast). */
function PoolRim() {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * (RX + 0.3), Math.sin(a) * (RY + 0.3), -1.5));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial color={hc ? '#ffffff' : '#5fe0d4'} transparent opacity={hc ? 0.6 : 0.14} />
    </lineLoop>
  );
}

/** Soft look: the pool is ringed by a raised, rounded clay lip instead of a thin glowing line. */
function SoftRim() {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg2;
  const parts = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * (RX + 0.42), Math.sin(a) * (RY + 0.42), -1.5));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    return { geo: new THREE.TubeGeometry(curve, 128, 0.17, 12, true), mat: clay(shade(bg, 0.12), { roughness: 0.92 }) };
  }, [bg]);
  return <mesh geometry={parts.geo} material={parts.mat} />;
}

function Coral() {
  const ctx = useGame();
  const { geo, polyps } = useMemo(() => {
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pos: number[] = [];
    const col: number[] = [];
    const palette = [new THREE.Color('#0d2436'), new THREE.Color('#1f1636'), new THREE.Color('#0b2c31'), new THREE.Color('#2a1530')];
    const pp: number[] = [];
    const pc: number[] = [];
    const glow = [new THREE.Color('#ff9ec7'), new THREE.Color('#6ff5e6'), new THREE.Color('#ffd36b'), new THREE.Color('#b9a3ff')];
    const addDisc = (cx: number, cy: number, rad: number, c: THREE.Color) => {
      const seg = 18;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2;
        const a1 = ((k + 1) / seg) * Math.PI * 2;
        pos.push(cx, cy, -1.8, cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad, -1.8, cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad, -1.8);
        const edge = c.clone().multiplyScalar(0.35);
        col.push(c.r * 1.6, c.g * 1.6, c.b * 1.6, edge.r, edge.g, edge.b, edge.r, edge.g, edge.b);
      }
    };
    const clusters = 26;
    for (let k = 0; k < clusters; k++) {
      const a = (k / clusters) * Math.PI * 2 + r() * 0.2;
      const rr = 1.16 + r() * 0.3;
      const cx = Math.cos(a) * (RX + 0.3) * rr;
      const cy = Math.sin(a) * (RY + 0.3) * rr;
      const c = palette[Math.floor(r() * palette.length)];
      const blobs = 6 + Math.floor(r() * 6);
      for (let b = 0; b < blobs; b++) {
        const bx = cx + (r() - 0.5) * 0.9;
        const by = cy + (r() - 0.5) * 0.9;
        const rad = 0.1 + r() * 0.26;
        addDisc(bx, by, rad, c);
        if (r() < 0.8) {
          const g = glow[Math.floor(r() * glow.length)];
          for (let q = 0; q < 4; q++) {
            pp.push(bx + (r() - 0.5) * rad, by + (r() - 0.5) * rad, -1.7);
            pc.push(g.r, g.g, g.b);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const polyps = new THREE.BufferGeometry();
    polyps.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    polyps.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    return { geo, polyps };
  }, []);
  const pm = useRef<THREE.PointsMaterial>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (pm.current && !ctx.settings.reducedMotion) pm.current.opacity = 0.75 + Math.sin(t.current * 0.8) * 0.15;
  });
  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <points geometry={polyps}>
        <pointsMaterial ref={pm} size={0.16} map={softDotTexture()} vertexColors transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
}

function LightShafts() {
  const ctx = useGame();
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 4;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 4);
    return new THREE.CanvasTexture(c);
  }, []);
  const shafts = useMemo(() => [
    { x: -1.6, w: 1.2, sp: 0.05, o: 0.07 },
    { x: 0.6, w: 0.8, sp: 0.07, o: 0.06 },
    { x: 2.2, w: 1.5, sp: 0.04, o: 0.05 },
  ], []);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!ctx.settings.reducedMotion) t.current += dt;
    shafts.forEach((s, k) => {
      const m = refs.current[k];
      if (!m) return;
      m.position.x = s.x + Math.sin(t.current * s.sp * 6 + k * 2) * 0.6;
      (m.material as THREE.MeshBasicMaterial).opacity = s.o * (0.7 + 0.3 * Math.sin(t.current * 0.4 + k));
    });
  });
  return (
    <>
      {shafts.map((s, k) => (
        <mesh key={k} ref={(el) => (refs.current[k] = el)} position={[s.x, 0, 3]} rotation-z={-0.38} scale={[s.w, 16, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={tex} color="#c9fff6" transparent opacity={s.o} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </>
  );
}

function Occluders({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.72, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  const occ = view.trial?.occluders ?? [];
  if (ctx.settings.soft) return <SoftOccluders occ={occ} />;
  return (
    <>
      {occ.map((o, k) => (
        <group key={k} position={[o.x * RX, o.y * RY, 2]}>
          <mesh scale={[o.r * RX * 2.3, o.r * RY * 1.9, 1]} rotation-z={k * 0.9}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={tex} color={hc ? '#1c1c1c' : '#062630'} transparent opacity={0.94} depthWrite={false} />
          </mesh>
          <mesh scale={[o.r * RX * 1.6, o.r * RY * 1.3, 1]} rotation-z={k * 0.9 + 0.4} position={[0.05, 0.05, 0.01]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={tex} color={hc ? '#333333' : '#0b3a44'} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Soft look: occluders become smooth, opaque clay pebbles (same footprint, still fully hide the fish). */
const pebbleGeo = { g: null as THREE.SphereGeometry | null };
function SoftOccluders({ occ }: { occ: Array<{ x: number; y: number; r: number }> }) {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg2;
  if (!pebbleGeo.g) pebbleGeo.g = new THREE.SphereGeometry(1, 32, 20);
  const mats = useMemo(() => ({ a: clay(shade(bg, 0.1), { roughness: 0.95 }), b: clay(shade(bg, 0.18), { roughness: 0.95 }) }), [bg]);
  return (
    <>
      {occ.map((o, k) => (
        <group key={k} position={[o.x * RX, o.y * RY, 2]} rotation-z={k * 0.9}>
          <mesh geometry={pebbleGeo.g!} material={mats.a} scale={[o.r * RX * 1.02, o.r * RY * 0.86, 0.35]} />
          <mesh geometry={pebbleGeo.g!} material={mats.b} scale={[o.r * RX * 0.62, o.r * RY * 0.5, 0.3]} position={[-0.06, 0.06, 0.12]} rotation-z={0.4} />
        </group>
      ))}
    </>
  );
}

const TRAIL = 9;

/** Fin-ribbon trails: one Points object for every fish. */
function Trails({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const { geo, mat, hist } = useMemo(() => {
    const n = MAX_FISH * TRAIL;
    const pos = new Float32Array(n * 3);
    const a = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(a, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(hc ? '#ffffff' : '#6ff5e6') }, uScale: { value: 30 } },
      vertexShader: `attribute float aA; uniform float uScale; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = uScale * (0.35 + aA * 0.65); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(uColor, a * a * vA * 0.35); }`,
    });
    return { geo, mat, hist: new Float32Array(MAX_FISH * TRAIL * 2) };
  }, [hc]);
  const acc = useRef(0);
  const { camera } = useThree();
  useFrame((_, dt) => {
    const count = view.trial?.count ?? 0;
    acc.current += dt;
    const step = acc.current > 0.045;
    if (step) acc.current = 0;
    const pos = geo.attributes.position.array as Float32Array;
    const al = geo.attributes.aA.array as Float32Array;
    const moving = view.phase === 'track' || view.phase === 'idle';
    for (let i = 0; i < MAX_FISH; i++) {
      const base = i * TRAIL;
      if (step) {
        for (let k = TRAIL - 1; k > 0; k--) {
          hist[(base + k) * 2] = hist[(base + k - 1) * 2];
          hist[(base + k) * 2 + 1] = hist[(base + k - 1) * 2 + 1];
        }
        hist[base * 2] = view.nx[i] * RX;
        hist[base * 2 + 1] = view.ny[i] * RY;
      }
      for (let k = 0; k < TRAIL; k++) {
        const j = base + k;
        pos[j * 3] = hist[j * 2];
        pos[j * 3 + 1] = hist[j * 2 + 1];
        pos[j * 3 + 2] = -0.5;
        al[j] = i < count && moving ? (1 - k / TRAIL) * view.dim : 0;
      }
    }
    mat.uniforms.uScale.value = (camera as THREE.OrthographicCamera).zoom * 0.28;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aA.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

function Fish({ index, view, geo, active }: { index: number; view: View; geo: THREE.BufferGeometry; active: boolean }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const tagRing = useRef<THREE.Mesh>(null);
  const pulseRing = useRef<THREE.Mesh>(null);
  const selRing = useRef<THREE.Mesh>(null);
  const missRing = useRef<THREE.Mesh>(null);
  const label = useRef<THREE.Sprite>(null);
  const mats = useMemo(() => {
    const fish = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.03 },
        uPhase: { value: index * 1.37 },
        uFreq: { value: 10 },
        uCore: { value: new THREE.Color(hc ? '#ffffff' : FISH_CORE) },
        uEdge: { value: new THREE.Color(hc ? '#d8d8d8' : FISH_EDGE) },
        uGold: { value: new THREE.Color(GOLD) },
        uGoldK: { value: 0 },
        uAlpha: { value: 0 },
        uDimmed: { value: 0 },
      },
      vertexShader: FISH_VS,
      fragmentShader: FISH_FS,
    });
    const haloM = new THREE.SpriteMaterial({ map: softDotTexture(), color: hc ? '#ffffff' : '#4fe8d8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const tagM = new THREE.MeshBasicMaterial({ map: ringTexture('tag'), color: hc ? '#ffffff' : GOLD, transparent: true, opacity: 0, depthWrite: false });
    const pulseM = new THREE.MeshBasicMaterial({ map: ringTexture('tag'), color: hc ? '#ffffff' : '#fff1c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const selM = new THREE.MeshBasicMaterial({ map: ringTexture('select'), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const missM = new THREE.MeshBasicMaterial({ map: ringTexture('miss'), color: hc ? '#ffffff' : GOLD, transparent: true, opacity: 0, depthWrite: false });
    const labM = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
    return { fish, haloM, tagM, pulseM, selM, missM, labM };
  }, [index, hc]);
  const lab = useRef<{ code: string; tex: THREE.Texture | null }>({ code: '', tex: null });
  const st = useRef({ x: 0, y: 0, ang: Math.random() * 6, appear: 0, gold: 0, t: 0, speed: 0 });
  const out = useMemo<[number, number]>(() => [0, 0], []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const s = st.current;
    const tr = view.trial;
    s.t += dt;
    s.appear += ((active ? 1 : 0) - s.appear) * damp(3, dt);
    g.visible = s.appear > 0.01;
    if (!g.visible || !tr || index >= tr.count) {
      if (!active) {
        mats.fish.uniforms.uAlpha.value = s.appear;
      }
      if (!g.visible) return;
    }
    const now = ctx.time();
    const phaseT = (now - view.phaseStart) / 1000;
    const reduced = ctx.settings.reducedMotion;
    let nx = s.x;
    let ny = s.y;
    if (tr && index < tr.count) {
      const p = tr.paths[index];
      if (view.phase === 'idle' || view.phase === 'tag' || view.phase === 'fade') {
        // hover near the start point; the hover fades out right before tracking begins
        const env = view.phase === 'fade' ? Math.max(0, 1 - phaseT / 0.5) : 1;
        const hx = (Math.sin(s.t * 0.9 + index * 1.3) - Math.sin(index * 1.3)) * 0.03 * env;
        const hy = (Math.cos(s.t * 0.8 + index * 2.1) - Math.cos(index * 2.1)) * 0.03 * env;
        let tx = p.sx + hx;
        let ty = p.sy + hy;
        if (view.phase === 'idle') {
          const k = easeInOutSine(Math.min(1, phaseT / 0.9));
          const fx = view.fromX[index];
          const fy = view.fromY[index];
          const fresh = fx === 0 && fy === 0;
          if (!fresh) {
            tx = fx + (tx - fx) * k;
            ty = fy + (ty - fy) * k;
          }
        }
        nx = tx;
        ny = ty;
      } else if (view.phase === 'track') {
        const u = Math.min(1, (now - view.trackStart) / view.trackMs);
        fishPos(tr, index, u, out);
        nx = out[0];
        ny = out[1];
      } else {
        nx = tr.end[index][0];
        ny = tr.end[index][1];
      }
    }
    const vx = (nx - s.x) * RX;
    const vy = (ny - s.y) * RY;
    const sp = dt > 0 ? Math.hypot(vx, vy) / dt : 0;
    s.speed += (sp - s.speed) * damp(6, dt);
    if (sp > 0.05) {
      const target = Math.atan2(vy, vx);
      let d = target - s.ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.ang += d * damp(reduced ? 5 : 9, dt);
    }
    s.x = nx;
    s.y = ny;
    view.nx[index] = nx;
    view.ny[index] = ny;
    g.position.set(nx * RX, ny * RY, 0.2 + index * 0.01);
    if (body.current) body.current.rotation.z = s.ang;

    // appearance
    const frozen = view.phase === 'freeze' || view.phase === 'reveal';
    const u = mats.fish.uniforms;
    u.uTime.value += dt;
    const swim = Math.min(1, s.speed / 2.2);
    u.uAmp.value = frozen ? 0.012 : 0.02 + swim * 0.035;
    u.uFreq.value = frozen ? 3 : 7 + swim * 9;
    const isTag = tr ? tr.tagged.includes(index) : false;
    const tagOn = isTag && (view.phase === 'tag' || view.phase === 'fade');
    const fadeK = view.phase === 'fade' ? Math.max(0, 1 - phaseT / 0.5) : 1;
    const tagK = tagOn ? Math.min(1, view.phase === 'tag' ? phaseT / 0.25 : 1) * fadeK : 0;
    const res = view.result[index];
    const goldTarget = Math.max(tagK, res === 1 ? 1 : 0);
    s.gold += (goldTarget - s.gold) * damp(goldTarget > s.gold ? 14 : 5, dt);
    u.uGoldK.value = s.gold;
    u.uDimmed.value = res === 2 ? 0.7 : 0;
    u.uAlpha.value = s.appear * view.dim;
    mats.haloM.opacity = s.appear * view.dim * (0.22 + s.gold * 0.6);
    mats.haloM.color.set(s.gold > 0.3 ? GOLD : hc ? '#ffffff' : '#4fe8d8');
    const hs = 0.9 + s.gold * 0.5;
    halo.current?.scale.set(hs, hs * 0.75, 1);

    // tag ring + brief outline pulse
    mats.tagM.opacity = tagK * 0.95;
    if (pulseRing.current) {
      const pt = view.phase === 'tag' && isTag ? phaseT % 1.0 : 1;
      const ps = 0.9 + pt * 0.7;
      pulseRing.current.scale.set(ps, ps, 1);
      mats.pulseM.opacity = view.phase === 'tag' && isTag && !reduced ? (1 - pt) * 0.7 : view.phase === 'tag' && isTag ? 0.4 : 0;
    }
    // selection brackets
    const sel = view.selected[index] && (view.phase === 'freeze' || view.phase === 'reveal');
    mats.selM.opacity = sel ? (res === 2 ? 0.35 : 0.95) : 0;
    if (selRing.current) {
      const sc = sel && !reduced && view.phase === 'freeze' ? 1 + Math.sin(s.t * 4) * 0.04 : 1;
      selRing.current.scale.set(sc, sc, 1);
      selRing.current.rotation.z = reduced ? 0 : s.t * 0.4;
    }
    // missed target: dashed gold outline pulse
    mats.missM.opacity = res === 3 ? 0.6 + 0.3 * Math.sin((now / 1000 - view.resultAt[index]) * 4) : 0;

    // keyboard labels while choosing
    if (label.current) {
      const code = view.labels[index] ?? '';
      const show = view.phase === 'freeze' && (ctx.settings.showKeyHints || view.keyboardUsed) && code !== '';
      label.current.visible = show;
      if (show && lab.current.code !== code) {
        lab.current.tex?.dispose();
        lab.current.tex = labelTexture(keyText(code));
        lab.current.code = code;
        mats.labM.map = lab.current.tex;
        mats.labM.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={group} visible={false}>
      <sprite ref={halo} material={mats.haloM} position={[0, 0, -0.1]} />
      <mesh ref={body} geometry={geo} material={mats.fish} scale={[1.55, 1.55, 1]} />
      <mesh ref={tagRing} material={mats.tagM} position={[0, 0, 0.05]}>
        <planeGeometry args={[0.95, 0.95]} />
      </mesh>
      <mesh ref={pulseRing} material={mats.pulseM} position={[0, 0, 0.06]}>
        <planeGeometry args={[0.95, 0.95]} />
      </mesh>
      <mesh ref={selRing} material={mats.selM} position={[0, 0, 0.07]}>
        <planeGeometry args={[1.0, 1.0]} />
      </mesh>
      <mesh ref={missRing} material={mats.missM} position={[0, 0, 0.07]}>
        <planeGeometry args={[0.95, 0.95]} />
      </mesh>
      <sprite ref={label} material={mats.labM} position={[0, 0.5, 0.3]} scale={[0.36, 0.36, 1]} visible={false} />
    </group>
  );
}
