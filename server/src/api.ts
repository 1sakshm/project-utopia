// Social + admin HTTP API. Players authenticate with two headers:
//   X-Player-Id:  their public device id
//   X-Player-Key: the secret key created on their device (only its SHA-256 is stored)
//
//   POST   /me/register              {name, skin?}           create or verify → {me}
//   GET    /me                                                → {me, recent}
//   PATCH  /me                       {name?, handle?, skin?}  → {me}
//   GET    /handle/:handle                                    → {available, reason?}
//   GET    /u/:handle                                         → {profile, recent, relation}
//   GET    /search?q=                                         → {results}
//   GET    /me/friends                                        → {friends, incoming, outgoing, invites}
//   POST   /me/friends               {handle}                 send / accept → {status}
//   DELETE /me/friends/:handle                                remove / decline / cancel
//   POST   /me/challenge             {handle, gameId?}        private duel + invite → {code}
//   POST   /me/invites/:id           {action: accept|decline}
//   GET    /admin/players?q=&offset=  (Bearer ADMIN_TOKEN)    → {total, players}
//   GET    /admin/stats              (Bearer ADMIN_TOKEN)
//
// Accounts (a password and/or Google on top of the device identity):
//   POST   /auth/register            {password, handle?}       guest -> account (keeps progress) -> {me, account}
//   POST   /auth/login               {handle, password}        -> {pid, key, me, account}   (new device key)
//   POST   /auth/google              {credential, mode}        mode 'login' -> {pid, key, ...}; 'link' -> {account}
//   POST   /auth/google/unlink                                 (needs a password first)
//   POST   /auth/password            {current?, next}          change; no current needed right after a Google login
//   POST   /auth/logout                                        forget this device's key
//   GET    /me/save                                            -> {save: {data, version, updatedAt} | null}
//   PUT    /me/save                  {data, baseVersion}       -> {version} | 409 {save}
import { checkHandle } from '../../src/platform/versus/handles';
import { lobbyOf, matchOf, PID_RE, type Env } from './util';
import * as db from './db';
import { checkPassword, hashPassword, randomKey, verifyGoogleToken, verifyPassword } from './auth';

type Json = (data: unknown, status?: number) => Response;

const GAME_RE = /^[a-z0-9-]{2,40}$/;

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

async function me(env: Env, req: Request): Promise<db.AuthedPlayer | null> {
  const pid = req.headers.get('X-Player-Id') ?? '';
  const key = req.headers.get('X-Player-Key') ?? '';
  if (!PID_RE.test(pid)) return null;
  return db.authenticate(env, pid, key);
}

export async function handleApi(req: Request, env: Env, path: string, url: URL, json: Json): Promise<Response | null> {
  const method = req.method;

  // ---------- public ----------
  if (path === '/me/register' && method === 'POST') {
    const pid = req.headers.get('X-Player-Id') ?? '';
    const key = req.headers.get('X-Player-Key') ?? '';
    if (!PID_RE.test(pid) || !db.KEY_RE.test(key)) return json({ error: 'Bad credentials' }, 400);
    const b = await body<{ name?: string; skin?: string }>(req);
    const res = await db.register(env, { pid, key, name: b.name ?? '', skin: b.skin });
    if ('error' in res) return json({ error: res.error }, 409);
    return json({ me: db.toProfile(res.row), account: db.accountOf(res.row) });
  }

  let m = path.match(/^\/handle\/@?([^/]+)$/);
  if (m && method === 'GET') {
    const h = decodeURIComponent(m[1]);
    const bad = checkHandle(h);
    if (bad) return json({ available: false, reason: bad });
    const row = await db.byHandle(env, h);
    const asker = req.headers.get('X-Player-Id');
    return json({ available: !row || row.id === asker, reason: row && row.id !== asker ? `@${h} is taken.` : undefined });
  }

  m = path.match(/^\/u\/@?([^/]+)$/);
  if (m && method === 'GET') {
    const row = await db.byHandle(env, decodeURIComponent(m[1]));
    if (!row) return json({ error: 'No player with that handle.' }, 404);
    const viewer = await me(env, req);
    let relation: string | null = null;
    if (viewer && viewer.id !== row.id) {
      const r = await db.relation(env, viewer.id, row.id);
      relation = !r ? null : r.status === 'accepted' ? 'friends' : r.requested_by === viewer.id ? 'requested' : 'incoming';
    } else if (viewer) relation = 'self';
    const online = (await lobbyOf(env).onlineOf([row.id])).length > 0;
    return json({ profile: db.toProfile(row), online, recent: await db.recentMatches(env, row.id, 8), relation });
  }

  // ---------- admin ----------
  if (path.startsWith('/admin/') && path !== '/admin/reset') {
    const auth = req.headers.get('Authorization') ?? '';
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'Unauthorized' }, 401);
    if (path === '/admin/players' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().replace(/^@/, '').slice(0, 30);
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const sort = url.searchParams.get('sort') === 'rating' ? 'rating DESC' : url.searchParams.get('sort') === 'new' ? 'created_at DESC' : 'last_seen DESC';
      const where = q ? "WHERE handle LIKE ?1 ESCAPE '!' COLLATE NOCASE OR name LIKE ?1 ESCAPE '!' COLLATE NOCASE" : '';
      const binds = q ? [`%${db.escapeLike(q)}%`] : [];
      const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM players ${where}`).bind(...binds).first<{ n: number }>();
      const { results } = await env.DB.prepare(`SELECT * FROM players ${where} ORDER BY ${sort} LIMIT 50 OFFSET ${offset}`).bind(...binds).all<db.PlayerRow>();
      const online = new Set(await lobbyOf(env).onlineOf(results.map((r) => r.id)));
      const friendCounts = new Map<string, number>();
      if (results.length) {
        const ids = results.map((r) => r.id);
        const marks = ids.map(() => '?').join(',');
        const fc = await env.DB.prepare(
          `SELECT id, COUNT(*) AS n FROM (SELECT a AS id FROM friendships WHERE status='accepted' AND a IN (${marks})
             UNION ALL SELECT b AS id FROM friendships WHERE status='accepted' AND b IN (${marks})) GROUP BY id`,
        )
          .bind(...ids, ...ids)
          .all<{ id: string; n: number }>();
        for (const r of fc.results) friendCounts.set(r.id, r.n);
      }
      return json({
        total: total?.n ?? 0,
        players: results.map((r) => ({ ...db.toProfile(r), id: r.id, lastSeen: r.last_seen, online: online.has(r.id), friends: friendCounts.get(r.id) ?? 0 })),
      });
    }
    if (path === '/admin/stats' && method === 'GET') {
      const now = Date.now();
      const q = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<{ n: number }>().then((r) => r?.n ?? 0);
      const [players, active24h, active7d, friendships, matches24h, matches] = await Promise.all([
        q('SELECT COUNT(*) AS n FROM players'),
        q('SELECT COUNT(*) AS n FROM players WHERE last_seen > ?', now - 864e5),
        q('SELECT COUNT(*) AS n FROM players WHERE last_seen > ?', now - 7 * 864e5),
        q("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted'"),
        q('SELECT COUNT(*) AS n FROM matches WHERE finished_at > ?', now - 864e5),
        q('SELECT COUNT(*) AS n FROM matches'),
      ]);
      const onlineNow = (await lobbyOf(env).onlineCountRpc()) ?? 0;
      return json({ players, active24h, active7d, friendships, matches24h, matches, onlineNow });
    }
    return null;
  }

  // ---------- accounts: public ----------
  if (path === '/auth/login' && method === 'POST') {
    const b = await body<{ handle?: string; password?: string }>(req);
    const handle = String(b.handle ?? '').trim().replace(/^@/, '').slice(0, 30);
    if (!handle || typeof b.password !== 'string') return json({ error: 'Enter your ID and password.' }, 400);
    if (await db.loginLocked(env, handle)) return json({ error: 'Too many tries. Wait 15 minutes, or sign in with Google.' }, 429);
    const row = await db.byHandle(env, handle);
    // Same message and similar work whether or not the handle exists, so IDs can't be probed.
    const ok = row ? await verifyPassword(b.password, row.password_hash) : await verifyPassword(b.password, 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!row || !ok) {
      await db.noteLoginFailure(env, handle);
      return json({ error: 'Wrong ID or password.' }, 401);
    }
    await db.clearLoginFailures(env, handle);
    const key = randomKey();
    await db.issueKey(env, row.id, 'password', key);
    return json({ pid: row.id, key, me: db.toProfile(row), account: db.accountOf(row) });
  }

  if (path === '/auth/google' && method === 'POST') {
    const b = await body<{ credential?: string; mode?: string }>(req);
    const g = await verifyGoogleToken(env, b.credential);
    if ('error' in g) return json({ error: g.error }, env.GOOGLE_CLIENT_ID ? 401 : 501);
    const owner = await db.byGoogle(env, g.sub);
    if (b.mode === 'link') {
      const self = await me(env, req);
      if (!self) return json({ error: 'Not signed in' }, 401);
      if (owner && owner.id !== self.id) return json({ error: `That Google account is already linked to @${owner.handle}.` }, 409);
      await env.DB.prepare('UPDATE players SET google_sub = ?, email = ? WHERE id = ?').bind(g.sub, g.email, self.id).run();
      return json({ account: db.accountOf({ ...self, google_sub: g.sub, email: g.email }) });
    }
    if (!owner)
      return json({ error: 'No Utopia account is linked to this Google account yet. Create an account first, then connect Google.', notLinked: true }, 404);
    if (owner.email !== g.email) await env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(g.email, owner.id).run();
    const key = randomKey();
    await db.issueKey(env, owner.id, 'google', key);
    return json({ pid: owner.id, key, me: db.toProfile(owner), account: db.accountOf({ ...owner, email: g.email }) });
  }

  // ---------- signed-in ----------
  if (!path.startsWith('/me') && path !== '/search' && !path.startsWith('/auth/')) return null;
  const self = await me(env, req);
  if (!self) return json({ error: 'Not signed in' }, 401);

  if (path === '/auth/register' && method === 'POST') {
    if (self.password_hash) return json({ error: 'This player already has an account.' }, 409);
    const b = await body<{ password?: string; handle?: string }>(req);
    const bad = checkPassword(b.password);
    if (bad) return json({ error: bad }, 400);
    let row: db.PlayerRow = self;
    if (b.handle && String(b.handle).replace(/^@/, '').toLowerCase() !== self.handle.toLowerCase()) {
      const res = await db.updateMe(env, self, { handle: b.handle });
      if ('error' in res) return json({ error: res.error }, 400);
      row = res.row;
    }
    const hash = await hashPassword(b.password!);
    await env.DB.prepare('UPDATE players SET password_hash = ? WHERE id = ?').bind(hash, self.id).run();
    row = { ...row, password_hash: hash };
    return json({ me: db.toProfile(row), account: db.accountOf(row) });
  }

  if (path === '/auth/password' && method === 'POST') {
    const b = await body<{ current?: string; next?: string }>(req);
    const bad = checkPassword(b.next);
    if (bad) return json({ error: bad }, 400);
    // Forgot your password? Signing in with Google proves it's you: for 30 minutes after that, no current password needed.
    const viaGoogleJustNow = self._key.via === 'google' && Date.now() - self._key.created < 30 * 60_000;
    if (self.password_hash && !viaGoogleJustNow && !(await verifyPassword(String(b.current ?? ''), self.password_hash)))
      return json({ error: 'Your current password is wrong.' }, 401);
    const hash = await hashPassword(b.next!);
    await env.DB.prepare('UPDATE players SET password_hash = ? WHERE id = ?').bind(hash, self.id).run();
    // Sign out every other device that logged in with the old password.
    await env.DB.prepare("DELETE FROM player_keys WHERE player_id = ? AND key_hash != ? AND via = 'password'").bind(self.id, self._key.hash).run();
    return json({ account: db.accountOf({ ...self, password_hash: hash }) });
  }

  if (path === '/auth/google/unlink' && method === 'POST') {
    if (!self.password_hash) return json({ error: 'Set a password first, or you would have no way back in.' }, 400);
    await env.DB.prepare('UPDATE players SET google_sub = NULL, email = NULL WHERE id = ?').bind(self.id).run();
    return json({ account: db.accountOf({ ...self, google_sub: null, email: null }) });
  }

  if (path === '/auth/logout' && method === 'POST') {
    await db.deleteKey(env, self._key.hash);
    return json({ ok: true });
  }

  if (path === '/me/save' && method === 'GET') {
    const sv = await db.getSave(env, self.id);
    return json({ save: sv ? { data: JSON.parse(sv.data), version: sv.version, updatedAt: sv.updated_at } : null });
  }

  if (path === '/me/save' && method === 'PUT') {
    if (!self.password_hash && !self.google_sub) return json({ error: 'Create an account to save progress online.' }, 403);
    const text = await req.text();
    if (text.length > db.SAVE_MAX_BYTES) return json({ error: 'Save is too large.' }, 413);
    let b: { data?: unknown; baseVersion?: number };
    try {
      b = JSON.parse(text);
    } catch {
      return json({ error: 'Bad JSON' }, 400);
    }
    if (!b.data || typeof b.data !== 'object') return json({ error: 'Missing data' }, 400);
    const v = await db.putSave(env, self.id, JSON.stringify(b.data), Math.max(0, Math.floor(Number(b.baseVersion) || 0)));
    if (v === null) {
      const sv = await db.getSave(env, self.id);
      return json({ error: 'conflict', save: sv ? { data: JSON.parse(sv.data), version: sv.version, updatedAt: sv.updated_at } : null }, 409);
    }
    return json({ version: v });
  }

  if (path === '/me' && method === 'GET')
    return json({ me: db.toProfile(self), account: db.accountOf(self), recent: await db.recentMatches(env, self.id, 10) });

  if (path === '/me' && method === 'PATCH') {
    const res = await db.updateMe(env, self, await body(req));
    if ('error' in res) return json({ error: res.error }, 400);
    return json({ me: db.toProfile(res.row) });
  }

  if (path === '/search' && method === 'GET') return json({ results: await db.search(env, url.searchParams.get('q') ?? '', self.id) });

  if (path === '/me/friends' && method === 'GET') {
    const rows = await db.friendsOf(env, self.id);
    const online = new Set(await lobbyOf(env).onlineOf(rows.map((r) => r.id)));
    return json(await db.listFriends(env, self.id, online));
  }

  if (path === '/me/friends' && method === 'POST') {
    const { handle } = await body<{ handle?: string }>(req);
    const other = handle ? await db.byHandle(env, handle) : null;
    if (!other) return json({ error: 'No player with that handle.' }, 404);
    if (other.id === self.id) return json({ error: 'That’s you.' }, 400);
    const status = await db.addFriend(env, self.id, other.id);
    await lobbyOf(env).notify(other.id, { t: 'social' });
    return json({ status });
  }

  m = path.match(/^\/me\/friends\/@?([^/]+)$/);
  if (m && method === 'DELETE') {
    const other = await db.byHandle(env, decodeURIComponent(m[1]));
    if (!other) return json({ error: 'No player with that handle.' }, 404);
    await db.removeFriend(env, self.id, other.id);
    await lobbyOf(env).notify(other.id, { t: 'social' });
    return json({ ok: true });
  }

  if (path === '/me/challenge' && method === 'POST') {
    const b = await body<{ handle?: string; gameId?: string }>(req);
    const other = b.handle ? await db.byHandle(env, b.handle) : null;
    if (!other || other.id === self.id) return json({ error: 'No player with that handle.' }, 404);
    const rel = await db.relation(env, self.id, other.id);
    if (rel?.status !== 'accepted') return json({ error: 'You can only challenge friends.' }, 403);
    const gameId = b.gameId && GAME_RE.test(b.gameId) ? b.gameId : null;
    const lobby = lobbyOf(env);
    const code = await lobby.newCode();
    await matchOf(env, code).init({ code, kind: 'duel', ranked: false, public: false, host: self.id, gameId, max: 2, expect: [self.id, other.id] });
    const invite = await db.createInvite(env, self, other, code, gameId);
    const delivered = await lobby.notify(other.id, { t: 'invite', invite });
    return json({ code, delivered });
  }

  m = path.match(/^\/me\/invites\/([0-9a-f-]{36})$/);
  if (m && method === 'POST') {
    const { action } = await body<{ action?: string }>(req);
    await db.answerInvite(env, self.id, m[1], action === 'accept' ? 'accepted' : 'declined');
    return json({ ok: true });
  }

  return null;
}
