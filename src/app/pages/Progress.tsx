import { useMemo, useRef, type CSSProperties } from 'react';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { RINGS, ABILITY_RING, type RingId } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { useSettings } from '@/platform/settings';
import { navigate } from '../router';
import { formatScore } from '../components/Common';
import { AbilityGlyph, CountUp, Hero, SectionHead, d, useReveal } from '../components/Editorial';
import '@/styles/progress.css';

/** Sparkline that draws itself when its [data-reveal] ancestor becomes visible. */
export function Sparkline({ values, color, w = 120, h = 32 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 6) - 3] as const);
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="spark" style={{ '--sc': color } as CSSProperties}>
      <defs>
        <linearGradient id={`sg-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="spark-area" d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#sg-${color.slice(1)})`} />
      <path className="spark-line" d={path} pathLength={1} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="spark-dot" cx={lx} cy={ly} r="3.2" fill={color} />
    </svg>
  );
}

function Ring({ value, color, size = 96 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg className="pr-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ '--dash': `${c * v} ${c}`, '--rc': color } as CSSProperties}>
      <circle cx={size / 2} cy={size / 2} r={r} className="pr-ring-track" />
      {/* no arc at all when empty: a zero-length round-capped stroke still renders as a dot */}
      {v > 0.005 && <circle cx={size / 2} cy={size / 2} r={r} className="pr-ring-arc" transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
  );
}

const relTime = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export default function Progress() {
  const root = useRef<HTMLDivElement>(null);
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

  const played = GAMES.filter((g) => games[g.manifest.id]?.sessions);
  useReveal(root, [history.length]);
  const maxRing = Math.max(1, ...Object.values(week.perRing));
  const empty = history.length === 0;

  return (
    <div className="ed-page" ref={root}>
      <Hero
        compact
        kicker="Progress"
        title="Your"
        accent="practice."
        lead="Only you can see this. Rings show minutes practiced this week, never scores or rankings."
        palette={['#8dffb0', '#6fe3ff', '#b99cff']}
      >
        <div className="ab-stats">
          <div className="ab-stat">
            <span className="display">
              <CountUp value={Math.round(week.total)} />
            </span>
            <small>minutes this week{goal ? ` · goal ${goal}` : ''}</small>
          </div>
          <div className="ab-stat">
            <span className="display">
              <CountUp value={week.sessions} />
            </span>
            <small>sessions</small>
          </div>
          <div className="ab-stat">
            <span className="display">
              <CountUp value={week.days} />
            </span>
            <small>days practiced</small>
          </div>
          <div className="ab-stat">
            <span className="display">
              <CountUp value={played.length} />
              <em className="pr-of">/{GAMES.length}</em>
            </span>
            <small>games tried</small>
          </div>
        </div>
      </Hero>

      {goal > 0 && (
        <section className="ab-section is-tight">
          <div className="ed-card pr-goal" data-reveal>
            <div className="pr-goal-text">
              <p className="ab-eyebrow">Weekly goal</p>
              <p className="pr-goal-big display">
                {Math.min(100, Math.round((week.total / goal) * 100))}%<small> of {goal} min</small>
              </p>
            </div>
            <div className="pr-goal-bar" aria-hidden>
              <i style={{ '--w': `${Math.min(100, (week.total / goal) * 100)}%` } as CSSProperties} />
            </div>
          </div>
        </section>
      )}

      <section className="ab-section">
        <SectionHead index={1} eyebrow="This week" title="Ability rings" sub="Each ring fills with the minutes you’ve spent in that family of games over the last seven days." />
        <div className="pr-rings">
          {RINGS.map((r, i) => {
            const min = week.perRing[r.id];
            const v = min <= 0 ? 0 : goal ? min / (goal / 4) : min / maxRing;
            return (
              <div key={r.id} className="ed-card pr-ring-card" data-reveal style={{ ...d(i % 4, 80), '--c': r.color } as CSSProperties} aria-label={`${r.label}: ${Math.round(min)} minutes this week`}>
                <div className="pr-ring-wrap">
                  <Ring value={v} color={r.color} />
                  <AbilityGlyph id={r.id} className="pr-ring-glyph" />
                </div>
                <span className="pr-ring-min display">
                  {Math.round(min)}
                  <small>min</small>
                </span>
                <span className="pr-ring-label">{r.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ab-section">
        <SectionHead index={2} eyebrow="All time" title="Personal bests" />
        {played.length === 0 ? (
          <div className="ed-card pr-empty" data-reveal>
            <AbilityGlyph id="calm" />
            <h3 className="display">Your story starts here</h3>
            <p>Play a game and your bests, sparklines and history will bloom on this page.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Discover games
            </button>
          </div>
        ) : (
          <ul className="pr-bests">
            {played.map((g, i) => {
              const m = g.manifest;
              const p = games[m.id];
              const scores = history.filter((h) => h.gameId === m.id && h.mode === 'normal').slice(0, 12).reverse().map((h) => h.score);
              const ring = RINGS.find((r) => r.id === ABILITY_RING[m.abilities.primary])!;
              return (
                <li key={m.id} data-reveal style={{ ...d(i % 3, 70), '--acc': m.palette.accent } as CSSProperties}>
                  <button className="pr-best" onClick={() => navigate(`/game/${m.id}`)}>
                    <span className="pr-best-glyph" style={{ '--c': ring.color } as CSSProperties}>
                      <AbilityGlyph id={ring.id} />
                    </span>
                    <span className="pr-best-name">
                      <b>{m.title}</b>
                      <small>
                        {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'} · level {p.highestLevel}
                      </small>
                    </span>
                    <Sparkline values={scores} color={m.palette.accent} w={96} h={30} />
                    <span className="pr-best-val display">{m.showScore !== false ? formatScore(p.best) : `${p.sessions}×`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!empty && (
        <section className="ab-section">
          <SectionHead index={3} eyebrow="Lately" title="Recent sessions" />
          <ol className="pr-timeline">
            {history.slice(0, 10).map((h, i) => {
              const m = GAME_BY_ID[h.gameId]?.manifest;
              if (!m) return null;
              return (
                <li key={h.id} data-reveal style={{ ...d(i % 5, 60), '--acc': m.palette.accent } as CSSProperties}>
                  <span className="pr-tl-dot" aria-hidden />
                  <div className="pr-tl-body">
                    <b>{m.title}</b>
                    <small>
                      {relTime(h.t)} · {Math.max(1, Math.round(h.ms / 60000))} min{h.mode === 'daily' ? ' · daily seed' : ''}
                    </small>
                  </div>
                  <span className="pr-tl-score display">{m.showScore !== false ? formatScore(h.score) : '·'}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
