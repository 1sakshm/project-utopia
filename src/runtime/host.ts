import type { GameContext, GameInstance, GameModule, HudState, Layout, SessionSummary } from '@/sdk/types';
import { createRng } from '@/sdk/rng';
import { createStaircase } from '@/sdk/difficulty';
import { audioEngine, createGameAudio } from './audio';
import { getQuality } from './quality';
import { toGameSettings, useSettings } from '@/platform/settings';
import { useProgress } from '@/platform/progress';

export interface HostOptions {
  mode: 'play' | 'preview';
  variant: 'normal' | 'daily';
  seed: number;
  startLevel: number;
  onHud?: (patch: HudState | null) => void;
  onEnd?: (s: SessionSummary) => void;
  onCaption?: (text: string) => void;
  onAnnounce?: (text: string) => void;
  onError?: (err: unknown) => void;
  onTrial?: (t: { correct: boolean; rtMs?: number; level?: number }) => void;
}

export interface GameHost {
  readonly ready: Promise<void>;
  start(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  /** Pause-aware elapsed game time in ms. */
  elapsed(): number;
  setMuted(m: boolean): void;
  destroy(): void;
  /** Snapshot the game canvas (for posters). */
  capture(): string | null;
}

interface LoopEntry {
  cb: (dt: number, t: number) => void;
  priority: number;
}

export function computeLayout(el: HTMLElement): Layout {
  const width = el.clientWidth || window.innerWidth;
  const height = el.clientHeight || window.innerHeight;
  const ratio = 9 / 16;
  let w = width;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  return { width, height, safe: { x: (width - w) / 2, y: (height - h) / 2, w, h } };
}

export function createGameHost(module: GameModule, container: HTMLElement, opts: HostOptions): GameHost {
  const abort = new AbortController();
  const signal = abort.signal;
  const preview = opts.mode === 'preview';
  let paused = preview ? false : true; // play mode is "paused" until start()
  let started = false;
  let destroyed = false;
  let gameTime = 0;
  let last = performance.now();
  let raf = 0;
  const loops: LoopEntry[] = [];
  const timers = new Set<{ at: number; cb: () => void }>();
  const resizeCbs = new Set<(l: Layout) => void>();
  let instance: GameInstance | null = null;
  let muted = preview ? !useSettings.getState().feedSound : false;

  const settings = toGameSettings();
  const unsubSettings = useSettings.subscribe((s) => {
    Object.assign(settings, toGameSettings(s));
    audioEngine.apply({ master: s.master, music: s.music, sfx: s.sfx, voice: s.voice, mono: s.mono });
    audioEngine.calibrationMs = s.calibrationMs;
    instance?.onSettings?.(settings);
  });
  {
    const s = useSettings.getState();
    audioEngine.calibrationMs = s.calibrationMs;
  }

  const audio = createGameAudio({ muted: () => muted, signal });

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(64, now - last);
    last = now;
    if (paused || destroyed) return;
    gameTime += dt;
    for (const t of [...timers]) {
      if (t.at <= gameTime) {
        timers.delete(t);
        try {
          t.cb();
        } catch (e) {
          opts.onError?.(e);
        }
      }
    }
    for (const l of loops) {
      try {
        l.cb(dt, gameTime);
      } catch (e) {
        opts.onError?.(e);
      }
    }
  };
  raf = requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => {
    const l = computeLayout(container);
    resizeCbs.forEach((cb) => cb(l));
  });
  ro.observe(container);

  const gameId = module.manifest.id;
  const store = () => useProgress.getState();

  const ctx: GameContext = {
    manifest: module.manifest,
    container,
    mode: opts.mode,
    variant: opts.variant,
    seed: opts.seed,
    rng: createRng(opts.seed),
    settings,
    quality: getQuality(opts.mode),
    audio,
    startLevel: opts.startLevel,
    signal,
    layout: () => computeLayout(container),
    onResize: (cb) => {
      resizeCbs.add(cb);
      signal.addEventListener('abort', () => resizeCbs.delete(cb));
    },
    time: () => gameTime,
    isPaused: () => paused,
    loop: (cb, priority = 0) => {
      const e = { cb, priority };
      loops.push(e);
      loops.sort((a, b) => b.priority - a.priority);
      return () => {
        const i = loops.indexOf(e);
        if (i >= 0) loops.splice(i, 1);
      };
    },
    after: (ms, cb) => {
      const t = { at: gameTime + ms, cb };
      timers.add(t);
      return () => timers.delete(t);
    },
    wait: (ms) =>
      new Promise<void>((resolve) => {
        const t = { at: gameTime + ms, cb: resolve };
        timers.add(t);
      }),
    keys: (map) => {
      if (preview) return;
      const h = (e: KeyboardEvent) => {
        if (paused || e.repeat) return;
        const fn = map[e.code];
        if (fn) {
          e.preventDefault();
          fn(e);
        }
      };
      window.addEventListener('keydown', h, { signal });
    },
    hud: {
      set: (patch) => {
        if (!preview) opts.onHud?.(patch);
      },
      clear: () => {
        if (!preview) opts.onHud?.(null);
      },
    },
    staircase: (o) => createStaircase({ start: opts.startLevel, ...o }),
    storage: {
      get: (key, fallback) => {
        const v = store().get(gameId).storage[key];
        return (v === undefined ? fallback : v) as typeof fallback;
      },
      set: (key, value) => {
        if (preview) return;
        const g = store().get(gameId);
        store().patch(gameId, { storage: { ...g.storage, [key]: value } });
      },
    },
    haptics: {
      tick: () => vibrate(8),
      success: () => vibrate([10, 40, 14]),
      error: () => vibrate(30),
    },
    announce: (text) => {
      if (!preview) opts.onAnnounce?.(text);
    },
    caption: (text) => {
      if (!preview && settings.captions) opts.onCaption?.(text);
    },
    trial: (t) => {
      if (!preview) opts.onTrial?.(t);
    },
    end: (summary) => {
      if (preview || destroyed) return;
      paused = true;
      opts.onEnd?.(summary);
    },
  };

  function vibrate(p: number | number[]) {
    if (preview || !useSettings.getState().haptics) return;
    try {
      navigator.vibrate?.(p);
    } catch {
      /* ignore */
    }
  }

  if (preview) {
    container.style.pointerEvents = 'none';
  }

  const ready = (async () => {
    const mod = await module.load();
    if (destroyed) return;
    instance = await mod.default(ctx);
    if (destroyed) {
      instance.destroy();
      instance = null;
      return;
    }
    if (preview) {
      started = true;
      instance.start();
    }
  })();
  ready.catch((e) => opts.onError?.(e));

  const host: GameHost = {
    ready,
    start() {
      if (started || !instance) return;
      started = true;
      paused = false;
      last = performance.now();
      instance.start();
    },
    pause() {
      if (paused || destroyed) return;
      paused = true;
      if (!preview) audioEngine.suspend();
      instance?.onPause?.();
    },
    resume() {
      if (!paused || destroyed || !started) return;
      paused = false;
      last = performance.now();
      if (!preview) audioEngine.resume();
      instance?.onResume?.();
    },
    isPaused: () => paused,
    elapsed: () => gameTime,
    setMuted(m) {
      muted = m;
      audio.setMuted(m);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsubSettings();
      try {
        instance?.destroy();
      } catch (e) {
        console.error(e);
      }
      instance = null;
      abort.abort();
      timers.clear();
      loops.length = 0;
      if (!preview) audioEngine.resume();
      container.replaceChildren();
    },
    capture() {
      const c = container.querySelector('canvas');
      if (!c) return null;
      try {
        const url = c.toDataURL('image/webp', 0.72);
        return url.length > 2000 ? url : null;
      } catch {
        return null;
      }
    },
  };
  return host;
}
