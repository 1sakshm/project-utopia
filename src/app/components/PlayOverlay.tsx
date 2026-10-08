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
import { CountUp } from './Editorial';
import Wallet from './Wallet';
import { useEconomy, type SessionRewards } from '@/platform/economy';
import { showRewardedAd } from '@/platform/ads';
import { BOOST_ORB_PRICE } from '@/platform/shop';
import { ABILITY_RING } from '@/platform/abilities';
import { nextUp, starText, starsFor, trioStatus, type TrioStatus } from '@/platform/retention';
import { shareToday } from './shareCard';

type Phase = 'loading' | 'boost' | 'howto' | 'countdown' | 'playing' | 'paused' | 'results' | 'error';
type BoostKind = 'slowmo' | 'secondWind';

interface ResultInfo {
  summary: SessionSummary;
  isPb: boolean;
  prevBest: number;
  statPbs: Record<string, boolean>;
  assisted: boolean;
  rewards: SessionRewards;
  starsBefore: number;
  starsAfter: number;
  /** Today's 3 progress, when this was one of today's daily games. */
  trio: TrioStatus | null;
  nextId: string | null;
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
  const [voiceAsk, setVoiceAsk] = useState<null | ((c: 'mic' | 'typing') => void)>(null);
  const [reviveAsk, setReviveAsk] = useState<null | ((granted: boolean) => void)>(null);
  // Boosts chosen before the run (picker shows once per opening, before the host is created).
  const [boosts, setBoosts] = useState<null | Record<BoostKind, boolean>>(() =>
    useSettings.getState().showBoostPicker && mod?.manifest.showScore !== false && useProgress.getState().get(gameId).tutorialDone ? null : { slowmo: false, secondWind: false },
  );
  const assisted = useRef(false);
  const windLoaded = useRef(false);
  const reviveOpen = useRef(false);
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
    if (!boosts) {
      go('boost');
      return;
    }
    go('loading');
    assisted.current = boosts.slowmo;
    windLoaded.current = boosts.secondWind;
    const t0 = performance.now();
    const seed = daily ? dailySeed(gameId) : (Math.random() * 2 ** 31) | 0;
    const onRevive = () => {
      if (windLoaded.current) {
        // A pre-loaded Second Wind kicks in automatically.
        windLoaded.current = false;
        assisted.current = true;
        track({ name: 'revive', game_id: gameId, via: 'second-wind' });
        say('Second Wind! One more life.');
        setCaption('Second Wind ✦ one more life');
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        reviveOpen.current = true;
        setReviveAsk(() => (granted: boolean) => {
          reviveOpen.current = false;
          setReviveAsk(null);
          if (granted) assisted.current = true;
          resolve(granted);
        });
      });
    };
    const h = createGameHost(mod, box.current, {
      mode: 'play',
      variant: daily ? 'daily' : 'normal',
      seed,
      startLevel: startLevelFor(gameId),
      boost: { slowmo: boosts.slowmo },
      onRevive,
      onHud: (p) => setHud((prev) => (p ? { ...prev, ...p } : {})),
      onCaption: (t) => setCaption(t),
      onAnnounce: (t) => say(t),
      onEnd: (s) => finish(s, h),
      onVoiceConsent: () =>
        new Promise((resolve) => {
          h.pause();
          setVoiceAsk(() => (c: 'mic' | 'typing') => {
            setVoiceAsk(null);
            h.resume();
            resolve(c);
          });
        }),
      onError: (e) => {
        console.error(e);
        setError(String((e as Error)?.message ?? e));
        go('error');
      },
    });
    host.current = h;
    // DEV-only hooks for end-to-end tests (end a run / offer a second chance without playing it out).
    if (import.meta.env.DEV) (window as unknown as { __utopiaPlay?: object }).__utopiaPlay = { id: gameId, end: (sm: SessionSummary) => finish(sm, h), revive: onRevive };
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
      if (import.meta.env.DEV) delete (window as unknown as { __utopiaPlay?: object }).__utopiaPlay;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, runId, daily, boosts]);

  function begin(h = host.current) {
    if (!h) return;
    h.start();
    go('playing');
    say(`${m.title} started`);
  }

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'countdown') return;
    if (reviveOpen.current) return; // the second-chance sheet already holds the game paused
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
    // Boosted/revived runs are tracked separately and never overwrite normal personal bests.
    const wasAssisted = assisted.current;
    const prevBest = wasAssisted ? (prog.bestAssisted ?? 0) : relaxed ? prog.bestRelaxed : prog.best;
    const isPb = m.showScore !== false && s.score > prevBest && s.score > 0;
    const statPbs: Record<string, boolean> = {};
    const bestStats = { ...prog.bestStats };
    for (const def of wasAssisted ? [] : m.results) {
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
    const starsBefore = starsFor(gameId, prog);
    const trioBefore = trioStatus();
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
    if (wasAssisted) patch.bestAssisted = Math.max(prog.bestAssisted ?? 0, s.score);
    else if (relaxed) patch.bestRelaxed = Math.max(prog.bestRelaxed, s.score);
    else patch.best = Math.max(prog.best, s.score);
    if (daily && !wasAssisted) {
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
      assisted: wasAssisted || undefined,
    });
    track({ name: 'game_session_end', game_id: gameId, score: s.score, level_reached: s.levelReached, duration_ms: ms, is_pb: isPb });
    const rewards = useEconomy.getState().applySession({
      gameId,
      ring: ABILITY_RING[m.abilities.primary],
      voice: m.input.requiresAudio,
      levelReached: s.levelReached,
      completed: true,
      isPb: isPb && !wasAssisted,
      assisted: wasAssisted,
      ms,
    });
    track({ name: 'reward', source: 'session', orbs: rewards.orbs });
    const starsAfter = starsFor(gameId, store.get(gameId));
    if (starsAfter > starsBefore) track({ name: 'star_earned', game_id: gameId, stars: starsAfter });
    const trioAfter = trioStatus();
    const trio = daily && trioAfter.ids.includes(gameId) ? trioAfter : null;
    if (trioAfter.complete && !trioBefore.complete) track({ name: 'daily_complete', day: trioAfter.day });
    // Ask the browser to keep our storage (Safari clears script storage after 7 days without a visit otherwise).
    void navigator.storage?.persist?.().catch(() => false);
    const nextId = trio && !trio.complete ? trio.ids[trio.done.findIndex((d) => !d)] : nextUp(gameId);
    setResult({ summary: s, isPb, prevBest, statPbs, assisted: wasAssisted, rewards, starsBefore, starsAfter, trio, nextId });
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
    const next = result?.nextId;
    if (next) {
      const toDaily = !!result?.trio && !result.trio.complete;
      navigate(`/play/${next}${toDaily ? '?daily=1' : ''}`, { replace: true });
      return;
    }
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
    setBoosts({ slowmo: false, secondWind: false }); // boosts last one run
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
    <div className="play-overlay" ref={overlay} role="dialog" aria-modal="true" aria-label={`Playing ${m.title}`} style={{ background: m.palette.bg, ['--gbg' as string]: m.palette.bg }}>
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

      {phase === 'boost' && (
        <div className="play-center">
          <BoostPicker title={m.title} gameId={gameId} onStart={(b) => setBoosts(b)} />
        </div>
      )}

      {reviveAsk && phase !== 'results' && <ReviveSheet gameId={gameId} done={reviveAsk} />}

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

      {voiceAsk && phase !== 'results' && (
        <div className="play-center play-dim">
          <div className="glass-card small voice-consent" role="dialog" aria-modal="true" aria-labelledby="vc-title">
            <div className="vc-mic" aria-hidden>🎙️</div>
            <h2 className="display" id="vc-title">
              Answer with your voice?
            </h2>
            <p className="muted">
              If you use the microphone, your recording is sent to Sarvam AI to turn your speech into text. Utopia doesn’t store it. You can
              always type instead, and change this later in Settings → Voice.{' '}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy
              </a>
            </p>
            <div className="row">
              <button className="btn" onClick={() => voiceAsk('typing')}>
                Type instead
              </button>
              <button className="btn btn-primary" onClick={() => voiceAsk('mic')} autoFocus>
                Use microphone
              </button>
            </div>
          </div>
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
  const line = s.message ?? resultLine(r, delta, s.levelReached);
  const nextM = r.nextId ? GAME_BY_ID[r.nextId]?.manifest : null;
  const trioNext = !!r.trio && !r.trio.complete;
  const [shared, setShared] = useState(false);
  return (
    <div className="glass-card results">
      <p className="eyebrow">{m.title}</p>
      {showScore ? (
        <>
          {r.assisted && <span className="boosted-pill">Boosted run · scored separately</span>}
          <div className={`results-score ${r.isPb ? 'is-pb' : ''}`}>{formatScore(s.score)}</div>
          <p className="results-unit">{m.scoreLabel}</p>
          {r.isPb && <p className="pb-badge">✦ New {r.assisted ? 'boosted ' : ''}best</p>}
          {!r.isPb && r.prevBest > 0 && <p className="muted">Your {r.assisted ? 'boosted ' : ''}best: {formatScore(r.prevBest)}</p>}
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
      {r.starsAfter > 0 && (
        <p className={`results-stars ${r.starsAfter > r.starsBefore ? 'is-new' : ''}`} aria-label={`${r.starsAfter} of 3 stars${r.starsAfter > r.starsBefore ? ', new star' : ''}`}>
          <span aria-hidden>{starText(r.starsAfter)}</span>
          {r.starsAfter > r.starsBefore && <em>New star!</em>}
        </p>
      )}
      {r.trio && (
        <div className="results-trio">
          <span className="results-trio-dots" aria-hidden>
            {r.trio.done.map((d, i) => (
              <i key={i} className={d ? 'on' : ''} />
            ))}
          </span>
          <span>{r.trio.complete ? 'Today’s 3 complete. See you tomorrow.' : `Today’s 3 · ${r.trio.count} of 3`}</span>
          {r.trio.complete && (
            <button
              className="btn btn-ghost"
              onClick={async () => {
                track({ name: 'share', what: 'today' });
                const res = await shareToday(r.trio!);
                if (res === 'copied') setShared(true);
              }}
            >
              {shared ? 'Copied ✓' : 'Share'}
            </button>
          )}
        </div>
      )}
      <RewardsRow rewards={r.rewards} />
      <div className="results-actions">
        {trioNext && nextM ? (
          <button className="btn btn-primary btn-lg" onClick={onNext} autoFocus>
            Next: {nextM.title} <IconNext width={18} height={18} />
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={onAgain} autoFocus>
            <IconRestart width={18} height={18} /> Play again
          </button>
        )}
        <div className="row">
          <button className="btn" onClick={trioNext ? onAgain : onExit}>
            {trioNext ? 'Play again' : 'Exit to feed'}
          </button>
          {!trioNext && (
            <button className="btn results-next" onClick={onNext}>
              {nextM ? (
                <span>
                  <small>Up next</small> {nextM.title}
                </span>
              ) : (
                'Next game'
              )}
              <IconNext width={18} height={18} />
            </button>
          )}
        </div>
        {trioNext && (
          <button className="btn btn-ghost" onClick={onExit}>
            Exit to feed
          </button>
        )}
      </div>
    </div>
  );
}

const BOOST_INFO: Record<BoostKind, { name: string; blurb: string }> = {
  slowmo: { name: 'Slow-mo', blurb: '50% more time on every timer' },
  secondWind: { name: 'Second Wind', blurb: 'One free second chance' },
};
type BoostVia = 'inventory' | 'orbs' | 'ad';

/** Optional pre-run boosts. Never required: "Play" is always one tap. */
function BoostPicker({ title, gameId, onStart }: { title: string; gameId: string; onStart: (b: Record<BoostKind, boolean>) => void }) {
  const eco = useEconomy();
  const setSettings = useSettings((s) => s.set);
  const [sel, setSel] = useState<Record<BoostKind, BoostVia | null>>({ slowmo: null, secondWind: null });
  const [busy, setBusy] = useState(false);
  const kinds: BoostKind[] = ['slowmo', 'secondWind'];

  const reserved = (except: BoostKind) => kinds.reduce((n, k) => (k !== except && sel[k] === 'orbs' ? n + BOOST_ORB_PRICE[k] : n), 0);
  const viaFor = (k: BoostKind): BoostVia | null =>
    eco.boosts[k] > 0 ? 'inventory' : eco.orbs - reserved(k) >= BOOST_ORB_PRICE[k] ? 'orbs' : eco.canWatchAd() ? 'ad' : null;

  async function toggle(k: BoostKind) {
    if (busy) return;
    if (sel[k]) {
      if (sel[k] !== 'ad') setSel((s) => ({ ...s, [k]: null })); // an ad-earned boost stays on
      return;
    }
    const via = viaFor(k);
    if (!via) return;
    if (via === 'ad') {
      setBusy(true);
      const r = await showRewardedAd('boost');
      setBusy(false);
      if (r !== 'rewarded') return;
    }
    setSel((s) => ({ ...s, [k]: via }));
  }

  function start() {
    const out = { slowmo: false, secondWind: false };
    const e = useEconomy.getState();
    for (const k of kinds) {
      const via = sel[k];
      if (!via) continue;
      const ok = via === 'inventory' ? e.useBoost(k) : via === 'orbs' ? e.spend(BOOST_ORB_PRICE[k]) : true;
      if (ok) {
        out[k] = true;
        track({ name: 'boost_used', kind: k, via, game_id: gameId });
      }
    }
    onStart(out);
  }

  const any = kinds.some((k) => sel[k]);
  return (
    <div className="glass-card howto boost-card">
      <p className="eyebrow">Ready?</p>
      <h2 className="display">{title}</h2>
      <div className="boosts">
        <p className="boosts-title">Optional boosts</p>
        <div className="boost-row">
          {kinds.map((k) => {
            const chosen = sel[k];
            const via = chosen ?? viaFor(k);
            return (
              <button key={k} className="boost" aria-pressed={!!chosen} disabled={busy || (!chosen && !via)} onClick={() => void toggle(k)}>
                <b>{BOOST_INFO[k].name}</b>
                <small>{BOOST_INFO[k].blurb}</small>
                <span className="boost-cost">
                  {chosen === 'ad' ? (
                    'Earned ✓'
                  ) : via === 'inventory' ? (
                    `${eco.boosts[k]} owned`
                  ) : via === 'orbs' ? (
                    <>
                      <i className="coin sm" aria-hidden /> {BOOST_ORB_PRICE[k]} orbs
                    </>
                  ) : via === 'ad' ? (
                    '▶ Watch a short ad'
                  ) : (
                    'Not enough orbs'
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="boost-note">Boosted runs earn half orbs and are scored separately from your bests.</p>
      </div>
      <button className="btn btn-primary btn-lg" onClick={start} disabled={busy} autoFocus>
        {any ? 'Play boosted' : 'Play'}
      </button>
      <button
        className="btn btn-ghost"
        onClick={() => {
          setSettings({ showBoostPicker: false });
          onStart({ slowmo: false, secondWind: false });
        }}
      >
        Don’t offer boosts
      </button>
    </div>
  );
}

/** Second chance when a run would end. Always optional; "No thanks" is focused by default. */
function ReviveSheet({ gameId, done }: { gameId: string; done: (granted: boolean) => void }) {
  const winds = useEconomy((s) => s.boosts.secondWind);
  const canAd = useEconomy((s) => s.canWatchAd());
  const [busy, setBusy] = useState(false);
  async function watch() {
    setBusy(true);
    const r = await showRewardedAd('second-chance');
    setBusy(false);
    if (r === 'rewarded') {
      track({ name: 'revive', game_id: gameId, via: 'ad' });
      done(true);
    }
  }
  function wind() {
    if (!useEconomy.getState().useBoost('secondWind')) return;
    track({ name: 'revive', game_id: gameId, via: 'second-wind' });
    track({ name: 'boost_used', kind: 'secondWind', via: 'inventory', game_id: gameId });
    done(true);
  }
  return (
    <div className="play-center play-dim">
      <div className="glass-card small revive" role="dialog" aria-modal="true" aria-labelledby="rv-title">
        <div className="revive-orb" aria-hidden />
        <h2 className="display" id="rv-title">
          Keep going?
        </h2>
        <p className="muted">Get one more life and carry on. Boosted runs are scored separately.</p>
        <div className="actions">
          {canAd && (
            <button className="btn btn-primary" onClick={() => void watch()} disabled={busy}>
              ▶ Watch a short ad
            </button>
          )}
          {winds > 0 && (
            <button className="btn" onClick={wind} disabled={busy}>
              Use Second Wind ({winds})
            </button>
          )}
          <button
            className="btn btn-ghost"
            autoFocus
            disabled={busy}
            onClick={() => {
              track({ name: 'revive', game_id: gameId, via: 'declined' });
              done(false);
            }}
          >
            No thanks, end the run
          </button>
        </div>
      </div>
    </div>
  );
}

/** Orbs + XP earned, level-ups, finished quests, and an optional "double it" ad. */
function RewardsRow({ rewards }: { rewards: SessionRewards }) {
  const [doubled, setDoubled] = useState(false);
  const [busy, setBusy] = useState(false);
  const canAd = useEconomy((s) => s.canWatchAd());
  const orbs = doubled ? rewards.orbs * 2 : rewards.orbs;
  async function double() {
    setBusy(true);
    const r = await showRewardedAd('double-orbs');
    setBusy(false);
    if (r !== 'rewarded') return;
    useEconomy.getState().award(rewards.orbs);
    track({ name: 'reward', source: 'double', orbs: rewards.orbs });
    setDoubled(true);
  }
  return (
    <>
      <div className="rewards" aria-label="Rewards">
        <span className="reward-chip">
          <i className="coin sm" aria-hidden /> +<CountUp value={orbs} duration={700} /> orbs
        </span>
        <span className="reward-chip">
          +<CountUp value={rewards.xp} duration={700} /> XP
        </span>
        {rewards.levelAfter > rewards.levelBefore && <span className="reward-chip levelup">✦ Level {rewards.levelAfter}</span>}
        {rewards.questsCompleted.map((q) => (
          <span key={q.id} className="reward-chip quest">
            ✓ {q.title}
          </span>
        ))}
        <Wallet />
      </div>
      {!doubled && canAd && rewards.orbs > 0 && (
        <button className="btn double-btn" onClick={() => void double()} disabled={busy}>
          ▶ Double your orbs with a short ad (+{rewards.orbs})
        </button>
      )}
      {rewards.questsCompleted.length > 0 && <p className="fine">Claim quest rewards in Progress.</p>}
    </>
  );
}

/** Results copy that says something specific, with a little variety. */
function resultLine(r: ResultInfo, delta: number, level: number): string {
  const pick = (arr: string[]) => arr[(r.summary.score + level) % arr.length];
  if (r.isPb) return r.assisted ? 'A new boosted best. Nice run.' : pick(['A new personal best. Lovely.', 'Your best yet. That one’s yours.', 'New best. Something clicked.']);
  if (r.prevBest > 0 && delta > -20) return pick(['Right on the edge of your best.', `Just ${Math.max(1, -delta)} short of your best.`]);
  if (level >= 4) return pick([`You reached level ${level}.`, `Level ${level}. The game is meeting you there.`]);
  return pick(['Every round sharpens the next.', 'Good warm-up. The next one will feel easier.', 'Nice. Try it once more, or wander somewhere new.']);
}
