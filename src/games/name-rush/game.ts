import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameContext, GameInstance, VoiceLang } from '@/sdk';
import { clamp, easeOutBack, hex, mixHex, tween } from '@/sdk';
import { createPixiApp, createParticles, glowTexture, gradientTexture, softTilePad, softTileTexture, type SoftTileOptions } from '@/sdk/pixi';
import { heardWord, words } from '@/sdk/speech';
import { createAnswerBar, createLangToggle } from '@/sdk/voiceui';
import { ITEMS, STARTER, UI, type Item } from './content';
import { drawIcon, type IconId } from './icons';

const FONT = '"Geist Variable", "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif';
const ROWS = 10;
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

interface Tile {
  c: Container;
  float: Container;
  glass: Graphics;
  face: Sprite;
  glow: Sprite;
  icon: Graphics;
  num: Text;
  name: Text;
  mark: Graphics;
  item: Item;
  w: number;
  h: number;
  lit: number; // 0..1 glow target
  glowNow: number;
  phase: number;
}

/**
 * In-order match of a transcript against the expected row: longest common subsequence between the expected items
 * and the heard words, so fillers ("um", "and"), skipped items and extra words never shift the whole row.
 */
export function scoreRow(transcript: string, row: Item[]): boolean[] {
  const ws = words(transcript);
  const n = row.length;
  const m = ws.length;
  const hit = row.map((it) => ws.map((w) => it.accept.some((a) => heardWord(w, a, 0.8))));
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = hit[i][j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (hit[i][j] && dp[i][j] === 1 + dp[i + 1][j + 1]) {
      out[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export default async function create(ctx: GameContext): Promise<GameInstance> {
  const app = await createPixiApp(ctx);
  const pal = ctx.manifest.palette;
  const preview = ctx.mode === 'preview';
  const rng = ctx.rng;
  const stair = ctx.staircase({ min: 1, max: 7, up: 1, down: 1 });
  if (preview) stair.set(2);
  const note = ctx.audio.scale(62, 'majorPenta');

  // ---- scene
  // Soft (neumorphism): picture tiles and the "you said" bubble are extruded from one calm surface.
  const surf = mixHex(pal.bg, pal.bg2, 0.5);
  const auroraBg = gradientTexture([
    [0, '#070b1a'],
    [0.55, '#151c3a'],
    [1, '#0a1020'],
  ]);
  const softBg = gradientTexture([
    [0, mixHex(surf, '#000000', 0.35)],
    [0.25, surf],
    [1, surf],
  ]);
  const bg = new Sprite(ctx.settings.soft ? softBg : auroraBg);
  function setSoft(sp: Sprite, o: SoftTileOptions) {
    const pad = softTilePad(o);
    sp.texture = softTileTexture({ ...o, resolution: ctx.quality.maxDpr });
    sp.width = o.width + pad * 2;
    sp.height = o.height + pad * 2;
  }
  const motes = new Container();
  const topLayer = new Container();
  const tileLayer = new Container();
  const fx = new Container();
  app.stage.addChild(bg, motes, topLayer, tileLayer, fx);
  const particles = createParticles(ctx, fx, 220);

  const aura = new Sprite(glowTexture(256, 0.2));
  aura.anchor.set(0.5);
  aura.tint = hex(pal.accent);
  aura.alpha = 0.18;
  const status = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: pal.highlight, align: 'center', letterSpacing: 2 } });
  status.anchor.set(0.5);
  const sub = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fontWeight: '700', fill: 'rgba(255,255,255,0.7)', align: 'center' } });
  sub.anchor.set(0.5);
  const breathTrack = new Sprite();
  breathTrack.anchor.set(0.5);
  breathTrack.visible = false;
  const breath = new Graphics();
  const bubbleFace = new Sprite();
  bubbleFace.anchor.set(0.5);
  bubbleFace.visible = false;
  const bubble = new Graphics();
  const said = new Text({
    text: '',
    style: { fontFamily: FONT, fontSize: 19, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 320, lineHeight: 26 },
  });
  said.anchor.set(0.5);
  topLayer.addChild(aura, status, sub, breathTrack, breath, bubbleFace, bubble, said);

  const moteSprites: Sprite[] = [];
  for (let i = 0; i < Math.round(34 * ctx.quality.particleScale) + 8; i++) {
    const s = new Sprite(glowTexture(32, 0.3));
    s.anchor.set(0.5);
    s.tint = i % 3 ? hex(pal.accent) : hex(pal.accent2);
    s.alpha = 0.2 + rng.next() * 0.35;
    s.scale.set(0.18 + rng.next() * 0.3);
    motes.addChild(s);
    moteSprites.push(s);
  }

  let W = 0;
  let H = 0;
  let safe = ctx.layout().safe;
  let tiles: Tile[] = [];
  let tilesBottom = 0;
  let lang: VoiceLang = ctx.voice.lang();

  function layout() {
    const l = ctx.layout();
    W = l.width;
    H = l.height;
    safe = l.safe;
    bg.texture = ctx.settings.soft ? softBg : auroraBg;
    bg.width = W;
    bg.height = H;
    aura.alpha = ctx.settings.soft ? 0.1 : 0.18;
    moteSprites.forEach((m, i) => (m.visible = !ctx.settings.soft || i % 2 === 0));
    const cx = safe.x + safe.w / 2;
    status.position.set(cx, Math.max(safe.y + safe.h * 0.13, 100));
    sub.position.set(cx, status.y + 28);
    aura.position.set(cx, safe.y + safe.h * 0.4);
    aura.scale.set((safe.w * 1.3) / 256, (safe.h * 0.55) / 256);
    said.style.wordWrapWidth = safe.w - 60;
    moteSprites.forEach((m, i) => m.position.set((((i * 7919) % 1000) / 1000) * W, (((i * 104729) % 1000) / 1000) * H));
    layoutTiles();
  }

  // ---- tiles
  function makeTile(item: Item, i: number): Tile {
    const c = new Container();
    const float = new Container();
    const glow = new Sprite(glowTexture(128, 0.3));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.alpha = 0;
    const glass = new Graphics();
    const face = new Sprite();
    face.anchor.set(0.5);
    const icon = new Graphics();
    const num = new Text({ text: String(i + 1), style: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fill: 'rgba(255,255,255,0.5)' } });
    const name = new Text({ text: '', style: { fontFamily: FONT, fontSize: 14, fontWeight: '800', fill: '#ffffff', align: 'center' } });
    name.anchor.set(0.5);
    const mark = new Graphics();
    float.addChild(glow, face, glass, icon, num, name, mark);
    c.addChild(float);
    tileLayer.addChild(c);
    return { c, float, glass, face, glow, icon, num, name, mark, item, w: 0, h: 0, lit: 0, glowNow: 0, phase: rng.next() * 6 };
  }

  function drawGlass(t: Tile, state: 'idle' | 'ok' | 'miss' | 'saying') {
    const hc = ctx.settings.highContrast;
    const g = t.glass;
    g.clear();
    t.face.visible = ctx.settings.soft;
    if (ctx.settings.soft) {
      // Raised tile; the one being named sinks in. Rims (plus the ✓ / – marks) keep the meaning.
      const rim = state === 'ok' ? pal.accent : state === 'miss' ? '#ff9fb8' : state === 'saying' ? pal.accent2 : undefined;
      setSoft(t.face, { width: Math.round(t.w), height: Math.round(t.h), radius: 20, base: surf, pressed: state === 'saying' || state === 'miss', rim, rimWidth: 2.5, depth: 7 });
      return;
    }
    const fill = hc ? 0x000000 : state === 'ok' ? 0x2a3a2c : state === 'miss' ? 0x3a2233 : 0x1a2446;
    g.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, 20).fill({ color: fill, alpha: hc ? 1 : 0.78 });
    if (!hc) g.moveTo(-t.w / 2 + 18, -t.h / 2 + 2.5).lineTo(t.w / 2 - 18, -t.h / 2 + 2.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.18 });
    const edge = state === 'ok' ? hex(pal.accent) : state === 'miss' ? 0xff9fb8 : state === 'saying' ? hex(pal.accent2) : 0xffffff;
    g.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, 20).stroke({ width: hc ? 3 : state === 'idle' ? 1.5 : 2.5, color: edge, alpha: hc || state !== 'idle' ? 1 : 0.25 });
  }

  function drawMark(t: Tile, ok: boolean | null) {
    const m = t.mark;
    m.clear();
    if (ok === null) return;
    const r = 13;
    m.position.set(t.w / 2 - 14, -t.h / 2 + 14);
    if (ok) {
      m.circle(0, 0, r).fill(hex(pal.accent));
      m.moveTo(-6, 0).lineTo(-1.5, 5).lineTo(6.5, -5).stroke({ width: 3.2, color: 0x1a1406, cap: 'round', join: 'round' });
    } else {
      m.circle(0, 0, r).fill(0xff9fb8);
      m.moveTo(-5.5, 0).lineTo(5.5, 0).stroke({ width: 3.2, color: 0x2a1020, cap: 'round' });
    }
  }

  function layoutTiles() {
    if (!tiles.length) return;
    const n = tiles.length;
    const rows = n <= 4 ? 1 : 2;
    const cols = Math.ceil(n / rows);
    const gap = 10;
    const tw = Math.min(118, (safe.w - 20 - gap * (cols - 1)) / cols);
    const th = tw * 1.14;
    const cy = safe.y + safe.h * 0.4;
    const totalH = rows * th + (rows - 1) * gap;
    tilesBottom = cy + totalH / 2;
    tiles.forEach((t, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === 0 ? Math.min(cols, n) : n - cols;
      const col = i - row * cols;
      const rowW = inRow * tw + (inRow - 1) * gap;
      t.w = tw;
      t.h = th;
      t.c.position.set(safe.x + safe.w / 2 - rowW / 2 + tw / 2 + col * (tw + gap), cy - totalH / 2 + th / 2 + row * (th + gap));
      t.glow.scale.set((tw * 1.9) / 128);
      t.glow.tint = hex(pal.accent);
      t.icon.clear();
      t.icon.position.set(0, -th * 0.08);
      drawIcon(t.icon, t.item.id, tw * 0.33, ctx.settings.highContrast);
      t.num.position.set(-tw / 2 + 10, -th / 2 + 7);
      t.num.visible = true;
      t.name.position.set(0, th / 2 - 17);
      t.name.style.fontSize = Math.max(12, Math.min(15 * ctx.settings.textScale, (tw / Math.max(4, [...t.name.text].length)) * 1.6));
      drawGlass(t, 'idle');
    });
    said.position.set(safe.x + safe.w / 2, tilesBottom + 58);
  }

  function setTiles(row: Item[]) {
    tiles.forEach((t) => t.c.destroy({ children: true }));
    tiles = row.map((it, i) => makeTile(it, i));
    layoutTiles();
    const reduced = ctx.settings.reducedMotion;
    tiles.forEach((t, i) => {
      t.c.alpha = 0;
      const y0 = t.c.y;
      t.c.y = y0 + (reduced ? 0 : 26);
      void tween(ctx, reduced ? 1 : 320, (k) => {
        t.c.alpha = k;
        t.c.y = y0 + (reduced ? 0 : 26 * (1 - k));
      }, easeOutBack);
      ctx.after(reduced ? 0 : i * 55, () => ctx.audio.pluck(note(i), { gain: 0.06 }));
    });
  }

  function drawBubble(text: string) {
    said.text = text;
    bubble.clear();
    bubbleFace.visible = false;
    if (!text) return;
    const w = Math.min(safe.w - 36, said.width + 36);
    const h = said.height + 22;
    if (ctx.settings.soft) {
      // raised bubble (sizes snapped so few textures get cached) with its accent tail
      bubbleFace.visible = true;
      bubbleFace.position.set(said.x, said.y);
      setSoft(bubbleFace, { width: Math.min(Math.floor(safe.w - 36), Math.ceil(w / 16) * 16), height: Math.ceil(h / 8) * 8, radius: 18, base: surf, depth: 6 });
      bubble.poly([said.x - 9, said.y - h / 2 - 6, said.x + 9, said.y - h / 2 - 6, said.x, said.y - h / 2 - 15]).fill({ color: hex(pal.accent2), alpha: 0.8 });
      return;
    }
    bubble.roundRect(said.x - w / 2, said.y - h / 2, w, h, 18).fill({ color: 0x0c1330, alpha: ctx.settings.highContrast ? 1 : 0.72 });
    bubble.roundRect(said.x - w / 2, said.y - h / 2, w, h, 18).stroke({ width: 1.5, color: hex(pal.accent2), alpha: 0.6 });
    bubble.poly([said.x - 9, said.y - h / 2, said.x + 9, said.y - h / 2, said.x, said.y - h / 2 - 10]).fill({ color: hex(pal.accent2), alpha: 0.6 });
  }

  // breath / time ribbon under the tiles (mic mode, timed only)
  let breathLeft = 0;
  let breathMax = 0;
  function drawBreath() {
    breath.clear();
    breathTrack.visible = false;
    if (breathMax <= 0) return;
    const k = clamp(breathLeft / breathMax, 0, 1);
    const w = safe.w * 0.6;
    const x = safe.x + safe.w / 2 - w / 2;
    const y = tilesBottom + 18;
    if (ctx.settings.soft) {
      // inset groove (cached texture, same size every frame) with the accent fill inside
      breathTrack.visible = true;
      breathTrack.position.set(x + w / 2, y + 3);
      setSoft(breathTrack, { width: Math.round(w + 8), height: 14, radius: 7, base: surf, pressed: true, depth: 3 });
      if (k > 0) breath.roundRect(x, y, Math.max(6, w * k), 6, 3).fill({ color: hex(pal.accent2), alpha: 0.9 });
      return;
    }
    breath.roundRect(x, y, w, 6, 3).fill({ color: 0xffffff, alpha: 0.12 });
    breath.roundRect(x, y, w * k, 6, 3).fill({ color: hex(pal.accent2), alpha: 0.9 });
  }

  // ---- state
  let alive = true;
  let score = 0;
  let rowsDone = 0;
  let totalItems = 0;
  let totalCorrect = 0;
  let bestIps = 0;
  let longest = 0;
  let stopAmbient: (() => void) | null = null;
  const bar = createAnswerBar(ctx, { placeholder: 'e.g. sun fish tree ball', submitLabel: 'Done' });

  function makeRow(L: number): Item[] {
    const hc = ctx.settings.highContrast;
    const n = [4, 5, 6, 6, 7, 8, 8][L - 1] ?? 8;
    const objects = ITEMS.filter((i) => i.cat === 'object').map((i) => i.id);
    let pool: IconId[];
    if (L <= 2) pool = STARTER;
    else if (L === 3) pool = [...STARTER, ...rng.shuffle(objects.filter((o) => !STARTER.includes(o))).slice(0, 3)];
    else if (L === 4) pool = rng.shuffle([...objects]).slice(0, 10);
    else if (L === 5) pool = [...rng.shuffle([...objects]).slice(0, 8), 'circle', 'square', 'triangle'];
    else pool = [...rng.shuffle([...objects]).slice(0, 8), 'circle', 'square', 'triangle', ...(hc ? [] : (['red', 'blue', 'green', 'yellow'] as IconId[]))];
    const noRepeats = L >= 4;
    const out: IconId[] = [];
    for (let i = 0; i < n; i++) {
      let pick: IconId = rng.pick(pool);
      for (let tries = 0; tries < 20; tries++) {
        const bad = pick === out[i - 1] || (noRepeats && out.includes(pick) && out.length < pool.length);
        if (!bad) break;
        pick = rng.pick(pool);
      }
      out.push(pick);
    }
    return out.map((id) => BY_ID.get(id)!);
  }

  /** Preview ghost: "says" the names one by one (shown in a bubble) and returns the transcript. */
  async function ghostSay(row: Item[]): Promise<string> {
    const parts: string[] = [];
    await ctx.wait(500);
    for (let i = 0; i < row.length; i++) {
      if (!alive) return '';
      const miss = rng.chance(0.08);
      parts.push(miss ? '…' : row[i].name['en-IN']);
      tiles[i].lit = 0.45;
      drawGlass(tiles[i], 'saying');
      drawBubble(`“${parts.join(', ')}”`);
      await ctx.wait(360 + rng.next() * 160);
      tiles[i].lit = 0;
    }
    return parts.join(' ');
  }

  async function reveal(row: Item[], marks: boolean[]) {
    for (let i = 0; i < row.length; i++) {
      if (!alive) return;
      const t = tiles[i];
      const ok = marks[i];
      t.name.text = row[i].name[lang];
      t.name.style.fill = ok ? '#ffffff' : '#ffc2d1';
      t.name.style.fontSize = Math.max(12, Math.min(15 * ctx.settings.textScale, (t.w / Math.max(4, [...t.name.text].length)) * 1.6));
      drawGlass(t, ok ? 'ok' : 'miss');
      drawMark(t, ok);
      if (ok) {
        t.lit = 1;
        ctx.audio.pluck(note(i + 2), { gain: 0.14 });
        particles.burst(t.c.x, t.c.y, 8, { color: hex(pal.accent), speed: 120, life: 0.5 });
      } else {
        ctx.audio.thunk({ gain: 0.08 });
      }
      await ctx.wait(ctx.settings.reducedMotion ? 60 : 130);
    }
  }

  function hud() {
    ctx.hud.set({ score, level: stair.level, progress: rowsDone / ROWS });
  }

  async function run() {
    stopAmbient = ctx.audio.ambient([50, 57, 62, 69], { gain: 0.03, brightness: 0.35 });
    await ctx.wait(400);
    let first = true;
    while (alive) {
      const L = stair.level;
      const ui = UI[lang];
      const row = makeRow(L);
      drawBubble('');
      breathMax = 0;
      drawBreath();
      setTiles(row);
      ctx.container.dataset.nameRushRow = row.map((r) => r.id).join(' '); // for automated tests
      hud();
      status.text = ui.ready;
      sub.text = '';
      if (first && !preview) {
        first = false;
        const intro = lang === 'hi-IN' ? 'हर तस्वीर का नाम बोलो, बाएँ से दाएँ।' : 'Name each picture, left to right.';
        await Promise.race([ctx.voice.speak(intro, { lang }), ctx.wait(3500)]);
      }
      await ctx.wait(ctx.settings.reducedMotion ? 400 : 750);
      if (!alive) return;
      status.text = ui.go;
      ctx.audio.chime(note(4), { gain: 0.05, dur: 0.5 });
      ctx.announce(`${row.length} pictures. Name them left to right.`);
      const t0 = ctx.time();
      let transcript: string;
      if (preview) {
        transcript = await ghostSay(row);
      } else {
        const typing = bar.mode() === 'typing';
        const timed = !ctx.settings.noTimePressure;
        const maxMs = Math.max(8000, row.length * 1100) * ctx.settings.timingMultiplier;
        breathMax = !typing && timed ? maxMs : 0;
        breathLeft = breathMax;
        transcript = await bar.ask({ prompt: typing ? ui.typeAll(row.length) : ui.sayAll(row.length), maxMs });
        breathMax = 0;
        drawBreath();
      }
      if (!alive) return;
      const elapsed = Math.max(300, ctx.time() - t0) / 1000;
      const marks = scoreRow(transcript, row);
      const got = marks.filter(Boolean).length;
      const acc = got / row.length;
      if (!preview) drawBubble(transcript ? `${UI[lang].heard}: “${transcript}”` : '');
      status.text = '';
      await reveal(row, marks);
      if (!alive) return;

      rowsDone++;
      totalItems += row.length;
      totalCorrect += got;
      const ips = got / elapsed;
      if (acc >= 0.5) bestIps = Math.max(bestIps, ips);
      if (got === row.length) longest = Math.max(longest, row.length);
      let pts = got * 10 + (got === row.length ? row.length * 5 : 0);
      if (!ctx.settings.noTimePressure) pts += Math.round(clamp(1.6 - elapsed / row.length, 0, 1.2) * got * 8);
      score += pts;
      ctx.trial({ correct: acc >= 0.8, rtMs: Math.round((elapsed * 1000) / row.length), level: L });
      stair.record(acc >= 0.8);
      if (preview && stair.level > 4) stair.set(2);

      if (got === row.length) {
        status.text = lang === 'hi-IN' ? 'शानदार!' : 'CLEAN SWEEP';
        ctx.audio.success();
        ctx.haptics.success();
        const cx = safe.x + safe.w / 2;
        particles.burst(cx, safe.y + safe.h * 0.4, 46, { color: hex(pal.highlight), speed: 280, life: 1 });
      } else {
        status.text = acc >= 0.5 ? (lang === 'hi-IN' ? 'बढ़िया' : 'NICE') : lang === 'hi-IN' ? 'फिर से कोशिश' : 'KEEP GOING';
        ctx.haptics.tick();
      }
      sub.text = `${got} / ${row.length}  ·  ${ips.toFixed(1)} ${lang === 'hi-IN' ? 'प्रति सेकंड' : 'per second'}`;
      ctx.announce(`${got} of ${row.length} named`);
      hud();
      if (!preview && rowsDone >= ROWS) {
        await ctx.wait(1400);
        ctx.end({
          score,
          levelReached: stair.level,
          stats: {
            ips: Math.round(bestIps * 10) / 10,
            accuracy: totalItems ? Math.round((totalCorrect / totalItems) * 100) : 0,
            longest,
          },
          message: longest >= 7 ? 'A long row, named in a single breath.' : 'Quick, clean naming. It gets smoother every row.',
        });
        return;
      }
      await ctx.wait(preview ? 1500 : 2000);
    }
  }

  createLangToggle(ctx, (l) => {
    lang = l;
    ctx.caption(l === 'hi-IN' ? 'Hindi from the next row' : 'English from the next row');
  });

  // ---- animation
  let time = 0;
  ctx.loop((dt) => {
    time += dt / 1000;
    const reduced = ctx.settings.reducedMotion;
    for (const t of tiles) {
      t.float.y = reduced ? 0 : Math.sin(time * 1.3 + t.phase) * 3;
      t.glowNow += (t.lit - t.glowNow) * Math.min(1, dt / 120);
      t.glow.alpha = t.glowNow * (ctx.settings.highContrast ? 0.5 : 0.8);
    }
    if (breathMax > 0) {
      breathLeft = Math.max(0, breathLeft - dt);
      drawBreath();
    }
    if (!reduced) moteSprites.forEach((m, i) => (m.y -= (0.1 + (i % 5) * 0.04) * (dt / 16)) && m.y < -10 && (m.y = H + 10));
    status.alpha = clamp(0.8 + Math.sin(time * 2) * 0.2, 0, 1);
  });

  layout();
  ctx.onResize(layout);

  return {
    start() {
      void run();
    },
    onSettings: () => {
      layout();
      drawBubble(said.text);
    },
    destroy() {
      alive = false;
      stopAmbient?.();
      ctx.voice.stop();
      bar.destroy();
      delete ctx.container.dataset.nameRushRow;
    },
  };
}
