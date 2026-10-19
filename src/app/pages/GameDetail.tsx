import { useEffect } from 'react';
import { CalendarDays, Heart, Play, Swords } from 'lucide-react';
import { GAME_BY_ID } from '@/games/registry';
import { useProgress } from '@/platform/progress';
import { ABILITY_LABEL, ringOf } from '@/platform/abilities';
import { VERSUS_ENABLED, ROOM_POOL } from '@/platform/versus/config';
import { createRoom } from '@/platform/versus/match';
import { navigate } from '../router';
import { LivePreview, PosterArt, formatScore } from '../components/Common';
import { GameInfo } from '../components/GameInfo';
import { AbilityIcon, BackButton } from '../components/Editorial';
import { Sparkline } from '../components/Sparkline';
import { openGame } from './Feed';

export default function GameDetail({ id }: { id: string }) {
  const mod = GAME_BY_ID[id];
  const prog = useProgress((s) => s.games[id]);
  const history = useProgress((s) => s.history);
  const toggleFav = useProgress((s) => s.toggleFavorite);

  useEffect(() => {
    if (mod) document.title = `${mod.manifest.title} · Utopia`;
    return () => {
      document.title = 'Utopia';
    };
  }, [mod]);

  if (!mod) {
    return (
      <div className="page">
        <div className="empty">
          <h3>Game not found</h3>
          <button className="btn" onClick={() => navigate('/library')}>
            All games
          </button>
        </div>
      </div>
    );
  }
  const m = mod.manifest;
  const ring = ringOf(m.abilities.primary);
  const scores = history.filter((h) => h.gameId === id && h.mode === 'normal').slice(0, 20).reverse().map((h) => h.score);
  const canDuel = VERSUS_ENABLED && ROOM_POOL.includes(id);

  return (
    <div className="page is-wide detail">
      <div className="topbar">
        <BackButton to="/library" />
        <h1>{m.title}</h1>
        <button className={`icon-btn ${prog?.favorite ? 'is-fav' : ''}`} aria-pressed={!!prog?.favorite} aria-label={prog?.favorite ? 'Remove from saved' : 'Save'} onClick={() => toggleFav(id)}>
          <Heart fill={prog?.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="detail-grid">
        <div className="detail-hero">
          <PosterArt manifest={m} />
          <LivePreview module={mod} active />
        </div>
        <div className="detail-body">
          <p className="item-sub" style={{ marginBottom: 6 }}>
            <AbilityIcon id={ring.id} color={ring.color} size={16} /> {ABILITY_LABEL[m.abilities.primary]} · {m.sessionLabel}
          </p>
          <p className="detail-hook">{m.hook}</p>
          <div className="detail-actions">
            <button className="btn btn-primary btn-lg" onClick={(e) => openGame(id, 'normal', e.currentTarget.closest('.detail')?.querySelector('.detail-hero'))}>
              <Play size={16} fill="currentColor" /> Play
            </button>
            <button className="btn btn-lg" onClick={() => openGame(id, 'daily', null)}>
              <CalendarDays size={16} /> Daily
            </button>
            {canDuel && (
              <button
                className="btn btn-lg"
                onClick={async () => {
                  try {
                    navigate(`/versus/m/${await createRoom('duel', { gameId: id })}`);
                  } catch {
                    navigate('/versus');
                  }
                }}
              >
                <Swords size={16} /> Challenge
              </button>
            )}
          </div>
          {prog && prog.sessions > 0 && (
            <div className="stats" style={{ '--n': m.showScore !== false ? 3 : 2, marginTop: 16 } as React.CSSProperties}>
              {m.showScore !== false && (
                <div>
                  <b>{formatScore(prog.best)}</b>
                  <small>best</small>
                </div>
              )}
              <div>
                <b>{prog.highestLevel}</b>
                <small>top level</small>
              </div>
              <div>
                <b>{prog.sessions}</b>
                <small>plays</small>
              </div>
            </div>
          )}
          {scores.length > 1 && m.showScore !== false && (
            <div className="spark-row">
              <span className="fine">Recent scores</span>
              <Sparkline values={scores} w={160} h={28} />
            </div>
          )}
          <div style={{ marginTop: 22 }}>
            <GameInfo m={m} />
          </div>
        </div>
      </div>
    </div>
  );
}
