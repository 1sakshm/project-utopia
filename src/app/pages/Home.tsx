import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Flame, Play, Swords } from 'lucide-react';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { useProgress } from '@/platform/progress';
import { useEconomy, levelProgress } from '@/platform/economy';
import { useProfile } from '@/platform/profile';
import { computeStreak, trioStatus } from '@/platform/retention';
import { useVersusLive } from '@/platform/versus/live';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { track } from '@/platform/analytics';
import { audioEngine } from '@/runtime/audio';
import { navigate } from '../router';
import { openGame } from './Feed';
import { GameTile } from '../components/GameTile';
import { formatScore } from '../components/Common';
import Wallet from '../components/Wallet';
import { AdSlot } from '../components/AdSlot';
import { OrbHero, useSkin } from '../components/Orb';
import { burstFrom } from '../fx';

function resetIn() {
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const mins = Math.max(1, Math.round((end - now.getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export default function Home() {
  const games = useProgress((s) => s.games);
  const history = useProgress((s) => s.history);
  const xp = useEconomy((s) => s.xp);
  const lp = levelProgress(xp);
  const name = useProfile((s) => s.name);
  const skin = useSkin();
  const streak = useMemo(() => computeStreak(history), [history]);
  const trio = trioStatus(games);
  const nextIdx = trio.done.findIndex((d) => !d);
  const recent = useMemo(() => {
    const seen: string[] = [];
    for (const h of history) if (GAME_BY_ID[h.gameId] && !seen.includes(h.gameId)) seen.push(h.gameId);
    return seen.slice(0, 10);
  }, [history]);
  const fresh = useMemo(() => GAMES.filter((g) => !games[g.manifest.id]?.sessions && !trio.ids.includes(g.manifest.id)).slice(0, 10), [games, trio.ids]);
  const orbRef = useRef<HTMLDivElement>(null);
  const [taps, setTaps] = useState(0);
  const orbSize = Math.min(230, Math.round(window.innerWidth * 0.56));

  const play = () => {
    track({ name: 'home_click', target: 'hero_play' });
    if (!trio.complete) openGame(trio.ids[nextIdx], 'daily', null);
    else navigate('/feed');
  };

  return (
    <div className="page home2">
      <div className="topbar">
        <span className="brand-word">Utopia</span>
        <span className="spacer" />
        {streak.days > 0 && (
          <span className="chip streak-chip" aria-label={`${streak.days}-day streak`}>
            <Flame size={15} fill="currentColor" /> {streak.days}
          </span>
        )}
        <Wallet />
      </div>

      <section className="hero2">
        <div className="hero2-orb" ref={orbRef}>
          <OrbHero
            size={orbSize}
            pulseKey={taps}
            onTap={() => {
              audioEngine.unlock();
              audioEngine.uiTap();
              setTaps((t) => t + 1);
              burstFrom(orbRef.current, { count: 30, power: 0.6, colors: [...skin.stops.slice(0, 3)] });
            }}
          />
        </div>
        <div className="hero2-id">
          <span className="lvl-badge" aria-label={`Level ${lp.level}`}>
            <small>LV</small>
            {lp.level}
          </span>
          <div className="hero2-name">
            <b>{name}</b>
            <span className="bar xp-bar" aria-label={`${lp.into} of ${lp.span} XP`}>
              <i style={{ width: `${Math.max(4, lp.frac * 100)}%` }} />
            </span>
            <small className="num">
              {lp.into}/{lp.span} XP
            </small>
          </div>
        </div>
        <button className="btn btn-primary btn-xl btn-block hero2-play" onClick={play}>
          <Play size={18} fill="currentColor" /> {trio.complete ? 'Play' : trio.count === 0 ? 'Play today' : `Play ${trio.count + 1} of 3`}
        </button>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            Today’s 3<span className="count">{trio.count}/3</span>
          </h2>
          <span className="fine">New in {resetIn()}</span>
        </div>
        <ol className="daily3">
          {trio.ids.map((id, i) => {
            const m = GAME_BY_ID[id].manifest;
            const done = trio.done[i];
            return (
              <li key={id}>
                <button className={`daily-card ${done ? 'is-done' : ''} ${i === nextIdx ? 'is-next' : ''}`} onClick={() => openGame(id, 'daily', null)} aria-label={`${m.title}${done ? ', done' : ''}`}>
                  <span className="daily-art" style={{ backgroundImage: `url(/posters/${id}.jpg)` }} aria-hidden />
                  <span className="daily-num">{i + 1}</span>
                  {done && (
                    <span className="daily-done">
                      <Check size={22} strokeWidth={4} />
                      {m.showScore !== false && <b>{formatScore(trio.scores[i])}</b>}
                    </span>
                  )}
                  <span className="daily-title">{m.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {VERSUS_ENABLED && <VersusBanner />}

      {recent.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Jump back in</h2>
          </div>
          <ul className="rail">
            {recent.map((id) => (
              <li key={id}>
                <GameTile m={GAME_BY_ID[id].manifest} onClick={() => openGame(id, 'normal', null)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>New worlds</h2>
            <button className="text-link" onClick={() => navigate('/library')}>
              All games <ChevronRight size={14} />
            </button>
          </div>
          <ul className="rail">
            {fresh.map((g) => (
              <li key={g.manifest.id}>
                <GameTile m={g.manifest} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdSlot slot="home" />
    </div>
  );
}

function VersusBanner() {
  const retain = useVersusLive((s) => s.retain);
  const status = useVersusLive((s) => s.status);
  const online = useVersusLive((s) => s.online);
  const matches = useVersusLive((s) => s.matches);
  const queueFor = useVersusLive((s) => s.queueFor);
  useEffect(() => retain(), [retain]);
  const live = matches.filter((m) => m.state === 'playing' || m.state === 'countdown').length;
  return (
    <section className="section">
      <div className="vs-banner">
        <span className="vs-banner-swords" aria-hidden>
          <Swords size={34} strokeWidth={2.6} />
        </span>
        <div className="vs-banner-text">
          <b>Play someone</b>
          <span>
            {status === 'online' ? (
              <>
                <i className="dot is-good" /> {online} online{live ? ` · ${live} live` : ''}
              </>
            ) : (
              'Connecting…'
            )}
          </span>
        </div>
        <button
          className="btn btn-sm"
          disabled={status !== 'online'}
          onClick={() => {
            queueFor(null);
            navigate('/versus');
          }}
        >
          Find a match
        </button>
      </div>
    </section>
  );
}
