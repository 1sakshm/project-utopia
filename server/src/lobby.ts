// Lobby: one global Durable Object. Holds the dashboard sockets (presence + live match list), the quick-match
// queue, Elo ratings and recorded "ghost" runs. Uses the WebSocket Hibernation API, so per-socket state lives in
// socket attachments and anything durable lives in storage.
import { DurableObject } from 'cloudflare:workers';
import {
  elo,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  START_RATING,
  type GhostRun,
  type LeaderRow,
  type LobbyIn,
  type LobbyOut,
  type MatchSummary,
  type Record_,
} from '../../src/platform/versus/protocol';
import { cleanName, matchOf, PID_RE, type Env } from './util';

interface Att {
  pid: string;
  name: string;
  queue?: { gameId: string | null; fallback: string; relaxed: boolean; since: number; rating: number };
}

interface StoredRecord extends Record_ {
  name: string;
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
        const name = cleanName(msg.name) || 'Player';
        ws.serializeAttachment({ pid: msg.pid, name } satisfies Att);
        const me = await this.record(msg.pid);
        this.send(ws, { t: 'snapshot', online: this.onlineCount(), matches: this.visibleMatches(), leaders: await this.leaders(), me });
        this.broadcast({ t: 'online', online: this.onlineCount() }, ws);
        return;
      }
      case 'queue': {
        if (!a.pid) return;
        const ok = (id: string | null) => id === null || /^[a-z0-9-]{2,40}$/.test(id);
        if (!ok(msg.gameId) || !ok(msg.fallback) || !msg.fallback) return;
        const rec = await this.record(a.pid);
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
    this.broadcast({ t: 'online', online: this.onlineCount(ws) }, ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast({ t: 'online', online: this.onlineCount(ws) }, ws);
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

  // ---------- RPC: ratings ----------
  async record(pid: string): Promise<Record_> {
    const r = await this.ctx.storage.get<StoredRecord>(`r:${pid}`);
    return r ? { rating: r.rating, w: r.w, l: r.l, d: r.d } : { rating: START_RATING, w: 0, l: 0, d: 0 };
  }

  /** Apply a ranked duel result. `outcome` is from A's side: 1 win, 0.5 draw, 0 loss. Returns rating deltas. */
  async applyResult(a: { pid: string; name: string }, b: { pid: string; name: string }, outcome: 1 | 0.5 | 0) {
    const ra = await this.ctx.storage.get<StoredRecord>(`r:${a.pid}`) ?? { name: a.name, rating: START_RATING, w: 0, l: 0, d: 0 };
    const rb = await this.ctx.storage.get<StoredRecord>(`r:${b.pid}`) ?? { name: b.name, rating: START_RATING, w: 0, l: 0, d: 0 };
    const da = elo(ra.rating, rb.rating, outcome);
    const db = elo(rb.rating, ra.rating, (1 - outcome) as 1 | 0.5 | 0);
    ra.rating = Math.max(100, ra.rating + da);
    rb.rating = Math.max(100, rb.rating + db);
    ra.name = a.name;
    rb.name = b.name;
    if (outcome === 1) {
      ra.w++;
      rb.l++;
    } else if (outcome === 0) {
      ra.l++;
      rb.w++;
    } else {
      ra.d++;
      rb.d++;
    }
    await this.ctx.storage.put({ [`r:${a.pid}`]: ra, [`r:${b.pid}`]: rb });
    this.leadersCache = null;
    const leaders = await this.leaders();
    // Everyone gets the new board; the two players also get their own record.
    for (const w of this.open()) {
      const at = this.att(w);
      if (!at.pid) continue;
      const me = at.pid === a.pid ? ra : at.pid === b.pid ? rb : undefined;
      this.send(w, { t: 'leaders', leaders, me: me && { rating: me.rating, w: me.w, l: me.l, d: me.d } });
    }
    return { da, db };
  }

  async leaders(): Promise<LeaderRow[]> {
    if (this.leadersCache) return this.leadersCache;
    const all = await this.ctx.storage.list<StoredRecord>({ prefix: 'r:' });
    this.leadersCache = [...all.values()]
      .filter((r) => r.w + r.l + r.d > 0)
      .sort((x, y) => y.rating - x.rating)
      .slice(0, LEADERS)
      .map((r) => ({ name: r.name, rating: r.rating, w: r.w, l: r.l, d: r.d }));
    return this.leadersCache;
  }

  // ---------- RPC: admin ----------
  /** Wipe ratings, ghosts and the live list (e.g. after test traffic). */
  async adminReset(what: Array<'ratings' | 'ghosts' | 'matches'>) {
    const prefixes = { ratings: 'r:', ghosts: 'g:', matches: 'm:' } as const;
    let removed = 0;
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
