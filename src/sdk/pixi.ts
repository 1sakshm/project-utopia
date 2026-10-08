// PixiJS v8 helpers for Utopia games. Import from '@/sdk/pixi'.
import { Application, Container, Sprite, Texture, type ColorSource } from 'pixi.js';
import type { GameContext } from './types';
import { mixHex } from './util';

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

// ---------- Soft (neumorphism) surfaces ----------

/** Shadow pair for a neumorphic surface on `base`: a darker shade (bottom-right) and a lighter one (top-left). */
export function softShades(base: string) {
  return { dark: mixHex(base, '#000000', 0.55), light: mixHex(base, '#ffffff', 0.09), face: mixHex(base, '#ffffff', 0.035) };
}

export interface SoftTileOptions {
  width: number;
  height: number;
  /** Surface color the tile is extruded from (usually the game's background). */
  base: string;
  radius?: number;
  /** Inset ("pressed") instead of raised. */
  pressed?: boolean;
  /** Shadow distance in px (default scales with size). */
  depth?: number;
  /** Optional colored rim, e.g. for a selected / correct / active state. */
  rim?: string;
  rimWidth?: number;
  /** Device pixel ratio for crispness (pass ctx.quality.maxDpr). */
  resolution?: number;
}

const softCache = new Map<string, Texture>();

function rrPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/**
 * Neumorphic rounded-rect texture (raised or pressed), cached by its options. The texture includes padding for the
 * shadows: use `softTile()` to get a correctly sized sprite, or place it yourself with `softTilePad(o)`.
 */
export function softTileTexture(o: SoftTileOptions): Texture {
  const res = Math.max(1, Math.min(3, o.resolution ?? 2));
  const depth = o.depth ?? Math.max(3, Math.min(10, Math.min(o.width, o.height) * 0.07));
  const radius = o.radius ?? Math.min(o.width, o.height) * 0.22;
  const key = [o.width, o.height, o.base, radius, o.pressed ? 1 : 0, depth, o.rim ?? '', o.rimWidth ?? 0, res].join('|');
  const hit = softCache.get(key);
  if (hit && !hit.destroyed) return hit;
  const pad = softTilePad(o, depth);
  const c = document.createElement('canvas');
  c.width = Math.ceil((o.width + pad * 2) * res);
  c.height = Math.ceil((o.height + pad * 2) * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  const { dark, light, face } = softShades(o.base);
  const x = pad;
  const y = pad;
  if (!o.pressed) {
    // Raised: dark shadow bottom-right, light shadow top-left, then a faint top-left-lit face.
    g.save();
    rrPath(g, x, y, o.width, o.height, radius);
    g.shadowColor = dark;
    g.shadowBlur = depth * 2;
    g.shadowOffsetX = depth;
    g.shadowOffsetY = depth;
    g.fillStyle = o.base;
    g.fill();
    g.shadowColor = light;
    g.shadowOffsetX = -depth * 0.8;
    g.shadowOffsetY = -depth * 0.8;
    g.fill();
    g.restore();
    const grd = g.createLinearGradient(x, y, x + o.width, y + o.height);
    grd.addColorStop(0, face);
    grd.addColorStop(1, mixHex(o.base, '#000000', 0.06));
    rrPath(g, x, y, o.width, o.height, radius);
    g.fillStyle = grd;
    g.fill();
  } else {
    // Pressed: fill, then inner shadows by clipping to the shape and shadowing a frame drawn around it.
    rrPath(g, x, y, o.width, o.height, radius);
    g.fillStyle = mixHex(o.base, '#000000', 0.05);
    g.fill();
    g.save();
    rrPath(g, x, y, o.width, o.height, radius);
    g.clip();
    const frame = (dx: number, dy: number, color: string) => {
      g.save();
      g.shadowColor = color;
      g.shadowBlur = depth * 1.6;
      g.shadowOffsetX = dx;
      g.shadowOffsetY = dy;
      g.beginPath();
      g.rect(x - 60, y - 60, o.width + 120, o.height + 120);
      rrPath(g, x, y, o.width, o.height, radius);
      g.fillStyle = '#000';
      g.fill('evenodd');
      g.restore();
    };
    frame(depth * 0.8, depth * 0.8, dark);
    frame(-depth * 0.6, -depth * 0.6, light);
    g.restore();
  }
  if (o.rim) {
    rrPath(g, x + 0.5, y + 0.5, o.width - 1, o.height - 1, radius);
    g.strokeStyle = o.rim;
    g.lineWidth = o.rimWidth ?? 2;
    g.stroke();
  }
  const t = Texture.from(c);
  softCache.set(key, t);
  return t;
}

/** Padding (px, logical) around the tile inside its texture, to make room for shadows. */
export function softTilePad(o: Pick<SoftTileOptions, 'width' | 'height' | 'depth'>, depth = o.depth ?? Math.max(3, Math.min(10, Math.min(o.width, o.height) * 0.07))) {
  return Math.ceil(depth * 3);
}

/**
 * A centered (anchor 0.5) sprite showing a neumorphic tile of exactly width × height (the shadow spills outside).
 * Swap states cheaply with `sprite.texture = softTileTexture({...o, pressed: true})`.
 */
export function softTile(o: SoftTileOptions): Sprite {
  const t = softTileTexture(o);
  const s = new Sprite(t);
  s.anchor.set(0.5);
  const pad = softTilePad(o);
  s.width = o.width + pad * 2;
  s.height = o.height + pad * 2;
  return s;
}
