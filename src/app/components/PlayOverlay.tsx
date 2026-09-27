import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GAME_BY_ID } from '@/games/registry';
import type { HudState, SessionSummary } from '@/sdk/types';
import { dailySeed } from '@/sdk/rng';
import { createGameHost, type GameHost } from '@/runtime/host';
import { audioEngine } from '@/runtime/audio';
import { useProgress, startLevelFor, type GameProgress } from '@/platform/progress';
import { useSettings, prefersReducedMotion } from '@/platform/settings';
import { usePlayUi } from '@/platform/play';
import { useFeed, indexOfGame } from '@/platform/feed';
import { track } from '@/platform/analytics';
import { navigate } from '../router';
import { PosterArt, formatScore } from './Common';
import { IconClose, IconPause, IconPlay, IconRestart, IconNext } from './Icons';
import { today } from '../pages/Feed';

type Phase = 'loading' | 'howto' | 'countdown' | 'playing' | 'paused' | 'results' | 'error';

interface ResultInfo {
  summary: SessionSummary;
  isPb: boolean;
  prevBest: number;
  statPbs: Record<string, boolean>;
}

export default function PlayOverlay({ gameId, daily }: { gameId: string; daily: boolean }) {
  const mod = GAME_BY_ID[gameId];
  const m = mod?.manifest;
  const overlay = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<GameHost | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const phaseRef = useRef<Phase>('loading');
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState<HudState>({});
  const [caption, setCaption] = useState<string | null>(null);
  const [result, setResult] = useState<ResultInfo | null>(null);
  const [count, setCount] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const say = usePlayUi((s) => s.say);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // Opening transition: expand from the tapped card.
  useLayoutEffect(() => {
    const el = overlay.current;
    const r = usePlayUi.getState().originRect;
    if (!el) return;
    if (prefersReducedMotion() || !r) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    el.animate(
      [
        { clipPath: `inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px round 28px)` },
        { clipPath: 'inset(0px 0px 0px 0px round 0px)' },
      ],
      { duration: 440, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, []);

  // Create the game host (re-created on restart).
  useEffect(() => {
    if (!mod || !box.current) return;
    setReady(false);
    setHud({});
    setResult(null);
    setError(null);
    go('loading');
    const t0 = performance.now();
    const seed = daily ? dailySeed(gameId) : (Math.random() * 2 ** 31) | 0;
    const h = createGameHost(mod, box.current, {
      mode: 'play',
      variant: daily ? 'daily' : 'normal',
      seed,
      startLevel: startLevelFor(gameId),
      onHud: (p) => setHud((prev) => (p ? { ...prev, ...p } : {})),
      onCaption: (t) => setCaption(t),
      onAnnounce: (t) => say(t),
      onEnd: (s) => finish(s, h),
      onError: (e) => {
        console.error(e);
        setError(String((e as Error)?.message ?? e));
        go('error');
      },
    });
    host.current = h;
    h.ready.then(() => {
      if (host.current !== h) return;
      setReady(true);
      track({ name: 'game_load', game_id: gameId, tti_ms: Math.round(performance.now() - t0), from: usePlayUi.getState().openedInApp ? 'feed' : 'deeplink' });
      const prog = useProgress.getState().get(gameId);
      if (!prog.tutorialDone && runId === 0) go('howto');
      else begin(h);
    });
    return () => {
      host.current = null;
      h.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, runId, daily]);

  function begin(h = host.current) {
    if (!h) return;
    h.start();
    go('playing');
    say(`${m.title} started`);
  }

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'countdown') return;
    host.current?.pause();
    go('paused');
    track({ name: 'game_action', game_id: gameId, action: 'pause' });
  }, [gameId, go]);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    if (useSettings.getState().resumeCountdown && !prefersReducedMotion()) {
      go('countdown');
      setCount(3);
    } else {
      host.current?.resume();
      go('playing');
    }
  }, [go]);

  // Countdown ticker
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      host.current?.resume();
      go('playing');
      return;
    }
    audioEngine.uiTap();
    const t = window.setTimeout(() => setCount((c) => c - 1), 600);
    return () => window.clearTimeout(t);
  }, [phase, count, go]);

  // Auto-pause: tab hidden, window blur, orientation change.
  useEffect(() => {
    const onVis = () => document.hidden && pause();
    const onBlur = () => pause();
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('orientationchange', onBlur);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('orientationchange', onBlur);
    };
  }, [pause]);

  // Keyboard: Esc / P toggles pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (confirmExit) {
        setConfirmExit(false);
        return;
      }
      if (phaseRef.current === 'playing') pause();
      else if (phaseRef.current === 'paused' && !showHowTo) resume();
      else if (showHowTo) setShowHowTo(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pause, resume, confirmExit, showHowTo]);

  // Captions auto-hide
  useEffect(() => {
    if (!caption) return;
    const t = window.setTimeout(() => setCaption(null), 2200);
    return () => window.clearTimeout(t);
  }, [caption]);

  function finish(s: SessionSummary, h: GameHost) {
    const store = useProgress.getState();
    const prog = store.get(gameId);
    const timing = useSettings.getState().timing;
    const relaxed = timing !== 'standard';
    const prevBest = relaxed ? prog.bestRelaxed : prog.best;
    const isPb = m.showScore !== false && s.score > prevBest && s.score > 0;
    const statPbs: Record<string, boolean> = {};
    const bestStats = { ...prog.bestStats };
    for (const def of m.results) {
      const v = s.stats[def.key];
      if (v === undefined || !def.better) continue;
      const old = bestStats[def.key];
      const better = old === undefined ? v > 0 : def.better === 'higher' ? v > old : v < old && v > 0;
      if (better) {
        if (old !== undefined) statPbs[def.key] = true;
        bestStats[def.key] = v;
      }
    }
    const ms = Math.round(h.elapsed());
    const patch: Partial<GameProgress> = {
      bestStats,
      highestLevel: Math.max(prog.highestLevel, s.levelReached),
      lastLevel: s.levelReached,
      sessions: prog.sessions + 1,
      playMs: prog.playMs + ms,
      tutorialDone: true,
      lastPlayed: Date.now(),
      earlyExits: 0,
    };
    if (relaxed) patch.bestRelaxed = Math.max(prog.bestRelaxed, s.score);
    else patch.best = Math.max(prog.best, s.score);
    if (daily) {
      const d = today();
      const cur = prog.dailyBest?.day === d ? prog.dailyBest.score : 0;
      patch.dailyBest = { day: d, score: Math.max(cur, s.score) };
    }
    store.patch(gameId, patch);
    store.addSession({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      gameId,
      t: Date.now() - ms,
      ms,
      score: s.score,
      level: s.levelReached,
      mode: daily ? 'daily' : 'normal',
      timing,
      stats: s.stats,
    });
    track({ name: 'game_session_end', game_id: gameId, score: s.score, level_reached: s.levelReached, duration_ms: ms, is_pb: isPb });
    setResult({ summary: s, isPb, prevBest, statPbs });
    go('results');
    say(`Session complete. ${m.showScore !== false ? `Score ${s.score}.` : ''} ${isPb ? 'New personal best!' : ''}`);
    if (isPb) audioEngine.uiPlay();
  }

  function requestExit() {
    const h = host.current;
    if (phaseRef.current === 'playing' && h && h.elapsed() > 60000 && useSettings.getState().confirmExit) {
      h.pause();
      go('paused');
      setConfirmExit(true);
      return;
    }
    doExit();
  }

  function doExit(after?: () => void) {
    const h = host.current;
    const elapsed = h?.elapsed() ?? 0;
    track({ name: 'game_exit', game_id: gameId, state: phaseRef.current, elapsed_ms: Math.round(elapsed) });
    if (phaseRef.current !== 'results' && elapsed < 10000 && elapsed > 0) {
      const p = useProgress.getState().get(gameId);
      useProgress.getState().patch(gameId, { earlyExits: p.earlyExits + 1 });
    }
    audioEngine.uiExit();
    const leave = () => {
      if (usePlayUi.getState().openedInApp && window.history.length > 1) window.history.back();
      else {
        const idx = indexOfGame(gameId, daily ? 'daily' : 'normal');
        if (idx >= 0) {
          useFeed.getState().setActive(idx);
          useFeed.getState().requestScroll(idx, false);
        }
        navigate(`/?card=${gameId}`, { replace: true });
      }
      after?.();
    };
    const el = overlay.current;
    if (el && !prefersReducedMotion()) {
      const a = el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = leave;
    } else leave();
  }

  function nextGame() {
    track({ name: 'game_action', game_id: gameId, action: 'next_game' });
    doExit(() => {
      window.setTimeout(() => {
        const f = useFeed.getState();
        f.requestScroll(f.activeIndex + 1, true);
      }, 120);
    });
  }

  function restart(kind: 'restart' | 'play_again') {
    track({ name: 'game_action', game_id: gameId, action: kind });
    setConfirmExit(false);
    setShowHowTo(false);
    setRunId((r) => r + 1);
  }

  if (!mod) {
    return (
      <div className="play-overlay" ref={overlay}>
        <div className="play-center">
          <h2 className="display">Game not found</h2>
          <button className="btn" onClick={() => navigate('/', { replace: true })}>
            Back to feed
          </button>
        </div>
      </div>
    );
  }

  const showScore = m.showScore !== false;

  return (
    <div className="play-overlay" ref={overlay} role="dialog" aria-modal="true" aria-label={`Playing ${m.title}`} style={{ background: m.palette.bg }}>
      <PosterArt manifest={m} className={`play-poster ${ready ? 'is-hidden' : ''}`} />
      <div ref={box} className={`play-box ${ready ? 'is-ready' : ''}`} />

      {/* Top chrome */}
      <div className="play-top">
        <button className="icon-btn" onClick={requestExit} aria-label="Exit game">
          <IconClose />
        </button>
        {(phase === 'playing' || phase === 'paused' || phase === 'countdown') && <Hud hud={hud} showScore={showScore} />}
        <button
          className="icon-btn"
          onClick={() => (phase === 'paused' ? resume() : pause())}
          aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
          disabled={phase !== 'playing' && phase !== 'paused'}
        >
          {phase === 'paused' ? <IconPlay /> : <IconPause />}
        </button>
      </div>

      {caption && (
        <div className="play-caption" role="status">
          {caption}
        </div>
      )}

      {phase === 'loading' && (
        <div className="play-center play-loading">
          <h2 className="display">{m.title}</h2>
          <div className="loader" aria-label="Loading" />
        </div>
      )}

      {phase === 'howto' && (
        <div className="play-center">
          <HowToCard m={m} onGo={() => begin()} />
        </div>
      )}

      {phase === 'countdown' && (
        <div className="play-center">
          <div className="countdown" key={count} aria-live="assertive">
            {count}
          </div>
        </div>
      )}

      {phase === 'paused' && !confirmExit && (
        <div className="play-center play-dim">
          {showHowTo ? (
            <HowToCard m={m} onGo={() => setShowHowTo(false)} goLabel="Back" />
          ) : (
            <PauseMenu
              title={m.title}
              onResume={resume}
              onRestart={() => restart('restart')}
              onHowTo={() => setShowHowTo(true)}
              onExit={() => doExit()}
            />
          )}
        </div>
      )}

      {confirmExit && (
        <div className="play-center play-dim">
          <div className="glass-card small">
            <h2 className="display">Exit this game?</h2>
            <p className="muted">Progress for this round won’t be saved.</p>
            <div className="row">
              <button className="btn" onClick={() => { setConfirmExit(false); resume(); }}>
                Stay
              </button>
              <button className="btn btn-primary" onClick={() => doExit()} autoFocus>
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'results' && result && (
        <div className="play-center play-dim">
          <Results m={m} r={result} onAgain={() => restart('play_again')} onExit={() => doExit()} onNext={nextGame} />
        </div>
      )}

      {phase === 'error' && (
        <div className="play-center play-dim">
          <div className="glass-card small">
            <h2 className="display">This game hit a snag</h2>
            <p className="muted">{error ?? 'Something went wrong while loading.'}</p>
            <div className="row">
              <button className="btn" onClick={() => doExit()}>
                Back to feed
              </button>
              <button className="btn btn-primary" onClick={() => restart('restart')}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Hud({ hud, showScore }: { hud: HudState; showScore: boolean }) {
  return (
    <div className="hud" aria-live="off">
      <div className="hud-row">
        {showScore && hud.score !== undefined && (
          <span className="hud-score" aria-label={`Score ${hud.score}`}>
            {formatScore(hud.score)}
          </span>
        )}
        {hud.level !== undefined && <span className="hud-pill">Lv {hud.level}</span>}
        {hud.timer !== undefined && <span className="hud-pill">{formatTime(hud.timer)}</span>}
        {hud.lives !== undefined && hud.maxLives !== undefined && (
          <span className="hud-lives" aria-label={`${hud.lives} of ${hud.maxLives} lives`}>
            {Array.from({ length: hud.maxLives }, (_, i) => (
              <i key={i} className={i < hud.lives! ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>
      {hud.label && <span className="hud-label">{hud.label}</span>}
      {hud.progress !== undefined && (
        <span className="hud-progress" aria-hidden>
          <i style={{ width: `${Math.round(Math.min(1, Math.max(0, hud.progress)) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.max(0, Math.floor(s % 60));
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
};

function HowToCard({ m, onGo, goLabel = 'Let’s go' }: { m: { title: string; howTo: string[]; palette: { accent: string } }; onGo: () => void; goLabel?: string }) {
  return (
    <div className="glass-card howto">
      <p className="eyebrow">How to play</p>
      <h2 className="display">{m.title}</h2>
      <ol className="howto-steps">
        {m.howTo.map((s, i) => (
          <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
            <span className="howto-num" style={{ background: m.palette.accent }}>
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <button className="btn btn-primary btn-lg" onClick={onGo} autoFocus>
        {goLabel}
      </button>
    </div>
  );
}

function PauseMenu({ title, onResume, onRestart, onHowTo, onExit }: { title: string; onResume: () => void; onRestart: () => void; onHowTo: () => void; onExit: () => void }) {
  const s = useSettings();
  return (
    <div className="glass-card pause">
      <p className="eyebrow">Paused</p>
      <h2 className="display">{title}</h2>
      <div className="pause-actions">
        <button className="btn btn-primary btn-lg" onClick={onResume} autoFocus>
          <IconPlay width={18} height={18} /> Resume
        </button>
        <button className="btn" onClick={onRestart}>
          <IconRestart width={18} height={18} /> Restart
        </button>
        <button className="btn" onClick={onHowTo}>
          How to play
        </button>
      </div>
      <div className="pause-settings">
        <label className="slider-row">
          <span>Sound</span>
          <input type="range" min={0} max={1} step={0.05} value={s.master} onChange={(e) => s.set({ master: Number(e.target.value) })} aria-label="Master volume" />
        </label>
        <label className="toggle-row">
          <span>High contrast</span>
          <input type="checkbox" checked={s.highContrast} onChange={(e) => s.set({ highContrast: e.target.checked })} />
        </label>
        <label className="toggle-row">
          <span>Reduced motion</span>
          <input type="checkbox" checked={prefersReducedMotion(s)} onChange={(e) => s.set({ reducedMotion: e.target.checked ? 'on' : 'off' })} />
        </label>
        <label className="toggle-row">
          <span>Captions for sounds</span>
          <input type="checkbox" checked={s.captions} onChange={(e) => s.set({ captions: e.target.checked })} />
        </label>
        <div className="seg-row" role="group" aria-label="Timing">
          <span>Timing</span>
          <div className="seg">
            {(
              [
                ['standard', 'Standard'],
                ['relaxed15', '1.5×'],
                ['relaxed2', '2×'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.timing === v} onClick={() => s.set({ timing: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="fine">Timing changes apply to the next round.</p>
      </div>
      <button className="btn btn-ghost" onClick={onExit}>
        <IconClose width={18} height={18} /> Exit to feed
      </button>
    </div>
  );
}

function Results({ m, r, onAgain, onExit, onNext }: { m: import('@/sdk/types').GameManifest; r: ResultInfo; onAgain: () => void; onExit: () => void; onNext: () => void }) {
  const s = r.summary;
  const showScore = m.showScore !== false;
  const delta = s.score - r.prevBest;
  const line =
    s.message ??
    (r.isPb ? 'A new personal best. Lovely.' : delta > -20 && r.prevBest > 0 ? 'Right on the edge of your best.' : 'Every round sharpens the next.');
  return (
    <div className="glass-card results">
      <p className="eyebrow">{m.title}</p>
      {showScore ? (
        <>
          <div className={`results-score ${r.isPb ? 'is-pb' : ''}`}>{formatScore(s.score)}</div>
          <p className="results-unit">{m.scoreLabel}</p>
          {r.isPb && <p className="pb-badge">✦ New personal best</p>}
          {!r.isPb && r.prevBest > 0 && <p className="muted">Your best: {formatScore(r.prevBest)}</p>}
        </>
      ) : (
        <h2 className="display results-calm">Welcome back to stillness.</h2>
      )}
      <div className="results-stats">
        {m.results.map((def) =>
          s.stats[def.key] !== undefined ? (
            <div key={def.key} className="stat">
              <span className="stat-v">
                {formatScore(s.stats[def.key])}
                {def.unit && <small>{def.unit}</small>}
              </span>
              <span className="stat-l">
                {def.label}
                {r.statPbs[def.key] && <em> · best!</em>}
              </span>
            </div>
          ) : null,
        )}
      </div>
      <p className="results-line">{line}</p>
      <div className="results-actions">
        <button className="btn btn-primary btn-lg" onClick={onAgain} autoFocus>
          <IconRestart width={18} height={18} /> Play again
        </button>
        <div className="row">
          <button className="btn" onClick={onExit}>
            Exit to feed
          </button>
          <button className="btn" onClick={onNext}>
            Next game <IconNext width={18} height={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
