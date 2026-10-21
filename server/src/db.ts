// D1 access: players (with @handles), friendships, challenges, match history and ratings.
import { elo, START_RATING, type FriendView, type InviteView, type PublicProfile, type Record_ } from '../../src/platform/versus/protocol';
import { checkHandle, slugHandle } from '../../src/platform/versus/handles';
import { cleanName, type Env } from './util';

export interface PlayerRow {
  id: string;
  key_hash: string;
  handle: string;
  name: string;
  skin: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  created_at: number;
  last_seen: number;
  handle_changed_at: number | null;
  password_hash: string | null;
  google_sub: string | null;
  email: string | null;
}

/** A signed-in request: the player plus how this device's key was issued. */
export type AuthedPlayer = PlayerRow & { _key: { hash: string; via: string; created: number } };

/** Private account facts, shown only to the owner. */
export const accountOf = (r: PlayerRow) => ({ hasPassword: !!r.password_hash, google: r.google_sub ? r.email ?? 'linked' : null });

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const KEY_RE = /^[a-z0-9]{32,64}$/i;
export const SKIN_RE = /^skin-[a-z0-9-]{2,30}$/;

export const toProfile = (r: PlayerRow): PublicProfile => ({
  handle: r.handle,
  name: r.name,
  skin: r.skin,
  rating: r.rating,
  wins: r.wins,
  losses: r.losses,
  draws: r.draws,
  matches: r.matches,
  createdAt: r.created_at,
});

export const recordOf = (r: PlayerRow | null): Record_ =>
  r ? { rating: r.rating, w: r.wins, l: r.losses, d: r.draws } : { rating: START_RATING, w: 0, l: 0, d: 0 };

export function getPlayer(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<PlayerRow>();
}

export function byHandle(env: Env, handle: string) {
  return env.DB.prepare('SELECT * FROM players WHERE handle = ? COLLATE NOCASE').bind(handle.replace(/^@/, '')).first<PlayerRow>();
}

/** The player behind (pid, key), or null if the key doesn't match. */
export async function authenticate(env: Env, pid: string, key: string): Promise<AuthedPlayer | null> {
  if (!pid || !key || !KEY_RE.test(key)) return null;
  const hash = await sha256(key);
  const k = await env.DB.prepare('SELECT via, created_at, last_used FROM player_keys WHERE key_hash = ? AND player_id = ?')
    .bind(hash, pid)
    .first<{ via: string; created_at: number; last_used: number | null }>();
  if (!k) return null;
  const row = await getPlayer(env, pid);
  if (!row) return null;
  const now = Date.now();
  if (!k.last_used || now - k.last_used > 3600_000) await env.DB.prepare('UPDATE player_keys SET last_used = ? WHERE key_hash = ?').bind(now, hash).run();
  return { ...row, _key: { hash, via: k.via, created: k.created_at } };
}

/** Give a device its own key for a player (login). Returns the plain key — the only time it exists. */
export async function issueKey(env: Env, playerId: string, via: 'password' | 'google', key: string) {
  await env.DB.prepare('INSERT INTO player_keys (key_hash, player_id, via, created_at, last_used) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(key), playerId, via, Date.now(), Date.now())
    .run();
}

export async function deleteKey(env: Env, hash: string) {
  await env.DB.prepare('DELETE FROM player_keys WHERE key_hash = ?').bind(hash).run();
}

export function byGoogle(env: Env, sub: string) {
  return env.DB.prepare('SELECT * FROM players WHERE google_sub = ?').bind(sub).first<PlayerRow>();
}

// ---------- brute-force guard ----------
const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_LIMIT = 10;

export async function loginLocked(env: Env, handle: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT count, since FROM login_failures WHERE handle = ?').bind(handle).first<{ count: number; since: number }>();
  return !!r && r.count >= FAIL_LIMIT && Date.now() - r.since < FAIL_WINDOW_MS;
}

export async function noteLoginFailure(env: Env, handle: string) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO login_failures (handle, count, since) VALUES (?1, 1, ?2)
     ON CONFLICT (handle) DO UPDATE SET count = CASE WHEN ?2 - since > ${FAIL_WINDOW_MS} THEN 1 ELSE count + 1 END,
                                        since = CASE WHEN ?2 - since > ${FAIL_WINDOW_MS} THEN ?2 ELSE since END`,
  )
    .bind(handle, now)
    .run();
}

export async function clearLoginFailures(env: Env, handle: string) {
  await env.DB.prepare('DELETE FROM login_failures WHERE handle = ?').bind(handle).run();
}

// ---------- cloud saves ----------
export const SAVE_MAX_BYTES = 1_500_000;

export function getSave(env: Env, playerId: string) {
  return env.DB.prepare('SELECT data, version, updated_at FROM saves WHERE player_id = ?').bind(playerId).first<{ data: string; version: number; updated_at: number }>();
}

/** Write a save if the caller saw the latest version. Returns the new version, or null on a conflict. */
export async function putSave(env: Env, playerId: string, data: string, baseVersion: number): Promise<number | null> {
  const now = Date.now();
  if (baseVersion === 0) {
    const r = await env.DB.prepare('INSERT INTO saves (player_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (player_id) DO NOTHING').bind(playerId, data, now).run();
    return r.meta.changes ? 1 : null;
  }
  const r = await env.DB.prepare('UPDATE saves SET data = ?, version = version + 1, updated_at = ? WHERE player_id = ? AND version = ?').bind(data, now, playerId, baseVersion).run();
  return r.meta.changes ? baseVersion + 1 : null;
}

/** First visit creates the player (claiming the id with the key) and picks a free @handle. Later visits verify. */
export async function register(env: Env, o: { pid: string; key: string; name: string; skin?: string }): Promise<{ row: PlayerRow } | { error: string }> {
  const now = Date.now();
  const existing = await getPlayer(env, o.pid);
  const hash = await sha256(o.key);
  if (existing) {
    const k = await env.DB.prepare('SELECT 1 AS ok FROM player_keys WHERE key_hash = ? AND player_id = ?').bind(hash, o.pid).first();
    if (!k) return { error: 'This player id belongs to someone else.' };
    await env.DB.prepare('UPDATE players SET last_seen = ? WHERE id = ?').bind(now, o.pid).run();
    return { row: { ...existing, last_seen: now } };
  }
  const name = cleanName(o.name) || 'Player';
  const skin = o.skin && SKIN_RE.test(o.skin) ? o.skin : 'skin-aurora';
  const base = slugHandle(name);
  for (let i = 0; i < 12; i++) {
    const handle = i === 0 ? base : `${base.slice(0, 15)}${Math.floor(10 + Math.random() * (i < 6 ? 990 : 99990))}`;
    if (checkHandle(handle)) continue;
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO players (id, key_hash, handle, name, skin, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(o.pid, hash, handle, name, skin, now, now),
        env.DB.prepare("INSERT INTO player_keys (key_hash, player_id, via, created_at, last_used) VALUES (?, ?, 'device', ?, ?)").bind(hash, o.pid, now, now),
      ]);
      return { row: (await getPlayer(env, o.pid))! };
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e;
      // handle taken (or a racing registration of the same id): try again
      const again = await getPlayer(env, o.pid);
      if (again) {
        const k = await env.DB.prepare('SELECT 1 AS ok FROM player_keys WHERE key_hash = ? AND player_id = ?').bind(hash, o.pid).first();
        return k ? { row: again } : { error: 'This player id belongs to someone else.' };
      }
    }
  }
  return { error: 'Couldn’t pick a handle. Try again.' };
}

export async function updateMe(env: Env, me: PlayerRow, patch: { name?: unknown; handle?: unknown; skin?: unknown }): Promise<{ row: PlayerRow } | { error: string }> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) {
    const n = cleanName(patch.name);
    if (n.length < 2) return { error: 'Names need at least 2 characters.' };
    sets.push('name = ?');
    vals.push(n);
  }
  if (patch.skin !== undefined) {
    if (typeof patch.skin !== 'string' || !SKIN_RE.test(patch.skin)) return { error: 'Unknown skin.' };
    sets.push('skin = ?');
    vals.push(patch.skin);
  }
  if (patch.handle !== undefined) {
    const h = String(patch.handle).trim().replace(/^@/, '');
    const bad = checkHandle(h);
    if (bad) return { error: bad };
    if (h.toLowerCase() !== me.handle.toLowerCase()) {
      const taken = await byHandle(env, h);
      if (taken && taken.id !== me.id) return { error: `@${h} is taken.` };
    }
    sets.push('handle = ?', 'handle_changed_at = ?');
    vals.push(h, Date.now());
  }
  if (!sets.length) return { row: me };
  try {
    await env.DB.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, me.id).run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return { error: 'That handle was just taken.' };
    throw e;
  }
  return { row: (await getPlayer(env, me.id))! };
}

/** Escape LIKE wildcards so `_` and `%` in handles match literally (use with ESCAPE '!'). */
export const escapeLike = (s: string) => s.replace(/[!%_]/g, (c) => '!' + c);

export async function search(env: Env, q: string, excludeId: string): Promise<PublicProfile[]> {
  const term = q.trim().replace(/^@/, '').toLowerCase().slice(0, 30);
  if (term.length < 2) return [];
  const like = `${escapeLike(term)}%`;
  const { results } = await env.DB.prepare(
    `SELECT * FROM players WHERE id != ? AND (handle LIKE ? ESCAPE '!' COLLATE NOCASE OR name LIKE ? ESCAPE '!' COLLATE NOCASE)
     ORDER BY (handle = ? COLLATE NOCASE) DESC, last_seen DESC LIMIT 20`,
  )
    .bind(excludeId, like, like, term)
    .all<PlayerRow>();
  return results.map(toProfile);
}

// ---------- friends ----------
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

export async function relation(env: Env, me: string, other: string) {
  const [a, b] = pair(me, other);
  return env.DB.prepare('SELECT * FROM friendships WHERE a = ? AND b = ?').bind(a, b).first<{ status: string; requested_by: string }>();
}

/** Send a request; if they had already asked you, this accepts it. Returns the resulting status. */
export async function addFriend(env: Env, me: string, other: string): Promise<'pending' | 'accepted'> {
  const [a, b] = pair(me, other);
  const cur = await relation(env, me, other);
  const now = Date.now();
  if (!cur) {
    await env.DB.prepare('INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(a, b, 'pending', me, now).run();
    return 'pending';
  }
  if (cur.status === 'pending' && cur.requested_by !== me) {
    await env.DB.prepare("UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE a = ? AND b = ?").bind(now, a, b).run();
    return 'accepted';
  }
  return cur.status as 'pending' | 'accepted';
}

export async function removeFriend(env: Env, me: string, other: string) {
  const [a, b] = pair(me, other);
  await env.DB.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').bind(a, b).run();
}

export async function friendsOf(env: Env, me: string) {
  const { results } = await env.DB.prepare(
    `SELECT p.*, f.status AS f_status, f.requested_by AS f_by, f.created_at AS f_at
       FROM friendships f JOIN players p ON p.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
      WHERE f.a = ?1 OR f.b = ?1
      ORDER BY p.last_seen DESC`,
  )
    .bind(me)
    .all<PlayerRow & { f_status: string; f_by: string; f_at: number }>();
  return results;
}

export async function listFriends(env: Env, me: string, online: Set<string>) {
  const rows = await friendsOf(env, me);
  const view = (r: (typeof rows)[number]): FriendView => ({ ...toProfile(r), online: online.has(r.id), lastSeen: r.last_seen, since: r.f_at });
  const invites = await env.DB.prepare(
    `SELECT i.*, p.handle, p.name, p.skin FROM invites i JOIN players p ON p.id = i.from_id
      WHERE i.to_id = ? AND i.status = 'pending' AND i.created_at > ? ORDER BY i.created_at DESC LIMIT 20`,
  )
    .bind(me, Date.now() - INVITE_TTL_MS)
    .all<{ id: string; code: string; game_id: string | null; created_at: number; handle: string; name: string; skin: string }>();
  return {
    friends: rows.filter((r) => r.f_status === 'accepted').map(view),
    incoming: rows.filter((r) => r.f_status === 'pending' && r.f_by !== me).map(view),
    outgoing: rows.filter((r) => r.f_status === 'pending' && r.f_by === me).map(view),
    invites: invites.results.map(inviteView),
  };
}

export async function friendIds(env: Env, me: string): Promise<string[]> {
  const rows = await friendsOf(env, me);
  return rows.filter((r) => r.f_status === 'accepted').map((r) => r.id);
}

// ---------- challenges ----------
export const INVITE_TTL_MS = 10 * 60_000;

export const inviteView = (r: { id: string; code: string; game_id: string | null; created_at: number; handle: string; name: string; skin: string }): InviteView => ({
  id: r.id,
  code: r.code,
  gameId: r.game_id,
  createdAt: r.created_at,
  from: { handle: r.handle, name: r.name, skin: r.skin },
});

export async function createInvite(env: Env, from: PlayerRow, to: PlayerRow, code: string, gameId: string | null): Promise<InviteView> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO invites (id, from_id, to_id, code, game_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, from.id, to.id, code, gameId, now).run();
  return inviteView({ id, code, game_id: gameId, created_at: now, handle: from.handle, name: from.name, skin: from.skin });
}

export async function answerInvite(env: Env, me: string, id: string, status: 'accepted' | 'declined') {
  await env.DB.prepare("UPDATE invites SET status = ? WHERE id = ? AND to_id = ? AND status = 'pending'").bind(status, id, me).run();
}

// ---------- matches & ratings ----------
export interface FinishedPlayer {
  pid: string;
  score: number;
  place: number;
  forfeit: boolean;
}

/** Store a finished round; for ranked duels apply Elo. Returns rating deltas by pid. */
export async function recordMatch(
  env: Env,
  m: { code: string; gameId: string | null; kind: string; ranked: boolean; players: FinishedPlayer[] },
): Promise<Record<string, number>> {
  const deltas: Record<string, number> = {};
  const rows = new Map<string, PlayerRow>();
  for (const p of m.players) {
    const r = await getPlayer(env, p.pid);
    if (r) rows.set(p.pid, r);
  }
  const stmts: D1PreparedStatement[] = [];
  if (m.ranked && m.players.length === 2 && rows.size === 2) {
    const [a, b] = m.players;
    const ra = rows.get(a.pid)!;
    const rb = rows.get(b.pid)!;
    const outcome = a.place === b.place ? 0.5 : a.place < b.place ? 1 : 0;
    deltas[a.pid] = elo(ra.rating, rb.rating, outcome);
    deltas[b.pid] = elo(rb.rating, ra.rating, 1 - outcome);
    for (const [p, r, res] of [
      [a, ra, outcome],
      [b, rb, 1 - outcome],
    ] as const) {
      const col = res === 1 ? 'wins' : res === 0 ? 'losses' : 'draws';
      stmts.push(env.DB.prepare(`UPDATE players SET rating = MAX(100, rating + ?), ${col} = ${col} + 1 WHERE id = ?`).bind(deltas[p.pid], r.id));
    }
  }
  for (const p of m.players) if (rows.has(p.pid)) stmts.push(env.DB.prepare('UPDATE players SET matches = matches + 1 WHERE id = ?').bind(p.pid));
  const summary = m.players.map((p) => ({ handle: rows.get(p.pid)?.handle ?? null, score: p.score, place: p.place, delta: deltas[p.pid] ?? null, forfeit: p.forfeit }));
  const ins = await env.DB.prepare('INSERT INTO matches (code, game_id, kind, ranked, finished_at, players) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(m.code, m.gameId, m.kind, m.ranked ? 1 : 0, Date.now(), JSON.stringify(summary))
    .first<{ id: number }>();
  for (const p of m.players) {
    if (!rows.has(p.pid)) continue;
    stmts.push(env.DB.prepare('INSERT INTO match_players (match_id, player_id, score, place, delta) VALUES (?, ?, ?, ?, ?)').bind(ins!.id, p.pid, p.score, p.place, deltas[p.pid] ?? null));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return deltas;
}

export async function recentMatches(env: Env, pid: string, limit = 10) {
  const { results } = await env.DB.prepare(
    `SELECT m.game_id, m.kind, m.ranked, m.finished_at, m.players, mp.place, mp.score, mp.delta
       FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.player_id = ? ORDER BY mp.match_id DESC LIMIT ?`,
  )
    .bind(pid, limit)
    .all<{ game_id: string | null; kind: string; ranked: number; finished_at: number; players: string; place: number; score: number; delta: number | null }>();
  return results.map((r) => ({
    gameId: r.game_id,
    kind: r.kind,
    ranked: !!r.ranked,
    at: r.finished_at,
    place: r.place,
    score: r.score,
    delta: r.delta,
    players: JSON.parse(r.players) as Array<{ handle: string | null; score: number; place: number }>,
  }));
}

export async function leaders(env: Env, limit = 20) {
  const { results } = await env.DB.prepare('SELECT * FROM players WHERE wins + losses + draws > 0 ORDER BY rating DESC, wins DESC LIMIT ?').bind(limit).all<PlayerRow>();
  return results.map((r) => ({ name: r.name, handle: r.handle, skin: r.skin, rating: r.rating, w: r.wins, l: r.losses, d: r.draws }));
}
