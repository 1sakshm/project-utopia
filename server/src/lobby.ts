// Lobby: one global Durable Object. Holds the dashboard sockets (presence, live match list, live invites), the
// quick-match queue and recorded "ghost" runs. Players, ratings and friends live in D1 (db.ts). Uses the WebSocket Hibernation API, so per-socket state lives in
// socket attachments and anything durable lives in storage.
import { DurableObject } from 'cloudflare:workers';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type GhostRun,
  type LeaderRow,
  type LobbyIn,
  type LobbyOut,
  type MatchSummary,
} from '../../src/platform/versus/protocol';
import { cleanName, matchOf, PID_RE, type Env } from './util';
import * as db from './db';

interface Att {
  pid: string;
  name: string;
  queue?: { gameId: string | null; fallback: string; relaxed: boolean; since: number; rating: number };
}

const MATCH_TTL_MS = 15 * 60_000;
const DONE_VISIBLE_MS = 45_000;
const GHOSTS_PER_GAME = 12;
const LEADERS = 20;

export class Lobby extends DurableObject<Env> {
  private matches = new Map<string, MatchSummary>();
  private leadersCache: LeaderRow[] | null = null;
  private loaded = false;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;

  private async load() {
    if (this.loaded) return;
    const all = await this.ctx.storage.list<MatchSummary>({ prefix: 'm:' });
    for (const [, v] of all) this.matches.set(v.code, v);
    this.loaded = true;
  }

  // ---------- sockets ----------
  async fetch(_req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: '', name: '' } satisfies Att);
    return new Response(null, { status: 101, webSocket: client });
  }

  private open(): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => w.readyState === WebSocket.OPEN);
  }

  private att(ws: WebSocket): Att {
    return (ws.deserializeAttachment() as Att | null) ?? { pid: '', name: '' };
  }

  private send(ws: WebSocket, msg: LobbyOut) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }

  private broadcast(msg: LobbyOut, except?: WebSocket) {
    const s = JSON.stringify(msg);
    for (const w of this.open()) {
      if (w === except || !this.att(w).pid) continue;
      try {
        w.send(s);
      } catch {
        /* ignore */
      }
    }
  }

  private onlineCount(except?: WebSocket): number {
    const ids = new Set<string>();
    for (const w of this.open()) {
      if (w === except) continue;
      const a = this.att(w);
      if (a.pid) ids.add(a.pid);
    }
    return ids.size;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 2048) return;
    let msg: LobbyIn;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    await this.load();
    const a = this.att(ws);
    switch (msg.t) {
      case 'hello': {
        if (!PID_RE.test(msg.pid)) return this.send(ws, { t: 'error', msg: 'Bad player id' });
        const row = await db.authenticate(this.env, msg.pid, msg.key);
        if (!row) return this.send(ws, { t: 'error', msg: 'Not signed in', auth: true });
        const wasOnline = this.isOnline(msg.pid);
        ws.serializeAttachment({ pid: msg.pid, name: row.name } satisfies Att);
        this.send(ws, { t: 'snapshot', online: this.onlineCount(), matches: this.visibleMatches(), leaders: await this.leaders(), me: db.recordOf(row) });
        this.broadcast({ t: 'online', online: this.onlineCount() }, ws);
        if (!wasOnline) await this.pokeFriends(msg.pid);
        return;
      }
      case 'queue': {
        if (!a.pid) return;
        const ok = (id: string | null) => id === null || /^[a-z0-9-]{2,40}$/.test(id);
        if (!ok(msg.gameId) || !ok(msg.fallback) || !msg.fallback) return;
        const rec = db.recordOf(await db.getPlayer(this.env, a.pid));
        a.queue = { gameId: msg.gameId, fallback: msg.fallback, relaxed: !!msg.relaxed, since: Date.now(), rating: rec.rating };
        ws.serializeAttachment(a);
        await this.tryPair(ws, a);
        return;
      }
      case 'cancel': {
        if (a.queue) {
          delete a.queue;
          ws.serializeAttachment(a);
        }
        return;
      }
      case 'ping':
        return this.send(ws, { t: 'pong', now: Date.now() });
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      /* already closed */
    }
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.gone(ws);
  }

  private async gone(ws: WebSocket) {
    this.broadcast({ t: 'online', online: this.onlineCount(ws) }, ws);
    const pid = this.att(ws).pid;
    if (pid && !this.isOnline(pid, ws)) {
      await db.getPlayer(this.env, pid).then((r) => r && this.env.DB.prepare('UPDATE players SET last_seen = ? WHERE id = ?').bind(Date.now(), pid).run());
      await this.pokeFriends(pid);
    }
  }

  private isOnline(pid: string, except?: WebSocket) {
    return this.open().some((w) => w !== except && this.att(w).pid === pid);
  }

  /** Tell a player's online friends to refresh (presence changed). */
  private async pokeFriends(pid: string) {
    try {
      const ids = new Set(await db.friendIds(this.env, pid));
      if (!ids.size) return;
      for (const w of this.open()) if (ids.has(this.att(w).pid)) this.send(w, { t: 'social' });
    } catch (e) {
      console.warn('pokeFriends', e);
    }
  }

  // ---------- matchmaking ----------
  private waiting(): number {
    return this.open().filter((w) => this.att(w).queue).length;
  }

  private async tryPair(ws: WebSocket, me: Att) {
    const q = me.queue!;
    let best: { ws: WebSocket; a: Att; diff: number } | null = null;
    for (const w of this.open()) {
      if (w === ws) continue;
      const o = this.att(w);
      if (!o.queue || o.pid === me.pid) continue;
      if (q.gameId && o.queue.gameId && q.gameId !== o.queue.gameId) continue;
      const diff = Math.abs(o.queue.rating - q.rating);
      if (!best || diff < best.diff) best = { ws: w, a: o, diff };
    }
    if (!best) {
      this.send(ws, { t: 'queued', since: q.since, waiting: this.waiting() });
      return;
    }
    const other = best.a;
    // The player who waited longer decides an open "any game" choice.
    const first = other.queue!.since <= q.since ? other.queue! : q;
    const gameId = q.gameId ?? other.queue!.gameId ?? first.fallback;
    const code = await this.newCode();
    await matchOf(this.env, code).init({
      code,
      kind: 'duel',
      ranked: true,
      public: true,
      host: other.pid,
      gameId,
      max: 2,
      expect: [other.pid, me.pid],
    });
    delete me.queue;
    delete other.queue;
    ws.serializeAttachment(me);
    best.ws.serializeAttachment(other);
    this.send(ws, { t: 'matched', code, gameId });
    this.send(best.ws, { t: 'matched', code, gameId });
  }

  // ---------- RPC: rooms & live list ----------
  async newCode(): Promise<string> {
    await this.load();
    for (;;) {
      let c = '';
      const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
      for (const b of bytes) c += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
      if (!this.matches.has(c)) return c;
    }
  }

  private visibleMatches(): MatchSummary[] {
    const now = Date.now();
    return [...this.matches.values()]
      .filter((m) => m.public && m.players.length > 0 && (m.state !== 'done' || now - m.updatedAt < DONE_VISIBLE_MS))
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt)
      .slice(0, 40);
  }

  async upsertMatch(s: MatchSummary) {
    await this.load();
    const now = Date.now();
    s.updatedAt = now;
    this.matches.set(s.code, s);
    await this.ctx.storage.put(`m:${s.code}`, s);
    for (const [code, m] of this.matches) {
      if (now - m.updatedAt > MATCH_TTL_MS) {
        this.matches.delete(code);
        await this.ctx.storage.delete(`m:${code}`);
      }
    }
    this.scheduleBroadcast();
  }

  async removeMatch(code: string) {
    await this.load();
    if (!this.matches.delete(code)) return;
    await this.ctx.storage.delete(`m:${code}`);
    this.scheduleBroadcast();
  }

  /** Coalesce live-list updates: at most one broadcast per second. */
  private scheduleBroadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.broadcast({ t: 'matches', matches: this.visibleMatches() });
    }, 1000);
  }

  // ---------- RPC: presence, notifications, ratings ----------
  async onlineCountRpc(): Promise<number> {
    return this.onlineCount();
  }

  async onlineOf(pids: string[]): Promise<string[]> {
    const on = new Set(this.open().map((w) => this.att(w).pid));
    return pids.filter((p) => on.has(p));
  }

  /** Push a message to every socket of a player. Returns whether they were online. */
  async notify(pid: string, msg: LobbyOut): Promise<boolean> {
    let hit = false;
    for (const w of this.open()) {
      if (this.att(w).pid !== pid) continue;
      this.send(w, msg);
      hit = true;
    }
    return hit;
  }

  /** After a ranked result: everyone gets the new board, the players get their own record. */
  async refreshFor(pids: string[]) {
    this.leadersCache = null;
    const leaders = await this.leaders();
    const mine = new Map<string, LobbyOut>();
    for (const pid of pids) mine.set(pid, { t: 'leaders', leaders, me: db.recordOf(await db.getPlayer(this.env, pid)) });
    for (const w of this.open()) {
      const at = this.att(w);
      if (!at.pid) continue;
      this.send(w, mine.get(at.pid) ?? { t: 'leaders', leaders });
    }
  }

  async leaders(): Promise<LeaderRow[]> {
    if (this.leadersCache) return this.leadersCache;
    this.leadersCache = await db.leaders(this.env, LEADERS);
    return this.leadersCache;
  }

  // ---------- RPC: admin ----------
  /** Wipe ratings, ghosts and the live list (e.g. after test traffic). */
  async adminReset(what: Array<'ratings' | 'ghosts' | 'matches'>) {
    const prefixes = { ratings: 'r:', ghosts: 'g:', matches: 'm:' } as const;
    let removed = 0;
    if (what.includes('ratings')) {
      const r = await this.env.DB.prepare('UPDATE players SET rating = 1000, wins = 0, losses = 0, draws = 0').run();
      removed += r.meta.changes ?? 0;
    }
    for (const w of what) {
      const keys = [...(await this.ctx.storage.list({ prefix: prefixes[w] })).keys()];
      for (let i = 0; i < keys.length; i += 128) removed += await this.ctx.storage.delete(keys.slice(i, i + 128));
      if (w === 'matches') this.matches.clear();
    }
    this.leadersCache = null;
    this.broadcast({ t: 'leaders', leaders: await this.leaders() });
    this.broadcast({ t: 'matches', matches: this.visibleMatches() });
    return { removed };
  }

  // ---------- RPC: ghosts ----------
  async addGhost(gameId: string, run: GhostRun) {
    const key = `g:${gameId}`;
    const list = (await this.ctx.storage.get<GhostRun[]>(key)) ?? [];
    list.push({ name: run.name, score: run.score, timeline: run.timeline.slice(0, 400) });
    await this.ctx.storage.put(key, list.slice(-GHOSTS_PER_GAME));
  }

  async ghost(gameId: string): Promise<GhostRun | null> {
    const list = (await this.ctx.storage.get<GhostRun[]>(`g:${gameId}`)) ?? [];
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
}

/** Live list order: playing, then counting down, then open lobbies, then just-finished. */
function rank(m: MatchSummary) {
  return m.state === 'playing' ? 0 : m.state === 'countdown' ? 1 : m.state === 'lobby' ? 2 : 3;
}
