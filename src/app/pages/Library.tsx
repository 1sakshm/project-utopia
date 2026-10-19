import { useMemo, useState } from 'react';
import { Heart, Search, X } from 'lucide-react';
import { GAMES } from '@/games/registry';
import { RINGS, ABILITY_RING, type RingId } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { GameTile } from '../components/GameTile';
import { AdSlot } from '../components/AdSlot';

type Tag = 'favorites' | 'calm' | 'noTime' | 'silent' | 'new';
const TAGS: Array<[Tag, string]> = [
  ['favorites', 'Saved'],
  ['new', 'Not played'],
  ['calm', 'Calm'],
  ['noTime', 'No time pressure'],
  ['silent', 'No sound needed'],
];

export default function Library() {
  const [ring, setRing] = useState<RingId | 'all'>('all');
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');
  const games = useProgress((s) => s.games);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter((g) => {
      const m = g.manifest;
      const p = games[m.id];
      if (ring !== 'all' && ABILITY_RING[m.abilities.primary] !== ring) return false;
      if (tags.includes('favorites') && !p?.favorite) return false;
      if (tags.includes('new') && p?.sessions) return false;
      if (tags.includes('calm') && m.energy !== 'calm') return false;
      if (tags.includes('noTime') && !m.accessibility.noTimePressure) return false;
      if (tags.includes('silent') && !m.accessibility.visualOnlyPlayable) return false;
      if (q && !`${m.title} ${m.hook} ${m.abilities.primary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ring, tags, query, games]);

  const toggle = (t: Tag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const clear = () => {
    setRing('all');
    setTags([]);
    setQuery('');
  };

  return (
    <div className="page is-wide">
      <div className="topbar">
        <h1>
          Games<span className="sub">{list.length === GAMES.length ? GAMES.length : `${list.length} of ${GAMES.length}`}</span>
        </h1>
      </div>

      <label className="field" style={{ marginBottom: 12 }}>
        <Search size={17} aria-hidden />
        <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search games" />
        {query && (
          <button className="text-link" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </label>

      <div className="pills" role="group" aria-label="Ability" style={{ marginBottom: 8 }}>
        <button className="pill" aria-pressed={ring === 'all'} onClick={() => setRing('all')}>
          All
        </button>
        {RINGS.map((r) => (
          <button key={r.id} className="pill" aria-pressed={ring === r.id} onClick={() => setRing(ring === r.id ? 'all' : r.id)}>
            {r.label.split(' ')[0]}
          </button>
        ))}
      </div>
      <div className="pills" role="group" aria-label="Filters" style={{ marginBottom: 20 }}>
        {TAGS.map(([t, l]) => (
          <button key={t} className="pill" aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>
            {t === 'favorites' && <Heart size={13} />}
            {l}
          </button>
        ))}
      </div>

      {list.length > 0 ? (
        <ul className="tiles">
          {list.map((g) => (
            <li key={g.manifest.id}>
              <GameTile m={g.manifest} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <h3>No games match</h3>
          <p>Try a different filter.</p>
          <button className="btn" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
      <AdSlot slot="games" />
    </div>
  );
}
