// Screen-space effects on one shared overlay canvas: confetti/spark bursts and orbs flying into the wallet.
import { prefersReducedMotion } from '@/platform/settings';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  shape: 'confetti' | 'spark' | 'orb';
  /** Homing target for 'orb' particles. */
  tx?: number;
  ty?: number;
  onArrive?: () => void;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let parts: P[] = [];
let raf = 0;

function ensure() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  const size = () => {
    const d = Math.min(2, window.devicePixelRatio || 1);
    canvas!.width = innerWidth * d;
    canvas!.height = innerHeight * d;
    ctx?.setTransform(d, 0, 0, d, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
}

function loop() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const dt = 1 / 60;
  parts = parts.filter((p) => {
    p.life -= dt;
    if (p.shape === 'orb' && p.tx !== undefined && p.ty !== undefined) {
      const k = 1 - Math.max(0, p.life) / p.max;
      // Burst outwards first, then home in on the target with growing pull.
      const pull = Math.min(1, k * k * 2.6);
      p.vx += (p.tx - p.x) * pull * 0.9 * dt * 10;
      p.vy += (p.ty - p.y) * pull * 0.9 * dt * 10;
      p.vx *= 0.9;
      p.vy *= 0.9;
      if (Math.hypot(p.tx - p.x, p.ty - p.y) < 14 && k > 0.25) {
        p.onArrive?.();
        return false;
      }
    } else {
      p.vy += (p.shape === 'confetti' ? 520 : -30) * dt;
      p.vx *= 0.985;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const a = Math.max(0, Math.min(1, p.life / (p.max * 0.4)));
    ctx!.globalAlpha = a;
    if (p.shape === 'confetti') {
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9 * Math.abs(Math.cos(p.rot * 1.7)) + 1);
      ctx!.restore();
    } else {
      const g = ctx!.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r * (p.shape === 'orb' ? 1.6 : 2.2));
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.r * (p.shape === 'orb' ? 1.6 : 2.2), 0, 6.283);
      ctx!.fill();
    }
    return p.life > 0;
  });
  ctx.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(loop) : 0;
}

function start() {
  if (!raf) raf = requestAnimationFrame(loop);
}

const CONFETTI = ['#d9b46d', '#e9dfcb', '#c9a25a', '#b5786a'];

/** Confetti + sparks from a point (viewport px). */
export function burst(x: number, y: number, opts: { count?: number; colors?: string[]; power?: number; sparks?: boolean } = {}) {
  if (prefersReducedMotion()) return;
  ensure();
  const colors = opts.colors ?? CONFETTI;
  // Quiet by design: a handful of embers drifting up, whatever the caller asked for.
  const n = Math.round(Math.min(16, (opts.count ?? 70) * 0.14));
  const pw = (opts.power ?? 1) * 0.45;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (220 + Math.random() * 520) * pw;
    const spark = true;
    const max = 1.4 + Math.random() * 1.2;
    parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.5 - 180 * pw,
      r: spark ? 1.2 + Math.random() * 1.4 : 4 + Math.random() * 4,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 18,
      life: max,
      max,
      color: colors[i % colors.length],
      shape: spark ? 'spark' : 'confetti',
    });
  }
  start();
}

export function burstFrom(el: Element | null, opts?: Parameters<typeof burst>[2]) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/** Little orbs that pop out of `from` and fly into `to` (e.g. the wallet). `onEach` fires as each one lands. */
export function flyOrbs(from: Element | null, to: Element | null, count = 12, color = '#ffd23f', onEach?: () => void) {
  if (!from || !to || prefersReducedMotion()) return;
  ensure();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 240 + Math.random() * 300;
    const max = 1.2 + Math.random() * 0.5;
    parts.push({
      x: a.left + a.width / 2,
      y: a.top + a.height / 2,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: 5 + Math.random() * 3,
      rot: 0,
      vr: 0,
      life: max,
      max,
      color,
      shape: 'orb',
      tx: b.left + b.width / 2,
      ty: b.top + b.height / 2,
      onArrive: () => {
        onEach?.();
        to.animate?.([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
      },
    });
  }
  start();
}

/** Short camera-shake on an element. */
export function shake(el: Element | null, strength = 8) {
  if (!el || prefersReducedMotion()) return;
  const s = strength;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-s}px,${s / 2}px)` },
      { transform: `translate(${s}px,${-s / 2}px)` },
      { transform: `translate(${-s / 2}px,${-s / 3}px)` },
      { transform: `translate(${s / 3}px,${s / 4}px)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 380, easing: 'ease-out' },
  );
}
