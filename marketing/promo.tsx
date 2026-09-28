// 30-second Project Utopia promo, rendered frame-by-frame (see scripts/render-promo.mjs).
// Every visual is a pure function of time t (seconds); CSS animations are pinned to t each frame.
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AbilityIcon } from '@/app/components/Editorial';
import { RINGS, type RingId } from '@/platform/abilities';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') ?? 1080);
const H = Number(params.get('h') ?? 1920);
const PORTRAIT = H / W > 1.5; // 9:16 → full-bleed clips; 4:5 → clips in a card
export const FPS = 30;
export const DURATION = 30;

interface Clip {
  id: string;
  title: string;
  ability: string;
  ring: RingId;
  start: number; // first frame used from the captured clip
  max?: number; // last captured frame index (default 74)
}
// Montage: 8 cuts, each 1.5s = 2 beats at 80 BPM, from t = 6s to 18s.
const CLIPS: Clip[] = [
  { id: 'echo-garden', title: 'Echo Garden', ability: 'Working memory', ring: 'memory', start: 20 },
  { id: 'tidal-beat', title: 'Tidal Beat', ability: 'Rhythm', ring: 'timing', start: 20 },
  { id: 'lumen', title: 'Lumen', ability: 'Planning', ring: 'reasoning', start: 10, max: 59 },
  { id: 'zenith', title: 'Zenith', ability: 'Reaction timing', ring: 'timing', start: 10, max: 59 },
  { id: 'lantern-lake', title: 'Lantern Lake', ability: 'Spatial memory', ring: 'memory', start: 22 },
  { id: 'orbit-keeper', title: 'Orbit Keeper', ability: 'Coordination', ring: 'timing', start: 10, max: 59 },
  { id: 'upstream', title: 'Upstream', ability: 'Inhibition', ring: 'control', start: 10, max: 59 },
  { id: 'still-water', title: 'Still Water', ability: 'Calm attention', ring: 'calm', start: 10, max: 59 },
];
const CUT = 1.5;
const MONTAGE_START = 6;
const FEED_POSTERS = ['firefly-night', 'glyphfield', 'rhyme-tide', 'stonepath'];
const MOSAIC = ['echo-garden', 'firefly-night', 'lantern-lake', 'tidal-beat', 'stonepath', 'glyphfield', 'zenith', 'rhyme-tide', 'silhouette', 'upstream', 'still-water', 'word-current', 'starback', 'night-harbor', 'lumen', 'glimpse', 'shoal', 'orbit-keeper', 'prism-sort', 'loom'];

// ---------- timing helpers ----------
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
/** Visibility envelope: fades in over [a, a+fi], out over [b-fo, b]. */
const env = (t: number, a: number, b: number, fi = 0.4, fo = 0.4) => Math.min(easeOut(seg(t, a, a + fi)), 1 - easeInOut(seg(t, b - fo, b)));
/** Word reveal style (blur-rise), like the app's headlines. */
const word = (t: number, at: number): CSSProperties => {
  const k = easeOut(seg(t, at, at + 0.7));
  return { opacity: k, transform: `translateY(${(1 - k) * 0.45}em) rotate(${(1 - k) * 2}deg)`, filter: `blur(${(1 - k) * 8}px)`, display: 'inline-block' };
};

// ---------- image preloading ----------
const frameCache = new Map<string, HTMLImageElement>();
const clipSrc = (id: string, f: number) => `/marketing/out/clips/${id}/${String(f).padStart(4, '0')}.jpg`;
const frameOf = (c: Clip, local: number) => clipSrc(c.id, Math.min(c.max ?? 74, c.start + Math.max(0, Math.round(local * FPS))));
async function load(u: string) {
  if (frameCache.has(u)) return;
  const img = new Image();
  img.src = u;
  try {
    await img.decode();
  } catch {
    /* missing frame → skipped */
  }
  frameCache.set(u, img);
  // Bounded cache: a decoded 900×1600 frame is ~6MB, so keep only recent clip frames.
  const clipKeys = [...frameCache.keys()].filter((k) => k.includes('/clips/'));
  for (const k of clipKeys.slice(0, Math.max(0, clipKeys.length - 24))) frameCache.delete(k);
}
/** Posters up front (small); clip frames on demand for each rendered frame. */
async function preload() {
  await Promise.all([...new Set([...FEED_POSTERS, ...MOSAIC])].map((p) => load(`/posters/${p}.jpg`)));
  await document.fonts.ready;
}
async function ensureFrame(t: number) {
  const mt = t - MONTAGE_START;
  if (mt < -0.3 || mt > CLIPS.length * CUT + 0.3) return;
  const idx = clamp(Math.floor(mt / CUT), 0, CLIPS.length - 1);
  await load(frameOf(CLIPS[idx], mt - idx * CUT));
}

// ---------- components ----------
function Planet({ size }: { size: number }) {
  return (
    <div className="planet" style={{ width: size, height: size, fontSize: size }}>
      <div className="orbit" style={{ left: '50%', top: '50%', width: '1.62em', height: '0.46em' }}>
        <span className="moon" />
      </div>
      <div className="orb no-horizon" style={{ position: 'absolute', inset: 0, width: '1em', height: '1em' }} />
      <div className="orbit orbit-front" style={{ left: '50%', top: '50%', width: '1.62em', height: '0.46em' }} />
    </div>
  );
}

function Aurora({ t, palette = ['#8b6cff', '#ff8fb1', '#6fe3ff'], strength = 1 }: { t: number; palette?: string[]; strength?: number }) {
  const s = (a: number, sp: number) => Math.sin(t * sp + a);
  return (
    <div className="aurora" style={{ opacity: strength }}>
      <i style={{ width: W * 1.1, height: W * 1.1, left: -W * 0.35 + s(0, 0.25) * 60, top: -W * 0.4 + s(1, 0.2) * 50, background: `radial-gradient(circle, ${palette[0]}99, transparent 65%)` }} />
      <i style={{ width: W, height: W, right: -W * 0.4 + s(2, 0.22) * 60, top: H * 0.25 + s(3, 0.18) * 60, background: `radial-gradient(circle, ${palette[1]}66, transparent 62%)` }} />
      <i style={{ width: W * 0.95, height: W * 0.95, left: W * 0.1 + s(4, 0.2) * 50, bottom: -W * 0.45 + s(5, 0.24) * 40, background: `radial-gradient(circle, ${palette[2]}55, transparent 60%)` }} />
    </div>
  );
}

/** Canvas that draws a preloaded clip frame (sync and flicker-free). */
function ClipCanvas({ clip, frame, style, className }: { clip: Clip; frame: number; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    const img = frameCache.get(frameOf(clip, frame / FPS));
    if (!c || !img || !img.naturalWidth) return;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
  });
  return <canvas ref={ref} width={900} height={1600} className={className} style={style} />;
}

function Accent({ children }: { children: string }) {
  return <span className="accent">{children}</span>;
}

// ---------- the film ----------
function Film({ t }: { t: number }) {
  // Scene windows
  const aOn = env(t, 0, 3.15, 0.6, 0.35);
  const bOn = env(t, 2.9, 6.15, 0.35, 0.25);
  const dOn = env(t, 17.9, 24.2, 0.35, 0.35);
  const eOn = env(t, 23.9, 30.5, 0.5, 0.6);
  const fadeOut = 1 - seg(t, 29.3, 30);

  // Montage index
  const mt = t - MONTAGE_START;
  const idx = Math.floor(mt / CUT);
  const inMontage = mt >= -0.2 && mt < CLIPS.length * CUT + 0.2;
  const cur = CLIPS[clamp(idx, 0, CLIPS.length - 1)];
  const local = mt - clamp(idx, 0, CLIPS.length - 1) * CUT;
  const flash = inMontage ? 1 - easeOut(seg(local, 0, 0.18)) : 0;
  const montageOn = env(t, MONTAGE_START - 0.2, MONTAGE_START + CLIPS.length * CUT + 0.1, 0.25, 0.25);

  return (
    <div id="art" className={PORTRAIT ? 'portrait' : 'feedfmt'} style={{ width: W, height: H, opacity: fadeOut }}>
      <Aurora t={t} strength={0.9} />

      {/* ---------- A: intro ---------- */}
      {aOn > 0 && (
        <section className="scene center" style={{ opacity: aOn }}>
          <div style={{ transform: `scale(${0.6 + 0.4 * easeBack(seg(t, 0.2, 1.3))})`, opacity: easeOut(seg(t, 0.2, 0.9)) }}>
            <Planet size={PORTRAIT ? 300 : 250} />
          </div>
          <p className="kicker big-kicker" style={{ opacity: easeOut(seg(t, 0.9, 1.4)) }}>
            <span className="kdot" /> Project Utopia
          </p>
          <h1 className="display headline">
            <span style={word(t, 1.3)}>Beautiful</span> <span style={word(t, 1.4)}>little</span> <span style={word(t, 1.5)}>games,</span>
            <br />
            <span style={word(t, 1.75)}>
              <Accent>honestly</Accent>
            </span>{' '}
            <span style={word(t, 1.9)}>made.</span>
          </h1>
        </section>
      )}

      {/* ---------- B: feed ---------- */}
      {bOn > 0 && (
        <section className="scene" style={{ opacity: bOn }}>
          <h2 className="display question">
            <span style={word(t, 3.05)}>What</span> <span style={word(t, 3.12)}>if</span> <span style={word(t, 3.19)}>scrolling</span> <span style={word(t, 3.26)}>felt</span>{' '}
            <span style={word(t, 3.33)}>like</span>{' '}
            <span style={word(t, 3.5)}>
              <Accent>play?</Accent>
            </span>
          </h2>
          <Phone t={t} />
        </section>
      )}

      {/* ---------- C: montage ---------- */}
      {montageOn > 0 && inMontage && (
        <section className="scene montage" style={{ opacity: montageOn }}>
          {!PORTRAIT && <ClipCanvas clip={cur} frame={Math.round(local * FPS)} className="clip-bg" />}
          <div className={PORTRAIT ? 'clip-full' : 'clip-card'} style={{ transform: `scale(${1.06 - 0.06 * easeOut(seg(local, 0, CUT))})` }}>
            <ClipCanvas clip={cur} frame={Math.round(local * FPS)} className="clip" />
            <div className="clip-scrim" />
            <div className="clip-meta" key={cur.id}>
              <p className="clip-kicker" style={{ opacity: easeOut(seg(local, 0.05, 0.35)) }}>
                <AbilityIcon id={cur.ring} color={RINGS.find((r) => r.id === cur.ring)!.color} live size={PORTRAIT ? 40 : 32} />
                {cur.ability}
              </p>
              <h3 className="display clip-title">
                {cur.title.split(' ').map((w, i, a) => (
                  <span key={i}>
                    <span style={word(local, 0.08 + i * 0.08)}>{i === a.length - 1 ? <Accent>{w}</Accent> : w}</span>{' '}
                  </span>
                ))}
              </h3>
            </div>
          </div>
          <div className="flash" style={{ opacity: flash * 0.35 }} />
          <div className="progress-dots">
            {CLIPS.map((c, i) => (
              <i key={c.id} className={i === idx ? 'on' : i < idx ? 'done' : ''} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- D: promises ---------- */}
      {dOn > 0 && (
        <section className="scene center promises" style={{ opacity: dOn }}>
          <Mosaic t={t} />
          <Beat t={t} a={18.1} b={20.2}>
            <h2 className="display promise-title">
              <span style={word(t, 18.2)}>20</span> <span style={word(t, 18.3)}>games.</span>
              <br />
              <span style={word(t, 18.5)}>
                <Accent>8 abilities.</Accent>
              </span>
            </h2>
            <div className="icons-row">
              {RINGS.map((r, i) => (
                <span key={r.id} style={{ opacity: easeOut(seg(t, 18.7 + i * 0.07, 19.1 + i * 0.07)), transform: `translateY(${(1 - easeOut(seg(t, 18.7 + i * 0.07, 19.1 + i * 0.07))) * 20}px)` }}>
                  <AbilityIcon id={r.id} color={r.color} live size={PORTRAIT ? 72 : 60} />
                </span>
              ))}
            </div>
            <p className="promise-sub" style={{ opacity: easeOut(seg(t, 19.0, 19.5)) }}>
              Memory · Attention · Rhythm · Planning · Reading · Calm
            </p>
          </Beat>
          <Beat t={t} a={20.2} b={22.2}>
            <h2 className="display promise-title">
              <span style={word(t, 20.3)}>Play</span> <span style={word(t, 20.4)}>in</span>
              <br />
              <span style={word(t, 20.55)}>
                <Accent>a second.</Accent>
              </span>
            </h2>
            <p className="promise-sub" style={{ opacity: easeOut(seg(t, 20.9, 21.3)) }}>
              No sign-up. No ads. Just tap Play.
            </p>
          </Beat>
          <Beat t={t} a={22.2} b={24.25}>
            <h2 className="display promise-title">
              <span style={word(t, 22.3)}>Accessible</span>
              <br />
              <span style={word(t, 22.45)}>by</span>{' '}
              <span style={word(t, 22.55)}>
                <Accent>default.</Accent>
              </span>
            </h2>
            <div className="chips">
              {['High contrast', 'Reduced motion', 'Relaxed timing', 'Captions'].map((c, i) => (
                <span key={c} className="chip-p" style={{ opacity: easeOut(seg(t, 22.8 + i * 0.1, 23.2 + i * 0.1)) }}>
                  {c}
                </span>
              ))}
            </div>
          </Beat>
        </section>
      )}

      {/* ---------- E: end card ---------- */}
      {eOn > 0 && (
        <section className="scene center" style={{ opacity: eOn }}>
          <div style={{ transform: `scale(${0.7 + 0.3 * easeBack(seg(t, 24.0, 25.0))}) rotate(${(1 - easeOut(seg(t, 24, 25.2))) * -20}deg)`, opacity: easeOut(seg(t, 24.0, 24.6)) }}>
            <Planet size={PORTRAIT ? 260 : 210} />
          </div>
          <h1 className="display wordmark">
            <span style={word(t, 24.6)}>Project</span>{' '}
            <span style={word(t, 24.75)}>
              <Accent>Utopia</Accent>
            </span>
          </h1>
          <p className="tagline" style={{ opacity: easeOut(seg(t, 25.3, 25.9)) }}>
            Beautiful little games, honestly made.
          </p>
          <div className="cta" style={{ opacity: easeOut(seg(t, 26.0, 26.5)), transform: `translateY(${(1 - easeOut(seg(t, 26.0, 26.6))) * 24}px)` }}>
            ▶&nbsp; Play free in your browser
          </div>
          <p className="credit" style={{ opacity: easeOut(seg(t, 26.8, 27.4)) }}>
            Made by Saksham Sharma
          </p>
        </section>
      )}
      <div className="grain" />
    </div>
  );
}

function Beat({ t, a, b, children }: { t: number; a: number; b: number; children: React.ReactNode }) {
  const o = env(t, a, b, 0.2, 0.3);
  if (o <= 0) return null;
  return (
    <div className="promise" style={{ opacity: o, transform: `translateY(${(1 - easeOut(seg(t, a, a + 0.5))) * 30 - easeInOut(seg(t, b - 0.3, b)) * 30}px)` }}>
      {children}
    </div>
  );
}

function Mosaic({ t }: { t: number }) {
  const cols = PORTRAIT ? 4 : 5;
  const y = -((t - 18) * 60);
  return (
    <div className="mosaic" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, transform: `translateY(${y}px) rotate(-8deg) scale(1.3)` }}>
      {[...MOSAIC, ...MOSAIC].map((p, i) => (
        <div key={i} className="mosaic-tile" style={{ backgroundImage: `url(/posters/${p}.jpg)` }} />
      ))}
    </div>
  );
}

/** A phone showing the Utopia feed; two swipes between cards. */
function Phone({ t }: { t: number }) {
  const rise = easeOut(seg(t, 3.0, 3.8));
  const swipe1 = easeInOut(seg(t, 4.35, 4.85));
  const swipe2 = easeInOut(seg(t, 5.25, 5.75));
  const pos = swipe1 + swipe2; // cards scrolled
  const phoneH = PORTRAIT ? H * 0.62 : H * 0.7;
  const phoneW = phoneH * 0.49;
  // finger: a soft dot that drags up during each swipe
  const finger = (s: number, a: number) => {
    const k = seg(t, a - 0.15, a + 0.55);
    return { opacity: Math.sin(Math.PI * k) * 0.9, y: (1 - easeInOut(seg(t, a, a + 0.5))) * 0.25 + 0.45, s };
  };
  const f = t < 5.05 ? finger(1, 4.35) : finger(1, 5.25);
  return (
    <div className="phone" style={{ width: phoneW, height: phoneH, transform: `translate(-50%, ${(1 - rise) * 120}%)` }}>
      <div className="phone-screen">
        <div className="phone-feed" style={{ transform: `translateY(${-pos * 100}%)` }}>
          {FEED_POSTERS.map((p, i) => (
            <div key={p} className="phone-card" style={{ top: `${i * 100}%`, backgroundImage: `url(/posters/${p}.jpg)` }}>
              <div className="phone-scrim" />
              <div className="phone-meta">
                <span className="phone-chip">{['Inhibition', 'Selective attention', 'Phonological awareness', 'Planning'][i]}</span>
                <b className="display">{['Firefly Night', 'Glyphfield', 'Rhyme Tide', 'Stonepath'][i]}</b>
                <span className="phone-play">▶ Play</span>
              </div>
            </div>
          ))}
        </div>
        <div className="finger" style={{ opacity: f.opacity, top: `${f.y * 100}%` }} />
      </div>
    </div>
  );
}

// ---------- mount + frame API ----------
const root = createRoot(document.getElementById('root')!);
let current = 0;
async function renderFrame(t: number) {
  current = t;
  await ensureFrame(t);
  flushSync(() => root.render(<Film t={t} />));
  // Pin every CSS animation (e.g. the ability glyphs) to the film clock.
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = t * 1000;
  }
}
declare global {
  interface Window {
    __promo: { ready: Promise<void>; render: (t: number) => Promise<void>; fps: number; duration: number; now: () => number };
  }
}
window.__promo = {
  ready: preload().then(() => renderFrame(0)),
  render: renderFrame,
  fps: FPS,
  duration: DURATION,
  now: () => current,
};
// Live preview when opened in a normal browser: ?play=1
if (params.get('play') === '1') {
  void window.__promo.ready.then(() => {
    const t0 = performance.now();
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) % DURATION;
      renderFrame(t);
      requestAnimationFrame(tick);
    };
    tick();
  });
}
