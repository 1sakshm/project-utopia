// Where the match server lives. Set VITE_VERSUS_URL (e.g. wss://utopia-versus.<you>.workers.dev) for production.
// In development it defaults to the local `wrangler dev` server on port 8787 (cd server && npm run dev).
import { GAMES } from '@/games/registry';

const env = (import.meta.env.VITE_VERSUS_URL as string | undefined)?.trim();

export const VERSUS_WS: string | null = env ? env.replace(/^http/, 'ws').replace(/\/+$/, '') : import.meta.env.DEV ? `ws://${location.hostname}:8787` : null;
export const VERSUS_HTTP: string | null = VERSUS_WS ? VERSUS_WS.replace(/^ws/, 'http') : null;
export const VERSUS_ENABLED = !!VERSUS_WS;

/** Games that work head-to-head: they keep score and don't need a microphone. */
export const VERSUS_POOL = GAMES.filter((g) => g.manifest.showScore !== false && !g.manifest.input.requiresAudio).map((g) => g.manifest.id);
/** Any scored game can be picked for a private room (voice games included). */
export const ROOM_POOL = GAMES.filter((g) => g.manifest.showScore !== false).map((g) => g.manifest.id);

export const randomPoolGame = () => VERSUS_POOL[Math.floor(Math.random() * VERSUS_POOL.length)];
