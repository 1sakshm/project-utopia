import { useMemo, useState } from 'react';
import { GAMES } from '@/games/registry';
import { RINGS, ABILITY_RING, type RingId } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { navigate } from '../router';
import { AbilityChip, PosterArt, formatScore } from '../components/Common';
import { IconHeart } from '../components/Icons';

type Energy = 'all' | 'calm' | 'focused' | 'active';
type Tag = 'none' | 'noTime' | 'silent' | 'favorites';

export default function Library() {
  const [ring, setRing] = useState<RingId | 'all'>('all');
  const [energy, setEnergy] = useState<Energy>('all');
  const [tag, setTag] = useState<Tag>('none');
  const games = useProgress((s) => s.games);

  const list = useMemo(
    () =>
      GAMES.filter((g) => {
        const m = g.manifest;
        if (ring !== 'all' && ABILITY_RING[m.abilities.primary] !== ring) return false;
        if (energy !== 'all' && m.energy !== energy) return false;
        if (tag === 'noTime' && !m.accessibility.noTimePressure) return false;
        if (tag === 'silent' && !m.accessibility.visualOnlyPlayable) return false;
        if (tag === 'favorites' && !games[m.id]?.favorite) return false;
        return true;
      }),
    [ring, energy, tag, games],
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Library</h1>
        <p className="muted">{GAMES.length} games, each designed around a different ability.</p>
      </header>
      <div className="filters" role="group" aria-label="Filter by ability">
        <button className="filter" aria-pressed={ring === 'all'} onClick={() => setRing('all')}>
          All
        </button>
        {RINGS.map((r) => (
          <button key={r.id} className="filter" aria-pressed={ring === r.id} onClick={() => setRing(r.id)}>
            <span className="chip-glyph" style={{ background: r.color }} aria-hidden>
              {r.glyph}
            </span>
            {r.label}
          </button>
        ))}
      </div>
      <div className="filters" role="group" aria-label="More filters">
        {(['all', 'calm', 'focused', 'active'] as Energy[]).map((e) => (
          <button key={e} className="filter" aria-pressed={energy === e} onClick={() => setEnergy(e)}>
            {e === 'all' ? 'Any energy' : e[0].toUpperCase() + e.slice(1)}
          </button>
        ))}
        <span className="filter-sep" aria-hidden />
        {(
          [
            ['favorites', 'Favorites'],
            ['noTime', 'No time pressure'],
            ['silent', 'Playable without sound'],
          ] as Array<[Tag, string]>
        ).map(([t, l]) => (
          <button key={t} className="filter" aria-pressed={tag === t} onClick={() => setTag(tag === t ? 'none' : t)}>
            {l}
          </button>
        ))}
      </div>
      <ul className="lib-grid">
        {list.map((g) => {
          const m = g.manifest;
          const p = games[m.id];
          return (
            <li key={m.id}>
              <button className="lib-tile" onClick={() => navigate(`/game/${m.id}`)} aria-label={`${m.title}. ${m.hook}`}>
                <PosterArt manifest={m} className="lib-poster" />
                <span className="lib-scrim" aria-hidden />
                {p?.favorite && (
                  <span className="lib-fav" aria-label="Favorite">
                    <IconHeart filled width={16} height={16} />
                  </span>
                )}
                <span className="lib-text">
                  <AbilityChip ability={m.abilities.primary} />
                  <span className="lib-title display">{m.title}</span>
                  <span className="lib-sub">
                    {m.sessionLabel}
                    {m.showScore !== false && p?.best ? ` · Best ${formatScore(p.best)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="muted center">No games match these filters.</p>}
    </div>
  );
}
