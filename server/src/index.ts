// Utopia Versus worker: routes HTTP + WebSocket traffic to two Durable Objects.
//   GET  /lobby            WebSocket: presence, live matches, matchmaking, leaderboard   (Lobby, one global instance)
//   GET  /match/:code      WebSocket: one room (1v1 duel or party of up to 8)           (Match, one per room code)
//   POST /rooms            Create a private duel / party room → { code }
//   GET  /ghost/:gameId    A recorded run to race against when nobody is online
//   GET  /leaders          Top ratings
//   …plus the social/admin API in api.ts (profiles, @handles, friends, challenges)
import { Lobby } from './lobby';
import { Match } from './match';
import { isRoomCode, PARTY_MAX, type RoomKind } from '../../src/platform/versus/protocol';
import { lobbyOf, matchOf, PID_RE, type Env } from './util';
import { handleApi } from './api';
import { authenticate } from './db';

export { Lobby, Match };

function originAllowed(env: Env, origin: string | null): boolean {
  const list = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  if (list.includes('*')) return true;
  return !!origin && list.includes(origin);
}

function corsHeaders(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': originAllowed(env, origin) && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Player-Id, X-Player-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (env: Env, req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(env, req) } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    if (!originAllowed(env, req.headers.get('Origin')) && req.headers.get('Origin')) return new Response('Forbidden origin', { status: 403 });

    const path = url.pathname.replace(/\/+$/, '') || '/';
    const isWs = req.headers.get('Upgrade')?.toLowerCase() === 'websocket';

    if (path === '/health' || path === '/') return json(env, req, { ok: true, service: 'utopia-versus' });

    if (path === '/lobby') {
      if (!isWs) return new Response('Expected WebSocket', { status: 426 });
      return lobbyOf(env).fetch(req);
    }

    const m = path.match(/^\/match\/([A-Z0-9]+)$/);
    if (m) {
      if (!isWs) return new Response('Expected WebSocket', { status: 426 });
      if (!isRoomCode(m[1])) return new Response('Bad room code', { status: 400 });
      return matchOf(env, m[1]).fetch(req);
    }

    if (path === '/rooms' && req.method === 'POST') {
      let body: { kind?: RoomKind; pid?: string; gameId?: string | null; public?: boolean };
      try {
        body = await req.json();
      } catch {
        return json(env, req, { error: 'Bad JSON' }, 400);
      }
      const kind: RoomKind = body.kind === 'party' ? 'party' : 'duel';
      if (!body.pid || !PID_RE.test(body.pid)) return json(env, req, { error: 'Bad player id' }, 400);
      if (!(await authenticate(env, body.pid, req.headers.get('X-Player-Key') ?? ''))) return json(env, req, { error: 'Not signed in' }, 401);
      const gameId = typeof body.gameId === 'string' && /^[a-z0-9-]{2,40}$/.test(body.gameId) ? body.gameId : null;
      const code = await lobbyOf(env).newCode();
      await matchOf(env, code).init({
        code,
        kind,
        ranked: false,
        public: kind === 'party' && !!body.public,
        host: body.pid,
        gameId,
        max: kind === 'duel' ? 2 : PARTY_MAX,
        expect: null,
      });
      return json(env, req, { code });
    }

    const g = path.match(/^\/ghost\/([a-z0-9-]{2,40})$/);
    if (g && req.method === 'GET') return json(env, req, { ghost: await lobbyOf(env).ghost(g[1]) });

    if (path === '/admin/reset' && req.method === 'POST') {
      const auth = req.headers.get('Authorization') ?? '';
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json(env, req, { error: 'Unauthorized' }, 401);
      const body = (await req.json().catch(() => ({}))) as { what?: string[] };
      const what = (body.what ?? ['ratings', 'ghosts', 'matches']).filter((w): w is 'ratings' | 'ghosts' | 'matches' => ['ratings', 'ghosts', 'matches'].includes(w));
      return json(env, req, await lobbyOf(env).adminReset(what));
    }

    if (path === '/leaders' && req.method === 'GET') return json(env, req, { leaders: await lobbyOf(env).leaders() });

    const api = await handleApi(req, env, path, url, (data, status) => json(env, req, data, status));
    if (api) return api;

    return json(env, req, { error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
