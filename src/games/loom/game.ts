import { Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import type { GameContext, GameInstance } from '@/sdk';
import { clamp, easeInOutSine, easeOutBack, lerp, tween, TAU } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTile, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { describeRule, generate, type Puzzle, type Tile } from './logic';

const MIN_PUZZLES = 8;
const MAX_PUZZLES = 12;
const MIN_MS = 120000;
const MAX_MS = 290000;

const SHAPE_COLORS = [0xe8566f, 0xf2b33d, 0x3fc393, 0x5a97f2, 0xb67cf0, 0xff8a5c];
const CLOTHS = [0x2a1d3f, 0x1d2c3f, 0x3a1f2a, 0x1f3330, 0x33261a];
const GOLD = 0xe9bb5c;

function fabricTexture(): Texture {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, s, s);
  // plain weave: alternating over/under thread cells with a soft highlight on each "over" thread
  const cell = 4;
  for (let y = 0; y < s; y += cell) {
    for (let x = 0; x < s; x += cell) {
      const over = ((x + y) / cell) % 2 === 0;
      g.fillStyle = over ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.16)';
      g.fillRect(x, y, cell, cell);
      g.fillStyle = over ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)';
      if (over) g.fillRect(x, y, cell, 1);
      else g.fillRect(x, y, 1, cell);
    }
  }
  return Texture.from(c);
}

function sheenTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.22)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  grd.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

// Sutherland–Hodgman clip of a convex polygon against half-plane n·p <= d
function clipHalf(poly: number[][], nx: number, ny: number, d: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = a[0] * nx + a[1] * ny - d;
    const db = b[0] * nx + b[1] * ny - d;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function polyPoints(shape: number, r: number): number[] {
  const pts: number[] = [];
  if (shape === 5) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r * 1.12 : r * 0.48;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    return pts;
  }
  const sides = shape + 3;
  const scale = shape === 0 ? 1.15 : shape === 1 ? 0.95 : 1;
  const rot = shape === 1 ? -Math.PI / 4 : -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * TAU) / sides;
    pts.push(Math.cos(a) * r * scale, Math.sin(a) * r * scale + (shape === 0 ? r * 0.15 : 0));
  }
  return pts;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx, { background: '#140d16' });
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const S = ctx.settings;
  const dpr = ctx.quality.maxDpr;
  const stair = ctx.staircase({ min: 1, max: 10, up: 2, down: 1 });
  if (preview) stair.set(3);
  const note = ctx.audio.scale(57, 'major');
  const fabric = fabricTexture();
  const sheen = sheenTexture();

  // Soft (dark neumorphism) look: a calm plum ground; the matrix cells become inset wells the cloth tiles are inlaid
  // in, the candidate tray is an inset tray and the candidates are raised tiles on it.
  const soft = () => S.soft;
  const SB = '#1f1322';
  const softOpts = (size: number, pressed: boolean): SoftTileOptions => ({
    width: size,
    height: size,
    base: SB,
    radius: Math.max(3, size * 0.07) + 2,
    pressed,
    depth: Math.max(4, Math.min(8, size * 0.07)),
    resolution: dpr,
  });
  /** Grid tiles are drawn a little smaller than their cell in soft mode so the well's inner shadow shows round them. */
  const gridTileSize = () => (soft() ? Math.round(gridGeom.size * 0.88) : gridGeom.size);
  const auroraBg = gradientTexture([
    [0, '#1c1020'],
    [0.5, '#24142a'],
    [1, '#120b12'],
  ]);
  const softBg = gradientTexture([
    [0, '#170d19'],
    [0.3, SB],
    [1, SB],
  ]);

  // ---------------------------------------------------------------- scene
  const bg = new Sprite(auroraBg);
  const vignette = new Sprite(glowTexture(256, 0.5));
  vignette.anchor.set(0.5);
  vignette.tint = 0x6a3a5a;
  vignette.blendMode = 'add';
  const lattice = new Graphics();
  const motes = new Container();
  const loom = new Container(); // frame + warp threads + grid
  const frameBack = new Graphics();
  const warp = new Graphics();
  const gridLayer = new Container();
  const frameFront = new Graphics();
  const shuttle = new Container();
  loom.addChild(frameBack, warp, gridLayer, frameFront, shuttle);
  const threadFx = new Graphics();
  const tray = new Container();
  const strip = new Container();
  const ruleText = new Text({ text: '', style: { fontFamily: 'Manrope, system-ui, sans-serif' }, resolution: dpr });
  ruleText.anchor.set(0.5);
  ruleText.alpha = 0;
  const fx = new Container();
  const reveal = new Container();
  app.stage.addChild(bg, vignette, lattice, motes, loom, threadFx, tray, strip, ruleText, fx, reveal);
  const particles = createParticles(ctx, fx, 260);

  // shuttle graphic
  const shuttleG = new Graphics();
  shuttleG.poly([-26, 0, -14, -6, 14, -6, 26, 0, 14, 6, -14, 6]).fill({ color: 0x9a6a3a });
  shuttleG.poly([-26, 0, -14, -6, 14, -6, 26, 0, 14, 6, -14, 6]).stroke({ width: 1.5, color: 0x5a3a1a });
  shuttleG.roundRect(-8, -2.5, 16, 5, 2).fill({ color: GOLD });
  shuttle.addChild(shuttleG);

  // ambient motes
  const moteList: Array<{ s: Sprite; x: number; y: number; v: number; ph: number }> = [];
  const nMotes = Math.round(22 * ctx.quality.particleScale);
  for (let i = 0; i < nMotes; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = 0xffd9a0;
    s.scale.set(0.25 + rng.next() * 0.3);
    s.alpha = 0.3;
    motes.addChild(s);
    moteList.push({ s, x: rng.next(), y: rng.next(), v: 0.004 + rng.next() * 0.01, ph: rng.next() * TAU });
  }

  // ---------------------------------------------------------------- state
  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let alive = true;
  let puzzle: Puzzle | null = null;
  let cloth = CLOTHS[0];
  let accepting = false;
  let attempts = 0;
  let score = 0;
  let solved = 0;
  let firstTries = 0;
  let streak = 0;
  let bestStreak = 0;
  let hardest = 0;
  let sessionStart = 0;
  let puzzleStart = 0;
  let resolvePuzzle: (() => void) | null = null;
  let stopAmbient: (() => void) | null = null;
  const woven: Array<{ puzzle: Puzzle; cloth: number }> = [];

  interface Cand {
    tile: Tile;
    view: Container;
    glow: Sprite;
    size: number;
    hx: number;
    hy: number;
    state: 'idle' | 'wrong' | 'used';
    hover: number;
    shake: number;
  }
  let cands: Cand[] = [];
  let gridGeom = { x: 0, y: 0, size: 100, gap: 6, n: 3 };
  let slotView: Container | null = null;
  let slotPulse: Graphics | null = null;

  // ---------------------------------------------------------------- tile drawing
  function buildTile(t: Tile, size: number, clothColor: number, detail = true): Container {
    const hc = S.highContrast;
    const c = new Container();
    const h = size / 2;
    const rad = Math.max(3, size * 0.07);
    const base = new Graphics();
    if (detail && !soft()) base.roundRect(-h + 2, -h + 4, size, size, rad).fill({ color: 0x000000, alpha: 0.35 });
    base.roundRect(-h, -h, size, size, rad).fill({ color: hc ? 0x000000 : clothColor });
    c.addChild(base);
    if (!hc && detail) {
      const fab = new TilingSprite({ texture: fabric, width: size - 4, height: size - 4 });
      fab.position.set(-h + 2, -h + 2);
      fab.tileScale.set(Math.max(0.6, size / 110));
      c.addChild(fab);
    }
    const g = new Graphics();
    // weave bands at the stripe angle, clipped to the tile
    const ang = (t.stripe * Math.PI) / 4;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const inset = h - 3;
    const square = [
      [-inset, -inset],
      [inset, -inset],
      [inset, inset],
      [-inset, inset],
    ];
    const bw = size * 0.065;
    for (const off of [-size * 0.3, size * 0.3]) {
      let band = clipHalf(square, nx, ny, off + bw);
      band = clipHalf(band, -nx, -ny, -(off - bw));
      if (band.length >= 3) {
        g.poly(band.flat()).fill({ color: hc ? 0x9a9a9a : GOLD, alpha: hc ? 1 : 0.55 });
        // thread highlight along the band
        let core = clipHalf(square, nx, ny, off + bw * 0.25);
        core = clipHalf(core, -nx, -ny, -(off - bw * 0.25));
        if (core.length >= 3) g.poly(core.flat()).fill({ color: hc ? 0xcccccc : 0xfff0c0, alpha: hc ? 0.8 : 0.5 });
      }
    }
    // motifs
    const n = t.count + 1;
    const layouts: number[][][] = [
      [[0, 0]],
      [
        [-0.21, 0],
        [0.21, 0],
      ],
      [
        [0, -0.19],
        [-0.2, 0.16],
        [0.2, 0.16],
      ],
      [
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2],
      ],
    ];
    const mr = size * [0.27, 0.175, 0.16, 0.148][t.count];
    const col = hc ? 0xffffff : SHAPE_COLORS[t.shape];
    const dark = hc ? 0x000000 : 0x140a14;
    const sw = Math.max(1.5, size * (hc ? 0.04 : 0.03));
    for (let i = 0; i < n; i++) {
      const [px, py] = layouts[t.count][i];
      const cx = px * size;
      const cy = py * size;
      const draw = (r: number) => {
        if (t.shape === 4) g.circle(cx, cy, r);
        else {
          const p = polyPoints(t.shape, r);
          for (let j = 0; j < p.length; j += 2) {
            p[j] += cx;
            p[j + 1] += cy;
          }
          g.poly(p);
        }
      };
      if (t.fill === 0) {
        draw(mr);
        g.fill({ color: col });
        draw(mr);
        g.stroke({ width: sw * 0.8, color: dark, alpha: 0.7, join: 'round' });
        if (!hc && detail) {
          draw(mr * 0.62);
          g.stroke({ width: Math.max(1, sw * 0.45), color: 0xffffff, alpha: 0.28, join: 'round' });
        }
      } else if (t.fill === 1) {
        draw(mr);
        g.fill({ color: dark, alpha: 0.55 });
        draw(mr * 0.92);
        g.stroke({ width: sw * 1.5, color: col, join: 'round' });
      } else {
        draw(mr);
        g.fill({ color: dark, alpha: 0.55 });
        draw(mr * 0.94);
        g.stroke({ width: sw * 1.1, color: col, join: 'round' });
        draw(mr * 0.42);
        g.fill({ color: col });
      }
    }
    // edge stitches (running stitch along marked edges)
    if (t.marks) {
      const e = h - size * 0.1;
      const dashes = 4;
      const len = (2 * e) / (dashes * 2 - 1);
      const mc = hc ? 0xffffff : 0xfff1d6;
      const edges: Array<[number, number, number, number]> = [
        [-e, -e, 1, 0],
        [e, -e, 0, 1],
        [e, e, -1, 0],
        [-e, e, 0, -1],
      ];
      edges.forEach(([x0, y0, dx, dy], k) => {
        if (!(t.marks & (1 << k))) return;
        for (let d = 0; d < dashes; d++) {
          const s0 = d * len * 2;
          g.moveTo(x0 + dx * s0, y0 + dy * s0).lineTo(x0 + dx * (s0 + len), y0 + dy * (s0 + len));
        }
      });
      g.stroke({ width: Math.max(2, size * 0.035), color: mc, cap: 'round', alpha: 0.95 });
    }
    // border & thread sheen
    g.roundRect(-h, -h, size, size, rad).stroke({ width: hc ? 2.5 : 1.5, color: hc ? 0xffffff : 0x000000, alpha: hc ? 1 : 0.5 });
    c.addChild(g);
    if (!hc && detail) {
      const sh = new Sprite(sheen);
      sh.position.set(-h, -h);
      sh.width = sh.height = size;
      c.addChild(sh);
      const hl = new Graphics();
      hl.moveTo(-h + rad, -h + 1.5).lineTo(h - rad, -h + 1.5).stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
      c.addChild(hl);
    }
    return c;
  }

  // ---------------------------------------------------------------- layout
  function computeGeom() {
    const n = puzzle?.n ?? 3;
    const gap = n === 3 ? 8 : 6;
    const maxW = safe.w - 56;
    const maxH = safe.h * 0.47;
    const size = Math.floor(Math.min(n === 3 ? 108 : 86, (Math.min(maxW, maxH) - gap * (n - 1)) / n));
    const total = size * n + gap * (n - 1);
    gridGeom = { x: safe.x + (safe.w - total) / 2, y: safe.y + safe.h * 0.14, size, gap, n };
  }

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.texture = soft() ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    vignette.position.set(W / 2, safe.y + safe.h * 0.38);
    vignette.scale.set((Math.max(W, H) * 1.1) / 256);
    vignette.alpha = S.highContrast ? 0 : soft() ? 0.07 : 0.18;
    lattice.clear();
    if (!S.highContrast && !soft()) {
      // faint diamond lattice, like a woven ground cloth
      const step = 38;
      for (let x = -H; x < W + H; x += step) {
        lattice.moveTo(x, 0).lineTo(x + H, H);
        lattice.moveTo(x, 0).lineTo(x - H, H);
      }
      lattice.stroke({ width: 1, color: GOLD, alpha: 0.045 });
    }
    computeGeom();
    drawFrame();
    buildGrid();
    buildTray();
    buildStrip();
    ruleText.position.set(safe.x + safe.w / 2, gridGeom.y + gridGeom.size * gridGeom.n + gridGeom.gap * (gridGeom.n - 1) + 30);
  }

  function gridBottom() {
    return gridGeom.y + gridGeom.size * gridGeom.n + gridGeom.gap * (gridGeom.n - 1);
  }

  function drawFrame() {
    const hc = S.highContrast;
    const g = gridGeom;
    const total = g.size * g.n + g.gap * (g.n - 1);
    const x0 = g.x - 18;
    const x1 = g.x + total + 18;
    const yTop = g.y - 26;
    const yBot = gridBottom() + 14;
    const wood = hc ? 0x444444 : 0x6b4526;
    const woodDark = hc ? 0xffffff : 0x3d2412;
    frameBack.clear();
    if (!soft()) frameBack.roundRect(x0 - 4, yTop - 6, x1 - x0 + 8, yBot - yTop + 16, 14).fill({ color: 0x000000, alpha: hc ? 0 : 0.25 });
    warp.clear();
    const threads = Math.round(total / 7);
    for (let i = 0; i <= threads; i++) {
      const x = g.x + (i / threads) * total;
      warp.moveTo(x, yTop + 8).lineTo(x, yBot);
    }
    warp.stroke({ width: 1, color: hc ? 0xffffff : 0xf4dcb0, alpha: hc ? 0.25 : 0.14 });
    frameFront.clear();
    // top & bottom beams
    for (const [y, hgt] of [
      [yTop - 4, 14],
      [yBot, 10],
    ] as const) {
      frameFront.roundRect(x0 - 10, y, x1 - x0 + 20, hgt, 5).fill({ color: wood });
      frameFront.roundRect(x0 - 10, y, x1 - x0 + 20, hgt, 5).stroke({ width: 1.5, color: woodDark, alpha: 0.8 });
      if (!hc) frameFront.moveTo(x0 - 4, y + 3).lineTo(x1 + 4, y + 3).stroke({ width: 1, color: 0xc8905a, alpha: 0.5 });
    }
    // side posts
    for (const x of [x0 - 6, x1 - 2]) {
      frameFront.roundRect(x, yTop - 10, 8, yBot - yTop + 24, 4).fill({ color: wood });
      frameFront.roundRect(x, yTop - 10, 8, yBot - yTop + 24, 4).stroke({ width: 1.5, color: woodDark, alpha: 0.8 });
    }
    // knobs
    for (const x of [x0 - 2, x1 + 2]) {
      frameFront.circle(x, yTop - 12, 6).fill({ color: hc ? 0xffffff : 0x8a5a30 });
    }
    shuttle.position.set(x0 + 20, yTop + 3);
  }

  function cellPos(r: number, c: number) {
    const g = gridGeom;
    return { x: g.x + c * (g.size + g.gap) + g.size / 2, y: g.y + r * (g.size + g.gap) + g.size / 2 };
  }

  function buildGrid() {
    gridLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    slotView = null;
    slotPulse = null;
    if (!puzzle) return;
    const p = puzzle;
    if (soft()) {
      for (let r = 0; r < p.n; r++) {
        for (let c = 0; c < p.n; c++) {
          const well = softTile(softOpts(gridGeom.size, true));
          const pos = cellPos(r, c);
          well.position.set(pos.x, pos.y);
          gridLayer.addChild(well);
        }
      }
    }
    for (let r = 0; r < p.n; r++) {
      for (let c = 0; c < p.n; c++) {
        const pos = cellPos(r, c);
        if (r === p.missing[0] && c === p.missing[1]) {
          const slot = new Container();
          slot.position.set(pos.x, pos.y);
          const pulse = new Graphics();
          drawSlot(pulse, gridGeom.size);
          const q = new Text({
            text: '?',
            style: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: Math.round(gridGeom.size * 0.38), fontWeight: '800', fill: S.highContrast ? 0xffffff : 0xffe2a8 },
            resolution: dpr,
          });
          q.anchor.set(0.5);
          q.alpha = 0.8;
          slot.addChild(pulse, q);
          gridLayer.addChild(slot);
          slotView = slot;
          slotPulse = pulse;
          continue;
        }
        const tile = buildTile(p.grid[r][c], gridTileSize(), cloth);
        tile.position.set(pos.x, pos.y);
        gridLayer.addChild(tile);
      }
    }
  }

  function drawSlot(g: Graphics, size: number) {
    const hc = S.highContrast;
    const h = size / 2;
    g.clear();
    // soft: the cell's inset well shows through; only the dashed golden border marks the gap
    if (!soft()) g.roundRect(-h, -h, size, size, size * 0.07).fill({ color: 0x000000, alpha: hc ? 1 : 0.35 });
    // dashed golden border
    const segs = 6;
    const e = h - (soft() ? 8 : 3);
    const len = (2 * e) / (segs * 2 - 1);
    for (const [x0, y0, dx, dy] of [
      [-e, -e, 1, 0],
      [e, -e, 0, 1],
      [e, e, -1, 0],
      [-e, e, 0, -1],
    ]) {
      for (let d = 0; d < segs; d++) {
        const s0 = d * len * 2;
        g.moveTo(x0 + dx * s0, y0 + dy * s0).lineTo(x0 + dx * (s0 + len), y0 + dy * (s0 + len));
      }
    }
    g.stroke({ width: hc ? 3 : 2.5, color: hc ? 0xffffff : GOLD, cap: 'round' });
  }

  function trayLayout(k: number) {
    const perRow = k <= 4 ? k : 3;
    const rows = Math.ceil(k / perRow);
    const gap = 12;
    const top = gridBottom() + 58;
    const avail = safe.y + safe.h - 46 - top;
    const size = Math.floor(Math.min(k <= 4 ? 80 : 74, (safe.w - 32 - gap * (perRow - 1)) / perRow, (avail - gap * (rows - 1)) / rows));
    return { perRow, rows, gap, top, size };
  }

  function buildTray() {
    tray.removeChildren().forEach((c) => c.destroy({ children: true }));
    const old = cands;
    cands = [];
    if (!puzzle) return;
    const p = puzzle;
    const k = p.candidates.length;
    const L = trayLayout(k);
    // tray board
    const board = new Graphics();
    const rowsW = L.perRow * L.size + (L.perRow - 1) * L.gap;
    const bh = L.rows * L.size + (L.rows - 1) * L.gap + 28;
    if (soft()) {
      const well = softTile({ width: Math.round(rowsW + 32), height: Math.round(bh), base: SB, radius: 18, pressed: true, depth: 8, resolution: dpr });
      well.position.set(safe.x + safe.w / 2, L.top - 14 + bh / 2);
      tray.addChild(well);
    } else {
      board.roundRect(safe.x + (safe.w - rowsW) / 2 - 16, L.top - 14, rowsW + 32, bh, 16).fill({ color: S.highContrast ? 0x000000 : 0x2a1a14, alpha: S.highContrast ? 1 : 0.7 });
      board.roundRect(safe.x + (safe.w - rowsW) / 2 - 16, L.top - 14, rowsW + 32, bh, 16).stroke({ width: S.highContrast ? 2 : 1.5, color: S.highContrast ? 0xffffff : 0x8a5a30, alpha: 0.8 });
    }
    tray.addChild(board);
    p.candidates.forEach((t, i) => {
      const row = Math.floor(i / L.perRow);
      const inRow = Math.min(L.perRow, k - row * L.perRow);
      const rw = inRow * L.size + (inRow - 1) * L.gap;
      const x = safe.x + (safe.w - rw) / 2 + (i - row * L.perRow) * (L.size + L.gap) + L.size / 2;
      const y = L.top + row * (L.size + L.gap) + L.size / 2;
      const view = new Container();
      const glow = new Sprite(glowTexture(128, 0.35));
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = GOLD;
      glow.alpha = 0;
      glow.scale.set((L.size * 2) / 128);
      const tile = buildTile(t, L.size, cloth);
      view.addChild(glow);
      if (soft()) {
        // raised candidate: the soft tile's shadows frame the cloth tile drawn on its face
        const lift = softTile(softOpts(L.size, false));
        lift.label = 'softTile';
        view.addChild(lift);
      }
      view.addChild(tile);
      // number badge
      const badge = new Container();
      const bgc = new Graphics().circle(0, 0, 10).fill({ color: 0x140a14, alpha: 0.9 }).circle(0, 0, 10).stroke({ width: 1.5, color: S.highContrast ? 0xffffff : GOLD });
      const bt = new Text({ text: String(i + 1), style: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 12, fontWeight: '800', fill: 0xffffff }, resolution: dpr });
      bt.anchor.set(0.5);
      badge.addChild(bgc, bt);
      badge.position.set(-L.size / 2 + 4, -L.size / 2 + 4);
      badge.visible = S.showKeyHints && !preview;
      view.addChild(badge);
      view.position.set(x, y);
      const prev = old[i];
      const cand: Cand = { tile: t, view, glow, size: L.size, hx: x, hy: y, state: prev && prev.tile === t ? prev.state : 'idle', hover: 0, shake: 0 };
      if (cand.state === 'wrong') markWrong(cand);
      if (cand.state === 'used') view.visible = false;
      view.eventMode = preview ? 'none' : 'static';
      view.cursor = 'pointer';
      view.hitArea = new Rectangle(-L.size / 2 - 4, -L.size / 2 - 4, L.size + 8, L.size + 8);
      view.on('pointerover', () => (cand.hover = 1));
      view.on('pointerout', () => (cand.hover = 0));
      view.on('pointerdown', () => choose(i));
      tray.addChild(view);
      cands.push(cand);
    });
  }

  function markWrong(c: Cand) {
    c.view.alpha = 0.4;
    // soft: a snapped candidate sinks into the tray (pressed) as well as dimming and getting the ✗
    const lift = c.view.children.find((ch) => ch.label === 'softTile') as Sprite | undefined;
    if (lift) {
      const o = softOpts(c.size, true);
      lift.texture = softTileTexture(o);
      lift.width = lift.height = c.size + softTilePad(o) * 2;
    }
    const x = new Graphics();
    const k = c.size * 0.28;
    x.moveTo(-k, -k).lineTo(k, k).moveTo(k, -k).lineTo(-k, k).stroke({ width: 4, color: S.highContrast ? 0xffffff : 0xfff1d6, cap: 'round' });
    c.view.addChild(x);
  }

  function buildStrip() {
    strip.removeChildren().forEach((c) => c.destroy({ children: true }));
    const n = Math.max(MIN_PUZZLES, woven.length + (puzzle ? 1 : 0));
    const sz = Math.min(20, (safe.w - 60) / n - 4);
    const total = n * (sz + 4) - 4;
    const x0 = safe.x + (safe.w - total) / 2;
    const y = safe.y + safe.h - 22;
    const line = new Graphics();
    line.moveTo(x0 - 10, y).lineTo(x0 + total + 10, y).stroke({ width: 1.5, color: S.highContrast ? 0xffffff : GOLD, alpha: 0.5 });
    strip.addChild(line);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (sz + 4) + sz / 2;
      if (i < woven.length) {
        const w = woven[i];
        const t = buildTile(w.puzzle.answer, sz, w.cloth, false);
        t.position.set(x, y);
        strip.addChild(t);
      } else {
        const g = new Graphics().roundRect(x - sz / 2, y - sz / 2, sz, sz, 3).stroke({ width: 1.5, color: S.highContrast ? 0xffffff : 0xf4dcb0, alpha: i === woven.length ? 0.8 : 0.3 });
        strip.addChild(g);
      }
    }
  }

  // ---------------------------------------------------------------- input
  function choose(i: number) {
    if (!accepting || !puzzle) return;
    const c = cands[i];
    if (!c || c.state !== 'idle') return;
    attempts++;
    if (i === puzzle.answerIndex) {
      accepting = false;
      c.state = 'used';
      void weaveIn(c, attempts);
    } else {
      c.state = 'wrong';
      c.shake = S.reducedMotion ? 0 : 1;
      markWrong(c);
      // thread snap: short bright noise + low pluck
      ctx.audio.noise({ dur: 0.07, filter: 3200, q: 2, gain: 0.05 });
      ctx.audio.pluck(note(-3), { gain: 0.08 });
      ctx.haptics.error();
      ctx.caption('Thread snaps — try another');
      snapThread(c);
      if (attempts >= 3) {
        accepting = false;
        const right = cands[puzzle.answerIndex];
        right.state = 'used';
        ctx.after(700, () => void weaveIn(right, 4));
      }
    }
  }

  function snapThread(c: Cand) {
    if (!slotView) return;
    const sx = c.view.x;
    const sy = c.view.y - c.size / 2;
    const tx = slotView.x;
    const ty = slotView.y + gridGeom.size / 2;
    const mx = lerp(sx, tx, 0.5);
    const my = lerp(sy, ty, 0.5);
    void tween(ctx, 450, (t) => {
      threadFx.clear();
      const a = 1 - t;
      threadFx.moveTo(sx, sy).lineTo(lerp(mx, sx, t * 0.5) - 6, lerp(my, sy, t * 0.3) + t * 30).stroke({ width: 2, color: 0xfff1d6, alpha: a });
      threadFx.moveTo(tx, ty).lineTo(lerp(mx, tx, t * 0.5) + 6, lerp(my, ty, t * 0.3) + t * 30).stroke({ width: 2, color: 0xfff1d6, alpha: a });
    }).then(() => threadFx.clear());
  }

  async function weaveIn(c: Cand, tries: number) {
    if (!puzzle || !slotView) return;
    const p = puzzle;
    const first = tries === 1;
    const pts = tries === 1 ? 100 : tries === 2 ? 40 : tries === 3 ? 10 : 0;
    score += pts;
    solved++;
    const rt = ctx.time() - puzzleStart;
    ctx.trial({ correct: first, rtMs: rt, level: stair.level });
    if (first) {
      firstTries++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      hardest = Math.max(hardest, p.level);
    } else streak = 0;
    stair.record(first);

    const reduced = S.reducedMotion;
    const slot = slotView;
    // golden thread from the shuttle to the slot, then the tile flies in and is woven top-to-bottom
    ctx.audio.noise({ dur: 0.45, filter: 900, sweepTo: 2600, gain: 0.05 });
    const sx = c.view.x;
    const sy = c.view.y;
    if (!reduced) {
      const shx = shuttle.x;
      await tween(ctx, 480, (t) => {
        shuttle.x = lerp(shx, slot.x, t);
        threadFx.clear();
        threadFx.moveTo(sx, sy).quadraticCurveTo(lerp(sx, slot.x, 0.5), Math.min(sy, slot.y) - 30, lerp(sx, slot.x, t), lerp(sy, slot.y, t)).stroke({ width: 2.5, color: GOLD, alpha: 0.9 });
        c.view.x = lerp(sx, slot.x, easeInOutSine(t));
        c.view.y = lerp(sy, slot.y, easeInOutSine(t));
        c.view.scale.set(lerp(1, gridTileSize() / c.size, t));
      });
      threadFx.clear();
    }
    c.view.visible = false;
    const tile = buildTile(p.answer, gridTileSize(), cloth);
    tile.position.set(slot.x, slot.y);
    gridLayer.addChild(tile);
    slot.visible = false;
    ctx.audio.thunk({ gain: 0.1 });
    ctx.audio.tick();
    if (!reduced) {
      const mask = new Graphics();
      tile.addChild(mask);
      tile.mask = mask;
      const h = gridGeom.size / 2;
      await tween(ctx, 520, (t) => {
        mask.clear();
        mask.rect(-h - 4, -h - 4, gridGeom.size + 8, (gridGeom.size + 8) * t).fill({ color: 0xffffff });
        threadFx.clear();
        const y = slot.y - h + gridGeom.size * t;
        threadFx.moveTo(slot.x - h - 6, y).lineTo(slot.x + h + 6, y).stroke({ width: 2, color: GOLD, alpha: 0.9 * (1 - t * 0.5) });
      }, (t) => t);
      tile.mask = null;
      mask.destroy();
      threadFx.clear();
    }
    // harp arpeggio + weaving hum
    const base = ctx.audio.now();
    [0, 2, 4, 7].forEach((d, i) => ctx.audio.pluck(note(d + (first ? 2 : 0)), { gain: 0.11, when: base + i * 0.07 }));
    ctx.audio.tone(note(-7), { dur: 1.2, gain: 0.04, type: 'sine', attack: 0.1 });
    ctx.haptics.success();
    particles.burst(slot.x, slot.y, first ? 30 : 14, { color: GOLD, speed: 190, life: 0.8 });
    if (!reduced) void tween(ctx, 380, (t) => tile.scale.set(1 + Math.sin(t * Math.PI) * 0.07));
    // the "aha": name the rule(s)
    const desc = p.rules.map((r) => describeRule(r, p.n)).join(' · ');
    showRule(first ? desc : `Rule: ${desc}`);
    ctx.caption(first ? `Woven! ${desc}` : `Woven. ${desc}`);
    ctx.announce(first ? 'Correct' : 'Woven');
    woven.push({ puzzle: p, cloth });
    hud();
    await ctx.wait(1500 * S.timingMultiplier);
    resolvePuzzle?.();
  }

  function showRule(msg: string) {
    ruleText.text = msg;
    ruleText.style = {
      fontFamily: 'Manrope, system-ui, sans-serif',
      fontSize: Math.round(14 * S.textScale),
      fontWeight: '700',
      fill: S.highContrast ? 0xffffff : 0xffe2a8,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: safe.w - 40,
    };
    ruleText.alpha = 0;
    void tween(ctx, 1700, (t) => (ruleText.alpha = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1), (t) => t);
  }

  // ---------------------------------------------------------------- ghost
  async function ghost() {
    await ctx.wait(1300 + rng.next() * 700);
    // scan a couple of candidates
    for (let s = 0; s < 2 && alive && accepting; s++) {
      const c = rng.pick(cands.filter((x) => x.state === 'idle'));
      if (c) {
        c.hover = 1;
        await ctx.wait(450);
        c.hover = 0;
      }
    }
    if (!alive || !accepting || !puzzle) return;
    if (rng.chance(0.15)) {
      const wrongs = cands.map((c, i) => ({ c, i })).filter((o) => o.i !== puzzle!.answerIndex && o.c.state === 'idle');
      if (wrongs.length) {
        choose(rng.pick(wrongs).i);
        await ctx.wait(900);
      }
    }
    if (!alive || !accepting || !puzzle) return;
    const right = cands[puzzle.answerIndex];
    right.hover = 1;
    await ctx.wait(350);
    choose(puzzle.answerIndex);
  }

  // ---------------------------------------------------------------- flow
  async function runPuzzle() {
    puzzle = generate(rng, stair.level);
    cloth = S.highContrast ? 0x000000 : CLOTHS[woven.length % CLOTHS.length];
    attempts = 0;
    computeGeom();
    drawFrame();
    buildGrid();
    buildTray();
    buildStrip();
    ruleText.position.set(safe.x + safe.w / 2, gridBottom() + 32);
    const done = new Promise<void>((res) => (resolvePuzzle = res));
    // loom clack + tiles fade in
    ctx.audio.thunk({ gain: 0.14 });
    ctx.audio.tick();
    const reduced = S.reducedMotion;
    gridLayer.alpha = 0;
    tray.alpha = 0;
    const shx0 = shuttle.x;
    await tween(ctx, reduced ? 1 : 550, (t) => {
      gridLayer.alpha = t;
      tray.alpha = t;
      if (!reduced) {
        tray.y = (1 - t) * 30;
        shuttle.x = shx0 + Math.sin(t * Math.PI) * 30;
      }
    });
    puzzleStart = ctx.time();
    accepting = true;
    hud();
    ctx.announce(`Puzzle ${woven.length + 1}. ${puzzle.n} by ${puzzle.n} grid, ${puzzle.candidates.length} choices.`);
    if (preview) void ghost();
    await done;
    resolvePuzzle = null;
    await tween(ctx, reduced ? 1 : 350, (t) => {
      gridLayer.alpha = 1 - t;
      tray.alpha = 1 - t;
    });
  }

  async function session() {
    sessionStart = ctx.time();
    if (preview) {
      for (;;) {
        await runPuzzle();
        if (!alive) return;
        if (woven.length >= 10) woven.length = 0;
      }
    }
    for (;;) {
      await runPuzzle();
      if (!alive) return;
      const el = ctx.time() - sessionStart;
      if ((woven.length >= MIN_PUZZLES && el >= MIN_MS) || el >= MAX_MS || woven.length >= MAX_PUZZLES) break;
    }
    await tapestryReveal();
    if (!alive) return;
    ctx.end({
      score,
      levelReached: stair.level,
      stats: { streak: bestStreak, hardest, firstTry: solved ? Math.round((firstTries / solved) * 100) : 0 },
      message: firstTries === solved ? 'Not a single dropped thread.' : 'A tapestry woven from your insights.',
    });
  }

  async function tapestryReveal() {
    accepting = false;
    puzzle = null;
    buildGrid();
    buildTray();
    await tween(ctx, 400, (t) => {
      loom.alpha = 1 - t;
      strip.alpha = 1 - t;
    });
    const n = woven.length;
    const cols = 2;
    const rows = Math.ceil(n / cols);
    const areaW = safe.w - 70;
    const areaH = safe.h - 215;
    const panel = Math.floor(Math.min(areaW / cols - 10, areaH / rows - 10));
    const totalW = cols * panel + (cols - 1) * 10;
    const totalH = rows * panel + (rows - 1) * 10;
    const x0 = safe.x + (safe.w - totalW) / 2;
    const y0 = safe.y + 135 + (areaH - totalH) / 2;
    const hc = S.highContrast;
    // hanging rod + banner cloth + tassels
    const banner = new Graphics();
    banner.roundRect(x0 - 16, y0 - 14, totalW + 32, totalH + 28, 6).fill({ color: hc ? 0x000000 : 0x3a2030 });
    banner.roundRect(x0 - 16, y0 - 14, totalW + 32, totalH + 28, 6).stroke({ width: 2, color: hc ? 0xffffff : GOLD, alpha: 0.8 });
    banner.roundRect(x0 - 30, y0 - 26, totalW + 60, 10, 5).fill({ color: hc ? 0xffffff : 0x8a5a30 });
    for (let i = 0; i < 7; i++) {
      const x = x0 - 8 + (i / 6) * (totalW + 16);
      banner.moveTo(x, y0 + totalH + 14).lineTo(x, y0 + totalH + 30).stroke({ width: 3, color: hc ? 0xffffff : GOLD, cap: 'round' });
    }
    reveal.addChild(banner);
    const title = new Text({
      text: 'Your tapestry',
      style: { fontFamily: 'Manrope, system-ui, sans-serif', fontSize: Math.round(24 * S.textScale), fontWeight: '800', fill: hc ? 0xffffff : 0xffe2a8, letterSpacing: 1 },
      resolution: dpr,
    });
    title.anchor.set(0.5);
    title.position.set(safe.x + safe.w / 2, safe.y + 82);
    reveal.addChild(title);
    reveal.alpha = 0;
    await tween(ctx, 400, (t) => (reveal.alpha = t));
    for (let i = 0; i < n; i++) {
      const w = woven[i];
      const pz = w.puzzle;
      const cell = panel / pz.n;
      const px = x0 + (i % cols) * (panel + 10);
      const py = y0 + Math.floor(i / cols) * (panel + 10);
      const c = new Container();
      for (let r = 0; r < pz.n; r++)
        for (let q = 0; q < pz.n; q++) {
          const t = buildTile(pz.grid[r][q], cell - 1, w.cloth, false);
          t.position.set(px + q * cell + cell / 2, py + r * cell + cell / 2);
          c.addChild(t);
        }
      reveal.addChild(c);
      c.alpha = 0;
      ctx.audio.pluck(note(i % 8), { gain: 0.08 });
      await tween(ctx, S.reducedMotion ? 1 : 220, (t) => (c.alpha = t));
      particles.burst(px + panel / 2, py + panel / 2, 6, { color: GOLD, speed: 80, life: 0.5 });
    }
    const b = ctx.audio.now();
    [0, 4, 7, 11, 14].forEach((d, i) => ctx.audio.pluck(note(d), { gain: 0.1, when: b + i * 0.12, dur: 1.4 }));
    ctx.caption('The tapestry is complete');
    ctx.announce('The tapestry is complete');
    await ctx.wait(2600);
  }

  function hud() {
    ctx.hud.set({
      score,
      level: stair.level,
      progress: Math.min(1, woven.length / MIN_PUZZLES),
      label: puzzle ? `Pattern ${Math.min(woven.length + 1, MAX_PUZZLES)} · ${puzzle.n}×${puzzle.n}${streak > 1 ? ` · streak ${streak}` : ''}` : 'Loom',
    });
  }

  // ---------------------------------------------------------------- per-frame
  function update(dt: number, now: number) {
    const s = now / 1000;
    const reduced = S.reducedMotion;
    for (const m of moteList) {
      if (!reduced) {
        m.y -= m.v * (dt / 1000);
        if (m.y < -0.05) m.y = 1.05;
      }
      m.s.position.set(m.x * W + Math.sin(s * 0.5 + m.ph) * 12, m.y * H);
      m.s.alpha = S.highContrast ? 0 : 0.18 + Math.sin(s + m.ph) * 0.12;
    }
    if (slotPulse) slotPulse.alpha = reduced ? 1 : 0.7 + Math.sin(s * TAU * 0.6) * 0.3;
    for (const c of cands) {
      if (c.state === 'used') continue;
      const target = c.state === 'idle' ? c.hover : 0;
      c.glow.alpha += (target * (S.highContrast ? 0 : 0.7) - c.glow.alpha) * Math.min(1, dt / 90);
      const lift = c.state === 'idle' && !reduced ? -c.hover * 5 : 0;
      let x = c.hx;
      if (c.shake > 0) {
        c.shake = Math.max(0, c.shake - dt / 420);
        x += Math.sin(c.shake * 28) * 6 * c.shake;
      }
      c.view.x = x;
      c.view.y += (c.hy + lift - c.view.y) * Math.min(1, dt / 80);
    }
    if (preview && !reduced) {
      // gentle "camera" drift across the loom
      loom.pivot.x = Math.sin(s * 0.25) * 4;
      loom.pivot.y = Math.cos(s * 0.2) * 3;
    }
    void clamp;
    void easeOutBack;
  }

  const pick = (i: number) => () => choose(i);
  const keyMap: Record<string, () => void> = {};
  for (let i = 0; i < 6; i++) {
    keyMap[`Digit${i + 1}`] = pick(i);
    keyMap[`Numpad${i + 1}`] = pick(i);
  }
  ctx.keys(keyMap);

  layout();
  ctx.onResize(layout);
  ctx.loop(update);

  return {
    start() {
      if (!preview) stopAmbient = ctx.audio.ambient([45, 52, 57, 61, 64], { gain: 0.03, brightness: 0.35 });
      void session();
    },
    onSettings: () => {
      if (!S.highContrast && cloth === 0x000000) cloth = CLOTHS[woven.length % CLOTHS.length];
      if (S.highContrast) cloth = 0x000000;
      layout();
    },
    destroy() {
      alive = false;
      accepting = false;
      stopAmbient?.();
    },
  };
}
