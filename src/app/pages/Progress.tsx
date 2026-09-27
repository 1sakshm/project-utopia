import { useMemo } from 'react';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { RINGS, ABILITY_RING, type RingId } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { useSettings } from '@/platform/settings';
import { navigate } from '../router';
import { formatScore } from '../components/Common';

export function Sparkline({ values, color, w = 120, h = 32 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="spark">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill={color} />
    </svg>
  );
}

function Ring({ value, color, size = 84 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.1)" strokeWidth="8" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, value)} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .8s cubic-bezier(.22,1,.36,1)' }}
      />
    </svg>
  );
}

export default function Progress() {
  const history = useProgress((s) => s.history);
  const games = useProgress((s) => s.games);
  const goal = useSettings((s) => s.weeklyGoalMin);

  const week = useMemo(() => {
    const since = Date.now() - 7 * 864e5;
    const perRing: Record<RingId, number> = { memory: 0, attention: 0, perception: 0, reasoning: 0, language: 0, control: 0, timing: 0, calm: 0 };
    let total = 0;
    let sessions = 0;
    const days = new Set<string>();
    for (const h of history) {
      if (h.t < since) continue;
      const mod = GAME_BY_ID[h.gameId];
      if (!mod) continue;
      const min = h.ms / 60000;
      perRing[ABILITY_RING[mod.manifest.abilities.primary]] += min;
      total += min;
      sessions++;
      days.add(new Date(h.t).toDateString());
    }
    return { perRing, total, sessions, days: days.size };
  }, [history]);

  const maxRing = Math.max(1, ...Object.values(week.perRing));
  const played = GAMES.filter((g) => games[g.manifest.id]?.sessions);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Your practice</h1>
        <p className="muted">Rings show practice minutes this week, not ability scores. Only you can see this.</p>
      </header>

      <section className="summary-row">
        <div className="stat">
          <span className="stat-v">{Math.round(week.total)}</span>
          <span className="stat-l">Minutes this week{goal ? ` · goal ${goal}` : ''}</span>
        </div>
        <div className="stat">
          <span className="stat-v">{week.sessions}</span>
          <span className="stat-l">Sessions this week</span>
        </div>
        <div className="stat">
          <span className="stat-v">{week.days}</span>
          <span className="stat-l">Days practiced this week</span>
        </div>
        <div className="stat">
          <span className="stat-v">
            {played.length}/{GAMES.length}
          </span>
          <span className="stat-l">Games tried</span>
        </div>
      </section>

      <section>
        <h2 className="section-title">Ability rings</h2>
        <div className="rings">
          {RINGS.map((r) => {
            const min = week.perRing[r.id];
            const v = goal ? min / (goal / 4) : min / maxRing;
            return (
              <div key={r.id} className="ring-cell" aria-label={`${r.label}: ${Math.round(min)} minutes this week`}>
                <div className="ring-wrap">
                  <Ring value={min > 0 ? v : 0} color={r.color} />
                  <span className="ring-min">{Math.round(min)}m</span>
                </div>
                <span className="ring-label">{r.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Personal bests</h2>
        {played.length === 0 ? (
          <div className="empty">
            <p>No sessions yet. Your bests and history will appear here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Discover games
            </button>
          </div>
        ) : (
          <ul className="bests">
            {played.map((g) => {
              const m = g.manifest;
              const p = games[m.id];
              const scores = history.filter((h) => h.gameId === m.id && h.mode === 'normal').slice(0, 12).reverse().map((h) => h.score);
              return (
                <li key={m.id}>
                  <button className="best-row" onClick={() => navigate(`/game/${m.id}`)}>
                    <span className="best-dot" style={{ background: m.palette.accent }} aria-hidden />
                    <span className="best-title">{m.title}</span>
                    <Sparkline values={scores} color={m.palette.accent} w={90} h={26} />
                    <span className="best-val">{m.showScore !== false ? formatScore(p.best) : `${p.sessions}×`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="section-title">Recent sessions</h2>
          <ul className="recent">
            {history.slice(0, 12).map((h) => {
              const m = GAME_BY_ID[h.gameId]?.manifest;
              if (!m) return null;
              return (
                <li key={h.id}>
                  <span>{m.title}</span>
                  <span className="muted">
                    {new Date(h.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {Math.max(1, Math.round(h.ms / 60000))} min
                    {h.mode === 'daily' ? ' · daily' : ''}
                  </span>
                  <span>{m.showScore !== false ? formatScore(h.score) : '—'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
