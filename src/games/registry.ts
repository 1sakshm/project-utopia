import type { GameModule } from '@/sdk/types';
import { EDITORIAL_ORDER } from '@/platform/abilities';

// Manifests are eager (tiny); game code is lazy via module.load().
const mods = import.meta.glob<GameModule>('./*/index.ts', { eager: true, import: 'default' });

const all: GameModule[] = Object.values(mods).filter((m): m is GameModule => !!m?.manifest);

export const GAMES: GameModule[] = [...all].sort((a, b) => {
  const ia = EDITORIAL_ORDER.indexOf(a.manifest.id);
  const ib = EDITORIAL_ORDER.indexOf(b.manifest.id);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});

export const GAME_BY_ID: Record<string, GameModule> = Object.fromEntries(GAMES.map((g) => [g.manifest.id, g]));
