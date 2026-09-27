// PixiJS v8 helpers for Utopia games. Import from '@/sdk/pixi'.
import { Application, Container, Sprite, Texture, type ColorSource } from 'pixi.js';
import type { GameContext } from './types';

/**
 * Create a Pixi Application filling ctx.container. Rendering is driven by the pause-aware ctx.loop
 * (priority -100, i.e. after game logic), so pausing the game freezes the canvas.
 * The app is destroyed automatically when the game is destroyed (ctx.signal abort).
 */
export async function createPixiApp(ctx: GameContext, opts: { background?: ColorSource; backgroundAlpha?: number } = {}): Promise<Application> {
  const app = new Application();
  await app.init({
    resizeTo: ctx.container,
    background: opts.background ?? ctx.manifest.palette.bg,
    backgroundAlpha: opts.backgroundAlpha ?? 1,
    antialias: ctx.quality.tier !== 'low',
    resolution: ctx.quality.maxDpr,
    autoDensity: true,
    autoStart: false,
    preserveDrawingBuffer: ctx.mode === 'preview',
    powerPreference: 'high-performance',
    preference: 'webgl',
  });
  app.ticker.stop();
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  ctx.container.appendChild(canvas);
  ctx.loop(() => app.render(), -100);
  let destroyed = false;
  ctx.signal.addEventListener('abort', () => {
    if (destroyed) return;
    destroyed = true;
    try {
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    } catch {
      /* ignore */
    }
  });
  // Render one frame immediately so previews/posters aren't blank.
  app.render();
  return app;
}

const glowCache = new Map<string, Texture>();

/** Soft radial glow texture (white; tint the sprite). Cached per size+falloff. */
export function glowTexture(size = 128, falloff = 0.35): Texture {
  const key = `${size}:${falloff}`;
  const hit = glowCache.get(key);
  if (hit && !hit.destroyed) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(falloff, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = Texture.from(c);
  glowCache.set(key, t);
  return t;
}

/** Vertical gradient texture, stretched to fill backgrounds. */
export function gradientTexture(stops: Array<[number, string]>, height = 256): Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = height;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, height);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, height);
  return Texture.from(c);
}

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  scale: number;
}

/** Pooled additive glow particles. burst(x, y, n, {color}) — updates via ctx.loop. */
export function createParticles(ctx: GameContext, parent: Container, max = 300) {
  const cap = Math.max(30, Math.floor(max * ctx.quality.particleScale));
  const layer = new Container();
  parent.addChild(layer);
  const tex = glowTexture(64, 0.25);
  const pool: P[] = [];
  for (let i = 0; i < cap; i++) {
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.visible = false;
    layer.addChild(s);
    pool.push({ s, vx: 0, vy: 0, life: 0, max: 1, g: 0, scale: 1 });
  }
  let next = 0;
  ctx.loop((dt) => {
    const k = dt / 1000;
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= k;
      p.vy += p.g * k;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.s.x += p.vx * k;
      p.s.y += p.vy * k;
      const f = Math.max(0, p.life / p.max);
      p.s.alpha = f;
      p.s.scale.set(p.scale * (0.4 + 0.6 * f));
      if (p.life <= 0) p.s.visible = false;
    }
  });
  return {
    layer,
    burst(x: number, y: number, n = 20, o: { color?: ColorSource; speed?: number; life?: number; gravity?: number; size?: number } = {}) {
      const count = Math.max(1, Math.round(n * ctx.quality.particleScale));
      for (let i = 0; i < count; i++) {
        const p = pool[next];
        next = (next + 1) % cap;
        const a = Math.random() * Math.PI * 2;
        const sp = (o.speed ?? 220) * (0.3 + Math.random() * 0.7);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
        p.life = p.max = (o.life ?? 0.8) * (0.6 + Math.random() * 0.4);
        p.g = o.gravity ?? 0;
        p.scale = ((o.size ?? 18) / 32) * (0.6 + Math.random() * 0.6);
        p.s.tint = o.color ?? 0xffffff;
        p.s.position.set(x, y);
        p.s.visible = true;
      }
    },
  };
}
