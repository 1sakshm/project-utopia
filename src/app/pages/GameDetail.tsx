import { useEffect } from 'react';
import { GAME_BY_ID } from '@/games/registry';
import { useProgress } from '@/platform/progress';
import { navigate } from '../router';
import { LivePreview, PosterArt, formatScore } from '../components/Common';
import { GameInfo } from '../components/GameInfo';
import { IconBack, IconCalendar, IconHeart, IconPlay } from '../components/Icons';
import { openGame } from './Feed';
import { Sparkline } from './Progress';

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
        <h1 className="display">Game not found</h1>
        <button className="btn" onClick={() => navigate('/library')}>
          Browse library
        </button>
      </div>
    );
  }
  const m = mod.manifest;
  const scores = history.filter((h) => h.gameId === id && h.mode === 'normal').slice(0, 20).reverse().map((h) => h.score);

  return (
    <div className="page detail">
      <button className="btn btn-ghost back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/library'))}>
        <IconBack width={18} height={18} /> Back
      </button>
      <div className="detail-grid">
        <div className="detail-hero">
          <PosterArt manifest={m} />
          <LivePreview module={mod} active />
        </div>
        <div className="detail-body">
          <h1 className="display detail-title">{m.title}</h1>
          <p className="detail-hook">{m.hook}</p>
          <div className="row wrap">
            <button className="btn btn-primary btn-lg" onClick={(e) => openGame(id, 'normal', e.currentTarget.closest('.detail')?.querySelector('.detail-hero'))}>
              <IconPlay width={20} height={20} /> Play
            </button>
            <button className="btn btn-lg" onClick={() => openGame(id, 'daily', null)}>
              <IconCalendar width={18} height={18} /> Daily seed
            </button>
            <button className={`icon-btn ${prog?.favorite ? 'is-fav' : ''}`} aria-pressed={!!prog?.favorite} aria-label="Favorite" onClick={() => toggleFav(id)}>
              <IconHeart filled={!!prog?.favorite} />
            </button>
          </div>
          {prog && prog.sessions > 0 && (
            <div className="detail-stats">
              {m.showScore !== false && (
                <div className="stat">
                  <span className="stat-v">{formatScore(prog.best)}</span>
                  <span className="stat-l">Personal best</span>
                </div>
              )}
              <div className="stat">
                <span className="stat-v">{prog.highestLevel}</span>
                <span className="stat-l">Highest level</span>
              </div>
              <div className="stat">
                <span className="stat-v">{prog.sessions}</span>
                <span className="stat-l">Sessions</span>
              </div>
              {scores.length > 1 && m.showScore !== false && (
                <div className="stat stat-wide">
                  <Sparkline values={scores} color={m.palette.accent} />
                  <span className="stat-l">Recent scores</span>
                </div>
              )}
            </div>
          )}
          <p className="sm-desc">{m.sessionLabel} · {m.energy} energy</p>
          <GameInfo m={m} />
        </div>
      </div>
    </div>
  );
}
