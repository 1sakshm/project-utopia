import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, easeOutCubic } from '@/sdk';
import { mountR3F, useGame, GameEffects, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { clay, shade } from './soft';
import {
  POSITIONS,
  ROUNDS,
  CONSTELLATIONS,
  roundDef,
  fromLevel,
  levelOf,
  makeSequence,
  nextLevel,
  accuracyOf,
  scoreHit,
  FALSE_ALARM_PENALTY,
  type Tally,
} from './logic';

const STAR_COLOR = '#fff3d6';
const GOLD = '#ffd479';
const RING_R = 1.95;
const RING_Y = 0.35;
const CONST_SCALE = 1.22;

/** Socket positions: a ring of 8, starting at the top, clockwise, with a slight organic wobble. */
const WOBBLE = [0.04, -0.06, 0.07, -0.03, 0.05, -0.07, 0.02, -0.05];
const SOCKETS: Array<[number, number]> = Array.from({ length: POSITIONS }, (_, k) => {
  const a = Math.PI / 2 - (k * Math.PI * 2) / POSITIONS;
  const r = RING_R + WOBBLE[k] * 1.5;
  return [Math.cos(a) * r, RING_Y + Math.sin(a) * r];
});

// ------------------------------------------------------------------ view-model

class View {
  /** Game-clock seconds of each socket's last ignition (-99 = never). */
  ignite = new Float32Array(POSITIONS).fill(-99);
  onDur = 1;
  hitPulse = new Float32Array(POSITIONS);
  missPulse = new Float32Array(POSITIONS);
  puffs: Array<{ pos: number; t: number }> = [];
  constellation = 0;
  revealed = 0;
  finale = 0; // 0 none, 1 alive animation running
  finaleT = 0;
  fadeIn = 1;
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
  const bellNote = ctx.audio.scale(62, 'majorPenta');
  const harp = ctx.audio.scale(69, 'majorPenta');
  const burstRef: { current: BurstHandle | null } = { current: null };

  let alive = true;
  let stopAmbient: (() => void) | null = null;
  const cancels: Array<() => void> = [];

  const start = fromLevel(preview ? 1 : ctx.startLevel);
  let n = start.n;
  let sub = start.sub;
  let highestN = n;
  let score = 0;
  let collected = 0;
  const total: Tally = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
  let tally: Tally = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };

  // per-star state
  let windowOpen = false;
  let responded = false;
  let isTarget = false;
  let eligible = false;
  let currentPos = 0;
  let starTime = 0;
  let round = 0;

  // ---------------- DOM
  const btn = document.createElement('button');
  btn.className = 'u-game-btn';
  btn.setAttribute('aria-label', 'Match');
  btn.style.cssText =
    'position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(420px, calc(100% - 40px));height:72px;font-size:1.25rem;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;gap:10px;border-color:rgba(255,212,121,0.45);';
  const setBtnLabel = () => {
    btn.innerHTML = `<span style="color:${GOLD};font-size:1.3em;line-height:1">✦</span><span>Match</span>${ctx.settings.showKeyHints && !preview ? '<span style="opacity:.6;font-size:.75em;font-weight:600">Space</span>' : ''}`;
  };
  setBtnLabel();
  if (preview) btn.style.pointerEvents = 'none';
  btn.tabIndex = preview ? -1 : 0;
  ctx.container.appendChild(btn);

  const info = document.createElement('div');
  info.className = 'u-game-text';
  info.style.cssText = `top:calc(50% - 44px);font-size:1.05rem;opacity:0;transition:opacity .45s;padding:0 28px;line-height:1.35;`;
  ctx.container.appendChild(info);
  function showInfo(html: string, ms: number) {
    info.innerHTML = html;
    info.style.opacity = '1';
    cancels.push(ctx.after(ms, () => (info.style.opacity = '0')));
  }

  function flashBtn(kind: 'hit' | 'fa' | 'press') {
    btn.style.background = kind === 'hit' ? 'rgba(255,212,121,0.35)' : kind === 'fa' ? 'rgba(143,184,255,0.22)' : 'rgba(255,255,255,0.14)';
    btn.style.transform = 'translateX(-50%) scale(0.96)';
    cancels.push(
      ctx.after(200, () => {
        btn.style.background = '';
        btn.style.transform = 'translateX(-50%)';
      }),
    );
  }

  function hud(progress: number) {
    ctx.hud.set({ score, level: n, progress, label: `N = ${n} · Round ${Math.min(round + 1, ROUNDS)}/${ROUNDS}` });
  }

  // ---------------- input
  function press() {
    if (!alive || ctx.isPaused()) return;
    if (!windowOpen || responded) {
      flashBtn('press');
      return;
    }
    responded = true;
    const rt = ctx.time() - starTime;
    if (!eligible) {
      flashBtn('press');
      ctx.audio.tick();
      return;
    }
    const [x, y] = SOCKETS[currentPos];
    if (isTarget) {
      tally.hits++;
      score += scoreHit(n);
      view.hitPulse[currentPos] = 1;
      view.revealed++;
      flashBtn('hit');
      const now = ctx.audio.now();
      for (let k = 0; k < 5; k++) ctx.audio.pluck(harp(k), { gain: 0.12, when: now + k * 0.045, dur: 0.9 });
      ctx.audio.chime(harp(7), { gain: 0.05, when: now + 0.22, dur: 1.2 });
      ctx.haptics.success();
      ctx.caption('Harp glissando — match!');
      burstRef.current?.burst([x, y, 0.1], 26, { color: GOLD, speed: 1.6, life: 0.9 });
      ctx.trial({ correct: true, rtMs: rt, level: levelOf(n, sub) });
    } else {
      tally.falseAlarms++;
      score = Math.max(0, score - FALSE_ALARM_PENALTY);
      view.puffs.push({ pos: currentPos, t: 0 });
      if (view.puffs.length > 4) view.puffs.shift();
      flashBtn('fa');
      ctx.audio.thunk({ gain: 0.12 });
      ctx.haptics.error();
      ctx.caption('Muffled tick — not a match');
      ctx.trial({ correct: false, rtMs: rt, level: levelOf(n, sub) });
    }
    hud(0);
  }

  const onContainerDown = (e: PointerEvent) => {
    if (preview) return;
    if (e.target instanceof Node && btn.contains(e.target)) return;
    const r = ctx.container.getBoundingClientRect();
    if (e.clientY - r.top > r.height * 0.5) press();
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!preview) press();
  });
  btn.addEventListener('keydown', (e) => {
    // Space/Enter handled by ctx.keys; stop the native button click from double-firing
    if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
  });
  ctx.container.addEventListener('pointerdown', onContainerDown);
  ctx.keys({ Space: press, KeyM: press, Enter: press });

  // ---------------- flow
  function ignite(pos: number) {
    view.ignite[pos] = ctx.time() / 1000;
    const [x] = SOCKETS[pos];
    ctx.audio.bell(bellNote(pos), { gain: 0.07, dur: 1.6, pan: x / 3 });
  }

  async function ghostPress(delay: number) {
    await ctx.wait(delay);
    if (!alive || !windowOpen) return;
    press();
  }

  async function playRound(): Promise<number> {
    const def = preview ? { ...roundDef(1, 2), length: 12 } : roundDef(n, sub);
    const cIdx = preview ? 1 : rng.int(0, CONSTELLATIONS.length - 1);
    view.constellation = cIdx;
    view.revealed = 0;
    view.finale = 0;
    view.fadeIn = 0;
    view.bump();
    tally = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
    const interval = (preview ? 1500 : def.intervalMs) * ctx.settings.timingMultiplier;
    view.onDur = Math.min(1.1, (interval / 1000) * 0.45);
    const nWord = def.n === 1 ? 'the star just before' : `the star ${def.n} back`;
    showInfo(
      preview
        ? `<div style="font-size:.8em;opacity:.7">N = ${def.n}</div>Match ${nWord}`
        : `<div style="font-size:.8em;opacity:.7;letter-spacing:.08em">ROUND ${round + 1} · N = ${def.n}</div>Tap Match when a star lands where ${nWord} lit`,
      preview ? 1800 : 2600,
    );
    hud(0);
    ctx.announce(`Round ${round + 1}. N equals ${def.n}.`);
    await ctx.wait(preview ? 1300 : 2400);
    const { seq, targets } = makeSequence(rng, def, preview ? [3, 4, 8] : undefined);
    for (let i = 0; i < seq.length; i++) {
      if (!alive) return 0;
      currentPos = seq[i];
      isTarget = targets[i];
      eligible = i >= def.n;
      responded = false;
      windowOpen = true;
      starTime = ctx.time();
      ignite(currentPos);
      if (preview) {
        if (isTarget && rng.chance(0.9)) void ghostPress(interval * (0.3 + rng.next() * 0.2));
        else if (!isTarget && eligible && rng.chance(0.05)) void ghostPress(interval * 0.45);
      }
      await ctx.wait(interval);
      windowOpen = false;
      if (eligible && !responded) {
        if (isTarget) {
          tally.misses++;
          view.missPulse[currentPos] = 1;
          ctx.trial({ correct: false, level: levelOf(def.n, sub) });
        } else {
          tally.correctRejections++;
          ctx.trial({ correct: true, level: levelOf(def.n, sub) });
        }
      }
      hud((i + 1) / seq.length);
    }
    // finale — the constellation comes to life
    const acc = accuracyOf(tally);
    const nTargets = targets.filter(Boolean).length;
    const got = tally.hits >= Math.ceil(nTargets / 2) && acc >= 0.6;
    const name = CONSTELLATIONS[cIdx].name;
    view.finale = 1;
    view.finaleT = 0;
    view.bump();
    const now = ctx.audio.now();
    // a unique little motif per constellation (seeded by its index)
    for (let k = 0; k < 5; k++) ctx.audio.chime(harp(((cIdx * 7 + k * 3) % 9) - 2), { gain: 0.07, when: now + 0.2 + k * 0.18, dur: 1.6 });
    ctx.caption(`${name} constellation motif`);
    showInfo(
      `<div style="font-size:1.6rem">${Math.round(acc * 100)}%</div><div style="opacity:.85">${got ? `The ${name} ✦ collected` : `The ${name} slips away`}</div>`,
      preview ? 2400 : 3000,
    );
    ctx.announce(`${Math.round(acc * 100)} percent. ${got ? name + ' collected' : ''}`);
    if (got && !preview) {
      collected++;
      const atlas = ctx.storage.get<string[]>('atlas', []);
      if (!atlas.includes(name)) ctx.storage.set('atlas', [...atlas, name]);
    }
    total.hits += tally.hits;
    total.misses += tally.misses;
    total.falseAlarms += tally.falseAlarms;
    total.correctRejections += tally.correctRejections;
    await ctx.wait(preview ? 3000 : 3400);
    return acc;
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 62, 66, 69], { gain: 0.04, brightness: 0.35 });
    await ctx.wait(400);
    if (preview) {
      while (alive) {
        await playRound();
      }
      return;
    }
    for (round = 0; round < ROUNDS && alive; round++) {
      const acc = await playRound();
      if (!alive) return;
      const next = nextLevel(n, sub, acc);
      if (round < ROUNDS - 1 && next.n !== n) {
        showInfo(`<div style="font-size:.8em;opacity:.7">NEXT</div>N = ${next.n}`, 1600);
        await ctx.wait(1700);
      }
      n = next.n;
      sub = next.sub;
      if (round < ROUNDS - 1) highestN = Math.max(highestN, n);
    }
    if (!alive) return;
    const acc = Math.round(accuracyOf(total) * 100);
    ctx.end({
      score,
      levelReached: levelOf(n, sub),
      stats: { highestN, accuracy: acc, constellations: collected },
      message: collected >= 2 ? 'A sky full of stories.' : 'Every round, the sky remembers a little more.',
    });
  }

  const unmount = mountR3F(ctx, <Scene view={view} burstRef={burstRef} />, {
    camera: { position: [0, 0, 12], fov: 45, near: 0.1, far: 200 },
    background: ctx.manifest.palette.bg,
  });

  return {
    start() {
      void run();
    },
    destroy() {
      alive = false;
      windowOpen = false;
      cancels.forEach((c) => c());
      stopAmbient?.();
      ctx.container.removeEventListener('pointerdown', onContainerDown);
      unmount();
      btn.remove();
      info.remove();
    },
    onSettings() {
      setBtnLabel();
      view.bump();
    },
  };
}

// ------------------------------------------------------------------ textures

const shapeCache = new Map<number, THREE.Texture>();
/** Eight distinct star shapes, one per position. */
function shapeTexture(kind: number): THREE.Texture {
  const hit = shapeCache.get(kind);
  if (hit) return hit;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 10;
  const star = (points: number, outer: number, inner: number, rot = -Math.PI / 2) => {
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = rot + (i * Math.PI) / points;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  };
  switch (kind) {
    case 0:
      star(4, 48, 11);
      break;
    case 1:
      star(5, 44, 18);
      break;
    case 2:
      star(6, 42, 20);
      break;
    case 3: // diamond
      g.beginPath();
      g.moveTo(0, -44);
      g.lineTo(28, 0);
      g.lineTo(0, 44);
      g.lineTo(-28, 0);
      g.closePath();
      g.fill();
      break;
    case 4: // ringed orb
      g.beginPath();
      g.arc(0, 0, 17, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 34, 0, Math.PI * 2);
      g.stroke();
      break;
    case 5: // triangle
      g.beginPath();
      g.moveTo(0, -42);
      g.lineTo(38, 30);
      g.lineTo(-38, 30);
      g.closePath();
      g.fill();
      break;
    case 6: // 8-point
      star(8, 46, 16, -Math.PI / 2);
      break;
    default: // square cross (plus)
      g.fillRect(-10, -42, 20, 84);
      g.fillRect(-42, -10, 84, 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  shapeCache.set(kind, t);
  return t;
}

function numberTexture(n: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,30,0.7)';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 32px Manrope, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let lineTex: THREE.Texture | null = null;
/** Gaussian across the V axis — soft glow for filament quads. */
function glowLineTexture(): THREE.Texture {
  if (lineTex) return lineTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 64);
  lineTex = new THREE.CanvasTexture(c);
  return lineTex;
}

let flareTex: THREE.Texture | null = null;
function flareTexture(): THREE.Texture {
  if (flareTex) return flareTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 128; x++) {
      const u = (x / 127) * 2 - 1;
      const v = (y / 15) * 2 - 1;
      const a = Math.exp(-v * v * 9) * Math.pow(1 - Math.abs(u), 2.2);
      const k = (y * 128 + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  flareTex = new THREE.CanvasTexture(c);
  return flareTex;
}

// ------------------------------------------------------------------ scene

function Scene({ view, burstRef }: { view: View; burstRef: { current: BurstHandle | null } }) {
  useSyncExternalStore(view.subscribe, view.getVersion);
  const soft = useGame().settings.soft;
  return (
    <>
      <CameraRig />
      <Nebula />
      <StarField />
      {soft && <SoftSockets />}
      <Constellation key={view.constellation} view={view} />
      {Array.from({ length: POSITIONS }, (_, i) => (
        <Socket key={i} index={i} view={view} />
      ))}
      <Puffs view={view} />
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={220} size={0.1} />
      <GameEffects bloom={soft ? 0.8 : 1.0} threshold={soft ? 0.36 : 0.3} />
    </>
  );
}

/**
 * Soft look: every star sits on a soft clay button (a rounded lip around a gently domed face), carved from
 * the night sky's own colour. Two instanced meshes, lit by their own soft lights (everything else is unlit).
 */
function SoftSockets() {
  const ctx = useGame();
  const bg = ctx.manifest.palette.bg2;
  const parts = useMemo(() => {
    const lip = new THREE.TorusGeometry(0.44, 0.075, 14, 48);
    const face = new THREE.SphereGeometry(0.44, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.12);
    return { lip, face, lipM: clay(shade(bg, 0.16), { roughness: 0.9 }), faceM: clay(shade(bg, 0.04), { roughness: 1 }) };
  }, [bg]);
  const place = (m: THREE.InstancedMesh | null, z: number) => {
    if (!m) return;
    const o = new THREE.Object3D();
    SOCKETS.forEach(([x, y], k) => {
      o.position.set(x, y, z);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  };
  return (
    <>
      <hemisphereLight args={['#c9cfff', '#05061a', 0.7]} />
      <directionalLight position={[-4, 6, 8]} intensity={1.1} color="#e6e9ff" />
      <instancedMesh ref={(m) => place(m, -0.12)} args={[parts.face, parts.faceM, SOCKETS.length]} />
      <instancedMesh ref={(m) => place(m, -0.06)} args={[parts.lip, parts.lipM, SOCKETS.length]} />
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
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // content: ring (+labels) must fit between the HUD (top ~80px) and the Match button (bottom ~120px)
    const topPx = 90;
    const botPx = 130;
    const usable = Math.max(0.3, 1 - (topPx + botPx) / size.height);
    const contentW = (RING_R + 0.75) * 2;
    const contentH = (RING_R + 0.7) * 2;
    const distW = contentW / 2 / (tanV * aspect);
    const distH = contentH / 2 / (tanV * usable);
    const dist = Math.max(distW, distH, 7);
    const visH = 2 * tanV * dist;
    const offY = ((botPx - topPx) / 2 / size.height) * visH;
    const reduced = ctx.settings.reducedMotion;
    const sx = reduced ? 0 : Math.sin(t.current * 0.07) * 0.25;
    const sy = reduced ? 0 : Math.cos(t.current * 0.05) * 0.15;
    cam.position.set(sx, RING_Y - offY + sy, dist);
    cam.lookAt(sx * 0.3, RING_Y - offY, 0);
  });
  return null;
}

function Nebula() {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uA: { value: new THREE.Color('#05061a') },
          uB: { value: new THREE.Color('#3b2585') },
          uC: { value: new THREE.Color('#2a8fb0') },
          uD: { value: new THREE.Color('#8a3f86') },
          uHC: { value: hc ? 1 : 0 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform float uHC; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
          float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
          void main(){
            vec2 p = vUv * vec2(4.0, 3.0);
            float t = uTime * 0.012;
            float f = fbm(p + vec2(t, -t * 0.6));
            float g = fbm(p * 1.6 + f * 1.8 + vec2(-t * 0.8, t));
            vec3 col = mix(uA, uB, smoothstep(0.35, 0.85, g));
            col = mix(col, uC, smoothstep(0.55, 0.9, f * g * 1.7) * 0.55);
            col = mix(col, uD, smoothstep(0.62, 0.95, g * (1.0 - f) * 2.2) * 0.35);
            float band = exp(-pow((vUv.y - 0.5 - (vUv.x - 0.5) * 0.7) * 3.0, 2.0));
            col = mix(uA, col, 0.85 + 0.4 * band) * 1.45 + vec3(0.012, 0.01, 0.03);
            col = mix(col, uA, uHC * 0.85);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [hc],
  );
  useFrame((_, dt) => {
    if (!ctx.settings.reducedMotion) mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh position={[0, 0, -14]} material={mat} renderOrder={-10}>
      <planeGeometry args={[70, 46]} />
    </mesh>
  );
}

function StarField() {
  const ctx = useGame();
  const { gl } = useThree();
  const count = Math.floor(900 * Math.max(0.4, ctx.quality.particleScale));
  const { geo, mat } = useMemo(() => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const seed = new Float32Array(count);
    const tint = [new THREE.Color('#ffffff'), new THREE.Color('#cfe0ff'), new THREE.Color('#ffe7c2'), new THREE.Color('#d9c8ff')];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * 36;
      pos[i * 3 + 1] = (r() - 0.5) * 26;
      pos[i * 3 + 2] = -4 - r() * 8;
      const c = tint[Math.floor(r() * tint.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      size[i] = r() < 0.06 ? 3.5 + r() * 2.5 : 1.2 + r() * 1.8;
      seed[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
      vertexShader: `attribute float aSize; attribute float aSeed; attribute vec3 color; uniform float uTime; uniform float uPx; varying float vA; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float tw = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed * 1.6) + aSeed * 50.0);
          vA = tw; vC = color; gl_PointSize = aSize * uPx * (0.75 + 0.25 * tw) * 1.6; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); a *= a; gl_FragColor = vec4(vC, a * vA); }`,
    });
    return { geo, mat };
  }, [count]);
  useFrame((_, dt) => {
    if (!ctx.settings.reducedMotion) mat.uniforms.uTime.value += dt;
    mat.uniforms.uPx.value = gl.getPixelRatio();
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

function Socket({ index, view }: { index: number; view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const [x, y] = SOCKETS[index];
  const core = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const flareH = useRef<THREE.Sprite>(null);
  const flareV = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const label = useRef<THREE.Sprite>(null);
  const mats = useMemo(() => {
    const coreM = new THREE.SpriteMaterial({ map: shapeTexture(index), color: STAR_COLOR, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const haloM = new THREE.SpriteMaterial({ map: softDotTexture(), color: '#ffe2a8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const fH = new THREE.SpriteMaterial({ map: flareTexture(), color: '#fff0cc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const fV = fH.clone();
    fV.rotation = Math.PI / 2;
    const ringM = new THREE.MeshBasicMaterial({ color: hc ? '#ffffff' : '#a9b8ff', transparent: true, opacity: hc ? 0.5 : 0.16, depthWrite: false });
    const pulseM = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    return { coreM, haloM, fH, fV, ringM, pulseM };
  }, [index, hc]);
  const numTex = useMemo(() => numberTexture(index + 1), [index]);
  const outward = useMemo(() => {
    const dx = x;
    const dy = y - RING_Y;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * 0.62, y + (dy / d) * 0.62] as const;
  }, [x, y]);

  useFrame((_, dt) => {
    const gt = ctx.time() / 1000;
    const a = gt - view.ignite[index];
    const on = view.onDur;
    let e = 0;
    if (a >= 0 && a < on + 0.4) {
      const rise = Math.min(1, a / 0.07);
      const fall = 1 - THREE.MathUtils.smoothstep(a, on * 0.55, on + 0.35);
      e = rise * fall;
    }
    const reduced = ctx.settings.reducedMotion;
    const idle = hc ? 0.6 : 0.3;
    mats.coreM.opacity = Math.max(idle, e);
    mats.coreM.color.set(e > 0.05 ? STAR_COLOR : hc ? '#ffffff' : '#b9c4ff');
    const cs = 0.5 + e * 0.32;
    core.current?.scale.set(cs, cs, 1);
    if (core.current) mats.coreM.rotation = reduced ? 0 : a < 2 ? (1 - Math.min(1, a / 1.2)) * 0.6 : 0;
    mats.haloM.opacity = e * 0.62;
    const hs = 1.1 + e * 0.95;
    halo.current?.scale.set(hs, hs, 1);
    // ignition flare: quick streak that settles
    const fl = a >= 0 && a < 0.7 ? Math.pow(1 - a / 0.7, 1.5) : 0;
    const flareK = reduced ? fl * 0.5 : fl;
    mats.fH.opacity = flareK * 0.9 + e * 0.25;
    mats.fV.opacity = flareK * 0.6 + e * 0.15;
    const fw = 1.2 + flareK * 2.2;
    flareH.current?.scale.set(fw, 0.16, 1);
    flareV.current?.scale.set(fw * 0.7, 0.13, 1);
    // hit (gold ring burst) / miss (soft blue ring) pulses
    view.hitPulse[index] = Math.max(0, view.hitPulse[index] - dt * 1.4);
    view.missPulse[index] = Math.max(0, view.missPulse[index] - dt * 0.9);
    const hp = view.hitPulse[index];
    const mp = view.missPulse[index];
    if (pulse.current) {
      const k = hp > 0 ? 1 - hp : 1 - mp;
      const s = 0.8 + k * (hp > 0 ? 1.4 : 0.5);
      pulse.current.scale.set(s, s, 1);
      mats.pulseM.opacity = hp > 0 ? hp * 0.9 : mp * 0.5;
      mats.pulseM.color.set(hp > 0 ? GOLD : '#8fb8ff');
    }
    mats.ringM.opacity = (hc ? 0.5 : 0.16) + e * 0.3;
    if (label.current) label.current.visible = ctx.settings.showKeyHints;
  });

  return (
    <group position={[x, y, 0]}>
      <mesh ref={ring} material={mats.ringM}>
        <ringGeometry args={[0.36, 0.385, 48]} />
      </mesh>
      <mesh ref={pulse} material={mats.pulseM}>
        <ringGeometry args={[0.4, 0.46, 48]} />
      </mesh>
      <sprite ref={halo} material={mats.haloM} />
      <sprite ref={flareH} material={mats.fH} />
      <sprite ref={flareV} material={mats.fV} />
      <sprite ref={core} material={mats.coreM} scale={[0.5, 0.5, 1]} />
      <sprite ref={label} position={[outward[0] - x, outward[1] - y, 0]} scale={[0.36, 0.36, 1]}>
        <spriteMaterial map={numTex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

function Constellation({ view }: { view: View }) {
  const ctx = useGame();
  const data = CONSTELLATIONS[view.constellation];
  const group = useRef<THREE.Group>(null);
  const pts = useMemo(() => data.pts.map(([px, py]) => new THREE.Vector3(px * CONST_SCALE * 0.95, RING_Y + py * CONST_SCALE * 0.85, -0.4)), [data]);
  const edgeState = useRef<Float32Array>(new Float32Array(data.edges.length));
  const edgeMeshes = useRef<Array<{ core: THREE.Mesh | null; glow: THREE.Mesh | null }>>(data.edges.map(() => ({ core: null, glow: null })));
  const pointRefs = useRef<Array<THREE.Sprite | null>>([]);
  const pen = useRef<THREE.Sprite>(null);
  const mats = useMemo(
    () =>
      data.edges.map(() => ({
        core: new THREE.MeshBasicMaterial({ color: '#ffe6ad', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
        glow: new THREE.MeshBasicMaterial({ map: glowLineTexture(), color: GOLD, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      })),
    [data],
  );
  const pointMats = useMemo(
    () => data.pts.map(() => new THREE.SpriteMaterial({ map: softDotTexture(), color: '#fff0cc', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })),
    [data],
  );
  const planeGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const reduced = ctx.settings.reducedMotion;
    view.fadeIn = Math.min(1, view.fadeIn + dt * 0.8);
    let alpha = view.fadeIn;
    // finale: the figure comes alive and leaps/swims across the sky
    if (view.finale) {
      view.finaleT += dt;
      const t = view.finaleT;
      if (reduced) {
        g.position.set(0, 0, 0);
        g.scale.setScalar(1);
        alpha = 1 - THREE.MathUtils.smoothstep(t, 2.2, 3.0);
      } else {
        const p = clamp((t - 0.7) / 2.1, 0, 1);
        const e = easeInOutSine(p);
        const antic = t < 0.7 ? -Math.sin((t / 0.7) * Math.PI) * 0.15 : 0;
        g.position.set(antic + e * 5.5, Math.sin(p * Math.PI) * 1.2 + Math.sin(t * 5) * 0.04 * (1 - p), 0);
        const s = 1 + Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.08 - p * 0.25;
        g.scale.setScalar(s);
        g.rotation.z = -Math.sin(p * Math.PI) * 0.18;
        alpha = 1 - THREE.MathUtils.smoothstep(p, 0.65, 1);
      }
    } else {
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
      g.rotation.z = 0;
    }
    const es = edgeState.current;
    let tipEdge = -1;
    for (let k = 0; k < data.edges.length; k++) {
      const revealed = k < view.revealed;
      const target = revealed || view.finale ? 1 : 0;
      if (es[k] < target) {
        es[k] = Math.min(1, es[k] + dt / (view.finale && !revealed ? 0.9 : 0.45));
        if (es[k] < 1 && tipEdge < 0) tipEdge = k;
      }
      const m = edgeMeshes.current[k];
      const [a, b] = data.edges[k];
      const A = pts[a];
      const B = pts[b];
      const len = A.distanceTo(B);
      const p = easeOutCubic(es[k]);
      const ang = Math.atan2(B.y - A.y, B.x - A.x);
      tmp.copy(B).sub(A).multiplyScalar(p / 2).add(A);
      const bright = revealed ? 1 : 0.4;
      placeQuad(m.core, tmp, ang, len * p, 0.028);
      placeQuad(m.glow, tmp, ang, len * p, 0.26);
      mats[k].core.opacity = op0(p) * 0.95 * bright * alpha;
      mats[k].glow.opacity = op0(p) * 0.55 * bright * alpha;
    }
    // pen tip glow while a filament draws
    if (pen.current) {
      const pm = pen.current.material as THREE.SpriteMaterial;
      if (tipEdge >= 0) {
        const [a, b] = data.edges[tipEdge];
        pen.current.position.copy(pts[a]).lerp(pts[b], easeOutCubic(es[tipEdge]));
        pm.opacity = 0.9 * alpha;
      } else pm.opacity = Math.max(0, pm.opacity - dt * 3);
    }
    // points brighten when an incident edge is lit
    for (let i = 0; i < pts.length; i++) {
      let lit = 0;
      for (let k = 0; k < data.edges.length; k++) {
        const [a, b] = data.edges[k];
        if (a === i || b === i) lit = Math.max(lit, es[k] * (k < view.revealed ? 1 : 0.5));
      }
      pointMats[i].opacity = (0.2 + lit * 0.8) * alpha;
      const sp = pointRefs.current[i];
      if (sp) {
        const s = 0.22 + lit * 0.2;
        sp.scale.set(s, s, 1);
      }
    }
  });

  return (
    <group ref={group}>
      {data.edges.map((_, k) => (
        <group key={k}>
          <mesh ref={(el) => (edgeMeshes.current[k].glow = el)} geometry={planeGeo} material={mats[k].glow} position={[0, 0, -0.41]} visible={false} />
          <mesh ref={(el) => (edgeMeshes.current[k].core = el)} geometry={planeGeo} material={mats[k].core} position={[0, 0, -0.4]} visible={false} />
        </group>
      ))}
      {pts.map((p, i) => (
        <sprite key={i} ref={(el) => (pointRefs.current[i] = el)} position={p} material={pointMats[i]} scale={[0.22, 0.22, 1]} />
      ))}
      <sprite ref={pen} scale={[0.7, 0.7, 1]}>
        <spriteMaterial map={softDotTexture()} color="#fff4d0" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

function placeQuad(mesh: THREE.Mesh | null, at: THREE.Vector3, ang: number, len: number, w: number) {
  if (!mesh) return;
  mesh.position.x = at.x;
  mesh.position.y = at.y;
  mesh.rotation.z = ang;
  mesh.scale.set(Math.max(0.0001, len), w, 1);
  mesh.visible = len > 0.001;
}

const op0 = (p: number) => (p > 0.001 ? 1 : 0);

function Puffs({ view }: { view: View }) {
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  const mats = useMemo(
    () => Array.from({ length: 4 }, () => new THREE.SpriteMaterial({ map: softDotTexture(), color: '#9aa6d8', transparent: true, opacity: 0, depthWrite: false })),
    [],
  );
  useFrame((_, dt) => {
    for (const p of view.puffs) p.t += dt;
    while (view.puffs.length && view.puffs[0].t > 1.6) view.puffs.shift();
    for (let k = 0; k < 4; k++) {
      const s = refs.current[k];
      const p = view.puffs[k];
      if (!s) continue;
      if (!p) {
        mats[k].opacity = 0;
        continue;
      }
      const [x, y] = SOCKETS[p.pos];
      s.position.set(x, y + p.t * 0.25, 0.2);
      const sc = 0.8 + p.t * 1.1;
      s.scale.set(sc * 1.3, sc, 1);
      mats[k].opacity = Math.max(0, 1 - p.t / 1.6) * 0.45;
    }
  });
  return (
    <>
      {mats.map((m, k) => (
        <sprite key={k} ref={(el) => (refs.current[k] = el)} material={m} />
      ))}
    </>
  );
}
