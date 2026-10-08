import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GameContext, GameInstance } from '@/sdk';
import { tween, easeOutBack, easeInOutSine, damp } from '@/sdk';
import { mountR3F, useGame, GameEffects, Motes, ParticleBurst, softDotTexture, type BurstHandle } from '@/sdk/r3f';
import {
  levelDef,
  makeRotatePuzzle,
  makeChoicePuzzle,
  rotAll,
  projKey,
  solve,
  MOVES_FOR,
  type V3,
  type Move,
} from './logic';

const SESSION = 6;
const CHOICE_AT = new Set([2, 5]);
const CUBE = 0.66;
const WALL_Z = -4;
const SH_Y = 2.55; // centre of the target outline on the wall
const SHW = 0.72; // wall cell size
const FLOAT_Y = -0.75;
const PLINTH_TOP = -2.2;
const FLOOR_Y = -3.3;
const LAMP_POS: [number, number, number] = [0, FLOOR_Y + 0.25, 3.3];
const CHOICE_X = [-2.05, 0, 2.05];

const AXIS: Record<Move, [THREE.Vector3, number]> = {
  'Y+': [new THREE.Vector3(0, 1, 0), Math.PI / 2],
  'Y-': [new THREE.Vector3(0, 1, 0), -Math.PI / 2],
  'X+': [new THREE.Vector3(1, 0, 0), Math.PI / 2],
  'X-': [new THREE.Vector3(1, 0, 0), -Math.PI / 2],
  'Z+': [new THREE.Vector3(0, 0, 1), Math.PI / 2],
  'Z-': [new THREE.Vector3(0, 0, 1), -Math.PI / 2],
};
const MOVE_NAME: Record<Move, string> = {
  'Y+': 'turn right',
  'Y-': 'turn left',
  'X+': 'tip down',
  'X-': 'tip up',
  'Z+': 'roll left',
  'Z-': 'roll right',
};

interface Sculpt {
  vs: V3[]; // logical orientation
  base: V3[]; // centred display coordinates (x2 to stay integer → divide by 2)
  quat: THREE.Quaternion;
  pos: THREE.Vector3;
  scale: number;
  shadow: boolean;
  pulse: number;
  dim: number;
}

function makeSculpt(vs: V3[], x = 0, scale = 1): Sculpt {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of vs)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
  // doubled centred coordinates (bbox centre can be a half-integer)
  const base = vs.map((v) => v.map((c, k) => 2 * c - (min[k] + max[k])) as V3);
  return { vs, base, quat: new THREE.Quaternion(), pos: new THREE.Vector3(x, FLOAT_Y, 0), scale, shadow: false, pulse: 0, dim: 0 };
}

// ---------------------------------------------------------------- view-model

class View {
  mode: 'rotate' | 'choice' = 'rotate';
  sculpts: Sculpt[] = [];
  targetCells: Array<[number, number]> = [];
  outline = 0; // outline visibility 0..1
  matched = 0; // fill glow 0..1
  lamp = 0; // lamp brightness 0..1
  axes: 1 | 2 | 3 = 1;
  reveal = -1; // correct choice index to highlight
  hintMove: Move | null = null;
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

// ---------------------------------------------------------------- game

export default function create(ctx: GameContext): GameInstance {
  const view = new View();
  const rng = ctx.rng;
  const preview = ctx.mode === 'preview';
  const stair = ctx.staircase({ min: 1, max: 12, up: 1, down: 1 });
  if (preview) stair.set(3);
  const burstRef: { current: BurstHandle | null } = { current: null };
  const note = ctx.audio.scale(55, 'major');

  let alive = true;
  let stopAmbient: (() => void) | null = null;
  let accepting = false;
  let moves = 0;
  let optimal = 0;
  let target = '';
  let hintUsed = false;
  let resolveDone: ((ok: boolean) => void) | null = null;
  let choiceCorrect = -1;

  let score = 0;
  let done = 0;
  let perfect = 0;
  let choices = 0;
  let choicesRight = 0;
  let maxLevel = stair.level;
  let lastAxes = 0;

  const reduced = () => ctx.settings.reducedMotion;

  function hud(label?: string) {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: done / SESSION,
      label: label ?? (view.mode === 'rotate' ? `Turns ${moves} · best ${optimal}` : 'Which could cast this shadow?'),
    });
  }

  function clunk(m: Move) {
    const base = m[0] === 'Y' ? 45 : m[0] === 'X' ? 50 : 40;
    ctx.audio.thunk({ gain: 0.2 });
    ctx.audio.tone(ctx.audio.midi(base), { gain: 0.08, dur: 0.18, type: 'triangle' });
    ctx.audio.noise({ dur: 0.08, filter: 600, q: 1.5, gain: 0.05 });
  }

  async function turn(s: Sculpt, m: Move, ms = 300) {
    const [axis, ang] = AXIS[m];
    s.vs = rotAll(s.vs, m);
    const from = s.quat.clone();
    const to = new THREE.Quaternion().setFromAxisAngle(axis, ang).multiply(from);
    if (reduced() || ms <= 0) {
      s.quat.copy(to);
      s.pulse = 0.6;
      return;
    }
    await tween(ctx, ms, (t) => s.quat.slerpQuaternions(from, to, t), easeInOutSine);
    s.quat.copy(to);
    s.pulse = 0.6;
  }

  // queued rotations so quick swipes feel responsive but stay ordered
  const queue: Move[] = [];
  let busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length && alive && accepting) {
      const m = queue.shift()!;
      const s = view.sculpts[0];
      if (!s) break;
      moves++;
      view.hintMove = null;
      hud();
      clunk(m);
      ctx.haptics.tick();
      await turn(s, m);
      if (projKey(s.vs) === target && accepting) {
        accepting = false;
        queue.length = 0;
        resolveDone?.(true);
      }
    }
    busy = false;
  }
  function doMove(m: Move) {
    if (!accepting || view.mode !== 'rotate') return;
    if (!MOVES_FOR[view.axes].includes(m)) {
      ctx.caption(view.axes === 1 ? 'Only left / right turns for now' : 'Roll unlocks later');
      return;
    }
    if (queue.length >= 2) return;
    queue.push(m);
    void pump();
  }

  function hint() {
    if (!accepting || view.mode !== 'rotate' || preview) return;
    const s = view.sculpts[0];
    const path = solve(s.vs, target, MOVES_FOR[view.axes]);
    if (!path || !path.length) return;
    hintUsed = true;
    view.hintMove = path[0];
    updateButtons();
    ctx.caption(`Hint: ${MOVE_NAME[path[0]]}`);
    ctx.announce(`Hint: ${MOVE_NAME[path[0]]}`);
    ctx.audio.bell(note(4), { gain: 0.05 });
  }

  function choose(i: number) {
    if (!accepting || view.mode !== 'choice' || i < 0 || i > 2) return;
    accepting = false;
    resolveDone?.(i === choiceCorrect);
    chosenIndex = i;
  }
  let chosenIndex = -1;

  async function lampOn() {
    if (reduced()) {
      view.lamp = 1;
      return;
    }
    const seq = [0.5, 0.05, 0.8, 0.2, 1];
    for (const v of seq) {
      view.lamp = v;
      ctx.audio.noise({ dur: 0.04, filter: 3000, q: 3, gain: 0.02 });
      await ctx.wait(90 + rng.next() * 70);
    }
    view.lamp = 1;
  }

  async function appear(sculpts: Sculpt[]) {
    for (const s of sculpts) {
      s.scale = s.scale || 1;
    }
    const targets = sculpts.map((s) => s.pos.y);
    const scales = sculpts.map((s) => s.scale);
    if (reduced()) return;
    sculpts.forEach((s) => {
      s.pos.y = PLINTH_TOP - 0.2;
      s.scale = 0.001;
    });
    await tween(
      ctx,
      650,
      (t) =>
        sculpts.forEach((s, i) => {
          s.pos.y = PLINTH_TOP - 0.2 + (targets[i] - PLINTH_TOP + 0.2) * t;
          s.scale = Math.max(0.001, scales[i] * t);
        }),
      easeOutBack,
    );
  }

  async function disappear() {
    const ss = view.sculpts;
    const sc = ss.map((s) => s.scale);
    if (!reduced()) await tween(ctx, 420, (t) => ss.forEach((s, i) => (s.scale = Math.max(0.001, sc[i] * (1 - t)))), easeInOutSine);
    const o0 = view.outline;
    if (!reduced()) await tween(ctx, 300, (t) => (view.outline = o0 * (1 - t)));
    view.outline = 0;
    view.matched = 0;
  }

  async function celebrateMatch() {
    ctx.audio.success();
    [0, 2, 4, 7].forEach((d, k) => ctx.audio.bell(note(d), { gain: 0.07, dur: 2.6, when: ctx.audio.now() + k * 0.05 }));
    ctx.audio.tone(note(-7), { gain: 0.05, dur: 2.5, type: 'sine', attack: 0.3 });
    ctx.haptics.success();
    const m0 = view.matched;
    const glow = tween(ctx, reduced() ? 1 : 600, (t) => (view.matched = m0 + (1 - m0) * t));
    // particles along the outline cells
    const w = Math.max(...view.targetCells.map((c) => c[0])) + 1;
    const h = Math.max(...view.targetCells.map((c) => c[1])) + 1;
    view.targetCells.forEach(([cx, cy], k) => {
      if (k % 2) return;
      burstRef.current?.burst([(cx - (w - 1) / 2) * SHW, SH_Y + (cy - (h - 1) / 2) * SHW, WALL_Z + 0.3], 10, { color: '#ffe2a8', speed: 1.4, life: 1.2, gravity: -0.4 });
    });
    await glow;
  }

  async function settle(s: Sculpt) {
    if (reduced()) return;
    const y0 = s.pos.y;
    await tween(ctx, 500, (t) => (s.pos.y = y0 + (FLOAT_Y - 0.25 - y0) * t), easeInOutSine);
  }

  async function rotatePuzzle() {
    const def = levelDef(stair.level);
    const p = makeRotatePuzzle(rng, def);
    view.axes = def.axes;
    view.mode = 'rotate';
    const s = makeSculpt(p.shape);
    s.shadow = true;
    view.sculpts = [s];
    view.targetCells = p.targetCells;
    view.matched = 0;
    view.hintMove = null;
    target = p.target;
    optimal = p.optimal;
    moves = 0;
    hintUsed = false;
    view.bump();
    updateButtons();
    hud();
    if (def.axes > lastAxes && lastAxes > 0) {
      ctx.caption(def.axes === 2 ? 'New: tip up and down' : 'New: roll');
    }
    lastAxes = def.axes;
    const outlineIn = tween(ctx, reduced() ? 1 : 500, (t) => (view.outline = t));
    await appear([s]);
    await outlineIn;
    if (!alive) return;
    ctx.announce(`Sculpture ${done + 1} of ${SESSION}. Match the outline in ${optimal} turns.`);
    accepting = true;
    const res = new Promise<boolean>((r) => (resolveDone = r));
    if (preview) void ghostRotate();
    await res;
    resolveDone = null;
    if (!alive) return;
    const isPerfect = moves <= optimal && !hintUsed;
    const pts = 100 + (isPerfect ? 50 : 0) - (hintUsed ? 30 : 0);
    score += pts;
    done++;
    if (isPerfect) perfect++;
    ctx.trial({ correct: isPerfect, level: stair.level });
    if (isPerfect) stair.record(true);
    else if (moves > optimal + 2) stair.record(false);
    maxLevel = Math.max(maxLevel, stair.level);
    hud(isPerfect ? '★ Perfect' : `Matched in ${moves}`);
    ctx.caption(isPerfect ? 'Shadow matched — perfect ★' : 'Shadow matched');
    ctx.announce(isPerfect ? 'Perfect match.' : `Matched in ${moves} turns.`);
    await celebrateMatch();
    await settle(s);
    await ctx.wait(900);
  }

  async function choicePuzzle() {
    const def = levelDef(stair.level);
    let cp;
    try {
      cp = makeChoicePuzzle(rng, def);
    } catch {
      return rotatePuzzle();
    }
    view.mode = 'choice';
    view.sculpts = cp.options.map((o, i) => makeSculpt(o, CHOICE_X[i], 0.68));
    view.sculpts.forEach((s) => (s.pos.y = FLOAT_Y - 0.35));
    view.targetCells = cp.targetCells;
    view.matched = 0;
    view.reveal = -1;
    target = cp.target;
    choiceCorrect = cp.correct;
    chosenIndex = -1;
    view.bump();
    updateButtons();
    hud();
    ctx.caption('Choice: which sculpture could cast this shadow?');
    const outlineIn = tween(ctx, reduced() ? 1 : 500, (t) => (view.outline = t));
    await appear(view.sculpts);
    await outlineIn;
    if (!alive) return;
    ctx.announce('Which sculpture could cast this shadow? Press 1, 2 or 3.');
    accepting = true;
    const res = new Promise<boolean>((r) => (resolveDone = r));
    if (preview) void ghostChoice();
    const ok = await res;
    resolveDone = null;
    if (!alive) return;
    choices++;
    done++;
    ctx.trial({ correct: ok, level: stair.level });
    view.reveal = choiceCorrect;
    const correct = view.sculpts[choiceCorrect];
    if (ok) {
      choicesRight++;
      score += 150;
      ctx.audio.bell(note(7), { gain: 0.1, dur: 3 });
      ctx.audio.bell(note(11), { gain: 0.06, dur: 3 });
      ctx.caption('Correct!');
      hud('Correct +150');
    } else {
      view.sculpts[chosenIndex].dim = 1;
      ctx.audio.thunk({ gain: 0.2 });
      ctx.haptics.error();
      ctx.caption(`Not quite — it was number ${choiceCorrect + 1}`);
      hud(`It was #${choiceCorrect + 1}`);
    }
    // reveal: the correct sculpture turns until its shadow fills the outline
    correct.shadow = true;
    correct.pulse = 1;
    view.bump();
    const path = solve(correct.vs, target, MOVES_FOR[3]) ?? [];
    await ctx.wait(400);
    for (const m of path) {
      if (!alive) return;
      clunk(m);
      await turn(correct, m, 380);
      await ctx.wait(120);
    }
    await celebrateMatch();
    await ctx.wait(1100);
  }

  async function ghostRotate() {
    await ctx.wait(900);
    let erred = false;
    while (alive && accepting) {
      const s = view.sculpts[0];
      const path = solve(s.vs, target, MOVES_FOR[view.axes]);
      if (!path || !path.length) return;
      let m = path[0];
      if (!erred && rng.chance(0.12)) {
        erred = true;
        const opts = MOVES_FOR[view.axes].filter((x) => x !== m);
        m = rng.pick(opts);
      }
      doMove(m);
      await ctx.wait(750 + rng.next() * 300);
      while (alive && busy) await ctx.wait(50);
    }
  }

  async function ghostChoice() {
    await ctx.wait(1800);
    const pick = rng.chance(0.85) ? choiceCorrect : (choiceCorrect + 1) % 3;
    view.sculpts[pick].pulse = 1;
    await ctx.wait(400);
    choose(pick);
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([43, 50, 55, 59, 62], { gain: 0.04, brightness: 0.2 });
    await lampOn();
    while (alive) {
      const idx = preview ? done % 3 === 2 : CHOICE_AT.has(done);
      if (idx) await choicePuzzle();
      else await rotatePuzzle();
      if (!alive) return;
      await disappear();
      if (!preview && done >= SESSION) {
        const acc = choices ? Math.round((choicesRight / choices) * 100) : 0;
        ctx.end({
          score,
          levelReached: maxLevel,
          stats: { perfect, choiceAcc: acc },
          message: perfect >= 3 ? 'A true eye for form.' : 'Every shadow finds its shape.',
        });
        return;
      }
      if (preview) stair.set(3 + (done % 2));
    }
  }

  function pianoNote() {
    if (!alive) return;
    const d = rng.pick([0, 2, 4, 7, 9, 11]);
    ctx.audio.pluck(note(d + 7), { gain: 0.025, dur: 2.5, pan: -0.4 });
    ctx.after(4000 + rng.next() * 6000, pianoNote);
  }

  // ---------------------------------------------------------- DOM controls (play only)
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;justify-content:center;';
  const btnMap = new Map<Move | 'hint', HTMLButtonElement>();
  function mkBtn(key: Move | 'hint', label: string, aria: string, fn: () => void) {
    const b = document.createElement('button');
    b.className = 'u-game-btn';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.style.cssText = 'min-width:52px;min-height:52px;padding:0 12px;font-size:20px;transition:box-shadow .2s;';
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
    };
    b.onpointerdown = (e) => e.stopPropagation();
    b.onpointerup = (e) => e.stopPropagation();
    btnMap.set(key, b);
    return b;
  }
  const btnOrder: Array<HTMLButtonElement> = [
    mkBtn('Y-', '←', 'Turn left', () => doMove('Y-')),
    mkBtn('Y+', '→', 'Turn right', () => doMove('Y+')),
    mkBtn('X-', '↑', 'Tip up', () => doMove('X-')),
    mkBtn('X+', '↓', 'Tip down', () => doMove('X+')),
    mkBtn('Z+', '⟲', 'Roll', () => doMove('Z+')),
    mkBtn('hint', '✦', 'Hint (costs points)', hint),
  ];
  if (ctx.settings.leftHanded) btnOrder.reverse();
  btnOrder.forEach((b) => bar.appendChild(b));
  if (!preview) ctx.container.appendChild(bar);
  function updateButtons() {
    const rotateMode = view.mode === 'rotate';
    bar.style.display = rotateMode ? 'flex' : 'none';
    const allowed = MOVES_FOR[view.axes];
    (['Y-', 'Y+', 'X-', 'X+', 'Z+'] as Move[]).forEach((m) => {
      const b = btnMap.get(m)!;
      b.style.display = allowed.includes(m) ? '' : 'none';
      b.style.boxShadow = view.hintMove === m ? '0 0 0 3px #ffe2a8, 0 0 18px #ffd27a' : '';
    });
  }

  // swipe on the scene
  let sx = 0;
  let sy = 0;
  let down = false;
  const onDown = (e: PointerEvent) => {
    down = true;
    sx = e.clientX;
    sy = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    down = false;
    if (preview) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'Y+' : 'Y-');
    else if (view.axes >= 2) doMove(dy > 0 ? 'X+' : 'X-');
  };
  ctx.container.addEventListener('pointerdown', onDown);
  ctx.container.addEventListener('pointerup', onUp);

  ctx.keys({
    ArrowLeft: () => doMove('Y-'),
    ArrowRight: () => doMove('Y+'),
    ArrowUp: () => doMove('X-'),
    ArrowDown: () => doMove('X+'),
    KeyA: () => doMove('Y-'),
    KeyD: () => doMove('Y+'),
    KeyW: () => doMove('X-'),
    KeyS: () => doMove('X+'),
    KeyQ: () => doMove('Z+'),
    KeyE: () => doMove('Z-'),
    KeyH: hint,
    Digit1: () => choose(0),
    Digit2: () => choose(1),
    Digit3: () => choose(2),
    Numpad1: () => choose(0),
    Numpad2: () => choose(1),
    Numpad3: () => choose(2),
  });

  const unmount = mountR3F(ctx, <Scene view={view} onChoose={(i) => !preview && choose(i)} burstRef={burstRef} />, {
    camera: { position: [0, 1, 18], fov: 40, near: 0.1, far: 120 },
    shadows: true,
    background: '#1d1720',
  });

  return {
    start() {
      void run();
      ctx.after(3000, pianoNote);
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
      unmount();
      bar.remove();
      ctx.container.removeEventListener('pointerdown', onDown);
      ctx.container.removeEventListener('pointerup', onUp);
    },
    onSettings() {
      view.bump();
    },
  };
}

// ---------------------------------------------------------------- textures

function plasterTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9dccb';
  g.fillRect(0, 0, S, S);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.06})` : `rgba(120,90,70,${0.03 + r() * 0.05})`;
    const sz = 1 + r() * 3;
    g.fillRect(r() * S, r() * S, sz, sz);
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(140,110,90,${0.02 + r() * 0.03})`;
    g.lineWidth = 6 + r() * 16;
    g.beginPath();
    const x = r() * S;
    const y = r() * S;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 200, y + (r() - 0.5) * 200, x + (r() - 0.5) * 300, y + (r() - 0.5) * 300);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function numberTexture(n: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(30,22,28,0.8)';
  g.beginPath();
  g.arc(48, 48, 42, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,230,190,0.9)';
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#fff4e4';
  g.font = 'bold 52px Manrope, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 48, 51);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- scene

function Scene({ view, onChoose, burstRef }: { view: View; onChoose: (i: number) => void; burstRef: { current: BurstHandle | null } }) {
  const ctx = useGame();
  useSyncExternalStore(view.subscribe, view.getVersion);
  const hc = ctx.settings.highContrast;
  return (
    <>
      <CameraRig />
      <Lights view={view} />
      <Gallery view={view} />
      <LightCone view={view} />
      <TargetOutline view={view} key={`t${view.version}`} />
      {view.sculpts.map((s, i) => (
        <group key={`${view.version}-${i}`}>
          <Sculpture s={s} view={view} index={i} onChoose={onChoose} />
          <WallShadow s={s} hc={hc} />
        </group>
      ))}
      {view.mode === 'rotate' ? <Plinth x={0} w={1.9} /> : CHOICE_X.map((x, i) => <ChoicePlinth key={i} x={x} i={i} view={view} />)}
      <group position={[0, 0.4, 0.2]}>
        <Motes count={70} area={[5, 7, 5]} color="#fff0d0" size={0.06} speed={0.08} />
      </group>
      <ParticleBurst ref={(h) => { burstRef.current = h; }} max={260} size={0.14} />
      <GameEffects bloom={0.7} threshold={0.6} />
    </>
  );
}

function CameraRig() {
  const { camera, size } = useThree();
  const ctx = useGame();
  const t = useRef(0);
  const look = useMemo(() => new THREE.Vector3(0, 0.55, -1), []);
  useFrame((_, dt) => {
    t.current += dt;
    const aspect = size.width / size.height;
    const cam = camera as THREE.PerspectiveCamera;
    const halfV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitW = 5.8;
    const fitH = 9.4;
    const dist = Math.max(fitH / 2 / halfV, fitW / 2 / (halfV * aspect));
    const sway = ctx.settings.reducedMotion ? 0 : Math.sin(t.current * 0.1) * 0.03;
    cam.position.set(Math.sin(sway) * dist, look.y + dist * 0.08, look.z + Math.cos(sway) * dist);
    cam.lookAt(look);
  });
  return null;
}

function Lights({ view }: { view: View }) {
  const ctx = useGame();
  const spot = useRef<THREE.SpotLight>(null);
  const dir = useRef<THREE.DirectionalLight>(null);
  const tgt = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, SH_Y, WALL_Z);
    return o;
  }, []);
  const hc = ctx.settings.highContrast;
  const mapSize = ctx.quality.tier === 'high' ? 2048 : 1024;
  useFrame(() => {
    if (spot.current) spot.current.intensity = (hc ? 1.2 : 2.6) * view.lamp * (1 + view.matched * 0.35);
    if (dir.current) dir.current.intensity = 0.55 + view.lamp * 0.5;
  });
  return (
    <>
      <primitive object={tgt} />
      <ambientLight intensity={hc ? 0.9 : 0.28} color="#ffe9d6" />
      <hemisphereLight args={['#ffe8d0', '#3a2a34', hc ? 0.6 : 0.6]} />
      <spotLight ref={spot} position={LAMP_POS} target={tgt} angle={0.42} penumbra={0.85} decay={0} distance={0} color="#ffe2b8" intensity={0} />
      <directionalLight
        ref={dir}
        position={[1.6, 7, 2.2]}
        intensity={0.8}
        color="#fff0dc"
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-near={1}
        shadow-camera-far={16}
        shadow-bias={-0.0008}
        shadow-radius={4}
      />
    </>
  );
}

function Gallery({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const tex = useMemo(() => plasterTexture(), []);
  const soft = ctx.settings.soft;
  const pool = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (pool.current) (pool.current.material as THREE.MeshBasicMaterial).opacity = hc ? 0 : 0.22 * view.lamp + view.matched * 0.12;
  });
  return (
    <>
      {/* back wall */}
      <mesh position={[0, 4, WALL_Z]} receiveShadow>
        <planeGeometry args={[30, 16]} />
        <meshStandardMaterial map={hc ? null : tex} color={hc ? '#ffffff' : '#ffffff'} roughness={0.95} />
      </mesh>
      {/* warm light pool on the wall (fake bounce) */}
      <mesh ref={pool} position={[0, SH_Y, WALL_Z + 0.005]}>
        <planeGeometry args={[8, 7]} />
        <meshBasicMaterial map={softDotTexture()} color="#ffcf98" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* baseboard */}
      <mesh position={[0, FLOOR_Y + 0.15, WALL_Z + 0.05]}>
        <boxGeometry args={[30, 0.3, 0.1]} />
        <meshStandardMaterial color={hc ? '#000000' : '#cdb9a4'} roughness={0.8} />
      </mesh>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 2]} receiveShadow>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial color={hc ? '#222222' : '#5a4448'} roughness={soft ? 0.9 : 0.55} metalness={soft ? 0 : 0.05} />
      </mesh>
      {/* museum placard */}
      <mesh position={[2.4, SH_Y - 1.45, WALL_Z + 0.02]}>
        <planeGeometry args={[0.7, 0.42]} />
        <meshStandardMaterial color={hc ? '#dddddd' : '#f6efe6'} roughness={0.6} />
      </mesh>
      {[0, 1, 2].map((k) => (
        <mesh key={k} position={[2.4 - 0.08 * k, SH_Y - 1.35 - k * 0.08, WALL_Z + 0.03]}>
          <planeGeometry args={[0.5 - k * 0.12, 0.03]} />
          <meshBasicMaterial color="#9a8878" />
        </mesh>
      ))}
      {/* uplight fixture */}
      <group position={LAMP_POS}>
        <mesh rotation-x={-0.75}>
          <cylinderGeometry args={[0.22, 0.3, 0.45, 20, 1, true]} />
          <meshStandardMaterial color="#b88a52" metalness={0.8} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.35, 0.4, 0.1, 20]} />
          <meshStandardMaterial color="#6b5033" metalness={0.6} roughness={0.5} />
        </mesh>
        <LampGlow view={view} />
      </group>
    </>
  );
}

function LampGlow({ view }: { view: View }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (ref.current) (ref.current.material as THREE.SpriteMaterial).opacity = 0.9 * view.lamp;
  });
  return (
    <sprite ref={ref} position={[0, 0.2, -0.1]} scale={[1.6, 1.6, 1]}>
      <spriteMaterial map={softDotTexture()} color="#ffdca8" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

/** Soft volumetric cone from the uplight toward the wall (additive; fake god-rays). */
function LightCone({ view }: { view: View }) {
  const ctx = useGame();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { k: { value: 0 }, color: { value: new THREE.Color('#ffd9a0') } },
        vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
          void main(){ vH = uv.y; vec4 wp = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-wp.xyz); gl_Position = projectionMatrix * wp; }`,
        fragmentShader: `uniform float k; uniform vec3 color; varying float vH; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(abs(dot(vN, vV)), 1.5); float a = f * smoothstep(0.0, 0.55, vH) * smoothstep(1.0, 0.8, vH) * 0.1 * k;
          gl_FragColor = vec4(color * a, a); }`,
      }),
    [],
  );
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...LAMP_POS);
    const b = new THREE.Vector3(0, SH_Y, WALL_Z);
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
    return { pos: mid, quat: q, len };
  }, []);
  useFrame(() => {
    mat.uniforms.k.value = ctx.settings.highContrast ? 0 : view.lamp * (1 + view.matched * 0.5);
  });
  return (
    <mesh position={pos} quaternion={quat} material={mat} renderOrder={4}>
      <cylinderGeometry args={[0.12, 3.2, len, 32, 1, true]} />
    </mesh>
  );
}

function Plinth({ x, w }: { x: number; w: number }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const h = PLINTH_TOP - FLOOR_Y;
  const soft = ctx.settings.soft;
  const softGeo = useMemo(
    () => (soft ? { body: new RoundedBoxGeometry(w, h, w, 4, 0.12), cap: new RoundedBoxGeometry(w + 0.12, 0.1, w + 0.12, 3, 0.045) } : null),
    [soft, w, h],
  );
  return (
    <group position={[x, 0, 0]}>
      {soft ? (
        <>
          {/* Soft look: pillowy clay plinth with rounded edges and a rounded cap. */}
          <mesh position={[0, FLOOR_Y + h / 2, 0]} geometry={softGeo!.body} castShadow receiveShadow>
            <meshStandardMaterial color="#efe4d8" roughness={0.95} />
          </mesh>
          <mesh position={[0, PLINTH_TOP + 0.03, 0]} geometry={softGeo!.cap} receiveShadow>
            <meshStandardMaterial color="#f8f0e6" roughness={0.9} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, FLOOR_Y + h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, w]} />
            <meshStandardMaterial color={hc ? '#dddddd' : '#efe4d8'} roughness={0.8} />
          </mesh>
          <mesh position={[0, PLINTH_TOP + 0.03, 0]} receiveShadow>
            <boxGeometry args={[w + 0.12, 0.06, w + 0.12]} />
            <meshStandardMaterial color={hc ? '#ffffff' : '#f8f0e6'} roughness={0.7} />
          </mesh>
        </>
      )}
      {/* soft contact blob (reads even without shadow maps) */}
      <mesh position={[0, PLINTH_TOP + 0.065, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 0.9, w * 0.9]} />
        <meshBasicMaterial map={softDotTexture()} color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ChoicePlinth({ x, i, view }: { x: number; i: number; view: View }) {
  const tex = useMemo(() => numberTexture(i + 1), [i]);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (ring.current) ring.current.opacity = view.reveal === i ? 0.95 : 0;
  });
  return (
    <group>
      <Plinth x={x} w={1.3} />
      <mesh position={[x, PLINTH_TOP + 0.08, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.55, 0.64, 40]} />
        <meshBasicMaterial ref={ring} color="#ffe2a8" transparent opacity={0} depthWrite={false} />
      </mesh>
      <sprite position={[x, PLINTH_TOP - 0.55, 0.75]} scale={[0.5, 0.5, 1]}>
        <spriteMaterial map={tex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

let cubeGeo: THREE.BufferGeometry | null = null;
function Sculpture({ s, view, index, onChoose }: { s: Sculpt; view: View; index: number; onChoose: (i: number) => void }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  if (!cubeGeo) cubeGeo = new RoundedBoxGeometry(CUBE * 0.96, CUBE * 0.96, CUBE * 0.96, 3, CUBE * 0.12);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: hc ? '#ffffff' : '#f3ebe2', roughness: 0.55, metalness: 0.02, emissive: '#ffcf9a', emissiveIntensity: 0 }),
    [hc],
  );
  const t = useRef(Math.random() * 5);
  useFrame((_, dt) => {
    const g = outer.current;
    const q = inner.current;
    if (!g || !q) return;
    t.current += dt;
    const red = ctx.settings.reducedMotion;
    g.position.copy(s.pos);
    if (!red) g.position.y += Math.sin(t.current * 1.1 + index) * 0.05;
    g.scale.setScalar(s.scale);
    q.quaternion.copy(s.quat);
    s.pulse = Math.max(0, s.pulse - dt * 1.5);
    s.dim = Math.max(0, s.dim - dt * 0.2);
    mat.emissiveIntensity = s.pulse * 0.25 + (view.mode === 'choice' && view.reveal === index ? 0.12 : 0);
    mat.color.set(hc ? '#ffffff' : '#f3ebe2').multiplyScalar(1 - s.dim * 0.35);
    if (halo.current) (halo.current.material as THREE.SpriteMaterial).opacity = hc ? 0 : 0.12 + s.pulse * 0.25;
  });
  return (
    <group ref={outer}>
      <sprite ref={halo} position={[0, 0, -0.6]} scale={[3.2, 3.2, 1]}>
        <spriteMaterial map={softDotTexture()} color="#ffe6c4" transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group ref={inner}>
        {s.base.map((v, k) => (
          <mesh key={k} geometry={cubeGeo!} material={mat} position={[(v[0] / 2) * CUBE, (v[1] / 2) * CUBE, (v[2] / 2) * CUBE]} castShadow receiveShadow />
        ))}
      </group>
      {view.mode === 'choice' && (
        <mesh
          onPointerDown={(e) => {
            e.stopPropagation();
            onChoose(index);
          }}
        >
          <boxGeometry args={[3.2, 3.6, 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** The live shadow: the sculpture flattened orthographically onto the wall (no shadow map needed). */
const flatBox = new THREE.BoxGeometry(1, 1, 1);
function WallShadow({ s, hc }: { s: Sculpt; hc: boolean }) {
  const inner = useRef<THREE.Group>(null);
  const outer = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: hc ? '#000000' : '#6e5a5e', transparent: true, opacity: 0 }), [hc]);
  const vis = useRef(0);
  useFrame((_, dt) => {
    if (!inner.current || !outer.current) return;
    inner.current.quaternion.copy(s.quat);
    vis.current += ((s.shadow ? 1 : 0) - vis.current) * damp(6, dt);
    mat.opacity = vis.current * (hc ? 1 : 0.88) * Math.min(1, s.scale * 1.5);
    outer.current.visible = vis.current > 0.01;
  });
  return (
    <group ref={outer} position={[0, SH_Y, WALL_Z + 0.02]} scale={[SHW, SHW, 0.001]} renderOrder={2}>
      <group ref={inner}>
        {s.base.map((v, k) => (
          <mesh key={k} geometry={flatBox} material={mat} position={[v[0] / 2, v[1] / 2, v[2] / 2]} renderOrder={2} />
        ))}
      </group>
    </group>
  );
}

function TargetOutline({ view }: { view: View }) {
  const ctx = useGame();
  const hc = ctx.settings.highContrast;
  const cells = view.targetCells;
  const { fillGeo, lineGeo } = useMemo(() => {
    const w = cells.length ? Math.max(...cells.map((c) => c[0])) + 1 : 1;
    const h = cells.length ? Math.max(...cells.map((c) => c[1])) + 1 : 1;
    const has = new Set(cells.map((c) => c.join(',')));
    const fp: number[] = [];
    const lp: number[] = [];
    const lw = hc ? 0.13 : 0.085;
    const quad = (arr: number[], x0: number, y0: number, x1: number, y1: number) => {
      arr.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
    };
    for (const [cx, cy] of cells) {
      const x = cx - (w - 1) / 2;
      const y = cy - (h - 1) / 2;
      quad(fp, x - 0.5, y - 0.5, x + 0.5, y + 0.5);
      if (!has.has(`${cx - 1},${cy}`)) quad(lp, x - 0.5 - lw, y - 0.5 - lw, x - 0.5 + lw, y + 0.5 + lw);
      if (!has.has(`${cx + 1},${cy}`)) quad(lp, x + 0.5 - lw, y - 0.5 - lw, x + 0.5 + lw, y + 0.5 + lw);
      if (!has.has(`${cx},${cy - 1}`)) quad(lp, x - 0.5 - lw, y - 0.5 - lw, x + 0.5 + lw, y - 0.5 + lw);
      if (!has.has(`${cx},${cy + 1}`)) quad(lp, x - 0.5 - lw, y + 0.5 - lw, x + 0.5 + lw, y + 0.5 + lw);
    }
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    return { fillGeo, lineGeo };
  }, [cells, hc]);
  const fillMat = useMemo(() => new THREE.MeshBasicMaterial({ color: hc ? '#9fb6ff' : '#a88670', transparent: true, opacity: 0, depthWrite: false }), [hc]);
  const litMat = useMemo(() => new THREE.MeshBasicMaterial({ color: hc ? '#ffe600' : '#ffe9bf', transparent: true, opacity: 0, depthWrite: false }), [hc]);
  const lineMat = useMemo(() => new THREE.MeshBasicMaterial({ color: hc ? '#0033cc' : '#8c5a40', transparent: true, opacity: 0, depthWrite: false }), [hc]);
  const glowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffc978', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  );
  useFrame((st) => {
    const o = view.outline;
    const m = view.matched;
    fillMat.opacity = o * 0.28;
    litMat.opacity = m * 0.92;
    const breathe = ctx.settings.reducedMotion ? 0 : Math.sin(st.clock.elapsedTime * 2) * 0.08;
    lineMat.opacity = o * (0.9 + breathe);
    glowMat.opacity = hc ? 0 : o * (0.25 + m * 0.6);
  });
  return (
    <group position={[0, SH_Y, WALL_Z + 0.01]} scale={[SHW, SHW, 1]}>
      <mesh geometry={fillGeo} material={fillMat} renderOrder={1} />
      <mesh geometry={fillGeo} material={litMat} position={[0, 0, 0.03]} renderOrder={3} />
      <mesh geometry={lineGeo} material={glowMat} position={[0, 0, 0.035]} scale={[1.0, 1.0, 1]} renderOrder={3} />
      <mesh geometry={lineGeo} material={lineMat} position={[0, 0, 0.04]} renderOrder={4} />
    </group>
  );
}
