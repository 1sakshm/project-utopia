/** Same rules as the app's cleanName (src/platform/profile.ts): no control chars, collapsed spaces, ≤ 20 chars. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

import type { Lobby } from './lobby';
import type { Match } from './match';

export interface Env {
  LOBBY: DurableObjectNamespace<Lobby>;
  MATCH: DurableObjectNamespace<Match>;
  ALLOWED_ORIGINS: string;
}

export const PID_RE = /^[a-z0-9]{8,32}$/i;
export const lobbyOf = (env: Env) => env.LOBBY.get(env.LOBBY.idFromName('global'));
export const matchOf = (env: Env, code: string) => env.MATCH.get(env.MATCH.idFromName(code));
