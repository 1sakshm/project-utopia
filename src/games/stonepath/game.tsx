import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GameContext, GameInstance } from '@/sdk';
import { tween, easeOutBack, easeInOutSine, damp } from '@/sdk';
import { mountR3F, useGame, GameEffects, GradientSky, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import { levelDef, makePuzzle, keyOf, canMove, applyMove, clone, bestMove, neighbors, scoreFor, type State, type Puzzle } from './logic';

const STONE_COLORS = ['#ffb3c7', '#9fe8d0', '#ffd98a', '#a9c8ff', '#d4b3ff'];
const STONE_R = [0.6, 0.53, 0.47, 0.42, 0.38];
const H = 0.5; // stone thickness (stack step)
const PILLAR_Z = 0.9;
const SESSION = 6;

// ---------------------------------------------------------------- view-model

class View {
  caps: number[] = [3, 2, 1];
  state: State = [[], [], []];
  goal: State = [[], [], []];
  stones = 3;
  held: { id: number; from: number } | null = null;
  pos: THREE.Vector3[] = Array.from({ length: 5 }, () => new THREE.Vector3(0, -20, 0));
  glow = new Float32Array(5);
  wobble = new Float32Array(5);
  pillarFlash = new Float32Array(4);
  mist = 0; // 0 = target visible, 1 = hidden by mist
  mistTarget = 0;
  lotusT = -1; // seconds since bloom, -1 = none
  lotusGolden = false;
  pads: boolean[] = []; // lotus pads collected (true = golden)
  busy = false;
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

function spacing(n: number) {
  return n >= 4 ? 1.4 : 1.8;
}
function stoneScale(n: number) {
  return n >= 4 ? 0.9 : 1;
}
function pillarX(i: number, n: number) {
  return (i - (n - 1) / 2) * spacing(n);
}
function slotPos(i: number, level: number, n: number, out: THREE.Vector3) {
  return out.set(pillarX(i, n), 0.12 + H / 2 + level * H, PILLAR_Z);
}
function pegTop(cap: number) {
  return 0.12 + cap * H + 0.12;
}
function hoverPos(i: number, v: View, out: THREE.Vector3) {
  return out.set(pillarX(i, v.caps.length), pegTop(v.caps[i]) + 0.55, PILLAR_Z);
}

// ---------------------------------------------------------------- game

export default function create(ctx: GameContext): GameInstance {
  const view = new View();
  const rng = ctx.rng;
  const preview = ctx.mode === 'preview';
  const stair = ctx.staircase({ min: 1, max: 12, up: 1, down: 1 });
  if (preview) stair.set(2);
  const burstRef: { current: BurstHandle | null } = { current: null };
  const bowl = ctx.audio.scale(57, 'majorPenta');

  let alive = true;
  let stopAmbient: (() => void) | null = null;
  let puzzle: Puzzle | null = null;
  let history: State[] = [];
  let moves = 0;
  let undoUsed = false;
  let solvedResolve: (() => void) | null = null;
  let puzzleShownAt = 0;
  let firstMoveAt = -1;
  let accepting = false;

  // session stats
  let score = 0;
  let done = 0;
  let golden = 0;
  let extraSum = 0;
  let planSum = 0;
  let maxLevel = stair.level;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  const isReduced = () => ctx.settings.reducedMotion;

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: done / SESSION,
      label: puzzle ? `Moves ${moves} / ${puzzle.min}` : undefined,
    });
  }

  function stoneTone(id: number, gain = 0.12) {
    // singing-bowl-ish: sine body + bell partial; larger stones sing lower
    const f = bowl(4 - id + 2);
    ctx.audio.bell(f, { gain, dur: 2.2 });
    ctx.audio.tone(f * 0.5, { gain: gain * 0.5, dur: 1.6, type: 'sine', attack: 0.02 });
  }
  function woodLift() {
    ctx.audio.noise({ dur: 0.12, filter: 900, q: 2, gain: 0.05 });
    ctx.audio.pluck(ctx.audio.midi(52), { gain: 0.06, dur: 0.15 });
  }
  function stoneClick() {
    ctx.audio.tone(ctx.audio.midi(76), { gain: 0.07, dur: 0.06, type: 'triangle' });
    ctx.audio.noise({ dur: 0.05, filter: 2400, q: 4, gain: 0.05 });
  }

  // --- action queue so rapid taps / drags are processed in order
  const queue: Array<() => Promise<void>> = [];
  let running = false;
  async function pump() {
    if (running) return;
    running = true;
    while (queue.length && alive) {
      const a = queue.shift()!;
      view.busy = true;
      await a();
      view.busy = false;
    }
    running = false;
  }
  function enqueue(a: () => Promise<void>) {
    if (queue.length > 2) return;
    queue.push(a);
    void pump();
  }

  async function animateTo(id: number, to: THREE.Vector3, ms: number, arc = 0, ease = easeInOutSine) {
    const p = view.pos[id];
    if (isReduced() || ms <= 0) {
      p.copy(to);
      return;
    }
    const from = p.clone();
    const target = to.clone();
    await tween(
      ctx,
      ms,
      (t) => {
        p.lerpVectors(from, target, t);
        p.y += Math.sin(Math.PI * t) * arc;
      },
      ease,
    );
  }

  function tapPillar(i: number) {
    if (!accepting || !puzzle || i >= view.caps.length) return;
    enqueue(() => doTap(i));
  }

  async function doTap(i: number) {
    if (!accepting || !puzzle) return;
    const s = view.state;
    if (!view.held) {
      if (!s[i].length) {
        ctx.audio.thunk({ gain: 0.12 });
        view.pillarFlash[i] = 0.6;
        return;
      }
      const id = s[i][s[i].length - 1];
      view.held = { id, from: i };
      if (firstMoveAt < 0) firstMoveAt = ctx.time();
      woodLift();
      ctx.haptics.tick();
      await animateTo(id, hoverPos(i, view, tmpA), 200, 0, easeOutBack);
      return;
    }
    const { id, from } = view.held;
    if (i === from) {
      view.held = null;
      await animateTo(id, slotPos(from, s[from].length - 1, view.caps.length, tmpA), 170);
      stoneClick();
      return;
    }
    if (!canMove(s, view.caps, from, i)) {
      ctx.audio.thunk({ gain: 0.18 });
      ctx.haptics.error();
      ctx.caption('That pillar is full');
      view.wobble[id] = 1;
      view.pillarFlash[i] = 1;
      return;
    }
    history.push(clone(s));
    view.state = applyMove(s, from, i);
    view.held = null;
    moves++;
    hud();
    const n = view.caps.length;
    await animateTo(id, hoverPos(i, view, tmpA), 300, 0.5);
    await animateTo(id, slotPos(i, view.state[i].length - 1, n, tmpB), 170, 0, (t) => t * t);
    stoneClick();
    stoneTone(id, 0.07);
    view.glow[id] = 0.8;
    view.pillarFlash[i] = 0.5;
    ctx.haptics.tick();
    if (keyOf(view.state) === keyOf(view.goal)) {
      accepting = false;
      solvedResolve?.();
    }
  }

  function undo() {
    if (!accepting || !puzzle) return;
    enqueue(async () => {
      if (view.held) {
        const { id, from } = view.held;
        view.held = null;
        await animateTo(id, slotPos(from, view.state[from].length - 1, view.caps.length, tmpA), 170);
        return;
      }
      const prev = history.pop();
      if (!prev) return;
      undoUsed = true;
      moves = Math.max(0, moves - 1);
      view.state = prev;
      ctx.audio.noise({ dur: 0.25, filter: 700, sweepTo: 300, gain: 0.05 });
      ctx.caption('Undo');
      hud();
      await settleAll(220);
    });
  }

  function reset() {
    if (!accepting || !puzzle) return;
    enqueue(async () => {
      view.held = null;
      if (keyOf(view.state) === keyOf(puzzle!.start)) return;
      undoUsed = true;
      history = [];
      moves = 0;
      view.state = clone(puzzle!.start);
      ctx.audio.noise({ dur: 0.4, filter: 500, sweepTo: 1200, gain: 0.05 });
      ctx.caption('Puzzle reset');
      hud();
      await settleAll(320);
    });
  }

  function putBack() {
    if (!view.held || !accepting) return;
    const from = view.held.from;
    enqueue(() => doTap(from));
  }

  async function settleAll(ms: number) {
    const n = view.caps.length;
    const jobs: Promise<void>[] = [];
    view.state.forEach((p, i) =>
      p.forEach((id, lv) => {
        jobs.push(animateTo(id, slotPos(i, lv, n, new THREE.Vector3()), ms, 0.25));
      }),
    );
    await Promise.all(jobs);
  }

  async function celebrate(isGolden: boolean) {
    // stones glow & chime in sequence (bottom-up, left to right), then chord
    const order: number[] = [];
    view.state.forEach((p) => p.forEach((id) => order.push(id)));
    for (const id of order) {
      if (!alive) return;
      view.glow[id] = 1.4;
      stoneTone(id, 0.1);
      await ctx.wait(isReduced() ? 120 : 170);
    }
    for (const id of order) stoneTone(id, 0.05);
    view.lotusGolden = isGolden;
    view.lotusT = 0;
    if (isGolden) {
      // gong bloom
      ctx.audio.tone(ctx.audio.midi(38), { gain: 0.16, dur: 3.5, type: 'sine', attack: 0.01, release: 3 });
      ctx.audio.bell(ctx.audio.midi(62), { gain: 0.08, dur: 3 });
      ctx.audio.chime(ctx.audio.midi(81), { gain: 0.05, dur: 2 });
    } else ctx.audio.success();
    ctx.haptics.success();
    burstRef.current?.burst([0, TERRACE_Y + 0.9, TERRACE_Z + 0.9], 70, { color: isGolden ? '#ffd98a' : '#ffc4d4', speed: 2.6, life: 1.6, gravity: -0.3 });
    burstRef.current?.burst([0, 1.6, PILLAR_Z], 40, { color: '#fff4e0', speed: 2, life: 1.2, gravity: -0.2 });
  }

  async function ghost() {
    await ctx.wait(900);
    while (alive && accepting && puzzle) {
      await ctx.wait(350 + rng.next() * 250);
      if (!accepting || !puzzle) return;
      let m = bestMove(puzzle, view.state);
      if (!m) return;
      if (moves < puzzle.min && rng.chance(0.07)) {
        const alts = neighbors(view.state, view.caps).filter((n) => n.from !== m!.from || n.to !== m!.to);
        if (alts.length) m = rng.pick(alts);
      }
      tapPillar(m.from);
      await ctx.wait(450 + rng.next() * 200);
      if (!accepting) return;
      tapPillar(m.to);
      while (alive && (view.busy || queue.length)) await ctx.wait(60);
    }
  }

  async function playPuzzle(): Promise<void> {
    const def = levelDef(stair.level);
    puzzle = makePuzzle(rng, def);
    const n = def.caps.length;
    const layoutChanged = n !== view.caps.length || def.stones !== view.stones;
    view.caps = def.caps;
    view.stones = def.stones;
    view.goal = puzzle.goal;
    view.state = clone(puzzle.start);
    view.held = null;
    view.mistTarget = 0;
    view.lotusT = -1;
    history = [];
    moves = 0;
    undoUsed = false;
    firstMoveAt = -1;
    view.bump();
    if (layoutChanged) await ctx.wait(30);
    // drop stones in from the sky
    const jobs: Promise<void>[] = [];
    let k = 0;
    view.state.forEach((p, i) =>
      p.forEach((id, lv) => {
        const to = slotPos(i, lv, n, new THREE.Vector3());
        view.pos[id].set(to.x, to.y + 4 + k * 0.5, to.z);
        const delay = k * 90;
        k++;
        jobs.push(
          (async () => {
            if (!isReduced()) await ctx.wait(delay);
            await animateTo(id, to, 600, 0, easeOutBack);
            stoneClick();
          })(),
        );
      }),
    );
    await Promise.all(jobs);
    if (!alive) return;
    hud();
    ctx.announce(`Puzzle ${done + 1} of ${SESSION}. Match the pool in ${puzzle.min} moves.${def.hidden ? ' The pool will mist over in 5 seconds.' : ''}`);
    puzzleShownAt = ctx.time();
    accepting = true;
    if (def.hidden) {
      ctx.caption('Remember the pool — mist is coming');
      ctx.after(5000 * ctx.settings.timingMultiplier, () => {
        if (!alive || !accepting) return;
        view.mistTarget = 1;
        ctx.audio.noise({ dur: 1.2, filter: 400, sweepTo: 900, gain: 0.05 });
        ctx.caption('The pool is misted over');
      });
    }
    const solved = new Promise<void>((res) => (solvedResolve = res));
    if (preview) void ghost();
    await solved;
    solvedResolve = null;
    if (!alive) return;
    view.mistTarget = 0;
    const extra = Math.max(0, moves - puzzle.min);
    const isGolden = extra === 0 && !undoUsed;
    const pts = scoreFor(extra, isGolden);
    score += pts;
    done++;
    if (isGolden) golden++;
    extraSum += extra;
    planSum += Math.max(0, (firstMoveAt < 0 ? ctx.time() : firstMoveAt) - puzzleShownAt);
    ctx.trial({ correct: extra === 0, level: stair.level, rtMs: firstMoveAt - puzzleShownAt });
    ctx.announce(isGolden ? 'Solved in the minimum moves. Golden lotus!' : `Solved in ${moves} moves.`);
    ctx.caption(isGolden ? 'Golden lotus — perfect plan' : `Solved (+${pts})`);
    view.pads.push(isGolden);
    if (view.pads.length > 8) view.pads.shift();
    view.bump();
    await celebrate(isGolden);
    if (extra === 0) stair.record(true);
    else if (extra >= 3) stair.record(false);
    maxLevel = Math.max(maxLevel, stair.level);
    if (preview) {
      const next = 2 + (done % 4);
      stair.set(next);
    }
    hud();
    await ctx.wait(1900);
    // stones sink away
    if (!isReduced()) {
      await Promise.all(
        view.pos.slice(0, view.stones).map((p, id) => animateTo(id, new THREE.Vector3(p.x, p.y + 5, p.z), 450, 0, (t) => t * t)),
      );
    }
    view.lotusT = -1;
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([45, 52, 57, 64, 69], { gain: 0.045, brightness: 0.25 });
    await ctx.wait(300);
    while (alive) {
      await playPuzzle();
      if (!alive) return;
      if (!preview && done >= SESSION) {
        await ctx.wait(300);
        const avgExtra = Math.round((extraSum / done) * 10) / 10;
        const planSec = Math.round((planSum / done / 1000) * 10) / 10;
        ctx.end({
          score,
          levelReached: maxLevel,
          stats: { golden, avgExtra, planSec },
          message: golden >= 4 ? 'A garden of golden lotuses. Beautiful planning.' : 'Each stone a little closer to stillness.',
        });
        return;
      }
      if (preview && view.pads.length >= 6) view.pads = [];
    }
  }

  // ambient water trickle + distant birds
  function ambientLife() {
    if (!alive) return;
    if (rng.chance(0.5)) ctx.audio.noise({ dur: 1.4, filter: 1800, q: 0.7, gain: 0.012, sweepTo: 2600 });
    else {
      const f = 1900 + rng.next() * 900;
      ctx.audio.tone(f, { gain: 0.012, dur: 0.09, type: 'sine' });
      ctx.after(120, () => ctx.audio.tone(f * 1.12, { gain: 0.01, dur: 0.08, type: 'sine' }));
    }
    ctx.after(2500 + rng.next() * 4000, ambientLife);
  }

  // --- DOM buttons (play mode only)
  const btns: HTMLButtonElement[] = [];
  function mkBtn(label: string, aria: string, side: 'left' | 'right', fn: () => void) {
    const b = document.createElement('button');
    b.className = 'u-game-btn';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.style.cssText = `position:absolute;${side}:18px;bottom:calc(22px + env(safe-area-inset-bottom));min-width:64px;min-height:48px;`;
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
    };
    b.onpointerdown = (e) => e.stopPropagation();
    ctx.container.appendChild(b);
    btns.push(b);
  }
  if (!preview) {
    mkBtn('↶ Undo', 'Undo last move', 'left', undo);
    mkBtn('⟲ Reset', 'Reset puzzle', 'right', reset);
  }

  const keyMap: Record<string, () => void> = { KeyZ: undo, KeyR: reset, Escape: putBack, Backspace: undo };
  for (let i = 0; i < 4; i++) {
    keyMap[`Digit${i + 1}`] = () => tapPillar(i);
    keyMap[`Numpad${i + 1}`] = () => tapPillar(i);
  }
  ctx.keys(keyMap);

  // drag support: pointer down on pillar lifts, release over a different pillar places
  let dragFrom = -1;
  const onDown = (i: number) => {
    if (preview) return;
    dragFrom = view.held ? -1 : i;
    tapPillar(i);
  };
  const onUp = (i: number) => {
    if (preview) return;
    if (dragFrom >= 0 && i !== dragFrom) tapPillar(i);
    dragFrom = -1;
  };
  const clearDrag = () => (dragFrom = -1);
  ctx.container.addEventListener('pointerup', clearDrag);

  const unmount = mountR3F(ctx, <Scene view={view} onDown={onDown} onUp={onUp} burstRef={burstRef} />, {
    camera: { position: [0, 7, 15], fov: 40 },
    background: '#2a2548',
  });

  return {
    start() {
      void run();
      ctx.after(3000, ambientLife);
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      unmount();
      btns.forEach((b) => b.remove());
      ctx.container.removeEventListener('pointerup', clearDrag);
    },
    onSettings() {
      view.bump();
    },
  };
}

// ---------------------------------------------------------------- textures

const symbolCache = new Map<string, THREE.Texture>();
function symbolTexture(id: number, hc: boolean): THREE.Texture {
  const key = `${id}-${hc}`;
  const hit = symbolCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.lineJoin = 'round';
  g.beginPath();
  const R = 40;
  switch (id) {
    case 0:
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.moveTo(R * 0.45, 0);
      g.arc(0, 0, R * 0.45, 0, Math.PI * 2, true);
      break;
    case 1:
      g.moveTo(0, -R);
      g.lineTo(R * 0.95, R * 0.72);
      g.lineTo(-R * 0.95, R * 0.72);
      g.closePath();
      break;
    case 2:
      g.rect(-R * 0.78, -R * 0.78, R * 1.56, R * 1.56);
      break;
    case 3:
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? R * 0.45 : R;
        if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      break;
    default:
      g.moveTo(0, -R);
      g.lineTo(R * 0.8, 0);
      g.lineTo(0, R);
      g.lineTo(-R * 0.8, 0);
      g.closePath();
  }
  g.fillStyle = hc ? '#000000' : 'rgba(50,34,70,0.78)';
  g.fill('evenodd');
  g.lineWidth = hc ? 7 : 5;
  g.strokeStyle = hc ? '#000000' : 'rgba(255,255,255,0.75)';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  symbolCache.set(key, t);
  return t;
}

function sandTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#74699a';
  g.fillRect(0, 0, S, S);
  // raked parallel lines with gentle waves
  for (let y = 0; y < S; y += 10) {
    g.beginPath();
    for (let x = 0; x <= S; x += 16) {
      const yy = y + Math.sin(x * 0.006 + y * 0.01) * 5;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.strokeStyle = 'rgba(255,240,245,0.10)';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(40,30,70,0.10)';
    g.lineWidth = 2;
    g.translate(0, 3);
    g.stroke();
    g.translate(0, -3);
  }
  // concentric ripples around the pillar bed (center of texture)
  g.fillStyle = '#74699a';
  g.beginPath();
  g.ellipse(S / 2, S * 0.54, 300, 140, 0, 0, Math.PI * 2);
  g.fill();
  for (let r = 0; r < 12; r++) {
    g.beginPath();
    g.ellipse(S / 2, S * 0.54, 300 - r * 12 + 40, 140 - r * 5.5 + 20, 0, 0, Math.PI * 2);
    g.strokeStyle = r % 2 ? 'rgba(40,30,70,0.10)' : 'rgba(255,240,245,0.12)';
    g.lineWidth = 3;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function numberTexture(n: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20,16,40,0.75)';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 36px Manrope, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- scene

function Scene({ view, onDown, onUp, burstRef }: { view: View; onDown: (i: number) => void; onUp: (i: number) => void; burstRef: { current: BurstHandle | null } }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  return (
    <>
      <CameraRig />
      {!hc && <fog attach="fog" args={['#f1cfc6', 18, 42]} />}
      <GradientSky top={hc ? '#000000' : '#5b56a6'} bottom={hc ? '#111111' : '#ffd9c6'} />
      <ambientLight intensity={0.35} color="#d8ccff" />
      <hemisphereLight args={['#d9d0ff', '#5c4a73', 0.8]} />
      <directionalLight position={[-6, 9, 6]} intensity={1.3} color="#ffd6bc" />
      <Sun />
      <Sand />
      <Rocks />
      <CherryTree />
      <Lantern />
      <Terrace view={view} />
      <PillarBed view={view} onDown={onDown} onUp={onUp} />
      <Stones view={view} />
      <Mist />
      <Petals />
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={260} size={0.14} />
      <GameEffects bloom={0.9} threshold={0.5} />
    </>
  );
}

function CameraRig() {
  const { camera, size } = useThree();
  const ctx = useGame();
  const t = useRef(0);
  const look = useMemo(() => new THREE.Vector3(0, 1.1, -1.0), []);
  useFrame((_, dt) => {
    t.current += dt;
    const aspect = size.width / size.height;
    const cam = camera as THREE.PerspectiveCamera;
    const halfV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitW = 6.2;
    const fitH = 8.6;
    const dist = Math.max(fitH / 2 / halfV, fitW / 2 / (halfV * aspect));
    const sway = ctx.settings.reducedMotion ? 0 : Math.sin(t.current * 0.12) * 0.05;
    cam.position.set(Math.sin(sway) * dist * 0.95, look.y + dist * 0.52, look.z + Math.cos(sway) * dist * 0.85);
    cam.lookAt(look);
  });
  return null;
}

function Sun() {
  const ctx = useGame();
  if (ctx.settings.highContrast) return null;
  return (
    <group position={[5, 8, -28]}>
      <sprite scale={[16, 16, 1]}>
        <spriteMaterial map={softDotTexture()} color="#ffcfa8" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </sprite>
      <mesh>
        <circleGeometry args={[1.3, 40]} />
        <meshBasicMaterial color="#fff1dc" fog={false} />
      </mesh>
    </group>
  );
}

function Sand() {
  const ctx = useGame();
  const tex = useMemo(() => sandTexture(), []);
  const hc = ctx.settings.highContrast;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -2]}>
      <planeGeometry args={[34, 34]} />
      <meshStandardMaterial map={hc ? null : tex} bumpMap={hc ? null : tex} bumpScale={0.6} color={hc ? '#222222' : '#ffffff'} roughness={0.95} />
    </mesh>
  );
}

function Rocks() {
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const s = 1 + Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.12;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const rocks: Array<[number, number, number, number]> = [
    [-3.6, 0.1, 2.4, 0.7],
    [3.4, 0.1, 3.0, 0.5],
    [3.9, 0.1, -0.6, 0.9],
    [-4.2, 0.1, -3.8, 1.2],
  ];
  return (
    <>
      {rocks.map(([x, y, z, s], k) => (
        <group key={k} position={[x, y, z]}>
          <mesh geometry={geo} scale={[s, s, s]} rotation-y={k * 1.7}>
            <meshStandardMaterial color="#6d6485" roughness={0.9} flatShading />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
            <ringGeometry args={[s * 1.25, s * 1.32, 48]} />
            <meshBasicMaterial color="#c9bde0" transparent opacity={0.35} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
            <ringGeometry args={[s * 1.55, s * 1.62, 48]} />
            <meshBasicMaterial color="#c9bde0" transparent opacity={0.22} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function CherryTree() {
  const ctx = useGame();
  const blossoms = useMemo(() => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 16 }, () => ({
      p: [-0.4 + (r() - 0.5) * 2.6, 3.6 + (r() - 0.5) * 1.2, (r() - 0.5) * 1.6] as [number, number, number],
      s: 0.45 + r() * 0.45,
    }));
  }, []);
  const hc = ctx.settings.highContrast;
  return (
    <group position={[-3.7, 0, -4.8]}>
      <mesh position={[0, 1.4, 0]} rotation-z={0.12}>
        <cylinderGeometry args={[0.12, 0.26, 2.8, 7]} />
        <meshStandardMaterial color="#4a3548" roughness={1} />
      </mesh>
      <mesh position={[0.45, 2.8, 0]} rotation-z={-0.7}>
        <cylinderGeometry args={[0.06, 0.12, 1.6, 6]} />
        <meshStandardMaterial color="#4a3548" roughness={1} />
      </mesh>
      {blossoms.map((b, k) => (
        <mesh key={k} position={b.p} scale={b.s}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={hc ? '#dddddd' : '#ffc2d4'} emissive="#ff9fbf" emissiveIntensity={hc ? 0 : 0.25} roughness={0.8} flatShading />
        </mesh>
      ))}
      {!hc && (
        <sprite position={[-0.3, 3.6, 0.4]} scale={[5, 4, 1]}>
          <spriteMaterial map={softDotTexture()} color="#ff9fc0" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      )}
    </group>
  );
}

function Lantern() {
  const light = useRef<THREE.Sprite>(null);
  const ctx = useGame();
  useFrame((s) => {
    if (!light.current) return;
    const k = ctx.settings.reducedMotion ? 0 : Math.sin(s.clock.elapsedTime * 2.1) * 0.05 + Math.sin(s.clock.elapsedTime * 5.3) * 0.03;
    (light.current.material as THREE.SpriteMaterial).opacity = 0.55 + k;
  });
  return (
    <group position={[3.6, 0, -4.2]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 1, 8]} />
        <meshStandardMaterial color="#7b7390" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.7, 0.55, 0.7]} />
        <meshStandardMaterial color="#8a82a0" emissive="#ffcf8a" emissiveIntensity={0.35} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.2, 0.36]}>
        <planeGeometry args={[0.32, 0.3]} />
        <meshBasicMaterial color="#ffe2a8" />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <coneGeometry args={[0.72, 0.35, 4]} />
        <meshStandardMaterial color="#6d6485" roughness={0.9} flatShading />
      </mesh>
      <sprite ref={light} position={[0, 1.2, 0.5]} scale={[2.2, 2.2, 1]}>
        <spriteMaterial map={softDotTexture()} color="#ffcf8a" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

// --- pillars + tap targets
function PillarBed({ view, onDown, onUp }: { view: View; onDown: (i: number) => void; onUp: (i: number) => void }) {
  const n = view.caps.length;
  const soft = useGame().settings.soft;
  const slabW = spacing(n) * n + 0.3;
  // Soft look: the slab is a pillowy clay board with rounded edges.
  const softSlab = useMemo(() => (soft ? new RoundedBoxGeometry(slabW, 0.14, 1.9, 3, 0.06) : null), [soft, slabW]);
  return (
    <group>
      {/* stone slab under the pillars */}
      {softSlab ? (
        <mesh position={[0, 0.05, PILLAR_Z]} geometry={softSlab}>
          <meshStandardMaterial color="#b3a6c8" roughness={0.95} />
        </mesh>
      ) : (
        <mesh position={[0, 0.05, PILLAR_Z]}>
          <boxGeometry args={[slabW, 0.14, 1.9]} />
          <meshStandardMaterial color="#b3a6c8" roughness={0.85} />
        </mesh>
      )}
      {view.caps.map((cap, i) => (
        <Pillar key={`${n}-${i}`} index={i} cap={cap} n={n} view={view} onDown={onDown} onUp={onUp} />
      ))}
    </group>
  );
}

function Pillar({ index, cap, n, view, onDown, onUp }: { index: number; cap: number; n: number; view: View; onDown: (i: number) => void; onUp: (i: number) => void }) {
  const ctx = useGame();
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const hint = useRef<THREE.Sprite>(null);
  const numTex = useMemo(() => numberTexture(index + 1), [index]);
  const x = pillarX(index, n);
  const top = pegTop(cap);
  const hc = ctx.settings.highContrast;
  useFrame((_, dt) => {
    view.pillarFlash[index] = Math.max(0, view.pillarFlash[index] - dt * 2);
    const held = view.held;
    const src = held && held.from === index ? 0.55 : 0;
    const dest = held && held.from !== index && view.state[index].length < cap ? 0.22 : 0;
    if (ring.current) ring.current.opacity = Math.min(1, 0.12 + src + dest + view.pillarFlash[index] * 0.6);
    if (hint.current) hint.current.visible = ctx.settings.showKeyHints || !!held;
  });
  return (
    <group position={[x, 0, PILLAR_Z]}>
      {/* peg */}
      <mesh position={[0, top / 2 + 0.06, 0]}>
        <cylinderGeometry args={[0.085, 0.1, top, 12]} />
        <meshStandardMaterial color={hc ? '#ffffff' : '#9a6b58'} roughness={0.7} />
      </mesh>
      <mesh position={[0, top + 0.08, 0]}>
        <sphereGeometry args={[0.11, 12, 8]} />
        <meshStandardMaterial color={hc ? '#ffffff' : '#b98570'} roughness={0.6} />
      </mesh>
      {/* capacity dots: how many stones fit */}
      {Array.from({ length: cap }, (_, k) => (
        <mesh key={`d${k}`} position={[(k - (cap - 1) / 2) * 0.17, 0.125, 0.7]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.055, 12]} />
          <meshBasicMaterial color={hc ? '#ffffff' : '#fff5ee'} />
        </mesh>
      ))}
      {/* selection ring */}
      <mesh position={[0, 0.13, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.68 * stoneScale(n), 0.78 * stoneScale(n), 48]} />
        <meshBasicMaterial ref={ring} color={hc ? '#ffff66' : '#fff2d8'} transparent opacity={0.15} depthWrite={false} />
      </mesh>
      <sprite ref={hint} position={[0, -0.12, 1.05]} scale={[0.42, 0.42, 1]}>
        <spriteMaterial map={numTex} transparent depthTest={false} />
      </sprite>
      {/* generous hit target */}
      <mesh
        position={[0, top / 2 + 0.4, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDown(index);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onUp(index);
        }}
      >
        <boxGeometry args={[spacing(n) * 0.98, top + 1.6, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// --- a single stone mesh (shared by live and target displays)
function StoneBody({ id, hc, glowRef, matRef }: { id: number; hc: boolean; glowRef?: (s: THREE.Sprite | null) => void; matRef?: (m: THREE.MeshStandardMaterial | null) => void }) {
  const color = hc ? '#ffffff' : STONE_COLORS[id];
  const r = STONE_R[id];
  const sym = symbolTexture(id, hc);
  return (
    <>
      <sprite ref={glowRef} scale={[r * 3.4, r * 2.6, 1]} position={[0, 0, -0.1]}>
        <spriteMaterial map={softDotTexture()} color={color} transparent opacity={hc ? 0 : 0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh scale={[r, H * 0.47, r]}>
        <sphereGeometry args={[1, 40, 20]} />
        <meshStandardMaterial ref={matRef} color={color} emissive={color} emissiveIntensity={hc ? 0.1 : 0.4} roughness={0.28} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, r * 0.985]} rotation-x={-0.12}>
        <planeGeometry args={[H * 0.84, H * 0.84]} />
        <meshBasicMaterial map={sym} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </>
  );
}

function Stones({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const groups = useRef<Array<THREE.Group | null>>([]);
  const glows = useRef<Array<THREE.Sprite | null>>([]);
  const mats = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const t = useRef(0);
  const sc = stoneScale(view.caps.length);
  useFrame((_, dt) => {
    t.current += dt;
    const reduced = ctx.settings.reducedMotion;
    for (let id = 0; id < view.stones; id++) {
      const g = groups.current[id];
      if (!g) continue;
      g.position.copy(view.pos[id]);
      const held = view.held?.id === id;
      if (held && !view.busy && !reduced) g.position.y += Math.sin(t.current * 3) * 0.05;
      view.wobble[id] = Math.max(0, view.wobble[id] - dt * 2.2);
      g.rotation.z = reduced ? 0 : Math.sin(t.current * 26) * view.wobble[id] * 0.12;
      view.glow[id] = Math.max(0, view.glow[id] - dt * 1.1);
      const gl = view.glow[id] + (held ? 0.3 : 0);
      const m = mats.current[id];
      if (m) m.emissiveIntensity = (hc ? 0.1 : 0.4) + gl * 0.7;
      const s = glows.current[id];
      if (s) {
        (s.material as THREE.SpriteMaterial).opacity = hc ? 0 : 0.28 + gl * 0.55;
      }
    }
  });
  return (
    <>
      {Array.from({ length: view.stones }, (_, id) => (
        <group key={id} ref={(g) => { groups.current[id] = g; }} scale={sc}>
          <StoneBody id={id} hc={hc} glowRef={(s) => { glows.current[id] = s; }} matRef={(m) => { mats.current[id] = m; }} />
        </group>
      ))}
    </>
  );
}

// --- raised terrace with reflecting pool showing the goal arrangement
const TERRACE_Y = 1.7;
const TERRACE_Z = -2.9;
const miniSp = (n: number) => (n >= 4 ? 1.22 : 1.5);
const miniSc = (n: number) => (n >= 4 ? 0.74 : 0.9);

function MiniArrangement({ view, mirrored }: { view: View; mirrored?: boolean }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const n = view.caps.length;
  const sc = miniSc(n);
  return (
    <group scale={[1, mirrored ? -1 : 1, 1]}>
      {view.caps.map((cap, i) => (
        <group key={`p${i}`} position={[(i - (n - 1) / 2) * miniSp(n), 0, 0]} scale={sc}>
          <mesh position={[0, pegTop(cap) / 2, 0]}>
            <cylinderGeometry args={[0.085, 0.1, pegTop(cap), 10]} />
            <meshStandardMaterial color={hc ? '#ffffff' : '#9a6b58'} roughness={0.7} />
          </mesh>
          {view.goal[i].map((id, lv) => (
            <group key={`s${id}`} position={[0, 0.02 + H / 2 + lv * H, 0]}>
              <StoneBody id={id} hc={hc} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function blockTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#d9cde6');
  grd.addColorStop(1, '#9d8fb6');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(60,40,90,0.22)';
  g.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
    for (let x = (row % 2) * 64; x < 512; x += 128) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 64);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Terrace({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const mist = useRef<THREE.Sprite>(null);
  const mist2 = useRef<THREE.Mesh>(null);
  const water = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { t: { value: 0 }, deep: { value: new THREE.Color('#2e3f6e') }, light: { value: new THREE.Color('#9fd6e0') } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float t; uniform vec3 deep; uniform vec3 light; varying vec2 vUv;
          void main(){
            float r = sin((vUv.x*18.0 + vUv.y*6.0) + t*1.3) * 0.5 + sin(vUv.y*30.0 - t*1.7) * 0.5;
            float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
            vec3 col = mix(deep, light, vUv.y*0.55 + r*0.05);
            gl_FragColor = vec4(col, 0.62 - edge*0.12 + r*0.03);
          }`,
      }),
    [],
  );
  const w = miniSp(view.caps.length) * view.caps.length + 0.9;
  const blockTex = useMemo(() => blockTexture(), []);
  const soft = ctx.settings.soft;
  // Soft look: rounded clay rim around the goal pool.
  const softRim = useMemo(() => (soft ? { long: new RoundedBoxGeometry(w + 0.6, 0.18, 0.2, 3, 0.07), side: new RoundedBoxGeometry(0.2, 0.18, 2.4, 3, 0.07) } : null), [soft, w]);
  const pads = view.pads;
  useFrame((s, dt) => {
    water.uniforms.t.value = ctx.settings.reducedMotion ? 0 : s.clock.elapsedTime;
    view.mist += (view.mistTarget - view.mist) * damp(2.5, dt);
    if (mist.current) {
      (mist.current.material as THREE.SpriteMaterial).opacity = view.mist * 0.95;
      mist.current.visible = view.mist > 0.01;
    }
    if (mist2.current) {
      ((mist2.current as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = view.mist * 0.9;
      mist2.current.visible = view.mist > 0.01;
    }
  });
  return (
    <group position={[0, 0, TERRACE_Z]}>
      {/* terrace block */}
      <mesh position={[0, TERRACE_Y / 2, 0]}>
        <boxGeometry args={[w + 0.6, TERRACE_Y, 2.4]} />
        <meshStandardMaterial map={hc ? null : blockTex} color={hc ? "#333333" : "#ffffff"} roughness={0.9} />
      </mesh>
      {/* pool rim */}
      <group position={[0, TERRACE_Y, 0]}>
        {[
          [0, 0.09, 1.1, w + 0.6, 0.2],
          [0, 0.09, -1.1, w + 0.6, 0.2],
        ].map(([x, y, z, sx, sz], k) => (
          <mesh key={k} position={[x, y, z]} {...(soft ? { geometry: softRim!.long } : {})}>
            {!soft && <boxGeometry args={[sx, 0.18, sz]} />}
            <meshStandardMaterial color={hc ? '#888888' : '#e2d6ec'} roughness={soft ? 0.95 : 0.8} />
          </mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * (w / 2 + 0.2), 0.09, 0]} {...(soft ? { geometry: softRim!.side } : {})}>
            {!soft && <boxGeometry args={[0.2, 0.18, 2.4]} />}
            <meshStandardMaterial color={hc ? '#888888' : '#e2d6ec'} roughness={soft ? 0.95 : 0.8} />
          </mesh>
        ))}
        {/* goal stones standing in the pool + their reflection */}
        <group position={[0, 0, 0.1]}>
          <MiniArrangement view={view} />
          {!hc && <MiniArrangement view={view} mirrored />}
        </group>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} material={water}>
          <planeGeometry args={[w + 0.2, 2.0]} />
        </mesh>
        {/* soft "goal" glow */}
        {!hc && (
          <sprite position={[0, 0.8, 0]} scale={[w + 1.2, 2.4, 1]}>
            <spriteMaterial map={softDotTexture()} color="#bfe8ff" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        )}
        {/* mist that hides the goal */}
        <mesh ref={mist2} position={[0, 0.7, 1.15]}>
          <planeGeometry args={[w + 0.5, 1.6]} />
          <meshBasicMaterial color={hc ? '#555555' : '#efe4f4'} transparent opacity={0} depthWrite={false} />
        </mesh>
        <sprite ref={mist} position={[0, 0.8, 1.2]} scale={[w + 2.4, 2.6, 1]}>
          <spriteMaterial map={softDotTexture()} color={hc ? '#777777' : '#fff4fb'} transparent opacity={0} depthWrite={false} />
        </sprite>
        {/* lotus pads collected this session */}
        {pads.map((g, k) => (
          <LotusPad key={k} golden={g} x={-w / 2 + 0.35 + k * 0.42} />
        ))}
        <Lotus view={view} />
      </group>
    </group>
  );
}

function LotusPad({ golden, x }: { golden: boolean; x: number }) {
  return (
    <group position={[x, 0.2, 1.1]}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.16, 16, 0.3, Math.PI * 1.8]} />
        <meshStandardMaterial color="#5f9f86" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.06, 0]} scale={[0.09, 0.07, 0.09]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={golden ? '#ffd46b' : '#ffc4d6'} emissive={golden ? '#ffb83d' : '#ff9fbf'} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Lotus({ view }: { view: View }) {
  const ctx = useGame();
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const petalGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 14, 10);
    g.scale(0.18, 0.06, 0.42);
    g.translate(0, 0, 0.36);
    return g;
  }, []);
  const mats = useMemo(
    () => ({
      pink: new THREE.MeshStandardMaterial({ color: '#ffc4d6', emissive: '#ff8fb5', emissiveIntensity: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
      gold: new THREE.MeshStandardMaterial({ color: '#ffe19a', emissive: '#ffb640', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3, side: THREE.DoubleSide }),
    }),
    [],
  );
  const petals = useRef<Array<THREE.Mesh | null>>([]);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (view.lotusT < 0) {
      g.visible = false;
      return;
    }
    view.lotusT += dt;
    g.visible = true;
    const reduced = ctx.settings.reducedMotion;
    const t = reduced ? 1 : Math.min(1, view.lotusT / 1.2);
    const open = easeOutBack(t);
    g.scale.setScalar(0.3 + 0.7 * Math.min(1, view.lotusT * 3));
    g.rotation.y += reduced ? 0 : dt * 0.3;
    const mat = view.lotusGolden ? mats.gold : mats.pink;
    petals.current.forEach((p, k) => {
      if (!p) return;
      p.material = mat;
      const inner = k >= 8;
      const base = inner ? -1.25 : -0.55;
      p.rotation.x = base * open + (1 - open) * -1.5;
    });
    if (halo.current) {
      const hm = halo.current.material as THREE.SpriteMaterial;
      hm.color.set(view.lotusGolden ? '#ffcf6b' : '#ffb0cc');
      hm.opacity = 0.6 * Math.min(1, view.lotusT * 2);
      const hs = 2.4 + (reduced ? 0 : Math.sin(view.lotusT * 2) * 0.15);
      halo.current.scale.set(hs, hs, 1);
    }
  });
  return (
    <group ref={group} position={[0, 0.9, 0.95]} visible={false}>
      <sprite ref={halo} scale={[2.4, 2.4, 1]}>
        <spriteMaterial map={softDotTexture()} color="#ffcf6b" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group rotation-x={0.5}>
        {Array.from({ length: 14 }, (_, k) => {
          const inner = k >= 8;
          const a = inner ? ((k - 8) / 6) * Math.PI * 2 + 0.4 : (k / 8) * Math.PI * 2;
          return (
            <group key={k} rotation-y={a}>
              <mesh ref={(m) => { petals.current[k] = m; }} geometry={petalGeo} material={mats.pink} scale={inner ? 0.75 : 1} />
            </group>
          );
        })}
        <mesh scale={[0.14, 0.08, 0.14]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#fff2b0" />
        </mesh>
      </group>
    </group>
  );
}

function Mist() {
  const ctx = useGame();
  const refs = useRef<Array<THREE.Sprite | null>>([]);
  const seeds = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ x: -6 + i * 3, y: 0.6 + (i % 2) * 0.5, z: -1 - (i % 3) * 3, s: 6 + (i % 3) * 2 })), []);
  useFrame((s) => {
    if (ctx.settings.reducedMotion) return;
    const t = s.clock.elapsedTime;
    refs.current.forEach((r, i) => {
      if (!r) return;
      r.position.x = seeds[i].x + Math.sin(t * 0.07 + i * 2) * 1.5;
    });
  });
  if (ctx.settings.highContrast) return null;
  return (
    <>
      {seeds.map((m, i) => (
        <sprite key={i} ref={(r) => { refs.current[i] = r; }} position={[m.x, m.y, m.z]} scale={[m.s * 1.6, m.s * 0.4, 1]}>
          <spriteMaterial map={softDotTexture()} color="#ffe6ee" transparent opacity={0.16} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

function Petals() {
  const ctx = useGame();
  const n = Math.max(8, Math.floor(36 * ctx.quality.particleScale));
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: n }, () => ({ x: (r() - 0.5) * 12, y: r() * 9, z: -6 + r() * 9, sp: 0.25 + r() * 0.3, ph: r() * 10, rot: r() * 6 }));
  }, [n]);
  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.07, 6);
    g.scale(1, 0.6, 1);
    return g;
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((s, dt) => {
    const m = ref.current;
    if (!m) return;
    m.visible = !ctx.settings.reducedMotion && !ctx.settings.highContrast;
    if (!m.visible) return;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const p = data[i];
      p.y -= p.sp * dt;
      if (p.y < 0) p.y = 9;
      o.position.set(p.x + Math.sin(t * 0.6 + p.ph) * 0.6, p.y, p.z);
      o.rotation.set(t * 0.8 + p.ph, t * 0.5 + p.rot, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, n]} frustumCulled={false}>
      <meshBasicMaterial color="#ffc6d8" side={THREE.DoubleSide} transparent opacity={0.9} />
    </instancedMesh>
  );
}
