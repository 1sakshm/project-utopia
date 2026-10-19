import { Heart } from 'lucide-react';
import type { GameManifest } from '@/sdk/types';
import { ringOf } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { navigate } from '../router';
import { PosterArt, formatScore } from './Common';
import { AbilityIcon } from './Editorial';

/** Poster tile used in the Games grid and Home rails. */
export function GameTile({ m, onClick }: { m: GameManifest; onClick?: () => void }) {
  const p = useProgress((s) => s.games[m.id]);
  const ring = ringOf(m.abilities.primary);
  return (
    <button className="tile" onClick={onClick ?? (() => navigate(`/game/${m.id}`))} aria-label={`${m.title}. ${m.hook}`}>
      <span className="tile-art">
        <PosterArt manifest={m} />
        {!p?.sessions && <span className="tile-badge">New</span>}
        {p?.favorite && (
          <span className="tile-fav" aria-label="Saved">
            <Heart size={15} fill="currentColor" />
          </span>
        )}
      </span>
      <span className="tile-title">{m.title}</span>
      <span className="tile-sub">
        <AbilityIcon id={ring.id} color={ring.color} size={14} />
        {m.showScore !== false && p?.best ? `Best ${formatScore(p.best)}` : m.sessionLabel}
      </span>
    </button>
  );
}
