import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { GAMES } from '@/games/registry';
import { RINGS, ABILITY_RING, ABILITY_LABEL, type RingId } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { navigate } from '../router';
import { PosterArt, formatScore } from '../components/Common';
import { AbilityGlyph, Hero, d, useReveal } from '../components/Editorial';
import { IconHeart, IconPlay } from '../components/Icons';
import '@/styles/library.css';

type Energy = 'all' | 'calm' | 'focused' | 'active';
type Tag = 'none' | 'noTime' | 'silent' | 'favorites';

export default function Library() {
  const root = useRef<HTMLDivElement>(null);
  const [ring, setRing] = useState<RingId | 'all'>('all');
  const [energy, setEnergy] = useState<Energy>('all');
  const [tag, setTag] = useState<Tag>('none');
  const [query, setQuery] = useState('');
  const games = useProgress((s) => s.games);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter((g) => {
      const m = g.manifest;
      if (ring !== 'all' && ABILITY_RING[m.abilities.primary] !== ring) return false;
      if (energy !== 'all' && m.energy !== energy) return false;
      if (tag === 'noTime' && !m.accessibility.noTimePressure) return false;
      if (tag === 'silent' && !m.accessibility.visualOnlyPlayable) return false;
      if (tag === 'favorites' && !games[m.id]?.favorite) return false;
      if (q && !`${m.title} ${m.hook} ${ABILITY_LABEL[m.abilities.primary]}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ring, energy, tag, query, games]);

  useReveal(root, [list]);
  const filtered = ring !== 'all' || energy !== 'all' || tag !== 'none' || query.trim() !== '';

  return (
    <div className="ed-page" ref={root}>
      <Hero
        compact
        kicker="Library"
        title="Every little"
        accent="world."
        lead={`${GAMES.length} games across ${RINGS.length} families of focus, with more on the way.`}
        palette={['#6c5cff', '#6fe3ff', '#ff8fb1']}
      >
        <label className="lib-search">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input type="search" placeholder="Search games or abilities" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search games" />
        </label>
      </Hero>

      <section className="ab-section is-tight lib-filters">
        <div className="ed-pills" role="group" aria-label="Filter by ability">
          <button className="ed-pill" aria-pressed={ring === 'all'} onClick={() => setRing('all')}>
            All abilities
          </button>
          {RINGS.map((r) => (
            <button key={r.id} className="ed-pill" aria-pressed={ring === r.id} onClick={() => setRing(ring === r.id ? 'all' : r.id)}>
              <span className="chip-glyph" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }} aria-hidden>
                {r.glyph}
              </span>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ed-pills" role="group" aria-label="More filters">
          {(['all', 'calm', 'focused', 'active'] as Energy[]).map((e) => (
            <button key={e} className="ed-pill" aria-pressed={energy === e} onClick={() => setEnergy(e)}>
              {e === 'all' ? 'Any energy' : e[0].toUpperCase() + e.slice(1)}
            </button>
          ))}
          <span className="lib-sep" aria-hidden />
          {(
            [
              ['favorites', '♡ Favorites'],
              ['noTime', 'No time pressure'],
              ['silent', 'Playable without sound'],
            ] as Array<[Tag, string]>
          ).map(([t, l]) => (
            <button key={t} className="ed-pill" aria-pressed={tag === t} onClick={() => setTag(tag === t ? 'none' : t)}>
              {l}
            </button>
          ))}
        </div>
        <p className="lib-count" aria-live="polite">
          {filtered ? `${list.length} of ${GAMES.length} games` : `All ${GAMES.length} games`}
          {filtered && (
            <button
              className="linkish lib-clear"
              onClick={() => {
                setRing('all');
                setEnergy('all');
                setTag('none');
                setQuery('');
              }}
            >
              Clear filters
            </button>
          )}
        </p>
      </section>

      <section className="ab-section is-tight">
        {list.length > 0 ? (
          <ul className="lib2-grid">
            {list.map((g, i) => {
              const m = g.manifest;
              const p = games[m.id];
              const ringDef = RINGS.find((r) => r.id === ABILITY_RING[m.abilities.primary])!;
              return (
                <li key={m.id} data-reveal style={{ ...d(i % 4, 70), '--acc': m.palette.accent, '--acc2': m.palette.accent2 } as CSSProperties}>
                  <button className="lib2-tile" onClick={() => navigate(`/game/${m.id}`)} aria-label={`${m.title}. ${m.hook}`}>
                    <PosterArt manifest={m} className="lib2-poster" />
                    <span className="lib2-glow" aria-hidden />
                    <span className="lib2-scrim" aria-hidden />
                    <span className="lib2-top">
                      {!p?.sessions && <span className="lib2-new">New</span>}
                      {p?.favorite && (
                        <span className="lib2-fav" aria-label="Favorite">
                          <IconHeart filled width={15} height={15} />
                        </span>
                      )}
                    </span>
                    <span className="lib2-play" aria-hidden>
                      <IconPlay width={16} height={16} />
                    </span>
                    <span className="lib2-text">
                      <span className="lib2-chip">
                        <i style={{ background: ringDef.color }} aria-hidden>
                          {ringDef.glyph}
                        </i>
                        <span>{ABILITY_LABEL[m.abilities.primary]}</span>
                      </span>
                      <span className="lib2-title display">{m.title}</span>
                      <span className="lib2-hook">{m.hook}</span>
                      <span className="lib2-meta">
                        {m.sessionLabel}
                        {m.showScore !== false && p?.best ? <> · Best {formatScore(p.best)}</> : null}
                      </span>
                    </span>
                    <span className="lib2-ring" style={{ color: ringDef.color }} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="ed-card lib-empty" data-reveal>
            <AbilityGlyph id="attention" />
            <h3 className="display">Nothing matches, yet</h3>
            <p>Try another ability or clear the filters. More games are on the way.</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setRing('all');
                setEnergy('all');
                setTag('none');
                setQuery('');
              }}
            >
              Show all games
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
