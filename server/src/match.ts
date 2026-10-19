// Match: one Durable Object per room code. Runs the room state machine
//   lobby → countdown → playing → done (→ lobby again on rematch)
// and relays live scores. Everyone plays the same game with the same seed, so no per-game netcode is needed:
// the server only has to agree on *when* the round starts and *what* everyone scored.
import { DurableObject } from 'cloudflare:workers';
import {
  COUNTDOWN_MS,
  EMOTES,
  ROUND_CAP_MS,
  START_RATING,
  type MatchIn,
  type MatchOut,
  type MatchSummary,
  type PlayerView,
  type RoomKind,
  type RoomView,
} from '../../src/platform/versus/protocol';
import { cleanName, lobbyOf, PID_RE, type Env } from './util';

interface Att {
  pid: string;
  spectate: boolean;
  lastScore: number;
  lastEmote: number;
}

interface PState extends PlayerView {
  timeline: Array<[number, number]>;
  forfeit: boolean;
  leftAt: number;
}

interface Room extends Omit<RoomView, 'players' | 'spectators'> {
  players: PState[];
  /** Quick-match rooms only admit the two matched players. */
  expect: string[] | null;
  createdAt: number;
  touchedAt: number;
}

export interface InitOptions {
  code: string;
  kind: RoomKind;
  ranked: boolean;
  public: boolean;
  host: string;
  gameId: string | null;
  max: number;
  expect: string[] | null;
}

/** A dropped player gets this long to reconnect mid-round before it counts as a forfeit. */
const GRACE_MS = 30_000;
/** Empty rooms are cleaned up after this long. */
const IDLE_MS = 10 * 60_000;
const SCORE_MIN_INTERVAL = 90;
const TIMELINE_STEP_MS = 500;
const SUMMARY_INTERVAL = 1500;

export class Match extends DurableObject<Env> {
  private room: Room | null = null;
  private loaded = false;
  private lastSummary = 0;
  private lastSave = 0;

  private async getRoom(): Promise<Room | null> {
    if (!this.loaded) {
      this.room = (await this.ctx.storage.get<Room>('room')) ?? null;
      this.loaded = true;
    }
    return this.room;
  }

  private async save(force = true) {
    if (!this.room) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 2000) return;
    this.lastSave = now;
    this.room.touchedAt = now;
    await this.ctx.storage.put('room', this.room);
  }

  // ---------- RPC ----------
  async init(o: InitOptions) {
    await this.getRoom();
    const now = Date.now();
    this.room = {
      code: o.code,
      kind: o.kind,
      ranked: o.ranked,
      public: o.public,
      host: o.host,
      gameId: o.gameId,
      seed: 0,
      state: 'lobby',
      startAt: 0,
      endsAt: 0,
      max: o.max,
      round: 0,
      players: [],
      expect: o.expect,
      createdAt: now,
      touchedAt: now,
    };
    await this.save();
    await this.ctx.storage.setAlarm(now + IDLE_MS);
  }

  // ---------- sockets ----------
  async fetch(_req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: '', spectate: true, lastScore: 0, lastEmote: 0 } satisfies Att);
    return new Response(null, { status: 101, webSocket: client });
  }

  private open(): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => w.readyState === WebSocket.OPEN);
  }

  private att(ws: WebSocket): Att {
    return (ws.deserializeAttachment() as Att | null) ?? { pid: '', spectate: true, lastScore: 0, lastEmote: 0 };
  }

  private send(ws: WebSocket, msg: MatchOut) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closing */
    }
  }

  private view(): RoomView {
    const r = this.room!;
    const spectators = this.open().filter((w) => {
      const a = this.att(w);
      return a.pid && a.spectate;
    }).length;
    return {
      code: r.code,
      kind: r.kind,
      ranked: r.ranked,
      public: r.public,
      host: r.host,
      gameId: r.gameId,
      seed: r.seed,
      state: r.state,
      startAt: r.startAt,
      endsAt: r.endsAt,
      max: r.max,
      round: r.round,
      spectators,
      players: r.players.map(({ timeline: _t, forfeit: _f, leftAt: _l, ...p }) => p),
    };
  }

  private pushRoom() {
    const room = this.view();
    const now = Date.now();
    for (const w of this.open()) {
      const a = this.att(w);
      if (!a.pid) continue;
      this.send(w, { t: 'room', room, now, you: a.spectate ? null : a.pid });
    }
    void this.pushSummary(true);
  }

  private async pushSummary(force: boolean) {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    if (!force && now - this.lastSummary < SUMMARY_INTERVAL) return;
    this.lastSummary = now;
    const s: MatchSummary = {
      code: r.code,
      kind: r.kind,
      ranked: r.ranked,
      public: r.public,
      gameId: r.gameId,
      state: r.state,
      players: r.players.map((p) => ({ name: p.name, score: p.score, done: p.done, rating: p.rating })),
      max: r.max,
      spectators: this.view().spectators,
      updatedAt: now,
    };
    try {
      if (r.players.length === 0) await lobbyOf(this.env).removeMatch(r.code);
      else await lobbyOf(this.env).upsertMatch(s);
    } catch (e) {
      console.warn('lobby update failed', e);
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 1024) return;
    let msg: MatchIn;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const r = await this.getRoom();
    if (!r) {
      this.send(ws, { t: 'error', msg: 'This room doesn’t exist or has closed.', fatal: true });
      try {
        ws.close(4004, 'no room');
      } catch {
        /* ignore */
      }
      return;
    }
    const a = this.att(ws);
    const me = a.pid && !a.spectate ? r.players.find((p) => p.pid === a.pid) : undefined;
    const now = Date.now();

    switch (msg.t) {
      case 'hello': {
        if (!PID_RE.test(msg.pid)) return this.send(ws, { t: 'error', msg: 'Bad player id', fatal: true });
        const name = cleanName(msg.name) || 'Player';
        const existing = r.players.find((p) => p.pid === msg.pid);
        let spectate = !!msg.spectate;
        if (existing && !spectate) {
          existing.connected = true;
          existing.leftAt = 0;
          existing.name = name;
        } else if (!spectate) {
          const allowed = !r.expect || r.expect.includes(msg.pid);
          if (r.state !== 'lobby' && r.state !== 'done') spectate = true;
          else if (r.players.length >= r.max || !allowed) spectate = true;
          else {
            const rec = await lobbyOf(this.env)
              .record(msg.pid)
              .catch(() => ({ rating: START_RATING }));
            r.players.push({
              pid: msg.pid,
              name,
              rating: rec.rating,
              ready: false,
              connected: true,
              score: 0,
              level: 0,
              done: false,
              relaxed: !!msg.relaxed,
              timeline: [],
              forfeit: false,
              leftAt: 0,
            });
            if (!r.players.some((p) => p.pid === r.host)) r.host = msg.pid;
          }
        }
        ws.serializeAttachment({ ...a, pid: msg.pid, spectate } satisfies Att);
        await this.save();
        this.pushRoom();
        return;
      }

      case 'ready': {
        if (!me || (r.state !== 'lobby' && r.state !== 'done')) return;
        if (r.state === 'done') this.resetRound();
        me.ready = !!msg.ready;
        await this.maybeAutoStart();
        await this.save();
        this.pushRoom();
        return;
      }

      case 'rematch': {
        if (!me || r.state !== 'done') return;
        this.resetRound();
        me.ready = true;
        await this.maybeAutoStart();
        await this.save();
        this.pushRoom();
        return;
      }

      case 'pick': {
        if (!me || me.pid !== r.host || (r.state !== 'lobby' && r.state !== 'done') || r.ranked) return;
        if (typeof msg.gameId !== 'string' || !/^[a-z0-9-]{2,40}$/.test(msg.gameId)) return;
        if (r.state === 'done') this.resetRound();
        r.gameId = msg.gameId;
        for (const p of r.players) p.ready = false;
        await this.save();
        this.pushRoom();
        return;
      }

      case 'settings': {
        if (!me || me.pid !== r.host || r.kind !== 'party') return;
        r.public = !!msg.public;
        await this.save();
        this.pushRoom();
        return;
      }

      case 'start': {
        // Parties: the host starts once at least two players are in.
        if (!me || me.pid !== r.host || r.kind !== 'party') return;
        if (r.state === 'done') this.resetRound();
        if (r.state !== 'lobby' || !r.gameId || r.players.filter((p) => p.connected).length < 2) return;
        await this.startCountdown();
        return;
      }

      case 'score':
      case 'done': {
        if (!me || me.done || (r.state !== 'playing' && r.state !== 'countdown')) return;
        if (msg.t === 'score' && now - a.lastScore < SCORE_MIN_INTERVAL) return;
        const s = Math.max(0, Math.min(1e9, Math.floor(Number(msg.s) || 0)));
        const l = Math.max(0, Math.min(1e4, Math.floor(Number(msg.l) || 0)));
        me.score = s;
        me.level = l;
        const t = Math.max(0, now - r.startAt);
        const last = me.timeline[me.timeline.length - 1];
        if (!last || t - last[0] >= TIMELINE_STEP_MS || msg.t === 'done') me.timeline.push([t, s]);
        if (msg.t === 'score') {
          ws.serializeAttachment({ ...a, lastScore: now });
          const out = JSON.stringify({ t: 'score', pid: me.pid, s, l } satisfies MatchOut);
          for (const w of this.open()) if (w !== ws) w.send(out);
          void this.pushSummary(false);
          await this.save(false);
          return;
        }
        me.done = true;
        if (this.allDone()) await this.finish();
        else {
          await this.save();
          this.pushRoom();
        }
        return;
      }

      case 'emote': {
        if (!a.pid || !EMOTES.includes(msg.e) || now - a.lastEmote < 1000) return;
        ws.serializeAttachment({ ...a, lastEmote: now });
        const out = JSON.stringify({ t: 'emote', pid: a.pid, e: msg.e } satisfies MatchOut);
        for (const w of this.open()) w.send(out);
        return;
      }

      case 'leave': {
        await this.dropPlayer(a.pid, true);
        try {
          ws.close(1000, 'left');
        } catch {
          /* ignore */
        }
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      /* already closed */
    }
    const a = this.att(ws);
    if (!a.pid) return;
    // Another tab of the same player may still be connected.
    if (this.open().some((w) => w !== ws && this.att(w).pid === a.pid && !this.att(w).spectate)) return;
    if (a.spectate) {
      if (this.room) this.pushRoom();
      return;
    }
    await this.dropPlayer(a.pid, false);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011);
  }

  /** `left` = the player pressed Leave (immediate forfeit); otherwise they may reconnect within the grace period. */
  private async dropPlayer(pid: string, left: boolean) {
    const r = await this.getRoom();
    if (!r || !pid) return;
    const p = r.players.find((x) => x.pid === pid);
    if (!p) return;
    if (r.state === 'lobby' || r.state === 'done') {
      r.players = r.players.filter((x) => x !== p);
      if (r.host === pid && r.players[0]) r.host = r.players[0].pid;
      if (r.state === 'done') for (const x of r.players) x.ready = false;
    } else {
      p.connected = false;
      p.leftAt = Date.now();
      if (left) {
        p.forfeit = true;
        p.done = true;
      }
      if (this.allDone()) {
        await this.finish();
        return;
      }
      await this.schedule();
    }
    await this.save();
    this.pushRoom();
  }

  // ---------- round lifecycle ----------
  private resetRound() {
    const r = this.room!;
    r.state = 'lobby';
    r.round++;
    r.startAt = 0;
    r.endsAt = 0;
    for (const p of r.players) {
      p.ready = false;
      p.score = 0;
      p.level = 0;
      p.done = false;
      p.timeline = [];
      p.forfeit = false;
      delete p.place;
      delete p.delta;
    }
  }

  private async maybeAutoStart() {
    const r = this.room!;
    // Duels start as soon as both players are ready.
    if (r.kind === 'duel' && r.state === 'lobby' && r.gameId && r.players.length === 2 && r.players.every((p) => p.ready && p.connected)) {
      await this.startCountdown();
    }
  }

  private async startCountdown() {
    const r = this.room!;
    const now = Date.now();
    r.state = 'countdown';
    r.seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
    r.startAt = now + COUNTDOWN_MS;
    r.endsAt = r.startAt + ROUND_CAP_MS;
    for (const p of r.players) {
      p.score = 0;
      p.level = 0;
      p.done = !p.connected; // someone who already dropped doesn't hold the round open
      p.forfeit = !p.connected;
      p.timeline = [];
    }
    await this.save();
    await this.schedule();
    this.pushRoom();
  }

  private allDone(): boolean {
    const r = this.room!;
    return r.players.length > 0 && r.players.every((p) => p.done);
  }

  private async finish() {
    const r = this.room!;
    if (r.state === 'done') return;
    r.state = 'done';
    for (const p of r.players) {
      if (!p.done) p.done = true; // time cap reached: last reported score stands
      p.ready = false;
    }
    // Places: forfeits last, then by score; equal scores share a place.
    const order = [...r.players].sort((x, y) => Number(x.forfeit) - Number(y.forfeit) || y.score - x.score);
    order.forEach((p, i) => {
      const prev = order[i - 1];
      p.place = prev && !prev.forfeit && !p.forfeit && prev.score === p.score ? prev.place : i + 1;
    });
    const lobby = lobbyOf(this.env);
    if (r.ranked && r.players.length === 2) {
      const [a, b] = r.players;
      const outcome: 1 | 0.5 | 0 = a.place === b.place ? 0.5 : a.place! < b.place! ? 1 : 0;
      try {
        const { da, db } = await lobby.applyResult({ pid: a.pid, name: a.name }, { pid: b.pid, name: b.name }, outcome);
        a.delta = da;
        b.delta = db;
        a.rating += da;
        b.rating += db;
      } catch (e) {
        console.warn('rating update failed', e);
      }
    }
    if (r.gameId) {
      for (const p of r.players) {
        if (p.forfeit || p.timeline.length < 3) continue;
        lobby.addGhost(r.gameId, { name: p.name, score: p.score, timeline: p.timeline }).catch(() => {});
      }
    }
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    this.pushRoom();
  }

  /** One alarm drives countdown → playing, reconnect grace, the round cap and idle cleanup. */
  private async schedule() {
    const r = this.room!;
    const now = Date.now();
    let at = now + IDLE_MS;
    if (r.state === 'countdown') at = r.startAt;
    else if (r.state === 'playing') {
      at = r.endsAt;
      for (const p of r.players) if (!p.connected && !p.done && p.leftAt) at = Math.min(at, p.leftAt + GRACE_MS);
    }
    await this.ctx.storage.setAlarm(Math.max(now + 50, at));
  }

  async alarm() {
    const r = await this.getRoom();
    if (!r) return;
    const now = Date.now();
    if (r.state === 'countdown' && now >= r.startAt - 20) {
      r.state = 'playing';
      await this.save();
      await this.schedule();
      this.pushRoom();
      return;
    }
    if (r.state === 'playing') {
      let changed = false;
      for (const p of r.players) {
        if (!p.connected && !p.done && p.leftAt && now - p.leftAt >= GRACE_MS) {
          p.done = true;
          p.forfeit = true;
          changed = true;
        }
      }
      if (now >= r.endsAt || this.allDone()) {
        await this.finish();
        return;
      }
      if (changed) {
        await this.save();
        this.pushRoom();
      }
      await this.schedule();
      return;
    }
    // lobby / done: clean up rooms nobody is using.
    if (this.open().length === 0 && now - r.touchedAt >= IDLE_MS - 1000) {
      await lobbyOf(this.env)
        .removeMatch(r.code)
        .catch(() => {});
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.ctx.storage.setAlarm(now + IDLE_MS);
  }
}
