import { useMemo } from 'react';
import { Play, X } from 'lucide-react';
import { GAME_BY_ID } from '@/games/registry';
import { useProgress } from '@/platform/progress';
import { familyIsAdaptive, gainText, growthByFamily } from '@/platform/growth';
import { STARTER_MINUTES, starterStatus, useStarter } from '@/platform/starter';
import { track } from '@/platform/analytics';
import { openGame } from '../pages/Feed';
import { Sparkline } from './Sparkline';

/** Level trend per ability family: the staircase level is the player's threshold on each game, so it is real progress. */
export function GrowthSection() {
  const history = useProgress((s) => s.history);
  const rows = useMemo(() => growthByFamily(history), [history]);
  const any = rows.some((r) => r.gain !== null);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Growth</h2>
        <span className="fine">Level change per game</span>
      </div>
      {!any ? (
        <div className="panel empty">
          <p>Play any game twice and you’ll see how your level moves here. Levels go up when you’re getting better at that game.</p>
        </div>
      ) : (
        <ul className="list growth-list">
          {rows.map((r) => {
            const adaptive = familyIsAdaptive(r.ring.id);
            const g = r.monthGain ?? r.gain;
            const label = !adaptive
              ? `${r.sessions} session${r.sessions === 1 ? '' : 's'}`
              : g === null
                ? r.sessions
                  ? 'Play again to see a trend'
                  : 'Not played yet'
                : `${gainText(g)}${r.monthGain !== null ? ' this month' : ''}`;
            const tone = g !== null && adaptive ? (g >= 0.1 ? 'is-up' : g <= -0.1 ? 'is-down' : '') : 'is-dim';
            return (
              <li key={r.ring.id} className="item" aria-label={`${r.ring.label}: ${label}${r.games ? `, across ${r.games} game${r.games === 1 ? '' : 's'}` : ''}`}>
                <span className="ab-dot" style={{ background: r.ring.color }} aria-hidden />
                <span className="item-body">
                  <span className="item-title">{r.ring.label}</span>
                  <span className={`item-sub growth-gain ${tone}`}>
                    {label}
                    {r.games > 0 && adaptive && <span className="dim"> · {r.games} game{r.games === 1 ? '' : 's'}</span>}
                  </span>
                </span>
                {adaptive && r.series.length >= 2 && (
                  <span className="item-end growth-spark" style={{ color: r.ring.color }}>
                    <Sparkline values={r.series} w={84} h={26} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Starter check card: shown until it's finished or dismissed. */
export function StarterCard({ compact = false }: { compact?: boolean }) {
  const games = useProgress((s) => s.games);
  const active = useStarter((s) => s.active);
  const dismissed = useStarter((s) => s.dismissed);
  const st = starterStatus(games);
  if (st.complete || (dismissed && !active)) return null;
  const next = st.next ? GAME_BY_ID[st.next].manifest : null;
  const go = () => {
    if (!st.next) return;
    if (!active) track({ name: 'starter_start' });
    useStarter.getState().start();
    openGame(st.next, 'normal', null);
  };
  return (
    <section className="section">
      <div className="panel starter-card">
        <button className="icon-btn starter-x" aria-label="Hide starter check" onClick={() => useStarter.getState().dismiss()}>
          <X size={16} />
        </button>
        <p className="eyebrow">Starter check</p>
        <h3>{st.count === 0 ? 'Find your level in each family' : `${st.count} of ${st.ids.length} done`}</h3>
        {!compact && (
          <p className="muted">
            {st.ids.length} short games, one per ability family, about {STARTER_MINUTES} minutes in all. Stop whenever you like and pick it up later. Each game then starts at your level.
          </p>
        )}
        <span className="results-trio-dots" aria-hidden>
          {st.done.map((d, i) => (
            <i key={i} className={d ? 'on' : ''} />
          ))}
        </span>
        <button className="btn btn-primary btn-block" onClick={go}>
          <Play size={16} fill="currentColor" /> {st.count === 0 ? 'Start' : 'Continue'}
          {next ? `: ${next.title}` : ''}
        </button>
      </div>
    </section>
  );
}
