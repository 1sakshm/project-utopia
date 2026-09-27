import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, damp } from '@/sdk';
import { mountR3F, useGame, GameEffects, GradientSky, Motes, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { PACES, PHASE_WORDS, BLOOM_EVERY, BLOOM_SPOTS, GRACE, SYNC_THRESHOLD, breathAt, type PaceId, type PhaseKind } from './logic';

type InputMode = 'hold' | 'toggle' | 'watch';
interface Config {
  minutes: number;
  pace: PaceId;
  mode: InputMode;
}

const MAX_RIPPLES = 8;

interface Distraction {
  active: boolean;
  kind: 'leaf' | 'firefly';
  t0: number;
  dur: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  dissolveT0: number;
  subtle: number;
  key: number;
}

class View {
  /** Guide openness (0..1) and the input state. */
  guide = 0.15;
  pressed = false;
  kind: PhaseKind = 'in';
  ruffle = 0;
  ripples = new Float32Array(MAX_RIPPLES * 4);
  rNext = 0;
  blooms: Array<{ spot: number; t0: number }> = [];
  distraction: Distraction = { active: false, kind: 'leaf', t0: 0, dur: 1, x0: 0, z0: 0, x1: 0, z1: 0, y: 0, dissolveT0: -1, subtle: 0, key: 0 };
  suppress = false;
  showGuideRing = false;
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
  constructor() {
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples[i * 4 + 2] = -1e6;
  }
}

export default function create(ctx: GameContext): GameInstance {
  const view = new View();
  const rng = ctx.rng;
  const preview = ctx.mode === 'preview';
  const burstRef: { current: BurstHandle | null } = { current: null };
  const sessions = ctx.storage.get<number>('sessions', 0);
  const subtle = clamp(sessions / 6, 0, 1);

  let alive = true;
  let active = false;
  let finished = false;
  let cfg: Config = ctx.storage.get<Config>('config', { minutes: 3, pace: '4-6', mode: 'hold' });
  if (preview) cfg = { minutes: 99, pace: '4-4', mode: 'hold' };
  let t0 = 0;
  let lastCycle = 0;
  let lastIndex = -1;
  let evalT = 0;
  let matchT = 0;
  let breaths = 0;
  let synced = 0;
  let noticed = 0;
  let nextDistraction = 0;
  let rippleTimer = 0;
  let stopAmbient: (() => void) | null = null;
  const liveNodes = new Set<OscillatorNode>();

  // ---------------------------------------------------------------- DOM
  const guideEl = document.createElement('div');
  guideEl.className = 'u-game-text';
  guideEl.style.cssText =
    'bottom:calc(46px + env(safe-area-inset-bottom));font-size:1.35rem;letter-spacing:0.04em;opacity:0;transition:opacity 0.8s ease;font-weight:600;';
  const subEl = document.createElement('div');
  subEl.style.cssText = 'font-size:0.8rem;font-weight:600;opacity:0.7;margin-top:4px;letter-spacing:0.02em;';
  const wordEl = document.createElement('div');
  guideEl.append(wordEl, subEl);
  ctx.container.appendChild(guideEl);
  let setupEl: HTMLDivElement | null = null;

  function setGuide(word: string, sub = '') {
    wordEl.textContent = word;
    subEl.textContent = sub;
    guideEl.style.opacity = word ? '1' : '0';
  }

  function showSetup() {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(360px,92%);padding:18px 16px 14px;border-radius:24px;background:rgba(6,10,28,0.72);border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;text-align:center;font-family:Manrope,system-ui,sans-serif;z-index:6;';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const title = document.createElement('div');
    title.textContent = 'Still Water';
    title.style.cssText = 'font-weight:800;font-size:1.25rem;margin-bottom:2px;';
    const sub = document.createElement('div');
    sub.textContent = 'Choose your practice';
    sub.style.cssText = 'font-size:0.82rem;opacity:0.7;margin-bottom:10px;';
    el.append(title, sub);
    const row = <T extends string | number>(label: string, opts: Array<[T, string]>, get: () => T, set: (v: T) => void) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin:8px 0;';
      const l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = 'font-size:0.72rem;text-transform:uppercase;letter-spacing:0.12em;opacity:0.6;margin-bottom:5px;';
      const r = document.createElement('div');
      r.setAttribute('role', 'group');
      r.setAttribute('aria-label', label);
      r.style.cssText = 'display:flex;gap:6px;';
      const btns: HTMLButtonElement[] = [];
      const paint = () =>
        btns.forEach((b, i) => {
          const on = opts[i][0] === get();
          b.setAttribute('aria-pressed', String(on));
          b.style.background = on ? 'rgba(244,179,220,0.3)' : 'rgba(12,14,26,0.55)';
          b.style.borderColor = on ? '#f4b3dc' : 'rgba(255,255,255,0.18)';
        });
      for (const [v, text] of opts) {
        const b = document.createElement('button');
        b.className = 'u-game-btn';
        b.textContent = text;
        b.style.cssText = 'flex:1;min-width:0;padding:0 6px;font-size:0.82rem;transform:none;position:relative;';
        b.onclick = () => {
          set(v);
          paint();
          ctx.audio.tick();
        };
        btns.push(b);
        r.appendChild(b);
      }
      paint();
      wrap.append(l, r);
      el.appendChild(wrap);
    };
    row<number>('Length', [[2, '2 min'], [3, '3 min'], [5, '5 min']], () => cfg.minutes, (v) => (cfg = { ...cfg, minutes: v }));
    row<PaceId>('Pace', [['4-4', '4 · 4'], ['4-6', '4 · 6'], ['box', 'Box']], () => cfg.pace, (v) => (cfg = { ...cfg, pace: v }));
    row<InputMode>('Breathe by', [['hold', 'Hold'], ['toggle', 'Tap on/off'], ['watch', 'Just watch']], () => cfg.mode, (v) => (cfg = { ...cfg, mode: v }));
    const go = document.createElement('button');
    go.className = 'u-game-btn';
    go.textContent = 'Begin';
    go.style.cssText = 'width:100%;margin-top:10px;font-size:1rem;transform:none;position:relative;background:rgba(244,179,220,0.35);border-color:#f4b3dc;';
    go.onclick = () => {
      ctx.storage.set('config', cfg);
      el.remove();
      setupEl = null;
      begin();
    };
    const note = document.createElement('div');
    note.textContent = 'If breathing exercises feel uncomfortable, breathe naturally or choose Just watch.';
    note.style.cssText = 'font-size:0.7rem;opacity:0.55;margin-top:10px;line-height:1.35;';
    el.append(go, note);
    ctx.container.appendChild(el);
    setupEl = el;
    go.focus();
  }

  // ---------------------------------------------------------------- audio
  function breathTone(up: boolean, dur: number) {
    const ac = ctx.audio.raw;
    const out = ctx.audio.sfxOut;
    if (!ac || !out) return;
    const now = ac.currentTime;
    const f0 = ctx.audio.midi(up ? 57 : 64);
    const f1 = ctx.audio.midi(up ? 64 : 57);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.05, now + Math.min(1, dur * 0.3));
    g.gain.setValueAtTime(0.05, now + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, now + dur);
    g.connect(out);
    for (const [mul, gain] of [
      [1, 1],
      [1.5, 0.35],
    ] as const) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0 * mul, now);
      o.frequency.exponentialRampToValueAtTime(f1 * mul, now + dur);
      const og = ac.createGain();
      og.gain.value = gain;
      o.connect(og).connect(g);
      o.start(now);
      o.stop(now + dur + 0.05);
      liveNodes.add(o);
      o.onended = () => liveNodes.delete(o);
    }
  }
  function stopTones() {
    liveNodes.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    });
    liveNodes.clear();
  }

  // ---------------------------------------------------------------- ripples / blooms / distractions
  function ripple(x: number, z: number, strength = 1) {
    if (ctx.settings.reducedMotion) return;
    const i = view.rNext;
    view.rNext = (view.rNext + 1) % MAX_RIPPLES;
    view.ripples[i * 4] = x;
    view.ripples[i * 4 + 1] = z;
    view.ripples[i * 4 + 2] = ctx.time() / 1000;
    view.ripples[i * 4 + 3] = strength;
  }

  function bloom() {
    const used = new Set(view.blooms.map((b) => b.spot));
    const free = BLOOM_SPOTS.map((_, i) => i).filter((i) => !used.has(i));
    if (!free.length) {
      if (preview) {
        view.blooms = [];
        view.bump();
      }
      return;
    }
    const spot = free[0];
    view.blooms.push({ spot, t0: ctx.time() });
    view.bump();
    const [x, z] = BLOOM_SPOTS[spot];
    ctx.audio.bell(ctx.audio.midi(76 + [0, 2, 4, 7, 9][view.blooms.length % 5]), { gain: 0.07, dur: 2.5 });
    ctx.caption('Soft bell: a new lotus blooms');
    burstRef.current?.burst([x, 0.3, z], 24, { color: '#ffe6b0', speed: 0.8, life: 1.6, gravity: -0.3 });
    ripple(x, z, 0.8);
  }

  function spawnDistraction() {
    const kind: 'leaf' | 'firefly' = rng.chance(0.5) ? 'leaf' : 'firefly';
    const fromLeft = rng.chance(0.5);
    const zA = -1.6 + rng.next() * 3.2;
    view.distraction = {
      active: true,
      kind,
      t0: ctx.time(),
      dur: (preview ? 12000 : 17000) + rng.next() * 5000,
      x0: (fromLeft ? -1 : 1) * (preview ? 2.6 : 4.6),
      x1: fromLeft ? 4.6 : -4.6,
      z0: zA,
      z1: clamp(zA + (rng.next() - 0.5) * 2, -2, 2.2),
      y: kind === 'leaf' ? 0.02 : 0.9 + rng.next() * 0.7,
      dissolveT0: -1,
      subtle: preview ? 0 : subtle,
      key: view.distraction.key + 1,
    };
    view.bump();
    if (preview) ctx.after(2600 + rng.next() * 800, () => notice());
  }

  function distractionPos(out: THREE.Vector3, now: number) {
    const d = view.distraction;
    const t = clamp((now - d.t0) / d.dur, 0, 1);
    const s = (now - d.t0) / 1000;
    out.set(d.x0 + (d.x1 - d.x0) * t, d.y, d.z0 + (d.z1 - d.z0) * t);
    if (d.kind === 'firefly') {
      out.y += Math.sin(s * 1.1) * 0.25;
      out.z += Math.sin(s * 0.7 + 1) * 0.35;
    } else out.z += Math.sin(s * 0.4) * 0.15;
    return out;
  }
  const tmpV = new THREE.Vector3();

  function notice() {
    const d = view.distraction;
    if (!d.active || d.dissolveT0 >= 0) return;
    const now = ctx.time();
    // Must be on screen (inside the pond area) to be noticed.
    distractionPos(tmpV, now);
    if (Math.abs(tmpV.x) > 3.2) return;
    d.dissolveT0 = now;
    noticed++;
    ctx.audio.chime(ctx.audio.midi(81), { gain: 0.06, dur: 2 });
    ctx.haptics.tick();
    ctx.announce('Noticed. Back to the breath.');
    ctx.caption('Soft chime: noticed');
    burstRef.current?.burst([tmpV.x, tmpV.y + 0.05, tmpV.z], 26, { color: d.kind === 'leaf' ? '#ffd08a' : '#fff3a0', speed: 0.7, life: 1.4, gravity: -0.2 });
    if (d.kind === 'leaf') ripple(tmpV.x, tmpV.z, 0.7);
  }

  // ---------------------------------------------------------------- input
  function press() {
    if (!active || cfg.mode === 'watch') return;
    if (cfg.mode === 'toggle') view.pressed = !view.pressed;
    else view.pressed = true;
    ctx.haptics.tick();
  }
  function release() {
    if (cfg.mode === 'hold') view.pressed = false;
  }
  ctx.container.addEventListener(
    'pointerdown',
    () => {
      if (preview || ctx.isPaused()) return;
      if (view.suppress) {
        view.suppress = false;
        return;
      }
      press();
    },
    { signal: ctx.signal },
  );
  const up = () => {
    if (preview) return;
    release();
  };
  ctx.container.addEventListener('pointerup', up, { signal: ctx.signal });
  ctx.container.addEventListener('pointercancel', up, { signal: ctx.signal });
  ctx.container.addEventListener('pointerleave', up, { signal: ctx.signal });
  ctx.keys({
    Space: (e) => {
      if (e.repeat) return;
      press();
    },
    KeyN: () => notice(),
    Enter: () => notice(),
  });
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code !== 'Space' || preview) return;
      release();
    },
    { signal: ctx.signal },
  );
  window.addEventListener('blur', () => release(), { signal: ctx.signal });

  function onDistractionTap() {
    if (preview || ctx.isPaused() || !active) return;
    view.suppress = true;
    notice();
  }

  // ---------------------------------------------------------------- session
  function begin() {
    active = true;
    t0 = ctx.time();
    lastCycle = 0;
    lastIndex = -1;
    evalT = 0;
    matchT = 0;
    view.showGuideRing = cfg.mode !== 'watch';
    nextDistraction = ctx.time() + (preview ? 2200 : 16000 + rng.next() * 10000);
    view.bump();
    if (!preview && sessions === 0) ctx.announce('Hold while the lotus opens. Release as it closes.');
  }

  function endBreath() {
    if (cfg.mode === 'watch') {
      breaths++;
      if (breaths % BLOOM_EVERY === 0) bloom();
      return;
    }
    if (evalT < 1) return;
    breaths++;
    const ok = matchT / evalT >= SYNC_THRESHOLD;
    ctx.trial({ correct: ok });
    if (ok) {
      synced++;
      if (synced % (preview ? 2 : BLOOM_EVERY) === 0) bloom();
    }
  }

  async function finish() {
    active = false;
    finished = true;
    view.pressed = false;
    view.showGuideRing = false;
    view.bump();
    setGuide('Welcome back to stillness.', '');
    ctx.storage.set('sessions', sessions + 1);
    // The pond blooms fully.
    const used = new Set(view.blooms.map((b) => b.spot));
    const free = BLOOM_SPOTS.map((_, i) => i).filter((i) => !used.has(i));
    for (const spot of free) {
      await ctx.wait(ctx.settings.reducedMotion ? 60 : 280);
      if (!alive) return;
      view.blooms.push({ spot, t0: ctx.time() });
      view.bump();
      ctx.audio.bell(ctx.audio.midi(72 + [0, 4, 7, 11, 14][spot % 5]), { gain: 0.04, dur: 2.5 });
    }
    await ctx.wait(3200);
    if (!alive) return;
    ctx.end({
      score: synced,
      levelReached: 1,
      stats: { inSync: synced, breaths, noticed },
      message: 'Welcome back to stillness.',
    });
  }

  ctx.loop((dt) => {
    const now = ctx.time();
    const sec = dt / 1000;
    view.ruffle = Math.max(0, view.ruffle - sec * 0.35);
    if (!active) {
      // Idle: the lotus rests, breathing very softly.
      if (!finished) view.guide = 0.25 + Math.sin(now / 1600) * 0.08;
      else view.guide += (1 - view.guide) * damp(1, sec);
      return;
    }
    const phases = PACES[cfg.pace].phases;
    const el = (now - t0) / 1000;
    const b = breathAt(phases, el);
    view.guide = b.open;
    view.kind = b.kind;
    if (b.cycle !== lastCycle) {
      endBreath();
      lastCycle = b.cycle;
      evalT = 0;
      matchT = 0;
      if (!preview && el >= cfg.minutes * 60) {
        void finish();
        return;
      }
    }
    if (b.index !== lastIndex) {
      lastIndex = b.index;
      const word = PHASE_WORDS[b.kind];
      const hint =
        cfg.mode === 'watch' ? '' : cfg.mode === 'toggle' ? (b.hold ? 'tap to begin holding' : 'tap to let go') : b.hold ? (b.kind === 'in' ? 'touch & hold' : 'keep holding') : b.kind === 'out' ? 'release' : 'stay released';
      setGuide(word, breaths < 3 || cfg.mode === 'toggle' ? hint : '');
      const dur = phases[b.index].dur;
      if (b.kind === 'in') breathTone(true, dur);
      else if (b.kind === 'out') breathTone(false, dur);
      ctx.caption(word);
      if (!ctx.settings.reducedMotion && (b.kind === 'in' || b.kind === 'out')) ripple(0, 0, 0.35);
    }
    // Ghost: follows the guide with a gentle human lag.
    if (preview) {
      const lag = 0.35;
      const g = breathAt(phases, el - lag);
      view.pressed = g.hold;
    }
    if (cfg.mode !== 'watch' && b.since > GRACE) {
      evalT += sec;
      const match = view.pressed === b.hold;
      if (match) matchT += sec;
      else {
        view.ruffle = Math.min(1, view.ruffle + sec * 1.2);
        rippleTimer -= sec;
        if (rippleTimer <= 0) {
          rippleTimer = 1.1;
          const a = rng.next() * Math.PI * 2;
          ripple(Math.cos(a) * (0.6 + rng.next()), Math.sin(a) * (0.6 + rng.next()), 0.6);
        }
      }
    }
    // Distractions
    const d = view.distraction;
    if (d.active) {
      const gone = d.dissolveT0 >= 0 ? now - d.dissolveT0 > 1600 : now - d.t0 > d.dur;
      if (gone) {
        d.active = false;
        view.bump();
        nextDistraction = now + (preview ? 9000 : 15000 + rng.next() * 15000);
      }
    } else if (now >= nextDistraction) spawnDistraction();
    ctx.hud.set({ progress: preview ? undefined : clamp(el / (cfg.minutes * 60), 0, 1) });
  });

  stopAmbient = null;
  const unmount = mountR3F(ctx, <Scene view={view} burstRef={burstRef} onDistractionTap={onDistractionTap} distractionPos={distractionPos} />, {
    camera: { position: [0, 2, 12], fov: 45 },
    background: ctx.manifest.palette.bg,
  });

  return {
    start() {
      stopAmbient = ctx.audio.ambient([48, 55, 62, 66, 69], { gain: 0.05, brightness: 0.2 });
      ctx.hud.set({});
      if (preview) begin();
      else showSetup();
    },
    onPause() {
      stopTones();
      view.pressed = cfg.mode === 'toggle' ? view.pressed : false;
    },
    destroy() {
      alive = false;
      active = false;
      stopTones();
      stopAmbient?.();
      setupEl?.remove();
      guideEl.remove();
      unmount();
    },
  };
}

// ---------------------------------------------------------------- scene

function Scene({
  view,
  burstRef,
  onDistractionTap,
  distractionPos,
}: {
  view: View;
  burstRef: { current: BurstHandle | null };
  onDistractionTap: () => void;
  distractionPos: (out: THREE.Vector3, now: number) => THREE.Vector3;
}) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  return (
    <>
      <CameraRig />
      <GradientSky top="#03050f" bottom="#1c2452" />
      <Sky />
      <group scale={[1, -1, 1]}>
        <Sky mirror />
      </group>
      <MainLotus view={view} />
      {view.blooms.map((b) => (
        <SmallLotus key={b.spot} spot={b.spot} t0={b.t0} />
      ))}
      <Pads />
      <Water view={view} />
      <GuideRing view={view} />
      <DistractionActor key={view.distraction.key} view={view} onTap={onDistractionTap} distractionPos={distractionPos} />
      {!hc && (
        <group position={[0, 1.1, -1]}>
          <Motes count={36} area={[10, 1.6, 7]} color="#ffe6b0" size={0.05} speed={0.08} />
        </group>
      )}
      <ParticleBurst
        ref={(h) => {
          burstRef.current = h;
        }}
        max={200}
        size={0.08}
      />
      <GameEffects bloom={0.9} threshold={0.4} grain={false} />
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
    const dist = Math.max(7.5, 2.9 / (halfV * aspect));
    const elev = THREE.MathUtils.degToRad(13);
    const sway = ctx.settings.reducedMotion ? 0 : Math.sin(t.current * 0.05) * 0.25;
    cam.position.set(sway, Math.sin(elev) * dist + 0.4, Math.cos(elev) * dist);
    cam.lookAt(0, 0.35, 0);
  });
  return null;
}

// ---------------------------------------------------------------- sky + mirror

function Sky({ mirror = false }: { mirror?: boolean }) {
  const ctx = useGame();
  const n = Math.floor(420 * Math.max(0.5, ctx.quality.particleScale));
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    const sz = new Float32Array(n);
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const el = Math.asin(0.03 + r() * 0.97) * 0.95;
      const R = 40;
      pos[i * 3] = Math.cos(a) * Math.cos(el) * R;
      pos[i * 3 + 1] = Math.sin(el) * R;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * R - 6;
      ph[i] = r() * 100;
      sz[i] = 0.15 + Math.pow(r(), 5) * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uDim: { value: 1 } },
      vertexShader: `attribute float aPhase; attribute float aSize; uniform float uTime; uniform float uScale; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uScale / -mv.z); vA = 0.65 + 0.35 * sin(uTime * (0.3 + fract(aPhase) * 0.6) + aPhase); }`,
      fragmentShader: `uniform float uDim; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), pow(1.0 - d, 2.0) * vA * uDim); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo, mat };
  }, [n]);
  const { size, viewport } = useThree();
  useFrame((state) => {
    mat.uniforms.uTime.value = ctx.settings.reducedMotion ? 0 : state.clock.elapsedTime;
    mat.uniforms.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(22.5)));
    mat.uniforms.uDim.value = mirror ? 0.8 : 1;
  });
  return (
    <>
      <points geometry={geo} material={mat} frustumCulled={false} />
      {!mirror && (
        <group position={[4.5, 9.5, -40]}>
          <mesh>
            <sphereGeometry args={[0.9, 32, 16]} />
            <meshBasicMaterial color="#fff4dc" fog={false} />
          </mesh>
          <sprite scale={[7, 7, 1]}>
            <spriteMaterial map={softDotTexture()} color="#ffe6b0" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      )}
      {/* soft horizon haze */}
      <sprite position={[0, 1.5, -26]} scale={[70, 10, 1]}>
        <spriteMaterial map={softDotTexture()} color="#4a4f9a" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </>
  );
}

// ---------------------------------------------------------------- water

const waterFrag = /* glsl */ `
  uniform float uTime; uniform float uRuffle; uniform float uHC; uniform vec4 uRip[${MAX_RIPPLES}]; uniform vec3 uMoonDir;
  varying vec3 vW;
  void main(){
    vec2 p = vW.xz;
    vec3 v = normalize(cameraPosition - vW);
    // gentle normal from slow swells + ruffle + ripples
    float t = uTime;
    vec2 g = vec2(sin(p.x * 1.3 + t * 0.35) * 0.01 + sin(p.y * 2.1 - t * 0.27) * 0.008, cos(p.y * 1.1 + t * 0.3) * 0.01);
    g += uRuffle * vec2(sin(p.x * 7.0 + p.y * 3.0 + t * 2.3), cos(p.y * 8.0 - p.x * 2.0 + t * 2.0)) * 0.03;
    float ring = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRip[i];
      float age = t - r.z;
      if (age < 0.0 || age > 7.0) continue;
      vec2 dp = p - r.xy;
      float d = length(dp);
      float rad = age * 0.55;
      float w = (d - rad) * 7.0;
      float env = exp(-w * w) * exp(-age * 0.55) * r.w;
      ring += env * (0.6 + 0.4 * sin(w * 3.0));
      g += normalize(dp + 1e-4) * env * 0.12 * cos(w * 2.0);
    }
    vec3 n = normalize(vec3(g.x, 1.0, g.y));
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 deep = vec3(0.015, 0.025, 0.07);
    vec3 horizon = vec3(0.11, 0.13, 0.3);
    float far = smoothstep(4.0, 26.0, length(p - cameraPosition.xz));
    vec3 col = mix(deep, horizon, clamp(fres * 1.2 + far * 0.6, 0.0, 1.0));
    // moon glitter
    vec3 rv = reflect(-v, n);
    float spec = pow(max(dot(rv, uMoonDir), 0.0), 2500.0) * 0.7;
    col += vec3(1.0, 0.92, 0.75) * spec;
    col += vec3(0.75, 0.85, 1.0) * ring * mix(0.22, 0.4, uHC);
    // lower alpha where the mirror should show through (grazing angles)
    float alpha = mix(0.8, 0.5, clamp(fres + far * 0.5, 0.0, 1.0));
    alpha = mix(alpha, 0.9, uHC * 0.6);
    gl_FragColor = vec4(col, alpha);
  }`;

function Water({ view }: { view: View }) {
  const ctx = useGame();
  const mat = useMemo(() => {
    const rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1e6, 0));
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRuffle: { value: 0 },
        uHC: { value: 0 },
        uRip: { value: rip },
        uMoonDir: { value: new THREE.Vector3(4.5, 9.5, -40).normalize() },
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
    });
  }, []);
  useFrame(() => {
    const u = mat.uniforms;
    u.uTime.value = ctx.time() / 1000;
    const rm = ctx.settings.reducedMotion;
    u.uRuffle.value = rm ? 0 : view.ruffle;
    u.uHC.value = ctx.settings.highContrast ? 1 : 0;
    const arr = u.uRip.value as THREE.Vector4[];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      arr[i].set(view.ripples[i * 4], view.ripples[i * 4 + 1], rm ? -1e6 : view.ripples[i * 4 + 2], view.ripples[i * 4 + 3]);
    }
  });
  return (
    <mesh rotation-x={-Math.PI / 2} material={mat} renderOrder={2}>
      <planeGeometry args={[120, 120]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- lotus

const petalVert = /* glsl */ `
  attribute float aL;
  varying float vL; varying vec3 vN; varying vec3 vV;
  void main(){
    vL = aL;
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const petalFrag = /* glsl */ `
  uniform vec3 uBase; uniform vec3 uTip; uniform float uGlow; uniform float uHC; uniform float uDim;
  varying float vL; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float ndv = abs(dot(n, v));
    float fres = pow(1.0 - ndv, 2.0);
    vec3 col = mix(uBase, uTip, smoothstep(0.05, 0.95, vL));
    col *= 0.5 + 0.5 * ndv;
    col += fres * mix(uTip, vec3(1.0), 0.3) * 0.4;
    col += uGlow * vec3(1.0, 0.8, 0.6) * pow(1.0 - vL, 2.0) * 0.7;
    col += uGlow * uTip * 0.06;
    col = mix(col, vec3(1.0), uHC * (0.35 + fres * 0.65));
    gl_FragColor = vec4(col * uDim, 1.0);
  }`;

let glowTex: THREE.Texture | null = null;
/** Smooth gaussian glow (softer falloff than the shared dot, no visible rim). */
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const dx = (x - 63.5) / 64;
      const dy = (y - 63.5) / 64;
      const d2 = dx * dx + dy * dy;
      const a = d2 >= 1 ? 0 : Math.exp(-d2 * 5) * (1 - d2);
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let petalGeo: THREE.BufferGeometry | null = null;
function getPetalGeo() {
  if (petalGeo) return petalGeo;
  const g = new THREE.SphereGeometry(0.5, 16, 12);
  g.scale(0.34, 0.06, 0.62);
  const p = g.attributes.position as THREE.BufferAttribute;
  const aL = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i) + 0.31;
    const l = clamp(z / 0.62, 0, 1);
    y += x * x * 2.2 + l * l * 0.1;
    // pointed tip
    const taper = 1 - Math.pow(l, 3) * 0.65;
    p.setXYZ(i, x * taper, y, z);
    aL[i] = l;
  }
  g.setAttribute('aL', new THREE.BufferAttribute(aL, 1));
  g.computeVertexNormals();
  petalGeo = g;
  return g;
}

interface Layer {
  n: number;
  len: number;
  closed: number;
  open: number;
  off: number;
}
const LAYERS: Layer[] = [
  { n: 9, len: 1.0, closed: 1.15, open: 0.12, off: 0 },
  { n: 9, len: 0.86, closed: 1.3, open: 0.5, off: 0.5 },
  { n: 6, len: 0.64, closed: 1.45, open: 0.95, off: 0.25 },
];
const PETALS = LAYERS.reduce((a, l) => a + l.n, 0);

function usePetalMesh(baseCol: string, tipCol: string) {
  const ctx = useGame();
  return useMemo(() => {
    const geo = getPetalGeo();
    const mk = (dim: number) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBase: { value: new THREE.Color(baseCol) },
          uTip: { value: new THREE.Color(tipCol) },
          uGlow: { value: 0.3 },
          uHC: { value: ctx.settings.highContrast ? 1 : 0 },
          uDim: { value: dim },
        },
        vertexShader: petalVert,
        fragmentShader: petalFrag,
        side: THREE.DoubleSide,
      });
    const mat = mk(1);
    const mmat = mk(0.75);
    const mesh = new THREE.InstancedMesh(geo, mat, PETALS);
    const mirror = new THREE.InstancedMesh(geo, mmat, PETALS);
    mirror.instanceMatrix = mesh.instanceMatrix;
    mesh.frustumCulled = false;
    mirror.frustumCulled = false;
    return { mesh, mirror, mat, mmat };
  }, [baseCol, tipCol, ctx]);
}

const dummy = new THREE.Object3D();
function layoutPetals(mesh: THREE.InstancedMesh, open: number, twist: number) {
  let i = 0;
  for (const L of LAYERS) {
    for (let k = 0; k < L.n; k++) {
      const a = ((k + L.off) / L.n) * Math.PI * 2 + twist;
      const tilt = L.closed + (L.open - L.closed) * open;
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(-tilt, a, 0, 'YXZ');
      const s = L.len * (0.9 + open * 0.1);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i++, dummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function MainLotus({ view }: { view: View }) {
  const ctx = useGame();
  const { mesh, mirror, mat, mmat } = usePetalMesh('#d9679f', '#ffd6ec');
  const open = useRef(0.2);
  const glow = useRef(0.3);
  const halo = useRef<THREE.Sprite>(null);
  const haloM = useRef<THREE.Sprite>(null);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const grp = useRef<THREE.Group>(null);
  const t = useRef(0);
  const coreBase = useMemo(() => new THREE.Color('#ffe2a8'), []);
  useFrame((_, dt) => {
    t.current += dt;
    open.current += (view.guide - open.current) * damp(6, dt);
    const g = 0.25 + open.current * 0.35 + (view.pressed ? 0.2 : 0);
    glow.current += (g - glow.current) * damp(4, dt);
    const rm = ctx.settings.reducedMotion;
    layoutPetals(mesh, open.current, rm ? 0 : t.current * 0.02);
    mat.uniforms.uGlow.value = glow.current;
    mmat.uniforms.uGlow.value = glow.current;
    const hc = ctx.settings.highContrast ? 1 : 0;
    mat.uniforms.uHC.value = hc;
    mmat.uniforms.uHC.value = hc;
    const hs = 1.8 + open.current * 1.2 + (view.pressed ? 0.25 : 0);
    for (const h of [halo.current, haloM.current]) {
      if (!h) continue;
      h.scale.set(hs, hs, 1);
      (h.material as THREE.SpriteMaterial).opacity = 0.12 + glow.current * 0.22;
    }
    if (core.current) core.current.color.copy(coreBase).multiplyScalar(0.8 + glow.current * 0.4);
    if (grp.current) {
      grp.current.position.y = rm ? 0.04 : 0.04 + Math.sin(t.current * 0.6) * 0.012;
      grp.current.scale.setScalar(1 + open.current * 0.12);
    }
  });
  return (
    <group scale={1.9}>
      <group ref={grp}>
        <primitive object={mesh} />
        <mesh position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshBasicMaterial ref={core} color="#ffe2a8" />
        </mesh>
        <sprite ref={halo} position={[0, 0.35, 0]}>
          <spriteMaterial map={glowTexture()} color="#ffc9e6" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      <group scale={[1, -1, 1]}>
        <group position={[0, 0.04, 0]} scale={1.06}>
          <primitive object={mirror} />
        </group>
        <sprite ref={haloM} position={[0, 0.35, 0]}>
          <spriteMaterial map={glowTexture()} color="#ffc9e6" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      <LilyPad x={0} z={0} r={0.85} rot={0.6} />
    </group>
  );
}

const SMALL_COLORS: Array<[string, string]> = [
  ['#c9a2ff', '#f6efff'],
  ['#8fd8ff', '#f0fbff'],
  ['#ffb3a6', '#fff4ee'],
  ['#f4b3dc', '#fff2f9'],
  ['#ffe0a0', '#fffaf0'],
];

function SmallLotus({ spot, t0 }: { spot: number; t0: number }) {
  const ctx = useGame();
  const [x, z, sc] = BLOOM_SPOTS[spot];
  const [b, tip] = SMALL_COLORS[spot % SMALL_COLORS.length];
  const { mesh, mirror, mat, mmat } = usePetalMesh(b, tip);
  const grp = useRef<THREE.Group>(null);
  const mgrp = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  useFrame((state) => {
    const age = (ctx.time() - t0) / 1000;
    const grow = ctx.settings.reducedMotion ? 1 : clamp(age / 2.2, 0, 1);
    const e = 1 - Math.pow(1 - grow, 3);
    const breathe = ctx.settings.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.5 + spot) * 0.05;
    layoutPetals(mesh, 0.15 + e * 0.7 + breathe, spot);
    const s = sc * (0.3 + 0.7 * e);
    grp.current?.scale.setScalar(s);
    mgrp.current?.scale.setScalar(s * 1.05);
    const g = 0.35 + (1 - e) * 0.8;
    mat.uniforms.uGlow.value = g;
    mmat.uniforms.uGlow.value = g;
    if (halo.current) {
      (halo.current.material as THREE.SpriteMaterial).opacity = 0.18 + (1 - e) * 0.4;
    }
  });
  return (
    <group position={[x, 0, z]}>
      <group ref={grp} position={[0, 0.03, 0]}>
        <primitive object={mesh} />
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.11, 12, 8]} />
          <meshBasicMaterial color="#ffe2a8" />
        </mesh>
      </group>
      <group scale={[1, -1, 1]}>
        <group ref={mgrp}>
          <primitive object={mirror} />
        </group>
      </group>
      <sprite ref={halo} position={[0, 0.2, 0]} scale={[sc * 4, sc * 4, 1]}>
        <spriteMaterial map={glowTexture()} color={b} transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <LilyPad x={0} z={0} r={sc * 1.3} rot={spot} />
    </group>
  );
}

function LilyPad({ x, z, r, rot }: { x: number; z: number; r: number; rot: number }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  return (
    <group position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, rot]}>
      <mesh renderOrder={3}>
        <circleGeometry args={[r, 40, 0.25, Math.PI * 2 - 0.5]} />
        <meshBasicMaterial color={hc ? '#1f5c50' : '#10322f'} />
      </mesh>
      <mesh position={[0, 0, 0.002]} renderOrder={3}>
        <ringGeometry args={[r * 0.94, r, 40, 1, 0.25, Math.PI * 2 - 0.5]} />
        <meshBasicMaterial color={hc ? '#bff5e0' : '#2f7a64'} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function Pads() {
  const pads: Array<[number, number, number, number]> = [
    [-3.0, 3.6, 0.75, 1],
    [2.9, 3.9, 0.7, 2],
    [-4.3, -2.7, 0.8, 3],
    [4.4, -3.1, 0.75, 4],
    [1.5, 4.9, 0.6, 5],
    [-1.3, 4.4, 0.5, 6],
    [0.2, -3.0, 0.45, 7],
  ];
  return (
    <>
      {pads.map(([x, z, r, rot], i) => (
        <LilyPad key={i} x={x} z={z} r={r} rot={rot} />
      ))}
    </>
  );
}

/** Breath guide ring on the water: expands with the guide, glows while holding. */
function GuideRing({ view }: { view: View }) {
  const ctx = useGame();
  const guideM = useRef<THREE.MeshBasicMaterial>(null);
  const holdM = useRef<THREE.MeshBasicMaterial>(null);
  const guide = useRef<THREE.Mesh>(null);
  const hold = useRef<THREE.Mesh>(null);
  const shown = useRef(0);
  const holdA = useRef(0);
  useFrame((_, dt) => {
    shown.current += ((view.showGuideRing ? 1 : 0) - shown.current) * damp(2, dt);
    holdA.current += ((view.pressed ? 1 : 0) - holdA.current) * damp(8, dt);
    const r = 2.0 + view.guide * 1.3;
    guide.current?.scale.set(r, r, r);
    hold.current?.scale.set(r, r, r);
    const hc = ctx.settings.highContrast;
    if (guideM.current) guideM.current.opacity = shown.current * (hc ? 0.9 : 0.35);
    if (holdM.current) holdM.current.opacity = shown.current * holdA.current * (hc ? 1 : 0.55);
  });
  return (
    <group position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
      <mesh ref={guide} renderOrder={4}>
        <ringGeometry args={[0.978, 1.0, 128]} />
        <meshBasicMaterial ref={guideM} color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={hold} renderOrder={4}>
        <ringGeometry args={[0.95, 1.05, 96]} />
        <meshBasicMaterial ref={holdM} color="#f4b3dc" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- distractions

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.34, -0.25, 0.3, 0.25, 0, 0.5);
  s.bezierCurveTo(-0.3, 0.25, -0.34, -0.25, 0, -0.5);
  return new THREE.ShapeGeometry(s, 12);
}

function DistractionActor({
  view,
  onTap,
  distractionPos,
}: {
  view: View;
  onTap: () => void;
  distractionPos: (out: THREE.Vector3, now: number) => THREE.Vector3;
}) {
  const ctx = useGame();
  const d = view.distraction;
  const grp = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const leafMat = useRef<THREE.MeshBasicMaterial>(null);
  const bodyMat = useRef<THREE.MeshBasicMaterial>(null);
  const geo = useMemo(() => leafGeometry(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const g = grp.current;
    if (!g) return;
    if (!d.active) {
      g.visible = false;
      return;
    }
    const now = ctx.time();
    distractionPos(v, now);
    g.position.copy(v);
    g.visible = true;
    const life = (now - d.t0) / d.dur;
    let a = clamp(life * 8, 0, 1) * clamp((1 - life) * 8, 0, 1);
    let s = 1 - d.subtle * 0.35;
    if (d.dissolveT0 >= 0) {
      const k = clamp((now - d.dissolveT0) / 1200, 0, 1);
      a *= 1 - k;
      s *= 1 + k * 0.4;
    }
    const baseA = 1 - d.subtle * 0.4;
    g.scale.setScalar(s);
    if (d.kind === 'leaf') {
      g.rotation.set(0, (now / 1000) * 0.15 * (ctx.settings.reducedMotion ? 0 : 1), 0);
      if (leafMat.current) leafMat.current.opacity = a * baseA;
    } else {
      const blink = ctx.settings.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 2.2);
      if (bodyMat.current) bodyMat.current.opacity = a * baseA;
      if (halo.current) (halo.current.material as THREE.SpriteMaterial).opacity = a * baseA * 0.7 * blink;
    }
  });
  if (!d.active) return null;
  const hc = ctx.settings.highContrast;
  return (
    <group ref={grp} visible={false}>
      {d.kind === 'leaf' ? (
        <group rotation-x={-Math.PI / 2}>
          <mesh geometry={geo} scale={0.55} renderOrder={5}>
            <meshBasicMaterial ref={leafMat} color={hc ? '#ffd27a' : '#c9884a'} transparent depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.003]} renderOrder={6}>
            <planeGeometry args={[0.018, 0.5]} />
            <meshBasicMaterial color="#f3c98b" transparent opacity={0.7} depthWrite={false} />
          </mesh>
        </group>
      ) : (
        <>
          <mesh renderOrder={5}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshBasicMaterial ref={bodyMat} color="#fff6c0" transparent depthWrite={false} />
          </mesh>
          <sprite ref={halo} scale={[0.9, 0.9, 1]}>
            <spriteMaterial map={softDotTexture()} color="#ffe98a" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </>
      )}
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          onTap();
        }}
      >
        <sphereGeometry args={[0.75, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}
