import { useEffect, useRef, useState } from 'react';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { createGameHost, type GameHost } from '@/runtime/host';
import { audioEngine } from '@/runtime/audio';
import type { HudState, SessionSummary } from '@/sdk/types';

/**
 * Developer Game Lab: mount any game in isolation.
 * /lab                           → list
 * /lab?game=<id>&mode=preview    → attract mode (ghost player)
 * /lab?game=<id>&mode=play       → play mode with start/pause controls
 */
export default function Lab() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('game');
  const mode = (params.get('mode') as 'play' | 'preview') ?? 'preview';
  const autostart = params.get('autostart') === '1';
  const mod = id ? GAME_BY_ID[id] : null;
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<GameHost | null>(null);
  const [hud, setHud] = useState<HudState>({});
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seed, setSeed] = useState(() => Number(params.get('seed')) || 12345);

  useEffect(() => {
    if (!mod || !box.current) return;
    setReady(false);
    setSummary(null);
    const h = createGameHost(mod, box.current, {
      mode,
      variant: 'normal',
      seed,
      startLevel: Number(params.get('level')) || 1,
      onHud: (p) => setHud((prev) => (p ? { ...prev, ...p } : {})),
      onEnd: (s) => setSummary(s),
      onError: (e) => {
        console.error(e);
        setErrors((x) => [...x, String((e as Error)?.stack ?? e)]);
      },
    });
    host.current = h;
    h.ready.then(() => {
      setReady(true);
      (window as unknown as { __labReady?: boolean }).__labReady = true;
      if (autostart && mode === 'play') h.start();
    });
    return () => h.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, mode, seed]);

  if (!mod) {
    return (
      <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
        <h1 className="display">Game Lab</h1>
        <p style={{ color: 'var(--text-2)' }}>{GAMES.length} games registered.</p>
        <ul style={{ lineHeight: 2 }}>
          {GAMES.map((g) => (
            <li key={g.manifest.id}>
              <b>{g.manifest.title}</b> ({g.manifest.engine}) — <a href={`/lab?game=${g.manifest.id}&mode=preview`}>preview</a> ·{' '}
              <a href={`/lab?game=${g.manifest.id}&mode=play`}>play</a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: mod.manifest.palette.bg }}>
      <div ref={box} data-testid="game-box" style={{ position: 'relative', flex: 1, overflow: 'hidden' }} />
      <aside
        style={{
          width: 260,
          padding: 12,
          fontSize: 12,
          background: 'rgba(0,0,0,.6)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <b>{mod.manifest.title}</b>
        <div>mode: {mode} · ready: {String(ready)}</div>
        {mode === 'play' && (
          <>
            <button
              className="btn"
              data-testid="lab-start"
              onClick={() => {
                audioEngine.unlock();
                host.current?.start();
              }}
            >
              Start
            </button>
            <button
              className="btn"
              onClick={() => {
                if (host.current?.isPaused()) host.current.resume();
                else host.current?.pause();
                setPaused(!!host.current?.isPaused());
              }}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
          </>
        )}
        <button className="btn" onClick={() => setSeed((s) => s + 1)}>
          Remount (seed {seed})
        </button>
        <pre data-testid="lab-hud">{JSON.stringify(hud, null, 1)}</pre>
        {summary && <pre data-testid="lab-summary">{JSON.stringify(summary, null, 1)}</pre>}
        {errors.length > 0 && (
          <pre data-testid="lab-errors" style={{ color: '#ff8a8a', whiteSpace: 'pre-wrap' }}>
            {errors.join('\n\n')}
          </pre>
        )}
      </aside>
    </div>
  );
}
