import type { GameModule } from './types';

/** Identity helper for type inference in games/<id>/index.ts */
export const defineGame = (m: GameModule): GameModule => m;
